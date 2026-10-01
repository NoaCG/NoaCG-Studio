# Landing c: the command path ping (AC-12, AC-13)

2026-10-01, the owner's Windows laptop, the local Supabase stack (every migration in the tree),
never production.

## What ran

- **Unit** (`node --test scripts/prepare-live.test.mjs`, 8 of 8, with `readiness.test.mjs` and
  `db-push.test.mjs` 78 of 78): the ping said on each output's own line ("Desk A: Ready for
  playout · command path 110 ms"), an earlier ping's answer not counted, amber "commands did not
  reach it in 15 s" with the output's own advice first, "commands reach it" when the clocks cannot
  be compared, an output loaded before the ping said to be unable to answer (never amber), one note
  for a server without 0072, one warning for a ping that could not be sent; when an output is done
  with the ping; the delay and the answer read off the wire.
- **The migration's class** (db-push's own `classifyMigration` and `liveHold` on 0072): live-path,
  declared, no findings (its revoke is on the function the same file creates), held while a
  production is live and applied in a quiet window. The build gate (`db-push.test.mjs`) passes it.
- **Applied on the local stack under traffic**: `supabase migration up --local` while a script sent
  an update through `control_send_many` every 700 ms (an open page's road): 36 sends, none failed,
  the slowest 135 ms. The self-check ran its call half (a throwaway production: the ping took the
  next number, no graphic summary or press record moved, the row is `{t: 'ping', id, at}` under
  the head's number, a malformed id refused with 22023, the throwaway deleted).
- **Signed out, through PostgREST**: `control_ping_seq` answered `{ok, seq, epoch, at}`; a bad id
  answered 400 `22023 not a ping id`; a missing function answers `404 PGRST202`, which the page
  reads as "not on this server yet".
- **Old outputs on four real hosts** (the bundle built before this landing: CasparCG 2.5.0 and
  2.3.2 from scratch configurations, the OBS test collection, vMix's blank session with a browser
  input, as in `a-readiness.md`), production "Host Walk":
  1. Three pings with nothing on air: every output stayed "Ready for playout", and the log shows
     no report from any of them after the pings.
  2. House Scorebug taken (four reports in the second after the Take: one per output), then three
     pings while it was on air: no report from any output, nothing re-aired, READY unchanged, and
     the production page's program monitor still counted one entrance (`data-plays` 1). An old
     renderer's stage drops a row for a graphic it does not hold (`stage.ts`, `if
     (!frames.has(graphic)) return`), and the ping's graphic is empty.
- **Found on the hosts and fixed: the answer never reached the checklist.** The CasparCG 2.5
  output (served by the dev server, so on this landing's code) had answered (`ack {ms: 5}` read
  over DevTools), yet the line read "commands did not reach it in 15 s": the page re-renders its
  peers only when a key of their fields changes (`OutputHealth.tsx` `outputsKey`), and the key did
  not include the answer. It does now. Re-run: "CasparCG 1-20: command path 9 ms".
- **Found on the hosts and fixed: old outputs read as failures.** An output loaded before this
  landing can never answer, and read amber. An output from this landing on always carries `ack`
  (empty until a ping arrives), so one without it is said to be unable to answer: "OBS test:
  loaded before the command path check" (now on its line: "· cannot answer the command path
  check"), never a warning.
- **New outputs on the four hosts**: CasparCG 2.3 reloaded with `PLAY` and vMix with
  `BrowserReload` onto the rebuilt bundle; Prepare for Live read "CasparCG 2.3 1-20: command path
  6 ms" (Chromium 71), "vMix test: command path 4 ms", "CasparCG 1-20: command path 4 ms", and OBS,
  still on the old bundle, as unable to answer. Then a graphic removed from the production and
  Prepare for Live pressed: "Published your changes as v8", all four outputs reloaded onto v8 (OBS
  onto the new bundle with them), and only then the ping: 2.3 14 ms, OBS 13 ms, vMix 14 ms, 2.5
  13 ms, "Ready for Live, checked 03:48 (v8)". The ping going out after the outputs settle is what
  lets an output that reloads answer from the page that will air.
- **Screenshots** (session scratchpad `shots/`): `ping-desk-1920-panel`, `ping-desk-1366-panel`,
  `ping-production-390-panel`, `ping-hosted-390-panel`.

## Observations worth keeping

- With four outputs, the panel's checklist and button sit below its fold at 1366 and on a phone
  (the panel scrolls). The layout is landing b's; it is listed for the owner (R10).
- Once, after hours of running, CasparCG 2.5's `INFO 1-20` named no file for the html producer on
  the layer, and the Bridge line read "does not show this production's output". A fresh `PLAY` and
  a page that reloads itself both keep the file; the cause was not found.

## Limits

- The delay is measured on two clocks (the server's commit and the output's receipt). Where they
  disagree the line gives no figure rather than a wrong one.
- The Presence answer reaches the page through its budget (one call per 10 s), so the run waits up
  to 15 s for it.
