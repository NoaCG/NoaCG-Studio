// WHAT EVERY OUTPUT HAS CONFIRMED (live-publishing G2 section 6; W3, E1, O2, D4).
//
// The production page owes the outputs every command it knows of: each command row it follows on
// the log and its own send answers (with their graphic), and, with no graphic, the head position it
// resolved when it opened (the seed). An output confirms a position of graphic g when what it
// reports having run of g reaches it (runReport.ts `ranFor`). Green needs every owed position
// confirmed by every expected output; anything unreported is unknown and never green (E1).
//
//   a position the output has not received   grey under 5 s, amber from 5 s, red from 15 s
//                                             (the seed: 15 s and 30 s, never red with Presence down)
//   one it holds or waits on (`h`)            by its entry: loading, late, placing amber; failed red
//
// Pure, Node-tested (scripts/run-confirm.test.mjs); the page feeds it and playoutStatus.ts words it.

import { ranFor, type HeldEntry, type RunReport } from './runReport.ts';

export const CONFIRM_AMBER_MS = 5_000;
export const CONFIRM_RED_MS = 15_000;
export const SEED_AMBER_MS = 15_000;
export const SEED_RED_MS = 30_000;

/** A position every expected output must reach, with when this page learned of it. */
export interface Owed {
  at: number;
  /** null: the seed, the head this page resolved when it opened or when the epoch changed. */
  graphic: string | null;
  learnedAt: number;
}

/** One expected output as the page knows it. */
export interface ConfirmOutput {
  id: string;
  name: string;
  /** Its newest run report in the page's epoch, or null when it has said none. */
  run: RunReport | null;
  /** Present on the live topic, with an entry: an output built before W3 has no `run` there. */
  present: boolean;
  /** It follows the old log by row id (protocol 1): it cannot confirm. */
  oldLog?: boolean;
  /** Its entry says it speaks W3 (`ready.run`): without that it is an older build. */
  speaks: boolean;
}

export type ConfirmTone = 'ok' | 'idle' | 'warn' | 'bad';

export interface ConfirmLine {
  tone: ConfirmTone;
  output: string;
  graphic: string | null;
  /** Header words. */
  short: string;
  /** The panel's line. */
  label: string;
}

const rank: Record<ConfirmTone, number> = { bad: 3, warn: 2, idle: 1, ok: 0 };

const secs = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`;

const REASONS: Record<string, string> = {
  unpublished: 'it is not published',
  load: 'it did not load in 20 s',
  script: 'it has a script error',
  limit: 'too many commands while it loaded',
  typed: 'its typed data cannot be read here',
};

/** What one entry of an output's `h` says about a position it covers. */
function heldLine(output: string, graphic: string, entry: HeldEntry): ConfirmLine {
  const kind = entry[1];
  if (kind === 'failed') {
    const why = REASONS[entry[2] || ''] || 'it did not run';
    return { tone: 'bad', output, graphic, short: `${graphic} did not play`, label: `${graphic} did not play on ${output}: ${why}` };
  }
  if (kind === 'late') {
    return { tone: 'warn', output, graphic, short: 'Updating outputs', label: `${graphic}: loading on ${output}, it will appear without its entrance` };
  }
  return { tone: 'warn', output, graphic, short: 'Updating outputs', label: `${graphic}: loading on ${output}` };
}

/**
 * Every line that keeps green away, worst first: per output, the positions it has not confirmed.
 * Empty means every owed position is confirmed by every expected output.
 */
export function confirmLines(input: {
  now: number;
  owed: readonly Owed[];
  outputs: readonly ConfirmOutput[];
  presenceJoined: boolean;
}): ConfirmLine[] {
  const lines: ConfirmLine[] = [];
  for (const out of input.outputs) {
    if (out.oldLog) {
      lines.push({
        tone: 'warn',
        output: out.name,
        graphic: null,
        short: `${out.name} cannot confirm`,
        label: `${out.name} follows this production's older log, which cannot confirm what it runs. It confirms again once the rows from before the numbered log are pruned (within 14 days) and it reloads.`,
      });
      continue;
    }
    if (out.present && !out.speaks && !out.run) {
      lines.push({
        tone: 'warn',
        output: out.name,
        graphic: null,
        short: `Reload ${out.name} when nothing is on air`,
        label: `${out.name} cannot confirm what it runs. Reload it when nothing is on air, or press Check now.`,
      });
      continue;
    }
    const run = out.run;
    // Each held or failed graphic once, by its own entry.
    if (run) {
      for (const graphic of Object.keys(run.h)) {
        const entry = run.h[graphic];
        if (input.owed.some((o) => o.graphic === graphic && o.at >= entry[0] && o.at <= run.p) || entry[1] === 'failed') {
          lines.push(heldLine(out.name, graphic, entry));
        }
      }
    }
    // The oldest position it has not received decides by its age.
    let oldest: Owed | null = null;
    for (const owed of input.owed) {
      const reached = run ? (owed.graphic === null ? run.p >= owed.at : run.p >= owed.at && ranFor(run, owed.graphic) >= owed.at) : false;
      if (reached) continue;
      // Received and held: its entry above says it.
      if (run && owed.graphic !== null && owed.at <= run.p) continue;
      if (!oldest || owed.learnedAt < oldest.learnedAt) oldest = owed;
    }
    if (oldest) {
      const age = input.now - oldest.learnedAt;
      const seed = oldest.graphic === null;
      const amber = seed ? SEED_AMBER_MS : CONFIRM_AMBER_MS;
      const red = seed ? SEED_RED_MS : CONFIRM_RED_MS;
      const what = oldest.graphic || 'what is on air';
      if (age >= red && !(seed && !input.presenceJoined)) {
        lines.push({ tone: 'bad', output: out.name, graphic: oldest.graphic, short: `${out.name} did not confirm`, label: `${out.name} has not confirmed ${what} for ${secs(age)}` });
      } else if (age >= amber) {
        lines.push(
          seed && !input.presenceJoined
            ? { tone: 'warn', output: out.name, graphic: null, short: `${out.name} cannot confirm`, label: `${out.name} has not confirmed ${what}, and this page cannot hear the outputs right now` }
            : { tone: 'warn', output: out.name, graphic: oldest.graphic, short: `Waiting for ${out.name}`, label: `${out.name} has not confirmed ${what} (${secs(age)})` },
        );
      } else {
        lines.push({ tone: 'idle', output: out.name, graphic: oldest.graphic, short: 'Confirming…', label: `${what}: sent, waiting for ${out.name}` });
      }
    }
  }
  return lines.sort((a, b) => rank[b.tone] - rank[a.tone]);
}

/** Owed positions with everything every expected output has confirmed dropped, so the list stays
 *  as short as what is still unknown. */
export function pruneOwed(owed: readonly Owed[], outputs: readonly ConfirmOutput[]): Owed[] {
  return owed.filter((o) =>
    outputs.some((out) => {
      const run = out.run;
      if (!run) return true;
      return o.graphic === null ? run.p < o.at : run.p < o.at || ranFor(run, o.graphic) < o.at;
    }),
  );
}

/** The newest of two run reports from one output within one epoch: a lower `p` is older; at an
 *  equal `p` the later one heard wins. */
export function newerRun(held: RunReport | null | undefined, heard: RunReport): RunReport {
  if (!held || held.e !== heard.e) return heard;
  return heard.p >= held.p ? heard : held;
}
