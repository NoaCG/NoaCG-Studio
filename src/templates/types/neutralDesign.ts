// THE NEUTRAL SCAFFOLD: a graphic type's SEMANTICS without a catalog LOOK.
//
// A type owns the broadcast half of a graphic - its fields and their roles, the state machine
// and its operator controls, the required structural parts, the capabilities - and wraps
// whatever design it is given in four platform passes (`variantsFromType`: attachMachine,
// missingParts, withLineValues, withContentValues). Every shipped design is a composed, styled
// catalog look. This module supplies the OTHER kind of design: a valid, UNSTYLED spine that
// carries the type's semantics and runtime and imposes no composition - the starting point for
// a coding agent (docs/AGENT_CLI.md) that wants the scoreboard's machine and four fields and
// will draw the look itself, or for anyone who wants the contract without the catalog's taste.
//
// It builds through the category's OWN assembler (the standard `makeDefineVariant` factories,
// the scoreboard's `defineScoreboardVariant`), so the result inherits the :root contract, the
// `.<prefix>-box` / `-mask` spine, the field ids in declaration order, `runtimeJs`, the marked
// ANIMATION region converted to NOACG_ANIM, the SPX definition and export readiness - exactly
// what the catalog's designs get, with plain CSS in the place of a look. A type is a declaration
// and never a second way to build a template (graphicType.ts); this is a design like any other.
//
// COVERAGE is honest rather than total: the categories whose assembler is the shared standard
// one (lower thirds, info cards, corner bugs) plus the scoreboard family. A type whose category
// has its own assembler shape (tickers, credits, quiz boards, competition, ...) returns null -
// the catalog chassis and the typeless spine (`neutralSpineFor`) are still available for it.
//
// `neutralSpineFor` is the TYPELESS scaffold: an arbitrary field list - what an agent building a
// graphic NoaCG has no type for declares - as a valid `blank` template with the implicit linear
// machine: the control layer derives an input per field and Take/Update/Next/Out from it
// (docs/CONTROL_LAYER.md), no category consulted.

import type { FieldKind, FieldOption } from '../../model/fieldModel';
import type { SpxField } from '../../model/types';
import { paletteById, type ResolvedOptions, type TemplateVariant, type WizardOptions } from '../../model/wizard';
import { DATA_SOURCE_CLASS, dataSourceCss } from '../shared/base';
import { lineMasksFor, makeDefineVariant, type CategorySpec, type StandardDesign } from '../shared/standard';
import { defineVariant as defineLowerThirdVariant } from '../lowerThirds/shared';
import { defineCardVariant } from '../infoCards/shared';
import { defineBugVariant } from '../cornerBug/shared';
import { defineScoreboardVariant, type SbDesign } from '../scoreboards/shared';
import { typeFieldsToSpx, typeLines, type GraphicType, type TypeDesign, type TypeField } from './graphicType';

type StandardFactory = ReturnType<typeof makeDefineVariant>;

/** The categories whose assembler is the shared standard one, by `type.structure.category`. */
const STANDARD_FACTORIES: Record<string, StandardFactory> = {
  'lower-third': defineLowerThirdVariant,
  'info-card': defineCardVariant,
  'corner-bug': defineBugVariant,
};

/**
 * The runtime functions a type's machine CALLS from its state timelines (`calls: [{call}]`).
 * A called function is design-owned runtime code - the live bug's word painter, the sponsor
 * rotation, the podium's spotlight - unless the category's own assembler ships it; a neutral
 * spine that does not carry it would offer buttons that fire into nothing, which is not an
 * honest scaffold.
 */
function machineCalls(machine: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(machine)) machine.forEach((m) => machineCalls(m, out));
  else if (machine && typeof machine === 'object') {
    const m = machine as Record<string, unknown>;
    if (Array.isArray(m.calls)) for (const c of m.calls) if (c && typeof c === 'object' && typeof (c as { call?: unknown }).call === 'string') out.add((c as { call: string }).call);
    Object.values(m).forEach((v) => machineCalls(v, out));
  }
  return out;
}

/** What the scoreboard assembler's own runtime defines for every design (shared/matchClock.ts):
 *  the match-clock verbs and the `mark*` state markers. */
const SCOREBOARD_RUNTIME_CALL = /^(?:mark(?:InPlay|Break|Final|Live)|(?:start|stop|reset|paint|tick|init)MatchClock|matchClock\w*)$/;

