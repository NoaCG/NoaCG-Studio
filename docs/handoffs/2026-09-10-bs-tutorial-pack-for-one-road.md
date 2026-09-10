# 2026-09-10 - row BS: a tutorial pack for one road

Branch `claude/bs-tutorial-pack-for-one-road`, queued for landing. Four commits.

The owner asked for the input pack, not the video: *"we could create them through Hyperframes but
lets not use Claude code usage for that. I have another workflow through Gemini models but we need
to have the screenshots, instructions, and the script so I can delegate it to Gemini models."* One
pack now exists, at `docs/tutorials/first-graphic/`.

## The road I picked, and why it is not the live vote

**The whole import road**, from the Import door to Take, Update and Out on the playout dashboard,
walked with the shipped `docs/svg-samples/scorebug.svg`. The backlog file that opened this row
proposed the live vote instead, because that was the page the owner had just read. I did not take
it, for three reasons, in order of weight.

1. **The live vote is blocked by its own named dependency**, and the backlog says so in its last
   paragraph: *"The pack should not start before it."* There is still no vote board a viewer can
   download. `poll.svg` in the practice library is listed as the live-vote sample and cannot bind
   as one - its bars are unnamed, and worse, they are drawn at their sample shares rather than at
   full length, so naming them would make 213 px mean a unanimous vote
   (`docs/backlog/the-shipped-poll-sample-cannot-be-imported-as-a-live-vote.md`). The only board
   that binds lives in the test corpus. A tutorial that opens with "download this file" and points
   at `e2e/fixtures/` is a tutorial nobody can follow.
2. **This is the road the 25 September room walks**, and more to the point it is the road they walk
   again at home. The owner's own call 6 that day puts one simple import in the session and sends
   each group away with a lower-third quiz template and a scoreboard to finish alone
   (`docs/DEMO_2026-09-25.md` §0). A video is worth most where nobody is sitting beside them.
3. **Every other tutorial assumes this one.** A live-vote video that starts at the binding step is
   a video for somebody who has already imported an SVG once.

**Why the scoreboard sample rather than the plain lower third.** `scorebug.svg` carries every field
type the import can propose - two numbers, a clock, a picture, plain text and the `f:` prefix - so
one video covers what a viewer meets on their own artwork. It is also the only shipped sample with
a complete end-to-end walk already in the suite, and its payoff beat (press +, the picture changes)
is watchable in a way that typing a name is not.

## What is in it

| File | |
|---|---|
| `docs/tutorials/first-graphic/SCRIPT.md` | The spoken words, twelve beats, about 700 words. Everything under a beat heading is spoken verbatim; nothing else in the file is. |
| `docs/tutorials/first-graphic/INSTRUCTIONS.md` | What is on screen per beat, what to point at, what must be in the same shot, and what must not appear. |
| `docs/tutorials/first-graphic/README.md` | What the video is, who it is for, and the one command that refills the frames. |
| `docs/tutorials/README.md` | What a pack is, why the frames are not in git, and how to write the next one. |

**The frames regenerate; they are not collected.** `node scripts/tutorial-shots.mjs first-graphic`
runs the walk that already tests this road with `NOACG_TUTORIAL_SHOTS` set, and fourteen PNGs land
in a gitignored `frames/` in about forty seconds. The capture calls (`tutorialShot`,
`tutorialShotAt` in `e2e/_svg-import.ts`) sit in the shared import helpers and in the scoreboard
test, and are a no-op with the variable unset, so an ordinary suite run pays nothing. That is the
whole design: a PNG cannot fail a build, so a hand-taken folder ends up teaching a screen that no
longer exists and nobody notices. Riding a walk means the walk goes red instead.

**Every sentence in the pack was checked against the frame beside it**, and three claims changed
when I did. The picture row is the ONE row that arrives switched off. The behaviour section already
reads "2 numbers, each with + and -" on this artwork, so the board works before anything is chosen.
And the live-number strip states the Update rule in its own words, which is better quoted than
paraphrased.

## Two things fixed in passing

- **`public/docs/svg-drop.png` was ten days stale.** The published picture of the drop step showed
  the export advice as a plain heading with an information dot; the 2026-09-01 owner walk replaced
  that with the amber question strip above the drop zone. Re-shot with `scripts/docs-shots.mjs`.
  Exactly the rot this row's design exists to prevent, found because the pack wanted to point at
  that picture.
- **`docs-shots` was on the browser-job list and missing from the dev-server-dependent one**
  (`scripts/command-match.mjs`), so queued without a server it would have failed on a refused
  connection and read as a broken script.

## What a second road costs now

Small, and it is the point of having built it this way. `scripts/tutorial-shots.mjs` holds a
one-row-per-pack table (spec, grep, expected frame count); a second pack is that row, a
`docs/tutorials/<road>/` folder, and the words. The capture itself is already in the shared
helpers, so any walk that goes through `dropSvg` and `intoProduction` gets steps 1 to 7 free and
only needs its own after-the-wizard beats named. Call it half a session for the quiz board, most of
it spent writing and then checking the script against the frames, which is the half that cannot be
skipped.

The two obvious next roads: **the quiz board** (`quiz-board.svg`, walked by
`import-svg-behaviour.spec.ts` "drawn layers are proposed from their names"), which is the other
piece the 25 September room takes home; and **the live vote**, once the poll sample is fixed.

## What needs the owner

One item, filed: `docs/acceptance/owner-queue/2026-09-10-bs-tutorial-pack-for-the-import-road.md`,
`kind: walk-p`, `because: taste`. The only question that is his is whether the script is in the
product's voice and is the video he would put students in front of. The road, the sample, the
length and one-pack-per-road were decided here, and the item says so, so he can overrule a thing
that exists rather than adjudicate one that does not.

## Verification

- `npm run build` green on every commit.
- CI green on all three pushed commits, all nine E2E shards plus the CI gate on each (runs
  34489572213, 34491238451, 34492205841 - job lists read, not just the conclusion).
- The capture run itself is the strongest evidence: the walk passes with the frames on, and all
  fourteen come out. Run four times while the pack was being corrected.
- The scoreboard walk gained real coverage rather than only a camera: a typed value is staged until
  Update where a number stepper acts on its own press. `/docs#first-air` is written on that
  difference and `e2e/docs.spec.ts` pins the sentence on the page; nothing pinned the behaviour on
  an imported board. `playout-drills.spec.ts` holds the catalog half.
- `check: review delegated, simplify inline, verify inline` - see the check report in the session.

## Pointers

- The design's own argument, and the owner's words: `docs/backlog/tutorial-video-packs-for-delegation.md`.
- The road the pack teaches: `/docs#first-graphic` in `docs.html`, pinned by `e2e/docs.spec.ts`.
- The blocker for a vote pack: `docs/backlog/the-shipped-poll-sample-cannot-be-imported-as-a-live-vote.md`.
- Four `/docs` sections still have no screenshot at all, and the vote one is blocked on the same
  sample: `docs/backlog/docs-shots-for-the-sections-that-have-none.md`.
