# Phase 2 evidence: measure today's code

Acceptance (verbatim): "Phase 2 of the spec: a receipt in evidence/ with every listed timing and
byte count, on both fixtures, under the measurement rules. No product change."

Base: `origin/main` 78ce3f35063386fdc7217d0542e3df871fc32b8d. No file under `src/`, `api/`,
`supabase/` or any workflow changed: the harness is `e2e/configured/measure/` and this receipt.
Hardware checks: none in this phase (see "Not measured here").

## How it was measured

- **Where.** One Claude cloud worker (4 CPUs, 13.4 GiB), one Playwright run per job, headless
  Chromium (Playwright 1.61.1). The backend is the configured suite's local Supabase stack
  (`scripts/configured-stack.mjs`, the same migrations and checks CI uses), started on the worker.
  The app is the Vite dev server the configured suite uses (`playwright.live.config.ts`): a
  development build, not the bundled production build. Each job builds its fixture from nothing,
  publishes it, measures, then unpublishes and deletes it.
- **Harness.** `e2e/configured/measure/` (`baseline.measure.ts`, `_measure.ts`, `_fixture.ts`,
  `measure.config.ts`, `summarize.mjs`). The files are named `*.measure.ts`, so the configured
  suite never runs them. Rerun one group with, for example,
  `MEASURE_FIXTURE=large MEASURE_NET=slow MEASURE_PATHS=graphic npx playwright test --config=e2e/configured/measure/measure.config.ts baseline --grep takes-a`,
  then `node e2e/configured/measure/summarize.mjs`. The cloud queue's five-minute cap split the
  run into jobs of one group part each; the summary merges their raw samples before taking any
  statistic.
- **One time origin.** Every stamp is `performance.timeOrigin + performance.now()` (or an event's
  own `timeStamp` on that base) in the page that saw it, all pages and outputs on one machine. The
  scripted hardware panel's press is stamped in the Playwright process as the module's request
  leaves, then moved onto the page's clock: the page's clock is read between two of the process's
  own readings and the midpoint gives the offset. Half that bracket bounds the error: 0.9 ms p50
  and 3.6 ms p95 over the 200 panel samples (largest 60 ms); it is kept with each sample.
- **Words.** "Press": the `click` event's timestamp (every button measured acts on click). "Sent":
  the page calls `fetch` for the press's own send (`control_send_seq`; the Bridge's `/act` for a
  server cue). A command send is tied to its press by the sender id and press number in its body
  (`src/control/seqSend.ts` `senderBody`), so a resend or a later send of an earlier press is never
  read as this press's.
  "Page's own": press to sent minus the time a kept ordering wait overlapped it, read from the
  page's own requests (road discovery: a slug resolve inside the window; one send in flight per
  graphic: an earlier send still running at the press; a folder's earlier sends). "Ran" does not
  exist yet (W3 adds it), so this phase measures "play()": the output graphic's `play()` is
  called; "render dispatch": the first animation frame in that graphic's document after it;
  "first seen": the first DevTools screencast frame after "sent" that differs from the frame before
  the press, at its own capture time. The capture gap after that frame is reported as its
  uncertainty.
- **Network.** "Unthrottled", and "throttled": DevTools network emulation at 20 Mbit/s down and up
  with 50 ms latency on the production page and every output, applied after the fixture is built
  (signing in and building are set-up, not timings). DevTools emulation shapes HTTP requests; it is
  not documented to delay WebSocket frames, so Realtime delivery is unthrottled in both cases.
- **Cache.** The production page keeps its cache through a job. Every output start is a new
  browser context: a cold cache.
- **Bytes.** DevTools' own counts per page: request URL, headers and body up; encoded response
  bytes (headers included) down; WebSocket frames both ways. Counted on the production page and the
  output from the edit until the output reports the new version prepared (its `ready()` names the
  new version with every graphic checked) and the page has started no request for 4 s, so the
  account sync (a 2.5 s debounce) is inside the window.
- **Samples.** 50 or more per timing, except where the tables say otherwise: per change kind the
  byte rows have 17 samples each (three publishing kinds together give the 51 update-time
  samples). A sample that did not complete counts as a failure.
