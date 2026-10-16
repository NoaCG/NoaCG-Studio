# Cloud continuation receipt — 2026-10-16

Native thread: 01a1460e-e621-700b-8711-a9d0c602f07c, supplied by the local
coordinator app receipt (kind codex, hostId durable). Native task URL unavailable.
Nonce: codex-cloud-20261016T184511Z-52f743839e7e.
Initial source: d99248a085cbdc42e87527fdf6f346b27e9ca8c6, clean, observed
2026-10-16T18:53:45Z. Owned branch codex/cloud-execution-52f743 was created at
that exact source after the first fetch failed; a subsequent supported-network
fetch succeeded and confirmed origin/main at the same SHA before edits.

Actual provider environment:
ccarenv_b64_Y2NhcmVudl8xODM1ZjllZWVlNGM4MTkxYjllNWZiZTJmYWY0ODgzOA.
The canonical intended binding is recorded in capabilities.md and was not replaced.
Supported environment_status reports source_config_id
12d52065-8112-4834-9f61-df30c216a853~cecfg_6acf19fbf14c8190bd49ed03e49ac630
and source_config_version_id
12d52065-8112-4834-9f61-df30c216a853~cecfgver_6ad2719bf9088190a56801d77d5abc77,
spec/observed revision 3, provider cloud, phase running. No exposed saved name,
repository field or original-ID relationship proves the mismatch is a revision.
The repository checkout is NoaCG/NoaCG-Studio; this alone does not prove exact-ID success.

Subsequent supported UI receipt from the local coordinator establishes saved-config
lineage: prior thread 01a14608-30d3-7654-9c71-4d57555c505d reported the SAME
source_config_id, prior version cecfgver_6ad250f331788190b370e615135d2b1c,
revision 2 without chatgpt.com, and runtime binding
ccarenv_b64_Y2NhcmVudl9jYWZlNTkxOWM1MWM4MTkxOTdjNzY2NDJmZmE5ZTc4ZA.
Both UIs show NoaCG-Studio and the existing repository. Thus this task uses the
same saved NoaCG configuration after the one-domain publication; runtime IDs vary
per task. This does not map the historical owner-supplied runtime ID to CLI acceptance.
No prior thread was resumed or messaged.

Network desired policy is restricted and includes chatgpt.com among 16 custom
hosts; enforcement state remains unknown. Default sandbox socket access failed at
the configured proxy. Using supported network permissions, git fetch/ls-remote
succeeded and one Codex cloud list reached
https://chatgpt.com/backend-api/wham/environments, returning 401 Unauthorized:
“Could not parse your authentication token. Please try signing in again.”
This establishes endpoint reachability, not authenticated environment mapping.
CLI 0.159.2 login status says Logged in using ChatGPT. No credential was printed
or replaced. No native child submission was attempted, and the 401 was not retried.
The earlier local CLI no-environments error preceded create_task; this UI task
is not evidence of a successful local CLI launch.

Remote branch inspection found no pushed cloud adapter continuation branch;
worktree-activity reported no other local work in flight. The interrupted adapter
thread may retain unpushed work; no adapter implementation files are touched here.

## Reused acceptance evidence

Both measurement sets use 4d55cf52585bb220d8d12d12f42140c76b315cc4.
Codex: four-CPU quota/16 GiB, build 3m23s, clean four-worker shards 5m24s/6m12s.
Claude: four vCPU/13.36 GiB cgroup-v1 command scope, build 6m24s,
clean four-worker shard1 6m57s; shard2 8m29s with one unclassified failure.
Six Claude workers were slower and failed 36 cases; CPU oversubscription is
suspected, not proven. Both large selections hit the 18m20s bound, leaving
47/185 cases unrun. Preserve snapshots, wizard failure, skips and all unrun cases.
These outcomes support a proposal, not a passing verification claim.

Claude native coordinator/worker, exact baseline, nonce, follow-up and git transport
are in claude-measurements.md/json. The local Claude probe had no nonce or pinned
SHA. These establish the Claude subset of AC-3, not Codex's missing subset.

#1305 repair-owner comment 6217774386 was read through the GitHub connector.
It records session-owned exact-head auto-merge without a permission prompt,
subsequent reviewed fix 602cd712f, and merge a69ce16927c2c797003e4ef9c7c5b776a9e964d2
at 14:46:54Z. Merge-group 38917840843, post-land 38918548967, quarantine
38918548816 and configured-suite 38918548814 succeeded. Main CI 38918548575
was cancelled after shard5 hit its cap; same-commit recovery, CI gate and After
the gate passed. Deploy verification was skipped. This closes the previously
missing Claude click-free landing proof in AC-5 by reusing existing qualification;
it does not close native delegation/recovery AC-3/AC-4. No landing probe repeated.

Numerical-depth approval is absent from the inspected #1301 comments. AC-2 remains
unverified and shared policy unchanged. AC-1's measurement evidence is complete;
AC-3 and AC-4 remain unverified; AC-6 historical passing evidence is preserved.
