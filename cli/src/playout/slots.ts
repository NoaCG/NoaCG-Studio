// THE BRIDGE'S MEMORY OF ITS SLOTS (docs/CLIP_PLAYBACK_PLAN.md §6.7 and §6.10; docs/BRIDGE.md §3).
//
// The Bridge used to keep nothing between requests but its token. Reading the server's state
// honestly, and running a sequence, need facts that only the process that sent the commands can
// hold, so it keeps them, in memory, per target and slot, and nothing else:
//
//   GENERATION  a counter that every Take, Out, Clear, Pause, Resume and new sequence on the slot
//               moves BEFORE its command is sent, reported on the action's reply and on every
//               reading - not Update or Next, which change nothing the clock shows. The page
//               ignores a reading older than the last action it saw accepted, so an answer that was
//               on its way before a Take can never overrule the Take (plan §18, case 14). The
//               sequence runner's own work carries the generation it was planned under and is
//               dropped, unsent, when the slot's has moved on (§18, case 1).
//   INSTANCE    what this Bridge last started on the slot: an id, the item, and the cue the page
//               named. A reading carries it only while the slot still plays that item and nobody
//               restarted it, so the page can tell its own clip from another client's, and match a
//               clip to its cue again after a reload. In a sequence it follows the entry on air.
//   FOLLOWER    what this Bridge queued behind the clip with AUTO that has not aired yet: an Out
//               then clears the layer rather than stopping it, and a refused Take disarms it.
//   SEQUENCE    the files still to play after the one on air (./runner.ts runs it).
//   QUEUE       ONE serial queue per slot: every command for the slot - the page's verbs and the
//               runner's queuing alike - is sent in order, one at a time (§6.10, rule 1).
//
// A restarted Bridge remembers nothing: its readings carry no instances and its session id is new,
// so the page shows what the server holds as unidentified rather than guessing, and whatever the
// server already had queued plays by the server's own rule.

import { randomBytes } from 'node:crypto';
import type { ItemRef, SequenceEntry, Slot, SlotState, Target } from './protocol.js';

/** One INFO layer as the adapter read it, before the Bridge adds what only it knows. */
export type SlotReading = Omit<SlotState, 'instance' | 'cueId' | 'generation' | 'sequence'>;

interface Instance {
  id: string;
  cueId?: string;
  item: ItemRef;
  /** When the take was accepted, on this Bridge's clock (ms). */
  startedAt: number;
  /** The last position a reading showed, to catch the same file restarted by somebody else. */
  lastPosition?: number;
}

/** What waits behind the clip on the slot, queued by this Bridge with AUTO. `EMPTY` is a Clear at
 *  the clip's end; anything else is the next file of a sequence. */
export interface Follower {
  file: string;
}

/** A sequence running on a slot (docs/CLIP_PLAYBACK_PLAN.md §6.10). */
export interface SequenceRun {
  /** The generation it runs under. Take, Out, Clear and a new sequence end it; Pause and Resume
   *  keep it and re-stamp it, so work planned before them is still dropped. */
  generation: number;
  entries: SequenceEntry[];
  /** The entry on air. */
  index: number;
  /** What the runner has queued behind it: the next entry's index, or `clear` for the last
   *  entry's own Clear. Absent = nothing yet. */
  queued?: number | 'clear';
}

interface SlotMemory {
  target: Target;
  slot: Slot;
  generation: number;
  /** Actions sent and not yet answered. A reading taken meanwhile is from BEFORE them. */
  inFlight: number;
  instance?: Instance;
  follower?: Follower;
  sequence?: SequenceRun;
  /** The tail of the slot's serial queue. */
  queue: Promise<unknown>;
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
function owned(m: SlotMemory): Pick<SlotState, 'instance' | 'cueId' | 'sequence'> {
  if (!m.instance) return {};
  const seq = m.sequence;
  return {
    instance: m.instance.id,
    ...(m.instance.cueId ? { cueId: m.instance.cueId } : {}),
    ...(seq && seq.index < seq.entries.length - 1 ? { sequence: { next: seq.entries.slice(seq.index + 1) } } : {}),
  };
}

export class SlotMemoryBank {
  /** This process. An instance id starts with it, so a page can tell a restart from a takeover. */
  readonly session: string;
  private count = 0;
  private readonly slots = new Map<string, SlotMemory>();

