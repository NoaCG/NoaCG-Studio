# AC-3, AC-4, AC-5: ports

Recorded 2026-10-08 on the owner's Windows machine, branch `claude/l-worktree-self-cleanup`.

## AC-4: with every port reserved, a fresh worktree installs and builds

Scratch clone (`git clone --shared`, so the real repository was only read), driven by a script kept
outside the repository (`sim-full-registry.mjs`, in the session scratchpad):

- 63 registered worktrees: the primary, 60 holders (`git worktree add --detach --no-checkout`), a
  fresh worktree on this branch and a control on `origin/main`. 60 tickets in the scratch
  `.git/noacg-dev-ports/`, each naming one registered holder.
- CONTROL, `origin/main`'s code, postinstall's first command `node scripts/dev-port.mjs`: exit 1,
  "No dev-server port is available for ...control-old-code." - the 2026-10-08 failure, reproduced.
- This branch, fresh worktree: `npm ci` exit 0 and `npm run build` RESULT_BUILD, the registry
  unchanged after each (every file name and mtime compared).
- A first run, on an earlier commit of this branch, got through `npm ci` (exit 0, registry
  unchanged) and the build's 2511 node tests (0 failures) and then stopped at `eslint` on two
  `no-useless-assignment` errors in this branch's own code - fixed, and the reason the run above
  was repeated on the final commit.

## AC-3: a build or test that starts no server takes no port

- `npm ci` in this worktree, which had no reservation: postinstall printed 5192 and the real
  registry still held 14 tickets, none naming this worktree.
- `scripts/dev-port-readonly.test.mjs` (build tier): loads all three Playwright configs and
  resolves the Vite config for `build` and for a middleware-mode server, and asserts the registry
  directory is unchanged (names and mtimes); also runs postinstall and every question from a fresh
  linked worktree facing a full registry.
- `node --test scripts/catalog-cost.test.mjs scripts/e2e-readiness.test.mjs
  scripts/pro-harness-exemplars.test.mjs` with no `DEV_PORT`: pass, and no ticket for this worktree
  appeared. The full-registry build above runs the same three under a registry where any
  reservation attempt would have failed.

## AC-5: a server start takes back an idle reservation

`scripts/port-registry.test.mjs` ("a full registry") and `scripts/dev-port-readonly.test.mjs`
("with every port reserved but idle"): with 60 tickets claimed an hour ago a claim takes the least
recently claimed one, one ticket replaced and none added; claimed recently, the claim refuses and
says none is idle; a reservation whose server answers is never taken.
