# Session - the two-row-set design, and two things read out of a layer name

**Branch:** `claude/two-row-set-recipe-fcbe5e` (from `main` `39835021`). **Date:** 2026-09-07.
**State:** finished and queued for landing. `npm run build` green on the branch stamp, and the
gate batch re-run green on the committed tree (1413 pass, 0 fail). **The local affected plan did
NOT run** - see "What is not verified here".

## What landed

### The two-row-set question, answered by dissolving it

Four independent designs for a two-row-set declaration, twelve adversarial reviews of them against
the real compiler, runtime, wizard and gates. Every design was refused on at least two of three
lenses, and they converge on one answer: **the premise was wrong.** Written into
`docs/SVG_BEHAVIOUR_PLAN.md` §13; `docs/SVG_BEHAVIOUR_SHOWS.md` §4f and §4g point at it.

- **The Jeopardy board and the case board bind on the shipped one-row-set shape.** Two reviewers
  wrote both out as ordinary recipes while looking for reasons a second row set was needed.
  Jeopardy's rows are its clue CELLS (one keyed repetition, exactly like the bingo grid), with a
  `row-set` for the ones played and a `row-pick` for the one on air. The case board's rows are its
  CASES, with two `row-set` fields moved by one press carrying a two-entry `add` (legal: the shape
  gate iterates the map and refuses only one KEY on two roads).
- **The bracket is not a two-key graphic either.** Its own fixture names fifteen slots `Team
  1`..`Team 8`, `Semi 1`..`Semi 4`, `Final 1`, `Final 2`, `Champion` - a flat key space in three
  role families. The "fixed sub-shape" a match holds is two sibling roles, which is what the
  survey's `strike.1` / `.2` / `.3` already are.
- **The real blocker is that a value the runtime WRITES is not a FIELD**, so the lookup cannot
  chain past one of its three rounds. Five mechanisms, each verified in the code rather than taken
  from the reviewers: `RecipeRole.kind` is exactly field or layer and only layers are stamped;
  every derivation reads `getElementById(fN)` while a write lands in `textContent` on an artwork
  layer; `recipeBindingGaps` refuses one layer picked for two things; `naming.ts` keys `roleOf` by
  layer id so a layer takes one role; and an empty write is deliberately skipped, so a Reset
  cannot clear a slot the lookup filled.
- **So the next design question is whether a DERIVED value can BE a field.** Named, not answered -
  it touches `docs/OGRAF_STATE_IN_FIELDS.md` and deserves its own pass. Recorded in the rule store
  as `behaviours/value-write-rule-paints-field-lands`.
- §13 also records what a second row set WOULD cost if the Jeopardy category axis is ever wanted:
  nearly nothing below the declaration (the stored table's `rows` is already a map keyed by row
  role, and the runtime resolves a set by name with keys as opaque strings), and a naming problem
  above it (`rowTokenOf` reads a key only when exactly ONE token is a letter or a whole number, so
  `Category 2 Value 400` binds to nothing and every cell is a hand-filled picker).

### `static:` on a layer name - text that is drawing

The opposite of `f:`: a text layer named `static:Rank 10` is offered UNTICKED with its words left
as drawn (`stripFieldPrefix`, `SvgTextCandidate.drawing`, `on: !c.drawing` in `CreationWizard`).
The row is still offered rather than hidden, because a bare figure on a scorebug really is the
field. `docs/SVG_AUTHORING.md` §3 teaches it. The top ten show fixture uses it, so its entries box
is `f1` rather than `f11` and the stepped-list walk moved with it. Closes
`docs/backlog/decorative-numerals-arrive-as-fields.md` (its first direction; the bulk-untick half
is deliberately not built, because it guesses).

### A slot named after its own words keeps its name

