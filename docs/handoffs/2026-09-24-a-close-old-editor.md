# 2026-09-24 - Row A: nobody reaches the old code editor

Branch `claude/a-close-old-editor`, four commits: `7a4326ec` (the change), `e06d3253` (docs and
comments that still described the old link), `6576e499` (review fixes) and `906b9425`
(simplify), with this handoff on top. Night wave of 2026-09-24, goal 3.

## What landed

No route, door or setting opens the old code editor (AppShell) any more, and the studio no
longer ships it. Its source stays in the repository, as the owner asked.

- `src/App.tsx` does not import AppShell. The bare route, `#/` and any hash the router does not
  know render Home. A bare boot is still rewritten to `#/home` (returning reader) or `#/new`
  (first visit); an unknown fragment is left alone, because a Supabase sign-in or reset token
  arrives that way. `#/graphic/<id>` opens that graphic's control page and is rewritten to
  `#/control/<id>`, at boot and on an in-app hash change. The wizard's X and Escape always land
  on `#/home`.
- Advanced mode is gone: the Settings switch, `useAdvancedMode.ts` and every branch on it.
  `model/prefs.ts` is a versioned format now (`PREFS_VERSION = 2`, stamped `v`).
- Removed doors: the Blank card and `BlankStep.tsx`, Finish's "Open in the code editor", the
  footer's straight-to-code "Create project", the AI card's "Open as code" jump into AppShell,
  Home's "Continue editing", the Advanced branches on Home, a graphic row and the control page,
  EditorFoundation's "Existing editor", and VideoAppShell's editor branch.
- Every Finish door keeps the wizard open and routes away itself, so the `skipNavigation` and
  `keepGalleryOpen` parameters are gone from `applyGenerated`, `applyDraftProject`,
  `applyAiProject` and `applyImportedFile`. `openNewEditor({ replace })` is the one editor door;
  the wizard's "Edit this graphic" uses it with `replace`.
- docs.html: the three Advanced mode passages are gone. Adding a file to a graphic (Lottie
  included) and connecting a Google Sheet were only possible in the old editor, so the docs now
  say those roads are not open right now.
- Ten rules superseded through `npm run learn` by eight new ones (the six named, the prefs
  rule, the two Finish-door rules merged into one, and the header rule that counted AppShell as
  a fifth surface), plus one new root invariant, `root/render-old-code-editor-route-never`.

## Decisions, and the reasoning behind them

1. **Tests skip in the helpers, not file by file.** `enableAdvancedMode`, `switchToAdvancedMode`,
   `finishIntoEditor` and `createProject` in `e2e/_create.ts` now call `skipOldEditor()`, which
   skips the RUNNING test with a reason naming `docs/backlog/specs-that-still-open-the-old-editor.md`.
   A test skips exactly when it reaches one of them, so tests in the same file that never touched
   the old editor keep running, and a rewritten test stops skipping by itself. A `test.skip` at the
   top of every file would have skipped those healthy tests too.
2. **The blast radius is far bigger than the owner's 53.** He counted specs that switch into
   Advanced mode by name. `createProject` switched it on for every caller, so a static AST scan
   finds 687 of 974 offline tests in 95 files, and 24 of 34 configured tests, now skipping. I
   kept the skip rather than loosen `createProject`, because a bootstrap that lands on Home would
   turn several hundred skips into failures of unknown count on the night the queue must stay
   green, and the owner's own fallback was "skip the rest with a backlog pointer so CI stays
   green". The student demo roads still run unskipped: the whole wizard walk and Finish
   (`wizard-finish`, 29 of 30), `student-rehearsal`, `dashboard-operator-walk`,
   `playout-fixed-panes`, `library-productions`, `import-name-collision`, `route-transition-flash`,
   `network-resilience`, `storage-full` and the new `no-old-editor`.
3. **The render changes, not the router.** `parseRoute` still answers `editor` and `graphic`, so
   the router stays pure and AppShell (kept for porting) still type-checks against `Route`. App
   maps both at render and rewrites the URL only where the fragment is ours.
