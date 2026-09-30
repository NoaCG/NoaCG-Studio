# Landing a: every output reports READY, both surfaces read one line (AC-1 to AC-7)

2026-10-01, the owner's Windows laptop. Never production: a local Supabase stack (`supabase start`,
every migration in the tree, 0001 to 0071) with the throwaway accounts CI uses
(`e2e@noacg.local`, `e2e-teammate@noacg.local`), created through the local admin API.

## What ran

- **Unit** (`node --test scripts/readiness.test.mjs`): 12 of 12. Every state of the plan's
  vocabulary, the summary and its short form, behind versus a cue-only publish, a newer version
  learned from an output, the expected outputs (kept, replaced by a new page of the same name,
  forgotten), and the version stamp (digest per graphic, one identity, a counting label).
- **Offline e2e** (job j-2719, `npx playwright test e2e/output-ready.spec.ts e2e/live-path.spec.ts
  e2e/bridge-connect.spec.ts`): 34 of 34. `output-ready.spec.ts` drives the real `/output` boot,
  stage and graphic documents over a stood-in backend: a graphic that throws while loading is
  named on the entry and the debug line ("ready: Not ready: Frost Quiz (script error) (v7)"); an
  untouched graphic is warmed with its first cue's values and nothing plays; a graphic recovered
  from its report is never warmed over; a broken `<img>` names its graphic and file.
  `bridge-connect.spec.ts` pins the named output URL the Bridge now airs (`&name=CasparCG 2-30`).
- **Configured e2e on the local stack** (jobs j-2721, j-2722, j-2724). j-2724:
  `live-ready.spec.ts` 1 of 1 passed. It publishes (stamp v1 in the payload), opens a signed-out
  output named on its URL, reads READY on the output, on the production page and on the hosted
  page (the same words), takes a value the published cue does not hold and reloads the output with
  the graphic on air (the value stays: the warm pass did not run over it; no report was written by
  the warm pass before the Take), publishes again (both surfaces read "Behind: showing v1" until
  the output reloads onto v2), puts a load-time error into the published payload ("▲ Not ready:
  Hairline (script error)" on both, the other graphic still takes), and closes the output (red
  "Desk A not answering (…)" on both after 15 s, then Forget). j-2721: `live-health.spec.ts` and
  `live-presence-steady.spec.ts` (updated to READY's `data-source`) 2 of 2 passed.
- **Real hosts**, the built bundle (`vite build` with the local stack's URL, served by
  `node scripts/dev-worktree.mjs --preview` on this checkout's port), production "Host Walk" of
  four graphics published by the teammate account; one of them, "Modern Strap", carries optional
  chaining in its script, which the studio's publish gate accepts:
  - **CasparCG 2.5.0** (`VERSION`: 2.5.0 69e8ad5 Stable), scratch config passed on the command line
    (AMCP 5350, DevTools 9250, logs and data in the session scratchpad),
    `PLAY 1-20 [HTML] "…/output?production=…&name=CasparCG 2.5 1-20&debug=1"`. Read over DevTools:
    `ready: {n: 4, of: 4, v: {n: 1}, is: []}`, debug line "ready: Ready for playout (v1)", engine
    "CasparCG · Chromium 142". Screenshot of the render: `casparcg-2-5-output.png` (session
    scratchpad).
  - **CasparCG 2.3** (`VERSION`: 2.3.2 4de6d18f Dev), scratch config
    `noacg-ready-scratch-2026-10-01.config` in its own folder (2.3 reads only a relative path;
    deleted at the end), AMCP 5351. The production page read it as "Not ready: Modern Strap
    (script error)", detail "Uncaught SyntaxError: Unexpected token ..", engine "CasparCG ·
    Chromium 71": the same page code, and a truth only that host has. `CLEAR 1-20` made it
    "✕ CasparCG 2.3 1-20 not answering (20 s) · 2 of 3 outputs ready" after 20 s; `PLAY` again
    (a new page with a new instance id) took its line back under the same name.
  - **OBS** (Chromium 127): a separate scene collection file `NoaCG_READY_test.json` holding one
    browser source, OBS started with `--collection "NoaCG READY test"`; "OBS test · Ready for
    playout". Its own collection "Untitled" was never loaded. After the run `global.ini` and
    `user.ini` were restored from the backup taken first and the crash sentinel OBS leaves on a
    forced stop removed; every file under `basic/` and both ini files hash as before (the test
    collection file is removed at the end of the session).
  - **vMix 29.0.0.49 (Trial)**: started with its blank session (no preset opened, none saved), a
    browser input added through the HTTP API (`Function=AddInput&Value=Browser|<url>`; Browser is
    not in the documented list and works); "vMix test · Ready for playout", engine "Chrome 115".
    A probe page showed vMix puts no marker on a page (plain Chrome 115 user agent, no extra
    globals), so vMix is named by `&name=` only. `RemoveInput` made it "✕ vMix test not
    answering (19 s)". vMix was closed without saving; its `user.config` hashes as before.
  - **Browsers**: Playwright's Chromium 149 (the configured runs) and the desktop app's browser
    (Chrome 152) against the dev server.
- **Screenshots** (session scratchpad `shots/`, judged): the production page at 1920 and 1366 with
  the panel open (four hosts: 2.5 ready, OBS ready, 2.3 not ready, in that order), the hosted page
  at 1440 and 390 with the panel, the behind and not-answering headers.

## Observations worth keeping

- Chrome 152 in the desktop app refuses every font request from the sandboxed (opaque-origin)
  graphic frames to `localhost` ("NetworkError"; `fetch` from such a frame fails the same way), so
  there every output reads "Using a fallback font for …". Chromium 149 (Playwright), CasparCG
  2.5.0, OBS and vMix loaded the same fonts from the same server. READY reported what that host
  saw; it did not cause it. It matters for a future local runtime that serves fonts to Chrome from
  a local address.
- A READY change reaches the operator pages up to 10 s after the output has it: every entry passes
  the page's Presence budget (one call per 10 s). The configured spec waits 30 s for that reason.

## Limits

- CasparCG 2.3's Chromium 71 has no DevTools port that Playwright can attach to; its READY was read
  from its Presence entry on the production page, not from inside it.
- The configured suite was run for the READY, health and Presence specs only.

## On the reviewed tip

The review found nine things; seven were fixed (the Presence view now names its production, so a
production page moved to another route cannot file one production's outputs under the next; the
production page always announces its expected outputs and the hosted page counts that list, so a
Forget reaches the phone; a graphic waiting for the boot recovery is no longer called unanswering;
the browser memory keeps the newest outputs; the per-instance rule and the wire readers live once;
a warm pass asked before load no longer leaks a callback). One is accepted and written into the
spec (R4a: Presence is a status plane, not a trust boundary) and one needs no change (the warm
update follows the SPX invisible-start contract the boot recovery already relies on).

- `npm run build` (job j-2734): green, `fail 0`.
- `npm run test:e2e:affected` (j-2735): 1265 passed, 544 skipped, 3 failed while another
  session's suite ran beside it (the editor foundation not visible within 7 s, a 60 s timeout, and
  a Bridge-restart note in `playout-folders`); the same three alone (j-2740): 7 of 7 passed.
- Configured on the local stack (j-2736): `live-ready.spec.ts` and `live-health.spec.ts`, 2 of 2.
- The real-host runs above were made before the review's fixes; none of those fixes changes what
  an output reports.
