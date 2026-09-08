# Dev-server ports across worktrees

Several worktrees of this repo are usually active at once, and each needs its own Vite dev
server running at the same time. This is how each checkout gets a port it can actually start
on, without anyone picking numbers by hand.

## How a port is assigned

Two steps: a **preference** (deterministic, path-derived) and an **assignment** (a reservation
in a registry shared by every worktree of the repo).

| Checkout | Port | Live e2e port |
| --- | --- | --- |
| Primary checkout | 5174 | 5175 |
| Linked worktree | reserved from **5180-5298** (even) | the reserved port + 1 |
| `DEV_PORT=n` set | `n` | `n + 1` |

1. **Preference.** `preferredPort()` (`scripts/port-registry.mjs`) hashes the checkout's
   absolute path - normalised to forward slashes and lowercased - with djb2 and maps it onto
   one of the 60 even ports in 5180-5298. Same path, same number, on every run, in every tool,
   with no coordination.
2. **Assignment.** 60 slots collide. (Real example: six worktrees on one machine, three of
   them preferring the same port. Vite runs with `strictPort`, so only the first could start,
   and the repo's guards correctly refuse a hand-started server, a hand-picked port, or an
   edited `launch.json`.) So the preference is only where the search *starts*.
   `allocatePort()` walks the range from there and takes the first port that is free, creating
   a **ticket file** to claim it. The walk steps 7 slots at a time - coprime with 60, so it
   visits every port exactly once before giving up.

Once a checkout holds a ticket, that ticket **is** the assignment: it is reused on every later
run, so the number stays stable across restarts, reboots and branch switches.

## Where the port is recorded

- **The reservation (authoritative):** one ticket file per reserved port, in the repo's shared
  git directory - `<git-common-dir>/noacg-dev-ports/<port>.json`, e.g.
  `C:/claude/NoaCG-Studio/.git/noacg-dev-ports/5228.json`. Every worktree of the repo sees the
  same directory, nothing outside the repo does, and it disappears with the repo. Each ticket
  records `{ port, livePort, root, preferred, createdAt }`.
- **The claim lock (transient):** `claim-<digest of the checkout path>.lock`, in that same
  directory, held only while one checkout is choosing its port. Two tools in one worktree
  (vite and playwright, say) would otherwise each run the whole walk and each write a ticket,
  and reconciling afterwards is too late - the first has already returned its number. Locks
  are per checkout, so different worktrees still race for ports at full speed. One left behind
  by a killed process is untouched for five seconds and the next allocation takes it over; you
  can also just delete it.
- **The published record (per worktree):** `.claude/dev-port.json`, rewritten from the
  reservation on every resolution. It is a *mirror* for tools and humans - the ticket decides.
- **The preview launch config:** `.claude/launch.json`, generated with the same number so
  `preview_start {name: "dev"}` lands on the right server.

Both generated files are gitignored, and both are blocked from hand-editing by
`scripts/hooks/guard-edit.mjs`.

Everything else derives the port by importing `scripts/dev-port.mjs`: `vite.config.ts`,
`playwright.config.ts`, `playwright.live.config.ts`, `e2e/_offline-guard.ts`, the shell guard
hook, and the dev scripts (`l3-sweep`, `ai-bench`, `ai-compare`, `video-bench`, the render
smokes, `factory`, `acceptance-shots`). There is no second source of the number.

## Starting a dev server

```bash
npm run dev:worktree            # serve THIS checkout on its reserved port
node scripts/dev-worktree.mjs --print   # where it would serve, starting nothing
node scripts/dev-port.mjs --base        # just the URL, for a sweep's --base
```

`npm run dev:worktree` (`scripts/dev-worktree.mjs`) works in any checkout and is the **only**
thing that works in a linked worktree. It resolves the checkout from its own file location rather
than the working directory, binds that checkout's reservation, and **refuses when that port is
already busy** - which is the hazard `npm run dev` is refused for, since Playwright's
`reuseExistingServer` would adopt a stray server along with its env. It runs in the foreground,
so the shell that started it owns it.

