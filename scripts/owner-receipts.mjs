#!/usr/bin/env node
// gate: build
// guards: docs/backlog/**
//
// THE OWNER RECEIPT - owner-raised work that survives a forgetful planner.
//
//   node scripts/owner-receipts.mjs               # open receipts: asks first, unstarted and oldest first
//   node scripts/owner-receipts.mjs --check       # validate the receipts (part of `npm run build`)
//   node scripts/owner-receipts.mjs --closed      # receipts deleted from git history, i.e. landed
//   node scripts/owner-receipts.mjs --serves <branch>   # what this branch does to the receipts it owns
//   node scripts/owner-receipts.mjs --json
//
// WHY THIS EXISTS. On 2026-09-01 the owner asked for a row by name (the AGENTS.md byte headroom),
// the plan held it for the night wave, the night wave was replanned by a different session, and
// the row was never launched. Nothing in the repository knew it had been asked for: the ask lived
// in a chat, a memory file and a gitignored wave plan, each of which a later planner may never
// read. A task the owner raised must be knowable from the repository alone - who raised it, when,
// what was actually asked, and where it stands - and every plan must see the standing ones with
// their age. This script is that receipt.
//
// WHAT A RECEIPT IS. Not a second issue tracker: it is the existing `docs/backlog/` file with a
// small front matter block on top (docs/backlog/README.md, "Owner receipts"):
//
//   ---
//   v: 2
//   source: owner             # owner | derived - `derived` says out loud that this is NOT an ask
//   kind: ask                 # ask | finding
//   raised: 2026-09-01
//   state: unstarted          # unstarted | advanced | active | parked | superseded
//   branch: claude/x-thing    # required while active
//   note: what landed, or why it waits   # required for advanced, parked and superseded
//   asked: >-                 # `asked:` on an ask, `found:` on a finding - never both
//     the owner's own words, or a paraphrase marked as one
//   ---
//
// TWO THINGS A RECEIPT MUST NOT CONFLATE, both paid for on 2026-09-03 and 2026-09-04.
//
//   `kind:` - an ASK is a thing the owner wants; a FINDING is a bug or a question that turned up
//   while serving one. Version 1 printed both under the heading `asked:`, so a defect he mentioned
//   in passing read as a requirement he had issued, and once a number is written under his name
//   nobody argues with it again. Owner, 2026-09-03: "distinguish between things I explicitly asked
//   for and bugs/findings that arose while pursuing those asks. Those can absolutely remain work,
//   but don't turn them into owner requirements retroactively." A finding's quote therefore lives
//   under `found:`, and `--check` refuses a finding that carries `asked:` at all. Only asks are
//   what the wave plan check insists a plan account for.
//
//   `advanced` - work landed against this receipt and the ask still stands, with no branch owning
//   it. Version 1 had no word for that, so `cloud-sessions-for-stateless-rows` (real measurement
//   landed, ask untouched) counted as `unstarted` beside a genuinely untouched item and beside six
//   whose work was finished. The one number a planner steers by was drifting in the direction that
//   manufactures work.
//
// Landed is STILL not a state: the file is deleted in the commit that lands the work, exactly as
// the backlog README says ("graduate or die"), and `--closed` reads those deletions back out of git
// so a landed receipt is still findable. `--serves` is what keeps that true at the moment rather
// than whenever a planner notices - see its own comment. A file whose Source line credits the owner
// but carries no front matter FAILS `--check`: the point is that an owner ask cannot sit in the
// backlog without a receipt, and a convention nothing checks is a wish.
//
// Read-only except for stdout. Never edits a backlog file, never touches git state.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

