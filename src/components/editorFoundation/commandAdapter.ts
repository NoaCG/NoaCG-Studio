import { EditorCommands, type CommandView } from './commands';
import type { EditorSession } from './session';
import type { PreviewController } from './PreviewController';

let active: EditorCommands | null = null;
/** Local module seam only; no window registration, control port or live pairing. */
export function connectEditorCommands(session: EditorSession, preview: () => PreviewController | null, view: CommandView) {
  const commands = new EditorCommands(session, preview, view);
  active = commands;
  return () => { commands.close(); if (active === commands) active = null; };
}
export function activeEditorCommands() {
  if (!active) throw new Error('Open the editor before inspecting commands.');
  return active;
}
