// THE RETIRED GRAPHIC-LEVEL SHEET BLOCK's opening line, and the test for it (control/liveData.ts
// generates and strips the block). Here, under the model, so the binding write path in shows.ts can
// refuse a field whose graphic still reads a Sheet in its own code (data-sources C6) without the
// model reaching into control/.

export const LIVE_DATA_OPEN = '/* == LIVE DATA (published CSV → update) — edit or delete this whole block == */';

/** True when the template JS carries a live-data block. */
export function hasLiveData(js: string): boolean {
  return js.includes(LIVE_DATA_OPEN);
}

/** The block's closing line. */
export const LIVE_DATA_CLOSE = '/* == END LIVE DATA == */';

/** Remove an existing live-data block (so "Add" is really "replace"). Here so the model's copy
 *  settle can recognise an own-reader removal (live-publishing G1 section 3). */
export function stripLiveData(js: string): string {
  const start = js.indexOf(LIVE_DATA_OPEN);
  const end = js.indexOf(LIVE_DATA_CLOSE);
  if (start === -1 || end === -1) return js;
  return (js.slice(0, start) + js.slice(end + LIVE_DATA_CLOSE.length)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
