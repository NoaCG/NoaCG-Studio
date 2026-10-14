// THE CREATE WITH AI RUN, without React (docs/work-specs/wizard-ai/spec.md, sections 2 and 4).
//
// Which provider call runs for which tier, with which checks, and what the result carries back.
// The step (`components/wizard/steps/AiStep.tsx`) owns the screen: the composer, the thread, the
// busy line, the result card. Everything the browser has to supply comes in through `io` - the
// provider, the validator the step builds, the structural check and the mark probe (both need a
// live DOM) and the busy line - so `scripts/ai-creation.test.mjs` runs every route in Node with a
// stub provider.
//
// A result is returned to whoever awaits it and nothing here holds state between runs, so an
// answer that arrives after the reader left is the caller's to place or drop (issue #1165).

import type { AssetFile, Resolution, SpxTemplate } from '../model/types';
import type { GenerationSpec } from '../model/generationSpec';
import type { MarkProbe } from '../assets/assetInfo';
import { validateTemplate, type ValidationResult } from '../validation/validateTemplate';
import type {
  AIProvider,
  AiTemplateChange,
  GenerateContext,
  SpxValidator,
  StructuralIntentChecker,
} from './provider';
import type { CreativeAiProfileId } from './lite/types';
import { LiteUnsupportedError } from './lite/client';
import { mergeSafety } from './safety';
import { demoteSpecFields } from './spec/specValidate';
import { PRO_STANDARD_ROUTES } from './pro/contract';
import { generateProGraphic, type ProGenerateResult, type ProMark, type ProStage } from './pro/language/pipeline';
import { proRuleCodes, validateProLanguage } from './pro/language/gate';
import {
  composeGraphic,
  namedPackage,
  packageLines,
  PRO_PACKAGE_LIST,
  type ProGraphicId,
  type ProPackageMember,
} from './pro/language/graphics';
import { openProSession, reportProOutcome } from './pro/session';
import { proBrandPalette, proLines, proMarkDescriptor, standardProLanguageBrief } from './pro/brief';

/**
 * The five ways a Generate press can run. 'pro' is kept compiling and is never selected while
 * the hosted Pro door is closed (issue #771): the step's `proMode` is always false.
 */
export type CreationRoute = 'convert' | 'lite' | 'raw' | 'directions' | 'pro';

/** What the browser supplies. */
export interface CreationIO {
  provider: (profile?: CreativeAiProfileId) => AIProvider;
  /** The step's production validator (static rules, the live bench, the safety screen). */
  validate: SpxValidator;
  structuralCheck: StructuralIntentChecker;
  probeMark: (asset: AssetFile) => Promise<MarkProbe | null>;
  /** The busy line: the route's own label first, then every stage the provider announces. */
  onProgress: (stage: string) => void;
}

/** What the Pro tier reads that no other route does. */
export interface ProCreationInput {
  /** The first upload the reader asked to use as it is, if any. */
  asIs: AssetFile | null;
  spec: GenerationSpec | null;
  /** The package to make; the first member is the graphic the step previews. */
  proPackage: ProGraphicId[];
  resolution: Resolution;
  fps: number;
}

export interface CreationInput {
  route: CreationRoute;
  brief: string;
  context: GenerateContext;
  /** The confirmed imported template, the source of a convert. */
  imported: SpxTemplate | null;
  pro: ProCreationInput;
}

export interface CreationResult {
  /** One result, or the three directions; empty only when the directions call returned none. */
  changes: AiTemplateChange[];
  /** The one shown first: the first direction that passes, else the first. */
  selected: number;
  /** A Pro run's concept and package, keyed by the step on `details.template`. */
  pro?: { details: ProGenerateResult; pack: ProPackageMember[]; dropped: string[] };
}

/** The Pro pipeline's stage names, in the busy line's voice (docs/NOACG_PRO_PLAN.md §15). */
const PRO_STAGE_LABELS: Record<ProStage, string> = {
  design: 'Designing the on-air look…',
  compose: 'Building the graphic in it…',
  validate: 'Validating and testing playout…',
};

/**
 * Which route a Generate press takes, or why it is refused. Conversion always runs the validated
 * conversion flow; plain generation branches on the harness switch: OFF = the default one-shot
 * (statically validated, no repair loop), ON = three harness alternatives with the live bench
 * injected.
 */
