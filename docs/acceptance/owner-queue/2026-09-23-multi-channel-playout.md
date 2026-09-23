---
kind: walk
date: 2026-09-23
because: direction
serves: now
---
# One rundown on two CasparCG channels: graphics on 1, inserts on 2

Settings -> Playout now names the server's channels, and every server cue in a rundown picks its
channel beside its layer, the way the CasparCG Client does. New server templates go to the
graphics channel and new clips to the insert channel; any cue can be moved. All out takes off
every server cue the rundown put up, on whichever channel it is, and leaves anything else on the
server alone. The hosted control page shows the same `2-10` address on each server cue.

A studio with one channel sees one row, `1 Graphics`, and nothing about its productions changes:
a saved cue with no channel plays on the graphics channel, where it always played.

**What ran on the real server.** CasparCG 2.5.0 on this laptop, with a second channel added to
`casparcg.config` (the one-channel original is kept beside it as
`casparcg.config.bak-2026-09-23-one-channel`), through NoaCG Bridge 0.4.0, driven by the second
test in `e2e/configured/bridge-real-server.spec.ts` (`BRIDGE_REAL=1`). From one rundown: the
`HOUSE_STRAP` server template was taken on 1-21 and the clip `ILMARI_OHJAA_MUSATALO` on 2-10;
`PRINT 1` showed the strap alone and `PRINT 2` the clip. The strap was then moved to channel 2
while on air: Out reached 1-21, where it was, and the next Take put it on 2-21 over the clip,
leaving channel 1 empty. A still played on 1-5 by hand, standing in for another client, stayed
up through All out; channel 2 came back to the empty frame. The nine frames are in
`test-results/bridge-real/mc-*.png` on this laptop, not committed.

**Two decisions here are yours to revert.** A fresh studio starts with ONE channel, and "Add
channel" makes the second one, already named Inserts and already the clip default, because a
stock `casparcg.config` has one channel and a clip aimed at a missing channel 2 fails. And the
channel lives on the server item beside its layer, so every cue of one item shares its slot, the
way every cue of one graphic shares its layer.

**Also fixed on the way.** The Bridge read a clip's frame timing upside down, so the server
picker showed a 27-second clip as hours long. The fix is in this branch; operators get it with
the next Bridge release (`cli/BRIDGE_CHANGELOG.md` 0.4.1), which is yours to publish.

## The route, under a minute

1. Start CasparCG 2.5.0 (`C:\casparcg\casparcg-server-v2.5.0-stable-windows\casparcg.exe`, two
   screen windows now) with `scanner.exe`, and NoaCG Bridge.
2. Settings -> Playout: under Channels press **+ Add channel**. The table reads `1 Graphics`,
   `2 Inserts`, and Clips reads `2 · Inserts`.
3. Open a production, **＋ From the playout server…**: add `HOUSE_STRAP/HOUSE_STRAP` and a clip.
   The rows read `1-21 · Server template` and `2-10 · Server clip`.
4. Take both. The strap is in the channel 1 window, the clip in the channel 2 window.
5. Select the strap and pick **Channel 2** beside the layer, then Out and Take: it moves to the
   channel 2 window. Press **■ All out**: both windows clear.

## What to look at

- Settings: the channel table lines up with the host and port rows above it, and the Graphics
  layer box sits under the port box.
- The server cue editor: Operator note, Channel, Layer on one row, all three boxes one height.
- Rundown rows: the address reads `2-10`, and hovering it says "channel 2 (Inserts), layer 10".
