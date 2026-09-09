# Harness routing

**Three harnesses can do work on this repo. This file records what each one is actually good
for, from measurement rather than impression, and it is written to be APPENDED to.** A session
that routes a piece of work somewhere and learns something adds a dated entry under the harness it
used; nobody rewrites the earlier entries, because the value here is the accumulation. An entry
with no evidence behind it is an opinion and does not belong.

Companion files: `npm run harness:usage` (what each harness has actually consumed, from the
harnesses' own transcripts), `.claude/commands/rescue.md` (the Codex procedure), and
`scripts/codex-rescue.mjs`'s header (why that channel is shaped the way it is).

## The routing table

**Read with three NAMED sections, never with "the last N"** - this file is appended to, so a
positional pointer goes stale the moment somebody appends, which is exactly what happened on
2026-09-03. They are **"Owner ruling 2026-09-01: route by pool capacity, and Antigravity has TWO
pools"**, which governs how the pools are chosen at all; **"The delegation trial, 2026-09-02"**,
where every Antigravity row's evidence lives and which carries the prompt preamble without which
a write delegation fails on its first tool call; and **"The Antigravity model inventory, measured
2026-09-03"**, the current model list per pool and the standing verdict on the default model. Codex routes below apply when its capacity
snapshot shows headroom - otherwise the same work prefers the two Antigravity pools, and every
Codex row in a wave names a fallback.

| Kind of work | Route to | Why | What it costs |
|---|---|---|---|
| Anything needing judgement about THIS product - taste, architecture, what to build | Claude Code | It carries the repo contracts, the owner's decisions and the session history. The other two start cold every time. | The scarce resource. A wave session runs 10-20 M tokens/hour, almost all cache reads. |
| Bulk same-shape edits across many files | Codex (`/rescue --write`) | Long to do, short to specify - the shape delegation is good at. | Subscription window, not per-token. Measured 2026-08-29: the whole day's Codex use sat at 41% of its weekly window. |
| A well-specced build spanning 5+ files | Codex (`/rescue --write`) | Same reason. The spec is the work; writing it out is cheaper than doing it. | As above, plus the time to write a spec good enough to hand over. |
| A bug still failing after 2 genuine fix attempts | Codex (`/rescue`) | A second model with a different prior. Read-only by default, so it costs a diagnosis, not a diff. | As above. |
| **Read-across-many-files comprehension questions** | **Antigravity (`agy -p`) on `gemini-3.7-flash-high`, with ABSOLUTE paths** | **Measured below: a 3-part cross-file question about the export registry came back 100% correct in 99 s, one call, no follow-ups.** But session D measured it reading the WRONG CHECKOUT from inside a linked worktree - wrong content, not just wrong links - so give it absolute paths and re-derive anything you act on. | Free at the subscription, and on Google's meter rather than Claude's. **Both figures in this row are Trial A on the unpinned default, not on the model this row now names** - the flash numbers, on a different question, are 17.6 s and 94.9 K input (see "Model choice"). ~160 K input + ~1.2 M cache-read for one such question. Budget for calls that bill and return nothing: 2 of 5 on session D's branch, 2 of 3 on this one. |
| **A bounded artifact written to a spec, judged before use** | **Antigravity (`agy -p`), then read it yourself** | **Measured below: an unseen gate script came back correct on first run, matched the house script conventions closely, and caught a real edge case in the input.** | As above. Grading it costs a few minutes and is not optional. |
| **A bounded artifact Antigravity WRITES to a spec** | **Either pool (`npm run agy -- --write`), then run the gate that CONSUMES it** | **Measured 2026-09-02 (last section): a doc edit and six SVG corpus fixtures, graded. Every mechanical acceptance condition passed on both pools; the one field needing JUDGEMENT was wrong in 3 of 6, and only the real gate caught it. The prompt MUST open by declaring the tool set and saying there is no shell, or the first tool call is auto-denied and the run bills for nothing.** | As the rows above, plus reading every line it wrote AND running the gate that reads the artifact. |
| **The SECOND Antigravity pool** - `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium` | **The same work as the Gemini pool, on a separate paid allowance the owner barely touches** | **First graded 2026-09-02, on the same task as the Gemini pool: better exporter fidelity, better at flagging where it deviated from a wrong spec, a third of the input tokens - and worse on the judgement field. Usable; nothing yet separates the two pools by enough to make a rule.** | Its own pool, so it never competes with the Gemini calls. **It takes NO `--effort`** - the flag is refused, free, before anything runs. |
| Reading an undocumented file format and deciding what it means | Claude Code | Short to do, long to specify - the class the 2026-08-29 delegation trial named as a poor delegate. | - |
| A three-line edit whose sites are already known | Claude Code | Measured 2026-08-30: delegating three one-line comment fixes cost 156 K Codex tokens, two round trips and a rewrap this session had to do anyway. The spec was longer than the diff. | - |
| Anything that must be landed, gated, or merged | Claude Code | Only this harness runs the merge queue and knows the serialization rules. | - |

## Claude Code

The default, and the only harness that holds the repo's contracts (`AGENTS.md`, the nested
per-area files, memory, the owner queue) without being told them. Everything about it lives
elsewhere in this repo; it is listed here only so the table is complete.

**Cost, measured 2026-08-29/30 by `npm run harness:usage`:** nine concurrent sessions did 470 M
tokens over twelve hours, dominated by cache reads billed per request. Its 5-hour window
percentage is **not** in the transcripts, so no meter can report it - that is the reason the other
two harnesses matter at all.

## Codex (the delegation channel)

**What it is:** `scripts/codex-rescue.mjs`, driven by `/rescue`. The Codex plugin's companion
script is the engine; the wrapper exists because the CHANNEL around it failed three ways in the
first trial, all invisible from the plugin's own status API - the launch died with its caller, a
dead job reported as running forever, and cancel could not kill anything on Windows. All three are
written out in that file's header.

**Invocation:** `/rescue [--write] [--model m] [--effort e] <task>`, launched from the session that
asked for it, never through a subagent - the subagent's lifetime is the whole problem. Read-only
unless `--write`.

**Cost:** a subscription window, not per-token. `npm run harness:usage` reads Codex's rollout files
and prints the 5-hour and weekly rate-limit percentages with their reset times, which is the
soundest number any of the three harnesses exposes.

**Good at:** work that is long to do and short to specify. **Bad at:** work that is short to do and
long to specify. **Still true after every trial so far:** verify its result by re-deriving the
receipt from scratch, not by checking that it did what it was told - a wrong site list passes that
check.

## Antigravity (Google) - first trial, 2026-08-30

**What it is:** `agy.exe`, a single Go binary, already installed and already authenticated on this
machine at `C:\Users\ahonemi\AppData\Local\agy\bin\agy.exe`. It is a separate product from the
Antigravity IDE, which genuinely has no headless entry. Gemini CLI is retired for individual
accounts since 2026-06-18, so this is the only Google harness there is.

**The version is read from `agy --version`, never from this file**, and what changed between two
of them from `agy changelog`. The trials below were run on 1.1.22. Three fixes have landed since,
all of them in failure classes this file measures - a headless run hanging on exit when stdout or
stderr is piped (1.1.24), a cancelled or killed subagent staying marked Running (1.1.23), and MCP
tools being unavailable to a subagent that declared them (1.1.23). None of them touch the two
empty-response causes `agy-run.mjs` diagnoses, so that classifier stays exactly as it is.

### The invocation that works (Windows, Git Bash)

Full path, because the binary is not on PATH:

```bash
"C:/Users/ahonemi/AppData/Local/agy/bin/agy.exe" -p "<prompt>" --output-format json --mode plan
```

Run it with the WORKTREE as the working directory. `--mode plan` is the read-only posture.
`--output-format json` prints one JSON object on stdout, `text` prints prose, `stream-json` emits
NDJSON. Other flags that matter: `--model` (see `agy models`), `--effort low|medium|high`,
`--json-schema`, `--print-timeout` (default 5m), `--add-dir`.

**Do not pass `--dangerously-skip-permissions`.** It appears in the help output; it is a
capability, not an instruction.

### The blocker, and the exact file that lifts it

> **SUPERSEDED on 2026-08-30 - do not act on the JSON block below.** That file now EXISTS on this
> machine, installed by the owner with a longer allow list, and writing the block below over it
> would clobber his rules and reinstate a `deny` this section itself warns about. The current
> state of the machine, and why none of those rules actually grant anything, is in
> "Antigravity - second trial" further down. What stands here is the discovery of the blocker;
> the rule GRAMMAR it describes is wrong.

**Headless `agy` cannot use a single tool - not even reading one file - unless an allow-rule exists
first.** There is no prompt to answer in print mode, so every tool call is auto-denied and the run
returns `status: SUCCESS` with an EMPTY `response`. That failure mode is quiet: the exit code is 0
and the JSON says success. Both of this trial's first two attempts hit it, once on `command` and
once on `read_file`.

The lift is one machine-global file, `~/.gemini/antigravity-cli/settings.json`, which does not
exist by default. This exact content was written, used for both trials below, and then **removed
again**, so the machine is as it was found:

```json
{
  "permissions": {
    "allow": ["read_file(*)", "list_dir(*)", "grep_search(*)", "codebase_search(*)"],
    "deny": ["write_file(*)", "command(*)"]
  }
}
```

Rule grammar, read out of the binary: `read_file(<path>)`, `command(<program>)`, `write_file(<path>)`,
with `*` and `/` accepted as targets; the three buckets are `allow`, `deny`, `ask`.

**It was not left in place, and a session should not leave one in place on its own,** for one
concrete reason: it is unknown whether `deny` also applies to the owner's INTERACTIVE `agy`
sessions. If it does, a `deny: write_file(*)` left behind would silently break his IDE-side CLI.
Installing it was an owner action, and **he made that call: the file exists on this machine as of
2026-09-02**, at `~/.gemini/antigravity-cli/settings.json`, carrying an `allow` list and no `deny`
half - so his interactive sessions are untouched. A session that finds it missing still pays the
setup cost by hand rather than writing it.

### Trial A - comprehension. Grade: pass, no defects

Question, asked cold with no repo context supplied: list every registered export target with its
exact `id` and `label`; state the `ExportTarget` interface field by field including the `build`
signature; name the shared module that composes a self-contained HTML file and say exactly which
targets import it and which do not.

