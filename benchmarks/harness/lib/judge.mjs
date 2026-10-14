// THE JUDGE (docs/work-specs/noacg-harness/spec.md 4.3, AC-3). `benchmarks/harness/judge/` holds
// its prompt (`prompt.md`, the judge's whole system prompt) and its rubric (`rubric.json`: the
// basic-mistake kinds and the strict JSON schema of each task), calibrated on held-back owner
// verdicts and frozen in `judge.lock.json` with their sha256 and the exact model id `claude -p`
// reported. A judge changed after calibration is not the judge that was calibrated: `loadJudge`
// refuses it, and the exam is re-pinned by repeating H2, never patched in place.
//
// Host-neutral (D5): the judge sees a brief and frames, never an arm, a model or a cost. It runs
// on the subscription (`subscription.mjs`): one `claude -p` per judgement, with the frozen prompt
// as its system prompt, Read as its only tool and the rubric's schema as its answer, working in a
// fresh directory under an opaque name that holds nothing but that judgement's frames, themselves
// under opaque names. Claude Code tells the model its working directory, so that name matters.
//
//   single     would this air; which basic mistakes; which operator actions are missing
//   pairwise   which would air, which is better, what is wrong, why: judged in both orders, and
//              an answer that flips with the order is a tie

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runClaudeAsync } from './subscription.mjs';

export const JUDGE_FILES = ['prompt.md', 'rubric.json'];
export const TASKS = ['single', 'pairwise'];

const sha = (file) => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const read = (judgeDir) => ({ prompt: readFileSync(path.join(judgeDir, 'prompt.md'), 'utf8').replace(/\r\n/g, '\n'), rubric: JSON.parse(readFileSync(path.join(judgeDir, 'rubric.json'), 'utf8')) });

/** One string naming the judge's files and model: two results with the same one came from the same judge. */
const fingerprintOf = (hashes, model, effort) => createHash('sha256').update(JSON.stringify({ hashes, model, effort })).digest('hex');

/**
 * The frozen judge, or why there is none. `{ frozen: false }` with no lock; a throw when the lock
 * exists and a file under it changed.
 */
export function loadJudge(judgeDir) {
  const lockFile = path.join(judgeDir, 'judge.lock.json');
  if (!existsSync(lockFile)) return { frozen: false, reason: 'no judge.lock.json yet: H2 writes, calibrates and freezes the judge' };
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  if (!lock.model || typeof lock.model !== 'string') throw new Error(`${lockFile} pins no model id`);
  for (const name of JUDGE_FILES) {
    const file = path.join(judgeDir, name);
    if (!existsSync(file)) throw new Error(`the judge's ${name} is missing beside its lock`);
    if (sha(file) !== lock.sha256?.[name]) throw new Error(`the judge's ${name} changed after it was frozen (lock ${String(lock.sha256?.[name]).slice(0, 12)}, now ${sha(file).slice(0, 12)}): repeat H2 to re-pin it, never patch it in place`);
  }
  return { frozen: true, lock, fingerprint: fingerprintOf(lock.sha256, lock.model, lock.effort ?? null), ...read(judgeDir) };
}

/** The judge files as they are, unfrozen: what the calibration's dev part runs while the prompt is written. */
export function draftJudge(judgeDir, { model, effort }) {
  if (!model || !effort) throw new Error('a draft judge needs --model and --effort: the calibration runs the model it will pin');
  const hashes = Object.fromEntries(JUDGE_FILES.map((name) => [name, sha(path.join(judgeDir, name))]));
  return { frozen: false, draft: true, lock: { model, effort, sha256: hashes }, fingerprint: fingerprintOf(hashes, model, effort), ...read(judgeDir) };
}

/** The lock H2 commits, for the files as they are. */
export function lockFor(judgeDir, model, effort = null) {
  return { model, ...(effort ? { effort } : {}), sha256: Object.fromEntries(JUDGE_FILES.map((name) => [name, sha(path.join(judgeDir, name))])) };
}

/**
 * One judgement's `claude -p` arguments and user prompt. `graphics` are `[{ label, frames: [{ file,
 * caption }] }]` with `file` already the opaque name in the judgement's directory. The operator
 * surface (`noacg inspect`'s buttons) is passed when the bench has it; without it the judge judges
 * the picture alone and names no missing action.
 */
