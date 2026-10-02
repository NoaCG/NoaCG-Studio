---
kind: desktop
date: 2026-10-02
serves: now
---
# NoaCG Bridge 0.8.0 keeps your studio's channels, in your studio, about ten minutes

NoaCG Bridge now keeps, per CasparCG server, the channels with their names, the NoaCG output slot
and the New media channel, so every browser paired with it opens with the same setup; and the
pairing page says one line per step, offers This computer and the servers used before, and shows
how to copy a pairing link into another browser (docs/work-specs/studio-day-playout AC-11, AC-12).
It was walked here against scratch CasparCG 2.5.0 and 2.3 servers with three browser profiles
(evidence/landing-3.md). What a machine here cannot do is your studio: CasparCG on another
computer, your real channels, and the Bridge's own window.

## The route

1. Download NoaCG Bridge 0.8.0 from the Downloads page and start it. Pair Chrome as usual. It
   connects to your server by itself; your current channels move into the Bridge the first time.
2. In the Bridge window, press Enter. Copy the new link into another browser, or another Chrome
   profile (for a second account), and press Pair there. It should say "Connected to CasparCG … 2
   channels, NoaCG output on 1-20." (your numbers), and its Playout settings should show your channel
   names without typing anything.
3. Rename a channel in one browser, then open a production in the other: the production's Playout
   panel, under Setup, shows the new name's count and slot.
4. Press Ctrl+C in the Bridge window: it should stop as before.

**What to look at.** Whether the pairing page now reads at a glance, whether the info buttons hide
the right things, and whether "copy the link into the other browser" is clear without explanation.
