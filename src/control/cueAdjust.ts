// PLACE AND SIZE, FROM RECORD TO AIR (docs/work-specs/playout-adjustments/spec.md, phase 1).
//
// A cue's adjustment is the fold of two scopes, member by member, narrowest winning: the cue's own
// exception over its pool graphic's default (model/adjust.ts holds the record). Identity (no nudge,
// scale 1) applies after the fold, never before, or a cue that sets only `place` would mask the
// graphic's `x`. The page resolves the fold against the graphic's MEASURED box into one APPLIED
// APPEARANCE, which is what travels on the `update` message (`appearance`, beside `data`) and what
// every surface applies and restores: a `translate(dx, dy) scale(s)` about the pivot (ox, oy), on the
// frame NoaCG owns, in production px. Receivers never measure.
//
// THE WIRE'S FOUR RULES, each a test (scripts/cue-adjust.test.mjs):
//   1. an `update` without `appearance` keeps the one applied (the ± block, a data row);
//   2. Take and a full Update carry the complete effective appearance, an explicit identity when
//      nothing is left of an earlier one, and nothing at all for a graphic nobody adjusted;
//   3. applying an appearance replaces the previous one, never multiplies it;
//   4. recovery restores the last applied appearance, never newer preparation.
//
// Pure and Node-tested; type imports aside, it imports only ./adjust.ts and the floor table.

import { readAdjust, styleValue, NUDGE_MAX, STYLE_VARS, type AdjustRecord, type FontRef, type Zone9 } from '../model/adjust.ts';
import { typeFloorFor } from '../model/designRules.ts';

/** A rectangle in a graphic document's px, which is production px: a frame sits at the stage
 *  origin at its own resolution, unscaled. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the graphic's document answered about itself once settled (preview/settleGraphic.ts
 *  `reportGraphicBox`): the information box (its text and pictures), the painted extent (everything
 *  it paints, decoration included), both clipped, and the smallest text it draws. A document whose
 *  motion never parks reports a painted extent and no information box. */
export interface Measurement {
  info: Rect | null;
  paint: Rect | null;
  /** The smallest rendered text, in px, or null when it draws none. */
  minText: number | null;
}

/** The frame transform that travels. */
export interface AppearanceFrame {
  dx: number;
  dy: number;
  s: number;
  ox: number;
  oy: number;
}

/** A face the document must be able to resolve, by identity: the bytes come from the surface's own
 *  asset road (control/cueStyle.ts `facesCss`), never over the wire. */
export interface FontDeclaration {
  family: string;
  /** `fonts/<file>` for a bundled face, the asset path a pool graphic ships an imported one at. */
  src: string;
  /** The supported range as declared (model/fonts.ts: a static or imported face declares 100-900). */
  weight: [number, number];
  style?: 'normal' | 'italic';
  unicodeRange?: string;
}

/** What travels on `update.appearance` and what is restored: the frame transform (phase 1) and the
 *  style, `:root` variables by name without dashes plus the faces they name (phase 2). Every member
 *  absent is the identity. A receiver that predates a member ignores it. */
export interface AppliedAppearance {
  v: 1;
  frame?: AppearanceFrame;
  vars?: Record<string, string>;
  fonts?: FontDeclaration[];
}

export const IDENTITY: AppliedAppearance = { v: 1 };

export interface Size {
  width: number;
  height: number;
}

/** The fold of the two scopes: each member and where it came from. */
export interface EffectiveAdjust {
  place?: Zone9;
  x?: number;
  y?: number;
  scale?: number;
  anchor?: Zone9;
  /** The style variables, folded key by key; an empty value is "as designed" at the scope that won. */
  vars?: Record<string, string>;
  /** The heading face, or 'designed'. */
  font?: FontRef | 'designed';
  keepStyle?: true;
  /** Which members the cue itself sets (any `vars` key counts as `vars`). */
  own: (keyof Omit<AdjustRecord, 'v'>)[];
  /** A scope holds a record written by a later build: editing it is refused. */
  readOnly: boolean;
  /** Either scope holds anything at all. */
  any: boolean;
}

