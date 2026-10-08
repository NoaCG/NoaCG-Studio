# Test selection: what runs for a change, and why that is enough

Written 2026-09-04 to the owner's ask: *"truthful timing and intelligent test selection, not simply
adding more runners to compensate for waste. We should never trade away safety, but 'run everything
just in case' should not be the default."*

This is the contract for the first half. `docs/VERIFICATION.md` owns the procedure - which suite to
run and how to read a run; this file owns the QUESTION BEHIND IT: given a change, which specs does
the gate believe it has to run, and what is the argument that the ones it skips are safe to skip.

The mechanism is `scripts/e2e-affected.mjs`. It is a pure function of a changed-file list, so every
claim here can be checked by calling it, and `scripts/e2e-affected.test.mjs` pins the ones that
matter. The rule the whole thing rests on is stated once:

> **A spec that the plan does not select must not be breakable by the change.** Every entry in this
> contract is a claim of that shape, and where the claim cannot be made honestly, the rule
> escalates. The script fails TOWARD running more: a path no rule recognises runs everything.

## Where the map lives: in each spec's header

Since 2026-09-27 the spec-to-source map is not a list. Each `e2e/*.spec.ts` declares in its leading
comment block what it covers (`// covers: <glob>, ...`, optional `// focus`, or
`// covers: none - <why>`), and `scripts/e2e-lists.mjs` builds the map from those headers; the
grammar is in `docs/VERIFICATION.md` "E2E is TIERED". The old hand-kept list was touched by 40 of
the 344 landings from 2026-09-06 to 2026-09-27, second only to the generated rule index, because the root rule made every project
write into it. Adding or re-mapping a spec now edits that spec only.

What stays central in `scripts/e2e-affected.mjs`, each for a reason no spec header can carry:

| central rule | why it is not in a spec header |
|---|---|
| `CORE` | the shared foundations whose change runs the full suite. The claim is "most specs", which is a fact about the file, not about any spec. |
| `IGNORE` | files no spec can observe. There is no spec to hold them. |
| `CATALOG_TRIGGERS` | raise the catalog calibration gate, a separate Playwright config over the whole catalog: one flag, not a spec a header could name. |
| `CENTRAL` (`cli/`, `.claude-plugin/`, `benchmarks/agent/`) | source that is known and selects NO spec. Without the row it would read as unmapped and escalate. |
| `CONFIGURED_SUITE_FILES` (`scripts/e2e-lists.mjs`) | the configured suite's own files trigger its line for every change, not for one spec's sake. Every other configured trigger is in a configured spec's header. |

Every row of the old map that named a spec moved into those specs' headers, the wide ones included.
`src/templates/**` is now written in 53 headers and the wizard directory in 40. That was a judgement,
not an accident: each line is a true fact about its spec (it enumerates the catalog, it walks the
wizard), the glob is a directory that does not churn, and keeping the widest rows central would have
left exactly the rows new specs most often join as the shared file everyone edits. The one cost is
the list of files split out of the production page, which used to be one constant
(`PRODUCTION_PAGE_PARTS`) spliced into four rows and is now a brace glob in ten headers; a part
split out later has to be added to the headers that should follow it.

The move changed no plan. `node scripts/e2e-plan-compare.mjs --sweep` ran the old planner at
`origin/main` and the header-built one over the last 50 landings, every unmerged branch and all
8140 paths git has ever recorded, with and without sprint focus, and every plan was identical.

The build refuses what the list used to let through silently (`auditSpecHeaders`, run by
`scripts/e2e-affected.test.mjs`): a spec with no `covers:` line, a glob or exclusion that matches no
file, a central rule naming a spec that does not exist, and a malformed header, named by file and
line. Sixteen specs say `covers: none` today: they were selected by no source path before the move
either, and their headers say why.

## What runs, per kind of change

Measured against today's table (147 specs, 99.7 minutes) with sprint focus on, which is how CI runs
it. "Focus set" is the specs whose header says `// focus` (55 specs and 36.9 minutes when measured; 66 specs today).

