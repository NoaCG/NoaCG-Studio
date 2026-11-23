# Phase TL6 evidence: new runtime kinds

Base: `main` at `62dc34aa28ba33af9f938f10d42497180776a7fa`. Acceptance for this phase, verbatim:

- "AC-3: Every template imports with its recipe or contract detected, or, where recorded as author choice, works after that documented choice; controls work; one visual family; a default preview plus named operator-visible states with descriptive alt text."
- "AC-4: Join card, Vote results, Message and Word cloud templates, imported unchanged and saved, appear in their picker; choosing one stages a working cue without duplicate or blank cues (QR encodes the current link; results show row counts, open and closed status, reveal, and a repeated stage of the same round updates one cue; message shows body and name)."
- "AC-7: Each mechanism plays in every export target with its supported modes recorded."
- "AC-9: Graphics and exports made before this plan keep working; reimport keeps field ids and cue values."

TL6 lands as several PRs, each adding its group here. The phase notes in the spec carry the rules.

## Group 1: Rotation (ticker rotate, sponsor rotation, two-language notice) and Question queue

Row class: not Ordinary (a new recipe's machine and one compiler rule), not Risky (no runtime
word, no persisted key, no ownership or recovery rule). Rules T1 to T5 are in the phase notes.

### What was built

- **The Rotation recipe** (`src/templates/behaviours/rotation.ts`, words.json `rotation`): two to
  eight `Slide n` groups. Its machine is the built-in rotations' shape on main-path branches: one
  counting state per slide with a six-second timer to the next (the last to the first), one held
  twin per slide with no timer, Hold, Resume and Next slide. Its paint is one look rule per slide,
  naming the entrance waypoint for slide 1. No runtime word: `READS_ADDED` is unchanged.
- **A slide covers its own fields** (`RecipeRole.rowFields`, `rowFieldOwners` and
  `rowFieldTargets` in `behaviour.ts`): a set of texts or pictures in the Text layer named for
  slide 1 and another slide (`Story 1`, `Story 2`; `f:Sponsor 1`, `f:Sponsor 2`) stays operator
  fields, each wrapped in a group stamped with its slide's look. A lone number is not a set: the
  importer's second copy of a repeated name (`Kicker 2`) and an unnamed layer (`Text 3`) stay on
  air throughout. A run inside a text wraps its whole text (no `<g>` inside text), and a picture
  painted through a pattern (Figma) wraps the shapes the pattern paints. The look hides the
  wrapper, never the field: the fit reads a field as laid out by its parent's box, so a field
  hidden by its own class was fitted at zero width and aired unfitted (found by the browser walk:
  a long headline typed while its slide was hidden overflowed the card when the slide came round).
- **Templates** (studio): Rotating ticker, Sponsor rotation, Two-language notice (Rotation), and
  Question queue (the Lineup recipe as it is). Each has a default preview and named states with
  alt text; README section "Slides that take turns, and a question queue"; README.pdf reprinted.
- Coverage: a new `rotation` recipe row (the registry gained a recipe); `sponsor-rotator`,
  `public-notice` and `question-queue` covered. 102 rows, 96 covered.

Decisions:

- The sponsor rotator's planned "image writes" is not needed: each partner is an `f:` picture
  slot, a field like any picture slot, shown with its slide.
- Question queue uses the Lineup unchanged, so its presses read Next guest and Previous guest.
  The layer names stay the Lineup's (`Guest 1`); a `Question` word would be read as the quiz's,
  vote's and survey's question.
- Slides are drawn visible and stacked, and their texts overlap in the source file. Illustrator's
  Save a Copy writes a hidden layer as `display:none`, and a text in a hidden layer is never a
  field, so the README asks the designer to hide the others only while editing one slide.
