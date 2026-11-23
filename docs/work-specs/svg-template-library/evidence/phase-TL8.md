# Phase TL8 evidence: owner confirmation, run by an agent

Base: `main` at `fac5edc08cafd0b205d4f456a489751c2c4c96ab`. The owner asked, 2026-11-23: "please
use another agent to test this for me". The checklist is the hand-over on #2678 (comment
7095099105). An agent ran every step it can, the way TL1o was run. It cannot run Illustrator: the
real Illustrator round trip has not been run by a person.

**Verdict: ALL PASS.** Nine templates downloaded, restyled, written the Illustrator way,
imported, saved, taken and driven through their controls. `airProblems` found nothing in any of
the 22 frames it checked or at four points of the credits roll; the published Join card frame
was checked by eye. No page error, one cue per graphic. One on-air wording problem that TL1o
also saw is filed as #2725 (P3); it is not a TL8 check failure (see Findings).

Files in `tl8/`: the nine restyled SVGs, `illustrate.mjs` (restyle and Illustrator-style writer),
`round-trip.spec.ts.txt` and `join-live.spec.ts.txt` (the Playwright runs, kept out of `e2e/`),
`download-report.txt`, `run-log.json` and `run-log-join.json` (what the runs read back). The 24
on-air screenshots (deviceScaleFactor 2) named below are not committed: the repository keeps no
pictures under `docs/` (`.gitignore`, `scripts/check-tree-shape.mjs`), as with TL1o's. A contact
sheet of all 24 was sent to the owner in the run's session; the checks each picture backs are in
`run-log.json`.

## The templates

| Package | Template | Slug |
| --- | --- | --- |
| Titles | Lower third | `lower-third` |
| Titles | Ticker crawl | `ticker-crawl` |
| Games | Countdown | `game-timer` |
| Clocks | Show clock | `show-countdown` |
| Credits | End credits | `end-credits` |
| Audience | Join card, Live vote, Vote results, Message | `join-card`, `live-vote`, `vote-results`, `message` |

## Steps and results

1. **Download as a user does: pass.** From the dev server, `/svg-templates`: each template's SVG
   link in its package tile, then each package's zip (Titles, Games, Clocks, Credits, Audience).
   All nine files from both paths are byte-identical to `docs/tutorials/template-library/SVG/`
   (`download-report.txt`). Harness note: after ten downloads from one page Chromium held the next
   one for its multiple-downloads permission, so the run opens the page again before each zip. A
   person clicking that many downloads would see the browser ask; the site is not involved.