| A change to | plans | why that is enough |
|---|---|---|
| a doc, any `*.md` | nothing | no spec reads one. The carve-out is `docs/svg-samples/`, which three specs load as fixtures, so those three run. |
| `.github/` | nothing | Playwright drives a local dev server and never opens a workflow file. Its real gate is `check:workflows` in `npm run build`, which validates every workflow and composite action against the Actions schema. Running specs could not catch a workflow fault, so running them buys nothing. |
| `.claude/`, `.codex/`, `.agents/`, `.agent-workflows/` | nothing | the agent harness. Same argument as `.github/`, and the same evidence: five tracked non-markdown files across all four, every one of them configuration for the tools a session runs rather than for the product a spec drives. |
| `scripts/*.test.mjs` | nothing | a test cannot change the thing it tests, and each of these is named in the `node --test` block of `npm run build`, so it has a gate that runs on every change. |
| `scripts/` otherwise | nothing, except the named suite-critical files, which escalate | local tooling the app never loads. **The exception list is load-bearing**: `dev-port`, `port-registry`, `e2e-runs`, `e2e-workers`, the three dev-server plugins, `build-player-host`, `e2e-affected` and `e2e-lists` are imported by the Playwright configs or by globalSetup, so a fault in one breaks every spec rather than one flow. They escalate. Measured the hard way on 2026-08-06: a rewrite of `e2e-runs` produced `mode: none` and a green gate that ran zero specs. |
| one `e2e/*.spec.ts` | that spec | the median spec is 0.5 minutes and the heaviest 5.0, so this is usually the cheapest plan the gate can produce. |
| `e2e/_*` (shared helpers) | everything | every spec imports them. |
| `e2e/configured/**` | nothing here | see "the configured tier" below. |
| a wizard step | 37 specs, 36.2 min | the wizard rule names the surfaces the wizard specs drive, plus the components that MOUNT the shared pickers. Wide because the wizard IS the primary creation flow, not because nobody looked: `src/components/AGENTS.md` carries the per-surface split and the specs' own headers name the exceptions individually. |
| one catalog design | 46 specs, 45.6 min, plus the catalog calibration gate | the pack specs ITERATE the catalog, so a design added, renamed or re-declared changes what they assert. Six of them were reachable from no template path at all until 2026-08-08, and ten designs landed green because of it. |
| a shared foundation (`src/store`, `src/model`, `src/preview`, `src/validation`, the app shell, the router, `src/styles`, `package-lock.json`) | the focus set (55 specs, 36.9 min) under sprint focus; the full suite otherwise | genuine fan-out. Each is imported by most of the app, so no smaller claim can be made honestly. |
| a path no rule recognises | the focus set under sprint focus; the full suite otherwise | the safe direction. It is also a REPORT: the plan names every unmapped file, and a file that keeps appearing there is a missing `covers:` line, not a fact of life. |
| only the WORDING of a `.tsx`, `.jsx` or `.html` file, or only the PAINT of classes in a `.css` file | the specs whose source or helpers name the old or new wording (or the class), plus covering specs with screenshot baselines, plus covering specs that measure geometry when the wording grew | words can only break a spec that reads them, or a fit when they get longer. `scripts/e2e-affected-copy.mjs` takes this path only when the code left once the words are set aside is token-for-token identical and every word kept its place; a changed condition, handler, test id, class, compared, indexed or called-with string, a moved label, a non-paint CSS property, or anything its scanner cannot follow plans as before. Never for `src/templates`, `src/blocks`, `src/assets` or plain `.ts`. Measured on the 2026-10-07 wizard copy rows: `claude/i-wizard-leftovers` (cuts only) went from 43 spec files (544 tests) to 1 (3 tests); `ba939f4c7` (one FinishStep sentence made longer) from 47 (635) to 33 (536). `claude/e-wizard-copy`'s commit also changed conditions in eight files and still plans 51. |

## What the audit found

Replayed over the **119 first-parent commits on `main` to 2026-09-04** - every landing, not a
sample:

| | before | after |
|---|---|---|
| plans that run nothing | 68 | 72 |
| plans that run a subset | 51 | 47 |
| plans that run everything | 0 | 0 |
| median planned minutes | 0.0 | 0.0 |
| p75 planned minutes | 36.9 | **12.5** |
| p90 planned minutes | 45.6 | 45.6 |
| plans covering more than 80% of the suite | 3 (3%) | 3 (3%) |
| landings escalating through core/unmapped | 25 | **21** |

