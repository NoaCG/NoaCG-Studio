# root/auto-fix-always-repository-pull-requests

Rule: `root/auto-fix-always-repository-pull-requests`. Recorded 2026-10-09 on `claude/k-auto-fix-every-pr` at 5c6269073.

The owner, during a wave: agents kept asking whether to turn on Auto-fix. He answered that it should always be enabled, because pull requests need to be fixed so they can land, in both Claude Code and Codex.

Why a rule rather than a fix, a mechanism or a check: Neither app has a global default: Auto-fix in the Claude app and the scheduled task in Codex are set per pull request, so a session must turn them on itself; the queue-merge workflow says how, and this rule ends the asking whether to.
