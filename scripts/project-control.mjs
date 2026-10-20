// Controls for the existing supervisor transaction and wave ledger. Cross-session ownership is
// the recovery ref's compare-and-swap (run-recovery.mjs); nothing here calls a remote.
import { randomUUID } from 'node:crypto';
import { readSteps, phasePosition } from './plan-run.mjs';
import { digest, immutableProject, instant, projectBoundary, readProject, validateProject, writeProject } from './project-authorization.mjs';

export function checkedProject(doc, text, now) {
  const project = readProject(text, now);
  if (!project) {
    if (doc.projectState || doc.projectAuthorization) throw Error('Project metadata missing; reconcile without launching');
    return null;
  }
  if (immutableProject(project) !== doc.projectAuthorization || digest(project) !== doc.projectState
      || JSON.stringify(project.authorization) !== JSON.stringify(doc.manifest.authorization)) throw Error('Project/control state differs; reconcile before any work');
  return project;
}

export function hasInFlight(text) {
  return phasePosition(text).action === 'wait';
}

export function changeProject(doc, project, text, operation, value, now) {
  if (['cancelled', 'finished'].includes(project.status)) throw Error(`Project is ${project.status}`);
  if (operation !== 'cancel' && now >= instant(project.authorization.deadline)) throw Error('Original project deadline expired');
  if (operation === 'start-block') {
    if (!value?.evidence?.trim() || !value.owner?.trim()) throw Error('Resume requires owner identity and reconciliation evidence');
    // A store restored from the shared checkpoint takes over the block it continued from; the
    // older coordinator's next publication is then rejected as superseded. In-flight work stays
    // in the ledger, so the new coordinator waits on it rather than relaunching it.
    const continuing = Boolean(project.block) && project.block.id === doc.restoration?.supersedes;
    if (project.status === 'active' && !projectBoundary(project, now) && !continuing) throw Error('Another block already owns launch authority');
    if (doc.pending) throw Error('Uncertain external action must be reconciled before resume');
    if (doc.wait) throw Error('Resolve the blocked prerequisite before resume');
    project.block = { id: randomUUID(), owner: value.owner, epoch: (project.block?.epoch ?? 0) + 1,
      startedAt: new Date(now).toISOString(), deadline: value.deadline };
    project.status = 'active'; project.reason = value.evidence;
    doc.status = 'active'; delete doc.pauseReceipt;
  } else if (['pause', 'wait'].includes(operation)) {
    project.status = operation === 'pause' ? 'paused' : 'blocked';
    project.reason = operation === 'pause' ? value : value.reason;
    if (typeof project.reason !== 'string' || !project.reason.trim()) throw Error('Checkpoint/block reason required');
    delete doc.pauseReceipt;
  } else if (operation === 'cancel') {
    if (typeof value !== 'string' || !value.trim()) throw Error('Owner cancellation evidence required');
    project.status = 'cancelled'; project.reason = value;
    doc.status = 'cancelled';
  } else if (operation === 'finish') {
    if (phasePosition(text, now).action !== 'done') throw Error('Completion requires every required phase and acceptance PASS');
    project.status = 'finished'; project.reason = 'Every required phase independently passed';
    doc.status = 'finished';
  }
  validateProject(project, now);
  doc.projectState = digest(project);
  return writeProject(text, project);
}

export function checkBlock(project, authority, now) {
  const boundary = projectBoundary(project, now);
  if (boundary) throw Error(`Project refuses work: ${boundary.action}`);
  if (!authority || authority.owner !== project.block.owner || authority.epoch !== project.block.epoch
      || authority.id !== project.block.id) throw Error('Stale or competing block owner; reconcile before launch');
}

export function checkpointReceipt(doc, receipt, text) {
  const last = readSteps(text).filter((step) => ['build', 'repair', 'check'].includes(step.event)).at(-1);
  if (receipt?.state !== 'checkpointed' || typeof receipt.evidence !== 'string' || !receipt.evidence.trim()
      || receipt.phase !== last?.phase || receipt.step !== last?.event
      || receipt.blockId !== readProject(text).block?.id) return false;
  doc.pauseReceipt = receipt;
  return true;
}
