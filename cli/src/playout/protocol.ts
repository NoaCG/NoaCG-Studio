// The playout protocol: what the NoaCG page and NoaCG Bridge say to each other (docs/BRIDGE.md).
//
// This file is MIRRORED byte for byte at src/control/playoutProtocol.ts, and cli/test/playout.test.mjs
// refuses the two drifting apart. The vocabulary is deliberately not CasparCG's: the page speaks
// TARGET (which server), ITEM (what is in its library), SLOT (where on it) and VERB (what to do),
// and only the casparcg slot knows about channels and layers. An OGraf server brought its own
// target and slot additively; OBS and vMix add theirs the same way, without the page's model moving.

/** Bumped only when a route's MEANING changes. Additive fields never bump it. */
export const PLAYOUT_V = 2;

/** The adapters a Bridge may carry. `/health` says which ones this build has. */
export type AdapterId = 'casparcg' | 'ograf';

/** Which CasparCG server: its AMCP host and port. */
export interface CasparTarget {
  adapter: 'casparcg';
  host: string;
  port: number;
}

/** Which OGraf server: the base URL of its Server API. `/ograf/v1` is appended unless the URL
 *  already ends in it, so `http://gfx:8080` and `http://gfx:8080/api/ograf/v1` both work. */
export interface OgrafTarget {
  adapter: 'ograf';
  baseUrl: string;
}

/** Which playout system, and where. Named in every request: the Bridge stores no configuration. */
export type Target = CasparTarget | OgrafTarget;

/** Where on a CasparCG server: a channel and a layer. */
export interface CasparSlot {
  adapter: 'casparcg';
  channel: number;
  layer: number;
}

/** A renderer's own identifier for one of its render targets, shaped by the renderer's
 *  `renderTargetSchema`. The OGraf standard allows only a shallow object. */
export type RenderTargetId = Record<string, string | number | boolean>;

/** Where on an OGraf server: a renderer, and a render target inside it. The target is opaque -
 *  whatever the renderer's schema says, never a channel number. */
export interface OgrafSlot {
  adapter: 'ograf';
  rendererId: string;
  renderTarget: RenderTargetId;
}

export type Slot = CasparSlot | OgrafSlot;

/** What a library holds. `url` is a web page the target's browser engine loads - the NoaCG
 *  output URL is one - and is never listed, only taken. */
export type ItemKind = 'template' | 'media' | 'url';

export interface ItemRef {
  kind: ItemKind;
  name: string;
}

/**
 * One operator verb. Each one is one command on the target, and the payload carries no page
 * state, so the same object can later travel as a row in the durable command log. A slot-only
 * verb may name the `item` the page believes is in the slot: `out` on a template plays its exit
 * through the CG layer, where `out` on a clip stops the video layer.
 */
export type PlayoutAction =
  /** `cueId` names the page's cue, which the Bridge keeps with what it started so a reading can
   *  match the slot back to its cue after a reload (docs/CLIP_PLAYBACK_PLAN.md §6.7). A Bridge
   *  from before it reads the action field by field and never sees it. */
  | { verb: 'take'; item: ItemRef; slot: Slot; data?: Record<string, string>; loop?: boolean; cueId?: string }
  | { verb: 'update'; slot: Slot; data: Record<string, string> }
  | { verb: 'next' | 'out' | 'pause' | 'resume'; slot: Slot; item?: ItemRef }
  /** Remove whatever is in the slot at once, with no exit: the All out an OGraf server offers. */
  | { verb: 'clear'; slot: Slot };

export type PlayoutVerb = PlayoutAction['verb'];

/** One entry of a target's library, as `/list` returns it. */
export interface ListItem {
  /** What a take names: a CasparCG path, or an OGraf graphic's id. */
  name: string;
  /** The name to show, when the target keeps one apart from `name` (an OGraf graphic's own). */
  label?: string;
  /** The target's own word for it: `template`, `movie` / `still` / `audio` for media, or `graphic`. */
  kind: string;
  frames?: number;
  fps?: number;
  bytes?: number;
  /** `YYYYMMDDHHMMSS` as the target reports it, for cache keys and "changed" labels. */
  changed?: string;
}

/** Which hop failed, and why, in words the page can show. */
export type AgentErrorCode =
  | 'no-media-scanner'
  | 'refused'
  | 'unreachable'
  | 'not-found'
  | 'unsupported'
  | 'usage'
  /** The command was sent and no clear answer came back: it may or may not have happened.
   *  Look at the output before repeating it - the Bridge never retries one by itself. */
  | 'uncertain';

