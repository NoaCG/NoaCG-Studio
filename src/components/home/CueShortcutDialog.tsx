import { useState } from 'react';
import { setCueShortcut, type Show, type ShowCue } from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { cueShortcutLabel } from '../../model/cueShortcuts';
import { cueShortcutReserved } from '../playoutKeys';
import { useModalGate } from '../spaceKey';

export default function CueShortcutDialog({ show, cue, onClose, setShows }: { show: Show; cue: ShowCue; onClose: () => void; setShows: (shows: Show[]) => void }) {
  useModalGate();
  const [key, setKey] = useState(cue.hotkey ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true); setError('');
    try {
      if (value && cueShortcutReserved(value)) throw new Error('That key is reserved for an operator command.');
      const result = setCueShortcut(show.id, cue.id, value);
      if (result.error) throw new Error(result.error);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      setShows(result.shows); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div className="gallery-backdrop"><section className="wz-modal pd-shortcut-dialog" role="dialog" aria-modal="true" aria-label="Cue shortcut">
    <header className="gallery-header"><h2>Shortcut · {cue.label}</h2><button className="gallery-close" onClick={onClose} aria-label="Close">✕</button></header>
    <div className="gallery-body"><p>Trigger this cue directly and keep your selection. Letters or digits, or Shift with a letter. Space, R, U, N, 0, P and H are reserved.</p>
    <label className="dlg-row">Shortcut<input autoFocus readOnly value={key ? cueShortcutLabel(key) : ''} placeholder="Press a key" onKeyDown={e => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { onClose(); return; }
      if (e.repeat || e.nativeEvent.isComposing || e.ctrlKey || e.altKey || e.metaKey || !/^[a-z0-9]$/i.test(e.key)) return;
      const next = `${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
      setKey(next); setError(cueShortcutReserved(next) ? 'Reserved for an operator command.' : '');
    }} /></label>
    {error && <p role="alert" className="status-bad">{error}</p>}</div>
    <footer className="dlg-foot"><button disabled={busy} onClick={() => void save(null)}>Remove shortcut</button><button className="primary" disabled={busy || !key || cueShortcutReserved(key)} onClick={() => void save(key)}>Assign shortcut</button></footer>
  </section></div>;
}
