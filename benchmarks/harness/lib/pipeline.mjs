// ONE CELL: one brief through one arm, then the shared half every arm goes through
// (docs/work-specs/noacg-harness/spec.md D5, 3.5, 3.6, 5.3):
//
//   1. the ledger's wall, for an arm the credit pays (refused: nothing starts)
//   2. the arm, which hands in a record and its package zip
//   3. the shape check the save door runs on the record (`graphicSaveShape`, the product's own)
//   4. the bench's own capture of the delivered package (`noacg coverage`, the same for every arm)
//   5. the bench's own validate and inspect: the validator's errors are the functional gate, and
//      every action the brief's `expect.actions` names must be on the operator surface
//   6. the digests: the record's, the bench's validate of the delivered zip, and the last one the
//      arm's agent reviewed must be one version
//   7. the ledger entry
//
// Nothing here trusts what an arm says about its own graphic; every verdict is measured again.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { admit, appendEntry } from './ledger.mjs';

/** The actions a brief needs that the operator surface does not offer (3.6). */
export function missingActions(brief, buttons) {
  const have = new Set((buttons ?? []).map((b) => String(b.event ?? b).toLowerCase()));
  return (brief.expect?.actions ?? []).filter((a) => !have.has(a.toLowerCase()));
}

/** Do the three digests name one version? Null ones are reported, never assumed equal. */
export function digestCheck({ delivered, benchValidated, reviewed }) {
  const problems = [];
  if (!delivered) problems.push('the record carries no digest');
  if (delivered && benchValidated && delivered !== benchValidated) problems.push('the delivered zip is not the version the record names');
  if (!reviewed) problems.push('the agent reviewed no version (no validate or coverage digest in its trace)');
  else if (delivered && reviewed !== delivered) problems.push('the delivered version is not the one last reviewed');
  return { ok: problems.length === 0, delivered, benchValidated, reviewed, problems };
}

export async function runCell({ arm, brief, cellDir, cli, ledger, entry, shape, runId, log = () => undefined }) {
  mkdirSync(cellDir, { recursive: true });
  const briefFile = path.join(cellDir, 'brief.json');
  writeFileSync(briefFile, `${JSON.stringify(brief, null, 2)}\n`);
  const base = { phase: entry.phase, stage: entry.stage, arm: arm.id, model: arm.model, funding: arm.funding, brief: brief.id };

  if (arm.funding === 'credit') {
    const admission = admit(ledger, { budgetCents: entry.budgetCents, overshootCents: entry.overshootCents, criticCents: entry.criticCents ?? 0, phase: entry.phase, ceilingCents: entry.ceilingCents ?? null });
    if (!admission.ok) {
      appendEntry(ledger, { ...base, kind: 'session', outcome: 'refused', listCostCents: 0, note: admission.reason });
      log(`  refused: ${admission.reason}`);
      return { brief: brief.id, arm: arm.id, refused: admission.reason };
    }
  }

  let result;
  try {
    result = await arm.run({ brief, cellDir, cli, runId, log });
  } catch (e) {
    result = { outcome: 'failed', reason: e instanceof Error ? e.message : String(e), costCents: 0, notionalUsd: 0, wallSeconds: 0, sessionId: null, trace: [] };
  }

  const cell = { costUnread: Boolean(result.costUnread), brief: brief.id, arm: arm.id, model: arm.model, outcome: result.outcome, reason: result.reason ?? null, sessionId: result.sessionId, costCents: result.costCents, notionalUsd: result.notionalUsd, wallSeconds: result.wallSeconds, cleanup: result.cleanup ?? null, progress: result.progress ?? null, trace: result.trace };
  if (result.recordFile && result.zipFile) {
    const record = JSON.parse(readFileSync(result.recordFile, 'utf8'));
    const shaped = shape.graphicSaveShape(record.doc);
    cell.shape = shaped.ok ? { ok: true } : { ok: false, reason: shaped.reason };
    const frames = path.join(cellDir, 'frames');
    const coverage = await cli(['coverage', result.zipFile, '--out', frames, '--stress', briefFile, '--json'], { cwd: cellDir });
    cell.capture = { exit: coverage.code, dir: frames, frames: coverage.json?.frames ?? 0, crops: coverage.json?.crops ?? 0, findings: coverage.json?.findings ?? [], failures: coverage.json?.failures ?? [coverage.stderr.slice(-300)], digest: coverage.json?.digest ?? null };
    const validate = await cli(['validate', result.zipFile, '--json'], { cwd: cellDir });
    const inspect = await cli(['inspect', result.zipFile, '--json'], { cwd: cellDir });
    const merged = validate.json?.validation?.merged;
    cell.validation = { ok: validate.json?.ok ?? false, errors: (merged?.errors ?? []).map((e) => `${e.rule}: ${e.message}`), warnings: (merged?.warnings ?? []).length };
    const buttons = inspect.json?.inspection?.buttons ?? [];
    cell.operator = { inputs: (inspect.json?.inspection?.descriptors ?? []).length, buttons: buttons.map((b) => b.event), missing: missingActions(brief, buttons) };
    cell.digest = digestCheck({ delivered: record.digest ?? null, benchValidated: validate.json?.digest ?? null, reviewed: result.reviewedDigest ?? null });
    cell.functional = cell.validation.ok && cell.operator.missing.length === 0 && cell.shape.ok;
  }

  appendEntry(ledger, {
    ...base,
    kind: 'session',
    sessionId: result.sessionId ?? null,
    listCostCents: arm.funding === 'credit' ? result.costCents ?? 0 : 0,
    ...(result.notionalUsd ? { notionalUsd: result.notionalUsd } : {}),
    wallSeconds: result.wallSeconds,
    outcome: result.outcome,
    ...(result.reason || result.costUnread ? { note: [result.reason, result.costUnread ? 'COST UNREAD: reconcile this session in the Console before the next session' : null].filter(Boolean).join('; ') } : {}),
  });
  writeFileSync(path.join(cellDir, 'cell.json'), `${JSON.stringify(cell, null, 2)}\n`);
  return cell;
}
