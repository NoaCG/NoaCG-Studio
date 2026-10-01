---
kind: desktop
date: 2026-10-02
serves: now
---
# Alpha video on channel 1 through the ATEM's downstream keyer, and channels in the studio

Server media now picks its own Channel and Layer in the rundown (docs/work-specs/studio-day-playout,
landing 1). On CasparCG 2.3 and 2.5 the channel itself was measured: a video with alpha plays on
channel 1 under or over the NoaCG output, and it is exact when rendered with **premultiplied** alpha.
A straight-alpha render comes out too bright where it is partly transparent. What no machine here
has is an SDI card and your ATEM, so the last hop is yours.

## The route, about ten minutes in the studio

1. In a test production, add a video with alpha from the server (ProRes 4444 or QuickTime Animation,
   exported "Premultiplied (Matted)" with black) and a normal clip or still.
2. In the alpha video's editor pick **Channel 1**, layer 10 (under NoaCG's graphics). The normal one
   stays on **Channel 2**. Take both.
3. On the ATEM, with the DSK fed from CasparCG channel 1's fill and key, look at a soft edge or a fade
   of the alpha video with **Pre Multiplied Key** on, then off.

**What to look at.** Which DSK setting makes soft edges and fades look clean (expected: on), and
whether moving items between channel 1 and 2 felt as easy as changing a layer. If a straight-alpha
render from your own library is what you have, try it too: it should show the bright fringe, and
that is what the user guide now warns about.