4. **No lazy import either.** Nothing renders AppShell, so App imports nothing from it and Vite
   bundles none of it. A lazy import would still build a chunk for code no route can reach.
5. **prefs writes on read only to scrub the retired flag.** A version-1 record that carries
   `advancedMode` is migrated and written back once, so the value leaves a shared lab computer at
   the first read. A record without it is left alone (reading never persists defaults), a higher
   numeric stamp is a newer build's and is read as the defaults and never written over, and a
   lower or unusable stamp migrates like version 1.
6. **Three specs deleted rather than skipped**: `advanced-mode.spec.ts`, `old-editor-doors.spec.ts`
   and `lazy-editor.spec.ts` (Monaco's lazy load inside AppShell). Their only subject was the old
   editor. `route-transition-flash.spec.ts` lost its Advanced test and gained a first-visit pin.
7. **Rewritten because they took minutes**: `network-resilience.spec.ts`'s two walks now end on
   the export door (they were the only tests of the boot watchdog's hydration timeout), the new
   editor's imported-SVG test opens through Finish's "Edit this graphic", `project.spec.ts` walks
   four surfaces instead of five, and the `@production` test in
   `e2e/configured/deep-link-boot.spec.ts` expects `#/control/<id>` and the control page's sign-in.
   The Blank card's own test in `flows.spec.ts` is deleted with the card.
8. **Owner-queue consolidation.** `2026-09-16-the-printed-link-opens-the-graphic`,
   `2026-09-21-a-wizard-exits` and `2026-09-21-j-last-old-editor-doors` described behaviour this
   change removes, so they are folded into `2026-09-24-a-no-old-editor.md` with their open
   questions carried verbatim, not dropped. `docs/backlog/create-project-is-a-door-that-saves-nothing.md`
   (the door no longer exists) and `docs/backlog/first-visit-boot-flash.md` (a first visit now
   paints Home under the wizard, never the editor, pinned in route-transition-flash) are deleted
   as served.

## Bundle, measured

`/app`'s boot download is the entry script plus the App chunk `main.tsx` imports, with their
static imports. Production builds of main at 2ef02332 and of this branch, measured by walking
the static import graph of `dist/assets`:

| | files | raw | gzip |
|---|---|---|---|
| before | 35 | 6663.9 KB | 1683.3 KB |
| after | 26 | 6415.2 KB | 1606.3 KB |

The App chunk alone went from 1897.4 KB (569.8 KB gzip) to 1669.7 KB (503.0 KB gzip). No
AppShell or CodeEditor chunk is built at all. The saving is real but modest: most of the boot
weight is the template catalog (`ograf` 2.3 MB and `frameGraphic` 1.45 MB raw), not the editor.

## What is left, and whose

- **Row F**: every test in `docs/backlog/specs-that-still-open-the-old-editor.md`. The cheapest
  big win is a `createProject` that does not skip: its body is still below the skip and, without
  it, ends on Home with the template in the working slot. Many callers only need that.
- **Row D** (relayed to its branch): `e2e/configured/agent-access.spec.ts` step 4 still expects
  `#/graphic/<id>` and the graphic opened as the working document.
- **Scripts**: `acceptance-pack.mjs`, `acceptance-shots.mjs` and `save-to-air-bench.mjs` still
  drive the old editor (listed at the end of the backlog file).
- **Optional**: `api/_lib/me/graphics.ts` could mint `#/control/<id>` so new links skip the
  rewrite. The rewrite has to stay for links already printed.

## Traps found in no repo file

- `deploy-verify.yml` runs the `@production` deep-link test against noacg.studio on every
  production deployment and four times a day. It now expects `#/control/<ABSENT_ID>` and "Sign in
  to open this panel". I could not run it against a deployment before landing (branches get no
  Vercel preview here). If it goes red after this deploys, look at the control page's
  needs-sign-in state first. A scheduled run between the merge and the deploy going live would
  also go red once, for no production reason.
- A `test.skip(true, ...)` called from a helper skips the running test, so no file needed an edit
  to skip; the runtime truth is the CI report's skipped count (full run 36058765639: shard 6
  alone skipped 101).
