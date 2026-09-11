---
v: 2
source: owner
kind: ask
raised: 2026-08-27
state: unstarted
note: "unlocked by the owner on 2026-09-10 (ALIGN-2026-09-10-4 in docs/OWNER_RULINGS.md), which supersedes the 2026-08-16 parking recorded in docs/NATIVE_PLAYOUT_RESEARCH.md; nothing has landed against it yet"
asked: "a local NoaCG client that owns the box, with CasparCG rented as the engine (owner sketch in the 2026-08-27 wave input)"
---
# NoaCG Desktop - our own local client that owns the box, with CasparCG rented as the engine

**Filed:** 2026-08-28. **Source:** owner sketch in the 2026-08-27 wave input, resting on the
owner's own 2026-08-16 ruling recorded in `docs/NATIVE_PLAYOUT_RESEARCH.md`.

## Why

**Something local always has to hand pixels to a wire.** SDI and NDI have no cloud path; a card,
a driver and a clock live in a room. Every competitor answers this the same way and none of them
say so out loud: Singular.live's "SDI support" is a customer PC running TouchDesigner or OBS
pointed at a Singular output URL, and Viz Flowics, LIGR and Loopic have the same shape. SPX is not
even a cloud service and still does not touch SDI - it hands HTML to CasparCG, which owns the card.

So the question was never "can we go from the cloud to SDI". It is **whose local box is it.**
Today that box runs the CasparCG Client, OBS or vMix. The CasparCG Client in particular is, by a
wide margin, the ugliest thing in a student's first hour, and it is the last place in the chain
where the product stops being ours.

The second reason is that **the output side is already free.** `/output?production=<slug>` is a
transparent, self-recovering renderer that follows the durable command log - cues, layers,
per-layer recovery baselines, phone control, publish pinning, old-CEF compatibility. Anything that
can display a web page inherits all of it. A desktop client is a NEW CONSUMER OF AN EXISTING
PUBLISHED CONTRACT, exactly like OBS is today. Nothing in the studio, the wizard, the control layer
or the export registry has to move for it to exist, and if it is abandoned, nothing has to be
unwound.

## What it would take

**The shape the owner chose is Option A of `docs/NATIVE_PLAYOUT_RESEARCH.md`: become the CLIENT,
keep CasparCG as the engine.** Own the client and the agent; rent the engine forever.

- A desktop application that drives an **unmodified CasparCG Server** over **AMCP** (a plain
  line-based TCP protocol on port 5250), so the user never opens the Qt client again.
- Everything the server already does arrives on day one and costs nothing to build: **SDI fill and
  key** with embedded audio through the DeckLink consumer, **NDI in and out** (native since 2.3),
  any video file or still through the FFmpeg producer, **our graphics** through the HTML producer
  pointed at the output URL we already publish, and **SRT/RTMP out** through the FFmpeg consumer.
- Managed CasparCG is the product idea on top: install it, configure it, keep it alive, and show
  its state in our own surface rather than in a config file the student edits by hand.
- **Screen output** is the cheap first rung and needs no card at all: a full-screen transparent or
  keyed window on a second display, which is what a lecture hall, a stream and most school
  productions actually use.

Explicitly NOT in scope: replacing the CasparCG Server. That is where the cost lives, and the
2026-08-16 ruling put it at "maybe when we are a million-dollar enterprise".

## Evidence

- `docs/NATIVE_PLAYOUT_RESEARCH.md` - the full four-route costing, the market survey, and the
  reason the framing is "whose local box".
- Owner ruling, 2026-08-16: Option A chosen, the programme PARKED, video playout stays local in a
  client. Recorded in memory as `native-playout-and-pictures`. The parking was lifted on
  2026-09-10 by ALIGN-2026-09-10-4.
- `docs/CLOUD_PLAYOUT.md` §7 already predicted a local process holding an outbound connection and
  consuming the same log. It was written for data connectors; a playout agent is the same shape
  pointed at pixels instead of values.
- Owner, 2026-08-19 (`playout-web-first-direction`): CasparCG hardware playout is PROVEN at the
  school. This item is not about making playout work - it works. It is about who the user talks to.

## Status

**Unlocked on 2026-09-10.** Asked at the weekly alignment session whether the desktop app stays
parked by his August decision, the owner answered "Everything should be unlocked. There's no reason
to lock anything" (ALIGN-2026-09-10-4 in `docs/OWNER_RULINGS.md`). That ends the 2026-08-16 parking
for this item, so it now waits its turn on the shelf like any other ask rather than being held
back on principle. Replacing the CasparCG Server stays out of scope, because that is this item's
shape, not a lock. Its close relative,
[video through the playout wrapper](video-through-playout-wrapper.md), is the part of this idea
that the owner has an active production pain for, and that one IS a next-wave candidate.
