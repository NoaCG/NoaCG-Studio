import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { TemplatePart } from '../../model/structure';
import { useModalGate } from '../spaceKey';
import type { EditorSession, Revision } from './session';
import type { EditorOperation } from './operations';
import InlineOrganizationName from './InlineOrganizationName';
import { selectedLayerOperations } from './layerCommands';

export interface LayerMenuRequest { selector: string; x: number; y: number; id: string }

export default function LayerActions({ part, index, selection, session, pause, onSelect, selectOnly, group, request }: {
  part: TemplatePart; index: number; selection: string[]; session: EditorSession; pause: () => void; group: boolean;
  request: LayerMenuRequest | null;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void; selectOnly: () => void;
}) {
  const [draft, setDraft] = useState<Revision | null>(null), [error, setError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; expected: Revision; selectors: string[] } | null>(null);
  const popover = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), restore = useRef(false), handledRequest = useRef('');
  useModalGate(menu !== null);
  const close = useCallback(() => setMenu(null), []);
  const run = (operations: EditorOperation[], expected = session.version()) => {
    pause(); session.cancel(false);
    try {
      if (operations.length) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const rename = () => { pause(); selectOnly(); setError(''); setDraft(session.version()); close(); };
  const endRename = () => { restore.current = true; setDraft(null); };
  const open = useCallback((x: number, y: number) => {
    pause(); const selectors = selection.includes(part.selector) ? [...selection] : [part.selector];
    if (!selection.includes(part.selector)) selectOnly();
    setMenu({ x, y, expected: session.version(), selectors });
  }, [pause, selection, part.selector, selectOnly, session]);
  useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    handledRequest.current = request.id; open(request.x, request.y);
  }, [request, open]);
  useLayoutEffect(() => { if (!draft && restore.current) { restore.current = false; button.current?.focus(); } }, [draft]);
  useLayoutEffect(() => {
    const node = popover.current; if (!menu || !node) return;
    node.showPopover();
    node.style.left = Math.max(8, Math.min(menu.x, innerWidth - node.offsetWidth - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(menu.y, innerHeight - node.offsetHeight - 8)) + 'px';
    node.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) close(); };
    window.addEventListener('pointerdown', outside, true);
    return () => { if (node.isConnected && node.matches(':popover-open')) node.hidePopover(); window.removeEventListener('pointerdown', outside, true); };
  }, [menu, close]);
  const action = (kind: 'delete' | 'duplicate' | 'forward' | 'backward') => {
    if (!menu) return;
    run(selectedLayerOperations(session.port.read(), menu.selectors, kind), menu.expected); close(); button.current?.focus();
  };
  return <>
    <button className="ef-layer-eye" title={(part.hidden ? 'Show ' : 'Hide ') + part.label + ' layer'} aria-label={(part.hidden ? 'Show ' : 'Hide ') + part.label + ' layer'} aria-pressed={!part.hidden}
      onClick={() => run([{ kind: 'layer.visibility', selector: part.selector, hidden: !part.hidden }])}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10Q10 1 18 10Q10 19 2 10Z" /><circle cx="10" cy="10" r="2.5" />{part.hidden && <path d="M3 3L17 17" />}</svg>
    </button>
    {draft ? <InlineOrganizationName name={part.label} label="Layer name" commit={label => { if (label.trim() !== part.label) run([{ kind: 'layer.rename', selector: part.selector, label }], draft); endRename(); }} cancel={endRename} /> :
      <button ref={button} className="ef-layer" aria-pressed={selection.includes(part.selector)} title={part.label + ' · Double-click or Enter to rename'} onClick={onSelect} onDoubleClick={rename}
        onContextMenu={event => { event.preventDefault(); open(event.clientX, event.clientY); }} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); rename(); }
          if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); open(box.left, box.bottom); }
        }}>
        <span className="ef-layer-number">{String(index + 1).padStart(2, '0')}</span><span className="ef-layer-icon">{group ? '▣' : part.kind === 'line' ? 'T' : part.kind === 'image' ? '▧' : '◇'}</span>
        <span className="ef-layer-label" style={{ paddingInlineStart: (part.depth ?? 0) * 8 }}>{part.label}</span>
      </button>}
    {error && <span className="ef-layer-error" role="alert">{error}</span>}
    {menu && <div ref={popover} popover="manual" role="menu" aria-label="Layer actions" className="ef-key-menu" onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      const items = [...event.currentTarget.querySelectorAll('button')], at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at + items.length - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
      if (next !== null) { event.preventDefault(); items[next % items.length]?.focus(); }
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(); button.current?.focus(); }
    }}>
      <button role="menuitem" onClick={rename}>Rename</button>
      <button role="menuitem" onClick={() => { run([{ kind: 'layer.visibility', selector: part.selector, hidden: !part.hidden }], menu.expected); close(); button.current?.focus(); }}>{part.hidden ? 'Show layer' : 'Hide layer'}</button>
      <button role="menuitem" onClick={() => action('duplicate')}>Duplicate</button><button role="menuitem" onClick={() => action('backward')}>Send backward</button><button role="menuitem" onClick={() => action('forward')}>Bring forward</button><button role="menuitem" onClick={() => action('delete')}>Delete</button>
    </div>}
  </>;
}