const MEMBERS = ['place', 'x', 'y', 'scale', 'anchor', 'font', 'keepStyle'] as const;

/** Fold the cue's exception over the graphic's default, member by member. A later version's record
 *  applies nothing (rollback: an unknown record is ignored on read). */
export function effectiveAdjust(graphicRaw: unknown, cueRaw: unknown): EffectiveAdjust {
  const g = readAdjust(graphicRaw);
  const c = readAdjust(cueRaw);
  const out: EffectiveAdjust = { own: [], readOnly: g.status === 'read-only' || c.status === 'read-only', any: false };
  for (const key of MEMBERS) {
    const fromCue = c.status === 'ok' ? c.record[key] : undefined;
    const fromGraphic = g.status === 'ok' ? g.record[key] : undefined;
    const value = fromCue ?? fromGraphic;
    if (value === undefined) continue;
    (out as unknown as Record<string, unknown>)[key] = value;
    if (fromCue !== undefined) out.own.push(key);
  }
  // Style variables fold KEY BY KEY: a cue that sets its accent alone still takes the graphic's face.
  const gv = g.status === 'ok' ? g.record.vars : undefined;
  const cv = c.status === 'ok' ? c.record.vars : undefined;
  if (gv || cv) {
    out.vars = { ...gv, ...cv };
    if (cv) out.own.push('vars');
  }
  out.any = graphicRaw !== undefined || cueRaw !== undefined;
  return out;
}

/** The safe area at 1080p (src/templates/shared/base.ts `zoneDecls`), scaled to the stage. */
export function safeInsets(stage: Size): { left: number; right: number; top: number; bottom: number } {
  const sx = stage.width / 1920;
  const sy = stage.height / 1080;
  return { left: 120 * sx, right: 120 * sx, top: 86 * sy, bottom: 119 * sy };
}

const col = (z: Zone9) => z[1] as 'l' | 'c' | 'r';
const row = (z: Zone9) => z[0] as 't' | 'm' | 'b';

/** The zone a box's centre falls in, by thirds of the frame. */
export function zoneOf(box: Rect, frame: Size): Zone9 {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const c = cx < frame.width / 3 ? 'l' : cx > (2 * frame.width) / 3 ? 'r' : 'c';
  const r = cy < frame.height / 3 ? 't' : cy > (2 * frame.height) / 3 ? 'b' : 'm';
  return (r + c) as Zone9;
}

/** A box's point for a zone: its corner, edge midpoint or centre. */
export function pointOf(box: Rect, zone: Zone9): { x: number; y: number } {
  const x = col(zone) === 'l' ? box.x : col(zone) === 'r' ? box.x + box.w : box.x + box.w / 2;
  const y = row(zone) === 't' ? box.y : row(zone) === 'b' ? box.y + box.h : box.y + box.h / 2;
  return { x, y };
}

/** Where a preset puts that point of the box: on the stage's safe area, or its centre line. */
export function presetPoint(place: Zone9, stage: Size): { x: number; y: number } {
  const inset = safeInsets(stage);
  const x = col(place) === 'l' ? inset.left : col(place) === 'r' ? stage.width - inset.right : stage.width / 2;
  const y = row(place) === 't' ? inset.top : row(place) === 'b' ? stage.height - inset.bottom : stage.height / 2;
  return { x, y };
}

/** The translate a preset needs for this box (before nudges). */
export function presetOffset(place: Zone9, box: Rect, stage: Size): { dx: number; dy: number } {
  const from = pointOf(box, place);
  const to = presetPoint(place, stage);
  return { dx: to.x - from.x, dy: to.y - from.y };
}

/** A painted extent that touches both horizontal edges of its frame within 1 px: a band. */
export function spansFrame(m: Measurement | null, frame: Size): boolean {
  const p = m?.paint;
  return !!p && p.x <= 1 && p.x + p.w >= frame.width - 1;
}

/** Why a part of the block cannot act, or null when everything can. */
export type GeometryLimit = 'none' | 'spans' | 'no-presets' | null;