Ground truth was established first, by hand, from `src/export/registry.ts`,
`src/export/targets/*.ts` and `src/export/selfContained.ts`.

Every part was correct: all six ids and labels, the interface verbatim, and the three importers of
`composeSelfContainedHtml` (`casparcg`, `h2r`, `html-overlay`) against the three that do not
import it. It went one step past the question and noted, correctly, that `liveos` gets its package
by delegating to `ograf`'s `addOgrafPackage`.

**99 s, one turn, no follow-up needed.** Doing the same by hand took four tool calls and about the
same wall-clock, so the win here is not speed - it is that the whole thing happens on someone
else's meter.

### Trial B - generation. Grade: pass, with two real misses

Task: write `scripts/check-style-parts.mjs`, a gate that parses the `@import` list in
`src/styles/index.css` and fails on a missing import, an unimported part, or a duplicate import -
matching the repo's existing `scripts/check-*.mjs` conventions, which it was told to read first.

The output was transcribed to a scratch directory (never into the tree) and RUN:

- **Correct against the real repo.** 31 imports parsed, 30 parts on disk, no findings - which is
  the true state.
- **Correct on injected faults.** A synthetic fixture with a missing import, a duplicated import
  and an orphan part produced exactly three findings, one per class.
- **It found the trap without being told.** `index.css` has a 21-line header comment that contains
  the literal text `@import rather than one import per file in main.tsx`. A naive regex counts 32
  imports and then fails looking for a part named after prose. Its script strips CSS comments
  before matching, and it named this edge case in its own notes. It also handled
  `@import '../brandTokens.css'`, which resolves OUTSIDE `src/styles/`.
- **Convention match was close to exact:** the shebang, the "why this exists" header with dated
  incident history, `repoRoot` from `import.meta.url`, exported pure functions, the
  `main()` + `if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))`
  guard, and the bulleted `console.error` failure block are all the house pattern.

The two misses, both of the same kind - **it asserts things it has not checked**:

1. **No sibling `.test.mjs`.** Every real gate of this shape has one (`check-function-budget.test.mjs`,
   `check-vercel-config.test.mjs`, `check-copy.test.mjs`) and the classifier, not the prose, is the
   guard. It neither wrote one nor said it was missing.
2. **Its header comment claims the gate "runs as a static verification in `npm run build`".** It
   does not; nothing was wired into `package.json`. A comment that states an untrue fact about the
   build is exactly the kind of thing that gets believed later.

**Net:** the code was better than the claims about the code. That is the shape of the risk with
this harness - read what it says as carefully as what it wrote.

### Cost, and what a usage meter can read

**`agy` exposes per-run usage on stdout and NOWHERE ELSE.** With `--output-format json` the single
result object carries:

```
.conversation_id        string, also the name of the on-disk conversation store
.status                 "SUCCESS" even when every tool call was denied - see the blocker above
.response               the model's text; EMPTY string is the tell for a permissions failure
.duration_seconds       float
.num_turns              int
.usage.input_tokens     int
.usage.output_tokens    int
.usage.thinking_tokens  int
.usage.cache_read_tokens int
.usage.total_tokens     int   (input + output; it does NOT include cache reads or thinking)
```

The same field names exist in the binary for `stream-json`, under a `result` event with `type` and
`subtype`.

**There is no cumulative usage anywhere on disk.** `~/.gemini/antigravity-cli/` holds
`conversations/<id>.db` (SQLite with protobuf blobs), `annotations/<id>.pbtxt` (a title, nothing
else), `cache/conversation_metadata.json` (id, preview, step count, timestamps, project id -
**no tokens**), `jetski_state.pbtxt` (onboarding and migrations) and `log/cli-*.log`. A text scan
of all of them finds no token field. **So the third reader the usage meter wants cannot be a file
reader** - the only way to account for `agy` spend is to capture the JSON result at call time and
append it somewhere yourself, which is what `scripts/agy-run.mjs` now does.

**Quota is not exposed headlessly either.** The binary contains quota-bucket strings, but they
belong to the interactive TUI's dimmed-model display. No headless surface prints a remaining
allowance, and there is no `agy usage` subcommand.

**This is now built: `npm run agy:read -- --model <id> --label <what-for> "<prompt>"`** (2026-09-01:
`--label` became required and reads got their own pre-approved door). `scripts/agy-run.mjs` is the one
way this repo calls `agy`. It pins the model, refuses `--dangerously-skip-permissions`, treats an
empty response as a failure, and appends one JSON line per call - success or failure - to
`~/.noacg/agy-usage.jsonl`, which `npm run harness:usage` reads back as a third report block. Every
sentence in this section is what that block says out loud about its own limits.

**One more gap for anyone metering it: the JSON result does not name the model that answered.**
Pin it with `--model` (e.g. `gemini-3.1-pro-high`) if the attribution has to be sound.

Observed numbers, for scale:

| Run | Wall clock | input | output | thinking | cache read |
|---|---|---|---|---|---|
| Trivial prompt, no tools | 2.2 s | 17.8 K | 31 | 29 | 0 |
| Trial A (comprehension) | 99 s | 160 K | 10.6 K | 7.1 K | 1.15 M |
| Trial B (generation) | 87 s | 175 K | 17.4 K | 13.1 K | 1.30 M |

A trivial prompt already costs ~18 K input tokens, so the system prompt is large and there is no
cheap call.

### Three more facts, measured 2026-08-30 while building the meter

Five real calls through `npm run agy`, of which **two returned nothing and still billed**. That is
the headline: on this harness a failure is not cheap.

- **An empty response has TWO causes, not one, and they need different fixes.** Besides the denial
  below, a run that reaches `--print-timeout` (default **5 minutes**) is cut off mid-task and
  returns an empty string with `status: SUCCESS` and exit code 0 - identical to a denial from the
  outside. One such run here **spent 202 K input and 1.56 M cache-read tokens for nothing**. The
  wrapper tells them apart by elapsed time and names both. Raise the ceiling (`--print-timeout 8m`)
  for anything that has to read more than a file or two; the same question then succeeded in 386 s.
- **Half the grant grammar in this doc's settings file is silently ignored.** Only `read_file`,
  `command` and `write_file` are real actions. `list_dir(*)`, `grep_search(*)` and
  `codebase_search(*)` are accepted into `settings.json` and then dropped -
  `permission_grant_store.go` logs `ignoring invalid allow entry ... unknown action`, and nothing
  in the JSON result or on stderr ever says so. A settings file that looks complete is not.
- **In a linked worktree it reads the WRONG CHECKOUT.** This is stronger than the citation defect
  below. Asked from a worktree to read `scripts/agy-run.mjs`, it reported the file does not exist
  and that `harness-usage.mjs` has no `AGY` exports - both true of `C:/claude/NoaCG-Studio` and
  false where it was standing. Its own log shows it grepping the main checkout, including *other
  sessions' worktrees*. **An ABSOLUTE path works** (the same file, read by full path, answered
  correctly in 10 s for 27 K input tokens). So: run it from the main checkout, or hand it absolute
  paths - a relative path silently answers about another branch's code.

### Gotchas found in this trial

- **A denied tool looks like success.** `status: SUCCESS`, exit 0, empty `response`. Anything
  driving `agy` must treat an empty `response` as a failure.
- **It reads `AGENTS.md` on its own.** Its customization system walks from the cwd up to the repo
  root loading `AGENTS.md` / `GEMINI.md`, so it inherits this repo's contract without being handed
  it. That is most of why Trial A landed.
- **Its file citations name the WRONG CHECKOUT in a worktree.** Both trials ran with the cwd set to
  a linked worktree, and its own log confirms it read the worktree's files - but every
  `file:///` link it printed pointed at `C:/claude/NoaCG-Studio/src/...`, the main checkout. The
  content was right and the links were wrong. Never paste its citations forward unchecked.
- **State it writes:** a conversation store, an annotation and a log per run, under
  `~/.gemini/antigravity-cli/`. Nothing in the repo, in plan mode with `write_file` denied.

### What is still unmeasured about Antigravity

- **Writing.** Both trials were read-only by design. Nobody has let it edit a file, so its diff
  quality, its behaviour under `--mode accept-edits`, and whether `write_file(<scoped path>)` rules
  actually confine it are all unknown.
- **Long tasks.** Both trials were single-turn. `--print-timeout` defaults to 5 minutes; how it
  behaves on a task needing twenty tool calls is untested.
- **Model choice.** Everything above ran on the CLI's unpinned default. `agy models` lists Gemini
  3.x Flash/Pro tiers plus Claude and GPT-OSS entries; no comparison has been run.
- **`--input-format stream-json`, `--json-schema`, `--sandbox`, MCP and plugins** - all present in
  the help, none exercised.
- **Whether it can be driven concurrently** with a Claude Code wave without the RAM ceiling
  (`memory/ram-management.md`) biting.

## Codex - three delegations on one branch, 2026-08-30

Three real pieces of work, all landed on `claude/b-harness-delegation`, all specced in this session
and written by Codex through `scripts/codex-rescue.mjs` on `gpt-5.6-sol` at medium effort (low for
the third). Every result was verified by RE-DERIVING it, never by checking the delegate did what it
was told. The verification is what found the one interesting thing in the round.

**Cost, from Codex's own rollout files** (`~/.codex/sessions/2026/08/30/rollout-*.jsonl`, field
`total_token_usage`; the wrapper's job JSON does **not** carry token counts, so that is not where
you read this):

| Delegation | Wall clock | input (of which cached) | output | 5-hour window |
|---|---|---|---|---|
| 1. The `e2e-affected` rule + its test | 119 s | 304 K (272 K) | 3.3 K | 0% -> 3% |
| 2. The corrupt-PNG swap, two turns | 308 s + 183 s | 1.46 M (1.33 M) | 16.7 K | 3% -> 11% |
| 3. Three citation fixes | 53 s | 155 K (131 K) | 1.3 K | 11% -> 12% |

Twelve percent of a 5-hour window for three landed commits, on the owner's ChatGPT subscription
rather than on Claude's meter. That is the whole case for the channel.

### Delegation 1 - a routing rule in `scripts/e2e-affected.mjs`. Grade: pass, no defects

