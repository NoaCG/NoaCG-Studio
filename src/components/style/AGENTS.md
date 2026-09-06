# src/components/style - the :root style controls

Loaded alongside the root `AGENTS.md` and `src/components/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate.

Split out of `src/components/AGENTS.md` on 2026-08-09. The style contract these controls edit is
`src/templates/AGENTS.md`'s. Add a RULE here; leave the reasoning in the code's own comments.

## Style controls (style/) - ONE set, both surfaces

**StyleControls.tsx** renders the `:root` style contract wherever a human edits it: the
wizard's Style step and the editor's Style panel. It takes the DECLARED variables plus a
setter, so neither surface owns an opinion about what exists - `tokenVarsCss` emits only the
tokens a stylesheet actually reads, and a control appears for a variable that is there. Same
no-dead-knobs doctrine as the imported design's absent `--type-scale`.

Colour WORDS come from `model/styleVocabulary.ts`, the one translation table, grouped by role;
an unrecognised design-owned colour falls back to its humanised name rather than being hidden.
Every shape token has a control - radius, blur, keyline, lift, accent weight and glow, both
trackings, the heading weight, the kicker typeface were once emitted into every graphic and
reachable only by hand-editing the CSS. A shadow slot takes named presets, never a swatch or a
free field: the editor's looser colour filter rendered `--panel-shadow: 0 8px 24px rgba(...)`
as a colour row whose swatch overwrote the whole shadow.

Two contracts to keep when adding a control:
- **Token values are complete CSS values, never bare numbers** (`calc(16px * var(--scale))`,
  `none`, `50%`). A length control edits the number INSIDE the expression via
  `blocks/cssLength.ts` - overwriting the value would drop `var(--scale)` and the radius
  would silently stop scaling with the graphic.
- **A colour is parsed WITH its alpha** (`model/cssVars.ts` `parseCssColor` /
  `formatCssColor`) and written back in the form it arrived in. `--panel-bg` is an `rgba()`
  in nearly every design; a native `<input type="color">` has no alpha, so the old
  swatch-plus-hex pairing turned a translucent panel opaque with nothing on screen to show it.

**ColorField.tsx** is that control: swatch + feature-detected `EyeDropper` + text field +
an opacity slider. Its `advisory` is a NUMBER with the caveat in its title, never a verdict -
`contrastRatio` sees two colour values, while readability also depends on transparency, the
moving video behind the graphic, text shadows, type size and key-and-fill output. A pass/fail
badge would claim something the arithmetic cannot know.

A token that FOLLOWS another (`--accent-ink: var(--panel-bg)`) resolves to the literal behind
it so the row shows a real swatch, and its hint says that picking a colour there breaks the
link - which is what the pick means.

Two rows are shaped by what would otherwise be a lie:
- **A shadow row leads with the design's OWN value**, labelled "As designed" and selected,
  whenever it matches no preset - which is most designs, since a shadow is per-design far more
  than per-family. Four presets with none of them lit reads as a broken control.
- **A typeface token** (`--font-label`, `--font-numeric`) is a picker over BUNDLED faces only.
  Pointing one at a family we do not ship would emit a `url("fonts/…")` nothing writes, and
  `font-display: swap` would hide that until playout. **Both write paths ensure the
  `@font-face`** - the wizard's inside `buildDraftTemplate`, the editor's inside `setVar`. A
  hand-written value the registry does not know is kept and shown, never silently replaced.
