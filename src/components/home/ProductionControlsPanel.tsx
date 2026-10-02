// THE CONTROLS PANEL — where a production authors the ARRANGE half of its control profile
// (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e; the format is src/model/profile.ts). The profile's
// other half, Combined controls, was removed on 2026-10-02 (owner ruling; unused in production).
//
// WHAT IT IS FOR, in the owner's words: the operator should understand the show, not the
// software. A graphic may declare twelve controls and a production may press four of them; this
// is where the four come to the top, the eight go behind a drawer, and "plus_katri" becomes
// "Katri +1". Nothing here changes what a press DOES — the declaration decides that, the machine
// still guards it, and deleting the profile leaves the generated panel exactly as it was.
//
// WHAT IT DELIBERATELY DOES NOT AUTHOR:
//
//   - FIELD BANDS. The cue editor's grouping is DERIVED from the field titles and stays that way
//     (docs/PLAYOUT_DASHBOARD.md §2e, owner 2026-08-21: "we have no idea what kinds of graphics
//     we will have in the future"). ARRANGE has no vocabulary for a field and must not grow one.
//   - SECTIONS. The section is the AUTHOR's own metadata and travels inside the graphic. The
//     format lets a profile override it, but this panel does not offer the text box: drag order
//     already moves a control past a heading, which is the gesture an operator actually reaches
//     for, and a production renaming another author's sections is how two vocabularies start.
//
// WHY IT IS COLLAPSED BY DEFAULT. This column is an OPERATING surface: a drag-to-reorder list
// sitting open under the ⚡ buttons during a programme is a hand's-width from the controls that
// go to air. Authoring is a thing you sit down and do.
import { useState } from 'react';
import type { ControlButton } from '../../control/controlModel';
import { arrangeControls, arrangeFor } from '../../control/controlModel';
// `put` is the format module's own guard for a user-named key, not a second copy of it: a control
// id is the author's own event name, and a bare `map[control] = entry` loses one called
// `__proto__` with no error at all — a panel reporting a save that stored nothing.
import { put, type ArrangeEntry, type ShowProfile } from '../../model/profile';

/** The drag payload's own MIME type, the cue rundown's mechanism exactly: a private type means a
 *  row dragged out of this list cannot be dropped into the rundown, or the other way round. */
const DRAG_TYPE = 'text/noacg-control';

