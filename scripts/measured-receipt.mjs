// THE RECEIPT A GATE LEAVES BEHIND - one format, with one owner.
//
// A gate says how much it looked at by writing a row per measurement into the file the runner
// names in `GATE_MEASURED_FILE`, and the runner reads the rows back to tell "measured zero" from
// "never reported at all". Two different files write those rows - `scripts/measured.mjs` for a
// check, `scripts/gates-test-count.mjs` for a test file - and `scripts/gates.mjs` reads them. That
// is three files that have to agree, and they agreed by each writing the same `\t` by hand: a new
// column, a different delimiter or a subject containing a literal tab needed three coordinated
// edits, and getting one wrong loses receipts SILENTLY, which reads to the runner as a gate that
// measured nothing.
//
// So the format lives here, and nobody else spells it. The writers call `receiptRow`, the reader
// calls `parseReceipts`, and neither knows it is a tab.
import { appendFileSync } from 'node:fs';

/** The environment variable through which the runner names the receipt file. */
export const RECEIPT_ENV = 'GATE_MEASURED_FILE';

/** Tab-separated, one row per measurement: the count, what was counted, whether zero was allowed. */
const SEPARATOR = '\t';
const COLUMNS = 3;

/**
 * A subject as it can be written down: one line, no delimiter. A subject is a phrase a person
 * reads in a log ("catalog variants"), so collapsing its whitespace loses nothing - and a subject
 * built from a path or an error message could otherwise carry a tab and split into a fourth
 * column, which the reader would then drop.
 */
function oneLine(subject) {
  return String(subject ?? '').replace(/\s+/g, ' ').trim() || 'things';
}

/** One receipt row, terminated - what a writer appends. */
export function receiptRow(count, subject, optional = false) {
  return [count, oneLine(subject), optional ? 'optional' : 'required'].join(SEPARATOR) + '\n';
}

/**
 * Append one row to the receipt file, or do nothing when no runner asked for one. A gate run by a
 * person, by a workflow, or by anything that is not `scripts/gates.mjs` writes no file at all.
 *
 * A receipt the writer cannot append is the runner's problem to report, never a reason to fail a
 * gate that did its work - the `[measured]` line on stderr is in the log either way.
 */
export function appendReceipt(count, subject, optional = false) {
  const file = process.env[RECEIPT_ENV];
  if (!file) return;
  try {
    appendFileSync(file, receiptRow(count, subject, optional), 'utf8');
  } catch {
    // Deliberately silent; see above.
  }
}

/**
 * The rows a receipt file holds. A line that is not a receipt is NOT a receipt: it is dropped
 * rather than guessed at, so a corrupted file reads as fewer measurements and the runner refuses
 * the gate, which is the safe direction for a mechanism whose whole job is disbelieving a pass.
 */
export function parseReceipts(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(SEPARATOR))
    .filter((cells) => cells.length === COLUMNS && Number.isFinite(Number(cells[0])))
    .map(([count, subject, kind]) => ({ count: Number(count), subject, optional: kind === 'optional' }));
}
