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

## 0.9.0 - 2026-10-06

**Pictures keep their proportions.** The selected picture cue now offers Fit and Stretch.
Fit centers the complete picture with opaque black bars and is the default. Stretch fills
the frame when you deliberately want to change the proportions. Changes apply at the next
Take, and Out/Clear removes the complete picture from its own slot.

Update the Bridge to use Fit with CasparCG 2.5 or later. An older Bridge is identified in the
cue editor and readiness status, so a Fit request cannot silently play stretched. PNG/JPEG
and standard HD/UHD channel formats are supported. Unsupported formats report the problem
before replacing the current picture; Stretch remains available through the native producer.

**Clip names keep their spaces.** A file with a space before its extension could play normally
but lose its countdown and Out controls. The Bridge now keeps the exact filename reported by
CasparCG, so it continues to recognize the cue it started. The original media needs no renaming.

**Stop/Clear empties the requested slot.** Immediate recovery now clears both playing and queued
media, including a clip started outside NoaCG. Other channels and layers keep playing.

## 0.8.1 - 2026-10-03

**Playout settings can read your server's channels.** NoaCG Bridge now asks CasparCG which
channels it has and which video mode each uses. Playout settings shows those modes, warns if a
saved channel is missing from the server, and Add channel offers the next channel the server
really has. Reading the channels changes nothing on air. With an older Bridge, or a server
that cannot report its channels, the channel list works as before.

**A playing clip can change how it ends.** The Bridge can now change a looping clip to hold,
clear, or play the next clip without starting it again. The clip finishes its current loop,
then follows the new ending. This works with CasparCG 2.3 and 2.5. The studio page will send
these changes in a later update; until then, changing At the end applies at the next Take,
as before.

Download the new Bridge to read your server's channels and be ready for changes to a playing
clip's ending. Your saved servers and channels stay with you; there is nothing to set up again.

## 0.8.0 - 2026-10-02

**Your studio's channels are remembered too.** NoaCG Bridge now keeps, for each CasparCG server, the
channels with the names you gave them, where NoaCG's own output plays and which channel new media
starts on. A second browser, another account in its own browser profile, or a browser that forgot
everything opens with the same setup after pairing, with nothing typed again. If one laptop is used
with two CasparCG servers, each keeps its own channels: pick the server and its setup comes with it.
The setup you have now moves into the Bridge the first time the new Bridge sees your server.

**Pairing another browser.** The pairing page now says one line per step, with the details behind
small info buttons, and offers This computer beside the servers you used before, also once it has
connected by itself. To pair another browser, copy a pairing link into it: the pairing page and
Playout settings each have a button that makes one, and pressing Enter in the NoaCG Bridge window
prints one. Each link works once, within two minutes.

Download the new Bridge to have the setup kept for every browser. With an older Bridge everything
still works, and each browser keeps its own setup, as before.

## 0.7.0 - 2026-09-30

**Your CasparCG server is remembered.** Right after a browser pairs, NoaCG now connects to your
CasparCG server by itself. NoaCG Bridge remembers the servers you connected to, on this computer,
so you no longer type the server's IP address after pairing, even in a browser that forgets
everything when it closes. If the last server does not answer, the pairing page fills in its
address and lists the servers you used before, one click each. Connecting only asks the server for
its version: nothing goes on air until you press Put on air.

**Connect and Put on air in Playout settings.** A production's Playout settings now have Connect
and Put on air beside Test connection, and the servers you used before are one click each there
too.

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
