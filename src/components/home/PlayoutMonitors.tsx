import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import type { GraphicDoc } from '../../model/library';
import type { Show } from '../../model/shows';
import type { Resolution, SpxTemplate } from '../../model/types';
import type { Slot } from '../../control/playoutProtocol';
import { slotAddress } from '../../control/playoutLink';
import { postPreviewCmd, PREVIEW_STATE_TYPE, type PreviewStateMessage } from '../../preview/previewProtocol';
import ProgramStage, { type ProgramStageHandle } from './ProgramStage';

/**
 * THE TWO MONITORS of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2): PREVIEW, which
 * composes the previewed cue's graphic locally and settles its values into it, and PROGRAM, the
 * actual output renderer fed every command that reaches air. Phase 2 of
 * docs/backlog/production-page-phases.md: moved out of ProductionPage with its behaviour
 * unchanged.
 *
 * It owns the PREVIEW frame's measurement and its messages. PROGRAM is driven by the PAGE:
 * `applyProgram` ends in `programRef.current?.apply(…)`, called by the log follower, so the ref is
 * the page's own, forwarded here, and never one this component mints. A monitor that minted it
 * would leave the follower with no route to air's picture.
 */
export default function PlayoutMonitors({
  stage,
  previewDoc,
  previewTemplate,
  previewLabel,
  settleData,
  hasCues,
  liveLayers,
  serverLayers,
  show,
  library,
  programRef,
  onState,
  onReady,
  onOverflow,
}: {
  /** The production's stage: both monitors' shape, never the selected cue's. */
  stage: Resolution;
  /** The previewed cue's graphic, composed once per template; '' when nothing is on PREVIEW. */
  previewDoc: string;
  previewTemplate: SpxTemplate | null;
  /** What PREVIEW's header names: the cue's label, or what the empty monitor means. */
  previewLabel: string;
  /** The values a Take would air, as the settle command carries them. */
  settleData: string;
  hasCues: boolean;
  /** The graphics up on air, each with the cue that put it there, front to back. */
  liveLayers: { layer: number; label: string }[];
  /** The server cues this page put up - named on PROGRAM's header, never drawn. */
  serverLayers: { slot: Slot; label: string }[];
  show: Show;
  library: GraphicDoc[];
  programRef: Ref<ProgramStageHandle>;
  onState: (graphic: string, state: { groups?: Record<string, string> } | null, overflow?: string[]) => void;
  onReady: () => void;
  /** The field ids PREVIEW reports as too long to fit, each time the answer changes. */
  onOverflow: (keys: string[]) => void;
}) {
  const previewIframe = useRef<HTMLIFrameElement>(null);
  const settlePreview = useCallback((data: string) => {
    postPreviewCmd(previewIframe.current?.contentWindow, { cmd: 'settle', data });
  }, []);
  useEffect(() => {
    if (!previewDoc || !settleData) return;
    const t = setTimeout(() => settlePreview(settleData), 150);
    return () => clearTimeout(t);
  }, [previewDoc, settleData, settlePreview]);
  /**
   * WHICH OF THE VALUES BEING TYPED DO NOT FIT — the warn half of the owner's fit ruling
   * (docs/SVG_IMPORT_PLAN.md §3). The graphic on PREVIEW has already settled with exactly the
   * values a Take would air, so asking IT is asking the only thing that knows: whether the copy
   * fits is a measurement of the rendered artwork, not a property of the string.
   *
   * Same request/reply round trip the machine state uses, for the same reason — this iframe
   * carries no `allow-same-origin`, so nothing here can read the document directly. It is
   * polled rather than answered once because the answer moves without any command: a webfont
   * arriving re-measures every budget, and the ladder re-runs.
   */
  useEffect(() => {
    if (!previewDoc) {
      onOverflow([]);
      return;
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== previewIframe.current?.contentWindow) return;
      const msg = ev.data as PreviewStateMessage | undefined;
      if (!msg || msg.type !== PREVIEW_STATE_TYPE) return;
      onOverflow(Array.isArray(msg.overflow) ? msg.overflow.map(String) : []);
    };
    window.addEventListener('message', onMessage);
    const tick = () => postPreviewCmd(previewIframe.current?.contentWindow, { cmd: 'state' });
    const handle = window.setInterval(tick, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(handle);
    };
  }, [previewDoc, onOverflow]);
  // The frame sizes itself in CSS from the graphic's own aspect ratio; the measurement drives
  // ONE number, the inner scale. (Sizing the frame from the measurement made the observed box
  // depend on the value it produced — a late observer left a right-sized frame around a
  // wrongly scaled graphic.) Keyed on the NODE, not the document: the Data tab unmounts this
  // subtree, and an effect keyed on the unchanged previewDoc never measured the remounted
  // frame — the observer's last tick on the detaching node had left stageW at 0, so the
  // returning preview rendered a 1920px document unscaled and showed its empty corner.
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stageEl) return;
    const measure = () => setStageBox({ width: stageEl.clientWidth, height: stageEl.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);
  const stageAspect = `${stage.width} / ${stage.height}`;
  // CONTAIN, not width-fill (`Math.min`, the same arithmetic as src/output/stage.ts): the frame
  // is the production's shape now, so a cue of another shape has to fit inside it rather than
  // overflow its height.
  const fit =
    previewTemplate && stageBox.width && stageBox.height
      ? Math.min(
          stageBox.width / previewTemplate.resolution.width,
          stageBox.height / previewTemplate.resolution.height,
        )
      : 0;

  return (
    <div
      className="pd-monitors"
      style={{ ['--pd-ar' as string]: stage.width / stage.height }}
    >
      <div className="pd-monitor pd-pvw">
        <h2>
          <span className="pd-dot" aria-hidden="true" />
          PREVIEW
          <span className="pd-what" data-testid="preview-what">
            {previewLabel}
          </span>
        </h2>
        <div className="pd-screen">
          {previewDoc && previewTemplate ? (
            <div
              className="pd-frame"
              ref={setStageEl}
              style={{ aspectRatio: stageAspect }}
              data-testid="production-preview"
            >
              <iframe
                ref={previewIframe}
                title="Cue preview"
                sandbox="allow-scripts"
                srcDoc={previewDoc}
                onLoad={() => settlePreview(settleData)}
                style={{
                  position: 'absolute',
                  // CENTRED IN THE STAGE, the same way src/output/stage.ts centres its own:
                  // origin at the frame's middle, then translated back by half the SCALED
                  // size. Percentage translates would compound with the scale.
                  left: '50%',
                  top: '50%',
                  width: previewTemplate.resolution.width,
                  height: previewTemplate.resolution.height,
                  border: 0,
                  transformOrigin: '0 0',
                  transform: `translate(${(-previewTemplate.resolution.width * (fit || 1)) / 2}px, ${
                    (-previewTemplate.resolution.height * (fit || 1)) / 2
                  }px) scale(${fit || 1})`,
                }}
              />
            </div>
          ) : (
            <div className="pd-frame pd-frame-empty" style={{ aspectRatio: stageAspect }}>
              <p className="hint">
                {!hasCues
                  ? 'Add a cue to preview it here.'
                  : 'SPACE on the selected cue shows it here.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="pd-monitor pd-pgm">
        <h2>
          <span className="pd-dot" aria-hidden="true" />
          PROGRAM · ON AIR
          {/* The names can run past the monitor's width and end in an ellipsis, so the title
              carries them whole. The badge names EVERY live layer, in the names' order: with a
              quiz and a score both up it used to show one layer beside two names. */}
          <span className="pd-what" title={liveLayers.map((l) => `${l.label} (layer ${l.layer})`).join(', ')}>
            {liveLayers.length === 0 ? 'nothing on air' : liveLayers.map((l) => l.label).join(' · ')}
          </span>
          {liveLayers.length > 0 && (
            <span className="pd-layer-badge">{liveLayers.map((l) => `L${l.layer}`).join(' · ')}</span>
          )}
          {/* Server cues are up on the playout box, not in this monitor - named, never drawn. */}
          {serverLayers.length > 0 && (
            <span
              className="pd-layer-badge pd-server-badge"
              title="Playing on the playout server through NoaCG Bridge - not shown on this monitor"
              data-testid="playout-on-air"
            >
              server: {serverLayers.map((l) => `${l.label} (${slotAddress(l.slot)})`).join(' · ')}
            </span>
          )}
        </h2>
        <div className="pd-screen">
          <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: stageAspect }}>
            <ProgramStage
              ref={programRef}
              show={show}
              library={library}
              empty={liveLayers.length === 0}
              onState={onState}
              onReady={onReady}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
