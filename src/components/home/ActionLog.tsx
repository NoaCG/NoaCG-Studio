import { logTime, type LogEntry } from '../../control/eventLog';

/**
 * THE ACTION LOG of the playout dashboard — every Take, Update, Next and Out that reached air,
 * this operator's and (on a published production) everyone else's off the shared log.
 *
 * Split out of `ProductionPage` on 2026-08-28. It is a pure READOUT: it holds no state, sends
 * nothing, and the entries are built for it by `control/eventLog.ts` (`describeLogRow`) at the
 * one place rows arrive. Collapsed by default with the newest entry in the summary, because the
 * question during a show is "did that land?", not "what happened all night".
 *
 * `published` decides what the EMPTY list says. A published production reads its history back
 * off the shared log, so an empty list there means nothing has been sent. An unpublished one
 * keeps its log in this tab only (nothing ever left the laptop, and row C's reload spec pins
 * that a reload brings nothing back on air), so after a reload the list is empty by design and
 * says why, rather than looking like the presses were lost.
 */
export default function ActionLog({ entries, published }: { entries: LogEntry[]; published: boolean }) {
  return (
    <details className="pd-activity" data-testid="action-log">
      <summary>
        Activity
        {entries[0] && (
          <span className="muted">
            {' '}
            {logTime(entries[0].at)} {entries[0].text}
          </span>
        )}
      </summary>
      {entries.length === 0 ? (
        <p className="hint" data-testid="action-log-empty">
          {published
            ? 'Nothing yet. Every Take, Update, Next and Out lands here, whoever sends it.'
            : 'Every Take, Update, Next and Out lands here. This production is not published, so the list starts empty each time the page opens.'}
        </p>
      ) : (
        <ol className="prod-log-list">
          {entries.map((e) => (
            <li key={e.id} className={`prod-log-row prod-log-${e.kind}`} data-testid="action-log-row">
              <span className="prod-log-time">{logTime(e.at)}</span>
              <span className="prod-log-text">{e.text}</span>
              <span className="muted prod-log-graphic">{e.graphic}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
