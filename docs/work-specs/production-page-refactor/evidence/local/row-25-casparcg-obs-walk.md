# Row 25 walk: four data boards through CasparCG/NoaCG Bridge and an OBS browser source

The laptop helper's scratch walk on phase 14's merge SHA `dda88db51` (spec.md §9.1, `extensions.md`
row 25, non-gating), run on 2026-10-24 on the owner's Windows 10 laptop. It repeats
[C7's walk](c7-casparcg-obs-walk.md), which ran on `44bfa8955` before phases 3 to 13b changed the
page, and adds Next, a Bridge restart and a CasparCG restart. The real-studio receipts remain
parent phase S.

## Setup

- **App:** `dda88db51`, served by Vite on port 5235 (the live Playwright config's port for this
  checkout) against the local Supabase stack (migrations to 0100) and a throwaway user. The
  production was published, so both players followed the command log over the wire.
- **Production:** a News Strip ticker, a Schedule Board, a League Table (standings) and a Classic
  Roll (credits), each filled with Fill from › Paste rows.
- **CasparCG:** 2.5.0 (69e8ad5 Stable), a scratch config with one 1080p50 channel and no consumers,
  AMCP on 5350, its media, log and data paths in the session's scratch directory. Pictures are its
  image consumer (`ADD 1 IMAGE`), one throwaway frame then the measured one.
- **NoaCG Bridge:** the CLI's `bridge` from the same merge (0.12.3) on port 8898, its config folder
  in the scratch directory. Playout settings: channel 1, layer 20. Publish loaded the output on
  1-20 through the Bridge.
- **OBS:** 32.2.1 with obs-websocket 5.7.4, run as a **portable copy** in the scratch directory
  (its own config, websocket on 4466), so the owner's OBS configuration was never opened. One
  1920x1080 browser source on the production's output URL; pictures are `GetSourceScreenshot` at
  960x540, one throwaway then the measured one.
- **Driver:** a scratch Playwright spec (not committed) that presses the page's own Take, Update,
  Next, Out and All out, and takes each picture 3.5 s after the press. Boxes are where the picture
  is opaque (alpha above 200 and not black). The walk ran three times: the first two stopped in the
  driver's own restart steps (a read that waited out the test timeout, then an OBS input name
  reused too soon); every board step gave the same boxes in all three. The results below are the
  third run, which passed end to end.

## Results

Both players showed every board step, and their boxes agree at the 2:1 scale between them.

| Step | CasparCG 1-20 (1920x1080) | OBS browser source (960x540) |
|---|---|---|
| Loaded, nothing on air | nothing opaque | nothing opaque |
| Ticker take | 120-1799 x 871-960 | 60-899 x 436-479 |
| Ticker update | 120-1799 x 871-960 | 60-899 x 436-479 |
| Ticker out | nothing opaque | nothing opaque |
| Schedule take | 500-1419 x 392-687 | 250-709 x 196-343 |
| Schedule update | 500-1419 x 361-718 | 250-709 x 181-358 |
| Schedule out | nothing opaque | nothing opaque |
| Standings take | 460-1459 x 349-730 | 230-729 x 175-364 |
| Standings update | 460-1459 x 314-765 | 230-729 x 157-382 |
| Standings out | nothing opaque | nothing opaque |
| Credits take | 0-1919 x 0-1079 | 0-959 x 0-539 |
| Credits update | 0-1919 x 0-1079 | 0-959 x 0-539 |
| Credits out | nothing opaque | nothing opaque |
| Ticker and standings together | 120-1799 x 314-960 | 60-899 x 157-479 |
| All out | nothing opaque | nothing opaque |

- **Update reached both players.** The schedule and the standings grew by the row each update added
  (the boxes above), and the CasparCG frame after the standings update shows the added fourth row
  (G2). The ticker's frames after its update read "Walk update two" and "Second headline here". The
  credits roll fills the frame, so its box cannot show a change.
- **Boxes differ from C7's for the schedule and standings** because a board's height follows its
  rows, and this walk's pasted rows are its own (three schedule rows, three teams, one more of each
  by Update). The ticker and credits boxes match C7's.
- **#1618 still reproduces on `dda88db51`.** In "Ticker and standings together" the League Table
  came back with its frame and header but no rows, in both players, as C7 found on `44bfa8955`.

## Added: Next, a Bridge restart, a CasparCG restart

- **Next** is not offered on any of the four boards: `verb-next` was disabled while each was on air
  (they have one step each). Continue/Next on a real output therefore stays uncovered; it needs a
  stepped graphic.
- **Bridge restart.** With the Bridge process stopped, the Playout panel had no output slot line.
  A Ticker Take was pressed while it was down; its pictures could not be taken, because this walk
  reads CasparCG through the Bridge, so whether that Take aired on CasparCG is **unverified**.
  After the Bridge was started again (same scratch config), the panel read "Output slot 1-20,
  Loaded" within about 10 s without any press, and Out cleared both players.
- **CasparCG restart.** After AMCP `KILL` and a fresh start of the same scratch config, the panel
  read "Output slot 1-20, Empty" with a Load button, and stayed so for 90 s. A Schedule Take then
  reached OBS (250-709 x 180-359) but not CasparCG (nothing opaque), as the panel said. The page
  told the truth about the slot; it did not put the output back by itself. Whether it should is
  not stated in `docs/BRIDGE.md` (which records "recovering after ... a server `RESTART`" on
  2026-09-10 without saying whether a press was needed), so this is recorded as observed, not as a
  regression.

## Not covered

A Sheet or feed source on a real output (the rows were pasted), Continue/Next (above), fonts and
assets on a separate target (both players ran on this machine), vMix, and the Companion route
(row 2).

## Left as found

- **CasparCG:** the scratch config `casparcg.noacg-laptop-walk.config` was written into the 2.5.0
  folder for the run and removed after the server stopped with AMCP `KILL` (checked: no `noacg`
  file left). CasparCG refreshed its own `cef-cache` folder next to the executable, as any start
  does.
- **NoaCG Bridge:** the owner's Bridge settings in `%APPDATA%\noacg` were not touched (newest file
  from 2026-10-16); the walk's Bridge used port 8898, not the owner's 8899.
- **OBS:** the walk used a portable copy in the scratch directory; no file under
  `%APPDATA%\obs-studio` was written on the day of the walk (checked after it).
- **Stream Deck and Companion:** not started or touched.
