import { FONTS } from '../../../model/fonts';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import type { WizardDraft } from '../draft';
import WizardConfirm from '../WizardConfirm';
import type { KitOps } from './useKit';

/** What "Apply this Style to all" is actually offering to carry, in the user's own words - the
 *  same read-back the single-graphic Finish gives, so the offer is not taken blind. */
function lookSummary(draft: WizardDraft, variant: TemplateVariant | undefined): string {
  if (!variant) return 'this look';
  const palette = draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette);
  const fontId = draft.fontId ?? variant.defaultFontId;
  const font =
    fontId === 'custom'
      ? draft.customFont?.family ?? 'your imported typeface'
      : FONTS.find((f) => f.id === fontId)?.family ?? 'the design’s typeface';
  return `${palette.name} · ${font}`;
}

/** The questions a kit asks before acting (template/useKit.ts), over the wizard. */
export default function KitConfirms({
  kit,
  draft,
  variant,
}: {
  kit: KitOps;
  /** The open graphic's draft, and its design: what "Apply this Style" carries. */
  draft: WizardDraft;
  variant: TemplateVariant | undefined;
}) {
  const { switchAsk, applyAsk } = kit;
  const s = applyAsk?.others === 1 ? '' : 's';
  return (
    <>
      {switchAsk && (
        <WizardConfirm
          title={`Start the ${switchAsk.to} kit?`}
          confirmLabel={`Start ${switchAsk.to}`}
          cancelLabel={`Keep ${switchAsk.from}`}
          onConfirm={kit.confirmSwitch}
          onCancel={kit.keepKit}
          testid="kit-switch-confirm"
        >
          <p className="wz-confirm-lead">
            You have edited graphics in the <strong>{switchAsk.from}</strong> kit.
          </p>
          <div className="wz-confirm-warn">
            Starting {switchAsk.to} builds a new set of graphics, and the {switchAsk.from} edits are
            not kept.
          </div>
        </WizardConfirm>
      )}

      {applyAsk && (
        <WizardConfirm
          title="Apply this Style to the whole kit?"
          confirmLabel={`Apply to ${applyAsk.others} graphic${s}`}
          cancelLabel="Not now"
          onConfirm={kit.applyStyle}
          onCancel={kit.cancelApply}
          testid="kit-apply-confirm"
        >
          <p className="wz-confirm-lead">
            The other {applyAsk.others} graphic{s} in{' '}
            <strong>{applyAsk.kit}</strong> take this one's Style: <strong>{lookSummary(draft, variant)}</strong>.
          </p>
          <ul>
            <li>Their colours, typeface, sizes and motion change to match.</li>
            <li>Their text and placement stay as they are.</li>
            <li>You can still change any graphic on its own afterwards.</li>
          </ul>
        </WizardConfirm>
      )}
    </>
  );
}