/** Is a neutral design available for this type? (See the coverage note above.) */
export function hasNeutralDesign(type: GraphicType): boolean {
  const category = type.structure.category;
  const calls = [...machineCalls(type.machine)];
  if (category === 'scoreboard') return calls.every((c) => SCOREBOARD_RUNTIME_CALL.test(c));
  if (!(category in STANDARD_FACTORIES)) return false;
  return calls.length === 0;
}

/**
 * The type's neutral design - a `TypeDesign` exactly like the catalog's, so `variantFromType`
 * (and so `variantsFromType`'s four platform passes) compile it the ordinary way. Null when the
 * type's category has no neutral builder yet.
 */
export function neutralDesignFor(type: GraphicType): TypeDesign | null {
  if (!hasNeutralDesign(type)) return null;
  const category = type.structure.category;
  return {
    id: `${type.id}-neutral`,
    name: `${type.name} (neutral)`,
    description:
      `The ${type.name} type's fields, state machine, controls and runtime on a plain, valid spine - ` +
      'a scaffold to design on, not a look.',
    styleTag: 'minimal',
    palette: paletteById('noacg'),
    fontId: 'inter',
    create: (t, options) =>
      (category === 'scoreboard'
        ? neutralScoreboardVariant(t)
        : neutralStandardVariant(t, STANDARD_FACTORIES[category])
      ).create(options),
  };
}

// ── Standard categories ──────────────────────────────────────────────────────

function specFor(type: GraphicType): Omit<TemplateVariant, 'create'> {
  const lineCount = type.fields.filter((f) => f.role === 'line').length;
  return {
    id: `${type.id}-neutral`,
    typeId: type.id,
    category: type.structure.category,
    name: `${type.name} (neutral)`,
    styleTag: 'minimal',
    description: `Neutral scaffold of the ${type.name} type.`,
    maxLines: Math.max(type.capabilities.maxLines, lineCount),
    suggestedLines: typeLines(type.fields),
    logo: type.capabilities.logo,
    animationPresets: type.capabilities.animationPresets,
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'inter',
    defaultZone: type.capabilities.defaultZone,
    ...(type.capabilities.defaultSteps ? { defaultSteps: true } : {}),
  };
}

function neutralStandardVariant(type: GraphicType, define: StandardFactory): TemplateVariant {
  const spec = specFor(type);
  return define(spec, { name: spec.name, description: spec.description, uicolor: '7' }, (o) =>
    neutralStandardDesign(type, o),
  );
}

/**
 * The spine for a standard-category type. The LINE fields are the masked lines every standard
 * design has (`lineMasksFor`, ids f0..n-1 from the resolved options); the type's other fields
 * follow with the ids `typeFieldsToSpx` assigns in declaration order - a `data` value as a
 * visible line, a `hidden` value as a hidden source the runtime reads, a `logo` as an image
 * element - and any other part the type requires as an empty, honestly named node.
 *
 * NOTE: the ids assume the caller passes no operator `extraFields` (the assembler numbers those
 * between the lines and the design's own fields); the bridge's scaffold never does.
 */
function neutralStandardDesign(type: GraphicType, o: ResolvedOptions): StandardDesign {
  const p = type.structure.prefix;
  const spx = typeFieldsToSpx(type.fields);
  const rest = type.fields
    .map((field, i) => ({ field, spx: spx[i] }))
    .filter(({ field }) => field.role !== 'line');
  const hasAccent = type.structure.parts.some((part) => part.selector === `.${p}-accent`);
  const emittedClasses = new Set([`${p}-box`, `${p}-mask`, `${p}-accent`, `${p}-stack`, `${p}-logo`, `${p}-data`]);

  const lines: string[] = [];
  const holders: string[] = [];
  for (const { field, spx: f } of rest) {
    if (field.role === 'hidden') {
      holders.push(`    <!-- ${field.label} (${f.field}) — input only: SPX writes it here, the runtime reads it. -->\n` +
        `    <div id="${f.field}" class="${DATA_SOURCE_CLASS}">${escapeText(f.value)}</div>`);
    } else if (field.role === 'logo') {
      lines.push(`        <!-- ${field.label} (${f.field}) — an image path; empty hides the element. -->\n` +
        `        <img id="${f.field}" class="${p}-logo" alt="" />`);
    } else {
      lines.push(`        <!-- ${field.label} (${f.field}) — SPX writes this field's value straight into the element. -->\n` +
        `        <div class="${p}-mask"><span id="${f.field}" class="${p}-data">${escapeText(f.value)}</span></div>`);
    }
  }
  // Every other required class part the type promises, as an empty node inside the box.
  const extraParts = type.structure.parts
    .filter((part) => part.required && part.selector.startsWith('.') && !emittedClasses.has(part.selector.slice(1)))
    .map((part) => `      <!-- ${part.id}: a part the ${type.name} type requires; draw it or leave it empty. -->\n` +
      `      <div class="${part.selector.slice(1)}"></div>`);

  const html = [
    `    <!-- NEUTRAL SCAFFOLD: a valid ${type.name}. The structure below is the contract (the box,`,
    `         one mask per line, the ids); everything about how it LOOKS is yours to change. -->`,
    `    <div class="${p}-box">`,
    ...(hasAccent ? [`      <div class="${p}-accent"></div>`] : []),
    `      <div class="${p}-stack">`,
    lineMasksFor(p, o, '        '),
    ...lines,
    `      </div>`,
    ...extraParts,
    `    </div>`,
    ...holders,
  ].join('\n');

  return {
    html,
    css: neutralCss(p, { accent: hasAccent, holders: holders.length > 0 }),
    hasAccent,
    extraFields: rest.map(({ spx: f }) => f),
  };
}

