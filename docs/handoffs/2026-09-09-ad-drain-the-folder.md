---
v: 2
kind: handoff
date: 2026-09-09
branch: claude/ad-drain-the-folder
row: AD
---
# AD - the folder is empty, and every item in it was traced first

**Done and queued.** `node scripts/handoff-drain.mjs` reports
`docs/handoffs/ holds no tracked handoff files - nothing to drain` on this branch, before this file
puts one back. Eleven files went; every open item in them was traced individually to a landed
commit, a source header, a durable doc section, a backlog file or an owner-queue item, and the
seven that had no home are filed here. One live citation into the folder was repointed before the
deletion, in the same commit.

Three commits: `0d503e98` (the OGRAF wait), `b113082b` (the repoint, the deletions, five backlog
files), `856666e7` (the check's fixes and two more backlog files).

## The trace, one line per file

The heading "what is left" is what its author believed on the day. Each item below was opened and
checked against the working tree.

| handoff | open items | where they are now |
|---|---|---|
| `a-cli-minutes-to-air` | the unwalked cloud `save` leg; the `.env.local` requirement; two filed findings; three traps; a DEMO follow-up | `DEMO_2026-09-25.md` §7 row 8 and the R2.5 cell, both naming the stopwatch; `docs/AGENT_CLI.md:307-309`; two backlog files, both present; two traps filed here as `two-measuring-instruments-that-lie-are-recorded-nowhere.md` and one already in `scripts/dev-worktree.mjs:64-67`; the DEMO follow-up is closed - R2.3 no longer carries the overclaim it was about |
| `aa-deck-repair` | the Create-project question; a stale spec title; the two-branch DEMO conflict; a bottom-heavy slide | `docs/backlog/create-project-is-a-door-that-saves-nothing.md`; new `a-spec-title-the-demo-script-quotes-names-a-screen-that-moved.md`; the conflict resolved when both branches landed; the slide dropped as optional (below) |
| `d-import-road-guide` | no screenshots; publishing unwalked; three filed hesitations; Teams next | `docs/backlog/docs-shots-for-the-sections-that-have-none.md`; handed to `/docs#dashboard`, which documents it; all three answered in the wizard by row M and pinned by three `import-svg.spec.ts` cases; `docs/backlog/teams-needs-written-instructions.md` |
| `g-demo-25-september` | §7 is the gap list; rows 6, 7, 8 runnable now; the date sweep; GOALS over budget; two filed items | `DEMO_2026-09-25.md` §7 itself, which is the durable list and still carries rows 6, 7 and 8; the sweep landed and its file is deleted; `docs/backlog/goals-over-its-own-budget.md`, step 3 still open; `sign-up-says-check-your-email-with-confirmations-off.md` present |
| `h-drain-the-handoff-folder` | the split-the-list delegation lesson; a where-to-look-first note | `docs/HARNESS_ROUTING.md`, new section "Split a sweep's file list, and hand over a deletion log rather than banning git", carrying both 2026-09-09 measurements; the note is advisory and is repeated below |
| `j-one-date-for-the-push` | the OGRAF wait; eight findings addressed to nobody | the wait is fixed in `0d503e98`; two CLI defects filed (and a third found); the two medium DEMO ones re-derived and **both already closed**; four low ones were never written down and cannot be recovered |
| `k-reviewed-gate-race` | nothing, in its own words; two measured facts | the conflicted-pull-request fact is now a comment in `scripts/reviewed-status.mjs`, the file whose reader hits it; the `check-contract-citations` crash was fixed in that branch |
| `m-wizard-says-it-itself` | nothing unfinished; two filed items; three deliberate non-fixes | `the-catalog-baseline-has-been-red-and-nothing-ran-it.md` and `a-live-landing-starves-every-browser-job.md`, both present; the non-fixes are argued in the file and two of the three point at `docs-shots-for-the-sections-that-have-none.md` |
| `n-presentation-25-september` | the browser question; two HTML-artifact lessons | new `a-row-that-builds-something-to-look-at-needs-the-browser.md`; the two lessons dropped as optional (below) |
| `r-review-scope-is-checked` | one follow-on, the stamp's file list | new `add-merge-reads-the-check-stamps-sha-but-not-its-file-list.md` |
| `s-presentation-pptx` | G2 the printed index; two dated items to close before the day | all three are `DEMO_2026-09-25.md` §7 rows 12, 6 and 8, which is where they were already recorded |

## Dropped as optional, named rather than filed

Following the precedent the previous drain set, so the judgement can be reversed rather than
guessed at.

- **Slide 4 of the deck is bottom-heavy** (steps 03, 04 and 05 each wrap to two lines). Nothing
  overlaps and nothing leaves the slide - it was checked in a LibreOffice render - and the owner
  opens the deck himself as `DEMO_2026-09-25.md` §7 row 13. If he says nothing, there is nothing.
- **Two lessons for a future HTML artifact**: a print stylesheet should redefine the tokens once
  under `@media print` rather than re-colouring selectors, because a literal hex inside an SVG
  `<marker>` is unreachable from any rule; and a key map should have one source rather than being
  written in the head comment, the `?` overlay and the handler. Both are general web craft rather
  than facts about this product, and the artifact they came from was withdrawn - the repo has no
  HTML deck any more.
- **Four of J's six low findings.** They were never written down, only counted, so nothing recovers
  them. Keeping the file would not have.

## Evidence and traps that exist in no repo file

- **`npm run agy` cannot sweep a repository, and the reason is not obvious from the outside.** Only
  `read_file`, `command` and `write_file` are real grant actions in
  `~/.gemini/antigravity-cli/settings.json`; `list_dir`, `grep_search` and `codebase_search` are
  silently ignored as invalid. A model asked to search reaches for `grep_search`, headless mode has
  no prompt to answer, and the run ends with an empty response - 8.8 s and about 18 K input tokens
  for nothing. Enumerating the files in the prompt, which is what the existing 2026-09-03 entry
  says to do, does not help when the enumeration IS the question. Filed as
  `antigravity-cannot-grep-so-sweeps-routed-to-it-return-nothing.md`; ledger label
  `ad-handoff-citation-sweep`, outcome `unusable`, cause `prompt`.
- **A path grep is not the sweep, and neither is a `.md`/`.ts` grep.** The prompt warned that a
  path grep missed 2 of 37 sites on 2026-09-09; the failure this time was narrower and just as
  silent. My grep for the stale phrase "last screen before Create" ran over `--include="*.md"` and
  `--include="*.ts"` and missed `src/components/wizard/steps/FinishStep.tsx`, a `.tsx` file. The
  review caught it. **Include every extension, or use no `--include` at all.**
- **`git show <sha>:<path>` needs a sha that exists when you write it.** I first wrote a citation
  against the deletion commit, which had not been made. The tip the files still live at is the
  merge base, `a2ab4097`, and that is what every new backlog file cites.
- **Owner-queue items are as perishable as handoffs, and it is easy to forget.** `/walk` deletes
  them one at a time as the owner works through them, and `docs/backlog/README.md` names both
  directories in the same breath. Two of my first-pass citations pointed into owner-queue files;
  both now cite a spec case by title or a source line instead.
- **The Reviewed gate has a third failure shape.** A pull request opened while its branch conflicts
  with `main` gets no `pull_request` run created at all, so `Reviewed` never reports and the branch
  cannot land whatever the status says. `gh pr view <n> --json mergeStateStatus` reads `DIRTY`.
  Measured on pull request 193 and now a comment in `scripts/reviewed-status.mjs`.

## Anything that needs the owner

**Nothing.** One item was on its way to him and was decided instead: whether to grant Antigravity a
`command()` shell so it can grep. Decided against, because a session may not widen the machine's
permission posture on its own argument - the same edge on which
`the-allowlist-is-not-what-stops-a-row-at-night.md` was parked. The backlog file records the
decision, the alternative, and the fact that the grant is his the day he wants the capability back.

## Two edits outside the row's declared files, declared

The prompt's TOUCHES named the handoffs, `docs/OGRAF_ECOSYSTEM.md` and new backlog files. Two items
had no honest home inside that set and the backlog file for each would have been "write one
paragraph into the file that already owns this subject", so the paragraph was written instead:
`docs/HARNESS_ROUTING.md` (the sweep lesson, in the section beside the 2026-09-03 one it refines)
and `scripts/reviewed-status.mjs` (the conflicted-pull-request comment, in the script whose reader
hits it). Neither file was held by a sibling row: `claude/ae-cli-0-3-1` held `cli/` and
`claude/ag-ograf-external-renderer` held `docs/DEMO_2026-09-25.md` and `e2e/import-svg.spec.ts`, all
of which this row left alone.

## The check

`check: review delegated, simplify inline, verify inline. taste: not applicable.`

- **review: delegated** (code-review skill, level `high`). **Scope-checked before it was believed**:
  it named `claude/ad-drain-the-folder` and 20 files, which is exactly
  `git diff --name-only a2ab4097..HEAD` with a clean `git status --porcelain=v1`. Eight findings,
  every one confirmed against the source before acting, all eight fixed in `856666e7`. Three were
  miscounts in claims I had just written - a two-verb defect that is three, a `caspar` failure mode
  the code cannot produce, and a stamp reader I attributed to the wrong file - which is worth
  saying plainly, because this row exists to stop unverified claims outliving their handoffs.
- **simplify: inline.** The skill returned fan-out instructions, which `.agent-workflows/check.md`
  classes as not run, so the four angles were covered here. Three changes: the Antigravity item
  decided rather than routed to the owner (above), and two cross-references added so nobody files a
  third item over the same evening - to the parked allowlist item, and to the other open item that
  also ends in an edit to `HARNESS_ROUTING.md`.
- **verify: inline.** `npm run build` exit 0, read from the build's own exit code rather than a
  pipe's, three times: before the deletions, with them staged, and after the check's fixes.
  `node scripts/e2e-affected.mjs --list` maps nothing - no product code changed. CI was read on
  `b113082b` and is read to a verdict on the tip before queueing.
- **taste: not applicable.** The diff is documents, backlog files and one comment in a CI script.
  Nothing in it can move what a graphic looks like.

## Pointers

- The eleven deleted files are at `git show a2ab4097:docs/handoffs/<name>` - that is the tip they
  last existed on, and every new backlog file cites them that way.
- Six new backlog files: `three-cli-verbs-still-swallow-an-unquoted-flag-value.md`,
  `a-spec-title-the-demo-script-quotes-names-a-screen-that-moved.md`,
  `add-merge-reads-the-check-stamps-sha-but-not-its-file-list.md`,
  `antigravity-cannot-grep-so-sweeps-routed-to-it-return-nothing.md`,
  `a-row-that-builds-something-to-look-at-needs-the-browser.md`,
  `two-measuring-instruments-that-lie-are-recorded-nowhere.md`.
- Where I would look first if a deletion turns out to have been wrong: `n-presentation-25-september`
  and the two lessons dropped from it. Everything else traced to something specific; those two
  traced to a judgement.

## Safe to archive

Yes, once the queue lands it. Nothing uncommitted, the branch is pushed, the stamp is written, and
this file carries what the next session needs.
