// Deterministic helpers for managing brand CSS custom properties in a :root { } block.
// Brand colors and fonts live in the visible CSS as variables (e.g. --brand-primary), so
// the code stays the source of truth and templates can reference var(--brand-primary).

/** rgb()/rgba()/#hex → #rrggbb for a color-input swatch; non-colors return null. Shared by
 *  the Style panel and the wizard's design-colors section - one conversion, so a swatch
 *  means the same thing wherever a color is picked. */
export function toHex(value: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return '#' + value.slice(1).split('').map((c) => c + c).join('');
  }
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((n) => parseInt(n.trim(), 10));
  const h = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Does a :root value read as a COLOR (the generic enumeration's filter)? */
export function looksLikeColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) || /^(rgb|rgba|hsl|hsla)\(/i.test(value);
}

// ── Colour, with its alpha ───────────────────────────────────────────────────
//
// `toHex` above exists for `<input type="color">`, which has no concept of transparency. That
// is fine for reading a swatch and wrong for writing one back: `--panel-bg` is an `rgba()` in
// almost every design in the catalog, and round-tripping it through a hex swatch silently
// turned a translucent panel opaque. So an editable colour is parsed WITH its alpha and
// written back in the form it arrived in.

export interface CssColor {
  r: number;
  g: number;
  b: number;
  /** 0-1. */
  a: number;
  /** How it was written, so a patch reads like the rest of the stylesheet. */
  form: 'hex' | 'rgb';
}

/** Parse a colour value, alpha included. Anchored: a shadow list is not a colour. */
export function parseCssColor(value: string): CssColor | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex) {
    const d = hex[1];
    const pair = (i: number) => (d.length <= 4 ? parseInt(d[i] + d[i], 16) : parseInt(d.slice(i * 2, i * 2 + 2), 16));
    if (d.length !== 3 && d.length !== 4 && d.length !== 6 && d.length !== 8) return null;
    const hasA = d.length === 4 || d.length === 8;
    return { r: pair(0), g: pair(1), b: pair(2), a: hasA ? pair(3) / 255 : 1, form: 'hex' };
  }
  const fn = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (fn) {
    // Both the legacy comma syntax and the modern space syntax, since either may be hand-typed.
    const parts = fn[1].split(/[,/]/).flatMap((p) => p.trim().split(/\s+/)).filter(Boolean);
    if (parts.length < 3) return null;
    const n = (s: string) => (s.endsWith('%') ? (parseFloat(s) * 255) / 100 : parseFloat(s));
    const [r, g, b] = parts.slice(0, 3).map(n);
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    const rawA = parts[3];
    const a = rawA === undefined ? 1 : rawA.endsWith('%') ? parseFloat(rawA) / 100 : parseFloat(rawA);
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: Number.isNaN(a) ? 1 : a, form: 'rgb' };
  }
  return null;
}

/**
 * Write a colour back in its own idiom: an opaque hex stays hex, a translucent one becomes
 * `rgba()` rather than `#rrggbbaa` (the catalog is written in rgba, and generated code that
 * matches what is already there is the house style).
 */
export function formatCssColor(c: CssColor): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const a = Math.max(0, Math.min(1, c.a));
  if (a >= 1) {
    if (c.form === 'rgb') return `rgb(${clamp(c.r)}, ${clamp(c.g)}, ${clamp(c.b)})`;
    const h = (n: number) => clamp(n).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  // Three decimals is what the catalog's own alphas use (0.92, 0.85, 0.10).
  return `rgba(${clamp(c.r)}, ${clamp(c.g)}, ${clamp(c.b)}, ${+a.toFixed(3)})`;
}

/** WCAG relative luminance, on the sRGB channels alone (alpha is a compositing question). */
function relativeLuminance(c: CssColor): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/**
 * The contrast ratio between two colours, 1-21.
 *
 * ADVISORY ONLY, and the UI must present it that way. The arithmetic sees two colour values;
 * on-air readability also depends on the panel's transparency, the moving video behind it, any
 * text shadow, the type size, and what a key-and-fill output does to the composite. A number is
 * a useful sanity check for whoever is choosing the colours. A pass/fail badge would be a claim
 * this calculation cannot support.
 *
 * A translucent foreground or background is composited over `over` first (default: the
 * near-black a broadcast panel usually sits on), because comparing raw channel values of a 10%
 * white panel would report a contrast nobody ever sees.
 */
export function contrastRatio(fg: CssColor, bg: CssColor, over: CssColor = BROADCAST_BACKDROP): number {
  const flatten = (c: CssColor, under: CssColor): CssColor =>
    c.a >= 1 ? c : {
      r: c.r * c.a + under.r * (1 - c.a),
      g: c.g * c.a + under.g * (1 - c.a),
      b: c.b * c.a + under.b * (1 - c.a),
      a: 1,
      form: c.form,
    };
  const base = flatten(bg, over);
  const top = flatten(fg, base);
  const [l1, l2] = [relativeLuminance(top), relativeLuminance(base)].sort((a, b) => b - a);
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
}

