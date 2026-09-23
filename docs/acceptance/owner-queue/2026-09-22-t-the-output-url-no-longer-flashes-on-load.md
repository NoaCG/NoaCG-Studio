---
kind: walk
date: 2026-09-22
because: taste
serves: now
---
# The output URL no longer flashes when CasparCG loads it

You reported that loading a published production's `/output` page as an HTML source in CasparCG
Client flashes the whole output as it comes up. It is ours, it is measured, and it is fixed.

## What was happening

When a browser source opens, the renderer replays every command the production's log holds that it
has not already rendered - on a first-ever load, that is the whole rehearsal. It ran that replay
off air, which is right, but it took the graphics off air by making the stage invisible. Chromium
throttles the rendering of an iframe its embedder has hidden, and every graphic is one: behind the
hidden stage the replay advanced about 0.03 seconds per second, so it was nowhere near finished
1.2 seconds later when the renderer decided it must be, and the rest of every entrance and exit
then played out ON AIR. That is the flash.

Two things changed. A graphic now goes off air from INSIDE its own document, so the frame keeps
its full frame rate and the replay is over in the time it should take. And when to come back is
asked rather than guessed: each graphic reports how far its animations have run, and air returns
when two asks in a row come back unchanged.

## Route, about four minutes, and it needs CasparCG

1. Open a published production on https://noacg.studio and take a couple of cues on the dashboard
   with no browser source anywhere - Take one graphic, Out, Take another, Out. That rehearsal is
   what the renderer has to catch up on, and it is the case that flashed.
2. Copy the production's **output** URL from the links popover.
3. In CasparCG Client, add an HTML item with that URL on a channel with something visible under it
   (a still, or your programme feed) so you can see the key, and play it.
4. Watch the first five seconds. The channel should hold whatever is underneath, untouched: no
   white frame, no graphic appearing and wiping itself off. If the production had a graphic ON
   AIR when you loaded it, that graphic appears in one step, already in place, without playing its
   entrance.
5. Reload the source a few times. Same every time.

## The measurements behind it

On this laptop's CasparCG 2.5.0, recording the channel to a file so every frame could be read:

- Before: 12 to 18 frames of graphics on air about a second after load, with the exit playing out
  on top of the layer underneath.
- After: 540 frames, not one pixel of ours, when the replay ends with everything off; and when it
  ends with a graphic live, exactly one frame of transition into the settled picture.
- The renderer came back on air 2.6 seconds after the page started, because the replay had
  actually finished, rather than at a fixed 1.2 seconds because a timer said so.

`e2e/output-first-paint.spec.ts` holds the same properties in the offline suite: nothing paints
from navigation until a cue is taken, a graphic taken off air keeps running while showing nothing,
and a replay that ends with everything off leaves the output clean.

## What is still CasparCG's own

Nothing, as far as this could be measured. A trivial transparent page loaded through the same
`PLAY [HTML]` command produced 291 frames with no flash at all, so the HTML producer itself does
not paint anything of its own when it loads a page. If you ever see a flash on a server where this
walk is clean, look at the mixer transition on the rundown item rather than at the page.
