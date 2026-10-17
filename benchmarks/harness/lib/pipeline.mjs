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
//   7. the look line (docs/work-specs/harness-ladder/spec.md D1, D6): the frames the record's
//      review gave a verdict for, against the frames the agent's trace opened; where the run asks
//      for the forced look, a hand-in without a review is not delivered
//   8. the ledger entry
//
// Nothing here trusts what an arm says about its own graphic; every verdict is measured again.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { admit, appendEntry } from './ledger.mjs';
import { framesOpened, readsOf } from './trace.mjs';

/** An event name as its lower-case words: `switchSpeaker` and `switch-speaker` are `switch speaker`. */
const words = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Does `inner` occur in `outer` as consecutive whole words? */
const containsWords = (outer, inner) => inner.length > 0 && outer.some((_, i) => inner.every((w, j) => outer[i + j] === w));

/**
 * The actions a brief needs that the operator surface does not offer (3.6). A brief names an
 * action in its own words, and a package names its events its own way: an action is offered by a
 * button whose event is the action's name (any case), one of the brief's `expect.aliases` for it,
 * or a name holding the action's words whole (`switchSpeaker` offers `switch`). A button whose
 * event is exactly another action the brief needs counts only for that one, so `clearFlag` never
 * offers `flag`.
 */
export function missingActions(brief, buttons) {
  const needed = brief.expect?.actions ?? [];
  const aliases = brief.expect?.aliases ?? {};
  const events = (buttons ?? []).map((b) => String(b.event ?? b));
  const exact = new Set(needed.map((a) => a.toLowerCase()));
  return needed.filter((action) => {
    const names = [action, ...(aliases[action] ?? [])];
    if (events.some((e) => names.some((n) => n.toLowerCase() === e.toLowerCase()))) return false;
    const free = events.filter((e) => !exact.has(e.toLowerCase()));
    return !free.some((e) => names.some((n) => containsWords(words(e), words(n))));
  });
}

/**
 * The brief as `noacg coverage --stress` reads it, written beside the cell. A brief keys a stress
 * value `f0`, `f1`... by position, which holds only for a package that keeps its type's field
 * order; an authored package orders its fields its own way. So a brief may key a value by what the
 * field is instead (`question`, `speaker a`), and that key goes to the first field whose label
 * holds its words whole and in order, as `noacg inspect` lists it: a label that is exactly those
 * words first, and no field takes two values. A key no label holds keeps the position the brief
 * gave it (`stressPositions`, the exam's, lib/exam.mjs), or else is passed on, and coverage names it
 * unmapped. `stressMap` says where each value went and by what, for the check before the judge.
 */