export const BACKLOG_DIR = 'docs/backlog';
export const STATES = Object.freeze(['unstarted', 'advanced', 'active', 'parked', 'superseded']);
/** An ask is what the owner wants; a finding is what turned up while serving one. */
export const KINDS = Object.freeze(['ask', 'finding']);
/** The states in which the ask still stands and no branch owns it - what a plan must account for. */
export const STANDING = Object.freeze(['unstarted', 'advanced']);
/** The quote key each kind carries. A finding's words never sit under `asked:`. */
export const QUOTE_KEY = Object.freeze({ ask: 'asked', finding: 'found' });
/** The receipt's persisted-format version (root AGENTS.md principle 6). A missing `v` reads as 1. */
export const RECEIPT_VERSION = 2;

/**
 * A backlog file whose provenance line credits the owner. Matched against the first lines of the
 * body so a receipt-less owner ask is caught rather than merely tolerated. The tells are the
 * phrasings the folder actually uses today; a new phrasing that slips past this is a smaller
 * failure than an owner ask with no receipt, which is why the front matter is the contract and
 * this regex is only the net under it.
 *
 * A file may ANSWER the tell instead of satisfying it, with `source: derived` - the honest way to
 * say "the owner is quoted here, and none of this is his ask". Before that existed the tell fired
 * on the very correction that said an ask had been invented, and the only way past was to bury the
 * correction below line fifteen: a net that catches denials teaches people to hide them.
 */
export const OWNER_TELL =
  /\*\*Source:\*\*[^\n]*\bowner\b(?![-/])|\*\*Why \(owner|\bOwner (?:ruling|walk|accepted|ask|sketch)|\bowner (?:ruling|sketch|feedback|walk)\b|Reported by the owner|Owner-asked/i;

/**
 * Front matter as `{ data, body }`, or null when the text does not open with a `---` block.
 *
 * The one front-matter parser for the repo's own markdown (receipts, and the skill adapters that
 * `check-shared-instructions.mjs` validates). A UTF-8 byte order mark is tolerated because
 * Windows PowerShell 5.1 writes one; a trailing ` # comment` is stripped only from an UNQUOTED
 * value, because a quoted owner ask may legitimately carry a `#tag` or an issue number.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const data = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, rawValue = ''] = match;
    const value = rawValue.trim();
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const folded = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      data[key] = folded.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else if (/^(['"]).*\1$/.test(value)) {
      data[key] = value.slice(1, -1).trim();
    } else {
      data[key] = value.replace(/\s+#.*$/, '').trim();
    }
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A git read, or null when git says no. Every git call here is a read; nothing writes. */
function gitRead(args, root) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return run.status === 0 ? run.stdout : null;
}

/** Whole days between a timestamp (ms) and now, never negative. Shared with the handoff drain. */
export function daysSince(at, now = Date.now()) {
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / 86_400_000));
}

/**
 * One file read as a receipt. Returns null for a file that is not owner-sourced at all;
 * otherwise a record whose `problems` array says what `--check` would refuse.
 *
 * `historical: true` reads a receipt out of git history rather than off the shelf, so a version 1
 * block migrates silently instead of being told to migrate: nothing can edit a file that a commit
 * already deleted.
 */
