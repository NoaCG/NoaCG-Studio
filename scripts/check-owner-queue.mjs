#!/usr/bin/env node
// gate: build
// guards: docs/acceptance/owner-queue/**
//
// THE OWNER QUEUE'S TWO KEYS, AND THIS IS WHAT KEEPS THEM THERE.
//
//   node scripts/check-owner-queue.mjs        # part of `npm run build`
//
// `docs/acceptance/OWNER_QUEUE.md` ("The shape of an item") says every file under
// `docs/acceptance/owner-queue/` opens with front matter carrying `kind:` (one of KINDS below)
// and `date:`. `.agent-workflows/walk.md` step 2 reads those two keys to pick the list an item
// goes in, sort it newest-first, filter it (`/walk hardware`) and skip `done: true` items. On
// 2026-09-02, 30 of 59 files carried neither key, so more than half the queue could not be
// sorted or filtered by the mechanism its own contract describes - the documented shape was
// untrue, and nothing said so.
//
// Narrow on purpose: this checks that the two keys are present, that `kind:` is a value `/walk`
// understands, and that an OPTIONAL `serves:` - the whole priority mechanism, so a typo in it
// silently sorts an item last - reads `now` if it is there at all. It does not check the route,
// the "what to look at" line, or anything else the shape doc describes, so a red here always has
// a one-line fix: add the missing key, or correct the value.
//
// Every rule is a WIDENING or a check on a key nobody has written yet, never a new requirement.
// Sessions file items into this directory while branches are in flight, and a tightening reds
// their builds for a line their prompt never saw.
//
// Reuses parseFrontmatter from scripts/owner-receipts.mjs, the one front-matter parser for the
// repo's own markdown, rather than writing a second one.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measured } from './measured.mjs';
import { parseFrontmatter } from './owner-receipts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export const QUEUE_DIR = 'docs/acceptance/owner-queue';

/**
 * The kinds `.agent-workflows/walk.md` and `docs/acceptance/OWNER_QUEUE.md` both know about.
 * Each value answers ONE question - who can settle this item - so a filing session can pick it
 * without judgement about importance. See OWNER_QUEUE.md, "Which kind does an item get".
 *
 * Widened on 2026-09-02 from `walk` / `owner-action` / `hardware`, by adding `walk-p` (the owner
 * can answer it from his phone) and `agent` (an agent settles it by driving the product). The
 * three older values still pass unchanged: this is a WIDENING, so no item filed against the
 * earlier vocabulary goes red for a value its session never saw.
 */
export const KINDS = Object.freeze(['walk', 'walk-p', 'owner-action', 'hardware', 'agent']);

/**
 * The only value `serves:` may carry. It marks an item whose work serves the `## NOW` push in
 * `docs/GOALS.md`, and `/walk` presents those first. One value rather than a set, deliberately:
 * the push is singular, and a second value would be a priority scheme nobody agreed on.
 */
export const SERVES = 'now';

/**
 * WHY an `owner-action` item is his, and the only four answers there are. The owner ruled on
 * 2026-09-04 that a TECHNICAL problem is never his - a red main, a branch that will not land, a
 * stuck queue, a worktree in a bad state, a dependency to upgrade - because he has no skill there
 * that an agent lacks, and routing one to him means he asks an AI and pastes the answer back.
 * Every one of those is ours, including the ones we have not solved yet.
 *
 * So the kind alone stopped being enough. `owner-action` was the bucket everything hard fell
 * into, and a closed vocabulary is what makes the fall visible: an item that cannot name one of
 * these four is not his, and filing it is the bug this gate catches.
 *
 * - account  - credentials or a console we do not hold.
 * - money    - it costs money, or publishes past `main` where a later commit cannot undo it.
 * - identity - he must speak or sign as himself or as the organisation.
 * - harness  - the agent harness refuses it by design, and the item says which refusal it hit.
 *
 * Full definitions and the ruling: `docs/acceptance/OWNER_QUEUE.md`, "A TECHNICAL problem is
 * never his".
 */
export const NEEDS = Object.freeze(['account', 'money', 'identity', 'harness']);

