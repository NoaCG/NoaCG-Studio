// IS THIS HANDOFF SAFE TO DESTROY? - the pure half of the notice in scripts/hooks/warn-command.mjs
// and scripts/hooks/warn-edit.mjs.
//
// WHAT IT GUARDS. A handoff is the only place some facts live. On 2026-09-01 a planner classified
// thirteen handoff files as `spent` by reading their headings; four were not spent, and
// `docs/handoffs/2026-08-30-n-ograf-checker.md` held the only analysis of an unfixed OGraf defect
// (a graphic's stylesheet restyling its host page). It was deleted and then restored by hand,
// which is the only reason the analysis exists today - `docs/backlog/ograf-checker-83-rules.md`
// X-04 cites it. `scripts/handoff-drain.mjs` made the classification VISIBLE afterwards; this
// makes the destruction itself say something at the moment it happens.
//
// WHY IT IS A NOTICE AND NOT A REFUSAL. "Has this item been traced" is a judgement, and the wave
// plan that records the trace is a GITIGNORED file in the orchestrator's own worktree - so a
// session deleting handoffs from its own checkout may hold no copy of the record at all. A
// refusal keyed on a file this checkout might not have would block the ordinary case: the wave row
// whose whole job is to drain the folder. Deleting a handoff is also recoverable, which its
// siblings' failures are not: the file is tracked, so `git restore` brings it back, and saying so
// at the moment of the deletion is worth more than stopping it.
//
// THE RULE, in one line: say something when what is being destroyed still lists OPEN ITEMS and no
// wave plan records where they went.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { wavePlansDir } from './wave-plan-store.mjs';

/** A tracked handoff file. `.local.md` is gitignored session state, not a handoff anyone inherits. */
export function isHandoff(relPath) {
  const normalized = relPath.replaceAll('\\', '/');
  return normalized.startsWith('docs/handoffs/')
    && normalized.endsWith('.md')
    && !normalized.endsWith('.local.md')
    && !normalized.slice('docs/handoffs/'.length).includes('/');
}

/**
 * The headings under which a handoff puts work somebody still has to do.
 *
 * Read off the headings the folder ACTUALLY uses rather than invented: "What is left", "What is
 * UNVERIFIED", "What is NOT done", "What the review found and I did NOT fix", "Also open", "Where
 * to pick it up", "Needs you". Being generous here is cheap, because the section's own body is
 * what decides - a "What is left" saying "Nothing outstanding on this branch" is not an open item,
 * and that spelling is the folder's own convention too.
 */
const OPEN_HEADING =
  /\b(?:left|next steps?|not done|unfinished|un-?verified|did not fix|not fixed|open|outstanding|remaining|needs (?:you|a decision|deciding)|to ?do|follow-?ups?|pick it up|owner queue)\b/i;

/**
 * A section body that says there is nothing to inherit.
 *
 * Both halves are needed. The opening word is the claim ("Nothing", "None"), and the LENGTH is
 * what stops a section that opens with a denial and then spends four paragraphs describing a
 * defect from reading as empty. 240 characters is about three lines, which is as long as an honest
 * "nothing here" gets.
 *
 * A LIST MARKER IS NOT STRIPPED BEFORE THIS RUNS, deliberately: a section whose first line is a
 * bullet is a LIST of things, and `- None of the checker work is done; see the backlog.` opens
 * with a denial while being exactly the item the notice exists to protect. Erring towards firing
 * is the right side here, because the cost of staying silent is a lost analysis.
 */
const NOTHING = /^(?:nothing|none|n\/a|no open|not applicable)\b/i;

/**
 * Does this handoff still list work somebody has to inherit?
 *
 * Deliberately answered from the DOCUMENT, not from the wave plan: the two are separate facts, and
 * conflating them is exactly the 2026-09-01 error - the planner read the headings and wrote the
 * classification from them, so the classification could not disagree with the reading.
 */
export function listsOpenItems(text) {
  return openSections(text).length > 0;
}

