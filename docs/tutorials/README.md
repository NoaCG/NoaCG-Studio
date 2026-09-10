# docs/tutorials - the input packs for tutorial videos

A tutorial pack is everything somebody needs to make a tutorial video about one road through
NoaCG, and nothing else. The video itself is made elsewhere. The owner runs that half through his
own Gemini workflow, and the split is deliberate: authoring video on the coding harness is the
expensive way to get it, while the pack is cheap to produce and is the part that needs product
knowledge.

## What a pack is

Three files and a folder, and a person who has never used NoaCG can assemble the video from them.

| Part | What it is |
|---|---|
| `SCRIPT.md` | The spoken words, in order, in beats. Nothing else in the file is spoken. |
| `INSTRUCTIONS.md` | What is on screen against each beat: the frame, what to point at, what the viewer must see happen. |
| `frames/` | One screenshot per beat, named for the beat. **Not in git** - see below. |
| `README.md` | What the video is, who it is for, and the one command that refills `frames/`. |

The three parts line up by beat name. Beat 4 in the script is `step-4-*.png` in `frames/` and the
beat 4 block in the instructions, so nobody has to hold a key in their head.

## The frames are regenerated, never collected

**A pack's screenshots are captured by an end-to-end walk that already has to pass**, not taken by
hand. A folder of hand-taken screenshots is the half of a tutorial that rots: a PNG cannot fail a
build, so it teaches a screen that no longer exists and nobody notices. Riding a walk means that
when the interface moves, the spec goes red, and re-shooting the frames is part of the same fix.

That is why `frames/` is gitignored. The words are tracked and the pictures are not.

The mechanism is `NOACG_TUTORIAL_SHOTS` in `e2e/_svg-import.ts`: set it to a directory and the
shared import helpers write one PNG per named step of the walk. Unset, it does nothing, so the
suite pays nothing for it. `scripts/tutorial-shots.mjs` holds the pack-to-walk table and runs one
walk with that variable set, after emptying the folder:

```
node scripts/tutorial-shots.mjs first-graphic
```

## The packs

| Pack | The road | The walk that shoots it |
|---|---|---|
| `first-graphic/` | Import your own SVG and put it on air, end to end (`/docs#first-graphic`) | `e2e/import-svg-behaviour.spec.ts`, "imported scoreboard: a numeric layer is a ± stepper" |

## Writing a new one

Pick a road that an existing walk already drives from beginning to end, and check that the file
the script tells the viewer to open is one they can actually get - a shipped sample in
`docs/svg-samples/`, not a fixture in `e2e/fixtures/`. A tutorial that opens with "download this"
and points at a test corpus is a tutorial nobody can follow.

Then add `tutorialShot` calls at the road's named steps, write the script, and write the
instructions against the frames you get back rather than against the code.