export interface AgentError {
  /** `agent` is the Bridge itself refusing; `target` is the playout system behind it. */
  hop: 'agent' | 'target';
  code: AgentErrorCode;
  /** One sentence naming what happened. */
  detail: string;
  /** The target's own status line, when there was one. */
  raw?: string;
}

/** What a Bridge understands beyond the routes every v2 Bridge answers. `/health` lists them; a
 *  Bridge that lists none is older than all of them. It says nothing about any server. */
export type BridgeFeature = 'state';

/** What a TARGET can do, from its adapter and its version. `/status` lists them, because only
 *  a request that names a target can say. The page offers a control only when both lists say yes. */
export type TargetCapability = 'state';

/** What `GET /health` answers, to any origin and without a token. */
export interface HealthReply {
  ok: true;
  agent: 'noacg-bridge';
  v: number;
  version: string;
  adapters: AdapterId[];
  features?: BridgeFeature[];
}

export interface StatusReply {
  ok: true;
  /** The target's own version string. */
  version: string;
  raw: string;
  capabilities?: TargetCapability[];
}

/**
 * What one slot holds, as the Bridge read it off the server (`POST /state`,
 * docs/CLIP_PLAYBACK_PLAN.md §6.7). Times are seconds. A clip's `segment` is the part of the file
 * that plays - its start in the file and its length - and `position` is how far into the SEGMENT
 * it is, so a trimmed clip counts down its own length, never the file's.
 */
export interface SlotState {
  /** The slot's layer; the channel is the request's. */
  layer: number;
  /** `empty` after a STOP, `colour` after `PLAY … EMPTY`; nothing is on air in either. */
  producer: 'video' | 'still' | 'colour' | 'html' | 'empty' | 'other';
  /** A clip's or audio file's name as it was played; a still's or a page's path. */
  file?: string;
  segment?: { start: number; length: number };
  position?: number;
  paused: boolean;
  loop: boolean;
  /** While a MIX into this clip is running, how far it has got, 0 to 1. */
  transition?: { progress: number };
  /** The file waiting behind it (`LOADBG`), and whether it plays by itself at the end (`AUTO`). */
  queued?: { file: string; auto: boolean };
  /** What this Bridge started here and still sees playing: its id, and the cue the page named. */
  instance?: string;
  cueId?: string;
  /** This Bridge's take on the slot is not on the layer yet: the server answers a PLAY before the
   *  clip is there, and for a moment the layer still shows what it held before (nothing, or the
   *  previous clip). The rest of the reading is that previous content, not the take's. */
  arriving?: boolean;
  /** The slot's action counter as of this reading. Every Take, Out and Clear moves it first. */
  generation: number;
}

/** `POST /state` with `{ target, channel }`: every layer the channel holds, and every layer this
 *  Bridge acted on there even when the server no longer reports it. */
export interface StateReply {
  ok: true;
  channel: number;
  /** This Bridge process. Every instance id starts with it, so an instance from before a restart
   *  can be told from one somebody else started. */
  session: string;
  /** The Bridge's own monotonic clock at the reading, ms. */
  observedAt: number;
  slots: SlotState[];
}

/** One renderer an OGraf server offers, with the targets it reports and the schema a render
 *  target identifier must follow. */
export interface PlayoutRenderer {
  id: string;
  name: string;
  description?: string;
  /** The renderer's GDD object schema for `OgrafSlot.renderTarget`, as the server sent it. */
  renderTargetSchema?: Record<string, unknown>;
  /** The render targets the renderer reports, each with its own label. */
  targets?: { renderTarget: RenderTargetId; name: string; description?: string }[];
}

export interface ListReply {
  ok: true;
  items: ListItem[];
  /** Where the items can play, from a target that has renderers (OGraf). */
  renderers?: PlayoutRenderer[];
}

export interface ThumbnailReply {
  ok: true;
  /** Base64 PNG, as CasparCG returns it. */
  png: string;
}

export interface ActReply {
  ok: true;
  raw: string;
  /** The slot's generation after this action: a reading older than it is from before it. */
  generation?: number;
  /** The Bridge process that counted it. A restarted Bridge counts from zero again, so a
   *  generation only compares with readings from the same session. */
  session?: string;
  /** A take's instance id, which the slot's readings carry for as long as it plays. */
  instance?: string;
}

export interface ErrorReply {
  ok: false;
  error: AgentError;
}
