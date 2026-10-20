# send_later wake after a lost container, 2026-10-20

Question: does a `send_later` check-in wake an owner-started cloud session after its container is
gone, so a coordinator can continue without the owner typing anything?

Answer: yes. The check-in started a new container, the session carried on in it with its
conversation, and the disk was intact. Nothing that ran in memory survived: background jobs and
monitors are gone, so the woken session has to restart its own wait.

## Setup

Session `session_01WTG2kKqNRrXCXcWCzyUAKJ`, started by the owner from the desktop app (origin
`desktop_app`), environment `env_017nuiDZBW9smUNLdWVQK8cf`, auto mode. Before the wait it stopped
its own background jobs, wrote two marker files and recorded the machine's identity
(`/proc/sys/kernel/random/boot_id`, `/proc/uptime`). It then armed `send_later` and went idle.

| UTC | Event | boot_id | Uptime |
| --- | --- | --- | --- |
| 17:21:55 | markers `/tmp/wake-test-marker-1792516915` and `/root/.wake-test-marker` written | `bc19f094-3f52-4c12-bd62-1faa09504ab3` | 6517 s |
| 17:22:22 | `send_later` armed: `trig_01VqvyGhpaWjS4dsf2gAegZg`, fire at 19:23:00 | same | |
| 17:22:31 | session idle | | |
| 18:13:37 | owner's message arrives (unplanned) | | |
| 18:13:48 | session checks itself | `8456ab65-92b9-4eba-b72a-318170f6de84` | 113 s |
| 18:14:00 | session idle again | | |
| 19:23:54 | the check-in arrives as a turn | | |
| 19:24:26 | session checks itself | `d90cfd62-7932-4a2c-81c3-6715501adadd` | 32 s |

## Results

- **The check-in woke the session in a new container.** At 19:24:26 the boot ID was new and the
  machine had been up 32 s, so it booted for this wake. No person and no other session sent
  anything between 18:14:00 and 19:23:54.
- **The disk survived both replacements.** Both markers were present at 18:13:48 and at 19:24:26
  (`/root/.wake-test-marker` still read `Tue Oct 20 17:21:55 UTC 2026`), and so were the
  worktrees under `.claude/worktrees/` and their branches.
- **An idle container can be gone within 51 minutes.** The owner's message at 18:13:37,
  51 minutes into the wait, already found a new machine (up 113 s). The earlier container had
  also been replaced once before 17:21 (up since about 15:33).
- **The wake lands about a minute late.** Fire time 19:23:00; the turn started 19:23:54.

## From the woken session

`cloud-delegate.md` asks, before unattended recovery is claimed, for repository, whole-log, push,
check and queue access and bounded re-arming, observed after a real wake. The same session, on
the same new machine (`d90cfd62`, up 1155 s at 19:43:09), did:

| UTC | Operation | Result |
| --- | --- | --- |
| 19:26:07 | `git fetch origin --prune` | ok |
| 19:43:09 | `git ls-remote origin 'refs/heads/claude/noacg-recovery/*'`; `gh api repos/NoaCG/NoaCG-Studio` | ok |
| 19:43 | the GitHub connector's job-log read, job `118775224168` | ok |
| 19:43:18 | `send_later` armed, `trig_01DjCQQE6hNxL3sBpYxn3992`, named `plan-run check-in test`, 60 minutes ahead | ok |
| 19:43 | `list_triggers` shows it by name with this session as its target; `update_trigger` moves it to 20:55 | ok |
| 19:43 | `delete_trigger` removes it | ok |

Push, check and queue access from the same session are recorded on the pull request that adds
this file, with the machine's boot ID at each step.

## What this means for the coordinator

A coordinator that always has one `send_later` check-in pending, about 60 minutes ahead, is woken
in a new container after a lost one, within about an hour, with its disk and so its store intact.
So it does not need `continue`: it asks `next` of its own store and restarts its background wait.
Production-page spec §9 gives the whole rule. This does not cover an account usage limit or a
session that was stopped or ended: those still need the owner's `/plan-run` line. The coordinator
still runs in a session the owner started: a routine-started one has `send_later` but no
`send_message` or `list_events` (`cloud-checkpoint-branch-2026-10-20.md`).
