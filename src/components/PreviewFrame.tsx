import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { composeDocument } from '../preview/composeDocument';
import { PREVIEW_CMD_ERROR_TYPE } from '../preview/previewProtocol';
import { useTemplateStore } from '../store/templateStore';
import { designBoxInfo } from '../blocks/designLayout';
import { computePad } from './canvas/pasteboard';
import { cancelCanvasSpaceTap, noteCanvasSpaceDown, spacePansCanvas, takeCanvasSpaceTap } from './spaceKey';
import CanvasGuides from './canvas/CanvasGuides';
import CanvasInteraction from './canvas/CanvasInteraction';
import ProjectFormatMeta from './ProjectFormatMeta';

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

/**
 * How long a code change settles before the preview rebuilds. 350 ms is the AUTHORING value and
 * the only one a user ever sees: it is what stops a rebuild per keystroke in the code editor.
 *
 * The offline E2E suite overrides it (`VITE_PREVIEW_DEBOUNCE_MS` in playwright.config.ts's
 * `webServer.env`), because 350 ms is paid on every rebuild in a 591-test suite and adds up to
 * minutes of wall clock. That is safe to shorten precisely because no spec sleeps for it - they
 * wait on the `data-doc-rev` stamp below, which lands when the rebuild has actually LOADED. So
 * the override changes how long a spec waits, never what it observes.
 *
 * An empty value is not zero: the suite pins several env vars to '' deliberately, and
 * `Number('')` is 0, which would mean "rebuild on every keystroke" rather than "use the default".
 */
const RELOAD_DEBOUNCE_MS = ((): number => {
  const raw = import.meta.env.VITE_PREVIEW_DEBOUNCE_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 350;
})();
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;

/**
 * Live preview: renders the composed template in a sandboxed iframe scaled to fit the stage,
 * with a zoomable/pannable viewport on top of the fit scale (for precision work and to reach
 * elements that animate in from off-canvas). Reloads (debounced) when the code changes, and
 * reports runtime errors back to the store.
 *
 * Panning is the familiar set: hold Space and drag, drag with the middle mouse button, or
 * (zoomed in) scroll/trackpad-swipe. All of them move the VIEW only — they are handled here,
 * above the gesture overlay, so no document element can move under a pan.
 *
 * Coordinate note: the iframe + overlays live in a `.canvas-world` that is centred in the
 * stage and translated by `pan`; the effective scale passed to the overlays is fit × zoom.
 * CanvasInteraction derives its own scale from that width and reads the overlay's live
 * bounding rect, so pan and zoom need no changes there — the overlay math already follows.
 *
 * The template rendered here can be AI-generated or imported code, so this iframe carries no
 * `allow-same-origin` — CanvasInteraction and PlayoutSimulator (this file's two direct
 * children, both taking `iframeRef`) never reach into it via `contentWindow`/`contentDocument`.
 * `composeDocument`'s `simulate` and `canvasControl` options install the postMessage channels
 * those two components drive instead (preview/simulatorRuntime.ts, preview/
 * canvasControlProtocol.ts).
 */
