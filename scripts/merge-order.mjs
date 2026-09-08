// Which branch should land on main FIRST, and what does landing this one cost everyone else?
//
// Several worktrees are normally in flight at once (see AGENTS.md), and the safe-merge workflow
// integrates `main` INTO the branch before fast-forwarding. So the order work lands in is not
// cosmetic: landing branch B first means every OTHER unmerged branch must afterwards absorb B.
// The total textual conflict for a pair is the same whichever goes first - what changes is WHO
// resolves it, how many times, and whether they understand the change they are absorbing.
//
// Three asymmetries are worth real money, and this script measures exactly those:
//
//   - FAN-OUT. A branch that conflicts with four others taxes four separate resolutions if it
//     lands first, or absorbs all four itself - once, in one worktree, by its own author - if it
//     lands last. Narrow branches first, wide branches last.
//   - STRUCTURE. A rename or delete is the expensive kind. If B moves a file that X edits,
//     B-first makes X's author relocate their work into a file they never moved; X-first makes
//     B's author fold an edit into a file they DID move, which is the side that knows where it
//     goes. A structural collision sinks a branch to the back of the queue regardless of counts.
//   - SILENT COLLISIONS. Two branches that both mint the next `NNNN_*.sql` migration number, or
//     that both append to a shared registry file, merge with ZERO textual conflict and are still
//     wrong. Nothing about ordering fixes those - they have to be named out loud.
//
// The conflict measurement is real, not a guess: `git merge-tree --write-tree` performs a true
// three-way merge in the object store (using the pair's own merge base, which is exactly the
// base the loser of the race will face) and reports the conflicted paths. It touches no working
// tree and no ref, so this whole script is safe to run from any worktree at any time.
//
// This is ADVISORY. It never blocks and never acts: sometimes the expensive branch is the one
// that has to land, and someone always has to go first.
//
// CLI:
//   node scripts/merge-order.mjs                     # ranked landing order for the checkout
//   node scripts/merge-order.mjs --branch <name>     # verdict for one branch (exit 3 = hold)
//   node scripts/merge-order.mjs --json              # machine-readable, with or without --branch

import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { mainRef } from './main-ref.mjs';
import { normalize, worktreeEntries } from './worktree-cleanup-lib.mjs';

const execFileAsync = promisify(execFile);

/**
 * Conflicted files imposed on the rest of the checkout before landing this branch first is
 * called expensive rather than merely untidy. Below it, a couple of hunks in one file is the
 * normal cost of parallel work and warning about it would only train the warning away.
 */
const HOLD_CONFLICT_FILES = 5;

/**
 * Files where a clean textual merge is known to produce a WRONG result, so two branches
 * touching one is a collision even though git reports none. Kept short and specific on
 * purpose - a long list of "shared-ish" files would make every run noisy and mean nothing.
 */
const SILENT_MERGE_FILES = [
  // Append-union baselines: git unions the two branches' entries and the duplicate is invisible.
  'scripts/overflow-baseline.json',
  // Two branches adding spec mappings both "win", and the loser's mapping silently never runs.
  'scripts/e2e-affected.mjs',
];

// MEASURE A SHARED-REGISTRY HOLD BEFORE ORDERING AROUND IT. The check above is textual - "both
// branches touch this file" - because that is all it can be without understanding each registry's
// shape. Whether the collision is REAL depends on whether the two edits touch the same ENTRIES.
//
// Worked example, 2026-08-25: `claude/caspar-connect-51d22d` and
// `claude/debate-clock-wire-origin-139b05` both read `hold` over `scripts/e2e-affected.mjs`, each
// naming the other, so neither could ever be the one that goes first. Their edits turned out to be
// disjoint - caspar ADDS three rows (`casparLink.ts`, `SettingsDialog.tsx`, `ProductionPage.tsx`),
// debate-clock MODIFIES the existing `src/templates/` row - so neither order loses a mapping and
// the ordering was not actually constrained at all.
//
// How to check, in one command per branch: diff each branch's change to the file against its merge
// base and compare the PATTERNS, not the line counts:
//
//   git diff $(git merge-base origin/main <branch>) <branch> -- scripts/e2e-affected.mjs \
//     | grep -oE '\^src[^,]*' | sort -u
//
// An empty intersection means the hold is the heuristic being textual, which is the right way for
// it to be wrong: it escalates rather than guessing. `auto-merge --accept shared-registry` is how a
// person records that they measured it. A NON-empty intersection is the real thing - two rules for
// one path, where a clean merge keeps both and only one ever runs.
//
// THE RANKING IS A SNAPSHOT, AND IT MOVES WHILE YOU READ IT. A branch with a dirty worktree is NOT
// LANDABLE and drops out, so the order flips the moment anyone saves a file - and it flips back
// when they commit. On 2026-08-25 two sessions each concluded the OTHER should go first, politely
// and in good faith, because each had read a ranking taken while the other's tree was dirty; the
// standoff was an artefact of two stale snapshots rather than a real disagreement. A third flip
// happened seconds later when one of them started editing again.
//
// So: re-run it immediately before acting, with both trees clean, and treat any ranking you were
// handed by someone else as already out of date. The verdict is what gates a landing anyway -
// `caution` and `hold` refuse whichever way the ranking points, so a flip never unblocks anything
// on its own. Deciding who goes first from a ranking alone is how both sessions got it wrong.

