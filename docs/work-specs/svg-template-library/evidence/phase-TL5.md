# Phase TL5 evidence: recipe extensions

Base: `main` at `b06197d34fbd9c33e062690a908088128b9e3972`. Acceptance for this phase, verbatim:

- "AC-3: Every template imports with its recipe or contract detected, or, where recorded as author choice, works after that documented choice; controls work; one visual family; a default preview plus named operator-visible states with descriptive alt text."
- "AC-7: Each mechanism plays in every export target with its supported modes recorded."
- "AC-9: Graphics and exports made before this plan keep working; reimport keeps field ids and cue values."
- "AC-10: Pickers are keyboard-operable with distinct accessible names; samples with long translated names and instructions fit; Alert level is readable without colour or flashing."

TL5 lands as several PRs, each grouping related extensions. This file grows with each.

## Group 1: Vote results count, Alert level, Public notice, Poll result

Row class: not Ordinary (a runtime derivation, a recipe's machine and the import's binding), not
Risky (no ownership, target, retry, recovery or writer rule; two additive optional persisted keys,
no key renamed). Rules E1 to E5 (phase notes) were written after coding, so the final `/so`
challenges them.

### What was built

- **Per-option count (owner ruling A, carried from TL1).** The runtime's `share` kind derives
  `count`, the row's own figure from the Options lines (`READS_ADDED`: `derive:share.count`). The
  vote recipe gains a `count` role (`Count 1`, words.json) written from it and shown exactly when
  the share shows. The mapping step offers a Count picker per option row; the poll binding gains
  an optional `count` per row. A board with no count emits the table it emitted before.
- **A choice that starts on an option (Alert level, Public notice).** Where exactly one option of
  a `choice:` set is drawn visible, the import records it as `initial` on the choice, and the
  choice starts there: its field defaults to that option, it has no empty value and no "none"
  state, and every option is a button reachable from every other. All hidden is the empty start
  every choice had. The mapping step lists a visible option beside the hidden ones; the layer
  check allows one visible option per choice.
- **Poll result (poll rows, AC-5).** The poll type consumes typed Question and Options rows, which
  the vote recipe already reads (`Label | figure`); what differs is timing. A Poll result box in
  the import's vote section (`options.figures`) makes `Live figures` default to live, so the typed
  figures show from the take with no press. Author choice, recorded in the library README.
- **Templates** (studio style, in `library.json`, coverage and packages): Vote results with counts
  and Poll result (audience), Alert level and Public notice (titles), each with a default preview
  and, where the template has them, named states with alt text. Library: 69 templates; coverage 69
  of 101 rows.

Design decision: the count readout is a new template, **Vote results with counts**, not an edit
of Vote results. TL3's rule A1 pins every old download address to the bytes it served
(`old-addresses.json`, "never regenerate"); `vote-results.svg` and its pictures are among them,
so editing that file would change what an old address delivers. Both are in the Vote results
picker (contract `vote-results`).

### AC-3