/** The plain stylesheet: every colour through the :root vars, every size through --scale and
 *  --type-scale, readable sizes, no composition beyond a stack in a panel. */
function neutralCss(p: string, has: { accent: boolean; holders: boolean }): string {
  return `/* NEUTRAL SCAFFOLD - plain and valid, not a look. Replace freely; keep the class names the
   structure contract names (.${p}-box, .${p}-mask${has.accent ? `, .${p}-accent` : ''}) and the
   :root variables above, and the editor, the Style panel and the timeline keep working. */
.${p}-box {
  display: flex;                   /* accent bar beside the stack of lines */
  align-items: stretch;
  gap: calc(20px * var(--scale));
  padding: calc(20px * var(--scale)) calc(28px * var(--scale));
  background: var(--panel-bg);     /* the panel behind the text */
  color: var(--text-color);
  border-radius: calc(6px * var(--scale));
}
${has.accent ? `.${p}-accent {
  flex: 0 0 auto;
  width: calc(6px * var(--scale));  /* a plain accent bar - the one accent colour */
  background: var(--accent);
  border-radius: calc(3px * var(--scale));
}
` : ''}.${p}-stack {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--scale));
  min-width: 0;                    /* lets long lines wrap instead of pushing the panel */
}
.${p}-name {
  font-size: calc(48px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.1;
}
.${p}-title {
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 500;
  color: var(--text-dim);
  line-height: 1.2;
}
.${p}-extra {
  font-size: calc(24px * var(--scale) * var(--type-scale));
  color: var(--text-dim);
  line-height: 1.25;
}
.${p}-data {
  font-size: calc(40px * var(--scale) * var(--type-scale));
  font-weight: 700;
  font-variant-numeric: tabular-nums;  /* numbers keep their width while they change */
}
.${p}-logo {
  display: block;
  height: calc(64px * var(--scale));
  width: auto;
}
${has.holders ? `\n${dataSourceCss}\n` : ''}`;
}

// ── Scoreboards ──────────────────────────────────────────────────────────────

function neutralScoreboardVariant(type: GraphicType): TemplateVariant {
  const spec = specFor(type);
  return defineScoreboardVariant(
    spec,
    { name: spec.name, description: spec.description, uicolor: '7' },
    () => neutralScoreboardDesign(type),
  );
}

/**
 * The scoreboard family's spine, built from the TYPE's own field contract. The plain scorebug
 * is four fields; the sports-pack boards own richer sets (a clock, a period, crests, club
 * colours, an event card) and the assembler lets a design own its fields (`SbDesign.fields`) -
 * so the neutral design declares exactly the type's fields, pairs its line fields into rows of
 * two (team + score reads naturally; an odd count just ends with a single), draws a visible
 * element for every `data` field, a hidden source for every `hidden` one, an image for a logo,
 * and an empty node for every other part the type requires (`.scoreboard-clock`,
 * `.scoreboard-pip`, `#scoreboard-periods` - the runtime hooks the type's machine and the
 * match-clock wire expect to find).
 */
