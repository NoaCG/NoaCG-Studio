---
v: 1
source: owner
kind: ask
raised: 2026-09-10
state: filed
asked: "can we keep main always up to date inside the 20 euro"
---
# `version.json` should answer "is production current?" by itself

**Filed:** 2026-09-10, out of the owner's walk of
`docs/acceptance/owner-queue/2026-09-07-main-no-longer-always-deploys.md`.

## The problem, which is not the one it looks like

Since 2026-09-07 a push to `main` that touches only documentation, contracts, tooling or tests is
not built, because it would produce a byte-identical site. Half of them are. The saving is real:
719 builds cost $32.39 against a $20 credit last cycle, and 48% of them rebuilt nothing.

What it cost is the ONE-LINE ANSWER. `https://noacg.studio/version.json` used to be comparable
against the tip of `main` by eye: equal meant current. Now a difference is usually correct and
occasionally an incident, and telling those apart means diffing the two commits against the
deploy-affecting path list.

The owner's first instinct was to buy the old answer back by rebuilding everything again. That
costs roughly $19-25 a cycle against a $20 credit - it straddles the limit, and the decision was to
keep the filter and pay nothing instead (see the calendar row `vercel-build-cost` in
`scripts/check-vendored-versions.mjs`, which reads the real number when the cycle closes).

So the answer is to make the file say the thing directly, rather than to make the old comparison
true again by spending money.

## What to add

`scripts/write-version.mjs` writes the stamp. Add to it, alongside `commit`:

- the newest DEPLOY-AFFECTING commit as of the build, from the same
  `scripts/deploy-affecting-paths.mjs` list the skip and the drift check already share;
- a plain boolean saying whether the deployed commit IS that commit.

Then "is production current?" is read off the file with no second lookup, a human gets a yes or no
rather than two hashes, and the three mechanisms that must agree about which files matter -
`vercel-ignore-build.mjs`, `deploy-verify.yml`'s drift check, and the public stamp - all read one
list. That last point is the real argument: a stamp computed from its own idea of what counts would
be a fourth opinion, and the header of `deploy-affecting-paths.mjs` explains why there must not be
one.

## What NOT to do

Do not remove `commit`. It is what the drift alarm compares and what B1 of `docs/DEMO_2026-09-25.md`
tells whoever checks the site on the morning of the 25th to read. This is an added field, which
under the versioning invariant is additive and bumps nothing.
