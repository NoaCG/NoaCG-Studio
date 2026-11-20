/** Every match of a global RegExp in `text`, the same matches `[...text.matchAll(pattern)]` gives.
 *
 * `String.prototype.matchAll` arrived in Chrome 73, and CasparCG 2.3's HTML producer runs
 * Chromium 71: code an output loads calls this instead (#2603). Like `matchAll` it refuses a
 * pattern without the `g` flag, works on a copy so the caller's `lastIndex` is untouched, and
 * steps past an empty match by one code point under the `u` flag. */
export function matchesOf(text: string, pattern: RegExp): RegExpExecArray[] {
  if (!pattern.global) throw new TypeError('matchesOf needs a global RegExp');
  const re = new RegExp(pattern.source, pattern.flags);
  re.lastIndex = pattern.lastIndex;
  const out: RegExpExecArray[] = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    out.push(m);
    if (m[0] === '') re.lastIndex = nextIndex(text, re.lastIndex, re.unicode);
  }
  return out;
}

function nextIndex(text: string, at: number, unicode: boolean): number {
  if (!unicode || at + 1 >= text.length) return at + 1;
  const first = text.charCodeAt(at);
  if (first < 0xd800 || first > 0xdbff) return at + 1;
  const second = text.charCodeAt(at + 1);
  return second >= 0xdc00 && second <= 0xdfff ? at + 2 : at + 1;
}
