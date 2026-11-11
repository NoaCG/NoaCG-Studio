import { randomUUID } from 'node:crypto';
import type { ActResult, AdapterResult } from './adapters/casparcg.js';
import type { AgentError, PlayoutAction, SlotState, VmixInput, VmixPlayer } from './protocol.js';
import { sameVmixPath, VMIX_PLAYERS, VMIX_PLAYER_TITLE, vmixMediaKind, vmixMediaName, type VmixMedia } from './vmixMedia.js';
import type { VmixVideoList, VmixXml } from './vmixTcp.js';

type Failure = { ok: false; error: AgentError };
export type VmixActResult = ActResult & { generation?: number; instance?: string };
type Setup = Awaited<ReturnType<VmixMedia['setup']>>;

interface Mixer {
  before: VmixXml;
  until: number;
  read: () => Promise<AdapterResult<VmixXml>>;
  send: (name: string, params: Record<string, string>) => Promise<AdapterResult<null>>;
}
interface PlayerInput {
  input: VmixInput;
  list: VmixVideoList;
}

interface TakeIdentity {
  id: string;
  cueId?: string;
  key: string;
  list: VmixVideoList;
}
interface PlayerMemory {
  generation: number;
  take?: TakeIdentity;
}

const failure = (code: AgentError['code'], detail: string): Failure => ({ ok: false, error: { hop: 'target', code, detail } });
const refused = (detail: string) => failure('refused', detail);
const uncertain = (what: string) => failure('uncertain', 'vMix accepted ' + what + ', but Bridge could not confirm the result. Check vMix before trying again.');
const unchanged = (raw: string): VmixActResult => ({ ok: true, raw, value: {} });
const selectedFile = (list: VmixVideoList) => list.items[list.selected - 1];
const otherPlayer = (player: VmixPlayer): VmixPlayer => player === 'clips' ? 'audio' : 'clips';
const poll = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const POLL_MS = 125;

export function unsupportedPlayerAction(action: PlayoutAction, player: VmixPlayer): string | undefined {
  if (action.verb === 'update' || action.verb === 'next' || action.verb === 'sequence') return action.verb;
  if ('expectedOverlayInput' in action && action.expectedOverlayInput !== undefined) return 'an overlay expectation on a player';
  if ('item' in action && action.item && action.item.kind !== 'media') return action.item.kind;
  if (action.verb === 'take') {
    if (action.imageFit !== undefined) return 'image fit';
    if (action.data && Object.keys(action.data).length) return 'template data';
    const { playback } = action;
    if (playback && (playback.trim !== undefined || playback.fadeIn !== undefined || playback.fadeOut !== undefined || playback.gain !== undefined)) return 'trim, fades or level';
    if (action.loop && playback?.end && playback.end !== 'loop') return 'conflicting endings';
  }
  if (action.verb === 'out' && action.fadeOut !== undefined) return 'a fade';
  if (action.verb === 'ending' && (action.then !== undefined || action.playback?.fadeOut !== undefined)) return 'a sequence or fade';
  if ((action.verb === 'take' || action.verb === 'ending') && action.playback?.end === 'clear') return 'Clear at the end';
  if (action.verb === 'take' || action.verb === 'ending') {
    const kind = vmixMediaKind(action.item.name);
    if (!vmixMediaName(action.item.name)) return 'a path outside the media folder';
    if (!kind) return 'this media type';
    if (player !== (kind === 'audio' ? 'audio' : 'clips')) return 'this media type on ' + VMIX_PLAYER_TITLE[player];
  }
}

