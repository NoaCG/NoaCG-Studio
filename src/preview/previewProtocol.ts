/**
 * The postMessage command channel a preview document listens for when composeDocument's
 * `liveControl` option is on (composeDocument.ts) — the only way a parent can drive a document
 * that carries no `allow-same-origin` (every preview iframe in this app, since the template being
 * shown can be AI-generated or imported code and must never be able to reach the app's own origin
 * through `parent`/`contentWindow`/`contentDocument`).
 *
 * One shape, so the senders (WizardPreview's Replay/Out/demo-text push, GraphicControlPage's
 * transport + event buttons) and the script serialized into the document (composeDocument.ts)
 * can't drift on the wire. The reply types (`PreviewBoxMessage`, `PreviewStateMessage`) are the
 * matching shapes a listener reads back off `window.addEventListener('message', …)`.
 */

export const PREVIEW_CMD_TYPE = 'spx-preview-cmd';
export const PREVIEW_BOX_TYPE = 'spx-preview-box';
export const PREVIEW_STATE_TYPE = 'spx-preview-state';
export const PREVIEW_PLAYHEAD_TYPE = 'spx-preview-playhead';
/**
 * A COMMAND that threw, reported so the stage can wear it. Deliberately not the load-time
 * `spx-preview-error` channel, which `validateTemplate` treats as an export blocker and only a
 * rebuild clears: a command failure is about this press, so it must not outlive the next press
 * that works, and a scrub that throws once must not refuse the user their download. `message:
 * null` is the CLEAR a successful command sends.
 */
export const PREVIEW_CMD_ERROR_TYPE = 'spx-preview-cmd-error';

/**
 * A document whose `load` is still held back by a subresource (in practice a bundled font whose
 * request never answers) `FRAME_HOLD_CAP_MS` after it was fully parsed says so, once, with the
 * font families it is still waiting for. The output stage treats that as loaded: a font must
 * never keep a graphic off air (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.2). Sent only by a
 * `liveControl` document; every other listener ignores the type.
 */
export const PREVIEW_HELD_TYPE = 'spx-preview-held';
export const FRAME_HOLD_CAP_MS = 3000;
export interface PreviewHeldMessage {
  type: typeof PREVIEW_HELD_TYPE;
  /** Font families still loading, unquoted. Empty when something else holds the document. */
  fonts: string[];
}

/**
 * The load-time error channel (composeDocument's capture script): `window.onerror` and every
 * unhandled rejection, from the moment the document starts parsing. The editor's validator treats
 * it as an export blocker; the output stage records the first one per graphic, which is what makes
 * a graphic "not prepared (script error)" on READY (docs/work-specs/playout-ready/spec.md R7).
 */
export const PREVIEW_ERROR_TYPE = 'spx-preview-error';
export interface PreviewErrorMessage {
  type: typeof PREVIEW_ERROR_TYPE;
  message: string;
  line?: number;
}

/**
 * THE ANSWER TO `warm` (READY's guarantees 3 to 5, docs/work-specs/playout-ready/spec.md R6, R7):
 * what the document can see about itself once the warm update has run and its fonts and images
 * have had their chance, capped at `FRAME_HOLD_CAP_MS`. Sent only by a `liveControl` document.
 */
export const PREVIEW_READY_TYPE = 'spx-preview-ready';
export interface PreviewReadyMessage {
  type: typeof PREVIEW_READY_TYPE;
  /** What the warm `update` threw, or null (also null when there was nothing to update). */
  error: string | null;
  /** Font families by the state their faces were left in: `failed` fell back, `loading` had not
   *  answered by the cap. A typeface no face declares is invisible from here and never listed. */
  fonts: { failed: string[]; loading: string[] };
  /** `<img>` elements with a source: the names of the broken ones, and how many had not finished. */
  images: { broken: string[]; pending: number };
}

