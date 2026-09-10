# 2026-09-10 - row BQ, the four 2026-09-10 alignment answers recorded

Branch `claude/bq-record-the-2026-09-10-rulings`, worktree `agent-a0269742b40941eec`. Three
commits off `919d7d27`. Build green. `/check` passed - `review: delegated:3/1`, `simplify:
inline`, `verify: inline`, `taste: not applicable` (docs-only, nothing renders a graphic). The
verdict stamp is written at `.git/noacg-jobs/checks/claude-bq-record-the-2026-09-10-rulings.json`,
on `a92e4558`. CI on that sha is green (`gh run view 34483639079`) with the CI gate ("Require every
gate") passing; the E2E, Vercel and catalog-calibration jobs skipped, which is expected for a
docs-only change under the E2E plan job's own affected-file check.

## What the row was asked and what came back

`node scripts/alignment-answers.mjs` named four answered-and-unrecorded questions from today's
weekly alignment session. All four ALIGN-2026-09-10-1 through -4 blocks it printed are now appended
verbatim to `docs/OWNER_RULINGS.md`. Re-running the script now reports "Nothing open and nothing
unrecorded" - confirmed, not just claimed. `node scripts/owner-receipts.mjs --check` also passes:
47 receipts, 39 standing asks, 2 findings.

ALIGN-2026-09-10-3 asked for something to be built (a checkbox choosing between two Space/queue
behaviours), so per the recipe it also got its own backlog file,
`docs/backlog/space-sends-to-preview-then-to-program.md`, with owner-receipt front matter quoting
him verbatim rather than being lost inside the rulings prose. ALIGN-2026-09-10-2 named catalog
looks the owner said we do not have (news, UFC, NFL, night shows) and said variety is not a
requirement for the 25th; that got appended as a dated addendum to the existing
`docs/backlog/catalog-variety-by-programme-type.md` rather than a new sibling file, per the recipe.

## What `/check`'s review caught, and what I fixed versus flagged

The delegated code-review pass (high effort, scoped to the three touched files against
`919d7d27`) returned three findings. One was a bug in my own new text: the addendum told a future
session to add the named looks as rows in `docs/CATALOG_BY_PROGRAMME.md`'s §5 gap table, but that
table's axes are genre x graphic kind - News and Sports already exist as genre columns there. What
the owner actually named is a visual-register dimension the table does not carry at all. Fixed in
`a92e4558`: the addendum now points at item 3 (per-design defaults) instead.

The other two findings are real but out of my recipe's scope, and I am reporting them rather than
inventing the fix, per this row's own instructions:

- **ALIGN-2026-09-10-4** has the owner reversing the desktop app's parked state ("Everything should
  be unlocked. There's no reason to lock anything"), but `docs/backlog/noacg-desktop-client.md`
  still carries `state: parked` with a note citing the superseded 2026-08-16 ruling. A planning
  session reading that file rather than the full rulings log would still treat it as locked.
- **ALIGN-2026-09-10-1** has the owner ruling the dashboard-load-weight concern closed ("good to go
  for the 25th") and setting a priority order for the cloud-video and AI-assistant asks, but
  `docs/backlog/dashboard-load-weight.md`, `in-app-assistant.md` and
  `video-through-playout-wrapper.md` are not cross-linked to it.

Deciding what state each of those backlog files should move to, and what note to write, is a
judgement about this repo's backlog conventions that this row's recipe did not cover - it named
one specific file to create and one specific item to extend, nothing about updating unrelated
`state:` fields. Whoever picks this up next should read `docs/backlog/README.md`'s state
definitions before touching them.

## Anything that needs the owner

Nothing here is blocked on him - these four answers ARE his, already given, now just recorded.

## Pointers

- `docs/OWNER_RULINGS.md` §§ALIGN-2026-09-10-1 through -4 - the four answers, verbatim.
- `docs/backlog/space-sends-to-preview-then-to-program.md` - new, the Space/queue checkbox ask.
- `docs/backlog/catalog-variety-by-programme-type.md` - the 2026-09-10 addendum, with the
  gap-table correction folded in.
- `scripts/alignment-answers.mjs` - the check that blocked wave plans until this landed; confirmed
  clean above.
- Follow-up not done here: `docs/backlog/noacg-desktop-client.md` and the dashboard-load-weight /
  in-app-assistant / video-through-playout-wrapper trio need a note or state change reflecting
  ALIGN-2026-09-10-4 and -1 respectively.
