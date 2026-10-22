// THE RETIRED GRAPHIC-LEVEL SHEET BLOCK's opening line, and the test for it (control/liveData.ts
// generates and strips the block). Here, under the model, so the binding write path in shows.ts can
// refuse a field whose graphic still reads a Sheet in its own code (data-sources C6) without the
// model reaching into control/.

export const LIVE_DATA_OPEN = '/* == LIVE DATA (published CSV → update) — edit or delete this whole block == */';

/** True when the template JS carries a live-data block. */
export function hasLiveData(js: string): boolean {
  return js.includes(LIVE_DATA_OPEN);
}
