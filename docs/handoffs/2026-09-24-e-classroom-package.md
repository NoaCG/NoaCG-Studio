# E - the NoaCG classroom package

Branch `claude/e-classroom-package`, worktree `.claude/worktrees/agent-afe9f3cf8cab13290`. Night wave
2026-09-24, row E. Owner walk: `docs/acceptance/owner-queue/2026-09-24-e-classroom-package.md`.

## What is in it

`docs/tutorials/classroom-package/`, beside `talk-show-set/` (untouched):

- `Illustrator/`: `show-intro.ai`, `name-tag.ai`, `quiz.ai`, `score-tracker.ai`, `end-credits.ai`,
  drawn natively by `scripts/illustrator/build-classroom-package.jsx` through Illustrator 30.1 over
  COM, in one look (navy plates, yellow accents, Oswald).
- `SVG/`: the same five, written by the script's `exportFile(ExportType.SVG)` with the docs'
  settings (the plug-in Save a Copy > SVG runs). Never hand-edited. All five pass
  `npm run check:example-layers`, which covers `docs/tutorials/*/SVG/`.
- `Previews/`: ten PNGs, one per state (quiz four, score tracker three).
- `README.md` (source) and `README.pdf` (one A4 page), printed and zipped by
  `scripts/illustrator/pack-classroom-package.mjs`, which also writes
  `public/downloads/NoaCG-classroom-package.zip` and any `--copy-to` path.

Rebuild: run the .jsx in Illustrator, then
`node scripts/jobs.mjs add "node scripts/illustrator/pack-classroom-package.mjs --copy-to C:/downloads/NoaCG-classroom-package.zip" --cost 0.25`.
The .jsx rewrites all five .ai files with new bytes even when nothing changed; restore the ones you
did not mean to change before committing.

The zip is at `C:\Users\ahonemi\Downloads\NoaCG-classroom-package.zip` as asked. This laptop's
Downloads folder is redirected to `C:\downloads`, so the same zip is there too.

## Decisions taken (revert by editing the .jsx and re-running it)

- Show name "QUIZ NIGHT", fake names in the Finnish placeholder style (Maija Meikäläinen). The
  closing credit line is "Quiz Night 2026".
- Name tag plate is `Panel` (it sits under both texts); the yellow strip is `Accent` decoration.
- Quiz plates `Answer box A`..`D`, letter plates `Letter box A`..`D` under `static:Letter A`..`D`;
  no `Panel`, because no one shape sits under every text.
- Score tracker keeps `Flash 1` and `Flash 2` and drops `Full time`, to stay simple. Scores start 0.
- Credits are left-aligned in a centred `Credits box`, not centred text: C's handoff says a
  centred sample is detected but not pinned by a spec.
- `/downloads` shows the package as a full-width card UNDER the two tools; the h1 still says "Two
  tools you can install", because a zip of examples is not a tool.

## The credits: verified locally, on main with C and A landed

