# Your first graphic: from a drawing to a graphic on air

The input pack for one tutorial video. Hand this folder to whoever makes the video.

**The video.** About five minutes. One person imports a scoreboard they drew, puts it in a
production, and drives it live. No account, no terminal, no playout hardware.

**Who it is for.** Somebody who has drawn a graphic in Illustrator, Figma or Inkscape and has
never opened NoaCG. They are the audience for `/docs#first-graphic`, and the reason this video
exists is that they will not read it.

**What it teaches, in one sentence.** A layered SVG becomes a graphic whose text an operator
retypes live, and getting it there is five steps and one press.

## The folder

| File | What it is |
|---|---|
| `SCRIPT.md` | The spoken words, in twelve beats. Everything under a beat heading is spoken word for word. |
| `INSTRUCTIONS.md` | What is on screen for each beat, what to point at, and what the viewer has to see happen. |
| `frames/` | Fourteen PNGs: `step-1-import-door.png` to `step-12-off-air.png`, plus `step-4b` and `step-4c` for the Fields step, which is three screens tall. Not in git; refill it with the command below. |

## Refilling `frames/`

The frames are captured by the end-to-end walk that already drives this road, so they are the
product as it is today rather than as it was when somebody took a screenshot. One command, from
the repository root:

```
npm run tutorial:shots -- first-graphic
```

On a machine that can only run one browser job at a time, queue it instead:

```
npm run queue -- "npm run tutorial:shots -- first-graphic"
```

Fourteen PNGs land in `frames/`, and the command says how many it got. It takes about forty
seconds. If the walk goes red, the road changed: fix the walk first, then re-shoot, then read
`INSTRUCTIONS.md` against the new frames before the video is made from it.

## The file the video opens

`docs/svg-samples/scorebug.svg`, from the practice library, which `/docs#svg-export` links from
the public page. It is a shipped sample rather than a test fixture on purpose: a viewer can
download exactly the file they are watching being imported, and open it in Illustrator afterwards.

It was chosen over the plain lower third because it carries every field type the import can
propose - two numbers, a clock, a picture and plain text - so one video covers what a viewer will
meet on their own artwork, and because a scoreboard is one of the two pieces the 25 September
session sends people home to finish alone.

## What this pack does not cover

Getting the picture into OBS, vMix or CasparCG. That is about a production's output URL rather
than about this graphic, it is `/docs#dashboard`, and it is its own video.
