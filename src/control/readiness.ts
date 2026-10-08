// READY (Phase 6 Step 3: docs/work-specs/playout-ready/spec.md; the design is
// docs/PLAYOUT_ISOLATION_RESEARCH.md §9).
//
// READY IS A STATUS, NEVER PERMISSION. Nothing in this file, or anything that reads it, disables
// or delays a verb: Take works whenever the output can receive it, and the page says what it knows.
//
// Two halves, one vocabulary:
//
//   THE OUTPUT'S OWN ANSWER (`outputReadiness`). Each output page decides for itself, from what it
//   can see inside itself, how many of its graphics are prepared and what fails - the same code in
//   a browser, OBS, vMix and CasparCG, so READY means the same on every player (R1). It rides the
//   output's Presence entry as `ready`.
//
//   THE OPERATOR'S READING (`describeReadiness`). The production page and the hosted page (so the
//   phone) turn every output's entry into one line per output and one summary, adding only what an
//   output cannot know: the published version (guarantee 2), the outputs that should be there and
//   are not, and the stamp of the last Prepare for Live.
//
// The words are the plan's (§9.3): "Preparing 18 of 24", "Ready for playout", "Ready · 1 change
// preparing", "Ready · 1 change not prepared: Frost Quiz (script error)", the Degraded lines, and
// "CasparCG 1-20 not answering (40 s)". Green is only ever "all of it holds"; amber is degraded,
// never green; red is an output that should be there and is not.
//
// Pure, with type-only imports: scripts/readiness.test.mjs runs it in Node, and the output renderer
// loads it in CasparCG 2.3's Chromium 71 (no `Array.prototype.at`, no `Object.fromEntries`).

import type { LiveEntry, OutputHealth } from './livePath';

// ── THE OUTPUT'S OWN ANSWER ──────────────────────────────────────────────────────────────────

/** Something an output found wrong with itself. */
export interface ReadyIssue {
  /**
   * `script`: the graphic threw while loading, or its warm update threw (it is not prepared).
   * `silent`: the graphic never answered its check (not prepared either).
   * `font`: a typeface fell back (`d` is the typeface).
   * `image`: an image did not load (`d` is its file).
   * `sync`: the output is still reading commands it missed.
   */
  k: 'script' | 'silent' | 'font' | 'image' | 'sync' | 'audio';
  /** The graphic, when the issue is one graphic's. */
  g?: string;
  d?: string;
}

/** A version as an output holds it: the stamp's label and identity (payloadVersion.ts). */
export interface HeldVersion {
  n: number;
  h: string;
}

/** A newer version being prepared beside the running one (Prepare for Live, R3). */
export interface ChangePrep {
  /** `preparing`: building the changes; `failed`: a change did not prepare and the running version
   *  stays; `waiting`: every change prepared, but something is on air, so it keeps its version. */
  s: 'preparing' | 'failed' | 'waiting';
  /** The version being prepared. */
  v: HeldVersion;
  /** Changed graphics: how many, and how many are done. */
  of: number;
  n: number;
  /** For `failed`, what failed. */
  is?: ReadyIssue[];
  /** For `waiting`, how many graphics are on air. */
  air?: number;
  /** The Prepare for Live request this answers (prepareLive.ts `PrepRequest.id`), so a run never
   *  takes the last run's answer for its own. */
  id?: string;
}

/** What an output says about itself: its Presence entry's `ready`. */
export interface OutputReady {
  sounds?: { n: number; of: number; bytes: number };
  /** Graphics prepared (their check finished, whatever it found), of how many in its version. */
  n: number;
  of: number;
  /** The version it holds, or null: a payload published before stamps existed. */
  v: HeldVersion | null;
  /** What fails, most important first, at most MAX_ISSUES. */
  is: ReadyIssue[];
  chg?: ChangePrep;
}

/** Issues an entry carries: every graphic that failed is worth naming, a screenful is not. */
export const MAX_ISSUES = 6;

