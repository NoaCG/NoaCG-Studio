// The video editor shell - the workspace for the "Video or animation with AI" project
// kind. Deliberately simpler than AppShell: TSX code on the left (collapsible), the player
// stage + a tabbed panel column (Chat / Settings / Assets / Export) on the right. Mounted
// by App.tsx when docKind === 'video'; the wizard (galleryOpen lives in templateStore as
// the app-wide flag) opens on top of either shell.

import { lazy, Suspense, useEffect, useState } from 'react';
import { useVideoProjectStore, type VideoPanelTab } from '../../store/videoProjectStore';
import BrandLogo from '../BrandLogo';
import NewGraphicButton from '../NewGraphicButton';
import AuthStatus from '../auth/AuthStatus';
import SignInDialog from '../auth/SignInDialog';
import SyncStatus from '../SyncStatus';
import { useIsMobile } from '../useIsMobile';
import { useSplitter, type Splitter } from '../useSplitter';
import { clampRatio } from '../../model/layout';
import { loadVideoLayout, saveVideoLayout, type VideoLayout } from '../../model/videoLayout';
import { useRef } from 'react';
import VideoPlayerFrame from './VideoPlayerFrame';
import VideoAiChatPanel from './VideoAiChatPanel';
import VideoContentPanel from './VideoContentPanel';
import VideoSettingsPanel from './VideoSettingsPanel';
import VideoAssetsPanel from './VideoAssetsPanel';
import VideoExportPanel from './VideoExportPanel';
import SavedVideoProjects from './SavedVideoProjects';
import { modalOpen } from '../spaceKey';
import { upsertSavedVideoProject } from '../../model/videoProject';
import { commitDurableWrites } from '../../model/durableStore';
import { useRouter } from '../../app/router';
import { useDocKindStore } from '../../store/docKindStore';

const VideoCodeEditorLazy = lazy(() => import('./VideoCodeEditor'));
function VideoCodeEditor() {
  return (
    <Suspense fallback={<div className="code-editor-loading">Loading the code editor…</div>}>
      <VideoCodeEditorLazy />
    </Suspense>
  );
}

function Divider({ splitter, testid }: { splitter: Splitter; testid: string }) {
  return (
    <div
      className={`workspace-divider${splitter.dragging ? ' dragging' : ''}`}
      data-testid={testid}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={splitter.onPointerDown}
      onPointerMove={splitter.onPointerMove}
      onPointerUp={splitter.onPointerUp}
    />
  );
}

const PANEL_TABS: { id: VideoPanelTab; label: string }[] = [
  { id: 'chat', label: '✦ Chat' },
  { id: 'content', label: 'Content' },
  { id: 'settings', label: 'Settings' },
  { id: 'assets', label: 'Assets' },
  { id: 'export', label: 'Export' },
];

