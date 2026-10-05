import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { useRouter } from '../../app/router';
import NewGraphicButton from '../NewGraphicButton';
import SaveControls from '../save/SaveControls';
import BrandLogo from '../BrandLogo';
import AssetsPanel from '../AssetsPanel';
import { useImageImport } from './useImageImport';
import { imageCapability } from '../../blocks/editorImages';
import { activatableFocus, editorShortcutsLive, modalOpen } from '../spaceKey';
import Canvas, { recordFoundationInput } from './Canvas';
import Timeline from './Timeline';
import Inspector from './Inspector';
import { activeEditorSession, setSessionTime } from './documentAdapter';
import { onFlag, readTimeline, segmentAt } from './timelineView';
import { sameRevision } from './session';
import type { PreviewController } from './PreviewController';
import type { RenderedPart } from './protocol';
import type { SpxTemplate } from '../../model/types';
import { groupHierarchy } from '../../blocks/editorGroups';
import './foundation.css';

/** Opt-in composition only. Existing wizard, library, runtime and exporters stay authoritative. */
export default function EditorFoundation() {
  const template = useTemplateStore(state => state.template);
  // Artwork authoring shows saved defaults; operator rehearsals retain their own samples.
  const sampleData = useMemo(() => Object.fromEntries(template.fields.map(f => [f.field, String(f.value ?? '')])), [template.fields]);
  const selection = useTemplateStore(state => state.selectedParts);
  const setSelection = useTemplateStore(state => state.setSelectedParts);
  const session = activeEditorSession();
  const [drawingSpace, setDrawingSpace] = useState<import('./protocol').PreviewReply['drawingSpace']>(null);
  const images = useImageImport(session, drawingSpace);
  const openAssets = () => setProjectOpen(true);
  const [clock, setClock] = useState({ documentId: session.documentId, time: session.port.view().time });
  const [groupLocation, setGroupLocation] = useState<{ document: string; path: string[] }>({ document: session.documentId, path: [] });
  const hierarchy = useMemo(() => groupHierarchy(template), [template]);
  const groupPath = groupLocation.document === session.documentId ? groupLocation.path.filter(selector => hierarchy.groups.has(selector)) : [];
  const groupScope = groupPath[groupPath.length - 1] ?? null;
  const [projectOpen, setProjectOpen] = useState(false);
  const [linked, setLinked] = useState(true);
  const [pathEditing, setPathEditing] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Record<string, RenderedPart['appearance']>>({});
  const preview = useRef<PreviewController | null>(null);
  const connectPreview = useCallback((controller: PreviewController | null) => { preview.current = controller; }, []);
  const previewCss = useCallback((css: string) => { preview.current?.previewCss(css, 'appearance'); }, []);
  const previewTemplate = useCallback((template: SpxTemplate) => { preview.current?.previewTemplate(template, 'appearance'); }, []);
  const [playing, setPlaying] = useState(false);
  const [playbackRun, setPlaybackRun] = useState(0);
  const playback = useRef<{ from: number; end: number; expected: ReturnType<typeof session.version>; session: typeof session } | null>(null);
  const view = useMemo(() => readTimeline(template), [template]);
  const time = clock.documentId === session.documentId ? clock.time : session.port.view().time;
  const seek = useCallback((to: number, cue?: number) => {
    const next = onFlag(readTimeline(session.port.read()), to);
    recordFoundationInput('scrub'); setSessionTime(next, cue); setClock({ documentId: session.documentId, time: next });
  }, [session, setClock]);
  const pause = useCallback(() => { playback.current = null; setPlaying(false); }, [setPlaying]);
  const togglePlayback = useCallback(() => {
    if (playing) { pause(); return; }
    if (view.reason || !view.duration) return;
    const time = session.port.view().time;
    const exiting = preview.current?.isExiting();
    const resumeExit = exiting && time < view.duration;
    if (!resumeExit) preview.current?.stopExit();
    const segment = view.segments[exiting ? (resumeExit ? view.segments.length - 1 : 0) : segmentAt(view.segments, time).step];
    const end = segment.start + segment.duration;
    const from = time >= end ? segment.start : time;
    playback.current = { from, end, expected: session.version(), session };
    seek(from); setPlaying(true);
  }, [playing, pause, view, session, seek, setPlaying]);
  const playOut = () => {
    if (!preview.current?.startExit()) return;
    const exit = view.segments[view.segments.length - 1];
    playback.current = { from: view.out, end: view.out + exit.duration, expected: session.version(), session };
    preview.current.seek(view.out);
    seek(view.out); setPlaybackRun(run => run + 1); setPlaying(true);
  };
  const parkOut = () => { preview.current?.stopExit(); seek(readTimeline(session.port.read()).out); };
  // A flag's click shows the cue it starts at its start, the explicit departing side (G02); Edit Out
  // is that for Out.
  const inspectStep = (index: number) => { pause(); preview.current?.stopExit(); seek(view.segments[index].start, index); };
  const inspectOut = () => inspectStep(view.segments.length - 1);
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
  }, [playing, playbackRun, session, seek, pause]);
  const select = useCallback((selector: string | null, toggle: boolean) => {
    setPathEditing(null);
    recordFoundationInput('selection');
    const selection = useTemplateStore.getState().selectedParts;
    const next = selector === null ? [] : toggle
      ? selection.includes(selector) ? selection.filter(s => s !== selector) : [...selection, selector]
      : [selector];
    setSelection(next);
  }, [setSelection, setPathEditing]);
  const navigateGroup = (selector: string | null) => {
    pause(); session.cancel(); setPathEditing(null);
    const path: string[] = [];
    for (let current: string | undefined = selector ?? undefined; current; current = hierarchy.parent[current]) path.unshift(current);
    setGroupLocation({ document: session.documentId, path });
    setSelection(selector ? [] : groupScope ? [groupScope] : []);
  };
  const history = (redo: boolean) => { pause(); preview.current?.stopExit(); if (redo) session.redo(); else session.undo(); seek(session.port.view().time, session.port.view().cue); };
  return <main className={'ef-shell' + (projectOpen ? ' ef-project-open' : '') + (groupScope ? ' ef-group-open' : '')} data-testid="editor-foundation"
    onKeyDown={event => {
      const historyKey = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase());
      // A select has no undo of its own, so undo and redo also work from one (the timeline's key
      // ease dropdown keeps focus after it edits).
      if (!editorShortcutsLive(event.target) && !(historyKey && event.target instanceof HTMLSelectElement)) return;
      if (historyKey) {
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
      <nav className="ef-group-breadcrumbs" aria-label="Group breadcrumbs"><button onClick={() => navigateGroup(null)} aria-current={!groupScope ? 'location' : undefined}>Composition</button>{groupPath.map(selector => <button key={selector} onClick={() => navigateGroup(selector)} aria-current={selector === groupScope ? 'location' : undefined}>{view.parts.find(part => part.selector === selector)?.label ?? selector}</button>)}</nav></div>
    <div className="ef-workspace">
      <aside id="ef-project" className="ef-project" aria-label="Project" hidden={!projectOpen}>
        <div className="ef-toolbar"><h2>Project</h2><span className="ef-spacer" /><button onClick={() => setProjectOpen(false)} aria-label="Close Project">×</button></div><span className="ef-section-label">Current graphic</span>
        <p className="ef-current-graphic">{template.name}</p>
        <span className="ef-section-label">Assets · {template.assets.length}</span>
        <AssetsPanel actions={{
          sound: (operation, expectedJs) => {
            if (session.port.read().js !== expectedJs) throw new Error('This graphic changed while the sound was loading. Choose it again.');
            pause(); images.execute([operation]);
          },
          importFiles: files => images.files(files, 'assets'),
          move: (from, to) => { const result = images.execute([{ kind: 'asset.move', from, to }]); return result.template.assets[template.assets.findIndex(a => a.path === from)]?.path ?? from; },
          remove: path => { images.execute([{ kind: 'asset.delete', path }]); },
          placeReason: groupScope ? 'Add artwork in Composition, then group it.' : undefined,
          place: asset => { pause(); void images.place(asset); },
          replace: selection.length === 1 && imageCapability(template, selection[0]).supported ? asset => {
            pause(); void images.replace(asset, { selector: selection[0], appearance: appearance[selection[0]] });
          } : undefined,
        }} />
        {images.error && <p role="alert">{images.error}</p>}
        <span className="ef-section-label">Operator fields · {template.fields.length}</span>
        {template.fields.map(field => <p className="ef-field" key={field.field}>{field.title || field.field}<code>{field.field}</code></p>)}
        <p className="ef-muted">Assets and operator fields for this graphic. Select artwork in Layers below the canvas.</p>
      </aside>
      <Canvas key={session.documentId} template={template} sampleData={sampleData} session={session} time={time} selection={selection} select={select} linked={linked} groupScope={groupScope} enterGroup={navigateGroup} setSelection={setSelection} onAppearance={setAppearance} onDrawingSpace={setDrawingSpace} rootSelector={view.parts.find(p => p.kind === 'root')?.selector} connectPreview={connectPreview} togglePlayback={togglePlayback} pause={pause} openAssets={openAssets} pathEditing={pathEditing} onPathEditing={setPathEditing} />
      <Inspector time={time} pause={pause} view={view} template={template} selection={selection} select={select} session={session} linked={linked} setLinked={setLinked} appearance={appearance[selection[0]]} previewCss={previewCss} previewTemplate={previewTemplate} openAssets={openAssets} editPoints={setPathEditing} />
    </div>
    <Timeline key={groupScope ?? "composition"} groupScope={groupScope} enterGroup={navigateGroup} hierarchy={hierarchy} view={view} fps={template.fps} time={time} selection={selection} seek={next => { pause(); preview.current?.stopExit(); seek(next, next >= view.out && session.port.view().cue === view.segments.length - 1 ? session.port.view().cue : undefined); }} select={select} playing={playing} togglePlayback={togglePlayback} session={session} pause={pause} inspectOut={inspectOut} playOut={playOut} parkOut={parkOut} inspectStep={inspectStep}
      canUndo={session.canUndo()} canRedo={session.canRedo()} undo={() => history(false)} redo={() => history(true)} />
    <footer className="ef-status"><span>Artwork editing · Alpha</span><span>Stopwatch: animate · Diamond: key at playhead</span></footer>
  </main>;
}