/**
 * The date the `needs:` requirement starts applying, as `YYYY-MM-DD`.
 *
 * This gate's standing rule is that every change is a WIDENING, because sessions file items here
 * while their branches are in flight and a tightening reds a build for a line the prompt never
 * saw. Requiring a new key is a genuine tightening, so it is date-gated instead: an item filed
 * before this date is read exactly as it always was, and only items filed from this date on have
 * to carry it. The key is validated against NEEDS whenever it is present, at any date, since a
 * misspelt value would be worse than an absent one.
 */
export const NEEDS_REQUIRED_FROM = '2026-09-05';

/**
 * WHY A WALK ITEM IS HIS. The same idea as `needs:`, one list further in.
 *
 * `needs:` closed the door on technical problems being parked on the owner. It did nothing about
 * the far bigger list, because a `walk` or `walk-p` item never had to justify itself at all - so
 * everything observable landed on his desk by default, and the queue grew past eighty.
 *
 * Owner, 2026-09-10, after walking his phone list: "we need to find a way to get less into my
 * queue because design and technical questions should be possible to answer with the AI. It should
 * be logical what we want to do." That is the third time he has said a version of it - the design
 * default ruling of 2026-09-03 and the technical ruling of 2026-09-04 are the first two - which is
 * the evidence that saying it in prose does not hold.
 *
 * Four reasons, and they are the ones OWNER_QUEUE.md already lists as genuinely his:
 *
 * - taste     - whether a shipped thing is any GOOD. No defensible general answer exists; it needs
 *               his eye. Not "which of these two is better designed", which is a design default.
 * - scope     - what the product IS or is not. A change to the thing rather than to a setting.
 * - direction - where the product goes, including a call between two defensible options that point
 *               it different ways.
 * - money     - it costs money, or it commits him to a cost.
 *
 * If none of the four fits, the item is not his: DECIDE IT, do it, and say in the item what was
 * decided and why, so he can overrule a thing that exists rather than adjudicate one that does not.
 */
export const WALK_BECAUSE = Object.freeze(['taste', 'scope', 'direction', 'money']);

/**
 * The date the `because:` requirement starts applying, as `YYYY-MM-DD`.
 *
 * Date-gated for exactly the reason `needs:` is: this is a tightening, and sessions file items
 * while their branches are in flight, so a same-day requirement reds a build for a line the prompt
 * never saw. Set to the day AFTER it landed. Items filed before it are read as they always were,
 * and the value is validated whenever present at any date, since a misspelt reason is worse than
 * an absent one.
 */
export const BECAUSE_REQUIRED_FROM = '2026-09-11';

// ---------------------------------------------------------------------------
// THE ROUTE, AND THE PLACE IT OPENS
// ---------------------------------------------------------------------------
//
// A walk used to cost one route per item. On 2026-09-09 the queue held 75 files, 64 of them open,
// and 28 of those began with the SAME four clicks - open the studio, Import graphic, drop a file.
// The owner's own account of what this queue costs him is in OWNER_QUEUE.md: "the cost he is
// protecting is not his attention, it is his TIME AT A MACHINE - a sentence costs him nothing, and
// clicking through menus and drawing SVGs costs him a lot." Twenty-eight walks through the same
// menu is that cost paid twenty-eight times over.
//
// So `/walk` groups by the PLACE an item's route opens, and the grouping is DERIVED from the route
// line each item already wrote. No new front-matter key: a key sessions must remember to fill is a
// key that is wrong on the day somebody forgets, and the 64 items already on disk would all carry
// nothing. What they DO carry is a route - the queue's shape doc has demanded one since the
// beginning, and all 59 open `walk`/`walk-p` items grouped on the day this landed.

/**
 * A route section's own heading - the shape most items use.
 *
 * The heading must OPEN with the word, not merely contain it. This change's own queue item is
 * titled "A walk now covers a route, not an item", and a looser pattern read that TITLE as the
 * route section, stopped at the next heading, and grouped the item on three words of prose.
 * `\broutes?\b` rather than `route`, so "routing" and "routines" are not matched either.
 */
