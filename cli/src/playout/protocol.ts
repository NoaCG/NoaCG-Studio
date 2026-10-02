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
 * How a media file plays (docs/CLIP_PLAYBACK_PLAN.md §9): one descriptor for a take and for each
 * entry of a sequence. Every field is optional, and an action without one plays exactly as it did
 * before any of them existed. Times are SECONDS, never frames: the adapter converts them with the
 * channel's own rate. A Bridge refuses a field its adapter cannot honour, naming the hop, and never
 * drops one.
 */
export interface MediaPlayback {
  /** What the file does at its end: `clear` empties the layer (fading for `fadeOut`), `loop`
   *  repeats it until Out. Absent = it holds its last frame. Playing another file next is a
   *  `sequence`, never an ending. */
  end?: 'hold' | 'clear' | 'loop';
  /** A MIX into this file from whatever the layer showed before it. */
  fadeIn?: number;
  /** The fade to nothing when the file ends into nothing: `clear` at its end. Out carries its own. */
  fadeOut?: number;
  /** A linear gain on the file's own sound, from the cue's level (10^(dB/20)). Absent = 1. It goes
   *  out with the file, so it stays with the file when the server switches to it by itself. */
  gain?: number;
  /** The part of the file that plays, seconds into the file. */
  trim?: { in?: number; out?: number };
}

/** The shortest a member of a sequence after the first may play, seconds: the Bridge queues each
 *  next file while the one before it plays, reading four times a second, so this is always in
 *  time. In a sequence that loops the first follows the last, so it counts for every member. The
 *  page offers Play next and the Bridge accepts a sequence by this one number. */
export const MIN_SEQUENCE_MEMBER_S = 2;

/** The most files one sequence plays: the Bridge refuses a longer one, and the page says so first. */
export const MAX_SEQUENCE_ENTRIES = 100;

/** How long a file plays from `start` to `end` in it, seconds: the end clamped to the file's
 *  length, never below nothing; unknown when neither an end nor the file's length is known. The one
 *  trim rule both sides count with - the Bridge's refusals, the page's Play next and TO STUDIO. */
export function playedSeconds(whole: number | undefined, start = 0, end?: number): number | undefined {
  const stop = end === undefined ? whole : whole === undefined ? end : Math.min(end, whole);
  return stop === undefined ? undefined : Math.max(0, stop - start);
}

/** One file of a sequence: what plays, how, the cue it came from, and what the server's own list
 *  says the file is. A still never ends, so it can never be one. */
