import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DraftPatch, WizardDraft } from '../draft/core';
import { formatClockTarget, parseClockTarget, resolveClockTarget, type ClockTargetResolution } from '../../../control/clockTarget';
import { svgClockFold, svgClockFoldWake, svgClockGap, svgClockOption, svgClockWithFold } from './draft';
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

/** A gap has no instant to choose. Keep unfinished input local until a new time resolves. */
function ClockGapTime({ gap, onTarget }: { gap: Extract<ClockTargetResolution, { kind: 'gap' }>; onTarget: (target: string, proposed: boolean) => void }) {
  const [time, setTime] = useState(gap.time);
  const [result, setResult] = useState<ClockTargetResolution | null>(null);
  const format = useMemo(() => targetFormat(gap.zone), [gap.zone]);
  const apply = (next: string, fold?: 'earlier' | 'later') => {
    setTime(next);
    const r = resolveClockTarget({ time: next, zone: gap.zone, fold }, Date.now());
    setResult(r);
    if (r.kind === 'resolved' && !r.expired) onTarget(formatClockTarget(r), r.proposed);
  };
  return (
    <div className="map-svg-row">
      <label className="save-field">
        <span>Time · {gap.zone}</span>
        <input type="time" value={time} onChange={(e) => apply(e.target.value)} data-testid="wz-finish-clock-gap-time" />
      </label>
      {result?.kind === 'invalid' && <p className="map-svg-note">Enter a time.</p>}
      {result?.kind === 'fold' && <ClockFoldPick fold={result} format={format} onPick={(which) => apply(time, which)} testId="wz-finish-clock-gap-fold" />}
    </div>
  );
}

/**
 * #1898/#2118: AN UNDATED TARGET THAT HAS PASSED INTO A DST FOLD OR GAP BY FINISH. Its stored
 * instant is gone and the next occurrence repeats or is skipped, so Finish asks which instant
 * or offers a new time (owner: never pick silently, never build the passed instant). `question`
 * stays shown until it is answered; `asks()` is the doors' check at the moment of pressing, since the
 * instant can pass between two renders. A timer wakes the hook at the next moment the answer can
 * change (`svgClockFoldWake`).
 */
export function useSvgClockFold(draft: WizardDraft, patch: (p: DraftPatch) => void): { question: ReactNode; targetSummary: string | null; asks: () => boolean } {
  const [now, setNow] = useState(() => Date.now());
  const fold = svgClockFold(draft, now);
  const gap = svgClockGap(draft, now);
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
    ) : gap && clock ? (
      <div className="panel-section" data-testid="wz-finish-clock-gap">
        <SectionHead title="Clock" summary="The clocks skip that time. Choose another." testid="wz-finish-clock-gap-why">
          The time it counts to has passed, and its next one does not exist because the clocks go forward. Choose a new time before it is built.
        </SectionHead>
        <ClockGapTime key={`${gap.date}/${gap.zone}/${gap.time}`} gap={gap} onTarget={(target, proposed) => {
          patch({ svgClock: { ...clock, target, targetProposed: proposed || undefined } });
          setNow(Date.now());
        }} />
      </div>
    ) : null;
  const asks = () => {
    const at = Date.now();
    if (!svgClockFold(draft, at) && !svgClockGap(draft, at)) return false;
    setNow(at);
    return true;
  };
  // A time typed alone may resolve on a different date. Read the same current target the build
  // would store, including its zone, without treating this confirmation as an unanswered question.
  const target = !question ? parseClockTarget(svgClockOption(draft, now)?.target) : null;
  const targetSummary = target ? `${targetFormat(target.zone).format(target.at)} · ${target.zone}` : null;
  return { question, targetSummary, asks };
}
