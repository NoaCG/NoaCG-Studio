import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ZONES, type AdjustPatch, type FontRef, type Zone9 } from '../../model/adjust';
import { formatCssColor, parseCssColor, pickerHex } from '../../model/cssVars';
import { styleTerm } from '../../model/styleVocabulary';
import { reachesAny, weightsFor, type ImportedFace, type StyleReach } from '../../control/cueStyle';
import { adjustWords, floorEstimate, zoneWords, type GeometryLimit } from '../../control/cueAdjust';
import type { CueAdjustState } from '../../control/adjustGeometry';
import type { StorePart } from '../../control/storePart';
import { useStorePart } from './useStorePart';
import { useDeferredEdits, type DeferredEdits } from './useDeferredEdits';

/**
 * THE ADJUST BLOCK (docs/work-specs/playout-adjustments/spec.md, "What the operator sees", phase 1):
 * the cue's place and size, in the cue-settings strip, closed by default with its state in the
 * summary. Props only: what it edits, what the fold and the measurement say, and the writes. It
 * edits the graphic's default unless the cue has its own exception or "Only this cue" is on.
 * Nothing here reaches air: Take or ✎ Update carries it.
 */
export default function CueAdjust({
  graphicName,
  cueCount,
  exceptions,
  scope,
  onlyThisCue,
  setOnlyThisCue,
  measured,
  stateOf,
  category,
  open,
  setOpen,
  write,
  step,
  reset,
  promote,
  style = null,
}: {
  graphicName: string;
  /** How many cues the graphic has. */
  cueCount: number;
  /** How many of its OTHER cues keep their own place and size. */
  exceptions: number;
  /** What the block writes: the cue's own record, or the graphic's default. */
  scope: 'cue' | 'graphic';
  onlyThisCue: boolean;
  setOnlyThisCue: (on: boolean) => void;
  /** The session's measurements: subscribed here, so a measurement redraws this block, not the page. */
  measured: StorePart<unknown>;
  /** The cue's fold, measurement and resolution as they stand (control/adjustGeometry.ts). */
  stateOf: () => CueAdjustState;
  /** The graphic's category, for the readability floor. */
  category: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  write: (patch: AdjustPatch) => void;
  /** Add to x, y or the scale, from the record as it stands when the write runs. */
  step: (by: { x?: number; y?: number; scale?: number }) => void;
  /** Remove the record at a scope. */
  reset: (scope: 'cue' | 'graphic') => void;
  /** Make the cue's exception the graphic's default. */
  promote: () => void;
  /** TYPE AND COLOUR (phase 2): what the design paints with, the faces on offer, the design's own
   *  values, and the writes. "As designed" puts a row back to the design at the scope shown. */
  style?: {
    reach: StyleReach;
    /** An imported design: its type and colour are the artwork's own. */
    artwork: boolean;
    imported: readonly ImportedFace[];
    bundled: readonly { id: string; family: string }[];
    /** The design's own `--font-heading`, `--font-numeric` (where it draws live numbers) and colour values. */
    design: Record<string, string>;
    asDesigned: (row: 'type' | 'colour') => void;
    /** The typeface alone back to the design's, at the scope shown. */
    designedFace: () => void;
    /** A face chosen, with the weight in effect (`control/cueStyle.ts` `facePickPatch`). */
    pickFace: (next: FontRef, weight: string) => void;
  } | null;
}) {
  useStorePart(measured);
  const state = stateOf();
  const { eff, m, fresh, limit } = state;
  const s = eff.scale ?? 1;
  const x = eff.x ?? 0;
  const y = eff.y ?? 0;
  const ownCue = eff.own.length > 0;
  const words = adjustWords(eff);
  const where = scope === 'cue' ? 'only this cue' : cueCount > 1 ? `all ${cueCount} ${graphicName} cues` : graphicName;
  const kept = scope === 'graphic' && exceptions > 0 ? ` · ${exceptions === 1 ? '1 cue keeps its own' : `${exceptions} cues keep their own`}` : '';
  const floor = floorEstimate(m?.minText, limit === 'spans' ? 1 : s, category);
  const pivot = state.pivot;
  const locked = eff.readOnly;
  const presetsOff = locked || limit !== null;
  const sizeOff = locked || limit === 'spans';
  const nudge = (dx: number, dy: number) => {
    if (locked) return;
    if (limit === 'spans') dx = 0;
    if (dx || dy) step({ ...(dx ? { x: dx } : {}), ...(dy ? { y: dy } : {}) });
  };
  const stepOf = (e: { shiftKey: boolean }) => (e.shiftKey ? 10 : 1);
  const resize = (by: number) => {
    if (!sizeOff) step({ scale: by });
  };
  /** Arrow keys nudge while focus is inside the block, and only there (never in a typed box or
   *  the typeface select, whose arrows choose a face). */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    const n = stepOf(e);
    const move: Record<string, [number, number]> = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    nudge(d[0], d[1]);
  };
  const why = whyWords(limit, m, fresh);
  const styleSum = style ? styleWords(eff.vars, eff.font, style.bundled) : '';
  // A typed x, y or size is one write when the edit is over (Enter or leaving the box, never a pause:
  // 8 on the way to 84 would size the graphic), and a second operator's change to the same record
  // never replaces what is being typed (./useDeferredEdits.ts).
  const shown: Record<string, number> = { x, y, size: Math.round(s * 100) };
  const edits = useDeferredEdits(
    (key, text) => {
      const n = Number(text.replace('−', '-'));
      if (text.trim() === '' || !Number.isFinite(n) || n === shown[key]) return;
      if (key === 'size') {
        if (n > 0) write({ scale: n / 100 });
      } else write({ [key]: n });
    },
    { settle: false },
  );

  return (
    <div className="pd-adjust" data-testid="cue-adjust">
      <button
        type="button"
        className="pd-advanced-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="cue-adjust-toggle"
      >
        <span className="pd-advanced-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        Adjust
        <span className="pd-advanced-sum" data-testid="cue-adjust-summary">
          {where} · {[words, styleSum].filter(Boolean).join(', ') || 'as designed'}
          {kept}
        </span>
      </button>
      {open && (
        <div className="pd-adjust-body" onKeyDown={onKey} data-testid="cue-adjust-body">
          {locked && <p className="status-warn">Set by a later version of NoaCG: read-only here.</p>}
          <div className="pd-adjust-row">
            <span className="pd-adjust-label">Place</span>
            <div className="pd-adjust-grid" role="group" aria-label="Place" data-testid="adjust-place">
              {ZONES.map((z) => (
                <button
                  key={z}
                  type="button"
                  className={`pd-adjust-cell${eff.place === z ? ' on' : ''}${pivot === z ? ' pivot' : ''}`}
                  aria-label={zoneWords(z)}
                  aria-pressed={eff.place === z}
                  title={zoneWords(z)}
                  disabled={presetsOff}
                  onClick={() => write({ place: z as Zone9 })}
                  data-testid={`adjust-place-${z}`}
                />
              ))}
            </div>
            <span className="pd-adjust-arrows">
              {(
                [
                  ['◀', 'Left', -1, 0],
                  ['▶', 'Right', 1, 0],
                  ['▲', 'Up', 0, -1],
                  ['▼', 'Down', 0, 1],
                ] as const
              ).map(([glyph, label, dx, dy]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`Nudge ${label.toLowerCase()}`}
                  title={`${label} 1 px, Shift 10 px`}
                  disabled={locked || (limit === 'spans' && dx !== 0)}
                  onClick={(e: MouseEvent) => nudge(dx * stepOf(e), dy * stepOf(e))}
                  data-testid={`adjust-nudge-${label.toLowerCase()}`}
                >
                  {glyph}
                </button>
              ))}
            </span>
            <NumberBox label="x" edits={edits} name="x" value={x} disabled={locked || limit === 'spans'} testId="adjust-x" />
            <NumberBox label="y" edits={edits} name="y" value={y} disabled={locked} testId="adjust-y" />
            <span className="muted">px</span>
            {why && (
              <span className="muted pd-adjust-why" data-testid="adjust-why">
                {why}
              </span>
            )}
          </div>
          <div className="pd-adjust-row">
            <span className="pd-adjust-label">Size</span>
            <button type="button" aria-label="Smaller" title="5 %, Shift 1 %" disabled={sizeOff} onClick={(e) => resize(e.shiftKey ? -0.01 : -0.05)} data-testid="adjust-smaller">
              −
            </button>
            <NumberBox label="" edits={edits} name="size" value={Math.round(s * 100)} disabled={sizeOff} testId="adjust-size" />
            <span className="muted">%</span>
            <button type="button" aria-label="Larger" title="5 %, Shift 1 %" disabled={sizeOff} onClick={(e) => resize(e.shiftKey ? 0.01 : 0.05)} data-testid="adjust-larger">
              +
            </button>
            {floor && (
              <span className={`pd-adjust-floor ${floor.tone === 'red' ? 'status-bad' : floor.tone === 'amber' ? 'status-warn' : 'muted'}`} data-testid="adjust-floor" data-tone={floor.tone}>
                smallest text {floor.px} px{floor.tone === 'red' ? ' · use a lower-third graphic' : ''}
              </span>
            )}
          </div>
          {style && <StyleRows style={style} vars={eff.vars ?? {}} font={eff.font} locked={locked} write={write} />}
          <div className="pd-adjust-row">
            {scope === 'cue' && ownCue ? (
              <>
                {cueCount > 1 && (
                  <button type="button" disabled={locked} onClick={promote} data-testid="adjust-promote">
                    Use for all {cueCount} {graphicName} cues
                  </button>
                )}
                <button type="button" disabled={locked} onClick={() => reset('cue')} data-testid="adjust-stop-exception">
                  Stop this cue’s exception
                </button>
              </>
            ) : (
              cueCount > 1 && (
                <button type="button" aria-pressed={onlyThisCue} className={onlyThisCue ? 'on' : ''} disabled={locked} onClick={() => setOnlyThisCue(!onlyThisCue)} data-testid="adjust-only-this-cue">
                  Only this cue
                </button>
              )
            )}
            {scope === 'graphic' && eff.any && !locked && (
              <button type="button" onClick={() => reset('graphic')} data-testid="adjust-reset">
                Reset {graphicName} to as designed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A face reference as one select value: '' is as designed. */
const faceKey = (f: FontRef | 'designed' | undefined) => (!f || f === 'designed' ? '' : 'fontId' in f ? `b:${f.fontId}` : `i:${f.family}|${f.assetPath}`);

/** The style a fold sets, in a few words for the summary: the face, its weight, the colours. */
function styleWords(
  vars: Record<string, string> | undefined,
  font: FontRef | 'designed' | undefined,
  bundled: readonly { id: string; family: string }[],
): string {
  const parts: string[] = [];
  if (font && font !== 'designed') parts.push('fontId' in font ? (bundled.find((b) => b.id === font.fontId)?.family ?? font.fontId) : font.family);
  const weight = vars?.['display-weight'];
  if (weight) parts.push(WEIGHT_WORD[weight] ?? weight);
  const colours = (['accent', 'text-color', 'text-dim', 'panel-bg'] as const).filter((k) => vars?.[k]);
  if (colours.length) parts.push(colours.map((k) => styleTerm(k).label.toLowerCase()).join(' and '));
  return parts.join(' ');
}

const WEIGHT_WORD: Record<string, string> = { '400': 'Regular', '500': 'Medium', '600': 'Semibold', '700': 'Bold', '800': 'Extra bold', '900': 'Black' };

/**
 * The Type and Colour rows: a typeface, its REAL weights (none drawn for a face with one), and a
 * swatch per contract colour the design paints with (`cssPaintsWith`), so no control is dead. A
 * design that paints none says so in one line.
 */
function StyleRows({
  style,
  vars,
  font,
  locked,
  write,
}: {
  style: NonNullable<Parameters<typeof CueAdjust>[0]['style']>;
  vars: Record<string, string>;
  font: FontRef | 'designed' | undefined;
  locked: boolean;
  write: (patch: AdjustPatch) => void;
}) {
  const { reach } = style;
  if (!reachesAny(reach)) {
    return (
      <p className="muted pd-adjust-why" data-testid="adjust-style-none">
        Type and colour: as designed{style.artwork ? ' (imported artwork)' : ''}
      </p>
    );
  }
  const chosen = faceKey(font);
  const weights = weightsFor(font, style.design, style.imported);
  const weight = vars['display-weight'] || '';
  const typeSet = chosen !== '' || weight !== '';
  const colourSet = reach.colours.some((k) => vars[k]);
  const pickFace = (key: string) => {
    if (!key) return style.designedFace();
    const [family, assetPath] = key.slice(2).split('|');
    style.pickFace(key.startsWith('b:') ? { fontId: key.slice(2) } : { family, assetPath }, weight);
  };
  return (
    <>
      {(reach.family || reach.weight) && (
        <div className="pd-adjust-row" data-testid="adjust-type">
          <span className="pd-adjust-label">Type</span>
          {reach.family && (
            <select aria-label="Typeface" value={chosen} disabled={locked} onChange={(e) => pickFace(e.target.value)} data-testid="adjust-typeface">
              <option value="">As designed</option>
              {style.bundled.map((b) => (
                <option key={b.id} value={`b:${b.id}`}>
                  {b.family}
                </option>
              ))}
              {style.imported.map((f) => (
                <option key={`${f.family}|${f.assetPath}`} value={`i:${f.family}|${f.assetPath}`}>
                  {f.family}
                </option>
              ))}
            </select>
          )}
          {reach.weight && weights.length > 1 && (
            <span className="pd-adjust-weights" role="group" aria-label="Weight" data-testid="adjust-weight">
              {weights.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={weight === String(w.value) ? 'on' : ''}
                  aria-pressed={weight === String(w.value)}
                  disabled={locked}
                  onClick={() => write({ vars: { 'display-weight': String(w.value) } })}
                >
                  {w.label}
                </button>
              ))}
            </span>
          )}
          <button type="button" className={typeSet ? '' : 'on'} aria-pressed={!typeSet} disabled={locked} onClick={() => typeSet && style.asDesigned('type')} data-testid="adjust-type-designed">
            As designed
          </button>
        </div>
      )}
      {reach.colours.length > 0 && (
        <div className="pd-adjust-row" data-testid="adjust-colour">
          <span className="pd-adjust-label">Colour</span>
          {reach.colours.map((k) => (
            <Swatch
              key={k}
              label={styleTerm(k).label}
              value={vars[k] || style.design[k] || '#000000'}
              disabled={locked}
              onPick={(v) => write({ vars: { [k]: v } })}
              testId={`adjust-colour-${k}`}
            />
          ))}
          <button type="button" className={colourSet ? '' : 'on'} aria-pressed={!colourSet} disabled={locked} onClick={() => colourSet && style.asDesigned('colour')} data-testid="adjust-colour-designed">
            As designed
          </button>
        </div>
      )}
    </>
  );
}

/** One colour, picked with the system swatch and written once the pick is made (its `change`, not
 *  every `input` while dragging). The value keeps the alpha it had: a translucent panel stays so. */
export function Swatch({ label, value, disabled, onPick, testId }: { label: string; value: string; disabled: boolean; onPick: (v: string) => void; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => {
      const picked = parseCssColor(el.value);
      const was = parseCssColor(valueRef.current);
      if (!picked) return;
      pickRef.current(formatCssColor({ ...picked, a: was?.a ?? 1, form: was?.form ?? picked.form }));
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  // One element for the swatch's life (the listener is on it), its colour set from the value.
  useEffect(() => {
    if (ref.current) ref.current.value = pickerHex(value);
  }, [value]);
  return (
    <label className="pd-adjust-swatch">
      <span>{label}</span>
      <input ref={ref} type="color" aria-label={label} defaultValue={pickerHex(value)} disabled={disabled} data-testid={testId} />
    </label>
  );
}

function whyWords(limit: GeometryLimit, m: unknown, fresh: boolean): string {
  if (limit === 'spans') return 'spans the frame';
  if (limit === 'none') return m ? 'no measurement' : 'measuring';
  if (limit === 'no-presets') return 'no presets for moving content';
  return fresh ? '' : 'measuring';
}

/** A number typed in, written when the edit is over (Enter or focus leaving); Escape puts the value
 *  back. */
function NumberBox({ label, edits, name, value, disabled, testId }: { label: string; edits: DeferredEdits; name: string; value: number; disabled: boolean; testId: string }) {
  return (
    <label className="pd-adjust-num">
      {label && <span>{label}</span>}
      <input
        inputMode="numeric"
        value={edits.text(name, String(value))}
        disabled={disabled}
        data-dirty={edits.dirty(name) || undefined}
        onChange={(e) => edits.type(name, e.target.value)}
        onBlur={edits.flush}
        onKeyDown={(e) => {
          if (e.key === 'Enter') edits.flush();
          if (e.key === 'Escape') {
            edits.type(name, String(value));
            edits.flush();
          }
        }}
        data-testid={testId}
      />
    </label>
  );
}
