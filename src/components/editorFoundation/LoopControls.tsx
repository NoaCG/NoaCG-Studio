import { useEffect, useState, type FormEvent } from 'react';
import type { AnimStep } from '../../blocks/animData';
import type { SpxTemplate } from '../../model/types';
import { authoringPosition } from './animationAuthoring';
import { ownerOf, type TimelineView } from './timelineView';
import { loopElapsed, type RangedLoop } from '../../blocks/animLoopTiming';
import { loopSelection, loopTracks, type LoopOperation } from '../../blocks/editorLoops';
import type { LoopProbe } from './protocol';

const LABELS: Record<string, string> = { x: 'Position X', y: 'Position Y', xPercent: 'Position X %', yPercent: 'Position Y %',
  scale: 'Scale', scaleX: 'Scale X', scaleY: 'Scale Y', rotation: 'Rotation', opacity: 'Opacity', autoAlpha: 'Opacity and visibility' };
const LAYER = '';

interface Props {
  cue: AnimStep;
  step: number;
  selector: string;
  owner: string;
  speed: number;
  fps: number;
  execute: (operation: LoopOperation) => void;
  preview: (probe?: LoopProbe) => void;
}

export default function LoopControls({ template, view, time, inspectedCue, selector, execute, preview }: Pick<Props, 'selector' | 'execute' | 'preview'> & {
  template: SpxTemplate; view: TimelineView; time: number; inspectedCue?: number;
}) {
  if (!view.data) return null;
  const { step } = authoringPosition(template, selector, time, inspectedCue);
  const cue = view.data.steps[step];
  if (!cue || view.segments[step]?.out) return null;
  return <LoopTarget key={JSON.stringify([selector, step, time, inspectedCue])} cue={cue} step={step} selector={selector}
    owner={ownerOf(view, selector)} speed={view.data.speed} fps={template.fps} execute={execute} preview={preview} />;
}

function LoopTarget(props: Props) {
  const [choice, setChoice] = useState<string>();
  const properties = loopTracks(props.cue, props.owner);
  const all = loopSelection(props.cue, props.owner);
  const available = all ? [LAYER, ...properties] : properties;
  const target = choice !== undefined && available.includes(choice) ? choice : available[0];
  if (target === undefined) return null;
  const selection = loopSelection(props.cue, props.owner, target || undefined);
  return <details className="ef-loop-controls" onToggle={event => { if (!event.currentTarget.open) props.preview(); }}>
    <summary>Edit loop</summary>
    <label className="ef-appearance-field">Loop target
      <select aria-label="Loop target" value={target} onChange={event => { props.preview(); setChoice(event.target.value); }}>
        {available.map(name => <option key={name} value={name}>{name === LAYER ? 'Whole layer' : LABELS[name]}</option>)}
      </select>
    </label>
    {selection ? <LoopSettings key={JSON.stringify([target, selection])} {...props} target={target} selection={selection} />
      : <p className="ef-muted">These tracks share a transform or opacity channel. Choose an independent track.</p>}
  </details>;
}

function LoopSettings({ cue, step, selector, owner, target, selection, speed, fps, execute, preview }: Props & {
  target: string; selection: NonNullable<ReturnType<typeof loopSelection>>;
}) {
  const [time, setTime] = useState<number>();
  useEffect(() => () => preview(), [preview]);
  const [indefinite, setIndefinite] = useState(selection.common?.repeat === -1);
  const common = selection.common;
  const range = common?.range ?? selection.range;
  const ranged = common?.range ? { ...common, range: common.range } : null;
  const length = ranged ? loopElapsed(ranged) / speed : 0;
  const place = (loop: RangedLoop | null) => {
    preview(); setTime(undefined);
    execute({ kind: 'loop.set', selector, step, property: target || undefined, loop });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const seconds = (name: string) => Number(fields.get(name)) * speed;
    place({ range: [seconds('start'), seconds('end')], phase: seconds('phase'), repeatDelay: seconds('delay'),
      repeat: indefinite ? -1 : Number(fields.get('repeat')), yoyo: fields.get('direction') === 'yoyo' });
  };
  const sample = (at: number) => {
    const next = Math.max(0, Math.min(length, at));
    setTime(next);
    preview({ step, owner, properties: selection.properties, time: range[0] / speed + next });
  };
  const frame = 1 / (fps || 25);
  const displayed = (seconds: number) => Number((seconds / speed).toFixed(6));
  return <>
    <form onSubmit={submit}>
      <label className="ef-appearance-field">Direction
        <select name="direction" defaultValue={common?.yoyo ? 'yoyo' : 'repeat'}><option value="repeat">Repeat</option><option value="yoyo">Yoyo</option></select>
      </label>
      <div className="ef-loop-fields">
        <label>Start (s)<input name="start" type="number" min="0" max={displayed(cue.duration)} step="any" defaultValue={displayed(range[0])} required /></label>
        <label>End (s)<input name="end" type="number" min="0" max={displayed(cue.duration)} step="any" defaultValue={displayed(range[1])} required /></label>
        <label>Phase (s)<input name="phase" type="number" min="0" step="any" defaultValue={displayed(common?.phase ?? 0)} required /></label>
        <label>Delay (s)<input name="delay" type="number" min="0" step="any" defaultValue={displayed(common?.repeatDelay ?? 0)} required /></label>
        <label>Extra passes<input name="repeat" type="number" min="0" step="1" defaultValue={common && common.repeat >= 0 ? common.repeat : 1} disabled={indefinite} required /></label>
        <label className="ef-link"><input type="checkbox" checked={indefinite} onChange={event => setIndefinite(event.target.checked)} /> Forever</label>
      </div>
      <div className="ef-edit-actions">
        <button type="submit">Apply loop</button>
        {selection.hasLoop && <button type="button" onClick={() => place(null)}>Remove loop</button>}
      </div>
    </form>
    {ranged && <div className="ef-loop-ruler">
      <label>Loop ruler
        <input aria-label="Loop playhead" aria-valuetext={`${(time ?? 0).toFixed(3)} seconds`} type="range" min="0" max={length} step="any"
          value={time ?? 0} onFocus={() => { if (time === undefined) sample(0); }} onChange={event => sample(Number(event.target.value))}
          onKeyDown={event => {
            const nudge = (event.shiftKey ? 10 : 1) * frame;
            const at = time ?? 0;
            const to = { Home: 0, End: length, ArrowLeft: at - nudge, ArrowDown: at - nudge,
              ArrowRight: at + nudge, ArrowUp: at + nudge }[event.key];
            if (to !== undefined) { event.preventDefault(); event.stopPropagation(); sample(to); }
          }} />
      </label>
      <output>{(time ?? 0).toFixed(3)} / {length.toFixed(3)} s</output>
      {time !== undefined && <button type="button" onClick={() => { preview(); setTime(undefined); }}>Return to composition</button>}
    </div>}
  </>;
}
