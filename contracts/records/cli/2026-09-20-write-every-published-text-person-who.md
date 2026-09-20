# cli/write-every-published-text-person-who

Rule: `cli/write-every-published-text-person-who`. Recorded 2026-09-20 on `claude/cli-release-notes-for-people` at cf45d972.

2026-09-20: the GitHub Release of @noacg/cli 0.3.4 was written by gh release create --generate-notes. It listed 34 pull request titles from the whole repository since cli-v0.3.3, two of them about the CLI, each ending 'by @miwco'. The owner read it as unreadable: it did not say what was added. The notes now come from cli/CHANGELOG.md through cli/scripts/release-notes.mjs, which the CLI build and the release workflow both run with --check.
