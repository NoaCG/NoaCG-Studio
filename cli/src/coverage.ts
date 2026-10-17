// The coverage matrix: every frame a reviewer needs before a graphic is handed in, from the
// package's own contract (its fields, events and steps) and a brief's stress values
// (docs/work-specs/noacg-harness/spec.md section 3.2). `noacg coverage` renders it; the plan
// below is pure, so what the matrix holds is tested without a browser (cli/test/coverage.test.mjs).
//
//   values   the sample values; every text at the brief's long value or 1.7x its sample; every
//            field but the first text empty; on a two-sided board the long values on one side
//            at a time
//   grounds  the video plate and a light plate (and a busy plate when the brief's background is
//            `busy:`), so dark and bright backgrounds are both seen
//   states   off; the Take as a strip (0, 120, 300, 600 ms, settled, and 10 s later for a clock);
//            every declared event from the settled Take, as the same strip; every extra step
//            through Next; an update of a text value; Out
//   crops    every field element of the long-value frame at native pixels, because a full-HD
//            frame is read downscaled
//
// One render is one operator sequence in a page of its own (screenshot.ts `shootSequence`), and a
// strip is one render shot at several times, so the matrix costs a render per row, not per frame.

import type { ControlButton, SpxTemplate } from './bridgeClient.js';
import { safe, type FrameOp } from './screenshot.js';

/** The strip's times after the op that starts it: the entrance or transition, then settled. */
export const STRIP_MS = [0, 120, 300, 600, 1500] as const;
/** The frame after time has passed, for a graphic with a clock (and harmless for one without). */
export const LATER_MS = 10_000;
/** How much longer than its sample a text is in the long-value frames, when the brief names none. */
export const LONG_FACTOR = 1.7;
/** The shortest long label of a `Label | value` line (a poll option, a standings row). */
export const LONG_LABEL_MIN = 32;
/** Next is walked at most this far: a 40-step quiz says nothing new at step 7. */
export const MAX_NEXT_STEPS = 5;

export type Ground = 'video' | 'light' | 'busy';

export interface CoverageRender {
  /** The file stem: `sample-video`, `take`, `event-goalhome`, `next-2`, `update`, `out`. */
  name: string;
  /** The value set the Take airs. */
  values: string;
  ground: Ground;
  /** What the render shows, in words a reviewer reads. */
  state: string;
  /** The ops after the Take. */
  ops: FrameOp[];
  /** When to shoot, after the last op. */
  offsets: number[];
  /** Field ids to crop at native pixels from the last frame. */
  crops?: string[];
}

export interface CoveragePlan {
  /** The data each value set airs, by name. */
  valueSets: Record<string, Record<string, string>>;
  grounds: Ground[];
  renders: CoverageRender[];
  /** What the plan had to decide that a reader should know (an unmapped stress key, a picture). */
  notes: string[];
}

export interface CoverageInput {
  fields: SpxTemplate['fields'];
  /** Every data field at its default (the bridge's `defaultData`). */
  defaults: Record<string, string>;
  buttons: ControlButton[];
  /** `inspect`'s step count: 1 for none, -1 for dynamic. */
  stepCount: number;
  /** A brief's stress values: field ids, or `f0`, `f1`... in field order; `logo`, `background`. */
  stress?: Record<string, string>;
}

const TEXT = new Set(['textfield', 'textarea']);
const IMAGE = 'filelist';

