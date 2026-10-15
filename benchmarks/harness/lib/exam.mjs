// THE HELD-OUT EXAM'S BRIEFS (docs/work-specs/noacg-harness/spec.md 4.1, D7, AC-2, AC-7).
//
// The exam is the one run that opens the sealed set, and only in its own window: once tuning has
// closed and before the exam has (`examPending`). The briefs are decrypted in memory with the
// passphrase in the main checkout's private folder, verified against the committed hash before
// anything else happens, and handed to the run; the plaintext is never written into the
// repository. A run's cells keep their brief beside them, in the run directory outside it.
//
// The sealed briefs key their stress values by position (`f0`, `f1`...), in their type's field
// order, or for a typeless brief in its `fields` string's order. An authored package orders its
// fields its own way, so position alone put values on the wrong fields in tuning (instruments.md
// entry 6). `labelStress` gives each positional key the label of the field it was written for;
// the cell then maps it by those words onto the package's own field (pipeline.mjs `stressFile`),
// and keeps the position only where no field carries them. One rule, fixed before any session,
// the same for both arms.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { wilson } from '../judge/calibration.mjs';
import { examPending } from './ledger.mjs';
import { openSealed, privatePassphraseFile, readHash, readSealed, sha256 } from './sealed.mjs';

export const EXAM_DIR = path.join('benchmarks', 'harness', 'exam');
/** 4.1 and 4.5: twenty held-out briefs. */
export const EXAM_BRIEF_COUNT = 20;

/** The labels of a typeless brief's `fields` string (`Label:kind, Label:kind`), in its order. */
export function typelessLabels(fields) {
  return String(fields ?? '')
    .split(',')
    .map((part) => part.trim().split(':')[0].trim())
    .filter(Boolean);
}

/**
 * The brief with every positional stress key also named by its field's label: `stress` keyed by
 * label where the brief's type (or `fields` string) names that position, and `stressPositions`
 * saying which position each label came from, so a package that carries no field of those words
 * still takes the value by position. `types` is `noacg types --json`'s list.
 */
export function labelStress(brief, types) {
  const labels = brief.type ? (types.find((t) => t.id === brief.type)?.fields ?? []).map((f) => f.label) : typelessLabels(brief.fields);
  const stress = {};
  const stressPositions = {};
  for (const [key, value] of Object.entries(brief.stress ?? {})) {
    const m = /^f(\d+)$/.exec(key);
    const label = m ? labels[Number(m[1])] : undefined;
    // Two positions with one label would collide as keys: the second keeps its position.
    if (label && !(label in stress)) {
      stress[label] = value;
      stressPositions[label] = key;
    } else stress[key] = value;
  }
  return { ...brief, stress, stressPositions };
}

/**
 * The twenty exam briefs, decrypted and verified, for the exam phase only. Throws, before anything
 * is read, outside the exam's window; and when the passphrase is not on this machine, the
 * plaintext does not hash to the committed hash, or the set is not twenty library briefs.
 */
export function examBriefs({ root, ledger, phase, passphraseFile = privatePassphraseFile(root) }) {
  const exam = examPending(ledger);
  if (!exam || phase !== exam) throw new Error(`the sealed briefs open only for the exam, once tuning is closed and before the exam is (${phase} is not that phase)`);
  if (!passphraseFile) throw new Error('the sealed briefs need the passphrase in the main checkout\'s docs/private/harness-exam/ (D7): not on this machine');
  const plain = openSealed(readSealed(path.join(root, EXAM_DIR, 'briefs.sealed')), readFileSync(passphraseFile, 'utf8').trim());
  try {
    if (sha256(plain) !== readHash(path.join(root, EXAM_DIR, 'briefs.sha256'))) throw new Error('the sealed briefs decrypt to something other than the committed hash: the exam does not run on them');
    const briefs = JSON.parse(plain.toString('utf8')).briefs;
    if (!Array.isArray(briefs) || briefs.length !== EXAM_BRIEF_COUNT) throw new Error(`the sealed set holds ${Array.isArray(briefs) ? briefs.length : 'no list of'} briefs, not ${EXAM_BRIEF_COUNT}`);
    const ids = new Set(briefs.map((b) => b.id));
    if (ids.size !== briefs.length || briefs.some((b) => !/^[a-z0-9-]+$/.test(b.id ?? ''))) throw new Error('the sealed briefs do not carry twenty distinct ids');
    const notLibrary = briefs.filter((b) => b.kind !== 'noacg').map((b) => b.id);
    if (notLibrary.length) throw new Error(`exam briefs that are not library graphic briefs: ${notLibrary.join(', ')}`);
    return briefs;
  } finally {
    plain.fill(0);
  }
}

