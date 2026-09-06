# NoaCG development workflow for 12+ parallel sessions: diagnosis and target architecture

Plan only. Nothing in the repo was edited. Every number below was measured today (2026-09-06) on `origin/main` at 296df0ef unless dated otherwise; the commands are in section 2 and in the appendix so they can be re-run.

## 0. The short version

The repo does not have twelve small problems. It has three structural ones, and every symptom the owner listed is a consequence of one of them.

1. **Validation and landing are coupled to the whole repository and to one laptop.** Every landing runs the full 149-spec suite on `main` (119 runner-minutes) whatever landed, a branch "subset" uses all nine shards 84% of the time, and the only thing that can land anything is a node process on the owner's machine. GitHub holds no protection, no queue, no lander. With the lid closed, nothing lands.
2. **Learning writes into loaded context, into the most-shared files.** Every lesson becomes a paragraph in the nearest `AGENTS.md`; the corpus grows 8 KB a day; the root file was edited from 24 branches in 30 days; the only counter-force is a byte ceiling that turns editorial debt into a red build at the worst moment. The ceiling itself measures a Codex launch shape that never happens here.
3. **Shared registries are single lines and single files.** The `build` line in `package.json` was edited in 66 commits in 30 days and is the single most-conflicted thing in the repo. The one-file-per-item directories, by contrast, absorbed 811 commits with 11 resolutions.

The target: a cloud commit queue as the one landing authority; validation tiers selected by the change's dependency cone, not by hand-maintained lists; instruction contracts compiled from a one-file-per-rule store and delivered path-scoped at the moment a file is touched; a `learn` write path that never edits a shared file; and an orchestrator that operates those mechanisms rather than restating them. Recommended landing mechanism: GitHub's merge queue, which needs the repo moved to a free organization (that is the one item that needs the owner; the fallback is an Actions lander with the same contract).

## 1. Diagnosis: the real bottlenecks and why they occur

### 1.1 Landing throughput

**What happens today.** A session runs `/queue-merge`, which writes a job file; one runner per machine picks it up; `auto-merge.mjs` merges `main` into the branch, pushes, waits for `ci.yml` on that push, checks the run, fast-forwards `main`, pushes, then runs production migrations from the laptop's `.env`. Nothing is built or tested locally for the landing; the gate is CI. The queue is exempt from the local suite budget, so landings serialize on GitHub latency, not on RAM.

**Measured.** 482 landings in 30 days (16 a day median, max 36). Queued-to-landed median 9 minutes, p90 79 minutes, max 42 hours; 12% over an hour, 6% over four. First commit to `main`: median 70 minutes, p90 10 hours. 380 merge jobs in 14 days: 269 landed, 89 failed, 8 timed out.

**Why the tail is long.** In order of cost:

- *Waiting for a session that is not there.* "blocked by <branch>: NO landing is queued for it" appears 58 times in the job logs. The rule that only the owning session may queue means a green branch whose session closed holds every branch touching the same files for up to twelve hours.
- *One CI run per attempt, and the run is big.* Each attempt is a fresh push and a 6 to 16 minute run; 27% of branch runs are cancelled by the next push; a shard killed at its 20-minute cap is "no verdict", which spends the 45-minute landing cap (8 timeouts in one night).
- *Red `main` freezes everything.* 16 red-main issues in 30 days, about 78 hours total (11% of the month), during which every landing is refused and the fix needs a hand-typed `--onto-red-main`.
- *The laptop.* A sleep kills `gh run watch`, the reaper marks the job failed, one automatic retry follows. 20% of merge jobs started between midnight and 07:00.

### 1.2 CI cost per change

**Measured over 30 days from the Actions API (2,677 runs, job-level detail for all 1,974 completed runs).** 113,685 runner-minutes, 62 hours a day: `ci.yml` on branches 53%, `ci.yml` on `main` 43%, nightly 3%. 61 `ci.yml` runs a day for 16 landings. Every `main` push runs the full suite: 488 of 512 main runs, 9 shards, 14 jobs, 97 runner-minutes median, 12.8 minutes wall (rising week over week from 9.9 to 14.4). **496 of those 512 re-ran the full suite on a sha that was already green on its branch, the fast-forwarded commit itself: 47,500 runner-minutes, 42% of everything.** Cancelled runs are 15% of `ci.yml` (243 superseded by a newer push, 37 killed by the 20-minute shard cap, 6,466 minutes). Runner minutes are free on this public repo; the price is wall time, queue position and verdicts that never arrive.

What a change class costs on a branch today (files from the plan base, all real runs):

| Change | Plan | Shards | Runner min | Wall min |
|---|---|---|---|---|
| docs only, scripts only, 12 nested `AGENTS.md` | none | 0 | 3 | 2 |
| one component (`ProductionPage.tsx`) | 15 specs | 4 | 19 | 11 |
| one wizard step (`MapSvgFieldsStep.tsx`) | 28 specs | 7 | 28 | 5 |
| `package.json` + 2 scripts + 2 docs | 56 specs | 9 | 50 | 6 |
| `.gitattributes` only | 57 specs | 9 | 48 | 6.5 |
| 14 src + 5 e2e + 3 scripts | 83 specs | 9 | 71 | 10 |
| 88-file branch or a 103-file integration merge | 111 to 113 specs + catalog | 9 | 88 to 104 | 11 to 15 |

There is a cliff, not a curve: a root-level file, `package.json` or the sprint-focus trigger jumps to 53 to 59 specs on 9 shards. Since the fork-point fix of 2026-08-25 no branch push escalates to the full suite; the remaining full branch runs are explicit dispatches (125 in 30 days, 10,972 minutes, all asked for by a session or the lander).

**Why small changes escalate.** Not one bug; a stack of individually defensible rules whose union is nearly everything:

1. `main` runs `--all` unconditionally (`ci.yml:293-295`), so the selector's whole savings are thrown away at the moment that matters least: the code was already green on the integrated sha.
2. The `CORE` list (`scripts/e2e-affected.mjs:462-497`) contains `package.json`, `package-lock.json`, `src/styles`, `src/model/`, `src/store/`, `app.html` and the e2e helpers. `package.json` alone escalated 18 of the last 150 landings; under sprint focus an escalation is 57 specs on 9 runners, 48 runner-minutes, for a one-line script edit.
3. The `MAP` rules are wide and union: `src/templates/` names 46 specs plus the catalog gate, `src/components/wizard/` names 37. A change touching a template, a wizard step and one core file plans 105 of 149 files.
4. The diff base is `github.event.before` (the previous push), and `--integration` silently moves it to the fork point whenever the branch has merged `main`, so the "changed set" routinely includes `main`'s own work. That is also the class of bug behind "a follow-up push cancels the run and plans past a delta nothing covered", which today has a warn hook rather than a fix.
5. Every shard, the factory job and the catalog job each restore node_modules and Chromium: 16 jobs per run against a 20-concurrent-job account limit, shared by 83 runs a day.
6. The docs steer towards bigger runs: "asks for the full suite" (`AGENTS.md:215`), "must be a FULL DISPATCH, never a bare push" (`queue-merge.md:108`), "ask for the whole one" (`VERIFICATION.md:257`).
7. The `IGNORE` list is the only edit "with no alarm attached", so agents add `MAP` and `CORE` entries and never remove them; 130 rules, nothing prunes.
8. Unmapped new specs run only at night; 14 specs are named by no rule today, 9 of them never run on a branch. The cheap fix agents reach for is widening an existing rule.
9. `npm run build` is 31 segments: 19 repo-shape checks and 81 `node --test` files (35 of them orchestrator, wave, hook and harness tests) that no product change can break, held there by `check:gate-coverage`, which refuses a gate with no home rather than asking whether the per-push build is the right home. It costs 1.8 minutes in CI, so it is a contention problem more than a time problem (see 1.4), but it is why every new test edits the same line.

### 1.3 Instruction contracts

