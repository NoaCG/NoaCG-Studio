# Reconciliation, 2026-10-21 (production-page run, phase H0.1)

All 13 criteria re-read against the spec as it stands after this phase (the lease note, D5 with
`trigger-cue`) and against today's runs, by the H0.1 builder. The 2026-10-03 review's verdicts are
kept where nothing changed; its open items are closed or restated. Today's receipts are in
[`playout-companion-qualification/evidence/h0-1-package-guide-relay.md`](../../playout-companion-qualification/evidence/h0-1-package-guide-relay.md)
(called H0.1 below). Hosted staging run:
[39520008928](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39520008928).

## Why the record was invalid

`node scripts/work-spec.mjs status` said `spec changed`, and the 10-03 review's own receipt had
changed too: both were edited after that review (this clone's history starts at #1492, so the edit
is not named here). Since then this phase changed the spec twice more: D5 names `trigger-cue`
(migration 0077, `studio-evening-reliability`), and the owner requirement "an explicit Answer
switch, the last page wins" is marked superseded by `panel-ownership-lease` (owner decision 12 and
P1, 2026-10-08), which amends D2 and AC-6. Nothing in the owner requirements was reopened.
`protocol.md` now names `trigger-cue` in the verb rules, the stale table and `blocked`, and says the
hosted page refuses only the clip verbs (it runs All out since D11).

## Verdicts

| AC | Verdict | Rests on | Limitation |
| --- | --- | --- | --- |
| AC-1 | pass | relay test "a one-time code pairs a panel once" (local, hosted); both page walks list the panel; H0.1's guide walk: the packaged 0.1.2 module in Companion 5.1.0 paired from a typed code, code cleared, key in the secret field, listed in 2.4 s | |
| AC-2 | pass | relay revoke test (two keys); the production page's Revoke button (`panel-production-page.spec.ts`); module tests (revoked status) | "within 15 s" follows from the immediate rotation, as before |
| AC-3 | pass | H0.1's verb walk: retake, update, next, select-prev and trigger-cue now pressed through the relay, each read on the command log; one `play` per Take; `not-here` from the hosted page through the relay; the rest of D5 in both page walks and the clip walk | the one dispatch is read as one `play` row in the log, which is what the page's sender writes |
| AC-4 | pass | page walks (duplicate, stale Take, stale Out, the activity line); H0.1: a duplicate id adds no command row and no entrance | closes the 10-03 limitation: read from the command log now |
| AC-5 | pass | relay test 2; module tests; H0.1's cut-off page: a press refused `no-page` never ran on that page after it came back | |
| AC-6 | pass, as amended by the lease | lease specs: a second page never takes it, Use here moves it within the 2 s the walks wait, closing lapses and the other takes it; H0.1: hidden and cut-off pages | "the last one switched on wins" no longer applies (superseded) |
| AC-7 | pass | hosted staging run 39520008928: page state to the module p50 42 ms, worst 111 ms over 13 states (`panel-production-page.spec.ts` clip test); module fake-clock tests; the clip walk | p50 under 100 ms met on the hosted backend; that run's own `panel_press` hop was p50 137 ms |
| AC-8 | pass | `companion-end-to-end.md` (2026-10-02): p50 168 ms against 192 | the laptop helper re-measures on H0.1's merge SHA (non-gating); hosted control page only |
| AC-9 | pass | H0.1: 34 module tests, Bitfocus lint, `yarn package` 0.1.2 against base 2.0.4 with tools 3.1.1, outside the app's build; all 14 verbs as actions | |
| AC-10 | pass | relay tests 4, 1, 7 and revoke; H0.1's credential test: the key refused at `control_send`, `control_send_many`, `control_send_seq`, `control_stage`, `control_data_send`, `panel_list`, `panel_lease`, and at the `control_events` table itself; no row added; another production hears nothing | closes the 10-03 limitation: the write path is now tried, not inferred |
| AC-11 | fail | the guide (`companion/HELP.md`) is complete and walked headless in 24.8 s machine time (H0.1) | still no operator page in the app's docs ([#1560](https://github.com/NoaCG/NoaCG-Studio/issues/1560)); a person's timed walk is the laptop helper's and H0.2's |
| AC-12 | pass | `players-casparcg-obs-vmix.md` (2026-10-02) | re-run on the merge SHA is the laptop helper's (non-gating) |
| AC-13 | pass | hosted staging run 39520008928: hosted control, command sequence and every panel spec passed except this phase's first lease-test version | the PR's own CI and the configured suite after landing are the authoritative runs |
