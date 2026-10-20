# Quiz action targeting repair

The broad Reveal correct locator matched both the quiz's direct action and the named
Next verb. The test now selects the direct action by its exact accessible name.
All six occurrences in this maintained journey use the same targeting. Every
behavioral assertion, test case and timeout is retained; product code is unchanged.

## Demonstrated failure and challenge

Revised bounded investigation authorized by the owner on 2026-10-20. Starting source
ca8a3fe0132782daf931fb4aa2718ad061230a56; the relevant original spec and production
component match the original failed source 5b843f32d3df48bcd10ca64ea2c957ae7b2810c1.

A temporary one-expression source patch held the named Next label at its real
Reveal correct value while the machine state advanced. This models the stale label
window, not a quiz behavior change. The unchanged first-option case failed at
683:70 with verb-next and cue-action-judge, matching the original failure:
[whole failure log](quiz-original-matching-failure.txt), job j-0012.
The patch was removed before changing the locator, then re-injected. The fixed
case passed with all behavioral assertions, retry zero, 8.2 seconds wall:
[whole challenge log](quiz-fixed-with-matching-fault.txt), job j-0013. The temporary
source patch was removed again. An earlier launcher j-0011 exited before npm/test
output; it supplies no test verdict and is not represented as a reproduction.

The full maintained import-svg-behaviour selection is the relevant broader check
for the final source; its command and outcome are recorded by /check and the PR.
No build is needed for locator/evidence changes; normal CI build/gates remain.

## Remaining Phase 2 boundary

This fixes quiz test targeting only. The original shared-lab failure remains
unresolved. Its unchanged journey passed once with retry zero and first-attempt
trace in isolated CI run 39399877600 at diagnostic source
614aabea1c05e77993118ad748fc1e34aaf3cdb3; this does not repair the original
App.tsx module-load failure or prove its underlying cause. No auth/sync code changes.
A disposable diagnostic workflow branch is separate from this repair.

Both #1532/#1533 stay held. All 32 group cases, retry policies, timeouts, budgets
and original failures are preserved. No quarantine workaround or whole-acceptance
claim follows. Local acceptance remains held pending clean source results and
fresh independent review. Step 6 is COMPLETE; #1466 is CLOSED via #1528; #1498 is
unresolved. All existing deferrals remain unresolved, never passed. No Phase 3.
