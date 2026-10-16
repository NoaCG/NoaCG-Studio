# AC-11 on hosted noacg.studio: package recovery and failed loading

Date: 2026-10-16, 08:15 to 08:21 UTC. The two cases `hosted-run.md` left open under AC-11, run on
https://noacg.studio with the published `@noacg/cli@0.12.1` and the owner's standing test account.
No credential or account address is recorded here.

## Setup

- Account: the owner's standing test account. Its CLI key was made for this purpose with the
  owner's approval in this session: `npx -y @noacg/cli@0.12.1 login --browser false` with an empty
  key store, and a Playwright script signed in to that account from the environment and pressed
  Allow on the consent card. The card named the test account and asked "Allow "NoaCG standing
  test agent on Legion-001" to save graphics and productions to your NoaCG account?". `whoami`
  then reported scopes `graphics:create, productions:create`. The key lives only in the owner's
  local environment; each command below received it as `NOACG_AGENT_KEY` for that one process,
  with every other `NOACG_*` variable removed.
- Graphics: two typeless scaffolds, `scaffold --fields "Title:text=Recovery check,Subtitle:text=AC-11 strap" --name "AC-11 strap"`
  and `scaffold --fields "Label:text=AC-11 bug,Score:number=7" --name "AC-11 bug"`. Both validate
  with 0 errors and 0 warnings.
- Browser: Playwright Chromium, headless, 1440x900, a NEW empty profile that had never opened
  noacg.studio. It signed in through the studio's own Sign in dialog. It answered no other prompt
  (the analytics question stayed open).

## Legacy pending-package recovery

1. 08:17:58 `save ./ac11-strap ./ac11-bug --production "AC-11 recovery check 2026-10-16"`:
   "Saved 2 graphics and the production ... in one delivery", production
   `595d34c6-8ca6-4563-9bf1-f3c1ff47daf6`, graphics `93bab179-0ff3-4011-9879-1136fbec696c` and
   `75a4a5e2-7459-49d0-91ab-cb9982a158f4`, "(confirmed by reading it back from the account)",
   operation `20c1ca89-4a9b-48e2-9f3e-64454e3e8b11`.
2. 08:18:10 `pack ./ac11-strap ./ac11-bug --name "AC-11 recovery check 2026-10-16" --save`:
   "Waiting on Home → Productions ... pending Install (confirmed by reading it back from the
   account)", package `1bd2f658-e5e2-4c51-8eb5-616ee995acc6`, operation
   `2c091393-f832-43d1-8c57-ab5ad2a8e258`, and "it is not a production until then". The CLI told
   the saved delivery apart from the pending one in its own words.
3. 08:18:45 the fresh browser signed in and opened Home → Productions. Before Install the nav
   counted Graphics 2 and Productions 1. The "Waiting to install" band listed "AC-11 recovery
   check 2026-10-16, 2 graphics · sent from your coding agent" with Install.
4. 08:18:57 Install: the row answered "Already delivered as "AC-11 recovery check 2026-10-16".
   Open it, or install a second production." with the buttons Open it, Cancel and Install anyway.
   The counts stayed Graphics 2 and Productions 1. The screenshot shows the warning in amber
   inside the waiting band, and below it the one production card with its two graphics.
5. Cancel, then a page reload 10 s later: still Graphics 2 and Productions 1, and the package
   still waiting. Nothing new was created.

## Failed loading

In the same browser profile, a Playwright route aborted every GET to `rest/v1/agent_packages`
(the waiting-list read) with `internetdisconnected` until the error showed, then let requests
through.

1. 08:20:18 to 08:20:25 the app tried four times (about 1, 2 and 4 s apart) and then showed, in
   the waiting band, "Waiting packages could not be loaded (TypeError: Failed to fetch)." with
   Retry. The production card stayed on screen beside it. The waiting row was not shown, and no
   text said that nothing was waiting.
2. 08:20:26 Retry: the error went away and the row "AC-11 recovery check 2026-10-16, 2 graphics
   · sent from your coding agent" came back with Install.

An earlier attempt that blocked only the first request showed no error, because the automatic
retries succeeded. That is the intended recovery, not a failure.

## Per criterion

AC-11 now has, on hosted noacg.studio: saved, pending-Install and browser-opened results told
apart (`hosted-run.md` steps 5 and 8, and steps 1 and 2 above); cancelled consent, wrong-account
opening and an uncertain-response retry (`hosted-run.md` steps 6, 9 and 10); failed loading and
legacy pending-package recovery (above). Whether AC-11 passes is the independent reviewer's call, recorded in `work.json`.

## Limits

- One run, one machine, Chromium only, scripted. The failure was a network abort, not a server
  error answer.
- The error wording carries the browser's technical text "(TypeError: Failed to fetch)". That
  is honest, but not plain language. It is a follow-up, not an AC-11 failure.
- A plain `scaffold --fields` with no `=value` defaults fails `validate`
  (`bench-entrance`, `bench-replay`), because empty fields show nothing on play. Giving the fields
  sample values fixed it. Recorded for the onboarding review, outside AC-11.
- Left in the test account for the owner: the production and the two graphics above, and the
  waiting package `1bd2f658-…` (not installed, not dismissed). The key stays active as the
  standing test key.