**Measured.** 108 contract files, 569,309 bytes (LF). 54 chains, all 54 include the root. Root 22,733 bytes × 54 = 1.23 MB of loaded root; `src/templates/AGENTS.md` 50,907 × 24 = 1.22 MB, the same cost from a file nobody counts as "the root". Tightest chain `src/components/wizard` 101,636 bytes, 8,364 free. The corpus grew 5.8, 9.2 and 8.0 KB/day across three periods since 2026-08-01. The root shrank only when bytes moved to children or to `docs/`; between the two cuts it regrew 25.5 → 34.4 KB in 17 days. The orchestrator family grew 8.8 KB/day this week and sits at 640/640 lines and 198/200. A Claude session in the wizard area loads about 120 KB (~30k tokens) before reading code; every subagent that touches the same files pays it again.

**Three findings change the design.**

- *The 63% evidence figure does not reproduce.* Evidence-bearing paragraphs are 49% by blank-line paragraph, 24% by block, 8% by sentence, 21% by "evidence or rationale" sentence. Evidence is interleaved with rules, so no paragraph-level cut is safe. Verbatim duplication is 0.3% of the corpus (11 sentences). Editing has nothing left to give; only a structural change moves the number.
- *The ceiling measures a phantom.* `project_doc_max_bytes` is Codex's cap on the root-to-cwd `AGENTS.md` chain. Codex here is launched by `scripts/codex-rescue.mjs` with `--cwd` = the worktree root, and Codex stops searching at cwd, so Codex loads the root only (22.7 KB) and never sees a nested contract. Claude Code loads nested files lazily, on first read in that directory, cumulatively across every directory the session touches, with no byte cap. So the 110,000-byte gate protects neither harness's real cost, while the real cost (a Claude session spanning wizard + templates + e2e loads more than any chain the gate checks) is unmeasured.
- *The write path has one destination.* The only honest move for a session that learns something is a paragraph in the nearest contract, and the only removal mechanism is a human. 77 commits from 24 branches touched the root in 30 days; `docs/VERIFICATION.md` is 71 KB, `docs/OWNER_RULINGS.md` 40 KB, `.agent-workflows/orchestrator/incidents.md` tripled in five days. `docs/MISTAKE_TRIGGERS.md`, the file that says where a lesson should go, is itself a 26 KB narrative.

### 1.4 Shared-file collisions

**Measured over 45 days, hunk-level** (a merge region that matches neither parent, the trace of a real resolution): 71 of 608 merge commits (11.7%) carried one. 175 file entries: code 84, `.md` 55, JSON baselines 19, `package.json` 15. Per merge: code-only 40, md-only 17, both 14. 593 "Merge main into <branch>" commits, 89% textually clean: the cost of revalidation is re-verification, not conflict.

**The choke points, ranked by resolutions per edit:** `package.json` (15 resolutions, all on the `build` line), `e2e/catalog-baseline.json` (11), the template registries `packs.ts`/`registry.ts`/`taxonomy.ts`/`meta.ts` (19 together), `scripts/e2e-affected.mjs` (61 branches, 6 merge-order cautions), then the contract files (`src/templates/CLAUDE.md` 6, root and nested `AGENTS.md` 12 together). 67% of all resolved entries are files whose only job is to be appended to by everyone. The three one-file-per-item directories (owner queue, handoffs, backlog) absorbed 811 commits from 150 branch-visits with 11 resolutions, none from two sessions creating the same item. The pattern works; it has not been applied to the registries.

77% of branches touched at least one shared file (nested contracts 40%, handoffs 37%, owner queue 32%, `package.json` 14%, root 8%, GOALS.md 8%).

### 1.5 The orchestrator

The mechanical parts already exist as scripts: `wave-tick`, `wave-watch`, `ci-watch`, `collision-check` over real diffs, `wave-horizon`, `candidates`, `wave-plan-check`, `handoff-drain`, `owner-receipts`, `relay`, `orchestrator-home`, `merge-order`, the queue and its refusal kinds. What is prose: the plan phase (the heaviest and least gated), the collision ruling, the report, and a large narrative restating what the scripts do. Three invariants have no executable check: that `/check` ran (68 stamps on disk, no reader, `auto-merge.mjs` included), that the plan-time collision pass covered shared flows, and that a collision ruling was recorded. The landing rule is stated in seven files and contradicted in three (`check.md:170`, `handoff.md:7,93`, `next.md:102-187` still name safe-merge as the landing path); nothing but a reader compares them.

## 2. Measurements and how to repeat them

| Metric | Value (2026-09-06) | Command |
|---|---|---|
| Landings/day on `main` | 16 median, 36 max, 482 in 30 d | `node scripts/landing-latency.mjs --days 30 --slow 60` |
| Queued → landed | median 9 min, p90 79, max 2,559 min | same |
| Last commit → landed (queue era) | median 13 min, p90 88 min | scratchpad `landing-measure.mjs` (walks the main line; `git log origin/main --format=%H%x1f%P%x1f%ct%x1f%s` + `landed.jsonl`) |
| First commit → landed | median 70 min, p90 598 min | same |
| Merge jobs 14 d | 380: 269 done, 89 failed, 8 timed out | `ls <git-common-dir>/noacg-jobs/j-*.json`; `grep -ohE "auto-merge REFUSED: [^\n]{0,70}" .../logs/j-*.log \| sort \| uniq -c` |
| "blocked by unqueued branch" | 58 log lines | `grep -l "NO landing is queued" .../logs/j-*.log \| wc -l` |
| Red main | 16 issues, ~78 h open, worst 35 h | `gh issue list --search '"CI is red on main" in:title' --state all --limit 50 --json number,createdAt,closedAt` |
| `ci.yml` runs/day | 61 over 30 d (1,850 runs: 512 main, 1,338 branch, 281 cancelled); 83 over the last 3 d | `gh api "repos/NoaCG/NoaCG-Studio/actions/runs?created=<from>..<to>&per_page=100" --paginate` (the `gh run list` cap of 1,000 rows reaches back only 8 days) |
| Runner-minutes, 30 d | 113,685 (62 h/day): branches 53%, main 43%, nightly 3%; 42% is `main` re-running a sha already green on its branch | per-run `actions/runs/<id>/jobs`, summed job durations |
| Full run cost | 149 specs, 1,250 tests, 102.8 recorded min, 9 shards, 16 jobs, ~119 runner-min, 14.4 min wall | `gh run view <id> --json jobs`; `node -e "const t=require('./scripts/e2e-durations.json');console.log(Object.values(t.minutes).reduce((a,b)=>a+b,0))"` |
| Branch run | median 68 runner-min, 8.2 min wall; 27 of 32 "subset" runs on 9 shards | same, plus the plan job log: `gh api repos/NoaCG/NoaCG-Studio/actions/jobs/<planJobId>/logs \| grep -E 'plan: \{'` |
| Installs per run | node_modules restored in up to 12 jobs, Chromium in up to 11 | job step names via `gh api .../actions/jobs/<id>` |
| Escalation replay (150 landings) | 77 none, 73 subset, 40 escalated to focus, 40 raised catalog; planned min p90 72 | scratchpad `classify.mjs` (imports `planFor` from `scripts/e2e-affected.mjs`, `git rev-list --first-parent -n 150 origin/main`) |
| Files that escalate alone | 7.3% of tracked files; 16% of `src/components/` | same script over `git ls-files` |
| `npm run build` shape | 31 segments, 19 checks, 81 node --test files, 1.8 min in CI | `node -e "console.log(require('./package.json').scripts.build.split('&&').length)"` |
| Contract corpus | 108 files, 569,309 B; top 7 = 47.4% | `git ls-files \| grep -E '(^\|/)(AGENTS\|CLAUDE)\.md$' \| xargs wc -c` |
| Chains | 54, all include root; wizard 101,636 used / 8,364 free | `node scripts/check-shared-instructions.mjs` |
| Root multiplier | 22,733 × 54 = 1,227,582; templates 50,907 × 24 = 1,221,768 | scratchpad `chains.mjs` |
| Tokens at start | root-only Claude session ~41 KB / 10k tokens; wizard session ~120 KB / 30k | bytes/4 of the loaded set |
| Corpus growth | +5.8, +9.2, +8.0 KB/day (08-01→15, 15→09-01, 09-01→06) | `git ls-tree -r <sha> --name-only \| grep -E '(AGENTS\|CLAUDE)\.md$' \| while read f; do git cat-file -s <sha>:$f; done \| awk '{s+=$1}END{print s}'` |
| Root churn | 77 commits, 24 branches, 30 d | `git log origin/main --since=30.days --format=%H -- AGENTS.md \| wc -l` |
| Evidence share | 49% paragraph / 24% block / 8% sentence / 21% evidence-or-why sentence | scratchpad `classify*.mjs` |
| Verbatim duplication | 11 sentences, 0.3% | scratchpad `dupes.mjs` |
| Conflict resolutions 45 d | 71 of 608 merges; package.json 15, catalog-baseline 11, registries 19, contracts 18 | `for m in $(git log --merges --since=45.days --format=%H main); do git show --cc --format= $m \| grep '^diff --cc '; done \| sort \| uniq -c \| sort -rn` |
| `build` line edits | 66 non-merge commits, 30 d | `git log --no-merges --since=30.days -G'"build": ' --format=%H main -- package.json \| wc -l` |
| One-file-per-item dirs | 811 commits, 11 resolutions | same `--cc` method restricted to those paths |
| Symbol inventory | root 132 tokens (3 orphan), components 85 (8), wizard 285 (5) | scratchpad `symbols.mjs` |

