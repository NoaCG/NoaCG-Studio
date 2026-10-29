# Full-run opinion reconciliation, 2026-10-29

Planning-only revision of the registration from PR #1799, merge
`c6fc146b8807f629645c980d75fa53735dd0453d`. The supplied [opinion](full-run-opus-review-2026-10-29.txt)
returned AGREE WITH CORRECTIONS. This session fetched main
`571803605a6856fa8fbcddccaedca2a074e0c1ff` and revised the documents on
`codex/cicd-run-readiness`. No implementation or runtime launch is authorized.

## Findings and disposition

| Finding | Resolution and limits |
| --- | --- |
| 1: expiry | Confirmed `activeProject` excludes expired projects. Qualification: expiry does not erase history or automatically start a new project. The runbook now forbids treating `open` as authority, requires stop/report, and proposes six to eight weeks including reset margin at launch. Any later continuation needs new authorization and a reviewed remaining-work spec citing old receipts, pending identities and consumed attempts. No blanket exception to exact phases, automatic migration or retry reset is claimed. |
| 2: activation gate | Split evidence-only row 15 from reversible activation row 16. Independent row-15 PASS plus its qualified verdict is required before activation; not-qualified PASS permits only a no-activation report. Current receipts are rechecked. |
| 3: idle audit/reset | Reordered to 17 serial phases. Guidance starts the risky-row sample early; maintenance precedes fault replay, report integrity, schedule qualification and cohort work. Defined reset classes and ordinary additive-header/trace handling. Clock starts at the last actual reset, not at an arbitrary row completion. |
| 4: completion | Moved the former AC-7 requirements intact into optional prose, preserving seven initial acceptance headings. Reporting-row PASS proves accurate disposition, not target achievement. Unmet/pending criteria stay open; only current independent review plus evidence-complete convergence establishes initial success. |
| 5: continuity | Referenced production-page section 9's single-home/check-in/preflight pattern, requiring new project-specific proof. Excluded its product-only keys, device checks, old provider assumptions and prohibition on other plans. Known-date waits need a qualified authorized dated continuation or explicit owner-resume fallback; no claim of weeks of unattended capability. |
| 6: metadata/draft | Wrote all 17 exact phase objects with stable IDs, titles, predecessor dependencies, acceptance arrays and environment strings. Draft status is intentional until revised intent and execution are accepted; launch admission now explicitly requires that transition and its source. |
| C1: backend completeness | Require configured declarations, selected-case manifest and full configured escalation for shared setup/helpers/config/workflows/verdicts. The existing boolean is not a manifest. Configured header counts differ from the opinion; the measured inventory below replaces its counts, not the underlying finding. |
| C2: quarantine | Critical/affected quarantine becomes an owned incident and coverage gap under AC-4/8, blocking affected narrowing/expansion until faithful blocking protection is restored. No extra retries or weakened quarantine rules. |
| C3: daily completion | Keep the hard per-landing 24-hour target, whole-catalog midday candidate, oldest-uncovered-landing alarm and existing schedule alarm. All-design scope does not cover every nightly contract; require explicit coverage of omitted checks and measure whole-battery cost. The opinion's 9-11 minutes is not verified total cost. Cron timing and completion rates must be remeasured. |
| C4: failed schedule qualification | Row 13 can PASS an independently accurate not-qualified assessment with protection retained. Row 15 then cannot authorize narrowing. A demonstrated failed qualification need not wait 14 days merely to report failure; missing observation alone remains a wait while feasible within authority. |
| C5: unrelated reds | Owner explicitly accepted the limited exception in this chat on 2026-10-29. Require independent pre-existing/unrelated attribution and issue, all required runs completed, no merge-gate bypass, and no exception for failures in changed checks/selection/shared infrastructure. |
| C6: API/identity | Cache immutable reads, cap collection passes, inspect real shared rate limits and preserve landing capacity. Schedule drills use the requested-commit/intent/run identity pattern established in dispatch isolation. No new dispatch service. |

No conditional row reordering is introduced. Row 14 records a pending/not-met disposition if a real
authorized cohort is unavailable; later cohort work needs separately reviewed authority. That keeps
the fixed phase array truthful without manufacturing work or pretending measurement succeeded.

## Direct checks against source

- Relevant runner/recovery/convergence, selector and workflow source has no diff from the registered
  revision to the fetched main for the files inspected. Product/test inventory did change.
- `readSpecHeaders` enumerates 69 configured specs at the fetched revision. Twelve have neither
  covers nor a justified none: account, analytics, audience-live, bridge-real-server,
  dashboard-hosted-walk, feedback, follow-status-is-visible, homebase, hosted-control-profile,
  hosted-reveal-after-reload, hosted-space-modes and production-links. `rg --files` also finds 69.
  The supplied count of 15/73 was not reproduced. The completeness defect remains.
- A read-only `planFor` probe returns configured=false for configured-suite.yml, and true for
  playwright.live.config.ts and a configured helper. Source confirms only a boolean is emitted;
  configured triggers are checked before the offline ignore list. Fix missing configured workflow
  triggers rather than claiming that all ignored configured paths miss the flag.
- The current schedule alarm uses a 26-hour start window. Catalog-gates supports all-design scope
  but omits nightly checks including engine-floor. Started or all-design is not completed exhaustive
  coverage. No new Actions timing sample or deployment-order experiment ran here.
- `work-spec scope` validates IDs but does not scope convergence. Optional AC-7 in active headings
  would keep the original whole-record acceptance open; removing only its heading from initial
  acceptance preserves requirements while avoiding a false pass.

## Preparation probes and limitations

Read-only Node probes imported the existing parser, authorization, admission and acceptance helpers.
They parsed 17 titles and matched the exact phase array, validated IDs/dependencies/acceptance and
environments, and confirmed paused/expired boundaries and invalid-deadline refusal. With synthetic
phases 1-14 passed, phase 16 was refused until phase 15 passed. The first empty-ledger probe expected
phase 15 to be named, but correctly got phase 1 as the first missing predecessor; the fixture was
corrected, without changing runner behavior.

The acceptance core accepts a synthetic fully evidenced review of exactly the seven initial IDs,
and leaves pending/failed criteria open. Synthetic authority and receipts exist only in memory.
This is not a real convergence review, a live activation guard qualification or future acceptance.
The actual work record remains draft, structurally valid and open on all seven criteria.

Inline review covered the six changed planning files against the fetched main. It corrected one
unnecessary wait: a demonstrated failed qualification may produce an immediate no-activation
disposition, while missing observation alone still waits. Simplification kept a single exact phase
array and the existing supervisor; no new scheduler or runtime schema was added.

Changed-file gates passed: contract freshness/citations, documentation index, client-secret and
copy checks. All 33 relative links across seven Markdown files resolve; normalized hash and
whitespace checks passed. The check stamp and registration PR hold final verdicts. No product build, browser, backend,
dispatch, supervisor, worker or wake is started locally by this preparation. Ordinary required
Actions on its documentation landing are separate validation, not CI/CD implementation.

## Decisions still belonging to launch

Full production-page final acceptance, acceptance of revised intent, actual finite deadline,
cohort workload, continuation mode and the no-orchestrator-wave scheduling constraint must be
resolved in the execution brief. No deadline or further workload is authorized now. The prior
merge-group backend skip stays explicit; deployment ordering is still unverified and a proposed
change to that policy must be decided from P0 evidence. No repeated confirmation is requested for
the already accepted daily-detection boundary, optional batching/reuse scope, or limited unrelated
failure exception. The master planning chat remains open for these later decisions.