/**
 * Directories whose file names carry a SEQUENCE NUMBER that must be unique AND applied in
 * ascending order. Three distinct faults live here, none of which git ever reports, because
 * two branches adding differently-named files never conflict textually:
 *
 *   - SAME number on two pending branches - one of them is simply wrong. `hold`.
 *   - A number the TARGET already holds - that migration can never apply. `hold`.
 *   - Ascending numbers landing in DESCENDING order: land `0025` before `0024` and `0024`
 *     applies after it, leaving the ledger with a gap it fills out of sequence. Whether that
 *     actually breaks depends on what the two migrations do, so this one is a `caution` - a
 *     line worth reading, not a reason to stop.
 */
const SEQUENCE_DIRS = ['supabase/migrations'];

/**
 * Full read-only assessment of everything ahead of `target` in the checkout containing `cwd`.
 *
 * Returns `{ target, self, branches, order, notReady }` where `branches` is one entry per local
 * branch ahead of the target:
 *   { branch, worktree, dirty, uncommitted, ahead, files, structural, lastCommit,
 *     conflicts: Map<otherBranch, string[]>, imposed, silent: [...], stacked: [...] }
 * `order` is the recommended landing sequence (ready branches only, cheapest first) and
 * `notReady` lists branches that safe-merge would refuse today, with the reason.
 */
export async function assessMergeOrder(cwd = process.cwd(), { target = 'main' } = {}) {
  const entries = worktreeEntries(cwd);
  if (entries.length === 0) return empty(target);
  const primary = entries[0].root;

  const hasTarget = (await git(['rev-parse', '--verify', '--quiet', target], primary)).ok;
  if (!hasTarget) return empty(target);

  const ref = await mainRef((args) => git(args, primary), target);
  const self = entries.filter((entry) => isUnder(normalize(cwd), entry.root)).sort((a, b) => b.root.length - a.root.length)[0];
  const names = await candidateBranches(primary, ref);
  const remoteOnly = await remoteOnlyBranches(primary, ref, names);
  if (names.length === 0) return { ...empty(target), self: self?.branch ?? null, remoteOnly };

  const byBranch = new Map(entries.filter((entry) => entry.branch).map((entry) => [entry.branch, entry]));

  const branches = await Promise.all(
    names.map(async (branch) => {
      const worktree = byBranch.get(branch) ?? null;
      const [ahead, status, uncommitted, tip] = await Promise.all([
        // `ref`, NOT `target`. `target` is the NAME of the branch being landed onto and belongs in
        // the report; the revision that says what has landed is `ref` (see scripts/main-ref.mjs).
        // These two lines read the stale local `main` until 2026-09-09, while the candidate list
        // three lines up already asked `ref` - so the branches were chosen correctly and then each
        // one was MEASURED against a repository 43 commits old. A branch was credited with the
        // files six other rows had landed, and one of those phantom files carried a migration
        // number, which is a `hold` verdict for work that was already on main.
        git(['rev-list', '--count', `${ref}..${branch}`], primary).then((r) => count(r.stdout)),
        git(['diff', '--name-status', '--find-renames', `${ref}...${branch}`], primary),
        worktree ? uncommittedPaths(worktree.root) : Promise.resolve([]),
        // `%ct` rides along for the aging rule in `rank` - the relative string is for reading,
        // and a comparison cannot be made out of "2 hours ago".
        git(['log', '-1', '--format=%s%x00%cr%x00%ct', branch], primary).then((r) => {
          const [subject, relative, at] = r.stdout.trim().split('\0');
          return subject ? { subject, relative: relative ?? 'unknown', at: Number(at) || null } : null;
        }),
      ]);
      const { files, structural } = parseNameStatus(status.stdout);
      return {
        branch,
        worktree: worktree?.root ?? null,
        dirty: uncommitted.length > 0,
        uncommitted,
        ahead,
        files,
        structural,
        lastCommit: tip,
        conflicts: new Map(),
        imposed: 0,
        silent: [],
        stacked: [],
      };
    }),
  );

  // ONE call for the whole run, not one per pair: what the target already holds is the same
  // answer for every branch, and it is the only thing the pairwise pass cannot work out alone.
  const targetSequences = await targetSequenceNumbers(primary, ref);
  for (const branch of branches) recordTakenSequences(branch, targetSequences, target);

  await measurePairs(primary, branches);
  await markStacked(primary, branches);

  return {
    target,
    // The revision every count and diff above was actually measured against. Reported rather than
    // implied: `target` and `ref` disagreeing is the whole defect, so the answer says which it used.
    ref,
    primary,
    self: self?.branch ?? null,
    branches,
    order: rank(branches.filter((b) => readiness(b) === null)),
    notReady: branches
      .map((b) => ({ branch: b.branch, worktree: b.worktree, reason: readiness(b) }))
      .filter((entry) => entry.reason !== null),
    remoteOnly,
  };
}

