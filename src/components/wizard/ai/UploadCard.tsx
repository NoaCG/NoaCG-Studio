// One uploaded picture, and what it is FOR.
//
// The purpose lives on the CARD rather than behind three separate drop zones on purpose: a
// user does not know the vocabulary before they drop something, the same drop can carry three
// different intents, and the purpose is a property of the picture rather than of the gesture.
// So: drop first, label second, one click to change.
//
// The preselect (model/imagePurpose.ts guessPurpose) is always visible and never blocks — it
// only ever guesses between "a mark" and "a picture", because the other two purposes are
// intents that nothing in the pixels reveals.

import {
  BINDING_LABEL,
  IMAGE_PURPOSES,
  PURPOSE_HINT,
  PURPOSE_LABEL,
  type AssetBinding,
  type PurposedImage,
} from '../../../model/imagePurpose';

interface Props {
  item: PurposedImage;
  /** False in Lite, which accepts a logo and nothing else — four choices would be a lie. */
  choosable: boolean;
  /**
   * Offer the fixed/swappable sub-choice. False for VIDEO, where a picture reaches the
   * composition through a declared image INPUT and "operators can swap it" describes a
   * control the video project does not have — a toggle that changed nothing would be worse
   * than no toggle.
   */
  showBinding?: boolean;
  onChange: (patch: Partial<PurposedImage>) => void;
  onRemove: () => void;
}

const BINDINGS: AssetBinding[] = ['swappable', 'fixed'];

export function UploadCard({ item, choosable, showBinding = true, onChange, onRemove }: Props) {
  const src = typeof item.asset.data === 'string' ? item.asset.data : undefined;
  const name = item.asset.path.replace(/^images\//, '');

  return (
    <div className="wz-upload" data-testid="ai-upload" data-purpose={item.purpose}>
      <div className="wz-upload-head">
        {src && <img className="wz-upload-thumb" src={src} alt="" />}
        <span className="wz-upload-name" title={item.asset.path}>{name}</span>
        <button className="wz-upload-x" onClick={onRemove} title="Remove" aria-label={`Remove ${name}`}>
          ✕
        </button>
      </div>

      {choosable && (
        <>
          <div className="wz-purpose" role="group" aria-label={`What ${name} is for`}>
            {IMAGE_PURPOSES.map((purpose) => (
              <button
                key={purpose}
                data-testid={`purpose-${purpose}`}
                className={purpose === item.purpose ? 'active' : ''}
                aria-pressed={purpose === item.purpose}
                title={PURPOSE_HINT[purpose]}
                onClick={() =>
                  onChange({
                    purpose,
                    // The binding only means anything for an as-is asset; carrying a stale
                    // one on a reference would resurrect it if the user switched back.
                    binding: purpose === 'asset' ? (item.binding ?? 'swappable') : undefined,
                  })
                }
              >
                {PURPOSE_LABEL[purpose]}
              </button>
            ))}
          </div>
          <p className="hint wz-upload-hint">{PURPOSE_HINT[item.purpose]}</p>

          {showBinding && item.purpose === 'asset' && (
            <div className="wz-purpose wz-binding" role="group" aria-label={`Who controls ${name}`}>
              {BINDINGS.map((binding) => (
                <button
                  key={binding}
                  data-testid={`binding-${binding}`}
                  className={binding === (item.binding ?? 'swappable') ? 'active' : ''}
                  aria-pressed={binding === (item.binding ?? 'swappable')}
                  title={
                    binding === 'swappable'
                      ? 'It becomes a field in the control panel, so an operator can change it per item (a guest photo).'
                      : 'It is built in with no control of its own, so nobody can change it by accident (a channel bug).'
                  }
                  onClick={() => onChange({ binding })}
                >
                  {BINDING_LABEL[binding]}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
