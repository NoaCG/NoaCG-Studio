# U - the quiz on air: the live answer key, the press latency, and the two answer models

Branch `claude/u-quiz-live-consistency`, worktree
`.claude/worktrees/agent-a86d80546dc39d05a`, forked from `6f5855d9`. The three findings came from
the owner's production test on 2026-09-22 with the Arcade quiz (`qz15`) and the docs example quiz
(`public/docs/examples/quiz.svg`). Owner walk:
`docs/acceptance/owner-queue/2026-09-22-u-quiz-live-consistency.md`.

## What I measured first

A throwaway Playwright probe drove every catalog quiz and the imported docs quiz on the dashboard:
take, pick, lock where there is one, change the correct answer in the cue editor, reveal, update.
It clicked through the DOM with a wall-clock stamp and read the first class mutation, and the first
animation frame after it, inside the PROGRAM monitor's own document. Every quiz was measured twice,
before and after the fix.

| Board | Answer model | Key changed in the cue, then Reveal | Key changed after the reveal, then Update | Pick / Lock / Reveal to first changed frame, ms (before) | after |
| --- | --- | --- | --- | --- | --- |
| qz01 Arena Quiz | select + lock | old key -> **new key** | moved | 27 / 35 / 39 | 32 / 22 / 23 |
| qz02 House Quiz | select + lock | old -> **new** | moved | 25 / 35 / 39 | 28 / 23 / 29 |
| qz03 Frost Quiz | select + lock | old -> **new** | moved | 23 / 22 / 38 | 32 / 20 / 21 |
| qz04 Clean Quiz | select + lock | old -> **new** | moved | 21 / 37 / 66 | 33 / 21 / 20 |
| qz05 Arena Split | select + lock | old -> **new** | moved | 21 / 37 / 62 | 30 / 21 / 23 |
| qz06 House Split | select + lock | old -> **new** | moved | 21 / 37 / 62 | 23 / 20 / 20 |
| qz07 Frost Split | select + lock | old -> **new** | moved | 30 / 31 / 61 | 33 / 37 / 22 |
| qz08 Clean Split | select + lock | old -> **new** | moved | 33 / 47 / 56 | 22 / 20 / 32 |
| qz09 Volt Triple | select + lock | old -> **new** | moved | 37 / 36 / 57 | 25 / 40 / 35 |
| qz10 House Triple | select + lock | old -> **new** | moved | 24 / 39 / 43 | 24 / 23 / 32 |
| qz11 Frost Triple | select + lock | old -> **new** | moved | 33 / 35 / 41 | 25 / 39 / 39 |
| qz12 Clean Triple | select + lock | old -> **new** | moved | 27 / 37 / 43 | 27 / 21 / 23 |
| qz13 Sticker Quiz | pick A-D, no lock | old -> **new** | moved | 23 / - / 40 | 35 / - / 43 |
| qz14 Showtime Quiz | pick A-D, no lock | old -> **new** | moved | 23 / - / 40 | 25 / - / 38 |
| qz15 Arcade Quiz | pick A-D, no lock | old -> **new** | moved | 25 / - / 40 | 26 / - / 35 |
| docs example quiz (imported) | select + lock | old -> **new** | moved | 22 / 23 / 41 | 30 / 59 / 34 |
| A lower third's Update (the normal-graphic baseline) | - | - | - | 15 | 22 |

"old -> new" reads: before this branch the reveal lit the OLD key, and now it lights the one the
operator can see. The millisecond columns are an unpublished production, so they are the command
path alone, and the variation between them is noise on a six-worker laptop.

## The three findings

**1. The correct answer did not reach air.** It failed on ALL sixteen boards, not one: nothing
carried the key. Update sent the cue's whole value set and the reveal repainted from it, which is
why "press Update first" worked and going straight to Reveal did not. The fix is one line in each of
the two shared control lists - `judge` now declares `payload: ['correctAnswer']`
(`src/templates/types/answerBoard.ts`, `src/templates/types/quizShow.ts`), the way `select` has
always carried `selectedAnswer`. The imported SVG quiz inherits it, because
`src/templates/behaviours/quiz.ts` returns `ANSWER_BOARD_CONTROLS` and the compiler resolves the
logical key to that design's own field id.

That payload would have taken "Correct answer" out of the WIZARD's setup step, because
`setupFields` dropped every payload field. It now keeps a field carried by a DEFAULT-PATH event:
Continue reaches the reveal with no control page at all, so the graphic has to hold a real key when
it is built, and the payload on the press is a re-send of what the operator sees rather than a pick
nobody has made yet. Recorded through `npm run learn` as
`wizard/keep-graphic-type-setup-values-derived`, superseding the old rule. The one other type this
reaches is the nominee reveal, whose `winner` rides its own path event and now appears in setup for
the same reason.

**2. The slowness was the published road, not the templates.** Offline, every press reaches the
monitor in 20 to 70 ms, the same as an Update, and the reveal's motion is short (0.45 s spring;
Arcade's three flashes are a 0.36 s stepped animation whose first frame already reads). On a
PUBLISHED production, `sendControlVerb` put every machine `event` on the durable road alone and did
not even apply it to the sending page's own monitor: the RPC plus the `postgres_changes` fan-out,
which `src/control/commandRoads.ts` measured on 2026-09-10 at 220-350 ms and 131-645 ms bimodal.
A Take or an Update rode the broadcast at a median 87 ms and moved the operator's own monitor in
zero hops. That is the "slower than normal graphics" the owner felt, and it is one press against
another on the same page.

