# 2026-09-24 - Row H: the closed old editor, walked on noacg.studio

Branch `claude/h-old-editor-live-walk`, based on `origin/main` at `8ba061ad` (row A's merge,
PR #409). Night wave of 2026-09-24.

## The build that was walked

`https://noacg.studio/version.json` answered `8ba061ad` (built 22:53:03Z) on the first run at
22:58Z, and `c8754c1e` (row C's merge #408, built 23:01:48Z, `deployedCommitIsCurrent: true`) on
the second run at about 23:05Z. `c8754c1e` contains `8ba061ad` (`git merge-base --is-ancestor`),
so both runs walked A's change. The deploy picked A up within four minutes of the merge; no wait
was needed. `?diag=1` printed the same build sha.

## How it was walked

A Playwright script in headless Chromium at 1366x768, run twice through the job queue (j-1870,
j-1873). Every page booted with `localStorage["spx-gfx-prefs"] = {"advancedMode":true}`, the lab
computer's state, and a MutationObserver recorded whether AppShell's markers
(`toggle-code`, `center-stage`) ever entered the DOM. Nothing needed an account: the only thing
created was a local graphic and production in the throwaway browser profile. The analytics banner
was declined.

Screenshots and the machine-readable log are on this laptop, outside the repository, in
`C:\claude\noacg-live-walks\2026-09-24-h\` (`walk.json` is the second run's log). The two one-off
scripts are kept beside them (`h-live-walk-spike.mjs`, `h-fix-shots-spike.mjs`); they were never
committed.

## Each clause

All paths below are in `C:\claude\noacg-live-walks\2026-09-24-h\`.

| Clause | Result | Screenshot |
|---|---|---|
| Build stamp carries A's merge | walked: `c8754c1e`, contains `8ba061ad` | `00-version.png`, `version.json` |
| X lands on Home | walked: `#/home`, no "Continue editing", old editor never seen | `03-x-lands-home.png` |
| Escape lands on Home | walked: `#/home`, old editor never seen | `04a-wizard-reopened.png`, `04-escape-lands-home.png` |
| The owner's own route (`/app#/new`, then X) in a fresh profile | walked: `#/home` | `16-owner-route-step1-2.png` |
| Settings has no toggle | walked: no switch, no "Advanced mode" or "code editor" text; Workflow defaults starts at Export target | `05-settings.png`, `05b-settings-workflow.png`, `05c-settings-nav-workflow-clicked.png` |
| No Blank card | walked: template, AI and Import cards plus the Video strip; no Blank | `02-front-page-three-cards.png` |
| No code-editor door on Finish | walked: the three doors are "Add to the production and go live", "Export it" and "Edit this graphic (Alpha)"; no "Open in the code editor", no "Create project" | `06a-browse-picked.png`, `06-finish-doors.png`, `06b-finish-full.png` |
| Home's graphic Open goes to the control page | walked: `#/control/<id>` | `07a-after-production-go.png`, `07b-home-graphics.png`, `07-open-graphic-control-page.png` |
| The control page's Edit graphic opens the new editor, which has no "Existing editor" | walked: `?editor=foundation#/editor-foundation` | `08-new-editor.png` |
| `#/graphic/<id>` for a real local graphic opens the control page | walked: rewritten to `#/control/<id>` | `09-graphic-link-real-id.png` |
| `#/graphic/anything` opens the control page | walked: `#/control/anything`, "Sign in to open this panel" (signed out) | `10-graphic-link-anything.png` |
| `/app#/` lands on Home | walked: `#/home` for a returning reader | `11-app-hash-slash.png` |
| `/app` lands on Home | walked: `#/home` for a returning reader | `12-app-bare.png` |
| `/app#not-a-route` renders Home and keeps the fragment | walked | `13-app-unknown-fragment.png` |
| The video workspace's Graphics button | walked: `#/home/graphics` | `14a-video-shell.png`, `14-video-graphics-button.png` |
| `?diag=1` renders the diagnostics | walked: all seven rows PASS, no topbar | `15-diag.png` |
| Entry bundle size | walked, read from the browser's resource timing (what the network panel shows) on a cold boot with the cache cleared | `01-app-boot-wizard.png`, `entry-bundle.json` |

Nothing was left unwalked. On the first run, a first-visit browser landed `/app` and `/app#/` on
`#/new` (the wizard over Home). That is the designed first-visit behaviour, not a defect; the
second run walked them as a returning reader (after the graphic existed) and both landed on
`#/home`.

**The entry bundle.** The entry script `app-6wj5_ijk.js` is 2 KB on the wire. A cold boot of
`/app` fetched 27 JavaScript files, 1,680 KB on the wire and 6,641 KB decoded; with CSS it is 29
files and 1,723 KB on the wire. No AppShell, CodeEditor or Monaco file was fetched. The biggest
files are the template catalog (`ograf` 455 KB wire / 2,346 KB, `frameGraphic` 335 / 1,477), the
App chunk (511 / 1,670) and `composeDocument` (148 / 463). That agrees with A's own measurement
(26 files, 1,606 KB gzip, App chunk 503 KB gzip): the live site serves brotli or gzip at about the
same size.

**The prefs migration.** The stored `advancedMode: true` stays in localStorage while a reader only
sees the wizard and Home, because nothing on those two reads the prefs. The first read (opening
Settings) rewrote it to `{"v":2,...}` without the flag. This matches A's own wording ("the first
time the studio reads its preferences") and the flag has no effect meanwhile, so it is not a
defect.

## Fixed on this branch

All three are in files row A touched, as the brief allows.

1. **The control page's lookup states were squeezed into a 190px column.** "Sign in to open this
   panel" and "Graphic not found" reused Home's two-column grid with no nav in it, so the message
   sat in the nav's column (measured on the live site: box width 190px). A stale link to a graphic
   this browser does not hold lands there, so students meet it. The grid is now one cell
   (`GraphicControlPage.tsx`). `e2e/no-old-editor.spec.ts` pins the width; mutation-checked, it
   fails at 190px with the fix removed (j-1880).
2. **The template card promised "Tweak the code it writes, or never open it."** No door opens
   code any more, so the sentence is gone (`EntryStep.tsx`). I decided to drop it rather than
   rewrite it into an export promise: the card is about the walk, and the other code promises are
   filed together (below) because they share one direction question.
3. **Home's recent-graphics cards printed the category id** ("lower-third") where the Graphics
   list prints "Lower third". They now use `graphicKindLabel` (`HomePage.tsx`); pinned in the same
   spec.

Branch screenshots of the fixes, from `vite preview` of this branch's build:
`branch\b1-control-lookup.png`, `branch\b2-front-page.png`, `branch\b3-home-shelf.png`.
Owner-queue item: `docs/acceptance/owner-queue/2026-09-24-h-live-walk-fixes.md` (kind `agent`).

## Filed, not fixed

- `docs/backlog/copy-that-still-promises-a-code-view.md`: the AI card's "Open as code" button and
  two error strings (the button now applies the file through the Import Finish), and the landing
  page's "readable code you can open". It also names the pillar tension: the root taste rule says
  the code is always available, and today only an export shows it.
- `docs/backlog/settings-escape-and-unstyled-hints.md`: Settings ignores Escape (measured live),
  and `p.dlg-hint` outside a `.dlg-row` gets no style, so four hint paragraphs render at body size.
- `docs/backlog/ai-tiers-clipboard-test-fails-on-windows.md`: a local-only test failure found by
  the verify leg (below).

## Seen, and judged not a defect

- At 1366x768 the Finish step's third door, "Edit this graphic", sits below the fold of the
  scrolling step pane. The two primary doors are above it, which is what the step's comment
  measures for. It is now the only editor door, so if the owner wants it visible without a
  scroll, that is a layout call for the Finish step.
- The Settings nav mark follows clicks on Workflow and Brand & style correctly.
- The only console error across both runs was the diagnostics' deliberate `/api` probe answering
  405.

## Check

- Scope: `node scripts/review-request.mjs`, merge base `8ba061ad`, 7 files; the review's file list
  matched `git diff --name-only` and `git status` exactly.
- review: `delegated`, the code-review skill forked at high effort. 8 findings, 5 fixed: the
  lookup grid also resets its rows (the phone media query set a nav row), the comment said three
  lines where the live page shows two, the comment and owner-queue item over-claimed which links
  land there, the shelf assertion picks its card by name, and the width assertion checks for a
  null box first. Not fixed: pinning the signed-in-only "Sign in to open this panel" branch (the
  offline suite has no backend; the configured deep-link spec checks its text), the handoff
  reference (this file), and the laptop paths in the backlog evidence (the text states the
  measurements, the paths are supporting).
- simplify: `inline`. The skill returned fan-out instructions, so the pass ran here over reuse,
  simplification, efficiency and altitude. Nothing to change. Altitude note: the one-cell grid is
  an inline style on Home's class; a `.home-body--single` modifier in `home.css` would be the
  general form, left alone because the brief limits fixes to A's files.
- verify: `inline`. `npm run build` exit 0 on the final tree; `no-old-editor.spec.ts` and
  `wizard-entry-fit.spec.ts` 27 passed (j-1875); `npm run test:e2e:affected` (j-1888) escalated
  to the full offline suite: 780 passed, 705 skipped (row F's old-editor skips), 2 failed. Neither
  failure touches this branch's files. `wizard-preview.spec.ts:518` measured a 684ms blank against
  a 400ms limit under full-suite load and passed 2 of 2 alone (j-1891). `ai-tiers.spec.ts:126`
  fails every time on this laptop because the Windows clipboard reads the install lines back
  with an extra character; filed as `docs/backlog/ai-tiers-clipboard-test-fails-on-windows.md`.
  Branch screenshots looked at.
- taste: not applicable. Nothing here changes what a graphic looks like.
