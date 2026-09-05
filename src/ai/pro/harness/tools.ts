// THE TOOLS a model holds inside the Pro Harness (docs/PRO_HARNESS_PLAN.md §4.2), as AI SDK
// `tool()` definitions over a `Workbench` and one run's state.
//
// The shape is the argument. A one-shot prompt asks a model to hold the whole graphic in its
// head and emit it; these tools let it work the way a designer at a workstation does - read the
// brief, look up what the graphic type means, scaffold it, design INTO the scaffold, look at the
// measured result, fix what is measured wrong, hand it in. Each tool does exactly one thing, and
// the platform does the part it is better at than any model: `startGraphic` builds the fields,
// machine and runtime; `applyDesign` refuses anything past the three writable regions and then
// renders, validates, benches and measures WITHOUT being asked, so the model never has to
// remember to look; `finishGraphic` is only offered when the measurement is clean.
//
// The run state is a plain object the tools mutate and `prepareStep` (agent.ts) reads. It is
// what turns "the model decided it was done" into "the measurement said it was done".

import { tool } from 'ai';
import { z } from 'zod';
import type { SpxTemplate } from '../../../model/types.js';
import {
  describeRound,
  normalizeFindings,
  verdictFor,
  blocking,
  type Finding,
  type RoundRecord,
  type VerdictResult,
} from './findings.js';
import { knowledgeCard, knowledgeIndex, renderKnowledge } from './knowledge.js';
import { describeWritableRegions } from './patch.js';
import { describeTypeSemantics, type Inspection, type Scaffold, type Workbench } from './workbench.js';

export type HarnessPhase =
  /** Read the brief and the type; scaffold. */
  | 'understand'
  /** A scaffold exists and no design has been applied. */
  | 'design'
  /** Blocking findings remain and budget remains. */
  | 'repair'
  /** The last inspection measured clean: hand it in. */
  | 'finish'
  /** The loop stopped short: say so. */
  | 'refuse'
  | 'done';

export interface HarnessBudget {
  /** Rounds INCLUDING the first design. */
  maxRounds: number;
  maxUsd: number;
  /** Model steps of any kind - the hard bound under everything else. */
  maxSteps: number;
  /** How many structured visual critiques one generation may spend. */
  critiqueBudget: number;
}

export interface HarnessRunState {
  phase: HarnessPhase;
  scaffold: Scaffold | null;
  template: SpxTemplate | null;
  rounds: RoundRecord[];
  lastInspection: Inspection | null;
  verdict: VerdictResult | null;
  spentUsd: number;
  /** The model each step ran on, by step number - the ladder as it actually happened. */
  modelByStep: string[];
  escalated: boolean;
  critiquesUsed: number;
  /** Which finding ids the model said its last patch addressed. Recorded so the diff can be
   *  read against the claim - a model that names a finding and does not move it is a model
   *  that did not understand it. */
  lastAddressed: string[];
  /** Templates by round, so the BEST round can ship rather than the last. */
  templateByRound: SpxTemplate[];
  outcome: { status: 'delivered' | 'refused'; reason: string; template: SpxTemplate | null; round: number } | null;
  events: string[];
}

export function newRunState(): HarnessRunState {
  return {
    phase: 'understand',
    scaffold: null,
    template: null,
    rounds: [],
    lastInspection: null,
    verdict: null,
    spentUsd: 0,
    modelByStep: [],
    escalated: false,
    critiquesUsed: 0,
    lastAddressed: [],
    templateByRound: [],
    outcome: null,
    events: [],
  };
}

export interface ToolContext {
  workbench: Workbench;
  run: HarnessRunState;
  budget: HarnessBudget;
  /** The brief, for the critic and for the round's own record. */
  brief: string;
  /** Show the model its rendered frame after every inspection (a vision-capable model). */
  capture: boolean;
  /** The loop's own hook after each inspection: runs the critic when policy says so and may
   *  extend the verdict. Owned by agent.ts because it spends a model call. */
  afterInspection?: (inspection: Inspection, round: RoundRecord) => Promise<Finding[]>;
  /** The model name to record on the round. */
  currentModel: () => string;
}

const FIELD_KINDS = ['text', 'lines', 'number', 'image', 'color', 'select', 'toggle'] as const;

/** What the model sees after a scaffold: the operator contract and the three regions it may write. */
export function describeScaffold(s: Scaffold): string {
  return [
    `Scaffolded "${s.template.name}" (prefix "${s.prefix}", ${s.steps} step(s) on the default path).`,
    'Fields, in operator order - each is a live value an operator will change on air:',
    ...s.fields.map((f) => `- ${f.id}: ${f.label} (${f.kind}), sample "${f.sample}"`),
    ...(s.notes.length ? ['Notes:', ...s.notes.map((n) => `- ${n}`)] : []),
    '',
    describeWritableRegions(s.template, s.prefix),
  ].join('\n');
}