export function receiptFrom(name, text, { now = Date.now(), historical = false } = {}) {
  const parsed = parseFrontmatter(text);
  const slug = name.replace(/\.md$/, '');
  const title = (parsed?.body ?? text).split('\n').find((line) => line.startsWith('# '))?.slice(2).trim() ?? slug;
  if (!parsed || parsed.data.source !== 'owner') {
    // `source: derived` answers the tell out loud; anything else has to be read for one.
    if (parsed?.data.source === 'derived') return null;
    const head = (parsed?.body ?? text).split('\n').slice(0, 15).join('\n');
    if (OWNER_TELL.test(head)) {
      return {
        slug,
        title,
        source: 'owner',
        receipt: false,
        problems: ['credits the owner but carries no receipt front matter - add one (source/kind/raised/state and the quote), or `source: derived` if this is not his ask'],
        notes: [],
      };
    }
    return null;
  }
  const { data } = parsed;
  const problems = [];
  const notes = [];
  const version = data.v === undefined ? 1 : Number(data.v);
  // A NEWER version degrades honestly: reported, never guessed at (root AGENTS.md principle 6).
  //
  // An OLDER one MIGRATES ON READ and is reported as a note, never as a build failure. That is
  // deliberate and it is the same rule `check-owner-queue.mjs` states for its own directory: a
  // session files a backlog item while its branch is in flight, so a tightening here reds a build
  // for a line that session's prompt never saw, and the red reads as their fault. Version 1 had one
  // quote field, `asked:`, and no `kind:`; everything written in it was written as an ask, so that
  // is how it reads back, and the shelf converges the next time somebody touches the file.
  let kind = data.kind;
  if (!Number.isFinite(version) || version > RECEIPT_VERSION) {
    problems.push(`v: ${data.v} is not a receipt version this build reads (it reads ${RECEIPT_VERSION})`);
  } else if (version < RECEIPT_VERSION) {
    // Anything unrecognised reads as an ask, INCLUDING a typo. A receipt that matched neither kind
    // would appear in neither section of the listing, and an anti-forgetting mechanism that can
    // drop a row over one wrong letter is worse than one that occasionally over-reports.
    kind = KINDS.includes(kind) ? kind : 'ask';
    if (!historical) {
      notes.push(`still on receipt format v${version} - migrate it (add kind: ask or kind: finding, and rename asked: to found: on a finding)`);
    }
  }
  // Only a receipt that CLAIMS the current version is held to it.
  if (version >= RECEIPT_VERSION && !KINDS.includes(kind)) {
    problems.push(`kind: must be one of ${KINDS.join(', ')} - an ask is what he wants, a finding is what turned up while serving one`);
  }
  if (!DATE.test(data.raised ?? '')) problems.push('raised: must be a YYYY-MM-DD date');
  if (!STATES.includes(data.state)) problems.push(`state: must be one of ${STATES.join(', ')}`);
  if (kind === 'finding' && data.asked !== undefined) {
    problems.push('asked: on a finding is the retroactive requirement this format exists to refuse - a finding is quoted under found:');
  }
  const quoteKey = QUOTE_KEY[kind] ?? 'asked';
  const quote = data[quoteKey] ?? '';
  if (!quote) {
    problems.push(kind === 'finding'
      ? 'found: is required - what was actually observed, in the reporter\'s words or a marked paraphrase'
      : 'asked: is required - what the owner actually asked, in their words or a marked paraphrase');
  }
  // Active work is owned by a BRANCH or by a PROGRAMME, and the two are different fields because
  // the landing gate compares `branch:` to a real branch name. Prose in that field looks like
  // ownership and can never match one, which made the gate inert on the only active receipt there
  // was. `programme:` says so instead, and passes the gate by never claiming a branch.
  if (data.state === 'active' && !data.branch && !data.programme) {
    problems.push('branch: is required while active - or programme:, when a programme owns the work rather than a branch');
  }
  if (data.branch && /\s/.test(data.branch)) {
    problems.push('branch: must be a branch name - use programme: for work a programme owns');
  }
  if (data.state === 'advanced' && !data.note) problems.push('note: is required when advanced - what landed (name the commit), and what still stands');
  if ((data.state === 'parked' || data.state === 'superseded') && !data.note) problems.push(`note: is required when ${data.state} - why, or by what`);
  return {
    slug,
    title,
    source: 'owner',
    kind: KINDS.includes(kind) ? kind : null,
    receipt: true,
    raised: data.raised ?? null,
    ageDays: DATE.test(data.raised ?? '') ? daysSince(Date.parse(`${data.raised}T00:00:00`), now) : null,
    state: data.state ?? null,
    branch: data.branch ?? null,
    programme: data.programme ?? null,
    note: data.note ?? null,
    quote,
    problems,
    notes,
  };
}

