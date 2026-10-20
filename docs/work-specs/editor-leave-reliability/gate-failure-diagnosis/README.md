# Bounded diagnosis of the two Phase 2 gate failures

2026-10-20. **BLOCKED before a demonstrated repair. No fix or landing.**
The owner approved reproducing both original failures before fixing their demonstrated
causes. This packet records the unsuccessful bounded quiz challenges and the local
configured-stack access refusal. It is evidence only, not a passing product check.

Source remains landed `5b843f32d3df48bcd10ca64ea2c957ae7b2810c1`, tree
`490bc9177c452d348c0098e93eb7af629bfea431`. Owned worktree
`/workspace/p2-gate-repair`, branch `codex/p2-gate-failures`. Main, sibling worktrees,
original receipts, assertions and all 32 group cases are preserved. No implementation
repair has been attempted for either failure.

## Audit and access

Root/scoped instructions and cloud-delegate/check/verify/queue-merge were read.
Current main is the pinned source; local queue/activity and open PRs were audited.
Both #1532/#1533 remain held with auto-merge off. Git fetch/read and Actions read
preflight pass. Runtime observations are current, running and network policy enforced.
The original saved binding remains unchanged and is not equated with this runtime.
Worker detection gives four CPUs and 16 GiB fallback machine totals, two browser
workers, five-minute small and twelve-minute broader limits; no overrides were used.

Previously denied direct status-write, external CLI review and signed CLI-log routes
were not retried. No credentials, network policy, proxy or TLS settings were changed.
The Supabase skill/current changelog and password sign-in reference were consulted.
No Supabase API, schema, authentication or sync implementation was changed.

## Quiz: original ambiguity not reproduced within the bounded challenges

The original exact-main failure remains `import-svg-behaviour.spec.ts:683:70`:
the global Reveal correct role locator matched both `verb-next` and `cue-action-judge`.
Source review confirms the named Next can legitimately carry the action's label,
but that alone is not a fresh reproduction of the original failing moment.

All jobs used the original case, zero retries and cap 5 through the existing queue.
Original behavioral assertions and timeouts were unchanged in each temporary probe.

| Job | Challenge | Observed result |
| --- | --- | --- |
| j-0007 | Unchanged original first-option case | 1 passed, 11.3 s wall. Not a failure reproduction. |
| j-0008 | Observe named Next after Select answer | A new diagnostic observation at line 681 fails: actual label is last step, not Reveal correct. This is not the original line-683 failure and is ineffective. |
| j-0009 | Observe named Next before Select answer | 1 passed, 8.5 s wall. Original ambiguity not reproduced. |
| j-0010 | Hold subsequent preview-state messages after observing real named Next | 1 passed, 7.9 s wall; diagnostic sees only cue-action-judge at the original query. Ineffective. |

Whole logs: [unchanged](quiz-unchanged-first-run.txt),
[first ineffective observer](quiz-ineffective-observer.txt),
[earlier-state observer](quiz-earlier-state-observer.txt),
[ineffective state challenge](quiz-stale-state-challenge.txt).
Three scheduling challenges supplied no matching original failure. No further browser
challenge or speculative targeting repair was made. The verify workflow says:
“After three attempts on the same failure, stop and report what you tried.”
All temporary probe changes were restored byte-for-byte before this packet was written.

## Shared-lab: original artifact shows boot failure; local reproduction blocked

The original configured report's retry-0 error context is not an authentication
error screen. It shows the plain-DOM boot failure:

> Failed to fetch dynamically imported module: http://127.0.0.1:5175/src/App.tsx

[Original boot context](original-shared-lab-boot-context.txt). The assertion still
fails at `_helpers.ts:112:46`, caller `shared-lab-computer.spec.ts:158:9`, waiting
20,000 ms for `.auth-status`. Account-library binding deliberately reloads the page;
`main.tsx` renders this diagnostic when boot's App import rejects. This establishes
what was on screen, not the underlying reason the module fetch failed. The original
failed attempt has no trace; the retained trace belongs to its passing retry.

It is therefore not established that credentials, authentication or synchronization
caused the failure. No such code was changed. Nor is a test-setup-only cause established.

The managed local Docker daemon is available. There were no running containers before
setup. The repository's exact pinned CLI 2.111.0 was used to request the same local
stack as Actions, excluding only studio and edge-runtime. The configured proxy refused
`https://public.ecr.aws/v2/` with Forbidden. [Refusal](registry-refusal.txt).
The one launcher emitted internal repeated pull errors; it was stopped once the
destination refusal was identified. It was not restarted. No containers remain running.
The original shared-lab browser case consequently did not execute locally, and no
reproduction or repaired auth/sync behavior is claimed. Hosted credentials were not
substituted and no account data was written.

## Preserved state and continuation boundary

[Integrity/source/job facts](facts.json) prove the quiz spec, shared-lab spec/helper,
all 32 group cases, both Playwright configurations and quarantine file match the
landed source exactly. All original failures and later passing retries remain as
recorded in the [independent FAIL receipt](https://github.com/NoaCG/NoaCG-Studio/blob/6e8e88f4013d1134b40e680b7bb3c6e1894a571f/docs/work-specs/editor-leave-reliability/reservation-recovery/independent-bounded/README.md).

No product/test/workflow change, extra retry, quarantine workaround, status stamp,
new PR or main landing follows this packet. Documentation integrity checks validate
the packet only, not a repaired gate. Further reproduction needs a scope decision
and a supported configured execution path; neither an allowlist bypass nor another
blind repetition is authorized by these results. Local acceptance remains held.

Step 6 is COMPLETE and its approved release remains effective. #1466 is CLOSED
through #1528; #1498 remains unresolved. Existing deferrals remain unresolved,
never passed. No historical campaign restart or Phase 3.

## Packet verification

Inline evidence review/simplification covered source identity, each actual diagnostic
result, the original boot context, restored bytes, network refusal and boundaries.
The five reached documentation gates passed; [whole check log](evidence-gates.txt).
JSON parsing, relative links and authored README whitespace passed. These are
receipt checks only. No product PASS stamp is issued and no repair is queued.
The complete staged diff has two trailing-space warnings solely in the preserved
ineffective-probe raw log; these captured bytes were retained, not called a clean
whole-diff whitespace result.
