// THE BRIDGE'S MEMORY OF ITS SLOTS (docs/CLIP_PLAYBACK_PLAN.md §6.7 and §6.10; docs/BRIDGE.md §3).
//
// The Bridge used to keep nothing between requests but its token. Reading the server's state
// honestly needs two facts that only the process that sent the commands can hold, so it now keeps
// them, in memory, per target and slot, and nothing else:
//
//   GENERATION  a counter that every Take, Out, Clear, Pause and Resume on the slot moves BEFORE
//               its command is sent, reported on the action's reply and on every reading - not
//               Update or Next, which change nothing the clock shows. The page ignores a
//               reading older than the last action it saw accepted, so an answer that was on its
//               way before a Take can never overrule the Take (plan §18, case 14).
//   INSTANCE    what this Bridge last started on the slot: an id, the item, and the cue the page
//               named. A reading carries it only while the slot still plays that item and nobody
//               restarted it, so the page can tell its own clip from another client's, and match a
//               clip to its cue again after a reload.
//
// A restarted Bridge remembers nothing: its readings carry no instances and its session id is new,
// so the page shows what the server holds as unidentified rather than guessing. Phase 3's sequence
// runner keeps its queue beside this.

import { randomBytes } from 'node:crypto';
import type { ItemRef, Slot, SlotState, Target } from './protocol.js';

/** One INFO layer as the adapter read it, before the Bridge adds what only it knows. */
export type SlotReading = Omit<SlotState, 'instance' | 'cueId' | 'generation'>;

interface Instance {
  id: string;
  cueId?: string;
  item: ItemRef;
  /** When the take was accepted, on this Bridge's clock (ms). */
  startedAt: number;
  /** The last position a reading showed, to catch the same file restarted by somebody else. */
  lastPosition?: number;
}

interface SlotMemory {
  generation: number;
  /** Actions sent and not yet answered. A reading taken meanwhile is from BEFORE them. */
  inFlight: number;
  instance?: Instance;
}

/** How far a playing clip may go BACK between two readings before it counts as restarted. A
 *  reading is late by milliseconds, never by this much. */
const RESTART_JUMP_S = 0.75;

/**
 * How long after a take the slot may still show what it held BEFORE it. The server answers
 * `202 PLAY OK` before the clip is on the layer. Measured on 2.5.0 (2026-09-28): an INFO a few
 * milliseconds after the reply showed the layer empty, or - on a re-take of the same file - that
 * file still at its END (position 30 of 30), and one about 130 ms after showed the cut into the new
 * clip at 0 (cli/test/fixtures/info/video-just-played.json). So within this window a reading that
 * cannot be the new clip yet - nothing, another file, or further in than the time since the take -
 * is the take ARRIVING: it ends nothing and restarts nothing. After the window the same reading
 * means what it says. A file loading from slow storage has a second and a half.
 */
export const LOADING_GRACE_MS = 1500;
/** How far ahead of the time since the take a new clip's first reading may be: frame rounding. */
const ARRIVAL_SLACK_S = 0.5;

function targetKey(target: Target): string {
  return target.adapter === 'ograf' ? `ograf ${target.baseUrl}` : `casparcg ${target.host}:${target.port}`;
}

function slotKey(slot: Slot): string {
  return slot.adapter === 'ograf' ? `${slot.rendererId} ${JSON.stringify(slot.renderTarget)}` : `${slot.channel}-${slot.layer}`;
}

/**
 * Whether a reading's file is the item a take named. A clip reads back by the name PLAY was given
 * (`NOACG_FIXTURE/COUNT30`), a still and a template by their path on the server
 * (`media\giorno.jpg`), so both are compared without case, slashes' direction or extension.
 */
export function playsItem(item: ItemRef, reported: string | undefined): boolean {
  if (!reported) return false;
  if (item.kind === 'url') return reported === item.name;
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  const want = norm(item.name);
  const got = norm(reported);
  return got === want || got.endsWith(`/${want}`);
}

/** What a reading says of this Bridge's own take on the slot, while it still has one. */
function owned(m: SlotMemory): Pick<SlotState, 'instance' | 'cueId'> {
  if (!m.instance) return {};
  return { instance: m.instance.id, ...(m.instance.cueId ? { cueId: m.instance.cueId } : {}) };
}

export class SlotMemoryBank {
  /** This process. An instance id starts with it, so a page can tell a restart from a takeover. */
  readonly session: string;
  private count = 0;
  private readonly slots = new Map<string, SlotMemory>();

  /** The Bridge's clock in ms, injectable so a test moves time itself (plan §10). */
  private readonly now: () => number;

