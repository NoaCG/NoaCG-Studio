# Agent skills study: pr, show-me, implement-spec, retro

Date: 2026-10-07. Which of four published agent skills would improve how NoaCG work is explained,
built and learned from, measured against our orchestrator, `/check`, `/queue-merge`, worker
sessions and the merge queue. Nothing here changes a workflow; each "adapt" names the later change.

Sources read in full:

- Matt Pocock, `mattpocock/skills` at `f3fc5632`: `skills/engineering/pr/SKILL.md` and
  `CREDITS.md`, `skills/engineering/implement-spec/SKILL.md`, `skills/engineering/retro/SKILL.md`.
- HumanLayer, `humanlayer/skills` at `ca7c8088`: `plugins/show-me/skills/show-me/SKILL.md`, and
  the post https://www.humanlayer.com/blog/show-me-skill (Dex Horthy, 2026-08-12).
- Ours: `.agent-workflows/` (`queue-merge`, `check`, `verify`, `orchestrator/report`, `specs`),
  `docs/AGENT_WORKFLOWS.md`, `scripts/pr-description.mjs`, the last 30 merged pull requests.

| Skill | Verdict | One line |
| --- | --- | --- |
| `pr` | Adapt | Its Summary, Evidence and Merge Danger sections become our PR body template. |
| `show-me` | Adapt, partly | Keep its "smallest view" menu inside the PR; skip its live HTML explainers. |
| `implement-spec` | Skip | Our specs, worktree rows, merge queue and convergence review already cover it. |
| `retro` | Adapt | One retro per night wave, inside the morning report, driven by a script. |

## pr and show-me: a pull request you understand in a minute

**What they are.** `show-me` asks an agent to explain with the smallest visual that makes the
point: pseudocode, a call tree, a component tree, a shallow file tree, Mermaid, a diff-shaped
sketch, or a focused HTML page. The post argues agent prose has become dense and jargon-heavy and a
picture reads faster; it claims no measured speed-up. `pr` copies that menu almost word for word
(its `CREDITS.md` says so) into a fixed body: **Summary** (one visual), **Evidence** (before and
after; a screenshot is best for a visual change, then a failing-then-passing test), and **Merge
Danger** (one-way or two-way door, one-word blast radius). No preamble, brief prose.

**What we have.** `/queue-merge` writes the body in `scripts/pr-description.mjs`: commit subjects,
an optional `--why`, the stamp verdict, and a fixed line that GitHub runs the tests. A typed body
is kept instead. Of the last 30 merged pull requests:

