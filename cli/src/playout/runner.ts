// THE SEQUENCE RUNNER (docs/CLIP_PLAYBACK_PLAN.md §6.10): Play next, run by the Bridge.
//
// WHY HERE AND NOT IN THE PAGE. A browser slows a hidden tab's timers to about once a minute after
// five minutes, so a queue kept by the page would stall a run of short clips played from a
// background tab. The Bridge is an ordinary local process, already running whenever a server cue can
// be taken, and it keeps running with the page closed.
//
// HOW IT WORKS. The server switches clips by itself: `LOADBG c-l <next> [MIX n] AUTO` plays the next
// file when the one on air ends. A layer has ONE background, so the server can only ever hold the
// next file; something has to queue each one after that. A sequence's own action plays the first
// entry and queues the second at once (adapters/casparcg.ts). While it runs, this reads the slot four
// times a second, and when it sees the switch it queues the next - or, after the last entry, that
// entry's own Clear.
//
// THE RULES, each with its test in cli/test/runner.test.mjs:
//   1. One serial queue per slot (./slots.ts): the runner's queuing and the page's verbs are sent
//      one at a time, in order.
//   2. Generations: work planned under a generation is dropped, unsent, when the slot's generation
//      has moved on - Out, a new Take, Clear, Pause or Resume - so a late `LOADBG … AUTO` can never
//      reach a layer that was taken off, where it would play at once.
//   3. Queue ahead: a member after the first is at least two seconds long, so the next file is
//      always queued well before the one on air ends.
//   4. Never queue onto a paused slot: the server checks AUTO before pause, so a follower queued
//      while a clip is paused in its last frames would start at once. It waits for Resume.
//   5. Disarm: Out with a follower queued clears the layer, and a refused Take replaces the
//      follower with nothing (adapters/casparcg.ts, from what ./slots.ts remembers).
//   6. Foreign content: when the slot plays something this runner did not start, it ends its
//      sequence and sends nothing.
//   7. A restarted Bridge has no sequences; whatever the server had queued plays by its own rule.
//   8. The Bridge that last took a slot owns it; any other one that sees the slot change ends its own.
//
// TIME IS INJECTED. The runner never reads a clock; `round()` is one pass, and the Bridge calls it
// every RUNNER_INTERVAL_MS. A test calls it itself after moving the fake server's clock.

import type { PlayoutAdapter } from './adapters/casparcg.js';
import type { CasparSlot, SlotState, Target } from './protocol.js';
import type { SlotMemoryBank, SlotReading } from './slots.js';

/** Whether the clip on a layer was PLAYed from part way in and has not reached its segment yet. */
function startingOn(readings: SlotReading[], layer: number): boolean {
  return !!readings.find((l) => l.layer === layer)?.starting;
}

/** Four readings a second while a sequence runs. INFO answers in about 2 ms on the real 2.5.0. */
export const RUNNER_INTERVAL_MS = 250;

export interface RunnerOptions {
  memory: SlotMemoryBank;
  adapters: PlayoutAdapter[];
  log?: (line: string) => void;
}

