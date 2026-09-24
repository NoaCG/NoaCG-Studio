# C - the credits roll on an imported SVG: one pasted list, bottom to top

Branch `claude/c-credits-roll-import`, worktree `.claude/worktrees/agent-a5cecc2f605739e6f`, based
on `origin/main` at `2ef023324`. Owner walk:
`docs/acceptance/owner-queue/2026-09-24-c-credits-from-one-paste.md`. Night wave 2026-09-24, row C.

## The styling idea, for row E

Type the sample into the one text layer named `Credits` and style two of its lines: the first
line ending in `:` is what every title looks like, and the line right under it is what every name
looks like - font, size, weight, colour, indent, and the leading (title to name, name to name,
and the gap before the next title) are all read off those two lines. The sample IS the default
list the operator finds in the box, so draw the whole Finnish list as the sample, titles ending in
`:` with the names under them, and leave a little extra space before each title if you want the
sections to read.

## Roll, not a still card

The roll landed. On Take the whole list runs from below the window to above it at a constant pace
and the frame empties; Out and Take roll it again. The window is the plate named `Credits box`
when one is drawn (the roll is clipped to it), else the artwork's frame. Speed lives in the
operator's `Scroll speed (%)`, 100 by default, clamped 10-400 like the catalog roll, applied from
the next take.

## The default speed and how 30 s was measured

`CREDITS_LINES_PER_SECOND = 1.35` in `src/templates/importedDesign/creditsRoll.ts`: the pace is
the sample's own name-to-name leading times 1.35 a second, so a 30px credit and a 60px one read
at the same speed. Travel is the window's height plus the list's height. Measured by the spec on
the fixture (`e2e/fixtures/credits-roll.svg`, a 23-line list at a 52-unit leading, ~1,420 units
tall): inside its 800-tall box about 32 s, through the whole 1080 frame about 36 s. A 20-line
list at that leading through the frame is about 30 s. If the Finnish classroom list misses
thirty seconds, change that one constant and say so in the handoff.

## What landed, file by file

- `src/templates/behaviours/credits.ts` + `words.json` `credits`: the recipe. Roles `credits`
  (the text, a field, the recipe's evidence; words Credits, Credit list, End credits,
  Lopputekstit, Eftertexter) and `box` (a drawn plate; Credits box, panel, window). One owned
  field, Scroll speed (%). The entrance is named Rolling and its call `noacgCreditsRoll` starts
  the roll, so SPX, CasparCG, OGraf and the dashboard roll it alike. No paint rules, no buttons.