- **Fixtures.** Built through the wizard's own create path from catalog variants taken round-robin
  across categories (`_fixture.ts`). Each template graphic carries one generated PNG of seeded
  noise (incompressible), shown by a small `<img>` in its markup. "Typical": 20 graphics, 3 MB of
  image files. "Large": 60 graphics, 10 MB. 1 MB is 1,048,576 bytes of file; the stored JSON holds
  them as base64. Each fixture holds the W1 subjects: a stepped lower third (Next), the House Score
  board (Goal is the quick button, its number stepper the +1), a folder of two cues played together,
  the production's picture graphic, and a CasparCG clip (server cue) on a fake NoaCG Bridge
  (`e2e/_fakeBridge.ts`), with one browser output open.

## Results

Cases: "unthrottled" and "throttled" (20 Mbit/s, 50 ms) on each fixture.

#### Fixtures as built

| Case | Graphics | Image files | Stored output (published JSON text) | First publish of the fixture |
|---|---|---|---|---|
| Typical, unthrottled | 20 | 3.00 MB | 6.16 MB | 10186 / 11643 (n 25) |
| Typical, throttled | 20 | 3.00 MB | 6.16 MB | 10177 / 11519 (n 25) |
| Large, unthrottled | 60 | 10.00 MB | 20.21 MB | 17668 / 19490 (n 39) |
| Large, throttled | 60 | 10.00 MB | 20.21 MB | 17561 / 19901 (n 37) |

#### Take paths: press to sent (p50 / p95, ms)

| Path | Case | n | Page's own | Total | Samples a kept wait added time to |
|---|---|---|---|---|---|
| Graphic cue Take | Typical, unthrottled | 50 | 79.6 / 97.6 | 79.6 / 97.6 | none |
| Graphic cue Take | Typical, throttled | 50 | 74.8 / 92.3 | 74.8 / 92.3 | none |
| Graphic cue Take | Large, unthrottled | 50 | 129 / 186 | 129 / 186 | none |
| Graphic cue Take | Large, throttled | 50 | 113 / 201 | 113 / 201 | none |
| Picture cue Take | Typical, unthrottled | 50 | 76.3 / 97.8 | 76.3 / 97.8 | none |
| Picture cue Take | Typical, throttled | 50 | 75.4 / 99.8 | 75.4 / 99.8 | none |
| Picture cue Take | Large, unthrottled | 50 | 96.4 / 173 | 96.4 / 173 | none |
| Picture cue Take | Large, throttled | 50 | 79.2 / 167 | 79.2 / 167 | none |
| Folder Take (two cues, together) | Typical, unthrottled | 50 | 139 / 182 | 139 / 182 | none |
| Folder Take (two cues, together) | Typical, throttled | 50 | 135 / 183 | 135 / 183 | none |
| Folder Take (two cues, together) | Large, unthrottled | 50 | 214 / 319 | 214 / 319 | none |
| Folder Take (two cues, together) | Large, throttled | 50 | 216 / 339 | 216 / 339 | none |
| Server cue Take (fake Bridge) | Typical, unthrottled | 50 | 17.0 / 33.5 | 17.0 / 33.5 | none |
| Server cue Take (fake Bridge) | Typical, throttled | 50 | 31.5 / 34.1 | 31.5 / 34.1 | none |
| Server cue Take (fake Bridge) | Large, unthrottled | 50 | 30.6 / 178 | 30.6 / 178 | none |
| Server cue Take (fake Bridge) | Large, throttled | 50 | 32.0 / 230 | 32.0 / 230 | none |
| Quick button (Goal) | Typical, unthrottled | 50 | 62.4 / 84.4 | 62.4 / 84.4 | none |
| Quick button (Goal) | Typical, throttled | 50 | 60.6 / 83.6 | 60.6 / 83.6 | none |
| Quick button (Goal) | Large, unthrottled | 50 | 106 / 138 | 106 / 138 | none |
| Quick button (Goal) | Large, throttled | 50 | 108 / 145 | 108 / 145 | none |
| Quick button, second of two fast | Typical, unthrottled | 50 | 50.5 / 74.7 | 50.5 / 74.7 | none |
| Quick button, second of two fast | Typical, throttled | 50 | 58.4 / 114 | 58.4 / 114 | send in flight 1 (adds 0.1 / 0.1) |
| Quick button, second of two fast | Large, unthrottled | 50 | 65.3 / 124 | 65.3 / 124 | none |
| Quick button, second of two fast | Large, throttled | 50 | 81.7 / 139 | 81.7 / 139 | none |
| +1 | Typical, unthrottled | 50 | 60.9 / 77.0 | 60.9 / 77.0 | none |
| +1 | Typical, throttled | 50 | 58.9 / 69.8 | 58.9 / 69.8 | none |
| +1 | Large, unthrottled | 50 | 108 / 132 | 108 / 132 | none |
| +1 | Large, throttled | 50 | 107 / 146 | 107 / 146 | none |
| +1, second of two fast | Typical, unthrottled | 50 | 58.6 / 85.8 | 58.6 / 85.8 | none |
| +1, second of two fast | Typical, throttled | 50 | 56.6 / 126 | 56.6 / 126 | send in flight 1 (adds 14.3 / 14.3) |
| +1, second of two fast | Large, unthrottled | 50 | 79.4 / 152 | 79.4 / 152 | none |
| +1, second of two fast | Large, throttled | 50 | 84.5 / 124 | 84.5 / 124 | none |
| Next | Typical, unthrottled | 50 | 55.5 / 69.3 | 55.5 / 69.3 | none |
| Next | Typical, throttled | 50 | 37.8 / 69.2 | 37.8 / 69.2 | none |
| Next | Large, unthrottled | 50 | 37.4 / 133 | 37.4 / 133 | none |
| Next | Large, throttled | 50 | 83.0 / 146 | 83.0 / 146 | none |
| Hardware panel Take (scripted) | Typical, unthrottled | 50 | 20.9 / 34.2 | 26.3 / 39.5 | none |
| Hardware panel Take (scripted) | Typical, throttled | 50 | 21.2 / 30.0 | 27.8 / 38.9 | none |
| Hardware panel Take (scripted) | Large, unthrottled | 50 | 55.9 / 76.7 | 61.8 / 97.3 | none |
| Hardware panel Take (scripted) | Large, throttled | 50 | 59.3 / 87.7 | 68.0 / 96.1 | none |

