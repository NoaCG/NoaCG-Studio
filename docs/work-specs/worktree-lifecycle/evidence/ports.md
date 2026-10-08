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
- This branch at 9214724b2, fresh worktree: `npm ci` exit 0 (09:09 UTC) and `npm run build` exit 0
  (09:27 UTC, 185 test files, 2518 tests), the registry unchanged after each (every file name and
  mtime compared). Afterwards `node scripts/dev-port.mjs --json` answered 5180, "not reserved
  yet": by then the 60 tickets were 27 minutes old with nothing listening, so a server start would
  take back the least recently claimed one (AC-5) - and still nothing had been written.
- A first run, on an earlier commit of this branch, got through `npm ci` (exit 0, registry
  unchanged) and the build's 2511 node tests (0 failures) and then stopped at `eslint` on two
  `no-useless-assignment` errors in this branch's own code - fixed, and the reason the run above
  was repeated on the final commit.

## AC-3: a build or test that starts no server takes no port

- `npm ci` in this worktree, which had no reservation: postinstall printed 5192 and the real
  registry still held 14 tickets, none naming this worktree. After two full `npm run build`s here
  (the last at 936717fa7 plus the landed-ref allowlist: exit 0, 2518 tests) and every test run of
  this session, the registry held 17 tickets (other rows' servers) and still none naming this
  worktree.
- `scripts/dev-port-readonly.test.mjs` (build tier): loads all three Playwright configs and
  resolves the Vite config for `build` and for a middleware-mode server, and asserts the registry
  directory is unchanged (names and mtimes); also runs postinstall and every question from a fresh
  linked worktree facing a full registry.
- `node --test scripts/catalog-cost.test.mjs scripts/e2e-readiness.test.mjs
  scripts/pro-harness-exemplars.test.mjs` with no `DEV_PORT`: pass, and no ticket for this worktree
  appeared. The full-registry build above runs the same three under a registry where any
  reservation attempt would have failed.

## A real server start reserves its port

Queued job j-3690, `npx playwright test e2e/analytics.spec.ts e2e/canvas-fit.spec.ts`, in this
worktree with no reservation: Playwright started `npm run dev -- --host 127.0.0.1 --port 5192
--strictPort`, Vite's `noacg-dev-port` plugin reserved exactly 5192, and the run passed (1 passed,
2 skipped by the specs' own conditions). `.claude/dev-port.json` afterwards: port 5192, source
"reservation", ticket `5192.json` - the first ticket this worktree ever held.

## AC-5: a server start takes back an idle reservation

`scripts/port-registry.test.mjs` ("a full registry") and `scripts/dev-port-readonly.test.mjs`
("with every port reserved but idle"): with 60 tickets claimed an hour ago a claim takes the least
recently claimed one, one ticket replaced and none added; claimed recently, the claim refuses and
says none is idle; a reservation whose server answers is never taken.
