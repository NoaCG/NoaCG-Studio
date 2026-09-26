// THE editable-field control. Every surface where a human changes a field's value renders
// this one component: the SPX Data panel (sample data, incl. hidden fields), the SPX Control
// panel (the operator view), and the video Content panel (the video Template Definition).
// They differ only in the DESCRIPTORS they pass (model/fieldModel.ts) and where the value
// lives — never in what a number/colour/image control looks like or how it behaves.
//
// The standalone controlpanel.html export renders the same descriptors in dependency-free
// vanilla JS (control/controlPanelHtml.ts) because it ships without React; keep the two in
// step — same kinds, same semantics.

import { useRef, useState } from 'react';
import { clampToField, type FieldDescriptor, type FieldValue } from '../../model/fieldModel';
import { OVERFLOW_FIELD_HINT, OVERFLOW_FIELD_MARK } from '../../control/controlModel';

/** One pickable image for an `image` field. */
export interface FieldImage {
  /** What the field's value becomes: an asset path (SPX) or an asset's logical name (video). */
  value: string;
  /** Data URL for the thumbnail, when the asset carries one. */
  src?: string;
}

export interface FieldControlProps {
  descriptor: FieldDescriptor;
  value: FieldValue;
  /** Emits the kind's natural type: a number for `number`, a string for every other kind. */
  onChange: (value: FieldValue) => void;
  /** `image` only: the images to pick from. */
  images?: FieldImage[];
  /** `image` only: when given, the control offers an inline upload button. */
  onUpload?: (file: File) => void;
  /** `image` only: shown when there is nothing to pick and no inline upload (the video
   *  project uploads in its Assets tab, so its picker points there). */
  imageHint?: string;
  /** data-testid for the control's primary input. */
  testId?: string;
}