The scratchpad scripts are in this session's scratchpad directory; phase 0 commits the useful ones as `scripts/metrics/*.mjs` so the targets in section 9 can be checked by anyone.

## 3. Why Chromium does not collapse, and what applies

Chromium integrates thousands of changes a day because **the cost of integrating one change is bounded by the change's dependency cone and by one serialized commit step, never by the size of the tree**. The mechanisms, each with its NoaCG counterpart:

| Chromium mechanism | What it does | NoaCG today | Verdict |
|---|---|---|---|
| Commit queue (CQ) on infrastructure | One authority takes a CL, tests it at tip-of-tree, lands it. Batches. Nobody's laptop. | `auto-merge.mjs` on the owner's laptop, one runner, dead when the lid closes | **Adopt**: GitHub merge queue (or an Actions lander) as the only writer of `main` |
| Presubmit selection from the build graph (`analyze`) | Only the test targets whose dependency cone contains the change run | Hand-written `MAP`/`CORE` lists in `e2e-affected.mjs`, 130 rules, only ever widened | **Adopt**: derive the spec ↔ source map from the import graph (dependency-cruiser is already installed) and from coverage recorded on the nightly full run |
| Test tiers: CQ (blocking, affected) / CI waterfall (post-submit, full) / FYI / nightly | Full validation protects `main` after the fact; it never gates a CL | Full suite on every `main` push AND focus set on every branch push AND configured suite per landing | **Adopt** the tiers; **wrong today**: the full tier fires per landing and gates nothing |
| Sheriffs + auto-revert + flake bots | Post-submit red is answered by reverting the culprit, not by freezing the queue; flaky tests are quarantined by a bot with a bug | Red main freezes all landings (78 h/month); retries 0; flake table empty by rule | **Adopt** auto-revert and auto-quarantine as bots; **inappropriate**: human sheriff rotations |
| OWNERS files and per-directory PRESUBMIT | Ownership and checks are scoped to directories, discovered where you work | Nested `AGENTS.md` as ownership; checks all global in one build line | **Adopt** scoped checks (a check declares the paths it guards); the nested-contract idea is right, its loading is wrong |
| Scoped docs (README per directory), nobody reads all of it | Knowledge is discovered by proximity, not loaded into everyone | 120 KB loaded per wizard session, cumulative across areas | **Adopt** path-scoped delivery (Claude has it natively: `.claude/rules/*.md` with `paths:`) |
| Generated configuration and autorollers | Config is compiled from declarations; bots keep it current | Hand-edited `AGENTS.md`, hand-edited `build` line, hand-edited spec map | **Adopt**: compile contracts, discover tests, generate the spec map |
| Trunk-based, small CLs, no long-lived branches | Rebase cost is small because the CQ re-tests only at landing | Branches merge `main` 1 to 6 times each (593 times in 45 d) and re-verify each time | **Adopt**: the queue re-tests the merged result once; branches stop re-merging `main` except to resolve a conflict |
| LUCI, Swarming, RBE, monorepo build system | Scale infrastructure | none | **Inappropriate**; nothing here needs it |
| Human code review per CL | | `/check` review pass | Keep as is; give the stamp a machine consumer |

**Where NoaCG's architecture is wrong at the level of design, and no tuning reaches it:** (1) the landing authority is a process on a developer machine; (2) the validation gate is a monolith whose scope is the repository; (3) knowledge is stored as loaded prose in files every branch mutates, with a ceiling as the only counter-force; (4) the full-validation tier gates nothing and runs per landing, so it costs the most and protects the least.

## 4. Architectures for instructions and learning

Five structurally different options. Each is judged on the same eleven points.

### Option A: RULE + RECORD by convention

Contracts keep only imperative rules, each with a stable id; dates, run ids, measurements and rationale move to per-area record files that never load. A gate refuses dated or measured text in a contract line. Chains and ceilings stay.

- *Learning:* edit the nearest contract (one rule line) and add a record file.
- *Traps fire:* as today, whole chain at first touch of the directory.
- *Merge contention:* unchanged for contracts; records are one file per item.
- *CI/landing:* none.
- *Reduction:* 25 to 45% (the measured evidence share by block), root multiplier untouched, still ~65 KB for a wizard session.
- *Complexity:* low. *Failure:* paraphrased evidence passes the regex; rules keep accreting at the same rate; a delegate hits the byte target by deleting.
- *Migration:* editorial over 108 files.
- *Six months:* +8 KB/day of rule text with nothing removing any: the chains are full again in about three months.

### Option B: compiled contracts from a one-file-per-rule store (recommended)

Rules live one per file under `contracts/rules/<area>/<slug>.md` with frontmatter (id, scope globs, kind, fires, status, since, supersedes, record). Records live one per incident under `contracts/records/`. A compiler generates every loaded surface: the root kernel `AGENTS.md`, the nested `AGENTS.md` files (for Codex and humans), path-scoped `.claude/rules/*.md` (for Claude, loaded only when a matching file is read), the text a hook or gate prints (looked up by rule id), and the per-task preamble the Codex wrapper prepends. Generated files are refused for hand edits (the existing `guard-edit.mjs` pattern) and checked for freshness in the build. Budgets are enforced by the compiler, not by editing.

- *Learning:* `npm run learn` writes one new rule file and one record file. It touches no shared file.
- *Traps fire:* kernel at launch; area rules when the first matching file is read (native in Claude Code, preamble in Codex); executable rules through their own hook or gate. This is stronger than today: a rule at the bottom of a 52 KB file read at session start has decayed by the time the file is touched two hours later.
- *Merge contention:* zero for rules (unique file names). Generated files are regenerated by a merge driver and by the lander.
- *CI/landing:* a fast compile check in the build.
- *Reduction:* root 22.7 KB → kernel ≤ 8 KB (×54 = 0.43 MB, from 1.23 MB); a wizard session from ~120 KB to kernel + rules scoped to the files it touches, estimated 25 to 40 KB; every subagent pays only what it touches.
- *Complexity:* medium: compiler ~400 lines, `learn` ~150, migration audit ~300, all in the house style the repo already uses for `behaviour-docs.mjs --check`.
- *Failure modes:* over-wide scopes (a rule scoped `src/**` loads everywhere; the compiler reports the most expensive file to touch and the widest rules); a rule with a bad `fires` claim (the compiler verifies the named hook, gate or spec exists); a session that edits via a shell heredoc bypasses the Read/Edit trigger (Codex-style preamble covers delegated tasks; the kernel keeps the five invariants that must never miss).
- *Migration:* mechanical per area with the symbol-survival audit as the gate; each area lands alone.
- *Six months:* the store grows without bound and is not loaded; the compiled surfaces stay inside their budgets by demoting the lowest-priority prose to an index line; retirement is mechanical (a rule whose symbols left the tree fails freshness in the branch that removed them).

