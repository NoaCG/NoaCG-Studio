import { useRef } from 'react';
import PlayoutSettingsPanel from './PlayoutSettingsPanel';
import type { PlayoutResult } from '../control/playoutLink';
import { outputSetupLabel, type ProductionOutputSetup } from '../model/outputSetup';
import { useModalGate } from './spaceKey';

/** Production outputs first; the shared studio server form appears only when used. */
export default function PlayoutSettingsDialog({
  onClose, setup, casparRelevant, browserUrl, onChooseOutput, onCopyBrowser,
  onDownloadTemplate, copied, outputUrl, onOutputOnAir,
}: {
  onClose: () => void;
  setup?: ProductionOutputSetup;
  casparRelevant: boolean;
  browserUrl: string | null;
  onChooseOutput: () => void;
  onCopyBrowser: () => void;
  onDownloadTemplate: () => void;
  copied: boolean;
  outputUrl: string | null;
  onOutputOnAir?: (result: PlayoutResult, target: string) => void;
}) {
  useModalGate();
  const pressedOnBackdrop = useRef(false);
  return <div className="gallery-backdrop"
    onMouseDown={event => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
      pressedOnBackdrop.current = false;
    }}>
    <div className="wz-modal settings-modal playout-settings-modal" role="dialog" aria-modal="true"
      aria-label="Playout settings" data-testid="playout-settings"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="wz-header">
        <h2>Playout settings</h2>
        <button className="gallery-close" onClick={onClose} title="Close" data-testid="playout-settings-close">✕</button>
      </div>
      <div className="settings-content">
        <section>
          <p className="dlg-caption">This production</p>
          <div className="pd-output-setup" data-testid="settings-production-output">
            <strong>{setup ? outputSetupLabel(setup) : 'Existing output setup'}</strong>
            <button onClick={onChooseOutput} data-testid="settings-change-output">Change output…</button>
          </div>
        </section>
        <section>
          <p className="dlg-caption">Browser source</p>
          <p className="hint">OBS, vMix and other HTML sources</p>
          {browserUrl ? <div className="dlg-pair">
            <input readOnly value={browserUrl} aria-label="Browser source URL" data-testid="settings-browser-url" />
            <button onClick={onCopyBrowser}>{copied ? 'Copied' : 'Copy URL'}</button>
          </div> : <p className="hint">Publish &amp; check readiness to get the URL.</p>}
          <button disabled={!browserUrl} onClick={onDownloadTemplate} data-testid="settings-spx-template">Download SPX template</button>
        </section>
        {casparRelevant && <section>
          <p className="dlg-caption">CasparCG through NoaCG Bridge</p>
          <PlayoutSettingsPanel outputUrl={outputUrl} onOutputOnAir={onOutputOnAir} />
        </section>}
      </div>
    </div>
  </div>;
}
