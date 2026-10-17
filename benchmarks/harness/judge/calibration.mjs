#!/usr/bin/env node
// THE JUDGE'S CALIBRATION (docs/work-specs/noacg-harness/spec.md 4.3, AC-3). The judge is shown to
// separate the owner's good graphics from the bad ones on owner verdicts it was never written
// against, before any tuning depends on it.
//
//   node benchmarks/harness/judge/calibration.mjs set
//        Build calibration-set.json from the read-only archives: every item, its owner verdict,
//        its brief, its frames. Deterministic; re-running it changes nothing.
//   node benchmarks/harness/judge/calibration.mjs split --seed <n>
//        Hold back a stratified 30% of the set, BEFORE the prompt is written, into split.json
//        (the seed and the sha256 of each part's membership). Refuses to overwrite a split.
//   node benchmarks/harness/judge/calibration.mjs render [--work <dir>]
//        Render the August cells and their planted-defect variants from their saved sources
//        (zero tokens: the CLI and Chromium, against NOACG_URL or noacg.studio).
//   node benchmarks/harness/judge/calibration.mjs run --part dev|heldout [--task single|pairwise|both]
//        [--work <dir>] [--concurrency 3] [--model <id> --effort <level>] [--only id,..]
//        Judge the part on the subscription (benchmarks/harness/lib/subscription.mjs). The dev part
//        runs the judge files as they are, for writing the prompt; the held-back part runs only a
//        FROZEN judge (judge.lock.json matching), so it is read once, after the prompt is final.
//   node benchmarks/harness/judge/calibration.mjs score --part dev|heldout [--work <dir>]
//        The numbers of 4.3 against its thresholds.
//   node benchmarks/harness/judge/calibration.mjs freeze --model <id> --effort <level>
//        Write judge.lock.json for the files as they are.
//
//   --lock <file> on freeze, run --part heldout and score: a second judge, the same prompt and
//   rubric on another model, with its own lock (the harness ladder's, docs/work-specs/
//   harness-ladder/spec.md D8). Its prompt and rubric must hash as judge.lock.json's do, so the
//   held-back part still never shaped a prompt; its answers go to `results-<part>-<lock folder>.jsonl`.
//   --phase names the ledger phase a usage-limit pause is recorded under (H2 by default).
//
// Good: the 25 graphics of the 2026-08-22 agent round (owner: every one airable) and the 21 cells
// of the 2026-08-19 rules re-read the owner aired. Bad: the owner's FAIL and TWEAKS verdicts in
// the 2026-08-18 type sweep (18 minimax, 11 gemini), the 30 free-form coder cells the owner
// rejected (2026-08-17) and the 5 rejected generations of the instruments round (2026-08-14),
// plus a planted defect on each of the 22 library graphics of the August round. Verdicts are
// transcribed from each round's notes.md; frames are read from the archives, never copied into
// the repository. The archived frames are stills, not the full coverage matrix: that is the
// calibration's limit, stated in evidence/phase-2.md.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCli } from '../lib/cli.mjs';
import { draftJudge, judgePair, judgeSingle, loadJudge, lockFor } from '../lib/judge.mjs';
import { appendEntry, readLedger, writeLedger } from '../lib/ledger.mjs';
import { checkSubscriptionAuth, claudeExecutable, invocation, pauseMs, subscriptionEnv } from '../lib/subscription.mjs';
import { changedFraction, DEFECT_KIND, DEFECTS, injection } from './plant.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SET_FILE = path.join(HERE, 'calibration-set.json');
const SPLIT_FILE = path.join(HERE, 'split.json');
const LEDGER_FILE = path.join(ROOT, 'benchmarks', 'harness', 'ledger.json');

export const ARCHIVES = {
  lite: process.env.NOACG_LITE_ARCHIVE || 'C:\\claude\\noacg-lite-eval-archive',
  bench: process.env.NOACG_BENCH_ARCHIVE || 'C:\\claude\\noacg-bench-archive',
};
const TYPESWEEP = 'typesweep-blind-final-2026-08-18';
const REREAD = 'rules-reread-blind-final-2026-08-19-2026-08-18';
const FREEFORM = 'freeform-coder-pro-freeform-blind-final-2026-08-17';
const INSTRUMENTS = 'pro-instruments-round-READ-2026-08-14';
const AUGUST = 'agent-round-2026-08-22';

/** The fraction held back, and the thresholds of 4.3, fixed before any judgement was read. */
export const HOLD_BACK = 0.3;
export const THRESHOLDS = { agreement: 0.85, pairwise: 0.9 };

// ── the owner's verdicts, transcribed ─────────────────────────────────────────────────────────
// Each bad item: [verdict, ...basic-mistake kinds the owner's note names]. A basic mistake is one
// of the rubric's kinds (text over text, a rule through text included; unreadable contrast;
// clipped or escaping text; a graphic that renders nothing). An item without one was rejected on
// design grounds the rubric does not call basic.

