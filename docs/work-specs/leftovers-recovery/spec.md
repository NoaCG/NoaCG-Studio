# Resolve preserved October 10 leftovers

## Why and goal

The cleanup retained work whose ownership or value was uncertain. Account for each item against
fresh main and current sessions, recover only confirmed missing work, and remove only proven safe
leftovers after verification and external preservation.

## Non-goals

Do not change active toolkit/editor/OGraf/research work, replay completed phases, reset shared
checkouts, repair live desktop state, or merge historical reverts to make cleanup appear complete.

## Decisions

- Investigate the rundown stash, orphan source, update draft, toolkit branch and automation in order.
- Use this fresh feature branch for any recovery. Preserve original refs until accounted for.
- Keep an external hash-verified source archive and a Git bundle before retiring obsolete refs.
- Respect recorded fail-then-pass quarantine evidence and the normal release threshold.
- Publish the update only after the owner resolves its remaining editorial choice.
- Preserve the permanent orchestrator and uncertain detached infrastructure.

## Acceptance

1. Every stash file is compared with its base, the history landing and current main.
2. Every orphan non-generated, non-secret file matches repository history or is archived and reviewed.
3. The draft's claims are checked against shipped behavior and its editorial outcome is recorded.
4. Toolkit changes have a patch/file comparison with the adopted implementation.
5. Each automation proposal has original failure, current CI and ownership evidence.
6. Active ownership is refreshed before cleanup; removed paths/refs have verified recovery evidence.
7. Any repository change passes scoped rules and /check, and lands only via /queue-merge.
