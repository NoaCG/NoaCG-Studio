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
import { launchBrowser, newBenchContext, withTimeout, type BenchContext } from './browser.js';
import type { BridgeClient, ControlButton, SpxTemplate } from './bridgeClient.js';
import { UsageError } from './output.js';

export interface ShotOptions {
  width?: number;
  height?: number;
  /** How long to let the document settle after fonts are ready (ms). */
  settleMs?: number;
  /** A CSS `background` value painted behind the graphic (`resolveBackground`); none = transparent. */
  background?: string | null;
  /** What the caller called the background, for an error about it (`--background`, `"background"`). */
  backgroundArg?: string;
  /** Encode a frame over a background as JPEG. Such a frame has no alpha to keep, and over the
   *  video plate a full-HD PNG is about 0.9 MB, which an MCP answer of several frames cannot carry.
   *  A transparent frame stays PNG whatever this says. */
  compact?: boolean;
}

// ── What the caller called each argument ─────────────────────────────────────

/** The terminal and the MCP tool name the same inputs differently; an error names the one the
 *  caller used, so it can be fixed without translating it first. */
export interface ArgNames {
  /** One operator op, as the caller wrote it. */
  event: (op: string) => string;
  background: string;
}
export const TERMINAL_ARGS: ArgNames = { event: (op) => `--event ${op}`, background: '--background' };

/** JPEG quality for a compact frame: text edges stay clean at full HD (judged on the video plate). */
const JPEG_QUALITY = 85;

/** Take the shutter: PNG with transparency kept, or JPEG for a compact frame over an opaque ground. */
async function capture(page: Page, outPath: string | undefined, opts: ShotOptions): Promise<Uint8Array> {
  const to = outPath ? { path: outPath } : {};
  const buffer = opts.compact && opaqueGround(opts.background)
    ? await page.screenshot({ ...to, type: 'jpeg', quality: JPEG_QUALITY })
    : await page.screenshot({ ...to, omitBackground: true, type: 'png' });
  return new Uint8Array(buffer);
}

