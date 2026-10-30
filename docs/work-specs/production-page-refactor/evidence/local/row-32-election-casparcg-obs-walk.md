# Row 32 walk: the election replay through CasparCG/NoaCG Bridge and an OBS browser source

The laptop helper's scratch walk on row 32's (E7.2b, project phase 34) merge SHA `9866960cb`
(spec.md §9.1, `extensions.md` row 32, non-gating), run on 2026-10-26 around 07:15 UTC on the
owner's Windows 10 laptop. It runs the software rehearsal's replay
([rehearsal.md](../../../playout-election-package/rehearsal.md), phase notes row 32) with the
production's output also on a CasparCG channel through the Bridge and in an OBS browser source.
The real-studio grade remains parent phase S, and nothing here qualifies a real results feed.

## Setup

- **App:** `9866960cb`, served by Vite on port 5295 (the live Playwright config's port for this
  checkout) against the local Supabase stack (CLI 2.111.0, all 100 migrations through 0102) and a
  throwaway user. The production was the shipped `election-rehearsal.noacgpack.json`, imported and
  published, with the source registered from `replay-source.json` as the runbook says.
- **Replay and agent:** the replay server (`--timeline package`) and the trusted agent
  (`scripts/external-data-connector.mjs` with `replay-agent.json`, its own process) on loopback,
  sending to the dev server's `/api/data/source`. The walk moved the timeline by hand, one step at
  a time, as the AC-4 configured walk does. Committed sha256 (first 16 hex), matching the phase
  notes: package `a51b45aef4dd2149`, `replay-source.json` `91d28a8ca978798c`, `replay-agent.json`
  `465f0ad501e13a62`. A Windows checkout with CRLF line endings hashes the two JSON files
  differently; the files read the same.
- **CasparCG:** 2.5.0, a scratch config with one 1080p50 channel and no consumers, AMCP on 5350,
  its media, log and data paths in the session's scratch directory. Pictures are its image
  consumer (`ADD 1 IMAGE`), one throwaway frame then the measured one.
- **NoaCG Bridge:** the CLI's `bridge` from the same merge (Bridge 0.10.0) on port 8898, its
  config folder in the scratch directory. Playout settings: channel 1, layer 20. With the
  production's CasparCG switch on, the panel read "Output slot 1-20, Empty, Load"; one Load put
  the output on 1-20 ("Loaded").
- **OBS:** 32.2.1 with obs-websocket 5.7.4, run as a portable copy in the scratch directory
  (websocket on 4466). One 1920x1080 browser source on the production's output URL; pictures are
  `GetSourceScreenshot` at 960x540, one throwaway then the measured one.
- **Driver:** a scratch Playwright spec (not committed) built from the AC-4 walk in
  `e2e/configured/election-selection.spec.ts`: it presses the page's own Take on Party totals,
  Count status, Headlines and Aino Example, moves the replay a step, waits for the browser output
  to show the step's figure, then takes the players' pictures 1.5 s later. Boxes are where the
  picture is opaque (alpha above 200 and not black). It passed on the third run; the first two
  stopped in the driver before any step (it opened the Playout panel and pressed Load too early).

## Results

The four graphics were on air together through every step, so each box is their union and
cannot show a figure change. The figures were read from the pictures.

| Step | Browser output (ms from the move) | CasparCG 1-20 (1920x1080) | OBS (960x540) | Figures on both players |
|---|---|---|---|---|
| Loaded, nothing on air | - | nothing opaque | nothing opaque | - |
| Count 1, four Takes | - | 96-1823 x 64-1039 | 48-911 x 32-519 | KOK 225,000; 60 of 100 areas, 20:14; Aino 3,500 |
| Count increase | 796 | same | same | KOK 228,000; 61 of 100; Aino 3,700 |
| Duplicate | 13077 (receipt) | same | same | unchanged |
| Correction down | 1005 | same | same | KOK 224,100; Aino 3,650 |
| Older revision | 914 (held) | same | same | unchanged |
| Malformed | 896 (held) | same | same | unchanged |
| Person deleted (candidates only) | 5210 | same | same | Aino 3,640, board and bug unchanged |
| Empty candidate list | 1786 | same | same | Aino holds 3,640 |
| All out | - | nothing opaque | nothing opaque | - |

- **Both players matched the browser output at every step.** The aired card followed Aino's
  corrections on CasparCG and in OBS (3,500, 3,700, 3,650, 3,640) and kept 3,640 after the valid
  empty list. The ticker crawled the operator's headlines throughout.
- **Times** are from the replay moving to the browser output showing the step, as the AC-4 walk
  measures them; the duplicate is a receipt (at most every 15 s), and the older and malformed
  steps change nothing. They are within the runbook's 10 s and 13 s bounds. The players' own lag
  was not timed: each picture was taken 1.5 s after the browser output moved, and it already
  showed the new figure.
- **Renderer rows:** each graphic's transport was its Take and the All out (`play`, `stop`), so no
  provider step took, advanced or reset anything. The agent's log held neither the replay token
  nor the data key.
- **Layout with all four on air:** the candidate card covers the party board's last row and the
  ticker covers the card's lower edge. A show would not air all four at once (the phase notes say
  the same of the cloud walk); not a defect.

## Not covered

Bridge and CasparCG restarts (row 25 walked them on `dda88db51`; E7.2b changes no Bridge or
output code), the replay server or agent stopping, a second production page, real candidates or
photos, a real results feed, fonts and assets on a separate target (both players ran on this
machine), vMix, and the Companion route.

## Left as found

- **CasparCG:** the scratch config `casparcg.noacg-laptop-walk.config` was written into the 2.5.0
  folder for the run and removed after the server stopped with AMCP `KILL` (checked: no `noacg`
  file left).
- **NoaCG Bridge:** the owner's Bridge settings in `%APPDATA%\noacg` were not touched (no file
  newer than 2026-10-16); the walk's Bridge used port 8898, not the owner's 8899.
- **OBS:** the walk used a portable copy in the scratch directory; no file under
  `%APPDATA%\obs-studio` was written on the day of the walk (checked after it).
- **Docker and the local stack:** Docker Desktop failed to start for lack of free memory (the
  WSL machine asks 4 GB) and started once memory was freed; the local Supabase stack was stopped
  after the walk with its data kept.
- **Stream Deck and Companion:** not started or touched.