const ROUTE_HEADING = /^#{1,6}\s+(?:the\s+)?routes?\b/i;

/**
 * The other shape: a bold lead-in, sometimes mid-paragraph after the date -
 * `**Date:** 2026-09-07. **Route:** open ...` is a real item. The lead-in must START a line or a
 * sentence, because an unanchored pattern lets any earlier bold mention of the word hijack the
 * route: a summary reading "The **route** each item writes is what groups it now" sits above a
 * perfectly good `## The route` section, and matched first.
 */
const ROUTE_LEAD_IN = /(?:^|[.·]\s+)\*\*Routes?\b[^*\n]*\*\*|^Route:/i;

/**
 * A hard backstop on how much of an item is read as its route, in characters. It exists so a
 * malformed item groups on its opening rather than on its whole text - never as the normal way a
 * route ends, which is why it sits above the real range rather than inside it: on 2026-09-09 the
 * longest of the 68 route sections on disk was 1,406 characters and none reached this.
 */
const ROUTE_MAX_CHARS = 1600;

/**
 * The text of an item's route section, or null when it has none.
 *
 * WHERE THE ROUTE ENDS MATTERS AS MUCH AS WHERE IT STARTS. What follows a route is "what to look
 * at", and that paragraph names screens the route never opens - the receipts item is the proof:
 * its route is one command in a terminal, and the paragraph under it mentions the editor and the
 * studio while describing a BUG LIST. Read as one blob it grouped under "the studio", which would
 * have sent the owner to the wrong screen.
 *
 * Read line by line rather than by regex offsets, for two reasons a single pattern got wrong:
 * a `#` comment on the first line of a fenced command block is not a heading, and the plain
 * `What to look at:` that the older one-paragraph template used is a boundary just as much as the
 * bold `**What to look at.**` that replaced it.
 *
 * @param {string} text the item's full content
 * @returns {string|null}
 */
export function routeTextOf(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  // A HEADING WINS OVER A LEAD-IN, wherever each one sits. An item with a real route section and a
  // passing bold mention of the word above it has one obvious answer, and this is it.
  let start = lines.findIndex((line) => ROUTE_HEADING.test(line));
  if (start < 0) start = lines.findIndex((line) => ROUTE_LEAD_IN.test(line));
  if (start < 0) return null;

  const out = [];
  let inFence = false;
  let length = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (!inFence && index > start && /^#{1,6}\s|^\*{0,2}What\b/i.test(line)) break;
    out.push(line);
    length += line.length + 1;
    if (length > ROUTE_MAX_CHARS) break;
  }
  return out.join('\n');
}

/**
 * The places a walk opens, MOST SPECIFIC FIRST - the first match wins, and the order is the whole
 * rule. `/docs` is tested before the site that hosts it; the import wizard before the studio that
 * contains it; the studio before the checkout, because half the studio routes start with
 * `npm run dev` and grouping those as "a terminal" would send the owner to the wrong screen.
 *
 * Each entry is a place a person physically opens ONCE and then works from. That is the test for
 * adding one: not "are these items similar" but "does one opening serve all of them".
 */
