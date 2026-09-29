# A local npm can accept a lockfile that CI's npm refuses

**Filed:** 2026-09-29. **Source:** measurement. Pull request #521 went red on every job after a
lockfile change that installed cleanly on the machine that wrote it.

## Why

Nothing pins the npm version. `engines` names only `node: 24.x`, and `ci.yml` installs "Node 24"
on the stated reasoning that npm then "validates the lockfile exactly the way the machine that
wrote it does" (the comment above `setup-node` in the Build job). That assumption does not hold.
Node 24.13.0 on the development machine ships npm 11.6.2, while CI resolved Node 24.21.0 with
npm 11.19.0, and the two disagree about what a valid lockfile is.

Local npm 11.6.2's `npm audit fix` in `player-host/` pruned the optional peer entries for
`@emnapi/core` and `@emnapi/runtime` from `player-host/package-lock.json`, and its own `npm ci`
accepted the result. CI's npm 11.19.0 refused it as out of sync. The player-host install runs
inside the root `postinstall`, so the Build job's `npm ci` failed, and every job after it went
red: 26 failed checks from one lockfile. The branch had passed `npm run build` and `/check`
locally, so the local gate could not see this class of failure at all. It costs a full CI round
and a re-queue each time, and it will recur on the next lockfile change made with an older local
npm.

## What it would take

Pick one, smallest first:

- Pin npm for the repository, for example `"packageManager": "npm@11.19.0"` with Corepack, or
  `engines.npm` plus `engine-strict=true` in `.npmrc`, so a lockfile is written by the npm CI
  uses. That needs a decision on how CI's npm follows the pin: `setup-node` resolves the newest
  24.x, and its bundled npm moves with it.
- Or add a cheap pre-queue check: for each `package-lock.json` in the diff (root, `player-host/`,
  `render-worker/`), install it with CI's npm (`npx npm@<version> ci --ignore-scripts`) into a
  scratch copy, as part of `npm run build` or `/check`.
- Either way, correct the `ci.yml` comment, which states the invariant as if it held.

## Evidence

- CI failure: Build job 109321558112 in run 36542671508 on PR #521, `npm error code EUSAGE`,
  "Missing: @emnapi/core@1.11.3 from lock file", after `[player-host] npm ci`.
- Reproduced in a scratch copy of `player-host/`: `npx npm@11.19.0 ci --ignore-scripts` exits 1
  with the same three errors on the pruned lockfile, and exits 0 on main's lockfile with only the
  postcss and nanoid entries changed (commit 88f635e49).
- Versions: local `node -v` v24.13.0 with npm 11.6.2; CI "node: v24.21.0", whose bundled npm is
  11.19.0 per nodejs.org/dist/index.json.