Each case is a step of a route batch in `e2e/svg-templates.spec.ts` ("<route>: <names>: each
template imports, keeps every named text, runs its controls and stays clean on air").

| Template | Recognition | Controls asserted |
| --- | --- | --- |
| Vote results with counts | automatic (vote recipe, `Count n` bound) | as Live vote; after Show result each row prints its own count (3 and 1) with its share; no Count operator field is made; a row the next round leaves out reads 0 |
| Alert level | automatic (`choice:Level/...`, Advisory drawn visible) | starts on Advisory, never empty; the Level field offers exactly the four levels; every level is a button, greyed only while shown; each shows only its look; an empty or unknown level sent as data shows Advisory |
| Public notice | automatic (`choice:Level/...`, Standard drawn visible) | starts on Standard; Urgent shows only the urgent band; Standard returns |
| Poll result | vote recipe detected; Poll result ticked by the author (README) | the typed Question and rows fill the board, figures and bars shown at once with no press; new rows replace them |

### AC-5, Poll result

Its own case, beside TL4's Live vote case and TL1's Vote results case: the Poll result step of
the vote batch ("vote: ..., Poll result: each template imports ...") types the question and three
rows; the percentages are lit at once (62%), the bars stand about 62 to 11, and a second set of
rows replaces the figures (75%, and 0% on a row no longer listed), all with no press. The import
step asserts the box starts unticked (a live vote is the default) and ticks it.

Live bug (all options hidden) runs in the same batch with the generalised step and still starts
empty with a `-` value. One visual family: the previews are made by one renderer (960 by 540,
`#7B8494`, Manrope, the state's groups shown) and `scripts/check-example-layers.mjs` passes on
every file.

### AC-10, Alert level

In the choice batch: for each level, its look holds the level's word as visible text (ADVISORY,
WATCH, WARNING, EMERGENCY), and no node in it carries runtime motion or a CSS animation. Each look
also draws a four-step meter, one to four steps filled, so the level reads without colour.
Pickers and long translated samples are TL1's (unchanged here).

### AC-7

"Vote results with counts and Alert level: the count and the starting level play in every export
target": each package is built from the imported graphic and loaded as its host loads it.

| Target | Mode | Count readout | Starting level |
| --- | --- | --- | --- |
| SPX | update, play | count 3 and 1 with 75% | Advisory with no data; Emergency sent as data shows alone |
| CasparCG | update (JSON), play | same | same |
| H2R | update, play | same | same |
| HTML overlay | autoplay with baked data | same | Advisory (no update channel) |
| OGraf | real time: load, playAction, updateAction | same | same as SPX |
| LiveOS | real time (live-only package) | same | same as SPX |

Poll result in the same case: in every target the typed rows show 75% and 25% at once, from the
`Live figures` default the package was built with. The count shows under Live figures there,
since a host that sends only data reaches no Show result. OGraf non-real time: both are repaints of data the graphic already has, with no motion;
seek parity for imported designs other than the countdown stays issue #2699.

### AC-9

- Saved graphics keep their own runtime and table (TL2, C7). A saved poll binding without `count`
  and a saved choice without `initial` build the bytes they built before: the corpus records move
  only by the runtime text (`emit.js` of ten files, which every runtime change moves) and by the
  vote band's step counting one more empty picker per row (`fillGap`).
- `scripts/behaviour-reads.test.mjs`: the frozen pre-TL2 vote runtime asked for a per-option
  count is still refused, now as upgradable by importing again; a choice with a start compiles to
  a table its own runtime reads; a choice without one is the empty choice it was, with no
  `options` key in its table.
- Field ids and cue values on reimport: nothing in the field order changed (the count is a
  layer, not a field; the choice's field is the one it always was).

### Verification

- Browser (job queue, this cloud worker): `svg-templates`, `import-svg-behaviour`, `import-svg`,
  `svg-examples`, 139 passed and 1 failed (j-0006, 9.8 min); the failure was the unmatched-count
  notice reading 13 boxes for the hand-picked vote (two option rows, each with a Count box now),
  a test expectation this change moves, updated with its reason. After the review fixes, the
  choice and vote batches, the Live vote case, the new export case, the unmatched-count case and
  the switches-and-choice case: 6 passed (j-0007).
- Node: `behaviour-reads` (14), `behaviour-look`, `behaviour-keys`, `behaviour-removed-layer`,
  `check-example-layers` (20, one new case), `template-coverage`, `check-svg-example-coverage`,
  `concept-names`, `svg-files`, `vote-board-bars`, `jev-svg-contract`, `jev-svg-baseline`,
  `imported-credits-model`, `illustrator-exports`, `svg-figure-fit`, `deploy-affecting-paths`,
  `e2e-affected`, `imported-clock-wire`, `behaviour-docs`: pass. `svg-import-passes`: the four
  records (inventory, bind, emit html, runtime) that fail the same way on an untouched `main`
  worktree on this machine (TL2 trap) and nothing else. Pins moved by this change and re-recorded
  only where a re-record on `main` and on this branch differ: ten `emit.js` hashes and the vote
  band's `fillGap`, two `appearance.js` in `jev-svg-baseline`, four credits build pins.
- `tsc`, `eslint` on changed files, `check-copy`, `check-e2e-protection --changed origin/main`
  (svg-templates 19 -> 20 tests), `e2e-capacity --changed origin/main` (standing warnings only):
  pass. README.pdf reprinted (10 pages).
- `/check`: review delegated (high), seven findings. Fixed: the count layers were left as
  operator text fields (now written layers, like the percent); a drawn row a later round leaves
  out kept the last round's count (now 0); the starting option is recorded by its layer, not its
  label; the spec's option parser reads any form of `display: none`; the fill visits the Count
  box in the step's order. Not changed: a live word in the visible starting option becomes a
  field (issue #2700, the templates name it `static:`); the count prints the parsed figure, as
  the share reads it. Simplify inline: the fill's row mapping written out step by step.

### Poll result and the start fix: verification

- Browser: `import-svg`, `import-svg-behaviour` and `svg-templates` whole, 134 passed (j-0010,
  8.0 min); after the review fixes, the vote batch, Live vote, both export cases, 4 passed
  (j-0011). Node: `behaviour-reads` (15, a poll-result case), `concept-names`, `svg-files`,
  `template-coverage`, `check-example-layers`, `check-svg-example-coverage`, `imported-credits-model`,
  `jev-svg-baseline`: pass; `svg-import-passes` only its four environment records.
- `/check` on the delta from 83af9bf (review delegated, high): seven findings. Fixed: the Poll
  result box is offered only where a figure or count is drawn, and unticking it removes the key
  rather than storing false; the pin note names this re-take. Decided and recorded in the phase
  notes: a Poll result staged from Interaction follows the production's Live figures switch, as
  every results board does; data naming no option shows the start while the machine stays put;
  the proposal path has no Poll result intent yet. Pre-existing: an unlisted row keeps its old
  label (#2702).

- Automated PR review on 12f8f7a: one finding, fixed. After a level was sent as data only, the
  machine stayed on the starting option, so its button was greyed and the operator could not
  return to it directly. The starting option is now reachable from itself too; a browser step
  sends another level as data and brings the start back with its button, and each other option
  is greyed while it shows. Choice batch, both export cases and the switches-and-choice case:
  4 passed (j-0013); `behaviour-reads` 15 passed.

### Final review

- Final `/so` on 83af9bf (fresh read-only cloud session): grade A, AGREE WITH CORRECTIONS, nothing
  blocking. Taken: finding 1, a choice with a start went blank when its field held a value naming
  no option (a cue saved before the start, after a reimport); the `row-pick` kind now reads a
  `start` (new READS word) and such a value shows the start, with a Node case and a browser step;
  nit 3, the offered-layer list is renamed for what it holds. Finding 2 is issue #2700.
- Final `/so` on 12f8f7a (fresh read-only cloud session, after Poll result was added): grade A,
  AGREE WITH CORRECTIONS, nothing blocking. Taken: E3 now says an old choice whose artwork
  always had one option visible also gains the start on reimport (an empty cue then shows it);
  the `proposeExtras` comment says every prefixed group, visible ones included.
- CI on 83af9bf: `Factory gates` failed only on pins recorded one runtime edit before that head
  (the review's count fix); the pins are re-recorded on the final runtime.

## Group 2: the reveal's celebration (Winner card, Award reveal)

Base: `main` at `45fd2420091e422f1f07ace248579817a05bb3d9`. Row class: not Ordinary (a recipe's
machine), not Risky (no Risky path, no persisted key changed or added beyond the binding's layer
map). Rules R1 and R2 (phase notes) were written after coding.

### What was built

- The reveal recipe gains an optional drawn `Celebration` (words.json). Where it is bound, a
  parallel group `celebration` (calm, on) adds Celebrate and Settle; the look shows while the
  group is on. Nothing is added to the runtime.
- Templates (studio, games package): Winner card (a centred card, confetti) and Award reveal (a
  lower third with a category tag, stars), each sealed, revealed and celebrating, with alt text.
  Coverage: `winner-card` and `award-reveal` covered (71 of 101 rows).

### AC-3

The `reveal` batch of `e2e/svg-templates.spec.ts` imports each template (reveal recipe detected),
types the winner in The reveal, and checks: sealed under the cover, Settle greyed; Reveal shows
the winner and hides the cover; Celebrate shows the celebration and greys itself; Settle puts it
away and the winner stays. The frame is checked clean when revealed and when celebrating.

### AC-7

In the every-target case ("... and Winner card: ... the celebration play in every export target"):

| Target | Mode | Result |
| --- | --- | --- |
| SPX, CasparCG, H2R | update, play; Continue (`next`) reveals; Celebrate and Settle by invoking the graphic's own `noacgDispatch` (CasparCG INVOKE) | sealed, revealed, celebrating, settled |
| HTML overlay | autoplay with baked data, no control channel | sealed |
| OGraf, LiveOS | real time: load, playAction, custom actions `reveal`, `celebrate`, `settle` | sealed, revealed, celebrating, settled |

SPX has no button field for a machine event; its operator reaches the reveal by Continue, and the
celebration only where the host can call a template function (recorded as the supported mode).

### AC-9

`scripts/behaviour-reads.test.mjs`: a reveal without a celebration has its one control and no
parallel group; with one, the walk is the same and the table asks the runtime for nothing new.
No corpus or build pin moved.
