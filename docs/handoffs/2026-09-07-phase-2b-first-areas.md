# Handoff - phase 2b's first two areas, and the defects the merge queue exposed

**Written:** 2026-09-07. **Plan:** `docs/WORKFLOW_ARCHITECTURE.md` §5.3 (the specification) and §7
(the phase order). **Measurements:** `docs/METRICS.md`, five dated columns now.

## What landed

- **Pull request descriptions written for a person** (#84). Title is the branch's first commit
  subject; the body lists what changed, optionally why (`npm run queue:merge -- --why "..."`), and
  how it was tested. Read off the branch, so nothing has to be typed. Owner-queue item filed.
- **The compiler writes a directory's contract** (#87). A directory is the compiler's once its
  `AGENTS.md` carries the generated marker - which is what migrating an area does. No sibling
  `CLAUDE.md`, because `.claude/rules/` already covers Claude. Kernel capped at 8 KB. Each migrated
  area carries its own `.gitattributes` naming the `noacg-contracts` merge driver.
- **`src/templates/versus` migrated** (#87), then **`src/templates` migrated** (#98, queued).
- **A nested `.gitattributes` no longer plans a spec sweep** (#88).
- **The nightly keeps its report when the budget fails** (#90), and uploads the merged JSON.
- **`merge-order` and `cleanup-worktrees` read `origin/main`** (#95, #97).

## The one number that matters

`src/templates/AGENTS.md`: **53,037 -> 26,482 bytes**, in a file 24 instruction chains load. Its
multiplier halves, 1,256,832 -> 635,568. The three template chains that were among the five
tightest in the repository are no longer in the top five - they were tight because of the parent.

**The `versus` row went the other way**, +121 bytes, and `docs/METRICS.md` says so. A generated
contract carries ~200 bytes of fixed overhead and three rules do not amortise it. The win is in
the large areas, and this is the evidence that it is real there.

**The near-duplicate threshold needs no recalibration.** §7 lists that as its own row. Across 86
rules written from one contract, `learn` refused nothing - zero `--distinct` overrides. On its
first real corpus `DUPLICATE_THRESHOLD = 0.6` produced no false positives. That row can close.

## The class of defect that cost the most today, and where it may still be

**Nothing fast-forwards the laptop's `main` any more.** Every landing used to; GitHub's merge queue
never touches this machine. The local ref was ten commits behind by mid-afternoon and drifts
further with every landing. Two tools measured "has this landed?" against it:

- `merge-order` reported already-landed branches as work that must land first, and refused a
  branch for containing them. Fixed in #95.
- `cleanup-worktrees` refused to reclaim three landed worktrees, at about a gigabyte each. Fixed
  in #97.

**Both were found by using the machinery, not by reading it.** Anything else that resolves `main`
rather than `origin/main` has the same bug and nothing will report it - the symptom is always a
refusal that reads like a real risk. `grep -n "'main'" scripts/*.mjs` is where a sweep starts.

## Open, in payoff order

- **The wizard is the next area.** `src/components/wizard/AGENTS.md` is 53,101 bytes and its chain
  is the tightest in the repository at 102,598 of 110,000. It is also the one with the least
  headroom, so it is the row most likely to need the byte win before it can grow at all.
- **`contracts/retired.json` and its negative check** (§7 item 4): a retired mechanism, its date
  and its replacement, so a doc naming `safe-merge` as the landing path fails the build. Unbuilt.
- **The nightly is red on the time budget** (#85), 4.72 -> 5.22 s mean per test against a 5.00
  ceiling. Triage is on the issue: it is NOT `counting-settle.spec.ts`, and most of the rise is
  outside the top ten and cannot be diagnosed from the logs. #90 makes the JSON available so the
  per-file diff is a two-minute job on the next nightly.
- **The configured suite has no quarantine** (#94, now green again). `ci.yml` grew one in phase 1c;
  the configured tier has the same failure mode and none of the machinery, so one flake is a
  standing red alarm until a person opens the spec.
- **Codex did the templates extraction** and it was the right shape of work: long to do, short to
  specify, mechanically verifiable. Two things to carry forward. It stopped and asked rather than
  guessing when the spec was ambiguous about what `learn` may rewrite - that was my spec's fault,
  and worth being explicit about next time. And it faithfully turned a STALE passage into a rule
  (a wizard toggle the brand chooser had replaced), which is the one way this migration can leave
  the tree worse than the prose: nobody reads a paragraph in a 669-line file as authoritative and
  everybody reads a rule that way. Cross-check every extracted rule that describes a control, a
  default or a UI affordance against the contract that owns that surface.