export default function PreviewFrame({ iframeRef }: Props) {
  const template = useTemplateStore((s) => s.template);
  const previewBg = useTemplateStore((s) => s.previewBg);
  const previewError = useTemplateStore((s) => s.previewError);
  const setPreviewBg = useTemplateStore((s) => s.setPreviewBg);
  const setPreviewError = useTemplateStore((s) => s.setPreviewError);
  const guides = useTemplateStore((s) => s.guides);
  const setGuide = useTemplateStore((s) => s.setGuide);
  const canvasTool = useTemplateStore((s) => s.canvasTool);
  const setCanvasTool = useTemplateStore((s) => s.setCanvasTool);
  const setActiveSurface = useTemplateStore((s) => s.setActiveSurface);
  const setPointerOverStage = useTemplateStore((s) => s.setPointerOverStage);
  const sendControl = useTemplateStore((s) => s.sendControl);

  // The TEXT TOOLS exist where placed fields do: the placed-design shape (an artwork box),
  // code-derived like every gate. Catalog templates keep their Data-tab add untouched.
  const placedDesign = useMemo(
    () => designBoxInfo(template.html, template.css) !== null,
    [template.html, template.css],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Live refs for the native wheel handler (attached once, non-passive).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const { width: stageW, height: stageH } = template.resolution;
  const effScale = fit * zoom;

  // The pasteboard: an always-on working margin so off-canvas content is visible and editable.
  // The iframe VIEWPORT, the gesture overlay, and the guides all grow to this padded document
  // together, so the coordinate origin moves with them (see CanvasInteraction). Pad is a pure
  // view concept — it never enters the template or any persisted coordinate.
  // Derived from the graphic's own authored motion, so a template that never leaves the canvas
  // spends no stage width on empty pasteboard (see pasteboard.ts).
  const { padX, padY } = useMemo(() => computePad(template), [template]);
  const docW = stageW + 2 * padX;
  const docH = stageH + 2 * padY;

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Scale the padded document (canvas + pasteboard) to fit the stage pane.
  // Re-runs when the stage is resized OR when the padded document size changes.
  //
  // A NON-POSITIVE measurement is never committed. `fit` is the only thing standing between
  // the graphic and an invisible canvas, and the stage can legitimately measure 0 before it
  // has been laid out — a dock still sizing on the first paint, a stage inside a pane the
  // browser is not rendering yet. Committing that 0 scales the iframe to nothing, and since
  // the recovery path is a ResizeObserver notification that a page which is not being
  // rendered never delivers, the canvas would stay blank with no way back. So a bad
  // measurement re-asks on the next animation frame instead: rAF resumes exactly when the
  // page starts painting again, which is the moment the answer becomes meaningful.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let retry = 0;
    const fitNow = () => {
      const { width, height } = stage.getBoundingClientRect();
      const next = Math.min(width / docW, height / docH);
      if (!Number.isFinite(next) || next <= 0) {
        cancelAnimationFrame(retry);
        retry = requestAnimationFrame(fitNow);
        return;
      }
      cancelAnimationFrame(retry);
      setFit(next);
    };
    fitNow();
    const ro = new ResizeObserver(fitNow);
    ro.observe(stage);
    return () => {
      cancelAnimationFrame(retry);
      ro.disconnect();
    };
  }, [docW, docH]);

  // A new graphic (resolution change) starts framed to fit.
  useEffect(() => {
    resetView();
  }, [stageW, stageH]);

  /** Zoom toward a screen point (keeps the content under it fixed). */
  const zoomToward = (nextZoomRaw: number, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoomRaw));
    const z0 = zoomRef.current;
    if (nextZoom === z0) return;
    const p0 = panRef.current;
    // Stage-local point relative to the stage centre (the world's anchor before pan).
    const sx = clientX - rect.left - rect.width / 2;
    const sy = clientY - rect.top - rect.height / 2;
    const k = 1 - nextZoom / z0;
    setZoom(nextZoom);
    setPan({ x: p0.x + (sx - p0.x) * k, y: p0.y + (sy - p0.y) * k });
  };

  // Wheel over the stage: Ctrl/Cmd (and trackpad pinch, reported as ctrl+wheel) zooms toward
  // the cursor; a plain wheel pans WHEN zoomed in (so it never hijacks page scroll at the
  // default fit). A native non-passive listener so preventDefault actually applies.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomToward(zoomRef.current * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      } else if (zoomRef.current > 1.001) {
        e.preventDefault();
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
    // zoomToward reads live refs; stage identity is stable for the component's life.
  }, []);

  // ── PANNING: hold Space (the gesture every graphics editor shares) or drag with the middle
  //    mouse button. Both are captured BEFORE the overlay, so the canvas gesture layer never
  //    sees them and no document element can move under a pan.
  //
  //    Space pans while the CANVAS owns it — see components/spaceKey.ts, which is the one place
  //    that question is answered. The timeline asks the same function on the same keydown, so
  //    the two never both act and neither has to claim the key from the other.
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [panActive, setPanActive] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const spacePanRef = useRef(false);
  spacePanRef.current = spacePan;

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spacePansCanvas(e.target)) return;
      // Repeats re-assert the same answer rather than being ignored: preventDefault has to cover
      // EVERY keydown of the hold, or the browser scrolls and the key looks unclaimed downstream.
      e.preventDefault();
      e.stopPropagation(); // keeps it off the overlay below
      // A repeat is the OS saying the key is HELD, which is the pan gesture; the first keydown
      // is still an open question (spaceKey.ts, "a HOLD pans, a TAP plays").
      if (e.repeat) cancelCanvasSpaceTap();
      else {
        setSpacePan(true);
        noteCanvasSpaceDown();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spacePanRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setSpacePan(false);
      // Releasing mid-drag restores the previous tool (and its cursor) immediately.
      panDrag.current = null;
      setPanActive(false);
      // Nothing was held and nothing was dragged, so this was a TAP - and over the stage a tap
      // of Space means what it means over the timeline strip: play. Fired here rather than in
      // StepTimeline because the facts that decide it (the repeat, the drag) are this
      // component's, and `sendControl` is the store's, so no listener ordering is involved.
      if (takeCanvasSpaceTap()) sendControl('play');
    };
    // Leaving the window (Alt-Tab with Space held) must not strand the canvas in pan mode - nor
    // leave a tap armed to fire on a keyup that belongs to some other window.
    const onBlur = () => {
      cancelCanvasSpaceTap();
      setSpacePan(false);
      panDrag.current = null;
      setPanActive(false);
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
    // `sendControl` is a stable zustand action, so this never actually re-subscribes.
  }, [sendControl]);

  const onStagePointerDown = (e: React.PointerEvent) => {
    // Working here hands Space to the canvas; a press on the timeline strip hands it back.
    setActiveSurface('canvas');
    if (e.button === 1 || (spacePan && e.button === 0)) {
      e.preventDefault();
      e.stopPropagation();
      cancelCanvasSpaceTap(); // a drag started under the key: this gesture is a pan, not a tap
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panDrag.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y };
      setPanActive(true);
    }
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const d = panDrag.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const onStagePointerUp = () => {
    panDrag.current = null;
    setPanActive(false);
  };

  // A COMMAND that threw (play, settle, scrub, an update the template could not take). Kept apart
  // from `previewError` on purpose: that one is a LOAD-time fault, feeds the export gate through
  // ExportPanel's `runtimeError`, and clears only on a rebuild. A failed press is neither of
  // those - it must be visible, it must not refuse anybody their download, and it must go the
  // moment a press works. The document sends `message: null` for exactly that.
  const [cmdError, setCmdError] = useState<string | null>(null);

  // Listen for runtime errors posted from the preview document.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!ev.data) return;
      if (ev.data.type === 'spx-preview-error') setPreviewError(String(ev.data.message));
      else if (ev.data.type === PREVIEW_CMD_ERROR_TYPE) {
        setCmdError(ev.data.message == null ? null : String(ev.data.message));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setPreviewError]);

  // Monotonic document revision, stamped onto the iframe as data-doc-rev once each rebuilt
  // document has LOADED. Anything that must wait out the debounced rebuild (the e2e suite's
  // awaitPreviewRebuild helper) watches this attribute instead of sleeping.
  const docRevRef = useRef(0);

  // Rebuild the iframe document when code or resolution changes (debounced).
  useEffect(() => {
    // A rebuild is OWED from this moment — set synchronously, before the debounce even starts.
    // `data-doc-rev` alone says only that some rebuild FINISHED, which cannot tell "has not
    // started yet" apart from "already done"; a waiter that reads it at the wrong moment either
    // returns too early or waits for a rebuild nothing is going to schedule. This flag is the
    // missing half, and it is what lets e2e/_preview.ts wait correctly at ANY debounce length.
    iframeRef.current?.setAttribute('data-doc-pending', '1');
    const handle = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      setPreviewError(null);
      setCmdError(null); // a new document; the last document's failed press says nothing about it
      const rev = ++docRevRef.current;
      iframe.addEventListener(
        'load',
        () => {
          // Only the newest commit may stamp — a slow older document must not look current,
          // and only the newest may clear the flag, or a superseded load would report the
          // graphic settled while the current document is still on its way.
          if (rev === docRevRef.current) {
            iframe.dataset.docRev = String(rev);
            iframe.removeAttribute('data-doc-pending');
          }
        },
        { once: true },
      );
      // Authoring mode: render the canvas inset inside the padded document so off-canvas
      // content is painted. Never used by exports/renders (pad is editor-only). `simulate` +
      // `canvasControl` install the editor's postMessage channels (PlayoutSimulator's
      // play/stop/scrub lifecycle, CanvasInteraction's rect-push + gsap-prop queries) — this
      // iframe carries no `allow-same-origin`, since the template it renders can be
      // AI-generated or imported code.
      iframe.srcdoc = composeDocument(template, { authoring: { padX, padY }, simulate: true, canvasControl: true });
    }, RELOAD_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [template, iframeRef, setPreviewError, padX, padY]);

  return (
    <div
      className={`preview-stage ${previewBg}${spacePan ? ' panning' : ''}${panActive ? ' panning-active' : ''}`}
      ref={stageRef}
      style={{ aspectRatio: `${docW} / ${docH}` }}
      data-testid="preview-stage"
      onPointerDownCapture={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
      onPointerEnter={() => setPointerOverStage(true)}
      onPointerLeave={() => setPointerOverStage(false)}
    >
      <div
        className="canvas-world"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {/* The iframe viewport is the padded document; the authoring CSS insets the real
            canvas by (padX, padY) inside it (see composeDocument). */}
        <iframe
          ref={iframeRef}
          className="preview-frame"
          title="Live preview"
          sandbox="allow-scripts"
          style={{
            width: docW,
            height: docH,
            transform: `translate(-50%, -50%) scale(${effScale})`,
          }}
        />
        <CanvasGuides
          width={docW * effScale}
          height={docH * effScale}
          safeAreas={guides.safeAreas}
          grid={guides.grid}
          canvasRect={{
            left: padX * effScale,
            top: padY * effScale,
            width: stageW * effScale,
            height: stageH * effScale,
          }}
        />
        {/* Direct manipulation — always on: drag the graphic, double-click text to edit.
            The overlay spans the padded document; padX/padY convert to canvas-logical
            coordinates at the write boundary. */}
        <CanvasInteraction
          iframeRef={iframeRef}
          width={docW * effScale}
          height={docH * effScale}
          padX={padX}
          padY={padY}
        />
      </div>

      {/* A runtime error in the template document must not fail silently on the canvas: the
          store already records it for the Export gate, but the person watching the stage saw
          nothing. Worn where the failure is, like the video shell's .video-preview-error;
          cleared automatically because every rebuild starts by resetting previewError. One badge
          for both faults - the load-time one first, since a document that failed to load explains
          any command that fails afterwards. */}
      {(previewError || cmdError) && (
        <div
          className="preview-runtime-error"
          data-testid="preview-runtime-error"
          title={previewError || cmdError || ''}
        >
          ✗ {previewError || cmdError}
        </div>
      )}

      <div className="preview-toolbar">
        <ProjectFormatMeta template={template} className="preview-project-format" testId="preview-project-format" />
        {placedDesign && (
          <div className="tool-switch" data-testid="tool-switch">
            <button
              className={canvasTool === 'select' ? 'active' : ''}
              onClick={() => setCanvasTool('select')}
              title="Select — click and drag elements (Esc)"
              data-testid="tool-select"
            >
              ↖
            </button>
            <button
              className={canvasTool === 'text' ? 'active' : ''}
              onClick={() => setCanvasTool('text')}
              title="Type tool (T) — click the artwork, then type. Creates a real data field."
              data-testid="tool-text"
            >
              T
            </button>
            <button
              className={canvasTool === 'area-text' ? 'active' : ''}
              onClick={() => setCanvasTool('area-text')}
              title="Area type tool — drag to draw a wrapping text box. Creates a real data field."
              data-testid="tool-area-text"
            >
              <span className="tool-area-glyph">T</span>
            </button>
          </div>
        )}
        <div className="guide-switch">
          <button
            className={guides.safeAreas ? 'active' : ''}
            onClick={() => setGuide('safeAreas', !guides.safeAreas)}
            title="Toggle broadcast safe areas (title-safe / action-safe)"
          >
            Safe
          </button>
          <button
            className={guides.grid ? 'active' : ''}
            onClick={() => setGuide('grid', !guides.grid)}
            title="Toggle rule-of-thirds grid"
          >
            Grid
          </button>
        </div>
        <div className="zoom-switch" data-testid="zoom-switch">
          <button
            onClick={() => zoomToward(zoom / 1.25, (stageRef.current?.getBoundingClientRect().left ?? 0) + (stageRef.current?.getBoundingClientRect().width ?? 0) / 2, (stageRef.current?.getBoundingClientRect().top ?? 0) + (stageRef.current?.getBoundingClientRect().height ?? 0) / 2)}
            title="Zoom out (Ctrl/Cmd + scroll)"
            data-testid="zoom-out"
          >
            −
          </button>
          <button
            className="zoom-level"
            onClick={resetView}
            title="Reset the view to fit"
            data-testid="zoom-reset"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomToward(zoom * 1.25, (stageRef.current?.getBoundingClientRect().left ?? 0) + (stageRef.current?.getBoundingClientRect().width ?? 0) / 2, (stageRef.current?.getBoundingClientRect().top ?? 0) + (stageRef.current?.getBoundingClientRect().height ?? 0) / 2)}
            title="Zoom in (Ctrl/Cmd + scroll)"
            data-testid="zoom-in"
          >
            +
          </button>
        </div>
        <div className="bg-switch">
          {(['checkerboard', 'black', 'video'] as const).map((bg) => (
            <button
              key={bg}
              className={previewBg === bg ? 'active' : ''}
              onClick={() => setPreviewBg(bg)}
              title={`${bg} background`}
            >
              {bg === 'checkerboard' ? 'Trans' : bg === 'black' ? 'Black' : 'Video'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
