---
kind: walk-p
date: 2026-09-10
serves: now
because: taste
---
# The first tutorial pack is ready to hand to Gemini

You asked for the script, the screenshots and the instructions so you could delegate the video
itself: *"we could create them through Hyperframes but lets not use Claude code usage for that. I
have another workflow through Gemini models."* One pack now exists.

## The route, in under a minute

On a phone, everything except the pictures:

1. `docs/tutorials/first-graphic/SCRIPT.md` - the spoken words, twelve beats, about five minutes.
2. `docs/tutorials/first-graphic/INSTRUCTIONS.md` - what is on screen against each beat.

At a machine, for the pictures:

3. `node scripts/tutorial-shots.mjs first-graphic`, then open
   `docs/tutorials/first-graphic/frames/`. Fourteen PNGs, about forty seconds.

## What to look at

- **Is the script the video you would make?** That is the only judgement here that is yours. It is
  written for somebody who has never opened NoaCG and has a drawing in Illustrator.
- **The road it teaches is the import road**, from the Import door to Take, Update and Out on the
  dashboard, walked with the shipped `scorebug.svg` sample. Not the live vote, which is what you
  were reading when you asked. The reason is in the handoff, and it is a real one: there is still
  no vote board a viewer can download, only a test fixture, so a vote video would open by telling
  people to fetch a file that is not offered to them.
- **The screenshots regenerate.** They are taken by the end-to-end test that already drives this
  road, so when the interface moves the test goes red and the frames are re-shot in the same fix.
  Nothing in the pack can quietly end up teaching a screen that no longer exists. That is why
  `frames/` is not in git.

## The question that is yours

**Is the script in your product's voice, and is it the video you would put your students in front
of?** That is taste and nothing else answers it. Everything else here was decided rather than
asked: the road, the sample, the length, and one pack per road as the unit.

The second pack is cheap now - the capture rides the same helpers, so it is a table row plus the
words. The obvious next two are the quiz board, which is the other piece the 25 September room
takes home, and the live vote once it has a board a viewer can download.
