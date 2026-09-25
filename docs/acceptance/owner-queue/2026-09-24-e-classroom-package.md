---
kind: walk
because: taste
date: 2026-09-24
serves: now
---

# The classroom package for Friday's lesson

## What changed

A new package, `docs/tutorials/classroom-package/`, sits beside the talk-show set (which is
untouched). Illustrator drew all five graphics through `scripts/illustrator/build-classroom-package.jsx`
in one simple look (navy plates, yellow accents, Oswald), and its own SVG save wrote every SVG.
None of them is hand-written. Every layer follows the naming system, and `npm run check:example-layers`
passes them.

1. **Show intro**: `Title`, `Subtitle`, full frame.
2. **Name tag**: one lower third, `Name` and `Role`, retyped for the host and both guests.
3. **Quiz**: a lower third low in the frame, `Question` and `Answer A` to `D`, with the select,
   lock and reveal moments. NoaCG recognises it as a quiz by the names alone.
4. **Score tracker**: at the top, `Team 1`, `Team 2`, `Score 1`, `Score 2`, and a `+1 POINT` flash
   for each. NoaCG recognises it as a score tracker, so +1 and -1 are on the dashboard.
5. **End credits**: `Heading` plus ONE `Credits` text holding the Finnish default list, titles
   ending in ":". The people in the studio come first, then the crew, then the director and the
   producer, then "Quiz Night 2026". The names are made up.

All five were walked from one production on a local build: intro Take and Out, the name tag
retyped for three people, quiz select, lock and reveal, score +1 and -1 and a name edit, and the
README's English credits pasted into the one Credits box and rolled to the end in 30.0 seconds.
To hit thirty seconds, the default pace of an imported credits roll went from 1.35 to 1.75 lines
a second. The live site has not been walked yet; row J does that after the landing.

The README is one page of do-this bullets in your tone, with the same crew in English as a second
paste example. README.md is the source, and README.pdf is printed from it.

## The zip

`C:\Users\ahonemi\Downloads\NoaCG-classroom-package.zip` (1.2 MB). Your Windows Downloads folder
is redirected to `C:\downloads`, so the same zip is also at `C:\downloads\NoaCG-classroom-package.zip`,
which is where Explorer's Downloads shows it. It is also on the site at
`/downloads/NoaCG-classroom-package.zip`. It holds one folder, `NoaCG-classroom-package`, with:

- `README.pdf`, `README.md`
- `Illustrator/`: `show-intro.ai`, `name-tag.ai`, `quiz.ai`, `score-tracker.ai`, `end-credits.ai`
- `SVG/`: `show-intro.svg`, `name-tag.svg`, `quiz.svg`, `score-tracker.svg`, `end-credits.svg`
- `Previews/`: `show-intro.png`, `name-tag.png`, `quiz-1-question.png`, `quiz-2-selected.png`,
  `quiz-3-locked-in.png`, `quiz-4-reveal.png`, `score-tracker-1-scores.png`,
  `score-tracker-2-point-for-1.png`, `score-tracker-3-point-for-2.png`, `end-credits.png`

**Changed 2026-09-25 by the live walk (row J).** The zip was rewritten at `C:\downloads`, at
`C:\Users\ahonemi\Downloads` and in `public/downloads`, with the same 22 files. Only `README.md` and `README.pdf` changed. The Quiz line now says to click the
player's letter under Selected answer before pressing Select answer. On noacg.studio, pressing
Select answer with no letter picked changes nothing on air, and the old line never said to pick
one. The credits paragraph now says to change the Heading to CREDITS when pasting the English
list. It also says that a copy from the PDF loses the empty line before "Quiz Night 2026", which
then rolls as a second producer. The new zip's SHA-256 starts `6efe1514`.

## Route (under a minute)

1. Open `C:\downloads\NoaCG-classroom-package.zip` and read `README.pdf`. It is one page.
2. Open `https://noacg.studio/downloads#classroom`. The package card sits under the two tools.
3. On `https://noacg.studio/app`, press New graphic, then Import graphic, and drop
   `SVG/quiz.svg`. The Fields step says it is a quiz.

## What to look at

- Whether the README sounds like you, and whether a student could follow it without you.
- The Finnish credit titles: Studio-ohjaaja (the floor manager) is the one I added. The sources
  are in `docs/handoffs/2026-09-24-e-classroom-package.md`.
- The end credits in Illustrator: the list runs past the bottom of the page on purpose. The first
  title line and the name under it are the two looks the roll copies.
