// THE BRIDGE'S MEMORY OF ITS SLOTS (docs/CLIP_PLAYBACK_PLAN.md §6.7 and §6.10; docs/BRIDGE.md §3).
//
// The Bridge used to keep nothing between requests but its token. Reading the server's state
// honestly, and running a sequence, need facts that only the process that sent the commands can
// hold, so it keeps them, in memory, per target and slot, and nothing else:
//
//   GENERATION  a counter that every Take, Out, Clear, Pause, Resume, new sequence and changed
//               ending on the slot moves BEFORE its command is sent, reported on the action's
//               reply and on every reading - not Update or Next, which change nothing the clock shows. The page
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
//   SEQUENCE    the files still to play after the one on air, and whether the first plays again after
//               the last (./runner.ts runs it).
//   QUEUE       ONE serial queue per slot: every command for the slot - the page's verbs and the
//               runner's queuing alike - is sent in order, one at a time (§6.10, rule 1).
//
// A restarted Bridge remembers nothing: its readings carry no instances and its session id is new,
// so the page shows what the server holds as unidentified rather than guessing, and whatever the
// server already had queued plays by the server's own rule.

import { randomBytes } from 'node:crypto';
import type { ActResult } from './adapters/casparcg.js';
import type { ItemRef, PlayoutAction, SequenceEntry, Slot, SlotState, Target } from './protocol.js';

/** One INFO layer as the adapter read it, before the Bridge adds what only it knows. `starting` is
 *  the Bridge's own: a clip PLAYed from part way in that has not reached its segment yet, behind
 *  which nothing may be queued (adapters/casparcg.ts `startsPartWay`). It never goes to the page. */
export type SlotReading = Omit<SlotState, 'instance' | 'cueId' | 'generation' | 'sequence'> & { starting?: boolean };

/** One file the runner plays on a slot. A take that owes its Clear at the end is a run of one
 *  entry with no list facts; a sequence's entries carry them. */
export type RunEntry = Omit<SequenceEntry, 'media'> & { media?: SequenceEntry['media'] };

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
  entries: RunEntry[];
  /** The entry on air. */
  index: number;
  /** What the runner has queued behind it: the next entry's index, or `clear` for the last
   *  entry's own Clear. Absent = nothing yet. */
  queued?: number | 'clear';
  /** The first entry plays again after the last, until Out (Loop the folder). */
  loop?: true;
}

/** The entry that plays after the one on air: the next, the first again when the run loops, or
 *  none after the last. */
