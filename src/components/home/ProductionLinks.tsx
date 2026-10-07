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
  busy,
  controlUrl,
  joinUrl,
  presenterUrl,
  nameDraft,
  nameNote,
  onNameDraft,
  onClaimName,
  copied,
  onCopy,
  onClose,
}: {
  busy: boolean;
  controlUrl: string | null;
  joinUrl: string | null;
  presenterUrl: string | null;
  nameDraft: string;
  nameNote: string | null;
  onNameDraft: (value: string) => void;
  onClaimName: () => void;
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
          {joinUrl && (
            <div className="dlg-row" data-testid="join-name">
              <span className="prod-links-label">Audience name</span>
              <div className="dlg-pair">
                <input
                  type="text"
                  value={nameDraft}
                  placeholder="friday-night-live"
                  aria-label="Audience link name"
                  title="Changing the name stops the old audience link"
                  onChange={(e) => onNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onClaimName();
                  }}
                  data-testid="join-name-input"
                />
                <button onClick={onClaimName} disabled={busy || !nameDraft.trim()} data-testid="join-name-claim">
                  Use this name
                </button>
              </div>
              {nameNote && (
                <p className={nameNote.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="join-name-note">
                  {nameNote}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
