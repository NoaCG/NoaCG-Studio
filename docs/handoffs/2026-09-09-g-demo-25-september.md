# Row G - the 25th written as beats, and the push moved onto that date

Branch `claude/g-demo-25-september`, from `origin/main` at `ae5a32b9`. Documents only. New:
`docs/DEMO_2026-09-25.md`, two owner-queue items, two backlog files, this handoff. Edited:
`docs/GOALS.md` (the `## NOW` date paragraph and step 1, one line under `## North star`, one word
in each of two `## NEXT` lines), `docs/README.md` (one new index row, one adjacent row corrected),
`docs/OWNER_RULINGS.md` (the 2026-09-09 date ruling appended).

## The error in this row, first

I reported the review relay as handled, twice, while an unread message sat in it. The first relay
was read at 11:24:36 and acted on; the second arrived at 11:25:48 and the third at 11:31:05, and
both of my status lines after that said "acted on" from memory of the first. `add-merge` refused
the queue on exactly that, which is the gate working. The rule I broke is the one every check in
this repo is built on: a claim about state is checked against the state (`node scripts/relay.mjs
list`), never against what the session remembers doing. Recorded here so the next planner weighs
my other claims accordingly.

## What was written

`docs/DEMO_2026-09-25.md` is the session script for students and YLE people trying NoaCG on
2026-09-25: 30 beats in six sections, the same six columns in every table (number, beat, who
drives, route, evidence, status), and a status of WORKS, UNSEEN (eyes), UNSEEN (box) or GAP with
the evidence beside it. §7 is derived from that column: every beat that is not WORKS has one row,
with what closes it, the cost, and who. §0 records the five shape decisions and the queue item
carries each with the sentence that reverts it:

1. They drive; we drive only the beats that need a box or a subscription.
2. Both roads end at the library, so going on air is taught once, in §5.
3. The SVG road goes first, because the whole room can do it with no terminal and no account.
4. "Their systems" is four targets prepared and picked on the day; OBS on their own laptop is the
   one every student does and the only one with no unseen hardware behind it.
5. The guide is `/docs` plus a one-page printed index, not a second document.

Two things the evidence forced that the brief did not say: the CLI road has a beat with no agent
at all (R2.1, so a student without a subscription does road 2 rather than watching it), and the
gap that can sink the day is not engineering. The 2026-08-20 Yle demo failed on Yle's network and
nobody has asked the contact for the diag screenshot since. That is an owner-action item now
(`needs: identity`), filed on its own so it reaches his action list rather than sitting inside a
phone taste question.

## The GOALS.md edits

- `## NOW`: the date is 2026-09-25 with the two deliverables, citing the ruling, and the pointer
  to the script; the 12th stays as the rehearsal with the quiz and the scoreboard. Cut to the item
  and the link after the review measured the first version as rationale.
- `## NOW` step 1 said "nobody has walked" the SVG road; the repo records five owner walks. It now
  says what is owed, a stranger's walk, and names `claude/d-import-road-guide`.
- `## North star`: the line calling the 12th the binding deadline now names the 25th, because it
  is the line a session grepping for "deadline" finds first.
- `## NEXT`, two words each, at the orchestrator's direction because my edit had made them false:
  "in the three weeks" is "before the 25th", and the Yle thread's "nothing is owed now" is "one
  message is owed now".

The file states a ~200-line budget and was 296 on `main`; it is 299 after this row. The three
lines are the two deliverables and the pointer, and I could not find three lines of my own to
cut without losing one of them. A condensing row is owed on the sections the prompt kept off
limits, and it is worth planning rather than leaving to the next person who adds a line.

## What the review found, and what was done with it

`/check` ran in three legs, and the fan-out reports of the first two arrived by relay from the
launcher, as `check.md` says a fan-out's do. Forty-one findings across the three relays.

