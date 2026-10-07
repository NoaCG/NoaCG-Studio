import { useCallback, useState, type ReactNode } from 'react';
import LibMenu from './LibMenu';
import { IconInfo } from '../icons';

/**
 * A small (i) that opens an explanation on a press - the way Home keeps a HOW-TO off the page
 * until somebody asks for it. The page states the fact ("Nothing shared yet."), and the steps
 * that change it live here. A press rather than a hover, so it works on a phone; the shell
 * (LibMenu) closes it on an outside press or Escape, flips it above when there is no room and keeps
 * it inside the screen sideways.
 */
export default function InfoTip({ label, children, testid }: { label: string; children: ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="lib-menu-host info-tip">
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