export function stressFile({ brief, descriptors, cellDir }) {
  const stress = {};
  const stressMap = {};
  const fields = descriptors ?? [];
  const entries = Object.entries(brief.stress ?? {});
  const isKey = (key) => /^f\d+$/.test(key) || key === 'logo' || key === 'background';
  const taken = new Set(entries.map(([key]) => key).filter(isKey));
  // Labels first, for every key: exactly the words, then a label that holds them; no field twice.
  const placed = new Map();
  for (const exact of [true, false]) {
    for (const [key] of entries) {
      if (isKey(key) || placed.has(key)) continue;
      const want = words(key);
      const field = fields.find((d) => !taken.has(d.key) && (exact ? words(d.label ?? '').join(' ') === want.join(' ') : containsWords(words(d.label ?? ''), want)));
      if (field) {
        placed.set(key, field);
        taken.add(field.key);
      }
    }
  }
  // Then the positions the brief gave, where no labelled value already sits.
  for (const [key, value] of entries) {
    const field = placed.get(key);
    const position = brief.stressPositions?.[key];
    const byPosition = !field && !isKey(key) && position && !taken.has(position);
    if (byPosition) taken.add(position);
    const target = field ? field.key : byPosition ? position : key;
    stress[target] = value;
    stressMap[key] = { to: target, by: field ? 'label' : isKey(key) ? 'key' : byPosition ? 'position' : 'unmapped', label: (field ?? fields.find((d) => d.key === target))?.label ?? null };
  }
  const file = path.join(cellDir, 'stress.json');
  writeFileSync(file, `${JSON.stringify({ ...brief, stress, stressMap }, null, 2)}\n`);
  return file;
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
  const base = { phase: entry.phase, stage: entry.stage, arm: arm.id, model: arm.model, ...(arm.effort ? { effort: arm.effort } : {}), funding: arm.funding, brief: brief.id };

  if (arm.funding === 'credit') {
    // An entry that names no margin term gets the wall's own default: the exam reserve's.
    const admission = admit(ledger, { budgetCents: entry.budgetCents, overshootCents: entry.overshootCents, criticCents: entry.criticCents, phase: entry.phase, ceilingCents: entry.ceilingCents ?? null });
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

  const cell = { costUnread: Boolean(result.costUnread), brief: brief.id, arm: arm.id, model: arm.model, ...(arm.effort ? { effort: arm.effort } : {}), outcome: result.outcome, reason: result.reason ?? null, ...(result.resetsAt ? { resetsAt: result.resetsAt } : {}), sessionId: result.sessionId, costCents: result.costCents, notionalUsd: result.notionalUsd, wallSeconds: result.wallSeconds, cleanup: result.cleanup ?? null, progress: result.progress ?? null, trace: result.trace, ...(result.metrics ? { metrics: { ...result.metrics, steps: undefined } } : {}), ...(result.outputsListed ? { outputsListed: result.outputsListed.length, undownloadable: result.undownloadable ?? [] } : {}) };
  if (result.recordFile && result.zipFile) {
    const record = JSON.parse(readFileSync(result.recordFile, 'utf8'));
    const shaped = shape.graphicSaveShape(record.doc);
    cell.shape = shaped.ok ? { ok: true } : { ok: false, reason: shaped.reason };
    const frames = path.join(cellDir, 'frames');
    const inspect = await cli(['inspect', result.zipFile, '--json'], { cwd: cellDir });
    const stress = stressFile({ brief, descriptors: inspect.json?.inspection?.descriptors, cellDir });
    const coverage = await cli(['coverage', result.zipFile, '--out', frames, '--stress', stress, '--json'], { cwd: cellDir });
    cell.capture = { exit: coverage.code, dir: frames, frames: coverage.json?.frames ?? 0, crops: coverage.json?.crops ?? 0, findings: coverage.json?.findings ?? [], failures: coverage.json?.failures ?? [coverage.stderr.slice(-300)], digest: coverage.json?.digest ?? null };
    const validate = await cli(['validate', result.zipFile, '--json'], { cwd: cellDir });
    const merged = validate.json?.validation?.merged;
    cell.validation = { ok: validate.json?.ok ?? false, errors: (merged?.errors ?? []).map((e) => `${e.rule}: ${e.message}`), warnings: (merged?.warnings ?? []).length };
    const buttons = inspect.json?.inspection?.buttons ?? [];
    cell.operator = { inputs: (inspect.json?.inspection?.descriptors ?? []).length, buttons: buttons.map((b) => b.event), missing: missingActions(brief, buttons) };
    cell.digest = digestCheck({ delivered: record.digest ?? null, benchValidated: validate.json?.digest ?? null, reviewed: result.reviewedDigest ?? null });
    cell.functional = cell.validation.ok && cell.operator.missing.length === 0 && cell.shape.ok;
    cell.look = framesOpened(record.review ?? null, result.reads ?? readsOf(result.metrics?.steps));
  }
  // The forced look gates the hand-in (D1): where the run asks for it, a record without a review is
  // a graphic nobody was made to look at, and it is not delivered.
  if (entry.requireReview && cell.outcome === 'delivered' && !cell.look?.reviewed) {
    cell.outcome = 'not-ready';
    cell.reason = 'handed in without a review (record --review)';
  }

  appendEntry(ledger, {
    ...base,
    kind: 'session',
    sessionId: result.sessionId ?? null,
    listCostCents: arm.funding === 'credit' ? result.costCents ?? 0 : 0,
    ...(result.notionalUsd ? { notionalUsd: result.notionalUsd } : {}),
    wallSeconds: result.wallSeconds,
    outcome: cell.outcome,
    ...(cell.reason || result.costUnread ? { note: [cell.reason, result.costUnread ? 'COST UNREAD: reconcile this session in the Console before the next session' : null].filter(Boolean).join('; ') } : {}),
  });
  writeFileSync(path.join(cellDir, 'cell.json'), `${JSON.stringify(cell, null, 2)}\n`);
  return cell;
}