export interface SequenceEntry {
  item: ItemRef;
  cueId?: string;
  playback?: MediaPlayback;
  /** The server's word for the file and its whole length in seconds, from its list. The Bridge
   *  refuses a member that could not be queued ahead in time (docs/CLIP_PLAYBACK_PLAN.md §6.10). */
  media: { kind: 'movie' | 'audio'; seconds: number };
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
   *  from before it reads the action field by field and never sees it. `playback` is for media
   *  only; a Bridge that does not list the `playback` feature must never be sent one. */
  | { verb: 'take'; item: ItemRef; slot: Slot; data?: Record<string, string>; loop?: boolean; cueId?: string; playback?: MediaPlayback }
  | { verb: 'update'; slot: Slot; data: Record<string, string> }
  | { verb: 'next' | 'pause' | 'resume'; slot: Slot; item?: ItemRef }
  /** `fadeOut` fades a clip to nothing rather than cutting it. */
  | { verb: 'out'; slot: Slot; item?: ItemRef; fadeOut?: number }
  /** Remove whatever is in the slot at once, with no exit: the All out an OGraf server offers. */
  | { verb: 'clear'; slot: Slot }
  /** Play the first entry now and each of the rest when the one before it ends, run by the Bridge
   *  (Play next and a Play-through folder, docs/CLIP_PLAYBACK_PLAN.md §6.10). Needs the `sequence`
   *  feature and capability. `loop` plays the first entry again after the last, until Out (Loop the
   *  folder): no entry then has an ending of its own, and it needs the `sequence-loop` feature too.
   *  A Bridge without that feature reads the action field by field and would drop `loop`, so the
   *  page never sends it one. */
  | { verb: 'sequence'; slot: Slot; entries: SequenceEntry[]; loop?: boolean }
  /** Change how the clip on air ends while it plays, without playing it again: the operator lets a
   *  clip loop until the host is ready, then moves on. `item` is the clip the page believes is on
   *  air; the Bridge refuses the change unless it started that clip there itself. `playback` is the
   *  new ending and the fade a Clear ends on (absent = hold its last frame); `then` instead plays
   *  these files after it, run as a sequence whose first entry is the clip already on air. Needs the
   *  `ending` feature: a Bridge without it refuses the verb. */
  | { verb: 'ending'; slot: Slot; item: ItemRef; playback?: Pick<MediaPlayback, 'end' | 'fadeOut'>; then?: SequenceEntry[] };

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
 *  Bridge that lists none is older than all of them. It says nothing about any server.
 *  `playback` is a take's `playback` and an out's `fadeOut`; `sequence` is the `sequence` verb, and
 *  `sequence-loop` a sequence's `loop`. `servers` is `/servers` and `/connect`: the CasparCG
 *  servers this Bridge remembers connecting to. `studio` is each remembered server's `studio` and
 *  `/studio`, which keeps it. `pair-link` is `/pair-link`: a fresh pairing code for another browser.
 *  `ending` is the `ending` verb: a clip's ending changed while it plays. `channels` is `/channels`:
 *  the channels a server reports it has. */
export type BridgeFeature = 'state' | 'playback' | 'sequence' | 'sequence-loop' | 'servers' | 'studio' | 'pair-link' | 'ending' | 'channels';

/** What a TARGET can do, from its adapter and its version. `/status` lists them, because only
 *  a request that names a target can say. The page offers a control only when both lists say yes.
 *  `end` is a clip's Clear at its end, `fade` its fades, `trim` its start and end in the file,
 *  `level` its gain, and `sequence` playing one file after another. */
export type TargetCapability = 'state' | 'end' | 'fade' | 'trim' | 'level' | 'sequence';

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
 * How a studio uses one CasparCG server (docs/work-specs/studio-day-playout D7): its channels as the
 * studio names them, where NoaCG's own output plays, and where new media starts. The page owns what
 * it means; the Bridge keeps it per server so every browser paired with it opens with the same setup.
 */
export interface StudioSetup {
  /** The server's channels, each with the studio's name for it (`Channel 2` until renamed). */
  channels: { channel: number; name: string }[];
  /** The NoaCG output's slot: the one slot no server item may take. */
  output: { channel: number; layer: number };
  /** The channel a new server video, still or audio file starts on. */
  newMedia: number;
}

/** The most channel rows a studio setup holds. */
export const MAX_STUDIO_CHANNELS = 99;
/** The longest name a channel row keeps, in characters. */
export const MAX_CHANNEL_NAME = 60;
/** The highest channel number, and the highest layer, a studio setup holds. */
export const MAX_STUDIO_CHANNEL = 999;
export const MAX_STUDIO_LAYER = 9999;

/** A CasparCG server a Bridge remembers connecting to: host and port, and with the `studio` feature
 *  the studio's setup for it once a page has kept one there. */
export interface RememberedServer {
  host: string;
  port: number;
  studio?: StudioSetup;
}

/** One channel a server reports having: its number and its video mode in the server's own words
 *  (`1080i5000`). */
export interface ServerChannel {
  channel: number;
  mode: string;
}

/** What `POST /channels` answers, given `{ target }`: the server's channels, read off a bare `INFO`
 *  (CasparCG). Nothing is sent to a layer. */
export interface ChannelsReply {
  ok: true;
  channels: ServerChannel[];
}

/** What `POST /servers` answers: the servers this Bridge connected to, most recent first. */
export interface ServersReply {
  ok: true;
  servers: RememberedServer[];
}

/** What `POST /connect` answers: `/status`, and the list with this server now first. */
export interface ConnectReply extends StatusReply {
  servers: RememberedServer[];
}

/** What `POST /studio` answers, given `{ target, studio }` for a server in the list: the list, with
 *  that server's setup replaced. It contacts no server. */
export interface StudioReply {
  ok: true;
  servers: RememberedServer[];
}

/** What `POST /pair-link` answers: a fresh one-time pairing code, good for `expiresIn` seconds. The
 *  page puts it in a link for another browser, on its own origin and this Bridge's port. */
export interface PairLinkReply {
  ok: true;
  code: string;
  expiresIn: number;
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
  /** A sequence this Bridge runs on the slot: the entries still to play after the one on air, in
   *  order. The slot's `cueId` is the entry on air. `loop`: it starts over after its last entry until
   *  Out, and `next` is then every other entry in the order they play from here. It is never the
   *  server's own LOOP on one file, which is `loop` above. */
  sequence?: { next: SequenceEntry[]; loop?: boolean };
  /** The slot's action counter as of this reading. Every Take, Out, Clear, Pause and Resume moves
   *  it first. */
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
  /** The action happened, and a later part of it did not: a clip on air whose Clear at the end the
   *  server refused, say. One sentence for the operator. */
  warning?: string;
}

export interface ErrorReply {
  ok: false;
  error: AgentError;
}