/** Every `.md` in the backlog except its README, read as receipts. */
export function readReceipts(root = REPO_ROOT, { now = Date.now() } = {}) {
  const dir = path.join(root, ...BACKLOG_DIR.split('/'));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => receiptFrom(name, readFileSync(path.join(dir, name), 'utf8'), { now }))
    .filter(Boolean);
}

const STATE_ORDER = { unstarted: 0, advanced: 1, active: 2, parked: 3, superseded: 4 };

/** Unstarted first and oldest first, so the line a planner must not miss is the first line. */
export function sortReceipts(receipts) {
  return [...receipts].sort((a, b) => {
    const order = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
    if (order !== 0) return order;
    return (b.ageDays ?? -1) - (a.ageDays ?? -1);
  });
}

/** A receipt nobody owns and nobody has closed - `unstarted` or `advanced`, ask or finding. */
export function stillOpen(receipt) {
  return Boolean(receipt.receipt) && STANDING.includes(receipt.state);
}

/** An open ASK - what a plan must account for by name, and what the standing count counts. */
export function isStanding(receipt) {
  return stillOpen(receipt) && receipt.kind === 'ask';
}

function receiptLines(receipts, compact) {
  const lines = [];
  for (const receipt of sortReceipts(receipts)) {
    const age = receipt.ageDays === null ? '?' : `${receipt.ageDays}d`;
    const owner = receipt.branch ?? receipt.programme;
    const where = receipt.state === 'active' && owner ? ` on ${owner}` : receipt.note ? ` - ${receipt.note}` : '';
    lines.push(`  ${receipt.state.padEnd(10)} ${age.padStart(4)}  ${receipt.slug}${compact ? '' : where}`);
    if (!compact) {
      const label = QUOTE_KEY[receipt.kind] ?? 'asked';
      lines.push(`             ${label}: ${receipt.quote.length > 140 ? `${receipt.quote.slice(0, 137)}...` : receipt.quote}`);
    }
  }
  return lines;
}

/**
 * The listing, in two sections. The split is the point: a bug he reported in passing must not read
 * as a requirement he issued, and the count a planner steers by counts only the asks that stand.
 *
 * `compact` is one line per receipt with no quote - what a session start can afford to inject into
 * context; the full form is what a planner reads.
 */
export function formatReceipts(receipts, { compact = false } = {}) {
  const valid = receipts.filter((receipt) => receipt.receipt && receipt.problems.length === 0);
  if (valid.length === 0) return ['No open owner receipts in docs/backlog/.'];
  const asks = valid.filter((receipt) => receipt.kind === 'ask');
  const findings = valid.filter((receipt) => receipt.kind === 'finding');
  const standing = asks.filter(isStanding);
  const lines = [];
  if (asks.length > 0) {
    const advanced = standing.filter((receipt) => receipt.state === 'advanced').length;
    lines.push(
      `Owner asks (${asks.length} open, ${standing.length} standing` +
        `${advanced > 0 ? `, ${advanced} of them advanced` : ''}):`,
    );
    lines.push(...receiptLines(asks, compact));
  }
  if (findings.length > 0) {
    lines.push(`Findings raised while serving them (${findings.length}) - real work, never his requirement:`);
    lines.push(...receiptLines(findings, compact));
  }
  return lines;
}

/**
 * WHAT THIS BRANCH DOES TO THE RECEIPTS IT OWNS, from its own diff against `main`.
 *
 * "Landed is not a state" only stays true if the file is deleted by the change that lands the work,
 * and on 2026-09-05 six receipts on the shelf were already served - among them
 * `scoreboard-behaviour`, landed by 84cd2e47 two days earlier. Nothing noticed, because the session
 * that knew is the only one that ever knows, and it had already ended.
 *
 * So this fires where the knowledge is, at the moment the work is declared finished: a receipt that
 * names this branch in `branch:` and that the branch does not touch is an unanswered question, and
 * the answer is one line in one file. It never guesses from a branch NAME - a slug that merely looks
 * like a branch would refuse real landings for a resemblance - so a receipt nobody marked `active`
 * is outside its reach, by design.
 *
 * `changed` is `git diff --name-status main...<branch>`, parsed: `{ path, deleted }`. `receipts`
 * must include the ones the branch DELETED, read from the merge base - see `receiptsFor` - because
 * this runs in the branch's own checkout, where a served receipt's file is already gone.
 */
