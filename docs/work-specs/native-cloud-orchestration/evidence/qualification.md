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
