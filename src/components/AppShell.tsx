import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import PreviewFrame from './PreviewFrame';
import PlayoutSimulator from './timeline/PlayoutSimulator';
import TimelineDock from './timeline/StepTimeline';
import SidePanel from './SidePanel';
import Inspector from './timeline/Inspector';
import SampleDataPanel from './SampleDataPanel';
import ControlPanel from './ControlPanel';
import StylePanel from './StylePanel';
import AssetsPanel from './AssetsPanel';
import AIPromptPanel from './AIPromptPanel';
import ExportPanel from './ExportPanel';
import WorkspaceDock from './WorkspaceDock';
import CommunityGallery from './CommunityGallery';
import ModerationQueue from './ModerationQueue';
import BrandLogo from './BrandLogo';
import NewGraphicButton from './NewGraphicButton';
import SaveControls from './save/SaveControls';
import { BetaFeedbackButton } from './feedback/BetaFeedback';
import InsertTemplateDialog from './InsertTemplateDialog';
import { useRouter } from '../app/router';
import AuthStatus from './auth/AuthStatus';
import SignInDialog from './auth/SignInDialog';
import { useAuthState } from './auth/useAuthState';
import { useAuthUi } from './auth/authUi';
import SyncStatus from './SyncStatus';
import { isBackendConfigured } from '../backend/config';
import { useIsModerator } from '../community/useIsModerator';
import { SystemNoticeBar } from './SystemNoticeBar';
import { useIsMobile } from './useIsMobile';
import { useSplitter, type Splitter } from './useSplitter';
import { modalOpen } from './spaceKey';
import {
  ALL_PANELS,
  clampRatio,
  loadLayout,
  saveLayout,
  type DockId,
  type PanelId,
  type WorkspaceLayout,
} from '../model/layout';

// Monaco (bundled inside CodeEditor via monacoSetup) is by far the heaviest chunk in the app,
// and the code VIEW is optional — many users never open it. Loading it lazily keeps the shell,
// preview, and wizard off the Monaco download: the editor pane streams in beside them, and the
// mobile layout never fetches it until "Show code".
const CodeEditorLazy = lazy(() => import('./CodeEditor'));
function CodeEditor() {
  return (
    <Suspense fallback={<div className="code-editor-loading">Loading the code editor…</div>}>
      <CodeEditorLazy />
    </Suspense>
  );
}