export default function VideoAppShell() {
  const project = useVideoProjectStore((s) => s.project);
  const activePanel = useVideoProjectStore((s) => s.activePanel);
  const setActivePanel = useVideoProjectStore((s) => s.setActivePanel);
  const autosaveFailed = useVideoProjectStore((s) => s.autosaveFailed);
  const undo = useVideoProjectStore((s) => s.undo);
  const redo = useVideoProjectStore((s) => s.redo);

  const isMobile = useIsMobile();
  const [layout, setLayout] = useState<VideoLayout>(loadVideoLayout);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [mobileCodeOpen, setMobileCodeOpen] = useState(false);

  const toggleCode = () =>
    setLayout((l) => {
      const codeCollapsed = !l.codeCollapsed;
      saveVideoLayout({ codeCollapsed });
      return { ...l, codeCollapsed };
    });

  const codeWidth = useSplitter(
    'x',
    workspaceRef,
    (r) => setLayout((l) => ({ ...l, codeRatio: clampRatio(r, 0.2, 0.7) })),
    (r) => saveVideoLayout({ codeRatio: clampRatio(r, 0.2, 0.7) }),
  );

  // Global undo/redo for AI/panel applies - same bindings and Monaco/form-field guard as
  // AppShell (only one shell is mounted at a time, so no double handling).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isZ = e.key === 'z' || e.key === 'Z';
      const isY = e.key === 'y' || e.key === 'Y';
      if ((!isZ && !isY) || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      const inEditable =
        !!el?.closest?.('.monaco-editor') ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        !!el?.isContentEditable;
      if (inEditable) return;
      // A dialog's Ctrl+Z belongs to the dialog, never to the project behind it — the same
      // rule the SPX shell follows, and this shell mounts modals too (My videos, sign-in).
      if (modalOpen()) return;
      e.preventDefault();
      if (isY || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Confirmed before it says so: the durable store accepts a write and reports a refusal a
  // moment later (model/durableStore.ts), so the boolean alone would flash "✓ Saved" for a save
  // that did not land - the same twin fix as SavedVideoProjects' own Save.
  const saveToList = () => {
    const accepted = upsertSavedVideoProject(project);
    void (accepted ? commitDurableWrites() : Promise.resolve('refused')).then((failure) => {
      setSaveNote(failure ? '✗ Storage full' : '✓ Saved');
      setTimeout(() => setSaveNote(null), 2500);
    });
  };

  const panel = (
    <section className="pane video-panel-pane" data-testid="video-panel-pane">
      <div className="pane-header">
        <div className="tabs">
          {PANEL_TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${activePanel === t.id ? 'active' : ''}`}
              onClick={() => setActivePanel(t.id)}
              data-testid={`video-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="video-panel-body">
        {activePanel === 'chat' && <VideoAiChatPanel />}
        {activePanel === 'content' && <VideoContentPanel />}
        {activePanel === 'settings' && <VideoSettingsPanel />}
        {activePanel === 'assets' && <VideoAssetsPanel />}
        {activePanel === 'export' && <VideoExportPanel />}
      </div>
    </section>
  );

  return (
    <div className="app" data-testid="video-shell">
      <header className="topbar">
        {/* The site root, exactly as on the SPX shell's topbar - the two editor shells cannot
            disagree about what their logo means. `.home-btn` further along this bar is Home. */}
        <a className="brand brand-home" href="/" title="NoaCG Studio — the front page">
          <BrandLogo size={24} />
        </a>
        <span className="video-workspace-badge" title="The Video workspace makes standalone videos — separate from live broadcast graphics">
          🎬 Video <span className="wz-beta-tag">Beta</span>
        </span>
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name">{project.name}</span>
        <span className="topbar-meta mono muted">
          {project.width}×{project.height} · {project.fps}&thinsp;fps ·{' '}
          {(project.durationInFrames / project.fps).toFixed(1)}&thinsp;s
        </span>
        {autosaveFailed && (
          <span
            className="status-bad"
            style={{ fontSize: 11, marginLeft: 10 }}
            data-testid="video-autosave-failed"
            title="Browser storage is full - remove large assets or save space, or your latest changes won't survive a reload"
          >
            ⚠ autosave failing
          </span>
        )}
        {/* The navigation pair, on the LEFT after the identity lockup, exactly as on the SPX
            shell (owner walk, 2026-08-29): logo · what you are working on · its save state,
            then Home, then ＋ New graphic. The two editor shells cannot disagree about where the
            door is any more than about what the logo means. */}
        <button
          className="home-btn"
          onClick={() => useRouter.getState().navigate({ view: 'home', section: null })}
          data-testid="open-home"
          title="Home — your graphics, productions, control panels, and videos"
        >
          Home
        </button>
        <NewGraphicButton />
        <div className="spacer" />
        {!isMobile && (
          <button
            className={layout.codeCollapsed ? '' : 'active'}
            onClick={toggleCode}
            data-testid="video-toggle-code"
            title={layout.codeCollapsed ? 'Show the code editor' : 'Collapse the code editor'}
          >
            {layout.codeCollapsed ? '▸ Show code' : '▾ Hide code'}
          </button>
        )}
        <button onClick={saveToList} title="Keep this project in My videos" data-testid="video-save">
          💾 Save{saveNote ? ` ${saveNote}` : ''}
        </button>
        <button onClick={() => setSavedOpen(true)} title="Your saved video projects" data-testid="video-my-videos">
          📁 My videos
        </button>
        <button
          onClick={() => {
            useDocKindStore.getState().setKind('spx');
            useRouter.getState().navigate({ view: 'editor' });
          }}
          data-testid="back-to-graphics"
          title="Back to the broadcast-graphics editor"
        >
          ◫ Graphics
        </button>
        <SyncStatus />
        <AuthStatus />
      </header>

      {isMobile ? (
        <div className="workspace workspace-mobile">
          <VideoPlayerFrame />
          {panel}
          <div className="mobile-code">
            <button className="mobile-code-toggle" onClick={() => setMobileCodeOpen((o) => !o)}>
              {mobileCodeOpen ? '▾ Hide code' : '▸ Show code'}
            </button>
            {mobileCodeOpen && (
              <section className="pane" style={{ height: 380 }}>
                <VideoCodeEditor />
              </section>
            )}
          </div>
        </div>
      ) : (
        <div
          className="workspace video-workspace"
          ref={workspaceRef}
          style={{
            gridTemplateColumns: layout.codeCollapsed
              ? '1fr'
              : `${layout.codeRatio}fr 6px ${1 - layout.codeRatio}fr`,
          }}
        >
          {!layout.codeCollapsed && (
            <>
              <section className="pane" data-testid="video-code-pane">
                <VideoCodeEditor />
              </section>
              <Divider splitter={codeWidth} testid="video-workspace-divider" />
            </>
          )}
          <div className="video-right">
            <VideoPlayerFrame />
            {panel}
          </div>
        </div>
      )}

      {/* Creation wizard overlay - the app-wide new-project flow (both shells mount it). */}

      {savedOpen && <SavedVideoProjects onClose={() => setSavedOpen(false)} />}

      {/* On-demand sign-in dialog - opened by account-gated features (AI chat, sync). */}
      <SignInDialog />
    </div>
  );
}
