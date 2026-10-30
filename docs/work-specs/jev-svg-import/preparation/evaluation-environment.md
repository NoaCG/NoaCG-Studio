# Protected evaluation environment

Preparation design only; the workflow is implemented in row 32 after the non-AI product rows.

- Repository: `NoaCG/NoaCG-Studio`; Actions environment: `jev-svg-evaluation`.
- Deployment branch rule: `main` only; no tag rule, no branch wildcard, no per-dispatch human
  reviewer. Do not change unrelated Production/Preview policies. Branch protection and PR review
  govern changes to the trusted main workflow/harness.
- Environment secrets: `AI_GATEWAY_API_KEY` (Gateway-authenticated key, not a direct-provider key),
  `JEV_SVG_HOLDOUT_ZIP_BASE64` (exact frozen ZIP, base64 encoding, no content in logs).
- Workflow: `.github/workflows/jev-svg-eval.yml` on main only; reject any other workflow ref.
  Checkout/harness at an immutable main SHA. Dispatch input `configuration_ref` resolves to a
  commit; read only `docs/work-specs/jev-svg-import/evaluation/prompts.json` at that commit as
  bounded schema-validated data. No execution/import of branch code, package installs from that
  branch, arbitrary paths/URLs or free-form commands. The environment key never reaches a worker.
- Fixed `concurrency.group: jev-svg-evaluation`, `cancel-in-progress: false`; no parallel inference.
  Restrict routine dispatch to the qualified coordinator; read/check current in-flight run before
  dispatch because GitHub concurrency is serialization, not an unlimited durable FIFO queue.
- Original balance baseline and all batch receipts are immutable Actions artifacts and copied into
  row evidence. Keep 90 days after completion; configure retention before run start. Reconcile
  the existing run after an unknown acknowledgement; never reset the baseline.
- Read credits before each batch, count start minus current balance, include concurrent consumers,
  bound maximum full batch cost within remaining $5 and $2/$3 split, and settle usage before next.
  No unpriced route, automatic provider fallback, BYOK or top-up during evaluation. Verify automatic
  top-up disabled. An increased balance/lifetime-usage discrepancy blocks further paid calls.
  If starting balance exceeds $5, exhaustion alone is not the $5 enforcement mechanism.
- The sealed ZIP must hash to the public corpus receipt and each SVG/label member must match its
  pre-tuning manifest. Unpack only at row34 after config freeze; no external refs or executable
  files run. Only controlled sanitized previews can be rendered after the sanitizer gate.
- Holdout readers: owner/custodian, trusted main holdout job, independent checker after freeze.
  Tuning workers have development inputs only. Secret admins can technically inspect/change it;
  separation is a recorded evaluation protocol, not a false administrator-proof security claim.
- Private owner Drive backup is outside public git, with owner-only permissions verified before
  treating it as durable. Its exact observed link is in the private handoff. Hash commitment and
  secret name are public; archive/labels are not. Retention: 90 days after run completion, then
  owner/custodian deletes the secret/archive if no longer needed. No deletion trigger is armed now.

## Current access result and exact setup

29 October: listing repository environments succeeds (Preview and Production). Creating the
specified environment and listing Actions secrets return HTTP403, resource not accessible by
integration. A configured cloud key is not proof the protected Actions job can read one.

An administrator can use Settings → Environments → New environment → `jev-svg-evaluation`.
Set deployment branches/tags to Selected branches and tags; add Branch `main` only; leave required
reviewers off for this dedicated synthetic evaluation environment. Add the two environment secrets
above. For the holdout, use the exact private backup ZIP, verify SHA256, then base64-encode locally
into the secret using `gh secret set JEV_SVG_HOLDOUT_ZIP_BASE64 --env jev-svg-evaluation` via stdin.
Do not paste it or keys into chat. Confirm artifact retention permits 90 days. No paid test is
needed now; row32 uses mocks and row33 makes the bounded paid qualification.

In Vercel → NoaCG → AI Gateway → Credits, verify auto top-up is Off and report that state. Do not
change team-wide billing policy silently. If it cannot be off for this window, keep the model route
unqualified; a changed spend-control design needs review before any inference.
