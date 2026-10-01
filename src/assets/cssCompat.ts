// CSS AN OLDER PLAYOUT ENGINE CANNOT PARSE, REWRITTEN INTO CSS IT CAN.
//
// CasparCG 2.3.x renders on Chromium 71. The `inset` shorthand arrived in Chromium 87, and an
// engine drops a property it does not know while it parses the stylesheet, so nothing at run time
// can put it back (unlike flex `gap`, which src/assets/flexGapShim.js restores as margins). On
// 2.3 a stage written `position: absolute; inset: 0` therefore has no size at all: a full-frame
// graphic plays and shows nothing, and a picture shows at its own pixel size in the top-left
// corner. Seen on a real CasparCG 2.3.2 on 2026-10-01 with a production's picture, which filled the
// frame on CasparCG 2.5 and in the studio's monitors.
//
// So the text is rewritten before any engine reads it, into the four longhands every engine reads
// the same way: `inset: 0` becomes `top: 0; right: 0; bottom: 0; left: 0`. It runs wherever a
// graphic is composed for air (composeDocument: the output page and the previews that must match
// it) and in the exports a CasparCG loads. Plain string work, no imports, so Node tests run it.

/** The values of a shorthand, split on whitespace outside parentheses (`calc(100% - 4px)` is one). */
function splitValues(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (current) out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

/** An `inset` declaration (property name standing alone: not `--inset`, `inset-inline`, or the
 *  `inset` keyword inside a `box-shadow` value) with its value and any `!important`. */
const INSET = /(^|[{;\s])inset\s*:\s*([^;{}]*?)(\s*)(?=;|}|$)/gi;
const IMPORTANT = /\s*!\s*important$/i;

/** Every `inset` declaration in a stylesheet or a style attribute, as top, right, bottom, left. */
export function expandInset(css: string): string {
  if (!/inset/i.test(css)) return css;
  return css.replace(INSET, (whole: string, before: string, declared: string, after: string) => {
    const v = splitValues(declared.replace(IMPORTANT, ''));
    if (v.length < 1 || v.length > 4) return whole;
    const [top, right = top, bottom = top, left = right] = v;
    const bang = IMPORTANT.test(declared) ? ' !important' : '';
    return `${before}top: ${top}${bang}; right: ${right}${bang}; bottom: ${bottom}${bang}; left: ${left}${bang}${after}`;
  });
}

/** The same rewrite inside a document's inline `style="…"` attributes. */
export function expandInsetInMarkup(html: string): string {
  if (!/inset/i.test(html)) return html;
  return html.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_m, attr: string, quote: string, value: string) => `${attr}${quote}${expandInset(value)}${quote}`);
}