  /** The Bridge's clock in ms, injectable so a test moves time itself (plan §10). */
  readonly now: () => number;

  constructor(session = randomBytes(4).toString('hex'), now: () => number = () => performance.now()) {
    this.session = session;
    this.now = now;
  }

  private memory(target: Target, slot: Slot): SlotMemory {
    const key = `${targetKey(target)} ${slotKey(slot)}`;
    let m = this.slots.get(key);
    if (!m) {
      m = { target, slot, generation: 0, inFlight: 0, queue: Promise.resolve() };
      this.slots.set(key, m);
    }
    return m;
  }

  generation(target: Target, slot: Slot): number {
    return this.memory(target, slot).generation;
  }

  /**
   * Before a Take, Out, Clear, Pause, Resume or new sequence is sent: the generation moves first,
   * and until `settled` the action counts as in flight. `keepsSequence` is Pause and Resume: the
   * sequence survives them, re-stamped, while anything the runner planned before them is dropped.
   * Everything else ends it.
   */
  advance(target: Target, slot: Slot, keepsSequence = false): number {
    const m = this.memory(target, slot);
    m.inFlight += 1;
    m.generation += 1;
    if (m.sequence && keepsSequence) m.sequence.generation = m.generation;
    else delete m.sequence;
    return m.generation;
  }

  /** The action `advance` announced has been answered, whichever way. */
  settled(target: Target, slot: Slot): void {
    const m = this.memory(target, slot);
    m.inFlight = Math.max(0, m.inFlight - 1);
  }

