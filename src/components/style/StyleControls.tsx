// THE style-contract controls, rendered once for both surfaces that offer them: the wizard's
// Style step and the editor's Style panel.
//
// Two things were wrong before this existed, and they were the same thing twice. The colours
// past the four palette roles were listed as their own CSS variable names under a collapsed
// disclosure - "accent ink", "panel keyline" - which is the author's vocabulary, not the
// user's. And nine of the twelve shape tokens had no control on any surface at all: corner
// radius, backdrop blur, accent thickness, the label typeface, both trackings and the heading
// weight were emitted into every graphic's `:root` and reachable only by hand-editing the CSS.
// A professional could change the colours and nothing about the shape.
//
// The rule for what renders: a control appears for a variable the built CSS actually DECLARES,
// never for one we merely know about. `tokenVarsCss` only emits a token the stylesheet reads,
// so this stays the existing no-dead-knobs doctrine rather than a second opinion about it.

import {
  LENGTH_TOKENS,
  SHADOW_CHOICES,
  STYLE_GROUPS,
  WEIGHT_CHOICES,
  styleTerm,
  type StyleTerm,
} from '../../model/styleVocabulary';
import { contrastRatio, looksLikeColor, parseCssColor } from '../../model/cssVars';
import { FONTS, fontByStack, fontStack } from '../../model/fonts';
import { formatCssLength, parseCssLength } from '../../blocks/cssLength';
import ColorField from './ColorField';

export interface StyleVar {
  name: string;
  value: string;
}

interface Props {
  /** Every custom property the built CSS declares, in source order. */
  vars: StyleVar[];
  onSet: (name: string, value: string) => void;
  /** Offered as a ↺ on any variable this returns true for. */
  isOverridden?: (name: string) => boolean;
  onReset?: (name: string) => void;
  /** Names another section already owns (the wizard's palette swatches). */
  exclude?: Set<string>;
  disabled?: boolean;
}

/** The order groups are shown in. Colours first: they are what most people came to change. */
const GROUP_ORDER: StyleTerm['group'][] = ['palette', 'ink', 'panel', 'accent', 'type'];

