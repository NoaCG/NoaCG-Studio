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

### Phase 6: rungs and the mirror gate (check 2, 2026-10-14)

- **Verdict: PASS**, on `main` at `16339862` (the merge of #1152). No product code changed here.
- **Runs here (Windows):** `node --test scripts/svg-fit-rungs.test.mjs` 9 pass, 1 skip (the
  mirror list is Linux's), 51 files in 8.1 s, the seven rung counts as the repair note states.
  `node --test scripts/svg-import-passes.test.mjs` 14 pass, 1 skip (the Linux runtime record),
  601 records. CI merge_group run 38493372158 on `16339862`: the factory job ran both with 133 of
  133 passing and none skipped, so the mirror list was compared on Linux (63 findings, 141 lines,
  3 not compared); the corpus shard passed 21 and skipped 3 (the three picture-swap tests that
  call the retired `switchToAdvancedMode`), the sidecar walk among the passes, so both new
  sidecars hold.
- **The neighbour rung is independent.** The pen is found from the artwork's geometry (lines
  417-442 of the test). It reads the runtime's `svgFitContainer` for the box it searches inside,
  but nothing from the runtime decides which thing pens a line. Two probes of this check's own,
  each made with `sed`, run, then reverted with `git checkout --`:

  | Probe in `svgFit.js` | Result |
  |---|---|
  | `measureSvgRoom` honours only half the gap: `var edge = bound.edge + (panel.right - bound.edge) / 2;` (`room.penned` still true) | `neighbour` holds on 2 of 11 and fails on 8 new files, e.g. `figma-duplicate-ids-scorebug: short: f0 paints to 880.92, past the neighbour that pens it at 819.08`; `room` and `fits` also fail |
  | `svgFitNeighbour` measures the neighbour 40 px further right: `left = Math.min(r.left + 40, panel.right)` | only `neighbour` fails: holds on 5 of 11, breaking on 5 new files, 3 of them only at the "just past" value (`illustrator-scoreboard-lower-third: just past ("0 0 0 0 0"): f1 paints to 1024.28, past the neighbour that pens it at 1012.3`) |

- **Neighbour reach, 10 holding of 11 reached, judged fair.** Logging which value reaches each
  file: 8 files are reached by `LADDER_VALUES` (7 hold, plus #1148's ticker) and 3 only by the
  "just past" value (`figma-duplicate-ids-scorebug`, `student-illustrator-scoreboard`,
  `inkscape-player-number-strap`). The "just past" value does not count a file by itself: a file
  counts only where the value, at the drawn size, would cross the neighbour and the line is
  painted unreported, so the fit really had to stop it. The second probe shows those values are
  where an edge 40 px wrong is caught at all. Without them the rung would hold on 7 files;
  without the two new files, on 8. Both are needed, and both are honest.
- **The two new corpus files are honest strap artwork:** a player strap with a shirt-number tile
  set inside the plate, and a news headline strap with a live dot inside the plate. Each is
  written in its exporter's idioms with a designer's story, like the rest of the corpus.
  Comparing the pass snapshot as JSON against `06045b28` shows exactly two differences, both
  added files (`illustrator-live-badge-strap`, `inkscape-player-number-strap`). No existing record
  changed.
- **Margin, AC-6 met.** The rule is asserted on 20 files and reached at its limit sideways on 16,
  above the 10 asked. Vertically 0 files reach the limit, which the test prints and #1153 tracks
  (open). A third probe shows the vertical side is still guarded:
  `svgGrowCap`'s `var marginY = 0;` (the vertical cap ignores the margin) fails `margin` on
  `inkscape-flowed-text-card: over2: rule 1 grew to 208.8 from the frame, inside the 240 it
  mirrors`, and the counter then reads "vertically 19 grow and 1 reach the margin". So "never
  passed" is checked on the vertical axis, and only the at-limit count is missing.
- **Mirror:** 141 bound lines, 138 compared. The 3 not compared are printed with their reasons
  here and on CI.
- **Observation, not a finding:** #1152 added two corpus files and their snapshot records,
  outside the scope §7 lists for phase 6. This is the only way to reach 10 files without changing
  `LADDER_VALUES`, which would change existing records. Its notes say so and give the revert.

### Phase 6: rungs and the mirror gate (repair, 2026-10-14)

- **Last check's findings (phase 6 build, FAIL):** the room rung found the pen through the
  runtime's own `svgFitNeighbour`. A probe that made it find nothing left the rung reporting "0
  with a line a neighbour pens" and no overlap; a copy of the test that found the pen with the
  unchanged function showed 6 files painting past their neighbour (`figma-duplicate-ids-scorebug:
  over1: f0 paints to 1065.92, past the neighbour that pens it at 819.27`), and the real test failed
  only because #1148's recorded finding vanished. The neighbour rule reached only 8 files (7 held),
  below the 10 asked, and counted as 44 only folded into the room rung. Minor: the margin rung
  reached the vertical cap on 1 file; the mirror skipped 2 bound lines
  (`illustrator-question-timer-board f1`, the clock, and `inkscape-text-on-path-bumper f0`, a
  `textPath`) without counting or printing them; the notes said four runtime files, and
  `svgFitBoot.js` is not loaded.
- **Main before:** `74d1149ae` (the merge of #1150, another plan's notes; phase 6's merge
  `06045b28` is below it). Merge sha: the queue's merge of this pull request. Revert: `git revert
  -m 1 <merge sha>` on its own branch through `/check` and `/queue-merge`; it takes the two corpus
  files and their snapshot records with it.
- **Built:**
  - The neighbour rule is its own rung, `neighbour`, and the test finds the pen itself: at rest,
    the nearest thing drawn inside the line's box, on the line's rows, to its right; not the box
    and not a plate as big as it; a part of another bound line stands for that line. Neither
    `svgFitNeighbour` nor `room.penned` is read by any rung (the mirror still labels an inset
    finding "penned by a neighbour" from `room.penned`, its own record). The rung checks that an
    unreported line never paints past that thing where it stands now, and `room` now checks only
    the box's edges.
  - A file is reached by the rung only where a value would have crossed the neighbour at the drawn
    size. The ladder jumps from `short` to values no narrow slot holds unreported, so each penned
    line also takes its own drawn value repeated until it is a third wider than the gap ("just
    past"), on that line alone.
  - Two corpus files, written from the promise like the rest:
    `inkscape-player-number-strap` (a name bounded by a number tile drawn inside its plate;
    growth `shrink`, with the reason in its sidecar) and `illustrator-live-badge-strap` (a
    headline bounded by a live dot inside its plate; `grow-xy`). The pass harness snapshot gained
    their records (re-recorded with `UPDATE_SVG_CORPUS_PASSES=1`; the diff is additions only, no
    existing record changed); their `runtime` records are Linux's, taken from this pull request's
    CI log with `SVG_CORPUS_RUNTIME_FROM`.
  - The mirror prints and counts every bound line it does not compare, with the reason: 3 of 141
    (`illustrator-live-vote-band f0`, hidden at rest; `illustrator-question-timer-board f1`, a
    `<div>` the fit does not walk, the clock; `inkscape-text-on-path-bumper f0`, a `<textpath>`).
    Of the 138 compared, on Linux 79 agree on box and law, the box on 126 and the law on 87; on
    Windows 80, 126 and 88. The Linux list matched on CI's first run with the two new entries.
  - The margin rung prints, per axis, how many files grow and how many grow until the margin
    stops them.
  - **Runtime files loaded:** three of the four. `svgFit.js` always, `svgShapeShift.js` and
    `svgGrowth.js` where the table carries a growth rule. `svgFitBoot.js` is not loaded: it only
    wires `refitSvgText` to load, font and resize events, and the test calls the passes itself.
    The phase 6 build note's "four runtime files" was wrong.
- **The seven rungs** (files where the rule holds, of the files it reaches; Windows and CI's Linux
  factory job, job 115617128417, agree except where noted). Run time 7.7 s for 51 files here:

  | Rung | Holds |
  |---|---|
  | `room` | 45 of 46 |
  | `neighbour` | 10 of 11 (11 files have a penned line; all 11 reached) |
  | `snap` | 24 of 24 (23 of 23 on Linux) |
  | `margin` | 20 of 20. Sideways 17 files grow and 16 reach the margin; vertically 18 grow and **0 reach the margin**, on both platforms, so the vertical margin is checked only as "never passed", never at its limit. Raising that needs a value or a file that grows a plate up to its vertical margin; not done here (#1153) |
  | `settle` | 37 of 49 |
  | `fits` | 48 of 48 |
  | `floors` | 29 of 29 |

- **Proof that the neighbour rung bites** (each made with `sed` in this worktree, the test run,
  then `git checkout --` the file):

  | Probe | Result |
  |---|---|
  | `svgFitNeighbour` returns `{ edge: panel.right, cap: false }` (finds nothing) | `neighbour` holds on 2 of 11 and fails: breaks on 9 files against the 1 recorded, e.g. `figma-duplicate-ids-scorebug: over1: f0 paints to 1065.92, past the neighbour that pens it at 819.27`, `inkscape-player-number-strap`, `illustrator-live-badge-strap: over1: f0 paints to 1663.98, past the neighbour that pens it at 1262` |
  | `measureSvgRoom`: `var edge = bound.edge;` to `var edge = panel.right;` (the fit ignores the neighbour) | the same: `neighbour` holds on 2 of 11 and fails on 9 files |

  Both probes also move `settle` (a room that changes changes what settles); `room` is unmoved.
- **Findings (D10):** none new. `neighbour` breaks only on `effects-symbol-library-ticker`
  (#1148), moved there from `room`; `room` keeps `illustrator-rotated-sidebar-strip` (#1144). The
  mirror's list gains the two new files' `f0: law: inset x (penned by a neighbour)` (#1145). A
  third file drafted for this, a Figma place-and-time strap whose time is a bound line, broke the
  neighbour rung the #1148 way (the time, read as right-anchored, grows left over the place) and
  `settle` (#1143), and its sidecar's `grow-xy` disagreed with the step's `shrink`; it was dropped
  rather than land a third disagreement. It is a clean repro for #1148 if wanted.
- **Decisions:**
  - Reach means a value that would have crossed the neighbour, not any value checked: a short
    value that stops short of the neighbour tests nothing about it.
  - The "just past" value is the line's own drawn value repeated, so it reads as a real long
    entry in that slot, and only that line takes it, as when one name is typed long.
  - The independent finder counts an end cap and a neighbour alike: text stays off both, and a
    cap is read where it stands after it travels with a growing edge.
  - New corpus files rather than more ladder values: `LADDER_VALUES` is shared with the harness
    and the sweep, and changing it would change existing records.
- **What the next phase must allow for:** the neighbour rung holds on exactly 10 files; a corpus
  change that drops one fails it, by design. A fix for #1148 takes `effects-symbol-library-ticker`
  off `RUNG_FINDINGS.neighbour`. The rung looks only to the right of a line: an end-anchored line
  that grows left over a neighbour (#1148's shape) is caught only where its neighbour is the line
  being checked.
- **Traps:** the corpus spec's growth column (`e2e/import-svg-corpus.spec.ts`) reads every
  sidecar, so a new file's `growth` must be the step's answer or a listed finding; the pass
  harness prints the disagreement locally (`growth default ..., sidecar ...`) in seconds, which is
  how the dropped file was caught without a browser walk.

### Phase 6: rungs and the mirror gate (build, 2026-10-14)

- **Last check's findings (phase 5, PASS):** byte identity held on the checker's own literal
  comparison (the old `SHAPE_SHIFT_JS` and `growthRuntimeJs` against `fillRuntime`) for LF, a
  synthesised CRLF copy and the CRLF working tree; the snapshot, catalog and fidelity blobs are
  unchanged, and the harness passed 15/15 against an `a05aefeb^1` baseline. ESLint is clean; the
  globals block holds the right 19 cross-file names, the three writable ones assigned in the growth
  and declared in `svgFit.js`, and the probes were caught. AC-4: `svg.ts` is 437 lines and every
  split file 217 or fewer; the coordinator ruled `behaviourRuntime.ts` (1,105 lines, another plan's,
  older than this one) outside AC-4. The fence held and the phase 4 note is corrected. CI
  merge_group: `import-svg` 54, corpus 21, behaviour 34, fidelity 11. #1138 is open: the e2e plan
  misses specs when only a `?raw` runtime file changes.
- **Main before:** `d8c96727044191872abcfa36518e6e8ee2b853be` (the merge of #1141, a quarantine that
  touches nothing here; phase 5's merge is below it). Merge sha: the queue's merge of this pull
  request. Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and
  `/queue-merge`; it removes the one test file and these notes, and nothing depends on either.
- **Built:** `scripts/svg-fit-rungs.test.mjs`, factory tier from its header (`gates.mjs audit` OK),
  guarding `src/templates/importedDesign/**`, the reader, the behaviours, `wizard/import/**`, the
  fonts, the corpus and `ladder-values.mjs`. No product file changed: `boxFitOf`,
  `panelOfEachLine` and `withoutBackplates` were already exported. Per corpus file it builds the
  draft, the step's stage and the template as the pass harness does, then opens a blank page
  holding only the template's css, the bound artwork and its placed lines, and loads
  `svgFit.js`, the layout table, `svgShapeShift.js` and `svgGrowth.js` as text, filled with the
  test's own copy of `fillRuntime` (not exported from `svg.ts`, outside this fence). Every filled
  text is checked to be in the template the build emitted, so the page runs the shipped bytes. The
  rungs are driven through the runtime's own functions (`svgRestAndMeasure`, `fitSvgText`,
  `refitSvgText`, which run `measureSvgRoom`, `growSvgLayout`, `growSvgHeights`), at rest and at
  every `LADDER_VALUES` entry.
- **Run time:** 7.8 s for 49 files on this Windows machine (the whole file about 8.3 s); 17.1 s on
  CI's factory job (job 115597447559).
- **The six rungs** (files where the rule holds, of the files it reaches; Windows and Linux agree
  except where noted). Each must hold on at least 10 files:

  | Rung | Contract rule | Holds |
  |---|---|---|
  | `room` | room stops at the box's edge and at a neighbour on the line's rows; unreported, nothing paints out of its box sideways | 42 of 44 (8 files have a penned line) |
  | `snap` | a centred line is anchored on its box's middle, a centred block on its band's middle | 23 of 23 (22 on Linux) |
  | `margin` | growth never passes the mirrored margin, floored at `safe`, and never leaves the frame | 19 of 19 |
  | `settle` | a second `fitSvgText` and a `refitSvgText` give the same artwork to the byte | 35 of 47 (one file binds no line the fit walks) |
  | `fits` | at rest the artwork is the design; a value the room holds stays at the drawn size on one line, unreported, and moves nothing | 46 of 46 |
  | `floors` | never below 30%, reported below 55%, squeezed no narrower than 70% and reported | 28 of 28 |

- **The mirror gate:** 136 bound lines in 48 files, 135 measurable at rest (one is in a state hidden
  at rest). On Linux 78 lines agree on box and law; the box agrees on 123 and differs on 12; the
  law (on the runtime's box) agrees on 86 and differs on 49. On Windows 79, 123/12 and 87/48. The
  alignment words agree on all 135 lines, and the box in the line's units wherever both sides use
  one box. The 61 findings on 57 lines: `inset y` 36 (top-composed lines: the runtime's room runs
  to the mirrored top padding or stops at the line where something is drawn below; the overlay
  keeps the tighter drawn gap in the band), `inset x` 18 (13 penned by a neighbour the step does
  not model), box 12 (11 grouped under no box by the step, 1 a different shape), `nudge x` 2.
  Insets and nudges agree within a tenth of the drawn type (at least one unit); the box to a unit.
- **Proof that each rule bites** (each made with `sed` in this worktree, the test run, then
  `git checkout --` the file; base run green before, tree clean after):

  | Probe | Result |
  |---|---|
  | `svgFit.js` `measureSvgRoom`: `var edge = bound.edge;` to `bound.edge + 400;` | `room` holds on 8 of 44: `affinity-point-sized-nameplate: over1: f0 paints to 1535.05, past its box at 1168.38` |
  | `svgFit.js` `svgApplyAnchor`: the written `x` plus 5 | `snap` holds on 9 of 23: `effects-smil-animated-bug: over1: f0 sits 5 off its box's middle sideways` |
  | `svgGrowth.js` `svgCapMargin`: `return span * rule.safe;` | `margin` holds on 2 of 21: `affinity-point-sized-nameplate: over1: rule 0 grew to 51.2 from the frame, inside the 126.67 it mirrors` |
  | `svgFit.js` `svgRestAndMeasure` without `svgLayoutRest()` | `settle` breaks on 24 files against the 12 recorded (`affinity-point-sized-nameplate`, `effects-figma-masked-reveal`, ... added) |
  | `svgFit.js` `fitSvgText`: `var size = drawnSize * 0.95;` | `fits` holds on 0 of 46: `affinity-point-sized-nameplate: short: f0 holds the value at its drawn size, yet was set to 26.6px` |
  | `svgFit.js` `SVG_FIT_HARD_FLOOR = 0.2` | `floors` holds on 12 of 28: `figma-duplicate-ids-scorebug: over1: f1 shrank to 26%, under the 30% floor` |
  | `stageMeasure.ts` `boxFitOf`: a centred line's sideways margin `type * 0.5` to `type * 0.3` | the mirror's list moved, 24 entries in and 7 out (`+ figma-centred-title-card f1: law: inset x`); 63 lines agree instead of 79. Run on Windows while the list was still compared there |

- **Findings (D10), recorded and not fixed here:**
  - `settle`, 12 files (#1143): the same value fitted twice can answer differently. Traced on
    `logo-transparent-ground`: at `over1` the first fit grows the plate and the second does not,
    at `over2` the reverse, because `svgRestOneRule` reads `svgLinesInside` off where each line is
    painted now, and `svgLayoutRest` rests the panel but not the anchor and size the last pass left
    on the line. The other 11 files are not traced.
  - `room`, `illustrator-rotated-sidebar-strip` (#1144): the turned line wraps across both edges
    of its upright strip, unreported (from -64 to 184 px at `over1` in a 120 px strip).
  - `room`, `effects-symbol-library-ticker` (#1148): the story is penned by the source beside it,
    but the source is end-anchored and grows leftwards unbounded, so with long values the two
    overlap, unreported. Found by the review of this pull request, once the rung read the
    neighbour where it stands after the fit rather than where it stood at rest.
  - The mirror's 61 findings (#1145), listed in `MIRROR_FINDINGS`.
  - None of the pass harness's five recorded findings changed; this phase does not touch it.
- **Decisions:**
  - The six rules: the four §3 names (room stops at a neighbour, centred lines snap, growth never
    passes the mirrored margin, two passes settle) plus the two ends of the ladder the AGENTS
    contract rules on (fill the room first; the floors and the report). The neighbour rule alone
    reaches only 8 files with a penned line, so it is asserted as the room's two bounds, the box's
    edge and the neighbour, which reaches 44.
  - Findings are pinned in the test file rather than a fixture (no fixture is in the fence): per
    rung, the files it breaks on (`RUNG_FINDINGS`); for the mirror, the line and what differs
    (`MIRROR_FINDINGS`). Each test fails when its list changes, so a new break or drift fails
    and a fix takes its entry off on purpose.
  - The mirror's list is Linux's and compared only there (`MIRROR_PINNED`, the harness's
    `RUNTIME_PINNED` rule): on the first CI run two lines differed from Windows, a webfont
    fallback that moves which plate the step groups `effects-css-import-webfont f0` under, and
    `no-viewbox-px-and-pt f2`'s inset y landing 2.8 off against a 2.1 tolerance (1.8 on Windows).
    Elsewhere the skip message lists the differences (3 on this machine). The rung lists matched
    on both platforms and are compared everywhere.
  - The mirror is compared in two halves: which box each side chose (by shape index; one parse
    gives both renders the same shapes, which the test asserts), and the law, with `boxFitOf` given
    the runtime's own box under a temporary marker, so a law drift shows even where the boxes
    differ.
  - The runtime's insets are read back off the room `measureSvgRoom` recorded: sideways the margin
    left between the room's end and the box on the side a longer value fills, downwards the margin
    left in the band. The step's are `boxFitOf`'s `insetX` and `insetY`.
  - `stageMeasure.ts` is not edited, since nothing needed an export. Its stale comments (lines
    10-15, 348, 696) stay for whoever next edits it, as the brief allows.
- **What the next phase must allow for:**
  - Phase 7 (optional) retires `import-svg.spec.ts` transform tests against the pass harness. This
    test covers the rungs on corpus artwork, not the wizard's preview, the gestures or the
    sweep's value-by-option matrix, so no ladder or growth spec should be retired against it.
  - A fix for #1143, #1144, #1145 or #1148 changes `RUNG_FINDINGS` or `MIRROR_FINDINGS` in the same pull
    request; for the mirror take the list from a CI log (it prints every finding; on Linux,
    `SVG_FIT_RUNGS_SHOW=1` prints it as code).
  - A change to a runtime file alone runs this test (its guards include the runtime folder), so
    the rungs are checked even where #1138 leaves the e2e plan short.
- **Traps:**
  - This worktree had no `node_modules`; a junction to the main checkout's (same lockfile), made
    with `node -e "require('fs').symlinkSync(<main>/node_modules, 'node_modules', 'junction')"`,
    serves it, and git ignores it.
  - The step's stage, its outside-frame untick and its growth answer are now copied in two tests,
    this one and the pass harness, both from `MapSvgFieldsStep.tsx`. A change to that effect
    changes both copies; one shared page helper for the two would close it, and was left out to
    keep the harness, the byte gate of phases 2 to 5, untouched here.

### Phase 5: the growth and shape runtimes as files (build, 2026-10-14)

- **Last check's findings (phase 4, PASS):** #1133 changes no behaviour (a trailing comma in a
  call, and a function-scoped `i` reused after the outer loop ends); its snapshot diff is only the
  48 `emit.js` hashes. The runtime baselines at `6e8bfb503`, `b18fe3d1e`, `4e4eb8b0^1` and
  `4e4eb8b0` are byte-identical, and the snapshot and catalog blobs are unchanged across #1136.
  The CRLF step was proven by comparing the old and new literals, an unfilled token throws, the
  ES5 lint is scoped to `runtime/*.js`, and the probes were caught. The fence holds and
  `editor-fidelity-trim` passed 11/11. GAP: the `import-svg` tests for the `fitSvgText` marker
  (spec lines 1070 and 1150) and the same ladder (line 1782) have been skipped since #800, so
  phase 4's "the outlined-text tests prove it on CI" was wrong (corrected there); the checker's
  own probe proved the marker on all 48 templates through `ensureTextFitRuntime`, and the gap is
  recorded on #800. `svg.ts` was 1,372 lines.
- **Main before:** `42c370b69fd1dcbcd55eb4e0a5750b583ec722e6` (the merge of #1135, which touches
  nothing here; phase 4's merge `4e4eb8b0c` is its parent). Merge sha: the queue's merge of this
  pull request. Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and
  `/queue-merge`; it puts the two strings back into `svg.ts`, deletes the two files and their
  lint block, and the emitted bytes stay as they are.
- **Built:** `runtime/svgGrowth.js` (868 lines) and `runtime/svgShapeShift.js` (69), imported
  `?raw` by `svg.ts`. `SVG_GROWTH_JS` is `'\n' + fillRuntime(svgGrowth, { PREFIX, LAYOUT_EL_ATTR })`
  without its final line break, and `SHAPE_SHIFT_JS` is `'\n' + fillRuntime(svgShapeShift, {})`,
  both module constants. The emit order in `assembleImportedSvg` is unchanged. An ESLint block for
  `svgGrowth.js` lists what it reads from the others; `svgShapeShift.js` reads nothing and needs
  none. The folder's `AGENTS.md` file map and its growth paragraph name the files.
- **Proof:**
  - Cut by script, as phase 4 did: each template literal's source was taken from `svg.ts`, any
    interpolation other than `PREFIX` and `LAYOUT_EL_ATTR` refused (the growth has 7, the
    shifters none), `${NAME}` replaced by `__NAME__`, and the literal cooked as JavaScript does
    (`\\d` becomes `\d`, `` \` `` becomes a backtick). Filling the files back gave the original
    strings exactly, from LF and from CRLF files; neither original holds a `__NAME__` text or a
    carriage return. Re-run against the saved original `svg.ts` after the edit: equal.
  - Harness: 15/15, every record equal, the snapshot untouched. The runtime compared with this
    machine's baseline taken on `42c370b69` before any change (`SVG_CORPUS_RUNTIME_LOCAL`). Run
    time 6.9 s for the test file. Probe: one space in `svgGrowth.js` plus one comment line in
    `svgShapeShift.js` failed `emit` on 23 files, every corpus design that grows.
  - `check-catalog-emit`: PASS, 528 designs, `svg01` unchanged (its stand-in artwork has no
    growth rule, so the harness is what pins these two strings).
  - CRLF, as a Windows checkout writes the files: harness 15/15 and ES5 lint clean.
  - `npx eslint src/templates/importedDesign/runtime`: clean. Before the globals block the only
    findings were 47 `no-undef` on the cross-file names, no ES5 or other rule, so nothing in
    either string needed a byte change. Probes, each made and reverted: a misspelt `svgFitPlacd`
    in `svgGrowth.js` failed `no-undef`; a `let` appended to `svgShapeShift.js` failed the parse.
  - `tsc --noEmit`, `depcruise src` (no violations), ESLint on the changed files, `gates run
    --changed origin/main` (all checks, 3 test files, 16 tests) green; `vote-board-bars`,
    `readout-ink`, `behaviour-removed-layer`, `svg-layout-table` and `svg-font-css` pass (21).
  - `SVG_TEXT_FIT_MARKER` is untouched in `svgFit.js`, and the emitted bytes did not move.
- **AC-4 line counts (`wc -l`):** `svg.ts` 437, `svgBind.ts` 217, `svgLayout.ts` 132,
  `svgFonts.ts` 62: under 500, and no engine TypeScript file over 800. The runtime files are
  JavaScript: `svgFit.js` 1,466, `svgGrowth.js` 868, `svgShapeShift.js` 69, `svgFitBoot.js` 25.
  Outside the split and unchanged by it (§2.1): `behaviourRuntime.ts` 1,105, `draft.ts` 1,652,
  `svgImport.ts` 1,896.
- **Decisions:**
  - `growthRuntimeJs()` took no argument, so it became the constant `SVG_GROWTH_JS`, like
    `SVG_FIT_JS`: the fill and its unfilled-token guard run once at module load.
  - The growth string never ended with a line break; the file ends with one, as a file does, and
    `svg.ts` takes exactly one off (`.replace(/\n$/, '')`). Chosen over a file with no final line
    break, which editors and tools add back silently, and over rewriting the concatenation.
  - The shifters go through `fillRuntime` with no values, so the CRLF step and the guard hold for
    them too.
  - The three fit tables the growth assigns (`svgFitExtra`, `svgFitShift`, `svgFitExtraH`) are
    `writable` globals; the other 13 names from `svgFit.js`, `NOACG_LAYOUT` and the two shifters
    are `readonly`. Phase 4 forecast 17 names from `svgFit.js`; it is 16.
  - The THE HUG doc comment stays in `svg.ts` above the constant, as phase 4 kept its own.
  - Kept after review, with the reason: the growth's one-line-break strip is the only asymmetry
    among the four fills, and a file saved without its final line break would move every growing
    design's hash, which the harness's `emit` record catches; the fill now runs at module load, so
    a stray `__NAME__` text in the growth file breaks every importer of `svg.ts` at once, which is
    the guard working as phase 4 meant it to.
- **What the next phase must allow for:**
  - `svgShapeShift.js` is two pure functions reading no global: phase 6 can load it alone. The
    growth needs `svgFit.js`, the shifters and a `NOACG_LAYOUT` table in the same scope, filled;
    `fillRuntime` is not exported, so a rung test either exports it (an `svg.ts` change) or loads
    the emitted template.
  - The nightly will NOT close the e2e selection gap phase 4 expected it to: `e2e/_trace.ts`
    counts a file only when a function other than its module's top level ran, and a `?raw` module
    is only a top-level string (the map holds none of `gsap.min.js`, `flexGapShim.js`, `OFL.txt`).
    `e2e-affected --files` on any of `svgFit.js`, `svgGrowth.js`, `svgShapeShift.js` selects 60
    specs against 72 for `svg.ts`, measured on `42c370b69`. Issue #1138. Until it is fixed, a
    pull request that changes a runtime file without `svg.ts` names the 12 specs phase 4 listed
    by hand. This pull request changes `svg.ts`, so it selects all 72.
  - Stale names outside this fence: `docs/SVG_BEHAVIOUR_PLAN.md:343` and
    `docs/SVG_IMPORT_PLAN.md:903` still say `growthRuntimeJs`; `stageMeasure.ts:10-15` says the
    originals of its mirrors live in `svg.ts` (now `svgGrowth.js` for `svgLinesInside`, `svgFit.js`
    for `svgAlignOf`, `measureSvgRoom`, `svgLocalBox`), and its lines 348 (`growOneRule`) and 696
    (`svgMovingBox`) point at `svg.ts` too. Phase 6 opens `stageMeasure.ts` and can fix them.
    §2 6f of this spec describes the flow as it was, and its "when a rule or an aligned line
    exists" is the layout table's condition; the growth runtime rides only with a rule.
    `SHAPE_SHIFT_JS` keeps its name, so `behaviour.ts:64` and `behaviourRuntime.ts:747` stay right.
  - A comment inside a runtime file is emitted bytes: rewording one (for example
    `svgGrowth.js:31` "defined in the fit block above", true of the emitted script rather than of
    the file) changes the hashes of every design that carries it and is not a move.
- **Findings (D10):** none in the product; the five recorded harness findings are unchanged. One
  in the test selection, found by this phase's review: the e2e gap above (#1138), outside the
  fence and not fixed here.
- **Traps:**
  - The Bash tool here refuses a command whose program or arguments come from a shell variable;
    write scratchpad paths out in full.
  - A fresh `SVG_CORPUS_RUNTIME_LOCAL` path per phase, taken on main before the change.

### Phase 4: the fit runtime as a file (build, 2026-10-13)

- **Last check's findings (phase 3, PASS):** the checker's own AST token check found all 45
  declarations once each with 0 code differences; the only changes were export keywords, one
  re-export, file headers, one doc phrase and four moved doc comments. The harness passed 15/15
  against a fresh runtime baseline from `13b326773`, main's runtime is byte-identical, and the
  catalog's 528 designs are unchanged. The two Node tests are in the build tier, and the checker's
  own probes were caught. `svg.ts` held about 410 TypeScript lines against a forecast of about 450;
  the new files are 217, 132 and 62 lines. CI on `ef3ada8f`: `import-svg` 54 passed, behaviour 34,
  corpus 21. Main's push run was red only on the rundown-history flake (the retry passed;
  quarantine #1132). The e2e trace map lacks the new files until the nightly run. Stale comments
  remain at `designTypes.ts:390` and `draft.ts:1355`.
- **Main before:** `b18fe3d1e0ace6d3063874e2797c17b54d8d7197`, the merge of #1133, which this
  branch is built on; the runtime baseline was taken on its parent `6e8bfb503`, and #1133 leaves
  the runtime record unchanged. Merge sha: the queue's merge of this pull request.
  Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and `/queue-merge`. It
  puts the two strings back into `svg.ts` and removes the runtime folder and its lint block; the
  emitted bytes stay as they are. #1133 is reverted separately, by its own merge sha, and that
  re-records the `js` hashes back.
- **Prerequisite, #1133 (D10):** the ES5 lint refused the fit runtime as it shipped: one trailing
  comma after the last argument of a `Math.max` call in `measureSvgRoom` (ES2017 syntax) and a
  second `var i` in `svgBalanceLines` (`no-redeclare`). Lint-clean and byte-identical cannot both
  hold over those two spots, and D10 keeps a fix out of a move, so #1133 fixes them on their own:
  the comma goes, and the inner loop reuses the function's `i`, the same variable it already was.
  Its harness run changed `emit.js` on all 48 files and nothing else, with the runtime record equal
  to this machine's baseline from `6e8bfb503`. It re-records the 48 hashes, the catalog's `svg01`
  `js` row and the two lines of `docs/research/editor-r1-1d/baseline/wizard.js`, which
  `editor-fidelity-trim` compares byte for byte. All four runtime strings were linted under the
  same block before the fix: these two were the only findings besides the names one runtime piece
  reads from another, so phase 5 needs no byte change.
- **Built:** `runtime/svgFit.js` (1,466 lines) and `runtime/svgFitBoot.js` (25), imported `?raw` by
  `svg.ts` and filled by `fillRuntime(text, values)`: each `__NAME__` token becomes `String(value)`,
  CRLF becomes LF, and a token left without a value throws at module load (probe: filling the
  boot without `PREFIX` failed the catalog gate). `SVG_FIT_JS` is `'\n' + fillRuntime(svgFit, { PREFIX, SVG_ALIGN_TOL,
  SVG_LINE_HEIGHT })` and `SVG_FIT_BOOT` is `'\n' + fillRuntime(svgFitBoot, { PREFIX })`, still
  module constants. An ESLint block for `runtime/*.js`: `ecmaVersion: 5`, `sourceType: script`,
  browser globals, `js.configs.recommended`, `no-unused-vars` for locals only, and per file the
  tokens and the names it reads from the others. The folder's `AGENTS.md` file map has the line.
- **Proof:**
  - The files were cut by a script, not by hand: it took each template literal's source from
    `svg.ts`, refused any interpolation other than the three values (none escaped), replaced
    `${NAME}` by `__NAME__`, and cooked the literal as JavaScript does, so `\\d` became `\d` as
    it always did on emit. Filling the tokens back gave the original strings exactly, from LF
    and from CRLF files. Neither original holds a `__NAME__` text or a carriage return.
  - Harness: 15/15, every record equal, the snapshot untouched (on top of #1133's re-record). The
    runtime compared with this machine's baseline taken on `6e8bfb503` before any change
    (`SVG_CORPUS_RUNTIME_LOCAL`). Run time 6.7 s for the test file.
  - `check-catalog-emit`: PASS, 528 designs, `svg01` unchanged.
  - CRLF, as a Windows checkout writes the files: harness 15/15 and catalog PASS. Probe: without
    the CRLF step in `fillRuntime`, the catalog failed on `svg01` `js`.
  - `npx eslint src/templates/importedDesign/runtime`: clean. Probes, each made and reverted: a
    `const` arrow function appended to `svgFitBoot.js` failed the parse ("The keyword 'const' is
    reserved"); a misspelt `refitSvgTxt()` failed `no-undef`.
  - `SVG_TEXT_FIT_MARKER` (`function fitSvgText`) is in `svgFit.js` once and in the emitted bytes,
    which did not move. Corrected in phase 5: the `import-svg` tests for that marker and its ladder
    have been skipped since #800, so they proved nothing on CI; the phase 4 checker's own probe
    proved the marker on all 48 corpus templates through `ensureTextFitRuntime`, and the gap is
    recorded on #800.
  - `tsc`, `depcruise src` (no violations), ESLint on the changed files, `gates run --changed
    origin/main` (all checks, 4 test files, 23 tests) green; `vote-board-bars`, `readout-ink`,
    `behaviour-removed-layer` and the two phase 3 Node tests pass (21 tests).
- **AC-4 line counts:** `svg.ts` 1,372 lines: 940 are the runtime strings phase 5 moves
  (`SHAPE_SHIFT_JS` 71, `growthRuntimeJs` 869) and 432 are TypeScript. After phase 5 it should be
  about 440, under 500.
- **Decisions:**
  - Tokens are `__PREFIX__`, `__SVG_ALIGN_TOL__` and `__SVG_LINE_HEIGHT__`, the interpolated names
    in capitals, so a reader sees which constant each one is.
  - The files hold the strings without their leading line break, which `svg.ts` writes, so each
    file starts at its own first comment.
  - `fillRuntime` turns CRLF into LF. A Windows checkout here has `core.autocrlf=true`, and the
    precedent `?raw` files (`flexGapShim.js`, `textChecks.js`) are CRLF in the working tree, so a
    local build would emit other bytes than CI's. Done in code rather than in `.gitattributes`
    (the root file is outside the fence, and `src/templates/` has a compiler-written one), and it
    holds whatever a checkout writes.
  - No loader shim: every bundler that reaches `svg.ts` already answers `?raw`
    (`scripts/rolldown-raw.mjs` in `withBundledPage`, Vite's SSR loader in the sweeps), because
    `model/fonts.ts` imports `OFL.txt?raw`. `vite-env.d.ts` already types `*?raw` and is unchanged.
  - The rules stay on, including `no-redeclare` and `no-undef`; only `no-unused-vars` is narrowed
    to locals, because a top-level function here is called by another piece of the graphic.
  - The TypeScript doc comments stay in `svg.ts` above the constants. Three that pointed "below" at
    the fit now name `runtime/svgFit.js`.
  - Kept after review, with the reason: the cross-file globals are hand lists, so renaming a
    function `svgFitBoot.js` calls still lints clean (the harness's runtime record catches it);
    the block takes all of `globals.browser`, as the app's own block does, so a stray `top` or
    `name` is not flagged.
- **What the next phase must allow for:**
  - `growthRuntimeJs` returns a literal that ends `}` with no line break before the backtick, and
    `SHAPE_SHIFT_JS` begins with one. Extracting by cooking the literal (as this phase did)
    handles both and the `\\d` escapes in the shifters.
  - The growth runtime interpolates `PREFIX` (6 times) and `LAYOUT_EL_ATTR` (once). It reads 17
    names that `svgFit.js` defines (`svgFitRoom`, `svgFitPlaced`, `measureSvgRoom` and so on),
    the shifters and `NOACG_LAYOUT`, so its globals list is long; the shifters read nothing.
  - Until the nightly traces the runtime files (the #927 pattern; `repoFileOf` drops the `?raw`
    query, so the trace will name them), `e2e-affected --files` selects 60 specs for
    `runtime/svgFit.js` alone against 72 for `svg.ts`. The 12 it misses: `dashboard-operator-walk`,
    `editor-drawing-task`, `editor-fidelity-trim`, `editor-layer-property-qualification`,
    `editor-out`, `import-graphic`, `import-svg-centred-title`, `import-svg-credits`,
    `motion-presets`, `ograf-isolation`, `score-tracker-moments`, `svg-examples`.
    `editor-fidelity-trim` compares the emitted script byte for byte. Phase 5 changes `svg.ts`, so
    its pull request selects all 72; a change to a runtime file alone before the nightly should
    name those specs by hand.
  - Comments outside this fence still name `svg.ts` as the home of fit functions:
    `assets/svgImport.ts:1111` (`svgFitValue`), `wizard/import/stageMeasure.ts:209` and
    `WizardPreview.tsx:36` (`svgLocalBox`, `svgAlignOf`), `e2e/import-svg-corpus.spec.ts:780`.
- **Findings (D10):** the two lint findings above, fixed in #1133. None new from the harness; the
  five recorded findings are unchanged.
- **Traps:**
  - Byte identity is checked against the snapshot on the branch, so a phase built on an unlanded
    fix must say which; `merge-order` refuses to queue this branch until #1133 has landed.
  - The scratchpad trap from phase 3 holds: a fresh `SVG_CORPUS_RUNTIME_LOCAL` path per phase.

### Phase 3: the TypeScript transform in named files (build, 2026-10-13)

- **Last check's findings (phase 2, PASS):** the checker compared the old `onSvg` and `onClearSvg`
  from `f6634cbd6` with main over 48 files, 5 frames, 6 previous drafts and 3 brands: 4,320 drops
  and 8,640 clears, 0 differences, and its probe was caught. The snapshot without `draft` is
  deep-equal to `f6634cbd6`'s. CI on `cb3d9557`: `import-svg` 54 passed, `import-svg-behaviour` 34.
  A UI walk of drop, fields, behaviour, preview and clear was OK. AC-3: six names, and the two
  extras are comments. The fence held. Minor: ARCHITECTURE §5 says 3,280 of 8,082 no-JSX lines,
  measured 3,290 of 8,092 (confirmed here on `13b326773`; ARCHITECTURE.md is outside this fence,
  so it is #1129). Carried: two tests still pass a second argument `__importDraft` ignores, and
  the empty SVG slice is written three times (#1126).
- **Main before:** `13b326773c7cc3b180532fa8b3b743876661c85b`. Merge sha: the queue's merge of this
  pull request. Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and
  `/queue-merge`. It puts the three passes back into `svg.ts` and removes the two Node tests and
  the file map; nothing else depends on the new files.
- **Built:** `svgBind.ts` (217 lines: `candidateLabel`, `normalizePictureHref`,
  `setIdKeepingRefs`, `bindSvgMarkup`), `svgLayout.ts` (132: `SVG_ALIGN_WORD`, `LAYOUT_EL_ATTR`,
  `LAYOUT_VERSION`, `PANEL_SAFE`, the two token helpers, `layoutRules`, `saidLines`,
  `layoutDataJs`), `svgFonts.ts` (62: `aliasFontFaceCss`, `svgFontCss`). `svg.ts` keeps the
  header, `SVG_ALIGN_TOL`, `SVG_LINE_HEIGHT`, `NO_SVG`, the runtime strings, the hooks,
  `assembleImportedSvg` and `IMPORTED_SVG`, and re-exports `PANEL_SAFE` and `SVG_ALIGN_WORD`, so
  `stageMeasure.ts` and `MapSvgFieldsStep.tsx` import as before. Two build-tier Node tests:
  `scripts/svg-layout-table.test.mjs` (5 tests: the normalisation, `saidLines` without the
  countdown or credits sample, one whole table pinned as text, the table run as a script, no
  `lines` list for an unaligned design) and `scripts/svg-font-css.test.mjs` (5 tests: empty, a
  bundled face, the pinned alias as text with both clamps and the no-weight range, an embedded
  face, the unresolved comment).
- **Proof:**
  - Pure move: the files were cut by line range from `13b326773`'s `svg.ts` with a script. An
    independent check compared the line multisets (blank lines and a leading `export` ignored):
    nothing of the original is missing, and the only added lines are imports and the one
    re-export. After that, one doc phrase changed ("the runtime below" became "the growth
    runtime (svg.ts)", since the table now sits in another file) and `LAYOUT_VERSION` stayed
    private. Four doc comments that sat stacked above other code moved to what they describe:
    `bindSvgMarkup`'s (it sat above `LAYOUT_EL_ATTR`), THE HUG's (now directly above
    `growthRuntimeJs`), the relationship table's (above `layoutDataJs`, not `saidLines`) and
    `svgFontCss`'s (not `aliasFontFaceCss`). The multiset check after them still shows only the
    one changed phrase.
  - Harness: 577 records, every pass green, the snapshot file untouched. The runtime record was
    compared with this machine's baseline taken on `13b326773` before the change
    (`SVG_CORPUS_RUNTIME_LOCAL`). Run time 6.3 s for the test file.
  - `check-catalog-emit`: PASS, 528 designs, `svg01` unchanged.
  - The two Node tests: 5 and 5 green in about 0.15 s each, discovered by `gates.mjs` as build
    tier (`gates.mjs audit` OK). Probes, each made and reverted: dropping the lower weight clamp
    in `aliasFontFaceCss` failed the alias test; dropping the nudge comment in `layoutDataJs`
    failed the whole-table test.
  - `tsc`, ESLint on the folder and the tests, `depcruise src` (no violations),
    `gates run --changed origin/main` (all checks, 6 test files, 33 tests) green;
    `vote-board-bars`, `readout-ink` and `behaviour-removed-layer`, which bundle `svg.ts`, pass.
- **AC-4 line counts:** `svg.ts` 2,847 lines, of which 2,436 are the runtime strings phases 4 and 5
  move (`SVG_FIT_JS` 1,468, `SVG_FIT_BOOT` 27, `SHAPE_SHIFT_JS` 71, `growthRuntimeJs` 870) and 411
  are TypeScript. No new file is over 800. Decision: "`svg.ts` under 500 lines" is read as the end
  state after phase 5, as §2.1's column "After phase 3 to 5" states. The runtime cannot leave
  `svg.ts` inside this fence (that is phases 4 and 5), and moving it into another TypeScript file
  would add a file outside the fence and over 800 lines.
- **Decisions:**
  - `SVG_ALIGN_WORD` moved to `svgLayout.ts` (§2.1 does not list it): `layoutDataJs` writes it into
    the table's comments, and leaving it in `svg.ts` would make `svgLayout.ts` import `svg.ts`, a
    cycle, and pull the whole build into the Node test's bundle.
  - Exported only what another file uses: `LAYOUT_EL_ATTR` (the growth runtime in `svg.ts`
    interpolates it), the two token helpers (`bindSvgMarkup` stamps with them), `layoutRules`,
    `saidLines`, `layoutDataJs`, `candidateLabel`, `bindSvgMarkup`, `svgFontCss`.
  - `aliasFontFaceCss` stays private; the test reaches it through `svgFontCss`.
  - ARCHITECTURE §8 does not list this folder's files, so it is unchanged; the file map is in the
    folder's `AGENTS.md`, one line per file.
- **What the next phase must allow for:**
  - The runtime strings interpolate `PREFIX`, `SVG_ALIGN_TOL` and `SVG_LINE_HEIGHT` (fit and boot,
    in `svg.ts`) and `PREFIX` and `LAYOUT_EL_ATTR` (growth, imported from `svgLayout.ts`). The
    `NOACG_LAYOUT` text with `PANEL_SAFE` and `LAYOUT_VERSION` is `layoutDataJs`'s and not runtime.
  - THE HUG's doc comment now sits directly above `growthRuntimeJs`, ready for phase 5.
  - `svg.ts`'s TypeScript is 411 lines; the `?raw` imports and `fillRuntime` must keep it under
    500.
  - The nightly's traced e2e map (`scripts/e2e-traced.json`) has no entry for the three new files
    until the next nightly. Until then a change to `svgBind.ts` alone selects 60 specs and misses
    `editor-fidelity-trim` and the other specs traced to `svg.ts` (72 for `svg.ts`), the #927
    pattern. Phases 4 and 5 change `svg.ts`, so they are covered.
  - Two comments outside this fence still name `svg.ts` as the home of a moved function:
    `designTypes.ts:390` (`aliasFontFaceCss`) and `components/wizard/import/draft.ts:1355`
    (`bindSvgMarkup`). Whoever next edits those files can point them at `svgFonts.ts` and
    `svgBind.ts`.
- **Findings (D10):** none new from the harness; the five recorded findings are unchanged. The
  review of this pull request read the moved code and named pre-existing behaviour, none
  reproduced here and none a move may change: `layoutDataJs` writes a label or a field title into
  a `//` comment without taking out line breaks, so a name holding a newline would end the comment;
  `setIdKeepingRefs` carries `href` and `xlink:href` but not `url(#id)` references when it moves a
  colliding id, and does not check that `layer-<id>` is free; two picture fields filled from one
  shared Figma `<image>` would both bind that node; `candidateLabel` reads `data-name ?? id` rather
  than the reader's own `svgLayerLabel`; and `candidateLabel` parses the markup again per growth
  rule. Each wants a reproduction on a real file before a fix of its own.
- **Traps:**
  - The scratchpad is shared across this plan's sessions. A `SVG_CORPUS_RUNTIME_LOCAL` file that
    already exists is compared against, not rewritten, so an earlier phase's file silently
    becomes the baseline. Use a fresh path per phase.
  - `sed -i` on Windows still rewrites a file's line endings; harmless for a commit
    (`core.autocrlf`), but restore a probe with `git checkout -- <file>`.

### Phase 2: one door for the draft (build, 2026-10-13)

- **Last check's findings (phase 1, PASS):** the checker's own bind probe (a clock suffix) was
  caught by `bind` and `emit` on the one file it touches. Its inventory probe (`numberRepeats`)
  was caught by `inventory` on 6 files, with `fieldList`, `fields` and `emit` downstream, while
  `bind` and `layout` stayed green. CI's factory job ran the harness twice on `f6634cbd`, 106 of
  106, with the runtime compared on Linux. The fence held on #1122's own diff
  (`abd2b7f45..f6634cbd` also carries #1121). The decisions sit within D3 and §1.3. The runtime
  record does not read the countdown readout (D2 scope). Whether `student-illustrator-quiz` in
  `GROWTH_FINDINGS` is stale was not walked in the app.
- **Main before:** `f6634cbd6f3b65ade1f0d5f5e7af58a82ab82333`. Merge sha: the queue's merge of this
  pull request. Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and
  `/queue-merge`. It puts the drop and clear assembly back inline in `CreationWizard.tsx`, the copy
  back in `__importDraft`, and takes the `draft` record out of the snapshot.
- **Built:** `svgDraftFromImport(result, { resolution, previous })` and `svgDraftCleared(previous)`
  in `import/draft.ts`, where `previous` is the draft's `name` and `designSvg`. Their bodies are the
  wizard's removed lines with the comments, unchanged except `draft` reads as `previous`.
  `CreationWizard.tsx` now calls them: six imports out, two in. The drop's return type names every
  key it sets, so leaving one out does not compile; the clear's names every `svg*` key of the
  slice, so a new one does not compile until the clear resets it. `proposeSvgExtras` and
  `graphicNameFromFile` lost their last outside caller and are no longer exported.
  `__importDraft(svg)` is `svgDraftFromImport`
  for a fresh draft at 1920 x 1080. The harness reads its behaviour from the draft and adds a
  `draft` record: the drop patch without the rows `proposal` and `fieldList` already pin (so
  one change fails one record), with the read result as its fitted `size` and `restIsTheRead`
  (every other `designSvg` key equals the reader's value; true on all 48 files). Because the
  corpus drops only fresh drafts of unnamed files, a harness test also pins the name a drop
  gives and the patch a clear returns (five drops, two clears). ARCHITECTURE §5 carries the
  counts and the command.
- **Proof, the temporary assertion** (`scripts/tmp-svg-draft-door.test.mjs`, run in this worktree,
  then deleted). The old side was lines 2006-2133 of `CreationWizard.tsx` at `f6634cbd6`, pasted with
  types stripped, `patch` returning its argument and `draftResolution(draft)` as `res` (a
  whitespace-insensitive diff against the removed lines showed only those changes). The new side
  was what the wizard now runs:
  ```js
  const newDrop = (draft, brand, res) => ({
    ...D.svgDraftFromImport(result, { resolution: res, previous: draft }),
    ...(brand ? brandPatch(brand) : { paletteId: null, customPalette: null, fontId: null }),
  });
  const newClear = (draft) => D.svgDraftCleared(draft);
  ```
  For every corpus file (`result.fileName` set to the file's name), it crossed 5 previous drafts
  (blank name; a typed name; a blank-space name; the name an earlier file gave; the same name
  after another file) with 3 brands (none; a catalog palette; a captured palette with a custom
  font and a logo) and 3 frames (1920 x 1080, 1280 x 720, 3840 x 2160), plus the clear for each
  draft. It compared with a strict structural equality where an undefined key is not an absent key:
  `[draft-door] 49 corpus files (1 refused), 2400 cases, 10 files propose a behaviour, 46 fitted
  down at 1280x720, 0 differences`. Probe: making `newClear` keep the name failed it on all 48
  files.
- **Harness:** 577 records (529 plus 48 `draft`). Without a re-record, only `draft` failed (no record);
  every other pass matched, and the runtime matched this machine's baseline, taken on this
  branch before the harness switched (`SVG_CORPUS_RUNTIME_LOCAL`). After the re-record, the
  snapshot without its `draft` keys is identical to `f6634cbd6`'s (parsed and compared). The
  patience diff is 1,200 added lines and none removed. Run time 5.6 s for 49 files on this
  Windows machine. `vote-board-bars.test.mjs` and `readout-ink.test.mjs`, the other two callers
  of `__importDraft`, pass. Findings unchanged: the same five.
- **§5 command:** prints as code references exactly `svgDraftFromImport`, `svgDraftCleared`
  (`CreationWizard.tsx`), `svgDesignOptions`, `withSvgImportPasses`, `SvgImportDraft`
  (`draft/core.ts`), `behaviourSummary` (`FinishStep.tsx`). It also lists `armTimerClock`
  (`naming.ts:194`) and `DesignFieldSpec`, both only in comments. `import/draft.ts` exports 18
  functions and 20 types.
- **Decisions:**
  - The brand stays with the shell, which patches it over the drop the same way as on every
    other road (`brandPatch(brand)`, or the three look nulls). `import/draft.ts` cannot call
    `brandPatch` without a value cycle (`draft/template.ts` imports `draft/core.ts`, which imports
    `import/draft.ts`). No key of the drop patch is a brand key, so the order is free. The brand
    case is in the assertion above.
  - The context is `{ resolution, previous }` rather than the whole draft, so the function says
    what it reads. Its return type is the slice without `designKeepBakedText` plus the
    wizard-level keys the drop sets (`importedImages`, `name`, `category`, `variantId`, `lines`,
    `zone`, `animation`), built from `DraftPatch` and `WizardDraft` (type-only imports from
    `draft/core.ts`, the precedent of the step files).
  - The drop still leaves `designKeepBakedText` alone, as before, even though its comment says a
    fresh drop clears it. That is a raster-road answer, and changing it is not a move.
  - ARCHITECTURE §5's `planFor` command used `require`, which `e2e-affected.mjs` (top-level await)
    now refuses. It is now an `import()`. The plan sizes are 13 (`wizard/import/`), 62
    (`templates/importedDesign/`), 15 (`blocks/`) and 17 (`assets/svgImport.ts`). The four no-JSX
    files are 3,280 of 8,082 lines.
- **What the next phase must allow for:**
  - `__importDraft` takes one argument. `vote-board-bars.test.mjs` and `readout-ink.test.mjs` still
    pass a second (their own `proposeSvgBehaviour(svg)`, without the outside-canvas filter), which
    is now ignored. Those files are outside this fence, and both pass on the draft's own
    proposal. Whoever next touches them can drop the argument.
  - `import/draft.ts` now imports `FONTS` and `fontNameKey` from `model/fonts.ts` as values, so
    every bundle of it carries the font list, and the two tests above now get the bundled
    `fontId` match where they used to get null, as the wizard always did.
  - The empty SVG slice is written three times: `initialDraft` (`draft/core.ts`),
    `svgDraftCleared`, and the raster drop `onArt` in `CreationWizard.tsx`. The clear's type now
    catches a missing `svg*` key; `initialDraft` is typed whole; `onArt` is not checked. One
    shared constant would close it; that touches `onArt` and `core.ts`, outside this fence.
  - `docs/work-specs/wizard-structure/spec.md` (landed in #1124) cites `onSvg` at 2006-2127 and the
    eight-name seam. After this phase, the handler is 11 lines and the seam is four functions plus
    the clear and one type.
- **Traps:**
  - The harness copies the `draft` record (through JSON) the moment the drop returns, so the step
    mirror and the build cannot change it afterwards. `fieldList` is not copied that way: it is
    the rows as the build left them.
  - The `draft` record leaves out the rows, so a drop-time row the step then re-answers (text
    outside the frame) is pinned only as the step leaves it. No corpus file has one today.

### Phase 1: the corpus harness (build, 2026-10-13, pull request #1122)

- **Last check's findings:** none (first phase).
- **Main before:** `abd2b7f45c097753eddbabb969022d89db782674`. Merge sha: the queue's merge of #1122.
  Revert: `git revert -m 1 <merge sha>` on its own branch through `/check` and `/queue-merge`. It
  removes the test, its snapshot, the plan paragraph and the `__importDraft` extension; the two
  other callers of `__importDraft` pass either way.
- **Built:** `scripts/svg-import-passes.test.mjs` (factory tier, discovered from its header;
  `gates.mjs audit` OK) and `scripts/fixtures/svg-corpus-passes.json` (about 500 KB). Eleven
  records per accepted file: `inventory`, `proposal`, `fieldList`, `step` (growth default and fill
  gap), `bind`, `layout`, `behaviour`, `fields`, `fontCss`, `emit` (sha256 of html, css, js),
  `runtime` (at rest and at every `LADDER_VALUES` length: lines, size as a percentage of the drawn
  size, overflow, and every growth rule's box). The refusing file records only its message.
  529 records.
- **Run time:** 5.5 s for 49 files on this Windows machine (the whole test file 6.0 s); 8.8 to
  10.3 s on CI's factory job (four runs). The spec's estimate was under 60 s.
- **Probe (AC-1):** made and reverted in the builder's worktree:
  ```diff
  -  root.setAttribute('class', classes.join(' '));
  +  root.setAttribute('class', classes.join(' ') + ' ');
  ```
  Result: `bind` failed naming 48 files (every accepted file; `geometry-unescaped-ampersand` is
  refused and has no bind record), `emit` failed on the same 48 (the html hash), and `inventory`,
  `proposal`, `fieldList`, `step`, `layout`, `behaviour`, `fields`, `fontCss` and `runtime` stayed
  green. A long text is shown from where it first differs:
  `(whole) at character 254: "...class=\"imported-design-art\">..." -> "...class=\"imported-design-art \">..."`.
- **Findings (D10), 5, recorded under `findings`:**
  - `effects-figma-masked-reveal`, `inkscape-flowed-text-card`, `nested-svg-sub-artboard`,
    `ticker-strip-3840`: growth default `grow-xy`, sidecar `shrink`. Four of the five
    `GROWTH_FINDINGS` in `e2e/import-svg-corpus.spec.ts`.
  - `figma-outline-text-title-card`: 0 outline rows, sidecar 2. Figma writes one path per
    outlined text layer, and the reader offers a row only for a group of two or more glyph shapes.
    The corpus e2e gate never reads this file (it walks only files with a text field), so this
    finding was not listed anywhere.
  - Not reproduced: `student-illustrator-quiz`, the fifth `GROWTH_FINDINGS` entry. The harness
    reads `shrink`, as its sidecar states, because a quiz is proposed at drop and the step stands
    growth down when a behaviour is attached. The e2e list may be stale on that file. Not walked
    in the app to confirm.
- **Two CI runs (AC-8):** the transform records (every pass but `runtime`) matched a Windows
  recording on the first Linux run. The runtime record differed on 14 of 48 files, the same 14
  with identical numbers on two Linux runs (jobs 115426620902 and 115429883175). With the same
  font files, Chromium on Windows hints glyph advances differently, enough to move a wrap. So the
  runtime record is Linux's (D3's stated fallback, "pin the runtime record on CI only"), taken from
  the second job's printed records. Off Linux it is measured and its differences counted in the
  skip message, not compared. With those records committed, two runs of the factory job on the
  same sha `136e7799e` passed with every record equal (jobs 115434243996 and its re-run
  115436470170). `volatile` is empty: nothing differed between Linux runs.
- **Decisions:**
  - The `step` record mirrors three parts of the mapping step outside React, on an off-screen
    stage of the artwork's width with the step's own reveal rule: the text it measures outside
    the frame taken off, the growth effect of `MapSvgFieldsStep.tsx` (`proposeBannerGrowth`,
    `panelsHoldingText`, `repeatsWithNewContent`) and the fill gap `BehaviourSection.tsx` counts
    (`fillGap` over `measureBoxes`). The phase proof expects the `GROWTH_FINDINGS`, and §1.3 asks
    for the fill gap per file. The build and the runtime record then use the draft the step
    would leave: 21 files grow. `fieldList` is that draft.
  - The build is `IMPORTED_SVG.create` plus `withSvgImportPasses`, as §3 states, not the wizard's
    whole `buildDraftTemplate`: the wizard's later `withUniversalMotion` rewrite of the motion
    block is not in `emit` or in the runtime. The catalog baseline's `svg01` row is the other
    byte pin.
  - The runtime reads overflow from `svgFitOver` (what sets the `-overflow` class) and a growth
    rule's box from its painted client rect, as the fit sweep reads "wider"; the line's own
    geometry is not recorded.
  - Fonts: the bundled faces are served from `public/fonts` under a fake origin through
    `page.route`, every other request is aborted, and each family the file names that no bundled
    face matches is aliased to Inter in both the stage and the graphic.
  - Phase 1's draft records are `proposal` and `fieldList`; the name `draft` is left for phase 2.
  - The findings list fails the test only when it changes, so a new disagreement cannot land
    silently and a fixed one is re-recorded on purpose.
  - Runtime tolerance: sizes and boxes within 1, line counts and overflow exact; 4 for a
    `volatile` record.
  - Guards: the spec's list, plus all of `src/components/wizard/import/**` (the step mirror reads
    `stageMeasure.ts`, `fieldAutoMap.ts`), `CreationWizard.tsx` (the drop handler
    `__importDraft` copies), `src/model/fonts.ts`, `public/fonts/**` and `scripts/ladder-values.mjs`.
  - A runtime that throws fails the run naming the file; it is never recorded as a value.
- **What the next phase must allow for:**
  - Phase 2 switches the harness from `__importDraft` to `svgDraftFromImport` and adds `draft`.
    `proposal` and `fieldList` must not move. The harness overwrites `svgStretch` with the step's
    answer after the draft is built, so a drop-time `svgStretch` is not what the build sees.
  - `__importDraft` fits to 1920 x 1080, the default format.
  - On Windows, compare the runtime locally against this machine's own baseline: run once on
    main with `SVG_CORPUS_RUNTIME_LOCAL=<file outside the repo>` (it writes the file), then
    again on the branch with the same variable. Checked: a probe changing `SVG_LINE_HEIGHT`
    from 1.2 to 1.5 failed `runtime` on 44 files and `emit` on 48 against that baseline, and
    nothing else.
  - A re-record on Windows keeps the committed runtime. If a phase legitimately changes it, take
    the runtime from a failing CI run: save the factory job log and re-record with
    `SVG_CORPUS_RUNTIME_FROM=<log>`. A new corpus file gets no runtime off Linux until then.
- **Traps:**
  - `__importDraft` and the step mirror are copies of `CreationWizard.tsx`'s drop handler,
    `MapSvgFieldsStep.tsx`'s outside-frame and growth effects and `BehaviourSection.tsx`'s fill
    inputs. A change to those must change the copies. Phase 2 retires the first; no phase retires
    the step mirror, which a `stageMeasure.ts` function both sides call would.
  - The mirror does not measure outline boxes, so an `f:`-marked outline stays `box: null` and
    builds no stand-in. No corpus file has one today.
  - `crossCheck` restates the sweep's sidecar scoring (`svg-import-sweep.mjs score`) on the
    harness's data, without `noticeAbout`; a new sidecar column needs both.
  - The harness's fonts are not the app's. The app's stage falls back to system fonts for an
    unresolved family, the harness to Inter, so a borderline growth reading can differ from the
    walk. The sidecars and the e2e walk stay the authority.
  - `sed -i` on Windows rewrote `svg.ts` line endings during the probe. Restore with
    `git checkout -- <file>`, not a reverse edit.
