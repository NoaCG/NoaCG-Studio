// Screenshots: frames of a composed document - the agent's eyes.
//
// The bridge composes the document (the studio's own preview composition, parked at the settled
// on-air state, or the stress frame, or nothing at all for "off"). This renders it in a page of
// its own at the APP ORIGIN - a blank page the CLI serves itself, then `setContent`, which keeps
// the page's URL, so the document's relative `/fonts/...` references resolve against the
// deployment exactly as they do in the studio - waits for fonts and two frames, then re-rasterises
// the settled frame before the shutter: a graphic's panel is a promoted compositor layer
// (`will-change`), rasterised mid-entrance and never again, so a frame taken without that step
// carries a texture from half a second earlier (scripts/pro-spike.mjs `rasterSettledFrame`,
// measured 2026-08-16). `omitBackground` keeps every unpainted pixel transparent, which is the
// only honest picture of a graphic composited over video - unless a background is asked for,
// which is painted on the root BEHIND the graphic, never into its tree.
//
// A SEQUENCE render (`shootSequence`) drives the bare "off" document the way an operator does -
// Take, the graphic's own events with the payload a press carries, field updates, Next, Out - and
// shoots at a chosen time after the last of them. Time runs on Playwright's clock, paused once the
// document has loaded and moved only by the run, so "4 s after Start timer" is the same frame
// every time and "2 minutes later" costs a second, not two minutes. `walkStates` uses it to find
// and shoot every machine state a graphic's events reach (`validate --screenshots`).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { launchBrowser, newBenchContext, type BenchContext } from './browser.js';
import type { ControlButton as InspectedButton } from './bridgeClient.js';
import { UsageError } from './output.js';

export interface ShotOptions {
  width?: number;
  height?: number;
  /** How long to let the document settle after fonts are ready (ms). */
  settleMs?: number;
  /** A CSS `background` value painted behind the graphic (`resolveBackground`); none = transparent. */
  background?: string | null;
}

// ── Backgrounds ───────────────────────────────────────────────────────────────

/** A defocused broadcast frame: bright and dark regions, soft colour, no flat area large enough
 *  to flatter a plate of either polarity. CSS only, so the CLI ships no binary for it. */
const VIDEO_PLATE = [
  'radial-gradient(ellipse 34% 30% at 16% 20%, rgba(255, 212, 150, 0.9), rgba(255, 212, 150, 0) 72%)',
  'radial-gradient(ellipse 28% 34% at 84% 16%, rgba(130, 175, 255, 0.75), rgba(130, 175, 255, 0) 70%)',
  'radial-gradient(ellipse 50% 24% at 56% 60%, rgba(236, 240, 246, 0.92), rgba(236, 240, 246, 0) 72%)',
  'radial-gradient(ellipse 22% 18% at 36% 40%, rgba(70, 120, 90, 0.7), rgba(70, 120, 90, 0) 70%)',
  'radial-gradient(ellipse 38% 34% at 10% 90%, rgba(8, 10, 18, 0.95), rgba(8, 10, 18, 0) 72%)',
  'radial-gradient(ellipse 32% 28% at 90% 88%, rgba(170, 40, 52, 0.7), rgba(170, 40, 52, 0) 70%)',
  'linear-gradient(180deg, #4a515e 0%, #6b707a 42%, #33363d 78%, #1d1f24 100%)',
].join(', ');

const CHECKER = 'repeating-conic-gradient(#cfcfcf 0% 25%, #f2f2f2 0% 50%) 0 0 / 32px 32px';

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** `--background`: transparent | checker | video | a CSS colour | a local image file. Returns the
 *  CSS `background` value to paint, or null for transparent. A colour is checked by the page. */
