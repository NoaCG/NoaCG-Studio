// THE LEDGER: what the harness plan has spent, across every run and month, and the wall that
// refuses a session when what is left cannot cover it (docs/work-specs/noacg-harness/spec.md 5.3).
//
// `benchmarks/harness/ledger.json` is committed and authoritative. One entry per session (phase,
// stage, arm, model, session id, `usage.list_cost`, wall time, outcome) and one per phase closed.
// The mechanical figure is the sum of the credit sessions' list costs in cents: the same list
// price the bench workspace's own limit meters. Subscription work spends no credit; its notional
// figure is kept beside it, never added to it.
//
// The wall (5.3): a session starts only when `remaining - margin >= budget x concurrency`, the
// margin being one overshoot request per running thread (`o x concurrency`) plus the critic's
// worst thread. A session can pass its budget by one model request per thread; the margin is
// what that costs.
//
// The exam reserve (5.2, set in H4): `reserve` holds `R = 20 (B + o + critic)` for the exam phase.
// For every other phase, `remaining` leaves out what the exam has not yet spent of it, so a
// tuning round can never spend the exam; the exam itself may use it.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LEDGER_FILE = fileURLToPath(new URL('../ledger.json', import.meta.url));
export const LEDGER_FORMAT = 'noacg-harness-ledger-v1';
/** Decision 11: at most $100 of credit on measuring and tuning, across all runs of the plan. */
export const RUN_BUDGET_CENTS = 10_000;
/** 5.2's estimate of one model request at a session's largest context on Opus 5.5, for a ledger with
 *  no reserve yet; once H4 has set one, the wall's margin is the reserve's measured `o`. */
export const DEFAULT_OVERSHOOT_CENTS = 50;
/** 5.2: the exam is 20 sessions, and a tuning round is $15 for about 5 briefs or $9 for 3. */
const EXAM_BRIEFS = 20;
const ROUND_CEILINGS_CENTS = [1_500, 900];
/** 5.1's $0 stages: no `--build` session is ever created for them. */
export const ZERO_CREDIT_PHASES = ['H0', 'H1', 'H2', 'H4'];
/** 5.2: the phase that reserves the exam; every phase after it up to the exam is tuning. */
export const RESERVING_PHASE = 'H4';
/** A phase id in its one spelling: `H4`, never `H04`, so no alias slips past a refusal. */
export const PHASE = /^H(?:0|[1-9]\d*)$/;

export const FUNDING = ['credit', 'subscription', 'none'];
export const OUTCOMES = ['delivered', 'not-ready', 'failed', 'paused', 'refused', 'completed'];
export const KINDS = ['session', 'phase'];

export function emptyLedger() {
  return { format: LEDGER_FORMAT, runBudgetCents: RUN_BUDGET_CENTS, entries: [] };
}

export function readLedger(file) {
  if (!existsSync(file)) throw new Error(`no ledger at ${file}`);
  const ledger = JSON.parse(readFileSync(file, 'utf8'));
  if (ledger.format !== LEDGER_FORMAT) throw new Error(`${file} is not a ${LEDGER_FORMAT} ledger`);
  for (const e of ledger.entries) checkEntry(e);
  if (ledger.reserve) checkReserve(ledger.reserve);
  return ledger;
}

/** A reserve's figure is its own arithmetic, so the number the wall reads cannot drift from 5.2's. */
function checkReserve(r) {
  const problems = [];
  if (!PHASE.test(r.phase ?? '') || !PHASE.test(r.setBy ?? '')) problems.push(`phase "${r.phase}" set by "${r.setBy}"`);
  for (const k of ['briefs', 'sessionBudgetCents', 'overshootCents', 'criticCents', 'cents']) if (!Number.isInteger(r[k]) || r[k] < 0) problems.push(`${k} ${r[k]}`);
  if (!(r.briefs > 0 && r.sessionBudgetCents > 0)) problems.push('a reserve for no session');
  if (r.cents !== r.briefs * (r.sessionBudgetCents + r.overshootCents + r.criticCents)) problems.push(`cents ${r.cents} is not ${r.briefs} x (${r.sessionBudgetCents} + ${r.overshootCents} + ${r.criticCents})`);
  if (problems.length) throw new Error(`ledger reserve: ${problems.join(', ')}`);
}

