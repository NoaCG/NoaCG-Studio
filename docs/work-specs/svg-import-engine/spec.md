# SVG import engine: named passes, a corpus harness, one door

Baseline: main `dba61b8e1`, 2026-10-13; every line number below is of that revision. Authority:
owner, 2026-10-13 (see `work.json`). Plan for `/plan-run svg-import-engine`: seven sequential
phases, each built by one session and checked by another on `main`. Binding context this plan
does not restate: `docs/SVG_IMPORT_PLAN.md` (the engineering contract), `docs/SVG_BEHAVIOUR_PLAN.md`,
`docs/TEXT_BOX_BINDING.md`, `src/templates/importedDesign/AGENTS.md`, `docs/ARCHITECTURE.md` §5.

## Verdict

Restructure, narrowly, and build the measuring instrument before moving a line. The engine is not
one program but two held in one file: about 740 lines of TypeScript that turn a `DesignSvg` into a
template, and about 2,450 lines of browser runtime (the fit ladder and the growth rules) written as
template strings inside that TypeScript, where no type checker, linter or unit test reaches them.
The runtime strings carry most of the change: of the 40 most recent non-merge commits to `svg.ts`,
28 touched only those strings (judged by where each hunk fell against today's section boundaries,
so a hunk near a boundary may be misread, and the figure is a reading rather than a count), and 68
of the 82 non-merge commits in 90 days also edited an e2e spec, because the wizard walk is the only
test the runtime has. That is the cost: every rung of the ladder is proved by a
five-minute Playwright walk through the mapping step, and a change to one rule can only be seen by
walking the UI on every file by hand or waiting for the nightly sweep.

The gain this plan promises is in how fast a regression is seen and how small a change can be,
not in fewer import failures by itself: a corpus harness that runs the 49 real exporter files
through every pass in one blank Chromium page in seconds, and shows for a change to one pass which
files changed result; the runtime in plain ES5 files that lint and can be loaded alone; one
function that builds the draft the wizard builds at drop, so the harness and the wizard test the
same thing; the TypeScript transform in four named files, three of them pure and tested in Node.
Every phase leaves the corpus results, the emitted bytes and the user-visible behaviour unchanged,
and each is proved by the harness before it lands. Fewer import failures come afterwards, from
the heuristics §6 lists, each measured on the harness before it ships; that is a separate spec.

