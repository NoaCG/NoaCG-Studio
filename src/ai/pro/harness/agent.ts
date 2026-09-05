// THE PRO HARNESS AGENT - one bounded, evidence-driven loop on the AI SDK's ToolLoopAgent
// (docs/PRO_HARNESS_PLAN.md §5): understand -> create -> render -> validate -> inspect -> repair
// -> render -> verify -> finish, with the platform deciding when a round is warranted.
//
// WHAT THE SDK CARRIES. `ToolLoopAgent` runs the model-tool-model loop; `prepareStep` is where
// this file gates the tools by phase (tools.ts `toolsForPhase`), forces the next move when a
// cheap model dithers, and switches to a stronger model exactly once, only when the cheap one
// is measurably stuck; `stopWhen` bounds the whole thing three ways - a step cap, the money cap
// and the two terminal tools. None of that is prompt text asking the model to behave.
//
// WHAT THE LOOP REFUSES TO DO, because it was measured (owner, 2026-09-05; NOACG_PRO_PLAN §26):
//   - run another repair without new evidence (findings.ts `verdictFor` -> stalled);
//   - keep the LAST round when an earlier one measured better (regressed -> best round ships);
//   - ask a vision model to "look again" more than the critique budget allows (default once,
//     and only when the deterministic gate is already clean);
//   - spend past `maxUsd`, `maxRounds` or `maxSteps`, whichever comes first.
//
// THE MODEL LADDER is a ladder of NAMED models the caller supplies, never a route the harness
// picks: `cheap` designs and repairs; `strong` (optional) takes over when a repair round fixed
// nothing; `vision` (optional) answers the structured critique. The bench passes gateway
// strings; the product will pass models bound to its reservation. Every step records which
// model ran it, so a round's cost and quality can be attributed.

import { generateText, hasToolCall, isStepCount, Output, ToolLoopAgent, type LanguageModel, type StopCondition } from 'ai';
import type { SpxTemplate } from '../../../model/types.js';
import { designRulesPromptBlock, type LegibilityMode, type ViewingTarget } from '../../../model/designRules.js';
import { CRITIQUE_SCHEMA, critiqueFindings, critiquePrompt } from './critique.js';
import { blocking, normalizeFindings, type Finding, type RoundRecord } from './findings.js';
import { knowledgeForRequest, renderKnowledge } from './knowledge.js';
import { createHarnessTools, newRunState, toolsForPhase, type HarnessBudget, type HarnessRunState, type HarnessTools } from './tools.js';
import type { Inspection, Workbench } from './workbench.js';

/** The SDK's provider-options bag, named off `generateText` because the package does not export
 *  the type itself. The gateway's retention policy travels in it. */
export type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>;

export interface HarnessModels {
  cheap: LanguageModel;
  strong?: LanguageModel;
  /** A vision-capable model for the structured critique. Absent = no critique. */
  vision?: LanguageModel;
}

export interface HarnessRequest {
  brief: string;
  /** The type the caller already resolved, when it did - the wizard's category, a CLI flag. */
  typeId?: string | null;
  fields?: { label: string; kind: string }[];
  brand?: { hasMark?: boolean; hasColours?: boolean };
  legibility?: { target: ViewingTarget; mode: LegibilityMode; format?: { width: number; height: number } };
  /** How many graphics the package holds - loads the consistency card above one. */
  packageSize?: number;
}

/** Per-million prices by model id, for the ledger when the provider reports no cost. */
export type PriceTable = Record<string, { inputPerMillion: number; outputPerMillion: number }>;

export interface ProHarnessOptions {
  workbench: Workbench;
  models: HarnessModels;
  request: HarnessRequest;
  budget?: Partial<HarnessBudget>;
  prices?: PriceTable;
  /** Show the model its rendered frames. Needs a vision-capable `cheap` model. */
  capture?: boolean;
  /** Provider options for every model call - the gateway's retention policy rides here
   *  (`{ gateway: { zeroDataRetention, disallowPromptTraining, only, tags } }`). */
  providerOptions?: ProviderOptions;
  onEvent?: (line: string) => void;
}

export const DEFAULT_BUDGET: HarnessBudget = {
  maxRounds: 4,
  maxUsd: 0.15,
  maxSteps: 12,
  critiqueBudget: 1,
};

export interface ProHarnessResult {
  status: 'delivered' | 'refused';
  reason: string;
  template: SpxTemplate | null;
  rounds: RoundRecord[];
  bestRound: number;
  spentUsd: number;
  steps: number;
  modelByStep: string[];
  escalated: boolean;
  critiquesUsed: number;
  events: string[];
}

