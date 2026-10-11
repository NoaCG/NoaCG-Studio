import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { FieldControl } from '../fields/FieldControl';
import type { SpxTemplate } from '../../model/types';
import type { EditorOperation } from './operations';
import { sameRevision, type EditorSession, type Revision } from './session';

type Started = { expected: Revision; time: number; cue?: number };
type Build = (n: number, revision: Revision, time: number, cue?: number) => EditorOperation[];
type Scrub = Started & { x: number; value: number; context: string; pointer: number; node: HTMLElement; moved: boolean; operations: EditorOperation[]; build: Build };

/** Typed entry and horizontal scrubbing share the same source operations. Drafts never write history. */
export default function AnimationNumber({ label, value, commit, session, build, previewTemplate }: {
  label: string; value: number; commit: (n: number, revision: Revision, time: number, cue?: number) => void;
  session: EditorSession; build?: Build; previewTemplate?: (template: SpxTemplate) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null), [error, setError] = useState('');
  const started = useRef<Started | null>(null), scrub = useRef<Scrub | null>(null);
  const snapshot = (): Started => ({ expected: session.version(), time: session.port.view().time, cue: session.port.view().cue });
  const current = (g: Scrub) => {
    if (!sameRevision(g.expected, session.version()) || g.context !== JSON.stringify(session.port.view())) throw new Error('The source, selection or playhead changed. Inspect the value again before editing.');
  };
  const clear = () => { started.current = null; setDraft(null); };
  const cancel = useCallback(() => {
    const g = scrub.current; if (!g) return;
    scrub.current = null;
    if (g.moved) { session.cancel(false); previewTemplate?.(session.port.read()); }
    started.current = null; setDraft(null);
    if (g.node.hasPointerCapture(g.pointer)) g.node.releasePointerCapture(g.pointer);
  }, [session, previewTemplate]);
  const finish = () => {
    if (scrub.current) return;
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft)) && started.current) commit(Number(draft), started.current.expected, started.current.time, started.current.cue);
    clear();
  };
  const move = (event: PointerEvent<HTMLLabelElement>) => {
    const g = scrub.current; if (!g || event.pointerId !== g.pointer) return;
    const distance = event.clientX - g.x;
    if (!g.moved && Math.abs(distance) < 3) return;
    event.preventDefault();
    try {
      current(g);
      if (!g.moved) { session.begin(g.expected); g.moved = true; started.current = null; }
      const multiplier = event.ctrlKey || event.metaKey ? .1 : event.shiftKey ? 10 : 1;
      const n = Math.round((g.value + distance / 2 * multiplier) * 1000) / 1000;
      g.operations = g.build(n, g.expected, g.time, g.cue);
      previewTemplate?.(g.operations.length ? session.preview(g.operations).template : session.port.read());
      setDraft(String(n)); setError('');
    } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const release = (event: PointerEvent<HTMLLabelElement>) => {
    const g = scrub.current; if (!g || event.pointerId !== g.pointer) return;
    if (!g.moved) { scrub.current = null; return; }
    event.preventDefault();
    try {
      current(g);
      if (g.operations.length) session.execute({ documentId: session.documentId, expected: g.expected, transactionId: crypto.randomUUID(), operations: g.operations });
      else { session.cancel(false); previewTemplate?.(session.port.read()); }
      scrub.current = null; clear(); setError('');
    } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  // Escape belongs to an active scrub even while its input has focus. Blur/hide/unmount cancel too.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !scrub.current?.moved) return;
      event.preventDefault(); event.stopPropagation(); cancel();
    };
    const leave = () => cancel(), hide = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', escape, true); window.addEventListener('blur', leave); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', leave); document.removeEventListener('visibilitychange', hide); cancel(); };
  }, [cancel]);
  useEffect(() => { const g = scrub.current; if (g) { try { current(g); } catch { cancel(); } } });
  return <label className={'ef-number' + (build ? ' ef-scrubbable' : '')} title={build ? 'Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel' : undefined}
    onPointerDown={event => {
      if (!build || !previewTemplate || event.button !== 0 || event.pointerType === 'touch' || draft !== null || scrub.current) return;
      const node = event.currentTarget;
      scrub.current = { ...snapshot(), x: event.clientX, value, context: JSON.stringify(session.port.view()), pointer: event.pointerId, node, moved: false, operations: [], build };
      node.setPointerCapture(event.pointerId);
    }} onPointerMove={move} onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onBlur={() => { if (scrub.current?.moved) cancel(); else finish(); }} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(); }
      if (event.key === 'Escape') { event.stopPropagation(); cancel(); clear(); }
    }}><span>{label}</span><FieldControl descriptor={{ key: label, label, kind: 'text', defaultValue: '' }} value={draft ?? String(Math.round(value * 1000) / 1000)}
      onChange={n => { started.current ??= snapshot(); setDraft(String(n)); }} />
    {error && <span role="alert">{error}</span>}
  </label>;
}
