// The playout protocol: what the NoaCG page and NoaCG Bridge say to each other (docs/BRIDGE.md).
//
// This file is MIRRORED byte for byte at src/control/playoutProtocol.ts, and cli/test/playout.test.mjs
// refuses the two drifting apart. The vocabulary is deliberately not CasparCG's: the page speaks
// TARGET (which server), ITEM (what is in its library), SLOT (where on it) and VERB (what to do),
// and only the casparcg slot knows about channels and layers. OBS, vMix and an OGraf renderer add
// their own adapter id, item kinds and slot shape without the page's model moving.

/** Bumped only when a route's MEANING changes. Additive fields never bump it. */
export const PLAYOUT_V = 2;

/** The adapters a Bridge may carry. `/health` says which ones this build has. */
export type AdapterId = 'casparcg';

/** Which playout system, and where. Named in every request: the Bridge stores no configuration. */
export interface Target {
  adapter: AdapterId;
  host: string;
  port: number;
}

/** Where on a CasparCG server: a channel and a layer. */
export interface CasparSlot {
  adapter: 'casparcg';
  channel: number;
  layer: number;
}

export type Slot = CasparSlot;

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
  | { verb: 'take'; item: ItemRef; slot: Slot; data?: Record<string, string>; loop?: boolean }
  | { verb: 'update'; slot: Slot; data: Record<string, string> }
  | { verb: 'next' | 'out' | 'pause' | 'resume'; slot: Slot; item?: ItemRef };

export type PlayoutVerb = PlayoutAction['verb'];

/** One entry of a target's library, as `/list` returns it. */
export interface ListItem {
  name: string;
  /** The target's own word for it: `template`, or `movie` / `still` / `audio` for media. */
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
  | 'usage';

export interface AgentError {
  /** `agent` is the Bridge itself refusing; `target` is the playout system behind it. */
  hop: 'agent' | 'target';
  code: AgentErrorCode;
  /** One sentence naming what happened. */
  detail: string;
  /** The target's own status line, when there was one. */
  raw?: string;
}

/** What `GET /health` answers, to any origin and without a token. */
export interface HealthReply {
  ok: true;
  agent: 'noacg-bridge';
  v: number;
  version: string;
  adapters: AdapterId[];
}

export interface StatusReply {
  ok: true;
  /** The target's own version string. */
  version: string;
  raw: string;
}

export interface ListReply {
  ok: true;
  items: ListItem[];
}

export interface ThumbnailReply {
  ok: true;
  /** Base64 PNG, as CasparCG returns it. */
  png: string;
}

export interface ActReply {
  ok: true;
  raw: string;
}

export interface ErrorReply {
  ok: false;
  error: AgentError;
}
