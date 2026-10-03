// TIMED CUES on the production page (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.1, §2.8): the editor's
// Ends row, a rundown row's chip, and the chip over PROGRAM. Readouts and controls only: the rules
// are control/cueAuto.ts and the state is the page's. Each count ticks itself, so a countdown four
// times a second redraws its own few characters and never the page around it.

import { useEffect, useState } from 'react';
import { useNow } from './ClipClock';
import type { CueAuto, CueEnd } from '../../model/shows';
import {
  AFTER_MAX_S,
  AFTER_MIN_S,
  END_SHORT,
  END_WORDS,
  WARN_MS,
  cleanAfter,
  countText,
  lengthWords,
  remaining,
  type LaneArm,
} from '../../control/cueAuto';
import { clockText } from '../../control/serverState';

/** The clock a timed cue counts in (control/cueAuto.ts). */
const wall = () => Date.now();

/** A lane's count as text, ticking while it runs: what is left, or how long ago a missed one was due. */
function useArmText(arm: LaneArm): { text: string; warn: boolean } {
  // A count four times a second, so it turns at the second it should; a missed one counts up, once a second.
  const now = useNow(arm.phase === 'running' || arm.phase === 'missed', arm.phase === 'missed' ? 1000 : 250, wall);
  if (arm.phase === 'missed') return { text: clockText(Math.max(0, now - arm.dueAt) / 1000, 'down'), warn: false };
  const left = remaining(arm, now);
  return { text: countText(left), warn: arm.phase === 'running' && left <= WARN_MS };
}

/** What a missed lane's row says: "Out was due 0:12 ago". */
function missedWords(then: CueEnd, ago: string): string {
  return `${END_WORDS[then]} was due ${ago} ago`;
}

/**
 * A TIMED CUE'S CHIP ON ITS ROW. Off its lane it wears its length and end (`0:08 → Out`); on air it
 * counts (`0:05 → Out`, warning colour in the last five seconds) and a press holds it; held it reads
 * `Held 0:05` and a press resumes; missed it says what was due and when, and a press clears it.
 */
export function RowAutoChip({ auto, arm, onToggle, onClear }: { auto: CueAuto | null; arm?: LaneArm; onToggle: () => void; onClear: () => void }) {
  if (!arm) {
    if (!auto) return null;
    return (
      <span className="pd-auto" title={`Ends by itself ${lengthWords(auto.after)} after it is on air: ${END_WORDS[auto.then]}`} data-testid="cue-auto">
        {lengthWords(auto.after)} → {END_SHORT[auto.then]}
      </span>
    );
  }
  return <LiveAutoChip arm={arm} onToggle={onToggle} onClear={onClear} />;
}

function LiveAutoChip({ arm, onToggle, onClear }: { arm: LaneArm; onToggle: () => void; onClear: () => void }) {
  const { text, warn } = useArmText(arm);
  if (arm.phase === 'missed') {
    return (
      <button className="pd-auto missed" onClick={onClear} title={`${missedWords(arm.then, text)}. Nothing ran it in time, so it will not run late. Press to clear.`} data-testid="cue-auto" data-phase="missed">
        {missedWords(arm.then, text)}
      </button>
    );
  }
  // The row counts in figures only, so the cue's name keeps the room: the end action is the
  // PROGRAM chip's words and this button's title.
  const held = arm.phase === 'held';
  const ends = END_WORDS[arm.then];
  return (
    <button
      className={`pd-auto live${warn ? ' warn' : ''}${held ? ' held' : ''}${arm.phase === 'waiting' ? ' waiting' : ''}`}
      onClick={onToggle}
      title={
        held
          ? `Held with ${text} left, then ${ends}. Press to resume (H).`
          : arm.phase === 'waiting'
            ? `Waiting for the output to show it: ${text}, then ${ends}. Press to hold (H).`
            : `${text} left, then ${ends}. Press to hold (H).`
      }
      data-testid="cue-auto"
      data-phase={arm.phase}
    >
      {held ? `Held ${text}` : text}
    </button>
  );
}

/** The cue `Next cue` will take, marked on its own row with the count that will take it. */
export function ArmedTag({ arm }: { arm: LaneArm }) {
  const { text } = useArmText(arm);
  return (
    <span className="pd-tag armed" title="Taken by itself when the timed cue before it ends" data-testid="cue-armed">
      ARMED {arm.phase === 'held' ? `held ${text}` : text}
    </span>
  );
}