// ── the verdict (4.4, 4.5), counted as fixed before the first exam session ───────────────────

/** 4.5, as written: within one usable graphic of Claude Code; Claude Code preferred in at most 10
 *  of 20 pairs; a median wall of at most ten minutes; more than 5 order-flip ties is inconclusive. */
export const PASS_RULE = { usableGap: 1, referencePreferredMax: 10, medianWallSeconds: 600, flipTiesMax: 5 };

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** The nearest-rank percentile. */
const percentile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] : null;
};

/** The latest good answer per judgement: a re-judged cell or pair keeps its last answer. */
function answers(judgements, fingerprint) {
  const singles = new Map();
  const pairs = new Map();
  for (const j of judgements) {
    if (j.error || (fingerprint && j.judge !== fingerprint)) continue;
    if (j.task === 'single') singles.set(j.id, j);
    else if (j.task === 'pairwise') pairs.set(j.brief, j);
  }
  return { singles, pairs };
}

/** One arm's graphic for one brief, counted as the tuning rounds counted it (phase-8.md). */
function graphicOf(cell, single, budgetCents, readings = {}) {
  if (!cell) return { ran: false, delivered: false, usable: false, judged: false, defects: [], missing: [], unmoved: [], validatorErrors: [] };
  const delivered = cell.outcome === 'delivered';
  const defects = (single?.answer?.basicMistakes ?? []).filter((m) => m.kind !== 'missing-action');
  // An action the gate flagged and the operator surface offers under another name (3.5) counts as offered.
  const read = readings[`${cell.brief}.${cell.arm}`] ?? {};
  const gateMissing = cell.operator?.missing ?? [];
  const missing = gateMissing.filter((a) => !read[a]);
  const validatorErrors = cell.validation ? cell.validation.errors ?? [] : ['no validation'];
  const unmoved = (cell.capture?.findings ?? []).filter((f) => /did not move the machine/.test(f));
  const functional = Boolean(cell.validation?.ok && cell.shape?.ok) && missing.length === 0;
  const airable = single?.answer?.airable ?? null;
  return {
    ran: true,
    id: `${cell.brief}.${cell.arm}`,
    outcome: cell.outcome,
    reason: cell.reason ?? null,
    delivered,
    judged: Boolean(single),
    airable,
    confidence: single?.answer?.confidence ?? null,
    defects,
    missing,
    readAsOffered: gateMissing.filter((a) => read[a]),
    unmoved,
    validatorErrors,
    functional,
    usable: delivered && functional && airable === true && defects.length === 0,
    costCents: cell.costCents ?? 0,
    notionalUsd: cell.notionalUsd ?? 0,
    wallSeconds: cell.wallSeconds ?? null,
    overBudget: budgetCents ? (cell.costCents ?? 0) > budgetCents : false,
  };
}

/** Which arm one order of a pair preferred. */
const orderOf = (o, hId) => {
  const better = o.answer?.better === 'A' ? o.a : o.b;
  return { first: o.a === hId ? 'harness' : 'reference', better: better === hId ? 'harness' : 'reference', confidence: o.answer?.confidence ?? null };
};