/** What the measurement allows: presets need an information box; a band moves vertically only. */
export function geometryLimit(m: Measurement | null, frame: Size): GeometryLimit {
  if (!m || (!m.info && !m.paint)) return 'none';
  if (spansFrame(m, frame)) return 'spans';
  if (!m.info) return 'no-presets';
  return null;
}

/** The pivot's zone for the fold: the preset's, else the anchor, else the box's own zone. */
export function pivotZone(eff: Pick<EffectiveAdjust, 'place' | 'anchor'>, box: Rect | null, frame: Size): Zone9 {
  return eff.place ?? eff.anchor ?? (box ? zoneOf(box, frame) : 'mc');
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve the fold against the measurement into the frame transform, or null for the identity.
 * `frame` is the graphic's own resolution, `stage` the production's. With no measurement the preset
 * waits and the nudge and size act about the anchor's point of the whole frame; a band ignores
 * the preset, the horizontal nudge and the size; a document with no information box ignores the
 * preset.
 */
export function resolveFrame(eff: EffectiveAdjust, m: Measurement | null, frame: Size, stage: Size): AppearanceFrame | null {
  const limit = geometryLimit(m, frame);
  let s = eff.scale ?? 1;
  let nx = eff.x ?? 0;
  const ny = eff.y ?? 0;
  let box: Rect;
  let zone: Zone9;
  let place: Zone9 | undefined = eff.place;
  if (limit === 'none') {
    box = { x: 0, y: 0, w: frame.width, h: frame.height };
    zone = eff.anchor ?? 'mc';
    place = undefined;
  } else if (limit === 'spans') {
    const p = m!.paint!;
    box = p;
    const anchored = eff.anchor ?? zoneOf(m!.info ?? p, frame);
    zone = (row(anchored) + 'c') as Zone9;
    s = 1;
    nx = 0;
    place = undefined;
  } else {
    box = (m!.info ?? m!.paint)!;
    if (limit === 'no-presets') place = undefined;
    zone = pivotZone({ place, anchor: eff.anchor }, box, frame);
  }
  const pivot = pointOf(box, zone);
  const preset = place ? presetOffset(place, box, stage) : { dx: 0, dy: 0 };
  const clamp = (n: number, max: number) => Math.min(max, Math.max(-max, n));
  const dx = r2(clamp(preset.dx + nx, Math.min(NUDGE_MAX, stage.width - 8)));
  const dy = r2(clamp(preset.dy + ny, Math.min(NUDGE_MAX, stage.height - 8)));
  if (dx === 0 && dy === 0 && s === 1) return null;
  return { dx, dy, s, ox: r2(pivot.x), oy: r2(pivot.y) };
}

/** The style half of an appearance. */
export type AppearanceStyle = Pick<AppliedAppearance, 'vars' | 'fonts'>;

/** The applied appearance of a resolved frame and style. */
export function appearanceOf(frame: AppearanceFrame | null, style?: AppearanceStyle | null): AppliedAppearance {
  const vars = style?.vars && Object.keys(style.vars).length > 0 ? style.vars : undefined;
  const fonts = style?.fonts && style.fonts.length > 0 ? style.fonts : undefined;
  if (!frame && !vars && !fonts) return IDENTITY;
  return { v: 1, ...(frame ? { frame } : {}), ...(vars ? { vars } : {}), ...(fonts ? { fonts } : {}) };
}

/** The names an appearance may set on `:root`: the record's, plus the two the face derives. */
const APPLIED_VARS = new Set([...STYLE_VARS, 'font-heading', 'font-numeric']);
const FONT_SRC = /^fonts\/[\w./-]+\.(?:woff2|woff|ttf|otf)$/i;

/** An appearance's variables, checked: undefined for none, null for any this build cannot apply. */
function readVarsOf(raw: unknown): Record<string, string> | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!APPLIED_VARS.has(k) || !styleValue(v) || v.trim() === '') return null;
    out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** An appearance's faces, checked the same way. */