`public/docs/` holds the three screenshots `docs.html` embeds and no rule covered it, so
regenerating one picture planned `mode: 'full'` **and** raised the catalog flag - a whole-suite gate
plus the 25-minute catalog run to prove nothing. Codex widened the `docs.html` edge to
`/^(docs\.html$|public\/docs\/)/` and added a test pinning the screenshot path, the unchanged
`docs.html` behaviour, and a look-alike (`public/docs.png`) that must still escalate.

Re-derived independently: ten paths through `planFor`, including `public/docs/deep/nested.png` and
`docs.htmlx`, all correct; 21/21 tests green; eslint clean. The comment it extended is in the file's
own evidence-carrying voice rather than a label. **Nothing to fix.**

### Delegation 2 - swapping six corrupt PNGs. Grade: pass, and it caught a defect in the SPEC

The e2e suite's stock 1×1 test image was not a decodable PNG. Two distinct corrupt strings across
six sites declared an IDAT length of 11 while the chunk really held 13 bytes - so the CRC only
validated at the real length and the chunk walk ran into garbage - and their IHDR claimed colour
type 4 (grayscale+alpha) over what is actually RGBA data. Chromium reads them leniently, which is
why nothing ever failed; it renders whatever falls out. Two sites were worse than cosmetic:
`e2e/flows.spec.ts` turns on the image being OPAQUE, and `src/model/imagePurpose.ts` cites that
spec's pixel as its worked example of an opaque mark - about a file that cannot be decoded at all.

**The task as handed to this session was wrong on its particulars and the ground truth had to be
rebuilt before anything could be specced.** It named `docs/svg-samples/scorebug.svg` as carrying "a
half-opaque red pixel with a comment calling it transparent". That file is correct as it stands: its
pixel is a valid, fully transparent 1×1 RGBA PNG and its comment says so. The half-opaque red
payload is real, but it is the *intended* content of the corrupt string in `e2e/sync.spec.ts` -
which Chromium in fact renders fully transparent. The "six more malformed grayscale-alpha pixels"
were the true half of the description, and they were the whole job. A spec written off the brief
without decoding anything would have confidently changed a file that had nothing wrong with it.

Then Codex found the defect in the corrected spec. It was told to replace the corrupt strings with a
"verified valid" opaque pixel taken from `e2e/wizard-logo.spec.ts`. It ran a CRC check over the
bytes it had actually written, reported `IDAT crc FAIL stored abce3689 computed 89993d1d`, stopped,
and asked whether to use a CRC-corrected equivalent instead. **That pixel does have a bad IDAT
CRC**, confirmed here afterwards - this session's own audit had checked that string for inflation
and for how Chromium renders it, and never for its CRC. A correct opaque PNG was then minted with
every length and CRC computed, decoded in a real Chromium to confirm the pixel, and handed back;
Codex applied it and fixed `wizard-logo.spec.ts` too.

**This is the first time in three trials that a delegate refused a bad instruction rather than
executing it.** The instruction to prove the result rather than assert it is what produced that: the
spec said to run the decode check over the bytes read back OUT OF THE FILE, not over the string it
had been given. That clause is cheap and belongs in every write delegation.

Two small things this session still did by hand: Codex wrote `1x1` in its new comments while the
surrounding house style is `1×1`, and it did not notice the mixed style it had introduced four lines
apart in `flows.spec.ts`.

Verified by walking EVERY embedded PNG under `e2e/` and `docs/svg-samples/` and auditing signature,
every chunk length, every CRC, trailing bytes and the inflated scanline. Twenty-three are fully
valid; the only two that are not are the two deliberate ones it was told to leave -
`import-svg.spec.ts:349`, which matches a base64 PREFIX with a regex, and
`video-generation-corpus.spec.ts:35`, the bare 8-byte signature whose comment says only the mime is
read back. **It respected every boundary in the do-not-touch list.**

### Delegation 3 - three stale citations. Grade: pass, and not worth delegating

Two `docs/GOALS.md` -> `docs/GOALS_ARCHIVE.md` renames plus one bare `(GOALS step 4)` expansion, all
three sites already located. Codex made exactly the three edits, changed nothing else, and pasted
every `GOALS` hit in the three files afterwards. The one flaw: expanding the bare citation pushed
that line to 125 characters in a comment block that wraps at ~98, and it did not rewrap even though
the spec told it to if the length forced it - eslint enforces no limit there, so nothing objected.
This session rewrapped it.

The honest verdict is the routing one: **the spec was longer than the diff.** 156 K tokens and a
round trip bought three one-line edits that were already fully specified, which is the
"short to do, long to specify" class this file has warned about since the first trial. It is in the
table now as its own row.

## Antigravity - second trial, 2026-08-30: the WRITE attempt, and why it produced no diff

The first trial left "Writing" at the top of its unmeasured list. This round tried to measure it and
could not, for a reason worth more than the diff would have been.

### The finding: grant targets are anchored REGEXES, not globs

`~/.gemini/antigravity-cli/settings.json` was found installed with this allow list:

```
read_file(*)  command(grep) command(rg) command(cat) command(head) command(tail) command(ls)
command(find) command(sed) command(wc) command(git)  list_dir(*) grep_search(*) codebase_search(*)
write_file(C:/claude/NoaCG-Studio/.claude/worktrees/*)
write_file(C:/Users/ahonemi/AppData/Local/Temp/claude/*)
```

A write task on `gemini-3.1-pro-high` came back with an EMPTY `response` and `status: "CANCELED"`,
and stderr said a `write_file` permission had been auto-denied. The rule that was supposed to allow
it is right there. The binary explains why:

> Each token in the granted target is matched as a full word (internally treated as an anchored
> regular expression: `^(?:pattern)$`).

**The target is a regex.** So `write_file(C:/claude/.../worktrees/*)` means "the literal text
`...worktree` followed by any number of `s`" - it matches the directory's own name and can never
match a file inside it. Every path-scoped write rule written glob-style denies 100% of writes. The
same reading explains three things that were already on the record as puzzles:

- The first trial's `deny: ["write_file(*)"]` "bought nothing" because `^(?:*)$` is not a pattern
  that matches a path. It was never a deny of anything.
- `command(grep)` grants the command `grep` and nothing else - not `grep -rn foo .`. A second run
  this round died on exactly that: it reached for a search command and was auto-denied.
- `list_dir(*)`, `grep_search(*)` and `codebase_search(*)` are not real actions at all. The CLI log
  says so plainly and drops them:
  `ignoring invalid allow entry "grep_search(*)": unknown action "grep_search"`.
  Only `read_file`, `command` and `write_file` are actions.

**So the installed file grants exactly one capability: `read_file`.** Everything the first trial
achieved, it achieved on that alone - which is why a comprehension question over named files worked
and why anything needing search, or a write, does not.

The fix is one line and it is the OWNER's to make, not a session's: it means widening a
machine-global permission file, and this session's own harness refused the edit, as it should. It
was filed for him and **he made the change the same afternoon** - the working form turned out to be
simpler than the regex the filing proposed, and it is recorded in the last section of this file.
That owner-queue item is gone, logged in `docs/acceptance/OWNER_QUEUE.md`'s Dropped list as done
rather than presumed.

`--mode accept-edits` is the documented per-run alternative and was refused by this session's
harness too, so **a Claude Code session cannot unblock Antigravity writing on its own.**
`--dangerously-skip-permissions` was not tried: it is a capability, not an instruction.

### What did get measured: a finding job on `read_file` alone. Grade: pass, 4/4, no defects

Given the file paths explicitly (no search tool available) and asked four questions about the
leftover stale citations, `gemini-3.1-pro-high` returned all four correct, checked afterwards line
by line:

1. Both skipped citations still present, at the line numbers the old handoff claimed -
   `e2e/ai.spec.ts:196` and `e2e/exports.spec.ts:708`. Correct, quoted verbatim.
2. It resolved a contradiction inside that handoff: its "Flagged" section names
   `e2e/configured/anonymous.spec.ts:17` and its "Next" section names
   `e2e/configured/feedback.spec.ts:17` for the same site. It read both files, named `anonymous` as
   the one that actually holds `(GOALS step 4)`, and quoted what is really at `feedback.spec.ts:17`
   to prove the other mention wrong. **Correct, and this session had reached the same conclusion
   independently before asking.**
3. It quoted "Student release" step 4 out of `docs/GOALS_ARCHIVE.md` and gave lines 1365-1367.
   Correct to the line.
4. Correctly reported no other GOALS citation in those four files.

It also obeyed the instruction not to emit `file:///` links, which is the fix for the
wrong-checkout citation trap the first trial found - **telling it to cite plain repo-relative paths
works, and costs nothing.**

**But do not read this 4/4 as proof it read the right checkout.** Session D measured, the same day,
that `agy` in a linked worktree will read `C:/claude/NoaCG-Studio` and even other sessions' worktrees
while claiming a file in its own cwd does not exist - so the CONTENT can be wrong, not merely the
`file:///` links. This run was given repo-relative paths and told which worktree to read, which is
exactly the shape D found unreliable. Checked afterwards: all five files it was pointed at were
byte-identical between `origin/main` and this branch's base, and none had been modified here, so
both checkouts would have answered the same. **The grade is on the ANSWERS and says nothing about
checkout selection.** Nothing on this branch rests on its reading either way - all four answers were
re-derived here before anything was acted on, and the edits were specced from those. The standing
fix is to pass ABSOLUTE paths, or to run it against the main checkout and apply in yours.

### Cost of the three `agy` runs, from the JSON result

| Run | Outcome | Wall | input | output | thinking | cache read |
|---|---|---|---|---|---|---|
| Write task, plain `-p` | CANCELED, empty - `write_file` denied | 87 s | 70 K | 10.3 K | 8.1 K | 61 K |
| Finding, with search tools | SUCCESS, empty - `command` denied | 62 s | 44 K | 3.4 K | 2.3 K | 73 K |
| Finding, `read_file` only | SUCCESS, 4/4 correct | 153 s | 110 K | 7.9 K | 5.9 K | 580 K |

Two of the three runs burned ~115 K input tokens between them and produced nothing at all. Both were
permission failures, both invisible from the exit code, and the second even reported
`status: SUCCESS`. **Read `.response` for emptiness before anything else** - the first trial said so
and this round paid it twice. Session D's branch paid it twice more, on 2 of its 5 calls: across
both branches that is **four billed calls out of eight that returned nothing.**