Killing that shell task does not always take Vite with it - an interrupt is forwarded, a hard kill
of the wrapper leaves the grandchild holding the port. It spawns the real `vite/bin/vite.js` so
the leftover at least shows up in `node scripts/e2e-runs.mjs --orphans`. **Treat that list as a
place to look, not a verdict**: a healthy server appears in it whenever the shell that launched it
has since exited (measured both ways, 2026-09-01), the checkout it names is whichever one supplied
Vite rather than whichever one is being served, and run from the primary checkout it covers every
worktree at once. Identify the process before closing anything - on Windows,
`netstat -ano | findstr :<port>` then `tasklist /fi "pid eq <pid>"`.

**A running dev server blocks that checkout's e2e runs**, on purpose: the guard's port check
refuses them, because Playwright would adopt this server and its ambient `.env` instead of
starting one with the offline-pinned vars its config sets. A sweep and a suite in the same
checkout are mutually exclusive; stop the server before running specs.

**`preview_start {name: "dev"}` does not reach a linked worktree.** Measured 2026-09-01 from
`.claude/worktrees/agent-a32e0b6091a2fe4bb`, whose reservation is 5256: one call spawned
`npm run dev` with cwd `.claude/worktrees/new-session-64a3f6` (the *launching* session's
checkout), reported `port: 5174` (the *primary* checkout's), and Vite bound 5240 (the reservation
of the tree it was spawned in - that part is correct, because `vite.config.ts` resolves from its
own location). Nothing answered on the reported port, so the harness reaped the server about two
minutes later. Three checkouts in one answer, and no server. In the **primary checkout** it is
still fine and still preferred, because the preview tools own the process and `preview_stop`
closes it.

This is the gap that made the 2026-08-29 SVG import sweep measure `main`'s importer rather than
the branch's (`docs/backlog/svg-import-sweep-findings.md`). Any script that drives a running
server takes `--base`; `node scripts/dev-port.mjs --base` prints the URL to hand it, and
`scripts/svg-import-sweep.mjs` defaults to exactly that and prints which server it drove.

## Whose port is it? The answer is the TARGET, never the caller

Every checkout carries its own copy of `scripts/dev-port.mjs`, and each copy resolves from its
**own location**. That is what makes the answer per-worktree - and it is also the trap. A tool
that imports the copy sitting next to it, or reads its own `process.cwd()`, answers for whichever
checkout it happens to live or run in, which is not always the checkout the work is about:

- a session's own directory may be the **main checkout** while every command it runs targets a
  worktree by absolute path;
- a hook runs with whatever directory the harness launched it in, not the session's;
- `preview_start` serves neither reliably - it serves whatever checkout the *harness process*
  sits in, and reports a port from somewhere else again (see "Starting a dev server" above).

The cost is silent and one-directional: **a judgement made against the wrong checkout's port
looks exactly like a real refusal.** On 2026-08-29 the shell guard refused four integration runs
against port 5174 - the main checkout's busy port - while the port those runs would have used sat
free.

So anything asking a per-checkout question resolves the checkout **from what the command targets**:

- `scripts/command-target.mjs` - `commandCheckout(text, baseDir)` gives the checkout root a shell
  command acts on: its `cd` / `pushd` / `Set-Location` chain first, then an absolute path it names
  for what it runs (`node <abs>/scripts/x.mjs`, `npm --prefix <abs>`, `--config <abs>`), then the
  base directory. `devPortOverride(text)` reads a `DEV_PORT=n` the command sets for itself, which
  beats everything at runtime and therefore beats everything here.
- `portsFor(root)` in `scripts/dev-port.mjs` - the port record for **any** checkout of this repo.
  It loads that checkout's own copy of the module and asks it, rather than re-implementing the
  resolution against a foreign path, and it does not write the mirror files of a directory it does
  not own. `scripts/hooks/session-start.mjs` has always done the same thing by hand.
