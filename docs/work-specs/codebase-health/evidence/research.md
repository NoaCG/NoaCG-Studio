# Research receipt — 2026-10-15

## Scope, pin and reproducibility

Read-only repository research, plus documents in the isolated worktree
`/workspace/noacg-codebase-health`, branch `research/codebase-health`. Starting checkout was
`3738cda3296d8f387575fc0f4f2575543af91a1c`. `git fetch origin main` refreshed the remote-tracking
ref; `git worktree add -b research/codebase-health /workspace/noacg-codebase-health origin/main`
created the documentation worktree. No checkout of local main was changed.

Pinned main: `50ce0911d9f37f5d1116e51a1cb34541ed03aef5`; commit timestamp
2026-10-15 06:38:54 UTC (09:38:54 Europe/Kyiv). Initial measurement clock read
2026-10-15 06:57:47 UTC (09:57:47 Europe/Kyiv). The owner explicitly chose this baseline after
being told that the fourteen-phase production refactor was not complete here. Later main changes
must be reconciled before execution, not silently blended into these numbers.

Coverage checks, all against the pin:

- `git rev-parse --is-shallow-repository`: false.
- `git rev-list --count <pin>`: 7,277 reachable commits; first-parent chain: 2,143.
- `git rev-list --max-parents=0 <pin>`: one root,
  `4273bdc3d296353687d75285bb94019c51fd72d4`, 2026-06-07T06:37:09Z.
- `git replace -l`: empty. `git rev-list --objects --missing=print <pin>`: no `?` missing objects.
  Thus this local graph covers the requested month; this does not establish completeness of
  unmerged branches, force-rewritten history, or external agent logs.

Window `(2026-09-15T06:38:54Z, 2026-10-15T06:38:54Z]`: enumerate the pin's first-parent chain
with `git log --first-parent --format='%H %ct' <pin>`, retain commit times in that interval.
There are 743 integrations. The first preceding ancestor is
`d0a097e00a9ab2f8ae992fdb8997236c808546eb`, at 2026-09-15T06:38:21Z; use its tree as start size.
The shorter window starts 2026-10-01T06:38:54Z. These are committer times, **not** GitHub merge
wall-clock timestamps (queue commits can precede their actual merge). No author-date filtering.

Reproduction inputs:

```sh
git log --first-parent --diff-merges=first-parent --no-renames --numstat \
  --format='COMMIT %H %ct' d0a097e00a9ab2f8ae992fdb8997236c808546eb..50ce0911d9f37f5d1116e51a1cb34541ed03aef5
git ls-tree -r --name-only 50ce0911d9f37f5d1116e51a1cb34541ed03aef5 \
  src api cli/src render-worker player-host
git show 50ce0911d9f37f5d1116e51a1cb34541ed03aef5:src/model/shows.ts
```

For each current source path, count its appearance once per integration's numstat (including
net-zero changes), sum additions/deletions, and count physical lines in its baseline and final
blobs. Normalize CRLF/lone CR; count a final unterminated line. File scope: `.ts`, `.tsx`, `.js`,
`.mjs`, `.cjs`, `.css`; exclude `src/assets/`, paths containing `/vendor` or `/generated/`, and
`.test.` files. 1,553 current files remain. Rank size, frequency and growth independently, then
inspect high-ranking overlaps; no magic cutoff or weighted score. Tooling/instructions are
inspected separately, not scored with product files. Screen static data after ranking: the
unchanged 1,950-line font index is not a maintenance hotspot.

`measurements.json` retains the selected rows and semantics. Net growth matches summed additions
minus deletions for the unchanged paths. New paths are labeled: inspect their creation diff
before treating them as growth. For AiStep, read both old and new paths with the same first-parent
log; nine unique integrations include its move/shim removal. Baseline old path is 2,133 lines;
final new path 1,659, net −474. The current path alone has one integration and would falsely look
like +1,659. The migration commit `15b26a6c9` keeps a shim and `9dfb0f25f` removes it, so automatic
rename detection alone is not a sufficient lineage definition.

## Safeguards and instructions inspected

Root `AGENTS.md`, `docs/work-specs/README.md`, `docs/ARCHITECTURE.md`, `docs/METRICS.md`, relevant
model/component/wizard contracts, `.agent-workflows/check.md`, `verify.md`, `plan-run.md`,
`scripts/check-file-budgets.mjs`, both budget JSONs, `gates.mjs`, `work-spec.mjs`,
`.dependency-cruiser.cjs`, `instruction-audit.mjs`, `instruction-load-probe.mjs`, and
`scripts/metrics/cochange.mjs`. Before document edits, `npm run rules --` on the new spec, ledger
and receipt reported folder guidance complete. Root guidance was read again on the pinned worktree.

