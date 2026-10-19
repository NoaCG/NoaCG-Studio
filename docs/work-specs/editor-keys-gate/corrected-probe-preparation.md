# Corrected temporary probe — static preparation only

Prepared after 18:12:26 UTC on 2026-10-19. The earlier implementation window ended
18:09:36 UTC. This work has separate authorization for **static preparation and
pure stubs only**. No browser, queue run, injected fault, repair, maintained-test
edit, classification change, PR or landing occurred. No execution window is
inferred. Earlier failed probes and the passing observation remain recorded.

## Pinned failed handoff and source review

Read the complete README, unsuccessful probe and facts from external handoff
`36c2522b0bf749f1ae4312cc933b1cd8710aed27`, branch
`fix/phase2-prerequisite-gates`, source
`bf86052134d20a055246b7683433b2cae536fcb9`.
Its one probe reports events `[]`, stage error null and 1 passed. It never armed:
`AnimationProperties.tsx:44` renders `◷` as button text and assigns
`Enable Position X animation` through `aria-label`. That result establishes no
hold, original failure or repair. No corrected second browser attempt ran here.

The prepared recipe fixes that selector and makes ineffective instrumentation
fail explicitly. Source review also checked:

- The timeline's public `Playhead` slider uses pointerdown to seek
  (`Timeline.tsx:298`); the capture listener schedules release after that handler.
- `PreviewController` installs its listener in its constructor. The proposed init
  script is self-contained, top-document only, installed before `setup` navigates
  to the application. It uses the same listener phase as the controller, with
  earlier registration. Actual runtime ordering must still be witnessed.
- Envelope acceptance names iframe identity, document, generation, request and
  source/assets revision. Holds require those fields, selected #nested, current
  part revision and a pending receipt with an earlier consumed id in the same
  generation. Stale envelopes are refused again immediately before replay.
- Replay uses the retained actual data/source/origin. It does not change a reply
  body or create a fabricated successful acknowledgement.
- Snapshot recording clones the data. The raw consumed acknowledgement's selected
  part appearance is recorded at canvas pointerdown. DOM cue `arriving` is kept
  literal, separately from null-normalized session/reply cues.

Relevant source and the maintained spec compare byte-equal between this worktree
base `9ecdb199fe9a67552f93de7f3dba74e484d1b96b` and the external source above.
No new deep-link investigation is included; its supplied candidates stay unproved.

## Exact prepared files

- [Self-contained serialized init function](prepared-probe-init.js.txt).
- [Temporary Playwright adapter](prepared-probe-adapter.ts.txt).
- [Minimal disposable spec diff](prepared-probe-spec.diff.txt).
- [Pure VM/fake-DOM checks](prepared-probe-static-check.mjs.txt) and
  [their actual output](prepared-probe-static-output.txt).
- [Hashes and static-only facts](prepared-probe-facts.json).

These are documentation artifacts, not active helpers or maintained-test changes.
If a future owner explicitly authorizes execution and a fresh window, the
reviewed preparation would be materialized in that owner's own worktree as:

```sh
cp docs/work-specs/editor-keys-gate/prepared-probe-adapter.ts.txt e2e/_phase2-keys-probe.ts
git apply docs/work-specs/editor-keys-gate/prepared-probe-spec.diff.txt
```

Neither command above has been run. `git apply --check` passed. The diff preserves
all 14 existing cases, titles, gestures and original assertions. Only the nested
SVG diagnostic adds init/connect, fail-closed preflight checks and final evidence
collection. Its healthy-path terminator throws `PROBE_NOT_REPRODUCED`, so an
uninjected/ineffective original journey cannot be reported as matching proof.
This temporary diff must not become a maintained readiness repair.

The proposed single runtime command, **not executed here**, remains:

```sh
node scripts/jobs.mjs add "npm run test:e2e -- e2e/editor-keys.spec.ts --grep 'nested SVG armed' --retries=0" --cap 5
```

No test timeout, expect budget, retry, worker selector or queue limit changes.
Preflight uses the existing default expect budget. The zero-reply hold has a
4000 ms safety release, and the current-pose hold is 1500 ms; these are temporary
fault controls, each below the controller's existing 10000 ms watch duration.
A safety release is explicitly ineffective, never evidence for a repair. A slow
run that misses the current-pose hold must fail rather than increase its budget.

