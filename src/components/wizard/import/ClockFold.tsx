import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DraftPatch, WizardDraft } from '../draft/core';
import type { ClockTargetResolution } from '../../../control/clockTarget';
import { svgClockFold, svgClockFoldWake, svgClockWithFold } from './draft';
import SectionHead from '../SectionHead';

/** An instant as the target's line names it, in `zone`. */
export function targetFormat(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

/** The question a DST fold asks: which of the two instants the wall time names. The import step
 *  and Finish ask it with this one control. */
export function ClockFoldPick({ fold, format, onPick, testId }: { fold: Extract<ClockTargetResolution, { kind: 'fold' }>; format: Intl.DateTimeFormat; onPick: (which: 'earlier' | 'later') => void; testId: string }) {
  return (
    <label className="save-field grow">
      <span>Which one</span>
      <select value="" onChange={(e) => onPick(e.target.value as 'earlier' | 'later')} data-testid={testId}>
        <option value="" disabled>
          The clocks go back: choose
        </option>
        <option value="earlier">{format.format(fold.earlier)}</option>
        <option value="later">{format.format(fold.later)}</option>
      </select>
    </label>
  );
}

/**
 * #1898: AN UNDATED TARGET THAT HAS PASSED INTO A DST FOLD BY FINISH. Its stored instant is gone
 * and the next occurrence happens twice, so Finish asks which (owner: carry the choice to Finish;
 * never pick silently, never build the passed instant). `question` is the step's own "Which one",
 * shown until it is answered; `asks()` is the doors' check at the moment of pressing, since the
 * instant can pass between two renders. A timer wakes the hook at the next moment the answer can
 * change (`svgClockFoldWake`).
 */
export function useSvgClockFold(draft: WizardDraft, patch: (p: DraftPatch) => void): { question: ReactNode; asks: () => boolean } {
  const [now, setNow] = useState(() => Date.now());
  const fold = svgClockFold(draft, now);
  const wake = svgClockFoldWake(draft, now);
  useEffect(() => {
    if (wake === null) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(Math.max(wake - Date.now() + 1, 0), 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [wake]);
  const zone = fold?.zone ?? null;
  const format = useMemo(() => (zone ? targetFormat(zone) : null), [zone]);
  const clock = draft.svgClock;
  const question =
    fold && clock && format ? (
      <div className="panel-section" data-testid="wz-finish-clock-fold">
        <SectionHead title="Clock" summary="It counts to a time the clocks repeat" testid="wz-finish-clock-fold-why">
          The time it counts to has passed, and its next one falls on the night the clocks go back, so it happens twice. Choose which one before it is built.
        </SectionHead>
        <ClockFoldPick
          fold={fold}
          format={format}
          onPick={(which) => {
            const at = Date.now();
            const next = svgClockWithFold(clock, which === 'earlier' ? fold.earlier : fold.later, at);
            if (next) patch({ svgClock: next });
            setNow(at);
          }}
          testId="wz-finish-clock-fold-pick"
        />
      </div>
    ) : null;
  const asks = () => {
    const at = Date.now();
    if (!svgClockFold(draft, at)) return false;
    setNow(at);
    return true;
  };
  return { question, asks };
}
