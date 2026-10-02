# Coherence session 2026-10-02: verdict

The weekly coherence session (`.agent-workflows/orchestrator/coherence.md`, steps 1-5), the first
since 2026-09-16. Branch `claude/ck-coherence`. This file is the verdict; the drift the owner must
rule on is the last section. Delete this file once those rulings are made.

## 1. The cold-read test (root `AGENTS.md` and `docs/GOALS.md` only)

| Question | Answer a cold reader got | Verdict | Fix |
|---|---|---|---|
| What is NoaCG? | Broadcast graphics creation and cloud playout, free and open source, two doors (visual and agentic) into one production workflow. | Right and fast | none needed |
| What is the current push? | "Outcomes 1 to 6", all marked (now), "list order is not priority". The rule `root/work-toward-outcomes-marked-now-docs` says "the most important unsatisfied one first", and nothing ranks them. | Wrong: no push can be named | Owner ruling (D1 below) |
| Where does each push stand? | Current states a week behind: outcome 2 said agents cannot reach a production (`noacg pack --save` shipped in 0.7.0); outcome 1 said the brand creator is still to build (built, owner check open since 2026-09-17); outcome 5 called vMix unproven in vMix (a real vMix 29 took and cleared a graphic on 2026-10-02); outcome 6 missed the isolated foreign-package player (2026-09-26); outcome 3 had no current state at all. Outcome 5's state was six lines of 250-character run-on text. | Wrong and slow | Fixed in GOALS |
| What is deliberately parked? | Standing non-goals, outcome 7 (later), section 8. Section 8 said the video surface "may be hidden"; the owner ruled on 2026-09-27 that the Video door is greyed, not hidden (`EntryStep.tsx`). | Mostly right, one stale claim | Fixed in GOALS |

## 2. What changed on this branch

- **`docs/GOALS.md`**: current states brought to what landed through 2026-10-02 - the agent door
  (CLI 0.7.1 on npm and the MCP Registry, state renders, `pack --save` to Home, the D1 design
  stance with opt-in critique and design guide, listings waiting on accounts), community packs
  (outcome 1), the brand creator, the editor's release 1 state, the Companion module (outcome 4),
  vMix, SPX and the status page's account and plan (outcome 5), the isolated foreign OGraf player
  (outcome 6), and the greyed Video door. To stay at 200 lines: removed two sentences that repeat
  the root verification rule, the SDI line that repeats the non-goals, and the opening's sentence
  that published history is never rewritten; condensed the autonomy paragraph without changing
  its terms. **No priority, heading or done criterion moved** (`roadmap --check`: 6 now, 1 next,
  2 later, as before).
- **`scripts/check-owner-queue.mjs`**: a comment cited the GOALS sentence removed above for the
  three owner-queue kinds; it now cites the root rule that carries them.
- **`docs/README.md`**: the GOALS row and "Where the roadmap lives" described the retired model
  (an open-items list whose landed items move verbatim to `GOALS_ARCHIVE.md`); now the outcome
  model with the archive frozen at 2026-08-07. The `ERA5_PLAN.md` row said "5.7 payments open",
  against the GOALS posture of no paid surface. A stray bullet called a 2026-09-18 research file the
  "current unified roadmap" with "implementation paused"; removed (`EDITOR_PLAN.md` links it).
- **`docs/ARCHITECTURE.md` section 8**: the repository map had no line for `companion-module/`,
  `packs/`, `contracts/`, `supabase/` or `e2e/`; added.
- **`.codex/config.toml`**: `project_doc_max_bytes` 73,728 -> 65,536. Largest chain 56,571 B
  (`src/ai/pro/harness`), leaving 8,965 B, above the 4,096 B reserve (the 2026-09-26 step left
  7,998 B).
- **`scripts/check-goals-budget.mjs`** (outside this row's TOUCHES, decided because this session
  tripped it): its failure message told the author to move landed items verbatim to the frozen
  archive; it now says to condense into the linked plan doc.
- **`docs/backlog/`**: deleted six items whose work landed (each re-checked in the code):
  `community-files-landing-is-stuck-on-tree-shape` (files at the root, d6c610a64),
  `blocked-sessions-cannot-tell-waiting-from-abandoned` (af0b5af81; the one reference now cites the
  commit), `an-owner-answer-on-the-next-line-is-lost` (4f02b4539),
  `e2e-retry-job-parses-merge-reports-stdout-and-a-stray-log-line-corrupts-it` (24a8a5684),
  `ai-tiers-clipboard-test-fails-on-windows` (34cf1946e) and
  `landing-reaped-as-dead-after-it-already-landed` (917c65510). The receipt
  `vmix-trial-walk-and-local-docker` moved from unstarted to advanced with what landed.