/** The open-item sections by heading, so a notice can name what is about to be destroyed. */
export function openSections(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const found = [];
  let heading = null;
  let level = 0;
  let body = [];
  const flush = () => {
    if (heading === null) return;
    const content = body.join('\n').trim();
    const firstLine = content.split('\n').find((line) => line.trim().length > 0)?.replace(/^[>\s]+/, '') ?? '';
    const empty = content.length === 0 || (NOTHING.test(firstLine) && content.length <= 240);
    if (!empty) found.push(heading);
  };
  for (const line of lines) {
    const next = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!next) {
      if (heading !== null) body.push(line);
      continue;
    }
    // A DEEPER heading belongs to the section it sits under rather than ending it. Without this,
    // `## What is left` followed by `### The countdown re-arm` reads as an EMPTY section, so the
    // notice stays silent on precisely the handoff it exists to protect - the items are written
    // one subsection each, which is a shape the folder is one session away from using.
    if (heading !== null && next[1].length > level) {
      body.push(line);
      continue;
    }
    flush();
    const title = next[2].trim();
    heading = OPEN_HEADING.test(title) ? title : null;
    level = next[1].length;
    body = [];
  }
  flush();
  return found;
}

/**
 * Does this wave-plan entry record where a deleted file's open items went?
 *
 * `consumed` means a prompt in the wave was written from it and `owner` that its items were routed
 * to a person, so each IS the trace. `spent` claims every item was traced and the trace is the rest
 * of the line - a bare `spent:` with nothing after it is the 2026-09-01 shape exactly, a
 * classification made from the headings, so it does not count.
 *
 * `deferred` is deliberately NOT a record: the drain's own contract says consumed, spent and owner
 * files are the ones a wave row deletes, and a deferred file is one the plan decided to KEEP. So
 * deleting it is a second mistake this same notice happens to catch.
 */
export function recordsTheTrace(entry) {
  if (!entry) return false;
  if (entry.cls === 'consumed' || entry.cls === 'owner') return true;
  return entry.cls === 'spent' && entry.trace.trim().length > 0;
}

/**
 * The wave plans a hook should look in, newest first.
 *
 * THE STORE FIRST, because that is where a plan is written from 2026-09-09 (`wave-plan-store.mjs`)
 * and it is the same directory seen from every checkout. The two `docs/handoffs/` directories
 * follow, holding the plans written before the move: this feeds `warn-edit.mjs` and
 * `warn-command.mjs`, so a directory dropped here reports every legitimate drain as untraced and
 * turns the notice into noise within one wave.
 */
export function wavePlanPaths(root, homeRoot) {
  const dirs = [wavePlansDir(), path.join(root, 'docs', 'handoffs')].filter(Boolean);
  if (homeRoot) dirs.push(path.join(homeRoot, 'docs', 'handoffs'));
  const plans = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.includes('wave-plan') && name.endsWith('.local.md')) plans.push(path.join(dir, name));
    }
  }
  // Sorted ACROSS both directories, not within each. Concatenating them put every plan left in
  // this checkout ahead of every plan in the home, so a stale local copy would answer for a newer
  // one and silence a deletion the current wave never traced. Plans are date-named, so the
  // basename is the order.
  return plans.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}

/**
 * Every readable plan, parsed ONCE, newest first.
 *
 * Read once rather than per file because the common legitimate case is a whole folder going at
 * once: one wave row deletes nine handoffs, and re-reading and re-parsing both plans for each of
 * them is eighteen file reads for two facts.
 */
export function loadPlans(planPaths, parse, read = (at) => readFileSync(at, 'utf8')) {
  const loaded = [];
  for (const planPath of planPaths) {
    try {
      loaded.push({ planPath, classified: parse(read(planPath)) });
    } catch {
      // A plan we cannot read is a plan that says nothing. The wave plan is gitignored, so a path
      // that resolves in one checkout and not in another is ordinary rather than exceptional.
    }
  }
  return loaded;
}

/**
 * The classification for one handoff, from the newest plan that mentions it.
 *
 * The FIRST mention wins: a plan that does not name the file says nothing about it, which is
 * different from saying it is untraced.
 */