/** One graphic's check, as the output keeps it. */
export interface GraphicCheck {
  audio?: { n: number; of: number; bytes: number; error: string | null };
  /** Its check has finished (answered, or given up on). */
  done: boolean;
  /** What it threw while loading or warming, or null. */
  error: string | null;
  /** It never answered its check. */
  silent: boolean;
  fontsFailed: string[];
  fontsLoading: string[];
  imagesBroken: string[];
}

/**
 * THE OUTPUT'S ANSWER, from its graphics' checks. `held` is the stage's list of graphics released
 * on a fallback face because a font had not answered by the cap; one whose font answered later is
 * no longer on a fallback face and is not an issue.
 */
export function outputReadiness(input: {
  graphics: readonly string[];
  checks: ReadonlyMap<string, GraphicCheck>;
  held?: ReadonlyMap<string, { fonts: string[]; late: boolean }>;
  version: HeldVersion | null;
  /** The follower is still reading commands it missed (R8). */
  catchingUp?: boolean;
  chg?: ChangePrep;
}): OutputReady {
  const scripts: ReadyIssue[] = [];
  const audio: ReadyIssue[] = [], sounds = { n: 0, of: 0, bytes: 0 };
  const quiet: ReadyIssue[] = [];
  const fonts: ReadyIssue[] = [];
  const images: ReadyIssue[] = [];
  const typefaces: string[] = [];
  const addFont = (graphic: string, typeface: string) => {
    if (typefaces.indexOf(typeface) >= 0) return;
    typefaces.push(typeface);
    fonts.push({ k: 'font', g: graphic, d: typeface });
  };
  let done = 0;
  for (const graphic of input.graphics) {
    const check = input.checks.get(graphic);
    if (!check || !check.done) continue;
    done += 1;
    if (check.audio) {
      sounds.n += check.audio.n; sounds.of += check.audio.of; sounds.bytes += check.audio.bytes;
      if (check.audio.error) audio.push({ k: 'audio', g: graphic, d: check.audio.error.slice(0,120) });
    }
    if (check.error !== null) scripts.push({ k: 'script', g: graphic, d: check.error.slice(0, 120) });
    else if (check.silent) quiet.push({ k: 'silent', g: graphic });
    for (const typeface of check.fontsFailed.concat(check.fontsLoading)) addFont(graphic, typeface);
    for (const file of check.imagesBroken) images.push({ k: 'image', g: graphic, d: file });
  }
  if (input.held) {
    input.held.forEach((hold, graphic) => {
      if (hold.late) return;
      if (hold.fonts.length === 0) addFont(graphic, '');
      for (const typeface of hold.fonts) addFont(graphic, typeface);
    });
  }
  const sync: ReadyIssue[] = input.catchingUp ? [{ k: 'sync' }] : [];
  const is = scripts.concat(audio, quiet, fonts, images, sync).slice(0, MAX_ISSUES);
  return { n: done, of: input.graphics.length, v: input.version, is, ...(sounds.of ? { sounds } : {}), ...(input.chg ? { chg: input.chg } : {}) };
}

/** An entry's `ready`, read off the wire like any other input (anyone holding the show id can
 *  track an entry), or undefined when it has none: an output built before this step. */
export function readOutputReady(value: unknown): OutputReady | undefined {
  const r = value as Partial<OutputReady> | null;
  if (!r || typeof r !== 'object' || typeof r.n !== 'number' || typeof r.of !== 'number') return undefined;
  const version = readHeld(r.v);
  const chg = readChange(r.chg);
  return {
    n: Math.max(0, Math.min(r.n, r.of)),
    of: Math.max(0, r.of),
    v: version,
    is: readIssues(r.is),
    ...(r.sounds && [r.sounds.n,r.sounds.of,r.sounds.bytes].every(n=>Number.isInteger(n) && n >= 0) && r.sounds.n <= r.sounds.of ? { sounds: r.sounds } : {}),
    ...(chg ? { chg } : {}),
  };
}

