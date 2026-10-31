# Owner launch policy

Recorded 2026-10-30 from the master planning chat. This supersedes the older preparation-only,
production-finish and hard-date requirements. It does not start the CI project in this chat.

Owner words:

> I want to start it, if possible, at the same time as the JEV SVG import run.
> We just need to start this before finishing that one.
> I want to do it in Codex in the cloud, all autonomously.
> We just need to do it as fast as possible, and it works as long as it needs to work.
> We can have a default length of 2 weeks
> I don't think we need to have a hard deadline.
> Can you make the runner changes here first, so the cloud session can just start the CI plan
> instead of having to fix the plan-run system before it starts?

## Provider override, 2026-10-31

The run started on 2026-10-31 in Claude Code Cloud (run issue #1842, project authorization
`plan-cicd-improvement-2026-10-31`). Owner words, verbatim:

> I explicitly authorize Claude Code Cloud instead of Codex Cloud for this run while the Codex
> issues in #1301 remain unresolved. This supersedes the Codex-only provider wording in the plan
> registration, spec, launch.md and work.json authority description. Preserve all other approved
> scope, acceptance, budgets and safeguards. Do not switch providers again automatically.

The Codex Cloud wording below is kept as history. Where it names the provider, this override
governs. Everything else in this policy stays binding unchanged.

## One-command activation

An owner invocation of `$plan-run cicd-improvement` starts admission using this policy. No
additional permission question is needed. Read the spec and runbook, reconcile current main
and inspect existing work read-only. Qualify the native route before `continue`: that command
claims/restores existing state and opens a block. Do not take over a project or open a new
project, issue or trigger while that route is unqualified. This is not permission to
launch merely because this file is read or merged.

- Scope: the 18 ordered rows ci01-ci18 and their exact acceptance. P5/P6 stay excluded.
- Provider: Claude Code Cloud, under the 2026-10-31 override above. Do not substitute Codex,
  local workers or an API service, and do not switch providers again automatically.
  Original 2026-10-30 wording, superseded: "Provider: Codex Cloud. Do not substitute Claude,
  local workers or an API service."
- Actual start is the future successful launch time. Default planning target is start +14 days.
  An explicit `until <date>` replaces the initial target, not this completion policy. Resolve
  this owner's times in Europe/Kiev and record the actual offset. Preserve instants on resume.
- In `authorization.standing.untilComplete`, record the owner's words: "We just need to do it
  as fast as possible, and it works as long as it needs to work." Keep a source reference here.
- In `authorization.standing.blockRenewal`, record "I want to do it in Codex in the cloud, all
  autonomously." Under the explicit no-hard-deadline instruction, this permits successive
  bounded daily blocks until this scope completes. It grants no scope/budget/test expansion.
- Owner pause, cancellation, unresolved prerequisites and exhausted repair attempts still stop
  dependent work. Automatic recovery never resumes an owner pause. Never reset spent attempts.
- Remaining production-page studio acceptance may stay pending. Read its actual software and
  test receipts; do not claim final PASS or change its project, ledger, workers or worktrees.
- JEV may overlap only under its own authorization and admission. Serialize shared files,
  protocols, fixtures and CI changes; qualify capacity and independent reviewers first. This
  receipt neither launches JEV nor clears its security/qualification prerequisites.
- Preserve the approved limited unrelated-failure exception, required merge checks, 24-hour
  unrelated non-critical detection bound, audit reset rules and 14 clean days of observation.
  A two-week target does not promise completion in two weeks or shorten that observation.

## Codex Cloud platform prerequisite (history)

Recorded 2026-10-30 for the Codex Cloud route. The 2026-10-31 override replaced that route, so
this section no longer gates the live run. Kept as the record of why the provider changed.

The [2026-10-30 cloud qualification](../renewable-plan-runs/evidence.md) passed coordinator and
same-VM worker execution, Git access and disposable push. Independently hosted worker creation,
a native wake back into the coding chat and host-loss recovery were not qualified. The tested
cloud CLI returned HTTP 401; local CLI environment inventory also did not resolve the owner
binding. Listing a ready app environment is insufficient. No temporary wake remains armed.

Before unattended admission, obtain a supported authenticated native worker route and a real
wake/bootstrap receipt returning to the owning Codex Cloud coding chat. Requalify in the actual
launch environment, preserving the repository's owner binding. Do not invent environment IDs,
modify credentials or substitute desktop timers. Until proved, report the concrete platform
blocker and create no live CI runtime. Runner tests do not prove platform durability.
