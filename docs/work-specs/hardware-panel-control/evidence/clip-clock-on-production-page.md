# The production page's clip clock to a panel, configured (AC-2, AC-3, AC-7 in part)

Run on 2026-10-03 on the owner's Windows 10 laptop, branch `claude/cz-hardware-panel-convergence`
at 9b8e3892d (main at 358cb5035 plus this branch's spec). Closes what
`page-on-production-page.md` left open: a server clip's clock from the production page to a panel.

## The backend

A fresh local Supabase stack (`supabase stop --no-backup`, then `supabase start -x
studio,edge-runtime`): `supabase_migrations.schema_migrations` held 74 rows, 0001 to 0074, every
migration on main. The throwaway accounts CI uses (`e2e@noacg.local` and its teammate) were made
through the local admin API. Never production, never staging.

NoaCG Bridge 0.7.0 and CasparCG 2.5.0 are faked at the network layer by `e2e/_fakeBridge.ts`, the
fake the offline playout specs and `playout-status.spec.ts` use; only the relay is real. No real
Companion, deck, player or studio setup was touched.

## What ran

Job j-3031, `npx playwright test --config=playwright.live.config.ts --retries=0
panel-production-page.spec.ts panel-page.spec.ts panel-relay.spec.ts`: **10 of 10 passed**, none on
a retry, in 54.5 s.

`panel-production-page.spec.ts`, test 2, "the clip clock a panel counts follows the server clip the
production page plays" (10.2 s). On a published production with a server clip OPENER (15 s) on
2-10, with the panel paired and answering:

- the state reads `bridge: ok`, no clip, `pause-toggle` not allowed;
- the panel's `take-cue` on OPENER sends one `take` to the Bridge; the state then names the clip
  (`cue` OPENER's row, `label` OPENER, `phase` counting, `estimated` false), lists it live, allows
  `pause-toggle`, and its `end` lies 11 to 15.5 s after the state's `at`;
- the fake server jumps 9 s ahead with no press: a new state arrives whose end moved
  **9.00 s** earlier (logged), under 7 s left;
- `pause-toggle` from the panel sends `pause`; the state turns `paused` with `end` null and the
  frozen `remaining` between 1 and 7 s; the page's own clip clock reads `data-phase="paused"`;
  `pause-toggle` again sends `resume` and the state counts again;
- `select-cue` on OPENER, then the panel's `pause` and `resume` verbs, each allowed in the state
  before it, send `pause` and `resume` and move the phase the same way;
- the server runs past the end: the state turns `holding`, its end in the past, the clip still live;
- `take-cue` again sends `out`; the clip leaves the state and `pause-toggle` is not allowed;
- the dialog's Revoke button removes the panel from the list; the key's hello and its next press
  are refused `revoked`.

The page state to the module, over 13 states: p50 2 ms, worst 6 ms (logged by the spec from the
page's `at` stamp and the module client's receive time, one machine clock). On a local stack this
measures the page and the local Realtime only, not the cloud hop AC-7 is about.

The other 9: `panel-production-page.spec.ts` test 1 (the production page walk, relayed Take 12 ms
press call to result), `panel-page.spec.ts` (21 ms) and `panel-relay.spec.ts` 7 of 7, all as in
`page-on-production-page.md` and `server-relay-on-preview-branch.md`.

## Mutation

Job j-3032: `snapshotChanged` in `src/control/panelFeedback.ts` changed to treat a clip end that
moved less than 60 s as unchanged (the page then publishes nothing when the server moves the clip).
The clip test FAILED at "no the end moved with the server within 10000 ms". Restored with
`git checkout`; not committed.

## Not checked here

A real CasparCG behind a real Bridge (the fake models what a page can see of it); the module's own
count from these states (its fake-clock tests in `companion-module/` cover that); a hosted backend.
