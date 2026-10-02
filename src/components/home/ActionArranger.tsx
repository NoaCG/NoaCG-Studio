// ARRANGING THE ⚡ BLOCK IN PLACE. A production authors the ARRANGE half of its control profile
// (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e; the format is src/model/profile.ts) on the live buttons
// themselves: the block's Arrange toggle swaps each ⚡ button for a chip that pins, hides or
// renames it, in the very place it will sit. It replaced the separate Controls panel on
// 2026-10-02 (docs/research/control-surfaces-review-2026-10-02 slice 4): a second panel under the
// buttons, about the buttons, was one more thing between the operator and the controls that go
// to air.
//
// WHAT IT IS FOR, in the owner's words: the operator should understand the show, not the
// software. A graphic may declare twelve controls and a production may press four of them; this
// is where the four come to the top, the eight go behind "More", and "plus_katri" becomes
// "Katri +1". Nothing here changes what a press DOES: the declaration decides that, the machine
// still guards it, and clearing the arrangement leaves the generated panel exactly as it was.
//
// WHAT IT DELIBERATELY DOES NOT AUTHOR:
//
//   - ORDER. A stored `order` still sorts the block (controlModel `arrangeControls`), but there is
//     no drag here: pinning is the gesture that moves a control nearer the hand, and a drag list
//     inside a block of buttons that go to air is the hazard the old panel had to fold away.
//   - FIELD BANDS and SECTIONS. The cue editor's grouping is derived from the field titles, and a
//     section is the AUTHOR's own metadata that travels inside the graphic; a production renaming
//     another author's sections is how two vocabularies start.
//
// WHILE ARRANGING, NOTHING FIRES. The chips are not the buttons, and the block says so in its
// help line, because a press that silently did nothing mid-programme is the worse surprise.
import { useState } from 'react';
import type { ArrangedControl, ControlButton } from '../../control/controlModel';
import { arrangeControls, arrangeFor } from '../../control/controlModel';
// `put` is the format module's own guard for a user-named key, not a second copy of it: a control
// id is the author's own event name, and a bare `map[control] = entry` loses one called
// `__proto__` with no error at all, a block reporting a save that stored nothing.
import { put, type ArrangeEntry, type ShowProfile } from '../../model/profile';