C landed (PR #408, `c8754c1e`) during this row, and main was taken in. The credits import and roll
are VERIFIED on a local build, not UNVERIFIED:

- The Fields step proposes the credits recipe from the names. The cue has `Heading`
  ("TEKIJÄT"), ONE `Credits` box holding the Finnish list line for line, and `Scroll speed (%)`
  at 100. There is no fourth field.
- The README's English list, pasted into that one box and taken, builds 32 rows: 14 titles in
  the sample's title look and 18 name lines, including the closing "Quiz Night 2026". The list
  rolls inside the `Credits box` and runs out the top. The spec waits for the tween to finish.
- **The roll takes 30.0 s.** At C's 1.35 lines a second the same list took 38.8 s, so
  `CREDITS_LINES_PER_SECOND` is now **1.75**, as the row prompt allowed. The docs (docs.html,
  END_CREDITS.md, SVG_AUTHORING.md), C's spec and C's owner-queue file follow the new pace. A
  graphic imported before this change keeps 1.35 in its emitted code until it is re-imported.

Two real defects in the road from Illustrator to the roll, both fixed here:

1. **Illustrator 30 nests every multi-look line** as `<tspan class><tspan x y>`. C's fixture is
   flat, so C never saw it. The importer flattened such a block to one value in one look, and
   the roll had no title look to copy. `unwrapLookWrappers` in `src/assets/svgImport.ts` moves the
   wrapper's look onto the inner tspan when that draws the same thing. No other fixture in the
   repo has the shape, so nothing else changes.
2. **A closing line one gap below the producer read as another producer name.** C's sample
   reader turns a gap of more than 1.5 lines into a blank line, so the .ai sets a two-line gap
   before "Quiz Night 2026".

## Walked locally, and not

On this branch, local dev server, through the queue (`e2e/classroom-package.spec.ts`, final run
j-1882, 45 passed with the credits, downloads, corpus, sticker-sample and docs specs). The
screenshots came from `NOACG_SHOTS` runs, and I looked at every beat:

- all five SVGs imported through New graphic > Import graphic into ONE production, "Quiz Night",
  five cues on five layers (L20-L24);
- intro Take and Out; name tag taken, then Updated twice (host and both guests);
- quiz key B, pick B, Select, Lock, Reveal: B green, A, C and D red;
- score +1, +1, -1 for player 1 and +1 for player 2 (1-1), then a name edit to AINO and Update;
- credits: the README's English list pasted and rolled to the end in 30.0 s;
- no console errors across the walk;
- `/downloads#classroom` and `/docs#svg-layers-package` at 1366 and 390 wide, with no sideways
  scroll;
- the zip unzipped once: every .ai opened in Illustrator (1920x1080, Oswald only, the layers as
  named), every PNG opened, the PDF read as one page, and every SVG byte-identical to the one the
  walk imported.

NOT walked: anything on noacg.studio. Row J walks the live site after this lands. Not walked by
hand in a desktop browser either: the walk is Playwright's.

## Deferred

- `pack-classroom-package.mjs` launches Chromium, but the browser-job guard
  (`SWEEP_DIRECT` in `scripts/command-match.mjs`) only matches scripts directly under `scripts/`.
  Its header says to run it through `node scripts/jobs.mjs add`. Teaching the guard about
  `scripts/illustrator/` is a change to shared tooling, so it waits for its own row.
- `watchErrors` and `selectCue` are now copied in `classroom-package.spec.ts` and
  `dashboard-operator-walk.spec.ts`. Moving them into a shared helper would touch a spec this row
  does not own.
- README.pdf gets new bytes on every repack (Chromium stamps a date), so a repack always commits
  a new zip.

## Check

`review: delegated` (code-review skill; its scope was merge base `c8754c1e` and the same 38 files
`review-request.mjs` printed; 10 findings, 9 fixed in `59e46442`, 1 deferred above), `simplify:
inline` (the skill returned fan-out instructions; one reuse of `escapeHtml` and one dead export),
`verify: inline` (`npm run build` exit 0, specs j-1882 45 passed), `taste: answered` (the five
graphics on air and the roll frames looked at; no NO).

## Pointers

Build script `scripts/illustrator/build-classroom-package.jsx`, pack script
`scripts/illustrator/pack-classroom-package.mjs`, walk `e2e/classroom-package.spec.ts`, import fix
`src/assets/svgImport.ts` `unwrapLookWrappers`, pace `src/templates/importedDesign/creditsRoll.ts`.

## The Finnish titles and their sources

The list in `end-credits.ai`, in the owner's order: Juontaja, Vieraat, Kuvaajat (three),
**Studio-ohjaaja** (added), Kuvamiksaaja, Kuvaussihteeri, Äänitarkkailija, Valaisija,
Kuvatarkkailija, Grafiikka, Lavastus, Maskeeraus, Ohjaaja, Tuottaja, then "Quiz Night 2026".

- **Yle's guideline** (Yle Kulttuuri ja asia lopputekstiohje 2025, the Drive PDF linked from
  https://yle.fi/a/20-10000956) names no crew titles. It fixes the END: the responsible people
  last in a set order, the organisation, then the year; ideally at most 30 seconds; normally no
  thank-yous. The list follows that.
- **The job titles** are checked against the Finnish film and TV collective agreement's pay-group
  table (Mediarinki TES 2022-2024, https://www.teme.fi/wp-content/uploads/2022/04/mediarinki-tes-2022-2024.pdf):
  Kuvamiksaaja, Kuvatarkkailija, Kuvaussihteeri, Studio-ohjaaja (group III), Äänitarkkailija,
  Valaisija, Kuvaaja (IV), Ohjaaja, Tuottaja (V). Grafiikka, Lavastus and Maskeeraus are the
  credit forms of Graafikko, Lavastaja and Maskeeraaja in the same table; credits name the work
  rather than the person, as the owner's list did.
- **The added role** is the floor manager, whose Finnish TV title is **studio-ohjaaja** (the TES
  lists it beside kuvamiksaaja and kuvatarkkailija; fi.wikipedia "Monikameratuotanto" names the
  studio-ohjaaja among the people the director talks to in a multi-camera studio). "Järjestäjä"
  was the other candidate and was rejected: in the same table it is a film production
  coordinator, not the studio floor.
- The README's English list uses the owner's English titles plus "Floor manager".

## Save a Copy and an empty Moments layer

Re-measured tonight through Illustrator 30.1 scripting, and it depends on the SVG options. With
the options the docs teach (CSS Style Elements, Fonts SVG, Subsetting None, 2 decimals), an empty
`Moments` layer and an empty hidden group inside it are both DROPPED, which is B's result. With
the exporter's defaults (no options set), both are KEPT, written as `<g id="Moments"></g>`. So
B's rule stands for the taught settings, and none of the five graphics draws an empty Moments
layer: the show intro, the name tag and the credits have `Text` and `Board` only.

