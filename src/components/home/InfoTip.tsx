import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import LibMenu from './LibMenu';

const EDGE = 8;

/**
 * Keeps an open popover inside the screen SIDEWAYS. LibMenu decides up or down; a panel hung off
 * a control that wraps to the far side of a phone's top bar, or off an icon mid-line, can still
 * run past the left or right edge, so this nudges it back by exactly the overflow. Runs after
 * LibMenu's own measurement (a child's layout effect runs first), before paint.
 */
export function useKeepPanelInView(hostRef: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const panel = hostRef.current?.querySelector<HTMLElement>(':scope > .lib-menu');
    if (!open || !panel) return;
    panel.style.translate = '';
    const rect = panel.getBoundingClientRect();
    const right = document.documentElement.clientWidth - EDGE;
    const shift = rect.left < EDGE ? EDGE - rect.left : rect.right > right ? right - rect.right : 0;
    if (shift) panel.style.translate = `${Math.round(shift)}px 0`;
  }, [hostRef, open]);
}

/**
 * A small (i) that opens an explanation on a press - the way Home keeps a HOW-TO off the page
 * until somebody asks for it. The page states the fact ("Nothing shared yet."), and the steps
 * that change it live here. A press rather than a hover, so it works on a phone; the shell
 * (LibMenu) closes it on an outside press or Escape and flips it above when there is no room.
 */
export default function InfoTip({ label, children, testid }: { label: string; children: ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  useKeepPanelInView(host, open);
  return (
    <span ref={host} className="lib-menu-host info-tip">
      <button
        className="info-tip-button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
        data-testid={testid}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
        </svg>
      </button>
      <LibMenu open={open} onClose={() => setOpen(false)} className="info-tip-panel" role="note" testid={testid && `${testid}-panel`}>
        {children}
      </LibMenu>
    </span>
  );
}