/**
 * Every pair measured once. The three-way merge is symmetric, so `conflicts` is filled in both
 * directions from one call - which halves the git spawns, the only slow part of a run.
 */
async function measurePairs(primary, branches) {
  const pairs = [];
  for (let i = 0; i < branches.length; i += 1) {
    for (let j = i + 1; j < branches.length; j += 1) pairs.push([branches[i], branches[j]]);
  }

  await Promise.all(
    pairs.map(async ([a, b]) => {
      const conflicted = await mergeTreeConflicts(primary, a.branch, b.branch);
      if (conflicted.length > 0) {
        a.conflicts.set(b.branch, conflicted);
        b.conflicts.set(a.branch, conflicted);
      }
      for (const note of silentCollisions(a, b)) {
        a.silent.push({ with: b.branch, ...note });
        b.silent.push({ with: a.branch, ...note });
      }
      // Unlike the symmetric collisions above, being out of order is a fact about ONE side -
      // only the higher-numbered branch causes it by going first, so each direction is asked.
      recordOutOfOrder(a, b);
      recordOutOfOrder(b, a);
      // A structural change is only expensive against a branch that touches what moved, and
      // the cost lands on whoever goes SECOND - so it is recorded per direction, not shared.
      recordStructural(a, b);
      recordStructural(b, a);
    }),
  );

  for (const branch of branches) {
    branch.imposed = [...branch.conflicts.values()].reduce((sum, files) => sum + files.length, 0);
  }
}

/**
 * The conflicted paths of a real three-way merge of the two branches, from their own merge
 * base. `--write-tree` writes only objects (no ref, no index, no working tree); exit 1 means
 * conflicts and the first output line is the resulting tree, which is not a file name.
 */