export function followingIndex(run: Pick<SequenceRun, 'entries' | 'index' | 'loop'>): number | undefined {
  if (run.index < run.entries.length - 1) return run.index + 1;
  return run.loop ? 0 : undefined;
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
/** How far back the position must go for the switch to a queued copy of the SAME file to be seen. A
 *  MIX into it starts its fade in before the end, and INFO reports the incoming file's position, so the
 *  jump can be as small as the clip's length less its fade in less a reading's gap: 0.75 s for a 2 s
 *  member with a 1 s fade, read a quarter of a second apart. A playing clip never otherwise goes back. */
const SWITCH_JUMP_S = 0.1;

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

/** Nothing of this Bridge's is left on the slot: no take, no sequence, nothing queued behind it. */
function forget(m: SlotMemory): void {
  delete m.instance;
  delete m.sequence;
  delete m.follower;
}

/** What a reading says of this Bridge's own take on the slot, while it still has one. */
function owned(m: SlotMemory): Pick<SlotState, 'instance' | 'cueId' | 'sequence'> {
  if (!m.instance) return {};
  const seq = m.sequence;
  // Only a sequence has entries after the first, and each came with the server's list facts. One
  // that loops always has more to play: every other entry, in the order they come round.
  const next = !seq
    ? []
    : seq.loop
      ? [...seq.entries.slice(seq.index + 1), ...seq.entries.slice(0, seq.index)]
      : seq.entries.slice(seq.index + 1);
  return {
    instance: m.instance.id,
    ...(m.instance.cueId ? { cueId: m.instance.cueId } : {}),
    ...(next.length ? { sequence: { next: next as SequenceEntry[], ...(seq?.loop ? { loop: true } : {}) } } : {}),
  };
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
      m = { target, slot, generation: 0, inFlight: 0, queue: Promise.resolve() };
      this.slots.set(key, m);
    }
    return m;
  }

  generation(target: Target, slot: Slot): number {
    return this.memory(target, slot).generation;
  }

  /**
   * Before a Take, Out, Clear, Pause, Resume, new sequence or changed ending is sent: the generation
   * moves first, and until `settled` the action counts as in flight. `keepsSequence` is Pause and Resume: the
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

  /** A sequence the server accepted - or a take that still owes its Clear: its first entry plays,
   *  and the runner owns what follows. Called after `started`, under the generation the action moved
   *  to. `queuedNext` says the action already queued the second entry; `loop` that the first plays
   *  again after the last. */
  sequenceStarted(target: Target, slot: Slot, entries: RunEntry[], queuedNext: boolean, loop = false): void {
    const m = this.memory(target, slot);
    m.sequence = { generation: m.generation, entries, index: 0, ...(queuedNext ? { queued: 1 } : {}), ...(loop ? { loop: true as const } : {}) };
  }

  /** An Out or a Clear the server accepted: nothing of this Bridge's is left on the slot. */
  ended(target: Target, slot: Slot): void {
    forget(this.memory(target, slot));
  }

  /**
   * What an action's answer leaves on the slot: the instance a take or a sequence started, the run
   * the runner owns, what now waits behind the clip. Called INSIDE the slot's serial queue, so the
   * next command queued for the slot - the runner's included - always sees it. Returns a take's
   * instance id.
   */
  acted(target: Target, slot: Slot, action: PlayoutAction, r: ActResult): string | undefined {
    let instance: string | undefined;
    if (r.ok && (action.verb === 'out' || action.verb === 'clear')) this.ended(target, slot);
    if (r.ok && action.verb === 'take') {
      instance = this.started(target, slot, action.item, action.cueId);
      // A Clear at the end held back because the clip starts part way in is the runner's to queue
      // once the clip runs: a run of this one entry.
      if (r.value.held) this.sequenceStarted(target, slot, [{ item: action.item, ...(action.cueId ? { cueId: action.cueId } : {}), playback: action.playback }], false);
    }
    if (r.ok && action.verb === 'sequence') {
      const [first] = action.entries;
      instance = this.started(target, slot, first.item, first.cueId);
      // The second file refused: the first plays out by itself and nothing is retried; the reply's
      // warning says so, and the reading shows no sequence.
      if (!r.value.warning) this.sequenceStarted(target, slot, action.entries, !!r.value.follower, action.loop === true);
    }
    if (r.ok && action.verb === 'ending') {
      // The clip on air stays the instance it was: nothing was played again.
      const inst = this.memory(target, slot).instance;
      instance = inst?.id;
      // Play next from here: the clip on air is the run's first entry, and the action queued the second.
      if (inst && action.then && !r.value.warning) {
        this.sequenceStarted(target, slot, [{ item: inst.item, ...(inst.cueId ? { cueId: inst.cueId } : {}) }, ...action.then], true);
      }
    }
    if (r.ok && r.value.follower !== undefined) this.setFollower(target, slot, r.value.follower);
    if (!r.ok && r.follower === null) this.setFollower(target, slot, null);
    return instance;
  }

  /** Whether the slot still plays the item this Bridge last started there, as far as its readings
   *  say: an ending may be changed only on a clip this Bridge put on air. */
  plays(target: Target, slot: Slot, item: ItemRef): boolean {
    const inst = this.memory(target, slot).instance;
    return !!inst && inst.item.kind === item.kind && inst.item.name === item.name;
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
    const backBy = (s: number) => inst.lastPosition !== undefined && r.position !== undefined && r.position < inst.lastPosition - s;
    const seq = m.sequence;
    const following = seq ? followingIndex(seq) : undefined;
    const next = seq && following !== undefined && seq.queued === following ? seq.entries[following] : undefined;
    // THE SERVER SWITCHED to the next entry by itself - or, in a loop, from the last to the first: a
    // new file, or the same file again from its start. From here that entry is the one on air, and
    // the runner queues the one after it.
    if (seq && next && following !== undefined && holds && playsItem(next.item, r.file) && (!same || backBy(SWITCH_JUMP_S))) {
      seq.index = following;
      delete seq.queued;
      delete m.follower;
      m.instance = { id: inst.id, item: next.item, startedAt: inst.startedAt, ...(next.cueId ? { cueId: next.cueId } : {}), lastPosition: r.position };
      return false;
    }
    const restarted = same && !r.loop && backBy(RESTART_JUMP_S);
    if (same && !restarted) {
      // Just after a take, the same file further in than the time since it is the OLD copy still on
      // the layer, not near enough its end to read as arriving. Kept as the position, it would make the
      // new copy's start look like a switch to a queued copy of the same file.
      const oldCopy = age < LOADING_GRACE_MS && r.position !== undefined && r.position > age / 1000 + SWITCH_JUMP_S;
      if (!oldCopy) inst.lastPosition = r.position;
      return false;
    }
    // Something else plays there - another client's take, a restart, or nothing (a Clear at the end
    // that has played out, as it was told to): nothing of this Bridge's is left, and a sequence it
    // was running ends without another command (§6.10, rule 6). Behind somebody else's clip the
    // follower may still wait; on an empty layer nothing does.
    if (holds) {
      delete m.instance;
      delete m.sequence;
    } else forget(m);
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
    for (const { starting: _starting, ...r } of readings) {
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
      if (!m.inFlight && !arriving) forget(m);
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
