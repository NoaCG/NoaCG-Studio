import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import LibMenu from './LibMenu';
import { IconInfo } from '../icons';

const EDGE = 8;

/**
 * Keeps an open popover inside the screen SIDEWAYS. LibMenu decides up or down; a panel hung off
 * a control that wraps to the far side of a phone's top bar, or off an icon mid-line, can still
 * run past the left or right edge, so this nudges it back by exactly the overflow. Runs after
 * LibMenu's own measurement (a child's layout effect runs first), before paint.
 * TODO: this belongs inside LibMenu's measuring effect, where every popover would get it; it sits
 * here only because LibMenu was owned by another change when this was written.
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
  const close = useCallback(() => setOpen(false), []);
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
        <IconInfo size={15} />
      </button>
      <LibMenu open={open} onClose={close} className="info-tip-panel" role="note" testid={testid && `${testid}-panel`}>
        {children}
      </LibMenu>
    </span>
  );
}