export default function StyleControls({ vars, onSet, isOverridden, onReset, exclude, disabled }: Props) {
  const byName = new Map(vars.map((v) => [v.name, v.value]));

  /**
   * Follow a `var(--other)` chain to the literal behind it.
   *
   * Three of the six families set `--accent-ink: var(--panel-bg)` - the ink on an accent chip
   * IS the panel colour, because the panel is a near-black. Shown raw, that row was a text box
   * reading "var(--panel-bg)" with no swatch, which tells a designer nothing about what colour
   * it actually is. Bounded, because a cycle in hand-edited CSS must not hang the panel.
   */
  const resolveVar = (value: string): { color: string; via: string } | null => {
    let v = value.trim();
    let via = '';
    for (let hops = 0; hops < 4; hops++) {
      const m = /^var\(\s*--([\w-]+)\s*\)$/.exec(v);
      if (!m) break;
      const next = byName.get(m[1]);
      if (next === undefined) return null;
      via = m[1];
      v = next.trim();
    }
    return via && parseCssColor(v) ? { color: v, via } : null;
  };

  /**
   * The advisory contrast line for a colour, where there is a meaningful pair to compare.
   *
   * Deliberately a NUMBER and never a verdict. The arithmetic sees two colour values; what a
   * viewer can actually read also depends on the panel's transparency, the moving video behind
   * it, any text shadow, the type size and what a key-and-fill output does to the composite.
   * A tick would claim something this cannot know.
   */
  const advisoryFor = (name: string): { text: string; title: string } | undefined => {
    const pairs: Record<string, [string, string]> = {
      'text-color': ['text-color', 'panel-bg'],
      'text-dim': ['text-dim', 'panel-bg'],
      'accent-ink': ['accent-ink', 'accent'],
      'label-color': ['label-color', 'panel-bg'],
    };
    const pair = pairs[name];
    if (!pair) return undefined;
    const fg = parseCssColor(byName.get(pair[0]) ?? '');
    const bg = parseCssColor(byName.get(pair[1]) ?? '');
    if (!fg || !bg) return undefined;
    const against = pair[1] === 'accent' ? 'the accent' : 'the panel';
    return {
      text: `${contrastRatio(fg, bg)}:1`,
      title:
        `Estimated contrast against ${against}. A guide, not a readability verdict — ` +
        'transparency, the moving video behind the graphic, text shadows, type size and ' +
        'key-and-fill output all change what a viewer can actually read.',
    };
  };

  const renderColor = (name: string, value: string, followed?: { color: string; via: string }) => {
    const term = styleTerm(name);
    const hint = followed
      ? `${term.hint ? `${term.hint} — ` : ''}follows ${styleTerm(followed.via).label.toLowerCase()}; picking a colour here sets its own`
      : term.hint;
    return (
      <ColorField
        key={name}
        label={term.label}
        hint={hint}
        varName={name}
        value={followed ? followed.color : value}
        testId={`style-var-${name}`}
        advisory={advisoryFor(name)}
        disabled={disabled}
        onChange={(next) => onSet(name, next)}
        onReset={isOverridden?.(name) && onReset ? () => onReset(name) : undefined}
      />
    );
  };

  const renderShadow = (name: string, value: string) => {
    const term = styleTerm(name);
    const presets = SHADOW_CHOICES[name] ?? [];
    const matched = presets.find((c) => c.value === value.trim());
    // A design whose shadow is its own — most of them, since a shadow is per-design far more
    // than per-family — used to show four presets with NONE of them selected and a note
    // saying "custom". That reads as a broken control. Its own value leads the row instead,
    // selected, so the row says what is actually on and clicking a preset is a visible swap.
    const choices = matched ? presets : [{ label: 'As designed', value: value.trim() }, ...presets];
    const current = matched ?? choices[0];
    return (
      <div className="field-row" key={name} data-testid={`style-var-${name}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{term.label}</label>
          <span className="field-id">--{name}</span>
          {term.hint && <span className="hint">{term.hint}</span>}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`style-choice ${current.value === c.value ? 'selected' : ''}`}
              disabled={disabled}
              title={c.value}
              onClick={() => onSet(name, c.value)}
            >
              {c.label}
            </button>
          ))}
          {isOverridden?.(name) && onReset && (
            <button type="button" title="Back to the design's own value" onClick={() => onReset(name)}>
              ↺
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderLength = (name: string, value: string) => {
    const term = styleTerm(name);
    const spec = LENGTH_TOKENS[name];
    const len = parseCssLength(value);
    const off = spec.off !== undefined && !len;
    return (
      <div className="field-row" key={name} data-testid={`style-var-${name}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{term.label}</label>
          <span className="field-id">--{name}</span>
          {term.hint && <span className="hint">{term.hint}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {spec.off !== undefined && (
            <button
              type="button"
              className={`style-choice ${off ? 'selected' : ''}`}
              disabled={disabled}
              title={off ? 'Turn it on' : 'Turn it off'}
              onClick={() => onSet(name, off ? (spec.on ?? `${spec.min}${spec.unit}`) : spec.off!)}
            >
              {off ? 'Off' : 'Turn off'}
            </button>
          )}
          <input
            type="range"
            className="grow"
            aria-label={term.label}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            disabled={disabled || off}
            value={len ? len.value : spec.min}
            onChange={(e) => len && onSet(name, formatCssLength(len, Number(e.target.value)))}
          />
          <span className="hint style-length-value">
            {off ? 'none' : `${len ? len.value : spec.min}${spec.unit}`}
          </span>
          {isOverridden?.(name) && onReset && (
            <button type="button" title="Back to the design's own value" onClick={() => onReset(name)}>
              ↺
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderWeight = (name: string, value: string) => {
    const term = styleTerm(name);
    return (
      <div className="field-row" key={name} data-testid={`style-var-${name}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{term.label}</label>
          <span className="field-id">--{name}</span>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {WEIGHT_CHOICES.map((w) => (
            <button
              key={w}
              type="button"
              className={`style-choice ${value.trim() === w ? 'selected' : ''}`}
              disabled={disabled}
              onClick={() => onSet(name, w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    );
  };

  /**
   * A variable that names a TYPEFACE — the kicker face, the numeric face.
   *
   * A picker rather than a text field, but only over faces the app can actually ship: pointing
   * one of these at a family we did not bundle would emit a `url("fonts/…")` nothing writes,
   * and `font-display: swap` would hide that until playout. Both write paths ensure the
   * `@font-face` (model/fonts.ts ensureFontFace); the choices here are what those paths can
   * honour. A hand-written value we do not recognise is kept and shown, never silently
   * replaced — the code is the source of truth.
   */
  const renderFontToken = (name: string, value: string) => {
    const term = styleTerm(name);
    // No separate "monospace" entry: MONO_STACK is byte-identical to `fontStack(jetbrains-mono)`,
    // so the bundled list already contains it — and naming the face beats naming the category,
    // since "Monospace" on a kicker row tells a designer nothing about what they are looking at.
    const known = fontByStack(value);
    const followsHeading = /^\s*var\(\s*--font-heading\s*\)\s*$/.test(value);
    const current = followsHeading ? 'heading' : (known?.id ?? 'custom');
    return (
      <div className="field-row" key={name} data-testid={`style-var-${name}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{term.label}</label>
          <span className="field-id">--{name}</span>
          {term.hint && <span className="hint">{term.hint}</span>}
        </div>
        <div className="row">
          <select
            className="grow"
            aria-label={term.label}
            value={current}
            disabled={disabled}
            onChange={(e) => {
              const id = e.target.value;
              if (id === 'heading') return onSet(name, 'var(--font-heading)');
              const face = FONTS.find((f) => f.id === id);
              if (face) onSet(name, fontStack(face));
            }}
          >
            <option value="heading">Follows the graphic's typeface</option>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family}
                {name === 'font-numeric' && !f.tabularFigures ? ' — digits are not one width' : ''}
              </option>
            ))}
            {current === 'custom' && (
              <option value="custom" disabled>
                {value.trim().slice(0, 40)} (written by hand)
              </option>
            )}
          </select>
          {isOverridden?.(name) && onReset && (
            <button type="button" title="Back to the design's own value" onClick={() => onReset(name)}>
              ↺
            </button>
          )}
        </div>
      </div>
    );
  };

  /** A variable with no control of its own kind still gets an honest text field: the design
   *  declared it, so hiding it would be worse than showing it plainly. */
  const renderText = (name: string, value: string) => {
    const term = styleTerm(name);
    return (
      <div className="field-row" key={name} data-testid={`style-var-${name}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{term.label}</label>
          <span className="field-id">--{name}</span>
          {term.hint && <span className="hint">{term.hint}</span>}
        </div>
        <div className="row">
          <input
            className="grow"
            aria-label={term.label}
            value={value}
            disabled={disabled}
            onChange={(e) => onSet(name, e.target.value)}
          />
          {isOverridden?.(name) && onReset && (
            <button type="button" title="Back to the design's own value" onClick={() => onReset(name)}>
              ↺
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderVar = (v: StyleVar) => {
    if (SHADOW_CHOICES[v.name]) return renderShadow(v.name, v.value);
    if (LENGTH_TOKENS[v.name]) return renderLength(v.name, v.value);
    if (v.name === 'display-weight') return renderWeight(v.name, v.value);
    if (v.name === 'font-label' || v.name === 'font-numeric') return renderFontToken(v.name, v.value);
    if (looksLikeColor(v.value)) return renderColor(v.name, v.value);
    const followed = resolveVar(v.value);
    if (followed) return renderColor(v.name, v.value, followed);
    return renderText(v.name, v.value);
  };

  // Group by the vocabulary, keeping the stylesheet's own order inside each group. A variable
  // nobody has named lands in "More colors" via styleTerm's fallback, which is where an
  // unrecognised design-owned colour belongs.
  const groups = GROUP_ORDER.map((g) => ({
    id: g,
    ...STYLE_GROUPS[g],
    items: vars.filter(
      (v) =>
        !exclude?.has(v.name) &&
        v.name !== 'scale' &&
        v.name !== 'type-scale' &&
        v.name !== 'font-heading' &&
        styleTerm(v.name).group === g,
    ),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((g) => (
        <div className="panel-section" key={g.id}>
          <h3>{g.title}</h3>
          {g.hint && <p className="hint">{g.hint}</p>}
          {g.items.map(renderVar)}
        </div>
      ))}
    </>
  );
}