Other requests running inside press..sent: Graphic cue Take: rpc:audience_list; Picture cue Take: rest:teams, rest:team_members, rest:team_productions, rest:control_shows, 127.0.0.1:8899/status; Folder Take (two cues, together): 127.0.0.1:8899/state, rpc:audience_list, rest:teams, rest:team_members, rest:team_productions; Server cue Take (fake Bridge): 127.0.0.1:8899/health, 127.0.0.1:8899/state, rest:teams, rest:team_members, rest:team_productions, 127.0.0.1:8899/status; Quick button (Goal): rest:control_shows, rpc:control_tail_seq; Quick button, second of two fast: rest:teams, rest:team_members, rest:team_productions, rpc:audience_list; +1: rest:teams, rest:team_members, rest:team_productions, rpc:audience_list, rpc:panel_list; +1, second of two fast: rest:teams, rest:team_members, rest:team_productions, rpc:panel_list, rpc:audience_list; Hardware panel Take (scripted): rpc:panel_list, rpc:panel_renew.

#### Sent to render dispatch to first seen (p50 / p95, ms)

| Case | n | Sent to play() | Sent to render dispatch | Sent to first seen | Capture gap after the first seen frame |
|---|---|---|---|---|---|
| Typical, unthrottled | 50 | 12.7 / 20.4 | 20.1 / 27.9 | 38.7 / 154 | 13.9 / 46.2 |
| Typical, throttled | 50 | 15.6 / 26.3 | 21.5 / 38.8 | 44.5 / 160 | 15.0 / 47.0 |
| Large, unthrottled | 50 | 10.2 / 16.9 | 21.4 / 34.0 | 40.3 / 153 | 12.1 / 42.7 |
| Large, throttled | 50 | 15.3 / 22.2 | 24.7 / 34.0 | 48.8 / 170 | 15.0 / 58.8 |

#### Press to sent during a publish (graphic cue Take, p50 / p95, ms)