/** What a translucent panel is assumed to sit on when nothing else is known. Video is not a
 *  colour, so this is a stand-in, and it is one more reason the readout stays advisory. */
export const BROADCAST_BACKDROP: CssColor = { r: 16, g: 18, b: 22, a: 1, form: 'rgb' };

/** List every custom property declared in the first :root rule (in source order). */
export function listCssVariables(css: string): { name: string; value: string }[] {
  const root = findRootBody(css);
  if (!root) return [];
  const out: { name: string; value: string }[] = [];
  const re = /--([\w-]+)\s*:\s*([^;}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(root.body))) {
    out.push({ name: m[1], value: m[2].trim() });
  }
  return out;
}

/** Does `text` read `--<name>`? `var(--x)` and `var(--x, fallback)` both count - matching only
 *  the first form would call a token that is always used WITH a fallback unread, which is the
 *  same trap `tokenVarsCss` documents in model/themeTokens.ts. */
function readsVar(text: string, name: string): boolean {
  return new RegExp(`var\\(\\s*--${escapeRe(name)}\\s*[,)]`).test(text);
}

/**
 * Does anything the graphic PAINTS read `--<name>` - directly, or through another `:root`
 * variable that follows it?
 *
 * The style contract declares its four colour roles unconditionally, so the presence of
 * `--accent` in a stylesheet says nothing about whether the design has an accent: 11 of the
 * 504 catalog designs declare one that no rule anywhere reads (measured 2026-09-02). A control
 * that offers to change it is then a control that changes nothing, which is what the owner
 * caught on the Style step - "nothing happens in the graphic. That's a bug."
 *
 * Two hops matter, so this follows the `:root` chain rather than grepping for one name: the
 * theme tokens routinely alias a role (`--label-color: var(--accent)`), and a design that
 * paints its kicker reads only the alias.
 *
 * DELIBERATELY CONSERVATIVE - it answers "is this role wired to anything", not "does a pixel
 * on screen carry it". A rule that reads the role but whose selector matches no element in this
 * particular draft (a lower third's third line, before the user has asked for one) still counts
 * as reached, because the element arrives the moment they add the field. Erring this way costs
 * an option that is merely hard to see; erring the other way would hide a control that works.
 */
export function cssPaintsWith(css: string, name: string): boolean {
  // COMMENTS FIRST, because the house style writes about the variables it did not use:
  // ls12 says "deliberately NOT var(--panel-bg)", ss07 and tk03 say the like. Left in, that
  // sentence keeps a control alive on a design that paints nothing with the role - the exact
  // false positive this function exists to remove, and one nothing would report.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = findRootBody(source);
  // Everything but the contract block: the declarations inside `:root` are the wiring, and a
  // role wired only to itself is exactly the dead case this answers.
  const painted = root ? source.slice(0, root.bodyStart) + source.slice(root.bodyEnd) : source;
  const declared = listCssVariables(source);
  const alias = new Set([name]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { name: declaredName, value } of declared) {
      if (alias.has(declaredName)) continue;
      if ([...alias].some((a) => readsVar(value, a))) {
        alias.add(declaredName);
        grew = true;
      }
    }
  }
  return [...alias].some((a) => readsVar(painted, a));
}

/** Read a CSS variable's value from the first :root rule. Null if absent. */
export function getCssVariable(css: string, name: string): string | null {
  const root = findRootBody(css);
  if (!root) return null;
  const re = new RegExp(`--${escapeRe(name)}\\s*:\\s*([^;}]*)`, 'i');
  const m = re.exec(root.body);
  return m ? m[1].trim() : null;
}

/**
 * Set `--<name>: <value>` inside a :root rule, creating the property or the whole
 * :root block if needed. Deterministic; preserves the rest of the stylesheet.
 */
export function setCssVariable(css: string, name: string, value: string): string {
  const root = findRootBody(css);
  const decl = `--${name}`;
  if (root) {
    const re = new RegExp(`(--${escapeRe(name)}\\s*:)\\s*[^;}]*`, 'i');
    let newBody: string;
    if (re.test(root.body)) {
      newBody = root.body.replace(re, `$1 ${value}`);
    } else {
      const trimmed = root.body.replace(/\s*$/, '');
      const sep = trimmed.endsWith(';') || trimmed === '' ? '' : ';';
      newBody = `${trimmed}${sep}\n  ${decl}: ${value};\n`;
    }
    return css.slice(0, root.bodyStart) + newBody + css.slice(root.bodyEnd);
  }
  // No :root block yet — prepend one.
  const block = `:root {\n  ${decl}: ${value};\n}\n\n`;
  return block + css;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Locate the body of the first `:root { ... }` rule. */
function findRootBody(css: string): { body: string; bodyStart: number; bodyEnd: number } | null {
  const re = /(^|[}\s])\s*:root\s*\{/i;
  const m = re.exec(css);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return { body: css.slice(bodyStart, i), bodyStart, bodyEnd: i };
}
