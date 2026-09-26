# verify - prove the change does what it should

Shared canonical procedure, invoked as `/verify` in Claude Code and `$verify` in Codex. It is the
verify leg of the check workflow, and the landing queue refuses a tip whose check stamp has no
passing verify leg, whichever agent did the work. There is one verification path, not one per tool.

The question is never "did the build pass" but "does the change do what it was meant to do".

## 1. Know what "done" means

Take the acceptance criteria from the spec, the work prompt's GOAL, or the `docs/GOALS.md` outcome
the work serves. If none are written, write them now: one observable line each ("importing an SVG
with a text layer inside a rectangle keeps the text inside it at 40 characters"). A criterion you
cannot observe is not a criterion yet.

## 2. Pick the checks the change needs, no more

| The change touches | Run |
|---|---|
| anything | `npm run build`, reading its own exit code (`npm run build > log 2>&1; echo $?`) |
| a script or tool | the tests that guard it (`// guards:` headers; `npm run gates -- list --changed origin/main`), `node --test <file>` |
| product code | `npm run queue -- "npm run test:e2e:affected"`; after taking `main` in, `test:e2e:integration` |
| something visible in the product | run it: `npm run dev:worktree` on this checkout's port, walk the flow in the browser, read the console and network, take a screenshot, and compare with each criterion |
| what a graphic looks like | `npm run queue -- "node scripts/taste-frame-review.mjs --affected"`, open every frame, answer `docs/VISUAL_TASTE_REVIEW.md` |
| catalog designs or shared template machinery | the battery `node scripts/catalog-affected.mjs` prints |
| how instructions load | `node scripts/instruction-load-probe.mjs run <files>` for Claude, a fresh root and nested Codex run for Codex |
| docs only | the build (its doc gates cover links and budgets) |

Browser-driving work goes through `npm run queue`: one browser job runs per machine.

## 3. Loop until it holds

Reproduce the failure or the missing behaviour first, change, re-run, look at the result. After
three attempts on the same failure, stop and report what you tried; do not chase it further.

## 4. Record the evidence

For each criterion: pass, fail or not checked, with the command and what it showed (a test line, a
screenshot path, a log line). Report what you did not check. The check workflow's stamp records
the verify leg's mode; this evidence goes in the commit, the pull request or the handoff.

## 5. Ask a person only where judgment adds value

Everything an agent can verify, it verifies. An item goes to `docs/acceptance/owner-queue/` only
when human judgment genuinely helps, and it names its kind: `decision` (only the owner can decide
it), `phone` (a quick look he can do on his phone) or `desktop` (a desktop or production check
where product judgment matters). Agent-verifiable work never enters the queue just because it
changed the product.
