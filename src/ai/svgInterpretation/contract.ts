// The SVG proposal contract, v1 (docs/work-specs/jev-svg-import/spec.md, row 4, AC-4).
//
// A PROPOSAL is what an interpreter - today's name-based reader, later a qualified model - says
// about one imported SVG: which layers become operator fields, which behaviour recipes bind which
// layers, and what is still undecided about each behaviour. It is a proposal and nothing more:
// `validate.ts` decides whether it may be used at all, and row 5 applies an accepted one through
// the existing draft. The rules it enforces are written out in
// docs/work-specs/jev-svg-import/evidence/phase-04.md (R1-R7).
//
// SVG TEXT IS DATA. A proposal holds ids, enumerated values, booleans, row indexes and an optional
// field title - never a sample, markup, code or a free-form note - so nothing the artwork's words
// say can travel through it as an instruction, and nothing it says can rewrite the artwork's words.
//
// Dependency-light on purpose (the lite/types.ts rule): the browser, the Node tests and a future
// server adapter all import it, so only types cross in from the reader.

import type { SvgImportResult } from '../../assets/svgImport';
import type { StructuredOutput } from '../modelTypes';

export const SVG_PROPOSAL_VERSION = 1;

export const SVG_PROPOSAL_LIMITS = {
  fields: 256,
  components: 16,
  picks: 128,
  titleChars: 60,
  idChars: 32,
} as const;

/** Undecided: nobody has made this choice, and the import must ask rather than guess. */
export const UNRESOLVED = 'unresolved';
/** The recipe's own declared defaults, which today's deterministic import uses. Not the same as
 *  undecided: a reliable import needs no question. */
export const RECIPE_DEFAULT = 'default';

/**
 * The INTENT a behaviour leaves open, per recipe id: each key is a decision the artwork cannot
 * make, so recognising a quiz says nothing about its lock and recognising a clock nothing about
 * its direction. Every key is required in a proposal. Recipes not listed have no intent keys.
 *
 * `clock` is the instanced recipe row 7 adds; until a caller allows it, it stays unsupported.
 * It offers no `default`: the spec makes an absent clock intent a decision.
 */
export const SVG_INTENT: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  quiz: {
    lock: [RECIPE_DEFAULT, 'lock', 'no-lock', UNRESOLVED],
    reveal: [RECIPE_DEFAULT, 'manual', 'automatic', UNRESOLVED],
  },
  credits: {
    layout: [RECIPE_DEFAULT, 'role-above', 'role-beside', UNRESOLVED],
    playback: [RECIPE_DEFAULT, 'static', 'roll', 'cards', UNRESOLVED],
  },
  clock: {
    mode: ['count-up', 'duration', 'target-time', UNRESOLVED],
  },
};

/** Value pairs the spec rules out whatever a caller allows: a no-Lock quiz reveals manually. */
export const SVG_UNSUPPORTED_INTENT: readonly { recipe: string; when: Readonly<Record<string, string>> }[] = [
  { recipe: 'quiz', when: { lock: 'no-lock', reveal: 'automatic' } },
];

/** The capability a countdown field needs. */
export const COUNTDOWN_CAPABILITY = 'countdown';

/** The capability id of one specific intent value: `quiz.lock:no-lock`. */
export function intentCapability(recipe: string, key: string, value: string): string {
  return `${recipe}.${key}:${value}`;
}

/** One layer the proposal decides about: whether the operator edits it, and as what. */
export interface SvgProposalField {
  /** A text, picture or outline candidate id from the reader's inventory. */
  layer: string;
  on: boolean;
  /** Text candidates only: plain text, or the countdown readout. */
  kind?: 'text' | 'countdown';
  /** The operator-facing label. Plain words, data like everything else here. */
  title?: string;
}

/** One layer a recipe role is bound to. */
export interface SvgProposalPick {
  /** A role id the recipe declares (`team`, `team.flash`). */
  role: string;
  layer: string;
  /** The row of a per-row role (team 0, answer 2); absent on a graphic-level role. */
  row?: number;
}

/** One behaviour recipe bound to the artwork. */
export interface SvgProposalComponent {
  /** Unique within the proposal: `[a-z][a-z0-9-]*`. */
  id: string;
  recipe: string;
  picks: SvgProposalPick[];
  /** Every intent key of the recipe, each a listed value. */
  intent: Record<string, string>;
}

export interface SvgProposal {
  version: typeof SVG_PROPOSAL_VERSION;
  /** `svgSourceRevision` of the inventory the proposal was made from. */
  sourceRevision: string;
  fields: SvgProposalField[];
  components: SvgProposalComponent[];
}

