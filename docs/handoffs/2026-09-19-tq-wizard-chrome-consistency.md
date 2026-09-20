# TQ - the wizard's Home row hover, and one top bar across Home and the wizard

Branch `claude/new-session-bde252`, worktree `.claude/worktrees/new-session-bde252`.
**LANDED** on `origin/main` as `77c87d25` (PR #329), tip `597ed36a`. Working tree clean.

Owner-raised, from a walk on 2026-09-19: "the home card doesn't get the
interaction animation when you hover over it", and "the size of the top bar tab on the home
screen and on the wizard home screen... they're different sizes". Both are now fixed and have
owner-queue walks: `docs/acceptance/owner-queue/2026-09-19-the-home-row-answers-a-hover.md` and
`2026-09-19-one-top-bar-across-home-and-the-wizard.md`.

Files touched (7): `src/styles/wizard-entry.css`, `src/styles/wizard-and-dialogs.css`,
`src/styles/mobile.css`, `e2e/wizard-entry-fit.spec.ts`, `e2e/wizard-shell.spec.ts`, and the two
owner-queue files.

Verified at `597ed36a`: `npm run build` exit 0; `npm run test:e2e:affected` exit 0 (1351 passed
plus the 35-test catalog gate); the two wizard specs green three runs in a row. Check stamped
PASS - review inline 3/3, simplify inline 3/4, verify inline.

## What is left

### 1. The full-screen wizard does not trap focus (real, measured, not fixed)

Tab order on the entry step walks the WHOLE Home page first. The wizard is an overlay -
`.wz-modal` covers the viewport and Home stays mounted underneath it - so of the 22 focusables on
that page, the first 11 belong to the page behind: Home's topbar, its search input, its shelf
cards. The wizard's own brand link is number 12 and the Home row's body button is number 16.

**Why it is worth doing:** the entry step is the product's primary door, and a keyboard user
opening it has to tab past an entire page they cannot see before reaching the first creation card.
It also makes any spec that wants to reach a wizard control by counting Tab presses unwritable -
`e2e/wizard-entry-fit.spec.ts` works around it by seeding focus on the control immediately before
its target, and that workaround is commented there with this reason.

Deliberately NOT done here: it is a behaviour change to the shell in the week of a live demo, and
the owner's constraint for that week was that nothing break. It is not a regression - the overlay
has always behaved this way.

### 2. `e2e-runs.mjs --orphans` does not see an orphaned VITE server (tooling, cost this session real time)

A queued Playwright job (`j-1394`) was reaped: the job store recorded `failed` with NO exit code
while its own log ended `87 passed`. `scripts/jobs-store.mjs` documents that shape - a job that
ends with no exit code of its own is recorded failed - so the record was honest. What it left
behind was a **vite** child still LISTENING on this checkout's port 5252, and:

- `node scripts/e2e-runs.mjs --orphans` answered "No orphaned Playwright processes" - it does not
  look for the webServer child, only for Playwright itself;
- the next `npx playwright test` was then refused by `scripts/hooks/guard-command.mjs`, correctly,
  because something was on the port;
- the guard's own advice (`--orphans`, then `--kill-orphans`) therefore could not resolve it, and
  it took a `netstat -ano | grep :5252` and a manual `Stop-Process` to clear.

**Why it is worth doing:** the two tools disagree, and the one that is right refuses while the one
that is wrong says there is nothing to clean. A session that trusts `--orphans` is stuck with no
path forward, and the failure looks like a branch problem rather than a leftover process. Teaching
`--orphans` to report whatever holds a checkout's reserved port - not only processes named
playwright - closes it.

### 3. Optional, low value

- The amber-token probe is near-duplicated in `e2e/wizard-shell.spec.ts` (pre-existing, inline in
  its own test) and `e2e/wizard-entry-fit.spec.ts` (added here). Deliberately not extracted:
  doing so rewrites a passing pre-existing test for no behaviour gain. A third copy is the moment
  to pull it into a shared `e2e/` helper.
- The separator dot beside the brand differs between the two bars - Home draws `.divider-dot` 4px
  from the logo in a hardcoded `#3d4756`, the wizard draws `.wz-title-sep` 10px away in
  `var(--border)`. Left alone on purpose: once the logo and the bar height stop moving, a 6px
  shift of a 4px glyph in a near-identical grey is under the threshold, and the wizard's spacing
  is its own "lockup · what you are making" reading. Owner's eye on a projector decides.

## Constraints worth carrying (pointers, not copies)

- `.wz-header` is the SHARED dialog header - about ten dialogs borrow it. Anything sizing the
  wizard's header must stay scoped to `.wz-wizard`, and `e2e/wizard-shell.spec.ts` fails if that
  scope is dropped. The reasoning is commented at the rule in `src/styles/wizard-and-dialogs.css`.
- `src/styles/mobile.css` names `.wz-wizard .wz-header` ONLY so it can win on source order. A
  `min-width` media query was tried first and rejected: it leaves a gap against
  `max-width: 768px` at fractional viewport widths such as 768.5.
- The entry step's vertical budget is pinned by `e2e/wizard-entry-fit.spec.ts` at 1366x768 and
  1440x900, and that file ALSO requires 1280x500 to still overflow - so a change that gives the
  step more room has to keep the third case true.
- Hover and focus colours in these specs are read off a throwaway probe element, never written as
  literals. Reading them off a hovered control captures a mid-transition value: this session got
  `rgb(235,160,36)` on the way to `rgb(246,166,35)` and held every later assertion to it.
- Wizard area contract: `src/components/wizard/AGENTS.md`.

## What this blocks, and what blocked it

Blocks nothing. Nothing blocked it.