| Case | n | Total, during a publish | Total, no publish (from the table above) | Publish duration | Publishes |
|---|---|---|---|---|---|
| Typical, unthrottled | 63 | 84.3 / 1064 | 79.6 / 97.6 | 1440 / 1594 | 445 |
| Typical, throttled | 50 | 81.2 / 104 | 74.8 / 92.3 | 5600 / 5775 | 11 |
| Large, unthrottled | 56 | 170 / 385 | 129 / 186 | 4881 / 5320 | 279 |
| Large, throttled | 50 | 141 / 200 | 113 / 201 | 17288 / 17832 | 4 |

#### Bytes and time per change

Bytes: every request and response of the production page and the output, from the edit until the output reports the new version prepared and the page has started nothing for 4 s. Time: Publish changes pressed to the output holding the new version, every graphic checked.

| Change | Case | n | Total bytes (p50) | Page up | Page down | Output down | Press to output prepared | New frame load |
|---|---|---|---|---|---|---|---|---|
| Cue text edit (no publish today) | Typical, unthrottled | 17 | 4.38 MB | 2.19 MB | 2.18 MB | 2.3 kB | no publish | none |
| Cue text edit (no publish today) | Typical, throttled | 17 | 4.38 MB | 2.19 MB | 2.19 MB | 1.1 kB | no publish | none |
| Cue text edit (no publish today) | Large, unthrottled | 17 | 13.89 MB | 6.94 MB | 6.94 MB | 1.1 kB | no publish | none |
| Cue text edit (no publish today) | Large, throttled | 17 | 13.89 MB | 6.95 MB | 6.95 MB | 1.1 kB | no publish | none |
| Graphic added | Typical, unthrottled | 17 | 25.91 MB | 13.00 MB | 6.44 MB | 6.48 MB | 4378 / 4789 | 52.7 / 97.8 |
| Graphic added | Typical, throttled | 17 | 25.92 MB | 13.00 MB | 6.44 MB | 6.48 MB | 11145 / 11362 | 121 / 152 |
| Graphic added | Large, unthrottled | 17 | 81.52 MB | 40.80 MB | 20.15 MB | 20.57 MB | 12209 / 13348 | 64.4 / 88.2 |
| Graphic added | Large, throttled | 17 | 81.54 MB | 40.80 MB | 20.16 MB | 20.57 MB | 33401 / 35397 | 114 / 128 |
| Graphic removed | Typical, unthrottled | 17 | 24.97 MB | 12.46 MB | 6.35 MB | 6.17 MB | 10639 / 11079 | none |
| Graphic removed | Typical, throttled | 17 | 24.99 MB | 12.47 MB | 6.36 MB | 6.17 MB | 13286 / 13427 | none |
| Graphic removed | Large, unthrottled | 17 | 80.52 MB | 40.22 MB | 20.06 MB | 20.23 MB | 11526 / 13209 | none |
| Graphic removed | Large, throttled | 17 | 80.53 MB | 40.23 MB | 20.07 MB | 20.23 MB | 30457 / 32987 | none |
| Design updated | Typical, unthrottled | 17 | 24.90 MB | 12.46 MB | 6.28 MB | 6.17 MB | 10365 / 10459 | 45.6 / 58.1 |
| Design updated | Typical, throttled | 17 | 24.93 MB | 12.47 MB | 6.28 MB | 6.17 MB | 13074 / 13267 | 100 / 114 |
| Design updated | Large, unthrottled | 17 | 80.45 MB | 40.22 MB | 19.99 MB | 20.23 MB | 10876 / 12275 | 62.1 / 76.3 |
| Design updated | Large, throttled | 17 | 80.47 MB | 40.23 MB | 20.00 MB | 20.23 MB | 31549 / 32588 | 110 / 119 |

Output update time over every publishing change (added, removed and updated together):

| Case | n | Press to output prepared (p50 / p95, ms) |
|---|---|---|
| Typical, unthrottled | 51 | 6721 / 10873 |
| Typical, throttled | 51 | 11285 / 13401 |
| Large, unthrottled | 51 | 11477 / 13209 |
| Large, throttled | 51 | 31633 / 34214 |

Where the bytes go (p50 per request family over 4 kB):

