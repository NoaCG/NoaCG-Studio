# Provider capability boundary — 2026-10-16

Scope: this Codex managed cloud workspace, the existing public NoaCG/NoaCG-Studio
repository, and the existing prepared environments. No subscription or account
changes, replacement credentials, API-backed agent or new VM was used.

The owner has now assigned Claude probes to an existing Claude Code cloud
session, and one lightweight laptop launch to each provider's own CLI. Codex
measurements are complete here. Neither provider is to launch the other.
[provider-runbook.md](provider-runbook.md) contains the copyable Claude task,
measurement commands and laptop-closed checks. Those steps remain unexecuted;
this workspace's access failures do not describe the owner's Claude session.

## Reused qualification and follow-up status

Read cloud-landing-recovery/work.json and evidence/runtime.md, claude-runtime.md,
and claude-landing.md on main 55d01c993188d66e61f3ab9ccbe64e7d41cf06bd.
PRs #1293 and #1298 supply the Claude receipts; their landing still needed the
owner's one-time permission. The current .claude/settings.json contains no
ccr/auto_merge allow entry. Open PRs and issue searches at intake contained no
cloud-verification measurement or narrow click-free permission follow-up.
No unchanged AC-1..AC-5 qualification was repeated.

## Current supported interfaces versus observations

| Capability | Codex | Claude Code |
|---|---|---|
| Installed interface | codex-cli 0.159.2; cloud exec/list/status/diff/apply help inspected | Claude Code 2.1.301 installed in an npm temporary cache; --help and auth status inspected |
| Launch in intended saved environment | --env is supported; intended current environment binding is unverified | --cloud is supported; /remote-env selects an Anthropic-hosted env_; --environment targets self-hosted ccpool_ IDs |
| Live access from this coordinator | codex cloud list --limit 5 --json failed; direct HTTPS CONNECT to chatgpt.com returned 403 | a bounded read-only -p --cloud follow-up to the receipt's session was refused: cloud sessions disabled by organization policy |
| Current authentication observation | Normal CLI status identifies ChatGPT authentication; credentials were preserved and their values were not printed | auth status reports api_key from ANTHROPIC_API_KEY; subscription-authenticated access was not established, and this does not establish the prepared account's policy |
| Native task/result | No submission attempted without verified environment access; no task ID or result | No follow-up was delivered; no new task or result |
| Follow-up/resume | Installed cloud CLI exposes status/diff/apply, no follow-up subcommand | Official CLI supports one-message follow-up and --teleport; neither qualified from the intended account here |
| Return commits, PRs, logs, screenshots | Existing landing qualification reused; worker return transport remains unqualified | Existing landing qualification reused; worker return transport remains unqualified |
| Restart/reclaimed-container recovery | Existing Codex limits remain as recorded in runtime.md | Existing Claude idle/reclaimed-container proof reused; no new delegation recovery proof |
| Bounded scheduled cloud coordinator | No hosted wake or cloud-launch connector exposed in this chat | No Claude scheduler or subscription session exposed here |
| Click-free exact-SHA queued landing | Existing qualified Codex implementation retained | Fresh narrow-permission proof remains open |

The selected runtime's ccarenv identifier is not evidence that the installed
Codex cloud CLI can select that same saved environment. Listing and inspecting
the provider's actual environment mapping is required before submission.
A CLI acknowledgement, matching environment variables, or an API key would not
prove the requested flow.

Current official documentation separates published Codex Cloud environments from
Codex Cloud (Legacy). The GitHub integration explicitly says a non-review
`@codex` comment starts a legacy cloud chat. That is not proof of reaching this
current published environment, so no substitute GitHub launch was attempted.
The installed root CLI help exposes remote app-server connection and the cloud
task commands, but establishes no mapping from this published configuration to
the observed wham task backend. No current-cloud task-creation/handoff tool is
exposed in this chat. Opening the blocked CLI destination alone would therefore
not complete environment qualification.

The Claude follow-up used session_01J9NDriM1w6f1wkgzBTYAxu from the existing
qualification, with a 30-second external bound and a read-only request for
session/environment IDs and git HEAD. Its refusal happened before delivery.
Workspace trust was also unaccepted; neither trust nor organization policy was
overridden. No API-model fallback was used.

## Official references inspected live

- [Codex CLI reference](https://developers.openai.com/codex/cli/reference/):
  cloud task submission/listing and normal CLI authentication.
- [Current Codex environments](https://learn.chatgpt.com/docs/environments/cloud-environments)
  and [GitHub integration](https://learn.chatgpt.com/docs/third-party/github):
  current published environment selection versus the legacy GitHub route.
- [Claude cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web):
  account-authenticated cloud launch, one-message follow-up and teleport.
- [Claude cloud environments](https://code.claude.com/docs/en/cloud-environments):
  /remote-env selects Anthropic-hosted environments; --environment rejects env_
  IDs and is for self-hosted pools.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference).

Documented support is not a live qualification result. Local-to-cloud launch,
exact revision/environment return, uncertain-submission recovery, coordinator
reconnection, bounded scheduled continuation, one repair owner, and fresh
click-free Claude landing remain acceptance gaps.

## Continuation and recovery

1. Keep the existing cloud-landing implementation and this spec's acceptance
   ledger. Resume on the recorded feature branch; fetch main and check for a
   concurrent follow-up before editing.
2. Obtain the existing subscription-authenticated provider session and supported
   launch access. Expose a supported current-cloud launch/handoff surface and
   verify its environment mapping; the legacy bridge is not a substitute. Resolve
   any required endpoint policy through the supported configuration workflow.
   Do not replace injected credentials or
   treat the current Claude API-key login as subscription access.
3. In each provider, verify the actual saved NoaCG environment ID and exact source
   revision from inside the worker. Collect native task ID, status and a useful
   result before counting launch as qualified.
4. Complete Claude resource/build/gate/affected/shard measurements with the same
   descendant-tree sampler. Use an owned idle worktree, explicit worker counts,
   and queued browser commands declared --kind sweep; preserve test failures.
5. Present the final measured depth for owner approval before changing the shared
   verification rule. Then implement execution-site profile selection and the
   smallest shared skill using the existing canonical workflow/adapters.
6. For an uncertain submission, inspect existing provider task IDs/results and
   existing wave/plan state before creating anything again. If submission cannot
   be reconciled, stop that launch; do not guess that a retry is duplicate-free.
7. Before an unattended demonstration, record a bounded probe window under this
   request's existing authorization; a real plan run uses the owner's stated window.
   Assign exactly one acknowledged repair owner, arm a supported wake, and observe
   its delivery, code/log access and re-arming. Inspect mergeability even without
   a webhook. Never extend the owner's window or claim archive revival.
8. Land verified phases through /check and /queue-merge. Without a proven durable
   wake the active owner remains through merge and post-land conclusions. No
   unattended readiness claim is made by this measurement phase.