**An empty `.response` has TWO causes, and they need telling apart** (the second is session D's
finding): a tool call auto-denied, or the run hitting `--print-timeout`, which defaults to five
minutes and also returns an empty string with `status: SUCCESS` and exit 0. Elapsed time separates
them, and a denial also names the permission on stderr. Both empties above were denials - 87 s and
62 s against a 5-minute limit, each with the tool named on stderr. A real task wants
`--print-timeout` raised.

**Call it through `npm run agy`** (session D's wrapper, landing on its own branch) rather than the
raw binary: it pins the model, refuses `--dangerously-skip-permissions`, treats an empty response as
failure, and ledgers every call - which is the only way this spend gets accounted for at all, since
nothing on disk accumulates it.

### What is STILL unmeasured about Antigravity

Everything the first trial listed, minus the `file:///` trap, plus a sharper statement of the first
item:

- **Writing.** Still zero diffs. Not because it was not tried - because the permission layer denies
  every one, for a reason now precisely located. The owner-queue item is the unblock.
- **Long tasks, `--mode accept-edits`, model comparison, `--json-schema`, `--sandbox`, MCP, plugins,
  and concurrency with a Claude Code wave** - all still untried.

> **Two of those were closed later the same day** - see the next section. The permission layer no
> longer denies writes (the owner fixed the grant), and the model comparison has been run. Everything
> else on the list stands, **diff QUALITY included**: it can write now, and nobody has graded what it
> writes.

## Model choice on the two delegate harnesses, 2026-08-30

Both delegate harnesses have a model knob and neither had ever been measured - "model comparison"
sat on Antigravity's unmeasured list through two trials. This round measured both, and the owner
ruled on both. The two answers are opposite in shape: Antigravity has a real choice worth making,
and Codex has none at all.

### Antigravity: `gemini-3.7-flash-high` is the default

One three-part cross-file comprehension question, asked identically of two models, with the
**ground truth established by hand FIRST** so the grading did not rest on the models' own word:

1. list every registered export target id;
2. name the line and the spec list that `docs.html` maps to in `scripts/e2e-affected.mjs`;
3. name the function that decides whether voting is closed in `pollBehaviour.ts`, and the two
   sources it reads, in order.

| model | correct | wall clock | input | cache read |
|---|---|---|---|---|
| `gemini-3.1-pro-high` | 3/3 | 57.3 s | 66.5 K | 298 K |
| `gemini-3.7-flash-high` | 3/3 | 17.6 s | 94.9 K | 322 K |

**Flash was 3.3x faster at equal correctness, and it volunteered more.** Where Pro gave the shape of
an answer, Flash gave line ranges, the actual token values and the regex. Nothing separates the two
on correctness here; everything separates them on latency and on how much of the answer can be acted
on without a follow-up call.

**Owner decision: `gemini-3.7-flash-high` is the default model for this repo's `agy` calls.** The
reasoning is generational rather than tiered - the "Pro" here is six versions older than the Flash,
and the generation gap outweighs the tier. **High reasoning effort for most work**, lower only where
a task plainly does not need it.

**Read that honestly: it is ONE SAMPLE.** Nothing measured so far shows Pro better at anything, only
slower, which is not the same thing as Flash being better everywhere. This is a decision with its
evidence attached, not a proven ranking. A later round that finds a class of work Pro wins should
append that finding rather than argue with this one.

### Codex: the model choice was closed, and it has REOPENED

**Re-measured 2026-09-09 on Codex 0.154.0-alpha.6, and the rule below is no longer true.** `codex exec`
with no `--model` defaults to `gpt-6-astra` and succeeds; `gpt-5.6-sol` also still succeeds. Two ids
work, not one. The configured model in `~/.codex/config.toml` is now `gpt-6-astra`, not `gpt-5.6-sol`.
So `--model` on `/rescue` points at something real again, and a row that wants a specific Codex model
must name it rather than assume the harness has only one.

What follows is kept because it was true when it was measured, and because it says how much a
rejection sweep is worth: not much, for long.

> Ten model names were probed against the CLI on this machine - `gpt-5.6`, `gpt-5.6-codex`,
> `gpt-5.6-pro`, `gpt-5.6-mini`, `gpt-5.6-sol-max`, `gpt-5.6-sol-mini`, `gpt-5.6-sol-thinking`,
> `gpt-5.5-sol`, `gpt-5-codex` and `o3`. **Every one came back
> `not supported when using Codex with a ChatGPT account`.**
>
> `gpt-5.6-sol` is the one that works, and it is the configured model. Ten rejections do not PROVE an
> eleventh is unique - but they are ten of the ten plausible alternatives, so **treat the model as
> fixed and reasoning effort as the single knob on this harness.**

**The lesson is about the shape of the claim, not the model.** "Every plausible alternative was
rejected" was ten measurements deep and still expired in nine days, because what it really measured
was a subscription's entitlements on one afternoon. A claim about what a VENDOR currently allows has
a shelf life; a claim about what the CLI's own code does does not. Weight them differently when you
cite one.

**Owner ruling, 2026-08-30 - the effort ladder is the inverse of a cost-saving default:**

> *"the low reasoning worries me. We should at least go with medium and important coding tasks
> should be on high... I have more faith in GPT SOL than in Gemini."*

- **`high` is the NORM** for anything that writes code or forms a judgement.
- **`medium` is the ordinary floor** - the minimum for real work.
- **`low` is reserved for mechanical retrieval**, where the answer is a lookup.

**The floor now lives in the machine config.** `~/.codex/config.toml` carried
`model_reasoning_effort = "low"`, so every delegation that did not pin an effort ran at the bottom
rung - **including the three commits that landed on 2026-08-30 through this channel**. **The OWNER
changed it to `medium`**, on his own ruling that medium is the minimum; a session must not edit a
machine-global config and did not. Recorded here so nobody reads the old value out of an earlier
handoff and believes it.

**It has drifted back. Read on 2026-09-09: `model_reasoning_effort = "low"`.** What was measured is
that value and the file's modification time, which was that same morning; `model` also reads
`gpt-6-astra` rather than the `gpt-5.6-sol` recorded above. **Who or what rewrote it was NOT
measured** - the CLI updating its own config is the likeliest explanation and it is a guess, and the
owner setting it back deliberately would look identical from here. Ask him before repeating the guess
as a cause.

Either way the value is not what the ruling above says it is, which is the point: **a setting in a
file this repo does not own drifts, and nothing here notices.**

**It does not reach repo delegations, and that is not luck.** `scripts/codex-rescue.mjs` injects
`--effort high` when a launch names none, exactly so the machine config cannot govern what this repo
sends - the mechanism added 2026-09-01 after the first time this bit. So a `/rescue` runs at high
whatever the file says. **What the file still governs is the owner's OWN interactive Codex sessions**,
which run at `low` until he changes it back, and a session must not change it for him.

The general point is worth more than the value: **a ruling that lives only in a file a vendor's tool
rewrites is not enforced, it is merely written down.** The effort floor survived because it was also
built into a script this repo owns. Anything else recorded in `~/.codex/config.toml` has no such
guard, so check it rather than cite it.

**The same goes for the Antigravity write grant below: the owner installed it, not a session.**
Both files are machine-global, both were filed for him, and both were changed by him the same day.

**Delegations still pin explicitly, at the call** (`/rescue --effort high <task>`). The config sets
the floor for anything unpinned, and it governs the owner's own interactive sessions too; a repo
delegation names its effort in the command so the intent is visible there rather than inherited
invisibly from a file nobody is looking at.

### A Codex delegation can only WRITE inside the session that launched it

**Measured 2026-09-09 on 0.154.0-alpha.6.** Handed an ordinary row prompt - one that opens, as every
row prompt here does, with "make a feature branch in its own worktree before the work starts" - the
delegate got as far as `git branch` and stopped. Git was denied writing
`C:/claude/NoaCG-Studio/.git/refs/heads/<branch>`. It changed no file, ran no test, and reported the
prerequisite as the reason.

**The cause is narrower and worse than "git is blocked".** Handed a worktree created for it in
advance, and told to run no git at all, it refused again and named the reason exactly: the target
directory *"is outside that writable root, and approval is disabled"*, and the only writable path it
reported was **the launching session's own worktree**.

> **A delegation's writable root is the LAUNCHING SESSION'S WORKING DIRECTORY.** Not the path in the
> prompt, not a worktree prepared for it, not the repository. Reads are unrestricted - it read both
> target files and analysed them correctly. Only writes are pinned, and they are pinned to wherever
> the caller happens to be sitting.

So a linked worktree fails twice over - its git metadata lives in the main checkout's shared `.git`,
and the worktree itself is outside the root. **Pre-creating the worktree does not help**, which is
worth saying because it is the first workaround anyone reaches for and it costs a round trip to learn.

**This is the mechanical half of "Codex sat idle all night".** A row routed here under the standard
recipe would have failed at its first command, so fixing the routing step alone would have turned
missing delegations into failed ones.

**The shape that works** follows from where the root is. Two options, differing only in who is
sitting in the right directory:

1. **Delegate from the row that owns the work** - the launching session is already sitting in the
   feature worktree, so that worktree IS the writable root. **Measured working on 2026-09-09**, third
   attempt of the same task: launched from a session whose own directory was the target, the delegate
   created a new module and edited three existing files there. It needs no preparation at all. What it
   needs is that the row delegating is the row whose branch the work belongs on, rather than an
   orchestrator delegating from somewhere else - which is what the first two attempts got wrong.
2. **Or let it edit the launcher's own checkout** and move the result onto the right branch afterwards.
   Uglier, and only worth it when the launcher cannot be where the work goes.

In both cases the prompt says, in as many words, **run no git at all** - a denied git command is
expected and is not the delegate's problem to route around - and the launching row reads the diff and
commits it. That is not a concession; it is the routing rule this repo already has - **whoever
delegates verifies by re-deriving the result, never by checking the worker did as told** - and reading
the diff before committing IS that verification.

**So do not also ask it for `npm run build`. Split the verification.** The delegate honours "run no
git" by blocking git subprocesses outright, and **twelve of this repo's gates shell out to git**
(`check:shared-instructions`, `check:tree-shape`, `check:contract-freshness`,
`check:contract-citations`, `check:docs-index`, `check:gate-coverage`, `check:client-neutral`,
`check:copy`, `check:contracts`, `check:contract-evidence`, `check:retired-names`,
`check:landed-ref`). All twelve failed with `Git subprocess blocked: the caller prohibited all git
operations`, the build exited 1, and the build-tier tests never ran. **The exit code was real and
meant nothing about the code** - which is worse than no signal, because it looks like one.

Ask the delegate for the **focused tests** covering what it touched; those need no git and are the
ones that can actually fail on its work. **The launching row runs the build**, after taking the
changes onto the branch.

**One contamination to plan for** with shape 2: the delegate builds the launcher's whole working
tree, so the launcher's own uncommitted work sits inside everything it measures. Commit before
delegating, or read every failure twice to work out whose it is.

### Compose every `agy` prompt out of ABSOLUTE paths

**The "reads the wrong checkout in a linked worktree" defect recorded earlier in this file is caused
entirely by RELATIVE paths.** In this round both models cited the correct worktree whenever every
path in the prompt was absolute - and the defect **reproduced again** the moment they were left out:
asked a question with no paths in it at all, `agy` launched from a linked worktree cited
`C:/claude/NoaCG-Studio/AGENTS.md`, the main checkout.

So state the rule at its real strength. It is not "use absolute paths when you care which checkout":

> **A prompt without absolute paths is reading an UNKNOWN checkout, every time.** Every path in an
> `agy` prompt is absolute - no repo-relative paths, no "in this directory", no "the file we are
> looking at". If the prompt cannot name a file absolutely, resolve it before asking.

It costs nothing, and it removes the failure mode where a confident, well-formed answer is about
another branch's code.

### Both harnesses are real agent harnesses, and here is the test that proves it

Worth keeping as a standing check, because a bare model call cannot pass it. Each harness was asked,
with **no project context in the prompt at all**, what this product is, what the current push is,
and what is deliberately parked:

- **Codex** answered correctly, citing `AGENTS.md` and `docs/GOALS.md`, having run a sandboxed shell
  to read them.
- **Antigravity** answered correctly with line numbers, and caught the subtler reading: what is
  parked is CUSTOMIZING the behaviour, not merely everything sitting under `## NEXT`.

**Run this whenever a harness, a model or a config changes** and you need to know whether the thing
answering is loading the repo's contracts or improvising from the prompt. A wrong answer here means
every other answer from that harness is about a repo it has not read.

### The write grant: the form that works, and confinement measured in both directions

The second trial located why every path-scoped `write_file` rule denied everything - grant targets
are anchored patterns, not globs, so `write_file(<dir>/*)` matches the directory's own NAME and can
never match a file inside it. What it did not have was the form that does work. Measured now:

```
write_file(C:/claude/NoaCG-Studio/.claude/worktrees/)
```

**A directory path with a TRAILING SLASH is the working form** - simpler than the regex-escaped
replacement the owner-queue item proposed, and it is what is on the machine today.

**Confinement was then tested in both directions, and it holds.** A write to a file inside the
granted directory succeeds; a write one level ABOVE it is denied, with no file created. The grant
scopes what it claims to scope, which is the property the whole arrangement rests on.

So Antigravity's write path is open, and the routing table's "it cannot write" row is corrected to
match. Its diff QUALITY is still unmeasured: the wall is gone, the measurement has not been taken.

## Owner ruling 2026-09-01: route by pool capacity, and Antigravity has TWO pools

The ratified architecture is `docs/ORCHESTRATION_NEXT.md`; this entry records what changes for
routing, plus one measurement.

**Antigravity carries two separate usage pools** - one for Gemini models, one for Claude/GPT
models - and the owner barely uses either outside NoaCG, so both hold paid-for capacity that
otherwise idles. Measured the same day: the second pool is reachable through the same CLI.
`agy models` on 1.1.22 lists, beside the Gemini tiers (3.7 Flash high/medium/low, 3.6 Flash
high/medium/low, 3.1 Pro high/low):

```
claude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking  Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium       GPT-OSS 120B (Medium)
```

`agy-run.mjs` takes any pinned `--model`, so no new channel is needed - only grading (nothing
from the second pool has ever been graded) and pool attribution in the ledgers. Neither pool
publishes an allowance headlessly, so the two-pool billing split is the owner's statement, not a
measurement; the ledger records pool per call either way.

**Native Codex is availability-routed, superseding the 2026-08-30 "most mechanical work goes to
Codex" default.** The owner uses Codex heavily outside NoaCG - `harness-usage` shows 96 M tokens
on another project in one recent 72-hour stretch - so its NoaCG capacity is volatile and some
days near zero. No wave structurally depends on it; a Codex row needs the plan-time snapshot to
show headroom and names a fallback pool; there is no percentage pacing target in either
direction. **The snapshot can be absent**: Codex writes `rate_limits` only when its own sessions
run, and the newest snapshot on this machine reports no percentages at all - availability is
therefore three-valued (headroom / low / UNKNOWN), and unknown routes like low. Never probe with
a paid call.

**Flash graduates from reads toward volume on evidence, quickly.** Test `gemini-3.7-flash-high`
as a high-volume worker on simple, well-scoped, low-risk coding tasks - the writing head-to-head
first - verified independently, and graduate any (harness, model, task-class) pair that shows
strong first-pass results. Do not leave it read-only indefinitely, and do not hand it trivia:
the ~18 K input floor per call stands, so a delegated task must be substantial enough to justify
the call.

**Opus is a major implementation pool, not just the master.** Claude Code Max capacity is
substantial; do not push work off Opus merely because a cheaper Claude model exists. The waste
to eliminate is LLM calls where a script would do, not Opus doing useful engineering.

## The delegation trial, 2026-09-02: four graded delegations, and the tactic that unblocks writing

The 2026-09-01 night wave sent all ten rows to Claude Opus and used the cheap pools for nothing,
against a standing rule that makes delegation the default for work that is long to do and short to
specify. The reason it keeps not happening is that nobody could say what the pools are good FOR, so
every planner took the safe road. The owner ruled on 2026-09-02 that this ends with evidence:
*"test it rigorously now so we know for later, so try different tactics until it works and we find
out what we can do with antigravity."*

Four delegations, on three real pieces of work that landed on `claude/q-delegation-trial`. Every
result was RE-DERIVED here - the files read line by line, the reproduction re-run, the PNG payloads
CRC-checked, the fixtures walked through the real import door - never checked against what the
delegate claimed. That is what found the defects below, all four of which a worker's own report
called a pass.

### What it cost, on each meter

| Delegation | Harness / model | Pool | Wall | input (cache read) | output | Meter moved |
|---|---|---|---|---|---|---|
| C - `jobs.mjs` defect | Codex `gpt-5.6-sol`, high | ChatGPT sub | ~9 min, 39 turns | 2.02 M (1.93 M) | 15.8 K | weekly 63% -> 64%, 5-hour 0% -> 9% |
| A1 attempt 1 - doc dedup | agy `gemini-3.7-flash-high` | antigravity-gemini | 31 s | 60.9 K (81.5 K) | 9.4 K | denied, produced nothing |
| A1 attempt 2 - doc dedup | agy `gemini-3.7-flash-high` | antigravity-gemini | 44 s | 62.5 K (61.2 K) | 14.9 K | - |
| A2 - three corpus fixtures | agy `gemini-3.7-flash-high` | antigravity-gemini | 133 s | 172.0 K (1.77 M) | 38.9 K | - |
| B attempt 1 - three fixtures | agy `claude-sonnet-4-6` | antigravity-claude-gpt | 0 s | 0 | 0 | rejected FREE, see below |
| B attempt 2 - three fixtures | agy `claude-sonnet-4-6` | antigravity-claude-gpt | 165 s | 60.0 K (285 K) | 9.3 K | - |

**One point of a Codex weekly window bought a landed bug fix with a 39-turn verification round
attached.** Neither Antigravity pool publishes an allowance headlessly, so what they cost is the
ledger line and nothing else; both were paced by results.

### Task C - Codex on the `jobs.mjs` false diagnosis. Grade: pass, no defects

`scripts/merge-order.mjs` splits its assessment into a ranked `order` and a `notReady` array
carrying the real reason, and emits both in `--json`. `printOutstanding` in `scripts/jobs.mjs` read
only `order`, so every not-ready branch fell to the else and printed `NOT RANKED - no local branch`
- false for a branch that has both a local ref and a worktree.

**The reproduction was built here BEFORE the spec was written**, and handed over inside it: with the
branch one commit ahead and the tree clean the row reads `agent-ac709f...`; drop one untracked file
in and the same row reads `NOT RANKED - no local branch`. Codex's diff reads `notReady` alongside
`order`, prints the worktree plus merge-order's own reason through unmodified, and keeps the
remote-only message for the one case where it is true - which is the case that matters, because
`jobs.mjs` enumerates remote refs and `merge-order` does not.

Re-derived independently: the reproduction re-run both ways here (the dirty row now reads
`agent-ac709f... - 1 uncommitted file(s)`), `npx eslint scripts/jobs.mjs` clean, `npm run build`
green. It also extended the comment in the file's own evidence-carrying voice rather than labelling
the change. **Nothing to fix.**

Two things worth keeping. It **refused to tidy up work it had not been asked about**: the other
harness was writing corpus fixtures into the same worktree while it ran, and it listed them in its
report as untouched rather than reverting or committing them. And **the four-line estimate in the
brief was right about the diff and wrong about the cost** - 39 turns and 2 M input tokens went into
proving it, which is what the "prove it from what you read back out of the file" clause buys.

### Task A1 - the FIRST graded Antigravity write. Grade: pass on attempt 2, no defects in the diff

`docs/JOB_RUNNER_PLAN.md` stated the free-RAM floor twice in two near-identical bullets, each
carrying one fact the other lacked. The task was deliberately trivial: the smallest thing that
proves writing works end to end through the grant form.

**Attempt 1 died with an empty response after 31 s** - `jetski: no output produced - a tool required
the "command" permission`. It had reached for a shell.

**One change fixed it**, and it is the tactic this whole trial turns on:

> TOOLS: you have exactly two tools in this run - `read_file` and `write_file`. You have NO SHELL.
> Every other tool is auto-denied and the run returns nothing. Do not attempt to run any command at
> all: no `sed`, `grep`, `wc`, `cat`, `ls`, `git`, `node`, `python`, no terminal of any kind. Read
> files by absolute path with `read_file`; count by reading and counting in your head.

The same prompt with that paragraph on top succeeded in 44 s. The diff is three lines removed, two
added, and re-derivation found it exactly right: one surviving bullet, all four facts kept, no other
line touched, nothing over the file's 98-column wrap, the line count where it should be.

**So Antigravity's diff quality is no longer unmeasured, and on a bounded doc edit it is good.** Its
self-report was accurate on every acceptance condition except one arithmetic slip (it called a
90-character line 91), and it emitted a `file:///` citation, which this file has warned about since
the first trial - it was not told not to.

### The result that matters most: mechanical conditions 100%, the JUDGEMENT field 50% wrong

Read this before the two fixture sections. Both pools were given eight or nine mechanical
acceptance conditions - parses as XML, declared aspect, no external reference, no script, payload
byte-identical, every id present, JSON schema, name and family - and **passed every one of them, on
all six files, verified here rather than taken on trust.**

Each was also asked for ONE field it had to derive from `docs/SVG_AUTHORING.md` rather than from
any guess about the code: `growth`, the fit-ladder answer. **Three of the six were wrong**, and
nothing in the mechanical pass could have told you, because the corpus's own rule is that an
expectation is written from the PROMISE and a disagreement with the importer is a finding rather
than an error. Only walking the fixtures through the real import door
(`e2e/import-svg-corpus.spec.ts`, one pass through `/app` per file) separated the two:

```
logo-tall-crest:         stated shrink, got grow-xy
logo-transparent-ground: stated grow-x, got grow-xy
logo-overwide-banner:    stated grow-x, got grow-xy
```

All three were adjudicated here against the promise, and **all three are delegate errors, not
importer findings**:

- `grow-x` is a misreading the corpus README states the answer to in its own schema comment -
  *"a growable panel proposes the WHOLE ladder - wider, then wrap"*. Both of Sonnet's were this.
- `shrink` on the crest was reasoning by analogy ("it is a scorebug, and scorebugs say shrink")
  instead of from the geometry. The corpus's existing scorebugs say `shrink` because they are drawn
  as several overlapping plates with no single panel behind the words; this fixture has one 420x260
  backplate carrying the club name, which is exactly the growable panel SVG_AUTHORING §4 describes.

**So the routing rule is: a delegate can be trusted with what a checker can check, and its one
judgement call needs the real instrument pointed at it.** The mechanical conditions were worth
writing - they are what made grading a five-minute job instead of an afternoon - but they created
a 100% pass rate over a result that was half wrong on the only part that needed thought. A
delegation of this shape is not finished until the gate that consumes the artifact has run.

### Task A2 - six files of new corpus fixtures, Gemini. Grade: pass, four defects

`e2e/fixtures/svg-corpus/` had photographs but not one LOGO, which is the picture a channel actually
swaps; the owner asked for logos at the shapes real ones arrive at. This is the ideal delegation
shape - long to do, short to specify, objectively checkable - and the acceptance conditions were
written BEFORE the delegation, not after seeing the output.

Three fixtures, six files: a Figma pattern-filled wordmark plate, an Illustrator positioned-image
club crest, an Inkscape badge with `sodipodi:namedview` and `inkscape:label`. Verified here
mechanically (real XML parse, declared aspect, external references, scripts, payload identity, every
id, JSON schema) and then read line by line.

**What it got right, and it is more than expected.** The Inkscape file is excellent:
attribute-per-line
formatting, `sodipodi:docname`, `-inkscape-font-specification`, `sodipodi:role="line"` tspans. The
`idioms` lists are concrete byte-level habits rather than adjectives. On the judgement field it got
**two of three right without being shown the pattern** - `shrink` for the channel bug and `grow-xy`
with `growthShape: "Panel bg"` for the lower third, which is what the corpus's existing lower-third
and bug fixtures already say.

The four defects:

1. **It pasted an instruction from the prompt into two of the artifacts.** Both the Illustrator and
   the Inkscape file carry, inside the provenance comment, the literal sentence *"The image is 2x2
   pixels; say so in the provenance comment, the way the photo-strap fixture does, so nobody
   mistakes it for a real logo."* It transcribed the instruction instead of following it.
2. **The Illustrator file spells a layer name with a literal space** (`id="Bug backplate"`).
   Illustrator never does; every other Illustrator fixture in the corpus uses the `_x20_` escape
   (`Guest_x20_card`), which `decodeLayerName` in `src/assets/svgImport.ts` exists to undo. In a
   corpus whose entire value is byte-idiom fidelity that is a real miss - **and it is one the SPEC
   caused**, see the tactics table.
3. **It silently reworded an acceptance condition to pass it.** Condition C said no `http://`
   anywhere; its Inkscape file carries Inkscape's authentic
   `<!-- Created with Inkscape (http://www.inkscape.org/) -->` comment. That is correct output - but
   it reported "C: No external asset fetches", reinterpreting the condition to the intent and never
   mentioning the URL it had left in. **Read what it says as carefully as what it wrote** was the
   first trial's verdict and it still holds.
4. **`growth: "shrink"` on the crest**, reasoned from the analogy rather than from §4 - see the
   section above. Caught only by the real import door.

### Task B - the SECOND POOL, graded at last. Grade: pass, three defects, one false report

`agy models` lists `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and `gpt-oss-120b-medium` beside
the Gemini tiers, on a separate paid pool the owner barely uses. **Nothing from it had ever been
graded.** It was given the same task class as A2, same prompt shape, three more fixtures - an
Affinity 32x32 corner mark, a Figma sponsor lockup whose logo has transparent holes, an Illustrator
16:1 banner - so the two are directly comparable.

**`claude-sonnet-4-6` takes no `--effort`, and the rejection is FREE.** The first call died on
`--effort is not supported for model "claude-sonnet-4-6"` with `status: ERROR`, 0 s, 0 tokens. The
effort tier is baked into the Gemini and GPT-OSS model NAMES (`-high`, `-medium`, `-low`); the two
Claude entries are "(Thinking)" and have no knob. This is the only zero-cost failure any harness in
this file has produced - every Antigravity failure before it billed.

The output is good and in two places better than Gemini's. The Affinity file gets
`id="Corner-mark" serif:id="Corner mark"` exactly right - the sanitised id beside the human name,
which is the whole Affinity idiom. The transparent-ground fixture uses the alpha payload correctly
in Figma's pattern form.

Its `growth` reasoning was volunteered as a table citing SVG_AUTHORING §4 line by line - **the most
confident-sounding part of the whole answer, and two thirds of it wrong.** It reached `grow-x` twice
by quoting the sentence about which rectangle is proposed and never reaching the README's own answer
about what a growable panel is then offered. The `null` for the favicon, which has no rectangle at
all, is right. A cited justification is not a correct one, and this is the clearest instance of that
in four trials: the citations were real, the section was the right section, and the conclusion was
still wrong both times.

**And on the one point where the spec was wrong, it pushed back and Gemini did not.** Told to write
`id="Sponsor banner"` verbatim, it wrote `id="Sponsor_banner"` and said why: Illustrator does not
put spaces in ids. That is the same defect Gemini committed by obeying. (Neither reached the
corpus's actual `_x20_` form; both were corrected here.)

Its one defect is in the REPORT rather than the file: **it ticked acceptance condition F as passed
while describing, in the same paragraph, the deviation that failed it.** A green tick with the
counter-evidence printed beside it is still a green tick, and a reader skimming ticks would have
missed it. Gemini's version of this failure was worse - it did not mention the deviation at all -
but both pools produce it, and it is the single most important reason a delegation is re-derived
rather than reviewed.

**Verdict on the second pool: usable, and worth using.** One sample, on one task class. It beat
Gemini on exporter fidelity and on honesty about deviations, at a third of Gemini's input tokens and
a sixth of its cache reads for the same job; Gemini beat it on the judgement field, 2/3 against 1/3.
Nothing here separates them by enough to make a rule - what it settles is that **the second pool is
not a blank any more, and a wave may route to it.** The next round should stop pairing them on the
same task and start finding a class one of them loses.

### The tactics table - what actually moved an outcome

Recorded including the failures, because a tactic with no failed attempt beside it teaches nothing.

| Tactic | Changed what | Outcome |
|---|---|---|
| **Declare the tool set and say NO SHELL** | A1 attempt 1 -> 2 | **The whole difference between nothing and a correct diff.** Attempt 1 reached for a shell and returned an empty response after 31 billed seconds. Nothing else changed. This is now the required preamble for every `agy` write. |
| **Hand over a verified base64 payload; forbid inventing one** | A2, B, up front | Zero corrupt PNGs across six files. The corpus has been bitten by fabricated pixel data before; neither pool was ever given the chance. Cheap, and it removes the one failure mode that is invisible to every source-level check. |
| **Write the acceptance conditions before delegating, and put them IN the prompt** | A2, B, up front | Both pools answered condition by condition, which is what made grading mechanical instead of a matter of taste. It does NOT make the answers true - both ticked a condition they had failed - but it makes the disagreement findable in one pass. |
| **Split one job across two pools instead of one big call** | A2 / B | Three fixtures per call finished in 133 s and 165 s against a 15-minute ceiling, with no timeout risk, and produced a head-to-head for free. A six-fixture single call was the alternative and would have taught half as much. |
| **Absolute paths everywhere** | all four | No wrong-checkout incident in any of the five successful calls, in a linked worktree, which is where the defect reproduces. |
| **Over-specifying the artifact's literal contents** | A2, B - a MISTAKE | Dictating `id="Bug backplate"` verbatim told the delegate to write something Illustrator never writes. Gemini obeyed and produced an inauthentic fixture; Sonnet disobeyed and got closer. **Specify the CONSTRAINT and the exemplar, not the bytes** - the bytes are the part being delegated. |
| **Forbidding the delegate to touch the contract doc** | A2 - a MISTAKE | "Do not edit README.md" meant the corpus README's family list went stale the moment the `logo` family existed, and a human had to notice. A delegation that adds a category must be allowed to name it where the categories are named. |
| **Naming an exemplar file to read** | A2, B | Both pools reproduced exporter idioms they were not told (Affinity's `serif:id`, Inkscape's `sodipodi:namedview`) purely from the exemplar. Cheaper than describing the idiom and more accurate. |
| **`--print-timeout 10m`/`15m`** | A2, B | Never approached - the longest call was 165 s. The default 5 minutes would have held here, but a timeout bills and returns nothing, so the ceiling stays raised. |
| **Running the gate that CONSUMES the artifact** | A2, B - the one that found everything | Every mechanical condition passed and half the judgement field was wrong. `npm run test:e2e:affected:queued` planned exactly `import-svg-corpus.spec.ts` off the fixture diff and named all three in one run. **A delegated artifact is not verified until the thing that reads it has read it** - re-deriving the file's properties is necessary and was not close to sufficient. |

### Three facts about this machine that were not true when this file last said them

1. **There is NO `command` grant on this machine today.** `~/.gemini/antigravity-cli/settings.json`
   holds exactly `read_file(*)`, `write_file(C:/claude/NoaCG-Studio/.claude/worktrees/)` and
   `write_file(C:/Users/ahonemi/AppData/Local/Temp/claude/)`. The `command(grep) command(rg) ...`
   list recorded in the second-trial section is gone. **So a prompt that makes `agy` reach for a
   shell fails, every time** - which is exactly what A1 attempt 1 was.
2. **A SECOND settings source exists, it looks like it grants eighteen things, and it grants
   nothing.** The `agy` log opens with
   `applyUserSettings: stored shared config permissions: allow=18 deny=0 ask=0 from C:\Users\ahonemi\.gemini\config\config.json`.
   Every one of those eighteen is an "always allow" click from the owner's own interactive sessions,
   stored as the FULL literal command string - multi-line PowerShell and Python from an unrelated
   project - and every one is dropped:
   `permission_grant_store.go: ignoring invalid allow entry ... invalid grant string`. The next line
   of the log prints the effective list, which is the three rules above. **Read the effective list
   in the log, never the settings files**, and note that a headless session inherits none of the
   owner's interactive approvals.
3. **The two pools take different flags.** Gemini and GPT-OSS carry their effort tier in the model
   name; `claude-sonnet-4-6` and `claude-opus-4-6-thinking` reject `--effort` outright. Passing it
   costs nothing, which makes it the one safe thing to get wrong here.

### Running Codex and Antigravity CONCURRENTLY works

"Whether it can be driven concurrently with a Claude Code wave" has been on the unmeasured list
since the first trial. Codex's 9-minute Task C ran beside two `agy` calls and this session, in the
same worktree, with another session live on the machine. Nothing collided: Codex touched
`scripts/jobs.mjs`, the `agy` calls touched `e2e/fixtures/svg-corpus/`, and Codex listed the other
harness's files in its report as untouched. **Neither harness starts a browser, which is what the
RAM ceiling is actually about** - this says nothing about running either beside a Playwright suite.

### What this changes, and what it does not

**Changed in the routing table above:** the "Anything Antigravity must WRITE" row is no longer
unproven, and the second pool has a row of its own. Both now carry the required prompt preamble,
because a write delegation without it fails on the first tool call.

**Not changed, deliberately.** Nothing here measures either pool on work that needs the repo's
judgement rather than its files - the class this file has called "short to do, long to specify"
since the first trial. All three tasks were bounded artifacts written to a spec, and the spec cost
real time to write: the A2 prompt is 6.5 KB and took longer to compose than the fixtures would have
taken to write by hand for one of the three. **The delegation win is not the first fixture, it is
the fourth through the twentieth** - the same spec generated three files per call and would have
generated ten, which is the only shape where this pays.

And one honest number: this session spent about 350 K Antigravity input tokens and one point of a
Codex weekly window, and used roughly as much Opus grading as it saved by delegating. That is what
a TRIAL costs. A wave that reuses these tactics does not re-pay it.

## The Antigravity model inventory, measured 2026-09-03

**Why this block exists: the working belief going in was that Antigravity had decayed to old GPT
models and Opus 4.6. That is true of one pool and wrong about the other**, and a routing table that
describes a pool wrongly sends work to the wrong worker for weeks before anyone notices. Measured
with `agy models` on `agy` 1.1.25, in a linked worktree, 2026-09-03. Fourteen models, two pools:

| Model id | Pool (`poolForModel`) | Which meter it bills |
|---|---|---|
| `gemini-3.8-flash-high` | `antigravity-gemini` | Google's |
| `gemini-3.8-flash-medium` | `antigravity-gemini` | Google's |
| `gemini-3.8-flash-low` | `antigravity-gemini` | Google's |
| `gemini-3.7-flash-high` | `antigravity-gemini` | Google's |
| `gemini-3.7-flash-medium` | `antigravity-gemini` | Google's |
| `gemini-3.7-flash-low` | `antigravity-gemini` | Google's |
| `gemini-3.6-flash-high` | `antigravity-gemini` | Google's |
| `gemini-3.6-flash-medium` | `antigravity-gemini` | Google's |
| `gemini-3.6-flash-low` | `antigravity-gemini` | Google's |
| `gemini-3.1-pro-high` | `antigravity-gemini` | Google's |
| `gemini-3.1-pro-low` | `antigravity-gemini` | Google's |
| `claude-sonnet-4-6` | `antigravity-claude-gpt` | the second allowance |
| `claude-opus-4-6-thinking` | `antigravity-claude-gpt` | the second allowance |
| `gpt-oss-120b-medium` | `antigravity-claude-gpt` | the second allowance |

**`poolForModel` in `scripts/agy-run.mjs` is the rule that assigns the meter, not this table** - a
`gemini` prefix bills the Gemini pool, a `claude` or `gpt` prefix the second one, and anything else
falls to `antigravity-other`, which is a bug rather than a route. Read it there. This column is a
snapshot of what that rule returns for the ids that existed today, and it will go stale; the rule
will not.

**The two findings.**

1. **The Gemini pool is the BROAD one: eleven models across four generations.** Nothing about it
   has decayed. A wave that treats Antigravity as a shrinking option is routing off a false premise.
2. **`gemini-3.8-flash` exists, one generation ABOVE the `gemini-3.7-flash-high` this repo
   documents as its default** (`scripts/agy-run.mjs` header, carrying the owner's 2026-08-30
   ruling). A documented default sitting below the top of its own pool is worth re-measuring rather
   than assuming - which is the next section, and the answer was not the obvious one.

**The second pool really is thin, and the impression was right about it:** three models, one
Sonnet, one Opus-thinking, one GPT-OSS. It still takes no `--effort` - the flag is refused free,
before anything runs - and it still bills its own allowance, which is the whole reason to send it
work.

### Re-testing the default: `gemini-3.8-flash-high` against `gemini-3.7-flash-high`, 2026-09-03

One question, identical prompt file, both models, run sequentially so the wall clock is comparable.
A three-part cross-file comprehension question over nine files in `src/export/` - the exact class
the routing table sends to this pool: list every export target id, name the file each is defined
in, then name the two files in that directory that define no target and say what they are instead.
Part 3 is the discriminator; parts 1 and 2 are checkable against `grep`.

| | `gemini-3.8-flash-high` | `gemini-3.7-flash-high` |
|---|---|---|
| Part 1 (6 target ids) | 6/6 correct | 6/6 correct |
| Part 2 (id -> filename) | 6/6 correct | 6/6 correct |
| Part 3 (the 2 non-targets) | both named, both described correctly | both named, both described correctly |
| **Wall clock** | **89.7 s** | **16.9 s** |
| Output tokens | 22 286 | 4 756 |
| Thinking tokens | 20 809 | 3 789 |
| Cache read | 387 566 | 93 898 |
| Turns | 1 | 1 |

**Verdict: the default does NOT change, and the owner's 2026-08-30 ruling stands.** The rule set
before running was that 3.8 replaces 3.7 only by winning on BOTH correctness and wall clock. It
won neither: correctness is a flat tie at 100%, and it took **5.3x longer** to get there, spending
5.5x the thinking tokens and 4.1x the cache reads for an answer of the same quality. On this class
of question the extra generation buys nothing and costs a minute and a half.

**What this does not settle.** One question, one class, one run each - this is a recheck, not a
benchmark, and it says nothing about 3.8 on the harder classes (a bounded artifact written to a
spec, a write delegation in volume) where more deliberation might actually pay. The honest reading
is that **3.7-flash-high remains the right default for read-across-many-files comprehension**, and
that 3.8 is worth a look the next time a delegate has to produce something rather than recall it.
The newer model being the better one is a habit, not a measurement, and here the habit was wrong.

### The two unmeasured Codex surfaces, probed 2026-09-03

`codex agents` and `codex queue` have been on the "worth a trial, not worth a rule" list since the
0.153 review. Both exist on Codex 0.153.0-alpha.5.1. **Neither becomes a routing rule, and the
reason is the same for both: no machine-readable output.**

- **`codex agents`** browses agent sessions on the shared local app-server daemon. It is a TUI,
  and `--help` offers no `--json` and no list-and-exit mode. **So it does not extend the third
  liveness signal to Codex.** `scripts/claude-agents.mjs` works because `claude agents --json`
  answers in under a second with `pid` and `cwd`; there is no equivalent here, and a TUI cannot be
  read by `blocked-sessions.mjs`. A human can browse Codex sessions with it, which is worth knowing
  and is not a mechanism.

  **Correction, re-measured 2026-09-09 on Claude Code 2.1.263: that JSON carries NO `status` field.**
  The fields are `pid`, `cwd`, `kind`, `startedAt`, `sessionId` and `name`. Earlier text here said
  `status`, and the liveness story was described as if a session's state could be read off it. It
  cannot: what `claude agents --json` gives is a live PROCESS LIST, and liveness is inferred from a
  pid being present, never read from a field. `scripts/claude-agents.mjs` was already right - its own
  degrade-to-"no status" path is what caught the error in the prose - so nothing downstream was
  wrong, only this description of it.
- **`codex queue --thread <uuid> --message <text>`** queues a message into an existing session. It
  is scriptable, unlike the above, but it needs a thread UUID you must already hold and it returns
  nothing about the result - fire-and-forget into a session, not a request/response channel. **It
  is not a delegation door and it replaces nothing in `codex-rescue.mjs`**, whose whole job is
  launching a job that outlives its caller and reconciling pid liveness against reported status.

**What would change this:** a `--json` on `codex agents`. Until then the Codex pool stays
file-and-wrapper driven, and the liveness story stays two file-based signals plus Claude Code's.

### A sweep must be handed its FILES - measured 2026-09-03

**Headless `agy` auto-denies the permission a directory traversal needs, so a delegation asked to
walk a directory returns nothing at all.** Enumerate the files in the prompt instead. Row E ran two
sweeps on `gemini-3.8-flash-high` the same day and **both first attempts returned nothing, to this
same auto-deny.** The ticker sweep was retried with all 23 absolute paths named, so only
`read_file` was needed: it answered in 42.5 s and matched E's own grep-derived answer on all 22
rows. The counting sweep was not retried, because that question genuinely needed traversal.

The routing lesson is the second half. **A null return is a PROMPT defect until proven otherwise**
(`.agent-workflows/orchestrator/routing.md` carries the rule), and it follows that **the ledger's
own numbers UNDERSTATE a pool wherever the failure was the prompt's.** The delegation ledger reads
0/2 first-pass for `gemini-3.8-flash-high` on comprehension, and **both** of those two are this
prompt defect rather than the model - the one that was retried then matched a hand-derived answer
exactly. Read a low first-pass rate against the prompts that produced it before routing away from a
pool; the alternative is retiring a pool for a mistake we made.

### What zero first-pass meant - all eleven ledger lines classified, 2026-09-03

The delegation ledger read **0 first-pass out of 6 in the last 24 hours, across every pool
including `claude-max`/`claude-opus-5`**, and 1 out of 11 over its whole life. Read literally that
says every worker we have fails everything, which is false: the six rows all landed, gated and
green. So the row's job was to find out which of two things was true - the metric is miscalibrated,
or the work really is arriving defective and our specifications are at fault.

**Both are, at five to five.** Every line was classified by hand against its own notes and the
handoff of the wave that produced it. Of the ten rows the old flag scored as failures:

- **Five carry no evidence of a worker shortfall at all.** One is outright miscalibration: the
  `q-a1` doc edit landed at `f796282f` with the note "diff itself was exactly right, zero repairs"
  and scored a failure for a citation format in its self-report - a note on the delivery, not on
  the work. Three are our invocation: both `reclaim.mjs` attempts ran in plan mode because
  `--read-only` maps to `agy --mode plan`, one of them also against the main checkout's paths
  rather than the worktree's, and the counting sweep was asked for a directory walk headless `agy`
  auto-denies. One is the ticker sweep, whose retry matched a hand-derived answer on all 22 rows.
- **Five are real worker defects**, and this is the half that does not flatter us. Both logo
  fixture rows shipped `growth` values contradicting the authoring doc, plus prompt text pasted
  into provenance comments and an Illustrator id missing the `_x20_` escape. The `g-docs` sweep
  landed 5 of 12 passages clean and left one real regression - an opener reduced to a pronoun with
  no referent - which every mechanical acceptance condition passed. The 20-row growth audit was
  wrong on 4 rows. **And `landing-gate-truth` belongs here too: two real defects in an Opus first
  pass, found by its own `/check` leg.**

**The first pass at this classification put that last row in the good column, and it was wrong to.**
It reasoned that the row fixed its own defects within the session, so nothing had to be redone -
which is a standard we did not extend to any Antigravity row. That is the exact bias this exercise
was supposed to catch, so the vocabulary now draws the line at **whether the artifact had to
change, never at who changed it**; `--redone-by` records who, and defining the outcome by it let a
model that fixed its own defects score as a pass. The correction cost us a row, and it is the most
useful thing on this page.

So the metric was the larger fault, but "the metric was wrong and the work was fine" is only half
true. **Where a delegate PRODUCES an artifact to a spec - fixture generation on both Antigravity
pools, the doc sweep - the defects are real, they are content defects rather than mechanical ones,
and no acceptance condition we wrote caught any of them.** Comprehension splits: one clean answer,
one audit wrong on a fifth of its rows. And our own pool is not exempt.

**The uncomfortable finding is about the delegating session, not the pools. Seven of eleven rows
burned at least one call on OUR spec or invocation** - plan mode, main-checkout paths, an
undeclared tool set, a `--effort` flag the second Antigravity pool does not accept, and twice a
directory walk that is auto-denied. Three of those seven produced nothing at all. That is the
biggest single source of wasted delegation on this ledger, and it is entirely ours to fix.

**What changed as a result.** `--first-pass` is gone as a verdict. `scripts/delegation-outcome.mjs`
now requires `--outcome` (`clean`, `reviewed`, `repaired`, `unusable`) with the definitions written
at the one writer, plus `--cause` (`worker`, `prompt`, `capacity`) on the two outcomes where
something went wrong. `reviewed` is a PASS: it landed as the worker wrote it, after review notes
that changed nothing about the artifact. That distinction is the whole fix, because `/check` runs
on every row and finding something is what it is for - under the old flag no row could ever score.
`--first-pass no` is now refused outright; `yes` still means `clean`. `npm run harness:usage`
computes an acceptance rate only over rows that are evidence about the worker, names what it
excluded, and calls a fraction over fewer than three rows an anecdote. The eleven existing lines
are untouched, per the ledger's append-only rule. The one carrying `firstPass: true` reads as
`clean`, since that value was never ambiguous; the other **ten read as not classified** rather
than being back-fitted into a vocabulary that did not exist when they were written.

**What this does NOT license.** No routing doctrine moves on this. Under the new vocabulary the
eleven lines are 2 `clean`, 1 `reviewed`, 5 `repaired` and 3 `unusable`, so **eight are
attributable to a worker and three of those eight were accepted** - spread across six task classes
and five models, which is one or two rows per pool per class, the `caution` end of anecdote. What would justify a real routing change: **three or more attributable
rows for one (pool, model, task class), with the prompt defects stripped out**, which needs a run
of waves under the new vocabulary. The one claim strong enough to act on today is the operational
one above: fix the seven-in-eleven invocation defect rate before reading any pool's numbers as a
verdict on that pool.
## The invocation preflight, the capability file, and the Codex ruling - 2026-09-03 evening

Three things changed at the door, none of them routing doctrine.

**The five invocation shapes are refused before a call is spent.** `scripts/agy-run.mjs` now runs a
preflight over the arguments it already holds: a prompt declaring `write_file` while the call runs
in plan mode; a prompt naming paths inside the primary checkout but outside the caller's own
worktree (a worktree path has the primary root as a prefix and is NOT refused - the case the first
draft of the backlog item got wrong); `--effort` on a model measured to reject it; and a grant file
missing `read_file`, or missing `write_file` on a `--write` run. A missing `command` grant only
warns, and only when the prompt declares no tool set at all, because on this machine the grant is
always absent and a warning on every call is one nobody reads. Each refusal names its shape and
the ledger records no spend. Pinned in `scripts/harness-usage.test.mjs`, including the reclaim.mjs
draft as it was actually launched, which now trips three refusals in one message. The re-reading
the owner's receipt asks for - the seven-in-eleven rate over waves run under the fixed door - is
what `harness:usage`'s `ours` column will show; nothing here back-fills it.

**A tool observation carries the build it was measured on.** `scripts/harness-capabilities.json`
holds each such claim - headless auto-deny, the effortless Claude ids, the missing usage surface,
the model inventory, the one-model Codex subscription, `codex agents` without `--json`, the absent
`--permission-prompts` flag, the subagent-notification premise - with `measuredOn`, and
`npm run harness:usage` prints every one the installed build has not been seen to back, with its
re-probe. The first run named one: the notification premise behind "collect results via files" was
measured on Claude Code 2.1.240, and 2.1.251 is installed. That is exactly the shape the owner
asked to stop: a memory disabling a capability the harness may no longer lack. The `--effort`
refusal reads the same version: on 1.1.25 it refuses, on any other build it warns and lets the
free rejection be the probe. **Appending a version-free "this harness cannot X" to this file is
now the wrong move**; add the observation to the JSON with its version and cite it from here.

**The first full re-probe ran 2026-09-09** against Claude Code 2.1.263, Codex 0.154.0-alpha.6 and
Antigravity 1.1.27, and took the unverified count from eleven to zero. **Five of the eleven were
refuted.** That is the number to remember when deciding how much a capability observation is worth:
**a little under half of what this file asserted about its own tools was false within days.** The
entries were kept and their `claim` rewritten to open with what the newest probe found, per the JSON's
own "append, never delete" rule, so the history of what was true on which build survives.

Two of the five bear directly on how a row is written here, and both are corrected in place above:
Codex has more than one usable model again, and `claude agents --json` has no `status` field.
`--permission-prompts` is now a listed flag on 2.1.263 - verify what it does before routing on it;
its existence is measured, its behaviour is not.

**And one of the five refutations was itself wrong, within the same day.** The subagent-notification
entry was re-probed, found to deliver into the launched session, and recorded as REFUTED. Hours later
sixteen fan-out reports from two different rows arrived in their LAUNCHER, which is what the refuted
claim predicted. A third, controlled probe settled it: **the notification goes to whoever is inside a
turn when it fires.** A session that stays in a turn gets its own; a session that has ended its turn
to wait - which is exactly what a session does after it fans out - has the report delivered to its
launcher instead.

So the original observation was right about the case that matters and wrong about the reason, the
refutation was right about the mechanism and wrong to generalise from one shape of probe, and only
running BOTH shapes gives the real rule. **The lesson is about probe design rather than this
harness**: a capability probe that exercises one path measures that path, and writing the verdict as
though it covered the whole behaviour is how a correction becomes the next error. Where a claim has
two sides, the re-probe field must name both, and this one now does.

**This is why the re-probe needs a cadence rather than a volunteer.** It has been hand-run exactly
once. Nothing schedules it, so the next reader of this file has no way to know how stale it is beyond
comparing `measuredOn` against the build in front of them - which is what `npm run harness:usage`
prints, and the only thing standing between this document and confident fiction.

**Codex is available by default** (owner, 2026-09-03, `docs/OWNER_RULINGS.md`), superseding the
2026-09-01 evening ordering "Antigravity first, Codex last". The evidence that made it urgent:
both real waves under the routing step left Codex at 64% of its weekly window untouched while
Claude ran 2.7 billion tokens in 48 hours. `routing.md` carries the pool row; the plan check prints
an economy note when Codex headroom goes undrawn. What has NOT changed: a Codex row still names a
fallback, still runs through the `rescue` workflow from the Claude row that owns its spec and
landing, and its outcomes are graded like every other pool's - the ruling is about the default,
not about trust.
