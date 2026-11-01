import type { Arrangement } from '../../blocks/arrangementGeometry';

/** The arrangement toolbar's buttons, in order. ArrangementControls renders the align commands under
 * Align and the distribute commands under Distribute; scripts/editor-arrangement.test.mjs checks each
 * one against its label. */
export const ARRANGEMENT_COMMANDS: readonly { readonly label: string; readonly short: string; readonly command: Arrangement }[] = [
  { label: 'Align left', short: 'Left', command: { kind: 'align', axis: 'x', edge: 'start' } },
  { label: 'Align horizontal center', short: 'Center', command: { kind: 'align', axis: 'x', edge: 'center' } },
  { label: 'Align right', short: 'Right', command: { kind: 'align', axis: 'x', edge: 'end' } },
  { label: 'Align top', short: 'Top', command: { kind: 'align', axis: 'y', edge: 'start' } },
  { label: 'Align vertical center', short: 'Middle', command: { kind: 'align', axis: 'y', edge: 'center' } },
  { label: 'Align bottom', short: 'Bottom', command: { kind: 'align', axis: 'y', edge: 'end' } },
  { label: 'Distribute horizontally', short: 'Horizontal', command: { kind: 'distribute', axis: 'x' } },
  { label: 'Distribute vertically', short: 'Vertical', command: { kind: 'distribute', axis: 'y' } },
];