export function classificationOf(name, plans) {
  for (const { planPath, classified } of plans) {
    const entry = classified.get(name);
    if (entry) return { entry, planPath };
  }
  return { entry: null, planPath: null };
}

/**
 * The notices for a set of handoffs about to be destroyed - the whole rule, in one call.
 *
 * BOTH HOOKS ASK THIS ONE FUNCTION. The deletion side and the overwrite side each had their own
 * copy of "find the plans, classify, judge", including two spellings of where the orchestrator's
 * home worktree lives, which is the shape that drifts: the two would answer differently about the
 * same file the first time either was touched.
 *
 * The heavy imports are LAZY because `isHandoff` above is imported at the top of a hook that runs
 * before every shell command, and `orchestrator-home.mjs` reaches git.
 *
 * @param {string} root  the checkout the destruction happens in
 * @param {{rel: string, before: string|null, after: string|null}[]} items
 */
export async function handoffNotices(root, items) {
  if (items.length === 0) return [];
  const { parseHandoffSection } = await import('./handoff-drain.mjs');
  const { primaryRoot, HOME_RELATIVE_PATH } = await import('./orchestrator-home.mjs');
  const primary = primaryRoot(root);
  const home = primary ? path.join(primary, ...HOME_RELATIVE_PATH.split('/')) : null;
  const plans = loadPlans(wavePlanPaths(root, home), parseHandoffSection);
  return items
    .map(({ rel, before, after }) => {
      const { entry, planPath } = classificationOf(path.basename(rel), plans);
      return verdict({ rel, before, after, entry, planPath });
    })
    .filter(Boolean);
}

/**
 * The notice, or null when there is nothing to say.
 *
 * @param {object} args
 * @param {string} args.rel           repo-relative path of the file being destroyed
 * @param {string|null} args.before   its content before this call, or null when there was none
 * @param {string|null} args.after    its content after, or null when it was DELETED
 * @param {{cls: string, trace: string}|null} args.entry  the wave plan's line for it
 * @param {string|null} [args.planPath]  which plan that line came from, for the message
 */
export function verdict({ rel, before, after, entry, planPath = null }) {
  if (!before) return null; // nothing existed, so nothing was lost
  const open = openSections(before);
  if (open.length === 0) return null;
  // An overwrite that KEEPS the open items destroys nothing - this is the ordinary case of a
  // session updating its own handoff, and it must stay silent or the notice fires on every
  // handoff ever written.
  if (after !== null && listsOpenItems(after)) return null;
  if (recordsTheTrace(entry)) return null;

  const opening =
    after === null
      ? `this deletes ${rel}, which still lists open items:`
      : `this overwrites ${rel}, dropping the open items it listed:`;
  const sections = open.map((heading) => `  ${heading}`).join('\n');
  const said = entry
    ? `The newest wave plan${planPath ? ` (${path.basename(planPath)})` : ''} classifies it as ` +
      `\`${entry.cls}\`${entry.trace ? '' : ' with no trace after it'}, which does not record where those items went` +
      (entry.cls === 'deferred' ? ' - `deferred` means the plan decided to KEEP this file.' : '.')
    : 'No wave plan classifies it, so nothing anywhere records where those items went.';

  return (
    `Heads up: ${opening}\n${sections}\n${said}\n` +
    'On 2026-09-01 thirteen handoffs were classified `spent` by reading their headings; four were ' +
    'not, and docs/handoffs/2026-08-30-n-ograf-checker.md held the ONLY analysis of an unfixed ' +
    'OGraf defect. It was restored by hand, which is the only reason that analysis exists.\n' +
    (after === null
      ? `If this was not deliberate, take it back with \`git restore ${rel}\` (or \`git checkout HEAD -- ${rel}\` once staged).\n`
      : `The previous text is still in git: \`git show HEAD:${rel}\`.\n`) +
    'If it WAS deliberate, the trace is what makes it safe: record the line in the wave plan under ' +
    '`## Handoffs` - `spent: <file> - <where each open item now lives>` - or carry the items into a ' +
    'backlog file or the owner queue first. `node scripts/handoff-drain.mjs` shows the whole folder.'
  );
}