`candidateName` now climbs past an own-copy name only where the group it reaches holds THAT ONE
text layer - which is the Figma shape, a wrapper per slot. A group of several cannot be the name
of one of them, so the bracket's `Champion` keeps its name. With nothing named above it at all,
the layer's own words are used rather than "Text 7". The mapping step says
*named after its own text, so the group's name was used* on the rows where it climbed. Closes
`docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md`.

I scanned every SVG fixture in the repo against the new rule before writing it: the blast radius
is exactly two files - the Figma corpus board still reads `Answer A`..`Answer D`, and the bracket's
`Champion` stops arriving as `Words`. Nothing else in the corpus has a text layer whose name is
its own content.

## What `/check` found

Review and simplify both ran INLINE (each skill returned instructions rather than a delegated
result), and review found one real defect in this branch's own code: the name climb weighed
candidate ROWS, but one `<text>` can raise several rows - two labels far apart on one baseline
are two fields - so a Figma wrapper holding one KERNED text layer read as a group of several,
refused the climb, and labelled both boxes after the text's own words. That is the exact defect
the climb exists to prevent, reintroduced by kerning. It now counts text LAYERS, and
`e2e/import-svg.spec.ts` pins it.

Then `main` arrived carrying the contract migration, and **the clean merge was wrong**: both
sides regenerate `contracts/index.md` and `src/templates/AGENTS.md`, git merged them without a
conflict, and forty-five lines of main's new rules vanished from the generated files. A
recompile put all 350 rules back. Worth remembering the next time a branch and `main` both touch
a generated file: `git merge` reporting no conflict says nothing about whether the result is
what the generator would write.

## What the affected plan said, and what is still open

`j-0731` (`e2e-affected --focus`) waited most of the session for a slot - free memory fell from
3.2 GB to about 1 GB and the queue's budget reached `0/0`, because another session was running
Playwright in the primary checkout, the machine's one browser slot, held outside the queue.
(`npm run reclaim` frees 0 MB net here; its only heavy target is the desktop app the owner keeps
open, which was left alone.) It then ran, and it earned the wait:

- the stepped-list walk **passed** on the `static:` fixture, so the numerals stay drawing and the
  entries box really is `f1`;
- the own-copy naming case and the kerned-wrapper regression **passed**;
- the `static:` case **failed**, and the feature was right while the test was wrong: the emitted
  template is Prettier-printed, so a `<text>` with several attributes has its words on their own
  line and `toContain('>10.</text>')` could never match. The captured HTML showed exactly what was
  wanted - `f0:Item` the only field, the numeral still drawn as `static:Rank` - so the assertion
  was rewritten to match across the line breaks and re-checked against that captured HTML.

**Still not run:** `j-0737` (`e2e-affected --integration`), the plan that covers BOTH sides after
`main` came in, is queued and RAM-blocked. The rest of `j-0731` had not finished either. So
**CI is the gate for this branch**, which is where the pre-merge gate belongs anyway.

## Traps that exist in no repo file

- **Bash `/tmp` and Python `/tmp` are different directories on this machine.** A heredoc that
  writes `/tmp/x` from bash and reads it from python gets `FileNotFoundError`: bash resolves it
  inside its own MSYS root, python resolves it as `C:\tmp`. Use the session scratchpad with a full
  Windows path when handing a file between the two.
- **A `Monitor` grep over a build log needs anchored patterns.** `problems \(` and `refused:` both
  match node-test NAMES in this repo's own suite ("...are both problems", "parseArgs ... refuses
  a too-fast interval"), so a loose filter fires minutes before the build is anywhere near done.
  Anchor on `^\[write-version\]` and `error TS[0-9]`.
- **Two `npm run build` runs must never overlap**: both write `dist/`, and the second one's
  version stamp is what you end up reading.

## Where to look next

The Jeopardy board and the case board can now be written as ordinary one-row-set recipes - the
shapes are in §13, and neither needs anything that does not exist. The bracket waits on the
derived-value-as-a-field question, which is the one worth designing before another show graphic
asks for a lookup.