/** The image type of frame bytes, read off the bytes themselves. */
export const mimeTypeOf = (bytes: Uint8Array): 'image/jpeg' | 'image/png' => (bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png');

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

/** A ground with no see-through part, so a frame over it has no alpha a JPEG would flatten: the
 *  plate, the checker, a JPEG still, or a colour written without alpha. A PNG or WebP still, or a
 *  colour that may carry alpha, is not assumed opaque. */
function opaqueGround(background: string | null | undefined): boolean {
  if (!background) return false;
  if (background === VIDEO_PLATE || background === CHECKER || background.startsWith('url("data:image/jpeg')) return true;
  if (background.startsWith('url(')) return false;
  return !/transparent|rgba|hsla|\/|^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(background.trim());
}

/** `--background`: transparent | checker | video | a CSS colour | a local image file. Returns the
 *  CSS `background` value to paint, or null for transparent. A colour is checked by the page. */
export async function resolveBackground(spec: string | undefined, arg = TERMINAL_ARGS.background): Promise<string | null> {
  const s = (spec ?? '').trim();
  if (!s || s === 'transparent' || s === 'none') return null;
  if (s === 'checker') return CHECKER;
  if (s === 'video') return VIDEO_PLATE;
  const type = IMAGE_TYPES[path.extname(s).toLowerCase()];
  if (type) {
    const bytes = await fs.readFile(path.resolve(s)).catch(() => null);
    if (!bytes) throw new UsageError(`${arg}: no image at ${path.resolve(s)}.`);
    return `url("data:${type};base64,${bytes.toString('base64')}") center / cover no-repeat`;
  }
  // Anything else is a colour; only characters a colour can hold reach the style rule.
  if (!/^[#a-z0-9(),.%\s/-]+$/i.test(s)) throw new UsageError(`${arg} is transparent, checker, video, a CSS colour or a .png/.jpg/.webp file; got "${s}".`);
  return s;
}

/** Paint the ground on the root, behind the graphic and outside its tree. Done as soon as the
 *  document is open, so a colour the page does not know fails before any time is spent. */
export async function paintBackground(page: Page, background: string | null | undefined, arg = TERMINAL_ARGS.background): Promise<void> {
  if (!background) return;
  if (!(await page.evaluate((value) => CSS.supports('background', value), background))) {
    throw new UsageError(`${arg}: "${background}" is not a CSS colour (nor transparent, checker, video or an image file).`);
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
  await paintBackground(page, opts.background, opts.backgroundArg);
}

/** `settle` waits between the passes: two animation frames, or, where a paused clock drives no
 *  frames (a sequence render), a little real time after forcing layout. */
async function rasterSettledFrame(page: Page, settle?: () => Promise<void>): Promise<void> {
  const hintOff = await page.addStyleTag({ content: '*{will-change:auto !important}' });
  const twoFrames =
    settle ??
    (() =>
      page.evaluate(async () => {
        document.body.getBoundingClientRect();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }));
  await twoFrames();
  await hintOff.evaluate((el) => (el as Element).remove());
  await twoFrames();
}

/** Render `html` at the app origin and return the frame's bytes (also written to `outPath` when given). */
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
    return await capture(page, outPath, opts);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ── Operator sequences ────────────────────────────────────────────────────────


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
const STEP_MS = 1500;

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
 *  field=value, wait:<duration>, or event:<name> for an event named like one of the words.
 *  `arg` names an op in an error the way the caller wrote it. */
export function parseOps(values: string[], buttons: ControlButton[], fieldIds: string[], arg = TERMINAL_ARGS.event): FrameOp[] {
  const events = buttons.map((b) => b.event);
  const listEvents = () => (events.length ? `This graphic's events: ${events.join(', ')}.` : 'This graphic declares no events (no buttons).');
  return values.map((raw): FrameOp => {
    const v = raw.trim();
    const eq = /^([A-Za-z_][\w-]*)=/.exec(v);
    if (eq) {
      if (!fieldIds.includes(eq[1])) throw new UsageError(`${arg(v)}: no field "${eq[1]}". Fields: ${fieldIds.join(', ')}.`);
      return { kind: 'set', key: eq[1], value: v.slice(eq[0].length) };
    }
    if (v.startsWith('wait:')) return { kind: 'wait', ms: parseDuration(v.slice(5), arg(v)) };
    if (v === 'take' || v === 'next' || v === 'out') return { kind: v };
    const name = v.startsWith('event:') ? v.slice(6) : v;
    if (!events.includes(name)) throw new UsageError(`${arg(v)}: not an event this graphic declares, and not take, next, out, field=value or wait:<duration>. ${listEvents()}`);
    return { kind: 'event', event: name };
  });
}

function describeOp(op: FrameOp): string {
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
function eventPayload(button: ControlButton, valueOf: (key: string) => string | undefined): Record<string, string> | undefined {
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
  /** The longest this render may take (default SEQUENCE_DEADLINE_MS). */
  deadlineMs?: number;
}

export interface SequenceShot {
  /** The frame: PNG, or JPEG when `compact` and over a background. */
  image: Uint8Array;
  /** The ops that ran, the Take included, as `describeOp` writes them. */
  ran: string[];
  /** The time from the last op to the shutter that was actually used. */
  atMs: number;
  /** The machine's pointers at the shutter; null for a graphic without a machine. */
  machine: MachineState | null;
  /** Things the agent must hear: an event that moved nothing, a call that threw. */
  notes: string[];
}

/** The longest one sequence render may take before its context is closed: a template that spins
 *  in an event handler must not hold `screenshot` or `validate` for ever (browser.ts). */
const SEQUENCE_DEADLINE_MS = 90_000;

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
 *  GSAP, and the same amount for the CSS animations and transitions, which that clock does not
 *  drive. Those are HELD (paused by us) between advances and moved by hand, so real time spent
 *  in round trips never reaches them; one that starts during a step joins the held set at its end. */
async function advance(page: Page, ms: number): Promise<void> {
  if (ms <= 0) return;
  // step = 0 holds what is running now (an op may just have started it); then, after the clock
  // has run, every held animation moves by the step and any that started during it is held.
  const hold = (step: number) =>
    page.evaluate((step) => {
      const w = window as unknown as { __noacgHeld?: WeakSet<Animation> };
      const held = (w.__noacgHeld ??= new WeakSet<Animation>());
      const all = document.getAnimations?.() ?? [];
      for (const a of all) if (step && held.has(a) && a.playState === 'paused' && typeof a.currentTime === 'number') a.currentTime += step;
      for (const a of all) {
        if (a.playState === 'running') {
          a.pause();
          held.add(a);
        }
      }
    }, step);
  await hold(0);
  await page.clock.runFor(ms);
  await hold(ms);
}

/** Drive the bare document through `ops` and shoot `atMs` after the last one. */
export async function shootSequence(appOrigin: string, html: string, outPath: string | undefined, opts: SequenceOptions): Promise<SequenceShot> {
  // A contained context of its own: Playwright's clock belongs to a CONTEXT, and pausing the
  // bench's would stop the bridge page's timers too, and every other render's.
  const own = await newBenchContext(await launchBrowser(), appOrigin);
  try {
    return await withTimeout(runSequence(own, appOrigin, html, outPath, opts), opts.deadlineMs ?? SEQUENCE_DEADLINE_MS, 'the state render', () => own.close());
  } finally {
    await own.close();
  }
}

async function runSequence(own: BenchContext, appOrigin: string, html: string, outPath: string | undefined, opts: SequenceOptions): Promise<SequenceShot> {
  const page = await own.newPage();
  const notes: string[] = [];
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
  // At least a frame, even for --at 0: a dispatched event lands a frame later.
  const atMs = Math.max(opts.atMs ?? STEP_MS, 20);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const last = i === ops.length - 1;
    if (op.kind === 'wait') {
      await advance(page, op.ms + (last ? atMs : 0));
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
    // Each call is caught, as the studio's own command channel catches it (composeDocument.ts),
    // and what it threw is said: the frame then shows what air would show after the throw.
    const threw = await page.evaluate(
      ({ op, data, payload }) => {
        const w = window as unknown as Record<string, ((...a: unknown[]) => unknown) | unknown>;
        const errors: string[] = [];
        const call = (fn: string, ...args: unknown[]) => {
          const f = w[fn];
          try {
            if (typeof f === 'function') f(...args);
          } catch (e) {
            errors.push(`${fn}() threw: ${e instanceof Error ? e.message : String(e)}`);
          }
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
        return errors;
      },
      { op, data, payload },
    );
    for (const message of threw) notes.push(`${describeOp(op)}: ${message}`);
    await advance(page, last ? atMs : STEP_MS);
    if (op.kind === 'event' && !payload) {
      const after = await machineState(page);
      if (before && after && JSON.stringify(before.groups) === JSON.stringify(after.groups)) {
        const where = Object.entries(after.groups).map(([g, s]) => `${g}=${s}`).join(', ');
        notes.push(`${op.event} did not move the machine (still ${where}). If it should have, the machine does not answer ${op.event} from there.`);
      }
    }
  }

  await rasterSettledFrame(page, async () => {
    await page.evaluate(() => document.body.getBoundingClientRect());
    await page.waitForTimeout(50);
  });
  const machine = await machineState(page);
  return { image: await capture(page, outPath, opts), ran: ops.map(describeOp), atMs, machine, notes };
}

// ── Every state a graphic's events reach ──────────────────────────────────────

export interface StateFrame {
  /** The file name to write (`<group>-<state>.png`, or `step-<n>.png` without a machine). */
  name: string;
  image: Uint8Array;
  /** The (group, state) pairs this frame is the first to show. */
  reached: Array<{ group: string; state: string }>;
  /** The ops after the Take that reach it, ready for `screenshot --event`. */
  via: string[];
}

export interface StateWalk {
  frames: StateFrame[];
  /** Declared states (or steps) with no frame: past the walk's own bounds, or past a caller's limit. */
  unshot: string[];
  /** The caller's limit that stopped the walk with states still unshot: `maxFrames` or `until`. */
  stopped?: 'frames' | 'time';
  /** Why a render failed and ended the walk early; the frames before it are kept. */
  failure?: string;
}

const WALK_DEPTH = 3;
const WALK_RENDERS = 40;
const WALK_PARALLEL = 4;
/** How long a walk's render may run past the caller's `until`: a normal render takes 2-5 s. */
const UNTIL_GRACE_MS = 15_000;

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'state';

/**
 * Walk a graphic's machine breadth-first from the on-air state over its declared events (and
 * Next while it has steps), each path replayed from the Take in a page of its own, and shoot ONE
 * frame for every (group, state) pair the on-air frame does not already show, at the shortest
 * path that reaches it. Paths that land on a machine state already seen are not walked further.
 * A graphic without a machine gets one frame per extra step instead. Bounded: depth 3, 40 renders,
 * the caller's `maxFrames` and `until`, and done as soon as every declared state but the
 * lifecycle's own off and out has its frame. What it did not shoot is said, never left for the
 * caller to infer.
 */
export async function walkStates(
  appOrigin: string,
  html: string,
  opts: ShotOptions & {
    data: Record<string, string>;
    buttons: ControlButton[];
    stepCount: number;
    /** The declared groups (`inspect`); the first is the lifecycle. */
    stateGroups: Array<{ id: string; states: Array<{ id: string; name?: string }> }>;
    /** Stop once this many frames are shot (an MCP answer's cap). */
    maxFrames?: number;
    /** Start no render after this time (`Date.now()`), and let none run more than UNTIL_GRACE_MS
     *  past it, so an answer has an end a client can wait for. */
    until?: number;
  },
): Promise<StateWalk> {
  const deadlineMs = () => (opts.until === undefined ? undefined : Math.max(0, opts.until - Date.now()) + UNTIL_GRACE_MS);
  const render = (ops: FrameOp[]) => shootSequence(appOrigin, html, undefined, { ...opts, ops, deadlineMs: deadlineMs() });
  // A render that fails ends the walk, keeping every frame shot before it and naming the rest.
  let failure: string | undefined;
  const batchOf = async (paths: FrameOp[][]) => {
    try {
      return await Promise.all(paths.map((ops) => render(ops)));
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      return null;
    }
  };
  const key = (group: string, state: string) => `${group}\u0000${state}`;
  const maxFrames = opts.maxFrames ?? Infinity;
  const timeLeft = () => Date.now() < (opts.until ?? Infinity);
  const frames: StateFrame[] = [];
  const names = new Set<string>(['off', 'onair', 'stress']);
  const nameFor = (wanted: string) => {
    let name = wanted;
    for (let n = 2; names.has(name); n++) name = `${wanted}-${n}`;
    names.add(name);
    return name;
  };

  // No machine: the steps are the states, step 1 being the on-air frame, within the same bounds.
  const stepFrames = async (): Promise<StateWalk> => {
    const last = Math.min(opts.stepCount, WALK_RENDERS + 1);
    const paths: FrameOp[][] = [];
    for (let step = 2; step <= Math.min(last, maxFrames + 1); step++) paths.push(Array.from({ length: step - 1 }, () => ({ kind: 'next' })));
    let i = 0;
    for (; i < paths.length && timeLeft() && !failure; i += WALK_PARALLEL) {
      const batch = paths.slice(i, i + WALK_PARALLEL);
      const shots = await batchOf(batch);
      if (!shots) break;
      batch.forEach((ops, j) => frames.push({ name: nameFor(`step-${ops.length + 1}`), image: shots[j].image, reached: [], via: ops.map(describeOp) }));
    }
    const unshot = Array.from({ length: Math.max(0, last - frames.length - 1) }, (_, k) => `step ${frames.length + 2 + k}`);
    const stopped = !unshot.length || failure ? undefined : frames.length >= maxFrames ? 'frames' : i < paths.length ? 'time' : undefined;
    return { frames, unshot, stopped, failure };
  };
  // inspect already says whether there is a machine; a render is spent only to find its start.
  if (!opts.stateGroups.length) return stepFrames();
  // Nothing to press: the on-air frame already shows the only state there is.
  if (!opts.buttons.length && !(opts.stepCount > 1 || opts.stepCount === -1)) return { frames, unshot: [] };
  const [start] = (await batchOf([[]])) ?? [];
  if (!start) return { frames, unshot: [], failure };
  if (!start.machine) return stepFrames();

  const candidates: FrameOp[] = [
    ...opts.buttons.map((b): FrameOp => ({ kind: 'event', event: b.event })),
    ...(opts.stepCount > 1 || opts.stepCount === -1 ? [{ kind: 'next' } as FrameOp] : []),
  ];
  const signature = (m: MachineState | null) => JSON.stringify(m?.groups ?? null);
  const seen = new Set<string>([signature(start.machine)]);
  const shown = new Set<string>(Object.entries(start.machine.groups).map(([g, s]) => key(g, s)));
  // Off is off.png and Out is the exit, so the lifecycle's own two are not looked for.
  const wanted = opts.stateGroups.flatMap((g, i) => g.states.filter((st) => i > 0 || (st.id !== 'off' && st.id !== 'out')).map((st) => key(g.id, st.id)));
  const queue: FrameOp[][] = candidates.map((op) => [op]);
  let renders = 1;
  const more = () => queue.length > 0 && renders < WALK_RENDERS && !wanted.every((w) => shown.has(w));
  while (more() && frames.length < maxFrames && timeLeft() && !failure) {
    const batch = queue.splice(0, Math.min(WALK_PARALLEL, WALK_RENDERS - renders));
    renders += batch.length;
    const shots = await batchOf(batch);
    if (!shots) break;
    batch.forEach((ops, i) => {
      const { machine, image } = shots[i];
      const sig = signature(machine);
      if (!machine || seen.has(sig)) return;
      seen.add(sig);
      const reached = Object.entries(machine.groups)
        .filter(([g, s]) => !shown.has(key(g, s)))
        .map(([group, state]) => ({ group, state }));
      // A batch can overshoot the cap; what it found past it is left unshown, so it is said as unshot.
      if (frames.length >= maxFrames) return;
      for (const r of reached) shown.add(key(r.group, r.state));
      if (reached.length) frames.push({ name: nameFor(`${safe(reached[0].group)}-${safe(reached[0].state)}`), image, reached, via: ops.map(describeOp) });
      if (ops.length < WALK_DEPTH) for (const op of candidates) queue.push([...ops, op]);
    });
  }
  const unshot = opts.stateGroups.flatMap((g) =>
    g.states.filter((st) => wanted.includes(key(g.id, st.id)) && !shown.has(key(g.id, st.id))).map((st) => `${g.id}: ${st.name ?? st.id}`),
  );
  // The reason is the limit the loop actually stopped on, not one that merely passed meanwhile.
  const stopped = !unshot.length || failure ? undefined : frames.length >= maxFrames ? 'frames' : more() ? 'time' : undefined;
  return { frames, unshot, stopped, failure };
}

/** The line that names declared states a walk did not reach within its own bounds. */
export function describeUnreached(unshot: string[], remedy: string): string {
  return `Declared states the walk did not reach (it stops at ${WALK_DEPTH} presses and ${WALK_RENDERS} renders): ${unshot.join(', ')}. ${remedy}`;
}

// ── The two renders the terminal and the MCP tool share ───────────────────────
//
// `validate --screenshots` / `validate screenshots: true`, and `screenshot --event` /
// `screenshot events`, are one render each, called from cli/src/commands/ and from cli/src/mcp.ts.
// They were two copies once and had to be fixed twice; each caller now only writes or returns.

export interface NamedFrame {
  /** off, onair, stress, or a reached state's file name (`pp-b`, `step-2`). */
  name: string;
  image: Uint8Array;
  /** For a reached state: what it shows (`pp: Power play B`) and the ops after the Take that reproduce it. */
  state?: { shows: string; via: string[]; reached: Array<{ group: string; state: string }> };
}

export interface ValidateFrames {
  frames: NamedFrame[];
  /** The on-air frame on no ground, for the package thumbnail: the graphic itself, never what it was judged on. */
  thumbnail?: { png: Uint8Array; width: number; height: number };
  /** Declared states with no frame, and the caller's limit that left them so (`walkStates`). */
  unshot: string[];
  stopped?: StateWalk['stopped'];
  /** Why shooting stopped part way, when it did. The frames shot before it are kept. */
  failure?: string;
}

/**
 * Off, on air and stress, then one frame per state the graphic's events reach. A failure part way
 * (a template that spins in an event handler, a browser that dies) does not throw: the frames
 * before it and the reason come back, so the caller still answers with the validation report it
 * already paid for. A usage error - a background colour the page does not know - still throws.
 */
export async function shootValidateFrames(
  bridge: BridgeClient,
  template: SpxTemplate,
  opts: ShotOptions & { maxStateFrames?: number; walkUntil?: number },
): Promise<ValidateFrames> {
  const frame: ShotOptions = { ...opts, width: template.resolution.width, height: template.resolution.height };
  const out: ValidateFrames = { frames: [], unshot: [] };
  try {
    const base = ['off', 'onair', 'stress'] as const;
    const html: string[] = [];
    for (const state of base) html.push(await bridge.compose(template, state));
    // The three are independent pages of one context, so they settle together rather than in turn;
    // all of them are waited for, so one that fails neither loses the others nor outlives the call.
    const settled = await Promise.allSettled([
      ...html.map((h) => shoot(bridge.bench, bridge.origin, h, undefined, frame)),
      opts.background ? shoot(bridge.bench, bridge.origin, html[1], undefined, { ...frame, background: null }) : Promise.resolve(null),
    ]);
    const images = settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
    base.forEach((name, i) => images[i] && out.frames.push({ name, image: images[i] }));
    const onair = images[3] ?? images[1];
    if (onair) out.thumbnail = { png: onair, width: template.resolution.width, height: template.resolution.height };
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;

    const inspection = await bridge.inspect({ template });
    const walk = await walkStates(bridge.origin, html[0], {
      ...frame,
      data: await bridge.stateData(template, 'onair'),
      buttons: inspection.buttons,
      stepCount: inspection.steps.count,
      stateGroups: inspection.stateGroups,
      maxFrames: opts.maxStateFrames,
      until: opts.walkUntil,
    });
    const nameOf = (group: string, state: string) => inspection.stateGroups.find((g) => g.id === group)?.states.find((s) => s.id === state)?.name ?? state;
    for (const f of walk.frames) {
      const shows = f.reached.length ? f.reached.map((r) => `${r.group}: ${nameOf(r.group, r.state)}`).join(', ') : f.name;
      out.frames.push({ name: f.name, image: f.image, state: { shows, via: f.via, reached: f.reached } });
    }
    out.unshot = walk.unshot;
    out.stopped = walk.stopped;
    out.failure = walk.failure;
  } catch (e) {
    if (e instanceof UsageError) throw e;
    out.failure = e instanceof Error ? e.message : String(e);
  }
  return out;
}

/** The lines that say what a sequence frame shows beyond its picture: the machine at the shutter
 *  (so a frame is never taken for a state it does not show), and every note. */
export function describeSequence(shot: SequenceShot): string[] {
  const lines: string[] = [];
  if (shot.machine) lines.push(`Machine at the shutter: ${Object.entries(shot.machine.groups).map(([g, s]) => `${g}=${s}`).join(', ')}`);
  for (const note of shot.notes) lines.push(`Note: ${note}`);
  return lines;
}

/** A Take with the state's data (and `values` over it), then the caller's ops, shot `atMs` after
 *  the last of them - the operator sequence `screenshot` renders. */
export async function shootEvents(
  bridge: BridgeClient,
  template: SpxTemplate,
  opts: ShotOptions & { state: 'onair' | 'stress'; values: Record<string, string> | null; events: string[]; atMs?: number; args: ArgNames },
  outPath?: string,
): Promise<SequenceShot> {
  const inspection = await bridge.inspect({ template });
  const ops = parseOps(opts.events, inspection.buttons, template.fields.map((f) => f.field), opts.args.event);
  const data = { ...(await bridge.stateData(template, opts.state)), ...(opts.values ?? {}) };
  return shootSequence(bridge.origin, await bridge.compose(template, 'off'), outPath, {
    ...opts,
    width: template.resolution.width,
    height: template.resolution.height,
    backgroundArg: opts.args.background,
    data,
    ops,
    buttons: inspection.buttons,
  });
}