/** Numbers: −/+ steppers around the value, clamped to the descriptor's bounds. */
function NumberControl({ descriptor: d, value, onChange, testId }: FieldControlProps) {
  // Hold the raw text while typing so the box can be empty or mid-edit ("-", "1."); the value
  // only commits once the text parses as a number.
  const [draft, setDraft] = useState<string | null>(null);
  // A declared step is authoritative (video inputs carry one). A field that declares none —
  // every SPX number field — lets the operator pick the bump size instead.
  const [operatorStep, setOperatorStep] = useState('1');
  const step = d.step ?? (parseFloat(operatorStep) || 1);

  const bump = (dir: number) => {
    const base = Number(draft ?? value);
    onChange(clampToField(d, (Number.isFinite(base) ? base : 0) + dir * step));
    setDraft(null);
  };

  return (
    <div className="row">
      <button className="ctl-step" title="Down" onClick={() => bump(-1)}>−</button>
      <input
        className="ctl-num"
        type="number"
        aria-label={d.label}
        min={d.min}
        max={d.max}
        step={d.step}
        value={draft ?? String(value)}
        data-testid={testId}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(clampToField(d, n));
        }}
        onBlur={() => setDraft(null)} // an unparsable draft falls back to the committed value
      />
      <button className="ctl-step" title="Up" onClick={() => bump(1)}>+</button>
      {d.step == null && (
        // SAID OUT LOUD, not left to a tooltip. Styled like the value box and sitting right
        // beside it, this read as a second score on a match board - two identical number boxes,
        // one of which changes nothing on air. The caption is what tells them apart at a glance.
        <label className="ctl-stepsize" title="How much + and − change the value">
          <span>step</span>
          <input
            className="ctl-num ctl-num-step"
            type="number"
            value={operatorStep}
            onChange={(e) => setOperatorStep(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

/** Images: pick one of the project's assets. Uploading is offered only where it belongs. */
function ImageControl({ value, onChange, images = [], onUpload, imageHint, testId }: FieldControlProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const current = String(value);
  // A value pointing at a since-removed asset stays selectable (marked), so the control never
  // silently drops the operator's choice.
  const missing = current !== '' && !images.some((i) => i.value === current);
  const thumb = images.find((i) => i.value === current)?.src;

  return (
    // The hint sits UNDER the picker, never beside it: as a flex sibling its two lines of text
    // took the row's whole width and squeezed the select - which has no content of its own to
    // hold it open when the graphic carries no pictures - down to a bare chevron. A crest slot
    // reachable only by aiming at a 20px arrow is the cockpit divergence in a different form.
    <div className="ctl-image">
      <div className="row">
        <select className="grow" value={current} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
          <option value="">None</option>
          {images.map((i) => (
            <option key={i.value} value={i.value}>{i.value}</option>
          ))}
          {missing && <option value={current}>{current} (missing)</option>}
        </select>
        {thumb && <img className="ctl-thumb" src={thumb} alt="" />}
        {onUpload && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = ''; // let the same file be picked again
              }}
            />
            <button title="Upload an image — bundled into the export under images/" onClick={() => fileInput.current?.click()}>
              ⬆ Upload…
            </button>
          </>
        )}
      </div>
      {!onUpload && images.length === 0 && imageHint && <p className="hint ctl-image-hint">{imageHint}</p>}
    </div>
  );
}

/** The control for one field, chosen purely from its kind. No per-template, per-world code. */
export function FieldControl(props: FieldControlProps) {
  const { descriptor: d, value, onChange, testId } = props;

  switch (d.kind) {
    case 'number':
      return <NumberControl {...props} />;

    case 'image':
      return <ImageControl {...props} />;

    // A line list (ticker items, credits, a schedule): one entry per line, so a whole list can
    // be pasted in at once.
    case 'lines':
      return (
        <textarea
          rows={3}
          placeholder="one entry per line"
          value={String(value)}
          data-testid={testId}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'select': {
      const options = d.options ?? [];
      // A SHORT constrained choice (a quiz's A/B/C/D, a two-way switch) renders as segmented
      // buttons — every option visible, one press to pick, which is what an operator under
      // pressure needs. Longer lists keep the dropdown. Same kind, same semantics, purely
      // presentation; the vanilla exports (controlPanelHtml.ts, productionControllerHtml.ts)
      // apply the identical rule.
      const segmented = options.length > 0 && options.length <= 5 && options.every((o) => o.label.length <= 4);
      if (segmented) {
        return (
          <div className="ctl-segmented" role="radiogroup" data-testid={testId}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={String(value) === o.value ? 'on' : undefined}
                aria-pressed={String(value) === o.value}
                data-testid={testId ? `${testId}-opt-${o.value || 'none'}` : undefined}
                onClick={() => onChange(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        );
      }
      return (
        <select value={String(value)} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }

    case 'toggle':
      return (
        <label className="row" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={value === '1' || value === 'true' || value === 1}
            data-testid={testId}
            onChange={(e) => onChange(e.target.checked ? '1' : '0')}
          />
          <span className="muted">enabled</span>
        </label>
      );

    case 'color': {
      const hex = String(value);
      return (
        <div className="row">
          <input
            type="color"
            style={{ width: 44, padding: 2, flex: '0 0 auto' }}
            value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'}
            data-testid={testId}
            onChange={(e) => onChange(e.target.value)}
          />
          <input className="grow" value={hex} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    }

    default:
      return <input type="text" value={String(value)} data-testid={testId} onChange={(e) => onChange(e.target.value)} />;
  }
}

export interface FieldRowProps extends FieldControlProps {
  /** A small badge after the label — the SPX field id ('f0'). */
  badge?: string;
  /** Names the row's test ids: `<prefix>-<key>` on the control, `<prefix>-reset-<key>` on Reset. */
  testIdPrefix?: string;
  /** THIS VALUE DOES NOT FIT — the graphic reported it through `noacgTextOverflow()` after its
   *  fit ladder ran out of room (controlModel.ts's overflow vocabulary). Marked on the row that
   *  holds it, because a summary alone does not say WHICH box to shorten. */
  overflow?: boolean;
}

/**
 * A labelled field: the control plus its identity and a per-field Reset back to the authored
 * default (shown only once the value actually differs from it).
 */
export function FieldRow({ badge, testIdPrefix, overflow, ...props }: FieldRowProps) {
  const { descriptor: d, value, onChange } = props;
  const changed = String(value) !== String(d.defaultValue);

  return (
    <div className={`field-row${overflow ? ' field-row-over' : ''}`}>
      <div className="field-meta">
        <label style={{ margin: 0 }}>{d.label}</label>
        <span className="row" style={{ gap: 6 }}>
          {overflow && (
            <span
              className="field-over"
              title={OVERFLOW_FIELD_HINT}
              data-testid={testIdPrefix ? `${testIdPrefix}-over-${d.key}` : undefined}
            >
              ⚠ {OVERFLOW_FIELD_MARK}
            </span>
          )}
          {changed && (
            <button
              className="field-reset"
              title={`Reset to "${d.defaultValue}"`}
              data-testid={testIdPrefix ? `${testIdPrefix}-reset-${d.key}` : undefined}
              onClick={() => onChange(d.defaultValue)}
            >
              ↺ Reset
            </button>
          )}
          {badge && <span className="field-id">{badge}</span>}
        </span>
      </div>
      <FieldControl {...props} testId={props.testId ?? (testIdPrefix ? `${testIdPrefix}-${d.key}` : undefined)} />
    </div>
  );
}