const INSTRUCTIONS = `You design broadcast graphics inside NoaCG Studio, using its tools. NoaCG owns the engineering
- the fields an operator types into, the state machine and its buttons, the runtime, the SPX
definition, the export - and you own the design: composition, hierarchy, spacing, typography,
colour, shape and motion, written INTO a scaffold NoaCG builds.

How the work goes:
1. Understand the brief. Read the type's semantics (inspectGraphicType) when a type fits, and the
   design knowledge cards you need (inspectDesignKnowledge; the core cards are in your first
   message). Decide the ONE thing the graphic is for and the device that carries it.
2. Scaffold once (startGraphic) - from a type whenever one carries the brief's operator actions.
3. Design into the three writable regions (applyDesign). NoaCG renders it with the sample values
   and with every text lengthened, validates it, benches it and measures it, and returns every
   finding with a stable id.
4. Repair ONLY what the findings name, one patch per round, naming the ids you address. Keep
   everything that measured clean exactly as it is. A finding you cannot see on your own render is
   still real: the instruments measured it.
5. Finish (finishGraphic) when the measurement is clean, or stop honestly (stopGraphic).

Judge your own work the way it is judged: over real footage, at viewing distance, with an
operator's real text, as a broadcaster deciding whether to air it as delivered.`;

function modelName(model: LanguageModel): string {
  return typeof model === 'string' ? model : model.modelId;
}

function costOf(usage: { inputTokens?: number; outputTokens?: number }, model: string, prices?: PriceTable, reported?: number): number {
  if (typeof reported === 'number' && Number.isFinite(reported)) return reported;
  const price = prices?.[model];
  if (!price) return 0;
  return ((usage.inputTokens ?? 0) * price.inputPerMillion + (usage.outputTokens ?? 0) * price.outputPerMillion) / 1_000_000;
}

/** The gateway reports a call's cost in provider metadata; read it when it is there. */
function reportedCost(meta: unknown): number | undefined {
  const gateway = (meta as { gateway?: { cost?: unknown } } | undefined)?.gateway;
  const cost = gateway?.cost;
  if (typeof cost === 'number') return cost;
  if (typeof cost === 'string' && cost.trim() && Number.isFinite(Number(cost))) return Number(cost);
  return undefined;
}

/** The first message: the brief, the operator contract, the legibility rules and the knowledge
 *  cards the request triggered - everything the model needs to design, and nothing about how to
 *  drive the tools (the instructions carry that). */
export function firstMessage(request: HarnessRequest): string {
  const cards = knowledgeForRequest({
    brief: request.brief,
    typeId: request.typeId ?? null,
    fields: request.fields,
    hasMark: request.brand?.hasMark,
    hasBrandColours: request.brand?.hasColours,
    packageSize: request.packageSize,
  });
  const rules = request.legibility
    ? designRulesPromptBlock(request.legibility.target, request.legibility.mode, request.legibility.format ?? { width: 1920, height: 1080 })
    : designRulesPromptBlock({ profile: 'tv' }, 'standard', { width: 1920, height: 1080 });
  return [
    '# The brief',
    request.brief.trim(),
    request.typeId ? `\nThe graphic type that fits: ${request.typeId} (read it with inspectGraphicType before scaffolding).` : '\nNo type was pre-selected: call listGraphicTypes and pick one if it carries the brief, else declare fields.',
    request.fields?.length ? `\nFields the user asked for: ${request.fields.map((f) => `${f.label} (${f.kind})`).join(', ')}.` : '',
    '',
    `# ${rules.split('\n')[0]}`,
    rules.split('\n').slice(1).join('\n'),
    '',
    '# Design knowledge for this graphic',
    renderKnowledge(cards),
    '',
    'Begin. Read what you need, scaffold once, then design.',
  ].filter((line) => line !== undefined).join('\n');
}

/**
 * Run the structured critique over the round's frames. Returns advisory findings. Spends one
 * model call; the caller enforces the budget.
 */
export async function runCritique(model: LanguageModel, brief: string, inspection: Inspection, providerOptions?: ProviderOptions): Promise<{ findings: Finding[]; costUsd: number }> {
  const frames = inspection.frames.filter((f) => f.image);
  if (!frames.length) return { findings: [], costUsd: 0 };
  const result = await generateText({
    model,
    output: Output.object({ schema: CRITIQUE_SCHEMA }),
    temperature: 0,
    ...(providerOptions ? { providerOptions } : {}),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: critiquePrompt(brief, frames) },
        ...frames.map((f) => ({ type: 'file' as const, data: f.image!.base64, mediaType: f.image!.mediaType })),
      ],
    }],
  });
  const answers = result.output;
  return {
    findings: answers ? normalizeFindings(critiqueFindings(answers)) : [],
    costUsd: reportedCost(result.providerMetadata) ?? 0,
  };
}

