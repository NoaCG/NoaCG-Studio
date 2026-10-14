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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const LEDGER_FORMAT = 'noacg-harness-ledger-v1';
/** Decision 11: at most $100 of credit on measuring and tuning, across all runs of the plan. */
export const RUN_BUDGET_CENTS = 10_000;
/** 5.2's estimate of one model request at a session's largest context on Opus 5.5, until H3 measures it. */
export const DEFAULT_OVERSHOOT_CENTS = 50;

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
  return ledger;
}

export function writeLedger(file, ledger) {
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function checkEntry(e) {
  const problems = [];
  if (!KINDS.includes(e.kind)) problems.push(`kind "${e.kind}"`);
  if (!/^H\d+$/.test(e.phase ?? '')) problems.push(`phase "${e.phase}"`);
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

export function spentCents(ledger) {
  return ledger.entries.filter((e) => e.funding === 'credit').reduce((n, e) => n + e.listCostCents, 0);
}

export function remainingCents(ledger) {
  return ledger.runBudgetCents - spentCents(ledger);
}

/**
 * May a session (or `concurrency` sessions at once) start? Refused when what is left, less the
 * overshoot margin, is below the budgets it would book.
 */
export function admit(ledger, { budgetCents, concurrency = 1, overshootCents = DEFAULT_OVERSHOOT_CENTS, criticCents = 0, phase = null, ceilingCents = null }) {
  if (!Number.isInteger(budgetCents) || budgetCents <= 0) throw new Error(`a session budget is a positive whole number of cents, got ${budgetCents}`);
  // A phase's own ceiling (5.1: H3's $10, a tuning round's) is a wall inside the run's.
  const runLeft = remainingCents(ledger);
  const phaseLeft = ceilingCents === null ? Infinity : ceilingCents - phaseSpentCents(ledger, phase);
  const remaining = Math.min(runLeft, phaseLeft);
  const marginCents = overshootCents * concurrency + criticCents;
  const neededCents = budgetCents * concurrency;
  const ok = remaining - marginCents >= neededCents;
  const holder = phaseLeft < runLeft ? `${phase}'s ${dollars(ceilingCents)} ceiling has` : 'the ledger has';
  return {
    ok,
    remainingCents: remaining,
    marginCents,
    neededCents,
    reason: ok ? null : `${holder} ${dollars(remaining)} left; ${concurrency} session(s) at ${dollars(budgetCents)} with a ${dollars(marginCents)} overshoot margin need ${dollars(neededCents + marginCents)}`,
  };
}

/** What one phase's credit sessions have spent. */
export function phaseSpentCents(ledger, phase) {
  return ledger.entries.filter((e) => e.funding === 'credit' && e.phase === phase).reduce((n, e) => n + e.listCostCents, 0);
}

/** True once the ledger holds the phase's completed entry: `--build` refuses to run it again. */
export function phaseCompleted(ledger, phase) {
  return ledger.entries.some((e) => e.phase === phase && e.kind === 'phase' && e.outcome === 'completed');
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
  return { spentCents: spentCents(ledger), remainingCents: remainingCents(ledger), rows: [...rows.values()] };
}
