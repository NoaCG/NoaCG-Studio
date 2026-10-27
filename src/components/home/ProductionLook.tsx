import type { ProjectBrand } from '../../model/brand';
import { styleTerm } from '../../model/styleVocabulary';
import type { LookException, LookReach } from '../../control/productionLook';
import { Swatch } from './CueAdjust';

/**
 * SETUP › LOOK (docs/work-specs/playout-adjustments/spec.md phase 3, "Production look"): one
 * typeface, heading weight and the contract colours for every graphic of the production, as the
 * widest scope under each graphic's and cue's own. A panel in the control area, never a modal, so
 * the monitors stay on screen. Props only: what the look is, what it reaches, and the writes.
 * Nothing here reaches air by itself: the next Take or Update of each graphic, or "Send to on-air
 * graphics", carries it.
 */
export default function ProductionLook({
  look,
  on,
  setOn,
  brands,
  brandId,
  pickBrand,
  edit,
  bundled,
  weights,
  reach,
  exceptions,
  clearExceptions,
  onAir,
  send,
  sending,
  sent,
  joinBundledOnly,
  lightPanel,
  readOnly,
  onClose,
}: {
  look: ProjectBrand | null;
  on: boolean;
  setOn: (on: boolean) => void;
  brands: readonly { id: string; name: string }[];
  brandId: string | null;
  pickBrand: (id: string) => void;
  /** A hand edit of the look (it is then no longer the saved brand). */
  edit: (next: ProjectBrand) => void;
  bundled: readonly { id: string; family: string }[];
  /** The heading weights the look's face draws. */
  weights: readonly { value: number; label: string }[];
  reach: LookReach | null;
  exceptions: readonly LookException[];
  clearExceptions: () => void;
  /** Graphics on air now. */
  onAir: number;
  send: () => void;
  sending: boolean;
  /** What the last send came to, in one line. */
  sent: string | null;
  /** The look's face is imported: the join page gets its name only. */
  joinBundledOnly: boolean;
  lightPanel: boolean;
  /** Authoring is paused: the panel reads, it does not write. */
  readOnly: boolean;
  onClose: () => void;
}) {
  const faceKey = !look ? '' : look.customFont ? `i:${look.customFont.family}` : look.fontId ? `b:${look.fontId}` : '';
  const pickFace = (key: string) => {
    if (!look || !key) return;
    // The look's own imported face stays its only imported choice: its bytes travel with it.
    if (key.startsWith('b:')) edit({ ...look, fontId: key.slice(2), customFont: null });
  };
  const weight = look?.tokens?.['display-weight'] ?? '';
  const colour = (k: 'accent' | 'text-color' | 'panel-bg', v: string) => {
    if (!look) return;
    const key = k === 'accent' ? 'accent' : k === 'text-color' ? 'text' : 'panel';
    edit({ ...look, palette: { ...look.palette, id: 'custom', [key]: v } });
  };
  const paletteOf = (k: 'accent' | 'text-color' | 'panel-bg') => (!look ? '#000000' : k === 'accent' ? look.palette.accent : k === 'text-color' ? look.palette.text : look.palette.panel);
  const lock = readOnly || !look;
  return (
    <section className="pd-look" aria-label="Look" data-testid="production-look">
      <div className="pd-look-head">
        <strong>Look</strong>
        <span className="muted">this production</span>
        <span className="pd-look-onoff" role="group" aria-label="Look on or off">
          <button type="button" className={on ? 'on' : ''} aria-pressed={on} disabled={readOnly || !look} onClick={() => !on && setOn(true)} data-testid="look-on">
            On
          </button>
          <button type="button" className={on ? '' : 'on'} aria-pressed={!on} disabled={readOnly} onClick={() => on && setOn(false)} data-testid="look-off">
            Off
          </button>
        </span>
        <button type="button" className="pd-look-close" aria-label="Close" onClick={onClose} data-testid="look-close">
          ✕
        </button>
      </div>
      <div className="pd-adjust-row">
        <span className="pd-adjust-label">Brand</span>
        <select aria-label="Brand" value={brandId ?? ''} disabled={readOnly || brands.length === 0} onChange={(e) => e.target.value && pickBrand(e.target.value)} data-testid="look-brand">
          <option value="">{look ? 'This production’s look' : 'Choose a brand'}</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {look && (
        <>
          <div className="pd-adjust-row">
            <span className="pd-adjust-label">Type</span>
            <select aria-label="Typeface" value={faceKey} disabled={lock} onChange={(e) => pickFace(e.target.value)} data-testid="look-typeface">
              {faceKey === '' && <option value="">As designed</option>}
              {bundled.map((b) => (
                <option key={b.id} value={`b:${b.id}`}>
                  {b.family}
                </option>
              ))}
              {look.customFont && <option value={`i:${look.customFont.family}`}>{look.customFont.family}</option>}
            </select>
            {weights.length > 1 && (
              <select
                aria-label="Weight"
                value={weight}
                disabled={lock}
                onChange={(e) => {
                  const tokens = { ...(look.tokens ?? {}) };
                  if (e.target.value) tokens['display-weight'] = e.target.value;
                  else delete tokens['display-weight'];
                  edit({ ...look, tokens });
                }}
                data-testid="look-weight"
              >
                <option value="">As designed</option>
                {weights.map((w) => (
                  <option key={w.value} value={String(w.value)}>
                    {w.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="pd-adjust-row">
            <span className="pd-adjust-label">Colour</span>
            {(['accent', 'text-color', 'panel-bg'] as const).map((k) => (
              <Swatch key={k} label={styleTerm(k).label} value={paletteOf(k)} disabled={lock} onPick={(v) => colour(k, v)} testId={`look-colour-${k}`} />
            ))}
          </div>
          {lightPanel && <p className="status-warn pd-look-line" data-testid="look-tone">Light panels: most designs are drawn for dark ones.</p>}
        </>
      )}
      {reach && (
        <p className="muted pd-look-line" data-testid="look-reach">
          Type reaches {reach.type} of {reach.pool} · Accent reaches {reach.accent} of {reach.pool}
          {reach.untouched.length > 0 && <span data-testid="look-untouched"> · {reach.untouched.join(', ')}: as designed</span>}
        </p>
      )}
      {exceptions.length > 0 && (
        <div className="pd-adjust-row" data-testid="look-exceptions">
          <span className="muted">
            Exceptions ({exceptions.length}): {exceptions.map((e) => (e.cue ? `${e.graphic} · ${e.cue}` : e.graphic)).join(', ')}
          </span>
          <button type="button" disabled={readOnly} onClick={clearExceptions} data-testid="look-clear-exceptions">
            Clear exceptions
          </button>
        </div>
      )}
      <div className="pd-adjust-row">
        <button type="button" disabled={readOnly || sending || onAir === 0} onClick={send} data-testid="look-send">
          Send to on-air graphics
        </button>
        <span className="muted" data-testid="look-on-air">
          ({onAir} on air)
        </span>
        {sent && (
          <span className="muted" data-testid="look-sent">
            {sent}
          </span>
        )}
      </div>
      {joinBundledOnly && <p className="muted pd-look-line" data-testid="look-join-note">Join page: bundled typefaces only.</p>}
    </section>
  );
}