| Change | Case | Production page | Output |
|---|---|---|---|
| Cue text edit (no publish today) | Typical, unthrottled | rest:documents 4.37 MB | none over 4 kB |
| Cue text edit (no publish today) | Typical, throttled | rest:documents 4.37 MB | none over 4 kB |
| Cue text edit (no publish today) | Large, unthrottled | rest:documents 13.87 MB, app 10.5 kB | none over 4 kB |
| Cue text edit (no publish today) | Large, throttled | rest:documents 13.87 MB | none over 4 kB |
| Graphic added | Typical, unthrottled | rest:control_shows 10.34 MB, rest:documents 9.05 MB, app 14.5 kB, auth 5.7 kB | rpc:control_output_resolve 6.47 MB, app 4.8 kB |
| Graphic added | Typical, throttled | rest:control_shows 10.34 MB, rest:documents 9.06 MB, app 14.5 kB, auth 6.0 kB | rpc:control_output_resolve 6.47 MB, app 4.8 kB |
| Graphic added | Large, unthrottled | rest:control_shows 32.81 MB, rest:documents 28.06 MB, app 41.5 kB, auth 6.0 kB | rpc:control_output_resolve 20.56 MB, websocket 5.2 kB, app 4.8 kB |
| Graphic added | Large, throttled | rest:control_shows 32.81 MB, rest:documents 28.07 MB, app 41.5 kB, rest:team_members 7.3 kB | rpc:control_output_resolve 20.56 MB, app 4.8 kB |
| Graphic removed | Typical, unthrottled | rest:control_shows 10.04 MB, rest:documents 8.73 MB, app 13.0 kB, websocket 5.9 kB | rpc:control_output_resolve 6.16 MB, websocket 5.4 kB |
| Graphic removed | Typical, throttled | rest:control_shows 10.04 MB, rest:documents 8.74 MB, app 13.0 kB, auth 6.0 kB | rpc:control_output_resolve 6.16 MB, websocket 5.5 kB |
| Graphic removed | Large, unthrottled | rest:control_shows 32.47 MB, rest:documents 27.74 MB, app 40.0 kB, auth 6.0 kB | rpc:control_output_resolve 20.23 MB, websocket 5.2 kB |
| Graphic removed | Large, throttled | rest:control_shows 32.47 MB, rest:documents 27.74 MB, app 40.0 kB, rest:team_members 7.3 kB | rpc:control_output_resolve 20.22 MB, websocket 5.5 kB |
| Design updated | Typical, unthrottled | rest:control_shows 9.96 MB, rest:documents 8.73 MB, app 14.0 kB, websocket 6.1 kB | rpc:control_output_resolve 6.16 MB, app 5.9 kB, websocket 5.7 kB |
| Design updated | Typical, throttled | rest:control_shows 9.96 MB, rest:documents 8.74 MB, app 14.0 kB, websocket 7.2 kB | rpc:control_output_resolve 6.16 MB, websocket 6.8 kB, app 5.9 kB |
| Design updated | Large, unthrottled | rest:control_shows 32.40 MB, rest:documents 27.74 MB, app 41.0 kB, auth 6.0 kB | rpc:control_output_resolve 20.23 MB, app 5.9 kB, websocket 4.3 kB |
| Design updated | Large, throttled | rest:control_shows 32.40 MB, rest:documents 27.74 MB, app 41.0 kB, rest:team_members 7.3 kB | rpc:control_output_resolve 20.23 MB, app 5.9 kB |

#### Output start from a cold cache (p50 / p95, ms)

| Case | n | Navigation to first graphic loaded | Navigation to ready (every graphic checked) | One graphic's load (frame inserted to loaded) | Production data down | All bytes (dev-server app code included) |
|---|---|---|---|---|---|---|
| Typical, unthrottled | 50 | 1192 / 1284 | 1517 / 1619 | 683 / 762 | 6.16 MB | 16.78 MB |
| Typical, throttled | 52 | 8259 / 8335 | 8931 / 9027 | 714 / 806 | 6.16 MB | 16.78 MB |
| Large, unthrottled | 51 | 3183 / 3452 | 4272 / 4643 | 2359 / 2576 | 20.22 MB | 30.93 MB |
| Large, throttled | 56 | 15859 / 16056 | 17853 / 18168 | 2201 / 2437 | 20.22 MB | 30.93 MB |

#### Failures

None.

## What the numbers say

