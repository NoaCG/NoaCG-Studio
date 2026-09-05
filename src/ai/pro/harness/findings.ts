// FINDINGS - the one currency of the Pro Harness loop (docs/PRO_HARNESS_PLAN.md §5, §7).
//
// Every instrument in the repo speaks a slightly different dialect: the static gate and the
// runtime bench emit `{rule, message}`, the spike instruments emit `{code, detail}`, the design
// rules emit `{code, detail, severity}`, the critic answers yes/no. The loop needs ONE shape so
// that a defect can be given a stable identity, followed across rounds, and counted - because
// the stop rule is not "the model feels done", it is "the measured set of defects is empty, or
// stopped shrinking".
//
// Why a stable id matters, in the owner's own words (2026-09-05): the first refinement usually
// improved the graphic, further generic "look again" passes did almost nothing. A repair round
// is therefore admitted only when it carries NEW EVIDENCE - a finding the previous round did not
// have, or a finding the previous repair failed to remove - and that decision needs to compare
// findings across rounds, which needs an identity that survives re-measurement. `fingerprint`
// is that identity: source + code + locus, never the message, because a message carries numbers
// ("31px past the right edge") that move a pixel between two renders of the same defect.
//
// Pure module: no DOM, no model, no repo imports. Tested in scripts/pro-harness.test.mjs.

/** BLOCK stops delivery; ADVISE is shown to the model with a judgement note and never counted. */
export type FindingSeverity = 'block' | 'advise';

/** Which instrument minted the finding - part of its identity, because two instruments can
 *  describe one defect and the model should see both readings, not a merge of them. */
export type FindingSource =
  | 'static'      // validateTemplate - the code's structure
  | 'runtime'     // benchTemplateRuntime - lifecycle, binding, overlap, overflow, stress
  | 'instrument'  // spacing / proportion / axis / mark / ticker - measured geometry
  | 'rules'       // designRules - size, weight, contrast, safe area
  | 'critic'      // the structured visual critique - a model's structured reading of a frame
  | 'operator'    // the control-page smoke - can an operator drive it
  | 'harness';    // the loop's own refusals - a patch that broke a contract

export type FindingFrame = 'hold' | 'long' | 'edge' | 'step' | 'exit' | 'stress';

export interface Finding {
  /** Stable across rounds: `fingerprint()` of the fields below. */
  id: string;
  code: string;
  severity: FindingSeverity;
  source: FindingSource;
  /** What the finding is about - a field id, a selector, a part name. Part of the identity. */
  locus?: string;
  /** Which rendered state showed it. Part of the identity: a long-string defect is not the
   *  hold's defect, and fixing one does not fix the other. */
  frame?: FindingFrame;
  /** The teaching sentence: what is wrong and by how much. Never part of the identity. */
  message: string;
  /** ONE concrete direction the platform can state, when it can. Optional on purpose - an
   *  instrument that cannot name the fix says so by leaving it out. */
  fix?: string;
}

export type FindingInput = Omit<Finding, 'id'>;

/** Longest a finding message may be when it reaches the model. The bench is chatty by design. */
export const MAX_MESSAGE_CHARS = 320;
/** How many findings of each severity one round may hand the model. */
export const MAX_BLOCKING_PER_ROUND = 16;
export const MAX_ADVISORY_PER_ROUND = 8;

export function fingerprint(f: FindingInput): string {
  return [f.source, f.code, f.frame ?? '-', (f.locus ?? '-').trim().toLowerCase()].join(':');
}

/** Give each finding its identity, drop exact duplicates (same fingerprint), keep first-seen
 *  order, cap per severity. Blocking findings are listed first so a cap never evicts one for
 *  an advisory. */
export function normalizeFindings(raw: FindingInput[]): Finding[] {
  const seen = new Set<string>();
  const blocking: Finding[] = [];
  const advisory: Finding[] = [];
  for (const f of raw) {
    const id = fingerprint(f);
    if (seen.has(id)) continue;
    seen.add(id);
    const finding: Finding = { ...f, id, message: f.message.slice(0, MAX_MESSAGE_CHARS) };
    (f.severity === 'block' ? blocking : advisory).push(finding);
  }
  return [...blocking.slice(0, MAX_BLOCKING_PER_ROUND), ...advisory.slice(0, MAX_ADVISORY_PER_ROUND)];
}

export const blocking = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.severity === 'block');
export const advisory = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.severity === 'advise');

export interface FindingsDiff {
  /** In the previous round, absent now. */
  fixed: Finding[];
  /** In both rounds - the repair did not reach them. */
  remaining: Finding[];
  /** New this round - a repair that broke something, or a frame that only now measures. */
  introduced: Finding[];
}

export function diffFindings(before: readonly Finding[], after: readonly Finding[]): FindingsDiff {
  const beforeIds = new Set(before.map((f) => f.id));
  const afterIds = new Set(after.map((f) => f.id));
  return {
    fixed: before.filter((f) => !afterIds.has(f.id)),
    remaining: after.filter((f) => beforeIds.has(f.id)),
    introduced: after.filter((f) => !beforeIds.has(f.id)),
  };
}

// ── Rounds and the stop rule ──────────────────────────────────────────────────────────────

export interface RoundRecord {
  /** 1-based. Round 1 is the first design; every later round is a repair. */
  round: number;
  findings: Finding[];
  /** Which model answered this round - the ladder is recorded, never inferred. */
  model: string;
  costUsd: number;
  /** Something the round's patch actually changed. A byte-identical resubmission is a round
   *  that spent money on nothing, and the stop rule reads it as such. */
  changed: boolean;
}

