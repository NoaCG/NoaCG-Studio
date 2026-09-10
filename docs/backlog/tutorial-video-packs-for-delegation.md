---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: unstarted
asked: "We need to make tutorial videos for these graphics and we could create them through Hyperframes but lets not use Claude code usage for that. I have another workflow through Gemini models but we need to have the screenshots, instructions, and the script so I can delegate it to Gemini models."
---
# Tutorial videos: build the pack, delegate the video

**Raised:** 2026-09-10, walking the new `/docs#svg-vote` page. He confirmed the page answers his
question and then named its limit in one sentence: *"it is going to be hard for people to understand
that because people do not want to read instructions."*

## What he is asking for, and what he is NOT

He is not asking us to make videos. He is asking for the **input pack** that lets him hand a video
to a Gemini workflow he already runs. Three things, named by him:

1. **The script** - the spoken words, in order.
2. **The screenshots** - the product at each step the script refers to.
3. **The instructions** - what happens on screen against the script, so somebody who has never used
   NoaCG can assemble it without guessing.

**Cost is the reason for the split.** He asked that the video not be authored on this harness
budget. Authoring it here is the expensive way to get it; producing the pack is cheap and is the
part that needs product knowledge. This is the delegation shape the root guidance already describes:
work that is long to do and short to specify goes to a worker harness, and whoever delegates
verifies the result by re-deriving it.

## Why this is cheaper than it sounds

The screenshots half should not be taken by hand, and largely need not be. The product is already
driven end to end by browser specs that walk exactly these roads - `e2e/import-svg.spec.ts`,
`e2e/import-svg-behaviour.spec.ts`, `e2e/docs.spec.ts` - and the CLI already has
`validate --screenshots`, which writes full-size frames. A tutorial packs screenshots are those
walks with a capture at each named step, which means they are REGENERATED when the interface
changes rather than going stale in a folder. A pack whose screenshots rot is worse than no pack,
because the video made from it teaches a screen that no longer exists.

That is also why the pack, not the video, is the durable artefact to keep in the repo.

## Where to start, and it should be one

The live vote, because it is the road he had just walked and the one whose written answer he called
clear but unread. `/docs#svg-vote` is the scripts source: name the text layers `Option 1` and
`Option 2`, name the bars `Bar 1` and `Bar 2`, then the five things that quietly go wrong.

One pack, delegated, watched, and judged by him. Then decide whether the next ones are worth it -
the obvious candidates being `/docs#first-graphic`, the scoreboard and the quiz board, which are
also the two pieces the 25 September room takes home (`docs/DEMO_2026-09-25.md` R1.7).

## Open, and his to answer when a pack exists

Nothing yet. The naming, length and voice of the videos are all decidable from the pack, and a
question about them before one exists would be asking him to judge something that does not exist.

## One dependency worth naming

The live vote has no board in the shipped practice library - the file the docs page was measured
against lives in the test corpus, which is not somewhere a designer is sent. A tutorial that says
"open this and rename the layers" needs that board to exist where a viewer can get it. The pack
should not start before it.
