import { useRef } from 'react';
import PlayoutSettingsPanel from './PlayoutSettingsPanel';
import RundownColors from './home/RundownColors';
import type { Show } from '../model/shows';
import { loadPlayoutSettings, type PlayoutResult } from '../control/playoutLink';
import { useModalGate } from './spaceKey';
import AccountAuthoringGate from './AccountAuthoringGate';

/** The studio's CasparCG setup while CasparCG is switched on for this production, then the
 *  rundown's route colours (docs/work-specs/playout-workflow-simplification AC-3, D9). The browser
 *  source and the CasparCG switch live in the Playout panel, so nothing here repeats them. */
export default function PlayoutSettingsDialog({
  onClose, show, setShows, casparOn, outputUrl, onOutputOnAir,
}: {
  onClose: () => void;
  show: Show;
  setShows: (shows: Show[]) => void;
  casparOn: boolean;
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
        {casparOn && <section>
          <p className="dlg-caption">CasparCG through NoaCG Bridge</p>
          <PlayoutSettingsPanel outputUrl={outputUrl} onOutputOnAir={onOutputOnAir} />
        </section>}
        <section>
          <p className="dlg-caption">Rundown colours</p>
          <AccountAuthoringGate><RundownColors show={show} settings={loadPlayoutSettings()} casparOn={casparOn} setShows={setShows} /></AccountAuthoringGate>
        </section>
      </div>
    </div>
  </div>;
}
