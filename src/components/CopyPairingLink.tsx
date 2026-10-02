import { useState, type ReactNode } from 'react';
import { copyLink } from './home/copyLink';
import InfoLine from './InfoLine';

/**
 * HOW TO PAIR ANOTHER BROWSER, plainly (docs/work-specs/studio-day-playout D8, D19): one line and a
 * button that copies a pairing link, which then shows in a box of its own, so it can be copied by
 * hand where the clipboard is refused. Nothing guesses which browser is the operator's. On the
 * pairing page before pairing the link is the page's own (its code is not spent yet); after pairing,
 * and in Playout settings, NoaCG Bridge makes a new one.
 */
export default function CopyPairingLink({
  lead,
  button,
  link,
  more,
  testId,
}: {
  lead: string;
  button: string;
  /** The link to copy, or why there is none (a Bridge from before 0.8.0, one that refused this browser). */
  link: () => Promise<string | { unavailable: string }>;
  more?: ReactNode;
  testId: string;
}) {
  const [state, setState] = useState<{ url: string; copied: boolean } | { unavailable: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      const made = await link();
      setState(typeof made === 'string' ? { url: made, copied: await copyLink(made) } : made);
    } finally {
      setBusy(false);
    }
  };
  const line = (
    <>
      {lead}{' '}
      <button className="bridge-copy-btn" onClick={() => void copy()} disabled={busy} data-testid={`${testId}-copy`}>
        {button}
      </button>
    </>
  );
  return (
    <div className="bridge-copy" data-testid={testId}>
      {more ? (
        <InfoLine label="About pairing another browser" more={more}>
          {line}
        </InfoLine>
      ) : (
        <p className="hint">{line}</p>
      )}
      {state && 'url' in state && (
        <>
          <input className="bridge-copy-link" readOnly value={state.url} onFocus={(e) => e.target.select()} aria-label="Pairing link" data-testid={`${testId}-link`} />
          <p className="hint" data-testid={`${testId}-done`}>
            {state.copied ? 'Copied. ' : 'Copy the link above. '}Paste it into the other browser&rsquo;s address bar. It works once, within two minutes.
          </p>
        </>
      )}
      {state && 'unavailable' in state && (
        <p className="hint status-warn" data-testid={`${testId}-unavailable`}>
          {state.unavailable}
        </p>
      )}
    </div>
  );
}
