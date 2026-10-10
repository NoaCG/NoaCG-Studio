# now - what is running and what landed

Shared canonical procedure, invoked as `/now` in Claude Code and `$now` in Codex. (`/status` is
taken by Claude Code itself.)

**The question this answers: what is happening right now, and did my work land?** It reads state
and changes nothing. Keep it cheap: the commands below once each, no logs, no file reads.

Optional argument: a pull request number or a branch, to answer about that one only.

## 1. Read

```bash
node scripts/jobs.mjs
gh pr list --state open --json number,title,headRefName,isDraft,autoMergeRequest,statusCheckRollup
gh run list --branch main --limit 4 --json name,status,conclusion,createdAt
```

`jobs.mjs` lists what landed through the queue, what the job queue is running, and the branches
still ahead of `main`. With an argument, read only that pull request (`gh pr view <n> --json
state,mergedAt,mergeStateStatus,statusCheckRollup`).

## 2. Answer

At most ten lines, plain words, newest first:

1. **Running**: the job queue, and open pull requests queued or with CI still going.
2. **Landed** since the last wave report or the last 12 hours, one line each with its number.
3. **Stuck**: a red check, a failed landing, or a branch ahead of `main` with no session holding
   it, each with what would move it. Say who fixes it: Auto-fix, its own session, or a new one.
4. **Main**: green, red or running.

A section with nothing in it is left out. Do not explain how the pieces work, suggest work, or
start fixing anything; the owner asks for that separately.
