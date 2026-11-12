import { graphicById } from '../model/library';
import { loadShows } from '../model/shows';
import { planProjectInstallation, planProjectRollback, reconcileProjectTarget, type ProjectInstallation } from '../model/projectInstallation';
import { authoringWorkspace, workspaceRefusal, writeAuthoringWorkspace, stageAuthoringWorkspace, loadProject } from '../model/project';
import { readableWorkspace } from '../model/authoringDocument';
import { sameWorkspaceValue } from '../model/workspaceStage';
import { captureDurableWrites, commitDurableReceipt, libraryInUse } from '../model/durableStore';
import { validateProductionTemplate } from '../validation/productionGate';

let running = false;
async function retain(receipt: ProjectInstallation) {
  const w = authoringWorkspace(), owner = libraryInUse();
  if (!readableWorkspace(w) || workspaceRefusal()) throw new Error(workspaceRefusal() ?? 'Keep these graphics in a project first.');
  const next = { ...w, installations: [...(w.installations ?? []).filter(p => p.id !== receipt.id), receipt] };
  const captured = captureDurableWrites('spx-gfx-project', () => writeAuthoringWorkspace(next));
  const errors = await Promise.all(captured.receipts.map(commitDurableReceipt));
  if (libraryInUse() !== owner) throw new Error('The library changed while saving. The installation was not submitted.');
  if (!captured.receipts.length || errors.some(Boolean)) {
    const latest = authoringWorkspace(), accepted = loadProject()?.workspace;
    // An unconfirmed status must not survive a refused receipt. Keep every later draft and
    // operation identity; restore only this unchanged submitted unit to its accepted state.
    if (readableWorkspace(latest) && readableWorkspace(accepted) && sameWorkspaceValue(latest.installations?.find(p => p.id === receipt.id), receipt)) {
      const identity = ({ status: _status, error: _error, ...intent }: ProjectInstallation) => intent;
      const acceptedUnit = accepted.installations?.find(p => p.id === receipt.id), prior = w.installations?.find(p => p.id === receipt.id);
      const known = acceptedUnit && sameWorkspaceValue(identity(acceptedUnit), identity(receipt)) ? acceptedUnit
        : prior && sameWorkspaceValue(identity(prior), identity(receipt)) ? prior : receipt;
      stageAuthoringWorkspace({ ...latest, installations: (latest.installations ?? []).map(p => p.id === receipt.id ? known : p) });
    }
    throw new Error(`${errors.find(Boolean) ?? ''} The installation receipt was not saved. Its outcome is unknown; retry this installation to reconcile it.`.trim());
  }
  if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
  window.dispatchEvent(new CustomEvent('spx-data-changed'));
}
async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  if (running) throw new Error('An installation is still saving.');
  running = true;
  try { return await run(); } finally { running = false; }
}
export function installProjectGraphics(target: string, graphicIds: string[]): Promise<ProjectInstallation> {
  return exclusive(async () => {
    const before = loadShows().find(s => s.id === target);
    if (!before) throw new Error('That production no longer exists.');
    const sources = graphicIds.map(id => {
      const doc = graphicById(id);
      if (!doc) throw new Error('Save each selected graphic before installing.');
      const gate = validateProductionTemplate(doc.template);
      if (!gate.ok) throw new Error(`${doc.name}: ${gate.errors.map(e => e.message).join(' ')}`);
      return doc;
    });
    const plan = planProjectInstallation(before, sources);
    return apply(plan);
  });
}
async function apply(plan: ProjectInstallation, rollback = false): Promise<ProjectInstallation> {
  // Once an inverse is durable, a default retry must never switch back to forward install.
  rollback = rollback || !!plan.rollback;
  if (plan.status === 'rolled-back' && !rollback) throw new Error('This installation was rolled back. Start a new installation.');
  if (rollback && !plan.rollback) {
    plan = planProjectRollback(plan);
  }
  await retain(plan); // Retry also confirms any previously refused/lost intent before target submission.
  const result = await reconcileProjectTarget(plan, rollback);
  if (result.status === 'failed') throw new Error(result.error ?? 'The production write was refused. The installation is retained for retry.');
  const next: ProjectInstallation = { ...plan, status: result.status === 'refused' ? 'conflict' : rollback ? 'rolled-back' : 'confirmed', ...(result.error ? { error: result.error } : { error: undefined }) };
  // A failed confirmation stays prepared/unknown durably. The target's exact after-state
  // permits a future retry to confirm without submitting another set of graphic/cue IDs.
  await retain(next);
  if (result.status === 'refused') throw new Error(result.error!);
  return next;
}
export function retryProjectInstallation(id: string, rollback = false): Promise<ProjectInstallation> {
  return exclusive(async () => {
    const w = authoringWorkspace();
    const plan = readableWorkspace(w) ? w.installations?.find(p => p.id === id) : undefined;
    if (!plan) throw new Error('That installation receipt no longer exists.');
    return apply(plan, rollback);
  });
}
