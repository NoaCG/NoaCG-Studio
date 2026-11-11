# Editor Cloud-first plan amendment — 2026-11-11

## Owner decision and scope

The owner requested in the current Codex chat:

> can you modify the plan-run for the editor so it can be run in the cloud and leave any local work at the very end?

This amends the unstarted remainder of `plan-editor-r1-5-2026-11-08`, issue
[#2295](https://github.com/NoaCG/NoaCG-Studio/issues/2295). It is the same run.
E1–E3 and their accepted source/environment evidence remain unchanged. Original
authority, start, target, until-complete and block-renewal grants, failures,
attempts, waits other than the superseded E4 local-only interpretation, provider,
funding, licensing and one-device restrictions remain in force.

“Local at the end” means finish all known Cloud engineering first, then perform
one final qualification stage on real devices, with real first-time users and
receiving hosts. Owner release approval follows those receipts. E7 remains an
approved release/adoption operation in Cloud/CI after that approval; it cannot
be moved before the final qualification to make scheduling look Cloud-only.

## Proposed remaining order

| Phase | Environment | Work |
| --- | --- | --- |
| E4 | Qualified Cloud browser/CLI with isolated authenticated backend | Entire existing projects, branding, independent documents, two-rundown installation, recovery and rehearsal acceptance; exported handover fixtures. No Windows-only prerequisite. |
| E5C (new) | Qualified Cloud software fixtures | Both cumulative journeys, existing regression/source/history guards, F4 performance diagnostics on the named Cloud worker and both viewports, comparable executed reference tasks, known software corrections and a ready-to-run local qualification kit. |
| E6C (new) | Qualified Cloud Linux/browser/export fixtures | Exact target bundles/font/logo, browser and available standalone renderer checks, Linux #775 reproduction or honest limits, expected outputs/operator scripts, G07 technical bundle/provenance audit and consolidated final qualification handover. |
| E5 | Existing real first-time users/moderator, desktop/laptop, actual 125% browser zoom/reference | Unchanged original E5 acceptance, consuming explicitly applicable Cloud software evidence and collecting the real human/device/performance receipts. |
| E6 | Existing named receiving systems/operator, including Linux | Unchanged original E6 real-host acceptance. |
| OW1 | Owner workflow review | Unchanged exact-candidate decision, complete engineering/local receipts and written GSAP disposition. |
| E7 | Cloud/CI | Unchanged owner-approved adoption and exact production verification. |

E5C/E6C are engineering work already within the approved R1 release goals,
scheduled before the local stage. Cloud timings are diagnostics for the recorded
Cloud machine, not a replacement for E5's named-device distributions or native
125% zoom. Browser fixtures do not become real receiving-host evidence. The
existing E5/E6/OW1/E7 criteria are not removed, retitled or relaxed.

E4 requires actual isolated persistence/auth/permissions, not only intercepted
UI responses: use the existing isolated worker/GitHub Actions stack or an existing authorized
disposable test backend. Disposable test users/productions in that isolated stack
are fixtures, not new external provider accounts. Never use production data or
transplant production credentials. If that infrastructure is unavailable, record
the concrete Cloud infrastructure dependency; do not infer Windows is required.

Gather external prerequisites early without blocking Cloud work. Stop only when
the next dependent gate actually requires missing evidence. A final local finding
may require a bounded Cloud repair and affected local recheck; preserve attempt
limits and renew candidate evidence rather than skipping the finding or restarting
accepted phases. Prepare E7 in Cloud, but perform adoption only after OW1.

## State rules before implementation (Risky)

The current admission API inserts phases but cannot authorize even an explicit
owner change to an unstarted phase's environment. A second ledger or direct
SQLite/project-digest edit would evade its guards. Extend the existing
owner-receipted `admit` transaction narrowly:

1. Existing insert-only admissions keep their shape and behavior. An optional
   `revise` array may change only `environment` and/or `dependsOn` on an existing
   phase that has never acquired any ledger event. Unknown fields refuse.
2. A revision cannot change phase ID/title/acceptance/spec/brief, delete or reorder
   an existing phase, touch a recorded/in-flight phase, or change original
   authorization, start/target/block, attempts, actor receipts or history.
3. Dependency changes may add prerequisites only: every old prerequisite remains.
   Final validation rejects duplicate/unknown/forward dependencies, duplicate
   revisions and invalid or unchanged revisions.
4. Insertions and revisions apply atomically through the current supervisor,
   existing ledger lock, current block owner and reviewed owner-decision files on
   main. A pause, cancel, unresolved prerequisite or stale authority cannot be
   bypassed by editing the kit or publishing a changed digest.
5. Record each revised phase's before/after environment/dependencies alongside
   existing inserted/moved mappings in the append-only admission event. Old phase
   event lines remain byte-identical and keep their phase numbers.
6. Checkpoint/restore retains the revised future plan and original history.
   Missing receipt, validation error or failed publication leaves no partial
   transition, dispatch or fresh allowance.

For this amendment only: revise E4's environment to qualified Cloud/isolated
backend, insert E5C then E6C after E4, and add E6C as an E5 prerequisite while
retaining its E4 prerequisite. Existing phase order and every existing acceptance
string are preserved.

A fresh Rules-first second opinion must challenge these rules before code.
Targeted tests must exercise protected past/in-flight phases, immutable fields,
dependency preservation/order, atomic refusal, normal insert compatibility and
recovery of the accepted revision. Final full review, exact-head CI/Codex,
normal merge queue and terminal actual-merge checks remain required.

## Applying to the existing run

After this receipt and revised plan land on main, use only the existing
supervisor admission operation, with this owner-decision path and the actual
main commit holding it. Reconcile all native work and original action IDs first.
Clear the obsolete E4 local-only dependency with this later owner instruction
and reviewed amendment as evidence, open a bounded active block, and admit the
future changes once. Do not register a second run, reset the deadline or mark
unperformed qualification PASS.

Update the existing kit's phase instructions, source/coverage map and heartbeat
so the next action is Cloud E4 qualification. Record any actual missing Cloud
backend separately. Local participants, named hardware/hosts, vendor response
and explicit owner release approval remain later requirements; no periodic
owner check-in or unattended recovery is implied.