export function createProHarness(options: ProHarnessOptions) {
  const budget: HarnessBudget = { ...DEFAULT_BUDGET, ...(options.budget ?? {}) };
  const run: HarnessRunState = newRunState();
  const emit = (line: string) => { run.events.push(line); options.onEvent?.(line); };
  let stepsInPhase = 0;
  let lastPhase = run.phase;
  let modelForStep: LanguageModel = options.models.cheap;

  const afterInspection = async (inspection: Inspection, round: RoundRecord): Promise<Finding[]> => {
    // The critic runs only when the deterministic gate is clean - anything a script can measure
    // is not a question for a vision model - and only inside the critique budget.
    if (!options.models.vision || !options.capture) return [];
    if (blocking(inspection.findings).length) return [];
    if (run.critiquesUsed >= budget.critiqueBudget) return [];
    run.critiquesUsed += 1;
    const critique = await runCritique(options.models.vision, options.request.brief, inspection, options.providerOptions);
    run.spentUsd += critique.costUsd;
    round.costUsd += critique.costUsd;
    emit(`critique ${run.critiquesUsed}/${budget.critiqueBudget}: ${critique.findings.length} advisory finding(s)`);
    return critique.findings;
  };

  const tools: HarnessTools = createHarnessTools({
    workbench: options.workbench,
    run,
    budget,
    brief: options.request.brief,
    capture: Boolean(options.capture),
    afterInspection,
    currentModel: () => modelName(modelForStep),
  });

  const overBudget: StopCondition<HarnessTools> = () => run.spentUsd >= budget.maxUsd;

  const agent = new ToolLoopAgent({
    model: options.models.cheap,
    instructions: INSTRUCTIONS,
    tools,
    toolChoice: 'required',
    ...(options.providerOptions ? { providerOptions: options.providerOptions } : {}),
    stopWhen: [isStepCount(budget.maxSteps), hasToolCall('finishGraphic', 'stopGraphic'), overBudget],
    prepareStep: async ({ stepNumber }) => {
      if (run.phase !== lastPhase) { stepsInPhase = 0; lastPhase = run.phase; } else if (stepNumber > 0) { stepsInPhase += 1; }
      const gate = toolsForPhase(run.phase, stepsInPhase);
      // ESCALATE ONCE, ON EVIDENCE. A repair round that moved nothing is what "stuck" means
      // here; the verdict would already have stopped the loop as stalled, so a stronger model
      // gets exactly one round to move it, and the ladder is recorded.
      if (run.phase === 'refuse' && run.verdict?.verdict === 'stalled' && options.models.strong && !run.escalated && run.rounds.length < budget.maxRounds) {
        run.escalated = true;
        run.phase = 'repair';
        lastPhase = 'repair';
        stepsInPhase = 0;
        modelForStep = options.models.strong;
        emit(`escalating to ${modelName(options.models.strong)} for one repair round: ${run.verdict.reason}`);
        return {
          model: options.models.strong,
          activeTools: toolsForPhase('repair', 0).active,
          toolChoice: { type: 'tool', toolName: 'applyDesign' },
        };
      }
      if (!run.escalated) modelForStep = options.models.cheap;
      run.modelByStep[stepNumber] = modelName(modelForStep);
      return {
        model: modelForStep,
        activeTools: gate.active,
        toolChoice: gate.force ? { type: 'tool', toolName: gate.force } : 'required',
      };
    },
    onStepEnd: (step) => {
      const model = modelName(modelForStep);
      const cost = costOf(step.usage, model, options.prices, reportedCost(step.providerMetadata));
      run.spentUsd += cost;
      emit(`step ${run.modelByStep.length}: ${model}, ${step.toolCalls.map((c) => c.toolName).join('+') || 'text'}, $${cost.toFixed(5)} (total $${run.spentUsd.toFixed(4)})`);
    },
  });

  async function start(): Promise<ProHarnessResult> {
    let steps: number;
    let failure: string | null = null;
    try {
      const result = await agent.generate({ prompt: firstMessage(options.request) });
      steps = result.steps.length;
    } catch (error) {
      // A provider outage, a model that ignored a forced tool, a schema it could not meet: the
      // rounds already measured are paid for and real, so the run ends as a refusal carrying
      // its best round rather than as an exception that throws them away (the 2026-08-08
      // lesson, docs/NOACG_PRO_PLAN.md §16).
      failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      steps = run.modelByStep.length;
      emit(`aborted: ${failure}`);
    }
    // A loop that ended on the step cap, the money cap or an error with no terminal tool call
    // still has a best round; report it as refused rather than pretending the last state was a
    // verdict.
    if (!run.outcome) {
      const best = run.verdict?.bestRound ?? run.rounds.length;
      const template = best > 0 ? run.templateByRound[best - 1] ?? run.template : run.template;
      const reason = failure
        ? `the loop aborted (${failure})`
        : run.spentUsd >= budget.maxUsd
          ? `cost ceiling reached ($${run.spentUsd.toFixed(4)})`
          : `step budget spent (${steps}) before the graphic measured clean`;
      run.outcome = { status: 'refused', reason, template, round: best };
      emit(`refused: ${reason}`);
    }
    return {
      status: run.outcome.status,
      reason: run.outcome.reason,
      template: run.outcome.template,
      rounds: run.rounds,
      bestRound: run.outcome.round,
      spentUsd: run.spentUsd,
      steps,
      modelByStep: run.modelByStep,
      escalated: run.escalated,
      critiquesUsed: run.critiquesUsed,
      events: run.events,
    };
  }

  return { agent, run, budget, start };
}

/** Run one generation end to end. */
export async function runProHarness(options: ProHarnessOptions): Promise<ProHarnessResult> {
  return createProHarness(options).start();
}
