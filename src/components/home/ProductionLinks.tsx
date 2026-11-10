import { useModalGate } from '../spaceKey';

/**
 * SETUP › LINKS (docs/work-specs/playout-workflow-simplification AC-8, D7): the links people are
 * given - the control page and the presenter's page, both private, and the audience link, the one
 * meant to be shared, with its readable name. The browser source and its template file are the
 * Playout panel's, because they are the output; these are for people.
 *
 * Read-only with respect to the page: everything is drawn from props and every press calls back.
 * The claim stays on `ProductionPage`, which owns the account gate it needs.
 */
export function ProductionLinksDialog({
  controlUrl,
  joinUrl,
  interactionHref,
  presenterUrl,
  copied,
  onCopy,
  onClose,
}: {
  controlUrl: string | null;
  joinUrl: string | null;
  /** Where everything audience lives (interaction spec AC-1): Links points there. */
  interactionHref: string;
  presenterUrl: string | null;
  copied: 'output' | 'control' | 'join' | 'presenter' | null;
  onCopy: (kind: 'control' | 'join' | 'presenter', text: string) => void;
  onClose: () => void;
}) {
  useModalGate();
  const row = (kind: 'control' | 'presenter' | 'join', label: string, mark: 'Private' | 'Public', url: string | null, testId: string) => (
    <div className="dlg-row" data-testid={testId}>
      <span className="prod-links-label">
        {label} <span className="prod-links-mark">{mark}</span>
      </span>
      <div className="dlg-pair">
        <code className="prod-url">{url ?? 'Available after publishing'}</code>
        <button onClick={() => url && onCopy(kind, url)} disabled={!url} data-testid={`copy-${kind === 'join' ? 'join' : kind}-url`}>
          {copied === kind ? '✓ Copied' : 'Copy'}
        </button>
        {/* Everything audience lives in Interaction (interaction spec AC-1): the row points there
            rather than explaining, since Links holds one row per link and no explanations. */}
        {kind === 'join' && (
          <button onClick={() => window.open(interactionHref, '_blank', 'noopener')} data-testid="links-interaction-open">
            Interaction
          </button>
        )}
      </div>
    </div>
  );
  return (
    <div className="gallery-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="wz-modal prod-links-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Links"
        data-testid="production-links"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="gallery-header">
          <h2>Links</h2>
          <button className="gallery-close" onClick={onClose} aria-label="Close" data-testid="production-links-close">
            ✕
          </button>
        </header>
        <div className="gallery-body">
          {row('control', 'Control page', 'Private', controlUrl, 'control-url')}
          {row('presenter', 'Presenter', 'Private', presenterUrl, 'presenter-url')}
          {row('join', 'Audience', 'Public', joinUrl, 'join-url')}
        </div>
      </section>
    </div>
  );
}
