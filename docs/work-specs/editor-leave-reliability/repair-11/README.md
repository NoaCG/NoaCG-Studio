# Saved-copy arrival timeout repair

The tenth independent check on `1ac6093a` found that Save could manufacture unsaved work.
A sync pass had already saved the losing device's source into its own conflicted copy and
linked the draft to it cleanly. Another tab heard that link before its library mirror adopted
the record. Save waited ten seconds, treated the missing mirror entry as deletion, unlinked the
clean draft and asked for a name. After cancelling naming, Home asked about work already saved.
The winner and the copy remained intact; reload restored the durable clean link.

The coordinator recorded the owner's authorisation and this repair launch in the run ledger
before starting the builder. The canonical carry is
[#1478's handoff](https://github.com/NoaCG/NoaCG-Studio/pull/1478#issuecomment-6249947829).
This is one repair of Phase 2. Phase 3 and the next independent check remain separate.

## Disposition and compatibility

A Save that starts clean and waits for a known conflicted copy must fail retryably if the
copy remains unreadable at the existing ten-second bound. It keeps the live copy id and dirty
flag. No record, link or source is written by that refusal. Later Save retries the same copy;
it never targets the remote winner. An edit made during the wait remains unsaved and retains
its source and history. The existing per-id wait loop also follows a second conflict to its
new copy before deciding whether that copy timed out.

The maintained matrix's `save-timeout` case starts with an edit **before** Save. Its existing
naming/null-link fallback remains unchanged. The new disposition addresses the clean-at-start
case that manufactured unsaved work and the edits made during that clean-started wait.
This distinction preserves every existing maintained and carried test byte-identically; no
assertion, skip, gate, retry, budget or carried recipe is changed. The additional focused
regression file is separate because the owner's explicit unchanged-test instruction overrides
the usual preference to extend the maintained journey file.

The reference editors have no counterpart to cross-device conflict-copy arrival. This repair
makes no usability or reference-parity claim; the NoaCG save/link contract is the direct oracle.
Pinned lifecycle and cumulative interaction tasks remain regression evidence.

## Verification

The executing worker reports four CPUs, 16 GiB machine memory and two browser workers.
Cgroup ancestor readings are unavailable, so those are machine totals, not observed container
limits. All browser work uses the existing queue; full carried scopes run in Actions.
No local production build is needed: this changes save-state logic, with no dependency,
entrypoint, bundle or packaging change. PR and merge-group builds remain authoritative.

| Check | Evidence |
| --- | --- |
| Real baseline reproduction, source `3d218870c` | Queue `j-0003`, new unedited case, **failed** in 18.5 s: status waited as Saving then became Not saved, and naming opened. The screenshot was opened and inspected. |
| New focused cases | Queue `j-0005`, `npm run test:e2e -- e2e/save-copy-arrival.spec.ts --retries=0`, **3 passed** in 44.0 s with two workers. Real waits: unedited 10,385 ms; edited during wait 10,282 ms; chained copies 20,462 ms. |
| Clean timeout and retry | Copy id retained, dirty false, Save failed, no naming. Home asks nothing while the copy is still unreadable. Native hash navigation returns to the same live draft without reloading/adopting the held copy. After adoption, Save retries into that copy; two records, winner byte-equal. |
| Edit during wait | The real rectangle edit stays dirty with its source and link intact. Home asks, Cancel keeps the source, adoption/retry saves into the copy. No duplicate; winner byte-equal. |
| Chained timeout | A second supersession changes copy A to B. Each distinct missing id waits once, then B remains linked clean on refusal. Adoption/retry writes B; three records and winner byte-equal. |
| Completed saves and reload | All three cases pass Open without a question, then reload and New without an unsaved question; the durable clean link names the copy. |
| Static checks | Direct ESLint entrypoint on the changed source and new spec; direct TypeScript `tsc --noEmit -p tsconfig.json`; both pass. `git diff --check` passes. |

The new cases use no clock injection, no replaced timer and no increased existing budget.
Holding only `noacg-durable-writes` announcements isolates the mirror lag while actual IndexedDB
and the sync conflict path run. The baseline failure and repaired pass test the refusal guard's
negative destination assertion: no naming operation may start on the clean timeout.
All three timeout screenshots were opened; the editor remains visible with Save failed, and
the added rectangle remains selected in the edited case. Ignored retained copies are under
`.noacg/repair-11/timeout-*.png` in the builder worktree.

Failed/incomplete setup is not a product verdict: local `j-0001` and `j-0002` exited before any
Playwright output because this subagent sandbox rejects Node subprocess creation (`EPERM`).
The coordinator's granted runner executes the same queue normally. A local gates attempt was
stopped while its `git check-ignore --stdin` child was blocked by the same execution context;
it is incomplete, not a pass. Direct node entrypoints avoid subprocess ambiguity for static
checks. `j-0004` passed the clean and edited cases but failed the new chain fixture: the
first-Save builder renamed `template.name`, so the link correctly became dirty. The fixture now
matches sync's actual copy semantics (record name changes, saved template stays byte-identical),
with an added clean checkpoint. No existing test or assertion was changed; `j-0005` is the
subsequent complete result. The optional broader local matrix admission `j-0006` likewise
ended before test output after the granted runner idled out and the restricted context spawned
its replacement. It was not retried around the consumed admission; the unchanged matrix's
49/49 Actions result below is authoritative.

## Carried evidence and landing

The disposable baseline probe `codex/probe-editor-p2-repair-11-baseline-ci` at
`2e6a5c5dd7b457fadb0ac28e4919ceb26bcd74fa` retains main's product source byte-identically,
the new regression before the chain-fixture correction, and all 21 carried paths. It is never
queued. The carried path list is `git diff --name-only origin/main...9bef784b73fa979d24fe254da1dbc156cb7ba342`,
not a two-tip reversion; every carried path compares byte-identical to that ninth probe.
The tenth probe `9459323e2b84841fbdea911ea7860811a3ff55e5` remains unchanged.

The final disposable probe `codex/probe-editor-p2-repair-11-ci` is
[`444b58b3b098c58ea8eb336fbb7c5cffcd7c6bbd`](https://github.com/NoaCG/NoaCG-Studio/commit/444b58b3b098c58ea8eb336fbb7c5cffcd7c6bbd),
based on repair source `51a3c2c21d77515ed986dd71e3241709407990ef` plus only the same 21 carried
paths. Every path compares byte-identical to `9bef784b`; the probe's source, maintained matrix,
helpers and new regression compare byte-identical to the repair. Both probe branches are pushed
for retrieval, have no PR and are never queued. Current main `ec9f4996` was reconciled by merge
in `aeac7636`, with no product-source or regression change relative to the tested probe.
The maintained matrix blob stays `9f7e1936b937c8b9672d010b85cb4f96d02a0e3a` on main and the repair.

The original recipes ran once each on exact probe `444b58b3`, one worker, zero retries. Job
steps and full logs were read, including every failure; the three red scope runs remain red.

| Scope | Actual result | Actions run |
| --- | --- | --- |
| Original through fourth | Original 3/3, second 4/4, third 10/10, repeated :24 20/20, fourth 11/11 | [39145383370](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145383370) |
| Fourth :228 repeated | 20/20 | [39145388620](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145388620) |
| Fifth | **Failure:** 17 passed, B1 and F-hold/F-late timed out; separate bounded B1 1/1 | [39145394517](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145394517) |
| Sixth | 10/10, including S6 double refusal | [39145400331](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145400331) |
| Seventh | 16/16, including H two-tab reservation ownership | [39145406246](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145406246) |
| Eighth | 7/7 | [39145412736](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145412736) |
| Ninth | **Failure:** same 7 assertions at :117, :158, :199 twice and :247 three times | [39145418589](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145418589) |
| Maintained | 85 passed, same 8 legacy skips; separate two-graphic export 1/1 | [39145421896](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145421896) |
| Unchanged save transaction matrix | 49/49, including save-chain, discard-chain and edited-before-Save save-timeout | [39145425439](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145425439) |
| References | 6/6, exact binary and 17 source hashes retained | [39145431438](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145431438) |
| Cumulative/native 125% | 4/4, including nested ownership and nine executable exports | [39145436808](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145436808) |
| Configured | **Failure:** signed-in 1/1, eighth X-device 1/1, ninth S-concurrent 2/2 passed; only R-departure failed at :281 | [39145443247](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39145443247) |

The red assertions retain the [tenth check's precise judgments](../independent-10/README.md#judgment-of-repair-10-and-earlier-departures).
The ninth C-pull/C-overlap/V-superseded assertions expect null links replaced by the owner's
clean-copy rule. C-pull still has the account-wide-slot qualification: reload can load the other
device's draft, whose deliberate edit/Save updates Alpha; do not claim Alpha byte-equal there
or call that this device's conflicted source overwriting it. The three V-reservations failures
remain the earlier degraded-storage duplicate limit after double refusal and an unusable/lost
reservation list. Fifth B1 still awaits the absent storage alert without a bound (the bounded
variant passes); F-hold/F-late still wait for the library row after cancelling the guarded Open.
Configured R-departure still wrongly expects pristine baseline C to ask and name; its observed
`{asked: 0, named: 0}` is the same :281 failure. No such assertion was edited or called passing.

## Reference and visual verification

Fresh executed lifecycle tasks use Studio official v0.17, binary SHA256
`9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681`, source
`3142fc7d02934494931eb14e7dc255393e4110d0` (all ten inspected files byte-identical to release
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`), and Eyevinn
`616841bd949e3a21137579451123f66c292543f0` (all seven hashes match the earlier receipts).
Save/New/Open/discard and refusal tasks preserve their recorded behavior: Studio saves an
explicit project file and separately autosaves, while Eyevinn stores templates automatically
and requires explicit deletion. Neither has this cross-device conflict-copy wait; that
absence supplies no exception to NoaCG's own saved-copy acceptance rule.

The downloaded visual artifact's desktop, laptop and full native-125 captures were opened.
Authored text, artwork, selection handles, timeline and inspector remain present; the native
Fit drawing stays small and Properties requires scrolling, as the earlier qualification says.
All three metrics JSON files report no page errors or failed requests, and all nine exported
SPX/CasparCG/OGraf browser tasks execute without errors and retain the authored content.

| Task | CSS content | Canvas height | Timeline height | Inspector width |
| --- | --- | --- | --- | --- |
| Desktop | 1920 × 1080 | 534.203125 | 334.796875 | 280 |
| Laptop | 1366 × 768 | 317 | 240 | 280 |
| Actual browser 125% | 1093 × 545 (1366 × 768 outer, zoom 1.25) | 196 | 180 | 280 |

This is engineering evidence, not a new owner comfort or physical receiver qualification.

## Review and continuation

`/check` review and simplification ran inline against the four changed paths; no review or
simplification capability is exposed in this session. The review covered correctness,
replacements, edits during waits, each distinct chained id, and preserving the existing
edited-before-Save fallback. No further defect or useful simplification remained. The
`review-request.mjs` scope was confirmed by the coordinator, then reconciled to current main;
the final diff remains exactly the same four paths. The changed-gates run passed in the granted
persistent shell, including all seven reached cheap gates. Direct changed-file ESLint,
TypeScript, the focused real-time cases and full carried evidence are recorded above.

The repair PR records its exact reviewed head, final stamp, repair owner, queue admission and
landing results. A fresh independent Phase 2 check after landing remains the next step;
Phase 3 and any additional product repair are not started by this receipt.
