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

Local implementation, review and targeted verification are always allowed without asking.
Use qualified cloud execution when useful; unavailable cloud execution does not block local work.
Device/private local work stays local.
Select resources on the executing worker with `node scripts/execution-profile.mjs`, never from
the coordinator's profile. GitHub Actions retains authoritative full PR/merge-group checks.
Local checks and all existing local guards remain targeted; whole suites are refused off Actions.

Before supported manual Actions dispatches, inspect existing job/run evidence with
`node scripts/verification-dispatch.mjs -- workflow run <workflow> --ref <ref> ...`.
The active GitHub Teams CI/E2E experiment uses observation only: report would
WAIT/REUSE/RUN or UNRESOLVED, then preserve the existing dispatch behavior, order,
failure handling and retry restrictions. Missing identity/reports never pass;
observation does not prevent duplicates. See
`docs/work-specs/verification-observation/runbook.md` for exact identity, supported
paths, evidence gaps and the separate owner-confirmed activation procedure.

A cloud worker uses what its machine has and runs browser and e2e checks itself (owner,
2026-10-17, replacing the resource defaults of issue #1301 comment 6223002051). Only the laptop
watches RAM and keeps its memory ladder and floors. The session start prints the cloud
machine's CPUs, memory and e2e workers.

- Browser workers: one for every two visible CPUs (more failed boot checks here and saved no
  time), as many as the memory headroom holds; no fixed cap and no queue RAM floor. A cgroup
  reading that fails falls back to the machine's own CPUs and memory, never to one worker. The
  worker selector refuses CLI and environment overrides above that count.
- Small affected browser selection: at most five minutes. One relevant broader selection or
  maintained shard: at most twelve minutes.
- Run a production build only for build/bundle/dependency/entrypoint/packaging risk, once per
  committed reviewed source state, capped at five minutes on Codex or ten on Claude.
  Docs/copy need no build unless build inputs.
  Decide build need first; a completed production build includes lint/type/dependency and build
  gates, so reuse those results instead of running them twice. Run any separate affected factory
  or browser checks the build does not include. No repeated build on an unchanged source state.
- Larger affected selections/whole suites remain in Actions. Failed/incomplete runs stay so;
  no assertion, baseline, CI limit or retry policy changes.

Browser work uses the existing queue. List the affected plan first; it reports the executing
worker's five/twelve-minute choice. Queue a named small selection with `--cap 5`, or one relevant
broader selection with `--cap 12`; the queue refuses caps/worker overrides above current limits.
For example `node scripts/jobs.mjs add "npm run test:e2e -- e2e/downloads.spec.ts" --cap 5`.
Use the same queue for a risk-triggered `npm run build`, with the applicable cap. Commit first:
queue records pin build/broader admissions to HEAD and reject duplicate admissions, including
failed/incomplete attempts. Inspect that job; fix the cause in a new reviewed source state.
An interrupted admission lock stops reconciliation; inspect its owner-pid and existing jobs,
and remove only a proven abandoned lock before retrying. It is not a second execution ledger.

Use `cloud-delegate` for native launch/result/recovery routing. The table below names targeted
checks; apply it only to work not already covered by the required production build.

| The change touches | Run on this machine |
|---|---|
| anything | the gates that reach the change: `npm run gates -- run --changed origin/main` (the tests guarding each touched script, and the cheap checks) |
| TypeScript | `npx eslint <changed files>` and `npx tsc --noEmit -p <tsconfig.json or tsconfig.api.json>` |
| something visible in the product | its affected specs, run on this machine before `/queue-merge`, in the cloud too: leaving them to CI is not enough. `npm run queue -- "npm run test:e2e -- e2e/<name>.spec.ts"` (`node scripts/e2e-affected.mjs --list --files <changed>` names them; past the bounds above, the one or two covering exactly that change); then run it: `npm run dev:worktree` on this checkout's port, walk the flow in the browser, read the console and network, take a screenshot, and compare with each criterion |
| what a graphic looks like | `npm run queue -- "node scripts/taste-frame-review.mjs --affected"`, open every frame, answer `docs/VISUAL_TASTE_REVIEW.md` |
| catalog designs or shared template machinery | the battery `node scripts/catalog-affected.mjs` prints |
| how instructions load | `node scripts/instruction-load-probe.mjs run <files>` for Claude, a fresh root and nested Codex run for Codex |

A risky change or CI reproduction may use the one bounded broader named selection in cloud;
larger selections and whole suites stay in Actions. Browser-driving work goes through `npm run queue`: one browser job runs per machine.

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
the pull request description as a review step anyone could take (what to open, where, and what to
judge), and is said to him in the final message.

A decision only he can make, or a step only he can take, is asked at once, never filed as a
`needs decision` issue:

- **He is in the session**: ask him there, one question with your recommendation, and continue
  from his answer.
- **Unattended work** (a wave row or a plan run): decide it yourself and record the decision in the
  pull request, where he can revert it. A step only he can take, and what his instructions reserve
  (money, accounts, an important security or privacy boundary, something genuinely hard to undo),
  are not decided: that item stops, the rest of the work goes on, and the coordinator asks him in
  its own session with a phone notification.

A refused production migration keeps its own route. No file is written for any of these, and
agent-verifiable work never reaches him just because it changed the product.
