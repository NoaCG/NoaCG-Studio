// The video preview: the sandboxed Remotion Player host iframe plus transport controls
// (play/pause/replay/scrub + time readout). The iframe runs sandbox="allow-scripts" ONLY
// - no allow-same-origin - so evaluated composition code can never reach the app's
// localStorage or session (see src/video/playerBridge.ts). Manual code edits recompile on
// a 350 ms debounce; compile/static errors keep the LAST GOOD module playing and show an
// inline banner instead of blanking the stage.
//
// The stage keeps the SPX canvas conventions of the editor's preview stage: the output
// frame is scaled to fit and centred in a larger stage with a soft shadow, over the same
// checkerboard/black backing, with the shared CanvasGuides overlay (outline + broadcast safe
// areas + rule-of-thirds grid) - so a Remotion project reads as the same canvas as the rest
// of the editor and it's obvious where the real frame begins, ends, and whether motion fills it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVideoProjectStore } from '../../store/videoProjectStore';
import { compileTsx, staticValidate, WARNING_RULES } from '../../video/compile';
import { PlayerBridge, type LoadResult } from '../../video/playerBridge';
import { HyperframesBridge } from '../../video/hyperframes/bridge';
import { staticValidateHyperframes, HF_WARNING_RULES } from '../../video/hyperframes/validate';
import { setActiveBridge, type VideoBridge } from '../../video/bridgeRegistry';
import { compositionAssets, describeAssets } from '../../video/types';
import { videoFieldValues } from '../../model/videoTypes';
import CanvasGuides from '../canvas/CanvasGuides';

const RELOAD_DEBOUNCE_MS = 350;
// The fit-scaled frame is inset from the stage edges so its shadow and outline read against
// the surrounding stage (matching the floating-frame look of the SPX preview).
const STAGE_INSET = 0.92;

function fmtTime(frame: number, fps: number): string {
  const t = frame / fps;
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}

