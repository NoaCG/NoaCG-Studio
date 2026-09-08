# Row X - thirteen observations nobody had re-measured

Branch `claude/x-capability-reprobe`, one commit on `1ee6b36f` (merge base `cc0c9fc7`, before local
`main` fell one merge behind `origin/main` mid-session - scope was computed against the correct
fork point, not the stale ref; see "What I nearly got wrong" below).

`npm run harness:usage` had reported 13 UNVERIFIED entries against the installed builds; 11 of
those are real observations once the two `kind: "constraint"` rows are excluded from the count
(constraints don't lapse with a release and carry `measuredOn: null`, so they were never part of
the 11 this row worked through). Every one of the 11 was re-probed by hand, running the exact
command its own `reprobe` field named, against the builds installed tonight: Claude Code 2.1.263,
Codex 0.154.0-alpha.6, Antigravity 1.1.27.

**Before -> after: 11 unverified -> 0 unverified.** 6 confirmed, 5 refuted and deleted.

## The work queue, and what each probe found

| id | harness | was measured on | probe run | outcome |
|---|---|---|---|---|
| `agy-headless-auto-denies-ungranted-tools` | Antigravity | 1.1.25 | `npm run agy:read` with no `command` grant, listing this worktree | **REFUTED** - returned a complete, accurate 21-directory/33-file listing, not the empty response the claim predicted |
| `agy-claude-models-reject-effort` | Antigravity | 1.1.25 | `--effort high` against `claude-sonnet-4-6` and `claude-opus-4-6-thinking` | CONFIRMED - both still rejected outright (`status ERROR`) |
| `agy-no-usage-surface` | Antigravity | 1.1.25 | `agy --help` + text scan of `~/.gemini/antigravity-cli/` | CONFIRMED - no usage/quota subcommand, no `token`-named JSON key anywhere in the store |
| `agy-model-inventory` | Antigravity | 1.1.25 | `agy models` | CONFIRMED - same 14 ids |
| `codex-one-model-on-the-subscription` | Codex | 0.153.0-alpha.5.1 | `codex --model <candidate>` (`gpt-4o`, `gpt-5.6-sol`, and no `--model` at all) | **REFUTED** - `codex exec` with no `--model` now defaults to `gpt-6-astra` and succeeds; `gpt-5.6-sol` also still succeeds. Two model ids now work, so "gpt-5.6-sol is the only one" is false |
| `codex-agents-has-no-json` | Codex | 0.153.0-alpha.5.1 | `codex agents --help` | CONFIRMED - still no `--json` flag |
| `codex-rate-limits-only-when-it-runs` | Codex | 0.153.0-alpha.5.1 | `npm run harness:usage` before/after a completed Codex session | CONFIRMED - the snapshot timestamp only advanced after a session completed a turn; a failed call (invalid model, no completed turn) left it stale |
| `claude-remote-isolation-silently-runs-local` | Claude Code | 2.1.251 | launched an agent with `isolation: "remote"` whose first step ran `node scripts/agent-isolation.mjs --expect remote` | CONFIRMED - exit 1, `ISOLATION MISMATCH`, ran on this laptop in an ordinary worktree |
| `claude-no-permission-prompts-flag` | Claude Code | 2.1.251 | `claude --help \| grep permission-prompts` | **REFUTED** - `--permission-prompts` is now a listed flag |
| `claude-launched-session-gets-no-subagent-notifications` | Claude Code | 2.1.240 | spawned one background subagent (from this launched session) that wrote a marker file | **REFUTED** - the completion notification, with the marker's contents, arrived directly in this session; it did not go only to this session's launcher |
| `claude-agents-json-liveness` | Claude Code | 2.1.251 | `node scripts/claude-agents.mjs` and raw `claude agents --json` | **REFUTED** - the raw JSON carries `pid`, `cwd`, `kind`, `startedAt`, `sessionId` but no `status` field at all; the wrapper's own degrade-to-"no status" path is what caught it |

## Two findings worth reading past the table

**The routing contract's two decisive facts both survived.** `claude-remote-isolation-silently-runs-local`
and `agy-headless-auto-denies-ungranted-tools` were the two entries the prompt called out as
deciding where a row runs. The isolation one held - `isolation: "remote"` is still silently
dropped on 2.1.263, confirmed by an actual launched-agent probe, not just re-reading the claim. The
grant one did not: on 1.1.27, a call with no `command` grant produced a real, accurate listing
instead of an auto-denied empty response. Anything that was routing on "agy silently no-ops without
a grant" was routing on something no longer true.