- none carried an image, although `verify.md` already screenshots a visible change;
- the 5 generated bodies repeat the title as the first bullet and drop the commit body, where our
  commits explain the change (#721's commit has a clear paragraph; its PR shows only the subject);
- the 21 typed bodies (4 more are quarantine notices) run 70 to 900 words, median about 290,
  mostly dense paragraphs of internal terms (#723: "inline simplify and verify passed"). None
  states its risk.

The generated body says too little, the typed one too much, and neither shows the change.

**Recommendation: adopt the `pr` template, adapted.** One later row changes
`scripts/pr-description.mjs` and the inputs of `queue:merge`; no new workflow file.

1. **What changes**, two sentences at most, in product words. Default source: the main commit's
   body, which our commit rule already writes for an outside reader.
2. **Before / After**, only when it helps: two screenshots for a visible change, two lines of
   output or a test name for a behaviour change. Verify already takes the screenshot; hosting is
   the gap: push the PNGs to an orphan `pr-evidence` branch and link them, keeping images out of
   `main`. The repository is public, so images get the same privacy check as commits.
3. **Shape**, optional: one `show-me` sketch, only for a structural change.
4. **How we know**: each acceptance criterion, pass or not checked, one line each. Drop the fixed
   "GitHub runs the tests" line; every PR has it, so it says nothing.
5. **Risk**: `pr`'s door and blast radius in plain words ("easy to undo; every page's header").
6. Commits, stamp modes and run ids inside a closed `<details>` block.

Typed bodies keep their override but use the same headings, so Codex and Claude write one shape.
A word-count warning (say, over 150 words outside `<details>`) makes length checkable, not taught.

**Skip from show-me:** its HTML explainer. Unattended workers make local pages nobody opens; the
owner reads the PR and the morning report. Its visual menu already comes with `pr`.

## implement-spec: what it adds to what we have

**What it is.** Tickets with blocking links; an implementer subagent per ready ticket (the
"frontier") in its own worktree with `tdd`, a merger subagent into one integration branch, frontier
refill, and one code review of the whole branch at the end.

| implement-spec | Ours |
| --- | --- |
| Task graph, frontier refill | Wave rows with `TOUCHES` collision checks; continuations launch the frontier a landing uncovers (`orchestrator/night.md`) |
| One worktree per ticket | One worktree per row, made before work starts (root rule) |
| Integration branch, merger subagent | Each row lands on `main` through the merge queue, CI on the merge group |
| Sparse context pointers | Row prompts carry pointers, not transcripts (`orchestrator/routing.md`) |
| Final review of the whole | Convergence review of spec against current code, every criterion marked (`orchestrator/specs.md`) |

**Verdict: skip.** The owner's suspicion holds. The only idea not already ours is the integration
branch, and for us it is a step back: it holds all landing to the end and puts every conflict on
one subagent, where our queue lands each green row on its own and keeps `main` releasable. `tdd`
per ticket is covered by our Playwright-spec and verify rules.

## retro: one retrospective per night wave

**What it is.** A user-invoked review of one session's logs proposing changes to the agent's
environment under seven headings: navigation, automated checks, reviewer standards, oversized
`AGENTS.md`, tool economy, no-op instructions, information access. It matches our ladder in
`contracts/README.md`: a mechanical mistake gets a check, not a rule; always-loaded files stay tiny.

**What we have.** The morning report ends with "one lesson" (`npm run learn`). The evidence is on
disk but nobody reads it together: `npm run harness:usage -- --wave` (tokens and delegation
outcomes from the transcripts), `npm run jobs` and job logs, `handoff-drain.mjs`, review stamps,
the wave-state heartbeat, spec acceptance ledgers. A retro per worker would multiply cost and noise.

**Recommendation: adapt, one retro per complete wave, replacing "one lesson".** One later row:

1. `scripts/wave-retro.mjs`, read-only and reusing `harness-usage.mjs`'s transcript discovery,
   prints one line per row plus outliers, so no agent reads whole transcripts:
   - **cost against outcome**: tokens and hours per row beside landed, refused or handed off;
   - **wasted reading**: a file read three or more times in a session, whole reads of large files;
   - **repeated mistakes**: failed or refused tool calls and retried commands, matched against
     earlier waves' retro records so a repeat shows;
   - **waiting**: turn gaps over five minutes (cache lost), waits over four;
   - **handoff, test and merge friction**: check legs not run or discarded, re-queues and refusal
     kinds, open handoffs, e2e retries;
   - **outcome**: each row's acceptance against its evidence, and whether the `docs/GOALS.md`
     outcome it served moved, not only whether the branch landed.
2. Report item 11 becomes "Retro": one fresh read-only subagent takes the script output and
   evidence pointers and returns **at most three findings**, ranked by hours or tokens lost, each
   with evidence and one disposition on our ladder: fix the cause, add a check, scope guidance, or
   record only (`npm run learn`, which makes it findable next wave). Fixes become next-plan rows or
   `docs/backlog/` items; a recurring finding climbs one step.

**No instruction growth.** The retro may propose retiring always-loaded text, never adding it. The
report shows root and global instruction bytes from `npm run audit:instructions` against the last
wave, and any new rule must be scoped or retire the same size. The method lives in the script, so
item 11 is replaced, not lengthened.

## Sample PR body in the recommended format

#721 rewritten from its commit. Angle brackets mark what the verify leg would fill in.

```markdown
## What changes

Every public page now shows the same top bar. Before, What's new and the roadmap showed different
links, so a visitor lost the links they came in with. The roadmap stays out of the bar for now.

## Before / After

| Before | After |
| --- | --- |
| ![What's new, before](<pr-evidence>/721/before.png) | ![What's new, after](<pr-evidence>/721/after.png) |

## How we know

- Same links on every page, current page marked: pass (new unit test, page tests updated)
- On a phone the Docs button stays on one line: <pass, and how it was seen>
- Not checked: <what the verify leg did not cover>

## Risk

Easy to undo. Affects the header of every public page; nothing in the Studio app.

<details><summary>Commits and review</summary>Two commits; /check at fb4f76f0: pass</details>
```
