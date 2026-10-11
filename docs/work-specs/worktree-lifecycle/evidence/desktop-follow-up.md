# AC-6: a desktop chat whose work landed can take a follow-up

Recorded 2026-10-08 on the owner's Windows machine, branch `claude/l-worktree-self-cleanup`.

## What was observed on this machine

- `claude agents --json` (via `node scripts/claude-agents.mjs`) listed 3 live sessions while 8
  desktop-chat worktrees existed: the desktop app keeps a CLI process only for chats that are open,
  so a quiet chat's worktree is NOT held by any process and can be removed after its hold.
- The desktop app's own log (`%LOCALAPPDATA%\Claude\logs\main.log`) shows its worktree pool:
  archiving a chat "Released worktree ... to pool (verified clean, keyed)", a new chat "Reused
  worktree ... (untouched since parked)", and "directory gone on release; dropping store entry"
  when a folder has disappeared. So a folder removed by the sweep is handled by the app as a
  missing pool entry, not an error.
- A rename of a folder some process has as its working directory fails with EBUSY, with an open
  file inside or a process in a subfolder with EPERM (measured with a scratch folder and a child
  `node` process). That is what the sweep's move-aside relies on to leave a worktree in use alone.

## What was tested

`scripts/worktree-followup.test.mjs` drives the real SessionStart hook with the JSON Claude Code
sends on stdin:

- a session starting (`source: resume`) in a worktree whose branch is in the landing ledger, with
  a clean tree, is moved to `claude/<name>-2` at `origin/main`; a dirty tree, or commits after the
  landing, keep the branch;
- a resumed session whose transcript says it last worked in `.claude/worktrees/<name>`, which no
  longer exists, started in the repository root (where Claude Code resumes a session whose worktree
  is gone): the hook creates a fresh worktree at the same path on `claude/<name>-2` from
  `origin/main` and tells the session to enter it with EnterWorktree; a second resume does nothing;
- a folder git does not know that still holds files is never reused.

`scripts/worktree-unattended.test.mjs` shows a worktree with a live process inside is skipped
untouched and removed on a later run once the process has exited.

## What could not be tested here

- The desktop app reopening a chat whose worktree folder is gone: which directory it starts the
  session in, and whether it starts it at all, is not documented and cannot be driven without the
  app's UI. The Claude Code CLI documents resuming in the launch directory with a notice
  ("Resume a worktree session", code.claude.com/docs/en/worktrees); the hook covers that case and
  the case where the app recreates an empty folder at the old path.
- Whether the resumed agent follows the EnterWorktree instruction is the model's behaviour, not
  something a test can pin.
- First owner check: after a landed chat has been quiet for a day, reopen it and ask a question;
  expect the session start to say a fresh worktree is ready, and the session to switch into it.
