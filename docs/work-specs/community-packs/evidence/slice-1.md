# Slice 1 receipt: the seeded shelf, Install, and the Pub Quiz seed (AC-1 to AC-4)

Branch `claude/bv-community-packs`, 2026-10-02. Written by the implementing row; a reviewer still
judges it.

## AC-4: the seed

- `noacg validate C:/claude/bl-walk-2026-10-02/quiz-default/pub-quiz` (local CLI built from this
  branch, `NOACG_URL=http://localhost:5242`, job j-2877): `OK - 0 error(s), 0 warning(s)`, every
  readiness row PASS, "Renders on every supported playout engine".
- `noacg pack <same> --name "Pub Quiz" --out pub-quiz.noacgpack.json` (job j-2878): one graphic,
  type `quiz`, 1920x1080 at 25 fps, `fonts/archivo.woff2` as an inlined asset. Split back into
  `packs/community/pub-quiz/` sources; `logic.js` is byte-identical (after LF normalisation) to
  the walk package's `js/template.js`, and the font is byte-identical to the walk's.
- `node scripts/build-production-pack.mjs` emits `public/packs/community/pub-quiz.noacgpack.json`
  (1 graphic, 4 cues), `pub-quiz.webp` and `index.json`; `fight-night.noacgpack.json` is
  byte-unchanged by the builder refactor.
- Refusal check: a copy of the source with `var f = (a) => a;` appended to `logic.js` and a
  `url("https://fonts.example.com/x.png")` appended to `style.css` makes the builder exit 1 naming
  both ("template JS carries an arrow function", "a url() reference outside the bundled fonts/
  convention").

## AC-1 to AC-3: the shelf and Install

`npx playwright test e2e/community-packs.spec.ts --workers 1` (job j-2884): 2 passed.

- Browse's control reads One graphic / A whole kit / Community packs; picking the third shows
  the shelf; no Next and no Skip to finish while it shows.
- The Pub Quiz card's preview image loaded (naturalWidth > 0); "by NoaCG" shown; searching
  "scoreboard" hides it and Clear the search brings it back.
- Install lands on `#/production/<id>` with the 4-cue rundown. Take puts the question on the
  PROGRAM monitor, Next (Continue) marks row B `quiz-correct` and row A `quiz-dim`, Out returns
  the chip to "nothing on air". No page errors.
- At 375 px the card fits the screen width.

Screenshots: `community-shelf-desktop.png` (1280x720) and `community-shelf-phone.png` (375x812),
in this folder.

## Limitations

- AC-5 to AC-9 are not built (the next slice: `docs/backlog/community-packs-share-review-and-lock.md`).
- The rail still lists the one-graphic steps (Fields to Finish, greyed and not reachable) while
  the shelf shows.
- The preview is a still frame, not a live render.