  /**
   * Run `send` in the slot's one serial queue: after everything queued for the slot before it, and
   * before anything after (plan §6.10, rule 1). A failure is the caller's; it never stalls the queue.
   */
  serial<T>(target: Target, slot: Slot, send: () => Promise<T>): Promise<T> {
    const m = this.memory(target, slot);
    const run = m.queue.then(send, send);
    m.queue = run.catch(() => undefined);
    return run;
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

  /** A sequence the server accepted: its first entry plays, and the runner owns the rest. Called
   *  after `started`, under the generation the sequence's own action moved to. */
  sequenceStarted(target: Target, slot: Slot, entries: SequenceEntry[], queuedNext: boolean): void {
    const m = this.memory(target, slot);
    m.sequence = { generation: m.generation, entries, index: 0, ...(queuedNext ? { queued: 1 } : {}) };
  }

  /** An Out or a Clear the server accepted: nothing of this Bridge's is left on the slot. */
  ended(target: Target, slot: Slot): void {
    const m = this.memory(target, slot);
    delete m.instance;
    delete m.sequence;
    delete m.follower;
  }

  /** What this Bridge has queued behind the clip on the slot, as far as it knows. */
  follower(target: Target, slot: Slot): Follower | undefined {
    return this.memory(target, slot).follower;
  }

  /** What an action left queued: a follower, or nothing (`null`). */
  setFollower(target: Target, slot: Slot, follower: Follower | null): void {
    const m = this.memory(target, slot);
    if (follower) m.follower = follower;
    else delete m.follower;
  }

  /** The sequence running on a slot, when one is. */
  sequence(target: Target, slot: Slot): SequenceRun | undefined {
    return this.memory(target, slot).sequence;
  }

  /** Every slot a sequence runs on now, for the runner's rounds. */
  runningSequences(): { target: Target; slot: Slot; run: SequenceRun }[] {
    const out: { target: Target; slot: Slot; run: SequenceRun }[] = [];
    for (const m of this.slots.values()) if (m.sequence) out.push({ target: m.target, slot: m.slot, run: m.sequence });
    return out;
  }

  /** The runner queued something behind the entry on air. The follower is remembered even when an
   *  Out arrived while the line was on the wire and ended the sequence: that Out, next in the slot's
   *  queue, must still clear what now waits on the server. */
  sequenceQueued(target: Target, slot: Slot, what: number | 'clear', follower: Follower): void {
    const m = this.memory(target, slot);
    m.follower = follower;
    if (m.sequence) m.sequence.queued = what;
  }

  /** The runner ends the slot's sequence: something else plays there, or it cannot go on. */
  sequenceEnded(target: Target, slot: Slot): void {
    delete this.memory(target, slot).sequence;
  }

  /**
   * One layer's reading, judged against what this Bridge started there: whether it is still its
   * own, still arriving, or somebody else's. A running sequence follows its entries through the
   * server's own switches here, so the page's reading and the runner's agree on which entry is on
   * air whichever of them read first.
   */
  private observe(m: SlotMemory, r: SlotReading): boolean {
    const inst = m.instance;
    // With an action in flight the reading is from before it: it judges nothing.
    if (!inst || m.inFlight) return false;
    const age = this.now() - inst.startedAt;
    const holds = r.producer !== 'empty' && r.producer !== 'colour';
    const same = holds && playsItem(inst.item, r.file);
    // Just taken, and what the layer shows cannot be the new clip yet (see LOADING_GRACE_MS).
    const arriving = age < LOADING_GRACE_MS && (!same || (r.position !== undefined && r.position > age / 1000 + ARRIVAL_SLACK_S));
    if (arriving) return true;
    const jumpedBack = inst.lastPosition !== undefined && r.position !== undefined && r.position < inst.lastPosition - RESTART_JUMP_S;
    const seq = m.sequence;
    const next = seq && seq.queued === seq.index + 1 ? seq.entries[seq.index + 1] : undefined;
    // THE SERVER SWITCHED to the next entry by itself: a new file, or the same file again from its
    // start. From here that entry is the one on air, and the runner queues the one after it.
    if (seq && next && holds && playsItem(next.item, r.file) && (!same || jumpedBack)) {
      seq.index += 1;
      delete seq.queued;
      delete m.follower;
      m.instance = { id: inst.id, item: next.item, startedAt: inst.startedAt, ...(next.cueId ? { cueId: next.cueId } : {}), lastPosition: r.position };
      return false;
    }
    // A Clear at the end of the last entry has played out: the layer is empty, as it was told to be.
    if (seq && seq.queued === 'clear' && !holds) {
      delete m.instance;
      delete m.sequence;
      delete m.follower;
      return false;
    }
    const restarted = same && !r.loop && jumpedBack;
    if (same && !restarted) {
      inst.lastPosition = r.position;
      return false;
    }
    // Something else plays there - another client's take, a restart, or nothing: nothing of this
    // Bridge's is left, and a sequence it was running ends without another command (§6.10, rule 6).
    delete m.instance;
    delete m.sequence;
    if (!holds) delete m.follower;
    return false;
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
      const arriving = this.observe(m, r);
      out.push({ ...r, generation: this.readingGeneration(m), ...owned(m), ...(arriving ? { arriving: true } : {}) });
    }
    const prefix = `${targetKey(target)} ${channel}-`;
    for (const [key, m] of this.slots) {
      if (!key.startsWith(prefix)) continue;
      const layer = Number(key.slice(prefix.length));
      if (!Number.isInteger(layer) || seen.has(layer)) continue;
      // A layer the server has not made yet, just after a take onto a cleared channel: arriving too.
      const arriving = !!m.instance && this.now() - m.instance.startedAt < LOADING_GRACE_MS;
      if (!m.inFlight && !arriving) {
        delete m.instance;
        delete m.sequence;
        delete m.follower;
      }
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
