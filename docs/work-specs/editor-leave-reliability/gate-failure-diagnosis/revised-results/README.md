# Revised bounded shared-lab diagnosis: original cause unresolved

All three authorized diagnostic attempts are terminal; no further challenge is running.
No authentication/sync repair is demonstrated, and none is made. Local acceptance stays held.

| Attempt | Exact diagnostic source | Run | Result |
| --- | --- | --- | --- |
| 1 unchanged journey + observation | 614aabea1c05e77993118ad748fc1e34aaf3cdb3 | [39399877600](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39399877600) | 1 pass, retry 0, skip 0, 35.0 s wall. Entire account-isolation journey ran. Not a repair of the original failure. |
| 2 module interruption at earlier sign-in | 365a2c53807e1d12a9d7232c1a5cc599f1abad32 | [39400541069](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39400541069) | 1 expected diagnostic failure, retry 0. Helper 112:46 matched, caller 146 did not; this was not the exact original reproduction. |
| 3 module interruption at original fresh-profile caller | acdc745232cae25d5e9c8c06fa4c06fed98bb090 | [39401062955](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39401062955) | 1 expected diagnostic failure, retry 0. Helper 112:46 and caller 158:9 match the original. Authentication returned HTTP 200 before the deliberately aborted App.tsx reload request. |

[Whole error context](matching-fault-error-context.txt),
[diagnostic log excerpt](matching-fault-log-excerpt.txt),
[report statistics, actual attempts and ZIP hashes](reports.json). First-attempt traces remain
in each run's phase2-shared-lab-first-attempt artifact (14-day retention). They use the
runner's disposable local stack and accounts, never hosted credentials or production data.

The exact challenge reproduces the original boot screen and missing .auth-status assertion
after successful authentication. It proves that a boot module delivery failure is sufficient
to produce this symptom, not that authentication failed. The original failing attempt has
no trace, so its actual request failure reason remains unknown. Neither a test-setup-only
cause nor an application defect is established for that original attempt. A passing baseline
and an injected failure cannot establish a demonstrated original cause. No speculative auth,
sync, bootstrap or retry change follows.

The temporary workflow and source/spec diagnostics are restored byte-for-byte to the
starting ca8a3fe0132782daf931fb4aa2718ad061230a56 source. [Integrity](restored-integrity.json).
The disposable diagnostic branch is not a merge candidate and carries no passing stamp.
The separate demonstrated quiz targeting repair is PR #1537 at
5bb8f3fe5517a81eb0b9d5b70b2646d4ae14cf35; its original signature was fault-injected before
repair, and all 38 maintained cases pass retry 0 on its submitted source. Its normal gates
and exact-merge results are recorded on the PR, not inferred here.

All assertions, 32 group cases, timeouts, budgets, retry policies, quarantine and original
failures are retained. #1532/#1533 stay held. Step 6 is COMPLETE and its release effective.
#1466 is CLOSED through #1528; #1498 unresolved. Existing deferrals remain unresolved,
never passed. No Phase 3 or whole-acceptance claim.
