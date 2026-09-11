# Routing - choose the worker independently of the coordinator

**Every row names its POOL**, with the reasoning it needs on its `MODEL` line. The host running
the planner does not decide who implements, reviews or lands the row. `hosts.md` owns the launch
mechanisms; this module owns the choice. Claude's existing Agent and rescue routes remain valid.

## The pools

| POOL | use | route |
| --- | --- | --- |
| `opus` | a major implementation pool; Claude's default, not a required supervisor for every other pool | Claude Agent definitions in `launch.md`; from Codex, the Claude CLI |
| `fable` | consequential design, architecture or adversarial review; only when the host exposes the model | Claude Agent with its definition; never silently substitute a model |
| `sonnet` | mechanical work with a written recipe and verification | Claude Agent or CLI |
| `codex` | a full implementation and review pool, AVAILABLE BY DEFAULT; short specification, substantial engineering | native Codex subagent when present; from Claude, `rescue` in the owning row |
| `agy-gemini` | bounded implementation, comprehension and corpus work where measured outcomes justify it | `npm run agy:read` or `npm run agy -- --write` from either host |
| `agy-claude-gpt` | the other Antigravity allowance, selected by verified task outcomes | same wrapper with explicit supported model |

## The decision

1. **Read `npm run harness:usage` once at plan time**, then when capacity could change routing.
   Record `Pools at plan time:`. Codex percentages are account-wide snapshots, not this wave's
   spend. A native Codex usage tool can supply a fresh reading without making a model call.
   Unknown capacity is UNKNOWN, never zero. Claude and Antigravity have no comparable percentage.
2. **Choose by expected verified output**, including specification, review, repair and landing
   time. An empty response caused by our grants is an invocation failure, not bad reasoning.
   A repeated implementation defect after a correct assignment is worker evidence. Keep the
   distinction in `npm run outcome`; spare allowance never makes a pointless task worthwhile.
3. **Select the model and effort explicitly for delegated work.** Preserve the owner's current
   preference; otherwise use the measured wrapper default or the native session's model. The
   temporary Codex rescue effort trial lives in the wrapper, not a contradictory `high` here.
   A CLI version alone proves neither model entitlement nor a tool's availability.
4. **Every non-Claude row names a fallback pool**, as the plan check requires. Use it only for a
   demonstrated availability, permission or quality limitation; never bypass a safety refusal.
   A native Codex row may own its verification and queueing. A sandboxed rescue worker that
   cannot write shared git metadata returns its patch to its owner for those steps.
5. **Give delegates the tools and paths they need.** The `DELEGATE` line declares read/write mode,
   exact worktree, result path and acceptance evidence. Enumerate files for Antigravity, whose
   search is a separately measured capability; do not equate directory listing with grep.
   Its existing write grants must cover that worktree. A granted Claude worktree is a valid
   assignment from either coordinator; silently widening grants is not.
6. **A delegate needs an engineering task, not a transcript.** Give the why, constraints, verified
   input and outcome. Let it derive the implementation. Do not prohibit git READS when build
   gates need them; distinguish reads, commits and landing authority in the assignment.
   Reserve review for counterexamples, not asking another model to retell the same work.

Done when each row has a capable execution route, a pool and justified effort; each economy note
from `node scripts/wave-plan-check.mjs` is answered. No blanket requirement to keep Claude busy,
nor to empty another pool merely because it has allowance.

## Effort and evidence

Claude-native `MODEL` rungs still map to `.claude/agents/` in `launch.md`. Native Codex uses its
available model/effort controls, never a Claude agent definition. CLI flags carry that choice for
delegates. The reasoning clause names the task: reproduce then measure, adversarial review,
mechanical transformation, or design judgement. A receiving row may raise a justified effort.

Model IDs and experiments live in `docs/HARNESS_ROUTING.md`, observations in
`scripts/harness-capabilities.json`. Scope each observation to **host, launch path, version and
permissions**. Re-probe a changed route with one useful bounded task and record the verified result;
do not spend a wave rediscovering every unused capability. `hosts.md` names the compatibility test.
