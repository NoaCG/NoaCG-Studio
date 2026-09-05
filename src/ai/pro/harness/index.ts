// The Pro Harness - public seam. Everything a workbench implementation or a runner needs, and
// nothing that reaches into the loop's state.
export { createProHarness, runProHarness, firstMessage, runCritique, DEFAULT_BUDGET } from './agent.js';
export type { HarnessModels, HarnessRequest, PriceTable, ProHarnessOptions, ProHarnessResult } from './agent.js';
export { toolsForPhase, newRunState } from './tools.js';
export type { HarnessBudget, HarnessPhase, HarnessRunState } from './tools.js';
export {
  bestRoundIndex,
  blocking,
  advisory,
  describeFinding,
  describeRound,
  diffFindings,
  fingerprint,
  normalizeFindings,
  verdictFor,
  NEARLY_CLEAN_BLOCKING,
} from './findings.js';
export type { Finding, FindingInput, FindingSeverity, FindingSource, FindingFrame, RoundRecord, Verdict, VerdictResult } from './findings.js';
export { applyGraphicPatch, describeWritableRegions, boxInnerRange, animationRange, fieldIdsIn, withDesignCss, DESIGN_CSS_MARKER } from './patch.js';
export type { GraphicPatch, PatchResult } from './patch.js';
export { KNOWLEDGE_CARDS, CORE_KNOWLEDGE, knowledgeCard, knowledgeIndex, knowledgeForRequest, renderKnowledge } from './knowledge.js';
export type { KnowledgeCard, KnowledgeId, KnowledgeRequest } from './knowledge.js';
export { CRITIQUE_QUESTIONS, CRITIQUE_SCHEMA, critiqueFindings, critiquePrompt, critiqueWarrantsRepair } from './critique.js';
export type { CritiqueAnswers, CritiqueQuestionId } from './critique.js';
export { fromValidation, locusOf, describeTypeSemantics } from './workbench.js';
export type { Workbench, Scaffold, ScaffoldRequest, Inspection, InspectOptions, RenderedFrame, FinishResult, TypeSemantics } from './workbench.js';
export { typeSemantics, typeSemanticsFor, typeIndex } from './typeSemantics.js';