export interface ApplyDesignOutput {
  text: string;
  image?: { mediaType: string; base64: string };
}

/** The output of an inspection as the model reads it, and how the round was recorded. */
export async function recordInspection(ctx: ToolContext, inspection: Inspection, changed: boolean): Promise<ApplyDesignOutput> {
  const { run } = ctx;
  const round: RoundRecord = {
    round: run.rounds.length + 1,
    findings: inspection.findings,
    model: ctx.currentModel(),
    costUsd: inspection.costUsd,
    changed,
  };
  run.spentUsd += inspection.costUsd;
  let extra: Finding[] = [];
  if (ctx.afterInspection) {
    extra = await ctx.afterInspection(inspection, round);
    if (extra.length) round.findings = normalizeFindings([...round.findings, ...extra]);
  }
  run.rounds.push(round);
  run.templateByRound.push(run.template as SpxTemplate);
  run.lastInspection = inspection;
  const previous = run.rounds[run.rounds.length - 2];
  run.verdict = verdictFor({
    rounds: run.rounds,
    maxRounds: ctx.budget.maxRounds,
    maxUsd: ctx.budget.maxUsd,
    spentUsd: run.spentUsd,
  });
  // A clean gate with a critic's advisories standing is the ONE case where a further round is
  // admitted without a blocking finding: the evidence is new and it is structured. It happens at
  // most once per generation (the critique budget), so the loop cannot become the blind
  // "look again" pass the owner measured as useless.
  const criticSays = extra.some((f) => f.source === 'critic');
  if (run.verdict.verdict === 'delivered' && criticSays && run.rounds.length < ctx.budget.maxRounds) {
    run.verdict = { verdict: 'repair', reason: 'the deterministic gate is clean; a visual review named defects worth one repair', bestRound: round.round };
  }
  // A STOP WITH A CLEAN ROUND BEHIND IT IS A DELIVERY OF THAT ROUND. A repair that regressed a
  // measurement which was already clean (the critique's one advisory round, typically) must not
  // turn a finished graphic into a refusal: the best round measured clean, so it ships, and the
  // working template is rewound to it so finishGraphic hands in what was measured.
  if (run.verdict.verdict !== 'delivered' && run.verdict.verdict !== 'repair') {
    const best = run.rounds[run.verdict.bestRound - 1];
    if (best && blocking(best.findings).length === 0) {
      run.template = run.templateByRound[run.verdict.bestRound - 1] ?? run.template;
      run.verdict = {
        verdict: 'delivered',
        reason: `round ${best.round} measured clean; the later change is discarded (${run.verdict.reason})`,
        bestRound: best.round,
      };
    }
  }
  run.phase = run.verdict.verdict === 'delivered' ? 'finish'
    : run.verdict.verdict === 'repair' ? 'repair'
      : 'refuse';
  run.events.push(`round ${round.round}: ${blocking(round.findings).length} blocking, ${round.findings.length - blocking(round.findings).length} advisory -> ${run.verdict.verdict} (${run.verdict.reason})`);

  const lines = [describeRound(round.findings, previous?.findings)];
  if (run.verdict.verdict === 'delivered' && run.verdict.bestRound !== round.round) {
    lines.push(`This change is discarded: round ${run.verdict.bestRound} measured clean and is what ships. Call finishGraphic with a one-line summary of that design.`);
  } else if (run.verdict.verdict === 'delivered') {
    lines.push('The graphic measures clean. Call finishGraphic with a one-line summary of the design.');
  } else if (run.verdict.verdict === 'repair') {
    lines.push(`Round ${round.round} of ${ctx.budget.maxRounds}. Repair ONLY what is listed - name the finding ids you address in \`addresses\` - and keep everything that measured clean exactly as it is.`);
  } else {
    lines.push(`The loop stops here (${run.verdict.reason}). Call stopGraphic with the reason; the best round (${run.verdict.bestRound}) is what will be kept.`);
  }
  const hold = inspection.frames.find((f) => f.kind === 'long' && f.image) ?? inspection.frames.find((f) => f.image);
  return {
    text: lines.join('\n\n'),
    ...(ctx.capture && hold?.image ? { image: hold.image } : {}),
  };
}