- `src/templates/importedDesign/creditsRoll.ts`: the engine, design-owned JS emitted by
  `svg.ts` when a Credits text is bound. The drawn text takes a class instead of a field id (the
  clock's contract), the operator's list lands in a hidden holder (a `textarea` field whose
  default is the sample's lines, `artworkFields.ts`), and the rows are `<tspan>`s in a copy of
  the sample's `<text>` inside an inner `<svg>` window (no clipPath, no id). Ids are read out of
  `NOACG_BEHAVIOUR.fields` at runtime, never retyped.
- `src/templates/endCredits/shared.ts`: `parseCredits` moved into the exported
  `CREDITS_PARSER_JS` and took an `escape` argument (default `escapeHtml`; the SVG engine passes
  the identity because it writes textContent). `scripts/credits-parser.test.mjs` cuts the block
  at the literal's end now. Shared, never copied.
- `src/assets/svgImport.ts` `markWrappedBlock`: a wrapping block whose lines are kerned runs is
  no longer flattened to one value; each line's runs merge into its first run, which keeps the
  line's baseline and its look. Needed because Illustrator writes a run per optical kerning pair
  and the two looks live on the lines. Outside the row's TOUCHES list, deliberately: without it
  the styling idea fails on ordinary Illustrator output.
- Docs: `docs/END_CREDITS.md` (the imported-SVG section, the maintainers' note),
  `docs/SVG_AUTHORING.md` (§5b block for the recipe, generated; §9 at the end), `docs.html`
  (one sub-block at the end of `#svg-layers`, plus the generated words table),
  `src/templates/importedDesign/AGENTS.md` (one rule).
- `e2e/import-svg-credits.spec.ts` + `e2e/fixtures/credits-roll.svg`, mapped in
  `scripts/e2e-affected.mjs`. Two walks: the proposal, the one field, the take, the two looks,
  the pace arithmetic, a fresh paste in every format, Scroll speed 200, the export; and the
  no-box roll through the frame. `NOACG_SHOTS=<dir>` writes frames.

## Decisions taken for the owner (revertable, listed in the owner-queue file)

Pace in lines a second, not pixels. A title rendered with its colon. A group with one name
renders as a title over a name (the sample's shape), never the catalog's inline layouts. The
roll runs once per take; Take is the Roll again button.

## The check (2026-09-25, before queueing)

`review: delegated` - the code-review pass came back with its scope stated (branch, base
`2ef023324`, the same 18 files `git diff --name-only` lists here; tree clean), so it counts. Nine
findings, all verified against the code and all taken: the roll now moves a group of its own
rather than the cloned text, because a snap's `clearProps` strips the transform attribute off an
SVG element GSAP has tweened (the rows would have dropped to the layer's origin after one
recovery); the list's extent is the group's bbox, so a scaled or rotated text matrix no longer
shortens the travel; a Credits role bound to one run of a composed block resolves to its whole
`<text>` at bind; `dy="1.2em"` and a run with no `x` read correctly; the sample's own section
gaps become blank lines in the default value and render with the sample's air; `shared.ts` had
been written with CRLF plus a lone CR (git read it as binary) and is LF again; the sample text
is memoised on the markup; the take reads the looks once; the recipe's `buttons` copy no longer
calls the field "the Credits box". `simplify: inline` - the skill returned fan-out instructions,
so the four angles were walked here: one expression tidied (the pace's text-scale), nothing
else needed. `verify: inline` - `npm run build` exit 0, `import-svg-credits.spec.ts` and
`end-credits.spec.ts` green through the queue, frames looked at. `taste: answered` - the
program monitor frames (early, mid-roll, after a fresh paste, and the whole-frame roll) show
titles in the sample's bold amber and names in its white at the sample's leading, the list
entering clipped at the box's bottom edge and running out of its top; no NO.

## The red CI run on the first pin (36060637679), read to a verdict

Two causes, both mine, both fixed on the branch; nothing fails on `main` at `2ef023324` (its
CI run 36051104001 is green).

- **Catalog calibration gate and `catalog-baseline.spec.ts`**: the shared parser now emits
  `parseCredits(text, escape)`, so the twelve end-credits designs' JS fingerprints moved.
  Expected, and re-recorded with `UPDATE_CATALOG_BASELINE=1 node scripts/check-catalog-emit.mjs`;
  the JSON diff is exactly twelve `js` hashes on cr01-cr13, no html, no css, no render baseline.
- **`import-svg-corpus.spec.ts`, figma-centred-title-card**: the recipe's words read `credits?`,
  so a title card's ordinary `Credit` line ("Directed by ...") was proposed as the credits roll,
  its text became the hidden sample, and the corpus walk's typed value never painted. The
  words are the plural only now (`Credits`, `Credit list`, `End credits`, `Lopputekstit`,
  `Eftertexter`); a singular `Credit` is a plain field again, so non-credits imports are exactly
  as they were. Reproduced locally through the queue (j-1854) before the fix and green after.

The styling idea is unchanged by either fix.

After the fixes: `npm run build` exit 0; `import-svg-corpus`, `import-svg-credits`, `end-credits`
and `catalog-baseline` green through the queue (j-1855, 39 passed). Then `origin/main` was taken
in at `b410b5cd8` (row D: configured specs, docs, `scripts/e2e-lists.mjs`, the advisor baseline;
no product code), the build re-run over the merged tree, and the integration plan from the fork
point read: it escalates to the full suite only because both sides edit an unmapped script, and
CI's full run on the pull request is that gate. Row B (PR #407) had not landed at requeue time,
so its layer names were not in play; whichever lands second keeps B's names and A's
`e2e-affected.mjs` removals.

## After row B landed (relay of 21:18Z, read before the second queueing)

`origin/main` taken in at `7c4e5510` (rows B and G). B's `layer-names.json` already lists
`credits: Heading, Credits`, and its `end-credits.svg` example draws the Credits text in the two
looks this roll reads, so B's names stand and nothing of mine moved them. The credits Fields-step
picture was re-shot as B asked (`scripts/docs-shots.mjs --only=type-end-credits-fields`, against
this worktree's own dev server on 5214): it now shows the wizard on *Credits roll* with the list
mid-roll in the sample's two looks. The script's end-credits entry pins the behaviour to
`credits` and holds five seconds before the shutter, because the roll starts when the preview
plays and a shot at the settle catches only the first line entering at the bottom edge. The
`docs.html#credits-colon` paragraph that said an imported credits graphic does not scroll now
says what it does. `check:example-layers` passes over the merged examples.

## What is left

- A centred or right-aligned sample is detected off the drawing (`creditsAnchor`) and not pinned
  by a spec: the fixture is left-aligned. Row J's live walk of the classroom credits is the first
  real check of Illustrator's own output through this; if the names come out ragged on a centred
  sample, look at `creditsAnchor` first.
- `noacgCreditsLast` and `noacgCreditsTween` are globals the spec reads; a reader can too.
- The corpus sweep (`import-svg-corpus.spec.ts`) ran green locally after the words fix (j-1855),
  so the `markWrappedBlock` change is covered by it.

## Pointers

Commits on the branch; the check stamp under `.git/noacg-jobs/checks/`; jobs j-1824 (spec
green, 2 passed), j-1825 (frames), j-1826 (`end-credits.spec.ts`).