const T = 'text-over-text';
const C = 'unreadable-contrast';
const X = 'clipped-or-escaping-text';
const E = 'empty-or-broken';

/** typesweep-blind-final-2026-08-18/notes.md: every TWEAKS and FAIL (18 minimax, 11 gemini). */
export const TYPESWEEP_BAD = {
  'X-01': ['TWEAKS'], 'X-04': ['TWEAKS'], 'X-07': ['FAIL'], 'X-10': ['TWEAKS'], 'X-13': ['FAIL', E], 'X-16': ['FAIL'],
  'X-19': ['FAIL', E], 'X-22': ['FAIL'], 'X-24': ['FAIL', C], 'X-26': ['FAIL'], 'X-28': ['FAIL'], 'X-30': ['FAIL'],
  'X-36': ['TWEAKS'], 'X-38': ['TWEAKS', T], 'X-42': ['FAIL', T], 'X-44': ['FAIL', E], 'X-46': ['FAIL', T], 'X-48': ['FAIL', X],
  'X-11': ['FAIL', T], 'X-14': ['FAIL', T], 'X-20': ['FAIL', X], 'X-25': ['FAIL', X], 'X-29': ['FAIL'], 'X-31': ['TWEAKS'],
  'X-35': ['FAIL', X], 'X-37': ['TWEAKS'], 'X-39': ['FAIL', T], 'X-41': ['TWEAKS'], 'X-45': ['TWEAKS'],
};

/** freeform-coder-pro-freeform-blind-final-2026-08-17/notes.md: the 30 coder cells "not okay" or empty. */
export const FREEFORM_BAD = {
  'X-01': [E], 'X-02': [], 'X-04': [], 'X-06': [E], 'X-07': [T], 'X-08': [T], 'X-09': [], 'X-11': [], 'X-12': [T], 'X-13': [T],
  'X-14': [], 'X-17': [], 'X-18': [T], 'X-22': [], 'X-23': [T], 'X-27': [T], 'X-29': [], 'X-34': [], 'X-36': [], 'X-37': [T],
  'X-39': [], 'X-41': [], 'X-43': [T], 'X-46': [], 'X-49': [], 'X-51': [], 'X-52': [], 'X-55': [], 'X-56': [T], 'X-57': [],
};

/** pro-instruments-round-READ-2026-08-14/notes.md: the five generations that "do not work". */
export const INSTRUMENTS_BAD = { 'B-11': [T], 'B-13': [], 'B-14': [], 'B-15': [X], 'B-20': [T] };

// ── reading the archives ──────────────────────────────────────────────────────────────────────

const sha = (s) => createHash('sha256').update(s).digest('hex');
const fileSha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const keyOf = (id) => id.replace(/[:|]/g, '~');

/** The rows of a round's key.html, as arrays of cell text. */
function keyRows(round) {
  const html = readFileSync(path.join(ARCHIVES.lite, round, 'key.html'), 'utf8');
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()))
    .filter((r) => r.length);
}

const CAPTION = {
  hold: 'on air, settled, with the brief\'s own values',
  stress: 'on air with stress values: the longest text the fields must carry',
  'step-1': 'after the operator\'s first step',
  'step-2': 'after the operator\'s second step',
  'step-3': 'after the operator\'s third step',
  // `noacg validate --screenshots` lengthens every field itself (each value set twice over).
  'stress-cli': 'on air with stress values: every field\'s text made much longer',
};

function blindFrames(round, id, kinds = ['hold', 'stress', 'step-1', 'step-2', 'step-3']) {
  return kinds.filter((k) => existsSync(path.join(ARCHIVES.lite, round, 'blind', `${id}.${k}.png`))).map((k) => ({ root: 'lite', path: `${round}/blind/${id}.${k}.png`, caption: CAPTION[k] }));
}

