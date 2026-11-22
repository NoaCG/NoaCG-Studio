# Phase TL5 evidence: recipe extensions

Base: `main` at `b06197d34fbd9c33e062690a908088128b9e3972`. Acceptance for this phase, verbatim:

- "AC-3: Every template imports with its recipe or contract detected, or, where recorded as author choice, works after that documented choice; controls work; one visual family; a default preview plus named operator-visible states with descriptive alt text."
- "AC-7: Each mechanism plays in every export target with its supported modes recorded."
- "AC-9: Graphics and exports made before this plan keep working; reimport keeps field ids and cue values."
- "AC-10: Pickers are keyboard-operable with distinct accessible names; samples with long translated names and instructions fit; Alert level is readable without colour or flashing."

TL5 lands as several PRs, each grouping related extensions. This file grows with each.

## Group 1: Vote results count, Alert level, Public notice

Row class: not Ordinary (a runtime derivation, a recipe's machine and the import's binding), not
Risky (no ownership, target, retry, recovery or writer rule; two additive optional persisted keys,
no key renamed). Rules E1 to E4 (phase notes) were written after coding, so the final `/so`
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
- **Templates** (studio style, in `library.json`, coverage and packages): Vote results with counts
  (audience), Alert level and Public notice (titles), each with a default preview and named
  states with alt text. Library: 68 templates; coverage 68 of 101 rows.

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
| Vote results with counts | automatic (vote recipe, `Count n` bound) | as Live vote; after Show result each row prints its own count (3 and 1) with its share |
| Alert level | automatic (`choice:Level/...`, Advisory drawn visible) | starts on Advisory, never empty; the Level field offers exactly the four levels; every level is a button, greyed only while shown; each shows only its look |
| Public notice | automatic (`choice:Level/...`, Standard drawn visible) | starts on Standard; Urgent shows only the urgent band; Standard returns |

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

The count shows under Live figures there, since a host that sends only data reaches no Show
result. OGraf non-real time: both are repaints of data the graphic already has, with no motion;
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

- Browser (job queue, this cloud worker): `choice`, `vote` batches, the Live vote case and the
  new export case, 4 passed (j-0005).
- Node: `behaviour-reads` (14), `behaviour-look`, `behaviour-keys`, `behaviour-removed-layer`,
  `check-example-layers` (20, one new case), `template-coverage`, `check-svg-example-coverage`,
  `concept-names`, `svg-files`, `vote-board-bars`, `jev-svg-contract`, `jev-svg-baseline`,
  `imported-credits-model`: pass. `svg-import-passes`: the four records (inventory, bind, emit
  html, runtime) that fail the same way on an untouched `main` worktree on this machine (TL2 trap)
  and nothing else. Pins moved by this change and re-recorded only where a re-record on `main`
  and on this branch differ: ten `emit.js` hashes and the vote band's `fillGap`, two
  `appearance.js` in `jev-svg-baseline`, four credits build pins.
- `tsc`, `eslint` on changed files, `check-copy`: pass. README.pdf reprinted (10 pages).
