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

## Group 2: Winner card and Award reveal

Base: `main` at `45fd2420091e422f1f07ace248579817a05bb3d9`. Row class: Ordinary by the traps
table (templates, inventories, tests and docs only; no state rule, no Risky path): `/check` and
the automated PR review, no `/so`.

### What was built

- Templates (studio, games package): Winner card (a centred card, confetti) and Award reveal (a
  lower third with a category tag, stars), each sealed, revealed and celebrating, with alt text.
  The reveal recipe as it is, and the celebration a `show:Celebration` switch beside it.
  Coverage: `winner-card` and `award-reveal` covered (71 of 101 rows).
- Dropped after review: a celebration role and group on the reveal recipe (it could show over a
  sealed card, was machine state a controller could not see or set, and would have captured
  visible confetti in old artwork on reimport).

### AC-3

The `reveal` batch of `e2e/svg-templates.spec.ts` imports each template (reveal detected, the
switch offered by its `show:` name), types the winner, and checks: sealed under the cover; Reveal
shows the winner and hides the cover; Hide Celebration greyed until Show Celebration raises it,
Show greyed while it is up, Hide puts it away and the winner stays. The frame is checked clean
revealed and celebrating.

### AC-7

In the every-target case ("... Alert level and Winner card: ... the reveal play in every export
target"), the revealed text reads the typed winner in every target:

| Target | Mode | Result |
| --- | --- | --- |
| SPX, CasparCG, H2R | update, play; Continue (`next`) reveals; the celebration by data (its field on, then off) | sealed, revealed, celebrating, away |
| HTML overlay | autoplay with baked data | sealed |
| OGraf, LiveOS | real time: load, playAction, custom action `reveal`, then updateAction with the field on | sealed, revealed, celebrating |

### AC-9

No recipe, runtime, proposal word or persisted key changed, so graphics made before keep
building and playing exactly as they did; no pin moved.

## Group 3: Q&A card and Nominee reveal

Row class: Ordinary (templates, inventories, tests and docs; no state rule, no Risky path):
`/check` and the automated PR review, no `/so`.

- Templates: Q&A card (audience) and Nominee reveal (games), sealed and revealed, the nominee
  reveal also with its suspense ring, each state with alt text. Coverage: `qa-card` and
  `nominee-reveal` covered (73 of 101 rows).
- AC-3: the `reveal` batch imports both (reveal detected, the switch offered by its `show:`
  name), checks sealed and Reveal, and walks every drawn `show:` switch (Show, Hide, each greyed
  where it cannot act), with the frame clean on air.
- AC-7: the mechanisms are the reveal and the `show:` switch, both proven in every export target
  by group 2's case (the Winner card); nothing new to export.
- AC-9: no recipe, runtime, proposal word or persisted key changed.
- Labels: the press reads Reveal, not the built-in Q&A card's Show answer (a recipe's press has
  one label; changing it would move every saved reveal's control).

## Group 4: Scorebug, Match status, Match board, Esports score, Transition, Match event

Group 4 on its own is Ordinary (templates, inventories, tests and docs). It lands in one PR with
group 5, whose recipe changes make the PR not Ordinary: the PR has a final `/so`.

### What was built

- Templates (studio): Scorebug, Match status, Match board, Esports score (games) on the score
  recipe; Transition (titles) and Match event (games) on the Pop-up alert, chosen by the author.
  Each has a default preview and, where it has them, named states with alt text. Library 81
  templates; coverage 79 of 101 rows.
- Mechanisms, all existing: the score recipe's +1, -1, flash and Full time; a `choice:` beside
  the score for the period (Scorebug: First, Interval, Second) or the status (Match status: Live,
  Break, Ended), each drawn with its starting option visible; a count-up match clock beside the
  score (the clock instance, `CLOCKS.md`); plain fields for the period breakdown, format and map;
  the Pop-up alert's hold, self-clear and Next for the cover and the event card.

### AC-3

The `score` and `alert` batches of `e2e/svg-templates.spec.ts` import each template. Recognition:
score automatic, the choice offered by name (one box per option), the clock's direction and the
Pop-up alert by author choice (README). Controls asserted:

| Template | Controls asserted |
| --- | --- |
| Scorebug | +1 per team with its Goal flash, -1, the score from one digit to three in its plate, New game, Full time; Period starts on First, Interval and Second show alone, each greyed while it shows, an empty or unknown value shows First; the clock counts up from Start, holds on Pause, Reset returns to 0:00 |
| Match status | as the score; Status starts on Live, Break and Ended; Detail retyped reaches the output |
| Match board | as the score; Full time; each of the eight quarter figures and the Title retyped reaches the output |
| Esports score | as the score; Full time shows Series over; Format and Map retyped reach the output |
| Transition, Match event | Take shows it; Next clears it; taken again, it clears itself after the hold |

The browser walk now runs each drawn `choice:` beside any full recipe and a `Clock` beside one,
so a later template with either needs no new test code. One visual family: the same renderer
made the new previews (it reproduces an existing preview pixel for pixel), and
`scripts/check-example-layers.mjs` passes on every file.

### AC-7

In the every-target case ("... Winner card and Scorebug: ... a choice beside the score play in
every export target"): the Scorebug's package starts on First and Interval sent as data shows
alone.

| Target | Mode | Result |
| --- | --- | --- |
| SPX, CasparCG, H2R | update, play | First; Interval by data |
| HTML overlay | autoplay with baked data | First |
| OGraf, LiveOS | real time: load, playAction, updateAction | First; Interval by data |

The score recipe, the clock and the Pop-up alert export as before this plan (navy Scoreboard,
Score and clock and Pop-up alert templates); nothing in them changed.

### AC-9

No recipe, runtime, proposal word or persisted key changed, so graphics made before keep building
and playing exactly as they did; no pin moved.

## Group 5: Verdict card, Matchup, Podium score, Chat highlight, Timing tower, Map round, Head to head, Player card, Bracket, Fixtures, Agenda

Same PR as group 4. Row class: not Ordinary (two recipes' machines and controls change), not
Risky (no ownership, target, retry, recovery or writer rule; no persisted key, field, kind or
rule word added). Rules C1 to C3 (phase notes) were written after coding, so the final `/so`
challenges them.

### What was built

- Recipe extensions: **Clear** on a choice that starts empty (C1) and **Hold on air**, an
  option of the Pop-up alert (C2). Neither adds a word to `READS_ADDED`: both are machine arrows
  and buttons over fields and states the runtime already reads.
- Templates (studio): Verdict card (titles), Matchup, Podium score, Timing tower, Map round, Head
  to head, Player card, Bracket, Fixtures (games), Chat highlight (audience), Agenda (titles), each
  with a default preview and its named states with alt text. Library 92 templates; coverage 90 of
  101 rows.

### AC-3

Batches of `e2e/svg-templates.spec.ts` by route; the walk of a choice now also presses Clear on a
choice that starts empty (the field back to its empty value), then shows an option by data alone
and clears it with Clear, so the Live bug is held to C1 too.

| Template | Recognition | Controls asserted |
| --- | --- | --- |
| Verdict card, Matchup | automatic (`choice:`) | starts empty; each option shows alone and is greyed while it shows; Clear empties it, also after an option shown by data alone |
| Timing tower | automatic (`choice:Focus/P1..P5`) | as above for the focus; Session, cars and gaps are fields that stay in place |
| Map round | automatic (`choice:Phase`, Veto drawn visible) | starts on Veto, never empty; Picked and Live; an empty or unknown value shows Veto |
| Podium score | automatic (score, the Spotlight choice offered by name) | +1 with its flash per podium, -1, sizes to 100, New game; Spotlight Left, Middle, Right; Clear |
| Chat highlight | Pop-up alert and Hold on air ticked by the author (README) | Hold on air greys itself and keeps it up past the eight seconds; Take it off (`dismiss`) clears it; taken again, Next clears it and the self-clear still works; without the box no Hold button (Transition, Match event) |
| Head to head, Bracket, Fixtures, Agenda | automatic (plain) | every named text is a field; the first retyped long fits |
| Player card | automatic (plain, `f:Photo`) | as plain; a sent picture replaces the placeholder and an empty value restores it |

### AC-7

"Verdict card and Chat highlight: Clear and Hold on air play in every export target":

| Target | Mode | Verdict (Clear) | Chat highlight (Hold on air) |
| --- | --- | --- | --- |
| SPX, CasparCG, H2R | update, play; operator events through NoaCG's control channel (`noacgDispatch`, what the Control panel sends) | False shows alone; the empty value clears it | SPX unheld clears itself after eight seconds; CasparCG and H2R held stay up past them, then Take it off (`dismiss`) clears them |
| HTML overlay | autoplay with baked data | False shows alone | no control channel: it clears itself |
| OGraf, LiveOS | real time: load, playAction, updateAction, custom actions `hold` and `dismiss` | as SPX | OGraf unheld clears itself; LiveOS held stays up, then `dismiss` clears it |

### AC-9

- A saved graphic keeps its machine, table and runtime (TL2 C7), so a choice or alert saved
  before has no Clear or Hold until reimported (C3). No field, kind, fact, rule key or persisted
  key is added, so field ids and cue values are unchanged on reimport, and no pin moved.
- `scripts/behaviour-reads.test.mjs`: Clear's edges and button on an empty choice, none on a
  started one, an option named Clear keeps its own button; the alert without Hold is the machine
  it was, with Hold a pose-only `held` state and no timer out of it; both tables read `ok`.

### Final review

- Final `/so` on 387aff5 (fresh read-only cloud session): grade A, AGREE WITH CORRECTIONS. Taken:
  finding 1, the Hold export case passed even if the self-clear never started in a host and never
  pressed Take it off; it now plays one unheld package of each kind (SPX, OGraf, the overlay),
  which clear themselves, and holds the others, which stay up and then clear on `dismiss`. Not
  changed: Clear and Take it off are English labels, as every recipe's buttons are (finding 2);
  Hold pressed during the entrance is untested, as in the built-in chat highlight (finding 3).

### Downloads check (group 4 and 5 PR, fb435bc)

`e2e/downloads.spec.ts`, the Template Library page check, now decodes its previews one at a
time. CI rejected one decode twice ("The source image cannot be decoded") once the page reached
151 previews, though every PNG decodes on its own and the case passed locally. Every preview
must still decode and none may have zero width; the final `/so` on fb435bc judged it no weaker.

## Group 6: Standings with focus

Its own PR, on `main` after #2708. Row class: Ordinary (a template, its previews, README rows
and a browser walk for the ranking route; no recipe, runtime, proposal word or persisted key
changed).

Not in this PR (left for a later builder, each a saved-state change, so Risky with a Rules-first
`/so`): milestone track tiers and quiz show 2, 3 or 4 answers. Each needs a runtime fact (a tier
reached from the Milestones lines; an answer row that has text) and a new per-row layer in the
saved binding (a tier row set on the goal meter, which adds a row count to its import step; a
row layer in the quiz's `DesignSvgQuizRow`). Tried here and refused: a quiz's third and fourth
rows inside `show:` switches, because the reader never offers a text inside a hidden layer, so
Answer C would not be a field.

### What was built

- Template (studio, games): Standings with focus, `standings-focus.svg`, on the ranking recipe
  (`Name n`, `Points n`, `Position n`, `Row n` plates) with two choices beside it: Status
  (Provisional drawn visible, the start; Final) and Focus (First to Fourth, all hidden, so it
  has Clear). The focus frames a place, not a team: the frames are not row plates, so they stay
  in their slots while the rows re-sort. Default preview plus Final and Focus on second place,
  with alt text. Library 91 templates (`library.json`; group 5's "92" counted two too many); coverage still 90 of 101 rows (the standings row moves
  its proof to this template; the navy Standings stays the ranking recipe's proof).
- Option names are one word each (group 4 trap). The drawn status words are PROVISIONAL and FINAL.

### AC-3

`e2e/svg-templates.spec.ts` gains a ranking batch ("ranking: Standings with focus: ..."):

| Template | Recognition | Controls asserted |
| --- | --- | --- |
| Standings with focus | automatic (ranking proposed; Status and Focus offered by name) | every named text but `Position n` is a field; Points 4 typed to 99 moves that row into first place and the old leader down, while the position numbers stay 1 to 4 in their slots; a long Title stays clear of the Status tag; +1 under the first team adds a point; Reset points sets every row to 0 and every slot reads 1 (a tie); Status starts on Provisional, never empty, Final shows alone, an empty or unknown value shows Provisional; Focus starts empty, each place is framed alone and greyed while it shows, Clear takes it away, also after a focus sent as data |

Local run on the final code: 1 passed (8.2 s). One visual family: the previews come from the same renderer
(960 by 540, `#7B8494`, Manrope), which reproduces `timing-tower.png` and
`timing-tower-2-focus.png` pixel for pixel; `scripts/check-example-layers.mjs` passes on every
file. README.pdf reprinted: the "Picks, focus and boards" page is now two pages (13 in all).

### AC-7

No new mechanism: the ranking recipe exports as before (navy Standings), and the choice with a
start and the choice with Clear are the ones proven in every target by group 1 (Alert level)
and group 5 (Verdict card).

### AC-9

No recipe, runtime, proposal word or persisted key changed; no pin moved. The navy
`standings.svg` and its old addresses are unchanged.