export function creationRoute(state: {
  imported: { confirmed: boolean } | null;
  liteActive: boolean;
  proMode: boolean;
  useHarness: boolean;
}): CreationRoute | { refused: string } {
  if (state.imported) {
    if (!state.imported.confirmed) {
      return { refused: 'Confirm the imported template project format before opening or converting it.' };
    }
    if (state.liteActive) {
      return { refused: 'Create with AI does not convert imported templates. Open it as code, or remove it and describe one new lower third.' };
    }
    if (state.proMode) {
      return { refused: 'This route designs a new look and its package of graphics; it does not convert imported templates. Open it as code, or tick “Use your own AI account instead” in AI settings to convert it.' };
    }
    return 'convert';
  }
  if (state.proMode) return 'pro';
  if (state.liteActive) return 'lite';
  return state.useHarness ? 'directions' : 'raw';
}

/**
 * Run one Generate press. Validation is forwarded per route (spec D3): convert, Lite and the
 * three directions pass the step's validator and the structural check; the raw route (harness
 * off) passes the busy line only, and its output is screened by `screenChange` on display.
 */
export async function runCreation(input: CreationInput, io: CreationIO): Promise<CreationResult> {
  const { route, brief, context } = input;
  const options = { validate: io.validate, structuralCheck: io.structuralCheck, onProgress: io.onProgress };
  // Each route opens the busy line with its own label before the provider is reached.
  switch (route) {
    case 'convert':
      io.onProgress('Converting your template…');
      if (!input.imported) throw new Error('Nothing imported to convert.');
      return one(await io.provider().convertImport(brief, input.imported, context, options));
    case 'lite':
      io.onProgress('Creating your graphic…');
      return one(await io.provider('lite').generate(brief, context, { ...options, profile: 'lite' }));
    case 'raw':
      io.onProgress('Generating…');
      return one(await io.provider().generateRaw(brief, context, { onProgress: io.onProgress }));
    case 'directions': {
      io.onProgress(context.seed ? 'Designing three more in that spirit…' : 'Designing three directions…');
      const list = await io.provider().generateAlternatives(brief, context, options);
      // Start on the first option that passes; the pick is the user's to change.
      return { changes: list, selected: Math.max(0, list.findIndex((alt) => alt.validation?.ok ?? false)) };
    }
    case 'pro':
      io.onProgress(PRO_STAGE_LABELS.design);
      return runPro(brief, input.pro, io);
  }
}

const one = (change: AiTemplateChange): CreationResult => ({ changes: [change], selected: 0 });