export type PreviewCmd =
  | { cmd: 'play'; data?: string }
  | { cmd: 'stop' }
  | { cmd: 'next' }
  | { cmd: 'update'; data: string }
  | { cmd: 'settle'; data: string }
  | { cmd: 'measure' }
  // `at` carries the ControlMessage's own instant (see control/controlModel.ts): a graphic that
  // runs a clock anchors it to that rather than to its local Date.now(), so two renderers given
  // the same log row agree. Absent for an editor-driven dispatch, which has neither.
  | { cmd: 'dispatch'; event: string; payload?: Record<string, string>; at?: number }
  | { cmd: 'state' }
  /**
   * THE WARM PASS (READY's guarantee 5): run `update` with `data` off air, in the command queue like
   * any other command, so the first Take pays no first-layout cost; then load every declared font
   * face, decode the images, and answer with a `PreviewReadyMessage`. Without `data` it only
   * checks. Never sent to a graphic that is on air or that recovery has already updated: the output
   * decides that (docs/work-specs/playout-ready/spec.md R6).
   */
  | { cmd: 'warm'; data?: string }
  /**
   * TAKE THIS DOCUMENT OFF AIR WITHOUT STOPPING IT: its root paints fully transparent while
   * everything inside keeps running at full speed.
   *
   * The browser-output renderer needs a graphic to be invisible and STILL TICKING while it
   * replays a boot catch-up off air. Hiding the stage from the outside cannot do that: Chromium
   * throttles the rendering of an iframe its embedder has made invisible, and a sandboxed
   * template document is exactly such a frame - measured on CasparCG 2.5.0 (2026-09-22), the
   * replayed timelines crawled at about 1 Hz behind an `opacity: 0` stage and then ran the rest
   * of their entrances and exits on air the moment it was revealed. Hidden from INSIDE, the
   * frame stays visible to the compositor, keeps its full frame rate, and the replay is over
   * before anything comes back.
   */
  | { cmd: 'offair'; on: boolean }
  /** Editor scrub (StepTimeline/LegacyTimeline): pause the named phase's timeline at `time`
   *  seconds. `from` is the branch phase's canonical predecessor state — computed on the app
   *  side (blocks/animMachine.ts canonicalPath, off the template model) and passed in, since the
   *  document has no access to the app's model layer. Composing WHICH timeline a phase means
   *  (branch snap-then-enter, the plain entrance, a Continue step, or the full run-to-out) stays
   *  inside the document — it drives live GSAP timeline objects that can't cross postMessage. */
  | { cmd: 'scrub'; phase: string; time: number; data: string; from?: string }
  /** Jump the machine straight to these state assignments. TWO listeners answer it with
   *  OPPOSITE defaults for an omitted `timers` — the editor simulator parks (timers off,
   *  simulatorRuntime.ts) while the liveControl script recovers (timers arm,
   *  composeDocument.ts) — so a sender should always state `timers` explicitly: `false` for a
   *  design-view park, `true` for renderer recovery (the output stage does). */
  | { cmd: 'snap'; assignments: Record<string, string> | null; timers?: boolean }
  /**
   * The editor's own simulator lifecycle (PlayoutSimulator.tsx), distinct from the plain
   * 'play'/'stop'/'next' above: these prefer the house builder contract (`buildInTimeline`/
   * `buildOutTimeline`/`revealNextStep`) when the template has one, own `__activeTl`/`__scrubTl`
   * for the pushed playhead (`PreviewPlayheadMessage`), and schedule the SPX `out` auto-exit
   * timer — none of which WizardPreview/GraphicControlPage need, so they stay separate rather
   * than growing the plain commands' handler with editor-only behaviour. See
   * preview/simulatorRuntime.ts's `runSimCommand` for the implementation these map onto.
   */
  | { cmd: 'sim-play'; data: string }
  | { cmd: 'sim-stop' }
  | { cmd: 'sim-next' }
  | { cmd: 'sim-settle'; data: string };

