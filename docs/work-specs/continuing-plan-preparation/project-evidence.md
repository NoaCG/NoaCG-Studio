# A: continuing-project preparation evidence

Reviewed baseline: `742a5a655f78b4276acc02cd38a19ea6e19c9119`.
The PR's reviewed tip and /check stamp identify the exact resulting revision.

- `/check` review: inline, three findings fixed: missing metadata could fall back
  to legacy handling; a second local database needed explicit refusal; uncertain
  wake-send fallback could start a replacement. Simplify: inline, shared day bound
  and removed unreachable project delivery/report checks. Verify: inline.
- `npm run gates -- run --changed origin/main`: PASS, 13 selected test files,
  146 tests; no skipped/cancelled tests. All selected cheap checks passed.
- `git diff --check`: PASS. No production build is warranted by this tooling/docs
  diff. Authoritative PR/merge-group checks run through the existing queue.
- Ten continuing-project fixtures cover 72-hour authorization; short blocks;
  between-phase and in-flight pause; first-unfinished restart; findings/repair
  preservation; cancellation; expiry; stale/competing callers; one authoritative
  local store; complete independent criterion/environment evidence; missing/corrupt
  metadata; and acknowledgement lost after controlled phase acceptance.
- The existing Git restoration fixture now also restores a multi-day project's
  exact identity/authorization and refuses replacement-host execution. Native
  wake guard fixtures preserve the original project deadline and shorter block.
- Landed preflight receipts and policy are in spec.md. The final changed Codex and
  Claude adapters resolved from fresh root and nested contexts in a same-VM
  delegated context. Canonical plan-run: 82/90 lines; thin wrappers remain within
  25 lines. This is instruction-load evidence, not a native child launch.

Verification used the qualified shell context with supported additional network
permission and no escalation. Default-sandbox subprocess attempts failed EPERM;
they are infrastructure failures, not passing receipts. Missing isolated-worktree
dependencies and a nonwritable default npm cache were resolved with the existing
lockfile, `npm ci --ignore-scripts --cache /tmp/noacg-plan-npm-cache`. No product
assertion, timeout, retry or CI behavior changed to obtain these results.

These controlled fixtures do not prove provider-native continuation, remote
exclusion, supported wake/bootstrap or actual hardware/human acceptance. Automatic
native project replacement and restored-host execution remain refused. Local
locks and Git CAS make no remote guarantee. No real plan, implementation worker,
schedule, verification experiment or cloud handoff was started.

B's verification lookup is a separate change and is not marked passed by A.
