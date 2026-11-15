import { randomUUID } from 'node:crypto';
import type { ActResult, AdapterResult } from './adapters/casparcg.js';
import type { AgentError, MediaPlayback, PlayoutAction, SlotState, VmixInput, VmixPlayer } from './protocol.js';
import { sameVmixPath, VMIX_PLAYERS, VMIX_PLAYER_TITLE, vmixMediaKind, vmixMediaName, VmixDeadline, VmixPublicationUncertain, withinVmixDeadline, type VmixMedia } from './vmixMedia.js';
import { vmixInputXPath, vmixOccurrenceXPath, type VmixVideoList, type VmixXml } from './vmixTcp.js';
import { VMIX_CLOCK_POLL_MS, VMIX_FRAME_MS, VMIX_RAMP_REPLACEMENT_MS, VMIX_SEEK_SETTLE_MS, fadeFrame, gainSettings, trimSegment, vmixClipClock, volumeAt, type AlphaFade, type ClipSegment, type VmixClipClock } from './vmixClipTimer.js';

type Failure = { ok: false; error: AgentError };
type PlayerMatch = PlayerInput | (Failure & { foreign?: true }) | undefined;
export type VmixActResult = ActResult & { generation?: number; instance?: string };
/** The HTTP parser sets this only for the current guarded player verbs. */
export type VmixAction = PlayoutAction & { requireMeasuredPlayer?: true };
type Setup = Awaited<ReturnType<VmixMedia['setup']>>;

export interface PlayerMixer {
  connectionId?: number;
  until: number;
  read: () => Promise<AdapterResult<VmixXml>>;
  readText: (xpath: string) => Promise<string | undefined>;
  send: (name: string, params: Record<string, string>) => Promise<AdapterResult<null>>;
}
interface Mixer extends PlayerMixer {
  before: VmixXml;
  session?: string;
}
type PlayerSend = (name: string, value?: string | number) => Promise<AdapterResult<null>>;
type ListRead = () => Promise<VmixVideoList | undefined>;
type PlaybackState = 'Paused' | 'Running' | 'Completed';
type Occurrence = { key: string; list: VmixVideoList };
interface OccurrenceGuard {
  states?: readonly PlaybackState[];
  segment?: ClipSegment;
  boundary?: number;
  muted?: boolean;
  silent?: boolean;
}
type PositionObservation = number | 'missing' | 'invalid';
type TimerTurn = (port: number, connectionId: number, run: (mixer: PlayerMixer) => Promise<void>) => Promise<boolean>;
interface PlayerInput {
  input: VmixInput;
  list: VmixVideoList;
}

interface TakeIdentity {
  id: string;
  cueId?: string;
  sourceName: string;
  file: string;
  key: string;
  list: VmixVideoList;
  lastMeasuredPositionMs?: number;
  trim?: ClipSegment;
  end: NonNullable<MediaPlayback['end']>;
  fadeOut?: number;
  fader: number;
  presentation: PlayerPresentation;
  armed: boolean;
}
interface ClipWork {
  generation: number;
  connectionId: number;
  root: string;
  cancel?: () => void;
  out?: { finish: (result: VmixActResult) => void };
  boundaryAt?: number;
  pausedAtBoundary?: boolean;
  quieting?: boolean;
}
interface PlayerPresentation {
  alpha: number;
  ramp?: { target: number };
  fade?: AlphaFade & { kind: 'in' | 'end' | 'out'; clipAt?: number };
  cover?: { originalMute?: boolean; zeroVolume?: true };
}
interface PlayerMemory {
  generation: number;
  take?: TakeIdentity;
  work?: ClipWork;
  presentations: Map<string, PlayerPresentation>;
  created?: { key: string; attempt: string };
}

const failure = (code: AgentError['code'], detail: string): Failure => ({ ok: false, error: { hop: 'target', code, detail } });
const refused = (detail: string) => failure('refused', detail);
const uncertain = (what: string) => failure('uncertain', 'vMix accepted ' + what + ', but Bridge could not confirm the result. Check vMix before trying again.');
const unchanged = (raw: string): VmixActResult => ({ ok: true, raw, value: {} });
const selectedFile = (list: VmixVideoList) => list.items[list.selected - 1];
const otherPlayer = (player: VmixPlayer): VmixPlayer => player === 'clips' ? 'audio' : 'clips';
const savedKey = (setup: Setup, player: VmixPlayer) => setup.players[player]?.key.toLowerCase();
const aliasesPeer = (setup: Setup, player: VmixPlayer, key: string) => savedKey(setup, otherPlayer(player)) === key;
const reached = (list: VmixVideoList, boundary: number) =>
  list.positionMs >= boundary || (list.state === 'Completed' && list.durationMs === boundary);
const withinSegment = (position: number, segment: ClipSegment) => position >= segment.inMs && position < segment.outMs;
const inSegment = (list: VmixVideoList, segment: ClipSegment) => withinSegment(list.positionMs, segment);
const isPosition = (position: PositionObservation): position is number => typeof position === 'number';
const hasTiming = (list: VmixVideoList, file = selectedFile(list)) => list.durationMs > 0 || (!!file && vmixMediaKind(file) === 'still');
const poll = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const POLL_MS = 125;

function readyForPlayback(player: VmixPlayer, list: VmixVideoList, mute?: boolean): boolean {
  return mute !== undefined ? list.muted === mute : player === 'clips' || list.muted === false;
}

function playerForMedia(name: string): VmixPlayer | undefined {
  const kind = vmixMediaKind(name);
  if (kind) return kind === 'audio' ? 'audio' : 'clips';
}

export function unsupportedPlayerAction(action: PlayoutAction, player: VmixPlayer): string | undefined {
  if (action.verb === 'update' || action.verb === 'next' || action.verb === 'sequence') return action.verb;
  if ('expectedOverlayInput' in action && action.expectedOverlayInput !== undefined) return 'an overlay expectation on a player';
  if ('item' in action && action.item && action.item.kind !== 'media') return action.item.kind;
  if (action.verb === 'take') {
    if (action.imageFit !== undefined) return 'image fit';
    if (action.data && Object.keys(action.data).length) return 'template data';
    const { playback } = action;
    if (playback?.fadeOut !== undefined && playback.end !== 'clear') return 'a fade out without Clear';
    if (action.loop && playback?.end && playback.end !== 'loop') return 'conflicting endings';
  }
  if (action.verb === 'out' && action.fadeOut !== undefined && !action.expectedPlayerInstance) return 'a fade without a held player instance';
  if (action.verb === 'ending' && action.then !== undefined) return 'a sequence';
  if (action.verb === 'ending' && action.playback?.end === 'clear' && !action.expectedPlayerInstance) return 'Clear without a held player instance';
  if (action.verb === 'take' || action.verb === 'ending') {
    if (!vmixMediaName(action.item.name)) return 'a path outside the media folder';
    const kind = vmixMediaKind(action.item.name);
    if (kind === 'still' && (action.verb === 'ending' || action.playback?.trim || (action.playback?.end && action.playback.end !== 'hold'))) return 'a timed ending or trim on a still';
    const expectedPlayer = playerForMedia(action.item.name);
    if (!expectedPlayer) return 'this media type';
    if (player !== expectedPlayer) return 'this media type on ' + VMIX_PLAYER_TITLE[player];
  }
}

function readablePlayback(list: VmixVideoList): boolean {
  if (!['Running', 'Paused', 'Completed'].includes(list.state)) return false;
  return list.items.length
    ? list.selected >= 1 && list.selected <= list.items.length && list.positionMs <= list.durationMs
    : list.selected <= 1 && list.positionMs === 0 && list.durationMs === 0;
}

function playbackList(xml: VmixXml, key: string): VmixVideoList | undefined {
  const list = xml.lists.get(key);
  return list && readablePlayback(list) ? list : undefined;
}