- **Every graphic Take path spends more than 50 ms of the page's own time at p95 today**, in
  every case. Graphic cue Take 92.3 to 201 ms p95 across the four cases, picture 97.8 to 173,
  folder 182 to 339, quick button 83.6 to 145, +1 69.8 to 146, Next 69.2 to 146. Under 50 ms on
  the typical fixture only: the server cue (fake Bridge) at 33.5 and 34.1 ms (178 and 230 ms on
  the large one) and the hardware panel's page share at 34.2 and 30.0 ms (76.7 and 87.7 ms on the
  large one). The page's own time grows with the production: the graphic cue Take goes from
  79.6 ms p50 (20 graphics) to 129 ms p50 (60 graphics), unthrottled.
- **Some presses are sent at once, most are not.** Next is sent within 30 ms in 17 to 23 of 50
  presses, the second of two fast presses in 7 to 23, a single quick button or +1 press in 0 to
  13; the rest take 50 to 150 ms. Each send here is tied to its own press by the press's sender
  id and number, so this is the page, consistent with a press finding it idle or still busy
  with the work the press before it started.
- **Kept ordering waits almost never add time.** No road discovery and no folder ordering inside
  any window. "One send in flight per graphic" appeared in one "second of two fast" press each for
  the quick button and the +1 (typical, throttled), adding 0.1 and 14.3 ms. Nearly all of press
  to sent is the page's own work.
- **A publish slows Takes, badly on the unthrottled cases.** Press to sent during a publish loop
  against none: typical unthrottled 84.3 / 1064 ms (p50 / p95) against 79.6 / 97.6; large
  unthrottled 170 / 385 against 129 / 186; typical throttled 81.2 / 104 against 74.8 / 92.3; large
  throttled 141 / 200 against 113 / 201. Publishing builds and sends a 6 or 20 MB payload from the
  page, so a Take pressed during one can wait behind it. A publish takes 1.4 s (typical) to 17.3 s
  (large, throttled).
- **Sent to first seen is about 40 to 50 ms p50 and 150 to 170 ms p95**, with play() 10 to 16 ms
  and render dispatch 20 to 25 ms after sent. Capture resolution: 12 to 15 ms p50, 43 to 59 ms p95
  between screencast frames, so first seen is known to within about one frame.
- **Every change today moves the whole production, several times.** A cue text edit (no publish)
  is 4.4 MB (typical) and 13.9 MB (large): the account sync writes and reads the whole production
  document. Adding, removing or updating one graphic is 25 MB (typical) and 81 MB (large): the
  publish writes the whole output (`control_shows` about 10 MB and 32 MB both ways), the sync
  moves the production document, and the output downloads the whole published copy again
  (6.2 MB and 20.2 MB through `control_output_resolve`).
- **Output update** (Publish changes pressed to the output holding the new version, every graphic
  checked): 6.7 / 10.9 s typical unthrottled, 11.3 / 13.4 s typical throttled, 11.5 / 13.2 s large
  unthrottled, 31.6 / 34.2 s large throttled. A changed or new graphic's own frame loads in 46 to
  152 ms; the rest is publishing and downloading the whole production.
- **Output start, cold cache**: ready in 1.5 s (typical) and 4.3 s (large) unthrottled, 8.9 s and
  17.9 s throttled. Each start downloads the development build's app code (10.6 MB) and the
  whole production (6.2 MB typical, 20.2 MB large): on the typical fixture the app code is the
  larger part, on the large one the production is about two thirds. One graphic's own load while
  the whole production loads beside it: 0.7 s (typical), 2.2 to 2.4 s (large).

## Targets this shows wrong or unproven (for the owner, through the coordinator)

1. **AC-1's 50 ms p95 for the page's own time, as measured here, is not reachable by removing the
   W1 waits alone.** Next has no save, measurement or health wait before its send (nothing W1
   removes), and it already takes 69.2 to 146 ms p95; the quick button 83.6 to 145 ms. The rest
   is the page's own render and dispatch work in this harness: a development build on a 4-CPU
   cloud worker, which overstates a bundled build on a studio machine. Phase 3 needs one of: the
   target judged on a production build, the target set relative to this baseline, or work on the
   page's own render cost in scope. Owner decision before phase 3.
