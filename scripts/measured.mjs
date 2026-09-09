// WHAT A GATE MEASURED - the one line that separates a real pass from a blind one.
//
//   import { measured } from './measured.mjs';
//   measured(variants.length, 'catalog variants');          // zero fails the gate, loudly
//   measured.optional(items.length, 'queued items', '...'); // zero is honest here, and why
//
// WHY THIS EXISTS. On the night of 2026-09-08 three mechanisms passed while measuring nothing,
// found independently of each other:
//
//   - `scripts/type-floor.mjs` read its per-category floors with a regex over the source of
//     `src/validation/typeFloor.ts`. PR #131 moved the constant to `src/model/designRules.ts`.
//     The regex matched nothing, the floor resolved to `undefined`, `px < undefined` is false
//     for every element, and the gate would have printed PASS over 502 designs having measured
//     NONE of them.
//   - A contract rule declaring `fires: test:<spec>` is treated as CARRIED by a mechanism and
//     printed in no loaded surface. Nothing checked that the mechanism prints it, so four rules
//     vanished from every contract with no gate saying a word.
//   - A `check:contract-evidence` marker was satisfied by an incident write-up that merely
//     QUOTED the marker.
//
// One shape three times: a gate resolves the SET IT MEASURES - or the THRESHOLD it measures
// against - by a regex, a file name, a marker string, a glob or an optional lookup, and reads
// the empty result as success. Every one of them was found by a person, and each took hours.
//
// THE RULE. A gate says out loud how many things it looked at, and a count of zero is a FAILURE
// rather than a pass. That turns the whole class from silent to loud: a moved constant, a
// renamed marker, a glob that stopped matching and an emptied directory all end in the same
// place, which is `measured(0, ...)` refusing to let the gate exit green.
//
// The refusal is HERE rather than in the runner on purpose. `scripts/type-floor.mjs` is invoked
// straight from two workflows (`node scripts/type-floor.mjs`), never through
// `scripts/gates.mjs`, so a rule that only the build runner enforced would not have covered the
// gate that started this. A gate protects itself whoever runs it: the build, a workflow, or a
// person at a prompt.
//
// The runner adds the second half it alone can see - `scripts/gates.mjs` refuses a check that
// exits 0 having reported NO measurement at all - and `check:gate-coverage` adds the third, a
// static rule that a new gate either uses this helper or writes down why it cannot.
import { appendReceipt } from './measured-receipt.mjs';

/**
 * How long a written reason has to be before it counts as one. Every escape hatch in the
 * measurement rule is held to this same length - `measured.optional(n, subject, why)` here,
 * `// measures: none - <why>` and `// gate: none - <why>` in `scripts/gates.mjs`, which imports
 * this constant rather than repeating the number. A hatch whose reason may be "not yet" is the
 * hatch everything leaves through, and two hatches with two lengths is two rules.
 */
export const REASON_MIN = 20;

function record(count, subject, optional) {
  // STDERR, because a gate's STDOUT can be data. `.github/workflows/ci.yml` runs
  // `PLAN="$(node scripts/e2e-affected.mjs --json ...)"` and hands the result to `JSON.parse`,
  // and half a dozen gates have a `--json` mode of their own. A diagnostic line on the data
  // channel would have broken every CI plan step, which is a worse bug than the one this helper
  // exists to prevent. The runner reads the receipt file, never the text.
  process.stderr.write(`[measured] ${count} ${subject}\n`);
  appendReceipt(count, subject, optional);
}

/**
 * End the gate, loudly, with the exit code a failed gate has.
 *
 * A THROW rather than `process.exit()`. Forcing exit while an in-flight handle is still closing
 * trips a libuv assertion on Windows and the run reports 127 instead of the verdict, which is why
 * `scripts/check-ograf-schema.mjs` already sets `process.exitCode` and never calls `process.exit`
 * - and that gate is one of the callers. `exitCode` is set FIRST, so a caller that swallows the
 * throw in a `catch` still fails: a gate cannot accidentally pass by catching its own refusal.
 */
function refuse(message) {
  process.exitCode = 1;
  process.stderr.write(`\n${message}\n\n`);
  throw new Error(message.split('\n')[0]);
}

/**
 * Report what this gate resolved its subject to. A count of zero ENDS THE PROCESS with exit 1:
 * a gate that found nothing to look at has not passed, it has failed to run.
 *
 * @param {number} count how many things the gate is about to measure, or has measured
 * @param {string} subject what they are, in the plural, as a person would say it
 */
export function measured(count, subject) {
  if (!Number.isInteger(count) || count < 0) {
    refuse(`[measured] ${subject}: the count is ${JSON.stringify(count)}, which is not a whole number of things. A gate that cannot say how much it looked at has not passed.`);
  }
  record(count, subject, false);
  if (count === 0) {
    refuse(
      `MEASURED NOTHING: this gate resolved 0 ${subject}, so it would have passed without ` +
        'looking at anything.\n' +
        'Something the gate resolves its subject by has moved: a constant, a file name, a marker ' +
        'string, a glob, or a directory that is now empty.\n' +
        'Fix the resolution rather than the count. If zero is genuinely honest here, say so in ' +
        'the code with `measured.optional(n, subject, why)`.',
    );
  }
}

/**
 * The same report, for a subject that is honestly empty sometimes - a queue that has been
 * drained, a diff that touched none of the gate's paths. `why` is required and has to be a
 * sentence a reader can act on, exactly like `gate: none - <why>`: an escape hatch nobody has to
 * justify is the hatch everything leaves through.
 */
measured.optional = function optional(count, subject, why) {
  if (typeof why !== 'string' || why.trim().length < REASON_MIN) {
    refuse(`[measured] ${subject}: measured.optional needs a reason a reader can act on, saying WHEN zero is honest here.`);
  }
  if (!Number.isInteger(count) || count < 0) {
    refuse(`[measured] ${subject}: the count is ${JSON.stringify(count)}, which is not a whole number of things.`);
  }
  record(count, subject, true);
};
