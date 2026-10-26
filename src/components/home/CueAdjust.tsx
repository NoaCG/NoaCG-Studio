import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ZONES, type AdjustPatch, type Zone9 } from '../../model/adjust';
import { adjustWords, floorEstimate, zoneWords, type GeometryLimit } from '../../control/cueAdjust';
import type { CueAdjustState } from '../../control/adjustGeometry';

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
  state,
  category,
  open,
  setOpen,
  write,
  step,
  reset,
  promote,
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
  state: CueAdjustState;
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
}) {
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
  /** Arrow keys nudge while focus is inside the block, and only there (never in a typed box). */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const n = stepOf(e);
    const move: Record<string, [number, number]> = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    nudge(d[0], d[1]);
  };
  const why = whyWords(limit, m, fresh);

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
          {where} · {words || 'as designed'}
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
            <NumberBox label="x" value={x} disabled={locked || limit === 'spans'} onCommit={(v) => write({ x: v })} testId="adjust-x" />
            <NumberBox label="y" value={y} disabled={locked} onCommit={(v) => write({ y: v })} testId="adjust-y" />
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
            <NumberBox label="" value={Math.round(s * 100)} disabled={sizeOff} onCommit={(v) => v > 0 && write({ scale: v / 100 })} testId="adjust-size" />
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

function whyWords(limit: GeometryLimit, m: unknown, fresh: boolean): string {
  if (limit === 'spans') return 'spans the frame';
  if (limit === 'none') return m ? 'no measurement' : 'measuring';
  if (limit === 'no-presets') return 'no presets for moving content';
  return fresh ? '' : 'measuring';
}

/** A number typed in, written on Enter or when focus leaves; Escape puts the value back. */
function NumberBox({ label, value, disabled, onCommit, testId }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void; testId: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.replace('−', '-'));
    if (text.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <label className="pd-adjust-num">
      {label && <span>{label}</span>}
      <input
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setText(String(value));
        }}
        data-testid={testId}
      />
    </label>
  );
}