export function servesVerdict({ branch, receipts, changed }) {
  const touched = new Map(
    changed
      .filter((entry) => entry.path.startsWith(`${BACKLOG_DIR}/`) && entry.path.endsWith('.md'))
      .filter((entry) => path.basename(entry.path) !== 'README.md')
      .map((entry) => [path.basename(entry.path, '.md'), entry]),
  );
  const owned = receipts.filter((receipt) => receipt.receipt && receipt.state === 'active' && receipt.branch === branch);
  const problems = [];
  const served = [];
  for (const receipt of owned) {
    const entry = touched.get(receipt.slug);
    if (!entry) {
      problems.push(
        `${BACKLOG_DIR}/${receipt.slug}.md says this branch owns it, and this branch does not touch it. ` +
          'Delete the file if the ask is served (that is how a receipt closes); set `state: advanced` ' +
          'with a note saying what landed and what still stands; keep it `active` and update its ' +
          '`note:` with what this landing added; or hand it back to `state: unstarted`.',
      );
      continue;
    }
    served.push({ slug: receipt.slug, action: entry.deleted ? 'closed' : 'updated' });
  }
  for (const [slug, entry] of touched) {
    if (owned.some((receipt) => receipt.slug === slug)) continue;
    served.push({ slug, action: entry.deleted ? 'closed' : 'updated', unclaimed: true });
  }
  return { branch, owned: owned.map((receipt) => receipt.slug), served, problems };
}

/**
 * The receipts `--serves` must judge against: the shelf as it stands here, PLUS the ones this
 * branch deleted, read back from `main`.
 *
 * Without the second half the feature reports its own success case wrong. The preflight runs in
 * the branch's checkout, so a branch that correctly closed its receipt has no file left to read,
 * `owned` comes out empty, and the close is announced as somebody else's file.
 */
export function receiptsFor(changed, root = REPO_ROOT) {
  const here = readReceipts(root);
  const known = new Set(here.map((receipt) => receipt.slug));
  const gone = [];
  for (const entry of changed) {
    if (!entry.deleted) continue;
    const slug = path.basename(entry.path, '.md');
    if (slug === 'README' || known.has(slug)) continue;
    const before = gitRead(['show', `main:${entry.path}`], root);
    if (before === null) continue;
    const receipt = receiptFrom(path.basename(entry.path), before, { historical: true });
    if (receipt?.receipt) gone.push(receipt);
  }
  return [...here, ...gone];
}

/** `git diff --name-status main...<branch>` as `servesVerdict` wants it. */
export function changedBacklogFiles(branch, root = REPO_ROOT) {
  const diff = gitRead(['diff', '--name-status', `main...${branch}`, '--', BACKLOG_DIR], root);
  if (diff === null) return null;
  return diff
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { path: rest[rest.length - 1], deleted: status.startsWith('D') };
    });
}