function matchPlayer(xml: VmixXml, setup: Setup, player: VmixPlayer): PlayerMatch {
  const label = VMIX_PLAYER_TITLE[player];
  const saved = savedKey(setup, player);
  let input = xml.inputs.find(candidate => candidate.key === saved);
  if (!input) {
    const names = xml.inputs.filter(candidate => xml.shortTitles.get(candidate.key) === label);
    const displayConflict = xml.inputs.some(candidate => xml.shortTitles.get(candidate.key) !== label &&
      (candidate.title === label || candidate.title.startsWith(label + ' - ')));
    if (names.length > 1 || displayConflict) return refused('vMix did not identify one input as ' + label + '. Check the inputs in vMix.');
    [input] = names;
  }
  if (!input) return;
  if (aliasesPeer(setup, player, input.key)) return refused(label + ' does not identify its own vMix Video List.');
  if (input.type !== 'VideoList') return { ...refused(label + ' does not identify its own vMix Video List.'), foreign: true };
  const list = playbackList(xml, input.key);
  if (!list) {
    return refused('vMix did not report the list state for ' + label + '. Check the input in vMix.');
  }
  return { input, list };
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((file, i) => sameVmixPath(file, b[i]));
}

function sameSelection(a: VmixVideoList, b: VmixVideoList): boolean {
  return a.selected === b.selected && sameItems(a.items, b.items);
}

function rememberSelection(take: TakeIdentity, list: VmixVideoList): void {
  take.list = list;
  if (list.durationMs > 0) take.lastMeasuredPositionMs = list.positionMs;
}

function addedInput(known: ReadonlyMap<string, VmixInput>, xml: VmixXml): VmixInput | null | undefined {
  const added = xml.inputs.filter(input => !known.has(input.key));
  const old = xml.inputs.filter(input => known.has(input.key));
  if (added.length > 1 || old.length !== known.size || old.some(input => {
    const previous = known.get(input.key)!;
    return input.type !== previous.type || input.title !== previous.title;
  })) return null;
  return added[0];
}

/** vMix 29's two startup positions can contain native Blank placeholders that rekey on AddInput. */
function replacedBlank(before: VmixXml, xml: VmixXml, known: ReadonlyMap<string, VmixInput>): VmixInput | null | undefined {
  if (before.inputs.length !== 2 || xml.inputs.length !== 2 || before.version !== xml.version || before.edition !== xml.edition) return null;
  let candidate: VmixInput | undefined;
  for (const old of before.inputs) {
    if (old.number > 2) return null;
    const next = xml.inputs.find(input => input.number === old.number);
    if (!next) return null;
    if (!before.blanks.has(old.key)) {
      if (next.key !== old.key || next.type !== old.type || next.title !== old.title) return null;
      continue;
    }
    if (xml.blanks.has(next.key)) continue;
    const list = playbackList(xml, next.key);
    if (candidate || known.has(next.key) || next.title !== 'List' || xml.shortTitles.get(next.key) !== 'List' ||
        !list || list.items.length || list.state !== 'Completed' || list.selected !== 1 || list.positionMs || list.durationMs) return null;
    candidate = next;
  }
  return candidate;
}

async function newList(mixer: Mixer): Promise<VmixInput | undefined> {
  const known = new Map(mixer.before.inputs.map(input => [input.key, input]));
  const until = Math.min(mixer.until - 500, Date.now() + 2250);
  let candidate: VmixInput | undefined;
  // AddInput returns no key. Require a unique, unchanged empty candidate in consecutive snapshots.
  while (Date.now() < until) {
    const reading = await mixer.read();
    if (!reading.ok) return;
    const xml = reading.value;
    const ordinary = addedInput(known, xml);
    const input = ordinary === null ? replacedBlank(mixer.before, xml, known) : ordinary;
    if (input === null) return;
    if (input) {
      const list = playbackList(xml, input.key);
      if (!list || list.items.length) return;
      if (candidate) {
        if (candidate.key === input.key && candidate.number === input.number && candidate.title === input.title) return input;
        return;
      }
      candidate = input;
    } else if (candidate) return;
    await poll(POLL_MS);
  }
}

