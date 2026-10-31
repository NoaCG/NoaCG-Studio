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

import { audioHash } from '../../assets/audioHash.ts';
import type { SvgImportResult } from '../../assets/svgImport';
import type { StructuredOutput } from '../modelTypes';

export const SVG_PROPOSAL_VERSION = 1;

export const SVG_PROPOSAL_LIMITS = {
  fields: 256,
  components: 16,
  /** Per component: room for the widest declared recipe at its row limit (the bingo's 90 rows
   *  of three per-row roles, plus its board-level ones). */
  picks: 512,
  /** A row index's ceiling; the recipe's own `rowsMax` is the real limit. */
  rows: 256,
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

/** The capability a countdown FIELD needs - distinct from the `countdown` recipe's id, so a
 *  caller can allow the readout without the recipe, or the recipe without the readout. */
export const COUNTDOWN_CAPABILITY = 'field.countdown';

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
  roles: Readonly<Record<string, {
    kind: 'field' | 'layer';
    pool?: 'text' | 'drawn';
    perRow?: boolean;
    /** The role IS the countdown readout (the countdown recipe's clock). */
    countdown?: boolean;
  }>>;
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
  /** Ids and enumerated words only, never a title or other proposal text: a value that is not
   *  shaped like an id is named `(not an id)`, so an error fed back cannot carry an instruction. */
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

/** The revision a proposal is pinned to: the SHA-256 of the sanitized markup, which carries the
 *  layer markers and the text, so any change to the artwork the proposal read moves it. The
 *  shared synchronous SHA-256 (named for its first use), because validation runs inside a draft
 *  update, where `crypto.subtle` would make everything after it asynchronous. */
export function svgSourceRevision(markup: string): string {
  return `sha256:${audioHash(new TextEncoder().encode(markup))}`;
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
                  row: { type: 'integer', minimum: 0, maximum: SVG_PROPOSAL_LIMITS.rows - 1 },
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
