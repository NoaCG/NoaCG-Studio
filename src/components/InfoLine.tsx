import { useId, useState, type ReactNode } from 'react';

/**
 * ONE LINE, THE REST BEHIND A SMALL INFO BUTTON (docs/work-specs/studio-day-playout D8): the line
 * says what to do, and the ⓘ beside it opens the why and the details underneath, for whoever wants
 * them. The line-level sibling of wizard/SectionHead, the house pattern for a section's one line
 * (contract `wizard/give-section-line-info-button-rest`), and drawn with its ⓘ and body styles so the
 * app has one info button. A button rather than a hover tooltip, so it works with a finger and a
 * keyboard, and reads out as expanded or not.
 */
export default function InfoLine({
  children,
  more,
  label,
  as: Line = 'p',
  className = 'hint',
  testId,
}: {
  /** The one line. */
  children: ReactNode;
  /** What the info button opens. */
  more: ReactNode;
  /** What the button is about, for a screen reader: "About pairing". */
  label: string;
  /** A heading when the line is what the step asks for. */
  as?: 'p' | 'h1';
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="info-line" data-testid={testId}>
      <Line className={className}>
        {children}{' '}
        <button
          type="button"
          className={`wz-why-btn${open ? ' active' : ''}`}
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          data-testid={testId ? `${testId}-info` : undefined}
        >
          ⓘ
        </button>
      </Line>
      {open && (
        <div id={id} className="wz-why hint" data-testid={testId ? `${testId}-more` : undefined}>
          {more}
        </div>
      )}
    </div>
  );
}
