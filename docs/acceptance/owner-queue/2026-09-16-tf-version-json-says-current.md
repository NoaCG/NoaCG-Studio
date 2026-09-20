---
kind: agent
date: 2026-09-16
---
# version.json now answers "is production current?" by itself

`https://noacg.studio/version.json` carries two new fields alongside `commit`:
`lastDeployAffectingCommit` (the newest commit, at or before the build, that can change what
production serves) and `deployedCommitIsCurrent` (`commit === lastDeployAffectingCommit`, or
`null` when it could not be determined - never a guessed `true`). Anyone checking before a
demo reads this file; this is what makes the read answer itself instead of needing a manual diff
against `scripts/deploy-affecting-paths.mjs`.

## Route, under a minute

Once this branch has landed and a deploy-affecting build has run, fetch
`https://noacg.studio/version.json` (`curl -s https://noacg.studio/version.json`). Compare its
`commit` against `node scripts/deploy-affecting-paths.mjs --last-affecting <commit>` run in a
checkout of this repo - the command should print the same sha as `lastDeployAffectingCommit`, and
`deployedCommitIsCurrent` should be `true` whenever they match.

## What to look at

That `commit` is unchanged in shape (the field the drift alarm already compares), that the two new
fields are present and not `undefined`, and that `deployedCommitIsCurrent` is `true` rather than
`null` on a normal build - `null` only belongs to a shallow checkout or a missing `.git` directory,
never to a guess. Verified locally in this session against three states: a deliberately stale
commit (`false`), the branch's own current commit (`true`), and a checkout with no `.git`
(`null`/`null`) - see `docs/handoffs/2026-09-16-tf-version-json-says-current.md` for the exact
commands.
