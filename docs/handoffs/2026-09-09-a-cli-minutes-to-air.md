# The CLI's minutes to air, measured: 25 seconds of tool time, and the two holes the walk found

Branch `claude/a-cli-minutes-to-air`, from `main` at `ae5a32b9`. Two commits: `4c6c19b3` (the
walk, the measured section, the scaffold guard, two backlog files, the owner-queue item) and
`a997eabe` (the guard extended to every verb that takes a package, plus three corrections the
review caught).

The row's deliverable was a timed record, not an opinion. It exists: `docs/AGENT_CLI.md`, section
**"Time to air, measured"**, with the date, the machine, the entrance walked and a per-verb table.

## The number

Walked by hand on 2026-09-09, 11:07-11:18 UTC, from an empty directory outside the repo
(`C:\claude\noacg-cli-walk`), following `cli/README.md`'s Use block line by line, against this
checkout's dev server at `http://localhost:5290` with the CLI built from `cli/`. Every row is a
stopwatch reading, logged to JSONL as it happened rather than recalled afterwards.

| Verb | Wall clock | Exit |
|---|---|---|
| `doctor` | 2.4 s | 0 |
| `types` | 1.7 s | 0 |
| `scaffold --type scoreboard --design neutral` | 2.1 s | 0 |
| `validate --screenshots` | **10.7 s** | 0 |
| `inspect` | 1.9 s | 0 |
| `screenshot --state onair` | 4.0 s | 0 |
| `pack` | 2.0 s | 0 |
| `whoami` (against `https://noacg.studio`) | 3.8 s | 0 |
| `save` against the dev server | 0.3 s | 1, refused |

**24.8 s for the seven authoring verbs**, `validate` 43% of it. Setup, once per machine: 6.5 s
`npm install` + 2.2 s `npm run build` in `cli/`. Nothing needed a retry and nothing sat silent.

The graphic then went on air through the package's own control panel - the route
`GETTING-ON-AIR.md` names for anyone with no playout host: serve the folder over http, graphic in
one tab, `controlpanel.html` in another. **Play** took it on air (root opacity 0 -> 1, machine
`Off` -> `Enter`), **Goal A** moved the score (`HOME 0 AWAY 0` -> `HOME 1 AWAY 0`), **Stop**
returned it to `Off`. That leg took about six minutes as walked, and I have said so in the doc
rather than quoting the three product steps as the number - but two of those minutes were my own
browser tooling dropping a tab and handing me a stale element reference, not the product.

## What is left, and why

- **The cloud `save` and the studio's own output URL were not walked.** A valid production key is
  held on this machine (`whoami` answered), but writing into the owner's live library from an
  unattended session is a remote account write and this session's permission gate refused it. The
  client half of that path is covered by `cli/test/smoke.test.mjs` ("save drives the whole client
  path and stops at the server"), which passed here. **This is the one leg somebody should walk
  interactively before the 25th**, because it is the only part of "minutes to air" that has never
  been timed end to end by a person.
- **A local walk of `save` needs a checkout that carries `.env.local`.** The dev server does serve
  `/api/me/graphics` (I was wrong first time and the review caught it); a LINKED WORKTREE has no
  `.env.local`, so the endpoint answers `503 no account backend`. Anyone repeating this walk
  should do it in the primary checkout, or copy the env in.
- **The two findings I filed rather than fixed** are `docs/backlog/noacg-types-prints-a-table-no-terminal-can-show.md`
  (67 rows, widest line 354 characters) and `docs/backlog/neutral-scaffolds-fail-their-own-stress-bench.md`
  (three of six neutral scaffolds warn on their own bench). Both want a design decision, and the
  second wants a reproduction first - its obvious fix is already in the code, so the real cause is
  elsewhere.

## Traps that exist in no repo file

- **A timing wrapper that spawns with `shell: true` on Windows silently destroys quoted
  arguments.** Node warns about it (`DEP0190`) and the warning is easy to scroll past. My first
  `scaffold` run got `--name Football` plus a stray `scoreboard`, and I nearly filed a product bug
  for it. Re-running the command by hand with real quotes is what separated the harness from the
  product - and it turned out the CLI *was* wrong, just differently: it ignored the stray word.
  **Any timed walk should re-run its surprising result outside the harness before writing it down.**
- **The browser pane throttles requestAnimationFrame while it is hidden**, so a GSAP exit animation
  freezes mid-way and reads exactly like a graphic that will not come off air. It advances one step
  per screenshot. Measure a graphic's motion with `noacg screenshot` or the bench, never off DOM
  reads in a hidden pane.
- **`npm run test:e2e:*` refuses to start while this checkout's own dev server is up** (the guard
  hook is right - Playwright would adopt it). Stop the server first; `Get-NetTCPConnection
  -LocalPort <port>` finds the pid when the shell that started it is a background task.

## Anything that needs the owner

Nothing blocking. One thing to look at, in the owner queue as
`docs/acceptance/owner-queue/2026-09-09-minutes-to-air-is-now-a-number.md`: the wording of the new
refusal, which he meets by typing an unquoted `--name`. The route builds the CLI first and takes
under a minute.

## The check

`check: review delegated, simplify inline, verify green, taste not applicable.`

- **review: delegated** (`code-review`, level `high`, scope-checked against merge-base `ae5a32b9`
  and this worktree's branch). Six findings, all confirmed against the code before acting: the
  false claim about Vite and the API (fixed), the owner-queue route that assumed a built `dist`
  (fixed), a `touches:` path that does not exist and a prescribed fix that contradicts the CSS
  (both fixed), the same stray-argument hole still open on `save` (fixed, and extended to
  `validate`, `inspect` and `screenshot`), and a title that overstated the 25 s (fixed).
- **simplify: inline** - the skill returned fan-out instructions, which per `.agent-workflows/check.md`
  means the pass did not run, so I did it here. One change: `refuseStrayArgs` takes `0 | 1` rather
  than a `number`, which removes the pluralisation branch and types the intent. The call-site guard
  was kept over a central arity table in `index.ts` - every command in that file validates its own
  arguments, and `pack` and `caspar` would need an "any" case anyway.
- **verify:** `npm run build` exit 0 (read from the build's own status, not a pipe);
  `cli` unit tests 29/29; `npm run bench:cli` 6/6 against this branch's bridge, re-run after the
  final edit; `npm run test:e2e:affected` maps nothing (the diff is `cli/` and docs). CI on
  `4c6c19b3`: success, jobs Build, Factory gates, E2E plan and CI gate ran, E2E shards skipped by
  the plan.
- **taste: not applicable** - nothing in the diff can move what a graphic looks like. The one
  graphic I rendered (the neutral scoreboard's `onair.png`) I looked at, and it is correct: dark
  plate, amber accent, `HOME 0 / AWAY 0`, centred at the top of the frame.

## Pointers

- The measured section: `docs/AGENT_CLI.md`, "Time to air, measured".
- The raw timings: `C:\claude\noacg-cli-walk\walk.jsonl` (machine-local, not committed), with the
  scratch package, its screenshots and the pack file beside it.
- Commits `4c6c19b3` and `a997eabe`. Check stamp:
  `<git-common-dir>/noacg-jobs/checks/claude-a-cli-minutes-to-air.json`.
