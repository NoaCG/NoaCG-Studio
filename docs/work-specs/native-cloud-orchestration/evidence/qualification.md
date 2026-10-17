# Native cloud orchestration cycle: qualification record

Spec: [spec.md](../spec.md). Phase: "Execute and document one native Claude cloud orchestration
cycle". Nonce: `ncp1-build-20261017T184214Z-0b6689f7`.

## Builder receipt

Taken before any edit, from the builder's own `get_session` (no session_id) and shell.

| Field | Value |
| --- | --- |
| Native session ID | `session_01T3fnUGoEP7oc6YS9b65jj2` |
| Parent session | `session_014ka1JkcBhgjXBaoBjxwCcm` |
| Environment | `env_017nuiDZBW9smUNLdWVQK8cf` (`anthropic_cloud`) |
| Origin | `claude_code_mcp_seed` |
| Created at | 2026-10-17T18:43:21.693362Z |
| configured_model | `claude-opus-5-5` |
| session_context.model | `claude-opus-5-5` |
| external_metadata.last_served_model | `claude-opus-5-5` |
| context_usage | max_tokens 1000000, used_tokens 0 (as returned) |
| Other usage counters | null (not returned) |
| Source SHA | `f41b0418e11f1fe61204933889025b9986eb9da6` |
| HEAD | `f41b0418e11f1fe61204933889025b9986eb9da6` |
| Tree | clean (0 entries in `git status --porcelain`) |
| Branch | `claude/native-cloud-phase-1-build`, own worktree |
| UTC time | 2026-10-17T18:44:11Z |

Resource profile (`node scripts/execution-profile.mjs`, exit 0):

```json
{"kind":"cloud","provider":"claude","limits":{"effectiveCpus":4,"memoryLimitBytes":14343688192,"availableMemoryBytes":14183485440,"limitsObserved":true,"reasons":[]},"known":true,"freeMb":13526,"workers":2,"smallMinutes":5,"broaderMinutes":12,"buildMinutes":10}
```

## Identities

| Role | Session | Environment |
| --- | --- | --- |
| Coordinator | `session_014ka1JkcBhgjXBaoBjxwCcm` | `env_017nuiDZBW9smUNLdWVQK8cf` |
| Builder (this record) | `session_01T3fnUGoEP7oc6YS9b65jj2` | `env_017nuiDZBW9smUNLdWVQK8cf` |

The builder is a separate native cloud session created by the coordinator with `create_session`
(its `get_session` names the coordinator as `parent_session_id`). No same-VM subagent did this work.

## Coordinator ledger lines

Sent by the coordinator in its follow-up, verbatim, from its wave file
`.git/noacg-jobs/wave-plans/2026-10-17-plan-native-cloud-orchestration-wave-plan.local.md`
(written by `scripts/wave-plan-store.mjs` and `scripts/plan-run.mjs`):

```text
- 2026-10-17T18:42:14.776Z phase 1 build branch claude/native-cloud-phase-1-build, cloud worktree (builder's own), source f41b0418e11f1fe61204933889025b9986eb9da6, nonce ncp1-build-20261017T184214Z-0b6689f7, env env_017nuiDZBW9smUNLdWVQK8cf, native create_session pending
Builder native session: session_01T3fnUGoEP7oc6YS9b65jj2 (created 2026-10-17T18:43:21.693362Z, parent session_014ka1JkcBhgjXBaoBjxwCcm, origin claude_code_mcp_seed, revision f41b0418e11f1fe61204933889025b9986eb9da6)
Wake: trig_01QKUzLXs1NDgGnPhabxh9X9 send_later fire 2026-10-17T18:52:00Z (armed 18:43:33Z) owner session_014ka1JkcBhgjXBaoBjxwCcm
Wake receipt: trig_01QKUzLXs1NDgGnPhabxh9X9 queued 2026-10-17T18:52:51Z, read 18:53:03Z; coordinator container boot 18:52:50 (SessionStart:resume), wave file and worktree present after it
Builder turn 1 result: idle 18:44:53Z, pushed db1399793fa99fa72047d0aa1e020603450af837, READY FOR FOLLOW-UP
```

The later ledger steps (`landed`, `check`, `pass` or `fail`) are recorded by the coordinator after
landing, so they are not in this file.

