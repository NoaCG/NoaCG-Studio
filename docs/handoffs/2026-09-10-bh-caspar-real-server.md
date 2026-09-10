# BH - a real CasparCG has run the output URL

Branch `claude/bh-caspar-real-server`. Both demo beats A4 and A6 were driven against real
CasparCG servers - 2.3.2 (`4de6d18f Dev`, the install named `v2.3.3-lts-stable`) and 2.5.0
(`69e8ad5 Stable`) - on this laptop's `<screen />` consumer. Both pass. The walk is
`docs/acceptance/owner-queue/2026-09-10-bh-a-real-casparcg-has-now-run-the-output-url.md`; the
hardware item `2026-08-25-casparcg-connect-against-real-hardware.md` carries what is now proven
and what is still not, and stays open.

## The status changes DEMO_2026-09-25.md and STUDENT_RELEASE_ACCEPTANCE.md owe

Row BE owns both files this wave, so this row did not touch them. Apply these:

1. **`DEMO_2026-09-25.md` beat A4** - status goes from **UNSEEN (box)** to **SEEN (screen
   consumer)**. The output URL was loaded with `CG 1-20 ADD 1 "<url>" 1` on both servers, cued
   from the dashboard, updated live, and it recovers its on-air state after a channel restart and
   after a full server `RESTART`. The 12th's job on the school's box is now SDI and the venue's
   network, not whether the beat works.
2. **`DEMO_2026-09-25.md` beat A4, the compatibility sentence** - "compiled down to Chromium 75/88
   with shims, which is what 2.3.x runs" is now wrong on the number. The measured engine on the
   2.3.2 install is **Chromium 71**. Worth going further: on 2.3.2 the scorebug airs with its flex
   gaps COLLAPSED, so if 2.3 is what the room runs, A4 will look subtly wrong on the projector.
   **Consider naming 2.5 as the demo server** - it is on this laptop, it reports Chromium 142, and
   the graphic renders as designed there.
3. **`DEMO_2026-09-25.md` beat A6** - status goes from **UNSEEN (box)** to **SEEN, with one gate
   left**. `npx @noacg/cli caspar agent` held a real AMCP socket, Put on air aired the production,
   a score typed on the production page changed it live, and Take off cleared the channel. The gate
   left is the ORIGIN (see below), and it is worth a line in the beat.
4. **`DEMO_2026-09-25.md` section 7 row 2** - "A4 the output URL on a real CasparCG 2.3 box":
   the acceptance target (§8.7 ticked) is met on a screen consumer. Remaining risk is the box.
5. **`DEMO_2026-09-25.md` section 7 row 10** - "A6 CasparCG Connect on hardware": the hardware
   item does NOT close (a screen consumer is not hardware), but the beat is no longer unseen, and
   "the beat is cut; A4 covers it by hand" is no longer the likely outcome.
6. **`STUDENT_RELEASE_ACCEPTANCE.md` §1, the `§8.7` line** - tick it, with the qualifier. Its
   three clauses each hold: transparent (proven by compositing over a layer underneath), correct
   scale at 1920x1080, recovers after `RESTART`. Add what the walk found: a channel restart DROPS
   the layer on both versions - what survives is the ON-AIR STATE, restored by re-issuing the same
   one command with nothing touched on the dashboard.

## The one thing that will bite on demo day

**The Put on air button sends the output URL of the origin the page is on.** Pressed on a dev
server it sends `http://localhost:<port>/output?…`, which is an untranspiled Vite bundle; CasparCG
2.3.x cannot parse it. AMCP answers `202`, the row says `✓ On 1-20`, and the channel stays black.
Measured, then isolated by sending the same production's hosted URL by hand a minute later, which
aired. Press it on `https://noacg.studio`.

**And nobody has pressed it there yet.** Every press in this walk was from a `localhost` page,
which Chrome does not gate. From a public origin the browser's Local Network Access permission
stands between the page and the loopback agent; `src/control/casparLink.ts` tells the three states
apart and writes a sentence for each, and none of those three sentences has been read by a person
on a real machine. That is a five-minute check with the owner at the keyboard and it is the last
unproven step of A6.

## What changed in the code

- **`src/components/home/ProductionLinks.tsx`** - Take off air reported `✓ On 1-20`. Both buttons
  return `{ state: 'ok' }`, and the message was written from the result alone, so the row told an
  operator the graphic was up a second after they took it down. Found on a real 2.5.0. The row now
  remembers which command ran AND the address it was sent to (a review finding: the address was
  still read from live settings, so changing the layer for the next show rewrote a standing
  verdict into a claim about a layer nothing was sent to).
- **`e2e/caspar-connect.spec.ts`** - the spec asserted `data-state` and never the words, which is
  why it passed through the whole bug. It now checks both, for air and for off.
- **`src/validation/engineSupport.ts` + `docs/PLAYOUT_COMPATIBILITY.md`** - the 2.3.0-2.3.2 row was
  an inferred 75 carrying an open contradiction. Measured: 71, with the flex-gap collapse visible
  in the frames. 2.3.3+ stays an inference - nothing here has run a genuine 2.3.3.
