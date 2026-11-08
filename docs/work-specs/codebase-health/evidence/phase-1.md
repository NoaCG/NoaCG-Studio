# Phase 1: Production ownership and handoff

**Source pin** `862fbcb20d1b6280d172fa390e93560d113c4355` (main, 2026-11-08).
The [ownership map](../spec.md#ownership-at-the-phase-1-pin) is the current baseline.
The October [research](research.md) and [measurements](measurements.json) retain their own pin.

## Production handoff

The [November 6 owner closeout](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6686105172)
supersedes the October 28 checkpoint even though the tracking issue is open. It records 50
independently checked cloud phases and the owner's physical deck and studio walks for H0.2 and S.
The owner closed on those receipts. The formal ledger entries for phases 51 and 52 and E8 AC-1's
final evidence reconciliation were left unwritten. The real CasparCG restart failed in that walk.
[#2247](https://github.com/NoaCG/NoaCG-Studio/pull/2247) later landed the software fix for
[#2245](https://github.com/NoaCG/NoaCG-Studio/issues/2245). The software landing leaves the dated
studio result as recorded. Phase 1 uses the closeout as evidence and assigns no production work.

The baseline refactor already reached its [software closeout](../../production-page-refactor/evidence/phase-notes.md#row-25-phase-14-baseline-close-out-in-software).
Its original tracking issue [#766](https://github.com/NoaCG/NoaCG-Studio/issues/766) is closed.
The ownership map follows that refactor and its later changes at the pin. In particular:

- [#1057](https://github.com/NoaCG/NoaCG-Studio/pull/1057) landed the content-based publish
  digest in `src/model/publishedRecord.ts`. `src/control/hostedControl.ts` uses it when building
  the published record and `src/components/home/usePublishDrift.ts` uses it for drift. The
  general authored record mutators still enter through `src/model/shows.ts`.
- #1057 added `monitorReplay` to `src/control/outputRecovery.ts`. `hostedControl.ts` wraps it in
  `bootMonitorReplay`, which the hosted page calls directly and `sessionWire.ts` calls through
  injected I/O. The refactor put the production-page recovery and on-air folds in
  `src/control/airState.ts`. It and the hosted page also import lower-level recovery helpers.
  The hosted page retains its local marker. The separate hosted adoption is planned in production
  spec section 1.1 and AC-13.
- The page creates its session by production ID and keeps `selectedCueId`. The session holds
  `liveCue` and the folds in `airState.ts` write it. Publish, rundown authoring, graphic verbs,
  server verbs, Bridge status, production data, timed cues, folders and cue draft all have landed
  modules. `docs/ARCHITECTURE.md` already documents the session seam, so the detailed map lives
  with this plan.

## Owner decision and behavior protections

The October 17 authority in the [production work record](../../production-page-refactor/work.json)
and [production spec D8 and AC-11](../../production-page-refactor/spec.md#11-acceptance-criteria)
drops the page size limit and the line-count half of AC-11. It keeps the compiled rule that
directs playout behavior to `src/control/`. The rule source is
`contracts/rules/components/playout-behaviour-production-page-lands-verb.md`. The pinned
`scripts/file-budgets/` contains the existing CreationWizard and AiStep entries. The legacy
`scripts/file-budgets.json` is absent. This phase edits only the health spec, digest and receipt.

The production plan retains its unchanged characterisation assertions and command contracts
(AC-2 and AC-4), one production-page marker owner (AC-5), tested store and lifecycle (AC-6), and
per-phase scope fence (AC-8). For examples of the pinned proof locations, see
`scripts/air-state.test.mjs`, `scripts/session-wire.test.mjs`, `scripts/graphic-verbs.test.mjs`,
`scripts/playout-session.test.mjs`, `e2e/playout-air-contract.spec.ts` and
`e2e/configured/late-commit-notice.spec.ts`. This is a source and evidence comparison.

## Coordination

The three Phase 1 write paths are under `docs/work-specs/codebase-health/`. The live allocation on
[#1967](https://github.com/NoaCG/NoaCG-Studio/issues/1967) exempts documentation from the cf13
measurement hold. The cf13 PR [#2261](https://github.com/NoaCG/NoaCG-Studio/pull/2261) owns its
evidence and the configured selector and test. GitHub's open PR file lists showed no overlap with
the three Phase 1 paths. The closed production run has no shared documentation writer in flight.

## Verification

- The owned local Windows worktree started clean on the exact source pin. The execution profile
  was local, and `node scripts/cloud-network-preflight.mjs` passed Git and GitHub Actions API reads.
  The source pin's [main CI](https://github.com/NoaCG/NoaCG-Studio/actions/runs/42459437699),
  [configured suite](https://github.com/NoaCG/NoaCG-Studio/actions/runs/42459437684) and
  [post-landing checks](https://github.com/NoaCG/NoaCG-Studio/actions/runs/42459437719) passed.
- Reproduce the source comparison with `git ls-tree -r <pin> -- src contracts/rules scripts/file-budgets`
  and `git grep -n -E 'createPlayoutSession|selectedCueId|startSessionWire|createGraphicVerbs' <pin> -- src/components/home/ProductionPage.tsx`.
  Compare the `liveCue` folds in `src/control/airState.ts` with the inputs in `src/control/sessionWire.ts`,
  and the digest importers with the original #1057 merge `549f92b0afa2b3dab820268868ddd92a1f9d6c4a`.
- Compare the write list with `git diff --name-only <pin>`, `git ls-files --others --exclude-standard`
  for any unstaged new files, and the PR file allocations.
  `node scripts/work-spec.mjs status docs/work-specs/codebase-health/work.json` checks the
  digest and authority. The work record leaves acceptance to the independent check on the merge.
  The pull request carries changed-file gate results and review evidence. A local product build,
  browser run and studio walk are outside this document check.
