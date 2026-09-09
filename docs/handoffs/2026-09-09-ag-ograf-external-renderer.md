# AG - the graphic in somebody else's renderer

Branch `claude/ag-ograf-external-renderer`. Row 7 of `docs/DEMO_2026-09-25.md` §7 is closed and
beat A7 is WORKS: an imported-SVG quiz board, carrying the behaviour its own layer names proposed,
runs and is driven in SuperFly.tv's ograf-server. Getting there found and fixed a defect that made
every operator action answer `200` and paint nothing.

## What landed

1. **`src/export/targets/ograf.ts` - `scopedWindow()`.** The fix. A graphic's timeline fires its
   lifecycle calls and measured-motion builders by NAME through `window[name]`; inside an OGraf
   Graphic the template's code runs inside `initTemplate`, so those declarations are local and the
   renderer's window has never heard of them. `initTemplate` now takes a `window` too, and the
   export hands it the names that graphic's timeline can fire.
2. **`e2e/ograf-conformance.spec.ts`** - one new test that judges an operator action on whether the
   graphic PAINTED, not on the 200 it answered. It drives with `skipAnimation`, so it never
   depends on a ticker. Ran green in CI (run 34414850947, shard 2/4).
3. **`scripts/ograf-external-walk.mjs`** - the walk as a repeatable script: the real import door,
   the real export, the server's zip endpoint, the renderer page, and every action through the
   server's HTTP control API, with a frame and a DOM read per beat.
4. **`docs/OGRAF.md`** - the 2026-09-09 round: the exact commands, what was refused, the A/B that
   isolated the fix, and the trap below.
5. **`docs/DEMO_2026-09-25.md`** - A7 to WORKS, row 7 deleted, and the R1.5 citation renamed with
   its spec (`e2e/import-svg.spec.ts:886`, the tail item).
6. **`docs/acceptance/owner-queue/2026-09-09-ag-an-imported-board-plays-in-somebody-elses-renderer.md`**.

## Two corrections the prompt asked for that were already done

