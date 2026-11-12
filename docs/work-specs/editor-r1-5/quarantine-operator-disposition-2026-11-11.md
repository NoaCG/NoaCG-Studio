# Operator quarantine: causal disposition

Reviewed verdict: **not caused by this editor run**. The original failure
mechanism predates E1 and the completed repeated comparison has no observed
landing increase. This is not proof of equal population failure rates. A fresh
independent final causal review at5baae0e97 returned AGREE/A after independently
recounting all33records, qualifying the original11completionrecords, checking
the source mechanism and censoring sensitivity. This settles the operator
causal gate. E3 is historical; no E4 had been launched during the investigation.

## Original failure and quarantine

Configured run42945843116/job130278438628 ran29 cases with one worker. The file's
first test passed. Its old-control-link test failed at164 with
`page.evaluate: Execution context was destroyed, most likely because of a navigation`,
then passed on the configured inline retry. The overall workflow was successful;
that retry does not establish causality or correction. Quarantine PR2370, branch
d3777803 and merge6bbe6c1f, moved the file into quarantine after E1.

Exact comparison: E1 landing8c9f2684bc419242f79f4d36e5f61fe7e5e41d1f and its first
parenta3f3e13caacb7bc8cbe4f00f8ffd5d694e489a44. The diagnostic uses one worker and
zero retries, without changing the historical source/spec/lock, tests, assertions,
backend guards, timeouts or queue cap.

## Prewritten counts and all retained observations

The initial60 whole-spec invocations per commit and rationale were committed
before any measurements in ea2a9edb; the CI route was committed in b1161ff87.
At60, parent0/60 versus landing3/60 remained unresolved. The extension was
prewritten in b2bd1becc before its tests:300 per commit gives87.60% planning power
for a one-sided fixed-N comparison of1% versus5%, and a95.1% chance of observing
at least one failure at a1% baseline. Because extension followed initial results,
report it as adaptive descriptive evidence, not an unadjusted confirmatory test.

All32 primary native runs were read by43092554609/job130773078854 at0c16ec82d.
Before completion:

| Cohort | Parent failures/invocations | E1 failures/invocations |
| --- | ---: | ---: |
| 1 | 0/60 | 3/60 |
| 2 | 5/60 | 3/60 |
| 3 | 1/60 | 0/60 |
| 4 (incomplete) | 2/55 | 1/56 |
| 5 | 0/60 | 0/60 |
| Qualified primary observations | 8/295 | 7/296 |
| New completion (separate native worker) | 0/6 | 0/5 |
| Final qualified total | **8/301 (2.66%)** | **7/301 (2.33%)** |

All15 qualified failures are the original navigation-context class:14 at the
member assertion164 and one at visitor assertion176. All eight parent failures
are at164. No other product/test failure class was observed in these invocations.
The first test of each complete invocation remains included, not selected away.

Cohort4 batch03 run43088222961/job130758108936 stopped because the diagnostic
controller read a partially written live queue journal. It retained21 qualified
passes (parent10/landing11). Its next parent41 raw report says two cases passed,
but no terminal queue result/log or guarded trial receipt exists: this attempt
remains UNKNOWN, never a qualified pass. The eight later slots were unadmitted.
Original missingness and the workflow's FAILURE remain visible.

After independent inventory/method review, the completion method was prewritten
in4da43ea59: five NEW matched pairs41–45 plus separately identified parent46.
This targets301 qualified observations per arm,300 within-worker pairs, and two
unmatched observations retained in arm rates. New native-run identities never
pair across workers or replace the original unknown slot. Source and every test
judge remain unchanged. The observer only reconciles the same admitted job
through its existing cadence/caps; it never resubmits or restarts a test.

Completion43094048053/job130778205104 at568814204 ran its test step successfully,
but its receipt-upload step failed. No outcomes are inferred from step success.
A narrow read-only guarded-log recovery method atc699a7cf6 and implementation
04ad66c1e each received fresh independent AGREE/A before reader43097924632 was
dispatched. Recovery requires all eleven exact guarded successful records,
retains/hash-checks original native log and metadata, preserves upload/overall
status and distinguishes log qualification from raw-artifact qualification.
On2026-11-12 the connected GitHub tool returned the complete original native
job log. The same Cloud environment recovered authoritative run/job/artifact
metadata through GitHub CLI. No producer or new reader workflow was dispatched.
The approved reader was imported offline with exactly four authentic saved API
responses; no Cloud identity or GITHUB_ACTIONS value was fabricated.