Not done here, with reasons: moving `wizard/import/` out of `components/` (the measured refusal in
ARCHITECTURE §5 still holds; its numbers are refreshed in §5 below); rewriting the runtime in
TypeScript (templates emit ES5, the bytes must not move, and nothing is gained the lint does not
give); a Node DOM library for a browser-free test (the reader and the binder are DOMParser code by
design, a shim parses differently, and the repo's blank-page Chromium tier already costs seconds);
splitting `assets/svgImport.ts` (lower churn, already staged in order, and two compiled invariants
are scoped to that exact path).

Biggest risk: phases 4 and 5 move about 2,450 lines of runtime out of template literals, where a
backtick or `${}` escape that changes one byte changes what every exported graphic runs. Mitigation:
the emitted template of every corpus file is pinned byte for byte before the move (phase 1), and
the catalog baseline already pins svg01's placeholder emit. Second risk: the runtime half of the
harness depends on fonts, which differ by machine; §4 says how the harness makes that deterministic
and what stays browser-only.

## Why

`src/templates/importedDesign/svg.ts` is 3,228 lines, created 2026-08-20, 84 commits in 90 days,
82 of them non-merge (80 distinct commits in today's blame); `src/assets/svgImport.ts` 1,896 lines, 48 commits;
`src/components/wizard/import/MapSvgFieldsStep.tsx` 1,832 lines, 30 commits;
`src/components/wizard/import/draft.ts` 1,502 lines, 13 commits. All verified on `dba61b8e1`.

What the churn is made of, by section of `svg.ts` (blame on main; a commit is counted in every
section it touched):

| Lines | Section | Kind | Lines | Commits |
|---|---|---|---|---|
| 1-135 | header, exported tolerances, `NO_SVG`, stamp tokens | TS | 135 | 17 |
| 136-185 | `layoutRules`, `candidateLabel` | TS (DOM read) | 50 | 5 |
| 186-331 | `normalizePictureHref`, `setIdKeepingRefs`, `bindSvgMarkup` | TS (DOM pass) | 146 | 18 |
| 332-409 | `aliasFontFaceCss`, `svgFontCss`; 387-409 is the fit runtime's doc comment | TS, pure | 78 | 6 |
| 410-710 | `SVG_FIT_JS`: measure, squeeze, budgets | runtime string | 301 | 21 |
| 711-1424 | `SVG_FIT_JS`: container, local box, alignment, neighbour, room | runtime string | 714 | 30 |
| 1425-1667 | `SVG_FIT_JS`: wrap, balance, paint, rise, recentre | runtime string | 243 | 13 |
| 1668-1800 | `SVG_FIT_JS`: `fitSvgText`, the ladder | runtime string | 133 | 19 |
| 1801-1916 | refit, reread alignment, `SVG_FIT_BOOT` | runtime string | 116 | 11 |
| 1917-2020 | `saidLines`, `layoutDataJs`, the table's comment | TS, pure | 104 | 10 |
| 2021-2092 | `SHAPE_SHIFT_JS` | runtime string | 72 | 2 |
| 2093-2410 | growth: base, axis, direction, cap, room, rest | runtime string | 318 | 17 |
| 2411-2585 | growth: followers, spanners, sided followers | runtime string | 175 | 10 |
| 2586-2833 | growth: `growSvgLayout`, `growOneRule`, apply, travel | runtime string | 248 | 23 |
| 2834-2968 | growth: offered heights, `growSvgHeights` | runtime string | 135 | 6 |
| 2969-2980 | the two update hooks, `designPreset` | TS | 12 | 4 |
| 2981-3207 | `assembleImportedSvg` | TS | 227 | 18 |
| 3208-3228 | `IMPORTED_SVG` | TS | 21 | 3 |

Runtime strings: 2,455 lines (76%). TypeScript: 773 lines, of which the DOM-touching part is
`candidateLabel` with the bind helpers and `bindSvgMarkup` (141-331, DOMParser in, XMLSerializer
out, 191 lines) and the rest is plain data to text. The hottest section is the room and alignment measurement (714 lines, 30
commits), followed by `growOneRule` and its neighbours (23) and the ladder itself (19).

How a change is proved today: `e2e/import-svg.spec.ts` (4,657 lines, 100 tests, 5.1 minutes on
CI), `e2e/import-svg-corpus.spec.ts` (1,411 lines, 5.8 minutes, walks all 49 corpus files through
the real door plus the ladder), `e2e/import-svg-behaviour.spec.ts` (2,811 lines, 4.4 minutes), and
the nightly `fit-sweep.yml` (about 3,000 ladder cases, two hours, sharded). A change to `svg.ts`
selects 62 specs, 53.9 minutes of recorded durations (`scripts/e2e-affected.mjs planFor`); a
change to `svgImport.ts` 17 specs, 26.1 minutes; to anything under `wizard/import/` 13 specs,
20.0 minutes. The two compiled invariants and the folder rule cited in ARCHITECTURE §5 are intact;
its numbers are stale (§5).

What has no test outside that walk: the TypeScript transform (no Node test imports `svg.ts`); the
runtime rungs in isolation; the agreement between the wizard's measurements (`stageMeasure.ts`,
whose header calls itself a mirror of runtime rules "so the two cannot share a line of code") and
the runtime they mirror. What exists and is reused: `scripts/vote-board-bars.test.mjs` already
bundles `svgImport.ts`, `naming.ts`, `draft.ts`, `svg.ts` and `composeDocument.ts` with Rolldown,
loads them on one blank Chromium page (`withBundledPage`, `scripts/catalog-emit.mjs`), builds a
graphic as the wizard would and mounts it under a driven clock (`scripts/driven-clock.mjs`). That
is the harness's shape; phase 1 generalises it over the corpus.

## Goal

The engine becomes named passes with plain inputs and outputs, in files small enough to hold, the
runtime in lintable ES5 files, one door from the wizard to the draft, and a corpus harness that
proves every one of those moves byte-identical and then stays as the fast gate for every later
change. The import behaviour, the emitted templates and the mapping step do not change.

## Non-goals

Any change to what the import detects, offers or defaults (that is §6's follow-on); any change to
the fit ladder's rules or the growth rules; moving code across the ARCHITECTURE §3 edges or out of
`components/wizard/import/`; splitting `assets/svgImport.ts`; shortening or retiring e2e specs
before phase 7, and then only with `## Test maintenance` records; a Node DOM shim; AI in the
import path (owner, 2026-09-03).

## 1. Decisions

### 1.1 Owner decisions (2026-10-13)

1. This session produces a verdict and a plan, not code; the docs land through `/queue-merge`
   and the plan runs later as a planned run under `/plan-run`.
2. Simplify and harden rather than extend: "Let's not break anything. Let's just improve it";
   every phase behaviour-identical, the corpus results unchanged.
3. Direction, not scope: manual linking in the mapping step should become the backup when
   automatic detection cannot answer, never the primary road. §6 records what was learned and
   turns it into a measurable follow-on; nothing in this plan changes the step.

### 1.2 Derived decisions (revertible; each says how)

- **D1 Harness tier.** The corpus harness is a factory-tier Node test (`// gate: factory`,
  `// needs: browser`) on `withBundledPage`, not a Playwright spec and not a Node-with-DOM-shim
  test. Reasons: `importSvgMarkup` and `bindSvgMarkup` are DOMParser code by design (plan §2),
  Node has no DOMParser and the repo carries no XML package on purpose
  (`scripts/check-example-layers.mjs:104`); a shim would answer differently from Chromium on
  exactly the cases the corpus holds (a parse error document, namespace handling, selector
  escaping); the factory tier runs on every pull request (`ci.yml` `factory` job) and locally on
  demand, needs no app, server or wizard, and the catalog's equivalent gate takes 2.5 seconds for
  the whole catalog. Revert: none needed; a pure-Node tier for the pure passes is added in phase
  3 beside it.
- **D2 Snapshot shape.** The harness compares pass records, not whole templates: per corpus file,
  the inventory (`SvgImportResult` minus `markup`, plus a hash of the markup), the default draft's
  field list, the bound `<svg>` markup, the parsed `NOACG_LAYOUT` and `NOACG_BEHAVIOUR` tables, the
  `fields` array, the font CSS block, and sha256 of `html`, `css`, `js`; then the runtime record
  (per bound line at each `LADDER_VALUES` entry: lines, size ratio to drawn, overflow, the grown
  panel box). One JSON file, `scripts/fixtures/svg-corpus-passes.json`, keyed by file then pass,
  re-recorded only with `UPDATE_SVG_CORPUS_PASSES=1` and a named reason in the pull request, the
  `check-catalog-emit` convention. Revert: pin only the template hashes.
- **D3 Deterministic fonts in the harness.** The runtime record is measured with every font family
  the file names resolved to one bundled face: the harness composes the document as the wizard
  would and prepends, for each unresolved family, a `@font-face` alias to the bundled Inter file,
  so a Windows checkout and the Linux runner measure the same glyphs. This is a harness override,
  never product behaviour: the font-matching pass itself is pinned by the font CSS record. Files
  whose record still differs between two CI runs are listed under a `volatile` key and compared
  with a tolerance, never silently. Revert: pin the runtime record on CI only.
- **D4 Byte identity is the proof of a move.** Phases 2 to 5 land with the snapshot unchanged
  (phase 2 adds the draft record and otherwise changes nothing) and `e2e/catalog-baseline.json`'s
  `svg01` row unchanged. A pull request that must re-record says what changed and why, and the
  checker reads the diff of the snapshot. Revert: n/a.
- **D5 Same folder, same edges.** Every new engine file lives under
  `src/templates/importedDesign/` (runtime files under `importedDesign/runtime/`), so the e2e
  plan (62 specs through `src/templates/**`) and `.dependency-cruiser.cjs` see nothing new; no
  ARCHITECTURE §3 edge is added. The wizard keeps importing its four constants from
  `templates/importedDesign/svg`, which re-exports them. Revert: move a file back.
- **D6 Runtime files are ES5 with tokens.** `SVG_FIT_JS`, `SVG_FIT_BOOT`, `SHAPE_SHIFT_JS` and the
  growth runtime become `runtime/svgFit.js`, `runtime/svgFitBoot.js`, `runtime/svgShapeShift.js`,
  `runtime/svgGrowth.js`, imported with Vite's `?raw` (precedents `src/assets/flexGapShim.js`,
  `src/video/textChecks.js`, both plain JS installed into a page as text). The values the strings
  interpolate today (`PREFIX`, `SVG_ALIGN_TOL`, `SVG_LINE_HEIGHT`, `LAYOUT_EL_ATTR`, `PANEL_SAFE`,
  `LAYOUT_VERSION`, the floor constants) stay at the same byte positions as `__TOKEN__`
  placeholders that one `fillRuntime(text, values)` replaces at emit, so the emitted bytes do not
  move and `SVG_TEXT_FIT_MARKER` (`'function fitSvgText'`, read by `blocks/designLayout.ts:364`)
  survives. An ESLint block for `src/templates/importedDesign/runtime/*.js` (`ecmaVersion: 5`,
  `sourceType: script`, browser globals, the runtime's own shared globals declared) lints them;
  `check-copy` already guards their comments. Revert: inline the files back as strings.
- **D7 One drop-time function.** `svgDraftFromImport(result, context)` in `import/draft.ts`
  returns the patch `CreationWizard.tsx:2019-2130` assembles inline today (fit to frame, the
  proposed behaviour, the field list with furniture last, pictures and outlines off unless marked,
  extras, the stretch seed, the font matches, the file name), and `svgDraftCleared(previous)` the
  clear-svg patch. The wizard calls them; `scripts/driven-clock.mjs`'s `__importDraft` (a reduced
  copy of the same assembly) calls the bundled real one; the harness uses it. Revert: inline.
- **D8 The seam count includes types and is recorded with its command.** ARCHITECTURE §5's count
  is refreshed to count exported functions and exported types named outside `import/`, with the
  script that produced §5's numbers below. Revert: keep the function-only count.
- **D9 Never weaken.** A phase may change a selector or a helper in an e2e spec, never an
  assertion, and never a sidecar in `e2e/fixtures/svg-corpus/`; phase 7's moves are recorded under
  `## Test maintenance` per `docs/work-specs/README.md`, each retired test naming the harness
  record that now protects it.
- **D10 Defects apart from moves.** A wrong answer the harness surfaces while recording (a corpus
  file whose pass record contradicts its sidecar, or the five `GROWTH_FINDINGS` of
  `e2e/import-svg-corpus.spec.ts:550-556`) is recorded as a finding in the snapshot's `findings`
  key and in the phase notes, never fixed inside a move. Fixes are their own pull requests, each
  re-recording exactly the records it means to change.

### 1.3 Open question for the owner (one; the plan proceeds under the recommendation)

**Should the geometry-based fill run by itself at drop, with its reasons shown and one Undo,
instead of waiting behind the "fill them in" press?** Today a behaviour is proposed from layer
names (`bestProposal`), and a picker a name did not fill stays empty until the reader presses
the offer, which fills from names first and then from where each layer sits
(`fieldAutoMap.ts proposeFill`). The behaviour plan's §4 table puts "a role, from an unnamed
layer" under *never* for the silent column and under *offered, one click* for the fill. The
owner's words on 2026-10-13 ("no one should ever have to manually link stuff... it should be a
backup") argue for applying a complete, unambiguous fill at drop and keeping the press for a
partial one. Recommendation: yes, but only after phase 1's harness reports the fill gap per
corpus file, so the change is measured on 49 real files before it ships; it belongs to the
follow-on spec in §6, not to this plan. Nothing here depends on the answer.

## 2. The engine, as passes

Today's data flow, with the file that owns each step and what it takes and returns:

1. **Read** (`assets/svgImport.ts importSvgMarkup`, 1576-1884): source text in; `SvgImportResult`
   out (sanitized markup with `data-noacg-candidate` markers, size, text/picture/outline/group/shape
   candidates, fonts, notices). Internally already ordered: parse and size, sanitize, normalize
   units, hoist inline styles, drop idle `xml:space`, unwrap look wrappers, text candidates (lines
   versus kerned runs by measured gap), pictures, outlines ranked, groups, shapes, fonts, then one
   layout measurement (candidates outside the canvas) that needs a real document.
2. **Propose** (`templates/behaviours/naming.ts bestProposal`, `proposeExtras`; `import/draft.ts
   proposeSvgBehaviour`, `proposeSvgExtras`, `armTimerClock`): result in; a behaviour draft, the
   extras and the clock binding out. Pure string and list work, Node-tested
   (`scripts/layer-name-readings.test.mjs`).
3. **Draft** (today inline in `CreationWizard.tsx:2019-2130`; phase 2 names it
   `svgDraftFromImport`): result and context in; the import slice of the wizard draft out.
4. **Measure on the step** (`import/stageMeasure.ts`, `fieldAutoMap.ts`, `MapSvgFieldsStep.tsx`):
   the step's own render in; growth default, followers, boxes, alignment, fill proposals out.
   Stays where it is (ARCHITECTURE §5); phase 6 pins its agreement with the runtime.
5. **Options** (`import/draft.ts svgDesignOptions`, 1433-1490): draft in; `DesignSvg` out. Pure.
6. **Build** (`templates/importedDesign/svg.ts assembleImportedSvg`): `ResolvedOptions` in;
   `SpxTemplate` out. Inside it, in order:
   - 6a `svgFields` (`artworkFields.ts`): `DesignSvg` to SPX fields. Pure.
   - 6b `boundBehaviour` (`behaviour.ts`): `DesignSvg` and fields to the behaviour's fields, html,
     css, js, table, machine type and `markLayers`. Compile is pure; `markLayers` is a DOM pass.
   - 6c `bindSvgMarkup` (222-331): `DesignSvg` to the bound `<svg>` text. The one DOM pass of the
     build: root class, collision moves with reference carrying, `fN` ids (pictures through
     `svgPictureTarget`), clock and credits classes, outlined and removed classes, layout stamps,
     behaviour marks, marker strip.
   - 6d `svgFontCss` (361-386): fonts to CSS text. Pure.
   - 6e `layoutRules` and `layoutDataJs` (136-140, 1947-1989): `DesignSvg` to normalized rules to
     the `NOACG_LAYOUT` table text. Pure, except `candidateLabel` (DOM read for a comment).
   - 6f runtime emission: the preset's JS with the fit hook spliced in, then `SVG_FIT_JS`, the
     layout table and `growthRuntimeJs()` when a rule or an aligned line exists, the clock runtime,
     `SHAPE_SHIFT_JS`, the behaviour's JS, the credits runtime, `SVG_FIT_BOOT`. Concatenation.
   - 6g compose and finish: `documentHtml`, CSS text, `convertToDataRegion` with the clock and
     behaviour refinements, `attachMachine`.
7. **Place** (`import/draft.ts withSvgImportPasses`, 1492-1502): template and draft in; template
   out, with erase-seeded fields, outline stand-ins and drawn fields added in the one order that
   numbers correctly.
8. **Run** (the emitted runtime, in the graphic): `fitSvgText` on load, on `update()`, on
   `document.fonts.ready`; inside it `svgRestAndMeasure` (room and budgets at rest), `growSvgLayout`
   (sideways growth as budget), the ladder per line (fill, wrap into the drawn room, shrink to the
   55% report floor, squeeze to 70%, shrink to the 30% hard floor, report), `svgEvenOut` and
   `svgRecentre`, then `growSvgHeights` (grow the panel by what the settled block needed).

### 2.1 The split

| Today | After phase 3 to 5 | Input to output | Test tier |
|---|---|---|---|
| `svg.ts` 1-135, 2969-3228 | `svg.ts` (about 450 lines): constants, `NO_SVG`, `assembleImportedSvg`, `IMPORTED_SVG`, re-exports | `ResolvedOptions` to `SpxTemplate` | harness |
| `svg.ts` 136-331 | `svgBind.ts`: `layoutRules` stays with layout; `candidateLabel`, `setIdKeepingRefs`, `normalizePictureHref`, `bindSvgMarkup` | `DesignSvg` to `<svg>` text | harness (DOM) |
| `svg.ts` 136-140, 1917-2020, tokens, `LAYOUT_EL_ATTR`, `PANEL_SAFE`, `LAYOUT_VERSION` | `svgLayout.ts` | `DesignSvg` to rules; rules to table text | Node, plain inputs |
| `svg.ts` 332-409 | `svgFonts.ts` | fonts to CSS text | Node, plain inputs |
| `svg.ts` 410-1916 | `runtime/svgFit.js`, `runtime/svgFitBoot.js` | the graphic's DOM | harness runtime record; phase 6 rungs |
| `svg.ts` 2021-2092 | `runtime/svgShapeShift.js` | path data to path data | phase 6 rungs (pure functions, loadable alone) |
| `svg.ts` 2093-2968 | `runtime/svgGrowth.js` | the graphic's DOM | harness runtime record; phase 6 rungs |
| `CreationWizard.tsx` 2019-2130, `driven-clock.mjs __importDraft` | `import/draft.ts svgDraftFromImport`, `svgDraftCleared` | result to draft patch | harness draft record; Node |

`svgImport.ts`, `behaviour.ts`, `behaviourRuntime.ts`, `creditsRoll.ts`, `artworkFields.ts`,
`designTypes.ts` and the wizard files are unchanged by the split.

## 3. Test strategy

**Exists.** The wizard-walk specs and the nightly sweep (§Why); `check-catalog-emit` pinning the
svg01 placeholder's bytes; `scripts/vote-board-bars.test.mjs`, `behaviour-removed-layer.test.mjs`
and `readout-ink.test.mjs` running the real reader, proposal and composer in a blank page;
`scripts/layer-name-readings.test.mjs` (pure, with a readings fixture that may only gain);
`scripts/svg-geometry.test.mjs` (pure). The sweep's 49 sidecars state the designer's expectation per
file (accepted, size, text fields and labels, picture fields, outline rows, notices, growth
default; `growthShape` on five) and are the corpus's truth, never the importer's.

**Missing.** A test of the transform without the wizard; a per-pass view of what a change did to
the real files; a test of the runtime rungs without the wizard; a check that the step's mirror
measurements agree with the runtime; a Node test for the pure build passes.

**The harness** (`scripts/svg-import-passes.test.mjs`, phase 1):

- Header: `// gate: factory`, `// needs: browser`, `// guards: src/assets/svgImport.ts,
  src/templates/importedDesign/**, src/templates/behaviours/**, src/components/wizard/import/draft.ts,
  src/preview/composeDocument.ts, e2e/fixtures/svg-corpus/**, scripts/fixtures/svg-corpus-passes.json`.
  It reports `measured(files * passes, 'corpus pass records')`.
- One `withBundledPage` with the five entries `vote-board-bars.test.mjs` already bundles, plus
  `installDrivenPage`. Per corpus file (every `.svg` with a sidecar, 49 today): read, draft (phase 1
  uses `__importDraft` extended to the wizard's defaults; phase 2 switches it to
  `svgDraftFromImport`), `svgDesignOptions`, `IMPORTED_SVG.create({ designSvg })`, then the
  records of D2. A refusing file (`geometry-unescaped-ampersand`) records its message.
- The runtime record: mount with `__mountDesign` under D3's font aliases, for each
  `LADDER_VALUES` entry write it into every text field through `update()`, advance the driven
  clock, read per field the painted line count, `font-size` ratio to the drawn size, the
  `-overflow` class, and the growing panel's box; the sideways and downward rules both exercised
  by the corpus's 17 `grow-xy` files. Measured through the same `getBBox` reads the ladder uses.
- Comparison: deep-equal per record, with the runtime record's numbers rounded to the pixel and
  compared within one pixel; a difference prints `file / pass / path: before -> after`. Wholly
  new files are added to the snapshot by the same re-record switch.
- Cross-check, once at record time and in every run: the inventory record agrees with the file's
  sidecar on `accepted`, `width`, `height`, `textFields`, `textLabels` (prefix), `imageFields`,
  `outlineRows`; a disagreement is a finding (D10), listed, never a silent pass.
- Budget: estimated under 60 seconds for 49 files on a CI runner (bundle plus launch about three
  seconds, then one import, build and mount per file); phase 1 measures it and records the number.
  The gate runs in CI's factory job on every pull request that touches a guarded path and locally
  with `node --test scripts/svg-import-passes.test.mjs`.

**Pure Node tier** (phase 3): `scripts/svg-layout-table.test.mjs` for `layoutRules` and
`layoutDataJs` (a `DesignSvg` literal to a rules list and to the emitted table text, including the
`stretch` normalisation and the `lines` list), `scripts/svg-font-css.test.mjs` for the alias
pinning, each loading its module through Rolldown as `layer-name-readings.test.mjs` does. These
need no browser and run in the build tier.

**Runtime rungs** (phase 6): `scripts/svg-fit-rungs.test.mjs` loads `runtime/svgFit.js` and
`runtime/svgGrowth.js` as text into a blank page holding one corpus file's bound `<svg>` (from the
snapshot's bind record), calls `measureSvgRoom`, `fitSvgText`, `growSvgLayout` and
`growSvgHeights` directly and asserts the rules the AGENTS contract states (room stops at a
neighbour, centred lines snap, growth never passes the mirrored margin, two passes settle on the
same geometry). The same page runs the wizard's `boxFitOf` from `stageMeasure.ts` over the same
artwork and compares its alignment and insets with the runtime's `svgAlignOf` answer for every
bound line of every corpus file: the mirror gate.

**What stays browser-walk only.** The mapping step's own render and controls, the preview rebuild
races the corpus spec documents, the drag and pick gestures, export through the gate, the
`outsideCanvas` measurement inside the real page, and the fit sweep's full value-by-option matrix.

## 4. Behaviour identity, stated as checks

A phase is behaviour-identical when all of these hold on the pull request: the harness snapshot is
unchanged (phase 2 may add the `draft` record; phase 1 creates the file); `e2e/catalog-baseline.json`
`svg01` is unchanged and `check-catalog-emit` passes; the affected e2e plan for the touched files
passes on CI; for phases 4 and 5 the `js` sha256 of every corpus record is unchanged. The checker
reads the snapshot diff in the pull request, not the builder's word.

## 5. The seam, re-measured

The ARCHITECTURE §5 count: `import/draft.ts` exports **18** functions (the doc says 15), and
**eight** are named outside `import/` (the doc says six): the six the doc lists
(`svgDesignOptions`, `withSvgImportPasses` from `draft/core.ts`; `proposeSvgBehaviour`,
`proposeSvgExtras`, `armTimerClock` from `CreationWizard.tsx`; `behaviourSummary` from
`FinishStep.tsx`) plus `pollDrivenLayers` and `graphicNameFromFile`, both from `CreationWizard.tsx`
(landed 2026-09-21 and 2026-10-12). Of its 20 exported types, two cross: `SvgImportDraft`
(`draft/core.ts`, the shape `WizardDraft` extends) and `DesignFieldSpec` (named only in comments
of `blocks/designFields.ts` and `ai/importAnalysis/normalize.ts`; not an import). The doc's other
numbers: the plan is still 13 specs under `wizard/import/`, 62 under `templates/importedDesign/`
(was 48), 15 under `blocks/`, 17 under `assets/`; the four no-JSX files are 3,140 of the 7,895
no-JSX lines under `components/` (was 2,886 of 4,318). The one-door rule and both compiled
invariants are in place.

The seam widened because the wizard shell assembles the whole import draft itself at drop
(`CreationWizard.tsx:2019-2130`, about 110 lines calling five slice functions), which is the
transform-in-the-render-tree shape §5 forbids, and `scripts/driven-clock.mjs:64-69` carries a
reduced copy of the same assembly for tests. Phase 2 (D7) replaces both with
`svgDraftFromImport` and `svgDraftCleared`; the seam becomes four functions
(`svgDraftFromImport`, `svgDesignOptions`, `withSvgImportPasses`, `behaviourSummary`) plus the
clear patch and the `SvgImportDraft` type, and the harness builds its draft through the same door
the wizard uses. The count command, which phase 2 writes into ARCHITECTURE §5 in place of the
present one:

```
node -e "const fs=require('fs');const p='src/components/wizard/import/draft.ts';const s=fs.readFileSync(p,'utf8');
const names=[...s.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)|^export (?:interface|type) ([A-Za-z0-9_]+)/gm)].map(m=>m[1]??m[2]);
const w=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=d+'/'+e.name;
if(e.isDirectory())w(q,o);else if((e.name.endsWith('.ts')||e.name.endsWith('.tsx'))&&!q.includes('/import/'))o.push(q)}return o};
const f=w('src').map(x=>[x,fs.readFileSync(x,'utf8')]);
for(const n of names){const re=new RegExp('(^|[^A-Za-z0-9_$])'+n+'($|[^A-Za-z0-9_$])');const hits=f.filter(([,t])=>re.test(t)).map(([x])=>x);if(hits.length)console.log(n,'<-',hits.join(', '))}"
```

No backslash in it, so it reads the same in bash and PowerShell.

The engine-to-wizard direction stays constants only: `stageMeasure.ts` and `MapSvgFieldsStep.tsx`
import `SVG_ALIGN_TOL`, `SVG_ALIGN_WORD`, `SVG_LINE_HEIGHT` and `PANEL_SAFE` from
`templates/importedDesign/svg` and `SVG_CANDIDATE_ATTR` from `assets/svgImport`. Phase 6's mirror
gate is what makes that direction safe to keep.

## 6. What other platforms do, and the detection road (not this plan)

Research on 2026-10-13 (public documentation; "unverified" where only marketing exists):

- Nobody auto-detects fields from a design file. Loopic, Flowics, OGraf Studio and Singular import
  an SVG as one image and have the designer rebuild text and picture elements natively; each field
  is then a manual key, control node or binding, and the designer picks its kind. Vizrt's fields
  are Control plug-ins with numeric ids for tab order. MXMZ claims "every layer exposed" and
  documents nothing beyond that (unverified). Lottie and Rive bind text by layer name only;
  After Effects exposes only properties dragged into Essential Graphics.
- Playout sides an importer must emit: SPX `DataFields` (`field` equals the element id, `ftype`
  from a fixed list), CasparCG's GDD schema (`gddType`), OGraf's manifest `schema` (JSON Schema
  with `gddType`, `hidden`, `order` as the UI hints). NoaCG already emits all three from one field
  list; nothing here changes that.
- Exporter quirks the reader already handles and the corpus pins: Illustrator's `_x5F_` escapes,
  `_1_` duplicates and `data-name`; Figma's outlined text default, numeric suffixes and
  `<tspan>` stacks; Inkscape's `inkscape:label` with serial ids.
- No library classifies SVG text nodes into field kinds. Deciding kind (title, name, score,
  clock), pairing (home and away) and bounding text to its backing shape is open ground; NoaCG's
  reader already does the last two of those (containment and `looksClock`, `looksNumeric`).

Heuristics that need no naming convention, for a follow-on spec, each to be measured on the
harness against all 49 files before it ships, and each an *offer* under the behaviour plan's §4:
sample shape (a clock, an integer, a percentage); mirror pairing (two numeric samples at one
size and one baseline, symmetric about the artwork's axis, are a score pair, and the two names
beside them a team pair); type-scale hierarchy inside one plate (largest is the title, the next
below it within 1.5 line heights the subtitle); a complete geometry fill applied at drop with
reasons and Undo (§1.3). The harness's `fillGap` record per file (`fieldAutoMap.ts fillGap`) is the
number such a change must move.

## 7. Phases

Each phase: one pull request, one builder, one independent checker on `main`, the proof named.
Fences are the files a phase may change; a phase that needs more stops and records why.

### Phase 1: the corpus harness (no product code)
Scope: `scripts/svg-import-passes.test.mjs`, `scripts/fixtures/svg-corpus-passes.json`,
`scripts/driven-clock.mjs` (extend `__importDraft` to the wizard's full defaults: furniture last,
pictures and outlines off unless marked, `armTimerClock`, extras, fonts matched), the eslint and
gates registration if the header needs it, `docs/SVG_IMPORT_PLAN.md` (one paragraph pointing at the
harness), this spec's phase notes. Proof: the test runs green in CI's factory job and locally; the
recorded run time is in the notes; the snapshot's cross-check against the 49 sidecars lists its
disagreements as findings (expected: the five `GROWTH_FINDINGS`, possibly more); a deliberate
one-token change to `bindSvgMarkup` (made and reverted in the builder's worktree, the diff pasted
in the notes) names every corpus file in the `bind` record and nothing in the `inventory` record;
two CI runs on the same sha agree, or the differing records are under `volatile` with the reason.
Acceptance: AC-1, AC-2, AC-8.

### Phase 2: one door for the draft
Scope: `src/components/wizard/import/draft.ts` (add `svgDraftFromImport`, `svgDraftCleared`),
`src/components/wizard/import/index.ts` if needed, `src/components/wizard/CreationWizard.tsx`
(call them; no other change), `scripts/driven-clock.mjs` (`__importDraft` calls the bundled
`svgDraftFromImport`), the harness (switch to it, add the `draft` record), `docs/ARCHITECTURE.md`
§5 (the count, the command, the numbers in §5 above). Proof: a temporary assertion in the
builder's worktree that the old inline assembly and the new function return deep-equal patches
for every corpus file plus the brand case, pasted in the notes and then removed; the harness
snapshot unchanged except the added record; `e2e/import-svg.spec.ts` and `import-svg-behaviour`
green on CI; the §5 command prints four functions plus the clear patch. Acceptance: AC-2, AC-3,
AC-7.

### Phase 3: the TypeScript transform in named files
Scope: `src/templates/importedDesign/{svg,svgBind,svgLayout,svgFonts}.ts`,
`scripts/svg-layout-table.test.mjs`, `scripts/svg-font-css.test.mjs`,
`src/templates/importedDesign/AGENTS.md` (the file map, one line each),
`docs/ARCHITECTURE.md` §8 if it lists the folder's files. Pure moves: no function body changes;
`svg.ts` keeps the exported constants as re-exports. Proof: snapshot and catalog baseline
unchanged; the two Node tests green in the build tier; `svg.ts` under 500 lines, no new file over
800. Acceptance: AC-2, AC-4, AC-7.

### Phase 4: the fit runtime as a file
Scope: `src/templates/importedDesign/runtime/svgFit.js`, `runtime/svgFitBoot.js`,
`src/templates/importedDesign/svg.ts` (the `?raw` imports and `fillRuntime`), `eslint.config.js`
(the ES5 block), `src/vite-env.d.ts` only if `?raw` typing needs it (it exists). Proof: every corpus
record's `js` sha256 unchanged and the catalog baseline unchanged, which together are byte identity;
`npx eslint src/templates/importedDesign/runtime` clean; `SVG_TEXT_FIT_MARKER` still found by
`blocks/designLayout.ts` (the `import-svg` outlined-text tests prove it). Acceptance: AC-2, AC-5.

### Phase 5: the growth and shape runtimes as files
Scope: `runtime/svgGrowth.js`, `runtime/svgShapeShift.js`, `svg.ts`. Proof: as phase 4.
Acceptance: AC-2, AC-5.

### Phase 6: rungs and the mirror gate
Scope: `scripts/svg-fit-rungs.test.mjs` (factory tier), `src/components/wizard/import/stageMeasure.ts`
only if a function needs an export for the gate (no behaviour change), the harness if it shares a
page helper. Proof: the rung tests assert at least the six contract rules named in §3 on at least
ten corpus files each; the mirror gate compares `boxFitOf` with `svgAlignOf` for every bound line
of every corpus file and lists disagreements as findings (D10) rather than failing on the first
run; the pull request's notes say how many lines agree. Acceptance: AC-6, AC-8.

### Phase 7: coverage moves (optional; the owner may stop after phase 6)
Scope: `e2e/import-svg.spec.ts`, the harness, this spec's `## Test maintenance`. The pure-transform
tests of `import-svg.spec.ts` whose assertions the snapshot now carries (labels from layer names,
the `f:` and `static:` prefixes, numbering of repeats, the sanitizer's removals, the PostScript
font match, the kerned-run and hard-return rules, the symbol and hidden-layer refusals) are
retired one by one, each with a `## Test maintenance` line naming the harness record and the
sidecar that protect it; the spec's recorded minutes fall and `check:e2e-protection` passes.
Nothing about growth, the ladder, gestures or the preview moves. Acceptance: AC-2, AC-9.

Order and risk: 1 adds only a test; 2 is provable by equality; 3 moves pure code; 4 and 5 carry
the byte risk and have the byte gate; 6 is additive; 7 removes coverage and is last and optional.

## 8. Execution

- Coordinator `/plan-run svg-import-engine`, sequential; builders and checkers `wave-row`; one
  builder owns `svg.ts` in any phase. No workflow fan-out unless the owner's start prompt says so.
- Preflight before phase 1 (recorded in the wave file): `node scripts/work-spec.mjs status
  docs/work-specs/svg-import-engine/work.json` clean; `origin/main` CI green and the latest
  `fit-sweep.yml` run on main read (its findings are the baseline's known state); the browser queue
  idle enough (`npm run test:e2e:runs`); no open wave on these files (`node
  scripts/worktree-activity.mjs`).
- Stop conditions: a snapshot that changes in a move phase and cannot be explained as a finding; a
  phase whose fence does not hold; a corpus e2e failure on the pull request that the harness did
  not predict (the harness is then wrong first); a second failed check. The coordinator records
  `stop` and asks the owner with a recommendation.
- Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and `/queue-merge`;
  every phase records the main sha before, the merge sha and the revert command in its notes.
- Deployment: phases 2 to 5 change `src/` and deploy on landing like any landing; the emitted
  templates are byte-identical, so a user sees nothing. Phases 1, 6 and 7 do not deploy.

## 9. Acceptance criteria

### AC-1: The harness exists and localises a change
`scripts/svg-import-passes.test.mjs` is a registered factory-tier gate (`node scripts/gates.mjs
audit` accepts it); it records every corpus file through every pass of §2 into
`scripts/fixtures/svg-corpus-passes.json`; a deliberate change to one pass changes only that
pass's records and the test names the files. Layer: Node test with a browser (factory tier).

### AC-2: Behaviour is identical at every phase
On each phase's pull request the snapshot is unchanged (phases 1 and 2 excepted as §4 states),
`check-catalog-emit` passes with `svg01` unchanged, and the affected e2e plan is green. Layer: the
harness, the catalog gate, CI.

### AC-3: One door from the wizard
`CreationWizard.tsx` holds no import-draft assembly; the §5 command, which matches text and so
also lists names that appear only inside comments (today `armTimerClock` in
`templates/behaviours/naming.ts:194` and `DesignFieldSpec`), prints as code references exactly
`svgDraftFromImport`, `svgDraftCleared`, `svgDesignOptions`, `withSvgImportPasses`,
`behaviourSummary` and `SvgImportDraft`; ARCHITECTURE §5 carries the command and the numbers.
Layer: the command, read by the checker, who opens each listed line.

### AC-4: Named passes in named files
`svg.ts`, `svgBind.ts`, `svgLayout.ts`, `svgFonts.ts` exist with the contents §2.1 states;
`svgLayout.ts` and `svgFonts.ts` have Node tests with plain inputs in the build tier; `svg.ts` is
under 500 lines and no engine TypeScript file is over 800. Layer: Node tests; `wc -l`.

### AC-5: The runtime is a lintable file and the bytes did not move
The four runtime files exist under `importedDesign/runtime/`, lint clean under the ES5 block, are
emitted through `fillRuntime`, and every corpus record's `js` hash is unchanged across phases 4
and 5. Layer: the harness; eslint.

### AC-6: Rungs are testable without the wizard, and the mirror is checked
`scripts/svg-fit-rungs.test.mjs` runs the ladder and the growth on corpus artwork loaded alone and
compares the step's `boxFitOf` with the runtime's `svgAlignOf` for every bound line of every
corpus file, reporting disagreements. Layer: Node test with a browser.

### AC-7: Each phase stays inside its fence and the docs follow
Every phase pull request touches only the files its scope names (the checker reads the file
list); the AGENTS file map, ARCHITECTURE §5 and the SVG plan's pointer are updated in the phase
that changes the fact. Layer: the pull request's file list.

### AC-8: Evidence precedes landing and findings are named
Each phase's notes carry the proof its phase names, the run time of the harness, and every
finding D10 surfaced; no finding is fixed inside a move. Layer: the phase notes, read by the
checker.

### AC-9: Retired coverage names its replacement
Every test retired in phase 7 has a `## Test maintenance` line naming the harness record and the
sidecar that protect the behaviour, and `check:e2e-protection` passes. Layer: the gate.

## What the plan can demonstrate, and what stays uncertain

Demonstrated by the phases: that the moves are byte-identical; that the harness localises a
change; that the seam is four functions; that the runtime lints. Uncertain until phase 1 runs:
the harness's run time and the number of volatile runtime records (D3 names the fallback). Not
claimed: fewer import failures, a smaller total line count (code moves; about 120 duplicated lines
die), or a shorter CI until phase 7.

## Readiness

Registered under "Runnable plans" in `.agent-workflows/plan-run.md`. The owner starts it with
`/plan-run svg-import-engine until <date and time with UTC offset>`; a start without a deadline is
answered with one question for it. Phase 7 is optional: the coordinator asks before launching it
only if the owner's start prompt did not already say.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the previous
verified `main` sha, the merge sha, the revert command, decisions taken, traps found, the harness's
run time, the findings recorded, and the check's findings.
