import { useRef } from 'react';
import { PLAYOUT_SYSTEMS, DEFAULT_PLAYOUT_SYSTEM } from '../control/playoutSystems';
import { DOWNLOADS_BRIDGE_URL } from '../downloads/links';
import PlayoutSettingsPanel from './PlayoutSettingsPanel';
import { useModalGate } from './spaceKey';

/**
 * PLAYOUT SETTINGS, opened from the production page itself.
 *
 * An operator setting up CasparCG is standing on the production page, and should not have to
 * leave it for their profile and dig through general settings to find the server's address.
 * So this dialog is the SAME form the general Settings dialog shows under "Playout"
 * (PlayoutSettingsPanel, one component, one stored record in control/playoutLink.ts) - a second
 * door onto the same settings, never a second copy of them.
 *
 * What it adds is the question a new user actually has - "where do my graphics play?" - answered
 * above the form: the systems NoaCG can be set up to drive (control/playoutSystems.ts, CasparCG
 * today), and the plain fact that OBS, vMix and any other browser source need no setup here at
 * all, only the output URL.
 */
export default function PlayoutSettingsDialog({
  onClose,
  outputUrl,
}: {
  onClose: () => void;
  /** The production's output URL, null until it is started: the form's Put on air airs it. */
  outputUrl: string | null;
}) {
  useModalGate();
  const pressedOnBackdrop = useRef(false);
  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal settings-modal playout-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Playout settings"
        data-testid="playout-settings"
      >
        <div className="wz-header">
          <h2>Playout settings</h2>
          <p className="hint wz-header-sub">Where your graphics play. Saved in this browser, for every production.</p>
          <button className="gallery-close" onClick={onClose} title="Close" data-testid="playout-settings-close">
            ✕
          </button>
        </div>

        <div className="settings-content">
          <section>
            <p className="dlg-caption">Playout system</p>
            <ul className="playout-systems" data-testid="playout-systems">
              {PLAYOUT_SYSTEMS.map((system) => (
                <li key={system.id} className="playout-system on" data-testid={`playout-system-${system.id}`}>
                  <strong>{system.name}</strong> <span className="muted">{system.via}</span>
                  <span className="hint">{system.summary}</span>
                </li>
              ))}
            </ul>
            <p className="hint" data-testid="playout-browser-source-note">
              Using OBS, vMix or another browser source instead? Nothing to set up here: open{' '}
              the <strong>Playout panel</strong> after you start the production and add the output
              URL from its Links as a browser source.
            </p>
            <p className="hint">
              New to NoaCG Bridge?{' '}
              <a href={DOWNLOADS_BRIDGE_URL} target="_blank" rel="noopener" data-testid="playout-settings-downloads">
                Get it and see how it works
              </a>
              .
            </p>
          </section>
          <section>
            <p className="dlg-caption">{DEFAULT_PLAYOUT_SYSTEM.name}</p>
            <PlayoutSettingsPanel outputUrl={outputUrl} />
          </section>
        </div>
      </div>
    </div>
  );
}

