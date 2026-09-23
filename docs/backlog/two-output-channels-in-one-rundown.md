---
v: 2
source: owner
kind: ask
raised: 2026-09-23
state: unstarted
asked: "a real broadcast has two CasparCG channels, graphics on 1 and insert videos on 2; one rundown must cue onto both, choosing the channel like the CasparCG Client does. Plan it before building it - think of the bigger picture, not one production."
---
# Two output channels in one rundown

**Filed:** 2026-09-23, from the owner's first real production with NoaCG Bridge. **What is true
today:** the studio has ONE playout slot in Settings -> Playout (channel, layer), and every
production goes on air there; a server clip or template cued from the rundown takes its own
LAYER (`PlayoutItem.layer`) but always the studio's CHANNEL. So a rundown cannot put its
insert videos on channel 2 while its graphics sit on channel 1. The owner's reading is
correct.

## What already exists, so the change is smaller than it looks

The playout protocol carries the channel per command: a `Slot` is `{ adapter, channel, layer }`
and every Take, Update, Out, pause and resume names its slot (`cli/src/playout/protocol.ts`).
The Bridge needs nothing. What is missing is on NoaCG's side: the show record stores a layer per
item and no channel, and the studio setting is where the channel is read from
(`src/control/playoutLink.ts` `slotFor`). `docs/BRIDGE.md` design decision 2 already says NoaCG
owns the configuration, so this is a model and UI change, additive to the show record.

## The plan

1. **Name the channels once, in Settings -> Playout.** Instead of one channel and one layer,
   a short table: channel number and what it is for (`1 Graphics`, `2 Inserts`), with the
   graphics layer kept as it is. One row is today's setting, so an existing studio changes
   nothing. Stored in the same `spx-gfx-caspar` record, additive, no version bump.
2. **Every playout item carries its slot.** `PlayoutItem` gains an optional `channel`; absent
   means the graphics channel, so every saved show reads as before. `addPlayoutItem` gives a
   clip the INSERT channel when the studio has named one (and layer 10 there), and a template
   the graphics channel. The cue editor shows the channel beside the layer box, chosen from
   the named channels, never typed - the same choice the CasparCG Client offers, in NoaCG's
   words.
3. **The production itself can go on air on more than one channel.** Put on air today loads the
   output URL on the graphics slot; it stays that way. A later slice lets a production name a
   second slot for a second output page (a fullscreen channel with its own graphics), which is
   the same mechanism with a second URL, and is NOT part of this ask.
4. **All out clears every channel the rundown touched**, not only the graphics one, and the
   hosted control page shows the channel on each server cue the way it shows the layer.
5. **Prove it on the real 2.5.0** with two channels in `casparcg.config` (a screen consumer
   each): a graphic on 1-20, a clip on 2-10, All out, PRINT both channels.

Milestone 3 in `docs/BRIDGE.md` (the Bridge serving the production to CasparCG over the LAN)
does not change this plan; slots are the vocabulary either way.

## Not in this ask

Routing between channels (a channel keyed over another), audio, or timecode. Those are the
server's configuration, and the CasparCG Client does not offer them either.
