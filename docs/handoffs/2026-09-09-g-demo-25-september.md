# Row G - the 25th written as beats, and the push moved onto that date

Branch `claude/g-demo-25-september`, from `origin/main` at `ae5a32b9`. Documents only: one new
file, `docs/DEMO_2026-09-25.md`, three edits to `docs/GOALS.md`, one index row in
`docs/README.md`, one owner-queue item, and this handoff.

## What was written, and the five calls in it

`docs/DEMO_2026-09-25.md` is the session script for students and YLE people trying NoaCG on
2026-09-25: 30 beats in six sections, each with who drives, the exact route in the product, and a
status of WORKS, UNSEEN (eyes or box) or GAP with the evidence beside it (a spec name, a dated owner walk,
an acceptance item, or the audit row). §7 is the costed gap list, ordered by what would sink the
day. §0 records the five shape decisions, which are the judgement this row was launched for:

1. **They drive.** The brief says "trying NoaCG", so it is a follow-along session. We drive only
   the beats that need a playout box or a subscription some participants will not have.
2. **Both roads end at the library, so going on air is taught once**, in §5, for both. That is
   the structural fact the two named capabilities share and the script is built around it.
3. **The SVG road goes first** because the whole room can do it with no terminal and no account
   until publish; the CLI road second.
4. **"Their systems" is four targets prepared in advance and picked on the day.** OBS on their own
   laptop is the one every student can do and the one the evidence is strongest on. CasparCG 2.3
   with the output URL has never been ticked on a real box; CasparCG with a package has (the
   acceptance §2 box, round 2, on the owner's server); an OGraf renderer is proven for catalog and agent packages and not for an
   imported-SVG graphic with behaviour.
5. **The step-by-step guide is `/docs`**, with a one-page printed index into it, because a second
   guide drifts and the two live-vote guides already do.

Two things the evidence forced that the brief did not say:

- **The CLI road has a beat with no agent at all** (R2.1: `scaffold`, `validate --screenshots`,
  `save`), because a student without a Claude Code or Codex subscription otherwise watches road 2
  rather than doing it. The product needed nothing for this; the script did.
- **The biggest gap is not engineering.** The Yle demo of 2026-08-20 failed on Yle's network, the
  diag page that would say why shipped the same day, and the screenshot was never taken. It is §7
  row 1, one message from the owner, `needs: identity`, and it is the first thing in the queue item.

## The GOALS.md edits, and one outside the section I was given

- `## NOW`: the date is 2026-09-25 with the two deliverables and a pointer to the script; the
  2026-09-12 production, the quiz and the scoreboard stay, named as the rehearsal.
- `## NOW` step 1 said "nobody has walked" the SVG road. The repo records five owner walks of it
  (2026-08-25, 08-28, 08-29, 09-02, 09-03, each landing fixes in `docs/SVG_IMPORT_PLAN.md` and
  `docs/TEXT_BOX_BINDING.md`), so the line now says what is actually owed: the walk as a stranger.
- **One line in `## North star`**, above the section the prompt named: "The binding deadline:
  students run a real production with their OWN graphics by 2026-09-12. Work that does not serve
  that date is not current work." Left alone it would have contradicted `## NOW` in the same file,
  and it is the line a session grepping for "deadline" finds first. It now names the 25th. NEXT, THEN and the parking lot are untouched.

`docs/README.md` gained the index row `check:docs-index` refuses to build without.

`docs/GOALS.md` states a ~200-line budget in its own opening paragraph and was 296 lines on
`main` before this row; it is 307 after. The breach is not this row's to fix (the sections over
budget are NEXT, THEN and the parking lot, which the prompt kept off limits), but a condensing row
is owed and should be planned rather than left to the next person who adds a line.

## What is a gap, and what it costs

§7 of the script is the list and it is derived from the status column, so it is not copied here.
Twelve rows: three are the day's real risks and the rest are the fortnight's work. The three:
the venue network has never been proved to boot the app (one owner message, `needs: identity`);
the output URL on a real CasparCG 2.3 box has never been ticked (free on the 12th, and the
package road is the proven fallback); and "in minutes" has no number (row A, today). Nothing in
the list needs money, an account we do not hold, or a publish past `main`.

