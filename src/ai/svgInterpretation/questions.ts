// The SERVER'S OWN QUESTIONS about one SVG's evidence, and what their answers propose
// (docs/work-specs/jev-svg-import/spec.md, row 32; phase-31 rule 9).
//
// A decision model answers typed questions about `state`. The questions are built here from a
// frozen template set (docs/work-specs/jev-svg-import/evaluation/prompts.json) and from
// READER-MADE layer ids only (`t3`, checked against EVIDENCE_LAYER_ID): nothing the artwork says,
// neither its words nor its layer names, can reach an instruction. The artwork's names and text
// stay values inside `state`.
//
// What is asked: whether each behaviour family is present (scoreboard, clock, quiz, credits),
// and, for each text layer, whether it is a value the operator edits rather than fixed artwork.
// Behaviour INTENT (clock direction, quiz lock, credits playback) is never asked: the artwork
// cannot decide it, so every answer leaves it unresolved, as the contract requires.

import { EVIDENCE_LAYER_ID, type SvgDecisionEvidence } from './evidence.ts';

export const SVG_BEHAVIOUR_FAMILIES = ['scoreboard', 'clock', 'quiz', 'credits'] as const;
export type SvgBehaviourFamily = (typeof SVG_BEHAVIOUR_FAMILIES)[number];

/** The adapter's bounds on questions (api/_lib/aiSvgInterpretationProfile.ts). */
export const SVG_QUESTION_LIMITS = { questions: 32, instructionChars: 400, criterionChars: 160 } as const;

export interface SvgQuestionTemplates {
  /** One instruction per family: is this kind of behaviour drawn in the artwork? */
  behaviour: Record<SvgBehaviourFamily, string>;
  /** One instruction per text layer; `{layer}` is replaced by the reader's layer id. */
  field: string;
  fieldCriteria?: { true: string; false: string };
}

export type SvgBooleanQuestion = { type: 'boolean'; instructions: string; criteria?: { true: string; false: string } };

export interface SvgQuestionSet {
  questions: Record<string, SvgBooleanQuestion>;
  families: { key: string; family: SvgBehaviourFamily }[];
  fields: { key: string; layer: string }[];
  /** Text layers past the question bound: they keep the deterministic decision. */
  notAsked: string[];
}

export const familyKey = (family: SvgBehaviourFamily) => `behaviour_${family}`;
export const fieldKey = (layer: string) => `field_${layer}`;

/** The questions for one piece of evidence, within the adapter's bounds. */
export function buildSvgQuestions(evidence: SvgDecisionEvidence, templates: SvgQuestionTemplates): SvgQuestionSet {
  const questions: Record<string, SvgBooleanQuestion> = {};
  const families = SVG_BEHAVIOUR_FAMILIES.map((family) => {
    const key = familyKey(family);
    questions[key] = { type: 'boolean', instructions: templates.behaviour[family] };
    return { key, family };
  });
  const room = SVG_QUESTION_LIMITS.questions - families.length;
  const texts = evidence.layers.filter((l) => l.kind === 'text' && EVIDENCE_LAYER_ID.test(l.id)).map((l) => l.id);
  const fields = texts.slice(0, room).map((layer) => {
    const key = fieldKey(layer);
    questions[key] = {
      type: 'boolean',
      instructions: templates.field.split('{layer}').join(layer),
      ...(templates.fieldCriteria ? { criteria: { ...templates.fieldCriteria } } : {}),
    };
    return { key, layer };
  });
  return { questions, families, fields, notAsked: texts.slice(room) };
}

export interface SvgDecisionReading {
  families: SvgBehaviourFamily[];
  fieldsOn: string[];
}

/**
 * What the answers propose: a family or a field is ON when its probability reaches the frozen
 * threshold. Any layer that was not asked about (past the question bound, or never in the
 * evidence at all) keeps the deterministic decision (`fallbackOn`). Answers are the adapter's
 * checked answers, so every asked key is present and boolean.
 */
export function readSvgAnswers(
  set: SvgQuestionSet,
  answers: Record<string, { type: 'boolean'; probability: number }>,
  threshold: number,
  fallbackOn: readonly string[],
): SvgDecisionReading {
  const yes = (key: string) => (answers[key]?.probability ?? 0) >= threshold;
  const asked = new Set(set.fields.map((f) => f.layer));
  return {
    families: set.families.filter((f) => yes(f.key)).map((f) => f.family),
    fieldsOn: [
      ...set.fields.filter((f) => yes(f.key)).map((f) => f.layer),
      ...fallbackOn.filter((layer) => !asked.has(layer)),
    ],
  };
}
