// THE BRIDGE'S MEMORY OF ITS SLOTS (docs/CLIP_PLAYBACK_PLAN.md §6.7 and §6.10; docs/BRIDGE.md §3).
//
// The Bridge used to keep nothing between requests but its token. Reading the server's state
// honestly needs two facts that only the process that sent the commands can hold, so it now keeps
// them, in memory, per target and slot, and nothing else:
//
//   GENERATION  a counter that every Take, Out and Clear on the slot moves BEFORE its command is
//               sent, reported on the action's reply and on every reading. The page ignores a
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
  /** The last position a reading showed, to catch the same file restarted by somebody else. */
  lastPosition?: number;
}

interface SlotMemory {
  generation: number;
  instance?: Instance;
}

/** How far a playing clip may go BACK between two readings before it counts as restarted. A
 *  reading is late by milliseconds, never by this much. */
const RESTART_JUMP_S = 0.75;

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

export class SlotMemoryBank {
  /** This process. An instance id starts with it, so a page can tell a restart from a takeover. */
  readonly session: string;
  private count = 0;
  private readonly slots = new Map<string, SlotMemory>();

  constructor(session = randomBytes(4).toString('hex')) {
    this.session = session;
  }

  private memory(target: Target, slot: Slot): SlotMemory {
    const key = `${targetKey(target)} ${slotKey(slot)}`;
    let m = this.slots.get(key);
    if (!m) {
      m = { generation: 0 };
      this.slots.set(key, m);
    }
    return m;
  }

  generation(target: Target, slot: Slot): number {
    return this.memory(target, slot).generation;
  }

  /** Before a Take, Out or Clear is sent: the slot's generation moves first. */
  advance(target: Target, slot: Slot): number {
    return ++this.memory(target, slot).generation;
  }

  /** A take the server accepted: this is now what the Bridge started on the slot. */
  started(target: Target, slot: Slot, item: ItemRef, cueId?: string): string {
    const id = `${this.session}.${++this.count}`;
    this.memory(target, slot).instance = { id, item, ...(cueId ? { cueId } : {}) };
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
      if (inst) {
        const same = r.producer !== 'empty' && r.producer !== 'colour' && playsItem(inst.item, r.file);
        const restarted =
          same && !r.loop && inst.lastPosition !== undefined && r.position !== undefined && r.position < inst.lastPosition - RESTART_JUMP_S;
        if (same && !restarted) inst.lastPosition = r.position;
        else delete m.instance;
      }
      out.push({
        ...r,
        generation: m.generation,
        ...(m.instance ? { instance: m.instance.id, ...(m.instance.cueId ? { cueId: m.instance.cueId } : {}) } : {}),
      });
    }
    const prefix = `${targetKey(target)} ${channel}-`;
    for (const [key, m] of this.slots) {
      if (!key.startsWith(prefix)) continue;
      const layer = Number(key.slice(prefix.length));
      if (!Number.isInteger(layer) || seen.has(layer)) continue;
      delete m.instance;
      out.push({ layer, producer: 'empty', paused: false, loop: false, generation: m.generation });
    }
    return out.sort((a, b) => a.layer - b.layer);
  }
}
