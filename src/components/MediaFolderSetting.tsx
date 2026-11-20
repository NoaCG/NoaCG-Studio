import { useEffect, useState } from 'react';
import { loadPlayoutSettings, serverMediaFolder, type PlayoutSettings } from '../control/playoutLink';
import type { MediaFolderCheck } from '../control/playoutProtocol';

/**
 * THE SERVER'S MEDIA FOLDER, as this computer reaches it (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.2):
 * a network share such as `\\PLAYOUT\media`, kept by NoaCG Bridge for the server, which the waveform
 * and Normalize read files from. The line under it is the Bridge's own check, in its words: linked,
 * not linked, access denied, offline, or a folder that is not this server's.
 *
 * Asked when the panel opens and when the server changes; Link keeps the typed path and checks it.
 */
export default function MediaFolderSetting({ settings }: { settings: PlayoutSettings }) {
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<MediaFolderCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const server = `${settings.host}:${settings.amcpPort}`;

  useEffect(() => {
    let alive = true;
    setCheck(null);
    setProblem(null);
    void serverMediaFolder(loadPlayoutSettings()).then(({ result, check: c }) => {
      if (!alive) return;
      if (c) {
        setCheck(c);
        setTyped(c.folder ?? '');
      } else setProblem(result.detail);
    });
    return () => {
      alive = false;
    };
  }, [server, settings.agentUrl, settings.agentToken]);

  const keep = async (folder: string | null) => {
    setBusy(true);
    const { result, check: c } = await serverMediaFolder(loadPlayoutSettings(), folder);
    setBusy(false);
    if (c) {
      setCheck(c);
      setProblem(null);
      setTyped(c.folder ?? '');
    } else setProblem(result.detail);
  };

  const kept = check?.folder ?? '';
  return (
    <>
      <div className="dlg-row">
        <label htmlFor="caspar-media-folder" title="Where this computer reads the server's media files, for the waveform and Normalize.">
          Media folder
        </label>
        <div className="playout-media-folder">
          <input
            id="caspar-media-folder"
            value={typed}
            placeholder="\\PLAYOUT\media"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed.trim() && typed.trim() !== kept) void keep(typed.trim());
            }}
            data-testid="caspar-media-folder"
          />
          <button type="button" disabled={busy || !typed.trim() || typed.trim() === kept} onClick={() => void keep(typed.trim())} data-testid="caspar-media-folder-link">
            {busy ? 'Checking…' : 'Link'}
          </button>
          {kept && (
            <button type="button" disabled={busy} onClick={() => void keep(null)} data-testid="caspar-media-folder-forget">
              Forget
            </button>
          )}
        </div>
      </div>
      {(check || problem) && (
        <p
          className={`dlg-hint ${check?.state === 'linked' ? 'status-ok' : check?.state === 'not-linked' ? '' : 'status-warn'}`}
          data-testid="caspar-media-folder-state"
          data-state={check?.state ?? 'unavailable'}
        >
          {problem ?? check?.detail}
        </p>
      )}
    </>
  );
}
