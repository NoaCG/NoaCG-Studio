# What NoaCG Studio is, and where things are

Orientation, not rules. The rules that bind are compiled into `AGENTS.md` files from
`contracts/rules/`; this is what a person or an agent reads ONCE to know what the product is and
where to look.

## What this is

**NoaCG Studio** is a free, open source (AGPL-3.0) professional broadcast graphics creation and
cloud playout platform. A graphic comes from a template or brand, the user's own SVG artwork, the
editor, or a coding agent through the NoaCG CLI, and it plays out through NoaCG's own production,
rundown and control panel to CasparCG (through NoaCG Bridge), OBS and other browser sources, vMix,
SPX and OGraf hosts. Everything is free to use and to self-host; there is no paid surface.

- Direction, priorities and what "done" means for each area: **`docs/GOALS.md`**.
- Taste for generated graphics: **`docs/DESIGN_LANGUAGE.md`**.
- Brand: `NoaCG-Brand-Kit/BRAND-MANUAL.md`, today's baseline; a redesign is expected.
- What the public page may claim: `docs/PROMISE_AUDIT.md`.
- The code map: `docs/ARCHITECTURE.md`.
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