function customBrief(cell) {
  const [briefId, brandId] = cell.split('.');
  const bank = readJson(path.join(ROOT, 'benchmarks', 'pro', 'v1', 'custom', 'briefs.json')).briefs;
  const brands = readJson(path.join(ROOT, 'benchmarks', 'pro', 'v1', 'custom', 'brands.json')).brands;
  const b = bank.find((x) => x.id === briefId);
  const brand = brands.find((x) => x.id === brandId);
  if (!b || !brand) throw new Error(`no custom brief or brand for ${cell}`);
  const fields = (b.brief.fields ?? []).filter((f) => f.paintExpected !== false);
  return {
    id: `${briefId}.${brandId}`,
    text: [
      `A ${b.brief.graphicType ?? b.type} for ${brand.name}, ${brand.world}; the brand's logo may appear. ${b.brief.brief}`,
      fields.length ? `Fields (value / stress value): ${fields.map((f) => `${f.title}: "${f.sample}" / "${f.stress}"`).join('; ')}.` : '',
      b.brief.steps?.length ? `Operator steps: ${b.brief.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function lowerThirdBrief(cell) {
  const [briefId, brandId] = cell.split('.');
  const b = readJson(path.join(ROOT, 'benchmarks', 'pro', 'v1', 'briefs.json')).briefs.find((x) => x.id === briefId);
  const brand = readJson(path.join(ROOT, 'benchmarks', 'pro', 'v1', 'spike', 'brands.json')).brands.find((x) => x.id === brandId);
  if (!b || !brand) throw new Error(`no lower-third brief or brand for ${cell}`);
  return { id: `${briefId}.${brandId}`, text: `A lower third for ${brand.name}, ${brand.world}; the brand's logo may appear. ${b.brief.brief}\nName: "${b.brief.name}". Title: "${b.brief.title}". The stress frame carries longer values.` };
}

function augustBrief(cell) {
  const briefId = cell.split('.')[0];
  const b = readJson(path.join(ROOT, 'benchmarks', 'harness', 'tuning', 'briefs.json')).briefs.find((x) => x.id === briefId);
  if (!b) throw new Error(`no tuning brief ${briefId}`);
  return { id: briefId, text: b.prompt };
}

/** Which instruments-round generation each blind id is: the blind hold is byte-identical to its cell's. */
function instrumentCells() {
  const dir = path.join(ARCHIVES.lite, INSTRUMENTS);
  const byHash = new Map(readdirSync(dir).filter((f) => /\.grammar\.hold\.png$/.test(f)).map((f) => [fileSha(path.join(dir, f)), f.replace(/\.grammar\.hold\.png$/, '')]));
  const out = {};
  for (const id of Object.keys(INSTRUMENTS_BAD)) {
    const cell = byHash.get(fileSha(path.join(dir, 'blind', `${id}.hold.png`)));
    if (!cell) throw new Error(`instruments ${id}: no cell's hold matches the blind frame`);
    out[id] = cell;
  }
  return out;
}

/** The calibration set, from the archives. */
export function buildSet() {
  const items = [];
  const ts = new Map(keyRows(TYPESWEEP).map((r) => [r[0], { model: r[2], cell: r[3], type: r[4] }]));
  const rr = keyRows(REREAD).map((r) => ({ id: r[0], model: r[2], cell: r[3], type: r[4] }));
  for (const row of rr.filter((r) => r.model.includes('gemini'))) {
    const cell = row.cell.replace(/\.iterate$/, '');
    items.push({ id: `rr:${row.id}`, source: REREAD, group: `cell:${cell}`, stratum: 'typesweep-cell', sub: row.type, model: row.model, label: { airable: true, verdict: 'AIR/OK', basic: [] }, brief: customBrief(cell), frames: blindFrames(REREAD, row.id) });
  }
  for (const [id, [verdict, ...basic]] of Object.entries(TYPESWEEP_BAD)) {
    const row = ts.get(id);
    if (!row || row.model === 'catalog') throw new Error(`typesweep ${id} is not a generated cell`);
    const cell = row.cell.replace(/\.iterate$/, '');
    items.push({ id: `ts:${id}`, source: TYPESWEEP, group: `cell:${cell}`, stratum: 'typesweep-cell', sub: row.type, model: row.model, label: { airable: false, verdict, basic }, brief: customBrief(cell), frames: blindFrames(TYPESWEEP, id) });
  }
  const ff = new Map(keyRows(FREEFORM).map((r) => [r[0], { round: r[1], model: r[2], cell: r[3] }]));
  for (const [id, basic] of Object.entries(FREEFORM_BAD)) {
    const row = ff.get(id);
    if (!row || !row.round.startsWith('pro-spike-out-')) throw new Error(`freeform ${id} is not a coder cell`);
    items.push({ id: `ff:${id}`, source: FREEFORM, group: `ff:${id}`, stratum: 'freeform', sub: row.model, model: row.model, label: { airable: false, verdict: 'not okay', basic }, brief: lowerThirdBrief(row.cell.replace(/\.none$/, '')), frames: blindFrames(FREEFORM, id, ['hold', 'stress']) });
  }
  const inCells = instrumentCells();
  for (const [id, basic] of Object.entries(INSTRUMENTS_BAD)) {
    items.push({ id: `in:${id}`, source: INSTRUMENTS, group: `in:${id}`, stratum: 'instruments', sub: 'grammar', model: 'alibaba/qwen3-coder', label: { airable: false, verdict: 'does not work', basic }, brief: lowerThirdBrief(inCells[id]), frames: blindFrames(INSTRUMENTS, id, ['hold', 'stress']) });
  }
  const augKey = readJson(path.join(ARCHIVES.bench, AUGUST, 'key.json'));
  const augCells = Object.values(augKey).map((v) => v.cell).sort();
  const library = augCells.filter((c) => !c.startsWith('third-party-ograf.'));
  for (const cell of augCells) {
    items.push({ id: `aug:${cell}`, source: AUGUST, group: `aug:${cell}`, stratum: 'august', sub: cell.split('.')[0], model: 'claude-code (2026-08-22)', label: { airable: true, verdict: 'airable', basic: [] }, brief: augustBrief(cell), render: { cell, defect: null } });
  }
  library.forEach((cell, i) => {
    const defect = DEFECTS[i % DEFECTS.length];
    items.push({ id: `plant:${cell}:${defect}`, source: AUGUST, group: `aug:${cell}`, stratum: 'august', sub: cell.split('.')[0], model: 'planted', label: { airable: false, verdict: `planted ${defect}`, basic: [DEFECT_KIND[defect]] }, brief: augustBrief(cell), render: { cell, defect } });
  });
  return { format: 'noacg-judge-calibration-v1', note: 'Owner verdicts transcribed from each round\'s notes.md; frames live in the read-only archives (root "lite" or "bench") or are rendered by `calibration.mjs render` into the work directory (items with `render`). Never commit a frame.', items };
}

/** Every good-versus-bad pair the set holds: within one group, the same brief. */
export function pairsOf(items) {
  const byGroup = new Map();
  for (const it of items) byGroup.set(it.group, [...(byGroup.get(it.group) ?? []), it]);
  const pairs = [];
  for (const [group, list] of byGroup) {
    for (const good of list.filter((i) => i.label.airable)) for (const bad of list.filter((i) => !i.label.airable)) pairs.push({ id: `pair:${good.id}|${bad.id}`, group, good: good.id, bad: bad.id });
  }
  return pairs;
}

// ── the split ─────────────────────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const membershipSha = (ids) => sha([...ids].sort().join('\n'));

/**
 * Hold back a stratified share of the GROUPS (a group is one brief: its good and bad items and the
 * pairs between them stay on one side). Within each stratum and sub-stratum, a seeded shuffle and
 * the first round(share x n) groups held back.
 */
export function makeSplit(set, seed, share = HOLD_BACK) {
  const groups = new Map();
  for (const it of set.items) if (!groups.has(it.group)) groups.set(it.group, `${it.stratum}/${it.sub}`);
  const byStratum = new Map();
  for (const [g, s] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) byStratum.set(s, [...(byStratum.get(s) ?? []), g]);
  const rand = mulberry32(seed);
  const held = new Set();
  for (const [, list] of [...byStratum].sort((a, b) => a[0].localeCompare(b[0]))) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const g of shuffled.slice(0, Math.round(share * list.length))) held.add(g);
  }
  const pairs = pairsOf(set.items);
  const part = (inHeld) => {
    const items = set.items.filter((i) => held.has(i.group) === inHeld).map((i) => i.id).sort();
    const ps = pairs.filter((p) => held.has(p.group) === inHeld).map((p) => p.id).sort();
    const gs = [...groups.keys()].filter((g) => held.has(g) === inHeld).sort();
    return { groups: gs, items, pairs: ps, sha256: { items: membershipSha(items), pairs: membershipSha(ps), groups: membershipSha(gs) } };
  };
  const strata = Object.fromEntries([...byStratum].sort((a, b) => a[0].localeCompare(b[0])).map(([s, list]) => [s, { groups: list.length, heldout: list.filter((g) => held.has(g)).length }]));
  return { format: 'noacg-judge-split-v1', seed, share, setSha256: sha(JSON.stringify(set.items.map((i) => [i.id, i.group, i.label]))), strata, heldout: part(true), dev: part(false) };
}