function readFontsOf(raw: unknown): FontDeclaration[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: FontDeclaration[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const d = f as Record<string, unknown>;
    const w = d.weight;
    if (typeof d.family !== 'string' || !/^[^"'\\;{}<>]{1,80}$/.test(d.family)) return null;
    if (typeof d.src !== 'string' || !FONT_SRC.test(d.src) || d.src.includes('..')) return null;
    if (!Array.isArray(w) || w.length !== 2 || !w.every((n) => typeof n === 'number' && n >= 1 && n <= 1000)) return null;
    if (d.unicodeRange !== undefined && (typeof d.unicodeRange !== 'string' || !/^[U+0-9A-Fa-f?,\s-]{1,400}$/.test(d.unicodeRange))) return null;
    if (d.style !== undefined && d.style !== 'normal' && d.style !== 'italic') return null;
    out.push({
      family: d.family,
      src: d.src,
      weight: [w[0] as number, w[1] as number],
      ...(d.style ? { style: d.style as 'normal' | 'italic' } : {}),
      ...(d.unicodeRange ? { unicodeRange: d.unicodeRange as string } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** A received appearance, checked: null for anything this build cannot apply (a later `v`, a
 *  malformed frame), which a receiver then ignores (rule 1 holds what was applied). */
export function readAppearance(raw: unknown): AppliedAppearance | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as { v?: unknown; frame?: unknown; vars?: unknown; fonts?: unknown };
  if (a.v !== 1) return null;
  const vars = readVarsOf(a.vars);
  const fonts = readFontsOf(a.fonts);
  if (vars === null || fonts === null) return null;
  const style = { vars, fonts };
  if (a.frame === undefined) return appearanceOf(null, style);
  const f = a.frame as Record<string, unknown>;
  const ok = ['dx', 'dy', 's', 'ox', 'oy'].every((k) => typeof f?.[k] === 'number' && Number.isFinite(f[k] as number));
  if (!ok || (f.s as number) <= 0) return null;
  return appearanceOf({ dx: f.dx as number, dy: f.dy as number, s: f.s as number, ox: f.ox as number, oy: f.oy as number }, style);
}

export function isIdentity(a: AppliedAppearance | null | undefined): boolean {
  return !a || (!a.frame && !a.vars && !a.fonts);
}

/** The style an appearance applies, as one comparable string ('' for none). */
export function styleKey(a: AppliedAppearance | null | undefined): string {
  if (!a?.vars && !a?.fonts) return '';
  const vars = Object.entries(a.vars ?? {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify([vars, (a.fonts ?? []).map((f) => [f.family, f.src, f.weight, f.style ?? '', f.unicodeRange ?? ''])]);
}

/** Two appearances apply the same transform (to a hundredth of a px) and the same style. */
export function appearanceEquals(a: AppliedAppearance | null | undefined, b: AppliedAppearance | null | undefined): boolean {
  if (styleKey(a) !== styleKey(b)) return false;
  const fa = a?.frame;
  const fb = b?.frame;
  if (!fa || !fb) return !fa && !fb;
  return (['dx', 'dy', 's', 'ox', 'oy'] as const).every((k) => r2(fa[k]) === r2(fb[k]));
}

/**
 * RULE 2: what a Take or a full Update carries. The resolved appearance when it moves anything; an
 * explicit identity when it does not but something might still hold an older one (a record at
 * either scope, or a non-identity appearance this page believes is applied); and nothing at all
 * for a graphic nobody adjusted, so such a production's commands are what they always were.
 */
export function appearanceToSend(
  resolved: AppearanceFrame | null,
  eff: Pick<EffectiveAdjust, 'any'>,
  applied: AppliedAppearance | null | undefined,
  adjustedElsewhere = false,
  style: AppearanceStyle | null = null,
): AppliedAppearance | undefined {
  if (resolved || style) return appearanceOf(resolved, style);
  if (eff.any || adjustedElsewhere || !isIdentity(applied)) return IDENTITY;
  return undefined;
}

/** What each graphic holds applied, by graphic name. */
export type AppliedLooks = Readonly<Record<string, AppliedAppearance>>;

/** RULES 1 AND 3 over a command: an `update` carrying an appearance replaces the one held (the
 *  identity clears it); anything else, a stop included, keeps it, as the renderer's frame keeps
 *  its transform while the graphic is off air. */
export function lookAfter(looks: AppliedLooks, graphic: string, msg: { t: string; appearance?: unknown }): AppliedLooks {
  if (msg.t !== 'update' || msg.appearance === undefined) return looks;
  const read = readAppearance(msg.appearance);
  if (!read) return looks;
  if (isIdentity(read)) {
    if (!(graphic in looks)) return looks;
    const next = { ...looks };
    delete next[graphic];
    return next;
  }
  if (appearanceEquals(looks[graphic], read)) return looks;
  return { ...looks, [graphic]: read };
}

/** The place and size a graphic's report says it holds applied (the renderer keeps it beside the
 *  machine state, src/output/main.ts), or null for none. */
export function reportedLook(report: { state?: unknown } | null | undefined): AppliedAppearance | null {
  const look = readAppearance((report?.state as { appearance?: unknown } | null | undefined)?.appearance);
  return look && !isIdentity(look) ? look : null;
}

/** Where a box lands once the frame transform applies (production px). */
export function composeRect(box: Rect, frame: AppearanceFrame | null | undefined): Rect {
  if (!frame) return box;
  const map = (x: number, y: number) => ({ x: frame.ox + frame.dx + frame.s * (x - frame.ox), y: frame.oy + frame.dy + frame.s * (y - frame.oy) });
  const a = map(box.x, box.y);
  return { x: a.x, y: a.y, w: box.w * frame.s, h: box.h * frame.s };
}

/** The CSS a frame takes for an appearance: '' for the identity. */
export function frameCss(a: AppliedAppearance | null | undefined): { transform: string; origin: string } {
  const f = a?.frame;
  if (!f) return { transform: '', origin: '' };
  return { transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})`, origin: `${f.ox}px ${f.oy}px` };
}

// ── The readability estimate (AC-3) ──────────────────────────────────────────────────────────────

/** Below this the line is red and names the remedy, whatever the category. */
export const RED_FLOOR_PX = 16;

export interface FloorEstimate {
  /** The smallest text after the scale, in px. */
  px: number;
  tone: 'ok' | 'amber' | 'red';
  floor: number;
}

/** The measured smallest text times the scale, against the category's floor (model/designRules.ts):
 *  amber under it, red under 16 px. Null when the document draws no text. */
export function floorEstimate(minText: number | null | undefined, scale: number, category: string | null | undefined): FloorEstimate | null {
  if (!minText || minText <= 0) return null;
  const px = Math.round(minText * scale * 10) / 10;
  const floor = typeFloorFor(category);
  return { px, floor, tone: px < RED_FLOOR_PX ? 'red' : px < floor ? 'amber' : 'ok' };
}

// ── Measurements: identified and qualified ───────────────────────────────────────────────────────

/** WHAT A MEASUREMENT WAS TAKEN FOR: the graphic's document (its copy's edit time), the cue, the
 *  values the document settled, the stage and the style it was drawn in (`styleKey`, '' for none:
 *  another face reflows the box). A reply for any other identity is not this cue's geometry:
 *  typing a longer name, a new copy on Publish, another stage or another face each make a new one. */
export function measureId(graphicId: string, savedAt: string, cueId: string, values: Readonly<Record<string, string>>, stage: Size, style = ''): string {
  const sorted = Object.keys(values).sort().map((k) => [k, values[k]]);
  return JSON.stringify([graphicId, savedAt, cueId, sorted, stage.width, stage.height, ...(style ? [style] : [])]);
}

const near = (a: Rect | null, b: Rect | null) =>
  !!a && !!b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;

/** Two answers 250 ms apart, qualified: each rectangle only where both agree within 1 px. A pose
 *  that never parks keeps neither box from its moving text. */
export function qualify(a: Measurement, b: Measurement): Measurement {
  return {
    info: near(a.info, b.info) ? b.info : null,
    paint: near(a.paint, b.paint) ? b.paint : null,
    minText: a.minText !== null && b.minText !== null && Math.abs(a.minText - b.minText) <= 1 ? b.minText : null,
  };
}

/** The gap between two answers that must agree. */
export const QUALIFY_GAP_MS = 250;
/** How many comparisons a measurement gets before the cue has none. */
export const QUALIFY_TRIES = 3;

/** ONE RULE FOR BOTH MEASURERS (PREVIEW's and the hidden one): an answer after `first` either
 *  qualifies, asks for one more 250 ms later, or gives up once `tries` comparisons have failed. */
export function qualifyStep(first: Measurement | null, m: Measurement, tries: number): { done: Measurement } | { again: Measurement; tries: number } | { giveUp: true } {
  if (!first) return { again: m, tries };
  const q = qualify(first, m);
  if (q.info || q.paint) return { done: q };
  return tries + 1 >= QUALIFY_TRIES ? { giveUp: true } : { again: m, tries: tries + 1 };
}

/** A measurement as the document's report carries it (preview/settleGraphic.ts), checked. */
export function readMeasurement(raw: unknown): Measurement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rect = (v: unknown): Rect | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    return ['x', 'y', 'w', 'h'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k] as number)) && (o.w as number) > 0 && (o.h as number) > 0
      ? { x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number }
      : null;
  };
  if (!('info' in r) && !('paint' in r)) return null;
  return { info: rect(r.info), paint: rect(r.paint), minText: typeof r.minText === 'number' && r.minText > 0 ? r.minText : null };
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────────

const ZONE_WORDS: Record<Zone9, string> = {
  tl: 'top-left',
  tc: 'top',
  tr: 'top-right',
  ml: 'left',
  mc: 'centre',
  mr: 'right',
  bl: 'bottom-left',
  bc: 'bottom',
  br: 'bottom-right',
};

export const zoneWords = (z: Zone9) => ZONE_WORDS[z];

/** The state of a fold in a few words: "bottom-right, 95 %, x −12", or '' when it is as designed. */
export function adjustWords(eff: Pick<EffectiveAdjust, 'place' | 'x' | 'y' | 'scale'>): string {
  const parts: string[] = [];
  if (eff.place) parts.push(zoneWords(eff.place));
  if (eff.scale !== undefined && eff.scale !== 1) parts.push(`${Math.round(eff.scale * 100)} %`);
  const signed = (n: number) => (n < 0 ? `−${-n}` : String(n));
  if (eff.x) parts.push(`x ${signed(eff.x)}`);
  if (eff.y) parts.push(`y ${signed(eff.y)}`);
  return parts.join(', ');
}

/** A first write at a scope with no anchor yet takes the box's zone as its anchor, once, so a longer
 *  name typed later never moves the pivot (the anchor is the graphic's authored zone). */
export function withAnchor<P extends { anchor?: Zone9 | null }>(eff: Pick<EffectiveAdjust, 'anchor'>, m: Measurement | null, frame: Size, patch: P): P {
  if (eff.anchor || patch.anchor !== undefined) return patch;
  const box = m?.info ?? m?.paint;
  return box ? { ...patch, anchor: zoneOf(box, frame) } : patch;
}

/** RULE 2 ON THE HOSTED PAGE, which applies and never edits: the cue's published appearance; an
 *  explicit identity when it has none but its graphic holds one or another of its cues has one;
 *  else nothing. */
export function publishedAppearance(
  cue: { graphic: string; appearance?: AppliedAppearance },
  cues: readonly { graphic: string; appearance?: AppliedAppearance }[],
  applied: AppliedAppearance | null | undefined,
): AppliedAppearance | undefined {
  const own = readAppearance(cue.appearance);
  if (own) return own;
  return !isIdentity(applied) || cues.some((c) => c.graphic === cue.graphic && c.appearance) ? IDENTITY : undefined;
}
