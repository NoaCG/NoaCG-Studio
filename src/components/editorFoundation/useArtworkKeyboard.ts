import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession, Revision } from './session';
import { sameRevision } from './session';
import type { PreviewController } from './PreviewController';
import type { RenderedPart } from './protocol';
import type { EditorOperation } from './operations';
import { arrangementTargets, resizeArtwork, translateArtwork } from './animationAuthoring';

interface Gesture {
  template: SpxTemplate; expected: Revision; parts: RenderedPart[]; selection: string[];
  time: number; cue?: number; sampleData: string; resize: boolean; x: number; y: number;
  keys: Set<string>; operations: EditorOperation[];
}
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** Canvas-owned key repeats preview from one immutable snapshot and commit once on release. */
export function useArtworkKeyboard(template: SpxTemplate, session: EditorSession, parts: RenderedPart[], selection: string[], time: number,
  preview: () => PreviewController | null, pause: () => void) {
  const active = useRef<Gesture | null>(null);
  const [error, setError] = useState('');
  const cancel = (reason = '') => {
    if (!active.current) return;
    active.current = null; session.cancel(false);
    preview()?.previewTemplate(session.port.read(), 'cancel');
    if (reason) setError(reason);
  };
  const current = (g: Gesture) => {
    const view = session.port.view();
    if (!sameRevision(g.expected, session.version()) || view.time !== g.time || view.cue !== g.cue || JSON.stringify(view.selectedParts) !== JSON.stringify(g.selection) || JSON.stringify(view.sampleData) !== g.sampleData) throw new Error('The source, selection or playhead changed. Release the arrows and inspect the artwork again.');
  };
  const down = (event: KeyboardEvent) => {
    const delta = arrows[event.key];
    if (event.key === 'Escape' && active.current) { cancel(); return true; }
    if (!delta) {
      if (active.current && !['Control', 'Meta', 'Shift'].includes(event.key)) cancel();
      return false;
    }
    if (event.altKey) { cancel(); return false; }
    try {
      if (!active.current) {
        // A canceled hold cannot silently start another gesture on its next OS repeat.
        if (event.repeat) return true;
        pause(); setError('');
        const expected = session.version(), view = session.port.view();
        const targets = arrangementTargets(template, parts, selection, time, expected, view.cue);
        session.begin(expected);
        active.current = { template, expected, parts: targets, selection: [...selection], time, cue: view.cue,
          sampleData: JSON.stringify(view.sampleData), resize: event.ctrlKey || event.metaKey, x: 0, y: 0, keys: new Set(), operations: [] };
      }
      const g = active.current; current(g); g.keys.add(event.key);
      g.x += delta[0] * (event.shiftKey ? 10 : 1); g.y += delta[1] * (event.shiftKey ? 10 : 1);
      g.operations = g.resize ? resizeArtwork(g.template, g.parts, { x: g.x, y: g.y }, g.time)
        : translateArtwork(g.template, g.parts, g.parts.map(p => ({ selector: p.selector, x: g.x, y: g.y })), g.time);
      preview()?.noteInput('keyboard');
      preview()?.previewTemplate(g.operations.length ? session.preview(g.operations).template : g.template, 'keyboard');
    } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
    return true;
  };
  const up = (event: KeyboardEvent) => {
    const g = active.current;
    if (!g || !arrows[event.key]) return false;
    g.keys.delete(event.key);
    if (g.keys.size) return true;
    try {
      current(g);
      if (g.operations.length) {
        preview()?.noteInput('commit');
        session.execute({ documentId: session.documentId, expected: g.expected, transactionId: crypto.randomUUID(), operations: g.operations });
      } else { session.cancel(false); preview()?.previewTemplate(session.port.read(), 'cancel'); }
      active.current = null;
    } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
    return true;
  };
  // Source/view changes invalidate the draft. Do not restore its old selection or old source.
  useEffect(() => {
    const g = active.current;
    if (g) { try { current(g); } catch (cause) { cancel(cause instanceof Error ? cause.message : String(cause)); } }
  });
  useEffect(() => {
    const leave = () => { if (!active.current) return; active.current = null; session.cancel(false); preview()?.previewTemplate(session.port.read(), 'cancel'); };
    const hide = () => { if (document.hidden) leave(); };
    window.addEventListener('blur', leave); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('blur', leave); document.removeEventListener('visibilitychange', hide); if (active.current) { active.current = null; session.cancel(false); } };
  }, [session, preview]);
  return { down, up, cancel, clearError: () => setError(''), error };
}
