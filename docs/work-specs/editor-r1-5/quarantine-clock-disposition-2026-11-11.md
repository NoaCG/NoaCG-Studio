# Clock quarantine: proposed causal disposition

Proposed verdict for independent review: **not caused by this editor run**.
The original failure mechanism exists before E1 and E2. This does not assert that
the true population failure rates are exactly equal. Operator causality remains
unresolved, so the overall owner gate is still closed and no later phase launches.

## Original evidence and repeated comparison

Original main run43020316776, job130521736183, ran200 cases using one worker.
`15/15` is its shard number, not15 failed clock cases. One clock case failed:
line292's Snap test, in its `aThenB` precondition at140, before the Snap. B read302
seconds against a260-second upper bound. The same-SHA retry130530591862 passed24;
it is retained as historical evidence, not causal clearance or correction proof.
Quarantine PR2382 (branch2e254476, mergea314415e) and incident2371 remain intact.

The count/rationale were committed before tests in ea2a9edb and the CI route in
b1161ff87. Exact comparison: parentfb04bbd9658857318e4b954611b6dd08a4815e9d,
E2d8b18080bfacf2303a1d88e4ca1398fb263d9657. At one CI worker, fresh whole-spec
invocations and retries0, the final initial comparison has:

| Commit | Complete invocations | Failed invocations | Rate |
| --- | ---: | ---: | ---: |
| E2 first parent | 60 | 1 | 1.67% |
| E2 landing | 60 | 2 | 3.33% |

All2,880 case attempts completed: no skipped/flaky/retried or incomplete samples.
The separate Cloud stratum passed one24-case invocation per arm and is not pooled.
The complete reports and artifact hashes are in
`quarantine-initial-ci-evidence-2026-11-11.json`, read from all12 immutable clock
batches by reader43087009483/job130753925546. Failed run43081776017 contains the
parent's exact original302 signature and one landing A03:00 signature; failed
run43082449812 contains the landing's second302 signature. All arise in the same
`aThenB` helper before the individual test's subject action. The sample's one
additional landing failure is not itself proof of a rate increase or of equality.

## Actual mechanism and counterfactual

Original artifact13854769457, SHA256
`16fdbd58af457d88da17bfcfb16d2095feb568a00efbf63af5fa25ebe07199ee`,
shows B06:01, then05:21, then counting to05:02 over19.6 seconds. Reader43083982443
retrieved those22 selected trace readings. The complete first-cohort reader
independently retrieved the same original artifact.

The wire updates clock values before dispatching their state-machine event.
The first state's time-zero call can remain deferred until a GSAP tick. If it
runs after the second switch's clock update but before that switch's event,
`runSpeakerA` sees B already running while `noacgEventAt` still names the earlier
100-second-old event. `debateHold` banks B against that old instant, inflating it
to06:01. The next state's call starts B at the40-second-old instant; repaint
shows05:21 and then the exact observed05:02. The same ordering also explains the
other observed symptom: A becomes03:00 after its initial04:00 check.

A predeclared controlled probe uses the real historical catalog factory, emitted
machine, wire calculation and GSAP. One burst per each of three ordering
conditions on BOTH E2 commits gives the bad06:01/05:21 sequence only when the
first callback falls between the second wire update and event; before/after
controls give04:20. The same six probes on E1's parenta3f3e13c and landing8c9f2684
also reproduce that result. None of these controlled probes is pooled into
natural rates. Selected operations and all outcomes are retained in
`quarantine-mechanism-evidence-2026-11-11.json`.

The exact `catalog.variantById('dc01').create({})` document has identical HTML,
CSS and135,457-byte JS on all FOUR historical commits. JS SHA256:
`e103ead49e65ffa7672bdfe31abaf151b639d3625f7cef27a535b92df9459b6e`.
The clock-engine subtraction dates to5a22e66862 (2026-08-23), before this run.
E2's authored-loop interpreter is not emitted into this legacy catalog document.
The output uses `liveControl`, not the changed simulator channel; E2's new
settling hook is absent in this document, so that conditional takes its old path.
The clock wire, output command application and stage routing are unchanged by E2.
An earlier direct-design probe omitted the catalog's machine; it is explicitly
retained as inapplicable and is not used to support this disposition.

## Quarantine disposition

No product correction or release is claimed for this pre-existing defect.
Leave quarantine and incident2371 assigned to the existing owner `miwco`, repair
due2026-11-25, with this concrete mechanism and reproduction evidence. No fix or
release PR is claimed. Repair remains the incident owner's work; experimental
passes do not earn main-release passes. The operator's300-per-commit comparison
must still settle before the editor run advances.
