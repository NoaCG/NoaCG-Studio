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
//   one it holds or waits on (`h`)            by its entry: loading, late amber; placing grey; failed red
//
// An output from #2608 on (it carries a boot mark) is judged by its one settled fact instead
// (G2 section 4a): `settledLines` below, fed by `runTrack.ts`.
//
// Pure, Node-tested (scripts/run-confirm.test.mjs, scripts/run-settled.test.mjs); the page feeds it and playoutStatus.ts words it.

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
  /** #2608 (G2 section 4a): an output with a boot mark, as `runTrack.ts` reads it. `run` above is
   *  then the kept report (or null); `since` is the later of this page's first sight of the boot
   *  and its taking the current epoch; `wait` when the current wait began, and `settled` when the
   *  first settled report after a wait arrived, both on this page's clock. */
  mark?: { since: number; none?: 'none' | 'two' | 'epoch'; wait?: number; settled?: number };
  /** Absent from Presence: since when (its leave as this page saw it, or the page's (re)join). */
  goneSince?: number;
}

/** This page's own Presence link (M6, P4): joined, first joining (since when), or down. */
export interface ConfirmLink {
  status: 'joined' | 'joining' | 'down';
  since: number;
}

/** M6: a page still joining reads grey this long before "cannot confirm". */
export const JOINING_GREY_MS = 5_000;
/** M6: a boot with no report the page keeps reads red after the boot's 60 s plus one Presence update. */
export const BOOT_RED_MS = 70_000;
/** M4: a `placing` wait reads grey this long, then amber. */
export const PLACING_AMBER_MS = 5_000;

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
  boot: 'it did not read what is on air in 60 s',
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
  if (kind === 'placing') {
    // W1's measurement, capped at 2 s: not run yet, nothing wrong.
    return { tone: 'idle', output, graphic, short: 'Confirming…', label: `${graphic}: placing on ${output}` };
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
  /** #2608: this page's own link; without it, `presenceJoined` alone as before. */
  link?: ConfirmLink;
}): ConfirmLine[] {
  const lines: ConfirmLine[] = [];
  const link = input.link;
  for (const out of input.outputs) {
    // M6, P4: a page that cannot hear Presence never reads green, whatever any output says.
    if (link && link.status !== 'joined') {
      lines.push(
        link.status === 'joining' && input.now - link.since < JOINING_GREY_MS
          ? { tone: 'idle', output: out.name, graphic: null, short: 'Confirming…', label: `${out.name}: connecting to the outputs` }
          : { tone: 'warn', output: out.name, graphic: null, short: `${out.name} cannot confirm`, label: `${out.name} cannot confirm: this page cannot hear the outputs right now` },
      );
      continue;
    }
    // M6: absent from Presence, nothing it reported counts: grey, then red from 15 s.
    if (link && !out.present && out.goneSince !== undefined) {
      const age = input.now - out.goneSince;
      lines.push(
        age >= CONFIRM_RED_MS
          ? { tone: 'bad', output: out.name, graphic: null, short: `${out.name} not answering`, label: `${out.name} has not answered for ${secs(age)}` }
          : { tone: 'idle', output: out.name, graphic: null, short: 'Confirming…', label: `${out.name} not answering (${secs(age)})` },
      );
      continue;
    }
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
    if (out.mark) {
      settledLines(lines, out, input.owed, input.now, input.presenceJoined);
      continue;
    }
    const run = out.run;
    // Each held or failed graphic once, by its own entry: work an output has received and not run
    // keeps green away whether or not this page saw the command (a page opened mid-hold owes only
    // its seed).
    if (run) {
      for (const graphic of Object.keys(run.h)) lines.push(heldLine(out.name, graphic, run.h[graphic]));
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
  // No output known yet: nothing has confirmed anything, so the seed and every owed row stay.
  if (outputs.length === 0) return [...owed];
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

/** The graphics a wait is about, in the panel's words. */
const waitWhat = (run: RunReport): string => {
  const names = Object.keys(run.h).filter((g) => g !== '');
  if (names.length === 0) return 'what is on air';
  return names.length <= 2 ? names.join(' and ') : `${names[0]} and ${names.length - 1} more`;
};

/** An output from #2608 on (G2 section 4a, M3 to M7): its one settled fact decides. */
function settledLines(lines: ConfirmLine[], out: ConfirmOutput, owed: readonly Owed[], now: number, presenceJoined: boolean): void {
  const mark = out.mark!;
  const run = out.run;
  // M6: a boot mark and no report kept (no run yet, two entries, another epoch).
  if (!run || mark.none) {
    const age = now - mark.since;
    lines.push(
      age >= BOOT_RED_MS
        ? { tone: 'bad', output: out.name, graphic: null, short: `${out.name} did not confirm`, label: `${out.name} has not confirmed what is on air for ${secs(age)}` }
        : age >= PLACING_AMBER_MS
          ? { tone: 'warn', output: out.name, graphic: null, short: `Waiting for ${out.name}`, label: `${out.name} has not confirmed what is on air (${secs(age)})` }
          : { tone: 'idle', output: out.name, graphic: null, short: 'Confirming…', label: `${out.name}: starting` },
    );
    return;
  }
  // M4: while unsettled, the wait decides every owed position, the seed included.
  if (run.w !== undefined && run.w !== 0) {
    const what = waitWhat(run);
    const k = run.k ?? 'placing';
    if (k === 'failed') {
      const why = REASONS[run.y || ''] || 'it did not run';
      lines.push({ tone: 'bad', output: out.name, graphic: null, short: `${what} did not play`, label: `${what} did not play on ${out.name}: ${why}` });
    } else if (k === 'placing') {
      const age = mark.wait !== undefined ? now - mark.wait : (run.wa ?? 0);
      lines.push(
        age >= PLACING_AMBER_MS
          ? { tone: 'warn', output: out.name, graphic: null, short: 'Updating outputs', label: `${what}: loading on ${out.name}` }
          : { tone: 'idle', output: out.name, graphic: null, short: 'Confirming…', label: `${what}: placing on ${out.name}` },
      );
    } else {
      const label = k === 'late' ? `${what}: loading on ${out.name}, it will appear without its entrance` : `${what}: loading on ${out.name}`;
      lines.push({ tone: 'warn', output: out.name, graphic: null, short: 'Updating outputs', label });
    }
    return;
  }
  // M3 and M7: settled; a position it has not received ages from the latest of when this page
  // learned of it, its first sight of the boot and the first settled report after a wait.
  // Each position ages on its own clock (the seed's is slower), so the worst line decides: a graphic
  // and the seed that start ageing together never let the seed's longer grey hide the graphic.
  const from = Math.max(mark.since, mark.settled ?? 0);
  let worst: ConfirmLine | null = null;
  for (const o of owed) {
    if (run.p >= o.at) continue;
    const line = ageLine(out.name, o, now - Math.max(o.learnedAt, from), presenceJoined);
    if (!worst || TONE_RANK[line.tone] > TONE_RANK[worst.tone]) worst = line;
  }
  if (worst) lines.push(worst);
}

const TONE_RANK: Record<ConfirmTone, number> = { ok: 0, idle: 1, warn: 2, bad: 3 };

/** A position not received, by its age (section 6). */
function ageLine(output: string, oldest: Owed, age: number, presenceJoined: boolean): ConfirmLine {
  const seed = oldest.graphic === null;
  const amber = seed ? SEED_AMBER_MS : CONFIRM_AMBER_MS;
  const red = seed ? SEED_RED_MS : CONFIRM_RED_MS;
  const what = oldest.graphic || 'what is on air';
  if (age >= red && !(seed && !presenceJoined)) {
    return { tone: 'bad', output, graphic: oldest.graphic, short: `${output} did not confirm`, label: `${output} has not confirmed ${what} for ${secs(age)}` };
  }
  if (age >= amber) {
    return seed && !presenceJoined
      ? { tone: 'warn', output, graphic: null, short: `${output} cannot confirm`, label: `${output} has not confirmed ${what}, and this page cannot hear the outputs right now` }
      : { tone: 'warn', output, graphic: oldest.graphic, short: `Waiting for ${output}`, label: `${output} has not confirmed ${what} (${secs(age)})` };
  }
  return { tone: 'idle', output, graphic: oldest.graphic, short: 'Confirming…', label: `${what}: sent, waiting for ${output}` };
}
