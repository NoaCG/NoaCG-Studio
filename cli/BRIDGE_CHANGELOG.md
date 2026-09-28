# Changelog - NoaCG Bridge

What changed in each NoaCG Bridge release, written for the operator deciding whether to download
the new one. The release workflow puts a version's section on its GitHub Release page under
"What changed", inside the page `cli/BRIDGE_RELEASE.md` describes, and refuses a version that has
no section here (`cli/scripts/release-notes.mjs --bridge`).

The version is `cli/package.json`'s. The Bridge and the NoaCG CLI are built from that one
package, so they share the number; a Bridge release may skip versions that only changed the CLI.

Write a section the way you would tell an operator what they get by downloading again: what was
wrong or missing, what it does now, and anything they have to do. No pull request lists, no
usernames, no internal names, nothing about how the program is built.

## 0.4.2 - 2026-09-28

**A countdown for the clip on air.** Until now the production page only knew what it had asked
the server to do, so it could not tell you how long a clip had left, and a clip that ended or was
stopped from somewhere else still showed as on air. The Bridge now reads what each layer of the
server holds, and the page shows it: a clock under the buttons counting down the clip on air, red
in its last ten seconds and pulsing in the last five, then `HOLDING` once the clip stops on its last
frame. Each clip's row counts down too. If the clip is stopped or replaced from the CasparCG Client,
the page says so, and after a reload it finds the clip it started again.

Download the new Bridge to get the countdown; nothing else to do. With the old one everything still
works, and the clock counts from your Take and says `estimated`. It needs CasparCG 2.3 or newer.

## 0.4.1 - 2026-09-23

**Clip lengths are right.** The server picker showed a video clip as hours long: CasparCG lists a
clip's frame timing as seconds per frame, and the Bridge read that number upside down, so a
27-second clip at 30 frames a second came through at a thirtieth of a frame a second. It now
reads it the right way round, and the picker shows the real length. Nothing to do but download
the new one; clips already in a rundown play exactly as before, because playing never used this
number.

## 0.4.0 - 2026-09-23

The first release. NoaCG Bridge lets the NoaCG production page put a production on a CasparCG
channel with one button, list the templates and clips already on the server, and cue them from
the rundown beside your own graphics. It replaces the earlier "caspar agent" from the NoaCG CLI:
pairing is now one click on a page the Bridge opens, and a browser paired with the old agent
stays paired.

Nothing to do after downloading: double-click it and leave its window open while you work.