/** A test picture for a brief's `bright:` or `dark:` logo: a crest on a transparent ground. */
export function fixtureLogo(polarity: 'bright' | 'dark'): string {
  const [fill, line] = polarity === 'bright' ? ['#ffffff', '#e4e4e4'] : ['#0b1f3a', '#141414'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><path d="M200 20 L360 80 V200 C360 300 290 360 200 385 C110 360 40 300 40 200 V80 Z" fill="${fill}" stroke="${line}" stroke-width="14"/><circle cx="200" cy="190" r="70" fill="none" stroke="${line}" stroke-width="14"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** `value` grown to `factor` times its length, and to at least `min` characters, by repeating its
 *  words, ending on a whole word. */
export function longer(value: string, factor = LONG_FACTOR, min = 0): string {
  if (value.includes('\n')) return value.split('\n').map((line) => longer(line, factor)).join('\n');
  // A `Label | value` line grows its label, to at least a label an operator might really type: a
  // runtime reads the cells after the first as numbers or codes, a long number column shows no
  // long label, and a one-word sample (`Yes`) grown 1.7 times still fits any row (#1246).
  const cell = value.indexOf('|');
  if (cell > 0 && value.slice(0, cell).trim()) return `${longer(value.slice(0, cell), factor, LONG_LABEL_MIN)} ${value.slice(cell).trim()}`;
  const text = value.trim();
  if (!text) return 'A long value that fills the line';
  const target = Math.max(Math.ceil(text.length * factor), min);
  const words = text.split(/\s+/);
  let out = text;
  for (let i = 0; out.length < target; i++) out += ` ${words[i % words.length]}`;
  return out;
}

/** The two sides of a two-sided board: text fields whose titles differ only by a side word
 *  (home/away, left/right, red/blue, 1/2, A/B). Null when the graphic has no such pair. */
export function sidesOf(fields: SpxTemplate['fields']): [string[], string[]] | null {
  const PAIRS: Array<[string, string]> = [['home', 'away'], ['left', 'right'], ['red', 'blue'], ['1', '2'], ['a', 'b']];
  const texts = fields.filter((f) => TEXT.has(f.ftype) || f.ftype === 'number');
  for (const [one, two] of PAIRS) {
    const sideOf = (title: string, word: string) => {
      const tokens = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return tokens.includes(word) ? tokens.filter((t) => t !== word).join(' ') : null;
    };
    const left: string[] = [];
    const right: string[] = [];
    for (const f of texts) {
      const restOne = sideOf(f.title ?? '', one);
      if (restOne === null) continue;
      const partner = texts.find((g) => g !== f && sideOf(g.title ?? '', two) === restOne);
      if (!partner) continue;
      left.push(f.field);
      right.push(partner.field);
    }
    if (left.length) return [left, right];
  }
  return null;
}

/** The brief's stress values keyed by this package's field ids. A brief keys them `f0`, `f1`...
 *  in its type's field order; a package that names its fields so takes them by id, any other by
 *  position among its data fields. */
export function mapStress(stress: Record<string, string>, dataKeys: string[]): { values: Record<string, string>; unmapped: string[] } {
  const values: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const [key, value] of Object.entries(stress)) {
    if (key === 'logo' || key === 'background') continue;
    if (dataKeys.includes(key)) {
      values[key] = value;
      continue;
    }
    const m = /^f(\d+)$/.exec(key);
    const byPosition = m ? dataKeys[Number(m[1])] : undefined;
    if (byPosition) values[byPosition] = value;
    else unmapped.push(key);
  }
  return { values, unmapped };
}

/** A stress value for an image field that describes a test picture becomes that picture. */
function picture(value: string): string | null {
  const m = /^(bright|dark)\s*:/i.exec(value.trim());
  return m ? fixtureLogo(m[1].toLowerCase() as 'bright' | 'dark') : null;
}


export function coveragePlan(input: CoverageInput): CoveragePlan {
  const notes: string[] = [];
  const dataKeys = Object.keys(input.defaults);
  const byKey = new Map(input.fields.map((f) => [f.field, f]));
  const textKeys = dataKeys.filter((k) => TEXT.has(byKey.get(k)?.ftype ?? ''));
  const imageKeys = dataKeys.filter((k) => byKey.get(k)?.ftype === IMAGE);
  const { values: stress, unmapped } = mapStress(input.stress ?? {}, dataKeys);
  if (unmapped.length) notes.push(`stress keys with no field here: ${unmapped.join(', ')}`);

  const sample = { ...input.defaults };
  const long = { ...sample };
  for (const key of dataKeys) {
    const kind = byKey.get(key)?.ftype ?? '';
    const given = stress[key];
    if (kind === IMAGE) {
      const pic = given ? picture(given) : null;
      if (pic) long[key] = pic;
      else if (given) notes.push(`${key}: "${given.slice(0, 40)}" is not a bright: or dark: picture, so the sample image stays`);
    } else if (given !== undefined) long[key] = given;
    else if (TEXT.has(kind)) long[key] = longer(sample[key] ?? '');
  }
  // A brief's `logo` is the operator's logo for a type with no image field of its own; a package
  // that has one shows it there, in the first image field the brief gave no picture of its own.
  const logo = input.stress?.logo ? picture(input.stress.logo) : null;
  const logoKey = imageKeys.find((k) => stress[k] === undefined);
  if (input.stress?.logo) {
    if (logo && logoKey) long[logoKey] = logo;
    else notes.push(`the brief's logo (${input.stress.logo.slice(0, 40)}) is not drawn: ${!logo ? 'it is not a bright: or dark: picture' : 'this package has no image field free to show it'}`);
  }
  const empty = { ...sample };
  for (const key of [...textKeys.slice(1), ...imageKeys]) empty[key] = '';
  const valueSets: Record<string, Record<string, string>> = { sample, long, empty };
  const sides = sidesOf(input.fields.filter((f) => dataKeys.includes(f.field)));
  if (sides) {
    sides.forEach((side, i) => {
      const set = { ...sample };
      for (const key of side) set[key] = long[key];
      valueSets[`long-side-${i + 1}`] = set;
    });
  }

  const grounds: Ground[] = ['video', 'light'];
  if (/^busy\s*:/i.test(input.stress?.background ?? '')) grounds.push('busy');

  const settled = [STRIP_MS[STRIP_MS.length - 1]];
  const strip = [...STRIP_MS];
  const renders: CoverageRender[] = [];
  for (const values of Object.keys(valueSets)) {
    for (const ground of grounds) {
      renders.push({
        name: `${values}-${ground}`,
        values,
        ground,
        state: 'on air, settled',
        ops: [],
        offsets: settled,
        ...(values === 'long' && ground === 'video' ? { crops: [...textKeys, ...imageKeys] } : {}),
      });
    }
  }
  renders.push({ name: 'take', values: 'sample', ground: 'video', state: 'the Take', ops: [], offsets: [...strip, LATER_MS] });
  for (const button of input.buttons) {
    renders.push({ name: `event-${safe(button.event, 'x')}`, values: 'sample', ground: 'video', state: `${button.label || button.event} after the Take`, ops: [{ kind: 'event', event: button.event }], offsets: [...strip, LATER_MS] });
  }
  const steps = input.stepCount === -1 ? 3 : Math.min(Math.max(input.stepCount, 1), MAX_NEXT_STEPS + 1);
  for (let k = 1; k < steps; k++) {
    renders.push({ name: `next-${k + 1}`, values: 'sample', ground: 'video', state: `step ${k + 1} through Next`, ops: Array.from({ length: k }, () => ({ kind: 'next' }) as FrameOp), offsets: strip });
  }
  const first = textKeys[0];
  if (first) renders.push({ name: 'update', values: 'sample', ground: 'video', state: `an Update of ${byKey.get(first)?.title || first} to its long value`, ops: [{ kind: 'set', key: first, value: long[first] }], offsets: strip });
  renders.push({ name: 'out', values: 'sample', ground: 'video', state: 'Out', ops: [{ kind: 'out' }], offsets: strip });
  return { valueSets, grounds, renders, notes };
}

/** The file name of a render's timeline drawn as one picture (`coverage --strips`). */
export function stripFile(render: CoverageRender, ext: string): string {
  return `${render.name}-strip.${ext}`;
}

/** The file name of one frame of a render. */
export function frameFile(render: CoverageRender, atMs: number, ext: string): string {
  return render.offsets.length > 1 ? `${render.name}-${String(atMs).padStart(5, '0')}ms.${ext}` : `${render.name}.${ext}`;
}
