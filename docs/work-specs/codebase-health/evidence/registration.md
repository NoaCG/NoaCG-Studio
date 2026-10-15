# Command preparation receipt — 2026-10-15

Owner authorization: “Can you prepare it so I can just use the `plan run` command? What should I
avoid running at the same time?” This authorizes preparing the existing command registration
for later use. It does not start a run or approve a policy exception. The initial research-only
receipt and its verification describe the earlier handoff, not this later registration change.

## Scope and observed state

- Research measurement pin remains `50ce0911d9f37f5d1116e51a1cb34541ed03aef5`.
- Preparation rebased onto current main `cffd46b0c99b061ecd1dc98b1f1dc23422f3d312`; the only
  intervening changes are the wizard S8 checker note and spec digest, already recorded in research.
- Existing `.agent-workflows/plan-run.md` says the runnable-name list is the registry. Added
  `codebase-health` → `docs/work-specs/codebase-health/spec.md` there. Claude and Codex adapters
  both read that shared workflow; no script registry, scheduler, duplicate skill or launcher added.
- The spec now has a `## Phases` list numbered 1–3, stable phase acceptance AC-6–AC-8, explicit
  allowed documentation files, start prerequisites, rollback, independent checks and Phase notes.
- `work.json` remains v2 with a matching digest and review null. Agreed authority describes this
  preparation and the conditional scope of a future bounded command; no execution state added.
- No product code, gate, existing budget or generated agent rule changed. No run/wave opened,
  worker launched, heartbeat/wake task scheduled, or implementation phase performed.

## Coordination evidence

Inspected current runnable plans and their declared files:

- `production-page`: this plan's Phase 1 edits its spec/digest; both may edit architecture.
  Recommend sequential runs, with any active production phase finished or paused first.
- `wizard-shell`: S7/S8 name architecture; S8 is checked complete, S9 has its own future revisit.
- `svg-import-engine`: capability move/close-out names architecture; serialize that phase only.
- `noacg-harness`: close-out names architecture; serialize that phase only.
- The remaining listed plans have no unconditional shared write in this plan's phase scope.
  Their actual next-phase allocation still needs checking for architecture, shared plan edits,
  or another codebase-health writer. Reading their product code at a pin is not a write conflict.
- Existing plan-run rule: a wave runs alone. Two codebase-health runs must never overlap.

This is a static collision map, not a live occupancy claim. Existing coordinator records and PR
allocations on the executing machine must be checked before starting and between phases.

## Verification

- `npm run rules --` on the registration, spec, ledger and this receipt: guidance complete.
- `node scripts/work-spec.mjs status .../work.json`: zero structural problems; open because the
  convergence review is absent. All eight criteria remain unaccepted; no phase completion claimed.
- `node scripts/work-spec.mjs scope .../work.json AC-6,AC-7,AC-8`: accepted scope, same open verdict.
- Registration lookup, three-phase/acceptance mapping, JSON digest, local links, privacy and Git
  scope reviewed inline. Original research evidence kept unchanged.
- A first shared-instructions check rejected a separate registration entry because the workflow
  already uses its 90-line allowance. Adding the name/path to its existing grouped mapping kept
  the same 90 lines; that check then passed without changing any limit. The other targeted checks
  passed. Final `npm run gates -- run --changed origin/main` passed seven checks and the existing
  shared-instructions regression file (10 tests). `git diff --check` is clean. No product build, browser suite or actual plan-run was needed to validate registration.

The exact production D8/AC-11 policy change remains an owner decision in Phase 1. Invocation with
an end time is the future authorization to perform the documentation work; readiness does not
silently approve that decision or start a window.