export const PLACES = Object.freeze([
  {
    id: 'github',
    label: 'GitHub',
    hint: 'the repository in a browser - pull requests, tabs, settings',
    test: /github\.com/i,
  },
  {
    id: 'docs',
    label: 'The docs site',
    hint: '/docs, hosted or local',
    test: /(^|[\s(`<[])\/docs\b|noacg\.studio\/docs/i,
  },
  {
    id: 'site',
    label: 'The public site',
    hint: 'noacg.studio - the landing page and what it publishes',
    test: /noacg\.studio/i,
  },
  {
    id: 'import',
    label: 'Import graphic',
    hint: 'the studio, Import graphic, then one file dropped per item',
    test: /import graphic|import your own|\bimport\b[^\n]{0,20}\bsvg\b/i,
  },
  {
    id: 'studio',
    label: 'The studio',
    hint: '/app - templates, browse, the editor, a production',
    test: /\/app\b|#\/app|\bstudio\b|\bnew graphic\b|\bbrowse\b|\btemplates\b|\bthe editor\b|\bproduction\b|\binspector\b/i,
  },
  {
    id: 'checkout',
    label: 'A checkout',
    hint: 'a command to run or a file to read, with no product on screen',
    // A fenced block, a command, or a markdown file in the repository. Deliberately last: a route
    // that opens a screen AND runs a command is a screen route, and every one of those starts by
    // starting the dev server.
    test: /```|\bnpm run\b|\bnode scripts\/|[\w-]+\/[\w./-]*\.md\b|\.claude\//i,
  },
]);

/**
 * The bucket for an item whose route matches no shared place. Two different things land here and
 * both belong: a route nobody else shares (the Claude Code sidebar, a playout box), and a route
 * that could not be found at all. Neither is a defect in the grouping - they are simply walked one
 * at a time, the way every item was walked before this existed, and they go LAST so the batched
 * places are cleared first.
 */
export const OWN_ROUTE = Object.freeze({
  id: 'own',
  label: 'On their own',
  hint: 'one route each - walked one at a time, as before',
});

/**
 * Which place this item's route opens.
 *
 * @param {string} text the item's full content
 * @returns {{ id: string, label: string, hint: string }} a PLACES entry, or OWN_ROUTE
 */
export function placeOf(text) {
  const route = routeTextOf(text);
  if (!route) return OWN_ROUTE;
  return PLACES.find((place) => place.test.test(route)) ?? OWN_ROUTE;
}

/**
 * The date from which a `walk`, `walk-p` or `agent` item must carry a findable route section.
 *
 * Date-gated for the same reason `needs:` is: this gate's standing rule is that every change is a
 * WIDENING, because sessions file items here while their branches are in flight and a tightening
 * reds a build for a line the prompt never saw. Three open items filed before this date have no
 * route section and none of them goes red.
 *
 * `owner-action` and `hardware` are exempt on purpose. A hardware item is blocked on a playout box
 * and has nowhere to send anyone; an owner-action item's route is a console we do not hold, and its
 * `needs:` key already says why it is his.
 */
export const ROUTE_REQUIRED_FROM = '2026-09-10';

/** The kinds a walk actually opens something for, and therefore the kinds that need a route. */
const ROUTED_KINDS = Object.freeze(['walk', 'walk-p', 'agent']);

/**
 * `parseFrontmatter` gives back the TEXT of each value, so `done: true` arrives as the string
 * 'true' and `answered: false` as the string 'false'. Comparing either against the boolean is
 * always false, which would present every settled item as open.
 */
const isTrue = (value) => value === true || value === 'true';

/** True only when this file was RUN, not imported - the same guard the other checks carry. */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

/**
 * One item's problems, or `[]` when it is fine. Pure, so the rule is testable with literal text
 * rather than fixture files on disk.
 *
 * @param {string} text  the file's full content
 * @returns {string[]}
 */
export function auditOwnerQueueItem(text) {
  const parsed = parseFrontmatter(text);
  if (!parsed) return ['missing front matter (kind: and date:)'];
  const { data } = parsed;
  const problems = [];
  if (!data.kind) problems.push('missing kind:');
  else if (!KINDS.includes(data.kind)) problems.push(`kind: '${data.kind}' is not one of ${KINDS.join(', ')}`);
  if (!data.date) problems.push('missing date:');
  // `serves:` is OPTIONAL and its absence is never a problem - an item that does not serve the
  // current push simply has no key. But it is the whole priority mechanism, so a misspelt value
  // ('NOW', 'yes', anything) would sort the item last with nothing saying so, which is the one
  // failure mode this gate exists to prevent.
  if (data.serves !== undefined && data.serves !== SERVES) {
    problems.push(`serves: '${data.serves}' is not '${SERVES}' (omit the key when it does not apply)`);
  }
  // `needs:` says WHY an owner-action item is his, and only an owner-action item has one. Both
  // halves matter: a missing reason is how a technical problem gets parked on his desk, and a
  // reason on a `walk` item means somebody filed the wrong kind and dressed it up.
  if (data.needs !== undefined && !NEEDS.includes(data.needs)) {
    problems.push(`needs: '${data.needs}' is not one of ${NEEDS.join(', ')}`);
  }
  if (data.needs !== undefined && data.kind !== 'owner-action') {
    problems.push(`needs: only belongs on kind: owner-action (this is kind: ${data.kind ?? 'missing'})`);
  }
  if (data.kind === 'owner-action' && data.needs === undefined && String(data.date ?? '') >= NEEDS_REQUIRED_FROM) {
    problems.push(
      `kind: owner-action needs a reason - add needs: ${NEEDS.join(' | ')}. ` +
        'If none of them fits, it is not an owner action: do the work instead.',
    );
  }
  // `because:` says why a WALK item is his, and the four reasons are the ones that genuinely are.
  // A missing reason is how a decidable design question ends up on his desk; a reason on the wrong
  // kind means somebody filed an agent item and dressed it up as a walk.
  if (data.because !== undefined && !WALK_BECAUSE.includes(data.because)) {
    problems.push(`because: '${data.because}' is not one of ${WALK_BECAUSE.join(', ')}`);
  }
  if (data.because !== undefined && !['walk', 'walk-p'].includes(data.kind)) {
    problems.push(`because: only belongs on kind: walk or walk-p (this is kind: ${data.kind ?? 'missing'})`);
  }
  if (
    ['walk', 'walk-p'].includes(data.kind) &&
    data.because === undefined &&
    !isTrue(data.done) &&
    String(data.date ?? '') >= BECAUSE_REQUIRED_FROM
  ) {
    problems.push(
      `kind: ${data.kind} needs a reason - add because: ${WALK_BECAUSE.join(' | ')}. ` +
        'If none of them fits, it is not his: decide it, do it, and say in the item what you ' +
        'decided and why.',
    );
  }
  // THE ROUTE. `/walk` groups the queue by the place a route opens, so an item with no route
  // section is not only unreachable (which OWNER_QUEUE.md has always said), it also cannot join
  // the group that would have carried it. The check is for a route SECTION, never for a route
  // that matches a known place: a genuinely new place is legitimate, and a gate that pushed items
  // into existing buckets would be inventing a fact about where the owner has to go.
  if (
    ROUTED_KINDS.includes(data.kind) &&
    !isTrue(data.done) &&
    String(data.date ?? '') >= ROUTE_REQUIRED_FROM &&
    routeTextOf(text) === null
  ) {
    problems.push(
      'no route section - add one, as a "## The route, under a minute" heading or a ' +
        '"**Route, under a minute.**" line. An item with no route is not an item, and it cannot ' +
        'be grouped with the items that open the same screen.',
    );
  }
  return problems;
}

/**
 * Every item on disk, parsed once. `place` and `title` are derived here so the report and the
 * gate's own measurement read the same numbers from the same pass.
 *
 * @param {string} dir absolute path to the queue directory
 * @param {string[]} names file names, sorted
 */
function readQueue(dir, names) {
  return names.map((name) => {
    const text = readFileSync(path.join(dir, name), 'utf8');
    const parsed = parseFrontmatter(text);
    const data = parsed?.data ?? {};
    // The H1 is what a human wrote for this item; the file name is the fallback for one that has
    // no title yet, which nothing forbids. Matched against the BODY, because a whole-line comment
    // in the front matter (`# filed by the night wave`) is a `#` line too, and would be printed to
    // the owner as the item's name.
    const title = (parsed?.body ?? text).match(/^#\s+(.+)$/m)?.[1].trim() ?? name;
    return { name, text, data, title, place: placeOf(text) };
  });
}

/**
 * The order inside a group, and it is the same three keys `/walk` has always sorted by, so two
 * sessions an hour apart show the owner the same list: `serves: now` first, then `answered: true`
 * (the re-looks he is owed), then newest `date:` first.
 */
function byWalkOrder(a, b) {
  const serves = (item) => (item.data.serves === SERVES ? 0 : 1);
  const answered = (item) => (isTrue(item.data.answered) ? 0 : 1);
  return (
    serves(a) - serves(b) ||
    answered(a) - answered(b) ||
    String(b.data.date ?? '').localeCompare(String(a.data.date ?? '')) ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Group one list's items by place, biggest and most urgent first.
 *
 * A group holding a `serves: now` item leads, because the push outranks the saving. After that the
 * order is by SIZE, since the whole point is that one opening settles many items - and "On their
 * own" is always last, whatever its size, because those cost a route each and clearing the batched
 * places first is what makes a walk short.
 */
function groupByPlace(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.place.id)) groups.set(item.place.id, { place: item.place, items: [] });
    groups.get(item.place.id).items.push(item);
  }
  const order = PLACES.map((place) => place.id);
  return [...groups.values()]
    .map((group) => ({ ...group, items: group.items.sort(byWalkOrder) }))
    .sort((a, b) => {
      const own = (group) => (group.place.id === OWN_ROUTE.id ? 1 : 0);
      const now = (group) => (group.items.some((item) => item.data.serves === SERVES) ? 0 : 1);
      return (
        own(a) - own(b) ||
        now(a) - now(b) ||
        b.items.length - a.items.length ||
        order.indexOf(a.place.id) - order.indexOf(b.place.id)
      );
    });
}

/**
 * The two kinds that are never grouped by route. An `owner-action` item is a console we do not
 * hold, and no two of them are the same console; a `hardware` item is blocked on a playout box and
 * names no route at all. Grouping either would print one bucket called "on their own" and call it
 * a place.
 */
const UNGROUPED_KINDS = Object.freeze(['owner-action', 'hardware']);

/** One item, one line, with what the reader needs in order to pick it. */
function printItem(item, extra) {
  const flags = [
    item.data.serves === SERVES ? 'NOW' : null,
    isTrue(item.data.answered) ? 'answered' : null,
    extra,
  ].filter(Boolean);
  console.log(`    - ${item.title}${flags.length > 0 ? `  [${flags.join(', ')}]` : ''}`);
  console.log(`      ${item.data.date ?? '(no date)'}  ${item.name}`);
}

/** One list, printed flat, for the kinds no route can batch. */
function printFlatList(heading, items, extra = () => null) {
  if (items.length === 0) return;
  console.log(`\n${heading} - ${items.length} item(s)`);
  for (const item of [...items].sort(byWalkOrder)) printItem(item, extra(item));
}

/** One list, printed as its groups. */
function printList(heading, items) {
  if (items.length === 0) return;
  const groups = groupByPlace(items);
  console.log(`\n${heading} - ${items.length} item(s) in ${groups.length} place(s)`);
  for (const group of groups) {
    const now = group.items.filter((item) => item.data.serves === SERVES).length;
    console.log(`\n  ${group.place.label} (${group.items.length}${now ? `, ${now} serve NOW` : ''}) - ${group.place.hint}`);
    for (const item of group.items) printItem(item);
  }
}

/**
 * `--routes` - the queue as a WALK sees it, grouped by the place each route opens.
 *
 * This exists as a script rather than as a paragraph telling a session to group by eye, for the
 * reason the sort order is already mechanical: a judgement made at presentation time gives the
 * owner a different list every session, and he cannot tell a re-ordering from new work.
 *
 * @param {ReturnType<typeof readQueue>} queue
 * @param {string|undefined} filter a kind to show instead of the owner's own three lists
 */
function reportRoutes(queue, filter) {
  const open = queue.filter((item) => !isTrue(item.data.done));
  const of = (kind) => open.filter((item) => item.data.kind === kind);

  if (filter) {
    const items = of(filter);
    if (items.length === 0) {
      console.log(`No open kind: ${filter} item.`);
      return 0;
    }
    if (UNGROUPED_KINDS.includes(filter)) printFlatList(`kind: ${filter}`, items);
    else printList(`kind: ${filter}`, items);
    return items.length;
  }

  // Printed for the same reason `needs:` is: a wrong reason should be visible to HIM, not only to
  // the gate. An item filed before the requirement shows nothing, which is honest - it was never
  // asked.
  printList('From your phone (walk-p)', of('walk-p'));
  printList('At the computer (walk)', of('walk'));

  // The `needs:` key is what is worth reading on an owner-action item, so it is printed beside the
  // title: a wrong reason is then visible to HIM and not only to the gate.
  printFlatList('Only you can do these (owner-action)', of('owner-action'), (item) => `needs: ${item.data.needs ?? '?'}`);

  const hardware = of('hardware').length;
  const agent = of('agent').length;
  console.log(
    `\nAlso open: ${agent} agent item(s) (--routes agent), ${hardware} blocked on hardware (--routes hardware).`,
  );
  return open.length;
}

function main() {
  const routesFlag = process.argv.indexOf('--routes');
  const dir = path.join(ROOT, ...QUEUE_DIR.split('/'));
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      // AN EMPTY QUEUE IS A REAL ANSWER; A MISSING DIRECTORY IS NOT. "No open item" is what
      // OWNER_QUEUE.md says the absence of a FILE means - it says nothing about the absence of
      // the directory, and treating the two the same is how a rename would leave this gate
      // reporting OK forever over a queue nobody could file into any more.
      console.error(`\ncheck-owner-queue: ${QUEUE_DIR} does not exist, so no queued item could be read.`);
      console.error('Every observable change files an item there, and with the directory gone this gate would pass');
      console.error('for as long as nobody looked. Restore it, or update QUEUE_DIR to where it moved.\n');
      return 1;
    }
    console.error(`Cannot read ${QUEUE_DIR}: ${error.message}`);
    return 1;
  }

  const queue = readQueue(dir, names);

  if (routesFlag >= 0) {
    const shown = reportRoutes(queue, process.argv[routesFlag + 1]);
    console.log(`\n${shown} open item(s). Full rules: ${QUEUE_DIR.replace('/owner-queue', '/OWNER_QUEUE.md')}`);
    return 0;
  }

  // The queue's CONTENTS may honestly be empty - the owner accepts items and they leave - so the
  // count is reported without being refused. The directory check above is what makes a zero here
  // mean "drained" rather than "the gate lost its subject".
  measured.optional(
    names.length,
    'owner queue items',
    'zero is honest when the queue has been drained: an accepted item is deleted, so an empty (but present) docs/acceptance/owner-queue/ means nothing is waiting on the owner.',
  );

  // WHAT THE GROUPING RESOLVED TO, said out loud on every build. The route rule is a set of
  // regexes over prose dozens of sessions wrote in their own words, which is exactly the shape
  // `scripts/measured.mjs` exists to distrust: a pattern that quietly stops matching would leave
  // `/walk` presenting one flat list again with nothing saying so. The count that matters is how
  // many open items landed in a SHARED place rather than on their own - if that collapses towards
  // zero, the grouping has stopped working even though every other rule here still passes.
  //
  // Counted over the ROUTED kinds only. An `owner-action` or `hardware` item is never grouped, so
  // including them would move the ratio for reasons that have nothing to do with the grouping:
  // filing four more hardware items would drag it down while every rule here still worked.
  const routed = queue.filter((item) => !isTrue(item.data.done) && ROUTED_KINDS.includes(item.data.kind));
  const grouped = routed.filter((item) => item.place.id !== OWN_ROUTE.id);
  measured.optional(
    grouped.length,
    `queue items grouped by route (of ${routed.length} open walk/walk-p/agent; ${new Set(grouped.map((item) => item.place.id)).size} place(s))`,
    'zero is honest for a drained queue, or for one whose every remaining item opens somewhere nobody else does.',
  );

  const failures = [];
  for (const item of queue) {
    for (const problem of auditOwnerQueueItem(item.text)) {
      failures.push(`${QUEUE_DIR}/${item.name}: ${problem}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\ncheck-owner-queue: ${failures.length} problem(s) across ${names.length} file(s):\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\nAdd the missing key(s), or fix the kind. See docs/acceptance/OWNER_QUEUE.md, "The shape of an item".\n');
    return 1;
  }

  console.log(`check-owner-queue: OK - ${names.length} item(s), all carry kind: and date:.`);
  return 0;
}

if (isEntrypoint) process.exit(main());
