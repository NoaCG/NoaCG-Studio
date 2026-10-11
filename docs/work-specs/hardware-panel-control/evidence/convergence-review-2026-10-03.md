# Convergence review, 2026-10-03

Reviewed at the revision `work.json` names (branch `claude/cz-hardware-panel-convergence`), against `spec.md` with D4 as the owner ruled it on
2026-10-02 (digest d3d162be...). Each criterion was judged by reading its receipts beside the spec's
wording, not by their existence: a pass needs a run that observed the behaviour. What only rests on
reasoning or on a unit test of a part is unverified. The open items are filed in
[`docs/backlog/hardware-panel-acceptance-gaps.md`](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/hardware-panel-acceptance-gaps.md) (AC-3, AC-7, AC-10) and
[issue #809](https://github.com/NoaCG/NoaCG-Studio/issues/809) (AC-11).

## Commands

- `node scripts/work-spec.mjs status docs/work-specs/hardware-panel-control/work.json` before the
  review: `invalid`, "spec changed" (the D4 edit of e64b91d22, the only change since the ledger was
  written: the earlier spec's digest is the old `specSha256`). The ledger now carries the new digest
  and names the ruling in `authority.source`.
- Jobs j-3031 and j-3034 on a fresh local stack (0001 to 0074): the three panel configured specs,
  10 of 10 each (`clip-clock-on-production-page.md`).
- GitHub Actions run 37102877270, `configured-suite.yml` on main at a7c0b414 (scheduled,
  2026-10-03 06:23 UTC): 75 passed, 0 failed, 0 flaky, 10 skipped as `expected-run.json` allows;
  among them `command-sequence.spec.ts`, `hosted-control-profile.spec.ts`,
  `hosted-control-recovery.spec.ts`, `panel-page.spec.ts`, `panel-production-page.spec.ts` and the
  seven `panel-relay.spec.ts` tests.

## Verdicts

| AC | Verdict | Rests on | Limitation |
|---|---|---|---|
| AC-1 | pass | `server-relay-on-preview-branch.md` (code once, 5 min, used, unknown and expired refused), `page-on-hosted-control.md` and `page-on-production-page.md` (both pages list the panel within 10 s, code hidden), `companion-end-to-end.md` (real module: key in the secret field, code cleared, listed within 3 s with name and last use), `ac-9-module-tests-and-companion-load.md` (refusal sentences) | |
| AC-2 | pass | `server-relay-on-preview-branch.md` test 6 (two keys: revoked refused, topic rotated, the other keeps pressing and hearing), `clip-clock-on-production-page.md` (the page's Revoke button empties the list, the key refused), module tests (revoked status) | "within 15 s" follows from the immediate rotation; not timed on a real Companion |
| AC-3 | unverified | relayed `take`, `take-cue`, `select-cue`, `select-next`, `out`, `all-out` (both page receipts), `pause`, `resume`, `pause-toggle` (`clip-clock-on-production-page.md`) | `retake`, `update`, `next`, `select-prev` never pressed through the relay; one `control_send_seq` per relayed Take never read; "not on this page" only in `scripts/panel-feedback.test.mjs` |
| AC-4 | pass | both page receipts: duplicate id answered `duplicate` and nothing re-aired, stale Take and stale Out refused, the activity feed names the panel and the reason; module tests: stale flashes the key | "never aired twice" read from the live chip, not from the command log |
| AC-5 | pass | `server-relay-on-preview-branch.md` test 2 (`no-page`, nothing relayed, a later page hears only its claim), module tests (12 s silence, refused unsent, earlier presses never run), `companion-end-to-end.md` ("No operator page" before a page answered) | |
| AC-6 | pass | relay test 5, both page walks (the first page switches off within 2 s and names the new one; the next state and press are the second page's; closing it releases the claim) | two tabs on one machine, not two machines |
| AC-7 | unverified | `companion-end-to-end.md` (on air, selected, rows in the real module's variables), module fake-clock tests (count from one message, 10 and 5 s, pause, hold), `clip-clock-on-production-page.md` (the published clip follows a server clip on the production page) | page state to the module at p50 under 100 ms measured only on a local stack (p50 3 ms), never on a hosted backend |
| AC-8 | pass | `companion-end-to-end.md`: 10 presses through a Companion key on a preview branch, p50 168 ms against 192; keyboard 115 ms in the same run | hosted control page only |
| AC-9 | pass | `ac-9-module-tests-and-companion-load.md`: tsc, Bitfocus lint, 28 fake-relay tests, `yarn package` with HELP.md and LICENSE, outside the app's build; actions for all 13 D5 verbs in `companion-module/src/actions.ts` (read 2026-10-03); presets from rows seen in `companion-end-to-end.md` | |
| AC-10 | unverified | relay test 4 (foreign verbs, malformed presses, burst of 30), test 1 (no slug or show id in answers, `panel_keys` unreadable), test 7 with its mutation (no client writes `pnp-`), revoked and wrong keys refused, the migration's self-checks | no run shows the key refused at the command log's write path; it rests on the key never learning the slug |
| AC-11 | fail | `companion-end-to-end.md` (the steps: add the connection, type the code, switch the answer on, drag a preset; HELP.md exists) | no operator page in the app's docs yet; the walk was not timed |
| AC-12 | pass | `players-casparcg-obs-vmix.md`: one relayed Take and Out each on CasparCG 2.5.0, OBS 32.2.1 and vMix 29, in each player's own capture, setups left as found | |
| AC-13 | pass | run 37102877270 above: hosted control, command sequence and the panel specs in the full configured suite on main | main's `ci.yml` is red on an unrelated factory-tier port-allocation test (issue #664); the offline playout key specs were not re-read for this review |
