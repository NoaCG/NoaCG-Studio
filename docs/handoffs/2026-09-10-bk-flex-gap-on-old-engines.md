# BK - flex `gap` on old playout engines

Branch `claude/bk-flex-gap-on-old-engines`. A template that uses flex `gap` now renders with its
designed spacing on CasparCG 2.3's engine, proven on the real 2.3 server and shown unchanged on the
real 2.5, and the emitted template code did not change by a byte. The walk is
`docs/acceptance/owner-queue/2026-09-10-bk-flex-gaps-come-back-on-casparcg-2-3.md`.

## The engine number, settled

Three numbers were in circulation for CasparCG 2.3's Chromium: 63 (`vite.config.ts`), 75 and 88
(`engineSupport.ts`, the docs), 65 (`output.html` and nine other comments). The real one is **71**,
three ways:

- BH's measurement on 2026-09-10: the output page's `&debug=1` line on the install named
  `v2.3.3-lts-stable` says `Chromium 71`.
- The file itself: that install's `libcef.dll` is version `3.3578.1870`, and CEF 3.3578 is the
  Chromium 71 branch. The 2.5.0 install's says `142.0.17+...chromium-142.0.7444.176`.
- The download: the official GitHub release `v2.3.3-lts-stable` (2021-03-16, one asset,
  `casparcg-server-v2.3.3-lts-stable.zip`, 17,046 downloads) unpacks to a binary that answers
  `VERSION` with `2.3.2 4de6d18f Dev`, and its CHANGELOG.md opens with "CasparCG 2.3.2 Beta". There
  is no 2.3.3 binary with a newer CEF to download; the "2.3.3+ = 88" row was an inference from a
  machine nobody can identify, and it is gone. One row now: `casparcg-23`, 71, measured.

Every "~Chromium 65" and "~Chromium 63" in the tree now says 71; `docs.html`'s server table and
`docs/PLAYOUT_INTEGRATION.md`'s say what is and is not handled there.

**What `docs/DEMO_2026-09-25.md` owes (row BE mints it, so this row did not touch it):** beat A4's
sentence "compiled down to Chromium 75/88 with shims, which is what 2.3.x runs" should read
"Chromium 71 (measured), with shims for the APIs it lacks and for flex `gap`". And the beat should
say what the frames in this row show: on 2.3 a design's flex gaps are now right, but a design that
paints with `inset` (169 of 504) or `color-mix()` (229) still renders differently there. If the
room runs 2.3, pick a demo graphic from the 152 that render as designed on it (60 use none of
those features, 92 more needed only the gap fix); if it can run 2.5, everything renders.

## The measurement (step 2), and why a `gap:` count was not it

- Static, `src/templates/**`: 268 files declare a gap in some rule block; 385 of those
  declarations sit in a block that also says `display: flex` or `inline-flex`, 29 in a grid, 18 in
  a block whose display is set elsewhere.
- Lexical, `scripts/engine-floor.mjs --chromium 71` (the scanner the export screen uses): 504
  designs; 444 use something Chromium 71 lacks; by feature `gap` 319, `color-mix()` 229,
  `backdrop-filter` 199, `inset` 169, `clamp()/min()/max()` 18, `aspect-ratio` 6. 60 designs are
  clean; 92 are broken by gap and nothing else; 352 stay wrong after a gap fix.
- Rendered, `scripts/flex-gap-sweep.mjs` (new, this row): every design composed and settled at
  1920x1080, then every flex gap zeroed the way CEF 71 does it. **289 designs carry a flex gap
  between two or more painted items - 857 containers - and 286 of them move visibly when it
  collapses**, by up to 688px (the crawl) and typically 20-100px. That is the real number: not
  273 files, not 319 designs, and it is nine tenths of the catalog's flex gaps being load-bearing.

## The mechanism (step 4), and why the others lost

