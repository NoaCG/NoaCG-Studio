---
v: 2
source: derived
kind: finding
raised: 2026-09-20
state: unstarted
found: "e2e/editor-base-edits.spec.ts:245 'B04 edited svg survives save/reopen' fails on the pull_request run with 'Execution context was destroyed' while the SAME commit passes on the push run, so a PR cannot land through it."
serves: NOW
size: small
touches: e2e/editor-base-edits.spec.ts, src/store/saveActions.ts
needs-owner: none
---

# B04 save/reopen races a navigation, on CI and only on the pull_request run

**Filed:** 2026-09-20. **Source:** the landing of `claude/remove-personal-lecture-info-cd8ada`,
refused twice by this spec on a branch that changed only markdown and one HTML page.

## Why

It refuses landings. The spec is on the E2E 3/9 shard, and `ci.yml` runs its `e2e-retry` job only
on `main` and in the merge group, so on a pull request one flaky failure is the whole verdict.
Pull request 344 was refused by it twice on a branch that touches nothing in `src/store`,
`src/editor` or `src/model`. Any branch whose shard 3 draws this spec pays the same toll, and the
cost is not the re-run - it is that a real refusal and this one look identical until somebody
reads two logs side by side.

## What is known, and what is not

The failure is at line 258, inside a `page.evaluate` that dynamically imports a source module:

    await page.evaluate(async () => { await (await import('/src/store/saveActions.ts')).saveGraphicAs('Export proof', { kind: 'standalone' }); });
    Error: page.evaluate: Execution context was destroyed, most likely because of a navigation.

**`saveGraphicAs` does not navigate.** Read at `src/store/saveActions.ts:84`: it calls
`createGraphic`, awaits `commitDurableWrites()`, sets store state and calls `persistLink()`, which
is `saveProject(...)`. Nothing in that path touches `location`, `history` or the router. So the
navigation that destroys the context comes from somewhere else, and naming it is the work.

The leading candidate is the dev server rather than the app. The suite runs against
`npm run dev` (`playwright.config.ts` webServer), and a dynamic import of a module Vite has not
pre-bundled can make it discover new dependencies and issue a FULL PAGE RELOAD to re-optimise.
That would explain every observation below, because it depends on how warm the Vite cache is.
It is a hypothesis, not a measurement: nobody has caught the reload in the act.

## Evidence

Commit `588e6d23` produced two CI runs from the same push, on an `origin/main` that had not moved
since the fork point, so both runs tested identical trees:

| run | event | E2E 3/9 | note |
|---|---|---|---|
| 35506924934 | `push` | **114 passed** (9.5m) | ran this exact spec, line 245, and it passed |
| 35506928446 | `pull_request` | **1 failed, 113 passed** (10.9m) | first attempt |
| 35506928446 | `pull_request`, re-run of failed jobs | **1 failed, 113 passed** (9.3m) | same spec, same error |

Locally it does not reproduce. `--repeat-each 12 --workers 2` on this laptop: **12 passed (42.0s)**
(job `j-1541`). The same spec also passed inside a full local suite run the same day, 1406 passed.

So the shape is: green locally, green on `push`, red on `pull_request` twice. That is the
signature to explain, and any fix that cannot account for the push/pull_request asymmetry has not
found the cause.

## What it would take

Reproduce first - the root rule is to reproduce before fixing, and this one has resisted a laptop.
Cheapest route to a measurement is a CI-side one, because that is the only place it has been seen:
push a branch that adds a console listener for the Vite client's `full-reload` message and a
`page.on('framenavigated')` log around line 258, open a pull request so the `pull_request` event
runs, and read which one fires.

If it is the dev server re-optimising, the honest fix is to stop the evaluate straddling the
reload rather than to retry it: warm the module graph in an earlier `page.evaluate` (or an
ordinary import the app already performs) so the call at 258 imports nothing new. If it is the
app navigating after all, the fix belongs in whatever subscribes to `saved.graphicId`.

**Not a retry and not a `waitForTimeout`.** `playwright.config.ts` says out loud that the suite
runs with no retries so CI collects diagnostics on the first failure instead of disguising the
flake, and quarantining this spec would hide the one signal anyone has.
