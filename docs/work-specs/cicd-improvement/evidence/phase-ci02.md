# Phase ci02: coherent review checkpoints

Row ci02 of the [cicd-improvement spec](../spec.md) (P1d; AC-2 measurement start). Prepared
2026-10-31 by the ci02 builder (Claude Code Cloud worker of plan run #1842). It lands the D1
review guidance once and starts the AC-2 sample. Nothing here passes AC-2: improvement needs the
ten-row sample, which has not happened yet.

## 1. The one guidance source (acceptance a)

**Where.** A new "Review checkpoints" section in
[`docs/plan-runs/known-traps.md`](../../../plan-runs/known-traps.md). Every brief template in
`docs/plan-runs/templates/` already sends its worker to that file at the worker's source SHA:
build, repair and fix say to read it in full, check names it in its reading list. So the guidance reaches every builder, repairer and
checker of every plan run, this one and the separately authorized JEV run alike, without
changing a template, and it exists in one place. The one existing line it touched is the Codex
gate bullet in the same file, which said "ask `@codex review` again after each fix push" and now
says one request per new head. Coordinators read `plan-run.md`, not this file, so its gate line
gains a pointer: the Codex review counts only with a real result, never a stalled request.

**What it holds,** mapped to the spec's D1:

| D1 requirement | Where in the section |
| --- | --- |
| Fresh reviewer gets the contract, a criterion-to-evidence map and exact base and head, not the repair conversation; it picks its own probes | opening paragraph |
| One outstanding review per revision and scope; coherent checkpoints; frequent commits and backups kept; a new head voids an old clean verdict | first bullet |
| Unchanged repair limits; the repeated-family trigger is not an extra attempt | second bullet, Repeated family row |
| Separate product defects, faulty test expectations, infrastructure failures and delayed review in the record | third bullet |
| Routine work gets no new design-review ceremony | Ordinary row |
| Stateful work states its observable rules first; a fresh reviewer challenges them before code when the feature changes them | Risky row |
| An independent oracle must not repeat the production algorithm; a small independently derived reference model when the transitions are the feature (D3) | Risky row |
| A finding that exposes an unmade product decision is decided under the existing owner/coordinator policy before patching (D3) | Risky row |
| Two successive confirmed rounds of one family pause patching for a focused independent reassessment | Repeated family row |
| A stalled review is never implicitly clean; the existing recovery procedure applies | Stalled row (plan-run's idle threshold and wait handling) |

A request is outstanding from the moment it is made until its result is on the PR. For Codex,
opening the PR is the first request, and the result is a review, a receipt comment or a 👍
reaction. Meanwhile the summary comment Codex keeps on each PR carries `"status":"running"` and
the commit in its `codex-review-state` marker. That is how the stalled case below was found,
and a worker can read it with one REST call.

**What it does not change (acceptance c).** No template, workflow, check, test, limit or
script; the only procedure-file change is the one-clause pointer in `plan-run.md` above. The coordinator still posts the head-bound `noacg/reviewed` stamp and
requests auto-merge at once with head checks before and after (`plan-run.md`, `queue-merge.md`
cloud step 5); GitHub still requires `CI gate` and `Reviewed` before admission (ruleset 22389043,
as read in phase ci01). Checkers stay independent of builders and repairers, as the check
template and plan-run require. The ordinary path is exactly today's: `/check`, the Codex review,
a final fresh `/so`. Repair limits are those of queue-merge and plan-run, by reference, not restated. Parallel-plans D3 is marked
fulfilled by this section, as the spec asks.

### Scenario exercise with a fresh reviewer

A fresh, read-only Claude Code Cloud session that shares nothing with this builder read the
section at `893e16b4` and applied it to four real cases from the record. Its answers and what
changed because of them are in section 4.

| Scenario | Real case it was given |
| --- | --- |
| Ordinary | #1845 (provider wording in five planning and procedure files, no state rule) |
| Risky | production-page row 30, #1695 (selection air re-send of a lost revision) |
| Repeated family | production-page row 32: two failed checks in one family (press-safety base and instance identity), #1728 then #1730 |
| Stalled | #1763 (row 39): review on open plus one `@codex review` at 05:23Z, Codex state still `running`, PR merged 06:00Z |

## 2. AC-2 baseline from existing records

The comparison set is ci01's frozen cohort narrowed to its **backend/stateful stratum**: 13
production-page rows (30-34, 38-41, 43, 45-47). AC-2 asks for comparable risky rows; this is
the nearest existing set. It is chosen differently from the sample: ci01 picked these rows by
the paths their first PR changed (`supabase/`, `api/`, `e2e/configured/`), while sample rows are
picked by the Risky row's test on their acceptance. Reports state that difference. The JEV rows differ in feature area,
so any comparison reports that difference rather than hiding it.

Sources: the production-page ledger at `7d45649e` (row `build` times) and REST reads of each
row's first PR (pull, reviews, comments, timeline), 57 calls, cached, no log text kept.

**Pre-queue time** = the row's first ledger `build` to its first PR's first
`added_to_merge_queue`. Minutes, nearest rank, n = 13:

| p50 | p90 | max | mean |
| ---: | ---: | ---: | ---: |
| 180 | 513 | 514 | 225 |

| Row | PR | Build to PR open | Pre-queue | Comments asking `@codex review` | Asked again before a result: comments only / PR open counted | Commits |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 30 | #1695 | 70 | 514 | 36 | 5 / 5 | 50 |
| 31 | #1724 | 45 | 116 | 3 | 1 / 1 | 12 |
| 32 | #1728 | 84 | 284 | 18 | 2 / 3 | 27 |
| 33 | #1732 | 82 | 204 | 10 | 4 / 5 | 17 |
| 34 | #1735 | 71 | 180 | 5 | 0 / 1 | 18 |
| 38 | #1757 | 53 | 97 | 7 | 2 / 3 | 10 |
| 39 | #1763 | 484 | 513 | 1 | 0 / 1 | 13 |
| 40 | #1765 | 48 | 135 | 5 | 2 / 2 | 11 |
| 41 | #1772 | 66 | 167 | 13 | 2 / 3 | 21 |
| 43 | #1776 | 65 | 245 | 14 | 0 / 0 | 40 |
| 45 | #1780 | 68 | 151 | 10 | 2 / 3 | 18 |
| 46 | #1781 | 44 | 253 | 24 | 1 / 2 | 33 |
| 47 | #1786 | 25 | 71 | 5 | 1 / 1 | 8 |

Row 39's long build-to-open is #1759's stuck test merge; #1763 replaced it.

**Review requests.** 151 comments asked for a Codex review (139 start with it), p50 10 per row,
p90 24, max 36. Counting comments only, 22 were a second request with no Codex result since the
previous one, in 10 of 13 rows. The section counts opening the PR as the first request; on that
count it is 30, in 12 of 13 rows. Both counts can overstate, because a clean Codex finish can be
only a reaction, which these reads did not time, and they cannot see a request made by other
means.

**Review-service delay.** Of the 151 requests, 128 got a Codex review or receipt before the
next request: request to result p50 3.0, p90 4.8, max 6.1 minutes. 23 got none before the next
request or the end.

**Stalled review.** #1763 is a confirmed stall that the old process passed. Codex started a
review when the PR opened (05:22:27Z, 👀 at 05:22:29Z) and again on the `@codex review` comment
at 2026-10-27T05:23:33Z (👀 at 05:23:44Z). Its state comment stayed `running` for commit
`cef25ae`, no review or 👍 followed, the PR was labelled for landing at 05:23:50Z and merged at
06:00:20Z.

**Repeated-family rounds.** At the checker level, 1 of 13 rows: row 32 failed its check twice in
one family. Rows 30 and 32 failed their first independent check; 11 of 13 passed it. PR-level
finding families were never recorded, so that part of the baseline is **missing**.

**Invariants before and after coding.** Never recorded. **Missing.**

## 3. The sample (acceptance b)

**Eligible rows.** A row of separately authorized work (another plan run's phase or an
owner-requested fix) whose builder starts from a source SHA that contains this guidance, and
that is risky by the section's Risky row, judged on its acceptance before it is built. Not
eligible: this run's own rows (the spec counts none of them for AC-2), work made for the sample,
and rows built before this guidance landed. The first two eligible rows are the feasibility
trial; the next ten are the comparison sample. A row that fails, stalls or never finishes stays
in the sample with that outcome.

**Per row, from existing records only** (PR, its comments and timeline, the run ledger): rules
stated before coding and rules found after; confirmed rounds with family and class;
repeated-family rounds and whether the reassessment ran; duplicate requests (a second request
on the same head while one was outstanding); review-service delay; stalled requests and their
recovery; first independent check outcome; pre-queue time as defined above. No builder records
anything beyond what the section already asks.

**Work available today.** The JEV SVG import run (owner start 2026-10-31T10:19:44Z, 40 phases,
window to 2026-11-14) is the only separately authorized plan running. No owner-requested fix
outside this run is open, and a generic wave cannot run beside a plan run. On a read of their
acceptance, these JEV phases set state rules and are the provisional candidates, in run order:

| Slot | JEV phase | Why risky | Status |
| --- | --- | --- | --- |
| Feasibility 1 | 5 Apply the contract through the existing draft | stale and conflicting decisions, atomic idempotent apply | pending |
| Feasibility 2 | 7 Persist the clock instance and profile | persisted identity, duplicate refusal, recovery | pending |
| 1 | 9 Adapt clock events and recovery | origin across updates, reload, reconnect, two outputs | pending |
| 2 | 10 Resolve absolute target times | survives resend, replay and recovery | pending |
| 3 | 17 Connect imported content fields to the Sheet adapters | pause, reconnect, closed-page delivery | pending |
| 4 | 24 Apply linked updates without replaying motion | updates while moving, reopen and reconnect | pending |
| 5 | 25 Qualify Sheet delivery failures and native ticker continuity | delivery failure, reopen and reconnect | pending |
| 6 | 27 Protect source bindings and keys on reimport | identity across reimport | pending |
| 7 | 28 Keep control arrangements through reimport and one panel dispatch | identity across reimport, one dispatch | pending |
| 8 | 31 Add the server decision adapter and task policy | reservations, cancellation, bounded retry | pending |
| 9 | 35 Connect qualified model proposals to the import flow | timeout, cancellation, stale response | pending |
| 10 | 37 Qualify privacy and service-failure behavior | retries, cancellation, stale responses | pending |

JEV phase 1 started at 2026-10-31T10:32:20Z from `139a9724`, before this section existed; it
is not a candidate and is not eligible. A JEV phase built from a source without this section
leaves the sample and the next candidate moves up; with twelve candidates for twelve slots,
any loss leaves a slot missing. The slots are a frame, not a claim: JEV's coordinator judges each row at its
brief, a row may prove routine, and if fewer than twelve eligible rows exist when AC-2 is
assessed, the shortfall is reported as missing and AC-2 stays pending.

**PR clock.** Phase ci01 left the switch of PR ceilings to receipt-timed starts to ci02 or
ci18. Only one receipt-timed sample exists (ci01 itself), so recalibrating now would rest on
one PR. It stays with ci18; reports keep the stamp-based figure beside the receipt-based one.

## 4. Fresh-reviewer exercise

Reviewer: Claude Code Cloud session `session_017SdbwMjxnCfwPxTfnZDeFe`, read-only, started with
the section and the four cases only, told not to read this file first. It read `893e16b4`.

| Case | What the section prescribes (reviewer) | What actually happened (reviewer) |
| --- | --- | --- |
| Ordinary, #1845 | nothing extra: `/check`, one Codex review per head, a fresh `/so` on the final diff | matched: `/so` graded B, the fixes went out as one head, one clean Codex review, merged |
| Risky, row 30 (#1695, #1704) | Rules in the phase notes and PR before code, a fresh `/so` on them before code, coherent checkpoints, one repair after the failed check | no Rules section; about 20 heads of one-finding patches before a `/so` on the design; one second request on the same head |
| Repeated family, row 32 (#1728, #1730, #1731) | after the second failed check in one family, stop patching, reassess the model, then repair | plan-run's diagnose made that model-level call and #1731 was the model fix; one same-head Codex re-ask on #1728 |
| Stalled, #1763 | never clean, no second request, report pending, the coordinator recovers, no stamp meanwhile | labelled for landing 17 seconds after the request and merged with Codex still running |

Its yes/no answers: one outstanding request per head and scope, mostly yes (two defects below);
repair limits unchanged and no attempt added, yes; a new review step for ordinary work, no (the
reply to a confirmed round now names its family and class, a few words in a reply that already
exists); stamping, auto-merge request or required checks changed, no; reviewers independent of
builders and repairers, yes.

Defects it found, each fixed in the section:

| Defect | Fix |
| --- | --- |
| "Outstanding" meant only the `running` state, missing a request not yet picked up and the review Codex starts on PR open, so the first head could get two requests | Outstanding now runs from the request to its result; opening the PR is the first head's request |
| "Under plan-run's wait step" names a step with no review-stall handling, and no point at which a review counts as stalled | Stalled now starts at plan-run's existing 30-minute idle threshold; the coordinator's handling is spelled out as a wait that spends no attempt |
| A replacement request contradicted "one outstanding", since the stalled Codex request still reads `running` | The coordinator first says on the PR that the request is stalled, which ends it as the outstanding one, then makes one new request |
| "One repair then diagnose" left out plan-run's re-check after a blocked prerequisite and diagnose's last repair | Repair limits are now named by reference to queue-merge and plan-run |

Its two smaller gaps were also closed. The Risky row was triggered by "sets" while the
pre-code `/so` ran "when the phase changes them"; the row is now "sets or changes" and the
`/so` always runs. For a repeated family in failed checks, plan-run's diagnose agent is the
reassessment, and the repair follows only if an attempt remains.

The first independent assessment (`/so`, session `session_017SdbwPoJzRrePmqfQfuAeF`, grade B on
`3e1e56b1`) then read the fixed text. Its one blocking finding: the section left out D1's rule
that an oracle must not repeat the production algorithm and D3's reference model and
unmade-product-decision rules, so marking D3 fulfilled overstated it. All three are now in the
Risky row. Its other findings corrected the duplicate-request count, the #1763 description, the
stratum wording, the JEV phase 1 line and the slots, and added the `plan-run.md` pointer.
A second fresh `/so` (session `session_017SdbwMzRfxG3reJNQDpomr`) graded `5b823752` A with no
blocking finding; its in-diff wording fixes (the review-request gate line, the scope of the D3
note and the template reading claim) are in the final head.

## 5. Phase notes

- **Previous verified main:** `139a9724ebb1a2522750008dcb5a6a8b72adeac0` (#1848, ci01; its
  independent check passed with exact-merge checks green).
- **Revert:** `git revert -m 1 <merge commit of this PR>`, landed through `/queue-merge`. It
  removes the section, restores the old Codex bullet, the parallel-plans D3 line and this file.
- **Decisions:**
  - The guidance lives in `known-traps.md`, not in a template or `plan-run.md`: the templates are
    fixed and all link that file, and `plan-run.md` (75 of 90 lines) is the coordinator's
    procedure, so it gets only a one-clause pointer at the Codex gate.
  - "Revision" in the spec means the PR head. One outstanding request per head and scope; a
    `/so` on the Rules and a `/so` on the final diff are different scopes.
  - A stalled review is never treated as clean, as parallel-plans D3 requires. The point where
    it counts as stalled reuses plan-run's 30-minute idle threshold rather than a new number;
    the worker reports it pending and only the coordinator replaces the request.
  - The baseline is ci01's backend/stateful stratum, the comparable risky set that exists. It
    is path-based; the sample is acceptance-based, and reports say so.
  - Collection scripts were scratch work and are not committed; the method and every number
    are here, with each PR named so it can be read again.
- **Traps:**
  - A clean Codex result can be only a 👍 reaction with no comment, so counting comments and
    reviews undercounts results and overcounts duplicate requests.
  - The Codex summary comment is edited in place: read its current `codex-review-state`, not
    its first text.