export function createVmixPlayers(media: VmixMedia, timerTurn: TimerTurn, clock: VmixClipClock = vmixClipClock) {
  const memories = new Map<string, PlayerMemory>();

  function memory(port: number, player: VmixPlayer): PlayerMemory {
    const id = port + '/' + player;
    let saved = memories.get(id);
    if (!saved) {
      saved = { generation: 0, presentations: new Map() };
      memories.set(id, saved);
    }
    return saved;
  }

  function presentationFor(saved: PlayerMemory, key: string): PlayerPresentation {
    let presentation = saved.presentations.get(key);
    if (!presentation) {
      presentation = { alpha: 255 };
      saved.presentations.set(key, presentation);
    }
    return presentation;
  }

  function reconcile(port: number, player: VmixPlayer, current: PlayerInput | undefined): PlayerMemory {
    const saved = memory(port, player);
    const take = saved.take;
    if (!take) return saved;
    if (!current || current.input.key !== take.key || !sameSelection(current.list, take.list) ||
        (!take.presentation.cover && !current.list.loop && current.list.durationMs > 0 && take.lastMeasuredPositionMs !== undefined &&
          current.list.positionMs + 750 < take.lastMeasuredPositionMs)) {
      stopWork(saved);
      delete saved.take;
    } else if (!take.presentation.cover && (!take.trim || current.list.positionMs >= take.trim.inMs)) {
      rememberSelection(take, current.list);
    }
    return saved;
  }

  function reconcileObserved(port: number, player: VmixPlayer, candidate: PlayerMatch): PlayerMemory | undefined {
    if (candidate && 'error' in candidate) {
      return candidate.foreign ? reconcile(port, player, undefined) : undefined;
    }
    return reconcile(port, player, candidate);
  }

  async function playbackProblem(port: number, player: VmixPlayer, list: VmixVideoList, until: number): Promise<Failure | undefined> {
    // Auto Play Next is not observable. A list can reach predecessors as well as successors.
    for (const file of new Set(list.items)) {
      const relative = await withinVmixDeadline(until, () => media.relativeFile(port, file));
      if (!relative || playerForMedia(relative) !== player) {
        return refused('A file on ' + VMIX_PLAYER_TITLE[player] + ' is unavailable in its media folder. Use Clear or Out before playing another file.');
      }
    }
  }

  async function observe(
    port: number, player: VmixPlayer, mixer: Mixer, key: string,
    accept: (list: VmixVideoList) => boolean, checkFiles = true,
    stillOwned?: (xml: VmixXml) => boolean,
  ): Promise<VmixVideoList | Failure | undefined> {
    while (Date.now() < mixer.until) {
      const current = await mixer.read();
      if (!current.ok || (stillOwned && !stillOwned(current.value))) return;
      const list = current.value.lists.get(key);
      if (list) {
        if (!readablePlayback(list)) return;
        if (checkFiles) {
          try {
            const problem = await playbackProblem(port, player, list, mixer.until);
            if (problem) return problem;
          } catch (error) {
            if (error instanceof VmixDeadline) return;
            throw error;
          }
        }
        if (accept(list)) return list;
      }
      if (Date.now() + POLL_MS >= mixer.until) return;
      await poll(POLL_MS);
    }
  }


  function stopWork(saved: PlayerMemory, result: VmixActResult = uncertain('finishing the timed player action')): void {
    const work = saved.work;
    if (!work) return;
    delete saved.work;
    work.cancel?.();
    work.out?.finish(result);
  }

  function keyed(mixer: PlayerMixer, key: string): PlayerSend {
    return (name, value) => mixer.send(name, { Input: key, ...(value === undefined ? {} : { Value: String(value) }) });
  }

  async function ramp(presentation: PlayerPresentation, send: PlayerSend, target: number, durationMs: number) {
    // A lost reply still leaves a native ramp possible on this GUID.
    const prior = presentation.ramp;
    presentation.ramp = { target };
    const minimum = prior ? VMIX_RAMP_REPLACEMENT_MS : 1;
    const result = await send('SetVolumeFade', String(target) + ',' + Math.max(minimum, Math.round(durationMs)));
    if (!result.ok && result.error.code !== 'uncertain') presentation.ramp = prior;
    return result;
  }

  async function putVolume(presentation: PlayerPresentation, send: PlayerSend, target: number, read: ListRead, until: number, confirm = false) {
    const supersedes = !!presentation.ramp;
    const result = supersedes ? await ramp(presentation, send, target, VMIX_RAMP_REPLACEMENT_MS) : await send('SetVolume', target);
    if (!result.ok || (!confirm && !supersedes)) return result;
    const settleAt = Date.now() + (supersedes ? 2 * VMIX_RAMP_REPLACEMENT_MS : 0);
    while (Date.now() < until) {
      const current = await read();
      if (!current) break;
      if (Date.now() >= settleAt && volumeAt(current.volume, target)) {
        delete presentation.ramp;
        return result;
      }
      if (Date.now() + VMIX_FRAME_MS >= until) break;
      await poll(VMIX_FRAME_MS);
    }
    return uncertain('settling the player volume');
  }

  function occurrencePath({ key, list }: Occurrence, guard: OccurrenceGuard = {}): string {
    const { states, segment, boundary, muted, silent } = guard;
    const state = states ? '[' + states.map(value => "@state='" + value + "'").join(' or ') + ']' : '';
    const range = segment ? '[@position >= ' + segment.inMs + ' and @position < ' + segment.outMs + ']' : '';
    const endpoint = boundary === undefined ? '' :
      '[@position >= ' + boundary + " or (@state='Completed' and @duration=" + boundary + ')]';
    return vmixOccurrenceXPath(key, list, muted) + state + range + endpoint + (silent ? '[@volume and number(@volume)=0]' : '');
  }

  function guardFor(take: TakeIdentity): OccurrenceGuard {
    return {
      muted: take.presentation.cover?.originalMute !== undefined ? true : vmixMediaKind(take.file) === 'audio' ? false : undefined,
      silent: take.presentation.cover?.zeroVolume,
    };
  }

  function parsePosition(raw: string | undefined, duration: number): PositionObservation {
    if (raw === undefined) return 'missing';
    if (!/^(?:0|[1-9]\d*)$/.test(raw)) return 'invalid';
    const position = Number(raw);
    return Number.isSafeInteger(position) && position <= duration ? position : 'invalid';
  }

  async function samplePosition(mixer: PlayerMixer, occurrence: Occurrence, guard: OccurrenceGuard): Promise<PositionObservation> {
    const raw = await mixer.readText(occurrencePath(occurrence, guard) + '/@position');
    const position = parsePosition(raw, occurrence.list.durationMs);
    return isPosition(position) && guard.segment && !withinSegment(position, guard.segment) ? 'invalid' : position;
  }

  async function observePosition(mixer: PlayerMixer, occurrence: Occurrence, guard: OccurrenceGuard): Promise<PositionObservation> {
    const limit = Math.min(mixer.until, Date.now() + 450);
    while (Date.now() < limit) {
      const position = await samplePosition(mixer, occurrence, guard);
      if (position !== 'missing') return position;
      await poll(VMIX_FRAME_MS);
    }
    return 'missing';
  }

  async function muteCover(mixer: PlayerMixer, presentation: PlayerPresentation, send: PlayerSend, occurrence: Occurrence, phase: OccurrenceGuard = {}) {
    const muted = (await mixer.readText(occurrencePath(occurrence, phase) + '/@muted'))?.toLowerCase();
    if (muted !== 'true' && muted !== 'false') return false;
    const original = muted === 'true';
    if (!isPosition(await samplePosition(mixer, occurrence, { ...phase, muted: original }))) return false;
    const cover = presentation.cover ??= {};
    cover.originalMute ??= original;
    const matte = await send('SetAlpha', 0);
    if (!matte.ok) return false;
    presentation.alpha = 0;
    if (!original) {
      if (!isPosition(await samplePosition(mixer, occurrence, { ...phase, muted: false })) ||
          !(await send('AudioOff')).ok) return false;
    }
    return isPosition(await observePosition(mixer, occurrence, { ...phase, muted: true }));
  }

  async function restoreMute(mixer: PlayerMixer, take: TakeIdentity, send: PlayerSend, phase: OccurrenceGuard) {
    if (!isPosition(await samplePosition(mixer, take, { ...phase, muted: true })) ||
        !(await send('AudioOn')).ok) return false;
    return true;
  }

  async function recloseOutOfRange(mixer: PlayerMixer, take: TakeIdentity, send: PlayerSend) {
    if (!take.trim) return;
    const position = await samplePosition(mixer, take, { muted: false });
    if (isPosition(position) && !withinSegment(position, take.trim)) await send('AudioOff');
  }

  async function confirmListRemoval(mixer: PlayerMixer, take: TakeIdentity, before: VmixVideoList) {
    const guard: OccurrenceGuard = { ...guardFor(take), states: ['Running', 'Completed'] };
    const older: Occurrence = { key: take.key, list: before };
    const limit = Math.min(mixer.until, Date.now() + 450);
    while (Date.now() < limit) {
      const next = await samplePosition(mixer, take, guard);
      if (next !== 'missing') return next;
      // The full snapshot has already observed our ListRemove. A compact sample may still show
      // precisely its predecessor, because vMix updates the two views at different times.
      if (!isPosition(await samplePosition(mixer, older, guard))) break;
      await poll(VMIX_FRAME_MS);
    }
    return 'missing';
  }

  async function stoppedSeek(segment: ClipSegment, read: ListRead, send: PlayerSend, until: number): Promise<VmixVideoList | Failure> {
    let at = segment.inMs;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await read();
      if (!before || before.state === 'Running' || before.durationMs < segment.outMs) return uncertain('confirming the paused trim');
      const seek = await send('SetPosition', at);
      if (!seek.ok) return seek;
      const limit = Math.min(until, Date.now() + 450);
      let stableAt = Date.now();
      let previous: number | undefined;
      let settled: VmixVideoList | undefined;
      while (Date.now() < limit) {
        const row = await read();
        if (!row || row.state === 'Running' || row.durationMs !== before.durationMs) return uncertain('reading the paused seek');
        if (row.positionMs !== previous) {
          stableAt = Date.now();
          previous = row.positionMs;
        }
        if (Date.now() - stableAt >= VMIX_SEEK_SETTLE_MS) {
          settled = row;
          break;
        }
        await poll(VMIX_FRAME_MS);
      }
      if (settled && settled.positionMs >= segment.inMs && settled.positionMs < segment.outMs &&
          settled.positionMs <= at + VMIX_FRAME_MS) return settled;
      if (!settled || settled.positionMs >= segment.inMs || segment.inMs - settled.positionMs > VMIX_FRAME_MS) break;
      at = segment.inMs + VMIX_FRAME_MS;
      if (at >= segment.outMs) break;
    }
    return uncertain('seeking to the in point while the player is stopped');
  }

  function reader(mixer: PlayerMixer, take: TakeIdentity, seek = false): ListRead {
    if (!hasTiming(take.list, take.file)) return async () => undefined;
    const guard = guardFor(take);
    const path = occurrencePath(take, guard);
    return async () => {
      const measured = await mixer.readText(path + '/@volume');
      if (measured === undefined || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(measured)) return;
      const volume = Number(measured);
      if (volume > 100) return;
      let state = await mixer.readText(path + '/@state');
      if (state !== 'Paused' && state !== 'Running' && state !== 'Completed') return;
      // The last scalar binds the position to the still-current state and exact occurrence.
      let positionMs = await samplePosition(mixer, take, { ...guard, states: [state] });
      if (positionMs === 'missing' && state === 'Running') {
        // Natural completion may happen across the two reads. Require fresh exact evidence of it.
        state = 'Completed';
        positionMs = await samplePosition(mixer, take, { ...guard, states: ['Completed'] });
      }
      if (!isPosition(positionMs)) return;
      if (!seek && !take.list.loop && take.lastMeasuredPositionMs !== undefined && positionMs + 750 < take.lastMeasuredPositionMs) return;
      return { ...take.list, state, positionMs, volume, ...(take.presentation.cover?.originalMute !== undefined ? { muted: true } : {}) };
    };
  }

  async function observeStopped(read: ListRead, until: number): Promise<VmixVideoList | undefined> {
    const limit = Math.min(until, Date.now() + 450);
    while (Date.now() < limit) {
      const stopped = await read();
      if (!stopped || stopped.state !== 'Running') return stopped;
      await poll(VMIX_FRAME_MS);
    }
  }

  async function pauseAt(row: VmixVideoList, read: ListRead, send: PlayerSend, until: number, boundary = 0) {
    if (!reached(row, boundary)) return;
    if (row.state !== 'Running') return row;
    const result = await send('Pause');
    if (!result.ok) return;
    const stopped = await observeStopped(read, until);
    if (stopped && reached(stopped, boundary)) return stopped;
  }

  async function confirmEmpty(mixer: PlayerMixer, key: string, mute?: boolean): Promise<boolean> {
    const path = vmixInputXPath(key) + "[@type='VideoList'][count(list)=1][count(list/*)=0][@duration='0'][@selectedIndex='0' or @selectedIndex='1']" +
      (mute === undefined ? '' : "[translate(@muted,'TRUEFALS','truefals')='" + mute + "']") + '/@position';
    const limit = Math.min(mixer.until, Date.now() + 450);
    while (Date.now() < limit) {
      if (await mixer.readText(path) === '0') return true;
      await poll(VMIX_FRAME_MS);
    }
    return false;
  }

  async function restoreEmptyMute(mixer: PlayerMixer, key: string, presentation: PlayerPresentation, send: PlayerSend) {
    if (presentation.cover?.originalMute !== false) return true;
    return await confirmEmpty(mixer, key, true) && (await send('AudioOn')).ok && await confirmEmpty(mixer, key, false);
  }

  function attachWork(port: number, player: VmixPlayer, saved: PlayerMemory, take: TakeIdentity, mixer: PlayerMixer, root: string, work: Omit<ClipWork, 'root' | 'generation' | 'connectionId'> = {}) {
    if (mixer.connectionId === undefined || saved.take !== take || !hasTiming(take.list, take.file)) return;
    const current: ClipWork = { ...work, root, generation: saved.generation, connectionId: mixer.connectionId };
    saved.work = current;
    queueWork(port, player, saved, take, current, 0);
    return current;
  }

  function queueWork(port: number, player: VmixPlayer, saved: PlayerMemory, take: TakeIdentity, work: ClipWork, delayMs: number) {
    const current = () => saved.work === work && saved.take === take && work.generation === saved.generation;
    const disarm = () => {
      if (!current()) return;
      take.armed = false;
      stopWork(saved);
    };
    work.cancel = clock.schedule(Math.max(1, Math.ceil(delayMs)), () => {
      if (!current()) return;
      void timerTurn(port, work.connectionId, async mixer => {
        if (!current()) return;
        const [setup, alternate] = await withinVmixDeadline(mixer.until, () => media.playerSetups(port, player, false));
        const root = await withinVmixDeadline(mixer.until, () => media.folder(port));
        const hasScope = (candidate: Setup) => candidate.players[player]?.ready && savedKey(candidate, player) === take.key &&
          !aliasesPeer(candidate, player, take.key) && sameVmixPath(candidate.root ?? root, work.root);
        if (!current() || !sameVmixPath(root, work.root) || !hasScope(setup) || (alternate && !hasScope(alternate)) ||
            await playbackProblem(port, player, take.list, mixer.until)) return disarm();
        const next = await tick(mixer, saved, take, work);
        if (!current()) return;
        if (next === undefined) return disarm();
        if (next !== null) queueWork(port, player, saved, take, work, next);
      }).then(ran => { if (!ran) disarm(); }, disarm);
    });
  }

  async function tick(mixer: PlayerMixer, saved: PlayerMemory, take: TakeIdentity, work: ClipWork): Promise<number | null | undefined> {
    const { presentation } = take;
    const read = reader(mixer, take);
    const send = keyed(mixer, take.key);
    let row = await read();
    if (!row || (presentation.cover && work.boundaryAt === undefined) || (take.trim && row.positionMs < take.trim.inMs)) return;
    if (!presentation.cover) rememberSelection(take, row);
    const now = clock.now();
    const remaining = (take.trim?.outMs ?? row.durationMs) - row.positionMs;
    const trimReached = !!take.trim && reached(row, take.trim.outMs);
    const isTrimBoundary = take.armed && trimReached;
    const autoClear = take.armed && take.end === 'clear';
    const completed = row.state === 'Completed';
    if (take.armed && take.trim && completed && !isTrimBoundary) return;
    const clearDue = autoClear && (take.trim ? isTrimBoundary : completed);
    const outDue = work.out !== undefined && presentation.fade !== undefined && now >= presentation.fade.at + presentation.fade.duration;
    if (work.boundaryAt !== undefined || clearDue || outDue) {
      return endClear(mixer, saved, take, work, row, send, now);
    }
    if (row.state === 'Paused' && !work.out && !work.pausedAtBoundary) return;
    if (trimReached && (work.out || (take.armed && take.end === 'hold')) && !work.pausedAtBoundary) {
      const stopped = await pauseAt(row, read, send, mixer.until, take.trim!.outMs);
      if (!stopped) return;
      row = stopped;
      rememberSelection(take, stopped);
      work.pausedAtBoundary = true;
      take.armed = false;
    }
    if (isTrimBoundary && take.end === 'loop') {
      const continued = await restartLoop(mixer, take, row, send);
      return continued ? 1 : undefined;
    }
    if (autoClear && row.state === 'Running' && !work.out && presentation.fade?.kind !== 'end' && take.fadeOut !== undefined &&
        remaining > 0 && remaining <= take.fadeOut &&
        (!presentation.ramp || remaining >= VMIX_RAMP_REPLACEMENT_MS)) {
      const result = await ramp(presentation, send, 0, remaining);
      if (!result.ok) return;
      presentation.fade = { kind: 'end', from: presentation.alpha, to: 0, at: now, duration: remaining, clipAt: row.positionMs };
    }
    const fade = presentation.fade;
    let nextFrame: number | undefined;
    if (fade) {
      const frameAt = fade.clipAt === undefined ? now : fade.at + row.positionMs - fade.clipAt;
      const frame = fadeFrame(fade, frameAt);
      if (frame.alpha !== presentation.alpha) {
        const result = await send('SetAlpha', frame.alpha);
        if (!result.ok) return;
        presentation.alpha = frame.alpha;
      }
      if (frame.nextAt !== undefined) {
        nextFrame = frame.nextAt - frameAt;
      } else if (fade.kind === 'in') {
        if (volumeAt(row.volume, take.fader)) {
          delete presentation.ramp;
          delete presentation.fade;
        } else if (now - fade.at - fade.duration < 500) {
          nextFrame = VMIX_FRAME_MS;
        } else {
          return;
        }
      }
    }
    const requestedFade = autoClear && !work.out && presentation.fade?.kind !== 'end' ? take.fadeOut ?? 0 : 0;
    const nextBoundary = remaining > requestedFade ? remaining - requestedFade : remaining;
    const waitsForTrim = !!take.trim && !work.pausedAtBoundary && (take.armed || !!work.out);
    const eventIn = waitsForTrim || autoClear ? (nextBoundary > 0 ? nextBoundary : VMIX_FRAME_MS) : undefined;
    if (nextFrame === undefined && eventIn === undefined) {
      stopWork(saved);
      return null;
    }
    return Math.min(nextFrame ?? Infinity, eventIn === undefined ? Infinity : Math.min(eventIn, VMIX_CLOCK_POLL_MS));
  }

  async function endClear(mixer: PlayerMixer, saved: PlayerMemory, take: TakeIdentity, work: ClipWork, row: VmixVideoList, send: PlayerSend, now: number): Promise<number | null | undefined> {
    const { presentation } = take;
    const needsSilence = !!work.out || take.fadeOut !== undefined || !!presentation.ramp;
    const boundary = work.out ? 0 : take.trim?.outMs ?? 0;
    const atEnd = (current: VmixVideoList) => reached(current, boundary) &&
      (!!work.out || !!take.trim || current.state === 'Completed');
    if (!atEnd(row)) return;
    work.boundaryAt ??= now;
    if (needsSilence) presentation.cover ??= {};
    const read = reader(mixer, take);
    if (presentation.alpha !== 0 && needsSilence) {
      if (!(await send('SetAlpha', 0)).ok) return;
      presentation.alpha = 0;
      const observed = await read();
      if (!observed || !atEnd(observed)) return;
      row = observed;
    }
    const stopped = await pauseAt(row, read, send, mixer.until, boundary);
    if (!stopped || !atEnd(stopped)) return;
    if (needsSilence && (stopped.volume !== 0 || (presentation.ramp && presentation.ramp.target !== 0))) {
      if (now - work.boundaryAt >= 500) return;
      if (!work.quieting && (!presentation.ramp || presentation.ramp.target !== 0)) {
        const result = await ramp(presentation, send, 0, VMIX_RAMP_REPLACEMENT_MS);
        if (!result.ok) return;
        work.quieting = true;
      }
      return VMIX_FRAME_MS;
    }
    // One sample must still demonstrate every destructive precondition, including hard zero.
    const position = await samplePosition(mixer, take, {
      ...guardFor(take), states: work.out || take.trim ? ['Paused', 'Completed'] : ['Completed'],
      boundary, silent: needsSilence,
    });
    if (!isPosition(position) ||
        !(await send('ListRemoveAll')).ok || !(await confirmEmpty(mixer, take.key))) return;
    if (!await restoreEmptyMute(mixer, take.key, presentation, send)) return;
    delete presentation.ramp;
    delete presentation.fade;
    delete presentation.cover;
    delete saved.take;
    stopWork(saved, { ...unchanged('vMix confirmed the player is empty.'), generation: saved.generation });
    return null;
  }

  async function startCovered(mixer: PlayerMixer, take: TakeIdentity, send: PlayerSend, seek = false): Promise<VmixVideoList | Failure> {
    const read = reader(mixer, take, true);
    if (take.trim) {
      let where: number | undefined;
      if (seek) {
        const positioned = await stoppedSeek(take.trim, read, send, mixer.until);
        if ('error' in positioned) return positioned;
        where = positioned.positionMs;
      }
      const stopped = await read();
      if (!stopped || stopped.state === 'Running' || !inSegment(stopped, take.trim) ||
          (where !== undefined && stopped.positionMs !== where)) return uncertain('confirming the stopped trim before Play');
    }
    const play = await send('Play');
    if (!play.ok) return play;
    const limit = Math.min(mixer.until, Date.now() + 500);
    while (Date.now() < limit) {
      const running = await read();
      if (!running) break;
      if (running.state === 'Running' && (!take.trim || inSegment(running, take.trim))) return running;
      await poll(VMIX_FRAME_MS);
    }
    return uncertain('confirming the covered file playing in range');
  }

  async function revealCovered(mixer: PlayerMixer, take: TakeIdentity, send: PlayerSend, alpha: number) {
    const { presentation } = take;
    const original = presentation.cover?.originalMute;
    const phase: OccurrenceGuard = { states: ['Running'], segment: take.trim };
    const opening = original === false;
    if (opening && !await restoreMute(mixer, take, send, phase)) return false;
    const guard = { ...phase, muted: original ?? guardFor(take).muted };
    if (opening) {
      const opened = await observePosition(mixer, take, { muted: false });
      if (!isPosition(opened)) return false;
      if (take.trim && !withinSegment(opened, take.trim)) {
        await recloseOutOfRange(mixer, take, send);
        return false;
      }
    }
    if (!isPosition(await samplePosition(mixer, take, guard))) {
      if (opening) await recloseOutOfRange(mixer, take, send);
      return false;
    }
    if (presentation.alpha !== alpha) {
      if (!(await send('SetAlpha', alpha)).ok) return false;
      presentation.alpha = alpha;
    }
    delete presentation.cover;
    return true;
  }

  async function restartLoop(mixer: PlayerMixer, take: TakeIdentity, row: VmixVideoList, send: PlayerSend) {
    const phase: OccurrenceGuard = { states: ['Running', 'Completed'], boundary: take.trim!.outMs };
    if (!await muteCover(mixer, take.presentation, send, { key: take.key, list: row }, phase)) return false;
    const read = reader(mixer, take);
    const atBoundary = await read();
    if (!atBoundary || !await pauseAt(atBoundary, read, send, mixer.until, take.trim!.outMs)) return false;
    const playing = await startCovered(mixer, take, send, true);
    if ('error' in playing) return false;
    const fade = take.presentation.fade;
    const alpha = fade ? fadeFrame(fade, clock.now()).alpha : 255;
    if (!await revealCovered(mixer, take, send, alpha)) return false;
    rememberSelection(take, playing);
    return true;
  }

  async function states(port: number, xml: VmixXml, until: number): Promise<SlotState[]> {
    const setup = await withinVmixDeadline(until, () => media.setup(port));
    const matches = VMIX_PLAYERS.map(player => ({ player, match: matchPlayer(xml, setup, player) }));
    if (matches.some(({ match }) => match && 'error' in match && !match.foreign)) {
      throw new Error('vMix did not identify both player selections.');
    }
    const readings = await Promise.all(matches.map(async ({ player, match }) => {
      const current = match && !('error' in match) ? match : undefined;
      const list = current?.list;
      const selected = list && selectedFile(list);
      const relative = selected ? await withinVmixDeadline(until, () => media.relativeFile(port, selected, true)) : undefined;
      const file = relative && playerForMedia(relative) === player ? relative : undefined;
      const take = memory(port, player).take;
      const source = take && file && selected && sameVmixPath(take.file, selected)
        ? await withinVmixDeadline(until, () => media.playerSourceFile(port, take.sourceName))
        : undefined;
      const playerSource = source && selected && sameVmixPath(source, selected) ? take?.sourceName : undefined;
      return { player, match, current, list, selected, file, playerSource };
    }));
    return readings.map(({ player, match, current, list, selected, file, playerSource }) => {
      const saved = reconcile(port, player, current);
      const attested = playerSource ? saved.take : undefined;
      const trim = list?.durationMs && attested?.trim;
      const start = trim ? trim.inMs : 0;
      const duration = trim ? trim.outMs - trim.inMs : list?.durationMs ?? 0;
      const producer: SlotState['producer'] = selected ? (file ? (vmixMediaKind(file) === 'still' ? 'still' : 'video') : 'other') : match ? (current ? 'empty' : 'other') : 'empty';
      return {
        player, layer: 0, producer, generation: saved.generation,
        ...(producer === 'other' || producer === 'empty' ? { playerOccupied: producer === 'other' } : {}),
        paused: !!file && list?.state === 'Paused',
        loop: !!file && (attested?.trim && attested.armed ? attested.end === 'loop' : list?.loop ?? false),
        ...(file && list ? {
          file, position: Math.max(0, Math.min(list.positionMs - start, duration)) / 1000,
          segment: { start: start / 1000, length: duration / 1000 },
          ...(list.state === 'Completed' ? { playerCompleted: true as const } : {}),
          ...(saved.take && playerSource ? { playerSource, instance: saved.take.id, ...(saved.take.cueId ? { cueId: saved.take.cueId } : {}) } : {}),
        } : {}),
      };
    });
  }

  async function readyPlayer(
    port: number, player: VmixPlayer, current: PlayerInput | undefined, setup: Setup, mixer: Mixer, saved: PlayerMemory,
  ): Promise<{ key: string; list: VmixVideoList } | Failure> {
    const title = VMIX_PLAYER_TITLE[player];
    let input = current?.input;
    const kept = setup.players[player];
    const reuse = current && kept?.key.toLowerCase() === current.input.key && kept.ready;
    if (!input) {
      if (setup.adding[player]) return refused('Bridge could not identify a previous ' + title + ' creation. Check the Video Lists in vMix and name the intended input ' + title + ' before trying again.');
      const attempt = randomUUID();
      await media.markAdding(port, player, attempt, true, mixer.until);
      const result = await mixer.send('AddInput', { Value: 'VideoList|' });
      if (!result.ok) {
        if (result.error.code === 'refused' || result.error.code === 'unreachable') {
          try {
            await media.markAdding(port, player, attempt, false, mixer.until);
          } catch {
            return { ...result, error: { ...result.error, detail: result.error.detail + ' Bridge could not clear the saved creation marker. Check vmix-setup.json.' } };
          }
        }
        return result;
      }
      input = await newList(mixer);
      if (!input) return uncertain('adding ' + title);
      saved.created = { key: input.key, attempt };
    }
    const key = input.key;
    const coveredMute = saved.presentations.get(key)?.cover?.originalMute;
    const audioReady = (list: VmixVideoList) => readyForPlayback(player, list) || (coveredMute === false && list.muted === true);
    if (!reuse) {
      await media.keepPlayer(port, player, key, false, mixer.until);
      delete saved.created;
      const before = await mixer.read();
      const list = before.ok && playbackList(before.value, key);
      if (!list) return uncertain('identifying ' + title + ' for setup');
      const problem = await playbackProblem(port, player, list, mixer.until);
      if (problem) return problem;
      for (const [name, value] of [
        ['SetInputName', title], ['AutoPlayOff'], ['AutoPauseOff'], ['AutoRestartOff'], ['AutoPlayNextOff'],
        ...(player === 'audio' ? [['AudioAutoOff'], ...(coveredMute === false ? [] : [['AudioOn']])] : []),
      ]) {
        const result = await mixer.send(name, { Input: key, ...(value !== undefined ? { Value: value } : {}) });
        if (!result.ok) return result;
      }
      const confirmed = await mixer.read();
      const prepared = confirmed.ok && playbackList(confirmed.value, key);
      if (!confirmed.ok || confirmed.value.shortTitles.get(key) !== title || !prepared ||
          !audioReady(prepared)) return uncertain('preparing ' + title);
      const preparedProblem = await playbackProblem(port, player, prepared, mixer.until);
      if (preparedProblem) return preparedProblem;
      await media.keepPlayer(port, player, key, true, mixer.until);
    }

    const fresh = await mixer.read();
    const latest = fresh.ok && playbackList(fresh.value, key);
    if (!latest) return reuse ? refused('vMix could not confirm the selected Video List. Check it before taking the cue.') : uncertain('preparing ' + title);
    const problem = await playbackProblem(port, player, latest, mixer.until);
    if (problem) return problem;
    if (!audioReady(latest)) {
      return reuse ? refused('vMix has not confirmed NoaCG Audio unmuted. Check its audio in vMix before taking the cue.') : uncertain('preparing ' + title);
    }
    return { key, list: latest };
  }


  function stageRead(port: number, player: VmixPlayer, mixer: Mixer, key: string, selected: (list: VmixVideoList) => boolean, mute?: boolean): ListRead {
    return async () => {
      const raw = await mixer.read();
      const list = raw.ok && playbackList(raw.value, key);
      if (!list || !selected(list) || !readyForPlayback(player, list, mute) ||
          await playbackProblem(port, player, list, mixer.until)) return;
      return list;
    };
  }

  async function takeCue(port: number, player: VmixPlayer, current: PlayerInput | undefined, setup: Setup, mixer: Mixer, action: Extract<PlayoutAction, { verb: 'take' }>, saved: PlayerMemory): Promise<VmixActResult> {
    const initialPath = await withinVmixDeadline(mixer.until, () => media.file(port, action.item.name));
    const prepared = await readyPlayer(port, player, current, setup, mixer, saved);
    if ('error' in prepared) return prepared;
    const { key, list: preparedList } = prepared;
    const root = setup.root ?? await withinVmixDeadline(mixer.until, () => media.folder(port));
    const playback = action.playback;
    const trimmed = playback?.trim !== undefined;
    const end = playback?.end ?? (action.loop ? 'loop' : 'hold');
    const loop = !trimmed && end === 'loop';
    const fadeIn = playback?.fadeIn === undefined ? undefined : Math.round(playback.fadeIn * 1000);
    const fadeOut = playback?.fadeOut === undefined ? undefined : Math.round(playback.fadeOut * 1000);
    const { fader, db } = gainSettings(playback?.gain);
    const timed = trimmed || fadeIn !== undefined || end === 'clear';
    const send = keyed(mixer, key);
    const autoNext = await send('AutoPlayNextOff');
    if (!autoNext.ok) return autoNext;

    const snapshot = await mixer.read();
    const before = snapshot.ok && playbackList(snapshot.value, key);
    if (!before) return uncertain('setting up the Take');
    const currentProblem = await playbackProblem(port, player, before, mixer.until);
    if (currentProblem) return currentProblem;
    const repairingMute = saved.presentations.get(key)?.cover?.originalMute === false && before.muted === true;
    if ((!readyForPlayback(player, before) && !repairingMute) || !sameSelection(preparedList, before)) {
      return uncertain('setting up the Take');
    }
    const file = await withinVmixDeadline(mixer.until, () => media.file(port, action.item.name));
    if (!sameVmixPath(initialPath, file)) return refused('The vMix media path changed during Take. Check the folder and try again.');
    const presentation = presentationFor(saved, key);
    const coverMute = () => presentation.cover?.originalMute === undefined ? undefined : true;
    const timedCover = trimmed || fadeIn !== undefined || !!presentation.cover || !!presentation.ramp ||
      !!presentation.fade || presentation.alpha !== 255;
    const hidden = timedCover || (before.items.length > 0 && saved.take?.key !== key);
    if (timedCover && !await muteCover(mixer, presentation, send, { key, list: before })) {
      return uncertain('covering the player before selection');
    }
    const audibleWhenReady = (list: VmixVideoList) => readyForPlayback(player, list, coverMute());
    if (trimmed) {
      const pause = await send('Pause');
      if (!pause.ok) return pause;
      const stopped = await observe(port, player, mixer, key, list => sameSelection(before, list) && list.state !== 'Running');
      if (stopped && 'error' in stopped) return stopped;
      if (!stopped) return uncertain('pausing the list before a trimmed Take');
    }
    const appended = [...before.items, file];
    const added = await send('ListAdd', file);
    if (!added.ok) return added;
    const currentIndex = before.items.length ? before.selected : 1;
    const addedList = await observe(port, player, mixer, key, list => list.selected === currentIndex && sameItems(list.items, appended));
    if (addedList && 'error' in addedList) return addedList;
    if (!addedList || !audibleWhenReady(addedList)) return uncertain('adding the file');

    // vMix acknowledges Loop on an empty list without applying it.
    const ending = await send(loop ? 'LoopOn' : 'LoopOff');
    if (!ending.ok) return ending;
    if (hidden) presentation.cover ??= {};
    if (!hidden || presentation.alpha !== 0 || presentation.cover?.originalMute === undefined) {
      const alpha = await send('SetAlpha', hidden ? 0 : 255);
      if (!alpha.ok) return alpha;
      presentation.alpha = hidden ? 0 : 255;
    }
    const sameAppend = (list: VmixVideoList) => sameSelection(list, addedList) && audibleWhenReady(list);
    // Stop polling if the occurrence changes while vMix applies the setting.
    const readyForSelect = (list: VmixVideoList) => sameAppend(list) && list.loop === loop && (!trimmed || list.state !== 'Running');
    const configured = await observe(port, player, mixer, key, list => !sameAppend(list) || readyForSelect(list));
    if (configured && 'error' in configured) return configured;
    if (!configured || !readyForSelect(configured)) return uncertain('setting the Take loop');
    const beforeSelect = stageRead(port, player, mixer, key, readyForSelect, coverMute());
    const volume = await putVolume(presentation, send, hidden ? 0 : fader, beforeSelect, mixer.until, hidden);
    if (!volume.ok) return volume;
    if (presentation.cover) presentation.cover.zeroVolume = true;
    const gain = await send('SetGain', db);
    if (!gain.ok) return gain;
    if (!await beforeSelect()) return uncertain('confirming the list before selection');

    const index = appended.length;
    const selected = (list: VmixVideoList) => list.selected === index && list.loop === loop && sameItems(list.items, appended);
    const selection = await send('SelectIndex', String(index));
    if (!selection.ok) return selection;
    const selectedList = await observe(port, player, mixer, key, list => selected(list) && (!trimmed || list.state !== 'Running') && (!timed || hasTiming(list, file)));
    if (selectedList && 'error' in selectedList) return selectedList;
    if (!selectedList || !audibleWhenReady(selectedList)) return uncertain('selecting the requested file');
    const trim = playback?.trim && trimSegment(playback.trim, selectedList.durationMs);
    if (trimmed && !trim) return refused('The requested trim does not fit the measured vMix file length.');
    const instance = (mixer.session ? mixer.session + '.' : '') + randomUUID();
    const started: TakeIdentity = {
      id: instance, cueId: action.cueId, sourceName: action.item.name, file, key, list: selectedList,
      trim, end, fadeOut, fader, presentation, armed: false,
    };
    let playing: VmixVideoList | Failure | undefined;
    if (trim) {
      playing = await startCovered(mixer, started, send, true);
    } else {
      const play = await send('Play');
      if (!play.ok) return play;
      playing = await observe(port, player, mixer, key, list => selected(list) && list.state === 'Running' && (!timed || hasTiming(list, file)));
    }
    if (playing && 'error' in playing) return playing;
    if (!playing || !audibleWhenReady(playing)) return uncertain('playing the file');
    rememberSelection(started, playing);
    saved.take = started;
    delete presentation.fade;

    // Remove only confirmed prefix entries. Retained entries from a partial Take stay in vMix.
    const partial = (result: Failure): Failure => ({ ...result, error: {
      ...result.error,
      detail: 'vMix was observed playing the requested file before the earlier items were removed. ' + result.error.detail,
    } });
    let beforeLastRemoval: VmixVideoList | undefined;
    for (let remove = 1; remove < index; remove += 1) {
      beforeLastRemoval = started.list;
      const result = await send('ListRemove', '1');
      if (!result.ok) return partial(result);
      const expected = appended.slice(remove);
      const after = await observe(port, player, mixer, key, list => list.selected === index - remove && list.loop === loop &&
        (list.state === 'Running' || (list.state === 'Completed' && list.durationMs > 0 && list.positionMs >= list.durationMs)) &&
        sameItems(list.items, expected));
      if (after && 'error' in after) return partial(after);
      if (!after) return uncertain('removing earlier items after the requested file was seen playing');
      // Prefix removal can be observed even if the same selected input lost audio readiness.
      if (presentation.cover) started.list = after;
      else rememberSelection(started, after);
      if (!audibleWhenReady(after)) return uncertain('removing earlier items after the requested file was seen playing');
    }
    if (timed && beforeLastRemoval) {
      const position = await confirmListRemoval(mixer, started, beforeLastRemoval);
      if (!isPosition(position) || trim && !withinSegment(position, trim)) {
        return partial(uncertain('confirming the timed file after removing its earlier items'));
      }
    }
    if (hidden && fadeIn === undefined) {
      const readInRange = stageRead(port, player, mixer, key, list => sameSelection(started.list, list) && list.loop === loop && list.state === 'Running' &&
        (!trim || inSegment(list, trim)), coverMute());
      if (!await readInRange()) return uncertain('revealing the selected file');
      const restore = await putVolume(presentation, send, fader, readInRange, mixer.until);
      if (!restore.ok) return restore;
      if (!await revealCovered(mixer, started, send, 255)) return uncertain('revealing the selected file');
    }

    if (fadeIn !== undefined) {
      const current = await stageRead(port, player, mixer, key, list => sameSelection(started.list, list), coverMute())();
      if (!current || !hasTiming(current, file) || (current.state !== 'Running' && vmixMediaKind(file) !== 'still') ||
          (trim && !inSegment(current, trim)) || !await revealCovered(mixer, started, send, 0)) return uncertain('starting the cue fade');
      const at = clock.now();
      const fading = await ramp(presentation, send, fader, fadeIn);
      if (!fading.ok) {
        presentation.cover ??= {};
        return fading;
      }
      presentation.fade = { kind: 'in', from: 0, to: 255, at, duration: Math.max(1, fadeIn) };
    }
    started.armed = true;
    if (presentation.fade || trim || end === 'clear') attachWork(port, player, saved, started, mixer, root);
    return { ...unchanged('vMix confirmed the selected file playing.'), generation: saved.generation, instance };
  }

  async function act(port: number, player: VmixPlayer, action: VmixAction, mixer: Mixer): Promise<VmixActResult | { settled: Promise<VmixActResult> }> {
    if (/^basic(?:\s*hd)?$/i.test(mixer.before.edition)) return refused('vMix ' + mixer.before.edition + ' does not offer Video List.');
    const empty = action.verb === 'out' || action.verb === 'clear';
    const fadedOut = action.verb === 'out' && action.fadeOut !== undefined;
    const recovery = (empty && !fadedOut) || action.verb === 'pause';
    const [setup, alternate] = await withinVmixDeadline(mixer.until, () => media.playerSetups(port, player, recovery));
    const expectedInstance = 'expectedPlayerInstance' in action ? action.expectedPlayerInstance : undefined;
    const match = (xml: VmixXml) => {
      const current = matchPlayer(xml, setup, player);
      if (alternate) {
        const other = matchPlayer(xml, alternate, player);
        if ((current && 'error' in current) || (other && 'error' in other) || current?.input.key !== other?.input.key) {
          throw new VmixPublicationUncertain('Bridge could not confirm the same vMix player while saving setup. Wait for the save to finish before trying again.');
        }
      }
      return current;
    };
    const changed = () => refused(VMIX_PLAYER_TITLE[player] + ' no longer holds the playback instance this action expected.');
    const ownedIn = (xml: VmixXml) => {
      const candidate = match(xml);
      const saved = reconcileObserved(port, player, candidate);
      if (candidate && !('error' in candidate) && saved?.take?.id === expectedInstance) return candidate;
    };
    const canConfirmTiming = (list: VmixVideoList) => {
      const timedEnding = action.verb === 'ending' && expectedInstance !== undefined;
      return (!action.requireMeasuredPlayer && !fadedOut && !timedEnding) || hasTiming(list);
    };
    const rereadOwned = async () => {
      const latest = await mixer.read();
      const candidate = latest.ok && ownedIn(latest.value);
      if (!candidate) return changed();
      return canConfirmTiming(candidate.list) ? candidate
        : refused('vMix did not confirm playback timing on ' + VMIX_PLAYER_TITLE[player] + '. Wait for the player to report it.');
    };
    const confirmOwned = (xml: VmixXml) => {
      try {
        const candidate = ownedIn(xml);
        return !!candidate && canConfirmTiming(candidate.list);
      } catch {
        // A function was already sent. An unreadable handover cannot confirm it.
        return false;
      }
    };
    let current = match(mixer.before);
    if (current && 'error' in current) {
      reconcileObserved(port, player, current);
      return current;
    }
    const created = memory(port, player).created;
    if (!current && !alternate && action.verb === 'take' && created && setup.adding[player] === created.attempt) {
      const input = mixer.before.inputs.find(candidate => candidate.key === created.key);
      const list = playbackList(mixer.before, created.key);
      if (input && list && !aliasesPeer(setup, player, input.key)) current = { input, list };
    }
    const saved = reconcile(port, player, current);
    if (expectedInstance !== undefined) {
      if (saved.take?.id !== expectedInstance) return changed();
      const confirmed = await rereadOwned();
      if ('error' in confirmed) return confirmed;
      current = confirmed;
    }
    if (!current && action.verb !== 'take' && !empty) return refused(VMIX_PLAYER_TITLE[player] + ' has no selected file.');
    const selected = current && selectedFile(current.list);
    if (current && (action.verb === 'take' || action.verb === 'resume' || action.verb === 'ending' || fadedOut)) {
      const problem = await playbackProblem(port, player, current.list, mixer.until);
      if (problem) return problem;
      if (expectedInstance !== undefined) {
        const confirmed = await rereadOwned();
        if ('error' in confirmed) return confirmed;
        current = confirmed;
      }
    }
    if (action.verb === 'ending') {
      const expected = await withinVmixDeadline(mixer.until, () => media.file(port, action.item.name));
      if (!saved.take || !selected || !sameVmixPath(selected, expected)) return refused('That file is no longer the clip this Bridge started. Take the cue again.');
      if (expectedInstance === undefined && (saved.take.trim || saved.take.end === 'clear' || saved.work)) {
        return refused('A timed vMix ending requires its current playback instance.');
      }
      if (expectedInstance !== undefined) {
        const confirmed = await rereadOwned();
        if ('error' in confirmed) return confirmed;
        current = confirmed;
      }
    }
    if (!empty && action.verb !== 'take' && !selected) return refused(VMIX_PLAYER_TITLE[player] + ' has no selected file.');
    if (action.verb === 'resume' && current && !readyForPlayback(player, current.list)) {
      return refused('vMix has not confirmed NoaCG Audio unmuted. Check its audio in vMix before resuming the cue.');
    }

    const presentation = current && saved.presentations.get(current.input.key);
    if (presentation?.cover && (action.verb === 'resume' || action.verb === 'ending' || fadedOut)) {
      return refused('The vMix player is covered after an unconfirmed timed action. Take the cue again or clear the player.');
    }
    const trim = saved.take?.trim;
    if (action.verb === 'resume' && trim && (!current || !hasTiming(current.list) || !inSegment(current.list, trim))) {
      return refused('The vMix player is outside its measured trim. Take the cue again to play it.');
    }
    saved.generation += 1;
    stopWork(saved);
    if (saved.take) saved.take.armed = false;
    if (action.verb === 'take') return takeCue(port, player, current, setup, mixer, action, saved);
    if (!current) return { ...unchanged(VMIX_PLAYER_TITLE[player] + ' is empty.'), generation: saved.generation };

    const { key } = current.input;
    const expectedList = current.list;
    const take = saved.take;
    const send = keyed(mixer, key);
    if (action.verb === 'out' && action.fadeOut !== undefined) {
      if (!take || expectedInstance !== take.id) return changed();
      const duration = Math.max(1, Math.round(action.fadeOut * 1000));
      const at = clock.now();
      const root = setup.root ?? await withinVmixDeadline(mixer.until, () => media.folder(port));
      if ('error' in await rereadOwned()) return changed();
      const result = await ramp(take.presentation, send, 0, duration);
      if (!result.ok) return result;
      let finish!: (result: VmixActResult) => void;
      const settled = new Promise<VmixActResult>(resolve => { finish = resolve; });
      take.presentation.fade = { kind: 'out', from: take.presentation.alpha, to: 0, at, duration };
      const work = attachWork(port, player, saved, take, mixer, root, {
        out: { finish }, pausedAtBoundary: expectedList.state === 'Paused',
      });
      return work ? { settled } : uncertain('starting the Out fade');
    }
    const nextEnd = action.verb === 'ending' ? action.playback?.end ?? 'hold' : undefined;
    const loop = nextEnd === 'loop' && !take?.trim;
    const verb = action.verb === 'ending' ? (loop ? 'LoopOn' : 'LoopOff') : action.verb === 'resume' ? 'Play' : 'Pause';
    let after: VmixVideoList | Failure | undefined;
    let raw: string;
    if (action.verb === 'resume' && take?.trim) {
      const observed = await reader(mixer, take, true)();
      if (!observed || !inSegment(observed, take.trim)) return uncertain('confirming the trim before resuming');
      if (observed.state === 'Running') {
        after = observed;
      } else {
        if (observed.state !== 'Paused' || !await muteCover(mixer, take.presentation, send, take, {
          states: ['Paused'], segment: take.trim,
        })) {
          return uncertain('covering the resumed clip');
        }
        const playing = await startCovered(mixer, take, send);
        if ('error' in playing) return playing;
        const entrance = take.presentation.fade?.kind === 'in' ? take.presentation.fade : undefined;
        if (!await revealCovered(mixer, take, send, entrance ? fadeFrame(entrance, clock.now()).alpha : take.presentation.fade ? 0 : 255)) {
          return uncertain('revealing the resumed clip');
        }
        after = playing;
      }
      raw = 'vMix confirmed the trimmed file playing.';
    } else {
      const result = await send(verb);
      if (!result.ok) return result;
      raw = result.raw;
      if (empty) {
        if (expectedInstance !== undefined) {
          let confirmed = false;
          try {
            confirmed = !('error' in await rereadOwned());
          } catch {
            // Pause may already have succeeded. Leave the list alone without a fresh observation.
          }
          if (!confirmed) return uncertain('pausing the player before clearing it');
        }
        const removed = await mixer.send('ListRemoveAll', { Input: key });
        if (!removed.ok) return removed;
      }
      after = await observe(port, player, mixer, key, list => {
        if (empty) return list.items.length === 0;
        if (!sameSelection(list, expectedList)) return false;
        if (action.verb === 'ending') return list.loop === loop;
        return list.state === (action.verb === 'resume' ? 'Running' : 'Paused');
      }, !recovery, !empty && expectedInstance !== undefined ? confirmOwned : undefined);
    }
    if (after && 'error' in after) return after;
    if (!after || (action.verb === 'resume' && !readyForPlayback(player, after))) {
      return uncertain(empty ? 'emptying the player' : verb);
    }
    if (empty) {
      delete saved.take;
      if (presentation) {
        if (!await restoreEmptyMute(mixer, key, presentation, send)) return uncertain('restoring the emptied player audio');
        delete presentation.cover;
        delete presentation.fade;
        // A native ramp can continue on an empty input. A later Take must supersede it under cover.
      }
    } else if (take && saved.take === take) {
      const { presentation } = take;
      if (!presentation.cover) rememberSelection(take, after);
      if (nextEnd !== undefined && action.verb === 'ending') {
        take.end = nextEnd;
        take.fadeOut = action.playback?.fadeOut === undefined ? undefined : Math.round(action.playback.fadeOut * 1000);
      }
      const entrance = presentation.fade?.kind === 'in';
      if (expectedInstance && !presentation.cover && !entrance && (presentation.alpha !== 255 || presentation.ramp)) {
        const read = stageRead(port, player, mixer, key, list => sameSelection(take.list, list) && list.state === after.state && list.loop === after.loop &&
          (!take.trim || (list.positionMs >= take.trim.inMs && (after.state === 'Paused' || list.positionMs < take.trim.outMs))));
        if (!await read()) return uncertain('settling the surviving cue');
        const restored = await putVolume(presentation, send, take.fader, read, mixer.until);
        if (!restored.ok) return restored;
        if (!await read()) return uncertain('settling the surviving cue');
        if (presentation.alpha !== 255) {
          const visible = await send('SetAlpha', 255);
          if (!visible.ok) return visible;
          presentation.alpha = 255;
        }
        delete presentation.fade;
      }
      if ((expectedInstance || trim && action.verb === 'resume') && (action.verb === 'resume' || nextEnd !== undefined)) {
        take.armed = after.state === 'Running' || (after.state === 'Completed' && nextEnd === 'clear');
      }
      const keepEntrance = !presentation.cover && entrance;
      if (!presentation.cover && (keepEntrance || take.armed && (take.trim || take.end === 'clear'))) {
        const root = setup.root ?? await withinVmixDeadline(mixer.until, () => media.folder(port));
        attachWork(port, player, saved, take, mixer, root, { pausedAtBoundary: after.state === 'Paused' });
      }
    }
    return { ...unchanged(empty ? 'vMix confirmed the player is empty.' : raw), generation: saved.generation, instance: saved.take?.id };
  }

  return {
    act, states,
    folderChanged(port: number, root: string) {
      for (const player of VMIX_PLAYERS) {
        const saved = memories.get(port + '/' + player);
        if (saved?.work && !sameVmixPath(saved.work.root, root)) {
          if (saved.take) saved.take.armed = false;
          stopWork(saved);
        }
      }
    },
    close() {
      for (const saved of memories.values()) stopWork(saved);
    },
  };
}
