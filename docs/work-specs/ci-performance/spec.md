# CI performance investigation

## Why and goal

Ten shards restored timeout headroom. Determine how to sustain it as coverage grows,
using the latest ten completed full main runs and the latest green run's test report.
Identify measured costs and rank improvements before changing capacity or policy.

## Scope and decisions

- Separate runner waiting, job setup, browser execution and post-test work.
- Distinguish nine-shard history from ten-shard runs and censored timeout timings.
- Inspect the five most expensive spec files, preserving their observable coverage.
- Work in this audit's branch and worktree while other work lands independently.
- Preserve timeout, retry, gate and merge policies. Do not edit another session's work.
- Document actionable findings; implement only a demonstrated, contained improvement.

## Acceptance

- Record run IDs, commits, sampling limits and reproducible timing calculations.
- Report startup versus execution costs and the slowest files and tests.
- Explain whether more runners or a longer timeout addresses the measured bottleneck.
- Rank next actions with estimated opportunity and verification needed.
- Check and land any resulting changes through the existing flow.
