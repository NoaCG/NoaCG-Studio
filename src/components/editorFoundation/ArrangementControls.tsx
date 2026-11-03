import type { ReactNode } from 'react';
import type { Arrangement } from '../../blocks/arrangementGeometry';
import { ARRANGEMENT_COMMANDS as commands } from './arrangementCommands';

export default function ArrangementControls({ count, reference, setReference, run, disabled, error, children }: {
  count: number; reference: 'selection' | 'canvas'; setReference: (value: 'selection' | 'canvas') => void;
  run: (command: Arrangement) => void; disabled: boolean; error: string; children?: ReactNode;
}) {
  return <div className="ef-arrangement" aria-label="Arrange artwork">
    <div className="ef-arrangement-row">
      <label>Align to <select aria-label="Align to" value={reference} onChange={event => setReference(event.target.value as 'selection' | 'canvas')}>
        <option value="selection">Selection</option><option value="canvas">Canvas</option>
      </select></label>
      <div role="group" aria-label="Align">{commands.filter(c => c.command.kind === 'align').map(({ label, short, command }) =>
        <button key={label} aria-label={label} title={label} disabled={disabled || count < (reference === 'canvas' ? 1 : 2)} onClick={() => run(command)}>{short}</button>)}</div>
      <div role="group" aria-label="Distribute"><span>Gaps</span>{commands.filter(c => c.command.kind === 'distribute').map(({ label, short, command }) =>
        <button key={label} aria-label={label} title={label + ': equal gaps, outer items fixed'} disabled={disabled || count < 3} onClick={() => run(command)}>{short}</button>)}</div>
      {children}
    </div>
    {error && <div className="ef-arrangement-error" role="alert">{error}</div>}
  </div>;
}
