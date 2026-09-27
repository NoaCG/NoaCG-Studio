import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useRouter } from '../../app/router';
import NewGraphicButton from '../NewGraphicButton';
import SaveControls from '../save/SaveControls';
import BrandLogo from '../BrandLogo';
import { activatableFocus, editorShortcutsLive, modalOpen } from '../spaceKey';
import Canvas, { recordFoundationInput } from './Canvas';
import Timeline from './Timeline';
import Inspector from './Inspector';
import { activeEditorSession, setSessionTime } from './documentAdapter';
import { readTimeline, segmentAt } from './timelineView';
import { sameRevision } from './session';
import type { PreviewController } from './PreviewController';
import type { RenderedPart } from './protocol';
import './foundation.css';

/** Opt-in composition only. Existing wizard, library, runtime and exporters stay authoritative. */
export default function EditorFoundation() {
  const template = useTemplateStore(state => state.template);
  // Artwork authoring shows saved defaults; operator rehearsals retain their own samples.
  const sampleData = useMemo(() => Object.fromEntries(template.fields.map(f => [f.field, String(f.value ?? '')])), [template.fields]);
  const selection = useTemplateStore(state => state.selectedParts);
  const setSelection = useTemplateStore(state => state.setSelectedParts);
  const session = activeEditorSession();
  const [clock, setClock] = useState({ documentId: session.documentId, time: session.port.view().time });
  const [projectOpen, setProjectOpen] = useState(false);
  const [linked, setLinked] = useState(true);
  const [appearance, setAppearance] = useState<Record<string, RenderedPart['appearance']>>({});
  const preview = useRef<PreviewController | null>(null);
  const connectPreview = useCallback((controller: PreviewController | null) => { preview.current = controller; }, []);
  const previewCss = useCallback((css: string) => { preview.current?.previewCss(css, 'appearance'); }, []);
  const [playing, setPlaying] = useState(false);
  const playback = useRef<{ from: number; end: number; expected: ReturnType<typeof session.version>; session: typeof session } | null>(null);
  const view = useMemo(() => readTimeline(template), [template]);
  const time = Math.min(view.duration, clock.documentId === session.documentId ? clock.time : session.port.view().time);
  const seek = useCallback((next: number) => { recordFoundationInput('scrub'); setSessionTime(next); setClock({ documentId: session.documentId, time: next }); }, [session, setClock]);
  const pause = useCallback(() => { playback.current = null; setPlaying(false); }, [setPlaying]);
  const togglePlayback = useCallback(() => {
    if (playing) { pause(); return; }
    if (view.reason || !view.duration) return;
    const time = session.port.view().time;
    const segment = view.segments[segmentAt(view.segments, time).step];
    const end = segment.start + segment.duration;
    const from = time >= end ? segment.start : time;
    playback.current = { from, end, expected: session.version(), session };
    seek(from); setPlaying(true);
  }, [playing, pause, view, session, seek, setPlaying]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !editorShortcutsLive(event.target) || activatableFocus()) return;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); if (!event.repeat) togglePlayback();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [togglePlayback]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const run = playback.current;
      if (!run || run.session !== session || !sameRevision(run.expected, session.version()) || modalOpen() || document.hidden) { pause(); return; }
      const next = Math.min(run.end, run.from + (now - started) / 1000);
      seek(next);
      if (next >= run.end) pause(); else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, session, seek, pause]);
  const select = useCallback((selector: string | null, toggle: boolean) => {
    recordFoundationInput('selection');
    const selection = useTemplateStore.getState().selectedParts;
    const next = selector === null ? [] : toggle
      ? selection.includes(selector) ? selection.filter(s => s !== selector) : [...selection, selector]
      : [selector];
    setSelection(next);
  }, [setSelection]);
  const history = (redo: boolean) => { pause(); if (redo) session.redo(); else session.undo(); seek(session.port.view().time); };
  return <main className={'ef-shell' + (projectOpen ? ' ef-project-open' : '')} data-testid="editor-foundation"
    onKeyDown={event => {
      if (!editorShortcutsLive(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); history(event.shiftKey || event.key.toLowerCase() === 'y');
      }
      if (event.key === 'Escape') { pause(); session.cancel(); }
    }}>
    <header className="ef-header">
      <BrandLogo size={26} />
      <button data-testid="open-home" onClick={() => useRouter.getState().navigate({ view: 'home', section: null })}>Home</button>
      <NewGraphicButton />
      <span className="ef-document-name">{template.name}</span><span className="ef-spacer" />
      <span className="ef-release">Editor Alpha</span>
      <SaveControls />
      {/* No "Existing editor" door: nothing links to the old code editor (owner, 2026-09-21 and
          2026-09-24). Home, beside the brand, is the way out. */}
    </header>
    <div className="ef-document-strip"><button aria-expanded={projectOpen} aria-controls="ef-project" onClick={() => setProjectOpen(!projectOpen)}>Project {projectOpen ? '▾' : '▸'}</button>
      <span className="ef-document-tab">{template.name}</span><span className="ef-spacer" />
      <span className="ef-muted">Draw · refine · scrub</span></div>
    <div className="ef-workspace">
      <aside id="ef-project" className="ef-project" aria-label="Project" hidden={!projectOpen}>
        <div className="ef-toolbar"><h2>Project</h2><span className="ef-spacer" /><button onClick={() => setProjectOpen(false)} aria-label="Close Project">×</button></div><span className="ef-section-label">Current graphic</span>
        <p className="ef-current-graphic">{template.name}</p>
        <span className="ef-section-label">Assets · {template.assets.length}</span>
        <div className="ef-assets">{template.assets.map(asset => <div key={asset.path} title={asset.path}>▧ {asset.path.split('/').slice(-1)[0]}</div>)}
          {!template.assets.length && <p className="ef-muted">No local assets</p>}</div>
        <span className="ef-section-label">Operator fields · {template.fields.length}</span>
        {template.fields.map(field => <p className="ef-field" key={field.field}>{field.title || field.field}<code>{field.field}</code></p>)}
        <p className="ef-muted">Assets and operator fields for this graphic. Select artwork in Layers below the canvas.</p>
      </aside>
      <Canvas key={session.documentId} template={template} sampleData={sampleData} session={session} time={time} selection={selection} select={select} linked={linked} setSelection={setSelection} onAppearance={setAppearance} rootSelector={view.parts.find(p => p.kind === 'root')?.selector} connectPreview={connectPreview} togglePlayback={togglePlayback} pause={pause} />
      <Inspector view={view} template={template} selection={selection} select={select} session={session} linked={linked} setLinked={setLinked} appearance={appearance[selection[0]]} previewCss={previewCss} />
    </div>
    <Timeline view={view} fps={template.fps} time={time} selection={selection} seek={next => { pause(); seek(next); }} select={select} playing={playing} togglePlayback={togglePlayback}
      canUndo={session.canUndo()} canRedo={session.canRedo()} undo={() => history(false)} redo={() => history(true)} />
    <footer className="ef-status"><span>Artwork editing · Alpha</span><span>Base edits preserve motion · Key authoring follows separately</span></footer>
  </main>;
}
