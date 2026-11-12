import './projects.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { workspace, useAuthoringProjects, openProjectDocument, keepCurrentInProject, renameAuthoringProject, removeAuthoringProject } from '../../store/authoringProjects';
import { useTemplateStore, flushPendingProject } from '../../store/templateStore';
import { saveCurrentGraphic, saveGraphicAs } from '../../store/saveActions';
import { loadLooks } from '../../model/packets';
import { loadShows } from '../../model/shows';
import { workspaceRefusal } from '../../model/project';
import { activeEditorSession } from './documentAdapter';
import { installProjectGraphics, retryProjectInstallation } from '../../control/projectInstallation';
import type { AuthoringWorkspace } from '../../model/authoringDocument';
import BrandEditor from '../brand/BrandEditor';
const ProjectStarter = lazy(() => import('./ProjectStarter'));

export default function ProjectPanel({ beforeAction = () => {} }: { beforeAction?: () => void }) {
  useAuthoringProjects(s => s.revision);
  const busy = useAuthoringProjects(s => s.busy), projectError = useAuthoringProjects(s => s.error);
  const currentId = useTemplateStore(s => s.documentId);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const update = () => setRevision(v => v + 1); window.addEventListener('spx-data-changed', update); return () => window.removeEventListener('spx-data-changed', update); }, []);
  void revision;
  const refusal = workspaceRefusal();
  const w: AuthoringWorkspace = refusal ? { v: 1, projects: [], documents: [], active: null } : workspace();
  const [chosenProject, setChosenProject] = useState('');
  const project = w.projects.find(p => p.id === chosenProject) ?? w.projects.find(p => p.documents.includes(currentId)) ?? w.projects[0];
  const documents = project ? w.documents.filter(d => project.documents.includes(d.id)) : [];
  const [selected, setSelected] = useState<string[]>([]), [brandId, setBrandId] = useState(''), [target, setTarget] = useState('');
  const [newProject, setNewProject] = useState(false), [newBrand, setNewBrand] = useState(false), [working, setWorking] = useState(false), [note, setNote] = useState(''), [name, setName] = useState('');
  const looks = loadLooks(), productions = loadShows().filter(s => !s.teamId);
  const selectedDocs = documents.filter(d => selected.includes(d.id));
  const run = async (action: () => Promise<void>) => {
    if (working || busy) return;
    beforeAction(); setWorking(true); setNote('');
    try { await action(); } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); setRevision(v => v + 1); }
  };
  const each = async (operation: () => Promise<void>) => {
    const original = currentId;
    for (const d of selectedDocs) {
      if (!await openProjectDocument(d.id)) throw new Error(useAuthoringProjects.getState().error);
      await operation();
    }
    if (workspace().documents.some(d => d.id === original) && !await openProjectDocument(original)) throw new Error(useAuthoringProjects.getState().error);
  };
  const locked = busy || working || !!refusal;
  return <section className="ef-authoring-project" data-testid="authoring-project">
    <div className="ef-toolbar"><span className="ef-section-label">Graphics</span><button onClick={() => setNewProject(true)} disabled={locked}>New project</button></div>
    {refusal && <p role="alert">{refusal}</p>}
    {project && <>
      <select aria-label="Open project" value={project.id} disabled={locked} onChange={e => { setChosenProject(e.target.value); setSelected([]); }}>
        {w.projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
      </select>
      <div className="project-document-list">{documents.map(d => <div key={d.id} className="project-document-row">
        <input type="checkbox" aria-label={`Select ${d.template.name}`} checked={selected.includes(d.id)} disabled={locked} onChange={e => setSelected(e.target.checked ? [...selected, d.id] : selected.filter(id => id !== d.id))} />
        <button data-document={d.id} aria-current={d.id === currentId ? 'page' : undefined} disabled={locked} onClick={() => void run(async () => { if (!await openProjectDocument(d.id)) throw new Error(useAuthoringProjects.getState().error); })}>{d.template.name}<small>{d.saved.dirty ? 'Draft' : 'Saved'}</small></button>
      </div>)}</div>
      {!project.documents.includes(currentId) && <button disabled={locked} onClick={() => void run(async () => { if (!await keepCurrentInProject(project.id)) throw new Error(useAuthoringProjects.getState().error); })}>Keep current graphic</button>}
      <details><summary>Project settings</summary><label>Project name<input aria-label="Rename project" placeholder={project.name} value={name} onChange={e => setName(e.target.value)} /></label>
        <button disabled={locked || !name.trim()} onClick={() => void run(async () => { if (await renameAuthoringProject(project.id, name)) setName(''); })}>Rename project</button>
        <button disabled={locked} onClick={() => void run(async () => { await removeAuthoringProject(project.id); setSelected([]); })}>Remove project</button>
      </details>
      <label>Brand<select aria-label="Brand for selected graphics" value={brandId} onChange={e => setBrandId(e.target.value)} disabled={locked}><option value="">Choose brand</option>{looks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <div className="project-actions"><button disabled={locked} onClick={() => setNewBrand(true)}>New brand</button>
        <button disabled={locked || !selectedDocs.length || !brandId} onClick={() => void run(async () => {
          const look = loadLooks().find(l => l.id === brandId); if (!look) throw new Error('Choose the saved brand again.');
          await each(async () => { const session = activeEditorSession(); session.cancel(); session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'brand.apply', look }] }); });
          setNote(`Brand applied to ${selectedDocs.length}.`);
        })}>Apply brand</button></div>
      <button disabled={locked || !selectedDocs.length} onClick={() => void run(async () => {
        await each(async () => { const result = await saveCurrentGraphic(); if (result === 'failed') throw new Error('Save failed. This draft was kept for retry.');
          if (result === 'needs-name') { const saved = await saveGraphicAs(useTemplateStore.getState().template.name, { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error ?? 'Save failed.'); } });
        setNote(`${selectedDocs.length} graphics saved.`);
      })}>Save selected</button>
      <label>Production<select aria-label="Install into production" value={target} onChange={e => setTarget(e.target.value)} disabled={locked}><option value="">Choose production</option>{productions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button disabled={locked || !target || !selectedDocs.length || selectedDocs.some(d => !d.saved.graphicId || d.saved.dirty)} onClick={() => void run(async () => {
        flushPendingProject(); await installProjectGraphics(target, selectedDocs.map(d => d.saved.graphicId!)); setNote(`Installed ${selectedDocs.length} selected graphics.`);
      })}>Install selected</button>
    </>}
    {(w.installations ?? []).length > 0 && <details><summary>Installations</summary>{w.installations!.map(p => <div key={p.id} className="project-installation" data-installation={p.id}>
      <span>{p.after.name} · {p.sources.length} · {p.status === 'prepared' ? 'Interrupted or awaiting confirmation' : p.status}</span>
      {p.error && <p role="alert">{p.error}</p>}
      {p.status !== 'rolled-back' && <><button disabled={locked} onClick={() => void run(async () => { await retryProjectInstallation(p.id); setNote('Installation confirmed.'); })}>Retry installation</button>
        <button disabled={locked} onClick={() => void run(async () => { await retryProjectInstallation(p.id, true); setNote('Installation rolled back.'); })}>Roll back installation</button></>}
    </div>)}</details>}
    {(note || projectError) && <p role="status" data-testid="project-note">{note || projectError}</p>}
    {newProject && <Suspense fallback={<p role="status">Loading starters…</p>}><ProjectStarter close={() => setNewProject(false)} /></Suspense>}
    {newBrand && <BrandEditor onCancel={() => setNewBrand(false)} onSaved={look => { setBrandId(look.id); setNewBrand(false); setRevision(v => v + 1); }} />}
  </section>;
}
