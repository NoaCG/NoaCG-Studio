/**
 * How a template declares its animation data block, written ONCE. The emitter writes it, and
 * every reader that decides whether a template HAS a block tests for it - the validator's
 * animation rules and the runtime bench's editability check among them. Separate literals let an
 * emitter change (`const NOACG_ANIM`) disarm those checks silently: they would find no block and
 * report nothing wrong. Saved graphics carry this exact text, so changing the constant itself
 * needs a migration that also reads the old spelling.
 */
export const ANIM_DECLARATION = 'var NOACG_ANIM';

/** Locate the strict JSON animation literal without interpreting or executing graphic code. */
export function locateAnimData(js: string): { start: number; end: number } | null {
  const declaration = `${ANIM_DECLARATION} = `;
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
