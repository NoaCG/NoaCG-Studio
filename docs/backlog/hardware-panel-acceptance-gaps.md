# Close the hardware panel criteria the convergence review left unverified

**Filed:** 2026-10-03. **Source:** the convergence review of
[`docs/work-specs/hardware-panel-control/`](../work-specs/hardware-panel-control/spec.md), recorded
in its `work.json` with the receipt `evidence/convergence-review-2026-10-03.md`.

## Why

The review passed what a run has shown and left open what only rests on reasoning or unit tests.
Companion and Stream Deck are a live-show path: a verb that has never been pressed through the
relay, or a latency nobody measured on a hosted backend, is what fails in front of an audience.
AC-11 is tracked separately in `hardware-panel-operator-docs.md`.

## What it would take

- **AC-3, the verbs never pressed through the relay.** `retake`, `update`, `next` and `select-prev`
  have run through a relayed press on neither page (`take`, `take-cue`, `select-cue`,
  `select-next`, `out`, `all-out`, `pause`, `resume` and `pause-toggle` have). Nor has a run read
  the command log to see that one relayed Take sends exactly one `control_send_seq` with the page's
  sender protocol, and the hosted page's "not on this page" refusal is only in
  `scripts/panel-feedback.test.mjs`. A few more presses in `e2e/configured/panel-page.spec.ts` and
  `panel-production-page.spec.ts` (an Update needs an edited live cue, Next a multi-step graphic),
  and one read of `control_send_seq` rows after a relayed Take.
- **AC-7, a page state change to the module at p50 under 100 ms on a hosted backend.**
  `panel-production-page.spec.ts` logs the figure ("page state to the module over N states") on
  whatever backend it runs against; the 2026-10-03 run was a local stack, which says nothing about
  the cloud. `hosted-latency.yml` runs the same spec against hosted staging; one run of it, read for
  that line, closes this.
- **AC-10, the command log.** Nothing shows a client holding only a panel key refused at the
  command log's write path; it rests on the key never learning the control slug. One configured
  call of the write RPC from the module's anonymous client, with the key where the slug would go
  and with no slug, both refused.

## Evidence

- `docs/work-specs/hardware-panel-control/evidence/convergence-review-2026-10-03.md`: the verdict per
  criterion and what each rests on.
- `node scripts/work-spec.mjs status docs/work-specs/hardware-panel-control/work.json` lists the open
  criteria.