- `review: inline`, plus the relayed findings acted on. The skill answered in this context with a
  promise of later results, so the diff was read inline first; the relayed reports then carried
  the findings that mattered. **Four overclaims, all fixed.** A7 dated the second external OGraf
  renderer walk 2026-08-26; `docs/OGRAF.md` dates it 2026-08-22 and the 26th is a schema check.
  R2.3 said the 2026-08-22 round drove "every cell through the terminal path" and that "the owner
  ran seven of them in a real production"; the bench took the terminal path from 2026-08-27, and
  "seven" exists in no file (the memory store said it; the repo says 22 staged as a production,
  `docs/SAVED_CONTENT_MODEL.md` §6). The encore said the live-vote defects were "fixed"; two were,
  one was stated, and the shape question is open. A3 promised a §1 tick on the 12th that has no
  box: §1 has no OBS line, so the beat now says he writes one. **Two rule violations fixed:** GOALS
  cut back toward its budget, and the Yle ask as an owner-action item with `needs: identity`
  (`everywhere.md`, "a question to the owner names its reason in its own text"). **Also done:**
  audit rows cited by their promise text (the audit's own rule), row letters replaced by branch
  names and deliverables (the wave plan is under `.git/` and row H is deleting the handoffs that
  could resolve the letters today), the ruling recorded in `docs/OWNER_RULINGS.md`, durable
  references in place of owner-queue paths that `/walk` deletes, B2's email-confirmation question
  answered from `docs/DEPLOYMENT.md` and `supabase/config.toml` (off, verified 2026-08-24), the
  fixture path for the vote board, §7 derived from the status column, one deck beat, the same
  columns in every table, the install-line dates in one cell, the 12th's role stated once per
  file, the adjacent README row that contradicted `TEXT_BOX_BINDING.md`, and the voice fixes
  (bold-label colons, connector colons, passives where the actor is the point).
- `simplify: inline`. The skill returned fan-out instructions; its late report was the second half
  of the first relay and is covered above.
- **Declined, with the reason:** folding §7 into `GOALS.md`. Two reviewers read §7 as a second
  roadmap. The prompt's WHY says the demo script IS the fortnight's gap list, GOALS points at it
  and holds nothing of its own, and a list of what a session lacks, derived from a status column
  and deleted from as it closes, is not a roadmap. The status vocabulary also stays three words
  rather than the audit's grades, because the audit answers "may the page claim it" and this
  column answers "can the beat run and has a person seen it"; UNSEEN now says whether it wants
  eyes or a box, which was the real blur.
- **Filed, not fixed, as directed:** the date-drift sweep across eight files outside this row's
  set (`docs/backlog/the-now-push-date-is-still-2026-09-12-in-eight-files.md`, led by the
  PROGRAMMES table, which a planner reads as the push), and the sign-up dialog that tells every
  new account to check an email that never comes
  (`docs/backlog/sign-up-says-check-your-email-with-confirmations-off.md`). Both would break the
  collision pass three other rows were planned against.
- `taste: not applicable`. Nothing in the change can move what a graphic looks like.

## Verification

`npm run build` read from its own exit line (`BUILD_EXIT=0` appended to a log of its own), on the
tip that queued. The first build of the row failed on one gate, `check:docs-index`, for the
missing index row; fixed. Two builds overlapped on one log once during the row and their exit
lines could not be told apart, so a clean run to a fresh log was taken before the stamp. No
product code changed, so no e2e run applies and nothing is observable in the browser; the owner
reaches the script on GitHub from a phone.

## For the next planner

- The script's §7 is the fortnight's list. Its who column is the only owner list; closing a row
  edits the beat's status cell and deletes the row in one commit.
- Rows 6, 7 and 8 of §7 are cheap and runnable now (a clean-profile install, the imported quiz in
  ograf-server, the live save spec); the review was right that scheduling them "the week before"
  put a possible Codex install defect two days before the room. Plan them early.
- The date-drift sweep is one commit and should land before the next wave is planned, because
  the PROGRAMMES table is one of the two things a planner reads.
- `claude/a-cli-minutes-to-air` owns §7 row 4 and `claude/d-import-road-guide` owns row 5;
  each edits its row when it lands.
