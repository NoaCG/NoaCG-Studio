import { useEffect, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { saveCurrentGraphic, useSaveUi } from '../../store/saveActions';
import { useRouter } from '../../app/router';
import { modalOpen } from '../spaceKey';

/**
 * The topbar SAVE control (docs/SAVED_CONTENT_MODEL.md §2): one primary Save button, an
 * honest status word next to it, and a ⌄ menu for Save As / Duplicate. First save opens
 * the name-and-destination dialog (SaveDialogs.tsx); later saves write straight into the
 * linked library record. Ctrl/Cmd+S saves from anywhere, including inside Monaco.
 */
export default function SaveControls() {
  const saved = useTemplateStore((s) => s.saved);
  const openSaveDialog = useSaveUi((s) => s.openSaveDialog);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const save = () => {
    void saveCurrentGraphic().then((r) => {
      if (r === 'needs-name') openSaveDialog('first');
    });
  };

  // Ctrl/Cmd+S — capture phase so the browser's own save-page dialog never appears; works
  // while typing in Monaco or a field (saving mid-edit is the point). Stands down while a
  // modal is up (the dialog owns the keyboard there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (modalOpen()) return;
        void saveCurrentGraphic().then((r) => {
          if (r === 'needs-name') useSaveUi.getState().openSaveDialog('first');
        });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // The menu closes on an outside click or Escape (standard menu behavior).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // `why` is the half a narrow bar drops (save-controls.css); `title` is the hover, which every
  // width keeps. Both are optional, and typing the ladder is what lets the rungs that have
  // neither say nothing rather than spelling out `title: undefined` five times.
  const status: { text: string; cls: string; why?: string; title?: string } =
    saved.status === 'saving' ? { text: 'Saving…', cls: 'save-status' }
    : saved.status === 'failed' ? { text: 'Save failed', cls: 'save-status save-status-bad' }
    : !saved.graphicId ? { text: 'Not saved', cls: 'save-status save-status-dirty' }
    : saved.dirty ? { text: 'Unsaved changes', cls: 'save-status save-status-dirty' }
    // A save that LANDED carrying a format the catalogue does not offer. It gets its own class
    // rather than reusing the dirty one: `save-status-dirty` wears the ● that means "your work is
    // not written", and the record here IS written.
    : saved.formatIssues?.length
      ? {
          text: 'Saved',
          why: ' · unsupported format',
          cls: 'save-status save-status-warn',
          title: saved.formatIssues.join(' '),
        }
    : { text: 'Saved', cls: 'save-status save-status-ok' };

  return (
    <span className="save-controls" ref={wrapRef}>
      <span
        className={status.cls}
        data-testid="save-status"
        data-format-unsupported={status.why ? 'true' : undefined}
        title={status.title}
      >
        {status.text}
        {status.why && <span className="save-status-why">{status.why}</span>}
      </span>
      <button
        className={saved.dirty || !saved.graphicId ? 'primary save-btn' : 'save-btn'}
        onClick={save}
        data-testid="save-graphic"
        title={saved.graphicId ? 'Save changes to this graphic (Ctrl+S)' : 'Save this graphic (Ctrl+S)'}
      >
        💾 Save
      </button>
      <button
        className="save-menu-btn"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="save-menu"
        title="Save As, duplicate…"
      >
        ▾
      </button>
      {menuOpen && (
        <div className="account-menu save-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); openSaveDialog('save-as'); }}
            data-testid="save-as"
          >
            Save As… <span className="muted">new copy</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              useRouter.getState().navigate({ view: 'home', section: 'graphics' });
            }}
          >
            Open saved graphics…
          </button>
        </div>
      )}
    </span>
  );
}