- Next slide is its own event (`skip`, the built-ins' word), not the default path's Next: a
  host's Continue keeps the graphic's own lifecycle, as the built-in rotations do.

### AC-3

| Template | Recognition | Controls asserted |
| --- | --- | --- |
| Rotating ticker | automatic (`Slide n`) | slide 1 and Story 1 only at the take; Next slide shows slide 2 and its story; Hold greys Hold and keeps it; Next slide while held moves on held; Resume moves on and counts; a long Story 1 fits when its slide shows; Out and a take start at slide 1 |
| Sponsor rotation | automatic | the same, each `f:Sponsor n` picture showing with its slide |
| Two-language notice | automatic | the same with two slides; a long Headline 1 typed while slide 1 is hidden fits when it shows |
| Question queue | automatic (Lineup, `Guest n`) | Next guest lights row 1, then row 2 with row 1 done; Previous guest; the row 4 button; Next greyed on the last row; Nobody on clears; a long question fits its row |

Case: the `rotation` and `lineup` batches of `e2e/svg-templates.spec.ts` ("<route>: <names>:
each template imports, keeps every named text, runs its controls and stays clean on air").
One visual family: the four previews were drawn by one renderer at 960 by 540 on `#7B8494` in
Manrope, slide states with only that slide's group and fields shown; `check-example-layers`
passes on all 97 files.

### AC-7

"Rotating ticker and Question queue: the slides take turns, Hold keeps one, and the questions
move, in every export target".

| Target | Mode | Rotation | Question queue |
| --- | --- | --- | --- |
| SPX | play, custom events | slide 1 at the take, slide 2 after six seconds by its own timer; Hold keeps slide 2 past the next six seconds; Resume shows slide 3 | On now 2 as data: question 2 on, question 1 done; On now 1 as data moves it back |
| CasparCG | play, custom events (JSON) | same | same |
| H2R | play, custom events | same | same |
| HTML overlay | autoplay | the timer rotates; no event channel, so no Hold | the baked On now only |
| OGraf | real time: load, playAction, customAction, updateAction | same as SPX | same as SPX |
| LiveOS | real time | same as SPX | same as SPX |

OGraf non-real time: the rotation's timer is the machine's, and seek parity for imported designs
other than the countdown stays issue #2699.

### AC-9

- No runtime word, persisted key or existing recipe changed: every other recipe compiles to the
  table, words and bytes it did, and saved graphics keep their own runtime and table (TL2 C7).
- The compiler rule applies only to a role declaring `rowFields`, which only the new recipe does.
- Recognition: of the 261 SVG files in the repository only the three new templates carry a slide
  name (`Slide`, `Dia`, `Folie`, `Diapositiva` with a number), so no existing file's proposal
  changes.

### Verification

- Browser (job queue, this cloud worker): `svg-templates` and `svg-examples` whole, 39 passed
  (j-0007, 6.2 min); after the review fixes, the rotation batch, the navy batch with Rotation and
  the export case, 3 passed (j-0008). The lineup batch passed in j-0001.
- Node: `rotation-slides` (3, new), `behaviour-reads` (22), `svg-files`, `template-coverage`,
  `concept-names`, `check-svg-example-coverage`, `check-example-layers`, `behaviour-look`,
  `behaviour-keys`, `behaviour-removed-layer`, `deploy-affecting-paths`, `e2e-affected`,
  `jev-svg-baseline`, `jev-svg-contract`, `imported-credits-model`, `svg-figure-fit`,
  `illustrator-exports`: pass. `svg-import-passes`: the four records (inventory, bind, emit,
  runtime) that fail identically on an untouched `origin/main` worktree on this machine (TL2
  trap), and nothing else. `npm run gates -- run --changed origin/main`: pass.
- `tsc`, `eslint` on the changed files, `check-e2e-protection --changed origin/main`
  (`svg-templates` 30 -> 33 tests, `svg-examples` 6 -> 6), `e2e-capacity --changed origin/main`
  (standing warnings only): pass. README.pdf reprinted (14 pages).
- `/check` review (delegated, high): eight findings. Fixed: a slide took any field whose title
  ended in its number (now only a set named for slide 1 and another slide, Node-tested); a run
  inside a text was wrapped in a `<g>` SVG does not draw; a Figma pattern picture was wrapped on
  its `<defs>` image; the export case could miss slide 1 on a slow host (hosts now made one at a
  time and each held as it reaches slide 2); `dia` (Portuguese for day) dropped from the slide
  words; no new `blocks/` import. Not changed, with the reason in the code: the machine is
  written out (the catalog rotations keep their item as runtime data). Documented limit: a text
  drawn as outlines and replaced by a placed line is not part of a slide (SVG_AUTHORING).
