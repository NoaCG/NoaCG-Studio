# What NoaCG Studio is, and where things are

Orientation, not rules. The rules that bind are compiled into `AGENTS.md` files from
`contracts/rules/`; this is what a person or an agent reads ONCE to know what the product is and
where to look. It is a doc rather than part of the root contract because the root contract is read
in full by fifty-four instruction chains, and a product pitch does not belong in every session's
first tokens.

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

**Free and open source (AGPL-3.0), with no paid surface and none planned.** Everything the product
does is free to use and to self-host, hosted AI included - it is subsidised by the project rather
than sold. The goal is users and adoption, and the ruling that settled it is in
`docs/OWNER_RULINGS.md`.

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
npm run check:gate-coverage   # every check/test declares its tier (gate:) and its paths (guards:) in its header (in build)
npm run gates -- list         # the gates the build discovers; --gate factory, --changed <ref> for what a change reaches
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

## Where the code lives

A directory marked `*` in the repository map has its own `AGENTS.md` (with a thin `CLAUDE.md`
importing it) holding the binding per-area contract - **read it before editing that area.** The
map itself, and the cross-domain rules it serves - layers, allowed import edges, where new code
goes, UI thinness, the grandfathered-debt list - are binding in **`docs/ARCHITECTURE.md`** (the
map is §8 there); a change that adds a domain-to-domain edge updates that doc in the same PR.
