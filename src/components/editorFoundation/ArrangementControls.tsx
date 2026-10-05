import type { Arrangement } from '../../blocks/arrangementGeometry';

const commands: { label: string; short: string; command: Arrangement }[] = [
  { label: 'Align left', short: 'Left', command: { kind: 'align', axis: 'x', edge: 'start' } },
  { label: 'Align horizontal center', short: 'Center', command: { kind: 'align', axis: 'x', edge: 'center' } },
  { label: 'Align right', short: 'Right', command: { kind: 'align', axis: 'x', edge: 'end' } },
  { label: 'Align top', short: 'Top', command: { kind: 'align', axis: 'y', edge: 'start' } },
  { label: 'Align vertical center', short: 'Middle', command: { kind: 'align', axis: 'y', edge: 'center' } },
  { label: 'Align bottom', short: 'Bottom', command: { kind: 'align', axis: 'y', edge: 'end' } },
  { label: 'Distribute horizontally', short: 'Horizontal', command: { kind: 'distribute', axis: 'x' } },
  { label: 'Distribute vertically', short: 'Vertical', command: { kind: 'distribute', axis: 'y' } },
];
export default function ArrangementControls({ count, reference, setReference, run, disabled, error }: {
  count: number; reference: 'selection' | 'canvas'; setReference: (value: 'selection' | 'canvas') => void;
  run: (command: Arrangement) => void; disabled: boolean; error: string;
}) {
  return <div className="ef-arrangement" aria-label="Arrange artwork">
    <div className="ef-arrangement-row">
      <label>Align to <select aria-label="Align to" value={reference} onChange={event => setReference(event.target.value as 'selection' | 'canvas')}>
        <option value="selection">Selection</option><option value="canvas">Canvas</option>
      </select></label>
      <div role="group" aria-label="Align">{commands.slice(0, 6).map(({ label, short, command }) =>
        <button key={label} aria-label={label} title={label} disabled={disabled || count < (reference === 'canvas' ? 1 : 2)} onClick={() => run(command)}>{short}</button>)}</div>
      <div role="group" aria-label="Distribute"><span>Gaps</span>{commands.slice(6).map(({ label, short, command }) =>
        <button key={label} aria-label={label} title={label + ': equal gaps, outer items fixed'} disabled={disabled || count < 3} onClick={() => run(command)}>{short}</button>)}</div>
    </div>
    {error && <div className="ef-arrangement-error" role="alert">{error}</div>}
  </div>;
}
