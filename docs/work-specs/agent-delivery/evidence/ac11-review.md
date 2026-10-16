# AC-11 independent review

Date: 2026-10-16. Reviewed revision: `1149b772d5b21c8beac2b6b0a35aae6d9703eb36`, which adds
`ac11-hosted.md` on top of `main` `459fc028c`. The reviewer did not make the runs. No credential,
key or account address is recorded here.

## What was read and checked

- `spec.md`: AC-5, AC-9, AC-11, Phase 4 and 5 text and their phase notes; `final-check.md`;
  `hosted-run.md`; `ac11-hosted.md`.
- The run's own material in the session scratch directory (not committed): `save.log`,
  `pack.log`, `recovery.log`, `failload.log`, the five screenshots, and the scripts that made
  them (`ac11-browser.mjs`, `noacg-test.mjs`, `approve.mjs`). Every quoted line, id, count and
  timestamp in `ac11-hosted.md` matches the logs. The screenshots show what the receipt says:
  the waiting band with Install over one production card with two graphics; after Install, the
  amber line "Already delivered as ..." with Open it, Cancel and Install anyway, nav counts still
  Productions 1 and Graphics 2; after Cancel and reload, the same band with Install and the same
  counts; under the injected failure, a red "Waiting packages could not be loaded (TypeError:
  Failed to fetch)." with Retry and no waiting row and no "nothing waiting" text; after Retry, the
  waiting row back.
- Product code: `ProductionsSection.tsx` (`installWaiting` asks `installOverlap` before any write
  and returns on a repeat, so Cancel leaves nothing to undo; a failed list load sets its own
  `waitingError` state with Retry), `productionDelivery.ts` `deliveryOverlap` (a production is
  named only when every graphic matches by `origin.item` and code), `agentPackages.ts`
  (`listWaitingPackages` throws on error rather than returning an empty list).
- Read-only on the hosted account, with the published CLI 0.12.1: `status` of the package
  `1bd2f658-...` and its operation still answers pending Install, so the Install was never
  settled; `status` of operation `20c1ca89-...` and production `595d34c6-...` answers saved and
  verified. `doctor` reports bridge `main@459fc028c0`; `main` has not moved since 07:55 UTC, so
  the 08:15 run almost certainly ran on that revision. The receipt itself does not record it.
- Code changed since the previous review (`cc622a9b1`): #1292 generalises the graphic lookup to
  productions (`graphicWhenSynced.ts`, `ProductionPage.tsx`) and its configured spec. The graphic
  path is a refactor with the same behaviour; the production page now waits for the account
  before saying "no longer exists", which fixes the issue `hosted-run.md` found. Nothing there
  weakens AC-1 to AC-10, so their statuses stay.

## Verdict per open point

- Saved, installed and browser-opened told apart: holds. `save` says saved and read back; `pack`
  says pending Install and "not a production until then"; the agent in `hosted-run.md` said the
  links were not opened, and the person's opening is recorded separately. The installed state
  was not produced on hosted in either run (Install was cancelled here); its receipt rests on the
  Phase 2 check under AC-5. Accepted, since the criterion is that the states are not confused.
- Cancelled consent, wrong-account opening, uncertain-response retry: hold, from `hosted-run.md`
  steps 10, 9 and 6, already accepted in the earlier review.
- Failed loading: holds. A Playwright route aborted the real waiting-list GET in the browser; the
  product code, the client's own retries and the error state ran unchanged. It is a fair test of
  a network failure. A server error answer takes the same `throw` path but was not exercised.
- Legacy pending-package recovery: holds for the package that carries item identity: Install
  stopped before any write and offered Open it, Cancel or Install anyway, and nothing new appeared
  after Cancel and reload. "Nothing new created" is shown by the nav counts in a fresh profile,
  the code path, and the package still pending on the server. A truly pre-identity package takes
  the "may already be in your library" branch instead; that branch is covered only on the local
  stack (Phase 4 step 4g, AC-9), not on hosted.
- Every criterion has reviewed evidence or stays open: holds after this review.

AC-11: pass.

## Problems in `ac11-hosted.md`

- It does not record the deployed revision, which Phase 5 asks for (checked above instead).
- It ran on the owner's standing test account with scripted CLI and browser, not on the new
  account and agent session of the final scenario, and does not say why. Neither case depends on
  the account being new or on an agent driving it, so this departure does not change the verdict.
- It calls the case "legacy" without saying the package carried item identity, so the
  identity-less branch was not the one shown on hosted.

## Limits

One scripted run, one machine, headless Chromium. The reviewer read logs and screenshots and
re-read server state; it did not repeat the browser steps, and ran no save, pack, login or logout.
Not a production-proven claim.