- A hook takes its base directory from the **event's `cwd` field**, never `process.cwd()`.

`scripts/command-target.test.mjs` pins all of it.

## Concurrency

A ticket is created with the exclusive `wx` flag. That is the whole concurrency mechanism: the
filesystem decides who won when two worktrees start in the same instant, and the loser sees
`EEXIST` and walks on. No lock files, no timeouts, no cleanup obligation on the fast path.

Two tools inside *one* worktree can also allocate at the same moment (Vite and Playwright, for
instance). Both reconcile on a rule they compute identically - lowest port wins, the loser
releases - so the worktree still ends up with exactly one port.

## Ownership rules

- A ticket naming an **active** worktree is untouchable, whether or not its server is running.
  A worktree owns its port for as long as it exists; that is what makes the number stable.
- A ticket naming a worktree git no longer lists is **stale** and is reclaimed - on the next
  allocation that lands on it, and by the sweep at session start.
- A ticket that does not parse blocks its slot but is never auto-deleted: a torn read during
  someone else's write must not cost them their port. `--prune` clears those explicitly.
- A port that answers TCP while **nobody holds a ticket** for it belongs to something outside
  the repo - a zombie server from a removed worktree, or an unrelated app. The claim is handed
  back and the walk continues. The process is never signalled: killing another session's server
  is the exact failure this whole mechanism exists to prevent.

## Commands

```bash
node scripts/dev-port.mjs
```

Prints this checkout's port and refreshes the generated files. `--base` prints the server URL on
its own, which is what a sweep's `--base` flag wants. `--json` prints the full record
(port, live port, preference, source, ticket path). `--list` shows every reservation in the repo
with its holder and whether that holder is still active. `--prune` releases reservations whose
worktree is gone. `--release` gives *this* checkout's reservation back - never anyone else's.

## Troubleshooting

**Vite fails with "Port XXXX is already in use" (`strictPort`).**
Something outside the registry is on this checkout's reserved port. Find out what:

```bash
node scripts/dev-port.mjs --list
```

- The port is listed against **another active worktree**: that worktree legitimately owns it
  and this checkout should not have that number. Something re-derived a port instead of reading
  the reservation - check `.claude/launch.json` matches `node scripts/dev-port.mjs`.
- The port is listed against **this checkout** but a foreign process holds it: a genuinely stuck
  server, most often one left behind by a worktree that has since been removed. Identify the
  owning process before doing anything (`netstat -ano | findstr :5228` on Windows, then
  `tasklist /fi "pid eq <pid>"`). If it is yours and dead weight, stop it. If you cannot tell
  whose it is, do not kill it - move this checkout instead:

```bash
node scripts/dev-port.mjs --release
```

The next resolution allocates a different port, skipping the occupied one automatically.

**The e2e suite refuses to start ("something is already listening on port ...").**
That guard is doing its job: Playwright runs with `reuseExistingServer: true`, so it would
adopt whatever server is there along with whatever env it was started with. Stop your own dev
server and re-run - `preview_stop` if the preview tools started it, otherwise stop the shell task
running `npm run dev:worktree`. Servers in *other* worktrees are harmless - they are on their own
ports.

**A worktree's port changed.**
Expected in exactly two cases: its preference was taken when it first allocated (session start
says so - "preferred NNNN was taken"), or its reservation was released. It never changes on its
own while the ticket exists.

**Nothing is available at all.** `allocatePort` throws with the full list of who holds what.
Remove finished worktrees with the shared cleanup workflow
(`/cleanup-worktrees` in Claude Code or `$cleanup-worktrees` in Codex), then run
`node scripts/dev-port.mjs --prune`.

## Tests

`npm run test:ports` (`scripts/port-registry.test.mjs`) covers distinct preferences, a real
hash collision, an occupied preferred port, six processes allocating simultaneously, stale
reservation recovery, and the whole tool chain reporting one number.
