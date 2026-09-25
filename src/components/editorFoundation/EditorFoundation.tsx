import { useCallback, useMemo, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useRouter } from '../../app/router';
import NewGraphicButton from '../NewGraphicButton';
import SaveControls from '../save/SaveControls';
import { modalOpen } from '../spaceKey';
import Canvas, { recordFoundationInput } from './Canvas';
import Timeline from './Timeline';
import Inspector from './Inspector';
import { activeEditorSession, setSessionTime } from './documentAdapter';
import { readTimeline } from './timelineView';
import './foundation.css';

/** Opt-in composition only. Existing wizard, library, runtime and exporters stay authoritative. */
export default function EditorFoundation() {
  const template = useTemplateStore(state => state.template);
  const sampleData = useTemplateStore(state => state.sampleData);
  const selection = useTemplateStore(state => state.selectedParts);
  const setSelection = useTemplateStore(state => state.setSelectedParts);
  const session = activeEditorSession();
  const [clock, setClock] = useState({ documentId: session.documentId, time: session.port.view().time });
  const [projectOpen, setProjectOpen] = useState(false);
  const [linked, setLinked] = useState(true);
  const view = useMemo(() => readTimeline(template), [template]);
  const time = Math.min(view.duration, clock.documentId === session.documentId ? clock.time : session.port.view().time);
  const seek = (next: number) => { recordFoundationInput('scrub'); setSessionTime(next); setClock({ documentId: session.documentId, time: next }); };
  const select = useCallback((selector: string | null, toggle: boolean) => {
    recordFoundationInput('selection');
    const selection = useTemplateStore.getState().selectedParts;
    const next = selector === null ? [] : toggle
      ? selection.includes(selector) ? selection.filter(s => s !== selector) : [...selection, selector]
      : [selector];
    setSelection(next);
  }, [setSelection]);
  const history = (redo: boolean) => { if (redo) session.redo(); else session.undo(); seek(session.port.view().time); };
  return <main className={'ef-shell' + (projectOpen ? ' ef-project-open' : '')} data-testid="editor-foundation"
    onKeyDown={event => {
      if (modalOpen() || (event.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]')) return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); history(event.shiftKey || event.key.toLowerCase() === 'y');
      }
      if (event.key === 'Escape') session.cancel();
    }}>
    <header className="ef-header">
      <strong className="ef-brand">NoaCG</strong>
      <button data-testid="open-home" onClick={() => useRouter.getState().navigate({ view: 'home', section: null })}>Home</button>
      <NewGraphicButton />
      <span className="ef-document-name">{template.name}</span><span className="ef-spacer" />
      <span className="ef-release">Editor Alpha</span>
      <SaveControls />
      {/* No "Existing editor" door: nothing links to the old code editor (owner, 2026-09-21 and
          2026-09-24). Home, beside the brand, is the way out. */}
    </header>
    <div className="ef-document-strip"><button aria-expanded={projectOpen} onClick={() => setProjectOpen(!projectOpen)}>Project</button>
      <span className="ef-document-tab">{template.name}</span><span className="ef-spacer" />
      <span className="ef-muted">Draw · refine · scrub</span></div>
    <div className="ef-workspace">
      <aside className="ef-project" aria-label="Project">
        <h2>Project</h2><span className="ef-section-label">Current graphic</span>
        <p className="ef-current-graphic">{template.name}</p>
        <span className="ef-section-label">Assets · {template.assets.length}</span>
        <div className="ef-assets">{template.assets.map(asset => <div key={asset.path} title={asset.path}>▧ {asset.path.split('/').slice(-1)[0]}</div>)}
          {!template.assets.length && <p className="ef-muted">No local assets</p>}</div>
        <span className="ef-section-label">Operator fields · {template.fields.length}</span>
        {template.fields.map(field => <p className="ef-field" key={field.field}>{field.title || field.field}<code>{field.field}</code></p>)}
        <p className="ef-muted">This view follows the open graphic. Project tabs and shared library workflows follow in R1.4.</p>
      </aside>
      <Canvas key={session.documentId} template={template} sampleData={sampleData} session={session} time={time} selection={selection} select={select} linked={linked} />
      <Inspector view={view} template={template} selection={selection} select={select} session={session} linked={linked} setLinked={setLinked} />
    </div>
    <Timeline view={view} fps={template.fps} time={time} selection={selection} seek={seek} select={select}
      canUndo={session.canUndo()} canRedo={session.canRedo()} undo={() => history(false)} redo={() => history(true)} />
    <footer className="ef-status"><span>Source-backed artwork · R1.1a</span><span>Base edits preserve motion · Key authoring follows separately</span></footer>
  </main>;
}