### Option C: executable-first, prose as residue

Every lesson must become a hook, a gate, a lint rule or a test; the contract keeps only judgement.

- *Learning:* write code plus a test.
- *Traps fire:* at the call or the build, the strongest trigger.
- *Contention:* hooks are separate files, but registration in `.claude/settings.json` is one shared file.
- *CI:* each gate adds to the build unless path-scoped.
- *Reduction:* modest alone; the wizard contract is mostly taste, layout and procedure, which has no tool shape (`docs/MISTAKE_TRIGGERS.md` says so, correctly).
- *Failure:* over-refusal blocks every session on the machine; 200 hooks on every Bash call.
- *Verdict:* right as a gradient, wrong as the whole. Folded into B as the `fires` field and the compiler's rule that an executable rule costs zero contract bytes.

### Option D: retrieval on demand, no static chain

A kernel tells agents to query `npm run rules -- <path>` before editing; a PreToolUse hook on Edit/Write injects matching rules through `additionalContext`.

- *Reduction:* the largest (kernel only at launch).
- *Failure:* entirely dependent on the hook channel: edits through Bash bypass it, Codex has no hooks, and a retrieval miss is silent. Claude's native path-scoped rules give the same effect at file granularity without the fragility, so D collapses into B's delivery layer. Kept as an optional belt-and-braces channel for heredoc edits.

### Option E: change inheritance, nested replaces parent

Each area contract is complete for its area and the root shrinks to a kernel; nothing cumulates.

- *Reduction:* removes the intermediate parent (26 KB of `src/components` from a wizard session) but the 52 KB wizard file stays and a session spanning areas still pays all of them.
- *Contention and learning:* unchanged. It is a compile semantics, not an architecture, and B produces exactly this output.

### Option F: bounded rolling evidence with expiry

Dated paragraphs expire after N days into records, moved by a bot.

- The owner ruled out periodic trimming; a bot doing it is the same thing with a timer. It still edits shared files, and with evidence interleaved into rule paragraphs (section 1.3) the cut is not safe to automate. Loses.

**Why B wins.** It is the only option that fixes all three structural faults at once: the write path never touches a shared file, the loaded surface is bounded by a compiler rather than by a human, and delivery moves from "the directory's whole chain at first touch" to "the rules for this file at this moment". A, E and F leave the write path as it is; C and D cannot carry judgement rules. B also absorbs the correct halves of A (rule/record split as the file format), C (`fires` and the zero-byte rule for executables) and E (non-cumulative compile).

## 5. Target architecture

### 5.1 Validation tiers

| Tier | When | What | Budget |
|---|---|---|---|
| T0 fast | every push, every local `npm run verify` | tsc, eslint, depcruise, app build; checks and unit tests **scoped by the paths they declare**; the contract compile check | ≤ 3 min, one job, one install |
| T1 affected e2e | every push | specs selected from the change's dependency cone (import graph ∪ coverage map ∪, during transition, the manual map), base = `merge-base(origin/main, HEAD)` always; shard count from planned minutes | median ≤ 10 runner-min for a single-component change; never all 9 shards for a subset |
| T2 landing | in the merge group (or the lander), on the merged result of a batch | T0 + T1 for the batch's union diff + full checks and unit tests + catalog gate when flagged | ≤ 8 min wall, batch of up to 4 |
| T3 post-submit | after each landing batch on `main`, one at a time, a run that finds `main` already past its sha exits at once | full offline suite, catalog gates, configured suite | bounded to one full run per quiet period; never blocks the queue |
| T4 scheduled | nightly / weekly | live suite, drift, freshness, full catalog sweeps, coverage-map refresh | as today |

What changes the shape: `main` stops running `--all` per landing (T3 is one run per batch, and superseded runs exit); the selector's base is the merge-base, never `github.event.before`, which retires the "cancelled run skipped shards" bug class and its warn hook; `package.json` leaves `CORE` (a script-line edit is not a dependency change; the selector diffs the `dependencies` keys instead); the two widest `MAP` rules are replaced by the graph-derived map. One `setup` job builds and uploads `dist` and the node_modules cache; shards restore and run. A new spec declares what it covers in a header, and the build fails a spec with neither a header nor a coverage-map entry (the "unmapped spec never runs" backlog item, now a gate).

**Flakes.** Same-sha re-runs essentially never happen today (3 of 122 failed runs), so flakes are invisible to the current process; by shape, 67 of 136 failure groups in 30 days were single hits followed by green, and `catalog-baseline.spec.ts` alone failed on 18 branches with 12 of those flake-shaped. The 35-hour red of 2026-08-27 was one spec failing on 25 consecutive landings while 25 branches landed on a red `main`. Retries stay at 0 on branches. A T3 failure re-runs the failed shards once on the same sha; fail-then-pass on one sha writes a quarantine entry (spec, date, count) through the queue; quarantined specs run in T3 non-blocking and leave quarantine after 20 consecutive passes. No human in the loop.

**Red `main`.** With serialized landing, the culprit is the last batch. A T3 red that is not quarantine-explained opens the issue as today AND opens a revert PR of the batch into the queue. The queue never stops: every landing is validated against the merged result anyway, so "refuse everything while main is red" protected nothing that T2 does not protect. This replaces 78 hours a month of frozen queue with about 15 minutes of red per incident.

### 5.2 Landing

**One authoritative queue in the cloud, nothing on a laptop.**

*Preferred: GitHub merge queue.* `main` gets a ruleset: pull requests only, merge queue required, required checks `T2 gate` (on `merge_group`) and `noacg/reviewed` (the `/check` stamp, posted as a commit status on the tip). `ci.yml` gains the `merge_group` trigger. Queue settings: build concurrency 4, merge limits 1 to 4, batch timeout 2 min. A failing entry is removed and the rest re-tested by GitHub itself. `npm run queue:merge` becomes a thin client: push, `gh pr create` (or reuse), post the stamp, `gh pr merge --auto --merge`. A cloud orchestrator runs the identical command. The laptop's job runner keeps local gates (browser sweeps, benches) and nothing else; `auto-merge.mjs` retires to a dry-run preflight. **Constraint: GitHub's merge queue is available only to organization-owned repositories** (public ones on any plan). The repo is user-owned, so this needs a free organization and a transfer; GitHub redirects the old URL. That is the one owner action in this plan (`needs: account`).

*As landed, 2026-09-06.* The organisation exists (NoaCG) and `main` is on GitHub's merge queue: `npm run queue:merge` pushes, opens the pull request, posts `noacg/reviewed`, labels it and turns auto-merge on; `ci.yml` runs on `merge_group` and its `CI gate` and `Reviewed` jobs are the required checks; the ruleset (`scripts/landing-ruleset.mjs`) requires the queue, so nothing else writes `main`. An Actions lander (`land.yml`) ran for one afternoon in between, while the repository was still user-owned; it is gone, and `post-land.yml` carries the migrate job on every push to `main`. A local watcher job (`scripts/land-watch.mjs`) keeps the tick, the hooks and the ledger true.