export default function VideoPlayerFrame() {
  const project = useVideoProjectStore((s) => s.project);
  const replayNonce = useVideoProjectStore((s) => s.replayNonce);
  const previewError = useVideoProjectStore((s) => s.previewError);
  const setPreviewError = useVideoProjectStore((s) => s.setPreviewError);
  const busy = useVideoProjectStore((s) => s.busy);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Canvas presentation, mirroring the SPX preview: a fit scale computed from the stage size,
  // a checkerboard/black backing, and the shared broadcast guides.
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.2);
  const [bg, setBg] = useState<'checkerboard' | 'black'>(project.transparent ? 'checkerboard' : 'black');
  const [safeAreas, setSafeAreas] = useState(false);
  const [grid, setGrid] = useState(false);
  // The bridge is created in an effect (remount-safe under StrictMode); the class follows
  // the project's ENGINE - the Remotion player host, or the HyperFrames srcdoc driver.
  // The Remotion iframe gets its nonce-carrying src on the re-render after creation; the
  // HyperFrames bridge writes srcdoc through the attached iframe instead.
  const engine = project.engine;
  const [bridge, setBridge] = useState<VideoBridge | null>(null);

  useEffect(() => {
    const callbacks = {
      onFrame: setFrame,
      onState: setPlaying,
      onRuntimeError: (message: string, f: number | null) =>
        useVideoProjectStore
          .getState()
          .setPreviewError(f != null ? `frame ${f}: ${message}` : message),
    };
    const b: VideoBridge =
      engine === 'hyperframes' ? new HyperframesBridge(callbacks) : new PlayerBridge(callbacks);
    if (iframeRef.current) b.attach(iframeRef.current);
    setActiveBridge(b);
    setBridge(b);
    return () => {
      setActiveBridge(null);
      b.dispose();
    };
  }, [engine]);

  // (Re)load the composition: debounced on code/settings/asset changes, and on
  // replayNonce (AI applies + post-failed-validation restores bump it).
  //
  // HyperFrames: image-variable values substitute a src URL at compose time, so they are
  // a reload dependency (imageValuesJson); scalar values stay live via set-vars below.
  const { tsx, html, width, height, fps, durationInFrames, transparent, assetUses } = project;
  const allAssets = project.assets;
  // Reference material is never loaded into the player: it is not drawable, and shipping it
  // into the sandbox as a data URL would cost memory for a picture nothing can show. Memoized
  // so `assets` stays reference-stable — it is a dependency of the debounced reload effect
  // below, and a fresh array every render would reload the composition continuously.
  const assets = useMemo(
    () => compositionAssets({ assets: allAssets, assetUses }),
    [allAssets, assetUses],
  );
  const source = engine === 'hyperframes' ? html : tsx;
  const imageValuesJson = JSON.stringify(
    engine === 'hyperframes'
      ? project.inputs.filter((i) => i.type === 'image').map((i) => [i.key, i.value])
      : [],
  );
  // The stage's READINESS SIGNAL, stamped on the iframe: `data-player-pending` from the moment
  // a (re)load becomes owed - set synchronously, before the debounce even starts - and
  // `data-player-rev` once the composition has actually MOUNTED. Same two-halves contract, and
  // the same reasoning, as the wizard preview's `data-doc-pending`/`data-doc-rev`: a revision alone
  // cannot tell "has not started yet" from "already finished", so a waiter reading it at the
  // wrong moment either returns too early or waits for a load nothing is going to schedule.
  //
  // It exists because a load here RESTARTS PLAYBACK (autoplay below), so anything read off the
  // stage or the transport while one is owed is not merely early - it is about to be undone.
  // The e2e suite lost that race regularly: `e2e/video-project.spec.ts` read the transport as
  // paused (correct at the time), and the queued reload then autoplayed before the assertion,
  // leaving the spec waiting on a Play button the player would never show again.
  const owedRef = useRef(0);
  const loadRevRef = useRef(0);
  useEffect(() => {
    if (!bridge) return;
    // A load is owed from THIS moment - both the flag and the token that decides who may
    // clear it are taken synchronously, so a load that resolves while a newer one is still
    // waiting out the debounce cannot report the stage settled.
    const owed = ++owedRef.current;
    iframeRef.current?.setAttribute('data-player-pending', '1');
    const settle = (loaded: boolean) => {
      const iframe = iframeRef.current;
      if (!iframe || owed !== owedRef.current) return;
      if (loaded) iframe.dataset.playerRev = String(++loadRevRef.current);
      iframe.removeAttribute('data-player-pending');
    };
    const handle = setTimeout(async () => {
      const settings = { width, height, fps, durationInFrames, transparent };
      const values = videoFieldValues(useVideoProjectStore.getState().project.inputs);
      let res: LoadResult;
      if (bridge instanceof HyperframesBridge) {
        const blocking = staticValidateHyperframes(source, assets, settings).filter(
          (i) => !HF_WARNING_RULES.has(i.rule),
        );
        if (blocking.length > 0) {
          setCodeError(blocking.map((i) => i.message).join(' '));
          settle(false); // nothing will mount, but the stage has stopped changing
          return; // keep the last good document
        }
        setCodeError(null);
        setPreviewError(null);
        res = await bridge.load(source, settings, values, assets, { autoplay: true });
      } else {
        const compiled = compileTsx(source);
        if (!compiled.ok) {
          setCodeError(compiled.error);
          settle(false);
          return; // the host keeps the last good module playing
        }
        const blocking = staticValidate(source, describeAssets(assets)).filter(
          (i) => !WARNING_RULES.has(i.rule),
        );
        if (blocking.length > 0) {
          setCodeError(blocking.map((i) => i.message).join(' '));
          settle(false);
          return;
        }
        setCodeError(null);
        setPreviewError(null);
        // Read the latest field values at load time (not a hook dep - live field edits go
        // through the instant set-props effect below, never a recompile).
        res = await bridge.load(
          compiled.js,
          settings,
          { fields: values },
          assets,
          { autoplay: true },
        );
      }
      // A disposed result means this bridge was replaced mid-flight - never overwrite
      // the successor's state.
      if (!res.ok && !res.disposed) setPreviewError(res.message);
      settle(res.ok);
    }, RELOAD_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [source, assets, width, height, fps, durationInFrames, transparent, replayNonce, bridge, imageValuesJson, setPreviewError]);

  // Live field edits (Content panel): push the new values to the mounted composition
  // instantly - no recompile, no remount - so a headline/colour change shows immediately.
  // Remotion: the host merges `fields` over the current props. HyperFrames: the driver
  // re-applies variable values and re-renders the current moment. Serialized so the dep
  // is a stable primitive (and to skip no-op re-pushes). A no-op before the first load.
  const fieldsJson = JSON.stringify(videoFieldValues(project.inputs));
  useEffect(() => {
    if (!bridge) return;
    const values = JSON.parse(fieldsJson) as Record<string, string | number>;
    if (bridge instanceof HyperframesBridge) bridge.setVars(values);
    else bridge.setProps({ fields: values });
  }, [bridge, fieldsJson]);

  // Scale the native-resolution frame (width × height) to fit the stage, leaving a margin so
  // the frame floats with its shadow. Re-runs on stage resize and on resolution change.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fitNow = () => {
      const r = stage.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setFit(Math.min(r.width / width, r.height / height) * STAGE_INSET);
      }
    };
    fitNow();
    const ro = new ResizeObserver(fitNow);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [width, height]);

  // The backing follows the project's transparency (checkerboard reveals an alpha output);
  // the toolbar can still override it per session.
  useEffect(() => {
    setBg(transparent ? 'checkerboard' : 'black');
  }, [transparent]);

  const scrub = (f: number) => {
    setFrame(f);
    bridge?.seek(f);
  };

  const frameW = width * fit;
  const frameH = height * fit;

  return (
    <div className="preview-wrap">
      <div className={`preview-stage video-stage ${bg}`} ref={stageRef} data-testid="video-stage">
        <div className="canvas-world">
          {bridge && (
          <iframe
            key={engine}
            ref={(el) => {
              iframeRef.current = el;
              if (el) bridge.attach(el);
            }}
            className="preview-frame video-player-frame"
            title="Video preview"
            // allow-scripts WITHOUT allow-same-origin is load-bearing: the opaque origin
            // keeps AI/user composition code away from the app's localStorage (the
            // Anthropic API key) and session. Never add allow-same-origin here.
            sandbox="allow-scripts"
            // Remotion loads the prebuilt player host by URL; the HyperFrames bridge
            // writes composed srcdoc into the attached iframe instead.
            src={bridge instanceof PlayerBridge ? bridge.src : undefined}
            style={{ width, height, transform: `translate(-50%, -50%) scale(${fit})` }}
          />
          )}
          <CanvasGuides width={frameW} height={frameH} safeAreas={safeAreas} grid={grid} />
        </div>

        {/* An AI request in flight owns the stage: validation loads and probes candidate
            modules in the live player, and those flashes must never read as the result. */}
        {busy && (
          <div className="video-stage-busy" data-testid="video-stage-busy">
            <span>✦ {busy}</span>
          </div>
        )}

        <div className="preview-toolbar">
          <div className="guide-switch">
            <button
              className={safeAreas ? 'active' : ''}
              onClick={() => setSafeAreas((v) => !v)}
              title="Toggle broadcast safe areas (title-safe / action-safe)"
            >
              Safe
            </button>
            <button
              className={grid ? 'active' : ''}
              onClick={() => setGrid((v) => !v)}
              title="Toggle rule-of-thirds grid"
            >
              Grid
            </button>
          </div>
          <div className="bg-switch">
            <button
              className={bg === 'checkerboard' ? 'active' : ''}
              onClick={() => setBg('checkerboard')}
              title="Transparent (checkerboard) backing"
            >
              Trans
            </button>
            <button
              className={bg === 'black' ? 'active' : ''}
              onClick={() => setBg('black')}
              title="Black backing"
            >
              Black
            </button>
          </div>
        </div>
      </div>

      <div className="video-transport" data-testid="video-transport">
        <button onClick={() => (playing ? bridge?.pause() : bridge?.play())} title={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => bridge?.replay()} title="Play from the start">⟲</button>
        <input
          type="range"
          className="video-scrubber grow"
          min={0}
          max={Math.max(0, durationInFrames - 1)}
          value={Math.min(frame, durationInFrames - 1)}
          onChange={(e) => scrub(Number(e.target.value))}
          data-testid="video-scrubber"
        />
        <span className="mono muted video-timecode">
          {fmtTime(frame, fps)} / {fmtTime(durationInFrames, fps)} · f{frame}
        </span>
      </div>

      {codeError && (
        <div className="status-bad video-preview-error" data-testid="video-code-error">
          ✗ {codeError} <span className="hint">(showing your previous working version)</span>
        </div>
      )}
      {!codeError && previewError && (
        <div className="status-bad video-preview-error" data-testid="video-preview-error">
          ✗ {previewError}
        </div>
      )}
    </div>
  );
}
