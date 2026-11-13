import '../../editorFoundation/projects.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { workspace, useAuthoringProjects, openProjectDocument, currentAuthoringDocument } from '../../../store/authoringProjects';
import { workspaceRefusal } from '../../../model/project';
import { useSaveUi } from '../../../store/saveActions';
import { openNewEditor } from '../../editorFoundation/openNewEditor';
const ProjectStarter = lazy(() => import('../../editorFoundation/ProjectStarter'));

/** Authoring drafts remain distinct from saved library graphics and production copies. */
export default function ProjectsSection() {
  useAuthoringProjects(s => s.revision);
  const [, refresh] = useState(0), [creating, setCreating] = useState(false), [error, setError] = useState('');
  useEffect(() => { const changed = () => refresh(v => v + 1); window.addEventListener('spx-data-changed', changed); return () => window.removeEventListener('spx-data-changed', changed); }, []);
  const refusal = workspaceRefusal();
  const w = refusal ? null : workspace();
  const grouped = new Set(w?.projects.flatMap(p => p.documents));
  const unfiled = w?.documents.filter(d => !grouped.has(d.id)) ?? [];
  const open = (id: string) => {
    const proceed = () => { void openProjectDocument(id).then(ok => {
      if (ok) openNewEditor(); else setError(useAuthoringProjects.getState().error);
    }); };
    if (currentAuthoringDocument()) proceed(); else useSaveUi.getState().requestSwitch(proceed);
  };
  return <section className="home-projects" data-testid="home-projects">
    <div className="home-shelf-head"><h2>Projects</h2><button disabled={!!refusal} onClick={() => setCreating(true)}>New project</button></div>
    {refusal && <p role="alert">{refusal}</p>}
    {w?.projects.map(p => <div className="home-project" key={p.id}><h3>{p.name}</h3><div className="home-project-documents">{p.documents.map(id => {
      const d = w.documents.find(d => d.id === id)!;
      return <button key={id} onClick={() => open(id)}>{d.template.name}<small>{d.saved.dirty ? 'Draft' : 'Saved'}</small></button>;
    })}</div></div>)}
    {unfiled.length > 0 && <div className="home-project"><h3>Unfiled drafts</h3><div className="home-project-documents">{unfiled.map(d => <button key={d.id} onClick={() => open(d.id)}>{d.template.name}</button>)}</div></div>}
    {error && <p role="alert">{error}</p>}
    {creating && <Suspense fallback={<p role="status">Loading starters…</p>}><ProjectStarter close={() => setCreating(false)} /></Suspense>}
  </section>;
}