/** A held version off the wire, or null. */
export function readHeld(value: unknown): HeldVersion | null {
  const v = value as Partial<HeldVersion> | null;
  return v && typeof v === 'object' && typeof v.n === 'number' && typeof v.h === 'string' ? { n: v.n, h: v.h.slice(0, 40) } : null;
}

function readIssues(value: unknown): ReadyIssue[] {
  if (!Array.isArray(value)) return [];
  const kinds = ['script', 'silent', 'font', 'image', 'sync', 'audio'];
  const out: ReadyIssue[] = [];
  for (const item of value.slice(0, MAX_ISSUES)) {
    const i = item as Partial<ReadyIssue> | null;
    if (!i || typeof i !== 'object' || typeof i.k !== 'string' || kinds.indexOf(i.k) < 0) continue;
    out.push({
      k: i.k,
      ...(typeof i.g === 'string' ? { g: i.g.slice(0, 80) } : {}),
      ...(typeof i.d === 'string' ? { d: i.d.slice(0, 120) } : {}),
    });
  }
  return out;
}

/** A Prepare for Live stamp off the wire, or undefined. */
export function readReadyStamp(value: unknown): ReadyStamp | undefined {
  const s = value as Partial<ReadyStamp> | null;
  if (!s || typeof s !== 'object' || typeof s.at !== 'number') return undefined;
  const v = readHeld(s.v);
  if (!v) return undefined;
  const count = (n: unknown) => (typeof n === 'number' && n >= 0 ? Math.floor(n) : 0);
  return { at: s.at, v, outputs: count(s.outputs), ready: count(s.ready), warnings: count(s.warnings), problems: count(s.problems) };
}

function readChange(value: unknown): ChangePrep | undefined {
  const c = value as Partial<ChangePrep> | null;
  if (!c || typeof c !== 'object' || (c.s !== 'preparing' && c.s !== 'failed' && c.s !== 'waiting')) return undefined;
  const v = readHeld(c.v);
  if (!v || typeof c.of !== 'number' || typeof c.n !== 'number') return undefined;
  return {
    s: c.s,
    v,
    of: c.of,
    n: c.n,
    ...(c.s === 'failed' ? { is: readIssues(c.is) } : {}),
    ...(typeof c.air === 'number' ? { air: c.air } : {}),
    ...(typeof c.id === 'string' ? { id: c.id.slice(0, 40) } : {}),
  };
}

// ── THE WORDS FOR ONE ISSUE ──────────────────────────────────────────────────────────────────

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "(script error)", the reason a graphic did not prepare, as the plan words it. */
function reasonOf(issue: ReadyIssue): string {
  if (issue.k === 'audio') return 'sound not prepared';
  if (issue.k === 'script') return 'script error';
  if (issue.k === 'silent') return 'did not answer';
  if (issue.k === 'image') return 'image not loaded';
  if (issue.k === 'font') return 'font not loaded';
  return 'not prepared';
}

/** "A", "A and B", "A, B and C". */
function listWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What to do about a graphic that did not prepare, for the panel. */
function adviceOf(issue: ReadyIssue): string {
  if (issue.k === 'audio') return `${issue.g ?? 'A graphic'}: ${issue.d ?? 'Sound is not prepared'}. Check Sounds and the receiving browser audio, then Prepare again. Visual commands remain available.`;
  if (issue.k === 'script') {
    return `${issue.g ?? 'A graphic'} threw an error while loading${issue.d ? `: ${issue.d}` : ''}. It will not play on this output. Fix it in the editor and publish again.`;
  }
  return `${issue.g ?? 'A graphic'} did not answer its check. Reload this output.`;
}

/**
 * THE DEGRADED LINES for the issues that do not stop a graphic, ONE PER KIND, so an output whose
 * font host is unreachable says so once ("Using a fallback font for Space Grotesk and Inter")
 * rather than once per typeface. Each comes with what to do about it.
 */
