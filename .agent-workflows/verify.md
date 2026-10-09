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

Locally the checks are targeted. The full build, every gate and the browser suites run on GitHub
Actions, on the pull request and again on the merge group, and nothing reaches `main` without
them; local runs only catch mistakes early, and the machine has to stay responsive for the agents
sharing it. The job queue and the affected planner refuse a whole-suite run.

| The change touches | Run on this machine |
|---|---|
| anything | the gates that reach the change: `npm run gates -- run --changed origin/main` (the tests guarding each touched script, and the cheap checks) |
| TypeScript | `npx eslint <changed files>` and `npx tsc --noEmit -p <tsconfig.json or tsconfig.api.json>` |
| something visible in the product | the one or two specs covering exactly that change, `npm run queue -- "npm run test:e2e -- e2e/<name>.spec.ts"` (`node scripts/e2e-affected.mjs --list --files <changed>` names candidates); then run it: `npm run dev:worktree` on this checkout's port, walk the flow in the browser, read the console and network, take a screenshot, and compare with each criterion |
| what a graphic looks like | `npm run queue -- "node scripts/taste-frame-review.mjs --affected"`, open every frame, answer `docs/VISUAL_TASTE_REVIEW.md` |
| catalog designs or shared template machinery | the battery `node scripts/catalog-affected.mjs` prints |
| how instructions load | `node scripts/instruction-load-probe.mjs run <files>` for Claude, a fresh root and nested Codex run for Codex |

A risky change, or a CI failure to reproduce, may run a larger named set of specs, never the
whole suite. Browser-driving work goes through `npm run queue`: one browser job runs per machine.

## 3. Loop until it holds

Reproduce the failure or the missing behaviour first, change, re-run, look at the result. After
three attempts on the same failure, stop and report what you tried; do not chase it further.

## 4. Record the evidence

For each criterion: pass, fail or not checked, with the command and what it showed (a test line, a
screenshot path, a log line). Report what you did not check. The check workflow's stamp records
the verify leg's mode; this evidence goes in the commit or the pull request.

## 5. Ask a person only where judgment adds value

Everything an agent can verify, it verifies. Something reaches the owner only when human judgment
genuinely helps, and never as a note for him to read later. A look at the change (a quick one he
can take on his phone, or a desktop or production check where product judgment matters) goes in
the pull request comment: what to open, where, and what to judge.

A decision only he can make, or a step only he can take, is asked at once, never filed as a
`needs owner` issue:

- **He is in the session**: ask him there, one question with your recommendation, and continue
  from his answer.
- **Unattended work** (a wave row or a plan run): decide it yourself and record the decision in the
  pull request, where he can revert it. A step only he can take, and what his instructions reserve
  (money, accounts, an important security or privacy boundary, something genuinely hard to undo),
  are not decided: that item stops, the rest of the work goes on, and the coordinator asks him in
  its own session with a phone notification.

A refused production migration keeps its own route. No file is written for any of these, and
agent-verifiable work never reaches him just because it changed the product.