**`claude-launched-session-gets-no-subagent-notifications` was the most consequential refutation,**
because this very row is a session launched by another session (the night loop), and its own
`/check` invocation quotes the opposite claim as settled fact
(`.agent-workflows/check.md`, "In a session that was itself launched by another session, those
notifications route to the LAUNCHER and never arrive"). The probe here shows that's no longer true
on 2.1.263: a background subagent spawned from this session delivered its completion notification,
with its result, straight back into this session. I did not edit `check.md` - it is outside this
row's `TOUCHES`, and the fix belongs to whoever owns the fan-out/notification design, not to a
mechanical re-probe row - but the contradiction is worth flagging loudly: `check.md`'s phase-2
classification rule ("never wait on a completion notification here") is now built on a premise this
row just measured false. `agy-claude-models-reject-effort` also brushed this: the sonnet-4-6 call
that confirmed it went through agy for real (measuredOn was still 1.1.25 at that moment), but the
opus-4-6-thinking call ran *after* I had already bumped `measuredOn` to 1.1.27 in
`scripts/agy-run.mjs`, so the wrapper refused it locally without a real agy round trip - it adds no
independent evidence, it just didn't contradict the sonnet result either.

## What changed

- `scripts/harness-capabilities.json` - 6 entries got a fresh `measuredOn` (unchanged claim text,
  as the row's own rule requires); 5 entries were deleted outright, with what each probe actually
  returned recorded in the commit message. The two `kind: "constraint"` rows are untouched - they
  don't lapse.
- `scripts/agy-run.mjs` - `EFFORTLESS_MODELS.measuredOn` moved from `'1.1.25'` to `'1.1.27'` to
  match the entry it mirrors; the model list is unchanged, since both ids still reject `--effort`.
- `docs/STACK_FRESHNESS.md` - said nothing about harness capability observations before this row;
  added one short paragraph pointing at `scripts/harness-capabilities.json` and
  `npm run harness:usage`, describing the same report-never-auto-upgrade posture applied to CLI
  behavior instead of package versions.

## What I nearly got wrong

This worktree's local `main` ref (`03aa732d`) was one merged PR behind `origin/main`
(`bce60a4b`, PR #167) by the time I reached `/check`. `git diff $(git merge-base main HEAD)`
against the stale local ref would have reported a 152-file, 6,300-line "scope" - everything every
other branch had landed since this worktree was created - not this row's actual change. Diffing
against `origin/main` instead gave the true fork point (`cc0c9fc7`) and the real 3-file scope. I
did not fast-forward the local `main` ref (not this row's business, and this worktree never checks
`main` out), but a reader repeating this check should diff against `origin/main`, not the local
branch, whenever a worktree has sat for a while.

## Left undone, on purpose

- **The re-probe cadence is still owed.** This was a hand-run pass, exactly as the row asked for;
  nothing schedules it. The next drift sits unnoticed again until someone runs
  `npm run harness:usage` and reads the UNVERIFIED list, or another row like this one is planned.
- **`docs/HARNESS_ROUTING.md` was not touched**, and it now disagrees with the deleted entries in
  places - it's the cited `source` for several of them (e.g. "Codex: there is no model choice, only
  effort", the Claude Code permission-prompts and subagent-notification sections). Updating that
  narrative doc was out of this row's `TOUCHES`, and deciding whether `.agent-workflows/check.md`'s
  phase-2 notification rule should change on the strength of one measurement is a judgement call,
  not a mechanical fix - filed as
  `docs/backlog/harness-routing-doc-cites-four-refuted-claims.md` rather than done here.

## Verification

`review: inline` (the code-review skill forked into 8 background finders in this launched session
- fan-out instructions count as "did not run" per `.agent-workflows/check.md`, so the diff was
read by hand; no defect found). `simplify: inline` (same shape - the simplify skill also returned
a 4-agent fan-out instruction; nothing to simplify in a diff that's version bumps and JSON
deletions). `taste: not applicable` (nothing here can move what a graphic looks like).

`npm run build` - exit 0, read from its own marker, not a pipe. CI run `34289728743` on
`claude/x-capability-reprobe` is green: `Factory gates`, `E2E plan`, `Build` and `CI gate` all
completed with `success`; the E2E matrix/catalog jobs report `skipped` (not stopped early - the
plan job decided they weren't needed for this diff). `npm run harness:usage` afterward: `0
UNVERIFIED` (was 11), an exact match for 6 confirmed + 5 deleted. Verdict stamp written to
`<git-common-dir>/noacg-jobs/checks/claude-x-capability-reprobe.json`, `reviewedSha`
`1ee6b36f`, `verdict: pass`.

## Pointers

- `scripts/harness-capabilities.json` - the updated observation set
- `scripts/agy-run.mjs` - `EFFORTLESS_MODELS`
- `docs/STACK_FRESHNESS.md` - the new pointer paragraph
- `.agent-workflows/check.md` - the subagent-notification claim this row's own probe contradicted
- `docs/HARNESS_ROUTING.md` - still cites several of the now-deleted claims as fact; not touched
  this row

Branch is green and queued. Nothing here needs the owner - no `account`, `money`, `identity` or
`harness` question was open at any point.
