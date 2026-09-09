---
kind: owner-action
date: 2026-09-09
needs: account
---
# npm still thinks the repository is `miwco/NoaCG-Studio`, so the CLI cannot publish

**This one needs you, and it is the only thing this session needs from you.** It takes two minutes and
it is on npmjs.com, not in the repository. Until it is done, no session can publish `@noacg/cli` -
0.3.1 is built, tested, landed on `main` and refused by the registry.

## What happened

The repository moved from `miwco/NoaCG-Studio` to `NoaCG/NoaCG-Studio` on 2026-09-06 (`ea7f569c`).
npm's trusted publishing does not follow that move. It matches the publish request against a stored
**organisation or user + repository + workflow filename**, all exact, and it still has `miwco`. So
GitHub now presents a token that says `NoaCG`, npm finds no match, and hands back nothing.

npm then publishes with no credential at all and the registry answers `404 Not Found - PUT`, which
reads like the package is missing. It is not. Nothing about the package, the version or the
workflow is wrong.

0.3.0 published cleanly on 2026-09-05, the day before the move. That is the whole difference:
same workflow, same npm 12.0.2, same node, same everything else.

## The route, under a minute

**npmjs.com** -> sign in as `miwco` -> **Packages** -> **@noacg/cli** -> **Settings** ->
**Trusted publishing**. That is npm's own documented path, checked tonight rather than remembered.

**What to look at.** The GitHub Actions entry will say organisation **`miwco`**. That is the bug.
An existing entry cannot be edited, so delete it and add it again with:

| field | value |
|---|---|
| Organization or user | `NoaCG` |
| Repository | `NoaCG-Studio` |
| Workflow filename | `release-cli.yml` |
| Environment name | leave empty |
| Allowed actions | must include **direct `npm publish`**, not only `npm stage publish` |

That last row is new since 2026-09-03 and is easy to miss: npm now defaults a fresh configuration
to staging only, and a staging-only configuration refuses exactly the way the old one is refusing.

npm will ask for your 2FA at the point of saving. That challenge is why this cannot be automated,
and it is the only reason this item exists rather than the version simply being on npm.

## Then tell any session, or do it yourself

**Re-run the release that failed** - do not start a new one. On the repository's **Actions** tab,
open the failed **Release CLI to npm** run for `cli-v0.3.1` (run `34408194386`) and press **Re-run
all jobs**. From a checkout it is `gh run rerun 34408194386`.

Re-running is the right route because that run is pinned to the tag `cli-v0.3.1`, which points at
the exact commit that was built, tested and reviewed. Starting a fresh run against `main` instead
would publish whatever `main` has grown since - it has already moved twice tonight - and would hang
the GitHub Release off a commit that was never the one published.

It publishes 0.3.1 and creates the matching GitHub Release. You do not have to check anything
afterwards - say the word in a session and it will re-derive the result from the registry. If you
want to see it yourself, `npm view @noacg/cli version` should say `0.3.1`.

Nothing was published tonight, so nothing has to be taken back. The two failed runs are
`34408194386` and `34408479669`.
