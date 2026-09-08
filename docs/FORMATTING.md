# Code formatting (Prettier)

NoaCG Studio uses [Prettier](https://prettier.io) to tidy the template code an editor or the AI
produces. The whole layer is `src/format/formatCode.ts` - a small, house-aware wrapper, **not** a
blanket reformatter. Prettier and its plugins are bundled locally (no CDN) and loaded lazily via
dynamic `import()`, so they stay out of the initial app bundle
(`root/keep-generated-template-self-contained-runtime`).

## What is safe to format, and what is protected

Formatting is intentionally different per language because two parts of a template are owned by
other systems and must never be silently rewritten:

| File | Auto after AI | Explicit "Format" | Why |
|---|---|---|---|
| **HTML** | yes | yes | The SPX definition is read by brace-matching + `eval` (`src/model/spxDefinition.ts`), so reflowing the body or the embedded `<script>` object literal never breaks parsing. |
| **CSS** | no | yes | The house style comments every property **right-aligned** (`docs/DESIGN_LANGUAGE.md` §7). Prettier collapses that to a single space. Formatting on an explicit user action is fine (they opted in), but auto-formatting would degrade the hand-tuned look of every generation, so the AI path leaves CSS as emitted. |
| **JS** | no | only when no animation region | The marked ANIMATION region carries `var NOACG_ANIM = { ... }` as **strict JSON** with a canonical one-keyframe-per-line layout the timeline reads (`JSON.parse`) and rewrites with minimal diffs (`src/blocks/animData.ts`). Prettier would unquote the JSON keys and reflow the block. `formatJs` returns any region-owning file untouched; the Format button is disabled on that tab. |

`hasProtectedRegion(js)` is the single guard (matches both `NOACG_ANIM` and the legacy
`== ANIMATION` marker). `formatJs` and the editor button both consult it.

## Where it is wired today

- **Explicit format** - a `Format` button in the code editor's tab bar, plus Monaco's built-in
  right-click "Format Document" and `Shift+Alt+F`. All three run the same
  `registerDocumentFormattingEditProvider` in `src/components/CodeEditor.tsx`, which returns a
  **minimal edit** (only the changed span, via `minimalTextChange`) so the cursor and selection
  stay put and Monaco keeps the change on its own undo stack.
- **After an AI Generate** - `AIPromptPanel` formats the proposed template's **HTML only** before
  showing it for review (`formatTemplate`, HTML default). Modify / Fix / Make-SPX-ready stay
  byte-faithful to the AI's surgical edit so the review diff stays focused.
- **On create (every generated project)** - the creation wizard formats a freshly generated
  template's **HTML only** before the create apply (`applyGenerated` in
  `src/components/wizard/CreationWizard.tsx`, routing the template / blank / describe-it paths
  through `formatTemplate`). This gives every new project ONE consistent, Prettier-tidied HTML
  baseline, which matters beyond tidiness: because generated markup is otherwise 4-space body
  under a 2-space head, formatting it once **at birth** keeps every later canvas/timeline edit to
  a tight, minimal diff - the editor's change-highlight ("canvas editing shows the code it wrote")
  stays accurate. The first create of a session pays the lazy Prettier import once (a small,
  one-time cost off the create click); later creates reuse the memoized load. **Imported**
  templates are deliberately NOT formatted here - they stay byte-faithful to the file the user
  brought in (same posture as AI Modify/Fix), and the pristine `baseline` a `↺ Reset` restores is
  the formatted create output.

`formatTemplate(template, { html, css, js })` is the reusable entry point; the defaults
(`html: true`, `css: false`, `js: false`) encode the safety table above. A formatter error on any
file falls back to the original, so formatting can never break an apply. Formatting is idempotent
and preserves the SPX definition across its re-parse (`withParsedFields`), verified across every
catalog category - fields, validation, CSS, and JS all survive untouched.

## Evaluated and intentionally NOT wired (the once-deferred hooks)

The timeline/canvas refactors have merged, so the originally deferred integration points were
re-examined against the shipped architecture. The **create-time** hook was the valuable one and is
now wired (see "On create" above). The rest were evaluated and left out on purpose - wiring them
as first imagined would degrade quality, not improve it:

- **Per-gesture visual-editor formatting** - NOT wired. Two reasons. (1) Every canvas/timeline
  gesture already commits through a structured patcher (`setCssDeclaration`, `setCssVariable`,
  `spliceAnimData`, `setFieldDefault`) that emits clean, targeted code by design (root
  non-negotiables 2 and 5) - there is nothing messy to tidy at that boundary. (2) `applyTemplate`
  derives the editor's change-highlight from a whole-file diff (`diffTemplates` in
  `src/store/templateStore.ts`); formatting HTML at a gesture commit would reflow the whole
  document and light up the entire file, breaking the "canvas editing shows the code it wrote"
  contract. **Format-on-create solves the underlying want instead**: a Prettier-shaped baseline
  means the one HTML-touching gesture (inline text edit) already produces a minimal diff.
- **Autosave / on-save formatting** - NOT wired. The autosave subscription fires 800 ms after
  *any* template change, including manual Monaco typing, and cannot tell a committed gesture from
  a keystroke - so formatting there (and writing the result back into the live store) would reflow
  under the user's cursor mid-pause, violating "never on keystroke".
- **CSS comment alignment** - unchanged: if the house right-aligned comment style is ever encoded
  as a Prettier plugin or a post-pass, CSS could join the auto-format set. Until then, CSS stays
  explicit-only (the Format button), never automatic.

Non-negotiable for any future automatic hook: format at a completed, discrete **transaction
boundary that is NOT the live editor** (create, export), not continuously - never on a Monaco
keystroke, a mouse move, a drag frame, or an autosave tick that can't distinguish typing.