The row was told `docs/DEMO_2026-09-25.md` cites `docs/backlog/docs-guides-to-write.md`, which
another branch deletes, and that it pins four gap-list cells to branch names the merge queue
deletes. **Both were already fixed on `main` before this row started**, by `f7961cbd` ("Bring the
25 September script up to date with what landed and with the deck"), which also closed rows 4 and
5. Verified rather than assumed: the file contains no `docs-guides-to-write` reference, and §7
carries no branch name (the only two, in §0, are historical pull-request references and are
correct). Nothing to change, so nothing was changed. The third tail item, the stale spec title,
was still open and is fixed in `b8a3916a`.

## The trap that cost this row about three hours, and is in no repo file

**A browser throttles `requestAnimationFrame` in a page that is not the visible one.** GSAP rides
that clock. A graphic in a background page therefore freezes part-way through its entrance and
never completes a state change - and that reads EXACTLY like a broken graphic: the actions answer
`200`, the machine really does move, the drawn states never appear, and there is no error anywhere.

Two Playwright runs of the walk and a long stretch of hand probing all reported a dead board for
that reason alone. I got as far as writing a wrong diagnosis into `docs/OGRAF.md` (that a
suppressed first-frame render was swallowing the time-0 lifecycle call) before a two-line GSAP
experiment disproved it. The prompt's own TRAPS section warned about this in one sentence and I
still walked into it, because the failure does not look like a measurement artefact - it looks
like the product.

What is now written down: the walk calls `page.bringToFront()` before it drives and before every
frame and says why; `docs/OGRAF.md` has a section on it. What is NOT written down anywhere:
**this applies to any Playwright page in a multi-page context, not just to a hidden browser pane.**
`e2e/ograf-conformance.spec.ts` and `e2e/exports.spec.ts` mount graphics in the test's own page,
which is the visible one, so they are fine - but a future spec that opens a second page and reads
motion from the first will get this, and nothing will tell it.

And the discipline that saved it in the end: **an A/B in the same conditions, one variable.** Same
foregrounded renderer, same data, same walk, two packages - the one this branch emits and the same
one with `scopedWindow` stripped back to what `main` emits. Without the fix nothing lights; with
it the pick, the LOCKED IN badge and the reveal all land. That comparison is what makes the verdict
a result rather than an impression, and it is what I should have reached for an hour earlier.

## What is left

- **No frames are committed.** The walk writes one PNG per beat into `ograf-external-out/`
  (gitignored), and it could not be run to completion after the fix - see the queue note below.
  The states were read out of the renderer's own DOM instead, and seen on screen. Anyone with the
  renderer built gets the pictures in one command.
- **The walk has not been run end to end since the fix.** Its three earlier runs proved the export,
  the upload, the listing and the whole action sequence; what changed since is `bringToFront`, the
  upload-id fix, the `--out` guard and the cleanup. Re-run it when the box has 4 GB free:
  `npm run queue -- "node scripts/ograf-external-walk.mjs --server <ograf-server-main>"`.
- **The renderer is not vendored** and has to be fetched and built once (four lines, in the
  script's header and in `docs/OGRAF.md`). It lives in this session's scratchpad, which will go.

## Needs the owner

Only one thing, and it is already in another item's message: **which renderer Yle brings.** This
round proves the package behaves in SuperFly.tv's ograf-server, the EBU repository's own reference
server. Nothing anywhere records what Yle actually runs, and A7's status is honest only about the
renderer we tested. `docs/acceptance/owner-queue/2026-09-09-g-yle-network-diag-screenshot.md` is
the message to add it to.

## A mechanism that is missing, and cost this row its evening

**The job queue has no way for a job to declare what it costs.** `costOf()` in
`scripts/jobs-store.mjs` reads `job.cost` and its own comment says "a job records its cost when it
is queued" - but `addJob()` never writes one, so every browser-driving job is one suite-equivalent
and needs 4 GB free. This walk is one Chromium with two pages and a Vite that was already up;
a full Playwright suite is four workers. The box sat at 2.0-3.2 GB free for about three hours
tonight with six other sessions landing, and the job never started. I did not lower
`NOACG_JOBS_FREE_MB`, because that is the runner's own environment and would have changed the
policy for every session's jobs, not just mine.

The fix belongs to whoever owns the queue: let `jobs.mjs add` pass a cost through to `addJob`, and
give a single-context browser script a smaller one than a suite. Until then, a row whose evidence
needs a browser can be blocked all night by other sessions' memory with no way to say "this one is
small".

## Pointers

- The renderer's two surprises, both now in `docs/OGRAF.md`: its renderer page is
  `/renderer/default/` (the route matcher reads the renderer TYPE, and the only type it serves is
  `default`), and `clear` takes `{filters: [{renderTarget}]}` rather than a bare render target.
- The graphic id is the custom element's tag name, because the renderer registers it with
  `customElements.define(manifest.id, class)`. That is what lets the walk find the mounted graphic
  without guessing a selector.
- `WRAPPER_BINDINGS` in `src/export/targets/ograf.ts` lists the names `graphic.mjs` declares at
  module scope and must be kept in step with them. A deeper fix would rename the wrapper's own
  helpers behind a prefix so no collision is possible; I did not, because those names are part of
  the readable generated code the docs and `GUIDE.md` refer to by name.

## /check

- `review: delegated` - the code-review skill, level `high`, returned seven findings, all inside
  this branch's diff (`src/export/targets/ograf.ts`, `scripts/ograf-external-walk.mjs`). Scope
  checked against `git diff --name-only a2ab4097..HEAD` plus `git status --porcelain=v1` (clean):
  branch `claude/ag-ograf-external-renderer`, merge base `a2ab4097`, nine files. Every finding was
  verified against the surrounding code and all seven were fixed in commit `a1238017`.
- `simplify: inline` - the skill returned fan-out instructions, so the pass ran here over reuse,
  simplification, efficiency and altitude. Two changes: the walk's DOM read took the graphic id it
  already knows instead of a hardcoded element name, and the `--out` guard collapsed to one
  branch. No reuse finding - the scripts here each carry their own small `waitFor`, and there is no
  shared one to call.
- `verify:` `npm run build` green. `npm run test:e2e:affected` was NOT run locally: it is browser
  work, and the queue's memory floor blocked every browser job on this machine tonight. CI covers
  it and then some - run **34416773176** is the FULL suite on this tip, dispatched deliberately
  because the push that carried the review fixes cancelled its own run: Build, Factory gates, the
  catalog calibration gate, all nine E2E shards, the combined report and the CI gate, every one
  green. Run 34414850947 had already put the new conformance test through the affected plan.
- `taste: not applicable` - nothing here changes what a graphic looks like. The fix changes whether
  a graphic's own state paint RUNS in a renderer, and the states it paints are the designer's own,
  unchanged.

## Safe to archive

Yes, once the queue lands it. Nothing is uncommitted, the branch is pushed, and the scratchpad
holds only the renderer build and a two-file drop server, neither of which anything here needs.