export function createHarnessTools(ctx: ToolContext) {
  const { workbench, run } = ctx;

  const inspectDesignKnowledge = tool({
    description: 'Read NoaCG\'s design knowledge on a subject. With no ids, returns the index of subjects. Load a card before designing the thing it is about.',
    inputSchema: z.object({
      ids: z.array(z.string()).optional().describe('Card ids from the index, e.g. ["motion", "colour"].'),
    }),
    execute: async ({ ids }) => {
      if (!ids?.length) return `Design knowledge available (ask by id):\n${knowledgeIndex()}`;
      const unknown = ids.filter((id) => !knowledgeCard(id));
      const known = ids.filter((id) => knowledgeCard(id));
      return [unknown.length ? `Unknown card id(s): ${unknown.join(', ')}. The index:\n${knowledgeIndex()}` : '', renderKnowledge(known)].filter(Boolean).join('\n\n');
    },
  });

  const listGraphicTypes = tool({
    description: 'List the graphic types NoaCG knows - each brings its fields, operator events and state machine. Start from a type whenever one fits the brief.',
    inputSchema: z.object({}),
    execute: async () => {
      const types = await workbench.listTypes();
      return types.map((t) => `- ${t.id}: ${t.name} - ${t.description} (${t.fields} field(s), ${t.events} operator event(s))`).join('\n');
    },
  });

  const inspectGraphicType = tool({
    description: 'What one graphic type MEANS and how an operator drives it: its fields, events, steps, default placement and on-air notes.',
    inputSchema: z.object({ typeId: z.string() }),
    execute: async ({ typeId }) => {
      const s = await workbench.describeType(typeId);
      return s ? describeTypeSemantics(s) : `No type "${typeId}". Call listGraphicTypes for the ids.`;
    },
  });

  const startGraphic = tool({
    description: 'Scaffold the graphic on a valid spine: from a type (its fields, machine, controls and runtime come with it) or from declared fields when no type fits. Returns the three regions you may design in. Call exactly once.',
    inputSchema: z.object({
      name: z.string().min(1).max(80).describe('The graphic\'s name as the library will show it.'),
      typeId: z.string().optional().describe('A type id from listGraphicTypes. Prefer a type whenever one carries the brief\'s operator actions.'),
      fields: z.array(z.object({
        label: z.string().min(1).max(60),
        kind: z.enum(FIELD_KINDS),
        value: z.string().max(200).optional().describe('The sample value an operator would type.'),
      })).max(24).optional().describe('Typeless only: the operator fields, in order.'),
      zone: z.string().optional().describe('One of the nine anchor zones, e.g. bottom-left, top-right, center. Default: the type\'s.'),
      fontId: z.string().optional().describe('A bundled typeface id, when the brief or brand names one.'),
    }),
    execute: async ({ name, typeId, fields, zone, fontId }) => {
      if (run.scaffold) return `A graphic is already started ("${run.scaffold.template.name}"). Design it with applyDesign.`;
      if (!typeId && !fields?.length) return 'Name a typeId or declare fields - a graphic with neither has nothing for an operator to change.';
      const scaffold = await workbench.scaffold({ name, ...(typeId ? { typeId } : {}), ...(fields ? { fields } : {}), ...(zone ? { zone } : {}), ...(fontId ? { fontId } : {}) });
      run.scaffold = scaffold;
      run.template = scaffold.template;
      run.phase = 'design';
      run.events.push(`scaffolded ${typeId ?? 'typeless'} as "${name}" (prefix ${scaffold.prefix})`);
      return describeScaffold(scaffold);
    },
  });

  const applyDesign = tool({
    description: 'Write your design into the scaffold: the design css (replaces your previous design css whole), the markup inside the box, and/or the ANIMATION region. The platform then renders it at 1920x1080 with the sample values and with every text lengthened, validates it, benches it and measures it - and returns every finding. Repair rounds send only what changes.',
    inputSchema: z.object({
      css: z.string().max(20000).optional().describe('The design stylesheet. Use the :root variables (--accent, --text-color, --text-dim, --panel-bg, --font-heading, --scale, --type-scale); never redeclare :root or @font-face.'),
      boxHtml: z.string().max(12000).optional().describe('Markup inside <div class="PREFIX-box">. Keep every field element id="fN" exactly once; classes start with the prefix; each text field inside its own <div class="PREFIX-mask">.'),
      animation: z.string().max(8000).optional().describe('The ANIMATION region in the authoring grammar: var animSpeed/easeIn/easeOut, function buildInTimeline() and buildOutTimeline() returning one gsap.timeline() each; only tl.set/to/fromTo with literal values; durations as N / animSpeed.'),
      addresses: z.array(z.string()).optional().describe('On a repair: the finding ids this change is meant to fix.'),
      rationale: z.string().max(400).describe('One or two sentences: the device and the hierarchy decision, or on a repair what changed and why.'),
    }),
    execute: async ({ css, boxHtml, animation, addresses, rationale }): Promise<ApplyDesignOutput> => {
      if (!run.scaffold || !run.template) return { text: 'Nothing to design yet - call startGraphic first.' };
      if (run.phase === 'finish') return { text: 'The graphic already measures clean. Call finishGraphic.' };
      if (run.phase === 'refuse' || run.phase === 'done') return { text: 'The loop has stopped. Call stopGraphic.' };
      run.lastAddressed = addresses ?? [];
      run.events.push(`applyDesign: ${rationale}`);
      const applied = await workbench.apply(run.template, run.scaffold.prefix, {
        ...(css !== undefined ? { css } : {}),
        ...(boxHtml !== undefined ? { boxHtml } : {}),
        ...(animation !== undefined ? { animation } : {}),
      });
      if (!applied.ok) {
        // A refused patch costs no render and consumes no round: the reasons come back as
        // harness findings so the model fixes the patch, not the design.
        return {
          text: [
            'The patch was refused - nothing was applied and nothing was rendered. Each reason names what to change:',
            ...applied.reasons.map((r) => `- [harness:patch] ${r}`),
          ].join('\n'),
        };
      }
      if (!applied.changed && run.rounds.length) {
        return { text: 'This patch is byte-identical to what is already applied - it would spend a render on nothing. Change something the findings name, or call stopGraphic if you cannot.' };
      }
      run.template = applied.template;
      const inspection = await workbench.inspect(run.template, run.scaffold.prefix, { capture: ctx.capture });
      return recordInspection(ctx, inspection, applied.changed);
    },
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: [
        { type: 'text', text: output.text },
        ...(output.image
          ? [{ type: 'file' as const, mediaType: output.image.mediaType, data: { type: 'data' as const, data: output.image.base64 } }]
          : []),
      ],
    }),
  });

  const finishGraphic = tool({
    description: 'Hand the graphic in. Only legal once the measurement is clean.',
    inputSchema: z.object({ summary: z.string().max(300).describe('One line a user will read: what the design is.') }),
    execute: async ({ summary }) => {
      if (run.phase !== 'finish' || !run.template) {
        return `Not yet: ${run.verdict?.reason ?? 'no inspection has run'}. Repair what is listed first.`;
      }
      const finished = await workbench.finish(run.template, run.scaffold?.template.name ?? 'Graphic');
      run.outcome = { status: 'delivered', reason: summary, template: finished.template, round: run.verdict?.bestRound ?? run.rounds.length };
      run.phase = 'done';
      run.events.push(`delivered after ${run.rounds.length} round(s)${finished.location ? ` -> ${finished.location}` : ''}`);
      return `Delivered${finished.location ? ` to ${finished.location}` : ''}. ${summary}`;
    },
  });

  const stopGraphic = tool({
    description: 'Stop honestly when the graphic cannot be made clean inside the budget. The best measured round is kept and reported as not ready.',
    inputSchema: z.object({ reason: z.string().max(300) }),
    execute: async ({ reason }) => {
      const best = run.verdict?.bestRound ?? run.rounds.length;
      const template = best > 0 ? run.templateByRound[best - 1] ?? run.template : run.template;
      run.outcome = { status: 'refused', reason, template, round: best };
      run.phase = 'done';
      run.events.push(`refused: ${reason} (keeping round ${best})`);
      return `Stopped. Round ${best} is kept as the best measured attempt, reported as not ready.`;
    },
  });

  return { inspectDesignKnowledge, listGraphicTypes, inspectGraphicType, startGraphic, applyDesign, finishGraphic, stopGraphic };
}