## Verification

`npm run build` exit **0**, read from the build's own exit line (`BUILD_EXIT=0` appended to the
log, never a pipe's status). The first run failed on exactly one gate, `check:docs-index`, because
the new document had no index row; the row was added and the gate re-run green in isolation before
the full build was re-run. No product code changed, so no e2e run applies and nothing is observable
in the browser; the owner-queue item routes to the document on GitHub, readable from a phone.

`/check`:

- `review: inline`, then the delegated findings arrived by relay and were acted on. The
  code-review skill answered in this context with one finding and a promise that "the finders are
  still running", which under `check.md`'s rule means the leg did not run here, so the diff was
  read against the angles inline first (every spec name, anchor, audit row number and date checked
  against the tree: `e2e/docs.spec.ts` pins `#svg`, `#svg-fonts`, `#claude-code`, `#casparcg`,
  `#dashboard`, `#export`; the audit rows cited carry the text cited; 47 corpus fixtures;
  `cli-v0.3.0` on the registry 2026-09-05 with five `cli/` or `src/bridge/` commits since). The
  skill's finders then reported to the launcher, exactly as `check.md` predicts for a fan-out, and
  the orchestrator relayed both reports (`node scripts/relay.mjs read --branch
  claude/g-demo-25-september`, twelve findings). What was done with them:
  - **Acted on, all of them except one.** Row letters defined by goal and handoff file (a `.git/`
    plan is not readable from `main`); A3 and A4 now cite the acceptance boxes the 12th ticks
    (`CLOUD_PLAYOUT.md` §8 step 7, `STUDENT_RELEASE_ACCEPTANCE.md` §1 and §8.7) rather than
    restating them; A5 points at the §2 box instead of carrying its own date, since two sources
    already disagree on it; B2, A1 and A2 quote the audit's own grade words; R1.1 cites
    `#svg-rules` by anchor rather than paraphrasing a rule that already has two copies; the
    install-line dates live in B5 only; §7 is now derived from the status column (every GAP or
    UNSEEN beat has one row, no WORKS beat does, twelve rows); the deck is one beat; every table
    has the same six columns; §8 is one rule; the GOALS paragraph on the 12th is one sentence and
    the north-star clause is gone; the index row is one line.
  - **Not done: folding §7 into `GOALS.md`.** The reviewer read §7 as a second roadmap. The
    prompt's WHY says the demo script IS the fortnight's gap list, and a list of what a session
    still lacks is not a roadmap when GOALS points at it and holds nothing of its own. The
    duplication that was real (the 12th's role stated five times, GOALS step 1 restating two §7
    rows) is removed; the list stays where the owner will read it.
  - **The status vocabulary stays three words, with UNSEEN split.** The audit's grades answer
    "may the landing page claim it"; this column answers "can the beat run on the day and has a
    person seen it". UNSEEN now says whether it wants eyes or a box, which is the queue's own
    walk/hardware split and was the blur the reviewer found.
- `simplify: inline`. The skill returned fan-out instructions; its angles are covered by the list
  above, and its own late report is the second half of the relay.
- `taste: not applicable`. Nothing in the change can move what a graphic looks like.
- No em dashes, en dashes or curly quotes in the new text (grepped; the three hits in `GOALS.md`
  are pre-existing lines this row did not touch).

## For the next planner

- The script's status column is the contract. Rows A and D and the 12th each change named rows
  (§8); whoever lands one edits the row in the same commit.
- The wave plan already flagged that nothing this wave serves the CasparCG / SPX half of "their
  systems". The script narrows that: A5 (the package) is proven on hardware, A4 (the URL on 2.3) is
  the one that needs a box, and the 12th is where it gets one. If the 12th cannot reach a CasparCG
  box, gap 2 becomes a row with hardware and should be planned as one.
- 35 owner-queue items carry `serves: now`. The push did not change in substance (the SVG road is
  still the push), so none were re-keyed; a planner who reads `serves: now` as "serves the 25th"
  will be right for the import items and wrong for none I could find.