Coordinator observation (reported by the coordinator, not measured here): its idle container was
replaced between 18:43Z and 18:52Z; the one-shot wake started it again with a fresh boot, and the
wave file under `.git/noacg-jobs` plus its worktree were still present. This is the idle-reclaim
scope already qualified in cloud-landing-recovery, not a full filesystem replacement.

Builder observation: this builder's container also restarted between turns (`SessionStart:resume`,
boot 2026-10-17T18:53:42Z, `get_session` `worker_epoch` 1 then 2). Its worktree
`.claude/worktrees/ncp1-build` and local branch were still present at `db13997`.

## Follow-up and answer

The coordinator's follow-up arrived through `send_message` (queued 2026-10-17T18:53:43Z, read by
the builder 18:53:54Z). It asked for a challenge reply with values read fresh, then STEP 2. Its
expected values: `SPEC_BLOB ec3272819f8b01daa48922864dded32bc0eb198b`, `ORIGIN_HEAD
db1399793fa99fa72047d0aa1e020603450af837`.

The builder's reply, sent with `send_message` (status `delivered`), values read at 18:54:02Z:

```text
NATIVE_ID session_01T3fnUGoEP7oc6YS9b65jj2
ENV env_017nuiDZBW9smUNLdWVQK8cf
HEAD db1399793fa99fa72047d0aa1e020603450af837
ORIGIN_HEAD db1399793fa99fa72047d0aa1e020603450af837
SPEC_BLOB ec3272819f8b01daa48922864dded32bc0eb198b
NONCE ncp1-build-20261017T184214Z-0b6689f7
UTC Sat Oct 17 18:54:02 UTC 2026
```

Both expected values matched.

## Usage counters

Provider-reported by `get_session`, not tokenizer measurements.

| Read by | Read at (UTC) | context_usage used / max | usage |
| --- | --- | --- | --- |
| Builder, turn 1 (running) | 18:43:58Z | 0 / 1000000 | not returned (null) |
| Coordinator | about 18:53Z | 88600 / 1000000 | cache_read 632235, cache_write 41268, input 16, output 5147, cost_usd 0.559595 |
| Builder, turn 2 start | 18:53:54Z | 88600 / 1000000 | same values as the coordinator's read |

The builder's first read showed 0 while its first turn was still running; the counters were
filled in after that turn. Fields not returned stay null.

## SHAs

| What | SHA |
| --- | --- |
| Source | `f41b0418e11f1fe61204933889025b9986eb9da6` |
| Builder push 1 (receipt) | `db1399793fa99fa72047d0aa1e020603450af837` |

Later SHAs (the reviewed tip, the merge SHA) are named in the pull request, because a file cannot
name the commit that contains it.

## Reused qualifications

Not repeated here, reused by link:

- #1305: native launch, identity, follow-up and click-free landing.
- [cloud-landing-recovery Claude runtime](../../cloud-landing-recovery/evidence/claude-runtime.md):
  Claude cloud wake receipts.
- [native-recovery qualification](../../native-recovery/evidence/qualification.md): re-arm
  receipts.

What this phase adds: one recorded phase that joins a coordinator, a separate native builder and
a separate native checker, with the coordinator's ledger, a challenge follow-up and landing
through the queue.

## Limitations

- No genuinely uncertain-delivery test: the builder's `send_message` returned `delivered`.
- No external reconstruction, no remote fencing, no native permission continuation.
- Usage counters are provider-reported; unavailable ones are null, not zero.
- Post-merge terminal results (merge SHA, the merge SHA's PR, merge-group, main CI and post-land
  conclusions) cannot be in the file that lands. They go in the coordinator's PR comment and the
  checker's receipt.

## Verification

Run by the builder on the reviewed source state (docs only; `origin/main`
`c1e02c6e9aff6f6556c7aabdd3560193fd4a3a78` already contained, nothing to merge):

- Review: inline (the diff is three docs files). Checked every value in this record against the
  builder's own `get_session`, git and shell output. 0 findings.
- Simplify: inline, no changes.
- Verify: inline. `npm run gates -- run --changed origin/main` exit 0 (contract-freshness,
  contract-citations, docs-index, client-secrets, copy all ok).
  `node scripts/work-spec.mjs status` reports 0 problems; its one gap is the convergence review,
  left null on purpose because the checker is independent.
- Not run: production build and browser checks (docs only, no build inputs). Full checks run in
  GitHub Actions.