export type HarnessTools = ReturnType<typeof createHarnessTools>;
export type HarnessToolName = keyof HarnessTools;

/** Which tools a phase offers, and which one it forces. The gating IS the loop: a model cannot
 *  finish before the measurement is clean, cannot redesign after it is, and cannot noodle. */
export function toolsForPhase(phase: HarnessPhase, stepsInPhase: number): { active: HarnessToolName[]; force?: HarnessToolName } {
  switch (phase) {
    case 'understand':
      // Two steps of reading, then the scaffold is forced: a model that keeps reading is a
      // model that is not designing.
      return stepsInPhase >= 2
        ? { active: ['startGraphic'], force: 'startGraphic' }
        : { active: ['inspectDesignKnowledge', 'listGraphicTypes', 'inspectGraphicType', 'startGraphic'] };
    case 'design':
      return stepsInPhase >= 1
        ? { active: ['applyDesign'], force: 'applyDesign' }
        : { active: ['inspectDesignKnowledge', 'applyDesign'] };
    case 'repair':
      return stepsInPhase >= 1
        ? { active: ['applyDesign', 'stopGraphic'], force: 'applyDesign' }
        : { active: ['inspectDesignKnowledge', 'applyDesign', 'stopGraphic'] };
    case 'finish':
      return { active: ['finishGraphic'], force: 'finishGraphic' };
    case 'refuse':
      return { active: ['stopGraphic'], force: 'stopGraphic' };
    case 'done':
      return { active: [] };
  }
}