## 3. Found, not fixed here (held by another row, or outside this row's files)

- **Row CI (`cli/`, `docs/AGENT_CLI.md`)**: `cli/CHANGELOG.md` heads 0.7.1 "unreleased" although
  0.7.1 is on npm (09:53 UTC) and in the MCP Registry, so the npm page ships the word. The
  `noacg pack` row of AGENT_CLI's verb table does not mention `--save` or `--rundown`.
- **The editor session (`docs/EDITOR_PLAN.md`)**: its "Completion and continuation" table says
  R1.1b-R1.5 "Not started" and "Next: complete the R1.1a follow-up", while R1.1b-d, R1.2a.1-6 and
  R1.2b.1 have landed. Nine editor handoffs sit in `docs/handoffs/`; whether they are consumed is
  that session's call.
- **Row CJ (`docs/research/`)**: `editor-acceptance-register-2026-09-17.md`,
  `editor-baseline-2026-09-17.md` and `editor-r1-foundation/README.md` link to handoffs that were
  deleted.
- **Row BZ**: `docs/backlog/harness-routing-doc-cites-four-refuted-claims.md` looks resolved by
  f3cd8cf35 (2026-09-09); left for the row that holds `HARNESS_ROUTING.md`.
- **No holder named**: `docs/BRAND_PLAN.md`'s status header says the creator is still to build;
  `docs/ERA5_PLAN.md`'s header calls 5.7 payments "open, deferred"; `docs/GOALS_ARCHIVE.md` links
  five times to retired `PROGRAMMES.md` and `NORTH_STAR_2027.md`; a comment in
  `scripts/check-shared-instructions.mjs` still says the configured limit is 110,000; seven
  `docs/metrics/` files from 2026-09-06 to 09-13 are referenced by nothing (git is the archive).
- **Backlog, possibly stale, not deleted without a closer look**:
  `check-verdict-stamp-unwritable-from-isolated-worktree` (883dc248b),
  `illustrator-export-as-drops-hidden-layers` (50a462f31; cited from `ImportDesignStep.tsx` and
  `SVG_AUTHORING.md`), `log-follower-skips-rows-that-commit-late` (cc2a5f15a),
  `signed-in-production-header-overflows-at-1280` (36111248a),
  `mobile-home-spec-loses-its-seed-on-ci` (f5ad9e23e, still quarantined),
  `nothing-tells-a-user-their-installed-noacg-plugin-is-stale` and
  `cli-doctor-does-not-name-what-resolvecli-would-resolve-to` (a3e229ad3, 1357cc361). The receipt
  `playout-logic-for-all-common-graphics` has been `active` for 37 days, has no branch, and cites the
  retired programme register.

Checks that passed with no finding: `check:docs-index`, `check:contract-freshness`,
`check:contract-citations`, `check:workflows`, `check:owner-queue`, `check:shared-instructions`.
`docs/acceptance/OWNER_QUEUE.md` is consistent with its gate; it holds 36 open items, nine of them
editor checks.

## 4. Drift the owner must rule on

1. **Name the push.** Six of eight outcomes are (now) and none is ranked, so "most important
   unsatisfied first" cannot be applied by anyone but you. Recommendation: mark the one or two
   outcomes this fortnight is for, or give the (now) outcomes an order. Last week's merges went
   mostly to outcomes 5, 3 and 2.
2. **"Parked" means two things.** The rule says "Nothing else is parked"; GOALS section 8 is titled
   "Later and parked". Recommendation: retitle section 8 "Later", since nothing in it is forbidden.
3. **One done criterion may be met.** Outcome 5's target "SPX installs and operates a graphic on a
   real SPX server" is evidenced on SPX 1.2.1 and 1.4.1 (`SPX_ON_A_REAL_SERVER.md` sections 9-11).
   Reported, not advanced: confirm it, or name what is still missing.
4. **An expired park.** `docs/backlog/one-place-to-control-a-live-graphic.md` is parked "until
   after the 2026-09-25 lecture"; that date has passed. Unpark it or give it a new condition.