**The headline is that "run everything just in case" is already not the default here.** Not one of
119 landings ran the whole suite, 57% ran nothing at all, and 97% ran under 80% of it. The map is
curated per rule with an incident receipt attached to most of them, and the audit did not find a
lazy trigger hiding behind a wide one. What it found was four small ones, and they are fixed above:
eight landings escalated on `.claude/settings.json` or `.codex/config.toml` alone, and one on a test
file for the planner - each running 36.9 minutes of specs to prove something no spec can observe.

The p75 moving from 36.9 to 12.5 minutes is those cases leaving. The p90 is unchanged, and that is
the honest reading: **the wide plans are wide for reasons that survive scrutiny**, and the way to
make them narrower is better covers lines for `src/templates/` and `src/components/wizard/`, which is
design work per rule rather than a policy change.

## The narrowing that was NOT taken

A branch that has merged `main` is planned from the FORK POINT (`--integration`), so its plan is the
union of both sides. That is why an ordinary landing is the widest plan the gate ever produces: on
`claude/j-fields-step-per-field` the fork-point plan was **116 specs / 88.0 minutes** from 170 changed
files, where the branch's own seven files plan **71 specs / 65.2 minutes**.

There is a real argument for the narrow base. `main` runs the FULL suite on every push, so main's
side already has an independent green verdict; what has not been verified is the COMBINATION, and a
combination can only break a spec that at least one side's map selects. Take the narrow base only
when `main`'s tip carries a recent green full verdict - which `scripts/main-health.mjs` already
answers - and fall back to the union otherwise.

It is not taken here, for two reasons. It overturns a rule in the root `AGENTS.md` that exists
because 71 of the last 120 merge commits would have been planned differently without it, 8 of them
reporting `mode: none` on a combination nothing had run. And its safety rests entirely on MY side's
map having no holes, where the union's extra coverage is exactly the belt against such a hole. That
is a call worth making with its own evidence and its own gate, not as a side effect of a timing fix.
Filed as `docs/backlog/integration-plans-run-both-sides-of-a-merge.md`.

## The configured tier

`e2e/configured/**` is ignored by this planner on purpose: those specs need a real Supabase backend
and a signed-in account, which no ci.yml job has. `configured-suite.yml` runs them against a local
Supabase stack on the runner, with its own rolling issue and a guard set built around the one
failure mode that matters here - every spec calls `test.skip(!haveCreds)`, so a job checking only
the exit code would be permanently, silently green.

Keeping them out of the per-change plan is a decision rather than an omission: putting them in
would mean standing a Supabase stack up in every gate job, minutes per job on every change. What
the per-change gate does instead is SAY SO - a change that touches configured territory sets
`configured` on the plan, which is printed, so the branch knows what it did not run.

**It now also runs on every push to `main`, and until 2026-09-04 nothing ran it but a daily cron.**
That cost a day. `imported-quiz-output.spec.ts` went red on 2026-09-03 and naming the commit meant
diffing roughly 130 landings, because nothing narrower had ever run against any of them. The cause
turned out to be the analytics consent banner's bare `z-index: 1200`, which put it over every dialog
in the app and took the wizard's "Add it and go there" click - fixed in `443924df`, which also
landed `e2e/overlay-layers.spec.ts` in the offline tier so the layer scale is pinned on every push.

**Why the landing run rather than packing it into this plan.** That break is the argument. The file
that caused it was a stylesheet for a corner notice, which no honest surface rule for "the hosted
quiz output" would ever have named - and a per-change plan only runs what a change LOOKS like it
can break. This tier's value is that it sees the app assembled against a real backend, so what it
needs is to run OFTEN and be attributable, not to be predicted. The queue lands one branch at a
time, so a push run covers one landing and names it. It cannot block that landing: `auto-merge`
gates on `ci.yml` alone (`scripts/main-health.mjs` reads no other workflow), which is deliberate -
a Docker pull failing must not freeze the queue.

