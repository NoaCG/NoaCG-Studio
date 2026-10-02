import type { ReactNode } from 'react';
import LibMenu from './LibMenu';
import type { PlayoutStatus, StatusCheck, StatusTone } from '../../control/playoutStatus';

/**
 * THE ONE PLAYOUT STATUS of the production page (docs/work-specs/studio-day-playout AC-7, AC-8;
 * owner decisions of 2026-10-01). It replaced three header pieces that each knew a part - the
 * NOT PUBLISHED / SHOW chip, the READY line and the CasparCG dot - with one control: a colour AND
 * a short text, worst state first, so an operator can tell before Take whether a Take will air.
 *
 * A press opens ONE panel, in the owner's order: what was checked (the first line is why the
 * control reads as it does), then the actions, then the setup, folded once it works, then the
 * links an OBS or vMix operator copies. The sections are the page's to build (they hold its state
 * and its verbs); this file only arranges them. A status, never permission: nothing waits for it.
 */

const DOT: Record<StatusTone, string> = { ok: '●', warn: '▲', bad: '✕', idle: '○' };

export function PlayoutStatusControl({
  status,
  started,
  version,
  open,
  onToggle,
  onClose,
  ready,
  children,
}: {
  status: PlayoutStatus;
  /** READY's own reading underneath (readiness.ts), carried on the control for whoever needs its
   *  exact words or counts: the tooltip, and the specs. */
  ready?: { label: string; source: string; outputs: number; ready: number } | null;
  /** The production is started: the specs and the e2e read it off `data-started`. */
  started: boolean;
  /** "published v12" beside the panel's title, or nothing. */
  version: string;
  /** Held by the page, which opens the panel by itself right after a publish. */
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** The panel's sections, below the checks. */
  children: ReactNode;
}) {
  const why = status.checks
    .filter((c) => c.tone !== 'ok')
    .map((c) => c.label)
    .join('\n');
  return (
    <span className="pd-ready-host pd-status-host">
      <button
        type="button"
        className={`pd-status-control pd-status-control--${status.tone}`}
        data-testid="production-status"
        data-tone={status.tone}
        data-started={started}
        data-ready-label={ready?.label}
        data-source={ready?.source}
        data-outputs={ready?.outputs}
        data-ready={ready?.ready}
        aria-expanded={open}
        title={why || status.text}
        onClick={onToggle}
      >
        <span className="pd-status-dot" aria-hidden="true">
          {DOT[status.tone]}
        </span>
        <span className="pd-status-text">{status.text}</span>
      </button>
      <LibMenu open={open} onClose={onClose} surface="pd-ready-panel" role="none" testid="production-status-panel">
        <div className="pd-ready-title">
          <span>Playout</span>
          {version && <span className="pd-ready-version">published {version}</span>}
        </div>
        <ul className="pd-prepare-list pd-status-checks" data-testid="production-status-checks">
          {status.checks.map((c) => (
            <CheckRow key={c.key} check={c} />
          ))}
        </ul>
        {children}
      </LibMenu>
    </span>
  );
}

function CheckRow({ check }: { check: StatusCheck }) {
  return (
    <li className={`pd-prepare-line pd-ready-row--${check.tone}`} data-testid={`status-check-${check.key}`} data-tone={check.tone}>
      <span className="pd-ready-dot" aria-hidden="true">
        {DOT[check.tone]}
      </span>
      <span>
        <span className="pd-ready-state">{check.label}</span>
        {check.advice && check.tone !== 'ok' && <span className="pd-ready-detail">{check.advice}</span>}
      </span>
    </li>
  );
}

/** One section of the panel under its small heading; `folded` starts it shut behind a disclosure. */
export function PlayoutPanelSection({
  title,
  testId,
  folded,
  children,
}: {
  title: string;
  testId: string;
  folded?: boolean;
  children: ReactNode;
}) {
  if (folded !== undefined) {
    return (
      <details className="pd-panel-section" data-testid={testId} open={!folded}>
        <summary className="pd-panel-section-title">{title}</summary>
        {children}
      </details>
    );
  }
  return (
    <section className="pd-panel-section" data-testid={testId}>
      <h3 className="pd-panel-section-title">{title}</h3>
      {children}
    </section>
  );
}
