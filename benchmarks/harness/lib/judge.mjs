// THE JUDGE RUNNER, as a skeleton until H2 freezes the judge (docs/work-specs/noacg-harness/spec.md
// 4.3, AC-3). H2 writes `benchmarks/harness/judge/prompt.md` and `rubric.json`, calibrates them on
// held-back owner verdicts and commits `judge.lock.json` with their sha256 and the exact model id
// `claude -p` reported. From then on this runner refuses a judge whose files differ from the
// lock: a judge changed after calibration is not the judge that was calibrated, and the exam is
// re-pinned by repeating H2, never patched in place.
//
// The judge runs on the subscription (`subscription.mjs`): one `claude -p` per judgement, its
// frames read through the Read tool, its answer held to the rubric's JSON schema. What H2 adds is
// the prompt, the rubric and the calibration; the invocation is here so the exam and the
// calibration run the same way.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const JUDGE_FILES = ['prompt.md', 'rubric.json'];

const sha = (file) => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

/**
 * The frozen judge, or why there is none. `{ frozen: false }` before H2; a throw when the lock
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
  return { frozen: true, lock, prompt: readFileSync(path.join(judgeDir, 'prompt.md'), 'utf8'), rubric: JSON.parse(readFileSync(path.join(judgeDir, 'rubric.json'), 'utf8')) };
}

/** The lock H2 commits, for the files as they are. */
export function lockFor(judgeDir, model) {
  return { model, sha256: Object.fromEntries(JUDGE_FILES.map((name) => [name, sha(path.join(judgeDir, name))])) };
}

/**
 * One judgement's `claude -p` arguments and prompt: the frozen prompt, the brief, and the frames
 * of each arm under opaque labels in a randomised order (the runner judges every pair in both
 * orders). Tools are Read only, so the judge sees the frames and nothing else.
 */
export function judgeInvocation(judge, { brief, arms }) {
  if (!judge.frozen) throw new Error(`no judgement before the judge is frozen: ${judge.reason}`);
  const lines = [judge.prompt.trim(), '', '## The brief', '', brief.prompt, '', `Operator actions the brief needs: ${(brief.expect?.actions ?? []).join(', ') || 'none beyond Take, Update and Out'}`];
  for (const arm of arms) {
    lines.push('', `## Graphic ${arm.label}`, '', ...arm.frames.map((f) => `- ${f.file}: ${f.state}`));
  }
  lines.push('', 'Answer with the JSON object the rubric defines and nothing else.');
  return {
    args: ['--model', judge.lock.model, '--tools', 'Read', '--strict-mcp-config', '--json-schema', JSON.stringify(judge.rubric.schema ?? {})],
    prompt: lines.join('\n'),
  };
}
