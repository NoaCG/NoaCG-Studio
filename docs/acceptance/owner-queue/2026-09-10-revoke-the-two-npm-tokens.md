---
kind: owner-action
date: 2026-09-10
needs: account
---
# Revoke the two npm granular tokens - nothing uses them any more

**Two minutes on npmjs.com, and it is the last credential this project has.** Nothing is broken and
nothing is waiting on it. It is here because `docs/AGENT_CLI.md` has named it as your job since the
trusted-publishing switch and nothing tracked it, so it was never going to happen on its own.

## Why it is worth doing

Those tokens were how `@noacg/cli` 0.2.0 was published by hand, before the release moved into GitHub
Actions. They bypass 2FA, they can publish as you from anywhere they leak, and there is now no path
in this repository that reads them: `NPM_TOKEN` is already gone from `.env`, and the workflow mints
its own short-lived credential from GitHub's OIDC token. So they are pure standing risk with no
remaining use.

npm is retiring the whole class anyway. Since early August 2026 a 2FA-bypass granular token can no
longer perform sensitive account operations, and from about January 2027 it cannot publish at all -
only stage a publish for a human to approve with 2FA.

## The route, under a minute

**npmjs.com** -> sign in as `miwco` -> your avatar -> **Access Tokens**. Delete the two granular
tokens that name this package. Anything you do not recognise is worth deleting too: the release path
does not use a token at all.

**What to look at afterwards.** Nothing in the product changes. The proof that revoking cost nothing
is the next release: `npm run release:cli` publishes without a token either way, and it verifies the
published package from the registry rather than reporting a green run.

## If you would rather not

Say so and this gets deleted. The risk is real but small, and it shrinks by itself as npm retires
the credential class.