export default function ActionArranger({
  graphic,
  buttons,
  profile,
  onArrange,
}: {
  /** The POOL graphic's name: the key ARRANGE, the bindings and the published panel all use. */
  graphic: string;
  /** The controls the graphic DECLARES, generated (controlModel `eventButtons`). */
  buttons: ControlButton[];
  /** The profile as this build may RENDER it (`readPublishedProfile`), or null for none. A
   *  profile a newer build wrote never reaches here: the toggle that opens this is disabled. */
  profile: ShowProfile | null;
  /** This graphic's whole arrangement, replaced. An empty map clears the graphic's key. */
  onArrange: (entries: Record<string, ArrangeEntry>) => void;
}) {
  /** Names being TYPED, by control id. The stored name is trimmed and an empty one means "as the
   *  graphic declared it", so committing on every keystroke made the box refuse a space: the
   *  trim took it off, the value came back without it, and "Stop the clock" could not be typed.
   *  The draft holds what the operator is actually typing; blur is what commits it. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const entries = arrangeFor(profile, graphic) ?? {};
  const arranged = arrangeControls(buttons, entries);
  const declared = new Set(buttons.map((b) => b.event));

  const storedFor = (event: string): ArrangeEntry | undefined =>
    Object.prototype.hasOwnProperty.call(entries, event) ? entries[event] : undefined;

  /** One control's entry, changed. The entries for controls the graphic no longer declares are
   *  carried through every write rather than tidied away: a control can disappear for a moment
   *  while its template is being edited, and an afternoon's arranging must not go with it. An
   *  entry that ends up saying nothing is dropped by the format's own canonical form. */
  const patch = (event: string, change: Partial<ArrangeEntry>) => {
    const next: Record<string, ArrangeEntry> = {};
    for (const [key, entry] of Object.entries(entries)) if (!declared.has(key)) put(next, key, entry);
    for (const b of buttons) {
      const entry = { ...storedFor(b.event), ...(b.event === event ? change : {}) };
      // An undefined mark is a REMOVED mark, and JSON would carry the key otherwise.
      for (const key of Object.keys(entry) as (keyof ArrangeEntry)[]) {
        if (entry[key] === undefined) delete entry[key];
      }
      if (Object.keys(entry).length > 0) put(next, b.event, entry);
    }
    onArrange(next);
  };

  /** Commit a typed name. Empty, or the declared label typed back, is "as the graphic declared
   *  it": storing the declared word would stop it following the graphic when its author changes it. */
  const commitName = (event: string, declaredLabel: string) => {
    const draft = drafts[event];
    if (draft === undefined) return; // a blur with nothing typed is not an edit
    setDrafts((d) => {
      const next = { ...d };
      delete next[event];
      return next;
    });
    const typed = draft.trim();
    patch(event, { name: typed && typed !== declaredLabel ? typed : undefined });
  };

  const chip = ({ button: b, label }: ArrangedControl, state: 'pinned' | 'shown' | 'hidden') => {
    const pinned = state === 'pinned';
    const hidden = state === 'hidden';
    const value = drafts[b.event] ?? label;
    return (
      <span key={b.event} className={`pd-arrange-chip ${state}`} data-testid={`arrange-${b.event}`}>
        <button
          type="button"
          className="pd-arrange-pin"
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          disabled={hidden}
          title={
            hidden
              ? 'A hidden action cannot be pinned. Show it first.'
              : pinned
                ? 'Pinned to the top row. Press to unpin.'
                : 'Pin it to the top row, where the hand goes first'
          }
          onClick={() => patch(b.event, { pinned: pinned ? undefined : true })}
          data-testid={`arrange-pin-${b.event}`}
        >
          {pinned ? '★' : '☆'}
        </button>
        {/* THE ONLY TEXT BOX HERE, and it takes a NAME, never a value. Sized to its word so a
            chip reads as the button it stands for rather than as a form field. */}
        <input
          className="pd-arrange-name"
          value={value}
          size={Math.max(4, value.length + 1)}
          aria-label={`Name for ${b.label}`}
          placeholder={b.label}
          onChange={(e) => setDrafts((d) => ({ ...d, [b.event]: e.target.value }))}
          onBlur={() => commitName(b.event, b.label)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          data-testid={`arrange-name-${b.event}`}
        />
        <button
          type="button"
          className="pd-arrange-hide"
          aria-pressed={hidden}
          title={
            hidden
              ? 'Behind "More". Press to bring it back into the block.'
              : 'Put it behind "More": still guarded, still one click away, just not in the way'
          }
          // Hiding clears the pin: the two mean opposite things.
          onClick={() => patch(b.event, hidden ? { hidden: undefined } : { hidden: true, pinned: undefined })}
          data-testid={`arrange-hide-${b.event}`}
        >
          {hidden ? 'Show' : 'Hide'}
        </button>
      </span>
    );
  };

  const hasArrangement = Object.keys(entries).length > 0;
  return (
    <div className="pd-arrange" data-testid="cue-actions-arranging">
      <p className="hint pd-actions-help">
        Arranging how this production shows these actions. ☆ pins one to the top row, Hide puts it
        behind &ldquo;More&rdquo;, and the box renames it. The buttons do not fire until you press
        Done, and what each one does stays as the graphic declared it.
      </p>
      {arranged.pinned.length > 0 && (
        <div className="pd-actions-row pd-actions-pinned">{arranged.pinned.map((c) => chip(c, 'pinned'))}</div>
      )}
      {arranged.sections.map(([section, controls]) => (
        <div key={section} className="pd-actions-section">
          {(arranged.sections.length > 1 || section !== 'Actions') && <h4>{section}</h4>}
          <div className="pd-actions-row">{controls.map((c) => chip(c, 'shown'))}</div>
        </div>
      ))}
      {arranged.more.length > 0 && (
        <div className="pd-actions-section">
          <h4>Behind More</h4>
          <div className="pd-actions-row">{arranged.more.map((c) => chip(c, 'hidden'))}</div>
        </div>
      )}
      {/* ONE action back to the generated block, for this graphic. When it was the last graphic
          with an arrangement the page removes the profile key entirely, so a production that
          never had one and one whose arrangement was cleared are the same record. */}
      {hasArrangement && (
        <p className="pd-arrange-reset">
          <button type="button" onClick={() => onArrange({})} data-testid="arrange-reset">
            Back to the graphic&rsquo;s own
          </button>
        </p>
      )}
    </div>
  );
}
