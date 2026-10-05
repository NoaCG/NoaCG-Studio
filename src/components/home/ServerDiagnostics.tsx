import type { ServerOwnership, ServerTiming, StorePart } from '../../control/serverPlayoutStore';
import { slotAddress } from '../../control/playoutLink';
import type { Slot } from '../../control/playoutProtocol';
import { SlotRemaining } from './ClipClock';
import type { ShowCue, ShowFolder } from '../../model/shows';

/** Diagnostics stay in the status panel, outside the operational list and its scrolling area. */
export default function ServerDiagnostics({ ownership, timing, cues, folders, clear }: { ownership: ServerOwnership; timing: StorePart<ServerTiming>; cues: readonly ShowCue[]; folders: readonly ShowFolder[]; clear: (slot: Slot) => void }) {
  return <div data-testid="server-unidentified">
    {ownership.unidentified.map(item => {
      const folder = folders.find(f => f.id === cues.find(c => c.id === item.cueId)?.folderId);
      return <div className="pd-unidentified-row pd-server-diagnostic" key={slotAddress(item.slot)}>
      <span>Unidentified item on {slotAddress(item.slot)} · {item.file ?? item.producer}</span>
      {item.sequenceStopped && <span data-testid="server-sequence-stopped">{folder?.name ?? 'Sequence'} stopped: NoaCG Bridge restarted</span>}
      <span>{item.sequenceStopped ? 'Already queued media may still play. Check program output before taking another cue.' : 'No matching cue instance was reported. This is not a playback failure by itself.'}</span>
      <SlotRemaining timing={timing} slot={slotAddress(item.slot)} fallback="" />
      <button onClick={() => clear(item.slot)}>Stop/Clear {slotAddress(item.slot)}</button>
    </div>;
    })}
  </div>;
}
