import type { ReactNode } from 'react';
import LibMenu from './LibMenu';
import { TONE_DOT, type ReadySummary } from '../../control/readiness';
import type { PlayoutStatus } from '../../control/playoutStatus';

/**
 * THE ONE PLAYOUT STATUS of the production page (docs/work-specs/playout-workflow-simplification
 * AC-1 to AC-3): a colour AND a short text, worst state first, so an operator can tell before Take
 * whether a Take will air.
 *
 * A press opens ONE panel: the status line, then the page's sections (outputs, browser source,
 * CasparCG, actions). The sections are the page's to build (they hold its state and its verbs);
 * this file only frames them. A status, never permission: nothing waits for it.
 */
export function PlayoutStatusControl({
  status,
  started,
  open,
  onToggle,
  onClose,
  ready,
  diagnostics = 0,
  children,
}: {
  status: PlayoutStatus;
  /** READY's own reading underneath (readiness.ts), carried on the control's data attributes for
   *  whoever needs its exact words or counts: the specs. The tooltip names the checks instead. */
  ready?: Pick<ReadySummary, 'label' | 'source' | 'outputs' | 'ready'> | null;
  diagnostics?: number;
  /** The production is published: the specs and the e2e read it off `data-started`. */
  started: boolean;
  /** Held by the page, which opens the panel by itself when it asks a question (Replace). */
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
    <span className={`pd-ready-host pd-status-host${started ? '' : ' pd-status-host--offline'}`}>
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
        title={`${why || status.text}${diagnostics ? `\n${diagnostics} unidentified server item(s). Open for diagnostics and Stop/Clear.` : ''}`}
        onClick={onToggle}
      >
        <span className="pd-status-dot" aria-hidden="true">
          {TONE_DOT[status.tone]}
        </span>
        <span className="pd-status-text">{status.text}</span>
        {diagnostics > 0 && <span className="pd-status-diagnostic" aria-label={`${diagnostics} server diagnostics`}>! {diagnostics}</span>}
      </button>
      <LibMenu open={open} onClose={onClose} surface="pd-ready-panel" role="none" testid="production-status-panel">
        <div className={`pd-pp-status pd-pp-status--${status.tone}`} data-testid="production-status-line">
          <span className="pd-pp-dot" aria-hidden="true">
            {TONE_DOT[status.tone]}
          </span>
          <span>{status.text}</span>
        </div>
        {children}
      </LibMenu>
    </span>
  );
}
