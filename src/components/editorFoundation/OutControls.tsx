import { useLayoutEffect, useRef, useState } from 'react';
import { parseAnimData } from '../../blocks/animData';
import { hasExitKeys } from '../../blocks/editorOut';
import { useModalGate } from '../spaceKey';
import type { EditorSession, Revision } from './session';
import type { TimelineView } from './timelineView';

export default function OutControls({ session, view, time, pause, inspect, playOut, park }: {
  session: EditorSession; view: TimelineView; time: number; pause: () => void;
  inspect: () => void; playOut: () => void; park: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null), popover = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<{ expected: Revision; documentId: string } | null>(null);
  const [error, setError] = useState('');
  useModalGate(prompt !== null);
  const close = () => { setPrompt(null); button.current?.focus(); };
  useLayoutEffect(() => {
    if (!prompt || !popover.current || !button.current) return;
    const node = popover.current;
    node.showPopover();
    const place = () => {
      const box = button.current!.getBoundingClientRect();
      node.style.left = Math.max(8, Math.min(box.left, window.innerWidth - node.offsetWidth - 8)) + 'px';
      node.style.top = Math.max(8, box.top >= node.offsetHeight + 8 ? box.top - node.offsetHeight - 8 : Math.min(window.innerHeight - node.offsetHeight - 8, box.bottom + 8)) + 'px';
    };
    place(); node.querySelector('button')?.focus();
    window.addEventListener('resize', place);
    return () => { node.hidePopover(); window.removeEventListener('resize', place); };
  }, [prompt]);
  const setOut = () => {
    pause();
    try {
      const result = session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'out.set', time }] });
      park(); setError('');
      // Read the new source: the view can still describe the old one during this event, and Out
      // set inside the entrance carries its rest into the exit, which then has keys to keep.
      const next = parseAnimData(result.template.js);
      setPrompt(next && !hasExitKeys(next) ? { expected: result.revision, documentId: session.documentId } : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const reverse = () => {
    try {
      session.execute({ documentId: prompt!.documentId, expected: prompt!.expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'out.reverse' }] });
      setError(''); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); close(); }
  };
  const empty = !!view.data && !hasExitKeys(view.data);
  return <div className="ef-out-controls">
    <button onClick={playOut} disabled={!!view.reason}>Out</button>
    <button ref={button} onClick={setOut} disabled={!view.data || !!view.reason}>Set Out at playhead</button>
    <button onClick={inspect} disabled={!view.data || !!view.reason}>Edit Out</button>
    {empty && <span className="ef-muted">{view.segments[view.segments.length - 1]?.duration === 0 ? 'Empty Out · cut' : 'No Out keys'}</span>}
    <div ref={popover} popover="manual" className="ef-out-popover" role="dialog" aria-label="Reverse entrance" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    }}>
      <p>{(view.data?.steps.length ?? 0) > 2 ? 'Reverse entrances for all visible layers?' : 'Reverse the entrance animation?'}</p>
      <div><button onClick={reverse}>Yes, reverse</button><button onClick={() => { close(); inspect(); }}>No, author manually</button><button aria-label="Dismiss reverse choice" onClick={close}>×</button></div>
      <small>Escape keeps Out here without adding keys.</small>
    </div>
    {error && <span className="ef-out-error" role="alert">{error}</span>}
  </div>;
}