/** A drag handle between two regions (vertical between columns, horizontal between rows). */
function Divider({ orient, splitter, testid }: { orient: 'v' | 'h'; splitter: Splitter; testid: string }) {
  return (
    <div
      className={`${orient === 'v' ? 'workspace-divider' : 'workspace-divider-h'}${splitter.dragging ? ' dragging' : ''}`}
      data-testid={testid}
      role="separator"
      aria-orientation={orient === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={splitter.onPointerDown}
      onPointerMove={splitter.onPointerMove}
      onPointerUp={splitter.onPointerUp}
    />
  );
}

/**
 * The workspace: on desktop, two switchable arrangements — code editor on the left beside the
 * preview-over-panels column, or a full-width preview on top with code + panels below — with a
 * collapsible code pane and drag dividers between regions. On a phone it reflows to one column.
 * The iframe ref is shared so the simulator can call play()/stop()/update() on the live preview.
 */
export default function AppShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const template = useTemplateStore((s) => s.template);
  const undo = useTemplateStore((s) => s.undo);
  const redo = useTemplateStore((s) => s.redo);
  const resetToBaseline = useTemplateStore((s) => s.resetToBaseline);
  const navigate = useRouter((s) => s.navigate);
  // The topbar Reset control uses a two-step inline confirm (arm, then confirm).
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Community gallery (Era 5.5) — only offered when a backend is configured (offline shows nothing).
  // Browsing needs an account (the RPCs are authenticated-only), so signed-out visitors get the
  // sign-in dialog instead of an empty gallery. A `?template=<slug>` share link auto-opens the
  // gallery focused on that item once signed in.
  const backendConfigured = isBackendConfigured();
  const { signedIn, needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const initialTemplateSlug = useMemo(
    () => (backendConfigured ? new URLSearchParams(window.location.search).get('template') : null),
    [backendConfigured],
  );
  const [communityOpen, setCommunityOpen] = useState(false);
  const openCommunity = () => {
    if (needsSignIn) openSignIn('Sign in to browse the community gallery.');
    else setCommunityOpen(true);
  };
  // Share-link deep link: open the gallery as soon as we know the visitor's auth state — signed
  // in opens it directly; signed out asks for sign-in first, then opens it (once).
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!initialTemplateSlug || deepLinkDone.current) return;
    if (signedIn && backendConfigured) {
      deepLinkDone.current = true;
      setCommunityOpen(true);
    } else if (needsSignIn) {
      openSignIn('Sign in to view this shared template.');
    }
  }, [initialTemplateSlug, signedIn, needsSignIn, backendConfigured, openSignIn]);

  // Moderator takedown queue — the button appears only for users in the moderators table.
  const isModerator = useIsModerator();
  const [moderationOpen, setModerationOpen] = useState(false);

  // On a phone the app reflows to a single column (preview + panels first); the code editor is
  // collapsed and mounted on demand (Monaco is heavy and secondary on mobile).
  const isMobile = useIsMobile();
  const [codeOpen, setCodeOpen] = useState(false);

  // Desktop layout (the mobile branch ignores this): a flexible dockable-panel model — the
  // canvas over a roomy timeline in the centre, flanked by left/right docks with a bottom dock
  // below, each hosting any panels as tabs. Persisted in localStorage (model/layout.ts).
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mainRowRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<WorkspaceLayout>(loadLayout);
  // Persist whatever the update produces (one localStorage write per change).
  const setLayoutSaved = (fn: (l: WorkspaceLayout) => WorkspaceLayout) =>
    setLayout((l) => {
      const next = fn(l);
      if (next !== l) saveLayout(next);
      return next;
    });

  const DOCKS: DockId[] = ['left', 'right', 'bottom'];
  const dockOf = (id: PanelId): DockId | null => DOCKS.find((d) => layout.docks[d].panels.includes(id)) ?? null;
  const hiddenPanels = ALL_PANELS.filter((id) => !dockOf(id));

  const activatePanel = (dock: DockId, id: PanelId) =>
    setLayoutSaved((l) =>
      l.docks[dock].active === id ? l : { ...l, docks: { ...l.docks, [dock]: { ...l.docks[dock], active: id } } },
    );

  const closePanel = (id: PanelId) =>
    setLayoutSaved((l) => {
      const dock = DOCKS.find((d) => l.docks[d].panels.includes(id));
      if (!dock) return l;
      const panels = l.docks[dock].panels.filter((p) => p !== id);
      const active = l.docks[dock].active === id ? panels[0] ?? null : l.docks[dock].active;
      return { ...l, docks: { ...l.docks, [dock]: { ...l.docks[dock], panels, active } } };
    });

  // Add/move a panel: detach it from any current dock, then append it to the target as active.
  const placePanel = (dock: DockId, id: PanelId) =>
    setLayoutSaved((l) => {
      const docks = { ...l.docks };
      for (const d of DOCKS) {
        if (!docks[d].panels.includes(id)) continue;
        const panels = docks[d].panels.filter((p) => p !== id);
        docks[d] = { ...docks[d], panels, active: docks[d].active === id ? panels[0] ?? null : docks[d].active };
      }
      docks[dock] = { ...docks[dock], panels: [...docks[dock].panels, id], active: id };
      return { ...l, docks };
    });

  /** Make a panel visible and active — activate it where it lives, else drop it in a home dock. */
  const revealPanel = (id: PanelId) => {
    const dock = dockOf(id);
    if (dock) activatePanel(dock, id);
    else placePanel(id === 'code' ? 'left' : 'right', id);
  };

  // Selecting an element ANYWHERE (canvas click, timeline row label, diamond click) is a request
  // to inspect it — a NEW selection reveals the Inspector (activates its tab, or re-docks it if
  // it was closed). Deselecting never changes the layout. The reveal is DEFERRED past the
  // double-click window and stands down for live gestures: activating a tab can resize the
  // workspace, and doing that mid-interaction moves the canvas under the pointer — most visibly
  // on a text double-click. So it waits half a second, any new pointer press cancels it, and a
  // live gesture at fire time skips it. Keyed on the WHOLE selection: shift-adding a layer is as
  // much a request to inspect as a fresh click.
  const selectedParts = useTemplateStore((s) => s.selectedParts);
  const selectionKey = selectedParts.join('\n');
  const prevSelectedRef = useRef<string>('');
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectionKey;
    if (isMobile || selectionKey === '' || selectionKey === prev) return;
    const cancel = () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', cancel, true);
    };
    const timer = setTimeout(() => {
      cancel();
      if (useTemplateStore.getState().canvasGestureActive) return;
      revealPanel('inspector');
    }, 500); // the OS double-click window — a quiet half-second means the gesture is over
    window.addEventListener('pointerdown', cancel, true);
    return cancel;
    // revealPanel closes over `layout`; re-reading it each selection is intended.
  }, [selectionKey, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag dividers. Each resizes one region and persists on release. Left/right dock sizes are
  // fractions of the main row; the timeline is a fraction of the centre column; the bottom dock
  // is a fraction of the whole workspace — all measured from the edge the dock sits on.
  const leftWidth = useSplitter(
    'x', mainRowRef,
    (r) => setLayout((l) => ({ ...l, docks: { ...l.docks, left: { ...l.docks.left, size: clampRatio(r) } } })),
    (r) => setLayoutSaved((l) => ({ ...l, docks: { ...l.docks, left: { ...l.docks.left, size: clampRatio(r) } } })),
  );
  const rightWidth = useSplitter(
    'x', mainRowRef,
    (r) => setLayout((l) => ({ ...l, docks: { ...l.docks, right: { ...l.docks.right, size: clampRatio(1 - r) } } })),
    (r) => setLayoutSaved((l) => ({ ...l, docks: { ...l.docks, right: { ...l.docks.right, size: clampRatio(1 - r) } } })),
  );
  const timelineHeight = useSplitter(
    'y', centerRef,
    (r) => setLayout((l) => ({ ...l, timelineSize: clampRatio(1 - r, 0.15, 0.75) })),
    (r) => setLayoutSaved((l) => ({ ...l, timelineSize: clampRatio(1 - r, 0.15, 0.75) })),
  );
  const bottomHeight = useSplitter(
    'y', workspaceRef,
    (r) => setLayout((l) => ({ ...l, docks: { ...l.docks, bottom: { ...l.docks.bottom, size: clampRatio(1 - r) } } })),
    (r) => setLayoutSaved((l) => ({ ...l, docks: { ...l.docks, bottom: { ...l.docks.bottom, size: clampRatio(1 - r) } } })),
  );

  // Global undo/redo for panel / timeline / AI actions: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (and
  // Ctrl+Y, the Windows convention). Skips Monaco and form fields so they keep their own
  // native text undo.
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
      // A dialog's Ctrl+Z belongs to the dialog, never to the document behind it.
      if (modalOpen()) return;
      e.preventDefault();
      if (isY || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // The centre column, split into the stage (with its transport) over the timeline. Mobile
  // keeps the single fused block; only one of these renders at a time, so the shared iframeRef
  // is always attached to exactly one instance.
  const stageBlock = (
    <div className="stage-block">
      <PreviewFrame iframeRef={iframeRef} />
      <PlayoutSimulator iframeRef={iframeRef} />
    </div>
  );
  const timelineBlock = <TimelineDock iframeRef={iframeRef} />;
  // Mobile: the classic fused preview column.
  const preview = (
    <div className="preview-wrap">
      <PreviewFrame iframeRef={iframeRef} />
      <TimelineDock iframeRef={iframeRef} />
      <PlayoutSimulator iframeRef={iframeRef} />
    </div>
  );

  // The dockable panel bodies, by id (the desktop docks render these; mobile keeps SidePanel).
  const renderPanel = (id: PanelId) => {
    // Code fills with Monaco; the Inspector scrolls itself; the tool panels want the shared
    // padded, scrolling body SidePanel used to give them.
    switch (id) {
      case 'code': return <CodeEditor />;
      case 'inspector': return <Inspector />;
      case 'data': return <div className="panel-body"><SampleDataPanel /></div>;
      case 'control': return <div className="panel-body"><ControlPanel /></div>;
      case 'style': return <div className="panel-body"><StylePanel /></div>;
      case 'assets': return <div className="panel-body"><AssetsPanel /></div>;
      case 'ai': return <div className="panel-body"><AIPromptPanel /></div>;
      case 'export': return <div className="panel-body"><ExportPanel /></div>;
    }
  };
  const dockNode = (dock: DockId) =>
    layout.docks[dock].panels.length > 0 ? (
      <WorkspaceDock
        dockId={dock}
        state={layout.docks[dock]}
        hidden={hiddenPanels}
        render={renderPanel}
        onActivate={(id) => activatePanel(dock, id)}
        onClose={closePanel}
        onMove={(id, to) => placePanel(to, id)}
        onAdd={(id) => placePanel(dock, id)}
      />
    ) : null;

  // The tool panels (data/control/style/ai/export) drive a "reveal me" signal via the store's
  // activePanel (e.g. the wizard shows Export after an image import). Honour it in the docks —
  // but not on mount, where activePanel is just its default and would override the layout's
  // own active tab.
  const activePanelSignal = useTemplateStore((s) => s.activePanel);
  const panelRevealNonce = useTemplateStore((s) => s.panelRevealNonce);
  const prevPanelSignal = useRef(panelRevealNonce);
  useEffect(() => {
    // Only a genuine setActivePanel CALL is a reveal request (the nonce bumps on every call,
    // even one re-requesting the stored panel — e.g. the wizard revealing the default Data
    // tab) — never mount, a StrictMode remount, or an unrelated re-render (which would
    // clobber the layout's own active tab).
    if (prevPanelSignal.current === panelRevealNonce) return;
    prevPanelSignal.current = panelRevealNonce;
    if (!isMobile) revealPanel(activePanelSignal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelRevealNonce, isMobile]);

  return (
    <div className="app">
      <SystemNoticeBar />
      <header className="topbar">
        {/* THE LOGO IS THE SITE ROOT, not a second Home door — `.home-btn` further along this
            bar is Home. Until this was a link there was no way back to the public landing page
            from inside the studio at all short of retyping the URL. A real <a> so it behaves
            like a logo everywhere: middle-click and ⌘-click open it in a new tab. */}
        <a className="brand brand-home" href="/" title="NoaCG Studio — the front page">
          <BrandLogo size={24} />
        </a>
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name">{template.name}</span>
        <span className="topbar-meta mono muted">
          {template.resolution.width}×{template.resolution.height} · {template.fps}&thinsp;fps
        </span>
        <SaveControls />
        {/* THE NAVIGATION PAIR, straight after the identity lockup and always on the LEFT
            (owner walk, 2026-08-29): logo · what you are working on · its save state, then Home,
            then ＋ New graphic. It used to ride at the end of the right-hand tool cluster, so the
            door a reader reaches for most often sat in a different place on every surface. The
            wizard's header has had this order since 2026-08-28; every shell now matches it, and
            the lockup stays contiguous the way the wizard's `.wz-title` does. */}
        <button
          className="home-btn"
          onClick={() => navigate({ view: 'home', section: null })}
          data-testid="open-home"
          title="Home — your graphics, productions, control panels, and videos"
        >
          Home
        </button>
        <NewGraphicButton />
        <div className="spacer" />
        {!isMobile && (
          <button
            className={dockOf('code') ? 'active' : ''}
            onClick={() => (dockOf('code') ? closePanel('code') : placePanel('left', 'code'))}
            data-testid="toggle-code"
            title={dockOf('code') ? 'Hide the code editor' : 'Show the code editor'}
          >
            {dockOf('code') ? '▾ Hide code' : '▸ Show code'}
          </button>
        )}
        {!isMobile && (
          <button
            className={dockOf('inspector') ? 'active' : ''}
            onClick={() => (dockOf('inspector') ? closePanel('inspector') : revealPanel('inspector'))}
            data-testid="toggle-inspector"
            title={dockOf('inspector') ? 'Hide the Inspector' : 'Show the Inspector (the selected element’s properties)'}
          >
            ◨ Inspector
          </button>
        )}
        {backendConfigured && (
          <button onClick={openCommunity} title="Browse and reuse templates shared by other users">
            🌐 Community
          </button>
        )}
        {isModerator && (
          <button onClick={() => setModerationOpen(true)} title="Review and remove published community templates">
            🛡 Moderate
          </button>
        )}
        <button
          className={resetArmed ? 'reset-btn reset-armed' : 'reset-btn'}
          onClick={() => {
            if (resetArmed) {
              if (resetTimer.current) clearTimeout(resetTimer.current);
              setResetArmed(false);
              resetToBaseline();
            } else {
              // Two-step confirm — a whole-project reset deserves a beat, and it stays
              // undoable (Ctrl+Z). Auto-disarms if the second click doesn't come.
              setResetArmed(true);
              if (resetTimer.current) clearTimeout(resetTimer.current);
              resetTimer.current = setTimeout(() => setResetArmed(false), 3500);
            }
          }}
          onBlur={() => {
            if (resetTimer.current) clearTimeout(resetTimer.current);
            setResetArmed(false);
          }}
          data-testid="reset-project"
          title={resetArmed ? 'Click again to restore the original — undoable' : 'Restore this graphic to how it was first created — undoable'}
        >
          <span>{resetArmed ? '↺ Confirm reset?' : '↺ Reset'}</span>
        </button>
        {/* The general beta door. Deliberately the quietest control on the bar - visible from
            wherever somebody is standing when they get annoyed, and never asking for attention.
            Renders nothing offline: there is no inbox to send to. */}
        <BetaFeedbackButton area="editor" />
        {/* Both render nothing offline; cloud status + account appear in hosted mode. */}
        <SyncStatus />
        <AuthStatus />
      </header>

      {isMobile ? (
        <div className="workspace workspace-mobile">
          {preview}
          <SidePanel />
          <div className="mobile-code">
            <button className="mobile-code-toggle" onClick={() => setCodeOpen((o) => !o)}>
              {codeOpen ? '▾ Hide code' : '▸ Show code'}
            </button>
            {codeOpen && <CodeEditor />}
          </div>
        </div>
      ) : (
        // Desktop: the canvas over the timeline in the centre, flanked by the left/right docks,
        // with the bottom dock below. Each dock renders only when it holds panels; the splitters
        // resize the adjacent region. This gives the timeline the whole centre width.
        (() => {
          const leftNode = dockNode('left');
          const rightNode = dockNode('right');
          const bottomNode = dockNode('bottom');
          const L = leftNode ? layout.docks.left.size : 0;
          const R = rightNode ? layout.docks.right.size : 0;
          const C = Math.max(0.2, 1 - L - R);
          const cols = [
            leftNode ? `${L}fr` : null,
            leftNode ? '6px' : null,
            `${C}fr`,
            rightNode ? '6px' : null,
            rightNode ? `${R}fr` : null,
          ]
            .filter(Boolean)
            .join(' ');
          const B = bottomNode ? layout.docks.bottom.size : 0;
          return (
            <div
              className="workspace workspace-dock"
              ref={workspaceRef}
              style={{ gridTemplateRows: bottomNode ? `${1 - B}fr 6px ${B}fr` : '1fr' }}
            >
              <div className="workspace-main" ref={mainRowRef} style={{ gridTemplateColumns: cols }}>
                {leftNode && (
                  <>
                    <section className="dock-slot dock-slot-left" data-testid="dock-slot-left">{leftNode}</section>
                    <Divider orient="v" splitter={leftWidth} testid="left-divider" />
                  </>
                )}
                <div
                  className="workspace-center"
                  ref={centerRef}
                  style={{ gridTemplateRows: `${1 - layout.timelineSize}fr 6px ${layout.timelineSize}fr` }}
                >
                  <div className="center-stage" data-testid="center-stage">{stageBlock}</div>
                  <Divider orient="h" splitter={timelineHeight} testid="timeline-divider" />
                  <div className="center-timeline" data-testid="center-timeline">{timelineBlock}</div>
                </div>
                {rightNode && (
                  <>
                    <Divider orient="v" splitter={rightWidth} testid="right-divider" />
                    <section className="dock-slot dock-slot-right" data-testid="dock-slot-right">{rightNode}</section>
                  </>
                )}
              </div>
              {bottomNode && (
                <>
                  <Divider orient="h" splitter={bottomHeight} testid="bottom-divider" />
                  <section className="dock-slot dock-slot-bottom" data-testid="dock-slot-bottom">{bottomNode}</section>
                </>
              )}
            </div>
          );
        })()
      )}

      {/* Creation wizard overlay — shown on startup and via "New graphic". The save dialogs
          (first-save naming + the unsaved-changes guard) mount once in App.tsx, over every
          surface including the wizard. */}
      <InsertTemplateDialog />

      {/* Community gallery overlay — browse + import shared templates (hosted mode only). */}
      {communityOpen && (
        <CommunityGallery onClose={() => setCommunityOpen(false)} initialSlug={initialTemplateSlug} />
      )}

      {/* Moderator takedown queue overlay — only reachable when the button is shown (a moderator). */}
      {moderationOpen && <ModerationQueue onClose={() => setModerationOpen(false)} />}

      {/* On-demand sign-in dialog — opened by the topbar button or any account-gated feature. */}
      <SignInDialog />
    </div>
  );
}