*Phase 1c, as landed.* A red `main` or merge-group run re-runs its failed spec files once on the same commit (`e2e-retry`, from the shards' blob reports); a fail-then-pass passes the gate and writes the specs into `e2e/quarantine.json` through the merge queue; quarantined specs leave the blocking shards and run in their own non-blocking job on `main`, one job per spec, and the `Quarantine release` job queues the release after twenty consecutive passes read from the run history; a `main` push whose failure survives the second run, onto a previously green `main`, gets its batch reverted on `revert/<sha7>` and queued, and the red-main issue names the pull request (`scripts/e2e-quarantine.mjs`, `scripts/revert-landing.mjs`, `scripts/queue-pr.mjs`; the rules in `docs/VERIFICATION.md`, "A red main answers itself first"). The mechanical pull requests carry a `noacg/reviewed` stamp whose description says `mechanical:`, and ask for their branch run by dispatch with `require_review`, since a push made with the workflow token starts no run.

*Production migrations* move to `post-land.yml` with the Supabase token as a repository secret (`needs: account` for the secret); a refused statement files the issue and the owner-queue item exactly as today, and the landing succeeds either way.

*Stacked branches:* a PR whose base is another PR's branch; the queue lands the parent, GitHub retargets the child to `main`, the child's T1 re-runs. The `order-blocked` hold and the "blocked by an unqueued branch" wait are retired: order is queue order, and a PR that conflicts with what landed is marked conflicting and bounced to its session, which is the only thing the hold was standing in for.

*Local verification before queueing:* `npm run verify` = T0 + the affected focus subset, capped; the hook that today only recommends `:queued` refuses a local full suite outright (the matcher has now been measured against real commands, see the MISTAKE_TRIGGERS entry). Nothing local is a landing gate.

### 5.3 Contracts and the learning loop

**The store.** `contracts/rules/<area>/<slug>.md`:

```
---
id: wizard/data-source-holder
scope: ["src/components/wizard/**", "src/templates/shared/base.ts"]
kind: trap            # invariant | trap | rule | taste
fires: contract       # contract | hook:guard-edit | gate:check-copy | test:e2e/import-svg.spec.ts
status: active        # active | retired
since: 2026-09-02
supersedes: []
record: contracts/records/wizard/2026-09-02-inline-hidden-holder.md
---
An input-only value lives in a holder carrying `class="noacg-data-source"`, never an inline `style="display:none"`: the entrance reset clears inline properties and the raw value airs.
```

Rule text: imperative, one to three sentences, symbols in backticks, no dates or measurements (a gate refuses them; they belong in the record). `kind: invariant` is reserved for the kernel and is a hard count, not a byte budget: adding one retires one.

**The compiler** (`scripts/compile-contracts.mjs`, `--check` in the build):

- Kernel `AGENTS.md` (≤ 8 KB): identity, pillars, invariants, the five commands, pointers. `CLAUDE.md` imports it, as today.
- Nested `AGENTS.md` per directory that owns rules, for Codex and for people reading on GitHub; each lists only rules whose scope lives under that directory. Chain totals still pass `check-shared-instructions`, which is not weakened; it simply stops binding.
- `.claude/rules/<scope-group>.md` with `paths:` frontmatter, one file per distinct scope set, so a rule for the SVG import step loads when that step is read and not when a lower-third template is.
- `contracts/index.md`: id, one line, scope, fires, for `npm run rules -- <path>` and for humans.
- Hook and gate text: `rules.text(id)` from the store, so an executable rule's sentence has one home and the contract carries zero bytes for it once the named mechanism exists.
- Codex preamble: `codex-rescue.mjs` prepends the rules matching the paths named in the task prompt.
- Budgets: kernel bytes; bytes loaded for the most expensive single file to touch (target ≤ 40 KB); overflow demotes the lowest priority (taste before rule before trap) to one index line, deterministically, never silently: the report names what was demoted.
- Symbol survival: every backticked token in every active rule is extracted; the freshness gate checks paths, scripts and known symbols against the tree; the migration audit asserts the pre-migration contract's token set is a subset of tokens in rules ∪ records before an area's contract is replaced. A rule file is never deleted, only `status: retired`, so a lost symbol is a visible frontmatter change, not a missing paragraph.
- Near-duplicate detection: token-set similarity over rule text plus shared symbols; two active rules above the threshold fail the compile check with "supersede or merge <id>". The threshold is calibrated on the migrated corpus in phase 2, on known paraphrase pairs.
- Generated files: committed (GitHub readers and both harnesses need them in the checkout), with a `.gitattributes` merge driver that resolves a conflict in a generated file by regenerating from the merged store, and the lander regenerates before T2.

**The write path.** A worker that learns something runs:

```
npm run learn -- --scope "src/components/wizard/steps/Import*.tsx" --kind trap --fires contract \
  --rule "..." --evidence "..."
```

The CLI: (1) refuses dates, run ids and measurements in `--rule` and routes them to the record; (2) runs the similarity check and, on a match, appends the evidence to the existing rule's record and prints "already a rule: <id>", creating nothing; (3) if `--fires` names a hook, gate or spec, verifies it exists, else stores the rule as prose with a `mechanism-wanted` flag; (4) writes the two files and recompiles. The commit carries a rule file, a record file and regenerated surfaces. No shared file is edited. The landing gate (compile check, dedup, freshness) is what ratifies: a rule on `main` is active.

Who decides what: the CLI decides evidence versus rule (mechanical); the worker declares `fires` by answering the two questions from `docs/MISTAKE_TRIGGERS.md` made into the CLI's prompt text (decidable from one call's arguments? from the tree?); the compiler decides loaded versus index-only (budget); the freshness gate decides stale (symbols gone); the dedup check decides duplicate. Nothing is periodic.

**Records** (`contracts/records/<area>/<date>-<slug>.md`) hold the incident, the measurement, the run id and the reasoning, one file each, never loaded, linked from the rule. `docs/OWNER_RULINGS.md`, the incident halves of `docs/VERIFICATION.md`, `docs/MISTAKE_TRIGGERS.md`'s tables, `.agent-workflows/orchestrator/incidents.md` and the auto-memory `feedback`/`project` entries migrate there; memory keeps taste, money and direction, which is already its charter.

**Retired names as a negative check.** `contracts/retired.json` lists a retired mechanism, its date and its replacement (`safe-merge as landing path → merge queue, 2026-08-25`). The freshness gate fails any contract, workflow or agent definition naming a retired mechanism as an instruction. That is the executable form of "a stale landing instruction survived eleven days across four files": it cannot survive one build.

**What stays prose.** The workflow bodies under `.agent-workflows/` load only when invoked; they are not budgeted for context and are not migrated for size. They lose their restated rules and reference rule ids instead.

### 5.4 The orchestrator in the target architecture

The orchestrator plans, launches, watches and reports. It never validates, never lands, never edits a contract, never chooses a test scope. Everything it enforces is a script or a GitHub setting it invokes; its prompts carry goals and territories, not policy.

