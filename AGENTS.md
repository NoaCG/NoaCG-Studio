# AGENTS.md

Guidance for AI agents working in this repo. Keep it accurate - update it when architecture or
conventions change. This root file holds the product identity, the non-negotiables and the working
practices; **deep per-area contracts live in nested `AGENTS.md` files** (marked `*` in the
repository map, `docs/ARCHITECTURE.md` §8) - read the relevant one before editing that area from
outside it.

Be concise with all of your responses.

## What this is

**NoaCG Studio** - an **AI-assisted, multi-platform** browser tool for creating modern, premium
HTML broadcast graphics and exporting them to **many broadcast/streaming environments**
("anything-goes export": SPX Graphics, CasparCG, OGraf, OBS/vMix overlays today; more over time).
For TV channels, streamers, organizations and universities, technical and non-technical users alike
- it is used in teaching, but it is a production tool, not a code tutorial.

**Free forever for the core; the only paid surface is hosted AI without a BYO key; the current goal
is users/adoption, not revenue.**

Brand: dark control-room, one amber "on-air" accent, restrained glow. `NoaCG-Brand-Kit/BRAND-MANUAL.md`
owns the palette and records which shipped typefaces diverge from it, and why.

Binding docs, read before generating or judging templates: **`docs/DESIGN_LANGUAGE.md`** (taste +
motion + code style) and **`docs/GOALS.md`** (north star + what is NOT done - a landed goal moves
verbatim to `docs/GOALS_ARCHIVE.md`, and GOALS.md stays under ~200 lines). **In GOALS.md, `## NOW`
is the push and everything under `## NEXT`, `## THEN` and `## Parking lot` is PARKED** - parked
work is not started because a doc describes it well, unless that section carves out an exception
in its own text (the OGraf one does).

**Current push (from 2026-08-22): STUDENTS MAKE THEIR OWN GRAPHICS AND PLAY THEM OUT** - binding
roadmap in the "NOW" section of `docs/GOALS.md`; the student release before it is CLOSED (history
in `docs/GOALS_ARCHIVE.md`). A student draws their own graphic - any graphic, not a lower third -
gets the BEHAVIOUR their show needs onto it, and plays it out **without writing a line of code**.
Two graphics decide it by **2026-09-12**, a real production: a QUIZ (lock / reveal) and a
SCOREBOARD (score + / -). SVG import is how the artwork gets in. Wizard-first still holds for the
catalog road, CasparCG + OBS are still the verification targets, AI work stays postponed.

**The pillars (keep every change true to these):**
- **Best & easiest to create - and put on air** - premium output with the least friction; a
  non-technical user can make a great graphic AND run it live without ever touching code.
  **AI-assisted** (later), but a pro keeps full control.
- **Client-agnostic, and nothing MANDATORY** - a playout client is one TARGET among others,
  never our word for a general concept; OGraf leads (EBU/YLE are the first customers). A slot is
  `logo: 'optional'` + `defaultLogo`, never `'built-in'`. Gate: `check:client-neutral`.
- **Export anywhere, standards-first** - the source is the NoaCG-native code-as-truth document;
  every target is an adapter off it. SPX stays the strictest gate, rock-solid; OGraf is the
  canonical interchange and playout contract (`docs/OGRAF_FIRST_REVIEW.md`).
- **Code is real & always available, view optional** - every visual/AI action writes real
  HTML/CSS/JS; **nothing hides behind a visual-only scene model**. No-code users keep the view
  hidden, pros work in it. Generated code is clean and commented; exports are always plug-and-play.
  The student release demotes only the VIEW (the editor becomes Advanced mode), never the code.

## Commands

```bash
npm install
npm run dev      # Vite dev server (landing at /, THE STUDIO AT /app)
npm run build    # tsc && eslint && vite build -> dist/   <-- run after changes; it's the CI gate
npm run lint     # eslint . --max-warnings 0 (also part of build)
npm run test:worktree-safety  # Git-safety regression tests for shared workflows
npm run check:workflows       # .github/workflows/*.yml + .github/actions/*/action.yml (in build)
npm run check:gate-coverage   # every check:/test: script is run by the build, a workflow, or a named exemption (in build)
npm run check:vercel-config   # vercel.json routes (in build)
npm run check:function-budget # api/'s function count (in build)
npm run check:freshness       # vendored GSAP/Lottie + pinned model ids - REPORTS, weekly, not a gate
```