export type Verdict =
  /** The latest round measures clean: nothing blocking remains. */
  | 'delivered'
  /** Blocking findings remain, the last repair moved something, and budget remains. */
  | 'repair'
  /** The last repair fixed nothing and introduced nothing - the same defects twice. Another
   *  identical round is the oscillation the loop exists to refuse. */
  | 'stalled'
  /** A nearly clean round was answered with a worse one. Across the recreate archives the model
   *  never recovered from this (docs/NOACG_PRO_PLAN.md §26.3), so the best round ships instead. */
  | 'regressed'
  /** Round or money budget spent with blocking findings standing. */
  | 'refused';

export interface VerdictInput {
  rounds: readonly RoundRecord[];
  maxRounds: number;
  maxUsd: number;
  spentUsd: number;
}

export interface VerdictResult {
  verdict: Verdict;
  reason: string;
  /** Fewest blocking, then fewest advisories, then EARLIEST - a later round has to beat an
   *  earlier one, and a tie keeps the money already paid (§26.2). */
  bestRound: number;
}

/** The "nearly clean" cut the regression stop reads: at or under this many blocking findings a
 *  worse next round is a regression, not exploration. Read off the recreate corpus - every
 *  unrecovered regression came off a round with ONE finding, the one that recovered came off
 *  FOUR (§26.3). Mutation-checked there: at 10 the same rule loses a deliverable result. */
export const NEARLY_CLEAN_BLOCKING = 2;

export function bestRoundIndex(rounds: readonly RoundRecord[]): number {
  let best = 0;
  for (let i = 1; i < rounds.length; i += 1) {
    const a = rounds[best];
    const b = rounds[i];
    const bBlock = blocking(b.findings).length;
    const aBlock = blocking(a.findings).length;
    if (bBlock < aBlock) { best = i; continue; }
    if (bBlock > aBlock) continue;
    if (advisory(b.findings).length < advisory(a.findings).length) best = i;
  }
  return rounds[best]?.round ?? 0;
}

export function verdictFor(input: VerdictInput): VerdictResult {
  const { rounds } = input;
  const bestRound = bestRoundIndex(rounds);
  const last = rounds[rounds.length - 1];
  if (!last) return { verdict: 'repair', reason: 'no round yet', bestRound: 0 };
  const lastBlocking = blocking(last.findings);
  if (lastBlocking.length === 0) {
    return { verdict: 'delivered', reason: 'nothing blocking remains', bestRound: last.round };
  }
  const previous = rounds[rounds.length - 2];
  if (previous) {
    const prevBlocking = blocking(previous.findings);
    const diff = diffFindings(prevBlocking, lastBlocking);
    if (prevBlocking.length <= NEARLY_CLEAN_BLOCKING && lastBlocking.length > prevBlocking.length) {
      return {
        verdict: 'regressed',
        reason: `round ${previous.round} had ${prevBlocking.length} blocking finding(s) and round ${last.round} has ${lastBlocking.length}; keeping round ${bestRound}`,
        bestRound,
      };
    }
    if (diff.fixed.length === 0 && diff.introduced.length === 0) {
      return {
        verdict: 'stalled',
        reason: `round ${last.round} fixed nothing and introduced nothing - the same ${lastBlocking.length} defect(s) stand twice`,
        bestRound,
      };
    }
  }
  if (rounds.length >= input.maxRounds) {
    return { verdict: 'refused', reason: `round budget spent (${input.maxRounds}) with ${lastBlocking.length} blocking finding(s)`, bestRound };
  }
  if (input.spentUsd >= input.maxUsd) {
    return { verdict: 'refused', reason: `cost ceiling reached ($${input.spentUsd.toFixed(4)} of $${input.maxUsd.toFixed(2)})`, bestRound };
  }
  return { verdict: 'repair', reason: `${lastBlocking.length} blocking finding(s) remain`, bestRound };
}

// ── Rendering findings for the model ──────────────────────────────────────────────────────

/** One finding as the teaching line the model reads. The id is included so a repair can NAME
 *  what it addressed, which is what makes "did the repair reach it" measurable. */
export function describeFinding(f: Finding): string {
  const where = [f.frame ? `${f.frame} frame` : null, f.locus ?? null].filter(Boolean).join(', ');
  const head = `[${f.id}] ${f.message}`;
  const tail = [where ? `(${where})` : null, f.fix ? `Fix: ${f.fix}` : null].filter(Boolean).join(' ');
  return tail ? `${head} ${tail}` : head;
}

/** The round's feedback as the model reads it: blocking first as the contract, advisories
 *  behind a judgement note, and the diff against the previous round so a cheap model knows
 *  what its last patch achieved rather than re-reading the whole list cold. */
export function describeRound(current: readonly Finding[], previous?: readonly Finding[]): string {
  const lines: string[] = [];
  const block = blocking(current);
  const adv = advisory(current);
  if (previous) {
    const diff = diffFindings(blocking(previous), block);
    lines.push(`Your last change fixed ${diff.fixed.length}, left ${diff.remaining.length} standing and introduced ${diff.introduced.length}.`);
    if (diff.introduced.length) lines.push(`New since your last change: ${diff.introduced.map((f) => f.id).join(', ')}.`);
  }
  if (block.length) {
    lines.push('BLOCKING - the graphic does not ship until each of these measures clean:');
    for (const f of block) lines.push(`- ${describeFinding(f)}`);
  } else {
    lines.push('Nothing blocking remains.');
  }
  if (adv.length) {
    lines.push('ADVISORY - use your judgement; fix only what genuinely reads wrong on the frame:');
    for (const f of adv) lines.push(`- ${describeFinding(f)}`);
  }
  return lines.join('\n');
}