function neutralScoreboardDesign(type: GraphicType): SbDesign {
  const p = type.structure.prefix; // 'scoreboard'
  const hasAccent = type.structure.parts.some((part) => part.selector === `.${p}-accent`);
  const spx = typeFieldsToSpx(type.fields);
  const entries = type.fields.map((field, i) => ({ field, spx: spx[i] }));
  const lines = entries.filter(({ field }) => field.role === 'line');
  const rows: string[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const pair = lines.slice(i, i + 2).map(({ field, spx: f }) => {
      const cls = field.kind === 'number' ? `${p}-score` : `${p}-team`;
      return `          <!-- ${field.label} (${f.field}) -->\n` +
        `          <div class="${p}-mask"><span id="${f.field}" class="${cls}">${escapeText(f.value)}</span></div>`;
    });
    rows.push(`        <div class="${p}-row">\n${pair.join('\n')}\n        </div>`);
  }
  const extras: string[] = [];
  const holders: string[] = [];
  for (const { field, spx: f } of entries) {
    if (field.role === 'line') continue;
    if (field.role === 'hidden') {
      holders.push(`    <!-- ${field.label} (${f.field}) — input only: SPX writes it here, the runtime reads it. -->\n` +
        `    <div id="${f.field}" class="${DATA_SOURCE_CLASS}">${escapeText(f.value)}</div>`);
    } else if (field.role === 'logo') {
      extras.push(`        <!-- ${field.label} (${f.field}) — an image path; empty hides the element. -->\n` +
        `        <img id="${f.field}" class="${p}-logo" alt="" />`);
    } else {
      extras.push(`        <!-- ${field.label} (${f.field}) — SPX writes this field's value straight into the element. -->\n` +
        `        <div class="${p}-mask"><span id="${f.field}" class="${p}-data">${escapeText(f.value)}</span></div>`);
    }
  }
  const fieldIds = new Set(spx.map((f) => f.field));
  const emittedClasses = new Set([`${p}-box`, `${p}-mask`, `${p}-accent`, `${p}-stack`, `${p}-row`, `${p}-team`, `${p}-score`, `${p}-data`, `${p}-logo`]);
  const extraParts = type.structure.parts
    .filter((part) => part.required)
    .filter((part) => (part.selector.startsWith('#') ? !fieldIds.has(part.selector.slice(1)) : !emittedClasses.has(part.selector.slice(1))))
    .map((part) => {
      const token = part.selector.slice(1);
      const attr = part.selector.startsWith('#') ? `id="${token}" class="${p}-part"` : `class="${token}"`;
      return `      <!-- ${part.id}: a part the ${type.name} type requires (its runtime looks for it); draw it or leave it empty. -->\n` +
        `      <div ${attr}></div>`;
    });
  const hasHolders = holders.length > 0;
  return {
    html: [
      `    <!-- NEUTRAL SCAFFOLD: a valid ${type.name} - the type's fields in one panel. The structure is`,
      `         the contract; the look is yours. -->`,
      `    <div class="${p}-box">`,
      ...(hasAccent ? [`      <div class="${p}-accent"></div>`] : []),
      `      <div class="${p}-stack">`,
      ...rows,
      ...extras,
      `      </div>`,
      ...extraParts,
      `    </div>`,
      ...holders,
    ].join('\n'),
    css: `/* NEUTRAL SCAFFOLD - plain and valid, not a look. Replace freely; keep .${p}-box, the masks
   and the ids${hasAccent ? `, and the machine keeps driving .${p}-accent` : ''}. */
.${p}-box {
  display: flex;
  align-items: stretch;
  gap: calc(20px * var(--scale));
  padding: calc(16px * var(--scale)) calc(24px * var(--scale));
  background: var(--panel-bg);
  color: var(--text-color);
  border-radius: calc(6px * var(--scale));
}
${hasAccent ? `.${p}-accent {
  flex: 0 0 auto;
  width: calc(6px * var(--scale));  /* the marker the machine animates */
  background: var(--accent);
  border-radius: calc(3px * var(--scale));
}
` : ''}.${p}-stack {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--scale));
  min-width: 0;
}
.${p}-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(40px * var(--scale));
}
.${p}-team {
  font-size: calc(40px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.02em;
}
.${p}-score,
.${p}-data {
  font-size: calc(48px * var(--scale) * var(--type-scale));
  font-weight: 700;
  font-variant-numeric: tabular-nums;  /* numbers keep their width while they change */
}
.${p}-logo {
  display: block;
  height: calc(56px * var(--scale));
  width: auto;
}
.${p}-part {
  min-height: calc(8px * var(--scale));  /* an empty required part - give it a look or leave it */
}
${hasHolders ? `\n${dataSourceCss}\n` : ''}`,
    hasAccent,
    fields: spx,
    lineCount: lines.length,
    popFields: lines.filter(({ field }) => field.kind === 'number').map(({ spx: f }) => f.field),
  };
}