- Budget script lines 15–27 explicitly make downward-only changes a review rule and support both
  layouts; lines 46–50 define counting, 72–101 loading/duplicate checks, 109–116 measurement.
  No base-budget comparison. Header currently guards wizard files and per-file JSON, not the
  production page. Full-build execution and local affected-gate selection are distinct.
- dependency-cruiser has runtime-only cycle rejection, allowed domain edges, and wizard import
  and template boundary restrictions. It intentionally excludes API/worker/host programs and
  allows components to reach lower domains. It does not prevent a component from accumulating
  several legitimate-looking responsibilities inside that allowance.
- `metrics:cochange` already reports wizard capability coupling. It uses non-merge commits and
  a relative `--days` window, unlike this first-parent/pinned integration report: do not compare
  their percentages as if denominators matched.
- `node scripts/check-file-budgets.mjs`: measured two files, both exactly at budget and passing.
- `node scripts/instruction-audit.mjs --json`, **without `--record`**: root 2,863 bytes,
  465 active rules, 445 prose-only; global file/memory index absent on this cloud machine,
  zero unscoped rules, no duplicated sentences found. These are audit observations, not evidence
  of what an agent actually received or a reason to add a new signal. Existing targets are not
  new policies. The first sandbox attempt hit a Git subprocess EPERM; rerun outside that
  restriction completed. No history baseline was written.
- The load probe's `run` starts a model session; it was inspected, **not run**. Its `session`
  mode can inspect existing transcripts later. No transcript or actual-load claim is made here.

## Production outcome and concurrent-work evidence

