# Phase TL1o evidence: pilot round trip, run by an agent

Base: `main` at `516ab7f0cfa64ef3d193f96e454cb4d07a0b8654`. The owner asked, 2026-11-22: "please use
another agent to test this for me and then continue the run". An agent ran every step it can; it
cannot run Illustrator, so the real Illustrator round trip moves to TL8.

**Verdict: ROUND TRIP FAIL at step 6, Vote results after Call the winner** (issue #2691). Every
other step passed. Step 5's Join card picker was not reached (see "Not tested").

Files in `tl1o/`: the four restyled SVGs, nine on-air screenshots (deviceScaleFactor 2),
`illustrate.mjs` (restyle and Illustrator-style writer), `round-trip.spec.ts.txt` (the Playwright
run, kept out of `e2e/`), `download-report.txt` and `run-log.json` (what the run read back).

## Steps and results

1. **Download as a user does: pass.** From the dev server, `/svg-templates#audience`: each
   "Download <name> SVG" link in the Audience package, then "All templates (.zip)". All four files
   from both paths are byte-identical to `docs/tutorials/svg-templates/SVG/` (`download-report.txt`).
2. **Restyle: done.** One designer pass over the downloaded files: dark plum plates (#17142A), a
   coral accent (#FF5A36), Manrope swapped for Sora (bundled), every card moved and resized (Join
   card to the right with the QR plate moved and enlarged; Live vote and Vote results to the left,
   square corners, thinner tracks; Message to the right), new sample words. Layer names, live
   text and the hidden Moments kept.
3. **Illustrator-style files: done** (`illustrate.mjs`, conventions below).
4. **Import and save: pass.** Import graphic, each file: Live vote and Vote results propose the
   live vote (`poll`), Join card and Message propose none, no missing-layer warning. The Join card
   has a Join link field from its `QR` group. All four reached the library by being put in a
   production ("Coral Live vote", "Coral Join card", "Coral Vote results", "Coral Message").
5. **Pick and take in a different production ("Pilot Night"): pass where reachable.**
   - Vote results: question "Encore?" live, simulated votes (2 to 1), Add results to rundown,
     picked "Results on Coral Vote results, saved design", Take, Stop, Close voting, Show result
     (66.7%), Call the winner (row 1 only). One cue on the copy, no blank seed beside it.
   - Message: pasted "Is there an encore tonight?" from Sam, Prepare, the saved Message is the only
     saved design offered, picked it, Take: body and name on air. One cue.
   - Join card: offline the Join area offers no Add Join card (it needs a published link). The
     saved Join card was taken in its own production with the Join link
     `https://noacg.studio/j/pilot-night`: the QR on air decodes to that link (`e2e/_qr.ts`).
   - Live vote (not in a picker): taken in its own production; typed counts move the bars, the
     Vote badge shows, Close voting hides it, Show result prints 75%, Call the winner marks row 1.
6. **On air: 8 of 9 frames clean.** Each frame shows the restyle (Sora on air, plum plate,
   coral bars). `airProblems` found nothing in eight frames, and no page error. **Fails:**
   `vote-results-3-winner`: `"66.7%" is cut by a <rect>` (the Winner 1 outline).

## Finding

- **#2691 (P2, area: output).** Illustrator writes no `text-anchor` (none in the 19 archived
  Illustrator 30 exports), so the right-aligned `Percent n` arrives start-anchored: `66.7%` and
  `33.3%` grow past the track end, to the panel's edge, and once the winner is called its outline cuts
  through the figure (`vote-results-2-result.png`, `vote-results-3-winner.png`). The source file,
  which says `text-anchor="end"`, is clean in TL1. Live vote passed only because its panel leaves
  room right of the figures (`live-vote-3-result.png` shows the same ragged right edge).

Observations, not filed: after Stop, the taken Vote results still shows "voting open" in its count
line until the operator updates the cue (nothing reaches air without a press, as designed). The
Live vote total stays "0 votes" when counts are typed by hand; not compared with the source file.

## How Illustrator-like the files are, and the limits

Reproduced from `e2e/fixtures/illustrator-exports/` and `docs/SVG_AUTHORING.md`: the Illustrator
30.1 generator comment; one `<defs><style>` of `.stN` classes with rules grouped by shared
declarations and short hex colours, no presentation attributes; top-level layer groups; names
taken from the file's ids (Illustrator ignores `inkscape:label`), so `Track_1` is written
`id="Track_x5F_1" data-name="Track_1"`; every text as `transform="translate(x y)"` with
`<tspan x="0" y="0">` and no `text-anchor`, right and centred text written at its measured left
edge in Sora; PostScript font names (`Sora-ExtraBold, Sora`) with the weight; hidden groups as a
`display: none` class; rounded rectangles with `rx` and `ry`; no title, desc or Inkscape names.

Limits: written by a script from the same DOM, not by Illustrator. Real Illustrator may differ in
id escaping and `data-name` (whether it escapes `_` as `_x5F_` for a name read from an id), class
numbering and grouping, decimal rounding, uniquified ids (`_0000…_`), an empty `Layer_1`, a moved
artboard, outlined or area text, and text metrics from its own font engine. The finding does not
depend on these: it needs only that Illustrator writes no `text-anchor`.

## Not tested

- Real Illustrator (open, edit, Save a Copy): moves to the owner's TL8.
- Add Join card to rundown with "Add a saved design": needs a published link, so a Supabase
  backend. The local stack's CLI could not be run in this session (blocked by the session's
  safety check). The picker rules are Node-tested (`scripts/audience-pickers.test.mjs`) and the
  published Join card journey is `e2e/configured/audience-live.spec.ts`.
- Phones voting through a join page: votes were simulated in Interaction, as in TL1.

## Commands

- `node docs/work-specs/svg-template-library/evidence/tl1o/illustrate.mjs <downloaded> <out> public/fonts/sora.woff2`
- The run, copied into `e2e/` for the run only, through the job queue:
  `TL1O_DIR=<dir> npm run test:e2e -- e2e/tl1o-round-trip.spec.ts --trace off` (jobs j-0001,
  j-0003: 2 passed, with the one frame finding recorded rather than thrown).

## Re-run after #2691

The same run on the fix branch `claude/plan-svg-template-library-fix-2691` (main at `b53db30d`
merged in), with the four files from `tl1o/` and the spec copied into `e2e/` for the run only:
job j-0002, 2 passed (39.4s). **Step 6: all nine frames clean**, `airProblems` empty in every
one, `vote-results-3-winner` included. On that frame `66.7%` and `33.3%` end at the track's right
end, inside the Winner 1 outline, as the drawn `0%` did. Live vote's figures keep the same right
edge too. The fix: a readout the board writes is anchored where it was drawn (centre or right) in
the box the fit uses; the Node test is `scripts/readout-anchor.test.mjs`.