/** Post a command into a preview iframe's document. No-op if it hasn't loaded one yet. */
export function postPreviewCmd(win: Window | null | undefined, msg: PreviewCmd): void {
  win?.postMessage({ type: PREVIEW_CMD_TYPE, ...msg }, '*');
}

/** The graphic's machine pointers — what a state chip names and what greys an event button.
 *  `groups` is OPTIONAL because the value is whatever the template's own noacgMachineState()
 *  returned: an emitted or imported template may hand-write that function with another shape
 *  (the 2026-08-19 drive proof found `{ stepsPlayed: 1 }`), and every consumer must read that
 *  as "no answer yet" rather than crash the operator surface on it. */
export interface PreviewMachineState {
  groups?: Record<string, string>;
}

export interface PreviewBoxMessage {
  type: typeof PREVIEW_BOX_TYPE;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewStateMessage {
  type: typeof PREVIEW_STATE_TYPE;
  state: PreviewMachineState | null;
  /**
   * WHICH VALUES ARE TOO LONG FOR THIS GRAPHIC — the field ids the runtime could not make fit
   * even at its readability floor (`noacgTextOverflow()`, today the SVG import's fit ladder;
   * docs/SVG_IMPORT_PLAN.md §3). `undefined` from a template that answers no such question.
   *
   * It rides the STATE message rather than `PreviewMachineState` on purpose: that object is
   * whatever the template's own `noacgMachineState()` returned and must stay untouched, and
   * every surface that wants the overflow is already asking for state once a second. One poll,
   * two answers, and a template that has neither still replies `{ state: null }` as before.
   */
  overflow?: string[] | null;
  /**
   * HOW FAR THE DOCUMENT'S ANIMATIONS HAVE RUN — the summed playhead of every animation GSAP
   * holds plus every web animation the document is running, in milliseconds. It is a reading, not a verdict: two consecutive replies with the
   * SAME number mean nothing moved in between, which is how a caller tells a settled graphic
   * from one still playing.
   *
   * The browser-output renderer's boot catch-up replays missed commands off air and has to know
   * when that replay has finished before it comes back on air. A fixed timer cannot know, and a
   * renderer that guessed short put the replay's exits on air (docs/CLOUD_PLAYOUT.md §3).
   * Asking "is any tween active" was tried first and is wrong: a template leaves a built-but-
   * unplayed timeline parked on the global timeline, and GSAP reports that one as active for
   * ever (measured 2026-09-22 on the house lower third). A playhead that stops advancing is the
   * honest question. It rides the state reply for the same reason `overflow` does: the asking is
   * already there. `undefined` from a document that predates the field or carries no GSAP.
   */
  motion?: number;
}

/** Pushed on every animation frame by the document (composeDocument's `simulate` script), so a
 *  listener (StepTimeline/LegacyTimeline) can draw a live playhead without polling
 *  `contentWindow` — this iframe carries no `allow-same-origin`. Same cadence as the polling rAF
 *  loop this replaced; `active` is false whenever no simulator timeline (`__activeTl`/
 *  `__scrubTl`) is running, letting a listener's "settled at rest" fallback react to the
 *  transition instead of needing its own continuous poll.
 *
 *  `runId` is a monotonic counter the document stamps onto every NEW `__activeTl`/`__scrubTl` it
 *  creates (simulatorRuntime.ts's `runSimCommand`) — the wire equivalent of the object-identity
 *  check the original code made directly against `contentWindow.__activeTl` ("a new run reclaims
 *  the playhead from a paused scrub"). A listener compares `runId` to the last one it saw rather
 *  than comparing object references, which a postMessage payload can never preserve. */
export interface PreviewPlayheadMessage {
  type: typeof PREVIEW_PLAYHEAD_TYPE;
  active: boolean;
  phase: string;
  time: number;
  duration: number;
  runId: number;
}
