// THE STRUCTURED VISUAL CRITIQUE - the subjective layer, asked as nine yes/no questions off a
// rendered frame (docs/PRO_HARNESS_PLAN.md §6). The questions are docs/VISUAL_TASTE_REVIEW.md's,
// verbatim in spirit: the five axes (hierarchy, composition, restraint, coherence, on-air
// quality) and the four text questions (centred, inside, aligned to the graphic, grows as
// implied). They were calibrated against sixteen frames the owner judged blind: every AIR frame
// answers all nine YES, every FAIL has a NO on the question that names his reason.
//
// THREE RULES, ALL PAID FOR:
//   1. The critic runs AFTER the deterministic gate and only when the gate is clean, or when the
//      loop asks for a second opinion on a stalled round. Anything a script can measure is not a
//      question for a vision model (the deterministic instruments own overflow, collisions,
//      contrast, size).
//   2. Its answers are ADVISORY. The 2026-08-19 calibration put every subjective-adjacent
//      question at or near chance for a cheap vision model (textCutOff 38%, lowContrast 14%,
//      boxMisaligned 17%), and only `lineOnText` reached 100% precision. So a NO here feeds the
//      model as an advisory finding with the critic's evidence sentence, and never blocks by
//      itself - a threshold that fits the data can still assert something the owner does not
//      believe.
//   3. It runs ONCE per generation by default (`critiqueBudget`). The owner's finding is that a
//      first refinement helps and further "look again" passes do almost nothing; a critic that
//      re-runs after every repair is that blind loop with a schema on it.
//
// The schema is what makes the output actionable: every NO carries the evidence the critic saw
// (which element, where), so a repair can name what it addressed.

import { z } from 'zod';
import type { Finding, FindingInput } from './findings.js';

export const CRITIQUE_QUESTIONS = [
  { id: 'hierarchy', ask: 'Does the eye land first on the one thing this graphic is for, with everything else visibly smaller or quieter?' },
  { id: 'composition', ask: 'Is every element placed against something - centred in its shape, flush to an edge, or on a line something else shares - so that nothing floats and nothing collides?' },
  { id: 'restraint', ask: 'Is there one accent colour, at most two typefaces, and nothing drawn that is not doing a job?' },
  { id: 'coherence', ask: 'Would every piece pass as one design - mark, panel, type and accent in one voice?' },
  { id: 'on-air', ask: 'Composited over a real picture, at the size a viewer sees it, would a broadcaster air this as delivered?' },
  { id: 'centred', ask: 'Is text that is meant to be centred actually centred in the shape it belongs to, on both axes?' },
  { id: 'inside', ask: 'In the long-text frame, does every glyph - descenders and the last letter included - sit inside the box it belongs to, with none of it cut off?' },
  { id: 'aligned', ask: 'Is the text aligned to the panel, rule or shape behind it, never to a frame coordinate?' },
  { id: 'grows', ask: 'When the text grows, does the box grow the way the design implies (a strap wider or upward, a fixed plate not at all), and does everything else stay where it was?' },
] as const;

export type CritiqueQuestionId = (typeof CRITIQUE_QUESTIONS)[number]['id'];

const answerSchema = z.object({
  answer: z.enum(['yes', 'no', 'cannot-tell']),
  evidence: z.string().describe('What in the frame decided the answer: which element, where. One sentence.'),
});

/** The critic's output schema - one entry per question, always all nine. */
export const CRITIQUE_SCHEMA = z.object({
  hierarchy: answerSchema,
  composition: answerSchema,
  restraint: answerSchema,
  coherence: answerSchema,
  'on-air': answerSchema,
  centred: answerSchema,
  inside: answerSchema,
  aligned: answerSchema,
  grows: answerSchema,
});

export type CritiqueAnswers = z.infer<typeof CRITIQUE_SCHEMA>;

/** The prompt the critic reads. It asks for OBSERVATIONS, never for a fix or a redesign - the
 *  repair is the designing model's to make from the evidence. */
export function critiquePrompt(brief: string, frames: { kind: string }[]): string {
  return [
    'You are inspecting a rendered broadcast graphic for a blind review. Answer each question from the',
    'frames alone - never guess a defect you cannot see, and answer "cannot-tell" when the frames do not',
    'show it. Every answer carries one sentence of evidence naming the element and where it sits.',
    '',
    `The brief the graphic was designed to: ${brief}`,
    `Frames attached, in order: ${frames.map((f) => f.kind).join(', ')}. The "long" frame has every text`,
    'field lengthened the way an operator will type; the "inside" and "grows" questions are about it.',
    '',
    ...CRITIQUE_QUESTIONS.map((q) => `- ${q.id}: ${q.ask}`),
  ].join('\n');
}

/** Turn the critic's NO answers into advisory findings the loop can carry. `cannot-tell` is
 *  dropped - an absent answer is not evidence. */
export function critiqueFindings(answers: CritiqueAnswers, frame: 'hold' | 'long' = 'hold'): FindingInput[] {
  const out: FindingInput[] = [];
  for (const q of CRITIQUE_QUESTIONS) {
    const a = answers[q.id];
    if (!a || a.answer !== 'no') continue;
    const onLong = q.id === 'inside' || q.id === 'grows';
    out.push({
      code: `critic-${q.id}`,
      severity: 'advise',
      source: 'critic',
      frame: onLong ? 'long' : frame,
      locus: q.id,
      message: `A visual review answered NO to "${q.ask}" - ${a.evidence.trim()}`,
      fix: 'Verify on your own render; fix it where it is real, and say which finding you addressed.',
    });
  }
  return out;
}

/** Which critic findings would be worth a repair round at all: any NO on the five axes or the
 *  four text questions. Kept as a function so the policy is one place. */
export function critiqueWarrantsRepair(findings: readonly Finding[]): boolean {
  return findings.some((f) => f.source === 'critic');
}
