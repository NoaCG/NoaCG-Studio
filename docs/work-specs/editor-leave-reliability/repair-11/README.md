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
The clean and edited timeout screenshots were opened; the editor remains visible with Save
failed, and the added rectangle remains selected in the edited case.

Failed/incomplete setup is not a product verdict: local `j-0001` and `j-0002` exited before any
Playwright output because this subagent sandbox rejects Node subprocess creation (`EPERM`).
The coordinator's granted runner executes the same queue normally. A local gates attempt was
stopped while its `git check-ignore --stdin` child was blocked by the same execution context;
it is incomplete, not a pass. Direct node entrypoints avoid subprocess ambiguity for static
checks. `j-0004` passed the clean and edited cases but failed the new chain fixture: the
first-Save builder renamed `template.name`, so the link correctly became dirty. The fixture now
matches sync's actual copy semantics (record name changes, saved template stays byte-identical),
with an added clean checkpoint. No existing test or assertion was changed; `j-0005` is the
subsequent complete result.

## Carried evidence and landing

The disposable baseline probe `codex/probe-editor-p2-repair-11-baseline-ci` at
`2e6a5c5dd7b457fadb0ac28e4919ceb26bcd74fa` retains main's product source byte-identically,
the new regression before the chain-fixture correction, and all 21 carried paths. It is never
queued. The carried path list is `git diff --name-only origin/main...9bef784b73fa979d24fe254da1dbc156cb7ba342`,
not a two-tip reversion; every carried path compares byte-identical to that ninth probe.
The tenth probe `9459323e2b84841fbdea911ea7860811a3ff55e5` remains unchanged.

Final carried Actions runs and landing results are pending. They will be recorded before
claiming the repair ready to land. No independent check or Phase 3 is claimed here.