// ── rendering the August cells and their planted variants ─────────────────────────────────────

const augustSources = (cell) => path.join(ARCHIVES.bench, AUGUST, 'cells', cell, 'graphic');

/** Frames of a rendered item, from its render.json: the Take, the stress values, up to three states. */
function renderedFrames(work, item) {
  const file = path.join(work, 'renders', keyOf(item.id), 'render.json');
  if (!existsSync(file)) return null;
  const r = readJson(file);
  // A plant that changed nothing is its original under a bad label: never judged as bad.
  if (r.planted === false) throw new Error(`${item.id}: the planted defect changed nothing visible (render.json); fix the plant before judging it`);
  return r.frames;
}

async function render({ set, work, only }) {
  const cli = makeCli({ url: process.env.NOACG_URL || 'https://noacg.studio' });
  const doctor = await cli(['doctor', '--json']);
  if (doctor.code !== 0) throw new Error(`no NoaCG bridge at ${cli.url}: ${doctor.stderr.slice(-300)}`);
  const items = set.items.filter((i) => i.render && (!only.length || only.includes(i.id)));
  // Originals first: a plant is measured against its original's frames.
  items.sort((a, b) => Number(Boolean(a.render.defect)) - Number(Boolean(b.render.defect)));
  for (const item of items) {
    const key = keyOf(item.id);
    const src = path.join(work, 'sources', key, 'graphic');
    const out = path.join(work, 'renders', key);
    rmSync(path.dirname(src), { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    cpSync(augustSources(item.render.cell), src, { recursive: true });
    if (item.render.defect) {
      const js = path.join(src, 'js', 'template.js');
      if (!existsSync(js)) throw new Error(`${item.id}: no js/template.js to plant into`);
      appendFileSync(js, injection(item.render.defect));
    }
    const t = Date.now();
    const r = await cli(['validate', src, '--screenshots', out, '--background', 'video', '--json'], { cwd: path.dirname(src) });
    const shots = r.json?.screenshots ?? {};
    const frames = [];
    if (shots.onair) frames.push({ root: 'work', path: path.relative(work, shots.onair).split(path.sep).join('/'), caption: CAPTION.hold });
    if (shots.stress) frames.push({ root: 'work', path: path.relative(work, shots.stress).split(path.sep).join('/'), caption: CAPTION['stress-cli'] });
    for (const s of (r.json?.stateFrames ?? []).slice(0, 3)) frames.push({ root: 'work', path: path.relative(work, s.file).split(path.sep).join('/'), caption: `after the operator presses ${s.via.join(', then ')}` });
    const record = { id: item.id, exit: r.code, ok: r.json?.ok ?? null, frames, failed: r.json?.screenshotsFailed ?? null, seconds: Math.round((Date.now() - t) / 1000) };
    if (item.render.defect) {
      const original = path.join(work, 'renders', keyOf(`aug:${item.render.cell}`));
      record.changed = Object.fromEntries(['onair', 'stress'].filter((n) => shots[n] && existsSync(path.join(original, `${n}.png`))).map((n) => [n, Number(changedFraction(path.join(original, `${n}.png`), shots[n]).toFixed(4))]));
      // A plant that moved under 0.01% of the picture (about 200 pixels) did nothing a viewer could
      // see; a clipped short word is about 400.
      record.planted = Object.values(record.changed).some((v) => v > 0.0001);
    }
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'render.json'), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`  ${item.id.padEnd(48)} ${frames.length} frame(s)${record.changed ? `, changed ${JSON.stringify(record.changed)}${record.planted ? '' : ' - PLANT DID NOTHING'}` : ''}${record.failed ? `, FAILED ${record.failed}` : ''} [${record.seconds}s]`);
  }
}