**What it costs, measured.** Run 33911280428 on main's tip, 2026-09-04 19:27: 42 tests, 4.3 minutes
of Playwright, no retries, `imported-quiz-output` among them at 25 s. The job around it was 14.3
minutes in the morning's run (33841739638) of which `npm ci` alone was 7.7; the install now goes
through `./.github/actions/node-modules` like every other job here, so the landing verdict costs
about seven minutes. It adds no latency to any gate, because it gates nothing.

Each landing gets its own concurrency group, so the runs do not queue behind one another and a
verdict is about exactly one commit. A shared group would have made GitHub hold one pending run and
cancel the rest, which on a twenty-landing day is the attribution thrown away again.

## What one more graphic costs

The owner's condition on the weekly drawing cadence, 2026-09-04: *"it won't make our CI and E2E
tests take even longer, because right now iteration speed is still more important than a broad
template gallery."* The answer is a number, and it is REPORTED rather than argued:

```bash
npm run check:catalog-cost
```

It measures the build-side halves live and carries the CI slope from two real runs of
`catalog-gates.yml` that differ only in scope - one design against the whole catalog, same
workflow, same runner class, same day (33898338599 / 33900304138 against 33896869659). At 502
designs on 2026-09-04:

| what pays | when | per design | today |
|---|---|---|---|
| the prerender page loop | every build | **~1 ms** | 0.5 s for 502 pages, plus a catalog load of a few seconds that does not grow |
| the rendered catalog sweeps | only a change that can move a design, and only its designs | **1.25 s wall** | one design 0.5 min; the whole catalog 10.9 min wall / 15.1 runner min |
| the client bundle | whoever opens a page that pulls the chunk | **7 to 18 KB** | three chunks carry design ids; **two are in `/ograf`'s first payload** |

**So design 503 costs a millisecond on every build and nothing at all on an ordinary catalog
change.** The mechanism is `scripts/catalog-affected.mjs`: a change is scoped to the designs it can
move, which is why the one-design case is 0.5 minutes and stays there however large the catalog
grows. The slope only applies to a FULL sweep, and a full sweep happens when a SHARED file changes -
the one case where measuring everything is the entire point. At 600 designs a full sweep would be
13.0 minutes against 10.9 today. The weekly cadence is inside the noise for years, and the number to
re-check is the full sweep, because it is the only one that grows.

The *heavier site* half found a real defect, and the first version of the check missed it by
looking at two pages. This is a ten-page MPA, and enumerating `dist/*.html` instead says that
`/ograf` statically pulls **both** catalog chunks from its own entry - 3.7 MB, 502 design ids
between them - and `/bridge` pulls one of them, 2.3 MB. `/app` is the good case: it reaches its
catalog chunk (1.7 MB, 93 ids) through `await import(...)` shortly after boot, and `/` reaches none.

So the answer to *will more graphics make the site heavier* is: not for the pages a visitor lands
on, and yes for `/ograf` and `/bridge`, at about 7 KB per design. That is a chunking fault on two
pages rather than a reason to draw fewer graphics - filed as
`docs/backlog/ograf-and-bridge-ship-the-whole-catalog.md`. The lesson for the check itself is in
its own header: a hardcoded page list answers for the pages somebody remembered.

## Where the numbers come from

Selection decides which specs; `scripts/e2e-durations.json` decides how they are spread across
runners and whether that fits. The wall-clock model is `tests x testFactor + jobMinutes`, both terms
meant to be recorded from a real CI run - see `docs/VERIFICATION.md` and the header of
`scripts/e2e-durations.mjs`, including why the overhead half ships unrecorded. The two halves meet
in one place: when a plan is predicted too close to the 20-minute job cap, the warning names both
remedies, because either the per-job cost has grown or the plan is selecting more than the change
needs.

## Changing this contract

- A new IGNORE entry is the only edit here with no alarm attached. Every other mistake fails toward
  running MORE; a wrong IGNORE runs FEWER specs and nothing goes red. Write the confidence argument
  into the code comment beside it, in the form "no spec can observe this, and here is its real gate".
- A new `covers:` line in the spec that really covers a file is cheap and reversible. If a file keeps showing up in the plan's `unmapped` list,
  that is the signal to write one.
- Widening CORE is the expensive edit, because it is what makes an ordinary change run the focus
  set. Prefer covers lines that name the surfaces, and put a file in CORE only when the honest answer
  to "which specs can this break" is "most of them".