// ── The typeless spine ───────────────────────────────────────────────────────

/** One declared field of a typeless graphic - what an agent says its graphic needs. */
export interface NeutralFieldSpec {
  /** The operator-facing label ("Artist", "Progress"). */
  label: string;
  /** The control kind (model/fieldModel.ts). */
  kind: FieldKind;
  /** The starting value. */
  value?: string;
  /** `select` only: the allowed choices. */
  options?: FieldOption[];
}

/** The category a typeless graphic assembles through: the standard contract under a neutral
 *  prefix, typed `blank` (the type that loses nothing at playout - docs/CONTROL_LAYER.md). */
const NEUTRAL_CATEGORY: CategorySpec = {
  type: 'blank',
  prefix: 'graphic',
  rootComment: 'Graphic root — zone-positioned; opacity 0 until play() runs the entrance.',
  dataRegion: true,
};
const defineNeutralVariant = makeDefineVariant(NEUTRAL_CATEGORY);

const ftypeForKind = (kind: FieldKind): SpxField['ftype'] => {
  switch (kind) {
    case 'lines': return 'textarea';
    case 'number': return 'number';
    case 'image': return 'filelist';
    case 'select': return 'dropdown';
    case 'toggle': return 'checkbox';
    case 'color': return 'color';
    default: return 'textfield';
  }
};

/**
 * A valid `blank` template from an arbitrary field list: text fields as the masked lines (ids
 * in declaration order among themselves), every other field as a design-owned element after
 * them - a visible value for numbers, lists, selects, toggles and colours, an image element for
 * pictures. No machine is declared, so the implicit linear one applies and the operator gets an
 * input per field plus the lifecycle verbs. The prefix is `graphic`; the agent renames freely.
 */
export function neutralSpineFor(fields: NeutralFieldSpec[], options: WizardOptions & { name?: string } = {}) {
  const name = options.name?.trim() || 'Graphic';
  const texts = fields.filter((f) => f.kind === 'text');
  const others = fields.filter((f) => f.kind !== 'text');
  const variant = defineNeutralVariant(
    {
      id: 'graphic-neutral',
      category: 'lower-third',
      name,
      styleTag: 'minimal',
      description: 'A typeless graphic on the neutral spine.',
      maxLines: Math.max(1, texts.length),
      suggestedLines: texts.length
        ? texts.map((f) => ({ title: f.label, sample: f.value ?? '' }))
        : [{ title: 'Text', sample: 'Text' }],
      logo: 'none',
      animationPresets: ['fade', 'slide-up', 'mask-wipe', 'slide-down', 'flip-3d'],
      defaultPalette: paletteById('noacg'),
      defaultFontId: 'inter',
      defaultZone: 'bottom-left',
    },
    { name, description: 'A typeless graphic on the neutral spine.', uicolor: '7' },
    (o) => {
      const p = NEUTRAL_CATEGORY.prefix;
      const base = o.lines.length + o.extraFields.length;
      const extraFields: SpxField[] = others.map((f, i) => ({
        field: `f${base + i}`,
        ftype: ftypeForKind(f.kind),
        title: f.label,
        value: f.value ?? '',
        ...(f.kind === 'image' ? { assetfolder: './images/', extension: 'png' } : {}),
        ...(f.kind === 'select' && f.options?.length
          ? { items: f.options.map((opt) => ({ text: opt.label, value: String(opt.value) })) }
          : {}),
      }));
      const extras = others.map((f, i) => {
        const id = `f${base + i}`;
        if (f.kind === 'image') {
          return `        <!-- ${f.label} (${id}) — an image path; empty hides the element. -->\n` +
            `        <img id="${id}" class="${p}-logo" alt="" />`;
        }
        return `        <!-- ${f.label} (${id}) — SPX writes this field's value straight into the element. -->\n` +
          `        <div class="${p}-mask"><span id="${id}" class="${p}-data">${escapeText(f.value ?? '')}</span></div>`;
      });
      const html = [
        `    <!-- NEUTRAL SPINE: a valid graphic with the fields you declared. The structure is the`,
        `         contract (the box, one mask per line, the ids); how it looks is yours. -->`,
        `    <div class="${p}-box">`,
        `      <div class="${p}-stack">`,
        lineMasksFor(p, o, '        '),
        ...extras,
        `      </div>`,
        `    </div>`,
      ].join('\n');
      return { html, css: neutralCss(p, { accent: false, holders: false }), hasAccent: false, extraFields };
    },
  );
  return variant.create(options);
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type { TypeField };
