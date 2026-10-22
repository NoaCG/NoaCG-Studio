// Google Sheets (or any published CSV) as a LIVE data source. This generates a teachable,
// fully-editable polling block that gets appended to the template's own JS: it fetches the
// CSV every few seconds, maps columns → fields, and calls the graphic's update(). It runs
// wherever the template runs (preview, OBS browser source, SPX/CasparCG). Because it lives
// in template.js as ordinary code, the user can read and edit the URL + mapping directly —
// true to the "code is the source of truth" pillar.
//
// CORS note baked into the generated comments: use the sheet's "Publish to web → CSV" link
// (those are served for public embedding); strict browsers may still block other links, in
// which case Era 5's gateway proxies it universally.
//
// RETIRED AS A WAY TO CONNECT (data-sources C6): a Sheet now connects at the production, with
// Connect data… on a cue. Nothing offers this block to a new graphic any more; one already in a
// graphic keeps running, and exports carry it unchanged.

import type { SpxField } from '../model/types';

import { LIVE_DATA_OPEN as OPEN, hasLiveData } from '../model/liveDataMark';
const CLOSE = '/* == END LIVE DATA == */';

export { hasLiveData };

/** The address an existing block reads, as its code says it now (a person may have edited it). */
export function liveDataUrl(js: string): string | null {
  const start = js.indexOf(OPEN);
  if (start === -1) return null;
  const m = /var CSV_URL = ("(?:[^"\\]|\\.)*")/.exec(js.slice(start));
  if (!m) return null;
  try {
    return String(JSON.parse(m[1]));
  } catch {
    return null;
  }
}

/**
 * ONE WAY TO CONNECT A SHEET (sheet-data-flow AC-10, data-sources C6). New graphics are no longer
 * offered this block; a graphic that already carries one keeps running it, and Connect data… may
 * take over its fields only once that reader no longer runs where the graphic plays, so two
 * readers never write the same field.
 *
 * `resolvedJs` is the design the production plays and publishes next (the library record when it
 * has one), `copyJs` the production's own copy. Published, two observations stand for the output
 * itself: `outputReads`, the published payload this page last saw (at its resolve or its own
 * successful Publish) still carries the block, so a Publish that failed after refreshing the copy
 * unlocks nothing; and `waitingForClear`, an output reports this graphic on air on an earlier
 * frame, which keeps running (its reader included) until it is cleared or replaced.
 * - `reader`: the block still runs here; Connect offers the explicit migration first.
 * - `publish`: the design no longer has it, but the published output still runs it until Publish.
 * - `clear`: published, but an output still runs an earlier frame of the graphic until Out.
 * - `none`: nothing reads a Sheet in this graphic's code where it plays.
 */
export type OwnReaderGate = 'none' | 'reader' | 'publish' | 'clear';

export function ownReaderGate(input: { copyJs: string; resolvedJs: string; published: boolean; outputReads?: boolean; waitingForClear?: boolean }): OwnReaderGate {
  if (hasLiveData(input.resolvedJs)) return 'reader';
  if (hasLiveData(input.copyJs)) return input.published ? 'publish' : 'reader';
  if (!input.published) return 'none';
  if (input.outputReads) return 'publish';
  return input.waitingForClear ? 'clear' : 'none';
}

/**
 * Where the migration removes the block. The library record is the design every production plays,
 * so it goes there when there is one. The production's copy goes too unless the production is
 * published: there the copy is what the output runs, and Publish replaces it with the record, which
 * is what keeps Connect waiting until the output has stopped the old reader. A published graphic
 * with no library record could not carry the change to its output, so the migration is refused.
 */
export function ownReaderRemoval(input: { library: boolean; published: boolean }): { library: boolean; copy: boolean } | null {
  if (!input.library && input.published) return null;
  return { library: input.library, copy: !input.published };
}

/** Remove an existing live-data block (so "Add" is really "replace"). */
export function stripLiveData(js: string): string {
  const start = js.indexOf(OPEN);
  const end = js.indexOf(CLOSE);
  if (start === -1 || end === -1) return js;
  return (js.slice(0, start) + js.slice(end + CLOSE.length)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The default column→field map: each editable field guesses its sheet header from its title. */
function defaultMap(fields: SpxField[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    if (['textfield', 'textarea', 'number', 'dropdown', 'filelist', 'color'].includes(f.ftype)) {
      map[f.field] = f.title || f.field;
    }
  }
  return map;
}

export interface LiveDataOptions {
  csvUrl: string;
  pollSeconds: number;
  fields: SpxField[];
}

/** Generate the live-data polling block for appending to template.js. */
export function liveDataBlock({ csvUrl, pollSeconds, fields }: LiveDataOptions): string {
  const map = defaultMap(fields);
  const mapLines = Object.entries(map)
    .map(([field, header]) => `    ${JSON.stringify(field)}: ${JSON.stringify(header)},   // ← sheet column header`)
    .join('\n');

  return `${OPEN}
// Publish your sheet: File → Share → Publish to web → (sheet) → CSV, and paste the link below.
(function () {
  var CSV_URL = ${JSON.stringify(csvUrl)};
  var POLL_MS = ${Math.max(1, Math.round(pollSeconds)) * 1000};

  // Which sheet column feeds which field. The header name must match your sheet's first row.
  var MAP = {
${mapLines}
  };
  // Which data row to read (0 = the first row AFTER the header). Change for multi-row sheets.
  var ROW = 0;

  // Minimal CSV parser (handles quoted cells with commas / quotes).
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\\n' || c === '\\r') { if (c === '\\r' && text[i + 1] === '\\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function pull() {
    fetch(CSV_URL, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (text) {
      var rows = parseCsv(text);
      var headers = rows[0] || [];
      var data = rows[ROW + 1] || [];
      var out = {};
      for (var field in MAP) {
        var col = headers.indexOf(MAP[field]);
        if (col >= 0) out[field] = data[col];
      }
      if (typeof update === 'function') update(JSON.stringify(out));
    }).catch(function () { /* offline or CORS-blocked — see the note above; the graphic still runs */ });
  }

  pull();
  setInterval(pull, POLL_MS);
})();
${CLOSE}
`;
}