**Chosen: a runtime shim, `src/assets/flexGapShim.js`, carried beside GSAP by everything that
composes or exports a document.** `src/assets/flexGapSupport.ts` is its one home and says how it
travels: inline, as one tag with the id `noacg-flex-gap`, in `preview/composeDocument.ts` (the
editor, every preview, the output page), `render/composeRenderDocument.ts` and
`export/selfContained.ts` (the CasparCG, H2R and HTML-overlay single files); as the sibling file
`js/flex-gap-shim.js` referenced by one html line beside GSAP's in the SPX, show and dual packages
(`ensureFlexGapShimRef` at export, `addSharedAssets` writes the file); as `lib/flex-gap-shim.js`
loaded by the OGraf module the way it loads GSAP. The importer strips the inline tag by its id,
like the control receiver, so a round trip never carries two. A feature test runs first; on
Chromium 84+ the script returns at line one, and a second copy in one document returns too. Below
that it reads each flex container's computed gap, direction, wrap and in-flow items (elements,
bare text runs, in-flow `::before`/`::after`) from the live layout and writes the gap as inline
margins on the items, undoing its own writes before every pass so it always reads the authored
value. A MutationObserver refits whatever a rebuild or a class toggle touched, ignoring a style
write that changed only transform, opacity or their kin (a GSAP tween writes one every frame),
and takes its margins back off an element removed from its container. Wrapped containers get the
cross gap on every line after the first, found from where the browser actually broke the lines
(an item wholly past the line's cross-axis edge starts the next one).

Why the others lost:

- **A margin fallback beside every gap at emit time.** Doubles 385 declarations across 268 files
  with a `> * + *` rule a person has to be told about, which is the invariant this row was told
  to protect. And static CSS cannot do the job: it cannot see a hidden first item, a `-reverse`
  direction, a text run that is an item, `order`, or a wrap, and on a modern engine gap plus margin
  is double spacing unless the gap is removed, which rewrites the idiom for every engine to serve
  one from 2021.
- **A build-time CSS transform.** Stylesheet text cannot tell a flex container from a grid one
  (the display often sits in another rule); the export would carry code that differs from what
  the editor shows, against code-is-truth; and it would apply on every engine.
- **Rewriting the catalog to margins**, as `dc01`, `qz01` and `gt03` did by hand. 268 files, a
  worse idiom to read, and it does nothing for AI-generated, imported or hand-edited templates -
  a rule people must remember, where the shim is a mechanism. Those three designs are the trap
  made visible: each carries a paragraph explaining why it avoids `gap`.

Costs the shim carries, said plainly: on Chromium 71 it walks the DOM once at load and refits on
mutations (graphics are small; the sweep's crawls and 17-container boards were fine); a script a
curious person will see in the head of an export, so its header explains itself; and one known
band where it can differ from native - an item that fits its line without the gap but not with it
lands one line earlier. No catalog design settles in that band.

Three things the sweep caught that a first draft got wrong, all fixed and re-measured: a bare text
run inside a flex container is an anonymous item (the ticker's `▲ 1.2%`), so the gap beside it goes
on its neighbour's far side; an `auto` margin must be left alone, because getComputedStyle hands
back the px the engine resolved it to and adding a gap on top overshoots (`ig39`'s date); and a
container holding only `::before` and `::after` has no element to write to. Four more came out of
the review and are in the commit "Harden the flex-gap shim": the CSSOM rounds what is written
(`22.000000000000004px` reads as `22px`) so `undo` compared against a value it would never see; a
document with no layout (a display:none host frame) answers the feature probe with 0 on ANY
engine, which would have switched the shim on in a modern browser; the observer's child-before-
parent sort used "contains", which is not a total order; and the authored-margin array was
indexed pre-sort and filled post-sort, wrong for a container using `order`.

Then the review's eight fan-out legs reached the orchestrator and came back through the relay,
about forty findings, and the second round fixed what they were right about (commit "Carry the
flex-gap shim everywhere a document goes, and stop it churning under a tween"): a GSAP tween
writes the tweened element's style attribute every frame, and the observer refitted its flex
parent every frame - now a style record that changed only transform, opacity and their kin is
dropped on a string compare, with `attributeOldValue`; an element removed from a container kept
its margins - now `undo` runs on removal; nothing stopped two copies of the shim feeding each
other's margins without end - now a window guard; the export tag had no id and the importer
stripped it by the accident of its size and a word in its comment - now `noacg-flex-gap`,
stripped by id; the SPX splice landed before the charset meta - now the folder packages carry a
reference line at the end of the head and the file beside GSAP; the OGraf and LiveOS packages
did not carry the shim while the scanner said every export did - now they do; the panel hid the
listed `gap` finding on a clean design - now the list is offered whenever the scan found
something; the sweep counted with a different item model than the shim fixes - now it reads the
shim's own list from the simulated frame; the sweep's `<head>` regex also matched `<header>`;
wrap detection compared main-axis positions and missed a centred second line that is wider than
the first - now it reads the cross axis against the line's running edge; and startup ran the full
pass up to four times inside a second - now load, fonts and resize share one frame.

Weighed and declined, with the reason: the half-gap mechanism (every item half a gap on both
sides, the container minus half a gap) makes the wrap fit identical to native, but widens every
container's box by one gap, wrong wherever a container paints its own background or has a set
width, which in this catalog is most of them; the one-gap band where the facing-side margin can
differ from native holds no catalog design, and the shim's header says so. Replacing
`effect: 'shimmed'` with an orthogonal marker so the verdict could differ per target became
unnecessary once every target carries the shim. Rewriting the comments in `qz01`, `gt03` and
`dc01` that avoid `gap` by hand moves the catalog emit baseline and is a row of its own (below).

## The scanner's verdicts

`css-gap` in `src/validation/engineSupport.ts` now carries `effect: 'shimmed'`: still listed on the
export screen, no longer raising a template's required engine, with a sentence saying why.
`raisesTheBar()` is the one place that decides, shared by the scanner, the verdicts and
`scripts/engine-floor.mjs`.

## Evidence and traps that exist in no repo file

- **Frames**, this laptop, `C:\Users\ahonemi\AppData\Local\Temp\claude\...\scratchpad\frames\`
  (and the PRINTs in each server's media folder, timestamped 2026-09-10 12:xx-14:xx): for each of
  `sb01`, `st01`, `h201` on each of `2.3` and `2.5`, four frames - `-noshim-tween` and `-noshim`
  (700 ms into the entrance, and settled), then `-tween` and the settled frame with the shim.
  The tween frames are the answer to the review's churn question, read off the real engine: the
  gaps are in place mid-entrance and the server answers every command after. On 2.5 the pairs
  show the same graphic (a pixel diff finds only the entrance's own settle noise, because PRINT
  fires while the count-ups finish). The exported files stay in `C:\casparcg\templates\bk\` and
  the 2.5 install's `template\bk\` for the owner's walk.
- **Both walks were queued once with no `--after` between them and ran at the same moment.** The
  second server could not bind port 5250, its socket became a second client on the first server
  (the log shows every command twice), and its cleanup's `taskkill` took the running server down
  under the other walk. The walk script now refuses to start when 5250 answers; queue server walks
  strictly one after another.
- **`CG ADD` with no data throws inside the export.** The 2.3 log shows `Uncaught SyntaxError:
  Unexpected end of JSON input` for every load, with and without the shim: the CasparCG data
  shim calls `update('')` when the command carries no payload, and `JSON.parse('')` throws.
  Harmless here (the graphic then airs its defaults) and not this row's, but a row.
- **`inset` on 2.3 is worse than gap was.** `sb01`'s slab and score chips are `position:absolute;
  inset:0` pseudo-elements, and on 2.3 they simply are not there - the frames show white text on
  video. That is the next mechanism, and it is not this one: `inset` is dropped from the CSSOM, so
  a shim would have to expand the shorthand in the stylesheet TEXT (each inline `<style>`; the SPX
  folder package's `css/template.css` would need fetching, which CEF over `file://` may refuse -
  measure first). `color-mix()` is the same shape with colour arithmetic on top. Both are a
  decision about supporting 2.3 as a whole (`docs/PLAYOUT_COMPATIBILITY.md` §2 says 2.3 is not
  authored for), so they are named here rather than started.
- **The sweep thrashed the laptop once**: two 1920x1080 documents per design, batches of ten,
  and Chromium kept the detached iframes until a major GC - 7.2 GB and 29 minutes with no output.
  It now launches with `--expose-gc`, collects after every batch of five, and prints a line per
  batch, because the queue log shows nothing of a `\r` progress line until the run ends.
- **2.5.0 answers `PRINT` late** and writes the PNG later still; a walk that waits 2.5 s gets
  "(no reply)" and no file. Poll the media folder for the new file instead.
- **A 2.3 server needs `C:\casparcg\templates`, 2.5 its own `template\`**; `giorno.jpg` was copied
  into the 2.5 media folder so both walks composite over the same still.
- **The CLI's `npm --prefix cli run build` reports three TypeScript errors in `cli/src/mcp.ts`**
  (implicit any, a `Record<string, unknown>` argument) and still emits `dist/`. Pre-existing on
  main; not this row's, worth a row.

## Check

Scope from `node scripts/review-request.mjs` after taking `origin/main` in: branch
`claude/bk-flex-gap-on-old-engines`, merge base `fa8fa19c`, 26 files; `git diff --name-only` from
that base plus `git status --porcelain=v1` is those same 26 (the handoff was the one uncommitted
file). Before the merge the script listed 38, twelve of them other rows' landed files, because the
base had fallen at BH's tip; the merge and a `contracts:compile` re-run (no changes) fixed the scope.

- `review: inline` - the code-review skill returned a promise of later completion notifications
  rather than a result, so the leg was done here, over correctness, edge cases, races and the
  contracts in `src/export/AGENTS.md` and `src/templates/AGENTS.md`: four confirmed findings, all
  fixed in "Harden the flex-gap shim". Then the skill's eight fan-out legs reached the
  orchestrator and came back through this branch's relay (read before queueing, as the
  queue-merge workflow requires), about forty findings. Each was checked against the code: the
  ones that held are fixed in "Carry the flex-gap shim everywhere a document goes" and listed
  above; the ones declined are listed with their reasons above (the half-gap mechanism, the
  per-target shim marker, the three design comments). Two findings were about the same
  contradiction (the docs saying "unsupported" and "shimmed" in one row) and are answered by the
  tier rule now in `docs/PLAYOUT_COMPATIBILITY.md` §2. Asked versus built: the goal holds on the
  real 2.3 and the real 2.5, the emitted template code is unchanged, the count is measured and
  stated. Built without being asked: the `shimmed` effect in the scanner (without it the export
  screen would go on telling a user that 2.3 cannot render a graphic the shim now renders), the
  shim in the OGraf, LiveOS and render documents (without it the scanner's claim was false for
  two targets), and the panel listing a finding on a clean design. Not built: nothing asked; the
  two catalog baselines did not move (the shim writes nothing on a modern engine, proven on the
  sweep's native side), so nothing was minted.
- `simplify: inline` - the simplify skill returned fan-out instructions. Over reuse,
  simplification, efficiency and altitude, across both rounds: the authored-margin array became
  a field on the item; three tag builders became one module, `src/assets/flexGapSupport.ts`, that
  every composer and exporter imports; the sweep's second item model went, replaced by the
  shim's own list; the observer's `indexOf` dedup became a `Set`; four startup passes became one
  frame. Left alone on purpose: the sweep's fixed settle sleeps and ancestor-walking `painted`
  (a gate, not a hot path; listed under "Left undone").
- `verify: npm run build` green on its own exit code after each round (five runs over the day,
  the last over the final tree); `scripts/flex-gap-sweep.mjs --fail` over all 504 designs after
  each round, none off native (the last run: 289 designs, 857 containers, 286 move, 0 off);
  three designs aired on both real servers with and without the shim after each round, the last
  time with a frame 700 ms into the entrance tween as well as the settled one, and the 2.3
  server's log read afterwards (every command answered). `npm run test:e2e:integration` was NOT
  run on this laptop: it is a full suite, the day queue cannot start a cost-1 job while landings
  hold budget, and CI runs the same suite on a clean checkout of the merged tree - its run on the
  final sha is the gate. Read on `218bfd6f` (first round), run 34464694887: Build, Factory gates,
  E2E plan, Catalog calibration gate, E2E 1/9 through 9/9, Combined E2E report and CI gate all
  `success`; the second round's run is named in the commit that adds this line's successor, and
  the check stamp names the sha it covers.
- `taste: not applicable` - no design file, no shared template machinery, no fit or alignment
  code; the shim is inert on every engine a preview or a thumbnail renders on, which the sweep's
  native side measures. The frames from the 2.3 server are the graphics looked at.

## Left undone

- The `inset` / `color-mix()` / `backdrop-filter` question above - a decision, then a mechanism
  with the same shape as this one, measured on the same two servers.
- `scripts/flex-gap-sweep.mjs` runs by hand; it is not in CI or the nightly. It costs one browser
  for about eight minutes. Adding it to the catalog battery with `--fail` is the gate that keeps
  the shim honest when a design starts doing something new with flex.
- `src/templates/quiz/qz01.ts`, `gameTimers/gt03.ts` and `scoreboards/dc01.ts` each carry a
  paragraph explaining why they avoid flex `gap` for an older CasparCG. The shim makes that
  paragraph wrong, and the AI adapt path reads design comments as reference style, so it will go
  on turning `gap` into sibling margins for a reason the product now handles. Rewording them is
  three comment edits plus a deliberate re-record of `e2e/catalog-baseline.json` (emitted code
  is byte-compared), which is why it is not in this branch.
- The engine number is restated by hand in about fourteen comments and doc tables while
  `PLAYOUT_ENGINES` is declared the single home. A check beside `check-client-neutral.mjs` that
  reads `engineSupport.ts` and asserts the doc rows match would end the rewrites; this branch
  was the third.
- The sweep's `--expose-gc` lesson (a double-render sweep must collect between batches, or a
  16 GB laptop thrashes) belongs in `contracts/rules` with a `scripts/` scope; it is in this
  handoff's prose only.
- The sweep spends about five minutes of a run in fixed settle sleeps and walks every element's
  ancestors for `painted`; polling `gsap.globalTimeline.isActive()` with the sleep as a cap and
  one top-down pass would take a third off. Not done because the run is a gate, not a hot path.