| Question | Answer |
|---|---|
| Decides vs GitHub/CI/queue | Orchestrator: what work, territory (TOUCHES), model and pool, refill, stop, and what to do about a refusal that is a content problem (relaunch a row with the failure). CI: verdicts (T0 to T3), selection, sharding. Queue: order, batching, landing, revert. Ruleset: nobody else can write `main`. |
| Smallest sufficient validation | It does not choose. The selector computes T1 from the diff; the row runs `npm run verify` and pushes. The prompt template drops GATE instructions beyond "push and let CI plan". |
| Broader CI | Never dispatched by the orchestrator or a row. The full tier runs post-submit and nightly by mechanism. A change to the selector or the coverage map escalates itself (the selector treats its own files as full). A hook refuses `gh workflow run ci.yml` from a row; the only legitimate dispatch is the nightly's own re-run of a red. |
| Submitting branches | The row's `/queue-merge` (push, PR, stamp, auto-merge). For a finished branch whose session is dead, the loop submits when three liveness signals are quiet AND the stamp exists for the tip (executable now; the "may the loop queue" judgement in `night.md` becomes a script condition). |
| Main moved / failed checks / flakes / stacked / contention | Main moved: nothing, the queue re-tests the merge. Failed T0/T1 on a row's PR: the tick reports it; the loop relaunches the row with the failure text. Removed from the merge group: same. Flakes: bots on `main`; on branches a single automatic re-run of failed shards. Stacked: PR base, nothing to do. Contention: the queue batches; `wave-horizon` reads the measured queue latency. |
| Finished vs waiting | Executable: finished = required checks green on the tip + stamp for the tip + auto-merge enabled; waiting = in the queue; finished-looking = clean tree, dead session, no PR, 30 quiet minutes (the tick's existing event), which the loop resolves by submitting if stamped or relaunching a short row to finish, never by queueing unverified work. |
| Preventing shared-file edits | Nobody edits contracts: generated files are refused by hook, lessons go through `learn` into unique files, the registries are split (test discovery, scoped check manifests, per-template baselines, per-file template registration). The MINTS slot mechanism stays only for the few remaining singletons (`docs/GOALS.md` NOW, owned by the orchestrator session). |
| What a worker submits on a lesson | `npm run learn`. The CLI, the compiler, the freshness gate and the landing gate decide evidence / rule / gate / duplicate as in 5.3. The orchestrator's part: `contracts:report` lists rules flagged `mechanism-wanted`; the loop turns them into mechanical rows (sonnet) when it has spare capacity. |
| Serialize or aggregate learning | Neither. Unique files need no serialization; aggregation is the compiler, deterministic, on every branch. A single-writer orchestrator would recreate the bottleneck and would be dead at night. |
| Hygiene duties | None editorial. It consumes three script reports (contract budget pressure and mechanism candidates, quarantine and flake rate, landing latency) and creates rows when a threshold trips. It never writes into a contract, a doc or a memory. |
| Monitoring without adding prose | State it owns stays gitignored (wave-state) or outside the tree (job store, tick log). `incidents.md` becomes records. `night-report.mjs` grows the metric block; the morning report is that file plus chat. Handoffs stay one-file-per-session and consumed. |

Launching with no task-specific instruction: `/orchestrator` grounds itself in `docs/GOALS.md` NOW, the backlog, the three reports and `worktree-activity`, plans rows, and every row's prompt ends in QUEUE as today. Landing, validation and learning are mechanisms it invokes, so the prompt needs a goal and a territory and nothing else.

## 5.5 Is the source modular enough for this? (audit, 2026-09-06)

Path-scoped rules and dependency-cone CI only pay if a product capability lives in files nobody else needs to edit. Two audits measured that: the wizard in depth, every other domain at the boundary. Method: the dependency-cruiser graph (1,099 modules), 60 days of co-change on `origin/main` (2,817 non-merge commits, 213 landed branches), file inventories, the test map, and the architecture doc's own seam column.

**The short answer: the rules and the tooling are ahead of the code layout.** The edge table is machine-enforced and Templates, store, audience, export, render and AI-as-a-domain are already capabilities an agent can own. Three places are not, and they are exactly where parallel branches collide today: the wizard's shared giants, the `model/` kernel holding other capabilities' files, and Playout plus Production as grab-bags with no seam.

### The wizard

- Four files hold 53% of the wizard's 963 KB: `steps/MapSvgFieldsStep.tsx` 171 KB, `CreationWizard.tsx` 128 KB, `steps/AiStep.tsx` 112 KB, `draft.ts` 98 KB. `draft.ts` is 62% Import-graphic code, 22% template, 16% shared; `CreationWizard.tsx` is 25% shell, 23% import, 20% kit, 14% template, 14% AI.
- **Co-change, the number that matters:** a commit that touches only Import-graphic files also edits `CreationWizard.tsx` or `draft.ts` **37%** of the time (48 of 129); template-only **43%** (23 of 54); kit-only 86%; **AI-only 4%** (13 of 309). AI is already a module: its state lives outside `WizardDraft`, it talks to the shell through a 15-prop interface, and it has its own test rule. Import and template are not modules; their state is 34 of the 47 fields of one flat `WizardDraft` record, and the shell hard-codes eight step tables, a `WizardMode` union of eight modes and a JSX ladder over every mode.
- The import chain reaches three layers: `MapSvgFieldsStep -> draft.ts -> model/wizard.ts -> templates/importedDesign/svg.ts` with 33 / 24 / 11 co-changes. `model/wizard.ts` is a 58 KB grab-bag (a third shared, a third `DesignSvg*` types only import uses, a third template palettes and field plans) with **621 direct importers and a reverse closure of 866 files**, and it sits in the test map's `CORE`, so a palette edit runs the full suite.
- Tests are already partitioned by testid prefix (`map-svg-*`, `import-svg-*`, `ai-*`, `wz-*`, `kit-*`), so selection per capability is cheap once the files are; today one map rule fires 38 specs for any wizard file.
- Five cross-capability import edges exist, all fixable by moving one shared piece (`StyleStep` controls used by the AI panel, `UploadCard`, `AnalyzeProposalPanel`, `FinishStep` used by kit, `KitPicker` used by Browse).

### The other domains

| Domain | Verdict | Evidence |
|---|---|---|
| Templates | cohesive capability, best contract in the repo, 46-spec cone | its type contract (`TemplateVariant`, `WizardOptions`, palettes) lives in `model/wizard.ts`, so every one of 617 template files is a kernel dependant; a variant's meta, occasions and pack cell live in three tables away from the variant |
| Data / `model/` | the kernel proper is right; it is mis-filled | `wizard.ts` (Templates), `shows.ts` 41 KB with 40 mutators over five concerns, `packets.ts`, `productionData.ts`, `productionState.ts` (Production) and `taxonomy.ts` 75 KB (storefront search) belong elsewhere; the debt `model/importTemplate.ts:10 -> export/common` pulls control, jszip and the receivers into the kernel's closure |
| Editor | cohesive, one real seam (`applyTemplate`, `composeDocument`) | no cone possible because its shell files and all of `preview/` are `CORE` by map decision, not by code; `preview/previewProtocol` is reached by 10 importers outside the seam |
| Playout `control/` | grab-bag | no `AGENTS.md`, no index, components import 14 of 19 files directly, `hostedControl.ts` has 51 exports across URL building, wire types, publish, follow loop and cue ops; the internal graph already shows three clusters (protocol, hosted, production data) plus adapters |
| Production | grab-bag plus god file | spread over 28 files in seven domains; `ProductionPage.tsx` is one 2,629-line component reaching seven control and six model modules, the most-contended product file (24 branches in 60 days) |
| Export | cohesive, 8-spec cone | `common.ts` mixes packaging with `ensureExternalRefs` and `slug`; six non-seam targets |
| AI | cohesive as a domain | the declared seam is not what the UI calls: 26 non-seam files reached, no `ai/index.ts` |
| store, audience, render, output, bridge | ready | narrow seams, clean imports |

Registries are a smaller problem than assumed: two branches in sixty days touched all three of `packs.ts`, `meta.ts` and `types/registry.ts`. The file that collides is `e2e/catalog-baseline.json` (45 of 213 branches, every variant a key in one object). There is no `import.meta.glob` anywhere in `src/`.

Eighteen files have a reverse closure of 40% or more of `src`; twelve are legitimately kernel or runtime (`model/types`, `spxDefinition`, `blocks/animData`, `templates/shared/base`, ...) and a change to them should run the full suite. The two that should not be there are `model/wizard.ts` and `lowerThirds/animPresets.ts`. Conversely `taxonomy.ts` (closure 31), `shows.ts` (171) and `packets.ts` (178) run the full suite for cones one sixth of it.

### Consequence for the plan

Dependency-cone selection is not worth building before `model/wizard.ts` leaves `model/`: until then the cone of any template file is the full suite. And path-scoped rules for Import-graphic are false until its code leaves `draft.ts` and the shell: the files that change are the shared ones. So the module refactor is not a nice-to-have beside the contract migration; three of its rows are prerequisites, and the rest run alongside area by area, each one a mechanical row with the build, depcruise and an unchanged catalog baseline as the gate. No file is split for size; every row moves a capability behind a narrow interface, and every row deletes a `CORE` entry or a map rule rather than adding one.

**Wizard rows** (in order; each green alone, no testid or URL slug changes):

1. Split `draft.ts` into `draft/core`, `draft/template`, `draft/import` re-exported from `draft.ts`; move `DesignSvg*` out of `model/wizard.ts` with re-exports. Paths only.
2. Move the import steps, `DesignPrepCanvas`, `fieldAutoMap`, `AnalyzeProposalPanel` under `wizard/import/` with an `index.ts`; one test rule (`import/` → its 9 specs) and one depcruise rule (no `wizard/<cap>` → `wizard/<other cap>`). This row alone makes both promises true for Import.
3. Move AI under `wizard/ai/`; lift the shared style controls and `UploadCard` into `shell/`.
4. Move template steps under `wizard/template/`; kit registers as an extension of template (it depends on Browse and Finish and is 20% of the shell), not a peer.
5. Shell registration: one `capabilities.ts` exporting `{ id, modes, steps[], draftSlice, previewOverrides?, doors, testidPrefixes }` per capability; derive the step tables, `canProceed` and the JSX ladder from it; delete the eight hand-written tables.
6. Last: nest `WizardDraft` into named slices and drop the adapter; give the draft a version if a resume feature is ever wanted (today it never leaves memory, which is the only reason rule 6 holds).

**Domain rows:**

1. `model/wizard.ts` → `templates/contract.ts` (`TemplateVariant`, `WizardOptions`, palettes, `resolveOptions`, `fieldsFromOptions`) and `templates/importedDesign/designSvgTypes.ts`; a re-export shim for one landing, then delete. 621 mechanical import rewrites; verified by build, depcruise and an unchanged `catalog-baseline.json`. Land it in a quiet window before any open template branch. Biggest payoff: 617 files leave `CORE`.
2. `model/taxonomy.ts` → `templates/taxonomy.ts` + `templates/searchAliases.ts`.
3. The §6 debts in one row: `slug`, `ensureExternalRefs`, `cssVars` → `model/`; `EditorTab` → `blocks/`; `defaultTemplate` → `templates/`. Deletes the model → export → control chain.
4. New `src/production/` domain (layer 1): `showStore`, `cues`, `datasets`, `layers`, `publishState`, `looks`, with `Show`/`SavedGraphic` as the interface; persisted shape and version unchanged, pinned by the production specs; edge-table row in the same commit.
5. `control/` into `protocol`, `hosted` (`hostedControl` split into urls / wire / publish / follow / cueOps), `productionData`, `adapters`, each with an `index.ts`, plus `control/AGENTS.md` and an eslint rule banning deep imports from components.
6. `ProductionPage.tsx` split by workspace (shell, rundown, layers, publish, data) behind the existing 16 `home/` specs. Coordinate the window: 24 branches touch it.
7. Per-template manifest: a variant carries its own `meta`, `occasions`, pack cell; `catalog.ts` and `types/registry.ts` aggregate through `import.meta.glob` with an explicit storefront order; the baseline proves nothing moved.
8. Shard `e2e/catalog-baseline.json` per category.
9. Seam hygiene: `previewProtocol`, `canvasControlProtocol`, `storageAlert`, `showExport`, `outputEmbed` into the seam column and index files; `ai/index.ts`; `backend/index.ts`.
10. Test selection from reverse closures for `model/` and `preview/`, keeping `CORE` only for the twelve wide kernel files.

Prerequisites for the CI and contract work: wizard rows 1 and 2, domain rows 1 and 3. Everything else runs alongside phase 2.

## 6. The end-to-end flow

```
agent starts
  loads: kernel AGENTS.md (≤8 KB) + user CLAUDE.md + MEMORY index        [parallel, per session]
reads a file under src/components/wizard/steps/
  Claude loads .claude/rules/wizard-import.md (paths match)               [per file, first touch]
edits code
  PreToolUse hooks: guard-edit refuses generated files                    [per call]
discovers a trap
  npm run learn -- ...  -> contracts/rules/wizard/x.md + records/...      [new files only, no contention]
  compile regenerates AGENTS.md / .claude/rules                           [merge driver resolves]
validates
  npm run verify (T0 + affected subset, capped)                           [local, parallel across sessions]
  /check -> commit status noacg/reviewed on the tip                        [machine-consumed]
pushes
  ci.yml: setup (1 install) -> T0 -> T1 affected, base = merge-base       [cloud, parallel per branch]
queues
  /queue-merge: gh pr create, gh pr merge --auto                           [any client, laptop or cloud]
merge queue
  builds merge group of up to 4 PRs on top of main -> T2                  [SERIALIZED here, batched]
  failure: the failing PR is removed, the rest re-tested, its session told via relay
main moves
  fast-forward; T3 full suite for the batch (skips if superseded)         [one at a time, non-blocking]
  red -> re-run failed once -> quarantine or revert PR into the queue     [bot]
  post-land: migrations from secrets; refusal -> issue + owner-queue item [bot]
orchestrator
  wave-tick sees LANDED / REMOVED / FINISHED-LOOKING, relaunches or submits; reads three reports
```

Multiple writers: rule and record files, backlog, handoffs, owner queue, per-template baselines, per-check manifests (all unique file names). Single writer: `main` (the queue), generated contracts (the compiler), `docs/GOALS.md` NOW (the orchestrator session), the quarantine file (the bot, through the queue). Serialized: the merge group only.

**Choke points removed:** the laptop runner; the `main` checkout; the "blocked by unqueued branch" hold; the red-main freeze; the per-attempt full CI run; the `build` line; the hand-maintained spec map; the root and area contracts as edit targets; the byte ceiling as the growth control.

## 7. Staged implementation plan

Each phase lands green and alone; nothing waits on the owner except the two account items.

**Phase 0: instrument and stop the bleeding (1 to 2 sessions).**
- Commit `scripts/metrics/` (landing latency, CI minutes per change class, contract cost report, conflict trace, corpus growth) and a baseline `docs/METRICS.md` so section 9 is checkable.
- Land `contracts/` store, `npm run learn`, and the compiler producing only the additive `.claude/rules/` layer plus `contracts/index.md`. Existing contracts untouched.
- Gate: a hand-written contract may not gain a dated or measured paragraph; `learn` is the only path for new lessons. Loaded bytes stop growing on the day this lands.
- Give the `/check` stamp its consumer: `add-merge` refuses a branch whose stamp does not match the tip (local queue, until phase 1 replaces it).

**Phase 1: landing in the cloud and the validation tiers (the biggest payoff; 3 to 5 sessions).**
- Owner: add the Supabase secret (agreed 2026-09-06). The organization can follow whenever decided; phase 1 builds `land.yml` in the queue-compatible shape from 5.2.
- Ruleset on `main` (pushes only from the lander, `noacg/reviewed` required); `land.yml`; `queue:merge` as the thin client; `auto-merge.mjs` reduced to preflight; retire `order-blocked`, the twelve-hour hold and the red-main refusal.
- `ci.yml`: one setup job with artifacts; base = merge-base; `main` runs T3 once per batch with the superseded-exit; auto re-run of failed shards; quarantine bot; revert bot.
- `package.json`: test discovery by glob and check discovery by header with declared paths; `check:gate-coverage` inverted to "every check declares its scope". The `build` line stops being edited.
- `post-land.yml` for migrations.
Effect on the five asks: (1) time to `main` bounded by T2, laptop no longer needed; (2) redundant CI cut by the `main` full run per landing and the duplicated installs; (3) the largest collision source gone; (5) no babysitting of a laptop runner or a red main.

**Phase 2a: the prerequisite module boundaries (4 rows, each green alone, each landing in a quiet window).**
- Domain row 3 (the §6 debts) first, then domain row 1 (`model/wizard.ts` out of `model/`), then wizard rows 1 and 2 (split `draft.ts`, move Import-graphic under `wizard/import/` with its own test rule and depcruise rule).
- Each row's gate: build, depcruise, an unchanged `catalog-baseline.json`, and the affected specs. No testid, URL slug or persisted shape changes.
- After this phase, 617 template files are out of `CORE`, and Import-graphic has a cone and a scope. That is what the contract migration of the wizard and templates areas migrates INTO; migrating first would scope rules to files that are about to move.

**Phase 2b: migrate the contracts, one area per row, mechanical (5 to 8 rows, sonnet with the audit as the gate).**
- Order by cost: root → kernel; `src/templates`; `src/components/wizard` (now per capability: `import/`, `ai/`, `template/`, `shell/`); `src/ai`; `src/components`; `e2e`; then the remaining 48.
- The remaining module rows (wizard 3 to 6, domain 2, 4 to 9) run alongside, one area at a time, each followed by that area's contract row; `control/` and `production/` get their first `AGENTS.md` here, compiled from rules, never hand-written.
- Each row: split the contract into rule files and records with the migration script, run the symbol-survival audit (pre-edit token set ⊆ rules ∪ records), regenerate, delete the sibling `CLAUDE.md` where `.claude/rules` now covers Claude, land. Ambiguous sections become `kind: walk-p` owner-queue items quoting the section, and the row ships without waiting, as ruled on 2026-09-03.
- Calibrate the similarity threshold on the migrated corpus; enable the dedup check.
- `docs/OWNER_RULINGS.md`, the incident halves of `VERIFICATION.md` and `MISTAKE_TRIGGERS.md`, `incidents.md` and the memory `feedback` entries → records. `retired.json` and the negative check land here.
- `project_doc_max_bytes` is lowered as a consequence at the end, never as a target.

**Phase 3: selection by the graph, registries split, orchestrator on the reports (3 to 4 rows).**
- Coverage-map refresh in the nightly; graph-derived selection in `e2e-affected.mjs` (domain row 10: reverse closures for `model/` and `preview/`, `CORE` kept only for the twelve wide kernel files) with the manual `MAP` retired rule by rule as the map covers it; spec header gate.
- Domain rows 7 and 8: per-template manifests aggregated by `import.meta.glob`, the catalog baseline sharded per category; generated `docs/README.md` index.
- `night-report.mjs` gains the metric block; the orchestrator's prompt template loses its validation instructions; `contracts:report` feeds the refill.

**Phase 4: load test and tune.** Twelve branches queued within five minutes; all land within 60; batch size and shard budget tuned from the measurement; targets in section 9 confirmed or the phase reopens.

## 8. Working constraints, checked

`npm run build` stays a gate (T0 and T2 run it; the app half is unchanged, the checks half is scoped). Work reaches `main` only through the controlled queue, and there is exactly one of them. `check-shared-instructions` is not weakened; its reserve stays and the compiled chains pass it with room. `project_doc_max_bytes` is never raised. No symbol is discarded: rules retire by status, the audit is the gate. Nothing paid is added: GitHub-hosted runners, a free organization, repository secrets. Everything enforces itself: gates, hooks, bots, a compiler, a merge driver. Twelve sessions today, more later: the only serialized step is the merge group, and it batches.

## 9. Acceptance metrics

| Metric | Baseline | Target | Measured by |
|---|---|---|---|
| Queued → landed p90 | 79 min | ≤ 20 min | `scripts/metrics/landing-latency.mjs` (reads the queue's PR timeline) |
| Queued → landed max (30 d) | 42 h | ≤ 2 h | same |
| First commit → `main` p90 | 10 h | ≤ 2 h | same |
| Landings with the laptop off | 0 possible | any; a 24 h laptop-off test lands ≥ 10 | manual test in phase 1 |
| Landings/day capacity | 16 median | 12 queued at once land within 60 min; ≥ 200/day sustained in the load test | phase 4 |
| Red `main` time / month | ~78 h | ≤ 4 h, zero human interventions | issue timestamps |
| Runner-minutes per landing | ~150 (branch 47 median + main 97 + configured 7) | ≤ 60 (single-component change) | `scripts/metrics/ci-minutes.mjs` |
| Full-suite runs / day | 16 (one per landing) + nightly | ≤ 8 (batches + nightly) | `gh run list` job names |
| Runner-hours / day | 62 | ≤ 25 at the same landing rate | same |
| Branch run for one component | 19 to 28 runner-min, 4 to 7 shards; cliff to 48 to 50 on 9 shards for `package.json` or a root file | ≤ 12 runner-min, ≤ 2 shards; no cliff | same |
| Duplicated installs per run | up to 12 | 1 setup + shards restoring an artifact | job steps |
| Cancelled-run skipped-shard class | 27% cancelled, warn hook | 0 (merge-base selection), hook retired | run list |
| `build` line edits / month | 66 | 0 | `git log -G'"build": '` |
| Conflict resolutions / month in registries | ~30 | ≤ 3 | `--cc` trace |
| Hand edits to `AGENTS.md`/`CLAUDE.md` / month | 77 (root) | 0 (generated) | `git log` |
| Kernel bytes | 22,733 | ≤ 8,192 | compiler report |
| Bytes loaded for the most expensive single file | ~120,000 (wizard session) | ≤ 40,960 | compiler report |
| Root multiplier | 1.23 MB | ≤ 0.45 MB | compiler report |
| Loaded-surface growth / week | +56 KB | ≤ 0 (budgeted) | compiler report in CI |
| Rule store growth | n/a | unbounded, unloaded; duplicates rejected count reported | `learn` log |
| Stale mechanism names in prose | 3 files, 11 days | 0, fails the build | `retired.json` check |
| Import-only commits that also edit the wizard giants | 37% | ≤ 10% | scratchpad `cochange.mjs`, committed as `scripts/metrics/cochange.mjs` |
| Template-only commits that also edit the wizard giants | 43% | ≤ 10% | same |
| Direct importers of `model/wizard.ts` / its reverse closure | 621 / 866 files | 0 (file gone) | `depcruise --output-type json` + closure script |
| Template files in `CORE` | 617 | 0 | `e2e-affected.mjs` classification replay |
| Files in `CORE` (full-suite triggers) | 141 | ≤ 20 (the wide kernel files) | same |
| Domains without a seam index or contract | control, preview, output, audience, backend, validation | 0 | `docs/ARCHITECTURE.md` §2 vs `src/*/index.ts` |
| Branches per 60 d touching `catalog-baseline.json` | 45 | ≤ 5 per shard | `git log` |
| `/check` stamp consumed | never | required status on every landing | ruleset |
| Owner interventions / week | red-main fixes, blocked-branch queueing, ceiling trims | 0 apart from `needs:` questions | owner receipts |

## 10. What needs the owner

- `needs: account` The Supabase access token as a repository secret (agreed 2026-09-06; phase 1 builds `post-land.yml` against it). One screen in the repo settings; the workflow reads nothing else.
- `needs: account`, later, at his pace: a free GitHub organization and the transfer, which turns the lander into the merge queue by configuration. Creating an organization is free; the transfer keeps the URL through a redirect, the issues and the Actions history, and takes minutes. Nothing in phases 0 to 3 waits on it.
- Approve the plan and the phase order, including phase 2a (the four module rows) ahead of the contract migration.

## Appendix: commands for the measurements not already in section 2

```bash
# CI run inventory and per-run jobs
gh run list --workflow=ci.yml --limit 250 --json databaseId,headBranch,conclusion,event,createdAt,updatedAt
gh run view <id> --json jobs --jq '.jobs[] | "\(.name)\t\(.conclusion)\t\(.startedAt)\t\(.completedAt)"'
# what the plan job decided
gh api repos/NoaCG/NoaCG-Studio/actions/jobs/<planJobId>/logs | grep -E 'plan: \{|##\[notice\]'
# job store and landing ledger
J=$(git rev-parse --git-common-dir)/noacg-jobs; ls $J/j-*.json | wc -l; wc -l $J/landed.jsonl
grep -ohE "auto-merge REFUSED: [^\n]{0,70}" $J/logs/j-*.log | sort | uniq -c | sort -rn
# contention by file, 30 days
git log --no-merges --since=30.days --format= --name-only main | grep -v '^$' | sort | uniq -c | sort -rn | head -30
# real conflict resolutions, 45 days
for m in $(git log --merges --since=45.days --format=%H main); do git show --cc --format= $m | grep '^diff --cc ' | sed "s/^/$m /"; done
# contract chains and growth
node scripts/check-shared-instructions.mjs
git log --before="2026-08-15 23:59:59" -1 --format=%H -- AGENTS.md
# GitHub-side landing state
gh api repos/NoaCG/NoaCG-Studio/rulesets; gh api repos/NoaCG/NoaCG-Studio/branches/main/protection
```
