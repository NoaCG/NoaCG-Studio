# Continuation preflight, 2026-10-17

This is access and timing evidence for the next qualification of #1301/#805. It is not
a new delivered-wake receipt or a renewal of the completed trial. The earlier
[qualification](qualification.md), [review repairs](review-repairs.md) and
[context measurement](context.json) retain their original scope and outcomes.

## Reconciled authority and source

Read the issue bodies and latest comments for #1301/#805, including owner receipt
[6232699085](https://github.com/NoaCG/NoaCG-Studio/issues/1301#issuecomment-6232699085)
and context receipt
[6232699250](https://github.com/NoaCG/NoaCG-Studio/issues/805#issuecomment-6232699250),
`docs/research/durable-orchestration.md`, and all four Markdown receipts plus
`context.json` in this evidence directory. #1378 and #1401 are merged, with the
terminal #1401 main-workflow cancellation and passing retry/CI gate preserved.
No launch, measurement campaign or completed Claude qualification was repeated.

`node scripts/worktree-activity.mjs` reported no other work in flight. A supported
network-enabled `git fetch origin` reconciled main to
`c1e02c6e9aff6f6556c7aabdd3560193fd4a3a78`. Work is isolated on
`codex/native-recovery-next` in `/workspace/noacg-native-recovery-next`.
The previous checkout was `da4dd67ab`; the native guards, context reader, research
document and this spec's existing evidence have no changes between those revisions.
No wave, phase, PR owner or run-wake file was changed or adopted.

## Old trial remains terminal

A fresh supported `automations.peek` read during this continuation confirmed:

- Automation `6ad345b6664c8191b783f603378f134b` still targets original thread
  `01a14608-30d3-7654-9c71-4d57555c505d`.
- `is_enabled=false`, `next_run_time=null`.
- `last_run_time=2026-10-17T10:58:10.553853+00:00` and
  `updated_at=2026-10-17T10:58:33.276341+00:00`, matching the final disable receipt.

No update/create/run-now was called. The old 11:15Z end remains expired. The two
recorded deliveries remain the completed trial; there is no third delivery claim.

## Current supported access

At executor time **18:20:55.219793Z**, reading only the named nonsecret runtime
selectors established current `CODEX_THREAD_ID=01a14b17-0a3f-726d-8c49-5dcd4f20d077`
and `CODEX_HOME=/run/codex-environment/codex-home`. This is a different thread from the old trial. Runtime status identifies current environment
`ccarenv_b64_Y2NhcmVudl9iY2I3OGE0NWY5ZjQ4MTkxYjVkOGIyNzdmMmFiMDM4Mw`;
it does not prove the owner's separately preserved CLI environment mapping.

The current callable inventory exposes hosted `automations.create/update/peek`
and the GitHub read tools used above. It exposes no Codex native child-create,
session-state/approval read, native follow-up, or usage-read interface. The selected
CODEX_HOME has neither `sessions` nor `archived_sessions`; `/workspace/.codex` is
empty. This establishes absence at these inspected locations, not absence of
provider-held history. No credential files or values were read.

The runtime status reported current observations but HTTP policy state and credential
readiness as unknown. The ordinary sandboxed fetch failed to connect to the configured
proxy; the same fetch with supported per-command network permission succeeded. That is
a command-access observation, not native permission-policy read-back or continuation
through an owner approval wait. The known cloud CLI denial was not retried.

## Timing already measurable

[timing-reconciliation.json](timing-reconciliation.json) calculates differences from
the existing qualification timestamps. The accepted next due time was **41.611 seconds
later** than first executor observation plus 60 minutes. The second provider fire was
**144.553853 seconds after** its requested due time; the first resumed executor
observation was **150.249 seconds after** it. The later delivery bookkeeping write
was **166.418 seconds after** due. The two first executor observations are **3791.860
seconds apart**; the later bookkeeping write is **3808.029 seconds after** the first
observation. The distinction was corrected during landing review of #1415, using
the already recorded timestamps in `qualification.md`. These are arithmetic over
the historical receipt, not a new timing
trial or a cross-clock latency guarantee. They establish why exact cadence cannot be
credited from the previous relative update.

## Next probe and access gates

A fresh 90-minute timing-only trial was proposed to the owner in this continuation,
starting on an affirmative reply. Its authorization is pending; no start/deadline or
new automation has been assigned. The initial request to continue this work is not
used to revive the old window. Existing provider schedulers remain the selected path;
no hosting, account, credentials or infrastructure has been provisioned.

If authorized, bind a new disposable intent and probe to this current native thread,
environment, worktree and fresh absolute end. The first real delivery records its UTC
executor arrival before other work. Compute its next requested due as that timestamp
plus exactly 3,600 seconds. Make one absolute-time update to the same new one-shot and
compare returned DTSTART to that target. A rejection or changed target is failed exact
re-arm evidence: preserve it, disable the probe, and do not substitute a relative hour
from a later update. Acknowledgement alone never establishes second delivery. Record
provider fire, executor arrival and each difference separately; stop after delivery two
or at terminal/expired state, with no third re-arm or extension. Do not add a separate
recovery owner. Unknown effective policy remains unknown; harmless file access does
not qualify permission equivalence.

For an uncertain scheduler update, retain the intent, exact task ID and request hash;
inspect that same ID without replaying it. Native child-launch/follow-up uncertainty
still needs its own supported interface. Do not manufacture a lost acknowledgement by
discarding a known successful response or call a fixture a genuine transport failure.
No actual uncertain delivery has occurred in this preflight.

Permission continuation requires supported inspection of the exact native policy,
pending approval/turn and the resumed action after its authorized resolution. The
current surface cannot supply those receipts. Context accounting requires explicit
native rollout/export files for this same owner with a pre-window cumulative baseline,
or a supported equivalent usage read. Reuse `native-recovery-context.mjs` when these
are available; native input/cache/output and loaded instruction/tool totals remain
unavailable now. A timing probe may measure its exact prompt and bytes of explicitly
retrieved recovery files, but those bytes do not establish total loaded model context,
tokens or savings. Keep unavailable counters null and leave #805 open.

External-state reconstruction and remote owner/phase/launch fencing remain open.
Any new hosting or access arrangement requires the owner's decision before provisioning.

## Preflight verification

Review and simplification ran inline over exactly these two new evidence files against
base `c1e02c6e9aff6f6556c7aabdd3560193fd4a3a78`, as printed by
`node scripts/review-request.mjs --json`. Review corrected the count of prior Markdown
receipts and removed an unsupported comparison with the previous managed environment.
No code or provider behavior changed. Simplification reused the existing guards and
usage reader; no new helper or scheduler was needed.

An independent Python datetime calculation verified the six initial JSON timing differences.
Landing review corrected the second arrival label and independently recalculated
all eight differences, retaining the later bookkeeping timestamp separately.
The five changed-path gates passed with supported per-command network permission, and
`git diff --check` passed. The first default-sandbox gate command stalled in a Git child;
only that command tree was stopped before the unchanged supported-permission rerun.
No production build, browser suite or new unit tests were needed for historical evidence.
The actual native permission, uncertain-delivery, timing and context probes remain open.
