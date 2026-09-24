# G - hosted control parity

Branch `claude/g-hosted-control-parity`, worktree `.claude/worktrees/agent-a2f337d3c9c419ab0`,
based on `origin/main` at `2ef02332`. Recipe row: the two helpers (`canAdvance`,
`movedStateNames`, `src/control/controlModel.ts`) already existed and the in-app production
dashboard already used them (`docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md`); this row
wired the hosted control page to the same two functions.

## What was done

`src/components/HostedControlPage.tsx` now computes `nextMoves` (`canAdvance` on the selected
graphic's own machine) and `keptStates` (`movedStateNames`, formatted through the same
`machineStateNames`) once in the page component, and threads both down:

- `HostedVerbs`' `» Next` button greys on `!layerLive || !nextMoves` and its title names the
  graphic and says it is on its last step, matching `ProductionPage.tsx`'s `verb-next` wording
  exactly. The `N` keyboard shortcut (`runVerb`) is gated the same way.
- `HostedVerbs`' `✎ Update` button's title reads "Sends the values. Stays on `<states>`." when
  something is up for Update to keep, matching the in-app verb bar.
- `HostedCueEditor`'s unsent-changes note now reads "... ✎ Update keeps `<states>` on air,
  ⟳ Re-take starts over with these values" once there is something to keep, matching the in-app
  cue editor's note.

`e2e/hosted-control.spec.ts` gained two tests (the hosted page cannot be mounted offline, so both
work at the level every other offline test in this file already does):

1. A source-level check that `HostedControlPage.tsx` actually calls `canAdvance` in the Next
   button's `disabled` expression and `movedStateNames`/the "Stays on" sentence in Update's
   title - pinning the wiring itself.
2. A behavioural check of `canAdvance`/`movedStateNames` over a small hand-authored four-waypoint
   machine (Question, Locked in, Reveal, then the authored Out step), confirming Next greys
   exactly past the last waypoint with no authored exit arrow and Update names only a state the
   graphic has actually moved into.

`node scripts/jobs.mjs add "npx playwright test e2e/hosted-control.spec.ts --workers 1" --cost 0.5`
ran as job `j-1850`, exit 0 (15/15 passed).

## The g2 handoff's open items, traced

`docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md` is deleted; every item in its "Left, and
why" section now has a home:

- **HostedControlPage Next/Update parity** - closed by this row, commit on this branch.
- **Row E's items 6-8** (the undocumented "Reveal choice" button, whether an empty log after
  reload is the right design for a class, and row C's still-open Reveal-from-a-reloaded-hosted-tab
  finding) - filed as
  `docs/backlog/hosted-and-quiz-dashboard-defects-from-the-friday-rehearsal.md`.
- **Queue starvation seen that night** - already resolved within the g2 session; row N's fix
  landed as commit `58662733`, named in the handoff's own text.
- **The merge queue's first refusal** (run 35663497961, a band-heading assertion scoped to the
  wrong SVG) - already fixed within the g2 session itself (commit `7a4c2977`/`d9f6dc33` per that
  handoff), nothing left to trace.
- **The E2E retry job's JSON-parse crash** (same run, `mergeBlobReports` on `merge-reports`'
  stdout) - unreproduced locally, so filed rather than guessed at:
  `docs/backlog/e2e-retry-job-parses-merge-reports-stdout-and-a-stray-log-line-corrupts-it.md`.

## The check

`review: delegated`, 1 finding, 0 fixed. The code-review skill flagged that `nextMoves`/`keptStates`
read `spec.js` (the selected graphic's own panel spec) rather than a pool-wide machine map, citing
`hostedCombine.ts`'s "every published graphic's machine" comment. Verified against the code and
refuted: that comment describes `hostedCombineNow`/`hostedCombineWorld`, the COMBINED-control
machinery that spans several graphics by design; `canAdvance`/`movedStateNames` are inherently a
single-graphic question (does THIS graphic's Next do something, what does THIS graphic's Update
keep), and `spec.js` is the same graphic's own template js that `ProductionPage.tsx`'s
`poolMachines.get(selectedGraphic)?.js` reads too (both ultimately read `tpl.js` / the panel's own
`js` field for the SAME selected graphic). No fix made.
`simplify: inline` (the skill returned fan-out instructions). Reviewed the diff on all four
angles; nothing to change - the only duplication (`machineStateNames(spec.js)` computed once in
the page and again inside `HostedCueEditor`) is two cheap parses of a small JSON block on a
non-hot path, not worth new prop plumbing to avoid.
`verify: inline`. `npm run build` exit 0. `npm run test:e2e:affected` (branch has not taken `main`
in since scoping): 143 passed.
`taste: not applicable`. Nothing here changes what a graphic looks like; the change is dashboard
button state and copy.

## Owner walk

`docs/acceptance/owner-queue/2026-09-24-g-hosted-control-parity.md` - the route needs a published
production and a configured backend (the hosted page cannot be reached otherwise), so it doubles
as a pointer to the offline pin in `e2e/hosted-control.spec.ts` for anyone checking without one.

## For the owner

Nothing needs an account, money or identity from here. The three Friday-rehearsal items and the
E2E retry crash are backlog, not blocking.

## Commit

`e363dd5c` (the wiring, the spec, the two backlog files, deleting the g2 handoff).