async function mergeTreeConflicts(primary, a, b) {
  const res = await git(['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b], primary);
  if (res.ok) return []; // exit 0 - merges cleanly
  const [, ...rest] = res.stdout.split('\n');
  const conflicted = [];
  for (const line of rest) {
    const file = line.trim();
    if (!file) break; // blank line ends the conflicted-file section
    conflicted.push(file);
  }
  // An unrelated-histories or bad-ref failure prints nothing usable; report it as no conflict
  // rather than inventing one - this is advice, and a wrong "blocked" is worse than a miss.
  return conflicted;
}

/** Collisions that merge CLEANLY and are still wrong - the ones git will never warn about. */
function silentCollisions(a, b) {
  const notes = [];

  const shared = SILENT_MERGE_FILES.filter((file) => touches(a, file) && touches(b, file));
  for (const file of shared) {
    notes.push({
      kind: 'shared-registry',
      severity: 'hold',
      detail: `both edit ${file} - a clean merge here unions entries rather than reconciling them`,
    });
  }

  for (const dir of SEQUENCE_DIRS) {
    const mine = sequenceNumbers(a, dir);
    const theirs = sequenceNumbers(b, dir);
    for (const [number, file] of mine) {
      const clash = theirs.get(number);
      if (clash && clash !== file) {
        notes.push({
          kind: 'sequence',
          severity: 'hold',
          detail: `both mint ${dir}/${number}_* (${file} vs ${clash}) - git merges both in and the number is taken twice`,
        });
      }
    }
  }

  return notes;
}

/**
 * Ascending numbers, descending landing order. Recorded on the HIGHER-numbered branch only:
 * that is the one whose landing first causes the problem, and putting the note there also makes
 * it sort behind its lower-numbered sibling, so the reported order fixes what the note warns
 * about instead of merely describing it.
 */
function recordOutOfOrder(a, b) {
  for (const dir of SEQUENCE_DIRS) {
    const mine = highestSequence(a, dir);
    const theirs = highestSequence(b, dir);
    if (mine === null || theirs === null || mine.number <= theirs.number) continue;
    a.silent.push({
      with: b.branch,
      kind: 'sequence-order',
      severity: 'caution',
      detail:
        `mints ${dir}/${mine.padded}_* while ${b.branch} still holds ${theirs.padded}_* - ` +
        `landing this first leaves ${theirs.padded} to apply after ${mine.padded}`,
    });
  }
}

/** Every sequence number the target branch already holds, per directory - one git call. */
async function targetSequenceNumbers(primary, target) {
  const held = new Map();
  for (const dir of SEQUENCE_DIRS) {
    const res = await git(['ls-tree', '--name-only', '-r', target, '--', dir], primary);
    const numbers = new Map();
    for (const file of res.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
      const match = /\/(\d+)[_-]/.exec(file);
      if (match) numbers.set(match[1], file);
    }
    held.set(dir, numbers);
  }
  return held;
}

/** A number the target ALREADY holds cannot apply, whatever order anything lands in. */
function recordTakenSequences(branch, targetSequences, target) {
  for (const dir of SEQUENCE_DIRS) {
    const taken = targetSequences.get(dir);
    if (!taken) continue;
    for (const [number, file] of sequenceNumbers(branch, dir)) {
      const existing = taken.get(number);
      if (existing && existing !== file) {
        branch.silent.push({
          with: target,
          kind: 'sequence-taken',
          severity: 'caution',
          detail: `${file} takes number ${number}, which ${target} already holds as ${existing} - that number is spent`,
        });
      }
    }
  }
}

/** `structural` entries of `mover` whose old path `other` also touches - `other` pays if it goes second. */
function recordStructural(mover, other) {
  const hits = mover.structural.filter((change) => touches(other, change.from));
  if (hits.length === 0) return;
  mover.structuralHits ??= [];
  mover.structuralHits.push({ with: other.branch, changes: hits });
}

/**
 * Branches whose tip is an ancestor of another branch are STACKED: the ancestor must land
 * first, and that is a hard constraint rather than a preference.
 */
async function markStacked(primary, branches) {
  await Promise.all(
    branches.flatMap((a) =>
      branches
        .filter((b) => b !== a)
        .map(async (b) => {
          const res = await git(['merge-base', '--is-ancestor', a.branch, b.branch], primary);
          if (res.ok) b.stacked.push(a.branch); // b contains a - a must land first
        }),
    ),
  );
}

/**
 * How long a branch must have been waiting before its age outranks how cheap it is.
 *
 * THE TRADEOFF, WRITTEN WHERE THE ORDERING IS COMPUTED. Cheapest-first is right about one
 * landing: the narrow branch costs the others least, so going first is the least disruptive
 * choice available right now. Repeated all day it is a starvation policy - an expensive branch
 * never becomes cheap, small branches keep arriving, and the big one stays at the bottom of every
 * ranking while its worktree collects conflicts and its owner watches it lose to work started
 * after it. That happened on 2026-08-28, which is why this exists.
 *
 * Twelve hours, not one: a branch that has waited half a day has already lost every ordinary
 * race, and promoting on a shorter clock would let a branch idle for an afternoon and then push
 * past the cheap ones it was never blocking. Ancestry still wins over both - a stacked branch
 * jumping the branch it contains is wrong, not merely early - and so does the structural check,
 * because an aged branch that RENAMES what others edit is exactly the landing that hurts.
 */
export const AGING_HOURS = 12;

/** Hours since a branch last moved - the closest thing to "how long has it been waiting". */
function waitingHours(branch, now) {
  const at = branch.lastCommit?.at;
  return typeof at === 'number' ? Math.max(0, (now - at * 1000) / 3_600_000) : 0;
}

/**
 * The recommended landing order: cheapest first, structural movers last, ancestors always
 * before the branches stacked on them - and anything that has waited more than `AGING_HOURS`
 * ahead of the cheap work that keeps arriving.
 *
 * The sort key is deliberately blunt - this exists to catch the expensive mistake, not to
 * find the theoretically optimal permutation of six branches.
 */
export function rank(ready, { now = Date.now() } = {}) {
  const ordered = [...ready].sort((a, b) => {
    const structural = movedPathCount(a) - movedPathCount(b); // movers sink
    if (structural !== 0) return structural;
    // SILENT COLLISIONS STILL OUTRANK AGE. A duplicate migration number or a shared registry is
    // wrong whoever waited longest, so age only breaks ties between branches that are equally
    // safe to land - it promotes a branch past CHEAPER work, never past safer work.
    if (a.silent.length !== b.silent.length) return a.silent.length - b.silent.length;
    // AGE BEFORE CHEAPNESS, once it is real. Both aged: the older goes first, so the queue drains
    // its backlog in the order it accumulated rather than re-sorting it by size. Equal ages fall
    // through to the ordinary cheapness tiebreaks below.
    const [aged, other] = [waitingHours(a, now) >= AGING_HOURS, waitingHours(b, now) >= AGING_HOURS];
    if (aged !== other) return aged ? -1 : 1;
    if (aged && other && waitingHours(a, now) !== waitingHours(b, now)) {
      return waitingHours(b, now) - waitingHours(a, now);
    }
    if (a.imposed !== b.imposed) return a.imposed - b.imposed;
    if (a.files.length !== b.files.length) return a.files.length - b.files.length; // narrow first
    return a.branch.localeCompare(b.branch);
  });

  // One stable pass is enough to honour ancestry: a stacked branch only ever has to move behind
  // branches it literally contains, and those are already in the list. Two branch names on the
  // SAME commit are each other's ancestor, so no candidate is ever satisfiable - the -1 fallback
  // takes the next branch anyway rather than looping forever over a tie that has no wrong answer.
  const placed = [];
  const remaining = [...ordered];
  while (remaining.length > 0) {
    const index = remaining.findIndex((entry) =>
      entry.stacked.every((needed) => placed.some((done) => done.branch === needed) || !remaining.some((r) => r.branch === needed)),
    );
    placed.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return placed;
}

/** Why safe-merge would refuse this branch today, or null when it is landable. */
function readiness(branch) {
  if (branch.ahead === 0) return 'nothing committed ahead of the target';
  // The worktree is printed alongside this by the formatter, so naming it here too would
  // print the same path twice on adjacent lines.
  if (branch.dirty) return `${branch.uncommitted.length} uncommitted file(s)`;
  return null;
}

/**
 * The verdict for ONE branch: `clear`, `caution`, or `hold`.
 *
 * `hold` is reserved for the case the user actually gets hurt by - this branch is expensive for
 * the others AND a cheaper one is sitting right there, ready. Expensive with no alternative is
 * only a `caution`: someone has to go first, and saying "hold" when there is nothing to wait for
 * is how a check earns itself ignored.
 */
export function verdictFor(assessment, branchName) {
  const branch = assessment.branches.find((entry) => entry.branch === branchName);
  if (!branch) return { severity: 'clear', branch: branchName, reasons: [], landFirst: null, blockedBy: [] };

  const blockedBy = branch.stacked.filter((needed) => assessment.branches.some((entry) => entry.branch === needed));
  const cheaper = assessment.order.filter((entry) => entry.branch !== branchName && cost(entry) < cost(branch));
  const landFirst = blockedBy[0] ?? cheaper[0]?.branch ?? null;

  const reasons = [];
  const structuralHits = branch.structuralHits ?? [];
  for (const hit of structuralHits) {
    const paths = hit.changes.map((change) => change.from).slice(0, 3).join(', ');
    reasons.push({
      kind: 'structural',
      severity: 'hold',
      text: `renames or deletes ${hit.changes.length} path(s) that ${hit.with} also edits (${paths}) - landing this first makes ${hit.with} relocate work into files it never moved`,
    });
  }
  for (const note of branch.silent) {
    // A note without its own severity predates the per-note field and is a hold, as before.
    reasons.push({ kind: note.kind, severity: note.severity ?? 'hold', text: `${note.detail} (with ${note.with})` });
  }
  if (branch.imposed > 0) {
    const spread = [...branch.conflicts.entries()].map(([other, files]) => `${other}: ${files.length}`).join(', ');
    reasons.push({
      kind: 'conflict',
      severity: branch.imposed >= HOLD_CONFLICT_FILES ? 'hold' : 'caution',
      text: `landing it first leaves ${branch.imposed} conflicted file(s) for other branches to resolve (${spread})`,
    });
  }
  if (blockedBy.length > 0) {
    reasons.push({ kind: 'stacked', severity: 'hold', text: `contains ${blockedBy.join(', ')}, which must land first` });
  }

  const worst = reasons.some((reason) => reason.severity === 'hold') ? 'hold' : reasons.length > 0 ? 'caution' : 'clear';
  // Nothing cheaper to wait for demotes a hold: the queue has to start somewhere. Ancestry is
  // the exception - a stacked branch is wrong in itself, not merely early.
  const severity = worst === 'hold' && !landFirst && blockedBy.length === 0 ? 'caution' : worst;

  // The recommendation is only actionable with the place attached - "land X first" is a
  // question ("where IS X?") until it says which folder to open.
  const landFirstBranch = assessment.branches.find((entry) => entry.branch === landFirst) ?? null;
  return {
    severity,
    branch: branchName,
    reasons,
    landFirst,
    landFirstWhere: landFirstBranch ? where(landFirstBranch, assessment.primary) : null,
    blockedBy,
  };
}

/** Sort/compare cost for "is something cheaper ready?" - structure dominates raw file counts. */
function cost(branch) {
  return movedPathCount(branch) * 100 + branch.silent.length * 50 + branch.imposed;
}

function movedPathCount(branch) {
  return (branch.structuralHits ?? []).reduce((sum, hit) => sum + hit.changes.length, 0);
}

function touches(branch, path) {
  const wanted = path.toLowerCase();
  return (
    branch.files.some((file) => file.toLowerCase() === wanted) ||
    branch.uncommitted.some((file) => file.replaceAll('\\', '/').toLowerCase() === wanted)
  );
}

/**
 * The highest sequence number this branch adds under `dir`, as `{ number, padded }`, or null.
 * `padded` keeps the on-disk form (`0025`) so messages read like the filenames do; `number` is
 * what gets compared, so `0009` vs `0010` orders numerically rather than as strings.
 */
function highestSequence(branch, dir) {
  let best = null;
  for (const padded of sequenceNumbers(branch, dir).keys()) {
    const number = Number.parseInt(padded, 10);
    if (Number.isFinite(number) && (best === null || number > best.number)) best = { number, padded };
  }
  return best;
}

/** `Map<number, file>` of sequence-numbered files this branch ADDS under `dir`. */
function sequenceNumbers(branch, dir) {
  const found = new Map();
  for (const file of [...branch.files, ...branch.uncommitted.map((f) => f.replaceAll('\\', '/'))]) {
    if (!file.toLowerCase().startsWith(`${dir.toLowerCase()}/`)) continue;
    const match = /\/(\d+)[_-]/.exec(file);
    if (match) found.set(match[1], file);
  }
  return found;
}

/** `{ files, structural }` from `--name-status --find-renames`; structural = renames and deletes. */
function parseNameStatus(stdout) {
  const files = new Set();
  const structural = [];
  for (const line of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [code, ...paths] = line.split('\t');
    if (code.startsWith('R') && paths.length === 2) {
      structural.push({ kind: 'rename', from: paths[0], to: paths[1] });
      files.add(paths[0]);
      files.add(paths[1]);
    } else if (code.startsWith('D')) {
      structural.push({ kind: 'delete', from: paths[0], to: null });
      files.add(paths[0]);
    } else {
      for (const path of paths) files.add(path);
    }
  }
  return { files: [...files].sort(), structural };
}

async function candidateBranches(primary, target) {
  const res = await git(['branch', '--no-merged', target, '--format=%(refname:short)'], primary);
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((branch) => branch && branch !== target && !branch.startsWith('('));
}

/**
 * Branches that exist ahead of `target` ON ORIGIN ONLY - reported, never ranked.
 *
 * THE ASYMMETRY WITH `jobs.mjs`, and why it is deliberate. `printOutstanding` there lists local
 * and remote-only refs together, because its question is "what work exists that has not landed?"
 * and a remote-only branch is work: one sat unmentioned for seven weeks before that site started
 * looking. THIS file answers a different question - "which of the branches somebody can land
 * right now should go first?" - and the ranking is consumed by the landing flow, which acts on a
 * local branch in a worktree. Ranking `origin/x` would produce a recommendation naming a ref the
 * flow cannot take, which is worse than not ranking it.
 *
 * So the split is: ranked if local, NAMED if not, and the reader is told how to promote one into
 * the ranking. Silence is the only answer that was wrong.
 */
async function remoteOnlyBranches(primary, target, local) {
  const res = await git(['branch', '-r', '--no-merged', target, '--format=%(refname:short)'], primary);
  const known = new Set(local);
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((ref) => ref.startsWith('origin/') && !ref.includes('->'))
    .map((ref) => ref.slice('origin/'.length))
    .filter((branch) => branch && branch !== 'HEAD' && branch !== target && !known.has(branch))
    .sort();
}

async function uncommittedPaths(cwd) {
  const res = await git(['status', '--porcelain', '-z'], cwd, { raw: true });
  return res.stdout
    .split('\0')
    .filter(Boolean)
    .map((record) => (/^[ MADRCU?!][ MADRCU?!] /.test(record) ? record.slice(3) : record))
    .filter(Boolean);
}

/**
 * Run git in `cwd` as `{ ok, stdout }`. Never rejects: `merge-tree` exits non-zero to REPORT
 * conflicts, which is information, not failure - so the exit code is carried, not thrown.
 */
async function git(args, cwd, { raw = false } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, stdout: raw ? stdout : stdout.trim() };
  } catch (error) {
    return { ok: false, stdout: typeof error?.stdout === 'string' ? (raw ? error.stdout : error.stdout.trim()) : '' };
  }
}

function empty(target) {
  return { target, ref: null, primary: null, self: null, branches: [], order: [], notReady: [], remoteOnly: [] };
}

function count(stdout) {
  const value = Number.parseInt(stdout.trim(), 10);
  return Number.isFinite(value) ? value : 0;
}

function isUnder(path, root) {
  const [a, b] = [path.toLowerCase(), root.toLowerCase()];
  return a === b || a.startsWith(`${b}/`);
}

/**
 * The ranked order as human-readable lines.
 *
 * A branch name alone is not enough to act on. The person reading this has several sessions
 * open and has to know WHICH WINDOW to go to - so the recommendation leads with the worktree
 * folder, then the branch, then whatever says whether somebody is still sitting in it. That
 * block is the whole point of the output; the ranked list underneath is the supporting detail.
 */
export function formatOrder(assessment) {
  const { branches, order, notReady, target, ref, primary, remoteOnly = [] } = assessment;
  if (branches.length === 0) {
    return [`Nothing is ahead of ${target} - no ordering question to answer.`, ...remoteOnlyLines(remoteOnly, target)];
  }

  const out = [];
  // Say which revision answered. `origin/main` is the normal one here and the reader can ignore it;
  // seeing the bare local branch named is the signal that the fetch is stale and so is this report.
  if (ref && ref !== `origin/${target}`) out.push(`Measured against ${ref} - there is no ${`origin/${target}`} in this checkout.`);

  if (order.length === 0) {
    // Every candidate is mid-session. Saying so beats printing an empty ranked list and
    // letting the reader work out that the absence of a recommendation WAS the answer.
    out.push('LAND FIRST: nothing can land right now.');
    out.push(`  All ${branches.length} branch(es) ahead of ${target} have uncommitted work - each is somebody's live session.`);
    out.push('');
  }

  if (order.length > 0) {
    const first = order[0];
    out.push('LAND FIRST');
    out.push(`  worktree  ${where(first, primary)}`);
    out.push(`  branch    ${first.branch}`);
    out.push(`  session   ${session(first)}`);
    out.push(`  why       ${describe(first)}`);
    for (const line of stuckBehind(first, assessment)) out.push(`  note      ${line}`);
    if (order.length === 1) out.push('  (it is the only branch that can land right now)');
    out.push('');
  }

  out.push(`Full order for the ${branches.length} branch(es) ahead of ${target}, cheapest first:`);
  order.forEach((branch, index) => {
    const self = branch.branch === assessment.self ? ' <- you are here' : '';
    out.push(`  ${index + 1}. ${branch.branch}${self}`);
    out.push(`     in ${where(branch, primary)} - ${describe(branch)}`);
  });
  for (const entry of notReady) {
    const branch = branches.find((candidate) => candidate.branch === entry.branch);
    out.push(`  -  ${entry.branch} - NOT LANDABLE: ${entry.reason}`);
    out.push(`     in ${where(branch, primary)}`);
  }
  out.push(...remoteOnlyLines(remoteOnly, target));
  return out;
}

/**
 * The branches ahead of the target that exist only on origin, named but not ranked.
 *
 * They are unmeasurable here in the way that matters - nobody can land one from this machine
 * without checking it out first - but they are still work ahead of the target, they still
 * conflict with everything above, and one sat unmentioned for seven weeks. Naming them costs a
 * line and moves no verdict.
 */
function remoteOnlyLines(remoteOnly, target) {
  if (!remoteOnly || remoteOnly.length === 0) return [];
  return [
    '',
    `Not ranked - ${remoteOnly.length} branch(es) ahead of ${target} exist only on origin: ${remoteOnly.join(', ')}.`,
    '  The ranking covers branches that can be landed from here, and these have no local ref to land.',
    '  To rank one: git fetch origin && git switch -c <name> origin/<name> (in a worktree, never the main checkout).',
  ];
}

/**
 * Lines for the case where the top recommendation carries a note pointing at a branch that
 * cannot land yet - "follow 0024" is confusing advice when 0024's worktree is dirty. Saying so
 * turns an apparent contradiction into a decision: go tidy that worktree, or accept the note.
 */
function stuckBehind(branch, assessment) {
  const lines = [];
  for (const note of branch.silent) {
    const blocked = assessment.notReady.find((entry) => entry.branch === note.with);
    if (!blocked) continue;
    lines.push(`${note.with} is what it should follow, but that branch cannot land yet (${blocked.reason})`);
  }
  return lines;
}

/**
 * Where to go to act on this branch. Paths are shown relative to the primary checkout because
 * the absolute ones are long and identical up to the last segment - the folder name IS how the
 * user tells their open sessions apart.
 */
function where(branch, primary) {
  if (!branch?.worktree) return 'no worktree - safe-merge will make a temporary one';
  if (primary && branch.worktree.toLowerCase() === primary.toLowerCase()) return `${primary} (the primary checkout)`;
  if (primary && branch.worktree.toLowerCase().startsWith(`${primary.toLowerCase()}/`)) {
    return branch.worktree.slice(primary.length + 1);
  }
  return branch.worktree;
}

/** Whether anyone still appears to be working in it - the difference between "go there" and "it is yours to take". */
function session(branch) {
  if (!branch.worktree) return 'closed - the branch outlived its session, nobody is in it';
  const parts = [];
  if (branch.lastCommit) parts.push(`last commit ${branch.lastCommit.relative}: "${branch.lastCommit.subject}"`);
  if (branch.uncommitted.length > 0) parts.push(`${branch.uncommitted.length} uncommitted file(s) - someone is probably still in it`);
  return parts.length > 0 ? parts.join('; ') : 'open, nothing uncommitted';
}

function describe(branch) {
  const parts = [];
  const moved = movedPathCount(branch);
  if (moved > 0) {
    const withWhom = (branch.structuralHits ?? []).map((hit) => hit.with).join(', ');
    parts.push(`moves/deletes ${moved} path(s) ${withWhom} also edits - land it LAST so its own author absorbs the rest`);
  }
  for (const note of branch.silent) {
    // "collision" is wrong for the ordering note - nothing collides, it just applies late.
    parts.push(note.kind === 'sequence-order' ? `out of sequence vs ${note.with}` : `${note.kind} collision with ${note.with}`);
  }
  if (branch.imposed > 0) parts.push(`${branch.imposed} conflicted file(s) imposed on ${branch.conflicts.size} other branch(es)`);
  if (parts.length === 0) parts.push(`free: conflicts with nothing in flight (${branch.ahead} commit(s), ${branch.files.length} file(s))`);
  return parts.join('; ');
}

/** The single-branch verdict as human-readable lines. */
export function formatVerdict(verdict) {
  const out = [`VERDICT: ${verdict.severity} (${verdict.branch})`];
  for (const reason of verdict.reasons) out.push(`  - ${reason.text}`);
  if (verdict.reasons.length === 0) out.push('  - costs no other branch in flight anything');
  if (verdict.landFirst) {
    out.push(`  Land first instead: ${verdict.landFirst}`);
    if (verdict.landFirstWhere) out.push(`                      in ${verdict.landFirstWhere}`);
  }
  return out;
}

// CLI. Exit 3 on a `hold` verdict so a caller can branch on it; everything else is 0, because
// this is advice and an advisory check that fails a build would be a gate in disguise.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  const branchArg = argv.includes('--branch') ? argv[argv.indexOf('--branch') + 1] : null;
  const targetArg = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'main';

  const assessment = await assessMergeOrder(process.cwd(), { target: targetArg });
  const verdict = branchArg ? verdictFor(assessment, branchArg) : null;

  if (wantsJson) {
    console.log(
      JSON.stringify(
        {
          target: assessment.target,
          order: assessment.order.map((b) => ({
            branch: b.branch,
            worktree: b.worktree,
            ahead: b.ahead,
            files: b.files.length,
            imposed: b.imposed,
            conflictsWith: [...b.conflicts.keys()],
            movedPaths: movedPathCount(b),
            silent: b.silent,
          })),
          notReady: assessment.notReady,
          verdict,
        },
        null,
        2,
      ),
    );
  } else {
    for (const line of formatOrder(assessment)) console.log(line);
    if (verdict) {
      console.log('');
      for (const line of formatVerdict(verdict)) console.log(line);
    }
  }

  if (verdict?.severity === 'hold') process.exitCode = 3;
}