/** What a failed run says on the step. A whole-result route appends Lite's suggested brief. */
export function creationError(error: unknown, route: CreationRoute): string {
  if (route !== 'directions' && error instanceof LiteUnsupportedError && error.suggestedBrief) {
    return `${error.message} Try: ${error.suggestedBrief}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The verdict a result is shown with. Screened here as well as inside the injected validator,
 * because `generateRaw` (the harness OFF path) validates itself and never runs ours - this is the
 * one place every path passes through on its way to the user. `source` is the imported template
 * of a convert, so a construct it already carried is not reported as the AI's.
 */
export function screenChange(change: AiTemplateChange, source?: SpxTemplate | null): ValidationResult {
  return mergeSafety(change.validation ?? validateTemplate(change.template), change.template, source);
}

/**
 * THE PRO TIER: the same brief, mapped deterministically onto the DESIGN-LANGUAGE call
 * (src/ai/pro/brief.ts) and run on the standard route - a normal Pro user never picks
 * models. The model decides the look; the platform composes the graphic through the
 * catalog's own assembler (docs/NOACG_PRO_PLAN.md §15, §16).
 */
async function runPro(brief: string, input: ProCreationInput, io: CreationIO): Promise<CreationResult> {
  const { spec: activeSpec, proPackage, resolution, fps } = input;
  const primaryGraphic = proPackage[0] ?? 'lower-third';
  // Spec-field findings demote to warnings: Pro is a fixed lower-third contract with no
  // repair loop, the grounded-assembly rule (src/ai/spec/specValidate.ts).
  const proValidate: SpxValidator = async (t) => demoteSpecFields(await io.validate(t));
  // THE USER'S OWN MARK, measured before anything is sent. Two unrelated things read the
  // probe and both need it before the model answers: the brief describes the ink in
  // content-free words, and the composer decides afterwards whether that ink can read on
  // the panel the language chose (`markFieldFor`). The pixels never leave the machine.
  const asIs = input.asIs;
  const probe = asIs ? await io.probeMark(asIs) : null;
  const mark: ProMark | null = asIs
    ? {
      assetPath: asIs.path,
      images: [asIs],
      ...(probe
        ? {
          inkLuminance: probe.inkLuminance,
          inkSpread: probe.inkSpread,
          backing: probe.backing === 'own-field' ? 'own-field' as const : 'transparent' as const,
        }
        : {}),
    }
    : null;
  // HOSTED PRO opens a reservation first: one allowance slot, one cost ceiling, covering
  // every model call the generation makes. There is no second path any more - the tier is
  // only offered where this reservation can be made (see the door note in the step), which is
  // what makes "no key to supply" true rather than merely written.
  const session = await openProSession();
  let designed: ProGenerateResult;
  try {
    designed = await generateProGraphic(
      {
        language: standardProLanguageBrief(brief, activeSpec, probe ? proMarkDescriptor(probe) : null),
        // The PRIMARY graphic - the one previewed and refined. Every other member of the
        // package is composed from the same language below, for no extra call.
        graphic: primaryGraphic,
        lines: primaryGraphic === 'lower-third'
          ? proLines(activeSpec)
          : packageLines(primaryGraphic, {
            name: proLines(activeSpec)[0]?.sample ?? '',
            title: proLines(activeSpec)[1]?.sample ?? '',
            channel: null,
          }),
        mark,
        // The customer's stated colours are the PLATFORM's to apply, never the model's to
        // return - the rule Lite has carried since 2026-08-13 (src/ai/pro/brief.ts).
        brandPalette: proBrandPalette(activeSpec),
        resolution,
        fps,
      },
      PRO_STANDARD_ROUTES.language,
      {
        session,
        validate: proValidate,
        onStage: (stage: ProStage) => io.onProgress(PRO_STAGE_LABELS[stage]),
      },
    );
  } catch (error) {
    // The spend is already recorded server-side; what the ledger cannot see from there
    // is that the generation produced nothing usable. Report it and re-throw so the
    // user still sees the failure.
    await reportProOutcome(session, 'failed', { reason: 'generation_failed' });
    throw error;
  }

  // ── THE REST OF THE PACKAGE (docs/NOACG_PRO_PLAN.md §15.9) ──────────────────────────
  //
  // The model call above is the ONLY paid step. Every other graphic in the package is
  // composed from the SAME design language, deterministically and for zero tokens, which
  // is why the default is the whole set: a package costs what one graphic costs.
  //
  // Each member goes through the SAME gate the primary did (`validateProLanguage`, the one
  // seam) rather than being trusted because the composer wrote it. Nothing the model
  // returns can make the code invalid, so a member that fails IS a platform bug - and the
  // honest answer is to drop that member and say so, never to fail the generation the user
  // already paid for or to ship a graphic no gate passed.
  const members: ProPackageMember[] = [{ id: primaryGraphic, template: designed.template }];
  const dropped: string[] = [];
  for (const spec of PRO_PACKAGE_LIST) {
    if (spec.id === primaryGraphic || !proPackage.includes(spec.id)) continue;
    const lines = packageLines(spec.id, {
      name: proLines(activeSpec)[0]?.sample ?? '',
      title: proLines(activeSpec)[1]?.sample ?? '',
      // The channel's name is not a fact this step holds - the brief is prose and parsing
      // it is exactly the guessing this tier removed - so the bug keeps its own default
      // caption, which is an ordinary operator field the user can type over.
      channel: null,
    });
    const composed = composeGraphic(spec.id, designed.language, {
      lines,
      ...(spec.takesMark && mark ? { logo: mark } : {}),
      ...(proBrandPalette(activeSpec) ? { brandPalette: proBrandPalette(activeSpec) } : {}),
      resolution,
      fps,
    });
    const memberVerdict = await validateProLanguage(composed, designed.fallbacks, proValidate);
    if (memberVerdict && !memberVerdict.ok) {
      dropped.push(spec.label);
      continue;
    }
    members.push({ id: spec.id, template: composed.template });
  }
  // NAMED FOR WHAT EACH ONE IS (`namedPackage`, graphics.ts). The rule lives there rather
  // than here because it is only testable where it can be REACHED: the Pro door exists on
  // a configured deployment and nowhere else, so a rule buried in this component would be
  // pinned by a suite CI never runs.
  const pack = namedPackage(members, designed.language.name);
  // THE LEDGER GETS THE WARNINGS TOO (`proRuleCodes`, src/ai/pro/language/gate.ts). Sending
  // errors alone is the §16 hole from the other side: a graphic the platform quietly
  // repaired wrote an EMPTY `validation_rule_codes` beside a `usable` status, so no row
  // could tell a clean generation from a rescued one.
  await reportProOutcome(
    session,
    designed.validation && !designed.validation.ok ? 'failed' : 'usable',
    {
      ...(designed.validation && !designed.validation.ok ? { reason: 'platform_validation' } : {}),
      ruleCodes: proRuleCodes(designed.validation),
    },
  );
  const change: AiTemplateChange = {
    template: designed.template,
    summary: `${designed.language.name}: ${designed.language.rationale}`,
    path: 'pro',
    ...(designed.validation ? { validation: designed.validation } : {}),
  };
  return { changes: [change], selected: 0, pro: { details: designed, pack, dropped } };
}
