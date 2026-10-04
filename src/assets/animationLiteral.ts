/** Locate the strict JSON animation literal without interpreting or executing graphic code. */
export function locateAnimData(js: string): { start: number; end: number } | null {
  const declaration = 'var NOACG_ANIM = ';
  const at = js.indexOf(declaration);
  if (at < 0) return null;
  const start = js.indexOf('{', at + declaration.length);
  if (start < 0) return null;
  let depth = 0, quoted = false;
  for (let i = start; i < js.length; i++) {
    const c = js[i];
    if (quoted) { if (c === '\\') i++; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { start, end: i + 1 };
  }
  return null;
}
