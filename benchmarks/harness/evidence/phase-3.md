# H3 evidence: feasibility in the container

Phase 4 of `docs/work-specs/noacg-harness/spec.md` (AC-4, section 6), built 2026-10-14 on
`origin/main` `f430c0b97`, on the bench workspace's key (`scripts/bench-env.mjs
--profile=harness` refused nothing: the bench key is not the production key).

## Before the first session

Written and committed before any session was created (5.1, 5.5).

- **Hypothesis.** A Claude Managed Agents cloud container installs the `noacg` CLI from the
  mounted tarball, finds or installs a Chromium, reaches `https://noacg.studio/bridge`, renders,
  and writes its record and frames to `/mnt/session/outputs/`; an Opus 5.5 agent reads a rendered
  frame as an image, names a planted defect from it, fixes it, re-inspects, and hands in a record
  whose digest equals the last `validate` or `coverage` digest in its trace; one real graphic on a
  v1 brief has a measurable cost, wall time, turn count, image count and largest single request.
- **Ceiling.** $10 of credit for the whole phase, by the ledger's `usage.list_cost` sum. The
  runner refuses a session whose budget plus the overshoot margin would take the phase past it.
  Planned: plumbing on Haiku 5.5 about $1 (both install paths), the defect repair on Opus 5.5 at a
  $3 session budget, the real graphic on Opus 5.5 at a $3 to $4 session budget.
- **Signal.** All four proofs of section 6 hold: (1) the CLI and a Chromium work in the container,
  doctor passes against the production bridge, the scaffold validates with screenshots, coverage
  and record land in the outputs, and the bench lists and downloads them; (2) the trace shows an
  image read, the defect named from it, a change, a new render looked at, and the delivered
  digest equal to the last reviewed one; (3) the cost, wall time, turns, image count and largest
  request of one real graphic are measured; (4) after the bench deletes the outputs and the
  session, the file list by that session id and the session fetch answer not found. If the signal
  is missing at the ceiling, the phase stops and reports; it never tops up. If a proof cannot
  work, the phase says so and recommends the fallback plan (section 9).