- **`cli/src/commands/caspar.ts`, `src/control/casparLink.ts`** - comments only. Neither had a
  defect; every AMCP reply shape the parser guesses at came back off a real server unchanged.
- **`docs/PROMISE_AUDIT.md` row 14** - said the Connect path had never met real CasparCG. It has.

## Evidence and traps that exist in no repo file

- **`PRINT <channel>` is how to review this without watching a window.** It writes a full-frame
  RGBA PNG of the channel into the server's media path. Every claim in the walk is a file you can
  open. On 2.3.3 that is `C:\casparcg\media`; on 2.5.0 it is the install's own `media\`.
- **The `#RRGGBBAA` colour producer rendered nothing on 2.3.2** (`202 PLAY OK`, empty frame). Use
  a still from the media folder as the layer underneath instead; `PLAY 1-10 giorno` works.
- **2.5.0 answers `RESTART` by closing the socket with no reply**, where 2.3.2 sends
  `202 RESTART OK`. The CLI reports it honestly as "closed the connection without answering", so
  nothing needs fixing - but a script that treats a missing reply as failure will be wrong.
- **Unpublishing does NOT take a production off a loaded channel.** The last frame stays up until
  somebody presses Out or sends `STOP`. And an output URL whose production is unpublished renders
  the "Output not available" card, which is OPAQUE - it covers programme video completely.
- **How this walk was driven, if it has to be repeated.** Two throwaway specs under
  `e2e/configured/` published a production against the real backend and then polled a text file
  for verbs, so AMCP could be driven from a terminal in step with real dashboard takes. They are
  deleted; the pattern is worth rebuilding rather than the files. The token
  `noacg caspar agent` mints is at `%APPDATA%\noacg\caspar-agent.json`, which is how a spec can
  seed `localStorage['spx-gfx-caspar']` without anyone typing it.

## Two machine problems this row hit, neither of them this branch's

- **THE QUEUE RUNNER IS WEDGED, and it has been since about 06:36 UTC.** Runner pid 23880, started
  from worktree `agent-a5655ec96bd2c8221`, is alive and has started nothing. Landings **j-0907
  (PR 216), j-0908 (PR 218) and j-0909 (PR 219)** have sat in `waiting` for hours while
  `scripts/jobs.mjs` prints them as `starting`, so three sessions believe their branches are in
  flight and they are not. The scheduler puts them in its `start` list on every read, so it is the
  runner loop that is stuck, not the decision. The remedy is the one `runner()`'s own comment
  gives - stop the process and let the next `add` spawn a fresh one - and **this session could not
  do it**: killing another session's process is refused here. Somebody with that permission should
  kill 23880. Until then nothing lands, including this branch.
- **`scripts/e2e-runs.mjs --orphans` cannot see a stray dev server.** A killed Playwright run
  leaves its `vite --port <live>` child behind; `--orphans` looks for Playwright processes and
  answers "nothing to clean up", while the guard hook refuses the next run because the port is
  busy and points you at that same command. The two disagree, and the only way out is to find the
  pid holding the port yourself. Worth teaching `--orphans` about the dev server.

## Check

- `review: delegated` - the code-review skill, effort high, scope handed as the 9 files and base
  `77eeabc` out of `scripts/review-request.mjs`. Scope-checked: it reported base `77eeabc` and
  every path in its findings is in that list; `git diff --name-only 77eeabc..HEAD` is those same 9
  files and `git status --porcelain=v1` is empty. Three findings, all confirmed against the code,
  all fixed - the verdict address (medium), the stale `75 / 88` bullet header (low), and the walk
  implying a hosted-origin press that never happened (low).
- `simplify: inline` - the skill returned fan-out instructions, so the pass was done here over
  reuse, simplification, efficiency and altitude. Two small edits: a duplicated paragraph in the
  new comment folded into one, and two template literals with nothing to interpolate turned into
  plain strings. Considered and rejected: moving the address into `CasparResult` (it is shared
  with the Settings panel's Test verdict, so it would ripple outside this diff).
- `verify: npm run build` green twice (before and after the check fixes), and CI green on the
  branch - Build, Factory gates, nine E2E shards and the CI gate all `success` on `c7e36a55`,
  re-run on `d70ee1e6`. `npm run test:e2e:affected` was NOT run on this laptop: the planner
  escalates this diff to the full suite plus the catalog battery, which CI runs on a clean
  checkout anyway, and the queue runner that serializes browser work is wedged.
- `taste: not applicable` - no design file, no template machinery, no fit or alignment code. The
  graphics in the frames are the existing house scorebug, unmodified.

## Left undone

- **The hosted-origin press** (above). Needs a person to answer the browser permission prompt.
- **SDI, a second machine, and the venue's network.** A screen consumer proves the server, the
  socket and the HTML producer. It proves nothing about a Decklink card, a LAN hop between the
  agent and CasparCG, or whether the school's network lets a playout box reach the public
  internet at all - the output page is a live HTTP client, not a file.
- **A genuine 2.3.3.** The install named `v2.3.3-lts-stable` is a 2.3.2 binary, so the 2.3.3+
  engine row in `engineSupport.ts` is still a changelog inference.