- `e2e/storage-full.spec.ts` seeded a graphic straight after `goto('/app')`, racing the durable
  store's hydration; CI lost the row once. It now waits for the startup wizard first.

## Verification

- **Build**: `npm run build` exit 0 on `906b9425`, and again on the handoff commit before queueing.
- **The new spec**: `e2e/no-old-editor.spec.ts`, 9 tests, boots every page with `advancedMode: true`
  stored and asserts through a MutationObserver that AppShell never entered the DOM. Green in
  jobs j-1823, j-1848, j-1849 and j-1851. **Mutation-checked** (j-1840): rewinding the wizard close
  to the editor route failed the X/Escape test, and keeping `advancedMode` in the migration failed
  the prefs test; the other seven passed both times.
- **Boot smoke** (inside the spec and route-transition-flash): `/app` first visit and returning,
  `/app#/`, `/app#not-a-route` (fragment kept), `/app?diag=1`, the blocked-bundle watchdog
  fallback, `#/graphic/<id>` at boot and in-app, and an unknown id.
- **Final gate run** j-1851 on `906b9425`: no-old-editor, route-transition-flash, editor-foundation,
  editor-alpha-entry, wizard-finish, network-resilience, storage-full, project, flows,
  wizard-entry-fit and import-svg: 124 passed, 58 skipped (the old-editor tests), 0 failed.
- **Full CI suite** dispatched on `7a4326ec` (run 36058765639): all nine shards green except one
  test, `storage-full.spec.ts` "Home's + Production says so". It did not reach the old editor; the
  seed raced the boot. It passed 7 of 7 locally before and after the fix, which now waits for the
  startup wizard before seeding. The orchestrator's relay about this run is read and answered here.
- **Trial merge**: `git merge --no-commit` of this tip with rows B, C and D (all queued) merged
  without a conflict, and `check:contracts`, `check:copy`, `check:contract-freshness`, tsc and
  eslint were clean on the result. Aborted afterwards.

## Check

- review: `delegated`. The code-review skill ran forked at high effort, scoped to merge base
  `2ef02332` and this branch's file list; its scope matched. 15 findings, 10 fixed in `6576e499`
  (prefs read path twice, the watchdog tests, em dashes, the duplicated editor door, the planner's
  CORE rows, the signed-in topbar test, the stale 2026-09-16 walk item and route table, the scripts
  list, and stale comments). Not fixed, by decision: the skip radius (decision 2), `ai.spec.ts`
  skipping whole (row F), `#/graphic` handled in three places in App.tsx (decision 3), and the
  deploy-verify window (traps). `agent-access.spec.ts` belongs to row D and went to its relay.
- simplify: `inline`. The skill returned fan-out instructions, so the pass ran here over reuse,
  simplification, efficiency and altitude. One edit: the wizard's dead `setActiveTab('html')`
  calls (`906b9425`). Altitude note: canonicalising `#/graphic` in the router and minting
  `#/control/<id>` in `api/_lib/me/graphics.ts` would remove two of App.tsx's three handlers; both
  are outside this row's files and left as a follow-up.
- verify: `inline` (above).
- taste: not applicable. Nothing here changes what a graphic looks like.

## Pointers

- Owner walk: `docs/acceptance/owner-queue/2026-09-24-a-no-old-editor.md`.
- Row F's list: `docs/backlog/specs-that-still-open-the-old-editor.md`.
- Rules: `contracts/rules/root/render-old-code-editor-route-never.md` and the eight superseding
  rules recorded 2026-09-24 (see `contracts/index.md`).
- Consumed: `docs/handoffs/2026-09-21-a-wizard-exits.md` and
  `docs/handoffs/2026-09-21-j-last-old-editor-doors.md`. Every open item in them is closed here or
  carried: the four doors they listed are gone, the Advanced-mode specs are in row F's list, the
  duplicate editor-door code is one helper now, the owner's Graphics-button question is in this
  row's owner-queue item, and their decision that Back from the Finish that "Open as code" reaches
  goes to the Import card's file step still stands (that road is now the only one).
