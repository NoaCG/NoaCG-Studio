// THE JOIN PAGE'S COLOURS, made readable (interaction spec "Joining", Contrast; AC-6).
//
// A production's look was made for graphics over pictures, not for a phone page: its text colour
// can sit close to its panel, and its accent can vanish against the page. The page keeps the
// look's colours wherever they meet WCAG AA and swaps in black or white, whichever passes, where
// they do not:
//   * body text 4.5:1 against what it sits on (the page, or a card over the page);
//   * button edges and focus lines 3:1;
//   * text on the accent (the Send button) 4.5:1.
// Muted text (labels, notes) is a blend toward the background that still passes, never opacity,
// so a colour that only just passes cannot fall below the line by being dimmed.
// Every colour is made in whole RGB channels, the values `css()` writes and the browser renders,
// so each check judges the colour as it will be seen: a blend checked before rounding could pass
// at 3.001:1 and render at 2.99:1.
//
// Pure and DOM-free: the join surface turns the result into CSS variables.

export type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

/** The page behind everything (join.html's own background). */
const JOIN_PAGE_BACKGROUND: Rgb = [11, 11, 13];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

const AA_TEXT = 4.5;
const AA_EDGE = 3;

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`; anything else is null. */
function parseColour(value: unknown): Rgba | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(v);
  if (!fn) return null;
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channel = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const rgb = parts.slice(0, 3).map(channel);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if ([...rgb, alpha].some((n) => !Number.isFinite(n))) return null;
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));
  return [clamp(rgb[0], 255), clamp(rgb[1], 255), clamp(rgb[2], 255), clamp(alpha, 1)];
}

/** A colour with alpha, laid over an opaque one, in whole channels (as rendered). */
function over(top: Rgba, under: Rgb): Rgb {
  const a = top[3];
  return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))) as Rgb;
}

/** `t` of `a` and the rest `b`, in whole channels (as rendered). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] * t + b[i] * (1 - t))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The WCAG contrast ratio of two opaque colours. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `wanted` when it reaches `ratio` on every background, else black or white, whichever reads
 *  better on the worst of them. */
function readable(wanted: Rgb | null, backgrounds: Rgb[], ratio: number): Rgb {
  const worst = (c: Rgb) => Math.min(...backgrounds.map((bg) => contrast(c, bg)));
  if (wanted && worst(wanted) >= ratio) return wanted;
  return worst(WHITE) >= worst(BLACK) ? WHITE : BLACK;
}

/** As close to the background as `t` allows while still reaching `ratio`: muted, never unreadable. */
function muted(colour: Rgb, background: Rgb, t: number, ratio: number): Rgb {
  for (let k = t; k < 1; k += 0.05) {
    const candidate = mix(colour, background, k);
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return colour;
}

export const css = ([r, g, b]: Rgb): string => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** The defaults: the studio's control-room colours, used for any slot the look leaves out. */
const DEFAULTS = { accent: '#ffb84d', text: '#f4f4f5', panel: '#141417' };

export interface JoinColours {
  /** Text on the page. */
  text: Rgb;
  /** Labels and notes on the page. */
  textMuted: Rgb;
  /** The card fill, as laid over the page. */
  panel: Rgb;
  /** Text on a card. */
  cardText: Rgb;
  cardMuted: Rgb;
  /** Field and option borders on a card. */
  cardEdge: Rgb;
  accent: Rgb;
  /** Text on an accent fill (Send, a picked option's key). */
  onAccent: Rgb;
  /** The accent where it is a line on a card (a picked option, focus): the accent if it shows. */
  accentLine: Rgb;
  /** The accent where it is text on the page (a refusal, a near-full count). */
  accentText: Rgb;
}

/** The page's colours for a look's three, each meeting AA where it is used. */
export function joinColours(look: { accent?: unknown; text?: unknown; panel?: unknown } | null | undefined): JoinColours {
  const page = JOIN_PAGE_BACKGROUND;
  const pick = (value: unknown, fallback: string) => parseColour(value) ?? (parseColour(fallback) as Rgba);
  const panel = over(pick(look?.panel, DEFAULTS.panel), page);
  const wantedText = over(pick(look?.text, DEFAULTS.text), page);
  const accent = over(pick(look?.accent, DEFAULTS.accent), panel);

  const text = readable(wantedText, [page], AA_TEXT);
  const cardText = readable(wantedText, [panel], AA_TEXT);
  return {
    text,
    textMuted: muted(text, page, 0.6, AA_TEXT),
    panel,
    cardText,
    cardMuted: muted(cardText, panel, 0.6, AA_TEXT),
    cardEdge: muted(cardText, panel, 0.4, AA_EDGE),
    accent,
    onAccent: readable(null, [accent], AA_TEXT),
    accentLine: readable(accent, [panel], AA_EDGE),
    accentText: readable(accent, [page], AA_TEXT),
  };
}