/** What the reader found, as validation needs it. */
export type SvgProposalInventory = Pick<SvgImportResult, 'markup' | 'candidates' | 'images' | 'outlines' | 'groups' | 'shapes'>;

/** One recipe's roles, as its declaration states them (src/templates/behaviours). The caller
 *  builds this table from the recipe declarations, so the contract never copies them. */
export interface SvgRecipeRoles {
  /** An instanced recipe composes freely; a full one is one per graphic. */
  instanced?: boolean;
  /** The most rows a recipe with rows takes. */
  rowsMax?: number;
  roles: Readonly<Record<string, { kind: 'field' | 'layer'; pool?: 'text' | 'drawn'; perRow?: boolean }>>;
}

export interface SvgProposalContext {
  inventory: SvgProposalInventory;
  recipes: Readonly<Record<string, SvgRecipeRoles>>;
  /** Recipe ids, `recipe.key:value` ids and `countdown` the caller supports. */
  capabilities: readonly string[];
}

export type SvgProposalErrorCode =
  | 'invalid-shape'
  | 'unexpected-key'
  | 'invalid-value'
  | 'stale-revision'
  | 'unknown-layer'
  | 'wrong-layer-kind'
  | 'unknown-role'
  | 'conflicting-ownership'
  | 'duplicate-component'
  | 'unsupported-capability'
  | 'missing-intent';

export interface SvgProposalError {
  code: SvgProposalErrorCode;
  /** Where in the proposal: `components[1].picks[0].layer`. */
  at: string;
  /** Ids and enumerated words only; never a title or other proposal text. */
  detail: string;
}

export interface SvgUnresolvedIntent {
  component: string;
  key: string;
}

export type SvgProposalVerdict =
  | { ok: true; proposal: SvgProposal; unresolved: SvgUnresolvedIntent[] }
  | { ok: false; errors: SvgProposalError[] };

// ---- Source revision ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a byte string, synchronously: validation runs inside a draft update, where the
 *  browser's `crypto.subtle` would force everything after it to be asynchronous. */
function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** The revision a proposal is pinned to: the SHA-256 of the sanitized markup, which carries the
 *  layer markers and the text, so any change to the artwork the proposal read moves it. */
export function svgSourceRevision(markup: string): string {
  return `sha256:${sha256Hex(new TextEncoder().encode(markup))}`;
}

// ---- The structured output a model would be forced into ----

const id = { type: 'string', minLength: 1, maxLength: SVG_PROPOSAL_LIMITS.idChars };
const intentValues = [...new Set(Object.values(SVG_INTENT).flatMap((keys) => Object.values(keys).flat()))];
const intentKeys = [...new Set(Object.values(SVG_INTENT).flatMap((keys) => Object.keys(keys)))];

/**
 * The shape alone, for a provider's forced output and the gateway's revalidation. It is a screen,
 * not the contract: whether ids are real, roles fit, ownership is single and capabilities are
 * allowed needs the inventory, so `validateSvgProposal` is what decides. Built from the constants
 * above, so the two vocabularies cannot drift.
 */
export const SVG_PROPOSAL_OUTPUT: StructuredOutput = {
  name: 'emit_svg_proposal',
  description: 'Propose which SVG layers are operator fields and which behaviour recipes bind them.',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'sourceRevision', 'fields', 'components'],
    properties: {
      version: { type: 'integer', minimum: SVG_PROPOSAL_VERSION, maximum: SVG_PROPOSAL_VERSION },
      sourceRevision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
      fields: {
        type: 'array',
        maxItems: SVG_PROPOSAL_LIMITS.fields,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['layer', 'on'],
          properties: {
            layer: id,
            on: { type: 'boolean' },
            kind: { type: 'string', enum: ['text', 'countdown'] },
            title: { type: 'string', minLength: 1, maxLength: SVG_PROPOSAL_LIMITS.titleChars },
          },
        },
      },
      components: {
        type: 'array',
        maxItems: SVG_PROPOSAL_LIMITS.components,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'recipe', 'picks', 'intent'],
          properties: {
            id: { type: 'string', pattern: `^[a-z][a-z0-9-]{0,${SVG_PROPOSAL_LIMITS.idChars - 1}}$` },
            recipe: id,
            picks: {
              type: 'array',
              maxItems: SVG_PROPOSAL_LIMITS.picks,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['role', 'layer'],
                properties: {
                  role: id,
                  layer: id,
                  row: { type: 'integer', minimum: 0, maximum: SVG_PROPOSAL_LIMITS.picks - 1 },
                },
              },
            },
            intent: {
              type: 'object',
              additionalProperties: false,
              properties: Object.fromEntries(intentKeys.map((k) => [k, { type: 'string', enum: intentValues }])),
            },
          },
        },
      },
    },
  },
};