## Fail-closed proof requirements

Before the original seek to one second, preflight requires installed hook,
connected diagnostics, exact aria-label arming, no recorded problems and an
actual matching zero-time pose held before controller consumption. A microtask
witness must show it is still unconsumed. Flags are named `AfterMicrotask`;
this does not claim a later event-loop turn.

Before the original selection measurement/drag, the second preflight requires
that replay really consumed that zero reply and that the actual one-second reply
is held before consumption, including its microtask witness. The latest hold
must still be active. Missing hook/snapshot, wrong frame/envelope/selection,
late registration, no held reply or expired hold fails explicitly. Empty events
or a healthy original journey cannot supply a pass.

A runtime reviewer may call the result a **matching forced failure only if all
of these are present together**:

1. Real matching old/current reply envelopes and source/frame identity, held
   before consumption, with consumed id progression old < held-zero → replayed
   zero; the one-second reply remains unconsumed at the press.
2. At the actual canvas pointerdown, raw consumed #nested appearance is time 0
   while the live session is time 1, with the same document/generation/revision
   lineage and no unrelated source/cue mismatch. Use raw acknowledgement data;
   DOM pending/request counters alone are insufficient.
3. The unchanged post-drag `ready` assertion is the one that fails: stage error
   expected 0/received 1 under its existing 7000 ms budget, with the exact
   “Wait for the preview to reach this playhead and revision before editing.”
   refusal. Line numbers may shift only by the preserved diagnostic insertion.
4. No probe problem, safety release, different failure, `PROBE_INEFFECTIVE`,
   `PROBE_NOT_REPRODUCED` or missing facts is counted as that matching result.

A generic Playwright FAILURE is not proof. Even a matching scheduled failure
would establish the challenged path, not prove uniquely that it caused the
historical runner's failure. No repair should be inferred or built until that
outcome is reviewed under a separate concrete disposition.

## Static checks and limits

The actual command run was:

```sh
node --input-type=module < docs/work-specs/editor-keys-gate/prepared-probe-static-check.mjs.txt
```

It executes only the serialized init function in a Node VM with fake DOM/event
objects and timers, without importing product code, launching a browser or using
the queue. **15 checks passed**: accessible-name arming with actual `◷` text,
wrong label/no arm/unavailable diagnostics, wrong iframe/document/generation/
revision/request/selection, wrong prior generation, late-listener ineffectiveness,
held-message/replay progression, immutable record snapshots, stale replay and
safety release. The saved output qualifies only this stub model.

The first pure-stub invocation failed its *test oracle*: it expected a late
listener to populate `problems[]`, while consumption had advanced the expected
id and correctly selected `ignored-not-current-envelope`; the held-zero flag
was false as required. The oracle was corrected to check that actual event and
false hold state. This was not a browser attempt or a fix to product behavior.
The final output retains the corrected result; no failed runtime is relabelled.

The self-contained init expression parses with `vm.Script`; TypeScript
`createSourceFile` reports zero adapter parse diagnostics. This is syntax
validation, not full semantic type checking. `git apply --check` and
`git diff --check` pass; the maintained spec SHA256 remains
`4c946a7ddd997e00a9fde680813ad7441d5b4d826f1795835f7aae2fecd45929`.
`git diff --exit-code -- src e2e` exits 0. No full build/suite or reference/native
visual task is needed or claimed for this static recipe.

Unresolved: browser registration/dispatch behavior, a real held-reply window,
actual fault effectiveness and the original root cause. No reserved product-file
change is proposed. Any such need requires its own concrete path/scope decision.

**Next owner decision:** whether to authorize one execution of this exact
prepared diagnostic in a fresh, explicitly bounded window. If authorized, first
fetch/audit current main and verify the pinned source/selector assumptions;
then execute at most that one named queue job and stop on any outcome. Remove
the temporary spec/helper afterwards, retain raw evidence and preserve every
original failure. No automatic repair, quarantine release or further attempt is
authorized by this preparation.
