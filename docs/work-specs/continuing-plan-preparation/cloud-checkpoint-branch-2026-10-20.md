# Cloud checkpoint branch, 2026-10-20

Recovery checkpoints moved from `refs/noacg-recovery/<id>`, which a Claude cloud session cannot
push (`cloud-recovery-probe-2026-10-20.md`), to the branch `claude/noacg-recovery/<id>`. Each
checkpoint tree holds `checkpoint.json` and a `vercel.json` of `{"git":{"deploymentEnabled":false}}`.
Pushes still use `--force-with-lease` against the previous checkpoint. This receipt is the live
check of branch `claude/plan-run-cloud-checkpoints` at `4481e5d0c`.

## Setup

The laptop opened a disposable project, `plan-recovery-probe-2026-10-20`: one phase, a three-hour
deadline, source pinned at `4481e5d0c`. It registered the project, started a block and recorded
`phase 1 build`. Three checkpoints went to the new branch: `b458741a2`, `55be33cff` and
`ba63577d9`.

## 1. A cloud session continues and publishes

Routine `trig_01D18o1J7u94qzg7SsvWF4mb` started session `cse_01F184pDz5aNXoRG5fqfRiKU`
(environment `env_017nuiDZBW9smUNLdWVQK8cf`) at `4481e5d0c`.

| Step | UTC | Result |
| --- | --- | --- |
| `ls-remote` before | 12:38:18 | `ba63577d9` |
| `continue /tmp/ncs4 recovery-probe cloud-probe` | 12:38:19 | exit 0, `continued`, block epoch 2, owner `cloud-probe`, next `wait build` |
| `record ... 1 landed {"mergeSha":"aaaa..."}` | 12:38:33 | exit 0 |
| `ls-remote` after | 12:38:37 | `92148fb38` |

The cloud session published three checkpoints, `f3ba24c5c`, `fca1dc98d` and `92148fb38`, each with
`--force-with-lease`, and GitHub accepted all three. The laptop saw the branch move through each
of them.

## 2. The stale store is refused

After that, the laptop's original store ran:

| Command | Exit | Answer |
| --- | --- | --- |
| `record ... 1 landed --authority block.json` | 1 | `superseded: another coordinator continued this project; stop` |
| `next` | 1 | the same |

The laptop's ledger file was byte-for-byte unchanged.

## 3. No deployment for checkpoint commits

- **GitHub:** none of the six checkpoint commits has a commit status, a check run or a
  deployment. The branch's own commit `4481e5d0c` has `Vercel: success` ("Canceled by Ignored
  Build Step").
- **Vercel:** `vercel ls noacg-studio --meta githubCommitRef=claude/noacg-recovery/plan-recovery-probe-2026-10-20`
  answered `No deployments found`. The same query for `claude/plan-run-cloud-checkpoints` lists
  that branch's canceled preview. So `deploymentEnabled: false` in the checkpoint tree is honoured,
  and `ignoreCommand` was not needed.

## Tools in a routine-started session

These tools decide the watchdog. A third routine, `trig_01RmVao7RLVdvSH4Y8nFYf75`, started
session `cse_019uYKUYeWjsmbUqka8zB465`. Its remote tools were the `mcp__Claude_Code_Remote__`
set: `add_repo`, `archive_session`, `confirm_repository_trust`, `create_session`,
`create_trigger`, `delete_trigger`, `fire_trigger`, `get_session`, `get_trigger`,
`interrupt_session`, `list_environments`, `list_repos`, `list_sessions`, `list_triggers`,
`read_documentation`, `register_repo_root`, `send_later`, `set_session_tags`,
`set_session_title`, `subscribe_pr_activity`, `unarchive_session`, `unsubscribe_pr_activity`,
`unwatch_url`, `update_trigger` and `watch_url`. It had no `send_message` and no `list_events`.

A session that one created with `create_session` (`session_015hxQeTPVDxbeoXksivyZQn`) had no
remote tools at all. So a coordinator started by a routine can launch workers, see their status
and stop them. It cannot message them or read their transcripts, and the workers it launches
cannot launch anything themselves. Whether `send_later` can message another session was not
established.

## Cleanup

- The branch `claude/noacg-recovery/plan-recovery-probe-2026-10-20` was deleted at 12:43Z. No
  `claude/noacg-recovery/*` or `refs/noacg-recovery/*` refs remain.
- The six routines used today are one-shot, have fired and are disabled. `RemoteTrigger` has no
  delete action, so they still appear in the claude.ai routines list. Those six are the two
  above, `trig_011C5q21xXqbph5kbUFnxBcd` (its message was never processed, and its session
  `cse_01G1k2NyLegSafrKYbZYrw7G` sat idle), and the three earlier `refs/noacg-recovery` probes.
- The laptop's probe state is in `C:\noacg-probe2`, and the earlier probe's state in `C:\noacg-probe`.