export function writeLedger(file, ledger) {
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function checkEntry(e) {
  const problems = [];
  if (!KINDS.includes(e.kind)) problems.push(`kind "${e.kind}"`);
  if (!PHASE.test(e.phase ?? '')) problems.push(`phase "${e.phase}"`);
  if (!FUNDING.includes(e.funding)) problems.push(`funding "${e.funding}"`);
  if (!OUTCOMES.includes(e.outcome)) problems.push(`outcome "${e.outcome}"`);
  if (!Number.isInteger(e.listCostCents) || e.listCostCents < 0) problems.push(`listCostCents ${e.listCostCents}`);
  if (e.funding !== 'credit' && e.listCostCents !== 0) problems.push('a cost on an entry the credit did not fund');
  // A credit entry without a session is one that never started: refused by the wall, or failed
  // before the create returned. Either way it cost nothing.
  if (e.kind === 'session' && e.funding === 'credit' && !e.sessionId && !(['refused', 'failed'].includes(e.outcome) && e.listCostCents === 0)) problems.push('a credit session with no session id');
  if (problems.length) throw new Error(`ledger entry ${JSON.stringify(e).slice(0, 160)}: ${problems.join(', ')}`);
}

export function appendEntry(ledger, entry) {
  const e = { at: new Date().toISOString(), listCostCents: 0, ...entry };
  checkEntry(e);
  ledger.entries.push(e);
  return e;
}

/** What the credit has paid, in all or in one phase. */
export function spentCents(ledger, phase = null) {
  return ledger.entries.filter((e) => e.funding === 'credit' && (phase === null || e.phase === phase)).reduce((n, e) => n + e.listCostCents, 0);
}

/** What the exam reserve still holds back from `phase`: nothing from the exam itself or once the
 *  exam is closed, and never more than the exam has yet to spend of it. */
export function heldCents(ledger, phase = null) {
  const r = ledger.reserve;
  if (!r || phase === r.phase || phaseCompleted(ledger, r.phase)) return 0;
  return Math.max(0, r.cents - spentCents(ledger, r.phase));
}

/** `20 x ($2.24 + $0.22)`: the terms a reserve was set from, as every report names them. */
export function reserveTerms(r) {
  return `${r.briefs} x (${dollars(r.sessionBudgetCents)} + ${dollars(r.overshootCents)}${r.criticCents ? ` + ${dollars(r.criticCents)}` : ''})`;
}

/** What `phase` may still spend of the run's budget: the exam reserve is not in it. */
export function remainingCents(ledger, phase = null) {
  return ledger.runBudgetCents - spentCents(ledger) - heldCents(ledger, phase);
}

/**
 * 5.2's arithmetic on the ledger as it stands: the reserve `R = briefs x (B + o + critic)`, what is
 * left for tuning `T = budget - spent - R`, and how many rounds fit at each ceiling.
 */
export function reservation(ledger, { sessionBudgetCents, overshootCents, criticCents = 0, briefs = EXAM_BRIEFS, phase = 'H8', setBy }) {
  const reserve = { phase, setBy, briefs, sessionBudgetCents, overshootCents, criticCents, cents: briefs * (sessionBudgetCents + overshootCents + criticCents) };
  checkReserve(reserve);
  const spent = spentCents(ledger);
  const tuningCents = ledger.runBudgetCents - spent - reserve.cents;
  const rounds = ROUND_CEILINGS_CENTS.map((ceilingCents) => ({ ceilingCents, rounds: Math.max(0, Math.floor(tuningCents / ceilingCents)) }));
  return { reserve, runBudgetCents: ledger.runBudgetCents, spentCents: spent, tuningCents, rounds };
}

/**
 * May a session (or `concurrency` sessions at once) start? Refused when what is left, less the
 * overshoot margin, is below the budgets it would book. The margin's terms default to the
 * reserve's, the measured `o` and critic share R was set from.
 */
export function admit(ledger, { budgetCents, concurrency = 1, overshootCents = ledger.reserve?.overshootCents ?? DEFAULT_OVERSHOOT_CENTS, criticCents = ledger.reserve?.criticCents ?? 0, phase = null, ceilingCents = null }) {
  if (!Number.isInteger(budgetCents) || budgetCents <= 0) throw new Error(`a session budget is a positive whole number of cents, got ${budgetCents}`);
  // A phase's own ceiling (5.1: H3's $10, a tuning round's) is a wall inside the run's.
  const runLeft = remainingCents(ledger, phase);
  const phaseLeft = ceilingCents === null ? Infinity : ceilingCents - phaseSpentCents(ledger, phase);
  const remaining = Math.min(runLeft, phaseLeft);
  const marginCents = overshootCents * concurrency + criticCents;
  const neededCents = budgetCents * concurrency;
  const ok = remaining - marginCents >= neededCents;
  const held = heldCents(ledger, phase);
  const holder = phaseLeft < runLeft ? `${phase}'s ${dollars(ceilingCents)} ceiling has` : `the ledger has${held ? `, past the ${dollars(held)} held for ${ledger.reserve.phase}'s exam,` : ''}`;
  return {
    ok,
    remainingCents: remaining,
    marginCents,
    neededCents,
    reason: ok ? null : `${holder} ${dollars(remaining)} left; ${concurrency} session(s) at ${dollars(budgetCents)} with a ${dollars(marginCents)} overshoot margin need ${dollars(neededCents + marginCents)}`,
  };
}

/** What one phase's credit sessions have spent. */
export const phaseSpentCents = (ledger, phase) => spentCents(ledger, phase);

/** True once the ledger holds the phase's completed entry: `--build` refuses to run it again. */
export function phaseCompleted(ledger, phase) {
  return ledger.entries.some((e) => e.phase === phase && e.kind === 'phase' && e.outcome === 'completed');
}

/** The tuning phases (after RESERVING_PHASE, before `phase`) the ledger does not hold as completed. */
export function openTuning(ledger, phase) {
  const open = [];
  for (let n = Number(RESERVING_PHASE.slice(1)) + 1; n < Number(phase.slice(1)); n++) if (!phaseCompleted(ledger, `H${n}`)) open.push(`H${n}`);
  return open;
}

/** The exam phase from the moment tuning closes until the exam closes, else null. In that window
 *  the bench runs the configuration tuning chose and nothing re-syncs it (AC-7, AC-16). */
export function examPending(ledger) {
  const exam = ledger.reserve?.phase;
  return exam && !phaseCompleted(ledger, exam) && !openTuning(ledger, exam).length ? exam : null;
}

export function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Spend per phase, stage and model, for a report (4.4's last line). */
export function summary(ledger) {
  const rows = new Map();
  for (const e of ledger.entries.filter((x) => x.kind === 'session')) {
    const key = `${e.phase} ${e.stage ?? '-'} ${e.model ?? '-'} ${e.funding}`;
    const row = rows.get(key) ?? { phase: e.phase, stage: e.stage ?? null, model: e.model ?? null, funding: e.funding, sessions: 0, listCostCents: 0 };
    row.sessions++;
    row.listCostCents += e.listCostCents;
    rows.set(key, row);
  }
  return { spentCents: spentCents(ledger), heldCents: heldCents(ledger), remainingCents: remainingCents(ledger), rows: [...rows.values()] };
}
