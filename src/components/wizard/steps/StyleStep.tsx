import { useMemo, useState } from 'react';
import { FONTS, registerAppFont } from '../../../model/fonts';
import {
  PALETTES,
  paletteById,
  type Palette,
  type StyleChoiceSpec,
  type TemplateVariant,
  type Zone9,
} from '../../../model/wizard';
import {
  BROADCAST_BACKDROP,
  contrastRatio,
  cssPaintsWith,
  formatCssColor,
  listCssVariables,
  parseCssColor,
} from '../../../blocks/cssVars';
import FontPicker from '../FontPicker';
import StyleControls from '../../style/StyleControls';
import ColorField from '../../style/ColorField';
import { PALETTE_VARS, SIZE_STEPS, TYPE_SIZE_STEPS } from '../../../model/styleVocabulary';
import type { DraftPatch, WizardDraft } from '../draft';

interface Props {
  variant: TemplateVariant;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** The BUILT preview template's CSS - the source the "Fine-tune this design" rows
   *  enumerate (every `:root` variable the design declares, beyond the palette's four). */
  builtCss: string | null;
  /** Set when the graphic's own logo cannot be read where this palette puts it - measured on the
   *  rendered frame (`validation/markLegibility.ts`). It belongs on THIS step because the palette
   *  is the half of the pairing the user is choosing here: the mark arrived as it is, and the
   *  package is what just made it disappear. */
  markWarning?: string | null;
}


/** #rrggbb for the native color input; rgba()/other values fall back to a neutral swatch.
 *  Shared with the AI step's brand-colour rows (steps/ai/MoreControlPanel) — one conversion,
 *  so a colour swatch means the same thing wherever the user picks one. */
export function pickerHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const m = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return '#888888';
  const h = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/**
 * THE FOUR PALETTE ROLES, each with the `:root` variable a design paints it through.
 *
 * The variable name is here because the same table answers two questions: what the Custom
 * section's rows are, and which roles the design in front of the user actually uses. The
 * style contract declares all four unconditionally, so their presence in the CSS proves
 * nothing - `paintedRoles` below is what proves it.
 *
 * `cssVar` names the SAME four variables as `PALETTE_VARS` (model/styleVocabulary.ts), which is
 * what the Element colors section excludes; the labels are the wizard's own wording rather than
 * that module's. A fifth palette role would have to be added in both places.
 */
const PALETTE_ROLES: {
  key: 'accent' | 'text' | 'textDim' | 'panel';
  cssVar: string;
  label: string;
  hint: string;
}[] = [
  { key: 'accent', cssVar: 'accent', label: 'Accent', hint: 'the one highlight color' },
  { key: 'text', cssVar: 'text-color', label: 'Text', hint: 'primary text' },
  { key: 'textDim', cssVar: 'text-dim', label: 'Text dim', hint: 'secondary line' },
  { key: 'panel', cssVar: 'panel-bg', label: 'Panel', hint: 'box background — rgba() works' },
];

/**
 * The typeface ROLES a design can point at a face of their own, beside "All Text".
 *
 * Bare variable names, because that is how `cssVarOverrides` is keyed everywhere else on this
 * step. Which of them a given design actually reads is a question for its stylesheet, asked
 * below with the same `cssPaintsWith` the palette roles are asked with - `--font-body` is
 * declared by nothing in the catalog (measured 2026-09-04), so on every design shipped today
 * the Body row was an option that could not change the graphic.
 */
const FONT_ROLES = [
  { cssVar: 'font-heading', label: 'Heading' },
  { cssVar: 'font-body', label: 'Body' },
  { cssVar: 'font-numeric', label: 'Numeric' },
  { cssVar: 'font-label', label: 'Label' },
] as const;
type FontRole = (typeof FONT_ROLES)[number]['cssVar'];

/** The ground a swatch is drawn on when the design paints no panel: the same stand-in the
 *  contrast readout assumes, so a chip never promises a box that will not be there. */
const NO_PANEL_GROUND = formatCssColor(BROADCAST_BACKDROP);

const ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

// Both ladders come from the ONE declaration in model/styleVocabulary.ts - the wizard and
// the editor used to state them separately and disagree, so a graphic sized L here read as
// something else the moment the Style panel was opened.
const SIZES = SIZE_STEPS.map((s) => ({ label: s.l, scale: s.s }));
const TYPE_SIZES = TYPE_SIZE_STEPS.map((s) => ({ label: s.l, scale: s.s }));

/** What the collapsed "Size & position" disclosure says it is holding. Empty while everything
 *  sits at the design's own defaults — a summary that reads "Default" on a first visit is
 *  noise, and the one that matters is the one naming a choice you can no longer see. */
function placementSummaryOf(draft: WizardDraft): string {
  const parts: string[] = [];
  const size = SIZES.find((s) => s.scale === draft.sizeScale);
  if (draft.sizeScale !== 1 && size) parts.push(`size ${size.label}`);
  if (draft.zone) parts.push(draft.zone.replace('-', ' '));
  if (draft.nudge.x !== 0 || draft.nudge.y !== 0) parts.push('nudged');
  return parts.join(' · ');
}

/** Step 4 — colors, font, size, and position. */
export default function StyleStep({ variant, draft, onDraft, builtCss, markWarning }: Props) {
  // Which answer a style choice is showing: the draft's, or - while it is untouched, and after
  // a design switch left a key this design does not offer - the design's own default. The same
  // rule resolveStyleChoices applies at build, so the highlighted button is always the one the
  // preview is rendering.
  const styleChoice = (choice: StyleChoiceSpec): string => {
    const answer = draft.styleChoices[choice.key];
    return choice.options.some((option) => option.value === answer) ? answer : choice.value;
  };

  // Everything ELSE the design declares in its :root - its other colours, and its shape
  // (radius, blur, accent weight, tracking, weights, the kicker typeface) - editable right
  // here, so nothing about a design's look needs the editor (docs/GOALS_ARCHIVE.md "Student release"
  // step 5). Read from the BUILT css, which already carries the draft's overrides, so the rows
  // always show what the preview shows. The size knobs and the heading typeface have their own
  // sections below and are filtered out by StyleControls.
  // The FULL list goes to StyleControls, not a pre-filtered one: it hides the palette four
  // via `exclude`, but it still has to SEE them to resolve a token that FOLLOWS one. Three
  // families set `--accent-ink: var(--panel-bg)`, and a row reading "var(--panel-bg)" tells a
  // designer nothing about what colour that actually is.
  const allVars = builtCss ? listCssVariables(builtCss) : [];
  const designVars = allVars.filter((v) => !PALETTE_VARS.has(v.name));
  const overrideVar = (name: string, value: string) =>
    onDraft({ cssVarOverrides: { ...draft.cssVarOverrides, [name]: value } });
  const clearOverride = (name: string) => {
    const next = { ...draft.cssVarOverrides };
    delete next[name];
    onDraft({ cssVarOverrides: next });
  };
  const placementSummary = placementSummaryOf(draft);
  // Open on arrival only if something in there is already off-default — which is how Back
  // returns a user to the nudge they set. Controlled with onToggle rather than a bare `open`
  // prop: this component re-renders on every draft change, so an uncontrolled `open` would
  // spring the disclosure back open under a user who had just shut it.
  const [placementTouched, setPlacementTouched] = useState(() => placementSummaryOf(draft) !== '');
  // THE TYPEFACE COLLAPSES (re-design/handoff.md §2d); ELEMENT COLORS DELIBERATELY DO NOT OPEN.
  // The reference draws that section open, and it is right about the naming and the read-back —
  // but its example design has four recolorable elements on single-line rows. Ours enumerates
  // every `:root` variable the design declares: measured on House Strap, NINE rows at 1012px,
  // which took the step from 89px of overflow to 778px. The rows are tall because our colour
  // control carries an alpha slider, and that is not fat to trim - `--panel-bg` is an rgba() in
  // nearly every design we ship, and a swatch-plus-hex pair silently turns a translucent panel
  // opaque. So the section keeps its honest name and says how much is in it, and opens on ask.
  // Both are controlled, because this component re-renders on every draft change and an
  // uncontrolled `open` would spring a disclosure back under a user who had just shut it.
  const [colorsOpen, setColorsOpen] = useState(false);
  const [typefaceOpen, setTypefaceOpen] = useState(() => draft.fontId != null);
  // ONE TYPEFACE ROLE, or all of them. The role is a BARE variable name, never `--font-label`:
  // `cssVarOverrides` is keyed the way every other override on this step is keyed (StyleControls
  // passes `v.name`, and draft.ts prefixes the dashes itself with `getCssVariable(css, name)`).
  // Keyed with the dashes, every per-role pick was silently dropped at build - the option
  // changed, the picker showed the face, and the graphic never moved. Measured 2026-09-04 on
  // "House Strap": Apply to Label, pick Bebas Neue, `--font-label` unchanged in the built CSS.
  // It also un-breaks draft.ts's "do not overwrite an explicit override" guard, which compares
  // against these same bare names.
  const [fontTarget, setFontTarget] = useState<'all' | FontRole>('all');
  // The variant's own style family first, then the rest.
  const palettes = [...PALETTES].sort(
    (a, b) => Number(b.styleTags.includes(variant.styleTag)) - Number(a.styleTags.includes(variant.styleTag)),
  );
  const custom = draft.customPalette;
  const activePalette = custom ? 'custom' : draft.paletteId ?? variant.defaultPalette.id;
  const activeZone = draft.zone ?? variant.defaultZone;

  // ── WHICH PALETTE ROLES THIS DESIGN ACTUALLY PAINTS WITH ───────────────────────────────
  //
  // Every design declares all four in its `:root`, and some paint with fewer: measured over the
  // whole catalog on 2026-09-02, 11 designs never read the accent, 97 never read the panel and
  // 126 never read the dim text. Offering a package whose only difference from another is a role
  // this design ignores is a control that cannot change the graphic in front of you - the defect
  // the owner reported on this step ("nothing happens in the graphic. That's a bug.").
  //
  // Missing CSS means the preview has not been built yet, NOT that a role is dead: with no
  // evidence every role counts as painted, so the step never hides a control on a guess.
  //
  // Memoized on the built CSS because this component re-renders on every draft change - every
  // frame of an alpha drag, every keystroke in a hex box - and the answer can only change when
  // the preview is rebuilt.
  const paintedRoles = useMemo(
    () => PALETTE_ROLES.filter(({ cssVar }) => !builtCss || cssPaintsWith(builtCss, cssVar)),
    [builtCss],
  );
  const paints = (key: (typeof PALETTE_ROLES)[number]['key']) => paintedRoles.some((r) => r.key === key);
  // THE SAME QUESTION FOR THE TYPEFACE ROLES, for the same reason: a design that never reads
  // `--font-numeric` gets no Numeric row, because pointing that variable at a face would leave
  // the graphic exactly as it was. Undecided (no CSS yet) offers all of them.
  const fontRoles = useMemo(
    () => FONT_ROLES.filter(({ cssVar }) => !builtCss || cssPaintsWith(builtCss, cssVar)),
    [builtCss],
  );
  // A pick made on one design and carried into another that does not read that role falls back
  // to All Text, so the picker can never sit on a row the list no longer shows.
  const fontRole: 'all' | FontRole =
    fontTarget !== 'all' && fontRoles.some((r) => r.cssVar === fontTarget) ? fontTarget : 'all';
  // WHICH INK THE SWATCH DRAWS, and the reason a swatch has an ink at all: without one, a design
  // that paints neither an accent nor a panel renders every package as the same rectangle, which
  // is the defect this whole section exists to remove rather than a smaller version of it
  // (pi04 "Disclaimer Strip" reads only the two text roles, and would show eight identical chips
  // under eight names). So the bar carries the loudest role the design actually paints.
  const swatchInk = (['accent', 'text', 'textDim'] as const).find(paints) ?? null;
  // A GUARD, not a surface anyone reaches today. Two catalog designs paint with none of the four
  // (imp01 and svg01, imported artwork that carries its own colours), and the import flow has no
  // Style step, so neither arrives here. It is kept because the failure without it is silent and
  // ugly: every package collapses into one group and the step renders a single lonely button
  // that looks like a bug. Saying so is the honest degradation.
  const paletteReachesNothing = paintedRoles.length === 0;

  // Two packages are the SAME OFFER when they differ only in roles this design never paints.
  // Grouped rather than filtered so the ACTIVE package always survives as its group's
  // representative - a draft can arrive carrying a palette (from the footer's brand chooser)
  // that is not the one this list would otherwise have shown, and a selection nothing is
  // highlighting reads as a broken step.
  const byLook = new Map<string, Palette>();
  for (const p of palettes) {
    const look = paintedRoles.map(({ key }) => p[key]).join('|');
    if (!byLook.has(look) || p.id === activePalette) byLook.set(look, p);
  }
  const offeredPalettes: Palette[] = [...byLook.values()];
  /** What the collapsed Typeface row reads back — the face actually in use, so the choice is
   *  never hidden without a trace. Unset means the design's own, named. */
  const typefaceSummary =
    draft.fontId == null
      ? `Design typeface (${FONTS.find((f) => f.id === variant.defaultFontId)?.family ?? 'default'})`
      : draft.fontId === 'custom'
        ? draft.customFont?.family ?? 'Imported typeface'
        : FONTS.find((f) => f.id === draft.fontId)?.family ?? 'Design typeface';

  /** Rename the imported font (updates the generated @font-face family). */
  const renameCustomFont = (family: string) => {
    if (!draft.customFont) return;
    if (typeof draft.customFont.asset.data === 'string') registerAppFont(family, draft.customFont.asset.data);
    onDraft({ customFont: { ...draft.customFont, family } });
  };

  const getFontValue = () => {
    if (fontRole === 'all') return draft.fontId ?? null;
    const v = draft.cssVarOverrides[fontRole];
    if (!v) return null;
    if (draft.customFont && v.includes(draft.customFont.family)) return 'custom';
    return FONTS.find(f => v.includes(f.family))?.id ?? 'custom';
  };

  const handleFontPick = (fontId: string | null) => {
    if (fontRole === 'all') {
      onDraft({ fontId });
    } else {
      if (fontId === null) {
        clearOverride(fontRole);
      } else {
        const stack = fontId === 'custom' && draft.customFont 
          ? `"${draft.customFont.family}"`
          : (fontId ? FONTS.find(f => f.id === fontId)?.fallback || 'sans-serif' : '');
        const fullStack = fontId === 'custom' && draft.customFont 
          ? `"${draft.customFont.family}"`
          : (fontId ? `"${FONTS.find(f => f.id === fontId)?.family}", ${stack}` : '');
        overrideVar(fontRole, fullStack);
      }
    }
  };

  /** What pressing Custom would start from - the active package, or the design's own. Also what
   *  the Custom chip previews before anything has been customized, so the chip shows the colour
   *  the button would actually hand you rather than a fixed swatch. */
  const customBase = draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette;

  /** Start customizing from whatever palette is currently active. */
  const startCustom = () => {
    onDraft({ customPalette: { ...customBase, id: 'custom', name: 'Custom' }, paletteId: null });
  };

  const setCustom = (key: (typeof PALETTE_ROLES)[number]['key'], value: string) => {
    if (!custom) return;
    onDraft({ customPalette: { ...custom, [key]: value } as Palette });
  };

  /** The advisory contrast line for a text role against the panel behind it. A NUMBER, never
   *  a verdict: transparency, the video underneath, type size and key-and-fill output all
   *  decide readability, and none of them is visible to this arithmetic. Withheld entirely on a
   *  design that paints no panel: a ratio against a box that is never drawn is not advice. */
  const customAdvisory = (
    key: (typeof PALETTE_ROLES)[number]['key'],
  ): { text: string; title: string } | undefined => {
    if (!custom || (key !== 'text' && key !== 'textDim') || !paints('panel')) return undefined;
    const fg = parseCssColor(custom[key]);
    const bg = parseCssColor(custom.panel);
    if (!fg || !bg) return undefined;
    return {
      text: `${contrastRatio(fg, bg)}:1`,
      title:
        'Estimated contrast against the panel. A guide, not a readability verdict — ' +
        'transparency, the moving video behind the graphic, text shadows, type size and ' +
        'key-and-fill output all change what a viewer can actually read.',
    };
  };

  return (
    <div>
      <div className="panel-section">
        {/* The subtitle names what the packages below actually move. A design that paints no
            accent is not "one accent + neutrals", and saying so anyway is the same promise the
            swatches used to make and could not keep. */}
        <h3>
          Palette{' '}
          <span className="muted">
            {paletteReachesNothing
              ? 'this design carries its own colors'
              : paints('accent')
                ? 'one accent + neutrals — retint anytime via the CSS variables'
                : 'neutrals only, this design paints no accent - retint anytime via the CSS variables'}
          </span>
        </h3>
        {/* A logo that has gone invisible against the package chosen here. Stated, never
            repaired: the two available repairs are dropping the customer's mark or pasting a
            plate over the design, and both were ruled out as worse than the defect
            (`src/templates/shared/logoSlot.ts`). The person who can actually fix it - by
            reaching for the other version of their mark, or a different package - is standing
            right here. */}
        {markWarning && (
          <p className="wz-mark-warning" role="status" data-testid="mark-legibility-warning">
            {markWarning}
          </p>
        )}
        {paletteReachesNothing ? (
          <p className="hint" data-testid="wz-palette-unreachable">
            This design paints with none of the four palette colors, so a package would change
            nothing here. Its own colors are under Element colors below.
          </p>
        ) : (
          <div className="wz-palettes">
            {offeredPalettes.map((p) => (
              <button
                key={p.id}
                className={`wz-palette ${activePalette === p.id ? 'selected' : ''}`}
                onClick={() => onDraft({ paletteId: p.id, customPalette: null })}
                title={p.name}
              >
                {/* The chip shows what will move: the panel as the ground, or the stand-in the
                    contrast readout assumes when the design paints no panel, and one bar of the
                    loudest ink it does paint. `data-swatch-ink` names that role, so a spec can
                    assert WHICH promise the chip is making rather than count anonymous bars. */}
                <span className="wz-swatch" style={{ background: paints('panel') ? p.panel : NO_PANEL_GROUND }}>
                  {swatchInk && (
                    <span className="wz-swatch-accent" data-swatch-ink={swatchInk} style={{ background: p[swatchInk] }} />
                  )}
                </span>
                <span className="wz-palette-name">{p.name}</span>
              </button>
            ))}
            <button
              className={`wz-palette ${activePalette === 'custom' ? 'selected' : ''}`}
              onClick={startCustom}
              title="Your own colors"
              data-palette="custom"
            >
              <span className="wz-swatch wz-swatch-custom">
                {swatchInk && (
                  <span
                    className="wz-swatch-accent"
                    data-swatch-ink={swatchInk}
                    style={{ background: custom?.[swatchInk] ?? customBase[swatchInk] }}
                  />
                )}
              </span>
              <span className="wz-palette-name">Custom</span>
            </button>
          </div>
        )}

        {custom && !paletteReachesNothing && (
          <div className="wz-custom-colors">
            {/* One row per role the design PAINTS with. The shared control, so a panel keeps its
                transparency: a native colour input has no alpha, and `--panel-bg` is an rgba() in
                nearly every design we ship. */}
            {paintedRoles.map(({ key, label, hint }) => (
              <ColorField
                key={key}
                label={label}
                hint={hint}
                value={custom[key]}
                advisory={customAdvisory(key)}
                onChange={(next) => setCustom(key, next)}
              />
            ))}
          </div>
        )}

        {/* Everything else the design declares - its other colours AND its shape: corner
            radius, backdrop blur, accent thickness, the trackings, the kicker typeface. The
            same controls the editor's Style panel renders, so nothing about a design's look
            needs the editor. Collapsed, because the palette answers the common case and this
            is the full control for someone who wants it. */}
        {designVars.length > 0 && (
          <details
            className="wz-style-more"
            data-testid="wz-design-colors"
            open={colorsOpen}
            onToggle={(e) => setColorsOpen(e.currentTarget.open)}
          >
            {/* No COUNT in the value, deliberately. `designVars` is every non-palette variable
                the design declares, but StyleControls applies its own filter on top (the size
                knobs and the heading typeface have their own sections) — measured 12 against 9
                rendered rows. Stating a number here would mean copying that filter's rule into
                a second place for the sole purpose of disagreeing with it later. */}
            <summary>
              Element colors
              <span className="wz-style-more-value">hex or picker</span>
            </summary>
            <StyleControls
              vars={allVars}
              onSet={overrideVar}
              isOverridden={(name) => name in draft.cssVarOverrides}
              onReset={clearOverride}
              exclude={PALETTE_VARS}
            />
          </details>
        )}
      </div>

      {/* The design's OWN decisions, when it hands any to the user (TemplateVariant.styleChoices).
          Not collapsed and not behind the Filters-style disclosure: a design declares one of
          these only when both answers are genuinely right for different shows, so it is a
          question the step should ask out loud rather than hide. Almost every design declares
          none, and then this renders nothing at all. */}
      {(variant.styleChoices ?? []).map((choice) => (
        <div className="panel-section" key={choice.key} data-testid={`wz-style-choice-${choice.key}`}>
          <h3>
            {choice.title}
            {choice.help && <span className="muted">{choice.help}</span>}
          </h3>
          <div className="row" style={{ gap: 6 }}>
            {choice.options.map((option) => (
              <button
                key={option.value}
                data-value={option.value}
                className={styleChoice(choice) === option.value ? 'active' : ''}
                onClick={() => onDraft({ styleChoices: { ...draft.styleChoices, [choice.key]: option.value } })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* The typeface COLLAPSES to a row naming the face in use (handoff §2d). Expanded, the
          searchable picker plus its list of families was the tallest thing on the step, for a
          decision every design already answers well; the summary means the choice is never
          hidden without a trace, which is the same rule "Size & position" follows below. */}
      <details
        className="wz-style-more"
        data-testid="wz-typeface"
        open={typefaceOpen}
        onToggle={(e) => setTypefaceOpen(e.currentTarget.open)}
      >
        <summary>
          Typeface
          <span className="wz-style-more-value">{typefaceSummary}</span>
        </summary>
        <div className="panel-section">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ whiteSpace: 'nowrap', minWidth: 60 }}>Apply to:</span>
            <select
              className="grow"
              value={fontRole}
              onChange={(e) => setFontTarget(e.target.value as 'all' | FontRole)}
            >
              <option value="all">All Text</option>
              {fontRoles.map(({ cssVar, label }) => (
                <option key={cssVar} value={cssVar}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <FontPicker
              value={getFontValue()}
              customFont={draft.customFont}
              onPick={handleFontPick}
              onCustomFont={(customFont) => onDraft({ customFont, fontId: 'custom' })}
              defaultLabel={fontRole === 'all' ? `Design typeface (${FONTS.find((f) => f.id === variant.defaultFontId)?.family ?? 'default'})` : 'Follows the graphic\'s typeface'}
            />
          </div>
          {draft.customFont && getFontValue() === 'custom' && (
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                className="grow"
                value={draft.customFont.family}
                onChange={(e) => renameCustomFont(e.target.value)}
                title="Typeface name used in the generated CSS"
              />
            </div>
          )}
        </div>
      </details>

      {/* Size and placement under progressive disclosure (the Browse step's `More filters`
          idiom). Palette and font are the two choices a user came here to make; size, type
          scale, zone and nudge are TUNING, and every one of them is tuned per design already
          — the variant's defaultZone, its own type scale. Open, they made this the heaviest
          step in the wizard: five decision groups against the Fields step's one or two.
          `open` when anything inside has been touched, so a moved graphic never hides the
          control that moved it. */}
      <details
        className="wz-style-more"
        data-testid="wz-size-position"
        open={placementTouched}
        onToggle={(e) => setPlacementTouched(e.currentTarget.open)}
      >
        <summary>
          Size &amp; position
          <span className="wz-style-more-value">{placementSummary || 'default'}</span>
        </summary>
        <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
          <div className="panel-section">
            <h3>Graphic size <span className="muted">everything, together</span></h3>
            <div className="row" style={{ gap: 6 }}>
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  className={draft.sizeScale === s.scale ? 'active' : ''}
                  onClick={() => onDraft({ sizeScale: s.scale })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {/* Two identical S/M/L triplets under two near-identical labels read as a
                duplicated control. They are not: this one scales the whole graphic. */}
            <p className="hint" style={{ marginTop: 6 }}>
              Scales the panel, the bars and the type as one — the design keeps its proportions.
            </p>
          </div>

          <div className="panel-section">
            <h3>Text size <span className="muted">type inside it</span></h3>
            <div className="row" style={{ gap: 6 }}>
              {TYPE_SIZES.map((s) => (
                <button
                  key={s.label}
                  className={draft.typeScale === s.scale ? 'active' : ''}
                  onClick={() => onDraft({ typeScale: s.scale })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Type only, on top of the size above — for longer names, or a heavier look at the
              same footprint.
            </p>
          </div>

          <div className="panel-section">
            <h3>Position <span className="muted">zones snap to safe areas</span></h3>
            <div className="wz-zones">
              {ZONES.map((z) => (
                <button
                  key={z}
                  className={`wz-zone ${activeZone === z ? 'selected' : ''}`}
                  onClick={() => onDraft({ zone: z })}
                  title={z}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <label className="wz-nudge">
                Nudge X
                <input
                  type="number"
                  value={draft.nudge.x}
                  onChange={(e) => onDraft({ nudge: { x: Number(e.target.value) || 0 } })}
                />
              </label>
              <label className="wz-nudge">
                Nudge Y
                <input
                  type="number"
                  value={draft.nudge.y}
                  onChange={(e) => onDraft({ nudge: { y: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
          </div>
        </div>
      </details>

      {/* THE VIEWING TARGET AND THE SIZE FLOORS ARE NOT HERE, and that is deliberate
          (docs/backlog/size-questionnaire-purpose.md). Measured 2026-09-02 on a catalog design:
          moving the target from TV to Mobile, or the floor from standard to safe, leaves the
          composed preview document byte-identical. They are a rule about what may SHIP, and the
          warnings they govern are drawn where shipping happens - the editor's export panel and
          the community publish sheet, both of which carry the same `ViewingControls`. On the AI
          step they are not decorative at all: they ride the prompt and change what gets drawn,
          which is where the owner said they were meant. */}
    </div>
  );
}