function degradedLines(issues: readonly ReadyIssue[]): { line: string; advice: string }[] {
  const out: { line: string; advice: string }[] = [];
  const fonts = issues.filter((i) => i.k === 'font');
  if (fonts.length > 0) {
    const faces = fonts.map((i) => i.d ?? '').filter((d, at, all) => d && all.indexOf(d) === at);
    out.push({
      line: faces.length > 0 ? `Using a fallback font for ${listWords(faces)}` : 'Using a fallback font',
      advice: `Text in ${faces.length === 1 ? 'that typeface' : 'those typefaces'} shows in a fallback face. Check that the output can reach the fonts (its network, or a proxy in the way), then reload it.`,
    });
  }
  const images = issues.filter((i) => i.k === 'image');
  if (images.length > 0) {
    const first = images[0];
    out.push({
      line: images.length === 1 ? `An image did not load in ${first.g ?? 'a graphic'}${first.d ? ` (${first.d})` : ''}` : `${images.length} images did not load`,
      advice: `${images.map((i) => `${i.g ?? 'a graphic'}${i.d ? `: ${i.d}` : ''}`).join('; ')}. Check the picture in the graphic, then publish again.`,
    });
  }
  if (issues.some((i) => i.k === 'sync')) {
    out.push({ line: 'Catching up on missed commands', advice: 'It is reading commands it missed. It settles by itself; if it stays, reload this output.' });
  }
  return out;
}

/** The output's own debug line: READY as far as the output itself can tell, without what only an
 *  operator page knows (the published version, and the roads it judges from the entry). */
export function outputStateWords(ready: OutputReady): string {
  const version = ready.v ? ` (v${ready.v.n})` : '';
  if (ready.n < ready.of) return `Preparing ${ready.n} of ${ready.of}${version}`;
  const broken = ready.is.filter((i) => i.k === 'script' || i.k === 'silent' || i.k === 'audio');
  if (broken.length > 0) return `Not ready: ${broken.map((i) => `${i.g ?? 'a graphic'} (${reasonOf(i)})`).join(', ')}${version}`;
  const degraded = degradedLines(ready.is).map((d) => d.line);
  return `${degraded.length > 0 ? degraded.join('; ') : 'Ready for playout'}${version}`;
}

// ── THE OPERATOR'S READING ───────────────────────────────────────────────────────────────────

/** An output the production page has seen, remembered so that its absence is a red line. */
export interface ExpectedOutput {
  /** Its instance id (livePath.ts `liveInstanceId`). */
  id: string;
  /** What the operator calls it: `&name=` on its URL, else its engine. */
  name: string;
  /** When it was last seen on the live topic, epoch ms on this page's clock. */
  seen: number;
}

/** An expected output with no entry for this long reads "not answering" in red. A reload is back in
 *  2 to 5 s; a gone socket leaves Presence at once. */
export const NOT_ANSWERING_MS = 15_000;

/** The last Prepare for Live's result (landing b), as the production page keeps and announces it. */
export interface ReadyStamp {
  /** When it was checked, epoch ms. */
  at: number;
  /** The version it checked. */
  v: HeldVersion;
  /** Outputs it counted, and how many of them were ready. */
  outputs: number;
  ready: number;
  /** Lines that were amber, and lines that were red. */
  warnings: number;
  problems: number;
}

export type ReadyTone = 'ok' | 'warn' | 'bad' | 'idle';

/** The glyph each tone wears beside its words, on every READY and playout status surface. */
export const TONE_DOT: Record<ReadyTone, string> = { ok: '●', warn: '▲', bad: '✕', idle: '○' };

/** One output, as the panel lists it. */
export interface OutputLine {
  id: string;
  name: string;
  tone: ReadyTone;
  /** The headline, in the plan's words; a gone output's reads after its name ("not answering (40 s)"). */
  state: string;
  /** Everything else worth knowing: what fails and what to do, the engine, the version. */
  detail: string[];
  present: boolean;
  /** An absent expected output: forgetting it is offered. */
  gone: boolean;
  /** A graphic here cannot play: the headline's short form without the reason ("Not ready:
   *  Hairline"). READY reads it amber, because the output's other graphics still air; the
   *  production page's status reads it red (control/playoutStatus.ts). */
  broken?: string;
}