export async function resolveBackground(spec: string | undefined): Promise<string | null> {
  const s = (spec ?? '').trim();
  if (!s || s === 'transparent' || s === 'none') return null;
  if (s === 'checker') return CHECKER;
  if (s === 'video') return VIDEO_PLATE;
  const type = IMAGE_TYPES[path.extname(s).toLowerCase()];
  if (type) {
    const bytes = await fs.readFile(path.resolve(s)).catch(() => null);
    if (!bytes) throw new UsageError(`--background: no image at ${path.resolve(s)}.`);
    return `url("data:${type};base64,${bytes.toString('base64')}") center / cover no-repeat`;
  }
  // Anything else is a colour; only characters a colour can hold reach the style rule.
  if (!/^[#a-z0-9(),.%\s/-]+$/i.test(s)) throw new UsageError(`--background is transparent, checker, video, a CSS colour or a .png/.jpg/.webp file; got "${s}".`);
  return s;
}

/** Paint the ground on the root, behind the graphic and outside its tree. Done as soon as the
 *  document is open, so a colour the page does not know fails before any time is spent. */
async function paintBackground(page: Page, background: string | null | undefined): Promise<void> {
  if (!background) return;
  if (!(await page.evaluate((value) => CSS.supports('background', value), background))) {
    throw new UsageError(`--background: "${background}" is not a CSS colour (nor transparent, checker, video or an image file).`);
  }
  await page.addStyleTag({ content: `html { background: ${background} !important; }` });
}

// ── One document in one page ──────────────────────────────────────────────────

/** Open `html` in `page` at the app origin. The page first loads a blank document the CLI serves
 *  itself (not the app's bridge, whose bundle would cost every frame a full app load). */
async function openDocument(page: Page, appOrigin: string, html: string, opts: ShotOptions): Promise<void> {
  const blank = `${appOrigin}/__noacg-frame.html`;
  await page.route(blank, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>frame</title>' }));
  await page.setViewportSize({ width: opts.width ?? 1920, height: opts.height ?? 1080 });
  await page.goto(blank, { waitUntil: 'domcontentloaded' });
  await page.setContent(html, { waitUntil: 'load' });
  await paintBackground(page, opts.background);
}

async function rasterSettledFrame(page: Page): Promise<void> {
  const hintOff = await page.addStyleTag({ content: '*{will-change:auto !important}' });
  const twoFrames = () =>
    page.evaluate(async () => {
      document.body.getBoundingClientRect();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  await twoFrames();
  await hintOff.evaluate((el) => (el as Element).remove());
  await twoFrames();
}

/** Render `html` at the app origin and return the PNG bytes (also written to `outPath` when given). */
export async function shoot(bench: BenchContext, appOrigin: string, html: string, outPath: string | undefined, opts: ShotOptions = {}): Promise<Uint8Array> {
  const page = await bench.newPage();
  try {
    await openDocument(page, appOrigin, html, opts);
    await page.evaluate(async (settleMs) => {
      try {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
      } catch {
        /* no fonts */
      }
      await new Promise((resolve) => setTimeout(resolve, settleMs));
    }, opts.settleMs ?? 1500);
    await rasterSettledFrame(page);
    const buffer = await page.screenshot({ ...(outPath ? { path: outPath } : {}), omitBackground: true, type: 'png' });
    return new Uint8Array(buffer);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ── Operator sequences ────────────────────────────────────────────────────────

/** A button as `inspect` returns it, with the whole press family `eventPayload` reads. */
export type ControlButton = InspectedButton & { set?: Record<string, string>; add?: Record<string, string>; remove?: Record<string, string> };

/** One thing an operator does to a graphic on air. */
export type FrameOp =
  | { kind: 'take' }
  | { kind: 'next' }
  | { kind: 'out' }
  | { kind: 'event'; event: string }
  | { kind: 'set'; key: string; value: string }
  | { kind: 'wait'; ms: number };

/** The machine's pointers as the graphic reports them (`noacgMachineState()`). */
export type MachineState = { groups: Record<string, string> } & Record<string, unknown>;

/** Time between two ops, and from the last op to the shutter by default: long enough for an
 *  entrance or a state transition to land, which is what an operator waits for before the next press. */
export const STEP_MS = 1500;

/** `4s`, `1.5s`, `1500ms`, `1500`, `2m`, `1:30`. */
export function parseDuration(text: string, flag: string): number {
  const s = text.trim().toLowerCase();
  let m = /^(\d+):([0-5]\d)$/.exec(s);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  m = /^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/.exec(s);
  if (!m) throw new UsageError(`${flag} expects a duration like 4s, 1.5s, 800ms, 2m or 1:30; got "${text}".`);
  const n = Number(m[1]);
  const ms = m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60_000 : n;
  if (ms > 60 * 60_000) throw new UsageError(`${flag}: ${text} is more than an hour.`);
  return Math.round(ms);
}

/** Read `--event` values into ops. Each value is ONE op: a declared event, next, out, take,
 *  field=value, wait:<duration>, or event:<name> for an event named like one of the words. */
export function parseOps(values: string[], buttons: ControlButton[], fieldIds: string[]): FrameOp[] {
  const events = buttons.map((b) => b.event);
  const listEvents = () => (events.length ? `This graphic's events: ${events.join(', ')}.` : 'This graphic declares no events (no buttons).');
  return values.map((raw): FrameOp => {
    const v = raw.trim();
    const eq = /^([A-Za-z_][\w-]*)=/.exec(v);
    if (eq) {
      if (!fieldIds.includes(eq[1])) throw new UsageError(`--event ${v}: no field "${eq[1]}". Fields: ${fieldIds.join(', ')}.`);
      return { kind: 'set', key: eq[1], value: v.slice(eq[0].length) };
    }
    if (v.startsWith('wait:')) return { kind: 'wait', ms: parseDuration(v.slice(5), `--event ${v}`) };
    if (v === 'take' || v === 'next' || v === 'out') return { kind: v };
    const name = v.startsWith('event:') ? v.slice(6) : v;
    if (!events.includes(name)) throw new UsageError(`--event ${v}: not an event this graphic declares, and not take, next, out, field=value or wait:<duration>. ${listEvents()}`);
    return { kind: 'event', event: name };
  });
}

export function describeOp(op: FrameOp): string {
  switch (op.kind) {
    case 'event':
      return op.event;
    case 'set':
      return `${op.key}=${op.value}`;
    case 'wait':
      return `wait:${op.ms}ms`;
    default:
      return op.kind;
  }
}

/**
 * What one press of an event button carries - a port of the studio's own rule
 * (src/control/controlModel.ts `eventPayload`, with `adjustedValue`, `addedValue` and
 * `removedValue`), so a frame shows what the operator's press would put on air: `payload` fields
 * at their current value, `adjust` moved by its delta, `set` at the declared figure, `add` and
 * `remove` a line of a list field. Undefined = the event fires bare.
 */
export function eventPayload(button: ControlButton, valueOf: (key: string) => string | undefined): Record<string, string> | undefined {
  const lines = (v: string | undefined) => String(v ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const payload: Record<string, string> = {};
  for (const key of button.payload ?? []) {
    const value = valueOf(key);
    if (value !== undefined) payload[key] = String(value);
  }
  for (const [key, delta] of Object.entries(button.adjust ?? {})) payload[key] = String((parseInt(String(valueOf(key) ?? ''), 10) || 0) + delta);
  for (const [key, value] of Object.entries(button.set ?? {})) payload[key] = value;
  for (const [key, source] of Object.entries(button.add ?? {})) {
    const line = String(valueOf(source) ?? '').trim();
    if (!line) continue;
    const list = lines(valueOf(key));
    if (!list.includes(line)) list.push(line);
    payload[key] = list.join('\n');
  }
  for (const [key, source] of Object.entries(button.remove ?? {})) {
    const line = String(valueOf(source) ?? '').trim();
    if (!line) continue;
    const list = lines(valueOf(key));
    const at = list.lastIndexOf(line);
    if (at !== -1) {
      list.splice(at, 1);
      payload[key] = list.join('\n');
    }
  }
  return Object.keys(payload).length ? payload : undefined;
}

export interface SequenceOptions extends ShotOptions {
  /** The data the Take airs (and every later update starts from). */
  data: Record<string, string>;
  /** The ops after the Take. A sequence that does not start with `take` gets one. */
  ops: FrameOp[];
  /** Time from the last op to the shutter (default STEP_MS). */
  atMs?: number;
  /** The graphic's buttons, for the payload each event press carries. */
  buttons: ControlButton[];
}

export interface SequenceShot {
  png: Uint8Array;
  /** The machine's pointers at the shutter; null for a graphic without a machine. */
  machine: MachineState | null;
  /** Things the agent must hear: an event that moved nothing. */
  notes: string[];
}

async function machineState(page: Page): Promise<MachineState | null> {
  return page.evaluate(() => {
    try {
      const w = window as unknown as { noacgMachineState?: () => unknown };
      const s = w.noacgMachineState ? w.noacgMachineState() : null;
      return s && typeof s === 'object' && (s as { groups?: unknown }).groups ? (s as MachineState) : null;
    } catch {
      return null;
    }
  });
}

/** Move the document's time on by `ms`: Playwright's clock for the template's timers, frames and
 *  GSAP, and the same amount for any running CSS animation or transition, which that clock does
 *  not drive, so the two halves of a graphic stay in step. */
async function advance(page: Page, ms: number): Promise<void> {
  if (ms <= 0) return;
  await page.clock.runFor(ms);
  await page.evaluate((step) => {
    for (const a of document.getAnimations?.() ?? []) {
      if (a.playState === 'running' && typeof a.currentTime === 'number') a.currentTime += step;
    }
  }, ms);
}

/** Drive the bare document through `ops` and shoot `atMs` after the last one. */
export async function shootSequence(appOrigin: string, html: string, outPath: string | undefined, opts: SequenceOptions): Promise<SequenceShot> {
  // A contained context of its own: Playwright's clock belongs to a CONTEXT, and pausing the
  // bench's would stop the bridge page's timers too, and every other render's.
  const own = await newBenchContext(await launchBrowser(), appOrigin);
  const page = await own.newPage();
  const notes: string[] = [];
  try {
    // The clock goes in, paused, before the document, so its timers, Date and frames are the
    // clock's and time moves only when the run moves it.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await openDocument(page, appOrigin, html, opts);
    // Fonts load in real time, which the paused clock cannot cap, so the cap is real time too.
    await Promise.race([
      page.evaluate(() => document.fonts.ready.then(() => undefined, () => undefined)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    // A document is loaded a moment before anyone takes it: let its load-time timers run.
    await advance(page, 500);

    const data = { ...opts.data };
    const ops: FrameOp[] = opts.ops[0]?.kind === 'take' ? opts.ops : [{ kind: 'take' }, ...opts.ops];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const last = i === ops.length - 1;
      if (op.kind === 'wait') {
        await advance(page, op.ms + (last ? opts.atMs ?? STEP_MS : 0));
        continue;
      }
      const before = op.kind === 'event' ? await machineState(page) : null;
      let payload: Record<string, string> | undefined;
      if (op.kind === 'set') data[op.key] = op.value;
      if (op.kind === 'event') {
        const button = opts.buttons.find((b) => b.event === op.event);
        payload = button ? eventPayload(button, (key) => data[key]) : undefined;
        // What the press moved is written back, as every control surface does, so the next
        // press counts from it (two goals make 2).
        Object.assign(data, payload ?? {});
      }
      await page.evaluate(
        ({ op, data, payload }) => {
          const w = window as unknown as Record<string, ((...a: unknown[]) => unknown) | unknown>;
          const call = (fn: string, ...args: unknown[]) => {
            const f = w[fn];
            if (typeof f === 'function') f(...args);
          };
          if (op.kind === 'take') {
            call('update', JSON.stringify(data));
            call('play');
          } else if (op.kind === 'set') call('update', JSON.stringify(data));
          else if (op.kind === 'next') call('next');
          else if (op.kind === 'out') call('stop');
          else if (op.kind === 'event') {
            // As the studio's renderer does: no event instant, so a clock reads the page's own time.
            w.noacgEventAt = null;
            call('noacgDispatch', op.event, payload);
          }
        },
        { op, data, payload },
      );
      // At least a frame, even for --at 0: a dispatched event lands a frame later.
      await advance(page, Math.max(last ? opts.atMs ?? STEP_MS : STEP_MS, 20));
      if (op.kind === 'event' && !payload) {
        const after = await machineState(page);
        if (before && after && JSON.stringify(before.groups) === JSON.stringify(after.groups)) {
          const where = Object.entries(after.groups).map(([g, s]) => `${g}=${s}`).join(', ');
          notes.push(`${op.event} did not move the machine (still ${where}). If it should have, the machine does not answer ${op.event} from there.`);
        }
      }
    }

    // The paused clock drives no frames, so the re-raster waits on real time instead.
    const hintOff = await page.addStyleTag({ content: '*{will-change:auto !important}' });
    await page.waitForTimeout(50);
    await hintOff.evaluate((el) => (el as Element).remove());
    await page.waitForTimeout(50);
    const machine = await machineState(page);
    const buffer = await page.screenshot({ ...(outPath ? { path: outPath } : {}), omitBackground: true, type: 'png' });
    return { png: new Uint8Array(buffer), machine, notes };
  } finally {
    await own.close();
  }
}

// ── Every state a graphic's events reach ──────────────────────────────────────

export interface StateFrame {
  /** The file name to write (`<group>-<state>.png`, or `step-<n>.png` without a machine). */
  name: string;
  png: Uint8Array;
  /** The (group, state) pairs this frame is the first to show. */
  reached: Array<{ group: string; state: string }>;
  /** The ops after the Take that reach it, ready for `screenshot --event`. */
  via: string[];
}

const WALK_DEPTH = 3;
const WALK_RENDERS = 40;
const WALK_PARALLEL = 4;

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'state';

/**
 * Walk a graphic's machine breadth-first from the on-air state over its declared events (and
 * Next while it has steps), each path replayed from the Take in a page of its own, and shoot ONE
 * frame for every (group, state) pair the on-air frame does not already show, at the shortest
 * path that reaches it. Paths that land on a machine state already seen are not walked further.
 * A graphic without a machine gets one frame per extra step instead. Bounded: depth 3, 40 renders,
 * and done as soon as every declared state but the lifecycle's own off and out has its frame.
 */
export async function walkStates(
  appOrigin: string,
  html: string,
  opts: ShotOptions & {
    data: Record<string, string>;
    buttons: ControlButton[];
    stepCount: number;
    /** The declared groups (`inspect`); the first is the lifecycle. */
    stateGroups: Array<{ id: string; states: Array<{ id: string }> }>;
  },
): Promise<StateFrame[]> {
  const base = { ...opts, ops: [] as FrameOp[] };
  const render = (ops: FrameOp[]) => shootSequence(appOrigin, html, undefined, { ...base, ops });
  const frames: StateFrame[] = [];
  const names = new Set<string>(['off', 'onair', 'stress']);
  const nameFor = (wanted: string) => {
    let name = wanted;
    for (let n = 2; names.has(name); n++) name = `${wanted}-${n}`;
    names.add(name);
    return name;
  };

  const start = await render([]);
  if (!start.machine) {
    // No machine: the steps are the states. Step 1 is the on-air frame.
    for (let step = 2; step <= opts.stepCount; step++) {
      const ops: FrameOp[] = Array.from({ length: step - 1 }, () => ({ kind: 'next' }));
      frames.push({ name: nameFor(`step-${step}`), png: (await render(ops)).png, reached: [], via: ops.map(describeOp) });
    }
    return frames;
  }

  const candidates: FrameOp[] = [
    ...opts.buttons.map((b): FrameOp => ({ kind: 'event', event: b.event })),
    ...(opts.stepCount > 1 || opts.stepCount === -1 ? [{ kind: 'next' } as FrameOp] : []),
  ];
  const signature = (m: MachineState | null) => JSON.stringify(m?.groups ?? null);
  const seen = new Set<string>([signature(start.machine)]);
  const shown = new Set<string>(Object.entries(start.machine.groups).map(([g, s]) => `${g}\u0000${s}`));
  // Off is off.png and Out is the exit, so the lifecycle's own two are not looked for.
  const wanted = opts.stateGroups.flatMap((g, i) => g.states.filter((st) => i > 0 || (st.id !== 'off' && st.id !== 'out')).map((st) => `${g.id}\u0000${st.id}`));
  const queue: FrameOp[][] = candidates.map((op) => [op]);
  let renders = 1;
  while (queue.length && renders < WALK_RENDERS && !wanted.every((w) => shown.has(w))) {
    const batch = queue.splice(0, Math.min(WALK_PARALLEL, WALK_RENDERS - renders));
    renders += batch.length;
    const shots = await Promise.all(batch.map((ops) => render(ops)));
    batch.forEach((ops, i) => {
      const { machine, png } = shots[i];
      const sig = signature(machine);
      if (!machine || seen.has(sig)) return;
      seen.add(sig);
      const reached = Object.entries(machine.groups)
        .filter(([g, s]) => !shown.has(`${g}\u0000${s}`))
        .map(([group, state]) => ({ group, state }));
      for (const r of reached) shown.add(`${r.group}\u0000${r.state}`);
      if (reached.length) frames.push({ name: nameFor(`${safe(reached[0].group)}-${safe(reached[0].state)}`), png, reached, via: ops.map(describeOp) });
      if (ops.length < WALK_DEPTH) for (const op of candidates) queue.push([...ops, op]);
    });
  }
  return frames;
}