`check:vercel-config` and `check:function-budget` guard failures that are **invisible on Vercel**:
both are refused BEFORE a deployment exists, so they show nowhere on the dashboard, only in the
GitHub commit status. Each froze production once (`docs/DEPLOYMENT.md`).

**The dev port is per-checkout** and RESERVED through a ticket, not merely hashed, so two worktrees
that hash alike still both start: 5174 in the main checkout (5175 for the live e2e suite), a
reserved port from the 5180-5298 block in a linked worktree. `scripts/dev-port.mjs` prints it, and
Vite, both Playwright configs, the guard hooks and the dev scripts all read that same number.
`.claude/launch.json` and `.claude/dev-port.json` are GENERATED from that reservation (gitignored -
never hand-edit or commit them). `DEV_PORT=n` overrides everything. Details: **`docs/DEV_PORTS.md`**.

**Ten pages (Vite MPA)**, listed with what each one is in `docs/ARCHITECTURE.md` §9. The studio
is **`/app`** - that is where E2E specs navigate. Clean URLs come from the `app-clean-url` plugin
in dev/preview and Vercel `cleanUrls` in production.

## Non-negotiable principles (these override default behaviour)

1. **Code is the single source of truth.** `SpxTemplate` (html/css/js + parsed definition) is
   canonical. Visual/AI/block actions emit *deterministic, readable code patches*, never a hidden
   scene model; the editor always reflects exactly what was written.
2. **Generated code must be clean, commented, and easy to edit.** Prefer simple, obvious code over
   clever code; rich-but-commented CSS is the house style.
3. **Self-contained, no unnecessary dependencies.** GSAP is bundled locally
   (`src/assets/gsap.min.js`); so is the Lottie player (`src/assets/lottie.min.js`, lottie_light/
   MIT - injected only when the template uses a Lottie asset; detector in `assets/lottieSupport.ts`).
   No runtime deps or CDN references in generated templates; exports use relative paths only.
4. **Validate before export.** `validation/validateTemplate.ts` is the gate; export is blocked on
   errors. Keep it authoritative - the platform owns SPX compatibility, not the AI.
5. **Blocks and AI are deterministic transforms** `(template) => template` inserting clean code.
6. **Every persisted format carries a version, and a breaking change ships its migration in the
   same commit.** The catalog is large and templates are saved documents, so a shape change
   without a migration is data loss. The pattern (`docs/STATE_MACHINE_SCHEMA.md` §5, implemented
   in `blocks/animData.ts` and `model/layout.ts`): additive optional fields never bump the
   version; a breaking change bumps it and migrates ON READ, normalizing so everything
   downstream sees one shape; serialization always writes the current version; an unknown
   version degrades honestly (read-only, never a crash), so an older build never eats newer data.

## SPX template format (the contract)

Full reference: **`docs/SPX_TEMPLATE_FORMAT.md`** (derived from `example_projects/`). Essentials:

- A global `window.SPXGCTemplateDefinition = { ...settings, DataFields: [...] }` describes the
  operator's fields. Fields are `f0`, `f1`, … with an `ftype` (textfield, number, dropdown, …).
- SPX calls global `play()`, `stop()`, `update(data)` (a **JSON string**), and `next(data)`.
- **Field -> DOM convention (this project): each field `fN` maps to one element `id="fN"`**, which
  `update()` writes into via `getElementById`. **No hidden `.spx-data` holders, no `_gfx` display
  split** - that older "premium pack" style is documented but not what we generate. An input-only
  value (e.g. a countdown duration) may live in a hidden holder, which carries
  **`class="noacg-data-source"` and never an inline `style="display:none"`**: the editor's entrance
  reset clears inline properties across the whole root subtree, so an inline-hidden holder comes
  back VISIBLE on the canvas and the raw value airs. A stylesheet rule cannot be cleared that way.
  `DATA_SOURCE_CLASS` / `dataSourceCss` in `src/templates/shared/base.ts` are the one source, and
  `e2e/catalog-baseline.spec.ts` gates it.

## The state-machine model (what a graphic IS)

Full reference: **`docs/STATE_MACHINE_SCHEMA.md`**. A graphic is data fields + one or more PARALLEL
state groups, all inside the one `NOACG_ANIM` data block (format version 2) in the marked ANIMATION
region - no second scene model, no parallel format. The rules that change behaviour:

- A **state** is what the graphic looks like; its content is a timeline. A **transition** is an
  animated change, fired by an operator **event** or a **timer**. Guarding is STRUCTURAL - a
  transition fires only if the author drew that arrow from the current state. No expression
  language, ever.
- **The default path** is the ordered walk `next` follows - the SPX/CasparCG compatibility
  contract. Every template, however complex, degrades to dumb-stepping along it. `steps` IS that
  path: `defaultPath[i]`'s timeline is `steps[i]` (the positional binding).
- **Data updates never cause transitions.** `update()` writes fields; state changes come only from
  events (a payload may ride an accepted event, which is what makes a multi-part change atomic).
  **Parameterize with data, not states** - one `Selected` state plus a field, never four
  near-identical states.
- **Every state is enterable two ways:** by transition (animated) or by SNAP (instant - recovery,
  emergency jumps, preview without playback). **Reset is two operations**, never conflated: reset
  visual state (snap every group to its initial) and reset data.
- Events are processed SERIALLY through one queue per graphic, and that queue lives INSIDE the
  template - so the determinism holds identically in the editor, in an exported overlay, and under
  SPX.
- **Control pages are GENERATED from the machine** (`docs/CONTROL_LAYER.md`): every event a button,
  every field an input, legality = the structural guard mirrored as greying.
- A template with no `machine` key IS the implicit one-group linear machine, derived on read and
  never persisted, so the existing catalog behaves exactly as before. A **graphic type**
  (`docs/GRAPHIC_TYPES.md`) persists a machine only when the derived one is wrong.

## Where the code lives

A directory marked `*` in the repository map has its own `AGENTS.md` (with a thin `CLAUDE.md`
importing it) holding the binding per-area contract - **read it before editing that area.** The
map itself, and the cross-domain rules it serves - layers, allowed import edges, where new code
goes, UI thinness, the grandfathered-debt list - are binding in **`docs/ARCHITECTURE.md`** (the
map is §8 there); a change that adds a domain-to-domain edge updates that doc in the same PR.

## Auth posture (the open studio)

**There is no login wall, ever.** The studio - create, preview, export, local saves - is open to
everyone, hosted or self-hosted. Only *account features* gate themselves: cloud sync, community,
show chat, and AI (hosted mode). Offline builds (no Supabase env) must grow **zero** auth UI
(E2E-pinned in `e2e/auth.spec.ts`). Don't reintroduce an app-wide gate; the `needsSignIn`/
`SignInPrompt` pattern lives in src/components/AGENTS.md.

## The choose-first creation flow (primary UX)

New projects go through the **CreationWizard** (Entry -> Browse -> Fields -> Style -> Animation ->
Finish, persistent live preview); `variant.create(options)` generates the complete, commented
template, applied with `resetSampleData: true` so a project starts from its own field defaults.
Entry leads with **Continue working**, then the broadcast-graphics cards - templates, **"Create
with AI"** (THE one AI door; its ⚙ settings pick the TIER: Lite, Pro, Custom/BYO), **"Import
graphic"** (artwork -> erase/scale -> place text fields), blank - with the video strip separate,
marked Beta. **Finish** is the flow's one branch: open it in the editor, or **export it
without the editor ever opening** - export is not a reward for opening the editor. After creation
the Style panel writes the `:root` contract and the step timeline touches ONLY the marked ANIMATION
region - user code outside the markers is never modified, and the timeline dock picks its surface
from the CODE, never the category, which keeps pre-migration templates working. Per-surface detail:
src/components/AGENTS.md; the Browse storefront's facets: `docs/TEMPLATE_TAXONOMY_PROPOSAL.md`.

## Learning something

A lesson is recorded with `npm run learn -- ...` (the rule to `contracts/rules/`, the evidence
to `contracts/records/`, compiled into `.claude/rules/`), never as a new paragraph in a contract:
`check:contract-evidence` refuses one. `docs/WORKFLOW_ARCHITECTURE.md` §5.3 is the design.

## Verifying changes

Seven rules; the full procedure is **`docs/VERIFICATION.md`**.

1. **Always `npm run build`** (typecheck + lint + build) after changes, and keep the tree
   lint-clean rather than adding eslint-disable comments. There is no application unit-test suite;
   never mark observable work done on a green build alone.
2. **UI flows -> Playwright**, and add a spec for any new flow *plus its mapping in the same
   commit*, or it only ever runs at night. Use `npm run test:e2e:focus:queued` during the sprint.