2. **Restyle: done.** One designer pass over the downloaded files: deep teal plates (#0B1F24), a
   mint accent (#00C2A8), square corners, Manrope swapped for Outfit (bundled), every card moved and
   resized (Lower third and Message to the right, Countdown to the top left, Join card to the right
   with a larger QR plate, the vote panels to the left, a wider Show clock box, a thinner ticker
   strip), new sample words. Layer names, live text and the hidden Moments kept.
3. **Illustrator-style files: done** (`illustrate.mjs`, conventions below).
4. **Import, confirm, save: pass.** Each proposal as expected, with no missing-layer warning:
   Lower third, Join card and Message none; Countdown the timer; Ticker crawl the crawl; Live vote
   and Vote results the live vote (`poll`); End credits the editable credits, role above name, the
   drawn list read; Show clock none, with Clock set to count down as its README says. The Fonts
   step read every `Outfit-*` PostScript name as the bundled Outfit. Each went into a production,
   which saves it to the library.
5. **Controls: pass.**
   - Lower third: Take shows it; a long name (`Marguerite Okonkwo-Hallström`) widens the plate and
     stays inside the frame; Out takes it to opacity 0.
   - Countdown, set to 0:15: it runs from the take; Pause shows Paused and holds the time; Start
     runs again; the last ten seconds pulse (the Warning's opacity reached 0.38 within a second);
     at zero the Warning stops, Time up flashes once (one motion start in three seconds of
     sampling) and rests at opacity 1 and scale 1; Reset shows 0:15 and holds it; Start runs again.
   - Show clock: counts down from 5:00 (4:59, then 4:57 two seconds later); Pause holds; Reset
     shows 5:00.
   - End credits: the pasted list (title first) is on air in the drawn looks and rolls up by itself
     (the title moved 213 px up the monitor in two seconds); clean at 20, 40, 60 and 80% of the
     roll.
   - Ticker crawl: two items crawl right to left; a third item added mid-run keeps the text moving
     from where it is (the replaced K3); then a Hebrew list (see below).
   - Audience, offline: Live vote in its own production: typed counts move the bars, the Vote badge
     shows while open, Close voting hides it, Show result prints 62.5%, Call the winner marks row 1
     only. In a different production ("Lab Night") Interaction: a live multiple-choice question,
     simulated votes (2 to 1), Add results to rundown with "Results on Teal Vote results, saved
     design", Take, Stop, Close voting, Show result (66.7%), Call the winner (row 1 only); a pasted
     message from Robin, Prepare, the saved Teal Message is the only saved design offered, Take:
     body and name on air.
   - Audience, published (local Supabase stack, `join-live.spec.ts.txt`): a published production,
     Add Join card to rundown opens the picker with "Join card on Teal Join card, saved design"
     under Add a saved design and the built-in under its own group; the pick fills one cue with the
     production's join link; Take; the QR on air decodes (`e2e/_qr.ts`) to that link,
     `http://127.0.0.1:<port>/j/lab-night-<n>`. A second press updates the same cue (still one).
     Offline, the Join card was also taken with a typed link and its QR decodes to it.
6. **On air: pass.** Every frame shows the restyle: Outfit is the face on air and loaded in the
   output frame, the teal plate is the first plate's fill, the mint accent and bars are there.
   `airProblems` is empty in every frame the offline run checked and at every checked point of the
   roll; the published Join card frame (`join-card-2-saved-design-published.png`, which also shows
   the monitor's own logged-time badge) was checked by eye. Every graphic
   has exactly one cue; the Interaction copies of the saved Vote results and Message have one cue
   each, no blank seed beside them.

## The Hebrew crawl (owner question Q3, spec K2)

A list of two Hebrew items (`החדשות הערב בשמונה`, `מזג האוויר: גשם קל`) **travels right to left**,
like every other list, at the same pace (186 against 190 monitor pixels a second for the English
list; the run's offset went -145, -220, -292, -387, -463, -537 over 2.5 s). The run is laid out
left to right (`direction: ltr`): each item reads correctly right to left inside itself, and the
items follow one another left to right, so on a right-to-left move each item enters at the right
edge with its LAST word first (`ticker-crawl-3-hebrew.png`). This is K2 as built, option A. Outfit
has no Hebrew glyphs, so the browser drew the Hebrew in a fallback face; a designer who wants a
Hebrew ticker should pick a font with Hebrew.

## Findings

- **#2725 (P3, area: output).** After Stop and Close voting, the Vote results count line on air
  still reads `3 votes · voting open` through Show result and Call the winner
  (`vote-results-2-result.png`, `vote-results-3-winner.png`), though the cue already holds
  `3 votes · voting closed`. The final frames contradict themselves until the operator presses
  Update. TL1o saw the same and did not file it. It does not fail a TL8 check (nothing is cut off,
  no second cue), so the verdict stands.

Observation, not filed: a Live vote with counts typed by hand keeps `0 votes` in its total
(`live-vote-2-voting.png`); the library README and `docs/SVG_AUTHORING.md` say the total is
"written from the round", so it fills only when Interaction stages the board.

## How Illustrator-like the files are, and the limits

The writer is TL1o's (`evidence/tl1o/illustrate.mjs`), from `e2e/fixtures/illustrator-exports/`
and `docs/SVG_AUTHORING.md`: the Illustrator 30.1 generator comment; one `<defs><style>` of `.stN`
classes grouped by shared declarations, short hex colours, no presentation attributes; top-level
layer groups; names taken from the ids (Illustrator ignores `inkscape:label`), so `Timer_bar` is
written `id="Timer_x5F_bar" data-name="Timer_bar"`; every text as `transform="translate(x y)"`
with `<tspan x="0" y="0">` and no `text-anchor` (centred and right-aligned text written at its
measured left edge in Outfit: the Countdown, Show clock, End credits and every vote figure);
PostScript font names (`Outfit-ExtraBold, Outfit`) with the weight; hidden groups as a
`display: none` class; rounded rectangles with `rx` and `ry`, square ones with none; letter
spacing in `em`; no title, desc, Inkscape names or `font-variant-numeric`.

Limits: written by a script from the same DOM, not by Illustrator. Real Illustrator may differ in
id escaping and `data-name`, class numbering, decimal rounding, uniquified ids (`_0000…_`), an
empty `Layer_1`, a moved artboard, outlined or area text, text merged into one element with
look-wrapped lines (as the archived `end-credits.svg` export did), and text metrics from its own
font engine. These cases are importer fixtures elsewhere (`e2e/fixtures/illustrator-exports/`),
but not in this run.

## Not tested

- **Real Illustrator** (open, edit, Save a Copy) by a person. TL8 is the last phase, so this
  stays not tested when the run closes.
- Phones voting through a join page: votes were simulated in Interaction, as in TL1o. The QR was
  decoded from the on-air frame, not scanned by a phone.
- The published Join card ran on a local Supabase stack, not on noacg.studio.

## Commands

- `node docs/work-specs/svg-template-library/evidence/tl8/illustrate.mjs <downloaded> <out> public/fonts/outfit.woff2`
- The offline run, copied into `e2e/` for the run only, through the job queue:
  `TL8_DIR=<dir> npm run test:e2e -- e2e/tl8-round-trip.spec.ts -g <test> --trace off`
  (jobs j-0005 download, j-0007 titles, j-0009 games and clocks, j-0010 credits, j-0011 audience;
  each passed).
- The published Join card, copied into `e2e/configured/` for the run only, on a local stack
  started with `supabase start -x studio,edge-runtime` (CLI 2.111.0), a throwaway local account,
  and the hosted admin keys removed from the run's environment:
  `npx playwright test --config=playwright.live.config.ts e2e/configured/tl8-join.spec.ts`
  (job j-0012, passed).
