---
v: 2
source: owner
kind: ask
raised: 2026-08-27
state: unstarted
asked: "play local video files through the cloud playout into CasparCG, without the web (owner sketch in the 2026-08-27 wave input)"
---
# Play local video files through the cloud playout into CasparCG, without the web

**Filed:** 2026-08-28. **Source:** owner sketch in the 2026-08-27 wave input, naming an active
production pain. **Flagged as a NEXT-WAVE CANDIDATE**, unlike its parked sibling
[NoaCG Desktop](noacg-desktop-client.md).

## Why

**The owner's words: this is "one reason I can't use it in my productions."** That sentence is the
whole justification and it outranks every other line in this file. Every other item in this folder
is an idea; this one is a named blocker on the person whose shows the product exists for.

The shape of the pain: a show is graphics AND clips. Stings, VT inserts, a title sequence, a
sponsor bumper, the pre-recorded package the students actually made. Today NoaCG operates the
graphics beautifully from the playout dashboard, and the moment a clip has to roll, the operator
leaves our surface and goes to the CasparCG Client, OBS or vMix. A production that needs two
surfaces has, in practice, one - and it is not ours.

**Video must not travel through the web.** That is the load-bearing constraint and it is why this
is a wrapper and not a feature of the cloud. A clip base64'd into the published `output` jsonb row
is a wall, not a limit - the same reason `MAX_PICTURES = 20` is a real ceiling and the reason video
was ruled out when pictures shipped (`native-playout-and-pictures`). The file stays on the playout
box. **Only the reference travels.**

## What it would take

**SPX is the borrowing point, and its answer is deliberately unglamorous.** SPX has no picture or
video player either. Its `filelist` field type is a **dropdown over a folder on the SPX machine** -
the operator picks from what is already there - and SPX, being a local Node process, proxies the
AMCP command to CasparCG itself. The file never moves; the operator chooses a NAME, and the machine
that owns the file plays it. Copy that model exactly.

**Most of the transport already exists**, which is what makes this a next-wave candidate rather
than a programme:

- `noacg caspar agent` is a shipped CLI command that holds the AMCP socket on the operator's own
  machine (`docs/CASPARCG_CONNECT.md`). It already exposes `/status`, `/play`, `/stop` **and a
  generic `/amcp` endpoint that takes a command line** - so `PLAY 1-10 "clipname"` needs no new
  transport at all.
- The browser half (`src/control/casparLink.ts`) already knows the four hops, the token, the Local
  Network Access prompt and how to report which hop is broken.
- The production already has a durable command log every consumer follows, and a cue model on the
  playout dashboard.

What is genuinely missing:

1. **A file model.** The agent lists what is in a configured media folder on the playout box (the
   `filelist` move), and the production stores a NAME, never bytes. What the dashboard shows must
   be honest about the file being on the other machine and about it being absent.
2. **A video cue type** in the production, sitting beside the graphic cues, so Take rolls the clip
   and the same rail owns both. Layer discipline matters here: a clip and a graphic on the same
   channel are different layers, and the graphic must survive the clip.
3. **The operator surface**: roll, pause, out, and a truthful readout of position and remaining -
   AMCP's `INFO` gives it, and a clock the operator cannot trust is worse than none.
4. **The honest degrade.** No agent, no CasparCG, no folder: the dashboard says so and every
   existing route still works, exactly as `docs/CASPARCG_CONNECT.md` requires of the graphics link.

Explicitly out of scope: uploading video anywhere, rendering video in the cloud for this purpose,
transcoding, and a media asset manager. Each of those is a different product and each would sink
this one.

## Evidence

- Owner, 2026-08-27 wave input: this is a reason NoaCG is not used in his own productions.
- `native-playout-and-pictures` (owner, 2026-08-16): video was ruled out on the same row that
  shipped pictures, because a clip in a jsonb row is a wall; and SPX has no picture player either -
  `filelist` is a dropdown over a folder on the SPX machine.
- `docs/CASPARCG_CONNECT.md` - the agent, the four hops, the measured reason the socket cannot live
  in the browser, and the generic `/amcp` endpoint.
- `docs/NATIVE_PLAYOUT_RESEARCH.md` §3 route A - the FFmpeg producer plays any video file and any
  still, already, on the server the school already runs.
- `playout-web-first-direction` (owner, 2026-08-19): CasparCG hardware playout is proven at the
  school, and the WEB control panel is the surface under investment. This item puts the missing
  half of a real show onto that surface.

## Status

**Next-wave candidate.** It does not compete with the 2026-09-12 student production for the
calendar, but it is the highest-value thing in this folder because it is the only one with a named
owner blocker behind it. It should be sized properly in its own session before it is scheduled -
the transport is cheap and items 1 to 4 above are where the real work is. On 2026-09-10 the owner
said it matters but can wait until after the 25th, behind the editors and the North Star 2027
goals (ALIGN-2026-09-10-1 in `docs/OWNER_RULINGS.md`).
