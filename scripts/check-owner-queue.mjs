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
  return problems;
}

function main() {
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

  // The queue's CONTENTS may honestly be empty - the owner accepts items and they leave - so the
  // count is reported without being refused. The directory check above is what makes a zero here
  // mean "drained" rather than "the gate lost its subject".
  measured.optional(
    names.length,
    'owner queue items',
    'zero is honest when the queue has been drained: an accepted item is deleted, so an empty (but present) docs/acceptance/owner-queue/ means nothing is waiting on the owner.',
  );

  const failures = [];
  for (const name of names) {
    const text = readFileSync(path.join(dir, name), 'utf8');
    for (const problem of auditOwnerQueueItem(text)) {
      failures.push(`${QUEUE_DIR}/${name}: ${problem}`);
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
