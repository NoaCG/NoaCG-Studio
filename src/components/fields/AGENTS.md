# src/components/fields - the one editable-field control

## Field controls (fields/) - ONE control, every surface

**FieldControl.tsx** is THE editable-field control. Every surface where a human changes a field's
value renders it: the SPX Data panel, the SPX Control panel, and the video Content panel. They
differ only in the DESCRIPTORS they pass (model/fieldModel.ts `FieldDescriptor`) and where the
value lives - never in what a number/colour/image control looks like or how it behaves. `FieldRow`
adds the label, the optional id badge, the per-field **Reset** to the descriptor's
`defaultValue` (shown only once the value differs), and the **TOO LONG** mark (`overflow`) a
control surface sets when the graphic reports that value as unfittable
(`control/controlModel.ts`, docs/CONTROL_PANEL_PARITY.md §4). Controls emit their kind's natural
type - a number for `number`, a string otherwise.
**SpxFieldRow.tsx** is the SPX binding both SPX panels share (sampleData + asset upload; values
stringify at that boundary because SPX sample data is a flat string map); the video panel binds
its own store the same way.
**Do not hand-roll a field control.** A new kind is added to `FieldKind`, mapped in the two
adapters (control/controlModel.ts `fieldDescriptors`, model/videoTypes.ts `videoInputDescriptor`),
and rendered once here. The exported standalone controlpanel.html (control/controlPanelHtml.ts)
renders the SAME descriptors in dependency-free vanilla JS because it ships without React - it is
the one deliberate second renderer; keep it in step.

## Laying control rows out: a grid track's fixed floor OVERFLOWS its neighbour

`grid-template-columns: repeat(auto-fit, minmax(210px, 1fr))` does NOT mean "at least 210px, grow
if the content needs more". **The `210px` is a hard track minimum**: an item whose own min-content
is wider neither widens the track nor shrinks - it overflows its track, and the item in the next
column paints on top of it. `1fr` is `minmax(auto, 1fr)`, but an explicit fixed min replaces the
`auto` that would otherwise have protected the content.

It costs time because **the symptom reads as a z-index or positioning bug and is neither**, and it
only shows at the widths where the track sits at its floor - so a wide monitor has it and the
developer's window does not. On 2026-08-21 it put a scoreboard's team name across the score
field's step-size box for everyone on a big monitor.

Set the floor from the WIDEST control's measured min-content, not from a round number that looked
right beside a text box - and put a structural backstop behind the arithmetic for the control
nobody has written yet: let the row WRAP. A taller field is ugly; an overlapping one is unreadable
and silent.