export interface ReadySummary {
  tone: ReadyTone;
  /** The header line on a desktop. */
  label: string;
  /** The header line on a phone. */
  short: string;
  /** The tooltip: every output's line. */
  why: string;
  show: boolean;
  /** Outputs counted, and ready. */
  outputs: number;
  ready: number;
  /** Where it came from: READY entries, or Step 1's health line underneath. */
  source: 'ready' | OutputHealth['source'];
  /** READY's own deciding words, without the dot or the count ("Behind: showing v12", "Preparing 3
   *  of 8"); absent on Step 1's line. What the production page's status reads, never the label. */
  lead?: string;
  /** The outputs are still loading their graphics. */
  preparing?: boolean;
  /** The first output naming a graphic that cannot play: its headline, and the short form. */
  broken?: { line: string; short: string } | null;
  /** The name of the first expected output gone long enough to count as lost. */
  lost?: string;
}

export interface ReadinessView {
  summary: ReadySummary;
  outputs: OutputLine[];
}

/** "40 s", "3 min", "1 h 5 min". */
export function ageWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** "14:02", on the reading page's clock. */
export function clockWords(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The outputs among the peers, ONE PER INSTANCE, the newest entry winning. A reloaded browser
 * source keeps its instance id (session storage), and a page that was on the topic before the
 * reload can hold the old entry beside the new one for a while (seen on the preview branch: the
 * dashboard read "2 outputs" for one renderer reloaded 20 s earlier). One id is one renderer.
 * Step 1's health line and READY count them by this one rule.
 */
export function oneEntryPerOutput(peers: readonly LiveEntry[]): LiveEntry[] {
  const byId = new Map<string, LiveEntry>();
  for (const p of peers) {
    if (p.kind !== 'output') continue;
    const held = byId.get(p.id);
    if (!held || p.at > held.at) byId.set(p.id, p);
  }
  return Array.from(byId.values());
}

/** What an output is called on the panel: the name its URL gave it, else its engine. */
export function outputName(entry: Pick<LiveEntry, 'name' | 'engine'>): string {
  return entry.name || entry.engine;
}

/** The newest of several known versions, by number: a page that opened before a publish learns it
 *  from an output that booted after it. */
export function newestVersion(...versions: (HeldVersion | null | undefined)[]): HeldVersion | null {
  let best: HeldVersion | null = null;
  for (const v of versions) if (v && (!best || v.n > best.n)) best = v;
  return best;
}

/**
 * THE EXPECTED OUTPUTS after a Presence update (R5): every output present is expected from now on.
 * One this page already remembers keeps its place and is seen now. A new one whose name matches a
 * remembered output that is gone TAKES ITS PLACE - a CasparCG layer played again is a new page with
 * a new instance id, and without this it would read as a new output beside a dead one. Otherwise it
 * is added at the end. One that was present at the last update (`wasPresent`) and is gone now was
 * last seen NOW: that is when it stopped answering, whenever its entry last changed.
 */
export function rememberOutputs(
  expected: readonly ExpectedOutput[],
  present: readonly LiveEntry[],
  now: number,
  wasPresent: ReadonlySet<string> = new Set(),
): ExpectedOutput[] {
  const next = expected.map((e) => ({ ...e }));
  const here = oneEntryPerOutput(present);
  const ids = new Set(here.map((o) => o.id));
  for (const e of next) if (wasPresent.has(e.id) && !ids.has(e.id)) e.seen = now;
  for (const o of here) {
    const name = outputName(o);
    const known = next.find((e) => e.id === o.id);
    if (known) {
      known.seen = now;
      known.name = name;
      continue;
    }
    const replaced = next.find((e) => !ids.has(e.id) && e.name === name);
    if (replaced) {
      replaced.id = o.id;
      replaced.seen = now;
      continue;
    }
    next.push({ id: o.id, name, seen: now });
  }
  return next;
}

/** The expected list without one output (the panel's Forget). */
export function forgetOutput(expected: readonly ExpectedOutput[], id: string): ExpectedOutput[] {
  return expected.filter((e) => e.id !== id);
}

/** Whether two expected lists differ in anything but the times: what is worth storing or announcing. */
export function sameOutputs(a: readonly ExpectedOutput[], b: readonly ExpectedOutput[]): boolean {
  return a.length === b.length && a.every((e, i) => e.id === b[i].id && e.name === b[i].name);
}

/** One present output's line. */
function presentLine(entry: LiveEntry, name: string, published: HeldVersion | null): OutputLine {
  const ready = entry.ready;
  const engine = `${entry.engine}${entry.build ? `, build ${entry.build}` : ''}`;
  const detail: string[] = [];
  const base = { id: entry.id, name, present: true, gone: false };
  if (!ready) {
    return {
      ...base,
      tone: 'idle',
      state: 'Connected, but loaded before READY existed',
      detail: [`Reload it to see whether it is ready. ${engine}.`],
    };
  }
  detail.push(`${ready.v ? `Holds v${ready.v.n} · ` : ''}${engine}.`);
  if (ready.sounds) detail.push(`Sounds prepared: ${ready.sounds.n} of ${ready.sounds.of} · ${(ready.sounds.bytes / 1048576).toFixed(1)} MiB decoded.${ready.sounds.bytes > 134217728 ? ' Large audio load. Reduce sound lengths or the number of assets before rehearsal.' : ''}`);
  const warn = (state: string, extra: string[] = []): OutputLine => ({ ...base, tone: 'warn', state, detail: extra.concat(detail) });

  // Still loading: nothing else can be judged yet.
  if (ready.n < ready.of) {
    return { ...base, tone: 'idle', state: `Preparing ${ready.n} of ${ready.of}`, detail };
  }
  // Everything that is wrong, most serious first, one line per kind: the first is the headline and
  // the others follow it in the panel ("Also: ..."), each with what to do.
  const problems: { line: string; advice: string[] }[] = [];
  // A graphic that cannot play: named, amber, never green.
  const broken = ready.is.filter((i) => i.k === 'script' || i.k === 'silent' || i.k === 'audio');
  let brokenShort: string | undefined;
  if (broken.length > 0) {
    const first = broken[0];
    const more = broken.length > 1 ? ` and ${plural(broken.length - 1, 'more graphic')}` : '';
    brokenShort = `Not ready: ${first.g ?? 'a graphic'}${more}`;
    problems.push({ line: `Not ready: ${first.g ?? 'a graphic'} (${reasonOf(first)})${more}`, advice: broken.map(adviceOf) });
  }
  // A newer version did not prepare: the running one stays, and says which change failed.
  const chg = ready.chg;
  if (chg && chg.s === 'failed' && published && chg.v.h === published.h) {
    const failed = chg.is ?? [];
    const first = failed[0];
    const named = first ? `: ${first.g ?? 'a graphic'} (${reasonOf(first)})` : '';
    problems.push({
      line: `Ready · ${plural(failed.length || 1, 'change')} not prepared${named}`,
      advice: failed.map(adviceOf).concat([`It keeps running v${ready.v?.n ?? '?'} until the change is fixed.`]),
    });
  }
  // Degraded: reachable, but a guarantee fails.
  const degraded: { line: string; advice: string }[] = [];
  if (entry.log === false) {
    degraded.push({
      line: 'Commands may arrive up to 30 s late',
      advice: 'It is not on the live channel, so what you take reaches it through the 30 s poll. Check its network, or reload it.',
    });
  } else if (entry.cmd === false) {
    degraded.push({ line: 'Commands may arrive late', advice: 'Its fast road has not joined, so commands come by the log, a few hundred ms slower.' });
  }
  degraded.push(...degradedLines(ready.is));
  // Preparing the published version is the one way of being behind that is on its way to being
  // fixed: it reads as the plan's "Ready · 1 change preparing", green, below.
  const preparingPublished = !!(chg && chg.s === 'preparing' && published && chg.v.h === published.h);
  // A change that failed for the published version already says why this output is behind, and
  // pressing Prepare for Live again would not fix it: no second line for it.
  const failedPublished = !!(chg && chg.s === 'failed' && published && chg.v.h === published.h);
  const behind =
    !preparingPublished && !failedPublished && published && published.h !== (ready.v?.h ?? '') && (!ready.v || ready.v.n < published.n);
  if (behind) {
    degraded.push({
      line: ready.v ? `Behind: showing v${ready.v.n}` : 'Behind: showing an older version',
      advice:
        chg && chg.s === 'waiting'
          ? `v${published.n} is prepared, but ${plural(chg.air ?? 1, 'graphic')} ${chg.air === 1 ? 'is' : 'are'} on air here. Preparation resumes automatically after all graphics are off air. Keep running the current prepared cues while output and connection checks stay green.`
          : `v${published.n} is published. A deferred preparation retries automatically. Check now asks again.`,
    });
  }
  for (const d of degraded) problems.push({ line: d.line, advice: [d.advice] });
  if (problems.length > 0) {
    // What to do first, then what else is wrong, then who it is.
    const also = problems.length > 1 ? [`Also: ${problems.slice(1).map((p) => p.line).join('; ')}.`] : [];
    const line = warn(problems[0].line, problems[0].advice.concat(also, ...problems.slice(1).map((p) => p.advice)));
    return brokenShort ? { ...line, broken: brokenShort } : line;
  }
  if (preparingPublished && chg) {
    return { ...base, tone: 'ok', state: `Ready · ${plural(chg.of, 'change')} preparing`, detail: [`Preparing v${chg.v.n}: ${chg.n} of ${chg.of} done.`].concat(detail) };
  }
  return { ...base, tone: 'ok', state: 'Ready for playout', detail };
}

/**
 * THE READY LINE, decided once for both operator surfaces.
 *
 * From the outputs' own entries while this page's Presence is joined and there is an output to talk
 * about (present, or expected and gone). Otherwise, and also when every output present was loaded
 * before this step and none is missing, Step 1's health line (`fallback`) stands exactly as it was:
 * a server without the live topic, or an old output, reads as it did yesterday.
 */
export function describeReadiness(input: {
  presence: 'off' | 'joining' | 'joined' | 'down';
  peers: readonly LiveEntry[];
  expected: readonly ExpectedOutput[];
  /** The newest published version this page knows (its resolve, its own publish, an operator's
   *  announcement); raised further by any output holding a newer one. */
  published: HeldVersion | null;
  stamp?: ReadyStamp | null;
  /** Step 1's line, for when READY has nothing to say. */
  fallback: OutputHealth;
  now: number;
}): ReadinessView {
  const fallbackView = (): ReadinessView => ({
    summary: { ...input.fallback, ready: 0, outputs: input.fallback.outputs },
    outputs: [],
  });
  if (input.presence !== 'joined') return fallbackView();
  const present = oneEntryPerOutput(input.peers);
  const published = newestVersion(input.published, ...present.map((o) => o.ready?.v));
  const presentIds = new Set(present.map((o) => o.id));
  const gone = input.expected.filter((e) => !presentIds.has(e.id));
  if (present.length === 0 && gone.length === 0) return fallbackView();
  if (gone.length === 0 && present.every((o) => !o.ready)) {
    return { summary: { ...input.fallback, ready: 0 }, outputs: present.map((o) => presentLine(o, outputName(o), published)) };
  }

  // Names, told apart when two outputs share one ("OBS · Chromium 127", "OBS · Chromium 127 #2").
  const order = input.expected.map((e) => e.id);
  const rank = (id: string) => {
    const at = order.indexOf(id);
    return at < 0 ? order.length : at;
  };
  const lines: OutputLine[] = [
    ...present.map((o) => presentLine(o, outputName(o), published)),
    ...gone.map((e): OutputLine => {
      // `seen` 0: announced while it was present, and this page never saw it leave.
      const age = e.seen > 0 ? input.now - e.seen : NOT_ANSWERING_MS;
      const late = age >= NOT_ANSWERING_MS;
      return {
        id: e.id,
        name: e.name,
        tone: late ? 'bad' : 'idle',
        state: `not answering${e.seen > 0 ? ` (${ageWords(age)})` : ''}`,
        detail: [
          late
            ? 'It was connected and is gone. Check that its browser source or CasparCG layer is still open on the output URL, or forget it if it is not coming back.'
            : 'It has just left; a reloading output is back in a few seconds.',
        ],
        present: false,
        gone: true,
      };
    }),
  ].sort((a, b) => rank(a.id) - rank(b.id));
  const seen = new Map<string, number>();
  for (const line of lines) {
    const n = (seen.get(line.name) ?? 0) + 1;
    seen.set(line.name, n);
    if (n > 1) {
      line.name = `${line.name} #${n}`;
    }
  }

  const total = lines.length;
  const readyCount = lines.filter((l) => l.tone === 'ok').length;
  const of = `${readyCount} of ${total} output${total === 1 ? '' : 's'}`;
  // A gone output's state is about it by name ("CasparCG 1-20 not answering (40 s)"); a present
  // one's is prefixed with its name only when there is more than one to tell apart.
  const headline = (line: OutputLine) => (!line.present ? `${line.name} ${line.state}` : total > 1 ? `${line.name}: ${line.state}` : line.state);
  const why = lines.map((l) => `${l.name}: ${l.state}.${l.detail.length ? ` ${l.detail[0]}` : ''}`).join('\n');
  const firstBroken = lines.find((l) => l.present && l.broken);
  const broken = firstBroken
    ? { line: headline(firstBroken), short: total > 1 ? `${firstBroken.name}: ${firstBroken.broken}` : firstBroken.broken! }
    : null;
  const lost = lines.find((l) => l.gone && l.tone === 'bad')?.name;
  /** The line is the dot, the deciding words (`lead`) and, red, the count. */
  const summary = (tone: ReadyTone, lead: string, short: string, { suffix = '', preparing = false } = {}): ReadinessView => ({
    summary: {
      tone,
      label: `${TONE_DOT[tone]} ${lead}${suffix}`,
      short: `${TONE_DOT[tone]} ${short}`,
      why,
      show: true,
      outputs: total,
      ready: readyCount,
      source: 'ready',
      lead,
      preparing,
      broken,
      lost,
    },
    outputs: lines,
  });

  const bad = lines.filter((l) => l.tone === 'bad');
  if (bad.length > 0) return summary('bad', headline(bad[0]), `${readyCount}/${total} ready`, { suffix: ` · ${of} ready` });
  const warn = lines.filter((l) => l.tone === 'warn');
  if (warn.length > 0) return summary('warn', headline(warn[0]), `${readyCount}/${total} ready`);
  const preparing = present
    .filter((o) => o.ready && o.ready.n < o.ready.of)
    .sort((a, b) => a.ready!.n / Math.max(1, a.ready!.of) - b.ready!.n / Math.max(1, b.ready!.of));
  if (preparing.length > 0) {
    const r = preparing[0].ready!;
    return summary('idle', `Preparing ${r.n} of ${r.of}`, `${r.n}/${r.of}`, { preparing: true });
  }
  const idle = lines.filter((l) => l.tone === 'idle');
  if (idle.length > 0) return summary('idle', headline(idle[0]), `${readyCount}/${total} ready`);
  const changing = lines.find((l) => l.state.indexOf('preparing') >= 0);
  if (changing) return summary('ok', changing.state, `Ready ${readyCount}/${total}`);
  const stamp = input.stamp;
  if (stamp && published && stamp.v.h === published.h && stamp.problems === 0 && stamp.warnings === 0) {
    return summary('ok', `Ready for Live · ${of} · checked ${clockWords(stamp.at)}`, `Ready ${readyCount}/${total}`);
  }
  return summary('ok', `Ready for playout · ${of}`, `Ready ${readyCount}/${total}`);
}