export function judgeInvocation(judge, { task = 'single', brief, graphics, operator = null, actions = [] }) {
  if (!judge.frozen && !judge.draft) throw new Error(`no judgement before the judge is frozen: ${judge.reason}`);
  if (!TASKS.includes(task)) throw new Error(`no judge task "${task}"`);
  const schema = judge.rubric[task]?.schema;
  if (!schema) throw new Error(`the rubric has no schema for the ${task} task`);
  const lines = [`# Task: ${task === 'single' ? 'one graphic' : 'two graphics for the same brief'}`, '', '## The brief', '', brief.trim(), ''];
  lines.push(`Operator actions the brief needs: ${actions.length ? actions.join(', ') : 'none named beyond Take, Update and Out'}`);
  if (operator) {
    for (const g of graphics) lines.push(`Operator surface of graphic ${g.label} (from noacg inspect): ${(operator[g.label] ?? []).join(', ') || 'no buttons'}`);
  } else lines.push('Operator surface: not provided. Judge the picture; leave missingActions empty.');
  for (const g of graphics) {
    lines.push('', `## Graphic ${g.label}`, '', ...g.frames.map((f) => `- ${f.file}: ${f.caption}`));
  }
  lines.push('', 'Read every file listed above with the Read tool before you answer. Then answer with the JSON object the schema defines, and nothing else.');
  return {
    args: ['--model', judge.lock.model, ...(judge.lock.effort ? ['--effort', judge.lock.effort] : []), '--system-prompt', judge.prompt.trim(), '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--json-schema', JSON.stringify(schema)],
    prompt: lines.join('\n'),
  };
}

/**
 * Where the judge works: a fresh directory under an opaque name, holding that judgement's frames
 * and nothing else, removed afterwards. Claude Code tells the model its working directory, so the
 * caller's record directory (named after the item, the arm or the label) must never be it.
 */
function stagingDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'nj-'));
}

/** Frames under opaque names, `<label>-<n>.<ext>`, copied into the staging directory. */
function stage(into, label, frames) {
  return frames.map((f, i) => {
    const name = `${label}-${i + 1}${path.extname(f.file) || '.png'}`;
    copyFileSync(f.file, path.join(into, name));
    return { file: name, caption: f.caption };
  });
}

/** A judgement's answer must be the schema's shape, or it is an error and never a silent default. */
function shapeError(task, answer) {
  if (task === 'single') return typeof answer.airable === 'boolean' ? null : 'the answer carries no boolean airable';
  if (!['A', 'B'].includes(answer.better)) return 'the answer names neither A nor B as better';
  return typeof answer.airable?.A === 'boolean' && typeof answer.airable?.B === 'boolean' ? null : 'the answer carries no airable verdict for A and B';
}

/** The answer of one `claude -p` judgement, the model that gave it, and what it took. */
function answerOf(r, judge, task) {
  if (r.paused) return { paused: r.paused };
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* no json */
  }
  const usage = json?.modelUsage ?? {};
  const models = Object.keys(usage);
  const base = { sessionId: r.sessionId, notionalUsd: r.notionalUsd ?? 0, ms: r.ms, turns: r.turns, models };
  if (!json || r.exit !== 0 || json.is_error) return { ...base, error: `claude -p failed (exit ${r.exit}): ${(r.result || r.stderr || '').slice(0, 300)}` };
  // The pinned model must be the one that answered: no other model may have written more. A judge
  // served by another model is not the judge that was calibrated, and the exam stops for a re-pin
  // rather than judging on.
  const wrote = (m) => usage[m]?.outputTokens ?? 0;
  const outwrote = models.some((m) => m !== judge.lock.model && wrote(m) > wrote(judge.lock.model));
  if (!models.includes(judge.lock.model) || outwrote) return { ...base, error: `the judgement was not served by the pinned model ${judge.lock.model} (got ${models.join(', ') || 'none'})` };
  let answer = json.structured_output ?? null;
  if (!answer && typeof json.result === 'string') {
    try {
      answer = JSON.parse(json.result.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      /* not json */
    }
  }
  if (!answer || typeof answer !== 'object') return { ...base, error: 'the judge answered no JSON object' };
  const bad = shapeError(task, answer);
  return bad ? { ...base, error: bad, answer } : { ...base, answer };
}

/**
 * One judgement. `graphics`: `[{ label, frames: [{ file, caption }] }]` with real paths; `dir` is
 * where the prompt and the raw answer are kept. `run` is injectable so the bench's tests need no
 * Claude Code.
 */