export default function ProductionControlsPanel({
  graphic,
  buttons,
  profile,
  readOnly,
  onArrange,
  onDeleteProfile,
}: {
  /** The POOL graphic's name — the key ARRANGE, the bindings and the published panel all use. */
  graphic: string;
  /** The controls the graphic DECLARES, generated (controlModel `eventButtons`). */
  buttons: ControlButton[];
  /** The profile as this build may RENDER it (`readPublishedProfile`), or null for a production
   *  with none — and also for one this build cannot read, which `readOnly` then explains. */
  profile: ShowProfile | null;
  /** A profile a NEWER build wrote. Every door refuses it (`model/shows.ts` says why), so the
   *  panel says so rather than offering controls that would silently do nothing. */
  readOnly: boolean;
  /** This graphic's whole arrangement, replaced. An empty map deletes the graphic's key. */
  onArrange: (entries: Record<string, ArrangeEntry>) => void;
  onDeleteProfile: () => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** Names being TYPED, by control id. The stored name is trimmed and an empty one means "as the
   *  graphic declared it", so committing on every keystroke made the box refuse a space: the
   *  trim took it off, the value came back without it, and "Stop the clock" could not be typed.
   *  The draft holds what the operator is actually typing; blur is what commits it. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const entries = arrangeFor(profile, graphic) ?? {};
  /** The rows, in the order the operator will meet them: pinned, then each section, then the
   *  hidden ones. The list an operator drags IS the panel they get. */
  const arranged = arrangeControls(buttons, entries);
  const rows = [
    ...arranged.pinned.map((c) => ({ ...c, pinned: true, hidden: false })),
    ...arranged.sections.flatMap(([, controls]) => controls.map((c) => ({ ...c, pinned: false, hidden: false }))),
    ...arranged.more.map((c) => ({ ...c, pinned: false, hidden: true })),
  ];

  const storedFor = (event: string): ArrangeEntry | undefined =>
    Object.prototype.hasOwnProperty.call(entries, event) ? entries[event] : undefined;

  /**
   * The entries this panel does NOT govern: an arrangement for a control the graphic no longer
   * declares. They are carried through every write rather than tidied away, because a control can
   * disappear for a moment while its template is being edited, and an operator would never be
   * told that an afternoon's arranging went with it. The validator already WARNS about them, and
   * deleting the profile is the deliberate way to clear them.
   */
  const untouched = (): Record<string, ArrangeEntry> => {
    const declared = new Set(rows.map((r) => r.button.event));
    const kept: Record<string, ArrangeEntry> = {};
    for (const [event, entry] of Object.entries(entries)) if (!declared.has(event)) put(kept, event, entry);
    return kept;
  };

  /** One control's entry, changed. An entry that ends up saying nothing is dropped by the
   *  format's own canonical form, so "back to how the graphic declared it" needs no special
   *  case here — it is what clearing every mark leaves behind. */
  const patch = (event: string, change: Partial<ArrangeEntry>) => {
    const next = untouched();
    for (const row of rows) {
      const entry = { ...storedFor(row.button.event), ...(row.button.event === event ? change : {}) };
      // An undefined mark is a REMOVED mark: `{ ...entry, name: undefined }` is how clearing the
      // rename box gets back to the declared label, and JSON would carry the key otherwise.
      for (const key of Object.keys(entry) as (keyof ArrangeEntry)[]) {
        if (entry[key] === undefined) delete entry[key];
      }
      if (Object.keys(entry).length > 0) put(next, row.button.event, entry);
    }
    onArrange(next);
  };

  /** Drop `from` at `to`'s position, renumbering the whole list. Renumbering rather than nudging
   *  one key: `order` is a position, the list is short, and a partial numbering would make the
   *  next drag depend on which drags came before it. */
  const reorder = (from: string, to: string) => {
    const fromIndex = rows.findIndex((r) => r.button.event === from);
    const toIndex = rows.findIndex((r) => r.button.event === to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const moved = rows.slice();
    moved.splice(toIndex, 0, moved.splice(fromIndex, 1)[0]);
    const next = untouched();
    moved.forEach((row, index) => {
      put(next, row.button.event, { ...storedFor(row.button.event), order: index });
    });
    onArrange(next);
  };

  /** Commit a typed name. Empty, or the declared label typed back, is "as the graphic declared
   *  it" — storing the declared word would pin it and stop it following the graphic when its
   *  author changes it. */
  const commitName = (event: string, declared: string) => {
    const draft = drafts[event];
    if (draft === undefined) return; // a blur with nothing typed is not an edit
    setDrafts((d) => {
      const next = { ...d };
      delete next[event];
      return next;
    });
    const typed = draft.trim();
    patch(event, { name: typed && typed !== declared ? typed : undefined });
  };

  const hasArrangement = Object.keys(entries).length > 0;

  return (
    <details className="pd-actions pd-controls-panel" data-testid="controls-panel">
      <summary>
        <span className="pd-actions-kicker">CONTROLS</span>
        <span className="muted">
          {hasArrangement
            ? `arranged for this production, ${rows.length} control${rows.length === 1 ? '' : 's'}`
            : 'as the graphic declared them'}
        </span>
      </summary>
      <p className="hint pd-actions-help">
        How THIS production shows {graphic}&rsquo;s controls. Drag to order them, pin the handful
        you press, hide the rest behind &ldquo;More&rdquo;, and rename one into the show&rsquo;s own
        words. Nothing about a press changes: the graphic still decides what it does, and a hidden
        control is still guarded and still one click away.
      </p>

      {readOnly ? (
        <p className="status-bad" data-testid="controls-panel-readonly">
          This production&rsquo;s control profile was written by a newer build, so it is read-only
          here. Open it on that build to change it. Editing it from here could destroy settings
          this one cannot even see.
        </p>
      ) : (
        <>
          <ul className="pd-controls-list" data-testid="controls-list">
            {rows.map((row) => {
              const event = row.button.event;
              return (
                <li
                  key={event}
                  className={`pd-controls-row${row.hidden ? ' hidden' : ''}${dragging === event ? ' dragging' : ''}`}
                  data-testid={`controls-row-${event}`}
                  // The whole row is a DROP target and only the grip is a drag SOURCE. Making the
                  // row draggable put the rename box inside the source, so dragging across it to
                  // select text started a row drag instead — and the grip advertises `cursor: grab`
                  // as if it were the handle, which it now is.
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(null);
                    const from = e.dataTransfer.getData(DRAG_TYPE);
                    if (from) reorder(from, event);
                  }}
                >
                  <span
                    className="pd-grip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, event);
                      setDragging(event);
                    }}
                    onDragEnd={() => setDragging(null)}
                    aria-hidden="true"
                    data-testid={`controls-grip-${event}`}
                  >
                    ⣿
                  </span>
                  {/* THE ONLY TEXT BOX IN THE PANEL, and it takes a NAME — never a value or
                      an expression (§6b: the profile has no place for one).
                      Empty is a real answer: it means "as the graphic declared it". */}
                  <input
                    className="pd-controls-name"
                    value={drafts[event] ?? row.label}
                    aria-label={`Name for ${row.button.label}`}
                    placeholder={row.button.label}
                    onChange={(e) => setDrafts((d) => ({ ...d, [event]: e.target.value }))}
                    onBlur={() => commitName(event, row.button.label)}
                    // Enter commits without reaching for the mouse. Escape is deliberately NOT
                    // bound: undoing a name is typing it back, and an abandon that raced the
                    // draft's own state update would commit the very text it promised to drop.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    data-testid={`controls-name-${event}`}
                  />
                  <button
                    className={`pd-controls-mark${row.pinned ? ' on' : ''}`}
                    aria-pressed={row.pinned}
                    disabled={row.hidden}
                    title={
                      row.hidden
                        ? 'A hidden control has no fold to sit above. Unhide it first.'
                        : row.pinned
                          ? 'Pinned above the fold. Press to unpin.'
                          : 'Pin it above the fold, where the hand goes first'
                    }
                    onClick={() => patch(event, { pinned: row.pinned ? undefined : true })}
                    data-testid={`controls-pin-${event}`}
                  >
                    ★ Pin
                  </button>
                  <button
                    className={`pd-controls-mark${row.hidden ? ' on' : ''}`}
                    aria-pressed={row.hidden}
                    title={
                      row.hidden
                        ? 'Behind "More". Press to bring it back into the panel.'
                        : 'Put it behind "More": still legal, still one click away, just not in the way'
                    }
                    // Hiding clears the pin: the two mean opposite things and a profile carrying
                    // both is a hand-edit the surfaces have to resolve rather than a state this
                    // panel should be able to produce.
                    onClick={() =>
                      patch(event, row.hidden ? { hidden: undefined } : { hidden: true, pinned: undefined })
                    }
                    data-testid={`controls-hide-${event}`}
                  >
                    {row.hidden ? '◦ Hidden' : '● Shown'}
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && <p className="hint">This graphic declares no controls to arrange.</p>}

          {/* DELETE IS ONE ACTION and restores the complete generated panel, on every surface
              (docs/CONTROL_PANEL_ROAD.md §3). It removes the whole profile, every graphic's
              arrangement, which is why it says so and why it is the only destructive control here. */}
          {profile && (
            <p className="pd-controls-delete">
              <button
                className="pd-action destructive"
                onClick={() => onDeleteProfile()}
                title="Removes this production's whole control profile, every graphic's arrangement, and leaves the generated panel on all three deployments"
                data-testid="controls-delete-profile"
              >
                Delete profile
              </button>
              <span className="hint">
                Removes the arrangement for every graphic in this production and leaves the panel
                the graphics generate.
              </span>
            </p>
          )}
        </>
      )}
    </details>
  );
}
