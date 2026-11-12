import { graphicById } from '../model/library';
import { loadShows } from '../model/shows';
import { planProjectInstallation, reconcileProjectTarget, type ProjectInstallation } from '../model/projectInstallation';
import { authoringWorkspace, stageAuthoringWorkspace, workspaceRefusal, writeAuthoringWorkspace } from '../model/project';
import { readableWorkspace } from '../model/authoringDocument';
import { captureDurableWrites, commitDurableReceipt } from '../model/durableStore';
import { validateProductionTemplate } from '../validation/productionGate';

let running = false;
async function retain(receipt: ProjectInstallation) {
  const w = authoringWorkspace();
  if (!readableWorkspace(w) || workspaceRefusal()) throw new Error(workspaceRefusal() ?? 'Keep these graphics in a project first.');
  const next = { ...w, installations: [...(w.installations ?? []).filter(p => p.id !== receipt.id), receipt] };
  const captured = captureDurableWrites('spx-gfx-project', () => writeAuthoringWorkspace(next));
  const errors = await Promise.all(captured.receipts.map(commitDurableReceipt));
  if (!captured.receipts.length || errors.some(Boolean)) throw new Error(`${errors.find(Boolean) ?? ''} The installation receipt was not saved. Its outcome is unknown; retry this installation to reconcile it.`.trim());
  // Preserve a newer live draft staged while this receipt was writing.
  const latest = authoringWorkspace();
  stageAuthoringWorkspace(latest === w ? next : readableWorkspace(latest) ? { ...latest, installations: next.installations } : next);
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
    await retain(plan);
    return apply(plan);
  });
}
async function apply(plan: ProjectInstallation, rollback = false): Promise<ProjectInstallation> {
  if (plan.status === 'rolled-back' && !rollback) throw new Error('This installation was rolled back. Start a new installation.');
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