/**
 * Every number of 4.4 and the verdict of 4.5 from a run's cells and the frozen judge's answers.
 * `cells` are the cells' `cell.json`; `judgements` the lines of `judgements.jsonl`. A pair is
 * judged only when both arms delivered; when one did, it is that one's; when neither did, a tie
 * that is no order flip. The verdict is `incomplete` while the run holds other than `briefCount`
 * distinct briefs (the exam's twenty), while a cell has not run or a delivered
 * graphic or a pair of two is unjudged, `MISSED` when any line of 4.5 fails, `INCONCLUSIVE` when
 * every line holds but more than 5 pairs tied on an order flip, else `PASSED`.
 */
export function tallyExam({ briefIds, cells, judgements, budgetCents, fingerprint = null, readings = {}, briefCount = EXAM_BRIEF_COUNT, harness = 'managed-agents', reference = 'claude-code' }) {
  const { singles, pairs } = answers(judgements, fingerprint);
  const cellOf = (brief, arm) => cells.find((c) => c.brief === brief && c.arm === arm && c.outcome !== 'refused' && c.outcome !== 'paused') ?? null;
  const rows = briefIds.map((brief) => {
    const h = graphicOf(cellOf(brief, harness), singles.get(`${brief}.${harness}`), budgetCents, readings);
    const r = graphicOf(cellOf(brief, reference), singles.get(`${brief}.${reference}`), null, readings);
    let pair;
    if (h.delivered && r.delivered) {
      const p = pairs.get(brief);
      const result = !p ? 'unjudged' : p.combined === 'tie' ? 'tie' : p.combined === h.id ? 'harness' : p.combined === r.id ? 'reference' : 'unjudged';
      pair = { result, judged: Boolean(p), flip: p?.combined === 'tie', orders: (p?.orders ?? []).map((o) => orderOf(o, h.id)) };
    } else pair = { result: h.delivered ? 'harness' : r.delivered ? 'reference' : 'tie', judged: false, flip: false, orders: [], byDelivery: true };
    return { brief, harness: h, reference: r, pair };
  });
  const n = briefIds.length;
  const count = (f) => rows.filter(f).length;
  const arm = (key) => {
    const gs = rows.map((row) => row[key]);
    const ran = gs.filter((g) => g.ran);
    const delivered = gs.filter((g) => g.delivered);
    const usable = gs.filter((g) => g.usable).length;
    const walls = ran.map((g) => g.wallSeconds).filter((w) => Number.isFinite(w));
    const withDefect = delivered.filter((g) => g.defects.length).length;
    const functionalFailures = delivered.filter((g) => !g.functional || g.unmoved.length).length;
    return {
      requests: n,
      ran: ran.length,
      outcomes: Object.fromEntries([...new Set(gs.map((g) => g.outcome ?? 'not run'))].map((o) => [o, gs.filter((g) => (g.outcome ?? 'not run') === o).length])),
      delivered: delivered.length,
      deliveredInterval: wilson(delivered.length, n),
      usable,
      usableInterval: wilson(usable, n),
      withDefect,
      withDefectInterval: wilson(withDefect, delivered.length),
      defects: delivered.reduce((k, g) => k + g.defects.length, 0),
      withMissing: delivered.filter((g) => g.missing.length).length,
      missingActions: delivered.reduce((k, g) => k + g.missing.length, 0),
      validatorFailures: delivered.filter((g) => g.validatorErrors.length).length,
      unmovedEvents: delivered.filter((g) => g.unmoved.length).length,
      functionalFailures,
      functionalInterval: wilson(functionalFailures, delivered.length),
      costCents: ran.reduce((k, g) => k + g.costCents, 0),
      notionalUsd: Number(ran.reduce((k, g) => k + (g.notionalUsd ?? 0), 0).toFixed(2)),
      medianWallSeconds: median(walls),
      p90WallSeconds: percentile(walls, 90),
      overTenMinutes: walls.filter((w) => w > PASS_RULE.medianWallSeconds).length,
    };
  };
  const H = arm('harness');
  const R = arm('reference');
  H.costPerUsableCents = H.usable ? Math.round(H.costCents / H.usable) : null;
  R.notionalPerUsableUsd = R.usable ? Number((R.notionalUsd / R.usable).toFixed(2)) : null;
  const preference = {
    harness: count((x) => x.pair.result === 'harness'),
    reference: count((x) => x.pair.result === 'reference'),
    ties: count((x) => x.pair.result === 'tie'),
    flipTies: count((x) => x.pair.flip),
    judged: count((x) => x.pair.judged),
    byDelivery: count((x) => x.pair.byDelivery),
    flipped: rows.filter((x) => x.pair.flip).map((x) => x.brief),
  };
  preference.harnessInterval = wilson(preference.harness, n);
  preference.referenceInterval = wilson(preference.reference, n);
  preference.tieInterval = wilson(preference.ties, n);
  const overBudgetUsable = rows.filter((x) => x.harness.usable && x.harness.overBudget).map((x) => x.brief);
  const lines = [
    { rule: `usable delivery within ${PASS_RULE.usableGap} graphic of Claude Code's`, holds: H.usable >= R.usable - PASS_RULE.usableGap, figure: `harness ${H.usable} of ${n}, Claude Code ${R.usable} of ${n}` },
    { rule: 'zero basic visible mistakes and zero missing operator actions in the delivered graphics', holds: H.defects === 0 && H.missingActions === 0, figure: `${H.withDefect} delivered graphic(s) with ${H.defects} basic visible mistake(s); ${H.withMissing} with ${H.missingActions} missing action(s)` },
    { rule: `Claude Code preferred in no more than ${PASS_RULE.referencePreferredMax} of the ${n} pairs, ties not preferred`, holds: preference.reference <= PASS_RULE.referencePreferredMax, figure: `Claude Code ${preference.reference}, harness ${preference.harness}, tie ${preference.ties}` },
    { rule: `median wall time at most ${PASS_RULE.medianWallSeconds / 60} minutes and no accepted graphic over the session budget`, holds: H.medianWallSeconds !== null && H.medianWallSeconds <= PASS_RULE.medianWallSeconds && overBudgetUsable.length === 0, figure: `median ${H.medianWallSeconds} s; ${overBudgetUsable.length} accepted graphic(s) over ${budgetCents} cents${overBudgetUsable.length ? ` (${overBudgetUsable.join(', ')})` : ''}` },
  ];
  const incomplete = [
    // A verdict is on the whole exam: a run with fewer distinct briefs decides nothing.
    ...(new Set(briefIds).size !== briefCount ? [`${new Set(briefIds).size} distinct brief(s), not the exam's ${briefCount}`] : []),
    ...rows.filter((x) => !x.harness.ran || !x.reference.ran).map((x) => `${x.brief}: ${!x.harness.ran ? harness : reference} not run`),
    ...rows.flatMap((x) => [x.harness, x.reference]).filter((g) => g.delivered && !g.judged).map((g) => `${g.id} unjudged`),
    ...rows.filter((x) => x.pair.result === 'unjudged').map((x) => `${x.brief} pair unjudged`),
  ];
  const verdict = incomplete.length ? 'incomplete' : lines.every((l) => l.holds) ? (preference.flipTies > PASS_RULE.flipTiesMax ? 'INCONCLUSIVE' : 'PASSED') : 'MISSED';
  return { verdict, incomplete, lines, harness: H, reference: R, preference, overBudgetUsable, rows };
}

