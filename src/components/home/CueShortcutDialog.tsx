import { useEffect, useRef, useState } from 'react';
import { setCueShortcut, type Show, type ShowCue } from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { cueShortcutHolders, cueShortcutParts, normalizeCueShortcut, shortcutFromPress } from '../../model/cueShortcuts';
import { VERB_KEYS } from '../playoutKeys';
import { useModalGate } from '../spaceKey';

/**
 * A cue's shortcut: THE KEY YOU PRESS IS THE ASSIGNMENT (docs/work-specs/
 * playout-workflow-simplification AC-11, D13). It is saved at once and works at once; a key the
 * page cannot have says why in one line; a key another cue holds offers "Move it here". Tab,
 * Enter and Escape keep their dialog meanings, so the dialog stays usable from the keyboard.
 */
export default function CueShortcutDialog({ show, cue, onClose, setShows }: { show: Show; cue: ShowCue; onClose: () => void; setShows: (shows: Show[]) => void }) {
  useModalGate();
  const capture = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState<string | null>(normalizeCueShortcut(cue.hotkey));
  const [said, setSaid] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [taken, setTaken] = useState<{ value: string; by: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => capture.current?.focus(), []);

  const save = async (value: string | null, move = false) => {
    setBusy(true);
    try {
      const result = setCueShortcut(show.id, cue.id, value, { move });
      if (result.error) throw new Error(result.error);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      setShows(result.shows);
      setKey(value);
      setTaken(null);
      setSaid(value ? { tone: 'ok', text: 'Assigned' } : null);
    } catch (e) {
      setSaid({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      capture.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      onClose();
      return;
    }
    const answer = shortcutFromPress(
      { code: e.code, key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
      VERB_KEYS,
    );
    if (!answer) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || e.nativeEvent.isComposing || busy) return;
    if ('refused' in answer) {
      setTaken(null);
      setSaid({ tone: 'bad', text: answer.refused });
      return;
    }
    const [holder] = cueShortcutHolders(show.cues ?? [], cue.id, answer.value);
    if (holder) {
      setKey(answer.value);
      setSaid(null);
      setTaken({ value: answer.value, by: holder.label });
      return;
    }
    void save(answer.value);
  };

  return (
    <div className="gallery-backdrop">
      <section className="wz-modal pd-shortcut-dialog" role="dialog" aria-modal="true" aria-label="Cue shortcut">
        <header className="gallery-header">
          <h2>Shortcut · {cue.label}</h2>
          <button className="gallery-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="gallery-body pd-shortcut-body">
          <div
            ref={capture}
            className="pd-shortcut-keys"
            role="textbox"
            aria-label="Shortcut"
            aria-readonly="true"
            tabIndex={0}
            onKeyDown={onKeyDown}
            data-testid="shortcut-capture"
          >
            {key ? (
              cueShortcutParts(key).map((part, i) => (
                <span key={i} className="pd-shortcut-part">
                  {i > 0 && <span className="pd-shortcut-plus">+</span>}
                  <kbd>{part}</kbd>
                </span>
              ))
            ) : (
              <span className="pd-shortcut-placeholder">Press a key</span>
            )}
          </div>
          {taken ? (
            <p className="pd-shortcut-line" data-testid="shortcut-taken">
              Used by {taken.by}
              <button onClick={() => void save(taken.value, true)} disabled={busy} data-testid="shortcut-move">
                Move it here
              </button>
            </p>
          ) : (
            said && (
              <p className={`pd-shortcut-line ${said.tone === 'ok' ? 'status-ok' : 'status-bad'}`} role={said.tone === 'bad' ? 'alert' : 'status'} data-testid="shortcut-said">
                {said.text}
              </p>
            )
          )}
        </div>
        <footer className="dlg-foot">
          <button disabled={busy || !normalizeCueShortcut(cue.hotkey)} onClick={() => void save(null)} data-testid="shortcut-remove">
            Remove
          </button>
        </footer>
      </section>
    </div>
  );
}