export class SequenceRunner {
  private readonly memory: SlotMemoryBank;
  private readonly byId: Map<string, PlayoutAdapter>;
  private readonly log: (line: string) => void;
  /** A round still reading: the next tick is skipped rather than stacked on it. */
  private busy = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: RunnerOptions) {
    this.memory = options.memory;
    this.byId = new Map(options.adapters.map((a) => [a.id, a]));
    this.log = options.log ?? (() => {});
  }

  /**
   * Read every channel a sequence runs on once, and queue what each of its slots needs next. A
   * round never throws: it runs off a timer in a process that must outlive any one mistake, so
   * whatever goes wrong is logged and the next round starts afresh.
   */
  async round(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // One reading per channel, however many of its layers run a sequence.
      const channels = new Map<string, { target: Target; channel: number; slots: { slot: CasparSlot; planned: number }[] }>();
      for (const { target, slot, run } of this.memory.runningSequences()) {
        if (slot.adapter !== 'casparcg') {
          this.memory.sequenceEnded(target, slot);
          continue;
        }
        const key = `${JSON.stringify(target)} ${slot.channel}`;
        const group = channels.get(key) ?? { target, channel: slot.channel, slots: [] };
        group.slots.push({ slot, planned: run.generation });
        channels.set(key, group);
      }
      for (const { target, channel, slots } of channels.values()) {
        const adapter = this.byId.get(target.adapter);
        if (!adapter?.state || !adapter.follow) {
          for (const { slot } of slots) this.memory.sequenceEnded(target, slot);
          continue;
        }
        // The reading also moves the slots' memory on: a switch the server made by itself makes the
        // next entry the one on air, and something nobody here started ends the sequence (./slots.ts).
        const read = await adapter.state(target, channel);
        // A reading that failed - a dropped connection, a slow server - changes nothing: the next
        // round reads again. Only what the server SAYS ends a sequence.
        if (!read.ok) continue;
        const layers = this.memory.annotate(target, channel, read.value);
        for (const { slot, planned } of slots) await this.step(adapter, target, slot, planned, read.value, layers);
      }
    } catch (e) {
      this.log(`the sequence runner's round failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.busy = false;
    }
  }

  /** Four times a second from now on, until `stop`. The Bridge's own clock; tests call `round`. */
  start(intervalMs = RUNNER_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.round(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One slot of a channel just read: what its sequence needs next, queued in the slot's own queue. */
  private async step(adapter: PlayoutAdapter, target: Target, slot: CasparSlot, planned: number, readings: SlotReading[], layers: SlotState[]): Promise<void> {
    const run = this.memory.sequence(target, slot);
    if (!run) return;
    // The sequence is still the one planned, unmoved, with nothing queued behind the entry on air.
    // Asked again inside the queue, since an Out, a Take or the re-read below may move it on.
    const current = () => {
      const now = this.memory.sequence(target, slot);
      return !!now && now.generation === planned && this.memory.generation(target, slot) === planned && now.index === run.index && now.queued === undefined;
    };
    if (!current()) return;
    const here = layers.find((l) => l.layer === slot.layer);
    // Still arriving, not inside its segment yet, or paused: nothing is queued now (rule 4, and
    // adapters/casparcg.ts `startsPartWay`). Resume re-stamps the sequence.
    if (!here || here.arriving || here.paused || startingOn(readings, slot.layer)) return;
    const on = run.entries[run.index];
    // A still never ends, whatever the list said: a sequence cannot go on from one.
    if (here.producer === 'still') {
      this.log(`sequence on ${slot.channel}-${slot.layer} stopped: ${on.item.name} is a still`);
      this.memory.sequenceEnded(target, slot);
      return;
    }
    const last = run.index === run.entries.length - 1;
    if (last && on.playback?.end !== 'clear') {
      // The last entry holds or loops by itself: nothing is left to queue.
      this.memory.sequenceEnded(target, slot);
      return;
    }
    const what = last ? ('clear' as const) : run.index + 1;
    await this.memory.serial(target, slot, async () => {
      // Checked again inside the queue: an Out or a Take that arrived while this was being decided
      // has moved the generation, and the line is dropped unsent (rule 2).
      if (!current()) return;
      // And the slot is read once more, right before the line goes: another Bridge or client may
      // have taken it since the reading this was decided on, and no generation of ours says so
      // (rules 6 and 8). What that reading shows ends the sequence here, and nothing is sent.
      const check = await adapter.state!(target, slot.channel);
      if (!check.ok) return;
      const again = this.memory.annotate(target, slot.channel, check.value).find((l) => l.layer === slot.layer);
      if (!current() || !again || again.paused || again.arriving || again.instance === undefined || startingOn(check.value, slot.layer)) return;
      const r = await adapter.follow!(
        target,
        slot,
        what === 'clear' ? { clear: { fadeOut: on.playback?.fadeOut } } : { entry: run.entries[what], last: what === run.entries.length - 1 },
      );
      if (!r.ok) {
        // The server refused the next file (it was removed, say): the clip on air plays out by its
        // own ending, and the sequence stops here rather than trying again every quarter second.
        this.log(`sequence on ${slot.channel}-${slot.layer} stopped: ${r.error.detail}`);
        this.memory.sequenceEnded(target, slot);
        return;
      }
      this.log(`sequence on ${slot.channel}-${slot.layer} queued ${what === 'clear' ? 'its clear' : run.entries[what].item.name}`);
      this.memory.sequenceQueued(target, slot, what, r.value.follower ?? { file: 'EMPTY' });
    });
  }
}
