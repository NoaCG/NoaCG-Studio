import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ControlSendItem, OutputPayload } from '../../control/hostedControl';
import { createOutputStage, type OutputStage } from '../../output/stage';
import type { PreviewMachineState } from '../../preview/previewProtocol';

/**
 * A MONITOR over a rendered production (docs/PLAYOUT_DASHBOARD.md §2): `createOutputStage` over
 * an `OutputPayload` — the same two functions the published output URL is built from — fed the
 * same `ControlSendItem[]` the verbs send.
 *
 * That identity is the whole point. A monitor that agreed with air only because both were
 * written to agree would be worth nothing; this one cannot disagree without the renderer itself
 * being wrong. It serves BOTH monitors on both surfaces: PROGRAM is one of these driven by what
 * reaches air, PREVIEW is one driven locally by the selected cue.
 */
export interface PayloadStageHandle {
  /** Apply commands, exactly as the published renderer would apply them off the log. */
  apply(items: ControlSendItem[]): void;
}

const PayloadStage = forwardRef<
  PayloadStageHandle,
  {
    payload: OutputPayload | null;
    error?: string | null;
    emptyLabel?: string;
    testId?: string;
    /** Machine-state replies from the stage's documents (the stage already collects them —
     *  posted after every applied command). A host that renders event buttons greys them
     *  against this; omitting the prop costs nothing.
     *
     *  `overflow` rides the same reply: the field ids the graphic could not make fit even at
     *  its readability floor, so a host with field boxes can warn before the value airs
     *  (docs/SVG_IMPORT_PLAN.md §3). Empty for every graphic that fits. */
    onState?: (graphic: string, state: PreviewMachineState | null, overflow: string[]) => void;
    /**
     * Fired every time a FRESH stage exists — first mount and every rebuild.
     *
     * A rebuilt stage is a blank renderer: it has never been told what is on air. The host is
     * the only thing that knows, so it has to be told to say it again. Without this signal a
     * host can only replay ONCE (on its own boot), which is why switching to the Data workspace
     * and back emptied the PROGRAM monitor while the graphic was still live on CasparCG — the
     * monitors unmounted with the workspace and came back with nothing replayed into them.
     *
     * Commands sent from here are safe immediately: `createOutputStage` queues everything until
     * each graphic's document has loaded its listener.
     */
    onReady?: () => void;
    /** An imported face's bytes the payload does not hold (output/stage.ts `faceAsset`). */
    faceAsset?: (src: string) => string | null;
  }
>(function PayloadStage({ payload, error, emptyLabel, testId, onState, onReady, faceAsset }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<OutputStage | null>(null);
  /**
   * HOW MANY ENTRANCES THIS STAGE HAS PLAYED, published on the element as `data-plays`.
   *
   * A monitor saying what it has applied, in the spirit of `/output?debug=1`. It exists because
   * a DUPLICATE command is the one renderer fault that leaves no trace: replaying `play` on a
   * graphic already up re-runs an animation and settles on exactly the picture that was already
   * there, so the surface after the bug is pixel-identical to the surface without it. That is
   * how a boot replay firing twice on the operator's own first take survived review, and why
   * asserting on the picture could not have caught it (e2e/configured/hosted-control-recovery).
   *
   * Counted only when a stage actually took the command, so the number never claims more than
   * happened, and reset per stage build - a rebuilt stage is a blank renderer the host replays
   * into, so "plays since this renderer came up" is the figure that stays comparable.
   */
  const plays = useRef(0);
  // The stage is rebuilt per payload; the callback identity must not force that, so the
  // subscription reads through a ref.
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const faceAssetRef = useRef(faceAsset);
  faceAssetRef.current = faceAsset;

  useEffect(() => {
    const root = host.current;
    if (!root || !payload) return;
    const built = createOutputStage(root, payload, {
      // Scale into the MONITOR, not the viewport — the /output page keeps the window default.
      fit: () => ({ width: root.clientWidth, height: root.clientHeight }),
      faceAsset: (src) => faceAssetRef.current?.(src) ?? null,
    });
    stage.current = built;
    plays.current = 0;
    root.setAttribute('data-plays', '0');
    built.onState((graphic, state, over) => onStateRef.current?.(graphic, state, over));

    // RE-ASK FOR MACHINE STATE, once a second, exactly as the published /output renderer has
    // always done (src/output/main.ts). The stage posts a single `{cmd:'state'}` after each
    // command it applies, so without this a host's picture of the machine is only ever as
    // fresh as its OWN last command — and anything that moves the graphic otherwise leaves it
    // stale indefinitely: a timer arrow firing inside the runtime, another operator's device
    // driving the shared log, or a reply that lost the race with the entrance it asked about.
    //
    // That is not a cosmetic staleness. The host greys its ⚡ event buttons against this state
    // (`isEventLegal`), so a wrong answer here makes the production dashboard offer the wrong
    // moves until the operator happens to press something. The renderer self-corrected within
    // a second; the app-side monitors did not, which is the asymmetry this closes.
    //
    // `requestState` drops the ask for a graphic that has not loaded, so this is safe from the
    // first tick. The guard is the SUBSCRIBER, not mount-time config: a monitor nobody is
    // reading state from (every PREVIEW stage) does no work beyond one boolean per second.
    const poll = window.setInterval(() => {
      if (!onStateRef.current) return;
      for (const graphic of built.graphics) built.requestState(graphic);
    }, 1000);

    const ro = new ResizeObserver(() => built.rescale());
    ro.observe(root);
    // AFTER `stage.current` is set, so a host replaying on-air state through the imperative
    // handle reaches the stage that just came up rather than the one that went away.
    onReadyRef.current?.();
    return () => {
      window.clearInterval(poll);
      ro.disconnect();
      stage.current = null;
      built.destroy();
    };
  }, [payload]);

  useImperativeHandle(
    ref,
    () => ({
      apply(items: ControlSendItem[]) {
        // Status rows ('cue') are not renderer commands; the stage ignores them by contract,
        // so the whole batch can be handed over untouched.
        const built = stage.current;
        if (!built) return;
        for (const item of items) {
          built.apply(item.graphic, item.msg);
          if (item.msg.t === 'play') {
            plays.current += 1;
            host.current?.setAttribute('data-plays', String(plays.current));
          }
        }
      },
    }),
    [],
  );

  return (
    <div className="prod-monitor-stage" ref={host} data-testid={testId ?? 'program-stage'}>
      {!payload && !error && <p className="hint prod-monitor-note">Building the output…</p>}
      {error && <p className="status-bad prod-monitor-note">Could not build the output: {error}</p>}
      {/* An empty frame is the CORRECT picture with nothing up, and it looks identical to a
          broken one. The caption goes the moment any layer is on. */}
      {payload && emptyLabel && <p className="hint prod-monitor-empty">{emptyLabel}</p>}
    </div>
  );
});

export default PayloadStage;