// ── judging ───────────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveFrames(work, item) {
  const frames = item.render ? renderedFrames(work, item) : item.frames;
  if (!frames?.length) throw new Error(`${item.id}: no frames${item.render ? ' (run `render` first)' : ''}`);
  return frames.map((f) => ({ file: f.root === 'work' ? path.join(work, f.path) : path.join(ARCHIVES[f.root], f.path), caption: f.caption }));
}

function readResults(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function runPart({ set, split, part, task, work, concurrency, judge, only, tag = '', phase = 'H2' }) {
  const claude = claudeExecutable();
  const token = (await import('../../../scripts/lite-eval-paths.mjs')).mainEnv().CLAUDE_CODE_OAUTH_TOKEN;
  const system = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin';
  const envFor = (w) => subscriptionEnv({ token, home: path.join(work, 'homes', `w${w}`), pathDirs: [path.dirname(process.execPath), path.dirname(claude), system] });
  checkSubscriptionAuth({ claude, env: envFor(0) });
  const byId = new Map(set.items.map((i) => [i.id, i]));
  const resultsFile = path.join(work, `results-${part}${tag}.jsonl`);
  const done = new Set(readResults(resultsFile).filter((r) => r.judge === judge.fingerprint && !r.error).map((r) => `${r.task}:${r.id}`));
  const jobs = [];
  const want = (id) => !only.length || only.includes(id);
  if (task !== 'pairwise') for (const id of split[part].items.filter(want)) if (!done.has(`single:${id}`)) jobs.push({ task: 'single', id });
  if (task !== 'single') {
    for (const pid of split[part].pairs.filter(want)) {
      if (done.has(`pairwise:${pid}`)) continue;
      const [good, bad] = pid.slice('pair:'.length).split('|');
      jobs.push({ task: 'pairwise', id: pid, good, bad });
    }
  }
  console.log(`JUDGE ${part}: ${jobs.length} judgement(s) to run on ${judge.lock.model} (effort ${judge.lock.effort}), ${concurrency} at a time -> ${resultsFile}`);
  let notional = 0;
  let count = 0;
  let next = 0;
  const ledgerPause = (resetsAt) => {
    const ledger = readLedger(LEDGER_FILE);
    appendEntry(ledger, { kind: 'session', phase, stage: `calibration-${part}`, arm: 'judge', model: judge.lock.model, funding: 'subscription', outcome: 'paused', note: `the subscription's usage limit; paused until ${resetsAt ?? 'an unknown reset (retried after 15 minutes)'}; nothing moved to the credit` });
    writeLedger(LEDGER_FILE, ledger);
  };
  const worker = async (w) => {
    const env = envFor(w);
    while (next < jobs.length) {
      const job = jobs[next++];
      const dir = path.join(work, 'judgements', part, job.task, keyOf(job.id));
      rmSync(dir, { recursive: true, force: true });
      let answered = [];
      let retried = false;
      for (;;) {
        let out;
        try {
          if (job.task === 'single') {
            const item = byId.get(job.id);
            out = await judgeSingle(judge, { brief: item.brief.text, frames: resolveFrames(work, item), dir, claude, env });
          } else {
            const good = byId.get(job.good);
            const bad = byId.get(job.bad);
            // The order of the first judgement is seeded by the pair, so neither side is always first.
            const goodFirst = parseInt(sha(job.id).slice(0, 2), 16) % 2 === 0;
            out = await judgePair(judge, { brief: good.brief.text, x: { id: good.id, frames: resolveFrames(work, good) }, y: { id: bad.id, frames: resolveFrames(work, bad) }, xFirst: goodFirst, answered, dir, claude, env });
            answered = out.answered ?? [];
          }
        } catch (e) {
          out = { error: e instanceof Error ? e.message : String(e) };
        }
        if (out.paused) {
          ledgerPause(out.paused.resetsAt);
          const wait = pauseMs(out.paused);
          console.log(`  PAUSED by the usage limit; resuming in ${Math.round(wait / 60000)} min`);
          await sleep(wait);
          continue;
        }
        // One retry for an error; a pause waited out is not an attempt.
        if (out.error && !retried) {
          retried = true;
          continue;
        }
        notional += out.notionalUsd ?? 0;
        count++;
        const rec = { task: job.task, id: job.id, judge: judge.fingerprint, at: new Date().toISOString(), ...out };
        appendFileSync(resultsFile, `${JSON.stringify(rec)}\n`);
        console.log(`  [${count}/${jobs.length}] ${job.task.padEnd(8)} ${job.id.slice(0, 70).padEnd(70)} ${out.error ? `ERROR ${out.error.slice(0, 120)}` : job.task === 'single' ? `airable ${out.answer.airable}` : `prefers ${out.combined}`}`);
        break;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, (_, w) => worker(w)));
  // What a run took is kept beside its results; the committed ledger gets the phase's total when
  // H2 closes, and a pause the moment it happens.
  if (count) appendFileSync(path.join(work, 'runs.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), part, task, judge: judge.fingerprint, model: judge.lock.model, effort: judge.lock.effort, judgements: count, notionalUsd: Number(notional.toFixed(2)) })}\n`);
  console.log(`Done: ${count} judgement(s), $${notional.toFixed(2)} notional on the subscription, $0 credit.`);
}

// ── scoring ───────────────────────────────────────────────────────────────────────────────────

/** Wilson score interval at 95%. */
export function wilson(k, n) {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Number(Math.max(0, c - h).toFixed(3)), Number(Math.min(1, c + h).toFixed(3))];
}

/**
 * The numbers of 4.3 for one part. A judgement missing or failed counts against the judge: it is
 * an item the judge did not get right.
 */
export function score({ items, pairs, results, byId }) {
  const latest = new Map();
  for (const r of results) latest.set(`${r.task}:${r.id}`, r);
  const single = items.map((id) => {
    const item = byId.get(id);
    const r = latest.get(`single:${id}`);
    const said = r && !r.error ? r.answer.airable : null;
    return { id, owner: item.label.airable, basic: item.label.basic, said, agree: said === item.label.airable };
  });
  const pairwise = pairs.map((id) => {
    const r = latest.get(`pairwise:${id}`);
    const [good] = id.slice('pair:'.length).split('|');
    const combined = r && !r.error ? r.combined : null;
    return { id, combined, correct: combined === good, flip: combined === 'tie' };
  });
  const good = single.filter((s) => s.owner);
  const bad = single.filter((s) => !s.owner);
  const agreed = single.filter((s) => s.agree).length;
  const pairsRight = pairwise.filter((p) => p.correct).length;
  const basicAired = bad.filter((s) => s.basic.length && s.said === true).map((s) => s.id);
  const approvesEverything = single.length > 0 && single.every((s) => s.said === true);
  const out = {
    single: { n: single.length, agreed, agreement: single.length ? agreed / single.length : 0, interval: wilson(agreed, single.length), goodAired: good.filter((s) => s.said === true).length, good: good.length, badRejected: bad.filter((s) => s.said === false).length, bad: bad.length, unanswered: single.filter((s) => s.said === null).length, basicFailsCalledAirable: basicAired, approvesEverything },
    pairwise: { n: pairwise.length, correct: pairsRight, rate: pairwise.length ? pairsRight / pairwise.length : 0, interval: wilson(pairsRight, pairwise.length), flips: pairwise.filter((p) => p.flip).length, wrong: pairwise.filter((p) => !p.correct && !p.flip && p.combined !== null).length, unanswered: pairwise.filter((p) => p.combined === null).length },
    disagreements: single.filter((s) => !s.agree).map((s) => ({ id: s.id, owner: s.owner, said: s.said })),
    pairErrors: pairwise.filter((p) => !p.correct).map((p) => ({ id: p.id, combined: p.combined })),
  };
  out.pass = out.single.agreement >= THRESHOLDS.agreement && basicAired.length === 0 && !approvesEverything && out.pairwise.rate >= THRESHOLDS.pairwise;
  return out;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

function fail(message) {
  console.error(`judge-calibration: ${message}`);
  process.exit(2);
}

/**
 * A second judge's lock (`--lock`): the exam judge's prompt and rubric, frozen, on another model.
 * Null without the flag. Its answers and score are kept apart, tagged by the lock's folder.
 */
export function secondLock(raw, { root = ROOT, examLock = path.join(HERE, 'judge.lock.json') } = {}) {
  if (!raw) return null;
  const file = path.resolve(root, raw);
  if (file === path.resolve(examLock)) throw new Error('--lock names a second judge\'s lock, not judge.lock.json');
  return { file, tag: `-${path.basename(path.dirname(file))}`, exam: readJson(examLock) };
}

/** A second judge runs the exam judge's prompt and rubric unchanged: only then has the held-back part never shaped what it runs. */
export function sameFiles(lock, examLock) {
  return JSON.stringify(lock.sha256) === JSON.stringify(examLock.sha256);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** A second judge's held-back result, as its lock carries it: the figures of H2's bar and where they are kept. */
function calibrationBlock(s, results, paths) {
  const ats = results.map((r) => r.at).sort();
  return {
    part: 'heldout',
    pass: s.pass,
    agreement: `${s.single.agreed} of ${s.single.n} (${pct(s.single.agreement)}, Wilson ${pct(s.single.interval[0])} to ${pct(s.single.interval[1])})`,
    basicFailsCalledAirable: s.single.basicFailsCalledAirable.length,
    pairwise: `${s.pairwise.correct} of ${s.pairwise.n} (${pct(s.pairwise.rate)}, Wilson ${pct(s.pairwise.interval[0])} to ${pct(s.pairwise.interval[1])})`,
    flips: s.pairwise.flips,
    unanswered: s.single.unanswered + s.pairwise.unanswered,
    judgements: results.filter((r) => !r.error).length,
    notionalUsd: Number(results.reduce((n, r) => n + (r.notionalUsd ?? 0), 0).toFixed(2)),
    from: ats[0] ?? null,
    to: ats[ats.length - 1] ?? null,
    fingerprint: [...new Set(results.map((r) => r.judge))].join(', '),
    ...paths,
    bar: 'the parent spec 4.3 / H2: agreement at least 85% with no basic-defect FAIL called airable, pairwise at least 90% with order flips as errors',
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const verb = argv[0];
  let second = null;
  try {
    second = secondLock(value('lock', ''));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const tag = second?.tag ?? '';
  const work = path.resolve(value('work', path.join(os.tmpdir(), 'noacg-harness', 'judge-calibration')));
  if (work.startsWith(ROOT + path.sep)) fail(`--work must be outside the repository (${ROOT}): frames are never committed`);
  const onlyArg = value('only', '') || '';
  // `--only @file` reads the ids from a file, one list separated by commas or lines.
  const only = (onlyArg.startsWith('@') ? readFileSync(onlyArg.slice(1), 'utf8') : onlyArg).split(/[,\s]+/).filter(Boolean);
  if (verb === 'set') {
    const set = buildSet();
    writeFileSync(SET_FILE, `${JSON.stringify(set, null, 1)}\n`);
    const n = (f) => set.items.filter(f).length;
    console.log(`${set.items.length} items: ${n((i) => i.label.airable)} good, ${n((i) => !i.label.airable)} bad (${n((i) => i.label.basic.length)} with a basic mistake), ${pairsOf(set.items).length} pairs -> ${path.relative(ROOT, SET_FILE)}`);
  } else if (verb === 'split') {
    if (existsSync(SPLIT_FILE)) fail(`${path.relative(ROOT, SPLIT_FILE)} exists: the split is made once, before the prompt, and never redrawn`);
    const seed = Number(value('seed', ''));
    if (!Number.isInteger(seed)) fail('split needs --seed <integer>');
    const split = makeSplit(readJson(SET_FILE), seed);
    writeFileSync(SPLIT_FILE, `${JSON.stringify(split, null, 1)}\n`);
    console.log(`seed ${seed}: held back ${split.heldout.groups.length} group(s), ${split.heldout.items.length} item(s), ${split.heldout.pairs.length} pair(s); dev ${split.dev.groups.length} / ${split.dev.items.length} / ${split.dev.pairs.length}`);
    console.log(`held-back sha256: items ${split.heldout.sha256.items}, pairs ${split.heldout.sha256.pairs}`);
  } else if (verb === 'render') {
    mkdirSync(work, { recursive: true });
    await render({ set: readJson(SET_FILE), work, only });
  } else if (verb === 'run') {
    const part = value('part', '');
    if (!['dev', 'heldout'].includes(part)) fail('run needs --part dev or --part heldout');
    const task = value('task', 'both');
    let judge;
    if (part === 'heldout') {
      // The held-back part is read by the frozen judge only, so it can never shape the prompt.
      judge = loadJudge(HERE, second ? { lockFile: second.file } : {});
      if (!judge.frozen) fail(`the held-back part is judged only by a frozen judge: ${judge.reason}`);
      if (second && !sameFiles(judge.lock, second.exam)) fail(`${path.relative(ROOT, second.file)} does not freeze judge.lock.json's prompt and rubric: a second judge runs them unchanged`);
      // One second judge only: trying model after model on the same held-back part until one passes
      // would be choosing a judge on it.
      const others = second && existsSync(work) ? readdirSync(work).filter((f) => /^results-heldout-.+\.jsonl$/.test(f) && f !== `results-heldout${tag}.jsonl`) : [];
      if (others.length) fail(`another second judge already read the held-back part (${others.join(', ')}): a further one needs a new held-back set`);
      // Read once: a second judge on the same held-back part would be a judge tuned on it.
      const earlier = readResults(path.join(work, `results-heldout${tag}.jsonl`)).find((r) => r.judge !== judge.fingerprint);
      if (earlier) fail(`the held-back part was already read by another judge (${earlier.judge.slice(0, 12)}): a re-pin needs a new held-back set, never this one again`);
      // And it is the held-back part the judge was frozen against, drawn from this set.
      const split = readJson(SPLIT_FILE);
      if (JSON.stringify(split.heldout.sha256) !== JSON.stringify(judge.lock.split)) fail('split.json\'s held-back part is not the one judge.lock.json was frozen against');
      if (makeSplit(readJson(SET_FILE), split.seed).setSha256 !== split.setSha256) fail('calibration-set.json changed since the split was drawn');
    } else {
      judge = draftJudge(HERE, { model: value('model', ''), effort: value('effort', '') });
    }
    await runPart({ set: readJson(SET_FILE), split: readJson(SPLIT_FILE), part, task, work, concurrency: Number(value('concurrency', '3')), judge, only, tag, phase: value('phase', 'H2') });
  } else if (verb === 'score') {
    const part = value('part', '');
    if (!['dev', 'heldout'].includes(part)) fail('score needs --part dev or --part heldout');
    const set = readJson(SET_FILE);
    const split = readJson(SPLIT_FILE);
    const fingerprint = value('judge', null);
    const results = readResults(path.join(work, `results-${part}${tag}.jsonl`)).filter((r) => !fingerprint || r.judge.startsWith(fingerprint));
    const s = score({ items: split[part].items, pairs: split[part].pairs, results, byId: new Map(set.items.map((i) => [i.id, i])) });
    writeFileSync(path.join(work, `score-${part}${tag}.json`), `${JSON.stringify(s, null, 2)}\n`);
    console.log(JSON.stringify({ single: s.single, pairwise: s.pairwise, pass: s.pass }, null, 2));
    console.log(`disagreements: ${s.disagreements.map((d) => `${d.id} (owner ${d.owner}, judge ${d.said})`).join('; ') || 'none'}`);
    console.log(`pair errors: ${s.pairErrors.map((p) => `${p.id} -> ${p.combined}`).join('; ') || 'none'}`);
    // A second judge's held-back result goes into its lock, which a user of it reads (lib/ladder.mjs
    // `ladderJudge`), with the files to commit beside the lock: the answers and this score.
    if (second && part === 'heldout') {
      const lock = readJson(second.file);
      const kept = path.join(path.dirname(second.file), 'judge');
      const rel = (f) => path.relative(ROOT, path.join(kept, f)).split(path.sep).join('/');
      lock.calibration = calibrationBlock(s, results, { results: rel('results-heldout.jsonl'), score: rel('score-heldout.json') });
      writeFileSync(second.file, `${JSON.stringify(lock, null, 2)}\n`);
      console.log(`${path.relative(ROOT, second.file)}: calibration ${lock.calibration.pass ? 'PASS' : 'FAIL'}; commit ${path.join(work, `results-heldout${tag}.jsonl`)} and ${path.join(work, `score-heldout${tag}.json`)} as ${lock.calibration.results} and ${lock.calibration.score}`);
    }
  } else if (verb === 'freeze') {
    const model = value('model', '');
    const effort = value('effort', '');
    if (!model || !effort) fail('freeze needs --model <the exact id claude -p reported> and --effort <level>');
    // The Claude Code version that reported the id is kept beside it: a re-pin starts by comparing both.
    const call = invocation(claudeExecutable(), ['--version']);
    const version = String(spawnSync(call.file, call.args, { encoding: 'utf8', windowsHide: true }).stdout ?? '').trim();
    if (!version) fail('claude --version printed nothing: the lock records which Claude Code reported the model id');
    const lock = { ...lockFor(HERE, model, effort), claudeCode: version, frozenAt: new Date().toISOString(), split: readJson(SPLIT_FILE).heldout.sha256 };
    if (second && !sameFiles(lock, second.exam)) fail('the prompt or rubric differs from judge.lock.json\'s: a second judge freezes them unchanged');
    if (second) mkdirSync(path.dirname(second.file), { recursive: true });
    writeFileSync(second?.file ?? path.join(HERE, 'judge.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    console.log(JSON.stringify(lock, null, 2));
  } else {
    fail('verbs: set, split --seed <n>, render, run --part dev|heldout, score --part dev|heldout, freeze --model <id> --effort <level>');
  }
}

