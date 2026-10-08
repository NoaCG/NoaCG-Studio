# Worktree lifecycle: questions for the owner

**Answered 2026-10-08** (recorded in `spec.md`, "Owner answers"): Q1 yes, with the condition that a
session whose work landed must not just disappear - never remove a worktree a live session holds,
and make a resumed chat's follow-up work with nothing to run. Q2 yes, already turned on by the
owner. Q3 yes. Q4 keep it off. Q5 neither option as asked: desktop session worktrees wait 24 hours,
`agent-*` worktrees 2 hours.

Most important first. Each has a recommendation; phase 2 builds the recommendations unless you say
otherwise. Port handling has no question: it is technical, and a build stops needing a port either
way (`spec.md`, decisions 1-4).

## Q1. Remove landed worktrees with nobody asking, desktop-app and agent ones included?

What it means: a worktree under `.claude/worktrees/` whose `claude/`, `codex/` or
`worktree-agent-` branch has landed is removed with its local branch and port, once its session has
been idle for two hours, by a sweep that session starts and landings trigger. Every current safety
rule still decides (clean tree, no lock, no operation in progress, no queued job, valuable ignored
files archived and verified first). The Codex app's own worktrees and anything that has not landed
are never touched. What you would notice: a desktop session whose branch landed loses its folder
after two idle hours; reopening it continues outside a worktree.

**Recommendation: yes.** That pile is what filled the ports, and only the trigger is new: the
rules that make a removal safe are the ones you already approved.

## Q2. Turn on GitHub's "Automatically delete head branches" (`delete_branch_on_merge`)?

What it means: GitHub deletes a pull request's branch the moment it merges. `main` stays protected
by the ruleset, and an open pull request based on a deleted branch is retargeted to `main`. 29 of
35 branches on GitHub are already merged leftovers. One user report says a desktop session's
folder vanished after a merge with this setting on; phase 2 watches the first landing after the
change.

**Recommendation: yes.** GitHub does it at merge with no machine involved; the local sweep keeps
its lease-guarded delete as a fallback. If no, phase 2 adds the same delete to `post-land.yml`.

## Q3. Also remove worktrees that never landed anything because they have no commits of their own?

What it means: a worktree whose branch still sits on a `main` commit (a desktop chat that never
committed, a row that stopped before its first commit) is removed after three idle days, under the
same rules as Q1. What you would notice: a desktop chat left alone for three days loses its folder.

**Recommendation: yes, after three days.** Nothing can be lost (ignored files are archived first),
and each one holds about a gigabyte that otherwise stays until someone runs `/cleanup-worktrees`.

## Q4. Keep the desktop app's "Auto-archive after PR merge or close" off?

What it means: this is your setting in Settings > Claude Code, not something a script changes.
When on, the app removes the session's worktree itself when its pull request merges.

**Recommendation: keep it off.** The app removes the folder without copying ignored output out
first, which is exactly how paid bench rounds were lost; the repository's sweep does the same job
with the archive.

## Q5. Wait two idle hours before removing a landed worktree, or remove it as soon as it lands?

What it means: "as soon as it lands" would remove it at the landing whenever its session has said
nothing since it queued the branch, instead of after two idle hours.

**Recommendation: keep two hours.** Ports no longer depend on prompt cleanup, and two hours
protects a desktop chat you are still reading or about to continue.