`git log --first-parent -- <production spec directory>` shows the planning landing `52fb5f047`
(#1031). The spec's Phase notes contain only the template; its review is null. Phase-1 named
`playout-air-contract`, `playout-adjust-race`, `playout-resolve-race`,
`playout-switch-mid-flight`, `production-data-key-dispatch` browser specs are absent; the planned
`playoutSession.ts`, `cueDraft.ts`, `airState.ts` are absent. Thus phase completion is not
established. Some planned responsibilities have advanced elsewhere: inspect current recovery
helpers before moving the plan's old inline folds again.

Earlier extraction #473, integration `b6440a31dc`: page 4,165 → 3,474; creates CueRundown,
PlayoutMonitors, ServerCueEditor and server playout modules. It is real progress under the older
map. New plan baseline `70fad3a94`: 5,676. Last page change `549f92b0a` (#1057): 5,699. No page
change after that on this pin. No `scripts/file-budgets.json`; two per-file wizard budgets only.

Read-only GitHub calls during this research:

- `gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,updatedAt`:
  three PRs, #1137/#1157 (configured late-send quarantine) and #1074 (E2E duration data).
- `gh pr list --state all --search 'production-page' --limit 50 ...`: corroborates #1031/#473/#1057;
  search is supplemental and capped, not proof of exhaustive phase completion.
- `gh issue view 766 --json state,updatedAt,body,comments`: OPEN, updated 2026-10-11T20:44:15Z;
  older phases 0–2 done, superseded by the fourteen-phase plan; foreign-graphic playout work
  waits on that split. Do not infer all fourteen phases from the older completed phase numbers.
- `gh issue view 805 --json state,updatedAt,body`: OPEN, updated 2026-10-13T20:26:57Z;
  broader instruction/context follow-up already tracked there.

Wizard S8 and AI A5 receipts are committed; their measurements/phase notes remain with their
owners. Wizard S9 is not joining the run: its existing revisit is after 2–4 weeks of real work,
and only if capability changes keep touching the shell. Reuse that review instead of another cadence. The registered vMix plan was recently respecified (#1226) and shares playout areas.
No local wave record inspection can prove all other machines idle: `wave-plan-store.mjs` locates
run records outside the repository. `git worktree list` showed the starting checkout and this
research worktree only. Recheck live occupancy with the existing coordinator before future work;
no scheduler, wake task, run record, registration, issue or PR was created by this research.

## Responsibility sample (read actual diffs, not just subjects)

Reproduce each with `git diff <integration>^1 <integration> -- <path>` and inspect current owners.
This is a purposeful sample spanning reduction, capability growth and fixes, not random sampling.

| Integration / PR | Diff observation | Interpretation and limit |
|---|---|---|
| `b6440a31dc` / #473 | Page −691; UI/control modules created | Responsibility extraction with behavior-preserving intent; size delta alone does not verify behavior |
| `b936c4e6c` / #512 | Page +457, shows +229; pure `showFolders.ts` created (359 lines); checked write result introduced | New folder feature plus model/UI orchestration. Some page concentration remains; model growth includes useful cohesion and error reporting |
| `8742187f3` / #661 | Page +241; shows +33 for timed cues | Capability growth fits the existing production plan's arm-engine destination; not proof of undoing the earlier UI extraction |
| `732b5cad7` / #953 | Page +2; respect later Take after Out and separate event acceptance from marker ownership | Reliability change in existing logic; zero-growth would demand unrelated removal/extraction |
| `8976ed209` / #962 | Page +19; settle late-send notices on observed commands and keep exact failed send items | Useful recovery wiring; safe behavior cannot be judged from growth alone |
| `549f92b0a` / #1057 | Page +23, shows +9; reuse `airedAfter` in outputRecovery; record publication digest and clear it when duplicating/unpublishing | Mixed extraction/recovery and new persisted metadata, not evidence of worsening boundaries from the positive net |
| `1f7d994a0` / #1158 | Wizard +9 within allowance; prevent duplicate production creation while a Finish action is pending | Concrete useful fix permitted by headroom; does not prove a later exact ceiling friction-free |

`shows.ts` source areas: persisted shapes 46–352; personal/team read and write routing 354–449;
shared mutation envelope 626–704; cue/playout/folder mutations 730–1357; dataset operations
1360–1559; binding/profile/publication/layer operations thereafter. Imports already separate
folder, clipboard, shortcut, history and published-record responsibilities (the last is consumed
by its publishing callers, not duplicated as a second model write path). Type-only imports into
pure helpers avoid runtime cycles. Any future split must preserve the write owner, old format
reads, account/tombstone checks and durable acknowledgments; no such code change is made here.

18 of the 22 shows integrations co-change the page. This flags a review surface, not 18 proven
avoidable edits. Current `show-folders`, `rundown-history` and `published-record` Node tests and
relevant configured/browser journeys provide existing proof locations; their presence is not a
claim that this research reran or passed those product flows.

## Budget replay and counterfactual

For each of the 743 chronological first-parent trees, use
`git ls-tree -r --name-only <sha> scripts/file-budgets scripts/file-budgets.json`, read all JSON
blobs at **that sha**, expand singleton/array entries, then count the target blob at the same sha.
A target absent or longer than its contemporaneous budget fails the replay. Before the first
budget there is no budget observation, not a pass. No historical scripts execute.

73 trees have budgets, starting `1114685c1` (2026-10-13). All existing target checks pass; zero
missing targets. `measurements.json` records every budget/size transition. Across renames, follow
the budget's target: AiStep stays 1,659 when its path changes, so it is not a new allowance.
No budget increases observed. CreationWizard's six positive transitions before S2 use 31 lines
of initial headroom (2,485 → 2,516 of 2,601). AiStep A2 shrinks 2,152 → 1,940 while its allowance
stays 2,152 until A3. The review convention does not mechanically force each intermediate reduction.

Independent-change counterfactual: for each selected path's changed integration, compare its
post-tree size to its actual first parent's size (equivalently numstat additions > deletions).
Page: 63 positive, 2 neutral, 5 negative of 70; shows: 21/1/0 of 22; wizard shell: 20/5/8 of 33.
This is **not** the existing budget policy and does not simulate a diverging rejected history.
It measures potential interruptions under a hypothetical no-growth rule. Actual urgent-fix delay,
rejected PRs, engineer adaptation, architectural quality and regression safety are unknown.

The observation supports rejecting new zero-headroom enforcement; it does not justify removing
the existing budgets. Owner subsequently chose “Keep existing budgets pending evidence.”

## Final freshness observation (separate from the measurement baseline)

The final `review-request.mjs --json` refresh observed main
`cffd46b0c99b061ecd1dc98b1f1dc23422f3d312` (#1245), adding only the wizard spec and digest
update. Its new S8 independent-check note reports PASS on the original research pin `50ce0911d`
and says S8 is the last listed phase. This is corroborating checker evidence, not a new measurement
window or a claim that this researcher repeated its product checks. No production-page, model,
budget or product file changed between these two revisions. Owner-selected measurement pin stays
unchanged; refresh again before eventual execution.