function matchPlayer(xml: VmixXml, setup: Setup, player: VmixPlayer): PlayerInput | Failure | undefined {
  const label = VMIX_PLAYER_TITLE[player];
  const saved = setup.players[player]?.key.toLowerCase();
  const other = setup.players[otherPlayer(player)]?.key.toLowerCase();
  let input = xml.inputs.find(candidate => candidate.key === saved);
  if (!input) {
    const names = xml.inputs.filter(candidate => (xml.shortTitles.get(candidate.key) ?? candidate.title).toLowerCase() === label.toLowerCase());
    if (names.length > 1) return refused('More than one vMix input is named ' + label + '. Check the inputs in vMix.');
    [input] = names;
  }
  if (!input) return;
  if (input.key === other || input.type !== 'VideoList') return refused(label + ' does not identify its own vMix Video List.');
  const list = xml.lists.get(input.key);
  if (!list) return refused('vMix did not report the list state for ' + label + '. Check the input in vMix.');
  return { input, list };
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((file, i) => sameVmixPath(file, b[i]));
}

function sameSelection(a: VmixVideoList, b: VmixVideoList): boolean {
  return a.selected === b.selected && sameItems(a.items, b.items);
}

async function observe(mixer: Mixer, find: (xml: VmixXml) => VmixVideoList | undefined): Promise<VmixVideoList | undefined> {
  while (Date.now() < mixer.until) {
    const current = await mixer.read();
    if (!current.ok) return;
    const list = find(current.value);
    if (list) return list;
    if (Date.now() + POLL_MS >= mixer.until) return;
    await poll(POLL_MS);
  }
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
    const added = xml.inputs.filter(input => !known.has(input.key));
    if (added.length > 1) return;
    const old = xml.inputs.filter(input => known.has(input.key));
    if (old.length !== known.size || old.some(input => {
      const previous = known.get(input.key)!;
      return input.type !== previous.type || input.title !== previous.title;
    })) return;
    if (added.length) {
      const [input] = added;
      const list = xml.lists.get(input.key);
      if (!list || list.items.length || (candidate && candidate.key !== input.key)) return;
      if (candidate) return input;
      candidate = input;
    } else if (candidate) return;
    await poll(POLL_MS);
  }
}