Events took that road because a clock's shared origin is stamped from the row's `created_at`. Only a
clock reads it, so the sender now says which graphics are clock-free and those events ride exactly
like a Take: `fastEvents` on `sendControlVerb`, derived by `fastEventGraphics` /
`eventsNeedServerTime` in `src/control/matchClockWire.ts` from the PUBLISHED payload (the renderer
runs that snapshot, not the library copy). The test is deliberately loose - a `-clock` class, a
`data-speaking` attribute or a script reading `noacgEventAt` keeps the slow road - and a sender that
passes nothing keeps every event slow, which is exactly today's behaviour. An event that ends up
slow for any reason still takes the 1200 ms ordering hold with it, so a Take behind it cannot
overtake it.

I did not re-measure the published road myself: it needs a backend, and the numbers above are the
ones commandRoads.ts recorded. What I did prove on a real stack is that nothing broke - the
configured suite on this branch (run 35758948806) passed 51 of 51, including `quiz-output`,
`imported-quiz-output`, `dashboard-hosted-walk`, `playout-both-roads` and the clock-carrying
`scorebug-output`. That run is marked failure ONLY by the skip gate over `bridge-real-server`
(no CasparCG on a runner), exactly as main's own runs 35757466398 and 35755733408 are - alarm #371.

**3. Arcade is not on older controls; there are two models, and Arcade shares its own.** qz13
Sticker, qz14 Showtime and qz15 Arcade are the quiz SHOW boards (`types/quizShow.ts`, added
2026-09-19): one press per letter (Pick A to Pick D), Clear pick, Reveal correct answer, and
deliberately no lock and no audience result. The other twelve boards and the imported quiz are the
answer-board family: pick the letter in the cue, then Select answer, Lock it in, Reveal choice,
Reveal correct. So the difference the owner saw was between the two FAMILIES, and Arcade matches its
two siblings exactly.

I did not move Arcade, and it is not a template-declaration change: the show boards emit their
runtime with `lock: false`, so there is no `applyLock`, no `.quiz-locked` look drawn in any of the
three designs, and a Lock button would light nothing on air. Moving it would also split it from the
Quiz Show kit. `e2e/quiz-live-consistency.spec.ts` now pins both control lists, so a board that
drifts from its family fails there. Which model the whole catalog should settle on is the
post-Friday controls review's call, and it is a real question: the per-letter pick is one press
where the other is two.

## For the post-Friday controls review

- **One answer model, or two on purpose.** Per-letter picks (one press, no lock) against
  select-plus-lock (two presses, a lock beat). Today which one a board has depends on which family
  it was drawn into, which is not a reason an operator can see.
- **A saved graphic keeps its old buttons.** A control list's payload is compiled into the template
  at build time, so this fix reaches graphics built from now on. A quiz already in a library or a
  production still has a Reveal that carries nothing, and there is no re-derive path for saved
  template code. The owner's walk says to build the quiz again; a general answer (re-deriving a
  saved graphic's machine metadata from its type, or a versioned migration for it) is a bigger
  change than this week allows.
- **Two surfaces can hold different keys.** The reveal now carries the key from the cue the press
  was made on. If a second operator fixes the key on the hosted page and presses Update, the
  producer's dashboard still holds the old key in its cue and a Reveal from there re-sends it. The
  same is true of `select` today. The honest fix is for a cue editor to follow another surface's
  staged edits, which is a control-layer change.
- **The hold-back across devices** is unchanged and still a stated limit
  (`docs/backlog/playout-lag-when-working-the-queue.md`).

## Verification

- `npm run build`: exit 0, read from the build's own exit code.
- Offline Playwright, queued through `npm run queue`: `quiz-live-consistency`, `quiz-show`,
  `wizard-setup-fields`, `quiz-pilot`, `dashboard-operator-walk`, `control-panel-types`, `exports`,
  `production-controls`, `student-rehearsal`, `control` - 132 passed. After the review fixes, a
  second queued run over `quiz-live-consistency`, `quiz-pilot`, `production-controls`,
  `playout-cues` and `hosted-control`.
- Configured suite on this branch: run 35758948806, 51 of 51 (see finding 2).
- Not fixed, seen in the exports spec's OGraf leg: after `dispose()`, a still-pending GSAP tween
  fires `revealAnswer` into a torn-down document and the dev server logs one unhandled
  `TypeError: Cannot read properties of null`. It fails nothing and predates this branch; guarding
  it means editing the quiz runtime, which re-records fifteen catalog baselines.

## Check

- review: delegated. The code-review skill REFUSED the first request because I had trimmed the file
  list; re-invoked with exactly what `scripts/review-request.mjs` printed, it read base
  `6f5855d94b53fe682521b3eb2b93b59041de3353`, branch `claude/u-quiz-live-consistency` and all 21
  files, which matches this worktree's diff. Five findings, three acted on: the missing ordering
  hold for a fast-eligible event that still went slow (fixed), the dashboard deriving clock-free
  graphics from the library instead of the published payload (fixed, both pages now use one
  derivation), and the stale ordering paragraph in the lag backlog (fixed). The other two are the
  saved-graphic propagation limit and the two-surface key, both recorded above.
- simplify: inline. The skill returned fan-out instructions, so I did the pass here: the two pages
  had the same two-line derivation, which is now `fastEventGraphics` in `matchClockWire.ts`.
- verify: `npm run build` exit 0 plus the runs above.
- taste: not applicable. No graphic's look changes; the only template change is a control's
  declared payload.

## Commits

- `4b9f0139` the carried key, the fast road for clock-free events, the spec, the contract rule and
  the owner walk
- the review fixes, the shared derivation and this handoff
