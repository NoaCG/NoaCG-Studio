// THE colour control. Every surface that lets someone change a colour in a graphic renders
// this: the wizard's Style step (palette roles and the design's other colours), the editor's
// Style panel, and the AI brief's brand colours.
//
// It exists because those three had each grown their own pairing of `<input type="color">` and
// a text box, and a native colour input cannot express transparency. `--panel-bg` is an
// `rgba()` in almost every design we ship, so picking its colour through the swatch quietly
// dropped the alpha and turned a translucent panel opaque - a defect nobody could see in the
// control, only in the render.
//
// So: swatch for the hue, a slider for the alpha, and the text field still there for anyone who
// would rather type. Whatever the value arrived as is what it is written back as.

import { useId, useRef, useState } from 'react';
import { formatCssColor, parseCssColor, type CssColor } from '../../model/cssVars';
import { IconEyedropper } from '../icons';

/** Chromium's EyeDropper. Feature-detected - it exists nowhere else, and its absence is not
 *  an error, just one fewer way to pick. */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}
type EyeDropperCtor = new () => EyeDropperApi;

interface Props {
  label: string;
  /** The raw CSS value, exactly as it stands in the stylesheet. */
  value: string;
  onChange: (value: string) => void;
  /** Shown under the label - what this colour is FOR, in the user's words. */
  hint?: string;
  /** The `--name` badge, where the surface wants to show which variable is being edited. */
  varName?: string;
  /**
   * An advisory contrast reading, already computed by the caller.
   *
   * `text` is what shows: short enough to sit on the opacity row rather than wrapping under
   * it. `title` carries the caveat, which matters more than it is long - the arithmetic sees
   * two colour values, while what a viewer can actually read also depends on transparency,
   * the moving video behind the graphic, type size and key-and-fill output. It is a sanity
   * number, never a verdict, and the words say so where someone stops to ask.
   */
  advisory?: { text: string; title: string };
  onReset?: () => void;
  disabled?: boolean;
  /** Stable handle for specs. Text is not one: `--accent` is a substring of `--accent-ink`,
   *  `--accent-weight` and `--accent-glow`, so a hasText filter matches four rows. */
  testId?: string;
}

export default function ColorField({
  label,
  value,
  onChange,
  hint,
  varName,
  advisory,
  onReset,
  disabled,
  testId,
}: Props) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const dropperError = useRef(false);

  const parsed = parseCssColor(value);
  // A value we cannot parse is still editable as text - a colour written as `color-mix(...)`
  // or a keyword is legal CSS and losing the field would be worse than losing the swatch.
  const shown = text ?? value;

  const patch = (next: Partial<CssColor>) => {
    if (!parsed) return;
    onChange(formatCssColor({ ...parsed, ...next }));
    setText(null);
  };

  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window && !dropperError.current;
  const pickFromScreen = async () => {
    try {
      const Dropper = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
      const { sRGBHex } = await new Dropper().open();
      const picked = parseCssColor(sRGBHex);
      // Keep the alpha that was there: the eyedropper reads an opaque screen pixel, and
      // dropping a panel's transparency because someone matched its hue is the same bug in
      // a different coat.
      if (picked) patch({ r: picked.r, g: picked.g, b: picked.b });
    } catch {
      /* the user dismissed it, or the API refused - neither is worth reporting */
    }
  };

  return (
    <div className="field-row color-field" data-testid={testId}>
      <div className="field-meta">
        <label htmlFor={id} style={{ margin: 0 }}>
          {label}
        </label>
        {varName && <span className="field-id">--{varName}</span>}
        {hint && <span className="hint color-field-hint">{hint}</span>}
      </div>
      <div className="row">
        <input
          id={id}
          type="color"
          className="color-field-swatch"
          aria-label={`${label} colour`}
          disabled={disabled || !parsed}
          value={parsed ? formatCssColor({ ...parsed, a: 1 }) : '#888888'}
          onChange={(e) => {
            const picked = parseCssColor(e.target.value);
            if (picked) patch({ r: picked.r, g: picked.g, b: picked.b });
          }}
        />
        {canPick && (
          <button
            type="button"
            className="color-field-dropper"
            title="Pick a colour from anywhere on screen — including the preview"
            aria-label={`Pick ${label} from screen`}
            disabled={disabled || !parsed}
            onClick={() => void pickFromScreen()}
          >
            <IconEyedropper size={14} />
          </button>
        )}
        <input
          className="grow"
          aria-label={`${label} value`}
          value={shown}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            // Commit as soon as it reads as a colour, so the preview follows the typing — the
            // whole point of picking a colour is watching the graphic change. A PARTIAL value
            // is held in local state instead: committing "rgba(255,255,255,0." on the way to a
            // real one would write nonsense into the stylesheet and spend an undo step on it.
            if (parseCssColor(next)) onChange(next);
          }}
          onBlur={() => {
            if (text !== null && text !== value) onChange(text);
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setText(null);
          }}
        />
        {onReset && (
          <button type="button" title="Back to the design's own value" onClick={onReset} disabled={disabled}>
            ↺
          </button>
        )}
      </div>
      {parsed && (
        <div className="row color-field-alpha">
          <label htmlFor={`${id}-a`} className="hint">
            Opacity
          </label>
          {/* Deliberately NOT `.grow`: that is the shared layout utility the VALUE field uses,
              and two of them in one row make `input.grow` ambiguous for anything selecting the
              value — which is exactly what it meant to every existing spec. */}
          <input
            id={`${id}-a`}
            type="range"
            className="color-field-alpha-input"
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={Math.round(parsed.a * 100)}
            onChange={(e) => patch({ a: Number(e.target.value) / 100 })}
          />
          <span className="hint color-field-alpha-value">{Math.round(parsed.a * 100)}%</span>
          {advisory && (
            <span className="hint color-field-advisory" title={advisory.title}>
              contrast {advisory.text}
            </span>
          )}
        </div>
      )}
      {!parsed && advisory && (
        <p className="hint color-field-advisory" title={advisory.title}>
          {advisory.text}
        </p>
      )}
    </div>
  );
}