3. **One browser-driving job per MACHINE, not per worktree** - a suite, a catalog sweep, a bench
   and a `*spike*` run are the same workload, and this laptop is RAM-bound. Use the `:queued` form
   of any e2e script; `NOACG_ALLOW_PARALLEL_E2E=1` overrides. **Which commands count is ONE named
   list** (`SWEEP_SCRIPTS`, `scripts/command-match.mjs`), read by both the guard hook and the
   process detector - a job known to one and not the other is neither blocked nor detected, so name
   a new browser-driving script like its siblings (`*bench*`, `*spike*`, `*-sweep`) or add it there.
   **Do not sit and wait for a slot - ENQUEUE.** `npm run queue -- "<command>"` returns a job id
   at once, and one runner per machine drains the queue against a weighted budget
   (`docs/JOB_RUNNER_PLAN.md`); `npm run jobs` shows what is running and why anything is waiting.
   Waiting in the foreground is what used to lose hours - the shell tool is killed at 600 s with
   the wait still running. The `:queued` scripts remain for when you need the VERDICT now: a gate
   cannot take a job id for an answer.
4. **The pre-merge gate belongs to CI, not the laptop** - it does strictly more, in about ten
   minutes, on a clean checkout. **A clean `git merge main` is not proof the integration
   worked**: both sides were verified against a tree that no longer exists. After taking `main`
   in, run `npm run test:e2e:integration:queued` (the affected plan from the FORK POINT, so it
   covers BOTH sides' changes) before pushing or landing. **A job that stops AT its own
   `timeout-minutes` is not a verdict** - re-run the unchanged SHA before bisecting. **And a GREEN
   run is not one either until you read WHICH JOBS RAN**
   (`gh run view <id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'`): an ordinary push
   plans from the PREVIOUS PUSH and a new push cancels the run in flight, so a small second push
   can skip every shard while the run that covered the real change never finished.
   `gh workflow run ci.yml --ref <branch>` asks for the full suite. Every measurement behind these
   four sentences is in `docs/VERIFICATION.md`.
5. **After a catalog change run `npm run catalog:affected`.** It names the designs the change can
   move and prints the five catalog gates already scoped to them - the whole catalog for anything
   shared. They MEASURE the rendered graphic: every source check would pass a visibly broken one.
6. **Freshness is TIME-driven, never commit-driven** (`docs/STACK_FRESHNESS.md`): `check:freshness`
   reports weekly and nothing auto-upgrades.
7. **A green gate is not a human seeing it.** Work that is observable in the product adds its OWN
   FILE under **`docs/acceptance/owner-queue/`** in the same commit - what changed, the ROUTE to it
   in under a minute, what to look at, and the date. One file per item, never a shared list, so
   parallel sessions cannot conflict on it. `/walk` reads that directory and empties it one item at
   a time; **nothing expires** (owner, 2026-08-30 - he will get to all of them). Whether the owner
   looked at something and thought it was any good is the one fact about shipped work that no file
   in the repo can otherwise hold; an item with no route is not an item.

**Gotchas:**
- The app declares `color-scheme: dark` (`src/brandTokens.css` `:root`) and composeDocument injects the
  matching `<meta name="color-scheme" content="dark">` into the preview srcdoc. **Keep them
  paired** - Chromium paints an iframe opaque (white stage) when the schemes disagree.
- `/app` boots through app.html's inline BOOT WATCHDOG + connection check: `?diag=1` renders
  the inline diagnostics (main.tsx stands down there), durable-store hydration times out to
  localStorage after 4 s (`durableStoreHealth` -> StorageHealthNotice), and a boot that never
  mounts paints a plain-HTML diagnosis. Pinned by `e2e/network-resilience.spec.ts`; ops view
  in docs/DEPLOYMENT.md ("Where to look").
- **Every trap a SPEC falls into, and every trap of RUNNING the suite, is in `e2e/AGENTS.md`**
  (with its thin `CLAUDE.md`), which loads when you work in that directory. The same rule holds
  everywhere: a trap lives in the contract that loads where it fires, not in a list somebody has
  to remember to read - `supabase/AGENTS.md`, `api/AGENTS.md` and `docs/VERIFICATION.md` carry
  theirs the same way.

## Git

Every rule below in full, with the incident that produced it:
**`docs/BRANCHING_AND_LANDING.md`**.

- **Work on a FEATURE BRANCH, in a worktree**, and make the worktree first:
  `git worktree add -b <branch> .claude/worktrees/<name> main`. Several sessions run at once, so
  `node scripts/worktree-activity.mjs` prints what is in flight elsewhere - every other
  worktree's uncommitted and not-yet-merged files, then every branch ahead of `main` nobody has
  checked out - before you start something that collides. **Commit each completed, verified
  phase** with a descriptive message. **Never add a `Co-Authored-By` trailer or any agent
  co-author.** Don't commit `dist/` in feature work.
- **Never occupy the checkout that holds `main` with a feature branch, and never read or build
  there.** `scripts/auto-merge.mjs` (`worktreeFor('main')`) checks out, merges, builds and resets
  that tree during every integration, so a read taken mid-integration can be wrong with nothing
  saying so, and a build there gates `main` instead of your branch while still reporting green.
  **A green gate on the wrong tree is worse than a red one** - the build's branch stamp
  (`[write-version] dist/version.json -> <branch>@<sha>`) is what says which. Hence a worktree per
  session, and one for the orchestrator too, DETACHED at `origin/main`.
- **Landing is SERIALIZED, not permissioned**, and **`/queue-merge` is how work reaches `main`**
  (owner, 2026-08-25): run it in the session that owns the branch, when that work is FINISHED. It
  merges nothing itself - it pushes the branch, opens its pull request with auto-merge on, and
  GitHub's merge queue lands it in turn once `CI gate` and `Reviewed` pass (no laptop is in the
  path, and the ruleset lets nothing but the queue write `main`). **Nobody else queues your branch**:
  queueing IS the declaration that the work is done, and only that session can make it. **Never
  merge into `main` yourself**, and never drive the `safe-merge` flow by hand.
  `.agent-workflows/queue-merge.md` is the procedure.