GitHub step metadata floors timestamps to seconds: completed_at20:21:08Z versus
last record20:21:08.3501917Z. Reader78ea5b5e3 corrects that evidence-parser boundary
using the exact Run command group and the next step at20:21:08.3652521Z. It keeps
all original qualification guards and rejects next-step records even in that
same second. Thirteen lightweight tests pass; fresh delta review AGREE/A also
independently qualified all11records and confirmed the same log hash before
recovery output was persisted.

All eleven records are successful two-case invocations: six parent and five
landing, exact seeded sequence, distinct queue identities, zero skipped/flaky/
retried/global-error cases under the immutable producer guards. These are
log-qualified observations, not reconstructed raw artifacts. Original decoded
job-log SHA256: f25e8bbbcb010a3abe38bf25890d8c4d4103a6da2ded3f9ce06825f942f3d460.
The native run/job remain FAILURE because receipt upload failed; neither is
rewritten as green. Raw completion artifacts remain unavailable.

Final totals are parent8/301 and E1landing7/301, with300 complete within-worker
pairs (eight parent-only failures, seven landing-only, zero both). The original
landing41 pass and new parent46 pass remain unmatched across workers and are
included only in arm rates. All602 qualified invocations retain both cases:1,204
case attempts. The original unknown parent41 and eight unadmitted slots remain
separate, never converted to a qualified pass.

Worst-case sensitivity for the one original unknown parent: treating it only
for sensitivity as a pass gives8/302 (2.65%), as a failure9/302 (2.98%). E1stays
7/301 (2.33%) in either case; this uncertainty does not reverse the observed
comparison. Adaptive sampling and the finite sample still prevent a claim of
exact population equality or a guarantee against every small timing effect.
The causal disposition combines these rates with the pre-existing source and
exact parent failure mechanism below. Public selected evidence, all failure
identities and the pairing/censoring summary are in
quarantine-final-operator-evidence-2026-11-12.json.

## Source and observed mechanism

The documented retirement rule, `retire-hosted-control/spec.md` C2/AC-1, replaces
an old `?control=<slug>` URL with `#/production/<id>`, including removing the old
query and showing the production or its sign-in state. At both E1 commits,
`src/components/OldControlLink.tsx:41` performs that redirect using
`window.location.replace(pathname + '#/production/...')`. Removing the search
query causes a document navigation, which destroys the old JavaScript context.

The test observes this expected navigation with
`expect.poll(() => member.evaluate(() => location.hash))` at164, and the same
pattern for the visitor at176. An evaluate call racing document replacement
throws the exact original exception rather than providing a URL sample. The
failures are thrown evaluations, not evidence that the resulting URL violates
AC-1 or that an outage is misclassified as unpublished.

Both redirect and these polling assertions were introduced in earlier
bb02ec3433 (retirement PR2362, merge78ce3f35063386fdc7217d0542e3df871fc32b8d),
before E1. The exact spec blob e5441f2354eeb8a7537b16e1110c59a439d1e5ad and redirect
blob0a61fb23984f1ae96cfbf338478ecc4a11bcfaec are unchanged across E1. E1 changes
editor authoring/runtime paths, not this redirect, routing, configured backend,
spec or Playwright settings. Unchanged code alone is not the causal argument:
the natural parent failures reproduce the exact exception and line, the
comparison includes every qualified outcome, and the documented full navigation
explains why the earlier assertion can throw.

Historical configured runs42931921379 at the E1 parent and42908271266 at the
retirement merge each passed both cases. They are retained as context, not pooled
with the repeated experiment and not proof of absence of a race.

## Quarantine disposition

The reproduced defect is a pre-existing test-observation race around the
documented full navigation, introduced by retirement PR2362 before E1. The
completed comparison supplies no evidence that E1 increased its failure rate.
No product correction or quarantine release is claimed by this investigation.
Leave quarantine and incident2371 with its existing owner `miwco`, repair due
2026-11-25. No fix or release PR is claimed. Experimental passes do not earn the
automatic20-consecutive-main-pass quarantine release.

## Retained infrastructure failures

Reader43097924632 ended with startup_failure before any job was created:
GitHub reported an unexpected internal error and automatic notification. It
retrieved zero observations and remains failed. The original completion's
receipt-upload failure, empty artifact inventory, initially unavailable logs
and original partial batch remain in the recovery record. The2026-11-12
recovery uses the original log after it became available; no failed native run,
unknown attempt, unadmitted slot or earlier result was replaced or discarded.