/**
 * THE CHIP OVER PROGRAM: the countdown that fires soonest (control/cueAuto.ts `chipLane`), with Hold
 * or Resume (H does the same) and Manual, which has no key because it is final and rarer.
 */
export function ProgramAutoChip({ arm, label, onToggle, onManual }: { arm: LaneArm; label: string; onToggle: () => void; onManual: () => void }) {
  const { text, warn } = useArmText(arm);
  const held = arm.phase === 'held';
  return (
    <span className={`pd-auto-chip${warn ? ' warn' : ''}${held ? ' held' : ''}`} data-testid="program-auto" data-phase={arm.phase}>
      <span className="pd-auto-chip-what" title={`${label}: ${END_WORDS[arm.then]}`}>
        {held ? 'Held' : END_SHORT[arm.then]} <span className="pd-auto-chip-count" data-testid="program-auto-count">{text}</span>
      </span>
      <button onClick={onToggle} title={held ? 'Resume the countdown (H)' : 'Hold the countdown (H)'} data-testid="program-auto-hold">
        {held ? 'Resume' : 'Hold'}
      </button>
      <button onClick={onManual} title={`Drop the timed end for this airing: ${label} stays on air until you take it off`} data-testid="program-auto-manual">
        Manual
      </button>
    </span>
  );
}

/**
 * THE EDITOR'S ENDS ROW (§2.1): Manual, or After N s and then Out, Next cue or Out and next cue.
 * `refused` disables it with its reason (a published production, until the wire lands). `nextHint`
 * says what Next cue will take, or that it has nothing to.
 */
export function CueEndsRow({
  auto,
  refused,
  nextHint,
  onChange,
}: {
  auto: CueAuto | null;
  refused: string | null;
  nextHint: string | null;
  onChange: (auto: CueAuto | null) => void;
}) {
  // The typed length, kept apart from the record so "0." on the way to "0.5" is not refused.
  const [typed, setTyped] = useState(auto ? String(auto.after) : '8');
  // Follows the record when it moves under the box, and only then: the page re-renders every
  // second, and a half-typed length must survive that. Another cue selected remounts the row (its
  // key), which starts the box over.
  const after = auto?.after;
  useEffect(() => {
    if (after !== undefined) setTyped((t) => (cleanAfter(Number(t)) === after ? t : String(after)));
  }, [after]);
  const off = !!refused;
  const bad = !!auto && cleanAfter(Number(typed)) === null;
  const hint = refused ?? (auto && bad ? `A length from ${AFTER_MIN_S} to ${AFTER_MAX_S} seconds.` : nextHint);
  // Grid items of the settings row (`.pd-cue-meta`): the mode takes the track beside the note, so a
  // manual cue's settings stay one line; a timed cue's length and end go on a line of their own.
  return (
    <>
      <label className="pd-field pd-field-ends" data-testid="cue-ends">
        <span>Ends</span>
        {/* Refused, a timed cue can still be made manual: only the way back is offered. */}
        <select
          value={auto ? 'after' : 'manual'}
          disabled={off && !auto}
          onChange={(e) => onChange(e.target.value === 'manual' ? null : { after: cleanAfter(Number(typed)) ?? 8, then: auto?.then ?? 'out' })}
          data-testid="cue-ends-mode"
        >
          <option value="manual">Manual</option>
          <option value="after" disabled={off}>
            After a time
          </option>
        </select>
      </label>
      {(auto || hint) && (
        <div className="pd-cue-ends">
          {auto && (
            <>
              <label className={`pd-field pd-cue-ends-after${bad ? ' pd-field-over' : ''}`}>
                <span>Seconds on air</span>
                <input
                  type="number"
                  min={AFTER_MIN_S}
                  max={AFTER_MAX_S}
                  step={0.5}
                  value={typed}
                  disabled={off}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    const after = cleanAfter(Number(e.target.value));
                    if (after !== null && after !== auto.after) onChange({ ...auto, after });
                  }}
                  data-testid="cue-ends-after"
                />
              </label>
              <label className="pd-field pd-cue-ends-then">
                <span>Then</span>
                <select value={auto.then} disabled={off} onChange={(e) => onChange({ ...auto, then: e.target.value as CueEnd })} data-testid="cue-ends-then">
                  {(Object.keys(END_WORDS) as CueEnd[]).map((end) => (
                    <option key={end} value={end}>
                      {END_WORDS[end]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {hint && (
            <p className={`pd-cue-ends-hint${bad && !refused ? ' status-warn' : ' hint'}`} data-testid="cue-ends-hint">
              {hint}
            </p>
          )}
        </div>
      )}
    </>
  );
}
