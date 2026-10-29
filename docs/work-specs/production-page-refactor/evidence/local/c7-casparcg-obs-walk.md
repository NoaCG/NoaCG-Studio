# C7 walk: four data boards through CasparCG/NoaCG Bridge and an OBS browser source (row 14)

The laptop helper's scratch walk on C7's merge SHA `44bfa8955` (spec.md §9.1, data AC-16's
real-output half, non-gating), run on 2026-10-23 on the owner's Windows 10 laptop. The real-studio
receipts remain parent phase S.

## Setup

- **App:** `44bfa8955`, served by `npm run dev:worktree` on port 5284 against the local Supabase
  stack (migrations to 0100) and a throwaway user. The production was published, so both players
  followed the command log over the wire as in a show.
- **Production:** a News Strip ticker, a Schedule Board, a League Table (standings) and a Classic
  Roll (credits), each filled with Fill from › Paste rows.
- **CasparCG:** 2.5.0 (69e8ad5 Stable), a scratch config with one 1080p50 channel and no consumers,
  AMCP on 5350. Pictures are its own image consumer (`ADD 1 IMAGE`), one throwaway frame then the
  measured one, because the consumer writes the frame it already holds.
- **NoaCG Bridge:** the CLI's `bridge` from the same merge (0.12.3) on port 8898, with its config
  folder in the session's scratch directory. The page's Playout settings pointed at it with
  channel 1, layer 20. Publish loaded the output on 1-20 through the Bridge
  (`PLAY 1-20 [HTML] .../output?production=...&destination=casparcg`).
- **OBS:** 32.2.1 with obs-websocket 5.7.4, a new scene collection with one 1920x1080 browser source
  on the production's output URL. Pictures are `GetSourceScreenshot` at 960x540, also one
  throwaway then the measured one.
- **Steps:** for each board Take, then new rows and Update, then Out; then the ticker and the
  standings taken together, then All out; then the renderer unloaded from CasparCG with the panel's
  Unload. Each picture is taken 3.5 s after the press. Boxes are where the picture is opaque (alpha
  above 200 and not black).

## Results

Both players showed every step. Their boxes agree at the 2:1 scale between them, and the same walk
on main a few minutes before C7 landed gave the same numbers.

| Step | CasparCG 1-20 (1920x1080) | OBS browser source (960x540) |
|---|---|---|
| Loaded, nothing on air | nothing opaque | nothing opaque |
| Ticker take | 120-1799 x 871-960 | 60-899 x 435-480 |
| Ticker update | 120-1799 x 871-960 | 60-899 x 435-480 |
| Ticker out | nothing opaque | nothing opaque |
| Schedule take | 500-1419 x 427-652 | 250-709 x 213-326 |
| Schedule update | 500-1419 x 395-684 | 250-709 x 197-342 |
| Schedule out | nothing opaque | nothing opaque |
| Standings take | 493-1426 x 417-648 | 246-713 x 208-324 |
| Standings update | 493-1426 x 382-684 | 246-713 x 191-342 |
| Standings out | nothing opaque | nothing opaque |
| Credits take | 0-1918 x 0-1078 | 0-959 x 0-539 |
| Credits update | 0-1918 x 0-1079 | 0-959 x 0-539 |
| Credits out | nothing opaque | nothing opaque |
| Ticker and standings together | 120-1799 x 382-960 | 60-899 x 191-480 |
| All out | nothing opaque | nothing opaque |

- **Update reached both players.** The schedule and the standings grew by the row each update added
  (the boxes above). The ticker's CasparCG frame after the update reads "Walk update two" and
  "Second headline here", the new rows. The credits roll fills the frame, so its box cannot show
  a change; its OBS picture changed in 5,638 of 518,400 pixels between Take and Update, which a
  roll also does on its own, so that alone is weak evidence.
- **The page told the truth about the slot.** In the shake-out runs before this one, a production
  from an earlier run still held 1-20: the status read "Another production on 1-20" and the panel
  asked "Replace the other production on 1-20?" before replacing it. The panel listed the OBS
  output as "OBS · Chromium 127" once it connected.

## A defect found: the standings re-taken show no rows

In the step "Ticker and standings" the League Table came back with its frame and header but no
rows, in both players. Reproduced without CasparCG or OBS on the published output page: any second
Take of a League Table after an Out leaves `div.results-board-body` at an inline `opacity: 0`, with
or without an Update in between, and phase 1's merge `0ca774269` does the same, so it is older than
this run. The page's own PROGRAM monitor shows the rows. Filed as #1618.

## Not covered

Continue/Next, a Sheet or feed source (the rows were pasted), fonts and assets on a separate
target, a Bridge or CasparCG restart and reconnect, vMix, and the Companion route (row 2) were not
part of this walk.

## Left as found

- **CasparCG:** the scratch config `casparcg.noacg-laptop-walk.config` was written into the 2.5.0
  folder for the run and removed after the server stopped with AMCP `KILL` (checked: no `noacg`
  file left). Its media, log and data paths were in the session's scratch directory. CasparCG also
  refreshed its own `cef-cache` folder next to the executable, as any start does.
- **NoaCG Bridge:** the owner's Bridge settings in `%APPDATA%\noacg` were not touched (newest file
  from 2026-10-16); the walk's Bridge used port 8898, not the owner's 8899.
- **OBS:** its obs-websocket config, `user.ini`, `global.ini` and the `Untitled` collection were
  copied before the run and compared after it: all identical byte for byte, and the websocket
  server is off again. OBS ran the walk in a new collection `NoaCGLaptopWalk`, switched back to
  `Untitled` over the websocket and was closed through its main window; the walk collection's
  files were moved out of `basic/scenes` (left: `Untitled.json` and its `.bak`).
- **Stream Deck:** the owner's Stream Deck app was running and was not touched; Companion did not run.