const pct = ([lo, hi]) => `${Math.round(lo * 100)}% to ${Math.round(hi * 100)}%`;
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

/** A tally as the report's tables: the verdict's lines, the arms side by side, one row per brief. */
export function tallyMarkdown(t) {
  const { harness: H, reference: R, preference: P } = t;
  const mark = (g) => (!g.ran ? 'not run' : !g.delivered ? g.outcome : [g.usable ? 'usable' : g.judged ? 'not usable' : 'not yet judged', g.airable === false ? 'not airable' : null, g.defects.length ? `${g.defects.length} basic mistake(s)` : null, g.missing.length ? `missing ${g.missing.join('/')}` : null, g.readAsOffered?.length ? `${g.readAsOffered.join('/')} offered under other names` : null, g.validatorErrors.length ? 'validator errors' : null, g.unmoved.length ? `${g.unmoved.length} unmoved event(s)` : null].filter(Boolean).join(', '));
  const out = [
    `**Verdict: ${t.verdict}**${t.incomplete.length ? ` (${t.incomplete.join('; ')})` : ''}`,
    '',
    '| 4.5 line | holds | figure |',
    '|---|---|---|',
    ...t.lines.map((l) => `| ${l.rule} | ${l.holds ? 'yes' : '**no**'} | ${l.figure} |`),
    `| more than ${PASS_RULE.flipTiesMax} order-flip ties makes it inconclusive | ${P.flipTies > PASS_RULE.flipTiesMax ? '**inconclusive**' : 'no'} | ${P.flipTies} flip tie(s)${P.flipped.length ? `: ${P.flipped.join(', ')}` : ''} |`,
    '',
    '| of 20 requests (Wilson 95%) | harness | Claude Code |',
    '|---|---|---|',
    `| delivered | ${H.delivered} (${pct(H.deliveredInterval)}) | ${R.delivered} (${pct(R.deliveredInterval)}) |`,
    `| usable | ${H.usable} (${pct(H.usableInterval)}) | ${R.usable} (${pct(R.usableInterval)}) |`,
    `| delivered with a basic visual defect | ${H.withDefect} of ${H.delivered} (${pct(H.withDefectInterval)}), ${H.defects} defect(s) | ${R.withDefect} of ${R.delivered} (${pct(R.withDefectInterval)}), ${R.defects} defect(s) |`,
    `| delivered with a functional failure | ${H.functionalFailures} of ${H.delivered} (${pct(H.functionalInterval)}): ${H.validatorFailures} validator, ${H.withMissing} missing action, ${H.unmovedEvents} unmoved event | ${R.functionalFailures} of ${R.delivered} (${pct(R.functionalInterval)}): ${R.validatorFailures} validator, ${R.withMissing} missing action, ${R.unmovedEvents} unmoved event |`,
    `| outcomes | ${Object.entries(H.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')} | ${Object.entries(R.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')} |`,
    `| preferred in its pair | ${P.harness} (${pct(P.harnessInterval)}) | ${P.reference} (${pct(P.referenceInterval)}) |`,
    `| tie (order flip ${P.flipTies}) | ${P.ties} (${pct(P.tieInterval)}) | |`,
    `| cost | ${usd(H.costCents)} credit; ${H.costPerUsableCents === null ? 'no usable graphic' : `${usd(H.costPerUsableCents)} per usable graphic`} | $${R.notionalUsd.toFixed(2)} notional; ${R.notionalPerUsableUsd === null ? 'no usable graphic' : `$${R.notionalPerUsableUsd.toFixed(2)} per usable graphic`} |`,
    `| wall time, median / 90th percentile | ${H.medianWallSeconds} s / ${H.p90WallSeconds} s; ${H.overTenMinutes} over 10 min | ${R.medianWallSeconds} s / ${R.p90WallSeconds} s; ${R.overTenMinutes} over 10 min |`,
    '',
    '| brief | harness | Claude Code | pair |',
    '|---|---|---|---|',
    ...t.rows.map((x) => `| ${x.brief} | ${mark(x.harness)} | ${mark(x.reference)} | ${x.pair.byDelivery ? `${x.pair.result} (by delivery)` : x.pair.flip ? `tie (flip: ${x.pair.orders.map((o) => o.better).join(' then ')})` : `${x.pair.result}${x.pair.orders.length ? `, ${x.pair.orders.map((o) => o.confidence).join('/')}` : ''}`} |`),
  ];
  return out.join('\n');
}
