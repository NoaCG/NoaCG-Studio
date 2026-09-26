---
kind: decision
date: 2026-09-10
needs: account
---
# Revoke the two npm granular tokens: nothing uses them any more

**Why it is yours.** It is on npmjs.com, in the account that owns `@noacg/cli`, which only you can
sign in to.

**Why it is worth two minutes.** The tokens published `@noacg/cli` 0.2.0 by hand before releases
moved to GitHub Actions. They bypass 2FA and can publish as you from anywhere they leak, and nothing
in this repository reads them now: the release workflow mints its own short-lived credential through
trusted publishing, and `npm run release:cli` verifies the published package from the registry.

**The route.** npmjs.com, your avatar, **Access Tokens**, and delete the granular tokens that name
this package. Nothing in the product changes. If you would rather not, say so and this file goes;
npm retires this token class by itself from about January 2027.
