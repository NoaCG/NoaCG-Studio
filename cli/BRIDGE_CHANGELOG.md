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

## 0.7.0 - 2026-09-30

**Your CasparCG server is remembered.** Right after a browser pairs, NoaCG now connects to your
CasparCG server by itself. NoaCG Bridge remembers the servers you connected to, on this computer,
so you no longer type the server's IP address after pairing, even in a browser that forgets
everything when it closes. If the last server does not answer, the pairing page fills in its
address and lists the servers you used before, one click each. Connecting only asks the server for
its version: nothing goes on air until you press Put on air.

**Connect and Put on air in Playout settings.** A production's Playout settings now have Connect
and Put on air beside Test connection, and the server field offers the servers you used before.

Download the new Bridge to have the server remembered. With an older Bridge everything else works,
and the browser remembers the one server it used last, as before.

## 0.6.0 - 2026-09-28

**Folders of clips, and a folder that starts over.** On the production page, cues can now be put in
folders. A folder set to Play through plays its clips one after another on one layer from a single
Take, the way Play next does. With this Bridge a Play-through folder can also start over after its
last clip and keep going until Out: NoaCG Bridge queues the first clip again while the last one
plays, so the server goes straight from the last clip back to the first.

Download the new Bridge to use Loop the folder. With an older Bridge everything else about folders
works, and a folder set to loop says it needs the new Bridge instead of stopping after its last clip.
Like Play next, it needs CasparCG 2.3 or newer. If NoaCG Bridge is closed while a folder loops, the
clip on air and the one queued behind it still play, and nothing after them starts.

## 0.5.0 - 2026-09-28

**Clips play the way their cue says.** Until now a clip from the server could only play once or
loop. Each clip on the production page now has its own settings: what happens at its end (hold the
last frame, clear the layer, loop, or play the next clip), a fade in and a fade out, a sound level in
dB, and where in the file it starts and ends. The CasparCG server does the work itself. The level
goes with the clip as the clip's own audio filter, so a clip keeps its level when the server switches
to it, and nothing touches the layer's mixer.

**Play next.** A clip set to Play next hands over to the next clip on the same layer by itself,
with no gap, even with the NoaCG tab in the background or closed: NoaCG Bridge queues each next clip
on the server while the one before it plays. Out in the middle stops the whole run and nothing else
airs. The clock on the production page counts down TO STUDIO, the time until the last clip ends,
with the fades taken off.

**Audio files** play on their own layer, below the clips, so a sting never knocks a video off.

Download the new Bridge to use these settings. With an older Bridge every existing cue still plays
exactly as it did, and a cue with one of the new settings says it needs the new Bridge instead of
playing without it. The settings need CasparCG 2.3 or newer, except Clear at the end, which any
version can do. If NoaCG Bridge is closed while clips play one after another, the clip on air and
the one already queued behind it still play, and nothing after them starts.

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
