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

OGraf non-real time does not seek the rotation: its turns are machine timers, which a seek does
not replay; seek parity for imported designs other than the countdown stays issue #2699.

Final `/so` on 54677f1 (session_017SdbwQrr6NMWLgiDCivVBm): grade A, AGREE, nothing blocking. Its
two test nits are taken in group 2's PR: the walk now checks the slide stays up under the exit
(T4's first half) and holds before checking the picture, so a slow machine cannot reach the timer
first; this paragraph states the OGraf non-real-time limit.

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

## Group 2: Crawl (ticker crawl, end-credits crawl) and Word cloud

Row class: Risky (new runtime words). Rules K1 to K7, W1 to W5 and G1, G2 were written before
any code and challenged by a Rules-first `/so` (session_017SdbwMK6JqdV6rzz3BUmxx on 9a2735c, B+,
AGREE WITH CORRECTIONS); its corrections (K3, K8, W2, W3, W6, G1, G2) are in the phase notes and
were made before the code. Its finding on the notification queue went to the coordinator: the
queue has no caller in the app or any export target (it is the inbox the phase line reserves), so
the event-notification row stays planned.

Its read-only look at 20e3034 (#2710, after that PR's last delta): "Plain `Row A` layers no
longer count as quiz answer rows, so existing quiz artwork imports as before. No defect."

### What was built

- **The crawl rule** (`behaviourRuntime.ts`, `CrawlRule` in `behaviourData.ts`): the `crawl` layer
  prints the `lines` kind's `joined` run, repeated to fill the window with one copy before its start, and travels right to left at 140 artwork units
  a second per 1920 of frame width, times the motion speed, times Scroll speed (%) clamped to 10
  to 400. It moves inside a group clipped to its window (a `Crawl box` layer, else the fit's
  panel, else the frame), measured once at rest. A new run keeps its offset; a new speed re-times
  the tween; the take (`noacgCrawlRestart`, the recipe's entrance call) starts it from where it
  was drawn; an empty list puts the drawn text back, still.
- **The word sizes** (`word-counts` kind, the write rule's `size`): slot n takes line n; its weight
  is the built-in word cloud's square-root scale over the lines that fill a slot; the word is drawn
  at 0.5 + 0.5 x weight of its drawn size, measured off the drawn sample at rest, then no wider
  than that sample, never below 0.3 of the size (then reported too long on Words). Lines past the
  last slot are left out without a report, as the built-in drops what does not fit.
- `READS_ADDED`: two entries (TL6 crawl: rule keys `crawl`, `speed`, `window`, kind `lines` with
  `joined`; TL6 word cloud: rule key `size`, kind `word-counts`). Editing guards treat a crawl
  layer like a readout (`publicTextDefaults`, `artworkEdits`), and its geometry is claimed
  (`recipeClaims`).
- Templates: Ticker crawl and End credits crawl (studio, Crawl), Word cloud (studio, Word cloud,
  contract `word-cloud-target`), and the navy examples Crawl and Word cloud, navy. README section
  "Crawls and a word cloud" on its own page; README.pdf 15 pages.

### AC-3

| Template | Recognition | Controls asserted |
| --- | --- | --- |
| Ticker crawl, End credits crawl | automatic (`Crawl`, `Crawl box`) | Items fill one run, repeated to fill the window; the layer sits in a clipped group; it travels right to left; Scroll speed 200 more than half again as fast; a longer list keeps moving from where it was; the frame clean while it crawls; an empty list stands still |
| Word cloud | automatic (`Word n`) | three staged words fill slots 1 to 3, the rest hide; Pizza (9) drawn more than 1.4 times Sushi (2), Tacos between; Extraordinarily in slot 1 keeps the frame clean; an empty list hides every slot |
| Crawl, Word cloud, navy | automatic | the run travels; two staged words fill two slots, the third hides |

Cases: the `crawl` and `wordcloud` batches of `e2e/svg-templates.spec.ts`, and the navy batch of
`e2e/svg-examples.spec.ts`. One visual family: same renderer for the five new previews, the word
cloud's Fewer words state drawn with three words at their weighted sizes.

### AC-4, Word cloud

`e2e/production-audience.spec.ts` "a saved Word cloud template is offered in the Word cloud
picker, and staging fills one cue whose words it draws": the template, imported unchanged and
saved, is offered in the saved group before the built-ins and picked by keyboard; staging adds
one cue on it with the question and the three shown words; a second stage of the same round
updates that cue (one cue on the copy, no blank seed); taken, the words fill slots 1 to 3, the
most-sent larger, slots 4 and 12 hidden, the question on air.

### AC-7

"Ticker crawl and Word cloud: the crawl travels and the staged words fill their slots in every
export target".

| Target | Mode | Crawl | Word cloud |
| --- | --- | --- | --- |
| SPX | update, play | the run prints both items and travels; a new Items list as data reaches it | three staged words fill three slots; one word as data leaves one |
| CasparCG | update (JSON), play | same | same |
| H2R | update, play | same | same |
| HTML overlay | autoplay with baked data | the run travels | the baked words |
| OGraf | real time: load, playAction, updateAction | same as SPX | same as SPX |
| LiveOS | real time | same as SPX | same as SPX |

OGraf non-real time does not seek the crawl (a repeating tween, as the built-in marquee's);
#2699.

### AC-9

- Saved graphics keep their own runtime and table (TL2 C7); a table asking for a crawl or a size
  under a runtime without them is refused at export, upgradable by importing again
  (`behaviour-reads` drift and C5 cases pass with the two entries).
- Every existing recipe compiles to the table it did: the corpus records moved only by the
  runtime's text (`emit.js` of seven files, and two `appearance.js` pins in `jev-svg-baseline`,
  re-recorded by hand). The text kind's code is unchanged.
- Reimport: the recipes' owned fields come after the artwork's, so a reimport keeps every matched
  field id; nothing in the order of existing graphics' fields moves.
- Recognition: of the repository's SVG files only the five new templates carry `Crawl`,
  `Marquee` or `Word n` names.

### Verification

- Browser (job queue, this cloud worker): `svg-templates`, `svg-examples` and
  `import-svg-behaviour` whole, 87 passed (j-0015, 8.2 min); then the rotation batch, the crawl
  and word cloud export case and the Word cloud picker journey, 3 passed (j-0016). Mutation: with
  the crawl forced to restart on a new list, the walk's "a new list keeps moving from where it is"
  fails (j-0014), and passes without it.
- Node: `behaviour-reads` (22), `rotation-slides`, `template-coverage` (104 rows, 102 covered),
  `svg-files`, `concept-names`, `check-svg-example-coverage` (25 example sets, 20 behaviours),
  `check-example-layers`, `behaviour-look`, `behaviour-keys`, `behaviour-removed-layer`,
  `jev-svg-contract`, `jev-svg-baseline` (two `appearance.js` re-recorded),
  `imported-credits-model` (eight credits build pins re-recorded: those builds carry the runtime;
  plain imports did not move), `svg-figure-fit`: pass. `svg-import-passes`: seven `emit.js`
  re-recorded; then only the four environment records that fail the same way on `origin/main`.
  `npm run gates -- run --changed origin/main`: pass.
- `tsc`, `eslint` on the changed files, `check-e2e-protection --changed origin/main`
  (`svg-templates` 30 -> 36, `svg-examples` 6 -> 7, `production-audience` 32 -> 33): pass.
  README.pdf reprinted (15 pages).
- `/check` review (delegated, high), ten findings, all fixed: the loop now lays one copy before
  the start and enough after it to cover the window, so it has no seam at any length; an unstaged
  word cloud seeds equal counts (drawn sizes) and keeps slots aligned; sizes and the crawl measured
  in a loading face are used, not kept, and measured again when fonts settle, and the readout's
  anchor is measured at the drawn size; the window is measured again once nothing above it is
  tweening; a frame without a viewBox uses its width and height; a line with a count and no word
  is skipped; the air check reads only the runtime's own crawl clips; the K3 check now fails a
  restart (mutation-tested); Scroll speed as data is proven in every export target; a sized
  readout claims its geometry. Simplify and verify inline.