  constructor(session = randomBytes(4).toString('hex'), now: () => number = () => performance.now()) {
    this.session = session;
    this.now = now;
  }

  private memory(target: Target, slot: Slot): SlotMemory {
    const key = `${targetKey(target)} ${slotKey(slot)}`;
    let m = this.slots.get(key);
    if (!m) {
      m = { generation: 0, inFlight: 0 };
      this.slots.set(key, m);
    }
    return m;
  }

  generation(target: Target, slot: Slot): number {
    return this.memory(target, slot).generation;
  }

  /** Before a Take, Out, Clear, Pause or Resume is sent: the generation moves first, and until
   *  `settled` the action counts as in flight. */
  advance(target: Target, slot: Slot): number {
    const m = this.memory(target, slot);
    m.inFlight += 1;
    return ++m.generation;
  }

  /** The action `advance` announced has been answered, whichever way. */
  settled(target: Target, slot: Slot): void {
    const m = this.memory(target, slot);
    m.inFlight = Math.max(0, m.inFlight - 1);
  }

  /**
   * The generation a READING of the slot carries. While an action is in flight its answer - and so
   * the instance a take will be given - is not known yet, so the reading is reported as from before
   * it and the page sets it aside. Measured the hard way on 2.5.0 (2026-09-28): the page's regular
   * poll landed between a Take's generation moving and its instance being recorded, read "your clip
   * is not there" under the new number, and took a clip that had just gone on air off the rows.
   */
  private readingGeneration(m: SlotMemory): number {
    return m.generation - m.inFlight;
  }

  /** A take the server accepted: this is now what the Bridge started on the slot. */
  started(target: Target, slot: Slot, item: ItemRef, cueId?: string): string {
    const id = `${this.session}.${++this.count}`;
    this.memory(target, slot).instance = { id, item, startedAt: this.now(), ...(cueId ? { cueId } : {}) };
    return id;
  }

  /** An Out or a Clear the server accepted: nothing of this Bridge's is left on the slot. */
  ended(target: Target, slot: Slot): void {
    delete this.memory(target, slot).instance;
  }

  /**
   * One channel's reading, with what only this Bridge knows added: each layer's generation, and
   * its instance while the layer still plays what the Bridge started there. A layer the Bridge
   * acted on that the server no longer reports at all (after a CLEAR) is reported empty, so the
   * page still receives its generation.
   */
  annotate(target: Target, channel: number, readings: SlotReading[]): SlotState[] {
    const out: SlotState[] = [];
    const seen = new Set<number>();
    for (const r of readings) {
      seen.add(r.layer);
      const m = this.memory(target, { adapter: 'casparcg', channel, layer: r.layer });
      const inst = m.instance;
      let arriving = false;
      // With an action in flight the reading is from before it: it judges nothing.
      if (inst && !m.inFlight) {
        const age = this.now() - inst.startedAt;
        const same = r.producer !== 'empty' && r.producer !== 'colour' && playsItem(inst.item, r.file);
        // Just taken, and what the layer shows cannot be the new clip yet (see LOADING_GRACE_MS).
        arriving = age < LOADING_GRACE_MS && (!same || (r.position !== undefined && r.position > age / 1000 + ARRIVAL_SLACK_S));
        const restarted =
          same && !r.loop && inst.lastPosition !== undefined && r.position !== undefined && r.position < inst.lastPosition - RESTART_JUMP_S;
        if (arriving) {
          // Nothing to learn from it: the next reading is the clip's own.
        } else if (same && !restarted) inst.lastPosition = r.position;
        else delete m.instance;
      }
      out.push({ ...r, generation: this.readingGeneration(m), ...owned(m), ...(arriving ? { arriving: true } : {}) });
    }
    const prefix = `${targetKey(target)} ${channel}-`;
    for (const [key, m] of this.slots) {
      if (!key.startsWith(prefix)) continue;
      const layer = Number(key.slice(prefix.length));
      if (!Number.isInteger(layer) || seen.has(layer)) continue;
      // A layer the server has not made yet, just after a take onto a cleared channel: arriving too.
      const arriving = !!m.instance && this.now() - m.instance.startedAt < LOADING_GRACE_MS;
      if (!m.inFlight && !arriving) delete m.instance;
      out.push({
        layer,
        producer: 'empty',
        paused: false,
        loop: false,
        generation: this.readingGeneration(m),
        ...owned(m),
        ...(arriving ? { arriving: true } : {}),
      });
    }
    return out.sort((a, b) => a.layer - b.layer);
  }
}