export function createVmixPlayers(media: VmixMedia) {
  const memories = new Map<string, PlayerMemory>();

  function memory(port: number, player: VmixPlayer): PlayerMemory {
    const id = port + '/' + player;
    let saved = memories.get(id);
    if (!saved) {
      saved = { generation: 0 };
      memories.set(id, saved);
    }
    return saved;
  }

  function reconcile(port: number, player: VmixPlayer, current: PlayerInput | undefined): PlayerMemory {
    const saved = memory(port, player);
    const take = saved.take;
    if (take && (!current || current.input.key !== take.key || !sameSelection(current.list, take.list) ||
        (!current.list.loop && current.list.positionMs + 750 < take.list.positionMs))) {
      delete saved.take;
    } else if (take && current) {
      take.list = current.list;
    }
    return saved;
  }

  async function states(port: number, xml: VmixXml): Promise<SlotState[]> {
    const setup = await media.setup(port);
    return Promise.all(VMIX_PLAYERS.map(async player => {
      const match = matchPlayer(xml, setup, player);
      const current = match && !('error' in match) ? match : undefined;
      const saved = reconcile(port, player, current);
      const list = current?.list;
      const selected = list && selectedFile(list);
      const file = selected ? await media.relativeFile(port, selected) : undefined;
      const producer: SlotState['producer'] = selected ? (file ? (vmixMediaKind(file) === 'still' ? 'still' : 'video') : 'other') : match ? (current ? 'empty' : 'other') : 'empty';
      return {
        player, layer: 0, producer, generation: saved.generation,
        paused: list?.state === 'Paused', loop: list?.loop ?? false,
        ...(file && list ? {
          file, position: list.positionMs / 1000, segment: { start: 0, length: list.durationMs / 1000 },
          ...(saved.take ? { instance: saved.take.id, ...(saved.take.cueId ? { cueId: saved.take.cueId } : {}) } : {}),
        } : {}),
      };
    }));
  }

  async function readyPlayer(port: number, player: VmixPlayer, current: PlayerInput | undefined, setup: Setup, mixer: Mixer): Promise<string | Failure> {
    const title = VMIX_PLAYER_TITLE[player];
    let input = current?.input;
    const kept = setup.players[player];
    if (input && kept?.key.toLowerCase() === input.key && kept.ready) {
      if (player === 'audio' && current?.list.muted !== false) return refused('vMix has not confirmed NoaCG Audio unmuted. Check its audio in vMix before taking the cue.');
      return input.key;
    }
    if (!input) {
      if (setup.adding[player]) return refused('Bridge could not identify a previous ' + title + ' creation. Check the Video Lists in vMix and name the intended input ' + title + ' before trying again.');
      await media.markAdding(port, player, true);
      const result = await mixer.send('AddInput', { Value: 'VideoList|' });
      if (!result.ok) {
        if (result.error.code !== 'uncertain') {
          try {
            await media.markAdding(port, player, false);
          } catch {
            return { ...result, error: { ...result.error, detail: result.error.detail + ' Bridge could not clear the saved creation marker. Check vmix-setup.json.' } };
          }
        }
        return result;
      }
      input = await newList(mixer);
      if (!input) return uncertain('adding ' + title);
    }
    const key = input.key;
    await media.keepPlayer(port, player, key, false);
    for (const [name, value] of [
      ['SetInputName', title], ['AutoPlayOff'], ['AutoPauseOff'], ['AutoRestartOff'], ['AutoPlayNextOff'],
      ...(player === 'audio' ? [['AudioAutoOff'], ['AudioOn']] : []),
    ]) {
      const result = await mixer.send(name, { Input: key, ...(value !== undefined ? { Value: value } : {}) });
      if (!result.ok) return result;
    }
    const confirmed = await mixer.read();
    const list = confirmed.ok && confirmed.value.lists.get(key);
    if (!confirmed.ok || confirmed.value.shortTitles.get(key) !== title || !list ||
        (player === 'audio' && list.muted !== false)) return uncertain('preparing ' + title);
    await media.keepPlayer(port, player, key, true);
    return key;
  }

  async function take(port: number, player: VmixPlayer, current: PlayerInput | undefined, setup: Setup, mixer: Mixer, action: Extract<PlayoutAction, { verb: 'take' }>, saved: PlayerMemory): Promise<VmixActResult> {
    const initialPath = await media.file(port, action.item.name);
    const key = await readyPlayer(port, player, current, setup, mixer);
    if (typeof key !== 'string') return key;
    const loop = action.loop === true || action.playback?.end === 'loop';
    const send = (name: string, value?: string) => mixer.send(name, { Input: key, ...(value !== undefined ? { Value: value } : {}) });
    for (const [name, value] of [[loop ? 'LoopOn' : 'LoopOff'], ['AutoPlayNextOff'], ['SetAlpha', '255']]) {
      const result = await send(name, value);
      if (!result.ok) return result;
    }

    const snapshot = await mixer.read();
    const before = snapshot.ok && snapshot.value.lists.get(key);
    if (!before || before.loop !== loop || (player === 'audio' && before.muted !== false)) return uncertain('setting up the Take');
    const file = await media.file(port, action.item.name);
    if (!sameVmixPath(initialPath, file)) return refused('The vMix media path changed during Take. Check the folder and try again.');
    const appended = [...before.items, file];
    const added = await send('ListAdd', file);
    if (!added.ok) return added;
    if (!await observe(mixer, xml => {
      const list = xml.lists.get(key);
      return list && sameItems(list.items, appended) ? list : undefined;
    })) return uncertain('adding the file');

    const index = appended.length;
    const selection = await send('SelectIndex', String(index));
    if (!selection.ok) return selection;
    const play = await send('Play');
    if (!play.ok) return play;
    const playing = await observe(mixer, xml => {
      const list = xml.lists.get(key);
      return list && list.state === 'Running' && list.selected === index && list.loop === loop &&
        (player !== 'audio' || list.muted === false) && sameItems(list.items, appended) ? list : undefined;
    });
    if (!playing) return uncertain('playing the file');
    const instance = randomUUID();
    saved.take = { id: instance, cueId: action.cueId, key, list: playing };

    // Remove only confirmed prefix entries. Retained entries from a partial Take stay in vMix.
    for (let remove = 1; remove < index; remove += 1) {
      const result = await send('ListRemove', '1');
      if (!result.ok) return { ...result, error: {
        ...result.error,
        detail: 'vMix was observed playing the requested file before the earlier items were removed. ' + result.error.detail,
      } };
      const expected = appended.slice(remove);
      const after = await observe(mixer, xml => {
        const list = xml.lists.get(key);
        return list && list.selected === index - remove && list.loop === loop &&
          (list.state === 'Running' || (list.state === 'Completed' && list.durationMs > 0 && list.positionMs >= list.durationMs)) &&
          sameItems(list.items, expected) ? list : undefined;
      });
      if (!after) return uncertain('removing earlier items after the requested file was seen playing');
      saved.take.list = after;
    }
    return { ...unchanged('vMix confirmed the selected file playing.'), generation: saved.generation, instance };
  }

  async function act(port: number, player: VmixPlayer, action: PlayoutAction, mixer: Mixer): Promise<VmixActResult> {
    if (/^basic(?:\s*hd)?$/i.test(mixer.before.edition)) return refused('vMix ' + mixer.before.edition + ' does not offer Video List.');
    const setup = await media.setup(port);
    const current = matchPlayer(mixer.before, setup, player);
    if (current && 'error' in current) return current;
    const saved = reconcile(port, player, current);
    const empty = action.verb === 'out' || action.verb === 'clear';
    if (!current && action.verb !== 'take' && !empty) return refused(VMIX_PLAYER_TITLE[player] + ' has no selected file.');
    const selected = current && selectedFile(current.list);
    if (action.verb === 'ending') {
      const expected = await media.file(port, action.item.name);
      if (!saved.take || !selected || !sameVmixPath(selected, expected)) return refused('That file is no longer the clip this Bridge started. Take the cue again.');
    }
    if (!empty && action.verb !== 'take' && !selected) return refused(VMIX_PLAYER_TITLE[player] + ' has no selected file.');

    saved.generation += 1;
    if (action.verb === 'take') return take(port, player, current, setup, mixer, action, saved);
    if (!current) return { ...unchanged(VMIX_PLAYER_TITLE[player] + ' is empty.'), generation: saved.generation };

    const key = current.input.key;
    const loop = action.verb === 'ending' && action.playback?.end === 'loop';
    const verb = action.verb === 'ending' ? (loop ? 'LoopOn' : 'LoopOff') : action.verb === 'resume' ? 'Play' : 'Pause';
    const result = await mixer.send(verb, { Input: key });
    if (!result.ok) return result;
    if (empty) {
      const removed = await mixer.send('ListRemoveAll', { Input: key });
      if (!removed.ok) return removed;
    }
    const after = await observe(mixer, xml => {
      const list = xml.lists.get(key);
      if (!list) return;
      if (empty) return list.items.length === 0 ? list : undefined;
      if (!sameSelection(list, current.list)) return;
      if (action.verb === 'ending') return list.loop === loop ? list : undefined;
      if (action.verb === 'resume') return list.state === 'Running' ? list : undefined;
      return list.state === 'Paused' ? list : undefined;
    });
    if (!after) return uncertain(empty ? 'emptying the player' : verb);
    if (empty) delete saved.take;
    else if (saved.take) saved.take.list = after;
    return { ...unchanged(empty ? 'vMix confirmed the player is empty.' : result.raw), generation: saved.generation, instance: saved.take?.id };
  }

  return { act, states };
}
