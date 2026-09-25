# src/styles - the app's stylesheet

The stylesheet is 30 PARTS, one per surface, and **`styles/index.css` IS the cascade order** -
append a new part where its rules already sat, never re-sort. Rich-but-commented CSS is the house
style, so the reasoning for a specific rule belongs in the rule's own comment; what lives here is
the anatomy several surfaces must agree on.

## Dialog anatomy (EVERY dialog, defined once in `wizard-and-dialogs.css`)

re-design/handoff.md §6. Stated once rather than per sheet: these defects are what happens when
six dialogs each invent a header and a checkbox row. **Read this before writing dialog markup in
`src/components`.**

- **HEADER** - one flex row, ✕ last: a 32px bordered square, hard right (`.gallery-close`).
  The eye finds it by CORNER, so one that follows the title moves whenever the title's length
  does. `.wz-header`/`.gallery-header` push it with `margin-left: auto`, cancelled when a
  cluster before it (the wizard's step counter, a gallery's settings) already took the space -
  two auto margins SPLIT it. The subtitle truncates; the button never shrinks. Never
  absolutely-position it: out of flow it overlaps whatever grows under it.
- **CHECKBOX ROW** (`.dlg-check`) - box first, title over description, whole label clickable,
  cap-aligned to the first line. Checkboxes and radios are sized GLOBALLY: the "inputs are
  100% wide" rule was written for fields you type into and caught them too. Do not re-add a
  per-dialog `style={{ width: 'auto' }}`.
- **FORM ROW** (`.dlg-row`) - `110px label | 1fr control`; an input+button pair nests a
  `.dlg-pair` grid so the button never wraps under the field, and a hint indents to the
  control column because it belongs to the control.
- **FOOTER** (`.dlg-foot`) - one row, secondary left, primary right, never stacked.

**A `.spacer` div is not a push.** There is no global `.spacer { flex: 1 }`, only scoped ones,
so a header pushing its ✕ with a bare `<div className="spacer" />` pushes nothing and the button
sits one gap after the title - the §6 defect exactly. Use `.gallery-close`; `.wz-header` already
parks it.

Settings is the worked example: 820x620, a section nav that JUMPS rather than switches, so
every section stays mounted and no preference is reachable only by clicking the right tab.

## Links

**EVERY LINK IN THE APP IS AMBER** - one app-wide `a { color: var(--accent) }` at the top of
`base.css`, so a new link inherits it rather than each surface remembering to. The rule's full
reasoning, and the two deliberate exceptions, are in that file's own comment. Do not restate it
per surface.
