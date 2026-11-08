// Continuing-plan launches use the supervisor's existing pending record. No provider calls here.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readSteps } from './plan-run.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;

/** Pin the exact saved brief and native binding before the coordinator dispatches it once. */
export function planLaunchIntent(doc, project, phase, step, receipt, kit, now) {
  const launch = receipt?.launch;
  if (!project || !['build', 'repair', 'check'].includes(step) || !launch
      || launch.native?.provider !== 'codex' || !/^[a-f0-9]{40}$/.test(launch.sourceSha ?? '')
      || !['sessionId', 'environmentId'].every((key) => nonempty(launch.native[key]))
      || !/^[a-f0-9]{64}$/.test(launch.native.policySha256 ?? '')
      || !/^codex\/[A-Za-z0-9._/-]+$/.test(launch.branch ?? '')
      || !/^briefs\/[A-Za-z0-9._-]+\.txt$/.test(launch.brief ?? '')) {
    throw Error('Plan launch needs a Codex native binding, full sourceSha, owned codex branch and saved briefs/*.txt');
  }
  const root = realpathSync(kit), file = realpathSync(path.join(root, launch.brief));
  const state = JSON.parse(readFileSync(path.join(root, 'state.json'), 'utf8'));
  if (state.project !== project.id || state.execution?.harness !== 'codex'
      || !['active', 'unattended'].includes(state.execution.mode)
      || state.coordinator?.session !== launch.native.sessionId
      || state.coordinator?.environment !== launch.native.environmentId) {
    throw Error('Plan launch requires explicit Codex execution mode and the current kit coordinator binding');
  }
  if (step === 'check') {
    const landed = readSteps(readFileSync(doc.manifest.wave, 'utf8')).findLast((s) => s.phase === phase && s.event === 'landed');
    if (launch.sourceSha !== JSON.parse(landed?.detail ?? '{}').mergeSha) throw Error('Checker sourceSha must be the exact recorded merge SHA');
  }
  if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) throw Error('Launch brief must stay inside its kit');
  const brief = readFileSync(file, 'utf8');
  if (!brief.trim() || Buffer.byteLength(brief) > 32 * 1024) throw Error('Launch brief must be nonempty and at most 32 KiB');
  const native = Object.fromEntries(['provider', 'sessionId', 'environmentId', 'policySha256'].map((key) => [key, launch.native[key]]));
  if (doc.manifest.authorization.policySha256 && native.policySha256 !== doc.manifest.authorization.policySha256) {
    throw Error('Launch policy differs from original authorization');
  }
  const packet = { kind: 'plan-worker', phase, step, actor: receipt.actor,
    sourceSha: launch.sourceSha, branch: launch.branch, brief: { path: launch.brief, sha256: hash(brief), text: brief },
    block: project.block, native };
  const id = `${doc.manifest.id}:${doc.sequence + 1}`;
  return { id, attempts: 1, retryAt: now, packet,
    requestSha256: hash(JSON.stringify({ actionId: id, authorization: doc.manifest.authorization, packet })) };
}

/** Binding expected by the existing native receipt validator, including the original coordinator. */
export function planLaunchBinding(pending) {
  return { ...pending.packet.native, revision: pending.packet.sourceSha,
    actionId: pending.id, requestSha256: pending.requestSha256 };
}