- **Publishing PAST `main` still needs the user, in that message** - `npm publish`, anything costing
  money. Those are not landings: a later commit cannot take them back.
- **Production migrations are a MECHANISM, not a permission** (owner, 2026-08-25), and **you should
  never have to run one**: a landing applies whatever production is missing as soon as the branch
  is on `origin/main`. **A REFUSAL is the only thing that still reaches you**, answered per
  version (`npm run db:push -- --allow 0052`) and filed under `docs/acceptance/owner-queue/` by the
  branch's own session; the landing succeeds either way. **`supabase/AGENTS.md` is authoritative**
  on which statements pass, which stop, and why the classifier (`scripts/db-push.test.mjs`) is the
  guard rather than any prose; it loads when you work in that directory.
- **Cleanup is a MECHANISM, not a permission** (owner, 2026-08-30). A worktree and its branch may
  go once **every commit on the branch is an ancestor of a freshly fetched `origin/main`** - not a
  clean tree, not "the session is finished". **A worktree with NO branch is refused by its own
  rule**, never weighed against that test. **A clean `git status` still does not mean a worktree is
  disposable**: ignored files are invisible to git and die with the folder, so each is classified -
  rebuildable output goes, a secret goes **unread**, and **anything unrebuildable is archived
  outside the repo and the copy verified file by file BEFORE anything is deleted**. Full contract
  in `.agent-workflows/cleanup-worktrees.md`; `scripts/cleanup-worktrees.mjs` is dry-run by
  default.
- **Commit messages:** clear and human-readable, explaining the actual change - understandable to an
  outside developer reading the history cold. No chat/session language, internal planning names, or
  AI-sounding phrases ("as requested", "starting era 5", "continued work"). Never mention Claude,
  agents, prompts, or the conversation unless the commit is specifically about AI tooling.

## Ending a turn

End completed/waiting turns with a tiny, phone-glanceable wrap-up:

- **Done** - what changed + verified/not.
- **Needs you** - exact action/question, or "nothing".
- **Next** - obvious safe continuation -> do it; real choice -> ask clearly; finished -> offer
  merge/handoff.
- Never ask permission for obvious, safe work within scope.
- **A question to the owner names its reason in its own text - `needs: account`, `money`,
  `identity`, `harness` or `alignment` - or it is not his** (ruling 2026-09-05,
  `docs/OWNER_RULINGS.md`): a merge conflict, a design choice, which option, when - consult the
  strongest model available, decide, record it where he can revert it, keep working. In Claude
  Code `scripts/hooks/guard-question.mjs` refuses an untagged question; in Codex this line is the
  guard.
- If input is needed, make the question the final thing on screen.
- Never bury questions or add prose after them.
- No extra scans/tools just to produce the wrap-up.