/** Receipts deleted from the backlog, read out of git history - the landed ones. */
export function closedReceipts(root = REPO_ROOT, { limit = 50 } = {}) {
  const log = gitRead(
    ['log', `--max-count=${limit}`, '--diff-filter=D', '--name-only', '--format=%h|%cs|%s', '--', BACKLOG_DIR],
    root,
  );
  if (log === null) return [];
  const closed = [];
  let current = null;
  for (const line of log.split('\n')) {
    if (line.includes('|')) {
      const [sha, date, ...subject] = line.split('|');
      current = { sha, date, subject: subject.join('|') };
    } else if (current && line.startsWith(`${BACKLOG_DIR}/`) && line.endsWith('.md')) {
      const before = gitRead(['show', `${current.sha}^:${line}`], root);
      if (before === null) continue;
      const receipt = receiptFrom(path.basename(line), before, { historical: true });
      if (receipt?.receipt) closed.push({ ...receipt, closedBy: current.sha, closedOn: current.date, subject: current.subject });
    }
  }
  return closed;
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT, now = Date.now() } = {}) {
  const json = argv.includes('--json');
  const receipts = readReceipts(root, { now });
  if (argv.includes('--check')) {
    const failures = receipts.flatMap((receipt) => receipt.problems.map((problem) => `${BACKLOG_DIR}/${receipt.slug}.md: ${problem}`));
    if (failures.length > 0) {
      console.error(`\nOwner receipts check failed (${failures.length}):\n`);
      for (const failure of failures) console.error(`  - ${failure}`);
      console.error('\nSee docs/backlog/README.md, "Owner receipts".\n');
      return 1;
    }
    const standing = receipts.filter(isStanding);
    console.log(
      `Owner receipts OK: ${receipts.length} receipt(s), ${standing.length} standing ask(s), ` +
        `${receipts.filter((r) => r.kind === 'finding').length} finding(s).`,
    );
    // Reported, never refused - a stale format is somebody else's branch, not a broken build.
    for (const receipt of receipts) {
      for (const note of receipt.notes ?? []) console.log(`  note: ${BACKLOG_DIR}/${receipt.slug}.md ${note}`);
    }
    return 0;
  }
  const servesAt = argv.indexOf('--serves');
  if (servesAt >= 0) {
    const branch = argv[servesAt + 1];
    if (!branch || branch.startsWith('--')) {
      console.error('usage: node scripts/owner-receipts.mjs --serves <branch>');
      return 2;
    }
    const changed = changedBacklogFiles(branch, root);
    if (changed === null) {
      console.error(`Could not diff ${BACKLOG_DIR} for ${branch} against main - is that a branch here?`);
      return 2;
    }
    const verdict = servesVerdict({ branch, receipts: receiptsFor(changed, root), changed });
    if (json) console.log(JSON.stringify(verdict, null, 2));
    else {
      // A CLOSE is the interesting event and is always named, claimed or not. An edit to a receipt
      // this branch never claimed is bookkeeping, and a migration pass touches forty of them.
      for (const entry of verdict.served) {
        if (entry.unclaimed && entry.action !== 'closed') continue;
        console.log(`  ${entry.action === 'closed' ? 'closes' : 'updates'} ${entry.slug}${entry.unclaimed ? ' (which never named this branch)' : ''}`);
      }
      const quiet = verdict.served.filter((entry) => entry.unclaimed && entry.action !== 'closed');
      if (quiet.length > 0) console.log(`  and edits ${quiet.length} receipt(s) it never claimed`);
      if (verdict.served.length === 0 && verdict.problems.length === 0) {
        console.log(`  ${branch} owns no owner receipt and changes none - nothing to record.`);
      }
      for (const problem of verdict.problems) console.error(`\n  UNANSWERED: ${problem}`);
    }
    return verdict.problems.length > 0 ? 1 : 0;
  }
  if (argv.includes('--closed')) {
    const closed = closedReceipts(root);
    if (json) console.log(JSON.stringify(closed, null, 2));
    else if (closed.length === 0) console.log('No closed owner receipts in git history.');
    else for (const receipt of closed) console.log(`  ${receipt.closedOn}  ${receipt.closedBy}  ${receipt.slug}  (${receipt.subject})`);
    return 0;
  }
  if (json) {
    console.log(JSON.stringify(sortReceipts(receipts), null, 2));
    return 0;
  }
  for (const line of formatReceipts(receipts)) console.log(line);
  const broken = receipts.filter((receipt) => receipt.problems.length > 0);
  if (broken.length > 0) {
    console.log(`  ${broken.length} file(s) fail --check: ${broken.map((r) => r.slug).join(', ')}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
