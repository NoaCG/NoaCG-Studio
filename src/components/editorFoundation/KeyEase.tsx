import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AnimData } from '../../blocks/animData';
import { KEY_EASE_PRESETS, type KeyEasePreset, type KeyRef } from '../../blocks/animEdit';
import { useModalGate } from '../spaceKey';
import type { EditorSession } from './session';
import { currentPreset } from './keySelection';

/** Where the key context menu opens, and the key that opened it (focus returns there). */
export interface KeyMenu { x: number; y: number; anchor: HTMLElement }

/** The selected keys' count and state, and the one ease operation behind both the toolbar
 *  dropdown and the key context menu (docs/research/editor-r1-2a-2). */
export default function KeyEase({ session, data, keys, menu, close, pause }: {
  session: EditorSession; data: AnimData | null; keys: KeyRef[]; menu: KeyMenu | null; close: () => void; pause: () => void;
}) {
  const [error, setError] = useState('');
  const popover = useRef<HTMLDivElement>(null);
  useModalGate(menu !== null);
  const current = useMemo(() => currentPreset(data, keys), [data, keys]);
  useEffect(() => { setError(''); }, [keys]);
  // The reason sits over the transport, so the next click or Escape anywhere dismisses it.
  useEffect(() => {
    if (!error) return;
    const dismiss = (event: Event) => { if (!(event instanceof KeyboardEvent) || event.key === 'Escape') setError(''); };
    window.addEventListener('pointerdown', dismiss, true); window.addEventListener('keydown', dismiss, true);
    return () => { window.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', dismiss, true); };
  }, [error]);
  const apply = (preset: KeyEasePreset) => {
    const anchor = menu?.anchor;
    close();
    try {
      pause();
      session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'key.ease', keys, preset }] });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    anchor?.focus();
  };
  useLayoutEffect(() => {
    const node = popover.current;
    if (!menu || !node) return;
    node.showPopover();
    node.style.left = Math.max(8, Math.min(menu.x, window.innerWidth - node.offsetWidth - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(menu.y, window.innerHeight - node.offsetHeight - 8)) + 'px';
    node.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) close(); };
    window.addEventListener('pointerdown', outside, true);
    return () => { node.hidePopover(); window.removeEventListener('pointerdown', outside, true); };
  }, [menu, close]);
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll('button')), at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 + items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null) { event.preventDefault(); items[next % items.length]?.focus(); }
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation();
      const anchor = menu?.anchor;
      close(); anchor?.focus();
    }
  };
  const count = keys.length;
  return <span className="ef-key-ease">
    <span className="ef-muted" data-testid="key-count">{count === 1 ? '1 key' : count + ' keys'}</span>
    <select aria-label="Key ease" title="Ease the selected keys" disabled={!count || !data} value={!count ? 'none' : current ?? 'mixed'}
      onChange={event => apply(event.target.value as KeyEasePreset)}>
      {!count && <option value="none">Select keys</option>}
      {count > 0 && !current && <option value="mixed" disabled>{count === 1 ? 'Custom' : 'Mixed'}</option>}
      {KEY_EASE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
    </select>
    {error && <span className="ef-key-error" role="alert">{error}</span>}
    {/* Focusable itself, so a click on its padding keeps the keys working; and the browser's own
        menu (the Windows Menu key raises it on the focused item) never opens over this one. */}
    <div ref={popover} popover="manual" role="menu" aria-label="Key ease" className="ef-key-menu" tabIndex={-1} onKeyDown={navigate}
      onContextMenu={event => event.preventDefault()}>
      {KEY_EASE_PRESETS.map(preset => <button key={preset.id} role="menuitemradio" aria-checked={current === preset.id} tabIndex={-1}
        onClick={() => apply(preset.id)}>{preset.label}</button>)}
    </div>
  </span>;
}