async function judgeOnce(judge, { task, brief, graphics, operator, actions, dir, claude, env, run, timeoutMs = 15 * 60_000 }) {
  mkdirSync(dir, { recursive: true });
  const cwd = stagingDir();
  try {
    const staged = graphics.map((g) => ({ label: g.label, frames: stage(cwd, g.label, g.frames) }));
    const call = judgeInvocation(judge, { task, brief, graphics: staged, operator, actions });
    writeFileSync(path.join(dir, 'prompt.md'), call.prompt);
    const r = await runClaudeAsync({ claude, args: call.args, env, cwd, input: call.prompt, timeoutMs, ...(run ? { run } : {}) });
    writeFileSync(path.join(dir, 'claude.json'), r.stdout || r.stderr || '');
    return answerOf(r, judge, task);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** Single airability. `frames`: `[{ file, caption }]` with real paths. */
export async function judgeSingle(judge, { brief, frames, operator = null, actions = [], dir, claude, env, run }) {
  return judgeOnce(judge, { task: 'single', brief, graphics: [{ label: 'G', frames }], operator: operator ? { G: operator } : null, actions, dir, claude, env, run });
}

/** The graphic one answer preferred: A or B, as the ids of that order. */
export const preferred = (order) => (order.answer.better === 'A' ? order.a : order.b);

/** Two orders of one pair: the preference that holds in both stands; one that flips with the order is a tie. */
export function combinePair(first, second) {
  const p1 = preferred(first);
  const p2 = preferred(second);
  return p1 === p2 ? p1 : 'tie';
}

/**
 * Pairwise preference, in both orders. `x` and `y`: `{ id, frames, operator? }`. `xFirst` says
 * which is A in the first judgement; the second swaps them. Returns both answers and the combined
 * preference (an id, or 'tie'). A pause or an error returns the orders already answered as
 * `answered`; passed back on the retry, they are not judged again.
 */
export async function judgePair(judge, { brief, x, y, xFirst = true, actions = [], answered = [], dir, claude, env, run }) {
  const orders = xFirst ? [[x, y], [y, x]] : [[y, x], [x, y]];
  if (answered.some((o, i) => o.a !== orders[i]?.[0].id || o.b !== orders[i]?.[1].id)) throw new Error('the answered orders are not this pair\'s');
  const answers = [...answered];
  let notionalUsd = answers.reduce((n, o) => n + (o.notionalUsd ?? 0), 0);
  for (const [i, [a, b]] of orders.entries()) {
    if (i < answers.length) continue;
    const graphics = [{ label: 'A', frames: a.frames }, { label: 'B', frames: b.frames }];
    const operator = a.operator || b.operator ? { A: a.operator ?? [], B: b.operator ?? [] } : null;
    const out = await judgeOnce(judge, { task: 'pairwise', brief, graphics, operator, actions, dir: path.join(dir, `order-${i + 1}`), claude, env, run });
    notionalUsd += out.notionalUsd ?? 0;
    if (out.paused || out.error) return { ...out, notionalUsd, answered: answers };
    answers.push({ a: a.id, b: b.id, ...out });
  }
  return { combined: combinePair(answers[0], answers[1]), orders: answers.map((o) => ({ a: o.a, b: o.b, sessionId: o.sessionId, models: o.models, notionalUsd: o.notionalUsd, answer: o.answer })), notionalUsd, ms: answers.reduce((n, o) => n + (o.ms ?? 0), 0) };
}

/**
 * A cell's coverage matrix as the judge reads it (`noacg coverage`'s coverage.json): every render
 * and every native-pixel crop, each captioned with what it shows.
 */
export function coverageFrames(framesDir) {
  const coverage = JSON.parse(readFileSync(path.join(framesDir, 'coverage.json'), 'utf8'));
  const frames = (coverage.frames ?? []).map((f) => ({ file: path.join(framesDir, f.file), caption: `${f.state}; ${f.values} values on the ${f.ground} ground${f.atMs ? `, at ${f.atMs} ms` : ''}` }));
  const crops = (coverage.crops ?? []).map((c) => ({ file: path.join(framesDir, c.file), caption: `native-pixel crop of field ${c.key}; ${c.values} values on the ${c.ground} ground` }));
  return [...frames, ...crops];
}
