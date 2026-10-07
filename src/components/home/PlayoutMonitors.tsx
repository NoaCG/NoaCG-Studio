import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { GraphicDoc } from '../../model/library';
import type { PlayoutItem, Show } from '../../model/shows';
import type { Resolution, SpxTemplate } from '../../model/types';
import type { ServerLayer } from '../../control/serverPlayout';
import { slotAddress } from '../../control/playoutLink';
import { postPreviewCmd, PREVIEW_STATE_TYPE, type PreviewStateMessage } from '../../preview/previewProtocol';
import ProgramStage, { type ProgramStageHandle } from './ProgramStage';
import { lengthText } from './clipLength';
import { useServerThumbnail } from './serverThumbnail';

/**
 * A SERVER CLIP'S PICTURE on a monitor (docs/CLIP_PLAYBACK_PLAN.md §6.3): its thumbnail, marked
 * STILL, because the page never has the server's moving video and an operator who does not know
 * that could wait for a picture to move. Nothing is drawn without a thumbnail (a server whose media
 * scanner is not running has none to give), so the tag is never on an empty frame.
 */
function ServerStill({ thumb, testId }: { thumb: string | null; testId: string }) {
  if (!thumb) return null;
  return (
    <>
      <img className="pd-frame-still" src={thumb} alt="" data-testid={`${testId}-still`} />
      <span className="pd-still-tag" title="A still picture of the clip. The server plays the video; this page never shows it moving." data-testid={`${testId}-still-tag`}>
        STILL
      </span>
    </>
  );
}

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
  emptyHint,
  liveLayers,
  serverLayers,
  previewServer = null,
  previewSeconds,
  programClip = null,
  show,
  library,
  programRef,
  onState,
  onReady,
  onOverflow,
  live = false,
  graphicsAir = live,
  programChip = null,
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
  /** What the empty PREVIEW says, when the page knows better than the default: a folder row is
   *  held, and a folder is more than one cue. */
  emptyHint?: string;
  /** The graphics up on air, each with the cue that put it there, front to back. */
  liveLayers: { layer: number; label: string }[];
  /** The server cues this page put up - named on PROGRAM's header. */
  serverLayers: Pick<ServerLayer, 'slot' | 'label'>[];
  /** The server item on PREVIEW, when the previewed cue is one: its still and, for a clip, its
   *  length in the corner (plan §6.3). */
  previewServer?: PlayoutItem | null;
  /** How long the PREVIEW cue plays its file: the part its trim leaves, or the whole file. */
  previewSeconds?: number;
  /** The server clip the clip clock follows: its still sits under the graphics on PROGRAM. */
  programClip?: PlayoutItem | null;
  show: Show;
  library: GraphicDoc[];
  programRef: Ref<ProgramStageHandle>;
  onState: (graphic: string, state: { groups?: Record<string, string> } | null, overflow?: string[]) => void;
  onReady: () => void;
  /** The field ids PREVIEW reports as too long to fit, each time the answer changes. */
  onOverflow: (keys: string[]) => void;
  /** Something this page sends is on air: the production is started, or server media is up through
   *  NoaCG Bridge (which plays whether or not it is). Otherwise a Take plays on this monitor only,
   *  and the monitor must not call itself on air. */
  live?: boolean;
  /** A graphic's Take reaches air: the production is published. Absent, it follows `live`. */
  graphicsAir?: boolean;
  /** The timed cue's countdown that fires soonest, over PROGRAM (docs/RUNDOWN_AUTOMATION_PLAN.md §2.1). */
  programChip?: ReactNode;
}) {
  const previewIframe = useRef<HTMLIFrameElement>(null);
  const previewThumb = useServerThumbnail(previewServer?.kind === 'media' ? previewServer.name : null);
  const programThumb = useServerThumbnail(programClip?.name ?? null);
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
          <span className="pd-monitor-name">PREVIEW</span>
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
          ) : previewServer ? (
            // A cue over the playout server's own library: its still and length, since the page
            // has no way to render the server's template or video itself.
            <div className="pd-frame pd-frame-empty" style={{ aspectRatio: stageAspect }} data-testid="preview-server">
              <ServerStill thumb={previewThumb} testId="preview" />
              <p className="hint pd-frame-server-name">{previewServer.name}</p>
              {previewServer.kind === 'media' && lengthText(previewSeconds) && (
                <span className="pd-frame-length" title="The clip's length" data-testid="preview-length">
                  {lengthText(previewSeconds)}
                </span>
              )}
            </div>
          ) : (
            <div className="pd-frame pd-frame-empty" style={{ aspectRatio: stageAspect }}>
              <p className="hint">
                {emptyHint ?? (!hasCues ? 'Add a cue to preview it here.' : 'SPACE on the selected cue shows it here.')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ON AIR ONLY WHEN IT IS (docs/work-specs/studio-day-playout AC-9; owner, 2026-10-01). A
          production that is not started keeps every verb on this page, so its Takes land here and
          nowhere else; calling the monitor PROGRAM · ON AIR then is how an operator once believed
          a show was live that was not. Not published, it reads PROGRAM · NOT PUBLISHED in grey
          (playout-workflow-simplification AC-7) - unless a server clip is up, which NoaCG Bridge
          airs either way, and then it is on air. */}
      <div className={`pd-monitor pd-pgm${live ? '' : ' pd-pgm--not-live'}`} data-live={live ? 'true' : 'false'} data-testid="program-monitor">
        <h2>
          <span className="pd-dot" aria-hidden="true" />
          <span className="pd-monitor-name" data-testid="program-monitor-name">
            {live ? 'PROGRAM · ON AIR' : 'PROGRAM · NOT PUBLISHED'}
          </span>
          {/* The names can run past the monitor's width and end in an ellipsis, so the title
              carries them whole. The badge names EVERY live layer, in the names' order: with a
              quiz and a score both up it used to show one layer beside two names. */}
          {/* With only server cues up the badge beside it names them; "nothing on air" would not
              be true of a clip playing on the server. */}
          <span className="pd-what" title={liveLayers.map((l) => `${l.label} (layer ${l.layer})`).join(', ')}>
            {liveLayers.length > 0
              ? `${live && !graphicsAir ? 'up here: ' : ''}${liveLayers.map((l) => l.label).join(' · ')}`
              : serverLayers.length > 0 ? '' : 'nothing on air'}
          </span>
          {liveLayers.length > 0 && (
            <span className="pd-layer-badge">{liveLayers.map((l) => `L${l.layer}`).join(' · ')}</span>
          )}
          {/* Server cues are up on the playout box: named here, and a clip's STILL drawn under the
              graphics - never its moving video. */}
          {serverLayers.length > 0 && (
            <span
              className="pd-layer-badge pd-server-badge"
              title="Playing on the playout server through NoaCG Bridge. A clip shows here as its still picture, never its moving video."
              data-testid="playout-on-air"
            >
              server: {serverLayers.map((l) => `${l.label} (${slotAddress(l.slot)})`).join(' · ')}
            </span>
          )}
          {programChip}
        </h2>
        <div className="pd-screen">
          <div className="pd-frame pd-frame-pgm" style={{ aspectRatio: stageAspect }}>
            <ServerStill thumb={programClip ? programThumb : null} testId="program" />
            {/* With nothing but a server clip up and no picture of it to show, PROGRAM says so
                rather than standing blank - or claiming nothing is on air. */}
            <ProgramStage
              ref={programRef}
              show={show}
              library={library}
              empty={liveLayers.length === 0 && !(programClip && programThumb)}
              emptyLabel={programClip ? `${programClip.name} plays on the server` : undefined}
              onState={onState}
              onReady={onReady}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