2. **AC-4's "press to ran within 50 ms p95 of nothing being published" fails today by up to about
   970 ms** (1064 against 97.6 ms p95, typical unthrottled). It is reachable only if a publish
   stops blocking the page; whole publishes (phase 6) keep that cost unless phase 6's design takes
   the publish's own work off the Take's path.
3. **D1's 5 s ceiling for a Take of a brand-new graphic** is far below today's update time on the
   large fixture over 20 Mbit/s (31.6 s p50), because the output downloads the whole production
   for one new graphic. The ceiling holds only once phase 7 sends what changed, or the new graphic
   is loaded on its own ahead of the rest.
4. **AC-5's 20 kB for a cue edit** is not shown wrong: today is 4.4 MB to 13.9 MB, all of it whole
   documents, and a patch of at most 2 kB of text plus headers fits in 20 kB.

## Known biases

- **Output ready and update times are late by up to about 60 ms.** The harness polls the
  output's `ready()` every 50 ms and stamps the moment it reads it, so each "navigation to ready"
  and "press to output prepared" sample includes up to one poll interval plus a page round trip.
  Against figures of 1.5 to 34 s this is 0.2 to 4 %.
- **WebSocket bytes are over-counted by up to a third.** DevTools gives a binary frame's payload
  as base64 and the harness counts its characters. WebSocket traffic is at most about 8 kB per
  change here, against 4.4 to 81.5 MB totals.
- Both stay in the harness as written, so a later phase rerunning it compares like with like.

## Not measured here

- **"Ran".** Outputs do not report running a command until W3 (phase 5); this phase measures
  play(), render dispatch and first seen instead.
- **A hosted backend.** The local stack answers in about a millisecond; a hosted one is about
  200 ms away from a runner (`configured-suite.yml`). Throttling adds 50 ms per request, not a
  hosted round trip, and Realtime frames were not throttled.
- **A production build.** Every page ran the development build; page timings and the app-code
  bytes of an output start overstate a bundled build.
- **Several outputs.** One browser output per measurement; bytes downloaded per output scale with
  the number of outputs.
- **Hardware, listed for the owner's final check (phase 9), not counted as passed:** real CasparCG
  2.5 and 2.3 rendering (the server cue here is a fake Bridge answering `/health`, `/status`,
  `/state` and `/act`), a physical panel (presses here are the module's `panel_press` from a
  script), and the studio network.

## Checks

- The harness's own trials ran each group with 2 to 10 samples before the run. The first full run
  (125 jobs) matched a send to a press as "the first send after the click"; `/check`'s review
  showed that can credit a press with an earlier press's later send, and that its panel stamp and
  publish windows needed the corrections above. The Take paths and the publish overlap were run
  again with them (54 jobs). The tables hold that rerun for those groups, and the first run for
  render, bytes and output start, which do not match sends to presses. Every job whose result is
  used passed and no sample inside them failed (Failures: none, above). Jobs that wrote nothing:
  one running when the container restarted (queued again), and one extra publish part that met its
  dev server shutting down at set-up, because the job before it had just been cancelled.
- `npx eslint e2e/configured/measure/`: clean.
- `npm run gates -- run --changed origin/main`: see the pull request.
- The configured suite itself is unchanged: `*.measure.ts` does not match its spec pattern, and
  the planner still selects the whole configured set for a change in `e2e/configured/`, so CI runs
  it on this pull request.

## Traps met

- The local Supabase stack can start on a Claude cloud worker: start `dockerd`, install `ss`
  (`iproute2`), take the 2.111.0 CLI from its GitHub release, and set
  `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` (the default registry's image host is refused by
  the proxy, Docker Hub is not). Phase 1 recorded that it could not start.
- The cloud queue admits one 12-minute job per commit and any number of 5-minute ones, so a long
  measurement is split into 5-minute parts merged from raw samples.
- Playwright empties `test-results/` at the start of every run; results go to `MEASURE_OUT`.
- Supabase Realtime delivers broadcasts as binary frames; read them as text to find a press id.
- A container restart stopped Docker and the queue runner but kept `/tmp`; restarting `dockerd`
  brought the stack back with its data, and the runner resumed the queue. The job running at the
  restart was lost and was queued again.
