# Goals archive

> **HISTORY, not direction.** This is the complete milestone log as it stood on 2026-08-07, kept
> verbatim: every shipped milestone with its date, its rationale, and the decisions that were
> ratified along the way. Nothing here is a plan. The live roadmap - what is NOT done - is
> [`GOALS.md`](GOALS.md), which was cut down to the open work on that date.
>
> Read this when you need to know *why* something is the way it is, what was already tried, or
> what a decision like "who pays decides the route" actually said. Do not add new goals here;
> add them to `GOALS.md` and move them here once they land.
>
> Note: several sections below are labelled "(current push)". They were, when written. The one
> current push is whatever `GOALS.md` says it is today.

## North star (as of 2026-08-07)

> **NoaCG Studio - pick a design, make it yours, and be live on air in five minutes - in CasparCG, OBS, vMix, or straight from a cloud output URL.**

The primary workflow is wizard-first: choose a template or a coordinated pack, customize the
supported fields and branding (fonts, colors, text size, logos, images, content - manually, no
code and no AI required), add it to a **Production**, then export the files or publish and run
the show live through the control dashboard and the persistent output URL. The first-named user
is a **student or non-technical operator** who runs a real production without ever seeing code;
organizations, TV channels, streamers, and universities follow. A **professional** keeps full
control through **Advanced mode** - the always-available editor, one toggle away, never
required. The generated HTML/CSS/JS stays clean, well-named, and the single source of truth — its view
is optional. It is used in teaching, but the product is a production tool, not a code tutorial.

### Anything-goes export (a platform, not an SPX generator)

Export is **not SPX-first only**. The ambition is a flexible broadcast-graphics **platform** targeting
many broadcast and streaming environments - **SPX, OBS, vMix, CasparCG, OGraf**, and more over time.
SPX stays the canonical *internal* template format (and the strictest validation target); every other
target is an export adapter derived from that same source, so breadth is added without reworking the
core. Breadth across the whole live stack - plus automation, remote control, and smarter workflows - is
a primary long-term differentiator, not a nice-to-have.

### Operating principles (business posture)

- **Free forever for the core.** Creating, editing, exporting, controlling, and self-hosting are free,
  always - no feature paywall on the workflow.
- **One paid surface only, and later:** hosted AI generation for users who won't bring their own API
  key (real compute cost). **Bring-your-own-key stays free.** Premium features / paid services are
  deferred until there is a large user base and are not a current priority - don't build paywalls
  speculatively.
- **The goal now is users, not revenue.** Optimize for usefulness, adoption, and regular use
  (activation + retention). Money is a later, optional consequence of a large, happy user base. See
  the GTM plan + [[gtm-competitive]] memory.

### What "done right" feels like
- **Fast:** open NoaCG → choose a pack or template → production → paste the output URL into
  CasparCG or OBS → live in under 5 minutes, no code, no install.
- **Tasteful:** every template looks like a paid MotionArray/Envato asset, not a tutorial demo.
- **Consistent:** graphics made in the same project form a coherent **broadcast package** — the
  same style family, palette, and typography across every category, usable in a real program.
- **Yours:** custom brand colors (hex/picker) and imported fonts are first-class — fonts are
  embedded in the template and its export, never external.
- **Smooth:** animations run at 60 fps, transform/opacity-based, with professional easing.
- **Editable:** open any generated file and every line reads clearly — clear names, short comments,
  no cleverness — so a pro can extend it (but no one has to).
- **Reliable:** every export passes the validation gate and plugs straight into SPX.
- **Still code-first underneath:** hand edits are always possible; panels and wizard write
  deterministic patches and never fight the user's edits outside their marked regions.

## Milestones

### The SVG road (the two halves that landed first)
- [x] **OGraf boilerplate story** (Yle's explicit ask): a curated, teaching-grade OGraf starter
      set - our validated export packaged as free, hand-editable base templates an organization
      modifies instead of starting from scratch. Study `SuperFlyTV/ograf-devtool` + the EBU
      examples for what authors already get.
      *(2026-08-20) Shipped as the public `/ograf` starters page - `ograf.html` + `src/ograf/`,
      built by the real exporter on click; see `docs/OGRAF.md` "The free starters page"
      (354addb0, 56d7853c, 5fc812bb).*
- [x] **Restricted-network resilience**: the Yle demo died inside the wizard on their corporate
      network. No third-party host may ever block create/preview/export; diagnose, harden,
      pin with an e2e spec that walks the wizard with all third-party hosts blocked, and give
      failures a visible diagnosis instead of a silent stall.
      *(2026-08-20) Shipped as the boot watchdog + durable-store timeout + the `/app?diag=1`
      connection check (d2c75e36), pinned by `e2e/network-resilience.spec.ts`, with the ops
      entry in `docs/DEPLOYMENT.md` "Where to look" item 7.*

### AI tiers
- [x] **Bring your own key, always** (2026-08-14) - the paid surface buys convenience, never
      capability. The Create-with-AI door offers it as its own tier: OpenAI, Anthropic, Google or
      Hugging Face, any model that provider offers, each row carrying its price per million
      tokens and which key pays for it. **The managed transport is never named or offered to a
      user** - how NoaCG reaches a model on its own money is plumbing, not a product decision
      (owner). NoaCG Pro went back behind a flag in the same change: a tier with no hosted route
      is a door that only misleads.

### The choose-first creation flow (current push)
- [x] **Phase 0** — GOALS.md + DESIGN_LANGUAGE.md committed
- [x] **Phase 1** — Foundations: bundled open fonts, GSAP animation-preset library (marked
      regions + `animSpeed` + steps), shared lower-third scaffolding (auto-fit text, 9-zone
      positioning, `:root` style contract), wizard data model
- [x] **Phase 2** — 10 tasteful lower thirds (4 minimal · 3 sport · 3 glass), built and
      taste-judged via multi-agent workflow; user approved screenshots. Bonus: the 12-preset
      easing system (direction-correct per phase) per the approved easing doctrine
- [x] **Phase 3** — Creation wizard replaces the gallery: Entry → Category → Template → Fields →
      Style → Animation, with persistent live preview (Play/Stop at every step)
- [x] **Phase 4** — Live panels after creation: Style (colors/font/size/position via `:root`
      vars) + Motion (preset/speed/easing/steps via marked region); Brand tab retired into Style
- [x] **Phase 5** — "Import graphics" entry: drag-drop images → graphic type → prefilled wizard
      (logo-slot designs first, first image auto-placed)
- [x] **Phase 6** — Playwright specs for the wizard flow (9 passing), docs updated, old starters
      retired (Blank survives)

### Broadcast packages + your brand (current push)
- [x] **Custom colors** — a "Custom" palette in the wizard Style step: accent / text / dim / panel
      via color picker + free hex/rgba input (Style panel already edits them post-creation)
- [x] **Imported fonts, embedded** — upload .woff2/.woff/.ttf/.otf in the wizard or Style panel;
      the file becomes a template asset (`fonts/…`), gets a visible `@font-face`, renders in the
      preview, and ships inside the export (single file per font; weight sets later)
- [x] **Project brand + match toggle** — the app remembers the project's brand (family, palette
      incl. custom, font incl. imported); the wizard's "Use current project's colors & font"
      toggle (off by default — matching is an explicit choice) makes the next graphic belong
      to the same package
- [x] **Package-consistency foundations** — DESIGN_LANGUAGE addendum with per-family
      cross-category tokens (shape, type roles, motion timing); shared template assembler
      extracted from lowerThirds for all categories; continuous-motion machinery (linear loops)
- [x] **First wave categories** (each: briefs → workflow build + judge incl. a package-consistency
      criterion → sweep → screenshot approval, shown next to their lower-third siblings):
      - [x] Info cards (3 — one per family)
      - [x] End credits (4): role-above-name roll, title-left/name-right roll, one-pager
            swap, left-to-right crawl — each ending with a logo + year placeholder
      - [x] Tickers (3 — first continuous/linear motion graphics)

### Template catalog (each category repeats the Phase 2 pattern)
- [x] Lower thirds (10)
- [x] Full/half/custom screen info cards (3) — *first wave*
- [x] End credits (4) — *first wave*
- [x] Tickers (3) — *first wave*
- [x] Starting-soon loop with timer (3) — *wave 2* (shared countdown engine, hold-loop preset)
- [x] Game show countdown/timer (2) — *wave 2* (timer-run pop + timer-line-reveal)
- [x] Scoreboards (2) — *wave 2* (4-field contract, score-pop on update)
- [x] Infographics (2) — *wave 2* (count-up stat + bars-grow engines)
- [x] Corner bug / picture placeholder (1) — *wave 2* (logo slot on the standard assembler)
- [x] Game-show quiz graphics with options (1) — *wave 2* (next() reveals the correct answer)

**The catalog is complete: 31 designs across all 10 categories, every one family-consistent
with its lower-third siblings (§8), swept per category, and covered by an E2E spec.**

### The holding / credits / ceremony pack (26 designs)
- [x] **Holding screens (ss05–ss13)** — the category widened from "starting soon" to *every
      screen shown while the show is not happening*: countdown to a wall-clock start time,
      break and BRB cards, a scheduled intermission, a between-items schedule hold, a
      technical pause with **no clock by design**, and a sign-off. A design now declares its
      `lineCount`, its `clock` (`minutes` | `start-time` | `none`) and its extra fields; the
      countdown engine is deadline-anchored (drift-free across a stalled event loop) and
      formats H:MM:SS past an hour
- [x] **Credits & lists (cr05–cr12)** — the same repeating-data model at five speeds. New:
      `credits-loop` (seamless repeating reel — the track is cloned so the seam is invisible)
      and `credits-board` (no motion at all, for a schedule or a wall nobody should have to
      chase, shrinking to fit rather than losing its last row). Formats: schedule board,
      credit reel, thank-you wall, donor wall, sponsor board, sponsor crawl, graduation roll,
      roll of remembrance. The parser gained a third line kind (`entry`) so a bare name on a
      wall is a name, not a section heading
- [x] **Set-piece cards (card50–card58)** — layouts carrying conventions older than
      television: scripture, lyric (now + next), quotation, translation, order of service,
      award (built for the Continue beat), graduate, wedding, in memoriam
- [x] Verified: full build, per-category sweeps, the runtime bench over all 43 designs in the
      three families, all six export targets, an exported package driven over `file://`, and
      `e2e/holding-pack.spec.ts` (discovery, countdown accuracy, loop seam, board fit,
      save/reopen). The render baseline for the 79 pre-existing variants did not move

### Images done right (user feedback after wave 2)
- [x] **Broadcast field set** — the wizard/panels offer text, long text, number, and **Image**
      (SPX `filelist` listing `./images/`); dropdown/color/checkbox retired from generic UIs
      (kept only where a design truly needs a constrained choice, e.g. the quiz answer)
- [x] **Image-aware runtime** — every category's `update()` writes through `setFieldValue`:
      `<img id="fN">` gets the path as `src`, empty hides it and toggles `.has-image`
- [x] **Logo fields** — end credits (f2), corner bug, and the frosted info card expose their
      logo slot as a real SPX field; the Data panel gets an image picker + upload
- [x] **Export folder structure** — the zip contains `<project>/index.html` +
      `<project>/images/<file>` (+ fonts/, css/, js/), extracting straight into
      `[TemplatesFolder]/` the way SPX/CasparCG expect

### UX overhaul (user feedback round 2 — portrait monitors + real use)
- [x] **Preview-over-tabs layout** — code editor full-height left; on the right the 16:9 canvas
      (sized by the template's aspect, clamped) sits above the tool tabs — no dead space on
      vertical screens, works on landscape too
- [x] **Validate tab removed** — validation runs automatically inside Export, errors listed
      inline, download gated
- [x] **Motion phases** — In / Out / Both control: mix one preset's entrance with another's
      exit (marked-region splice, per-phase `// In preset:` / `// Out preset:` comments,
      backward compatible); every Motion apply auto-replays the graphic
- [x] **Change highlighting** — every panel/AI apply diffs the code and highlights + scrolls to
      the changed lines in the editor (accent wash + gutter bar)
- [x] **Blocks tab removed** — add-field moved into the Data panel; element/motion inserts go
      through AI + Motion (the block registry remains as the offline AI stub's vocabulary)
- [x] **Learn tab removed** — the knowledge base became Monaco hover tooltips (hover play(),
      an fN id, or a CSS property); Claude-powered Explain stays in the AI panel

### Packet manager + more playout targets
- [x] **Packet manager (graphics)** — 📦 Packets in the topbar: save the current graphic into a
      named packet (same name = update), reopen any saved graphic, export the whole packet as
      ONE zip (a plug-and-play SPX folder per graphic)
- [x] **Packet manager (looks)** — named brand looks captured from the current graphic's actual
      :root vars + font (Style-panel tweaks included): apply to any graphic (highlighted,
      undoable), set as the project brand for new graphics, share/import as a .look.json file
- [x] **OGraf export** — EBU OGraf v1 package: .ograf.json manifest (data schema from the
      DataFields, stepCount) + graphic.mjs Web Component wrapping the template runtime; manifest
      self-check gates the build; E2E drives the component through the renderer contract
- [x] **CasparCG export** — one self-contained .html (CG ADD loads it directly) with a data shim
      accepting both JSON and CasparCG XML templateData payloads

### NoaCG Pro — the image-guided pipeline (docs/NOACG_PRO_PLAN.md)
- [x] **Gateway image output + ai.pro surface** — expect:'image' on the OpenRouter adapter,
      image-model discovery, the pro ledger discriminator (migration 0025)
- [x] **The lower-third vertical slice** — concept → interpretation contract → deterministic
      reconstruction through the imported-design funnel (live fields, rebuilt panel shapes,
      honest editability report) → the production validator → the ordinary editor and exports
- [x] **Create with AI Pro wizard flow** — brief, concept review with cost, compile, per-region
      report, the shared Finish doors; offline stub keeps it e2e-testable (e2e/pro.spec.ts)
- [x] **Pro as an execution tier of Create with AI** — the separate wizard card is gone; the
      ⚙ AI settings tier picker chooses NoaCG Lite / NoaCG Pro / Custom provider, Pro rides
      the shared brief (prompt, category, data fields, uploads, brand) mapped by
      src/ai/pro/brief.ts, and the standard routes are pinned (PRO_STANDARD_ROUTES) so a
      normal Pro user never picks models
- [x] **Fixture-first benchmark** — benchmarks/pro/v1 + scripts/pro-bench.mjs (free regression
      by default; paid generation explicit and cost-ceilinged)
- [x] **Clean-plate / erase integration** — the compile runs the deterministic flat-fill
      erase over baked text outside reconstructed panels, mattes retained-pad ring sides,
      and drops the raster when every region is rebuilt (plan §5/§10; e2e-pinned with
      hand-built flat and gradient concepts)
- [x] **Paid quality round** — the 2026-07-31 round: gemini-3.1-flash-image +
      gemini-2.5-flash over the bank, 4/5 after normalizer fixes, real fixtures committed
      (free regression replays), routes pinned as PRO_STANDARD_ROUTES
- [ ] **Managed funded tier** — task-registry profile, quotas, credit weighting, an Auto route
- [x] **"Pro: find out whether it works at all" — ANSWERED 2026-08-08, and the answer is the
      acceptable one the goal invited: not at broadcast quality, on this approach.**
      (`benchmarks/pro/round-2026-08-08/ROUND.md` + `MACHINE.md`; ~$2.05 spent of a €10 ceiling.)
      Twelve briefs through the pinned standard routes, measured against Lite on the same twelve.
      - The image model DESIGNS well: 11 of 12 concepts are credible broadcast lower thirds.
      - The deterministic reconstruction ships a **visibly broken graphic on 5 of 12 while every
        gate reports 11 of 12 passing** — it fails in PAINT (baked concept text surviving under
        rebuilt panels) and the runtime bench measures rectangles.
      - **The relationship is INVERSE**: the best concept in the bank (`sports-live`) produced the
        worst graphic, because a distinctive design is angled and layered, which is exactly what a
        rectangle-rebuilding compiler cannot reproduce or erase behind. A better image model makes
        this worse, not better — which is what makes it an approach verdict rather than a tuning
        one.
      - **Lite was usable on 12 of 12** of the same briefs, at ~1/250th the cost ($0.0003 against
        $0.077) and ~1/6th the wall clock. Lite's weakness is sameness (9 of 12 on one chassis) —
        a ceiling on something that works; Pro's is correctness reported as success.
      - Harness bug found and fixed on the way: `maxTokens: 4000` against a route spending ~96% of
        its output budget on REASONING tokens truncated the interpretation and destroyed 5 paid
        concepts (7/12 → 11/12 after raising it to 12,000).
      - Q2: Pro cannot generate custom fields or a state machine BY CONSTRUCTION (`ProBrief` is
        `{brief, name, title, includeLogo}`). The free-form coder mints its own fields well, but a
        machine cannot survive `importAnimData`, which returns `{version, root, speed, steps}`.
        **No generation path in the repo asks any model for a state machine.**
      - Decision: **park the reconstruction, keep the concept stage** (as a `layout` reference into
        the grounded adapt path, and as input to human-built catalog chassis). The state-machine
        seam is the round's most valuable finding and belongs to every tier — both carried forward
        as open goals in `GOALS.md`.

## The pipeline (road ahead — user-defined eras, analyzed 2026-07-05)

Order matters: each era is independently shippable, and nothing in an earlier era gets
reworked by a later one. Social/chat features were MOVED from the local era into the
server era (no server = no CORS-free social APIs, no inbound chat endpoint).

### Era 1 — Hygiene
- [x] **Self-hosted Monaco** — bundled like GSAP (src/monacoSetup.ts: loader.config +
      Vite-bundled workers); E2E proves the editor works with every CDN blocked

### Era 2 — Workflow help: import to start
- [x] **Import HTML templates** — the wizard's Import entry accepts .html and SPX-style .zip:
      inline style/script split into the panes (the SPX definition stays in the HTML; bundled
      GSAP blobs dropped), zip assets pulled in with relative paths, then straight to Export's
      inline validation with the AI "Make SPX-ready" fix path; converting to
      SPX/CasparCG/OGraf comes free via the four targets. Round-trip E2E: an exported Starter
      zip re-imports as byte-identical code.
- SKIPPED for now (user decision 2026-07-05): animated-SVG import and Lottie import — revisit
  after the server era if demand shows. (Lottie = the big one: bundled lottie-web player,
  segment mapping, text-layer binding.)

### Era 3 — AI depth
- [x] **Chat-first Describe-it** — the brainstorm chat (ai/brainstorm.ts): every reply ends
      with a machine-readable BRIEF line; "Use as brief" fills the prompt box.
- [x] **Example prompt gallery** — 8 curated off-catalog briefs as one-click chips in the
      Describe-it step (ai/examplePrompts.ts).
- [x] **"Any graphic" quality push — iteration loop proven** — run #1: 12/12 valid, zero
      repair rounds; user review found text-on-text stacking (karaoke), mid-word label
      wraps (weather), invisible logo slots (versus). Fix: a **Layout safety** section in
      the generation system prompt (no unintentional overlap, double-length mental render,
      nowrap labels, broadcast contrast, visible image placeholders) + a **runtime overlap
      detector** in the bench (pairwise text-rect intersection in the settled frame;
      identical-text stacking whitelisted as deliberate layering). Run #2 on the flagged
      briefs: all three fixed. The loop (bench → review → prompt → re-bench) is the
      standing quality process; re-run the full bank after any system-prompt change.

### Era 3.5 — Catalog growth from bench winners (user idea 2026-07-05)
- [x] Six bench winners promoted into hand-tuned variants (18-agent workflow, judged vs the
      bench shots + family tokens): **tk04 Index Strip** (ticker), **ig03 Timing Tower**,
      **ig04 Poll Ring**, **ig05 Rising Total**, **ig06 Schedule Board** (infographics, with
      two new category presets: ring-fill + rows-cascade, and count-up now fills progress
      bars), **card04 Quote Card** (info card). Catalog: **36 designs**.
      DROPPED (user call — don't fight the contract): card05 Face-Off — a full-frame
      versus layout misfits the info-card auto-fit/steps contract; revisit as its own
      category if demand shows. Sweep-check gaps fixed along the way (infographics have no
      mask contract; formatted-number rebinds; coherent steps opt-out via
      StandardDesign.disableSteps).
- [x] Wizard category grouping: **Essentials** vs **Specials** (CategoryInfo.group).

### Public face (2026-07-08 — the landing page + open doors)
- [x] **Public landing page at `/`** — static, brand-true (void/amber, bundled fonts, no React,
      no CDN): hero + "runs on OBS · vMix · SPX · CasparCG · OGraf" chips + house-template
      screenshots + how-it-works + operability row + free/AGPL footer. The editor moved to
      **`/app`** (Vite MPA: app.html entry; dev/preview clean URL via the `app-clean-url` plugin,
      production via Vercel `cleanUrls`). Old root `?chat=`/`?template=` share links redirect
      with their query; in-app link generation follows `location.pathname`; Google OAuth returns
      to `/app` (origin+pathname). E2E: landing.spec (3) + every spec migrated to `/app`.

### Homebase (2026-07-08 — the signed-in account surface)
- [x] **Avatar account menu** in the topbar (Google photo or initial chip) → Your homebase ·
      Settings · Sign out; signed-out hosted mode keeps the plain "Sign in" button; offline
      builds still grow zero auth UI.
- [x] **Your homebase** — every saved graphic across all packets, newest first, open-into-editor;
      reads the SAME packet store 📦 Packets manages (one source of saved designs; cloud sync
      already mirrors it). Empty state routes to the wizard.
- [x] **Settings** — AI key + model (same ai/settings store the wizard uses) + workflow defaults
      (`model/prefs.ts`: default export target — the Export tab also remembers the last pick);
      brand/style defaults deliberately stay where the work happens (project brand + looks).
      *Future settings home: preferred styles, platform presets, personal brand assets.*
- [x] E2E: configured homebase.spec (avatar → homebase → settings → sign out, live-verified);
      offline export-default persistence spec.

### The NoaCG house family (2026-07-08 — brand-kit overlays as first-class templates)
- [x] **A 4th style family `noacg`** — the product's own on-air look (§8 tokens: 8px amber bar +
      void blur(8px) panels, mono label voice, restrained accent glow), so built-in output
      showcases the brand. New `NoaCG Amber` palette; JetBrains Mono bundled (variable 400-700,
      one file now also serving the app UI); `labelFontFaceCss` = a design-owned second typeface
      the Style panel's heading swap never touches; `StandardDesign.runtimeExtraJs` (the
      infographics doctrine generalized) for design-owned runtime like live clocks.
- [x] **7 house variants** rebuilt from `NoaCG-Brand-Kit/overlays/` (offline-first — no Google
      Fonts, full SPX runtime): **lt11 House Strap**, **lt12 House Breaking** (accent chip +
      headline panel), **lt13 House Interview** (3-line) · **bug02 House Clock** (logo/three-bar
      mark + live HH:MM:SS, accent seconds) · **tk05 House Wire** + **tk06 House Markets**
      (sign-colored deltas, live clock caps) · **card05 House Title** (mono kicker + huge title +
      radial accent glow; the overlay's opaque backdrop intentionally dropped — catalog graphics
      composite). Catalog: **43 designs**. Swept (lower-third / ticker / info-card all valid) +
      4 house E2E specs (clock ticks, deltas color, chip stacks, mono face loads).

### Era 4 — Local backend (no server, no login)
- [x] **Control panels for your graphics** — ONE modular engine (src/control/controlModel.ts)
      turns any graphic's SPX DataFields into an operator panel: number → +/− stepper (custom
      step), textarea → line editor, filelist → image picker, dropdown → select, etc. No
      per-template code. Lives as the in-app **Control tab** (live-drives the preview) and as a
      standalone **controlpanel.html** bundled with every SPX export — open the graphic as a
      browser source and the panel drives it over a BroadcastChannel (a receiver is injected
      into index.html). Same message shape swaps to a Supabase Realtime channel in Era 5.
- [x] **Google Sheets as a live source** — the Control panel adds an editable polling block to
      the template's own JS: fetch a published-CSV sheet every N seconds, map columns → fields
      (seeded from field titles), call update(). Runs in preview + export. Documented CORS
      reality: "Publish to web → CSV" links work client-side; the Era-5 gateway proxies the rest.
- ⚠ MOVED to Era 5: social-media import (X/YouTube comments) and the show-chat website —
  both need server-side API keys / an inbound endpoint; they are Supabase-era features.

### Era 5 — Server era (one coherent planning round before building)
**Planning round complete (2026-07-05)** — the binding design doc is **`docs/ERA5_PLAN.md`**
(8-agent codebase recon + Supabase pattern research). Read it before building any phase.
Stack: **Supabase** (✓ blessed 2026-07-05) — Google OAuth + email/password + tester
invites, Postgres for cloud-saved projects/packets/looks, Realtime channels for remote
control panels, Edge functions for the AI gateway + social ingestion later.
Repo shape: ✓ decided 2026-07-05, **refined in the planning round** — **private gateway split**.
This repo stays the complete self-hostable app under **AGPL-3.0** AND **carries the full
`supabase/` folder** (config.toml + migrations with schema/RLS/auth-hook + seed + `.env.example`)
so a self-hoster can `supabase db push` to a working instance; **only** billing / metered
AI-gateway / social-ingestion edge functions + secrets live in the private repo. The app reaches
the gateway via VITE_AI_PROXY_URL and Supabase URLs; with those unset it is pure offline mode.
Build posture: ✓ **code-first, verify later** — each phase ships full code + migrations +
edge-function stubs with `npm run build` green and the offline path E2E-green; live server paths
(auth, RLS isolation, realtime) are maintainer-verified against a real Supabase (per-phase
checklists in ERA5_PLAN.md). A green build never counts as "verified" for a server path.

Why operability is the priority — evidence (2026-07-05): the C-vs-B comparison rig
(`scripts/ai-compare.mjs`) ran 5 briefs through three arms on one model — raw one-shot,
raw + self-critique iteration, and our pipeline. On single-graphic quality the pipeline does
NOT beat a competent iterator (C ≈ B, occasionally worse). So the generation model is not the
moat; this era is — operability (control panels, live data, playout export, packets),
verification, and a compounding human-rated corpus. The only generation-side investment the
data justifies is a DETERMINISTIC motion checker (multi-timestamp overlap sampling — animated
correctness, e.g. karaoke wipes, is the one frontier every arm failed), NOT a "smarter AI" or
a taste-critic skills layer.
Sub-phases (see ERA5_PLAN.md for full scope + per-phase live-verify checklists):
- [x] **5.0 Foundations** — `src/backend/` (config feature-detection + StorageProvider interface
      + LocalStorageProvider), sync metadata (`updatedAt`) on packets/looks/brand with backfill,
      `supabase/` scaffold (config.toml + migrations + seed), `.env.example` vars. No visible
      feature; offline behaviour identical (build + offline E2E green).
- [x] **5.1 Auth (invite-only)** — `@supabase/supabase-js` (code-split; offline never loads it) +
      client factory; Google OAuth + email/password; AuthGate + LoginScreen + topbar AuthStatus,
      engaged only when configured + required; the allowlist table + Before-User-Created hook ship
      in migration 0002; `scripts/allowlist.mjs` admin tool; callClaude attaches the user JWT as a
      Bearer in proxy mode. **Live-verified 2026-07-06** on a real project: login gate,
      email/password sign-in, AuthGate→app handoff; `enforce_allowlist` present + locked. (Invite
      *rejection* still needs the dashboard Before-User-Created hook enabled.)
- [x] **5.2a Cloud persistence (packets + looks)** — `SupabaseProvider` (documents table, per-user
      RLS) + a pure `reconcile()`/`runSync()` engine (LWW, true-conflict → "(conflicted copy)",
      tombstone deletes) + `syncController` (guarded, debounced, serialized) + topbar `SyncStatus`.
      Local stays the live path; cloud mirrors. Build + offline E2E green (12 sync-logic assertions);
      hardened by an 11-agent adversarial review (7 bugs fixed). **Live-verified 2026-07-06**:
      authed write/read round-trip, auto-sync "Synced", delete, and cross-user RLS isolation (user 2
      cannot see user 1's rows). Body is inline jsonb until 5.2b.
- [x] **5.2b Cloud persistence (finish)** — assets externalized to the `user-assets` Storage bucket
      (content-hash keyed, so a shared font stores once; **live-verified**: row shrinks to ~236 B, one
      Storage object, exact rehydrate); the working project **autosaved** locally (survives reload,
      wizard-first startup unchanged); **brand + project cloud sync** as per-user singletons
      (deterministic `uuid(uid:kind)` → one row each, **live-verified**); coordinated tombstone purge
      (both sides, 90-day grace). *Known edge: a project pulled from another device is adopted on
      reload, not live — a live "updated elsewhere" prompt is future polish.*
- [x] **5.3 Remote realtime control** — opt-in default-off export block over a **public** Realtime
      Broadcast channel + publishable key (research call: no token to expire, so an on-air graphic
      never drops; isolation via an unguessable topic capability). Hand-rolled WS client;
      controlpanel.html gains an any-device REST-send path; validator host-suffix whitelists
      `.supabase.co`. **Live-verified** (WS-join + REST broadcast round-trip). Private-channel +
      minted-token "hardened mode" documented as deferred.
- [x] **5.4 Show chat** — public send-in page (`?chat=<slug>`) → owner moderation (Realtime queue,
      Approve/Reject/Air) → graphic block that polls on-air messages (feed or spotlight). All
      in-database (one migration: RLS + abuse trigger, no edge function). **Live-verified** every
      RLS boundary + the full submit→moderate→air→graphic flow. *Social-media API import (X/YouTube
      comments) deferred — it needs private API keys (repo-split), unlike this custom chat.*
- [x] **5.5 User-shared templates** (user idea 2026-07-05): a community section where logged-in
      users publish templates/looks others browse and use. Migration `0004` (own `community_templates`
      table — NOT a documents sync kind — + browse RPCs granted to `authenticated` only + a global
      `moderators` role + a report/takedown path + a public `community-assets` bucket with
      author-scoped writes); automated gate = `validateTemplate` + new `templateBench` composed in
      `community/gate.ts`, run at BOTH publish and import; publish UI + "My submissions" in
      PacketManager; the `🌐 Community` gallery (browse/Use/Report) + topbar button + `?template=<slug>`
      deep-link. **Decisions (2026-07-07):** self-service publishing now (clean gate → `approved`) with
      the full pre-review schema shipped for a one-line switch later; gallery reads signed-in-only;
      single graphics + looks (whole-packet publishing deferred). Offline-invariant (E2E-proven, no
      community UI without a backend); build + full E2E (55) green; migration adversarially reviewed
      (5 findings fixed). **Applied to live Supabase + fully live-verified (two-account pass,
      2026-07-07):** publish → cross-user browse + import + asset round-trip through the public bucket,
      author_id hidden, anon can't read, the author-self-approve attack blocked, moderator takedown +
      author-can't-reverse; a 6th (anon EXECUTE via Supabase default grants) and a 7th (moderator had
      no SELECT policy, so takedown matched 0 rows — migration 0005) were caught live and fixed. The
      **moderator takedown queue UI shipped** (🛡 Moderate, gated on `is_moderator()`; review a
      sandboxed preview → Remove/Restore; reports queue). **Deferred:** human pre-review flip (one line
      + the queue already exists), whole-packet publishing, anon public gallery + login-less share page.
- [x] **5.6 The open editor (free-to-try posture, 2026-07-08)** — the app-wide login wall is GONE
      (`VITE_REQUIRE_AUTH` removed; AuthGate/LoginScreen → an on-demand `SignInDialog` + `useAuthState`
      feature gates). Anyone can create, preview, and export with no account — hosted or self-hosted.
      Signing in (topbar button or any gate) unlocks the account features: cloud sync, community,
      show chat, AI (both the side panel and the wizard's Describe-it entry). Local packets stay
      anonymous-friendly; publish/sync nudge sign-in inline. Offline builds grow no auth UI at all
      (E2E-pinned). **Signup opened the same day** (migration `0006`: the Before-User-Created hook
      now allows everyone; applied + live-verified with a throwaway signup). Re-close = restore the
      0002 function body. *Remaining hardening (dashboard, manual): require email confirmation +
      enable captcha — the live project currently auto-confirms.*
- [ ] **5.7 Payments/subscriptions LAST** (long beta first; separate private repo, Stripe, metered
      generations)

### Era 6 — WYSIWYG editor + timeline
- [x] **W1 drag-to-position (2026-07-08)** — the Move toggle on the preview toolbar overlays a
      pointer layer (9-zone grid + ghost + target-cell highlight; the root is revealed while the
      mode is on): release computes nearest zone + residual nudge and writes the SAME
      `zoneDecls` patch the Style panel writes onto the detected root rule — deterministic,
      highlighted, undoable. Esc cancels. E2E: drag re-anchors bottom-left → top-right in the
      preview's stylesheet + Ctrl+Z restores; Escape leaves the code untouched.
- [x] **T1 read-only timeline view (2026-07-08)** — the Motion tab renders the marked ANIMATION
      region as tracks (`blocks/timelineModel.ts`: parse-by-construction of the emitted
      tl.set/to/fromTo calls — knobs, durations `X / animSpeed`, staggers, `'-=N'` overlaps;
      unrecognizable hand-edits degrade to an honest "the code is the truth" note). In/Out phase
      tabs with real durations (∞ badge for loops), one row per tween, and a scrubber that
      PAUSES the live preview at any moment (store `sendScrub` → simulator builds + pauses the
      phase timeline; OUT scrubs start from the settled on-air state). Timing knobs = T2.
- [x] **The direct-manipulation rework (2026-07-08, same-day user feedback on the build):**
      1) **Settled design view** — after every rebuild the preview shows the graphic SETTLED
      (simulator: `buildInTimeline().progress(1, true)` + a truth-restoring second `update()`;
      clocks/loops stay idle; blank/imported templates unaffected). The canvas is never dead.
      2) **No move mode** — `CanvasInteraction` replaces the W1 toggle: hand/text hover cursors,
      drag starts on the graphic with a 4px threshold, same zone+nudge patch; grid only during
      drag. 3) **W3 inline text editing shipped** — dblclick a visible `#fN` → overlay input →
      live sample value + SPX-definition default + static text in ONE undoable patch
      (`setFieldDefault`). 4) **T1.5** — the timeline is a collapsible strip UNDER the preview
      (above the transport), with a LIVE playhead following the simulator-owned `__activeTl`
      (Play sweeps In; Stop auto-switches to Out; scrub reclaims; end-snap fix so keyboard
      scrubs reach final set() calls). E2E: wysiwyg (3), timeline (5), inline-edit (2).
- [x] **T2 draggable timing bars (2026-07-08)** — drag a bar's body to retime a tween, its
      right-edge handle to stretch it (0.05s snap): `patchTweenTiming` (blocks/timelineModel.ts,
      the parser in reverse) rewrites the tween's `N / animSpeed` duration literal and writes an
      explicit absolute position (replacing '-=' overlaps) IN the emitted region — zero preset
      changes, the code keeps its readable sequential shape, the speed knob still scales
      everything. One undoable applyTemplate per release + auto-replay. set() ticks and
      measured durations stay read-only. Per-element eases = T2.5. E2E: stretch rewrites the
      literal + undo restores; move writes the absolute position + still plays.
- [x] **W2 corner scale handle (2026-07-08)** — hovering the graphic shows a handle at the
      root's bottom-right; dragging live-previews `--scale` (inline :root override, ×N badge)
      and releases ONE `patchCss` write of the variable (the Style panel's size mechanism),
      clamped 0.5–2. E2E: the drag grows --scale in the rebuilt preview within the clamp.
- [x] **T2.5 per-tween eases (2026-07-08)** — an ease chip per editable bar: the easing
      vocabulary's phase-correct half (doctrine intact) + auto (inherit the knob);
      `patchTweenEase` writes/clears a quoted ease literal in the tween's vars.
- [x] **T3.1+T3.2 steps sequencing (2026-07-08)** — the moat slice, competitor-researched
      (Loopic = stop-point keyframes, step count baked in; SPX = a bare Continue button):
      the strip shows the graphic as the playout chain **▶ In · » 2 · » 3 · ■ Out** —
      data-driven step count, real durations, the SPX `out` mode as a badge. The simulator
      owns each Continue's reveal tween so the LIVE PLAYHEAD sweeps every » Next press;
      step segments scrub (prior state jumped, callbacks suppressed), stretch
      (`var stepDurations = [...]` literals) and take per-step eases (`stepEases`) — all
      through the same undoable literal patcher. Emit upgrade also fixed a latent bug:
      replaying a steps template never reset `currentStep`.
- [x] **T3.3 reveal groups (2026-07-08)** — the better-than-Loopic move: `var stepGroups =
      [['#f1'], ['#f2']]` in the emitted block (a GROUP per Continue, 0.08s stagger inside a
      group); step segments show one row per line and dragging a row's bar onto another » tab
      regroups (`patchStepRegroup` rewrites groups+durations+eases as one undoable patch;
      emptied steps disappear with their timing; a »+ drop target splits a line into a new
      step). E2E: merge »3 into »2 → one press reveals both lines → split back out via »+.
- [x] **T3.5 the moment-cards UX pass (2026-07-09, tester feedback: "how do I add steps?")** —
      the strip now tells the playout story instead of assuming it: every segment is a MOMENT
      CARD with its operator cue underneath (▶ In "on ▶ Play" · » 2 "on 1st » Next" · ■ Out
      "on ■ Stop"); a read-only **● On air** card names the hold between the last reveal and
      the exit (until ■ Stop / auto-out Ns / stays) and clicking it parks the preview on the
      settled on-air look; step rows get an **"appears on" menu** (move a line to another
      » Next press, or its own new one — patchStepRegroup minus the drag); »+ Step disables
      with a tooltip reason instead of vanishing; an unparsable hand-edited region shows an
      honest one-liner; the header ease readout speaks the vocabulary's names (raw GSAP pair
      in the tooltip). Next (needs approval): converge the Motion panel into the In/Out cards
      and make the On air card edit `settings.out`.
- [x] **T3.6 step-workflow honesty fixes (2026-07-09, second tester round)** — app declares
      `color-scheme: dark` + the preview srcdoc gets the matching meta (native select popups
      were white-on-white on Windows; the pairing keeps the stage transparent); the appears-on
      menu is self-labeling ("appears on press 2") and cards/ghost/tooltips share the "press"
      vocabulary; a "Turn off step reveal" action on the strip (the Motion checkbox's
      counterpart); `countLines` no longer counts `<img>` logo fields as text lines — corner
      bugs and card03 stop offering a broken unmasked step reveal. Bigger rethink planned and
      approved separately (element→press assignment, derived part registry, cue-segmented
      strip): fix B1/B2 step-sync bugs next, generalize steps to non-text parts after the
      registry; timeline overview and canvas assignment wait for the Era-6 selection model.
- [x] **T3.7 step-sync bug fixes (2026-07-09)** — two intent-corrupting bugs: (B1) regroups
      only patched the JS, so a merge/split left a stale SPX `steps` count (a dead Continue
      press on air, wrong OGraf stepCount) — every step-count-changing path now re-syncs the
      definition via `withStepsSetting` (invariant: steps = groups + 1); (B2) any Motion
      preset/easing apply re-emitted the default one-line-per-press chain, silently deleting
      the user's regrouping — `presetConfigFromTemplate` now round-trips the existing
      `stepGroups`/`stepDurations`/`stepEases` literals (filtered to lines that still exist)
      and the emitters preserve them. Turning steps on now announces the behavior change on
      the strip ("▶ Play now shows only the first line…"), and the steps checkbox copy in the
      wizard + Motion panel uses the same press language. E2E: definition follows merge/split;
      preset swap keeps a merged chain + tuned ease.
- [x] **T4.0 the TemplatePart registry (2026-07-09)** — the shared element-identity contract
      (model/structure.ts `getTemplateParts(html, fields)`): DOM-derived, never stored —
      parts are {selector, kind: root|panel|accent|line|image|block, label, channel:
      mask|rise} with single-token selectors only (the region parsers can't round-trip more)
      and a uniqueness rule (a selector matching ≠1 elements is excluded, not guessed).
      `countLines` = the registry's mask-capable `line` parts (DOMParser replaces the
      attribute-order regex that miscounted logo imgs); the timeline strip's labels/ghost/
      appears menu read `part.label` (friendlyTarget keeps heuristics only for unregistered
      selectors). This is the contract the canvas selection layer and step generalization
      build on — canvas session must consume it, never fork it. E2E pins the Hairline
      part map + the selector shape rule.
- [x] **T4.1 any part on any press (2026-07-09)** — steps stop being lines-only: accents,
      logo/image slots, and any line but the first can be assigned to a » Next press.
      Emit changes (animPresets stepsBlock): a `stepReveals` map says HOW each part appears
      ('mask' slides within its line mask, 'rise' fades+rises — channel from the registry,
      never guessed from the selector); pre-hiding is `hidePendingSteps()` DERIVED from
      stepGroups at runtime, so "removed from every group ⇒ appears with ▶ Play" is true by
      construction; per-part reveals are positioned tweens in one timeline (mixed channels
      per press work). Patch split: moving between existing presses stays patchStepRegroup
      (array patch, keeps tuning); assigning/unassigning re-emits the IN phase
      (`applyStepChain`) because the entrance choreography changes (an assigned accent's
      intro draw drops; it returns on unassign). The step view lists unassigned parts with
      an "appears with ▶ Play" menu — pick a press to move them; assigned rows can go back.
      Emptied presses disappear; the last part leaving turns steps off. Validation warns on
      dangling step selectors. Deferred: block elements outside the root (opacity-gate
      problem); entering the steps world still needs 2+ lines (»+ gate) — a logo-only
      first step is a follow-up. E2E: accent onto its own press → hidden through Play,
      revealed on press 2, definition steps follow → unassigned back into the entrance.
- [x] **T4.2 the cue-segmented overview (2026-07-09, user-ratified over a global time
      axis)** — the strip's tracks area becomes ONE overview of the whole playout: every
      section (▶ In · each » press · ● hold · ■ Out) side by side, each on its own REAL
      local clock (a single global ruler would fabricate times for operator-driven cues);
      widths = duration × zoom (+/- buttons; fit once per template, min-width-aware), the
      hold a fixed hatched break; rows are registry parts spanning every section —
      multi-target tweens expand onto member rows at their true stagger offsets, set()-only
      bookkeeping rows drop. Every bar edits in place (the same literal patchers); reveal
      bars drag onto » cards to regroup; the gutter shows each part's "appears on press"
      menu at a glance + the selected moment's ease chips. Cards renumbered by PRESS ("» 1"
      = the 1st » Next) so headers, cards, menus, and tooltips finally share ONE numbering.
      timelineModel.buildOverview = the pure matrix derivation. E2E: overview structure,
      zoom scaling (hold fixed), header-click selection; the whole regroup/retime suite
      re-pinned on overview geometry (bars scroll into view in narrow panes).
- [x] **T5 independent layers + basic per-layer animation (2026-07-10, third tester round)** —
      the interaction rethink the tester asked for, as ONE coherent drag model:
      (1) layers edit INDEPENDENTLY — dragging any member of a joint multi-target tween
      splits it into per-target calls first (`splitTween`: exact stagger offsets become
      explicit positions, phase length unchanged) so only the grabbed layer retimes;
      (2) bars resize from BOTH edges (left handle moves the start, end pinned);
      (3) dragging a bar ACROSS sections moves WHEN the part appears — entrance bar onto a
      » press assigns it there, reveal bar onto the entrance un-assigns — all through the
      canvas-shared `changePartPress`, with section bodies as drop zones and a ghost chip
      naming the destination (dropping outside a bar's section can never stretch a phase);
      (4) each layer row's ▸ arrow opens the ENTERS-FROM drawer: X / Y / Scale / Opacity /
      Rotation from-values that settle to the design position (`patchTweenVars` edits
      from/to literals minimally, `insertPartTween` gives partless layers a tween) — the
      deliberately small basic-animation set (slide-ins etc.), NOT a keyframe system (the
      future Flow mode owns advanced logic); (5) select options painted explicitly
      (color-scheme alone failed on the tester's Chromium — white popup, grey text) and
      the timeline selects go solid/full-contrast; clicking a bar (without dragging)
      selects the element, extending the canvas↔code↔timeline sync. E2E: split-on-drag,
      both-edge resize, drop-to-press round-trip, drawer literal round-trip, explicit
      option colors.
- [x] **W4.1 the canvas selection model (2026-07-09)** — click a structural element in the
      preview to select it: registry-backed hit-testing (`getTemplateParts` selectors via an
      elementFromPoint closest-ancestor walk, rect-containment fallback for pointer-events:
      none imports), an amber outline + naming chip speaking `part.label` (the same words as
      the timeline strip), a hover outline + tag previewing what a click would select, and
      click-again-to-climb (line/panel → whole graphic — the registry's nesting, so the root
      stays reachable). Empty canvas or Escape deselects (Escape yields to drag/inline-edit/
      form focus). The chip surfaces ONLY actions that already exist where they apply:
      "Double-click to edit" on text lines; the corner --scale handle stays anchored while
      the whole graphic is selected. Selection is editor UI state ONLY — no store field, no
      template write, rAF-tracked rects so it follows animation and rebuilds. Step/press
      assignment on selection is deliberately NOT here (lands after both Era-6 tracks merge).
      E2E: canvas-selection (5 — select/name, hover, deselect ×2, climb+handle, edit/drag
      layering).
- [x] **W4.2 shared selection (2026-07-09, the first convergence slice)** — the two Era-6
      tracks meet: the canvas selection selector moved from component state into the store
      (`selectedPart`), and both surfaces speak it. Clicking an element on the canvas washes
      its overview row amber (label lit, inset edge); clicking a row's LABEL in the strip
      selects that element on the canvas (outline + chip), clicking the selected label
      deselects both. Only registry-part rows are handles (unregistered hand-tween rows stay
      inert); still UI state only — no history, no template write. Next convergence slice:
      the chip's "appears on press" action reusing applyStepChain. E2E: canvas-selection +1
      (both directions + deselect, no code written).
- [x] **W4.3 "appears on press" from the canvas (2026-07-09, the payoff slice)** — the
      selected element's chip carries the timeline gutter's press control: select the
      accent/logo/a line on the canvas → "appears with ▶ Play / on press N / on a new
      press". Same conditions as the gutter (steps on, chain groupable, eligible kinds,
      never the first line), same soloLast guard, ONE undoable apply + auto-replay. The
      decision tree extracted to blocks/stepAssign.ts `changePartPress` (entrance→press
      and press→entrance re-emit the IN phase with the registry channel; press→press stays
      the tuning-preserving array patch) and the gutter now delegates to it — the two
      surfaces cannot drift. The chip opts into pointer input only while it carries the
      control and swallows its events (the gesture layer under it never fires). E2E:
      canvas-selection +1 (assign via chip → code + gutter agree → back to the entrance).
- [x] **T4.5 blocks join the press chain (2026-07-10, closes T4.1's deferral)** — building-
      block elements (data-gfx + id, siblings of the root) can now appear on a » press. The
      opacity-gate problem solved with an emitted OUTSIDE GATE, both halves derived from the
      chain: (load side) the steps block hides `stepOutsideParts` from first paint, DOM-ready-
      guarded, so nothing shows before ▶ Play; (exit side) ONE recognizable `tl.to(...)` line
      in buildOutTimeline — kept in sync surgically by `patchOutsideExit` at the swap choke
      points, so assign/unassign never resets out-phase tuning and the line's own dragged
      timing survives updates (it parses as a normal editable fade bar in the overview).
      Outside-ness decided by real DOM containment, not part kind. `assignableParts` now
      includes blocks (chains round-trip through preset swaps without dropping them); the
      gutter menu and the canvas chip both offer them. E2E: canvas-selection +1 — insert the
      Logo block, give it its own press from the chip, and pin the whole lifecycle (hidden
      settled → revealed on press 2 → fades on ■ Stop → always-on again after unassign, gate
      code gone).
- [x] **T6 one motion surface (2026-07-10, the approved T3.5 follow-up)** — the Motion
      side-tab is retired; the strip's moment cards ARE the motion surface (SidePanel: five
      tabs). The selected ▶ In / ■ Out card grows an inspector row with that phase's preset
      picker (presetsForType, per-category) and easing choice (the vocabulary's phase-correct
      half — doctrine intact), writing the panel's exact patches (`swapAnimationPhase` /
      `setAnimKnob`); the animSpeed knob lives on the strip header (Slower/Normal/Faster);
      the ● On air card's note now EDITS the SPX `out` setting (until ■ Stop / auto-out N ms
      with an editable delay / stays-no-out), synced into the definition like
      `withStepsSetting`. The unparsable-region fallback keeps the Motion tab's one remaining
      duty: an honest one-liner plus a start-over preset select (a 'both'-phase swap re-emits
      the whole region and brings the timeline back). Found & fixed on the way: `splitRegion`
      left the "// Out preset:" tag in the head slice, so an In-swap followed by an Out-swap
      stranded a stale duplicate tag that won the readback (the panel had the same bug).
      Steps stay where T3.6 put them (»+ Step / turn-off on the strip); the wizard's
      Animation STEP is untouched (a different surface for a different moment). E2E: the
      motion specs re-pinned on the strip + new coverage (per-phase swap from a card, speed
      knob, out-mode sync, fallback).
- [x] **T6.1 motion-surface tester fixes (2026-07-10, first round on the converged strip)** —
      four issues from trying the build: (1) an EXIT could leak its end state into the next
      playback — most visibly a Blur exit leaves filter:blur on the box that a non-blur
      entrance never resets, so the replay started blurred; the simulator now `resetGraphic`s
      (clears GSAP inline props on the root subtree) before every entrance, so play → hold →
      exit → clean reset → play again always starts from the true initial state. (2) The SPX
      `out` = N ms auto-out never fired in the editor preview (only export); the simulator now
      schedules the exit after the entrance settles + the hold, cancelled by any manual
      play/stop/next/scrub. (3) The In and Out cards showed identical preset labels; the Out
      card now names presets in their exit direction (Blur in → Blur out, Drop in → Drop out;
      direction-neutral names like Mask wipe unchanged). (4) The per-layer transform drawer
      was entrance-only; it is now PHASE-AWARE — enters-from on the In card, leaves-to on the
      Out card (patchTweenToVars edits the exit's to-vars, insertPartOutTween gives a partless
      layer its own exit tween; opacity never auto-stripped so the exit still fades). E2E:
      leak-free replay, auto-out in preview, in/out naming, the leaves-to drawer round-trip.
      (Also answered: the missing Login/Community menus were an env artifact — this worktree
      has no `.env`, so the app runs offline and both account surfaces stay hidden by design.)
- [x] **T6.2 per-layer blur (2026-07-10, second tester round)** — the per-layer drawer gains
      a Blur field on BOTH phases: enters-from materialises a layer out of a blur, leaves-to
      dissolves it into one. Blur is the one non-transform in the drawer — it serializes to
      `filter: 'blur(Npx)'` (a string literal, not a bare number), so it has its own reader/
      writer (`setObjBlur`, a `DRAWER_PROPS`/`DRAWER_IDENTITY` vocabulary alongside the
      transforms). All four drawer patchers handle it (patchTweenVars/patchTweenToVars edit
      the from/to objects; insertPartTween gives a blur-in fromTo, insertPartOutTween a
      blur-out to()), and splitTween still separates a joint tween first so only the grabbed
      layer blurs. The simulator's reset already clears leaked filter, so blur leaves cleanly.
      E2E: the drawer exposes blur on both cards and an exit blur round-trips + resets.
- [x] **T7 Timeline v2 — the step timeline (2026-07-11; phases 1-7 + the creation flip +
      the CapCut polish pass; Phase 8 deferred, see below)**: the declarative engine
      (NOACG_ANIM data block + interpreter, canonical serializer, importer, golden parity
      harness); the Inspector column + redo; the clip-style ribbon (cue markers, ruler,
      scrub); keyframes (arm/auto-key at the playhead, diamond drag/delete); presets as
      keyframe generators (In/Out/Both, declared props only, layer-relative In); steps as
      clips (preserve/stretch resize, duplicate/rename/delete, »+, hold popover, speed);
      LOWER THIRDS CREATE AS DATA natively — the classic-strip spec suite moved to its
      still-legacy sibling (info cards' Hairline Card, 34 tests); Phase 7 parity (the
      OBS/vMix overlay honors auto-out with a measured entrance, data-block validation
      warnings, the AI prompt teaches the data shape, l3-sweep updated); and the polish
      pass — playhead grab cap + auto-follow scroll, 1000 px/s deep zoom, per-keyframe
      and per-step ease menus (right-click), ◀◆▶ keyframe navigation, label
      drag-scrubbing. **Phase 8 (retire the literal patchers + the classic strip) waits
      for the remaining category migrations.** Since shipped, each unblocking a wave:
      the §3b STEP CALLS (a named lifecycle hook — game timers), LOOP/YOYO (a repeating
      track — starting soon), and MEASURED MOTION (a named builder that reads the DOM and
      returns the tween — **tickers and end credits**, docs/DYNAMIC_MOTION_SCOPE.md).
      **Only quiz (wrapper-driven Continue) and info cards (they host the classic strip's
      spec suite) remain on the legacy region.** Phase 8 is ratified to retire the strip's
      EDITING patchers while keeping a minimal read-only renderer: a saved template whose
      measured motion is hand-written inline can never be auto-converted, and silently
      regenerating it would discard its owner's tuning. Original plan entry follows — the
      CapCut-style rethink: steps as clips, a real playhead/ruler, an Inspector panel,
      proper keyframes, presets as keyframe generators with In/Out/Both. The audit
      concluded the parse-by-construction patcher architecture is at end of life for this
      feature set; the marked region moves to a declarative data literal + fixed
      interpreter while keeping the builder-globals contract (so the simulator and every
      export are untouched). Full plan, data model, the twelve design decisions, risks,
      and 8 phases: **docs/TIMELINE_V2_PLAN.md**.
Drag/move/scale writes the SAME deterministic patches the panels write today (zone +
nudge + --scale foundations already exist) — code stays the source of truth. Timeline UI
for in/out timings + step triggers maps onto the marked ANIMATION region + animSpeed/
duration knobs. Big; planned last deliberately. **Binding plans (2026-07-08):
`docs/WYSIWYG_PLAN.md`** (slices W1 drag-to-position → W2 scale handle → W3 in-place text →
W4 element nudges, with guardrails) **and `docs/TIMELINE_PLAN.md`** (T1 read-only timeline
view → T2 timing knobs → T3 steps/next() sequencing → T4 custom sequences; not a Loopic
clone, never a creation surface). Recommended order: W1 → T1 → T2 → W2/W3 → T3.

### Era 7 — Nightly automation + the auto-generated graphics library (committed direction, unscheduled)
Binding plan: **`docs/NIGHTLY_AUTOMATION_PLAN.md`**. The site continuously generates and (eventually)
publishes new premium graphics — a large free library covering almost any use case (lower thirds,
titles, timers, tickers, scoreboards, event/holiday/sports/news/social formats, …), with an automatic
quality + safety gate that auto-rejects anything broken, low-quality, inappropriate, or off-brand.
Also nightly health checks (build, E2E, `npm audit`, Supabase advisors). Trajectory: **human-reviewed
now** (drafts land `pending` in the Era-5.5 community table via a least-privilege bot; a human approves
in the 🛡 queue) → **gate-trusted auto-publish later** once the automatic gate matches human judgment.
Reuses `claudeProvider.generate` + `publishGate` + the bench harness; runs on GitHub Actions cron + one
read-only scheduled cloud agent. Job A (the health/CI gates) is built (push CI + weekly audit,
2026-07-21); the generation jobs B/C are plan only — see the plan doc for the verified guardrails
(the nightly-drafts migration, numbered `0012` there) and open decisions.

### AI mode (after the wizard works)
- [x] Model-independent gateway beneath the existing Claude-backed `AIProvider`: Anthropic,
      OpenAI Responses, and OpenRouter adapters; server-only managed keys; sealed HttpOnly
      user keys; normalized structured output, usage, estimated cost, errors, bounded retries,
      and explicit fallback routes (`docs/AI_PROVIDER_GATEWAY.md`)
- [x] **NoaCG Lite managed profile (2026-07-27)** - one catalog-grounded editable result for
      common graphics; server-owned model and privacy routing; explicit unsupported decisions;
      one shared two-attempt budget; durable allowance/cost/outcome ledger; no prompt/content
      storage; one-result UI with no provider names; kill switch and configuration-only model
      replacement (`docs/AI_PROVIDER_GATEWAY.md`)
- [x] **Lite lower-third quality foundation (2026-07-27)** - first release narrowed to lower
      thirds; six audited chassis carry intent-aware routing guidance; semantic line roles and
      custom-palette contrast fail before compilation; a versioned 24-brief benchmark covers
      broadcast genres and text stress; thresholded accepted/discarded chassis outcomes feed a
      content-free server-side tie-breaker without storing prompts or generated artifacts
- [x] **Lite evaluation benchmark, free phases (2026-07-27)** - the one shared compile
      pipeline (`src/ai/lite/pipeline.ts`, production and benchmark build from it; equivalence
      pinned in the build gate); versioned core/holdout/repair suites with labelled expected
      outcomes; zero-cost calibration (gold ceiling + seeded floor, both machine-valid) and
      regression mode with pipeline-identity hashing; blind review gallery with planted
      repeat items; honest report keeping machine validity, acceptance, and visual score
      separate (`docs/AI_LITE_BENCHMARK.md`, `docs/AI_LITE_PROMOTION.md`). Model discovery/
      comparison phases deliberately deferred until the catalog freezes.
- [x] Prompt → graphic template ("Describe it" wizard entry: validated before apply, one
      automatic repair round on validator errors, refine loop on the result; generated code
      keeps the house contracts so the Style/Motion panels and brand still work on it)
- [x] Images in generation — upload logo / still, Claude SEES them (vision), they bundle as
      `images/` assets; project brand colors carried in via the match toggle
- [x] AI panel (modify / fix / explain / make-SPX-ready) backed by Claude when configured,
      by the deterministic stub otherwise
- [x] **AI platform audit + plan (2026-07-28)** - repo-wide inventory of every AI surface,
      workload classification, and the unified architecture: a shared task registry with an
      open-weight model allowlist over the existing gateway, Lite retained as the specialized
      catalog-grounded harness, a proposal-only Import Graphic analysis harness, and a vision
      benchmark plan (`docs/AI_PLATFORM_PLAN.md`)
- [x] **Editor AI panel quality gate (2026-07-28)** - the AI assistant panel injects the
      production validator (static + runtime bench + safety screen) so its repair loop works
      against real findings, pinned by a mutation-tested spec (`e2e/ai-panel.spec.ts`)

### The AI platform (2026-07-28 — decided in `docs/AI_PLATFORM_PLAN.md` §15)

Owner decisions — RATIFIED 2026-07-28:
- [x] **Model policy: benchmark-first with an open-weight preference** (not a hard mandate) -
      an open-weight model is used whenever it performs as well as or better than the
      proprietary alternatives on NoaCG's own benchmarks; a superior proprietary model is
      never excluded merely for closed weights. Route selection stays explicit server
      configuration - never a silent fallback.
- [x] **Consent notice** - discloses that prompts and uploaded images may be sent to an
      external AI provider, that sensitive/confidential material must not be uploaded, and
      that NoaCG prefers ZDR-capable routes where available but cannot guarantee identical
      retention across providers. Acceptance stored server-side for signed-in users
      (timestamp + notice version); client-side for anonymous users, with renewed acceptance
      whenever the notice version changes.
- [x] **Free Import Graphic vision quota** - 1 image per analysis, 10 successful analyses
      per day, 100 per month; images downscaled to at most 1920x1080 before sending. Only
      successes count against the quota; abuse-oriented rate limiting is separate; actual
      per-run provider costs are recorded so the numbers can be tuned from real usage.
- [x] **BYO credentials require sign-in on the hosted service** - keys associate with the
      user, not just a browser cookie. Account-free BYO-key use survives for private
      self-hosted installs behind an explicit configuration flag, disabled by default in
      the hosted product.
- [x] **Who pays decides the route** - NoaCG Lite and every other free hosted surface are paid
      for by the project, and there is no revenue yet, so a route NoaCG funds must be a cheap
      OpenRouter model. OpenAI and Anthropic models are reachable only through the user's own
      sealed key; no managed NoaCG key is wired into a hosted path for them. A cost constraint
      that composes with the benchmark-first policy rather than replacing it: a candidate can
      only be promoted to a NoaCG-funded route if it is cheap and OpenRouter-reachable.
      Revisit when there is income.

The stages, in order (details in the plan):
- [x] **Stage 0 remainder (2026-07-28)** - `/api/ai/generate` per-IP burst gate + content-free
      `ai_gateway_requests` ledger row (migration 0012, task `byo-generate`); audited dead-code
      removals (kept: `referenceSelect.ts` experiment machinery, `modelRole:'fast'`, Lite
      schema members - see the plan's §1.5 annotation)
- [x] **Stage 1 (2026-07-28)** - AI task registry (`api/_lib/aiTaskRegistry.ts`) + approved-route
      model catalog (`api/_lib/aiModelCatalog.ts`, `openWeights` as promotion metadata per
      decision 1; the prior live-discovery module moved to `aiModelDiscovery.ts`); Lite
      re-expressed as task `lite-design-spec` with `/api/ai/lite/*` URLs and behavior
      unchanged (proven by `bench:regress` + the gateway test suite); free-tier routes now
      fail closed outside the catalog (`docs/AI_TASK_REGISTRY.md`)
- [x] **Stage 2 build (2026-07-29)** - first-use disclosure notice on every external-provider
      AI action (wording/version in `src/ai/consentNotice.ts`; acceptance client-side for
      anonymous + server-side for signed-in via `ai_consents`, migration 0014; the offline
      stub never shows it - pinned by `e2e/ai-consent.spec.ts`); ZDR-by-default pinned for
      free task routes. STILL OPEN from Stage 2: run the Lite model benchmark (spends real
      tokens) and settle the primary per the benchmark-first policy, within the funded-route
      cost constraint (cheap and OpenRouter-reachable - ratified decision 5)
- [x] **Stage 3 build (2026-07-29)** - `imported-graphic-analysis` task behind
      `AI_TASK_IMPORT_ANALYSIS_ENABLED` (default off): endpoints + profile-scoped ledger
      (migration 0015), `src/ai/importAnalysis/` contract/client/normalizer (font honesty,
      client-side downscale), proposal-only panel on the Import Graphic Text step applying
      via `DesignFieldSpec`; stub-first `e2e/import-analysis.spec.ts`. STILL OPEN from
      Stage 3: the hand-labelled vision dataset + benchmark (>=3 open-weight candidates)
      picks the launch route before the flag turns on
- [x] **Stage 4 build (2026-07-29)** - the bounded errors-back repair loop extracted to
      `src/ai/shared/repairLoop.ts` and driven by BOTH coders (blocking-findings policy stays
      per-caller: SPX editability demotion, video soft-finding demotion); the video harness
      now records through the shared telemetry ring (`video-generate`/`video-refine` kinds -
      it recorded nothing before). The audit's video-internal dedup items were found already
      resolved on main (dead-input checks exist on both engines; the per-engine canonical
      examples are deliberate). STILL OPEN from Stage 4: the paid `ai-compare.mjs` regression
      run the plan names as the refactor's token-spending proof (the free proofs - build,
      `bench:regress`, the mocked repair-round e2e specs - are green); open-model candidates
      in the code benches ride the Stage 2 bench decision

### Export & platform
- [x] SPX Starter + Advanced/Pack export with validation gate
- [x] OGraf export target + manifest validator (see `.claude/skills/ograf-expert`)
- [x] CasparCG export target (self-contained single file + XML data shim)
- [x] **HTML overlay export (2026-07-08)** — one self-contained autoplay .html for plain browser
      sources (OBS Browser Source, vMix Web Browser input, anything that renders a web page):
      fills fields on load (Data-panel values baked at export, SPX-definition defaults as
      fallback) then play(); ships the BroadcastChannel receiver + controlpanel.html (OBS custom
      dock workflow documented) and honors the 5.3 remote-control block. Shared single-file
      composer extracted (`export/selfContained.ts`, reused by CasparCG). E2E: loads the exported
      file with zero outside calls and asserts the baked value + settled opacity.
- [x] **Export research (2026-07-08)** — `docs/EXPORT_TARGETS_RESEARCH.md`: **H2R Graphics** is a
      HIGH-priority small adapter (its Custom HTML type calls our exact `play()`/`update(json)`
      contract; fields declared via a GDD script block we can generate from DataFields);
      **LiveOS** is likely free via our existing OGraf export (OGraf demoed at NAB 2026; else a
      templates.json adapter); **Singular.Live / Flowics / uno** are closed composers — not
      ingest targets, interop at the production layer.
- [x] **H2R Graphics export target (2026-07-08)** — self-contained .html for H2R's Custom HTML
      graphic type: embedded GDD block (`application/json+gdd`, properties keyed by element id
      from the SPX DataFields) becomes H2R's editable inputs; a marked toggle shim converts
      H2R's play()-both-ways convention into the template's play()/stop() pair. E2E drives it
      exactly like H2R (update json string → toggle on → toggle off). 6 export targets.
      **Real-H2R fix (2026-07-08):** the GDD `<script>` needs `name="graphics-data-definition"`
      — without it H2R silently shows no editable fields (found by the user importing into a
      real H2R install; verified against H2R's own Loopic-exported sample). Also dropped the
      unrecognized `file-path` gddType (filelist → plain single-line path input). E2E now pins
      the `name` attribute. **Live-confirmed in the real H2R app (2026-07-08): fields render
      and text edits work.**
- [x] **LiveOS export target (2026-07-09)** — NetOn.Live confirms the LiveOS HTML5 graphics
      engine is OGraf-compliant (any OGraf template imports and plays directly), so the
      target (`export/targets/liveos.ts`, registry id `liveos`) reuses the OGraf package
      builder (`addOgrafPackage`, extracted in `targets/ograf.ts`) and wraps it with
      LiveOS-specific install steps + success message. E2E pins the LiveOS and OGraf
      exports to byte-identical graphic.mjs/manifest so the targets can never drift; the
      driven OGraf contract test covers the shared module. Loopic's legacy `templates.json`
      ingest stays unbuilt (schema not public — see EXPORT_TARGETS_RESEARCH.md). Still to
      do: confirm against a real LiveOS install, like H2R was.
- [x] **Video & image rendering (2026-07-12)** — export any graphic as finished MEDIA from the
      Export tab: MP4 / transparent WebM / transparent PNG still / PNG-sequence ZIP / ProRes
      4444 MOV, rendered by Remotion driving the graphic's OWN runtime (no per-graphic
      compositions, no rewritten animations). A virtual clock makes every frame a pure
      function of the manifest (countdowns/marquees/count-ups render exactly as live;
      repeat renders are byte-identical); the user picks the TOTAL duration, measured
      animation time is preserved, and the remainder becomes hold. Local executor for
      dev/self-host; hosted path = Vercel Sandbox (@remotion/vercel) + Blob with per-job
      secret auth, tier quotas (ProRes/sequence sign-in-gated), the render_jobs ledger
      (migration 0007), and a cleanup cron. Contract: `src/render/CLAUDE.md` +
      `docs/RENDER.md`. Still to do: live-verify the sandbox path on a real deployment
      (needs the Blob store + env vars), like H2R was.
- [x] **One authored project format across creation (2026-07-27)** - templates, AI and Lite,
      imported artwork, blank graphics, video AI, and the older image/catalog continuation all
      use one preset registry and one picker before authoring starts. Saved work remains
      untouched; HTML/SPX imports detect exact package metadata and require confirmation when
      resolution or FPS is uncertain. Package exporters preserve authored dimensions/timing,
      while rendered-media scale and compatible FPS are explicitly output settings
      (`docs/PROJECT_FORMATS.md`).
- [x] **AI video & animation projects (2026-07-13)** — a second project kind beside live
      graphics: "Video or animation with AI" in the New Project wizard creates a
      fixed-duration React/Remotion composition (stingers, intros, logo reveals,
      countdowns, graphics over uploaded video). A staged motion-design harness generates
      it (skill detection → a timed Motion Director plan → the Remotion coder against a
      composition contract + canonical example → bounded compile/probe/repair), the code
      stays visible and editable in Monaco, a sandboxed Remotion Player previews it live
      (player-host/, its own package — Remotion never enters the AGPL bundle; the iframe's
      opaque origin keeps AI code away from the user's key), chat refinement iterates,
      projects autosave + save/reopen, and the EXISTING render service outputs
      MP4/WebM/PNG/sequence/ProRes via manifest kind:'remotion' (the same compiled module
      the preview runs). Uploaded images/SVGs/video become `assets` props; a video asset
      can be the background layer. Merged to main 2026-07-13; the input-model convergence
      (editable Remotion inputs mapped to the Template Definition system) followed 2026-07-14,
      and the HyperFrames engine joined as a second video engine 2026-07-18. Still to do:
      sandbox-executor live verification, a Blob upload channel for large assets, and the
      visual Motion Critic pass (experiment-gated - docs/VIDEO_DESIGN_QUALITY_PLAN.md §3.5).
- [x] **OpenRouter/Hugging Face video model benchmark (2026-07-28)** - live server-side
      discovery of compatible model ids, modalities, structured-output support, context/output
      limits, availability and pricing; OpenRouter plus optional hosted Hugging Face inference
      below the unchanged video harness; per-project model selection; and a versioned
      Remotion/HyperFrames benchmark with fixed briefs/settings, bounded spend/concurrency,
      raw reproducibility artifacts, real-render support, separate machine/human scoring, and
      quality/value/free/engine/first-pass leaderboards (`docs/VIDEO_MODEL_BENCHMARK.md`).
- [ ] Data-driven/live content architecture (ticker/scoreboard controlled from a backend) — later

### The SPX generation harness (2026-07-17 — AI that beats a bare prompt, provably)
- [x] **One "Create with AI" entry** — the wizard's Describe-it and Import cards merged: a
      brief plus optional images and/or an existing .html/.zip in one drop zone; the
      byte-faithful no-AI "Open as code" import stays one click away (never sign-in-gated),
      the images → catalog continuation survives, and Convert brings a foreign template to
      the house contracts guided by the prompt.
- [x] **Grounded-first generation** — one small design-spec call routes each brief; catalog-fit
      specs assemble DETERMINISTICALLY through the real wizard assemblers (correct by
      construction, panel/timeline-editable), with compositional design adjustments
      (typography scale/weight/tracking, density, alignment, shape, panel treatment) so
      different briefs produce different designs — not one layout in new colours — plus an
      optional bounded polish patch that can only improve (revert on any gate/bench failure).
      Off-catalog briefs go to the free-form coder (nearest catalog design as the canonical
      example) with a validated 2-round repair loop; taste guidance is genre-reasoning, not a
      fixed look, and uploaded references are read as a design system that outweighs it.
- [x] **The runtime bench in the loop** — every AI result is exercised in a live iframe
      (lifecycle, field binding, overlap/overflow, doubled-text stress, house editability);
      findings feed repair rounds verbatim; the whole catalog must pass its own bench
      (e2e/catalog/catalog-bench.spec.ts calibration tripwire). The offline stub assembles catalog-grade
      results through the same pipeline.
- [x] **Value proven, not assumed** — per-run telemetry (tokens, latency, calls, repairs,
      route, variant diversity) + scripts/ai-compare.mjs rebuilt as the standing proof: same
      brief, same model, four arms (raw / raw+self-critique / pre-harness / the harness),
      neutral scoring. The decision rule: a harness stage keeps its place only if it shows a
      clear improvement for its cost.
- Deferred until the benchmark earns them: a selective vision taste critic, a curated taste
  library with per-brief retrieval, and a nightly taste-analysis task (reviewable proposals).
- [x] **The harness made optional, comparative, and learning** (user verdict on run #1: not
      yet consistently better visually — raw already looks strong): a "Use NoaCG harness
      (3 options)" checkbox (default OFF = the pure one-shot baseline, statically validated,
      no repair); harness ON generates THREE distinct directions from one design-stage call
      with an option picker; the committed pick feeds aggregated preference counters that
      surface into the design prompt as a subtle tie-breaker (≥8 selections, ratios only).
- [x] **Benchmark winners promoted into the catalog** (the Era-3.5 move, repeated): both
      kids' timers → gt03 "Sunny Pop" + gt04 "Stage Ring" (design-owned ring/tick runtimes
      + autoEase on the gt contract), raw election bars → ig07 "Election Bars" (count-up
      readouts riding the bars-grow measured-motion builder), and both versus cards → a NEW
      **versus** category (vs01 "Arena Duel" + vs02 "Collision Card", vs-slam/vs-glide
      presets) — the full-frame match-up that misfitted info-cards (dropped card05) now owns
      its contract. Catalog: **11 categories, 49 designs**.

### Adapt-first Create with AI (2026-08-03, binding: docs/ADAPT_FIRST_PLAN.md)
*Describe the graphic you need, and NoaCG turns a proven broadcast design into a customized,
editable, production-ready graphic.* The pivot away from cheap models inventing broadcast
graphics from a blank stylesheet, after five paid Creative-Mode rounds measured that they cannot.
- [x] **The catalog measured** — `scripts/catalog-geometry.mjs` over all 430 variants: 88 of 89
      lower thirds sit in the bottom band, 87 at exactly 119px, and the rendered side agrees
      with the declared zone on 89 of 89; 219 of 430 designs across every category sit at a
      119/120px inset. Placement is one number, not a preference.
- [x] **Retrieval before the design call** — `src/ai/retrieval.ts` shortlists through the Browse
      storefront's own engine and the one anchor table, with no new model call and no second
      retrieval system: ~20,300 tokens of flat catalog become ~600 of ranked candidates, and the
      tool schema is narrowed to exactly the designs the prompt showed.
- [x] **The chassis keeps the zone it was drawn for**, with a requested side answered by
      retrieval rather than by moving a design off its own anchor; the assembly policy travels
      as an argument so NoaCG Lite keeps compiling under its own declared contract.
- [x] **The promise is visible** — the result names the proven design it adapted and shows the
      shortlist it was chosen from; picking another rebuilds on it deterministically, free.
- [ ] **Prove the shortlist beats the digest** — one paid round, same briefs and model, full
      digest vs shortlist (ADAPT_FIRST_PLAN §6.3). Not run; needs explicit cost approval.
- [ ] **Fold Lite onto the platform placement rule** — needs a paid lower-third re-baseline (§6.2).

### Import Graphic - your own artwork becomes the design (2026-07-18)
The flat-PNG import workflow; **docs/IMPORT_MVP.md is the binding contract.** NoaCG is not
replacing Photoshop/Figma/After Effects - graphics may be designed elsewhere; NoaCG's job is
the dynamic fields, broadcast behaviour, preview, and export around them. Distinct from the
Phase 5 "Import graphics" entry above, which routes a dropped image into a catalog design's
logo slot: here the image IS the design.
- [x] **MVP wizard flow** - the wizard's Import graphic entry: drop a flat PNG, measured at
      import (never assumed) - frame-sized art anchors at 0,0; larger art is scaled to fit the
      frame, so a 2x/retina export lands exactly frame-sized; smaller art floats with the
      ordinary 9-zone anchor - then the Text step places lines in the artwork's own px, and
      whole-unit in/out presets (Fade / Slide up / Pop / Blur) animate artwork + text as one
      picture. The output is a standard-contract template (`.imported-design-box`) the part
      registry, timeline, canvas selection, and all six export targets accept with no changes.
      A canvas drag re-places a line through its wrapper's CSS rule
      (blocks/designLayout.ts) - a design decision, never a motion keyframe.
- [x] **Wizard taste pass (founder-ratified)** - one CTA on the Design step (the footer Next
      reads "Add text fields >"); the Style step slims to what still applies (Palette + Font
      always; Graphic size + Position only for smaller-than-frame art; the global Text size
      knob never shows - each line sizes itself on the Text step); the box part is labelled
      "Design", not "Panel".
- [x] **Canvas + data fields phase** - the Data tab's add-field creates a real placed line on
      the artwork (visible element + placement CSS rule + SPX DataField + selectable layer,
      one undoable apply, wired into update() and every export with no manual code); placed
      lines nudge with the keyboard and resize their text with a canvas handle; the artwork is
      its own registry layer so the PNG and every field animate independently (Inspector
      presets apply per layer; Animations is the Inspector's default view on an imported
      design); E2E covers the full import -> canvas -> field -> animate -> preview -> SPX
      export roundtrip.
- [x] **Image slots + editor-wide nudge (follow-up)** - the Data tab's Image add creates a
      placed image slot on the artwork (SPX filelist field, dashed empty-slot mark, corner
      box resize; the slot stays selectable and draggable while empty), and arrow-key
      nudging extends beyond placed fields to EVERY selected layer - placed fields move as
      placement CSS, other layers key x/y at the playhead like the drag, one undoable apply
      per burst either way.
- [x] **The wizard becomes a setup flow (2026-07-18)** - Import graphic is two steps (Start ->
      Design -> Create): the template creates BARE and lands in the editor with the Data tab
      revealed; the wizard's Text/Style/Animation steps are gone from the flow. Fields come
      from the Data tab (the placed add), placement from the canvas + the Inspector Style
      tab's numeric X/Y, and a selected placed field is styled in the Inspector's new Style
      tab (font incl. shipped @font-face, size, weight, color, anchor, line-height, tracking;
      slot box for image fields) - deterministic patches of the field's own rules
      (blocks/designLayout.ts lineTextStyle/setLineTextStyle), undoable, live in preview and
      export. Whole-unit and per-layer motion both live in the Inspector's Animations tab.
      Follow-up (same day): the Style tab opens with CONTENT rows (field label via
      setFieldTitle + shown text via the inline-edit pattern), and an imported design
      declares no --type-scale, so the Style panel's global Text-size knob (keyed on the
      var's presence) no longer appears as a dead control there.
- [x] **Long values stay inside the design (fit)** - a placed line was uncapped and nowrap, so
      a long name ran off the artwork and off the frame. A line now has a SLOT (the wrapper's
      max-width) and a fit mode: shrink (one row, condensed to fit - the default for a new
      field, and what broadcast CG does with a name in a drawn slot), wrap, or free (the
      pre-fit behaviour, which is what every saved template reads as). Shrink rides a
      design-owned runtime outside the marked region (templates/shared/textFit.ts) that the
      shared update() calls through an optional hook, injected idempotently; it reduces
      font-size rather than distorting the user's typeface, floors at 55%, and re-measures on
      document.fonts.ready so it never fits against the fallback face. Inspector Style tab
      group + E2E for all three modes.

### State machines in the graphic model (2026-07-19 — Phase 1 of the template-library stage)

The stage this opens (types × themes catalog, node editor, generated control pages) is planned
in `docs/noacg-master-goals.md`; the model itself is contracted in `docs/STATE_MACHINE_SCHEMA.md`.

- [x] **The model exists in the code** - `NOACG_ANIM` format version 2 adds an optional
      `machine`: parallel state GROUPS, each a small graph of states (a state's content is a
      timeline) joined by transitions fired by operator events or timers, plus the DEFAULT PATH
      that `next` walks. One data block, in the marked ANIMATION region - no second scene model.
- [x] **The multi-step reveal feature was ABSORBED, not duplicated** - `steps` IS the default
      path (`defaultPath[i]`'s timeline is `steps[i]`, the positional binding), so every existing
      timeline surface keeps working and `settings.steps` stays derived, now through one rule
      (`animMachine.ts spxSteps`).
- [x] **Existing templates are untouched and behave identically** - a template with no `machine`
      key IS the implicit one-group linear machine, derived on read and never persisted; the
      version-1 interpreter statements are kept verbatim as the machine-less path. The whole
      catalog gained dispatch / snap / introspection without one template file changing.
- [x] **Format-version + migration mechanism** - a normalizing parse migrates version 1 on read,
      serialization always writes the current version, an unknown version degrades read-only.
      Promoted to a root non-negotiable, so every persisted format follows it.
- [x] **Snap-to-state works in preview** - `noacgSnap` composes a state's pose instantly with
      suppressed callbacks (recovery, emergency jumps, preview without playback); `snap(null)` is
      the visual half of reset, kept distinct from resetting data. Store `sendSnap`/`sendEvent`
      drive it; the simulator grows a minimal event strip for explicit-machine templates only.
- [x] **The five acceptance criteria pass** against hand-written definitions
      (`e2e/state-machine.spec.ts` + `e2e/_machines.ts`): the simplicity guard (a lower third is
      three states, drivable with `next` alone), the Millionaire test (selection is DATA on one
      state; after Lock, select is structurally illegal), the scorebug test (parallel groups,
      simultaneous events through one serial queue), the ticker test (timer auto-advance,
      pause/resume, and a settled preview that never advances), and the compatibility test
      (`update`/`play`/`next`/`stop` alone walk the default path). Zero export-target changes.

### Graphic types (2026-07-20 — Phase 2 of the template-library stage)

Contract: `docs/GRAPHIC_TYPES.md`. Types chosen by frequency across the 60 formats in
`live_format_graphics_needs.xlsx` (measured, not estimated).

- [x] **A type is first-class** - it declares structure, fields, state groups + default path,
      and control events, with no mention of colour, type or shape. That separation is what
      Phase 3 (types × themes), Phase 4 (one editor per type) and Phase 5 (control pages
      generated from the machine) all need.
- [x] **Types compile into variants, not around them** - `variant.create(options)` stays the
      one contract; `mergeCatalog` replaces by id, so a promoted design keeps its identity and
      its slot. Pinned by a spec asserting promotion changes nothing but the machine.
- [x] **Persist a machine only when the derived one is wrong** - 7 of the 12 types declare
      none and emit byte-identical output.
- [x] **Twelve types**: lower third (52/60), sponsor bug (37), countdown (30), topic card (29),
      title card (23), agenda (22), social handle (17), poll (13), holding screen (9), ticker
      (8), scoreboard (5), quiz board. Title card replaced the quote card (6/60) on the doc's
      own frequency criterion; the social bug and the ticker rotator are new designs.
- [x] **The acceptance criteria are met by SHIPPED types**, not only fixtures: the quiz board
      for the Millionaire arc (one Selected state + a data field; lock removes the arrow rather
      than refusing the event), the scoreboard for parallel groups and simultaneous events, the
      ticker for timer auto-advance with pause/resume, every type for SPX compatibility.
- [x] **Phase 1's debt paid**: the step editor works under a machine (steps and waypoints move
      together; a waypoint an authored branch points at is demoted, not orphaned), plus four
      real bugs - two silently-dead affordances, a rename that drifted from state ids, OGraf's
      step pointer desyncing, and an off-shape machine that only warned and shipped.
- [x] **A trap encoded as a rule**: a timer never arms on a timeline that never ends, so a
      timer state carrying endless loops or measured motion is now a validation error. This is
      why the ticker type is a rotator with its own finishing entrance preset.

### The template factory — types × themes (2026-07-21 — Phase 3 of the template-library stage)

Contract: `docs/GRAPHIC_TYPES.md`. The catalog is types × style families, and the second axis is
now full: every one of the 12 types ships in all four families (noacg / glass / sport / minimal).

- [x] **The 48-cell matrix is complete** - 12 types × 4 style families, every cell filled. The
      naive "24 promotable" estimate from the first pass fully collapsed: after promoting the one
      design that survived all six gates (lt05 into the sport lower third), the promotion well was
      dry, so the remaining cells are DESIGNED variants, each named against its lower-third sibling
      and reusing its family's shape tokens (DESIGN_LANGUAGE §8). 30 new designs across every
      category, from corner bugs to the flagship quiz board.
- [x] **The capabilities gate became mechanical, and caught a shipped defect** - promotion took
      its type's `animationPresets`, `defaultZone`, palette and font wholesale, so six promoted
      designs had drifted their DEFAULT entrance and four had lost presets outright (the house bug
      opened on a plain fade, the stats card lost its signature stinger, a minimal scoreboard
      defaulted to a sport slam). Invisible to every check because `create({})` resolves the preset
      from the design's own record - a baseline taken from OUTPUT cannot see a gate that only
      changes INPUT. `TypeDesign.animationPresets` / `defaultZone` are the escape hatch (mirroring
      `samples`), and `graphic-types.spec.ts` now enforces it: a type may WIDEN what a design
      offers but never change its default or take something away.
- [x] **"Persist a machine only when the derived one is wrong" held across the fill** - the new
      lower thirds, cards, bugs and boards emit no machine key; only the countdowns, holding
      screen, scoreboards, tickers and quiz boards carry one, and each drives the parallel or
      branch machine its type already declared with zero new machine code.
- [x] **Shared content runtimes, not copy-paste** - the schedule-row and poll-bar rebuilds were
      identical across every board of a type, so they moved into `infographics/dataRuntimes.ts`;
      ig06 and ig02 now call the shared helpers and emit byte-for-byte what they did before (the
      baseline did not move), and the six new boards reuse them.
- [x] **Every fill is verified** - `npm run build`, the type conformance suite, the machine
      tests (countdown clock, scorebug, ticker cycle, Millionaire arc), the `l3-sweep` for swept
      categories, a render probe for the rest, and both catalog baselines recorded as pure
      additions. A documented non-promotion (the sport agenda's standings-vs-schedule ambiguity)
      stays recorded where the next reader looks.
- [x] **The batch loop is a run-anytime gate** - `node scripts/factory.mjs` (dev server up)
      derives the matrix from the live registry, runs every design through the six gates,
      validates the pack config, and greps every variant's emitted CSS for literal forms of
      family-valued tokens (the conformance metric's blind spot); any failure exits non-zero,
      so it sits in CI beside `npm run build`.
- [x] **The gates run without a human** - the commit-driven gates (build + offline E2E + the
      factory gates) joined `.github/workflows/ci.yml` on every push and PR, and the
      time-driven check (dependency audit + staleness) runs weekly
      (`.github/workflows/weekly-audit.yml`, Monday cron, rolling failure issue). Job A of
      docs/NIGHTLY_AUTOMATION_PLAN.md, split by what actually drifts; the AI generation
      pipeline (jobs B/C) stays a plan behind its own decisions.
- [x] **Every reference format has its pack** - the 60 live-program formats map onto 12 packs
      (`docs/PACK_TAXONOMY.md`; config in `src/templates/packs.ts`). A pack is PURE CONFIG over
      the filled matrix - one entry, no new template work - which is the "catalog growth is a
      config change" claim made true for the axis it is true on; a new THEME is deliberately
      not config (twelve designs + a token row), and the doc records what one costs.

### The node editor (2026-07-21 — Phase 4 of the template-library stage)

The visual state-machine editor beneath the canvas (`src/components/timeline/MachineGraph.tsx`): one
generic graph surface for every graphic — what differs between templates is the graph inside
it, never the editor. Optimized for inspect-and-tweak first, authoring-from-blank second.

- [x] **The graph surface toggles with the step timeline** (Rive-style, in the bottom dock):
      states as boxes badged with the timeline's cue vocabulary (▶ » ■ · ○ rest), the default
      path as the amber spine (the walk `play`/`next`/`stop` really follow, with the edge into
      the final waypoint honestly dashed as stop's when no next arrow is authored), authored
      branches as labelled arrows, parallel groups as lanes, and the preview's LIVE state
      highlighted. Clicking a state snaps the preview there — parked, no timers.
- [x] **A machine-less template shows its DERIVED machine**, labelled "derived from the
      steps", and the first graph edit MATERIALIZES exactly that machine into the literal
      inside the same undoable apply — so the editor is never empty, never lies, and never
      forks a second model.
- [x] **Inspect-and-tweak cards** — a state's card renames it (a path state through
      `renameStep`, so the bound step label can never fork) and opens its timeline parked at
      its step; a transition's card switches trigger, renames its event, sets a timer delay —
      every commit one undoable apply through the shape gate, so an illegal edit (reserved or
      duplicate event, non-positive delay) reverts in place.
- [x] **Structural editing** — drag from a state's port to draw a real operator arrow
      (selected for immediate renaming); delete an arrow from its card, refused only when it
      is the sole edge behind a default-path step (the walk must stay connected — judged by
      the validator, so deleting one of two parallel arrows stays legal); add and delete
      branch states and parallel groups; drag boxes to positions persisted as the additive
      `at` field (no format bump). Waypoints stay the TIMELINE's to add and delete — the
      positional binding means the state and its clip are one thing.
- [x] **Transition styles are consumed, not reserved** — an arrow may carry `fade`,
      `push-left/right/up/down` or `wipe-left/right` with duration and ease, played by the
      interpreter INSTEAD of the target state's entry timeline: two phases on the root around
      an instant pose swap composed by the SNAP recipe, so a styled entry and a snap agree on
      every pose (including pose-only branch states, whose look lives on the route). The
      frozen-interpreter pairing rule extends to styles: `writeAnimData` re-emits the region
      under a pre-styles interpreter, and validation blocks a hand-spliced mismatch at export.
- [x] **Break fearlessly** — the topbar ↺ Reset (the create-time `baseline` snapshot,
      persisted with the project) restores the shipped template after any machine surgery,
      undoably; pinned by the acceptance spec.
- [x] **The acceptance walk passes as a spec** (`e2e/machine-graph.spec.ts`, 9 tests): open a
      shipped template, see its graph, restyle a transition, draw and delete arrows, add
      states and groups, break something, restore the shipped state — plus the styled-change
      pose landing and the pairing rule, driven end-to-end.

### Control layer & profiles (2026-07-21 — Phase 5 of the template-library stage)

Contract: `docs/CONTROL_LAYER.md`. Control pages GENERATED from the state machine — every
operator transition a button, every field an input, from one generator; the existing basic
control-page export absorbed, not duplicated.

- [x] **Event buttons from the machine** — the additive `machine.controls` metadata (declared
      on graphic types as TypeControlEvent, logical payload keys resolved to field ids at
      attach) travels INSIDE the template; `machineControls` is the one merge all four
      surfaces render (Control tab, controlpanel.html, the hosted page, the simulator strip).
      Legality = the structural guard mirrored as greying. `ControlMessage` grew event/snap
      cues, forwarded by all three receivers to `noacgDispatch`/`noacgSnap`.
- [x] **Shows** — the rundown unit (`model/shows.ts`, packet conventions, sync kind 'show'):
      ordered graphics, one aggregated `show_controlpanel.html` per export, each card on its
      own channel driving its graphic independently. A single graphic is a show of one.
- [x] **Prepared vs published** — with Live off, edits are STAGED (badge) and air only on an
      explicit ⟳ Take or riding an event's payload; nothing airs merely because it was typed.
- [x] **The event log + recovery** — the standalone panel logs every command per channel
      (capped history + merged latest data + last reported state); a rebooted graphic
      announces itself and is rebuilt (data half, then snap — reset is two operations,
      recovery is both), a reloaded panel resumes from the log. Pinned end-to-end in
      `e2e/control.spec.ts`.
- [x] **Hosted control over a durable command log** (migration 0008) — the INSERT is the
      send: control_events (DB-ordered, Realtime-delivered, tail-fillable), control_shows
      (capability slug, panel spec, SHARED staging, each graphic's own live report).
      Operating needs no account (SECURITY DEFINER RPCs; the slug is the capability); the
      hosted receiver block rebuilds a rebooted graphic from its own last report. The
      ?control=<slug> page is multi-operator by construction. Live paths await verification
      against a real project (checklist in docs/CONTROL_LAYER.md).
- [x] **Profiles** — the homebase is the one place: graphics across packets, video projects,
      shows with hosted-page links, community submissions; sync kinds grew 'show' and
      'video' (video tombstones strip payloads to readable stubs).

### Editorial and cinematic information systems (2026-07-30)

- [x] **Editorial is a usable information system** - lt25 Masthead now has exact-token siblings
      for session and segment titles, topic and coming-up, fact-check, explainer, news ticker,
      breaking strap, public notice, source attribution, agenda/results, sponsor reads and
      prepared captions. Printed rules, hierarchy, flat surfaces and whitespace remain the
      family grammar across every shape.
- [x] **Cinematic is a usable information system** - lt32 Scrim, lt34 Title Strap and lt35
      Letterbox now have exact-token siblings for chapter titles, now-playing, documentary
      quotes, locations, prepared captions or lyrics and restrained alerts. Soft scrims, light
      wide type, 1 px hairlines and sine-led motion remain the family grammar.
- [x] **Types stay semantic** - existing title, now/next, headline, notice, statement, ticker and
      alert types compile the matching designs. Agenda/results, sponsor, location, source and
      prepared-caption shapes remain hand-authored because their one-off field contracts do not
      justify a new state flow or reusable type.
- [x] **Catalog quality is gated** - the factory and taxonomy matrix, affected category sweeps,
      type floor, overflow baseline, capacity bench and reviewed contact sheets cover the
      information-system packages as coherent families.

### Cloud playout — the Browser Output platform (2026-08-02, binding: docs/CLOUD_PLAYOUT.md)

The year-long direction: from a graphic-creation tool to a browser-based broadcast graphics
PLATFORM (the Singular.live-class workflow), while every offline/portable export stays
first-class. Stages are direction, not a calendar; each is independently shippable.

- [x] **Stage 1 — Browser Output MVP**: Productions as a top-level area
      (cue rundown over the Show record), ONE persistent transparent output URL
      (`/output?production=<slug>`, a 4th MPA entry) loadable in CasparCG/OBS/vMix, the
      operator workflow (local preview / Take / Update / Next / Out, live status, staged
      edits) on the production page and the phone-capable hosted control page — all over the
      EXISTING hosted-control log (0008; migration 0029 adds the output capability, pinned
      publish payload, cue status rows, log pruning). Preview and program are structurally
      separate; reconnect restores on-air state (data half, then snap).
      **Verified 2026-08-03** against production, per `docs/CLOUD_PLAYOUT.md` §8: playout in
      OBS and in CasparCG 2.3.2; the hosted control page on a phone; two operators agreeing
      on the live chip; Take / Update (no replay) / Next / the reveal event / Out; refresh,
      and kill-and-reopen with commands taken while the renderer was gone. Verification is
      what found the three faults it also cost: the renderer resumed from the log HEAD and
      dropped every command issued while it was down (fixed with the per-graphic recovery
      baseline, migration 0033); the recovered commands then REPLAYED on air instead of
      arriving settled (fixed by hiding the stage for the boot pass); and snap's reset wiped
      the inline style that hides an empty image field, so any design with a logo slot
      recovered with a broken-image box (fixed in the emitted runtime, the canvas reset and
      the receivers, gated by `e2e/snap-recovery.spec.ts`). Those last two shipped after the
      hardware session, so they are proven by the suite and by a reproduction, not yet by a
      second run in CasparCG. Two checklist items stay open and need the owner: a CasparCG
      channel restart (§8.7) and unpublish/re-publish (§8.8).
- [ ] **Stage 2 — Production workflow + reliability**: published/draft versions + rollback,
      renderer health surfaced properly (multi-renderer awareness), operator access + sharing,
      per-caller rate caps, the `control_events` anon-read narrowing (needs a v2 receiver
      generation + deprecation window).
  - [x] **Multiple layers, z-order over the per-graphic instances** — every pool graphic is a
        layer holding its OWN on-air cue, so a bug, a lower third and a ticker are up together
        and Take no longer stops whatever was live before it. The log was already per-layer
        (a cue status row has always carried its graphic); what changed is the row snapshot
        (migration `0034`, `live_cue` becomes a per-graphic map, migrating format 1 on read
        and on write), the verbs (Update/Next/Out address the selected cue's layer; **All out**
        is the new clear-the-frame verb), both operator surfaces, and the production page's
        layer stack — the pool listed front to back with ↑/↓ reordering, which the stage now
        states as an explicit `z-index` instead of relying on append order.
        Covered offline by `e2e/productions.spec.ts`; the wire half is §8.4/§8.4b of
        `docs/CLOUD_PLAYOUT.md` and **migration 0034 is not yet applied to production**.
  - [x] **Rehearse vs Show** (`docs/CLOUD_PLAYOUT.md` §4a) — the operator workflow with the wire
        taken away: the verbs drive a LOCAL copy of the production's own output (the same
        `createOutputStage` over `buildOutputPayload` the `/output` page is built from), so a
        rundown can be practised, and layering checked, without airing anything. Each verb is
        defined once as the commands it IS, and the surface either sends them or applies them —
        rehearsing and airing cannot drift. The mode is the operator's own and always opt-in
        (three honest states: NOT PUBLISHED / SHOW / REHEARSE), and rehearsal keeps its own live
        map so it can never report anything about the real output. It touches no backend, which
        makes it the one part of §4 the offline suite drives end to end.
  - [x] **SPX/CasparCG integration docs** — `docs/PLAYOUT_INTEGRATION.md`, written for the
        person configuring the playout machine rather than for this codebase. Picks between the
        three output routes, then CasparCG / OBS / vMix / SPX setup, a symptom-first
        troubleshooting table, and a section saying exactly what has been proven on real
        hardware and what has not. The CasparCG CEF constraint stops being a maintainer note:
        2.3.x carries the pre-Chromium-80 engine that killed our first build silently, **2.4.0
        ships CEF 117 and 2.5.0 ships CEF 142** (CasparCG changelog), so the guide can tell an
        operator whether it affects them at all.
  - [x] **The action log** (`docs/CLOUD_PLAYOUT.md` §4b) — the command log has always recorded
        everything, and nothing ever showed it to the person driving the show. The production
        page's Activity panel reads it back as operator language, newest first, naming cues by
        the label someone wrote rather than by id. It shows COMMANDS and drops the two meta
        rows (`staged` is typing, `live` is the renderer reporting — both have their own
        surfaces, and together they make the feed unreadable). Rehearsal keeps its own log
        through the same `describeLogRow`, which is what makes the panel provable offline.
        **No migration:** `control_tail` has returned `created_at` since 0008 and a Realtime
        payload carries the whole row, so real timestamps needed only a widened type.
- [ ] **Stage 3 — the NoaCG Data Hub**: server-side connectors writing `update` rows into
      the SAME command log (one ingress, renderer stays dumb), normalized field schemas +
      visual mapping, credentials server-side only, caching + freshness + last-known-good,
      manual override/freeze as connector gates. First experiments: a published-CSV sheet
      driving a ticker; one real stock-data provider through the backend.
- [ ] **Stage 4 — professional automation**: real-time streams, sports/timing providers, the
      local NoaCG Bridge (venue networks), public API/SDK, Companion/Stream Deck, webhooks,
      synchronized redundant renderers + failover, data replay/simulation.

### Student release - wizard to live broadcast (2026-08, current push)

Everything in this release serves ONE north star: **a first-time student can choose or create a
supported graphic, customize it without the editor or AI, prepare and manage cues in a
Production, export or publish it, and reliably operate it live in CasparCG or OBS.**

Postponed until after this release: Google Fonts import, the dedicated preview channel, all AI
work (AI later assists with selecting and configuring SUPPORTED fields - it is never the system
responsible for making layouts valid), and Home polish beyond step 8. Accepted limitations
(decided 2026-08-04): post-save design restyling waits for a later improvement - recreate
through the wizard or use Advanced mode; cloud publish requires an account (export does not).

- [x] **1. Scope locked + guidance simplified** - this north star in GOALS.md and AGENTS.md;
      one goal, one plan, one roadmap.
- [x] **2. Fast critical-path test loop** - the student-critical focus suite
      (`npm run test:e2e:focus`, or its `:queued` form when another worktree is running one)
      is the per-change gate; the full suite stays the nightly safety net, its verdict
      separating focus failures from paused drift.
- [x] **3. Packages removed** - Production is the only workflow; kits create productions
      (pool + one seeded cue per graphic + the kit's look captured onto the record).
      (Audit 2026-08-04: the only server packet rows were the owner's four empty v2 folder
      shells - nothing to migrate; old rows stay inert, never destroyed.)
- [x] **4. Editor behind Advanced mode; full-screen wizard** - default UI shows no editor
      doors (graphic Open lands on its control page); `#/home` is the returning default and
      the wizard the first-visit one; the wizard is one full-screen App-level surface.
- [x] **5. Deterministic customization + declared field expansion** - every template declares
      the fields it supports (lines / fixed contract / repeatable list via fieldPlanOf) and
      the wizard offers exactly that; every design color editable (palette roles + the
      generic :root enumeration); the shared searchable FontPicker over seventeen bundled
      OFL faces with upload + local fonts; dead definition-only adds refused with the
      reason. (Left for later: optionalSlots declarations beyond the logo, and the editor
      Style panel adopting the shared picker.)
- [x] **6. Wizard → Production → publish → output, complete** - the Finish step's production
      door (save → pool → seeded cue → look → the production page), skip-to-finish, the
      production-context wizard open, the rundown workflow validated (cue lifecycle, the
      clarity heading naming cue/graphic/draft-vs-LIVE, the verb glossary in
      docs/CONTROL_LAYER.md), production-persistence specs (reopen, refresh, slug survival,
      the republish hint), and the walk measured: fresh visit → named production with a
      seeded cue in ~1 second of machine time. (The publish/output wire half stays on the
      step-10 owner checklist - backend-gated by design.)
- [x] **7. Two coherent production-ready packs** - newsroom + talk-show, one unified look
      each, complete for their programme type. Done 2026-08-04: `TemplatePack.paletteId`
      imposes ONE palette on every kit graphic at create (newsroom = ivory, talk-show =
      frost; a pack without one keeps design defaults, which the esports Volt kit relies
      on), extras recurated in-family (measured before: newsroom 4/32 off-family across
      four palettes, talk-show 3/24 across four), and a duplicate the name-keyed pool
      would have silently merged removed. Coherence pinned in e2e/wizard-kit.spec.ts.
      Catalog defaults untouched - no baseline re-record needed.
- [x] **8. Home simplified around Productions** - productions first, dashboards one click,
      professional aligned grid, phone reaches a control dashboard in two taps. Done
      2026-08-04: `#/home` is a DASHBOARD (productions with Open-dashboard + output-URL copy
      first, then top graphics + search, then videos); nav = Productions / Graphics / Videos /
      Brand looks (Recent + Control-panels retired - the dashboard covers recent, and every
      graphic row reaches its control panel via its ⋯ menu). Rows are the uniform `.lib-row`
      grid (fixed 168x95 letterboxed thumbs) with THREE actions - Open, "+ Production"
      popover, ⋯ overflow (control panel / export / rename / duplicate / publish / two-step
      delete); icons are inline SVG (components/icons.tsx), no pictographic emoji. The
      editor's Productions block slimmed to add-current + link. Phone: chip nav, two-row
      library rows, 44px targets, two taps to a dashboard (pinned in layout.spec.ts).
- [x] **9. Account essentials** - password reset and change, account email, sign out,
      session-expiry recovery that never loses local work. Done 2026-08-04: the sign-in
      dialog's "Forgot your password?" sends the reset email; the link's return trip is the
      new PasswordRecoveryDialog (mounted once in App.tsx - PASSWORD_RECOVERY was previously
      ignored); Settings grew an Account section (email, password change, sign out; renders
      nothing offline); and a session that DIES - a signed-out transition that was not the
      user's own Sign out - dispatches `spx-session-expired`, answered with the sign-in
      prompt naming that local work is safe. Offline pins in e2e/auth.spec.ts; the real
      flows (incl. the password round-trip and expiry recovery without data loss) in
      e2e/configured/account.spec.ts, which runs on the live suite.
- [ ] **10. Playout hardening + owner acceptance** - automated recovery drills, soak and
      exported-file checks first; then the owner's real CasparCG/OBS acceptance and a timed
      first-time-user walk. CasparCG + OBS are the primary verification targets; every export
      target stays supported. THE AGENT HALF IS DONE (2026-08-04): the storage-full drill
      (e2e/playout-drills.spec.ts - loud failure, last good copy intact, recovery), the
      dangling-reference walk over all six export targets (e2e/exports.spec.ts), and the
      consolidated owner checklist at **docs/STUDENT_RELEASE_ACCEPTANCE.md**, which names
      what the suites already pin so nothing is re-tested by hand. ROUND 1 (owner, 2026-08-04)
      FAILED the export door and its findings are FIXED (2026-08-05, all pinned by specs):
      the published-package hosted-receiver boot snap ("flashes in then disappears" on real
      CasparCG/SPX), index.html naming, the shared playlayer 7, the dishonest file://
      control panel - plus the follow-up program that round demanded: the production export
      target picker (all six flavors), the bundled LOCAL RELAY + double-click launchers
      (offline panel-to-OBS control), and the exported PRODUCTION CONTROLLER with the
      preview/program workflow. ROUND 2 (owner, 2026-08-05): the CasparCG production package
      PASSED on the real server; two things around it did not, both FIXED the same day - the
      on-air guide named a "Start controller.cmd" the SPX/CasparCG flavors deliberately do not
      bundle (it now describes only what the caller actually shipped, and says what does steer
      each flavor), and no package said which field id was which, so every package now carries
      FIELDS.md (ids, types, defaults, paste-ready JSON + CasparCG componentData; a production's
      root file indexes every graphic by its playout layer). REMAINING (owner, real hardware + backend): the checklist's
      §1-§6 RE-TEST against a build carrying those fixes - CasparCG 2.3.x + OBS through both
      doors (incl. the launcher + controller path), the soak, the live recovery drills, one
      live-suite run, and the timed walks.
      **What the re-test now targets (2026-08-06):** the interactive-playout program's Phases
      1-4 have LANDED on `main` (docs/INTERACTIVE_PLAYOUT_PLAN.md), so the ProductionPage the
      owner will sit in front of is the one carrying the per-cue contextual controls, the
      shared data foundation, the quiz pilot and the generic sports pilot - not the surface
      round 2 was run against. That is deliberate: waiting for the verdict before landing
      would have held four finished phases behind one hardware session, and the checklist's
      §1-§6 exercise the export and playout doors, which those phases do not change. It does
      mean the re-test now doubles as the first real-hardware sighting of the contextual
      controls, so run it against a production whose rundown includes a scorebug cue.
      **THE HARDWARE HALF IS CLOSED (owner, 2026-08-19)**, on the school's CasparCG machine:
      *"The hardware is working, everything is working, and playout is working, so that is not a
      concern."* Everything above about a CasparCG/OBS re-test is therefore HISTORY, not owed
      work; what is still owed of step 10 is the people half - the soak, one live-suite run, and
      the timed first-time-user walks - and that is what `GOALS.md` now carries. The same session
      set the product's direction: the WEB playout control panel is the surface under investment,
      with downloadable templates kept but not grown (GOALS.md, "The surface under investment").

- [x] **A wizard-only student cannot send feedback.** The beta Feedback button lives in the editor
      shell, which is Advanced mode now - so the people the release is FOR have no door to it,
      while feedback is what feeds the Lite prompt. Found while repairing the live suite; the fix
      is a surface decision (Home? the production page? the wizard's Finish step?), not a bug fix.
      DONE: the door was opened on BOTH surfaces a wizard-only student actually stands on - Home's
      topbar (`area="home"`, 2026-08-09) and the wizard's Finish step (`area="wizard"`,
      2026-08-10). Both render nothing offline, and with a wizard open over a shell two buttons
      are in the document at once, which is why each one names itself through `data-area`
      (`src/components/feedback/BetaFeedback.tsx`). Pinned by e2e/feedback.spec.ts offline (the
      whole surface absent) and e2e/configured/feedback.spec.ts on the live suite, which drives
      the wizard door end to end.

- [x] **Google Fonts import** - moved here verbatim from GOALS.md's parking lot on 2026-08-16,
      where it had stood as "Google Fonts import, the dedicated preview channel, Home polish -
      postponed by the student release, still wanted." Only this clause shipped; the other two
      stay in the parking lot.
      `src/model/googleFonts.ts` adds the ~1,900 Google families to the shared FontPicker,
      searched by name and **downloaded at DESIGN time into `template.assets` exactly like an
      upload** - so the emitted template still references only `fonts/<file>` and an export
      still plays out with no network. Nothing about a fetched face is special downstream, which
      is the point. The index (`src/model/googleFontsIndex.ts`, regenerated by
      `scripts/build-google-fonts-index.mjs`) is NAMES ONLY and dynamically imported; a family it
      does not carry is still asked for by name and Google's own 404 is what refuses it, so the
      snapshot never becomes the limit. The panel states that a download makes the browser's IP
      visible to Google before anything is fetched. Pinned by `e2e/google-fonts.spec.ts`
      (Google stubbed, as the AI routes are).

### Kits, not one graphic at a time (2026-08-08 — the catalog half)

- [x] **Catalog kits from the wizard.** ONE door. The separate "Start from a kit" Entry card is
      gone; the Browse step opens with a **ONE GRAPHIC / A WHOLE KIT** segmented control, and
      choosing the kit swaps the step's body for a picker: start from a genre preset (the
      PACKS - newsroom, match day, esports, classroom, church, …), then EDIT the set with
      checkboxes over the pack's contents plus every other graphic type whose (type × family)
      cell actually resolves. Nothing that would throw on Create is ever offered, and the count
      on screen is the count that gets built.
      The set then walks the SAME six wizard steps a single graphic does, with a **kit tray**
      above the form column tracking which graphic is current (the second axis of progress; the
      step rail is the first). After the first graphic - the one that sets the tone - one
      question: *use this look for the other N?* Yes is a deterministic transform over the
      `:root` style contract and nothing else (palette, declared-variable overrides, typeface,
      both size knobs, motion where the target design declares the preset); no is a walk through
      each remaining graphic. It ends on a Finish that names a PRODUCTION, shows a thumbnail
      grid of everything built, and saves the whole set before either door - open the
      production, or export the kit as one package. The editor is never involved.
      **Why the reversal** (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18 had ratified the separate
      card on 2026-07-23, built 2026-07-29): a front-page card has to be understood before it
      is pressed, so only someone who already knew the word "kit" ever found the set, and
      correcting a wrong guess meant walking back to Entry. The old card also could not
      customize a kit's graphics at all - it created the pack and landed on the production.
      Surfaces: `wizard/steps/KitPicker.tsx`, `wizard/KitTray.tsx`, `wizard/steps/KitLookStep.tsx`,
      `wizard/steps/KitFinishStep.tsx`, `wizard/kitPlan.ts`, `templates/kit.ts` `kitChoices`.
      Pinned by `e2e/wizard-kit.spec.ts`.
      Found while walking it: `ALL_PRESETS` spread six preset families TWICE, so every starting
      soon / game timer / infographic / versus / quiz / imported-design variant offered each of
      its presets as two identical cards in the wizard. Fixed, and `e2e/anim-engine.spec.ts`
      now fails on a repeated preset id.

### Quality bar (always-on)
- [x] `npm run build` green as the CI gate
- [x] Playwright E2E for core UI flows
- [x] Every new user-facing flow ships with a Playwright spec (wizard suite: 9 specs; package
      suite: 6 specs — custom colors, font import + export, brand match, one create+play spec
      per new category, ticker loop sanity; wave-2 suite: 6 specs — clock ticks, score update,
      corner bug, count-up, quiz reveal)
- [x] Lower thirds ship with a harness sweep (`scripts/l3-sweep.mjs <shots-dir> <category>`:
      validate + runtime × preset × easing + auto-fit/track checks + taste screenshots);
      category-aware — run for every category (`lower-third`, `info-card`, `end-credits`,
      `ticker`)

---

## The student release (closed 2026-08-22)

> Moved here verbatim from `GOALS.md` when the owner closed it: *"I have tried the hardware, and
> we have a player system that we can use. So that goal is now reached."* Steps 1-9 shipped
> 2026-08-04/05 and are logged under Milestones above; step 10 - playout hardening and owner
> acceptance - is closed by that verdict, and the deadline it carried (students live by
> 2026-08-21) is met. Step 11 and the dashboard investment note travel with it because they were
> written as part of this push; both continue as live work under the goal that replaced it.

## NOW - students live in two weeks

### Student release - wizard to live broadcast

*Steps 1-9 shipped 2026-08-04/05; the full text of each is in the archive. Step numbering is cited
from ~80 places in the tree, so it never changes.*

- [x] **1.** Scope locked, one goal and one roadmap - **2.** the student-critical focus suite as
      the per-change gate - **3.** packages removed, Production is the only grouping - **4.**
      editor behind Advanced mode, full-screen wizard - **5.** deterministic customization with
      declared field expansion - **6.** wizard → production → publish → output, complete - **7.**
      two coherent production-ready packs (newsroom, talk-show) - **8.** Home simplified around
      Productions - **9.** account essentials (reset, change, sign out, expiry recovery).
- [ ] **10. Playout hardening + owner acceptance.** History in the archive; what stands today:
      **the HARDWARE half is CLOSED, by the owner, on the school's CasparCG machine (2026-08-19)**
      - *"The hardware is working, everything is working, and playout is working, so that is not a
      concern."* Do not plan a night around re-proving CasparCG playout, and do not read the
      archived "remaining, owner + real hardware" paragraph as owed work.
      **Remaining is the PEOPLE half of `docs/STUDENT_RELEASE_ACCEPTANCE.md`:** the soak, one
      live-suite run against the real project, and the timed first-time-user walks.
- [ ] **11. What the storefront SHOWS FIRST, per category.** Owner, 2026-08-21, comparing two
      shelves in one sitting: the Statistics & data result is eight genuinely different offers and
      reads as a catalog - *"the graphics look different… you have options to choose from actually
      and not just slight modifications of one graphic"* - while *"we have that problem with the
      lower thirds right now that when you open it up all the graphics there look the same."*
      Browse renders a PAGE of twelve, not the catalog, so for most people the first twelve ARE
      the category; a category whose first twelve are variations of one design reads as a catalog
      with one design in it. This is curation and default ordering, not a request for more
      designs. Related and separable: **ig01 "Big Stat" is filed as a `stat-panel` and is a `kpi`**
      (a one-line `src/templates/meta.ts` re-file plus the catalog baselines it moves) - it is the
      one card the owner said *"does pop out"* of that otherwise coherent shelf. Detail and quotes:
      `docs/CATALOG_VARIETY.md` §7.
      **MEASURED 2026-08-21, and the obvious fix is ruled out.** `catalog-sameness.mjs` now
      reports the first page per category through the real browse engine. It scores the
      lower-thirds page at **11 distinct looks out of 12** - as varied as every other shelf - so
      RE-ORDERING IS NOT THE FIX, and the sameness signature is not the thing to order by. The
      instrument is blind on the axes that decide this at card size: its fourteen axes are CSS
      decisions (radius, blur, skew, tracking), while an eye reads PALETTE and SILHOUETTE, and
      all twelve lower thirds are a dark slab with white text and an amber accent. The stats
      shelf beside it carries a giant percentage, a lime table, a red dial and a cream printed
      panel - different shapes, and light backgrounds as well as dark. **The real item is
      variety of palette and silhouette WITHIN a category**, which is design work rather than
      ordering work; the next step is an axis measured off the RENDERED card.
      `node scripts/spike-shelf-look.mjs <out-dir>` captures the shelves to compare.
      **RATIFIED BY THE OWNER 2026-08-21 - "lower thirds need real variety" - and then MEASURED
      on the right axis** (`scripts/card-look-sweep.mjs`, which reads the rendered pixels:
      backdrop, accent hue, footprint). **The ask splits, and only half of it is drawing work.**
      *Colour variety is BURIED, not absent:* the shelf carries nine accent hues and 7 light
      backdrops across 103 designs, and the first twelve are 10 dark + 10 orange. Ordering the
      first page across this axis is cheap and would show what the category already has.
      *Shape variety is genuinely ABSENT:* **99 of 103 designs are `strap/thin` - 96%** - with no
      full-width band, no tall panel, no side column, no corner block. That is the design work,
      and it cannot be ordered into existence. Numbers in `docs/CATALOG_VARIETY.md`.
      **The ordering half is BUILT** (`spreadFirstPage`, 2026-08-21): the fold spreads across
      accent hue with family breaking ties, so the lower thirds went from 2 distinct hue buckets
      to 4+ and the page now carries a cream editorial card, a glass pill, a sport slab and an
      outline box. **The drawing half is a written brief:**
      `docs/LOWER_THIRD_SHAPES_BRIEF.md`, with the six missing silhouettes named. The whole
      catalog queue - that brief, the `ig01` re-file, the unmeasured categories and the standing
      debts - is `docs/CATALOG_WORK_QUEUE.md`.

### The surface under investment: the WEB PLAYOUT CONTROL PANEL

**Owner direction, 2026-08-19:** *"I'm not going to download any templates right now. I like our
playout system; I don't want to work with the vanilla CasparCG client with these templates. I want
to use our web playout system… The downloadable templates, of course, are going to stay, but we're
going to be working on and concentrating on the online playout control panel."*

The hosted control page and the `/output` browser source are the product's PRIMARY surface, not a
cloud alternative to the export door. Export stays supported and is not where effort goes. This
goes further than the cloud-first decision below: that one settled which door the CLASS runs on,
this settles which door the PRODUCT invests in. Weigh any playout work by what it does for the web
control panel first. The binding design is `docs/PLAYOUT_DASHBOARD.md`, and the three surfaces that
render it must not drift (`docs/CONTROL_PANEL_PARITY.md`).

**Owner read of the dashboard, 2026-08-21** (`docs/acceptance/owner-pack/index.html` §2, verdicts
in `docs/PLAYOUT_DASHBOARD.md` §2). At the reported 1536×814 the monitor cap and the space beside
PROGRAM are both accepted. **At 1920×1080 they are not** - *"too much empty room at the bottom and
the monitors are unnecessarily small"* - and at 1536×560 the verb bar scrolling under the sticky
monitors is called a hazard. The next dashboard session is therefore already specified:

- [ ] **Re-lay the dashboard's vertical budget.** Move the verb bar into the empty column beside
      PROGRAM as a BREAKPOINT (below the width where it fits, it returns underneath), which spends
      the dead width, un-scrolls the buttons and frees the height the monitors need at 1080p.
      Replace the flat `26vh` monitor cap with "what is left", floored and ceilinged, so a graphic
      with many controls gets smaller monitors and a simple one gets big ones - the owner's own
      tie-breaker is *"I would rather have the controls big than the monitors too big"*. Fix the
      cap's per-cue ratio dependence in the same change: `--pd-ar` is the PREVIEWED graphic's
      ratio, so a 9:16 cue narrows both monitors today, which is the twitch the owner ruled out.
      All three surfaces, one session, with the pack's `scroll`/`hosted`/`controller` sections
      re-run as its evidence.
- [x] **The MINIMUM supported window is 1366×768** (owner, 2026-08-21). The budget school-laptop
      floor, which is the hardware the class case actually runs on. Below it the phone breakpoint
      takes over; a 560px-tall window is a resized browser rather than a screen, so it must
      degrade without breaking but is not a size anything is designed against. This is what bounds
      the verb-bar breakpoint above: the bar sits beside PROGRAM down to 1366 and returns
      underneath below it.

### Open risks for the deadline
- [ ] **Visual acceptance of the interactive playout plane.** Phases 0-6 of
      `docs/INTERACTIVE_PLAYOUT_PLAN.md` are merged - per-cue contextual controls, the shared data
      foundation, vote-to-air, presenter view, the audience join page - and **none of it has ever
      been looked at by a human**; geometry-only e2e coverage is not acceptance. A student-facing
      surface that has never been seen is the largest unmeasured risk in the release.
      **First pass done 2026-08-08, and it paid for itself immediately:** the audience link 404ed
      on production for every operator who copied it (a `vercel.json` rewrite pointing at
      `/join.html` under `cleanUrls`), and the presenter view rendered as unstyled serif text
      because the join stylesheet ships with the surface it never mounts. Both fixed, both now
      gated. **Second pass done 2026-08-08** over the rest of the plane - contextual cue controls,
      the Data workspace, vote-to-air - and it paid for itself the same way: **the first Take of a
      session aired the graphic and put it straight back off** (the boot recovery treated the
      operator's own take as a page opening onto a live production and snapped to a stale "off"),
      black PROGRAM monitor and every ⚡ action greyed, on every offline take. Every spec took a
      cue instantly, inside the window the bug needed, so the suite was green over it. Fixed and
      pinned by a spec that waits first; two shared-control defects fixed with it. The Data
      workspace's empty state - a sentence over ~950px of nothing, with its ⬇ Blank CSV button
      orphaned on a row of its own - was rebuilt 2026-08-12 around the three doors and the column
      names that would bind. **READ AND ACCEPTED BY THE OWNER 2026-08-21** from
      `docs/acceptance/owner-pack/index.html` §3 - *"I think these screens look good."* The
      release's largest unmeasured risk is measured. Four follow-ups came out of it, none of them
      a rejection: teams (below), Data/Audience opening in their own tabs, the offline `/join`
      dead end, and the fact that the shipped CSV import/template was invisible to a reader of the
      screen (`docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Acceptance pass 2026-08-08").
- [x] **Which door the class runs on: DECIDED 2026-08-08 - CLOUD FIRST, EXPORT AS THE BACKUP.**
      The class publishes and drives the persistent output URL with phone control; the export route
      (files, local relay and controller on the playout machine - the one round 2 proved on real
      hardware) is what a failing network falls back to. One consequence still owed:
      **the accounts exist before the class, not during it**. The other - rehearsing the cloud
      door on real hardware before the export door - was **done by the owner 2026-08-19** and
      closed the hardware half of step 10. Third accepted limitation, unchanged: restyling
      after save means recreating in the wizard or Advanced mode.
- [ ] **What cloud-first pulls forward.** Named here rather than discovered during the class:
      the **hosted control page is now a primary surface** (it was covered by the maintainer's live
      checklist alone, because an offline build cannot drive it) - its own copy of the first-take
      recovery defect is fixed but has never run against a real backend; the unexplained
      **"the CasparCG URL stopped working"** report from acceptance round 2 is a cloud-door report
      and the one mechanism that matched it - unpublishing deleted the row, so re-publishing minted
      a new slug for every link - is **fixed 2026-08-12 by migration 0040**, which reserves a
      production's four addresses for its lifetime and hands them back on re-publish
      (`docs/CLOUD_PLAYOUT.md` §3). **0040 is applied to production** - pushed 2026-08-12 and
      confirmed by CALLING it on 2026-08-20 (publish, unpublish, re-publish inside an aborted
      transaction: all four addresses came back identical), because a version number in the remote
      ledger alone would only say that *something* numbered 0040 ran. An unpublish no longer moves
      any URL, and nothing here is owed. **Migration 0034 was NOT the third one** - it
      has been applied all along and the parking-lot line saying otherwise was stale (see below).
      **And the live suite is now load-bearing.** Run against the real project 2026-08-08: 7 of 18
      passed, then **17 of 18 after repair, 1 flaky** (the renderer showed the aired board later
      than the spec's 30 s and passed on retry and on an isolated re-run - the one thing to watch,
      since "it did not appear" is the failure a class notices). It found one real defect: signed
      in at 1366px the topbar overflowed and hung the ACCOUNT AVATAR off the screen edge. The rest
      was rot from the student release - it only ever runs by hand, so nothing reported any of it.
      **Run it before the class, and again after any change to publish, output or the topbar.**

---


## The agent door: coding agents make NoaCG graphics (shipped 2026-08-22)

Three phases on one plan (`docs/AGENT_CLI.md` is the account, `docs/AGENT_SAVE.md` the save half):
**P1** (main `d02251e8`) the `/bridge` page, the DUAL graphic package (one folder = the SPX package +
a valid EBU OGraf v1 Graphic whose manifest carries a minimal `v_noacg`), the neutral + typeless
scaffolds, `control/ografContract.ts` (any OGraf manifest -> the control layer's own shapes), the
`noacg` CLI + MCP server and the contract-only skill; **P2** (main `00b3dc27`) `noacg save` with a
scoped agent key minted through a loopback one-time code, `/api/me/agent-keys` + `/api/me/graphics`
(the server never executes template code), the consent route, Settings -> Agent access, and the
library->air gates (an invalid graphic can no longer publish or export - ratified); **P3 part A**
the one skill generator (`cli/scripts/build-skill.mjs`, check mode in `npm run build`), the Claude
Code plugin + marketplace entry (`cli/plugin/`, root `.claude-plugin/`), the Codex manifest + skill
copy, npm `noacg` 0.2.0 ready to publish, the dual package loaded and driven in SuperFlyTV's
ograf-server (`docs/OGRAF.md`), the CLI zip walked through the Import door, a typeless graphic
reading "Custom", and the measured round's brief bank + runner. The WHY that decided every call:
let the agent design the way it works best; NoaCG is a bridge, not a second creative harness; the
skill teaches the contract, never a look, until a measured round says otherwise. **Open:** the
measured round itself (owner quota + blind read) and the publish - both live in `GOALS.md`.
**The round ran 2026-08-22 (25 cells, arms A-E, all validator-clean) and the owner's blind read
landed 2026-08-23: every graphic airable, arms visually indistinguishable, "so much better than
through the Create with AI and the API". Verdict in `benchmarks/agent/rounds/2026-08-22/VERDICT.md`:
skill stays contract-only, free authoring default, design-notes optional; "actions come from a
type" sharpened in the skill; agent-authored machines moved from hypothetical to an armed owner
gate (5/5 novel cells authored working machines).**

## Landed parts of live goals (moved 2026-08-22)

> Moved here verbatim from `GOALS.md` when it went back over its ~200-line budget. Each of these
> is the SHIPPED half of a goal whose remainder is still open: the work below is done and dated,
> the open remainder stayed in `GOALS.md`. Nothing here is direction.

### Behaviour attached to artwork somebody else drew - both cases work (2026-08-22)

*The shipped half of "NOW" step 2. What stayed in `GOALS.md`: the owner walk, still owed.*

**BOTH CASES NOW WORK, walked in a browser and pinned by `e2e/import-svg-behaviour.spec.ts`
(2026-08-22).** The SCOREBOARD needed no code: a numeric SVG layer is already a ± stepper on
every control surface, it acts on air without replaying the entrance, and it persists. The
QUIZ is a deliberate pilot: the catalog answer board's machine and buttons are reused
unchanged, and what is new is the PAINT - the designer draws each moment as its own hidden
Illustrator layer and NoaCG decides when it is visible. Binding is pickers in the Fields
step, prefilled from layer names, no code and no AI. The plan, the split of what was already
generic against what is quiz-specific, and what stays deferred until a third behaviour
exists: `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10.

### The playout dashboard, accepted as it stands (2026-08-22)

*What stayed in `GOALS.md`: the three open buttons (drop Preview, re-take, the SPACE question).*

**Owner, 2026-08-22: the dashboard is accepted as it stands** - *"looks good for right now… the
buttons on the right are totally fine."* The vertical-budget re-lay specified after the
2026-08-21 read (verb bar into the column beside PROGRAM, "what is left" instead of the flat
`26vh` monitor cap) is therefore **not current work**; it stays written down in
`docs/PLAYOUT_DASHBOARD.md` §2 for when a real window makes it hurt again.

### Why Lite and Pro were revived (owner decision, 2026-08-15)

*The argument. What stayed in `GOALS.md`: the three rules it binds - the same §2 gate re-run
unchanged, a second FAIL retires Lite for good, and the re-run is cheap.*

Lite's value gate FAILED on the owner's blind ballot on 2026-08-14, and the owner reopened it the
next day on evidence rather than appetite: every failure the ballot named was **the MARK**, and it
hit the hand-branded DIY arm too, so the defect was the platform's and not the model's - a reading
Pro's first hosted generation independently confirmed. Both platform fixes are merged (the
mark-legibility gate and the mark-size rule). **The full argument, the verdict it overturned and the
operationalized pass rule live in `docs/AI_LITE_BRAND_PLAN.md` §2/§2.1/§2.2** and are deliberately
not restated here.

**The re-run is not expensive.** `scripts/ai-lite-value-gate.mjs` builds the arms, the blind sheet
and the verdict; the 2026-08-14 Lite arm cost **$0.0069 for 8 cells** and the other two arms are
`variant.create()` and cost nothing. The expensive part is the owner's eyes.

### MXMZ, researched (2026-08-22)

*What stayed in `GOALS.md`: the one-line competitive read and the pointer to the full doc.*

**MXMZ** (mxmz.com, added 2026-08-20 - named by Yle as the working model) - Dutch cloud
broadcast-graphics SaaS out of Banijay/Southfields: design in Illustrator/Figma/Canva, import
the SVG with **every layer auto-exposed** for animation and JSON data binding, browser timeline,
operator playout with newsroom/sports-data integrations; 200+ channels, from ~$3k/yr. They prove
the "your own SVG, playable" workflow at broadcast scale, so our SVG import has to match it
(layers auto-exposed, no renaming ritual) - and beat it on what they lock away: free-forever,
self-host, export the files anywhere, a catalog and AI they don't have. **Researched properly
2026-08-22: `docs/COMPETITOR_MXMZ.md`.** The headline: nothing public shows them authoring LOGIC
at all - they train the designer for a day on a keyframe timeline, keep the OPERATOR as the
non-technical one, and hand-build a control panel per sport. Attachable behaviours are the gap
their architecture has no place to put.

## Landed parts of live goals (moved 2026-08-30)

> Moved here verbatim from `GOALS.md` in the weekly coherence pass, under the same rule as the
> 2026-08-22 batch above: each is the SHIPPED half of a goal whose remainder is still open, and the
> remainder stayed in `GOALS.md`. Every one of these is built and dated; what is owed on all four
> is the OWNER'S WALK, tracked in `docs/acceptance/owner-queue/`. Nothing here is direction.

### The SVG road after the owner walk of 2026-08-25 - goals 4, 5 and 6 (built 2026-08-26)

*The shipped half of "NOW" goals 4, 5 and 6. What stayed in `GOALS.md`: the one line saying the
three are built and the walk is owed.*

**From the owner's walk of the SVG road, 2026-08-25.** The canvas itself was accepted outright -
*"I like that it's only one canvas... It works great"* - and everything below is about the WORDS
around it. The full verbatim feedback is in the two `docs/acceptance/owner-queue/` items.

- [x] **4. ONE LINE PER THING, and an ⓘ for the rest.** *"There's kind of a lot of text in this
      fields page. I would like that there will be less text and it would be so intuitive so you
      don't have to read that much."* The rule he stated: **everything automatically visible is ONE
      LINE**, and anything more sits behind a small eye/ⓘ per section that also says *why this
      section is here at all* - the quiz behaviour block reads as random without it. This is the
      mapping step's information design, not a copy trim, and the same rule applies to every wizard
      step. A documentation page is wanted eventually, with no illusions about it: *"no one wants
      to read documentation. They just want everything to work."*
      **Built 2026-08-26** (`SectionHead.tsx`): every mapping-step section, the Animation step
      and the Import Design step are one line + ⓘ carrying the why; Finish/Entry/Fields/Style
      already read one-line-per-thing. Not yet swept: the raster Prepare/Place steps and the AI
      step. **The STRUCTURE was accepted on the 2026-08-26 walk** - *"I like that the long texts
      are now behind this i button"* - and the WORDS were not: *"the actual texts themselves are
      still way too long. It feels AI-generated ... it just needs to be more caveman style and not
      an epic drama."* Every user-facing string on the import path was rewritten short and plain
      (2026-08-26); code comments, `AGENTS.md` and `docs/` keep their reasoning density, which is
      a different rule for a different reader. Awaiting the owner's walk (owner-queue).
- [x] **5. "What travels with it" must explain itself, or not be asked.** The one thing on the walk
      he could not understand: *"my brain does not really understand how I choose what travels with
      it. What am I choosing?"* Two problems under it, and the second is the deeper one:
      - the picker offers **fields**, so clicking under a lower third only ever hits text layers -
        he asked, reasonably, whether he was meant to add all three fields, and what that would do;
      - he expects the ordinary case to need no question at all: *"of course that text should be
        able to become longer and the background should grow with it. I don't know why we need to
        choose them."* The declared set exists because geometry cannot tell a strap pinned to the
        frame from a caption that should move (`docs/SVG_IMPORT_PLAN.md` §6c) - but if the common
        case has to be authored by hand, **the default is wrong, not the reader**. Make the
        ordinary lower third work with nothing chosen, and ask only where it is genuinely ambiguous.
      His bar, worth quoting on any surface: *"If I can't automatically understand what it is, it's
      probably not good enough yet."*
      **Built 2026-08-26** (docs/SVG_IMPORT_PLAN.md §3): the ordinary lower third defaults to
      GROW, measured off the artwork (containment + arrangement, never size-against-frame); a
      scorebug, quiz or full-frame backplate keeps shrink; the follower list renders only where
      something would actually move, and named groups joined the canvas picker so "pick what
      travels" can reach a layer. E2E-pinned both ways; awaiting the owner's walk (owner-queue).
      **The 2026-08-26 walk found the default still wrong on the shipped Illustrator sample**, and
      ruled on the rest: a side-by-side pair used to veto the whole file, so a banner with three
      stacked lines above one defaulted to shrinking (fixed - such a pair bounds those two lines
      and argues neither way); the too-long control is a LADDER in his order - *"first I want it to
      get wider ... and then it should go to the next line. And the last thing is to shrink"*,
      shrink last *"because that changes the design more"* - with wider-then-wrap offered as a real
      combination, because *"we should let the customer choose whatever they want"*; growth is
      SYMMETRICAL and capped by the design's own mirrored margin, since *"we cannot have templates
      outgrow the screen, that should never happen"*; and *"nothing may ever paint outside the
      panel"* - past the legibility floor a value is now squeezed to fit rather than reported and
      left running across the artwork. All five measured before and after
      (`docs/SVG_IMPORT_PLAN.md` §3), E2E-pinned; awaiting the owner's walk (owner-queue).
- [x] **6. SPEED must visibly change the preview, or not be a control.** The animations and the
      easing list are accepted and liked - *"I think they look good. Nice job... for once I can see
      a difference with the easing"* - but **Speed does nothing visible on most presets**: *"if it
      doesn't work in the preview, it will not impress the customer... Even if it would work in real
      life, it's as bad."* His own hypothesis to test first: speed may only show once an EASE is on
      (slide + bounce is where he could see it), which would mean Speed silently does nothing at the
      default. The standing rule he restated: **"we can't show buttons if they're not working."**
      **Measured 2026-08-26** (his hypothesis tested, verdict in the owner-queue item): the knob
      always reached the data - a universal-bank entrance genuinely ran 1.07 / 0.80 / 0.53 s -
      so nothing was broken; a ±33% step compared from memory across two replays is simply below
      the noticing threshold on a smooth curve, and bounce reads because its RHYTHM changes, not
      its duration. The buttons now write 0.6 / 1 / 1.8 (≈1.33 / 0.80 / 0.44 s on the same
      entrance), on every surface that offers the knob.
      **Round two, 2026-08-26: on a FADE both controls still read as dead**, and the measurement
      says neither is. The emitted `NOACG_ANIM` carries 0.6 / 1 / 1.8, the BUILT entrance measures
      1.333 / 0.800 / 0.444 s, and a fade's four offered curves produce four measurably different
      opacity ramps - identical numbers to a slide, which he could see. What hid them was the
      wizard's own lifecycle demo: it stopped at 1700 ms and replayed at 2800 ms whatever the
      graphic did, so every setting played inside ONE fixed 2.8 s beat - and the faster the
      setting, the LONGER the graphic then sat still (367 ms of hold at Slower against 1256 ms at
      Faster: the cadence moved the wrong way). A slide survived it because travel is a second cue,
      a distance covered in a time; a fade has no second cue, which is why it was the one that read
      as broken - and it is also why Slide at Auto hid it, since a `power3.out` puts most of its
      travel in the first third. The demo now runs on the template's own durations
      (`WizardPreview` `demoCycle`), mutation-tested. **So the buttons stay: they work, and the
      surface they were judged on was lying.** Awaiting the owner's eyes (owner-queue).

### The playout dashboard drops the Preview verb (2026-08-22)

*The shipped half of the dashboard's button list. What stayed in `GOALS.md`: the two questions
only the owner can close - re-take, and whether SPACE goes to preview first.*

- [x] **Drop the Preview verb.** Done on `claude/playout-dashboard-cue-editor-beccdf`, but on TWO
      surfaces, not three. On the in-app and hosted pages the verb ran `selectCue` on the cue
      already selected - a no-op, because **selection IS the preview gesture** (§2); button and
      `P` key are gone from both and from the keymap. The EXPORTED controller keeps its
      `→ Preview`: there it is not a no-op but `takeTo('preview')`, a real second output stream
      (`docs/CONTROL_LAYER.md` - Preview and Take are one command list a `stream` apart).

---

## Condensed out of the live file (2026-09-01)

The 2026-09-01 North Star ratification confirmed the ~200-line budget on `GOALS.md`, and the live
file was condensed to it: the item and the link stay there, the argument moves here or to the doc
that already carries it. Blocks below are VERBATIM as they stood in the live file. The "Who we
are replacing" paragraphs moved to `COMPETITORS.md`; the agent door's future-directions list
moved to `docs/backlog/cli-roadmap.md`; everything else removed was already recorded in this
archive or in the plan doc its pointer names.

### NEXT - AI that anyone can afford (as it stood)

Three execution tiers behind the one "Create with AI" door. They differ by **capability**, and the
funding model follows the capability - never the other way round. Detail lives in the plan docs;
these are the commitments.

| Tier | Who pays | Price target | What it is | State |
|---|---|---|---|---|
| **NoaCG Lite** | us, free to the user | **100 graphics per €1** (~€0.01 each); measured **$0.00032** | **Promise: a proven catalog design, carrying your brand and your words - reliably, every time.** Grounded in **our catalog**: the model picks a proven design and adapts it. It does not invent a layout. | **its own value gate answered NO 2026-08-14; REVIVED by owner decision 2026-08-15, and the bar is a re-run of that same gate** |
| **NoaCG Pro** | user, a little | **~€10 per 100 graphics** (~€0.10 each); measured **~$0.004 per package** | **Promise: an on-air look designed for your channel, and every graphic of the package built in it - a palette, type voice, accent form and motion character no shipped design carries - rendered by the platform, so the layout is always sound.** The model decides the design LANGUAGE; the platform composes every graphic in it (`docs/NOACG_PRO_PLAN.md` §15). Not "a composition no shipped design uses": composing the panel is the premise three rounds measured to fail, and §15.4 retires it. | **LIVE since 2026-08-15** on hosted deployments (`AI_PRO_ENABLED` + a metering backend; it never asks a user for a key). The package (lower third + sponsor bug + countdown from one generation) shipped 2026-08-16; three consecutive clean owner blind reads (§17/§19/§21) |
| **Bring your own key** | the user's own provider account | whatever that provider charges, shown per model | Any model OpenAI, Anthropic, Google or Hugging Face offers, on the user's key. No NoaCG money, no NoaCG allowance. | shipped |
| **NoaCG Extreme** | subscription | not set - after there is income | The newest frontier models designing directly. Expensive, technically the simplest. | not started, needs income first |

**The price targets are commitments, not observations.** A tier that cannot be served inside its
target is a tier whose ROUTE changes, never one whose price rises: free stays free, and Pro's
number is what makes "a little" a promise rather than a feeling. Both are per finished graphic,
counting every model call a generation makes.

#### Owner decision 2026-08-15: Lite and Pro are revived, and the bar is the same gate

Lite's value gate FAILED on the owner's blind ballot 2026-08-14 and was reopened the next day on
evidence: every failure it named was **the MARK**, and it hit the hand-branded arm too, so the
defect was the platform's. The argument is in the archive; the rule it operationalizes is
`docs/AI_LITE_BRAND_PLAN.md` §2/§2.1/§2.2. What binds:

- **The bar is that SAME §2 gate, re-run unchanged** - same three arms (template, DIY, Lite), same
  predeclared rule, re-run once the two 2026-08-15 slices have landed (blocking a Pro graphic whose
  baked text cannot be erased, and Pro Phase A where the platform takes the panel).
- **A second FAIL means the retirement stands.** The gate does not get a third reading.
- **The re-run is cheap** - `$0.0069` of model spend; the expensive part is the owner's eyes.

- [ ] **Lite: make it good, then re-run its gate. The price is already solved** - **$0.00032 per
      generation** measured 2026-08-08, thirty times under the ceiling and unmoved by the transport
      change, so route choice is a QUALITY decision, not a budget one. What is open was never about
      money: machine-valid is not good, and the 2026-08-14 ballot said so. Cheap models cannot
      design a broadcast graphic unaided, so Lite never asks them to - the catalog is the crutch
      AND the moat (`docs/ADAPT_FIRST_PLAN.md`). **This is the gate for every other AI goal**, and
      "good" has one definition: passing the §2 re-run above. Two ballot notes are still unfixed
      and belong in the build the re-run films - a rule/underline crossing the name on two designs,
      and a title with no contrast on a light package.
- [ ] **Pro: the design-language tier** (`docs/NOACG_PRO_PLAN.md`). Both earlier premises are
      retired on evidence: reconstruction (§16) and the free-form coder (§21 - four checkpoints
      one-shot ~30% airable against Phase A's 14/15). What runs is Phase A: one text call buys a
      design LANGUAGE, the platform composes the package. Open, in order: the two-round set read
      (`benchmarks/pro/evidence/two-rounds-sets-blind.html`) that pins Pro's route; validating
      the fail-closed custom lane (seven §22.1 gate leaks closed, re-read 21/21 - one clean
      round justifies a validation round, not a ship); the topic card's read into the package.
      Every paid round stays spend-capped and approved separately.
- [ ] **A generated graphic can carry its own STATE MACHINE.** Every tier, not Pro. The platform
      has the engine, the node editor, the control pages and the hosted log - and **no generation
      path asks a model for a machine**. A generated clock+scoreboard got six correct fields and
      zero operator events: its clock engine unreachable, its invented dispatcher silently
      overridden. Prompting cannot fix it - every emit converts through `importAnimData`, which
      drops a machine by construction. The fix is a structured MACHINE stage spliced in
      deterministically, the way `designSpec` works. **The gap between "make a graphic" and "run a
      show".**
- [ ] **Extreme: frontier models + the subscription that funds them.** After there are users.
      Standing rule until there is income: a NoaCG-funded route must be a CHEAP model on the
      managed transport (Vercel AI Gateway, not OpenRouter). The constraint is cost, not brand -
      a frontier model on that transport is fundable once it is affordable; the four DIRECT
      provider APIs need the user's own key.
- [ ] **A school account earns more AI.** A verified address on a configured school domain
      issues a **grant**, which already outranks the plan and carries its own
      reason and expiry (`src/entitlements/contract.ts`) - no new concept needed. The first honest
      reason to sign in that is not a paywall.

#### Kits, not one graphic at a time

Nobody making a show wants to create graphics one by one. Say which graphics the programme needs,
get all of them in **one unified look**, landing together in one production.

- [ ] **AI kits** - the same door, with Lite generating the set. **Blocked until Lite passes the
      §2 re-run** (above): it multiplies whatever one generation is worth, so it cannot start while
      that is still the open question.

### Account infrastructure before real students (parking-lot entry as it stood)

- **Account infrastructure before real students** (`docs/DEPLOYMENT.md`, "Auth email" and
  "Google sign-in") - two provisioning jobs, no code in either, both owner-only because they
  need accounts we hold rather than anything in this repo. **Custom SMTP**: the built-in
  Supabase sender is a testing facility capped at a handful of mails an hour, so
  password-reset delivery is unreliable until a real provider is attached; the SPF/DKIM
  verification is the part with weeks of lead time. **Google sign-in**: the code and the
  button already ship, and `[auth.external.google]` is wired - what is missing is a Google
  Cloud OAuth client and its credentials on the hosted project. The button is HIDDEN
  (`GOOGLE_SIGN_IN_ENABLED`) until then, so provisioning ends with flipping that flag. Owner
  asked for both 2026-08-24; step-by-step for each is written down, waiting to be executed.

## Agent-authored machines: the skill teaches the contract (shipped 2026-09-15)

The live-file item as it stood, verbatim:

> - [ ] **Agent-authored machines - answered 2026-09-15, the skill not yet taught.** The rows
>       that close it: `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5.

Closed by the CLI's 0.3.2 skill. The owner retired the 2026-08-08 "AI never authors machines"
rule on 2026-08-27 and named three gates instead (`docs/CONTROL_PANEL_ROAD.md` §9); the gates
were built, and the skill was the only thing left saying no - in one sentence, *"Authoring your
own machine is a later capability."* `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §2c measured that
sentence as the third road's actual gap.

`cli/skill/noacg-graphic/references/contract.md` §5 now carries the five declarations, a worked
machine with its `machine.controls` block, `calls` into the template's own JS, the reported-field
pattern and the default-path contract; the loop in `SKILL.md` names the gates as steps 3 and 4.
`cli/test/unit.test.mjs` pins all three gate words and the absence of the retired sentence, so a
later rewrite that quietly drops a gate fails CI instead of failing on air.

What this item did NOT close: an authored machine proven end to end through the agent road, and
the bench's eight-event cap. Both are rows of
`docs/work-specs/control-panel-any-graphic/spec.md` (AC-2 and AC-3).

## Two Space-key modes, as an operator setting (shipped 2026-09-16)

The live-file item as it stood, verbatim:

> - [ ] **Two Space-key modes, as an operator setting** (owner, ALIGN-2026-09-10-3; build before the
>       25th). `docs/backlog/space-sends-to-preview-then-to-program.md`.

Closed by a checkbox in the verb bar, **`SPACE` previews first**, on all three dashboard surfaces
(`docs/PLAYOUT_DASHBOARD.md` §2f holds the contract and his words). Unchecked is the toggle the
dashboard has had since 2026-08-06, unchanged. Checked, walking the rundown previews nothing:
SPACE puts the selected cue on PREVIEW, SPACE again airs it, and SPACE on a cue that is on air
takes it off and leaves it on PREVIEW - his "cut button on a mixer". Per browser, in
`localStorage`, never synced. Both modes are pinned on the in-app page and the exported controller
offline, and the hosted page's own walk is a configured spec. The backlog file that held the ask
was deleted with the landing.

## Condensed out of the live file (2026-09-16)

`docs/GOALS.md` was 310 lines against the ~200 its own opening paragraph states - the fourth reading
over budget, after 460 on 2026-08-30, 419 when the defect was filed, 212 straight after the
2026-09-01 condense, then 284 and 308 as that condense wore off. It is now 190 lines, and
`scripts/check-goals-budget.mjs` reads the cap out of that opening sentence and fails the build
above it. The condense had been done twice by hand and drifted back both times within a week; the
gate is the part that had never been tried, and it is why this round is expected to hold.

**What was cut is the ARGUMENT, not the items.** Every open item kept its line and its link. The
prose that made the case for each one is below, and two blocks moved into the doc that owns the
subject rather than in here:

- **The core question** - drawing a graphic without code is the easier half, the hard half is giving
  it logic and then changing that logic - is now the opening of §5 P2 in `docs/NORTH_STAR_2027.md`,
  which is where the register's own contract puts a programme's argument. The roadmap names the
  question in one sentence and calls it P2.
- **The always-on quality bar** - the live suite runs before a class and after any change to
  publish, output or the topbar - is now a section of `docs/VERIFICATION.md`. It is a standing
  verification rule rather than a goal, and the roadmap holds only what is not done.

Everything else that shrank is recoverable from the verbatim copy below: the "done right" bullets
(the bar is `docs/DESIGN_LANGUAGE.md`), the anything-goes export section (one clause in the north
star now), the operating principles (one "posture" paragraph), the per-competitor reads (the full
read is `COMPETITORS.md`), the owner quotes behind the NOW items (their plan docs carry them), the
OGraf sequencing argument and the dashed-card device, and the parking lot's provisioning detail
(`docs/DEPLOYMENT.md`).

**The whole file as it stood, verbatim:**

> # Goals
>
> The committed north star. **This file holds only what is NOT done.** A milestone that lands moves
> to [`GOALS_ARCHIVE.md`](GOALS_ARCHIVE.md) verbatim - the full shipped record with dates and
> rationale, so nothing is lost - and is deleted from here. When the direction changes, rewrite this
> file; the archive keeps the history. **Keep it under ~200 lines** (owner-confirmed 2026-09-01;
> this is the one place the budget is stated - other docs point here): a roadmap nobody can read in
> one sitting steers nothing. Rationale lives in plan docs; this file carries the item and the link.
>
> **`## NOW` IS WHAT THE DATED EVENTS NEED; NOTHING ELSE IS PARKED** (owner, 2026-09-15, in
> `docs/OWNER_RULINGS.md`: *"we don't have to park everything else behind those deadlines. We can
> work on anything if it makes sense."*). `## NEXT`, `## THEN` and the parking lot are described work
> in a rough order, and any of it may start when there is a clear vision of how to do it. A date is
> owed a clear list of what it needs, never the whole machine, and NoaCG stays built for everyone
> rather than for one production. Every programme in [`PROGRAMMES.md`](PROGRAMMES.md) is
> AUTHORIZED; its scope edges still return to the owner mid-flight.
>
> ---
>
> ## North star
>
> > **One link, live anywhere.**
> > Pick a broadcast graphic, make it yours without touching code, and put it on air in five
> > minutes - in CasparCG, SPX, OBS, vMix, or whatever the show runs on - from **one output URL**,
> > driven by a **control panel inside NoaCG**.
> >
> > And when the catalog does not have what the show needs: **draw your own graphic, give it the
> > behaviour the show needs, and play that out the same way** - still without code.
>
> That URL is the product. Everything else serves it: the wizard exists to fill it, the catalog
> exists to make it look paid-for, the export adapters exist so it reaches any playout machine, the
> control layer exists so a person can drive it live.
>
> **The core question - what NoaCG is actually trying to solve** (owner, 2026-08-22). Drawing a
> graphic without code is the easier half; the hard half is **giving it LOGIC, and then CHANGING that
> logic**, without code. A quiz that locks an answer and then reveals it is one set of rules - and the
> next producer wants no lock at all, just an immediate reveal. Two surfaces have been tried at this
> and neither landed as a way a non-programmer authors logic: the **canvas editor** and the **node
> editor**. The question stays open, it gets attacked from several angles rather than one, and it has
> no hard date. It is also the thing that decides whether NoaCG is usable by productions bigger than
> one school, so nothing here is a side quest. It is programme **P2**, a standing research thread.
>
> The first-named user is a **student or non-technical operator** who runs a real production without
> ever seeing code; organizations, channels, streamers and universities follow. A **professional**
> keeps full control through **Advanced mode** - the editor, one toggle away, never required. The
> generated HTML/CSS/JS is the single source of truth and stays clean and readable.
>
> **The dates: an early-October production on the scoreboards and quiz boards; 2026-10-20,
> Elämäni biisi on Yle.** NOW lists what they need. Work that serves none of them is still current when it makes sense.
>
> **The year beyond this file**: [`NORTH_STAR_2027.md`](NORTH_STAR_2027.md) (ratified 2026-09-01)
> is the one-year north star and evidence model; [`PROGRAMMES.md`](PROGRAMMES.md) is the live
> register of what the orchestrator may advance. Never mark a capability complete because its
> implementation exists - claims advance by evidence rung.
>
> ### What "done right" feels like
> - **Fast** - open NoaCG, choose a design, make a production, paste the URL, live in under 5 min.
> - **Tasteful** - every design looks like a paid MotionArray/Envato asset, not a tutorial demo.
> - **Consistent** - graphics made together share one palette and type family across categories.
> - **Yours** - custom colors and imported fonts are first-class; fonts embed in the export.
> - **Smooth** - 60 fps, transform/opacity only, professional easing.
> - **Reliable** - every export passes the validation gate and plugs straight in.
> - **Editable** - a pro can open any generated file and extend it. Nobody has to.
>
> ### Anything-goes export (a platform, not an SPX generator)
> Many environments - **SPX, CasparCG, OBS, vMix, OGraf**, more over time - each an adapter off one
> source, so breadth costs no rework. The source is **NoaCG-native, code-as-truth**: one HTML
> document that happens to satisfy the SPX contract. SPX is an adapter and the strictest gate;
> OGraf is the canonical interchange and playout contract (`docs/OGRAF_FIRST_REVIEW.md`).
>
> ### Operating principles
> - **NoaCG competes on accessibility** (owner, 2026-09-07; the ruling is `docs/OWNER_RULINGS.md`).
>   The landing page says so first, and what it may claim is graded in **`docs/PROMISE_AUDIT.md`**.
> - **Free forever, all of it.** Creating, editing, exporting, controlling, self-hosting. No "core".
> - **No paid surface, and none planned** (owner, 2026-09-07). Hosted AI for users who will not
>   bring their own key is **subsidised by the project, not sold**, and bring-your-own-key is free
>   as it always was. Lite / Pro / BYO are AI tiers about who runs the model, never editions.
> - **Users, not revenue.** Money is a later consequence of a large, happy user base.
> - **No sign-in for its own sake.** An account is asked for only where it *buys* something.
>
> ### Who we are replacing
> Six products; their proven capabilities are our requirements list. The full read, per capability
> and per gap, is [`COMPETITORS.md`](COMPETITORS.md):
> - **Zero Density** - first on the list (owner, 2026-09-15). OGraf Studio is an open-source visual
>   OGraf editor, and the interaction reference for the editor rebuild. Its custom actions run no
>   behaviour, so operator logic stays ours to take.
> - **Rive** - designer-first state-machine logic; sets the bar for our machine + logic surface.
> - **Singular.live** - cloud graphics + browser control room; our gap to open is breadth.
> - **Loopic** - closest positioning; its timeline/canvas are what Advanced mode has to beat.
> - **MXMZ** - Yle's named model; proves "your own SVG, playable" at broadcast scale. Nothing
>   public shows them authoring LOGIC at all - that gap is ours to take.
> - **Pixla** - a control room in a box (rundown, prompter, timer, switcher control) around a
>   designer. One row there forces OUR user into another tool: they cannot draw a rectangle. The
>   rest is deliberately not ours ([`COMPETITOR_PIXLA.md`](COMPETITOR_PIXLA.md) argues each refusal).
>
> ---
>
> ## NOW - students make their OWN graphics, and play them out
>
> **The goal, owner 2026-08-22:**
>
> > A student draws **their own graphic** - any graphic, not a lower third - gives it **the behaviour
> > their show needs**, and plays it out from the dashboard. **Without writing a line of code.**
>
> **What is owed** (ruling: `docs/OWNER_RULINGS.md`, 2026-09-09): one step-by-step guide over SVG
> import ending on somebody else's system, and the CLI from Codex or Claude Code to the NoaCG
> player. **The 2026-09-12 production did not happen** (owner, 2026-09-15); the next is early
> October, on the **QUIZ** (lock / reveal) and the **SCOREBOARD** (score + / -) as they exist.
> The user draws the graphic; we supply the behaviour. The student release before this is CLOSED
> (archive).
>
> **A WALK THAT IS OWED NEVER BLOCKS WORK** (owner, 2026-08-30, unprompted and twice): *"It's up to
> me to test what I need to test. You don't have to block any work just because I haven't tested
> something or something is not done... nothing should block stuff."* `docs/acceptance/owner-queue/`
> is a record of what is waiting to be SEEN, never a gate on what may be STARTED; nothing in it
> expires. Keep building; he catches up when he catches up.
>
> - [ ] **1. Prove the SVG road, with eyes on it.** SVG import v1 is merged
>       (`docs/SVG_IMPORT_PLAN.md`) and the owner has walked it five times since 2026-08-25. What is
>       owed is a STRANGER's walk, which no test answers; `claude/d-import-road-guide` writes it up.
> - [ ] **2. Attach BEHAVIOUR to a graphic somebody else drew.** Both cases work - pinned by
>       `e2e/import-svg-behaviour.spec.ts`, designed in `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10,
>       shipped detail in the archive. **What is left is the OWNER WALK.**
> - [ ] **3. The two graphics, walked as a student would.** Draw, import, bind, attach behaviour,
>       one production, run from the dashboard - lock, reveal, +1, -1 - operator never sees code.
>       The acceptance test for the whole goal, and the dress rehearsal for early October.
> - [ ] **TEXT HAS TO KNOW ITS BOX** (owner walk, 2026-09-02, on his own quiz board) - *"the system
>       has no idea how the text should behave in relation to the graphics behind it... we need to
>       establish a system where the text appears as if it is designed on the graphic, regardless of
>       whether the text is short or long."* Every field lives in the shape drawn under it; the text
>       owns its alignment, the box owns its growth. Design and the two measured defects underneath
>       it: **`docs/TEXT_BOX_BINDING.md`**. This is step 3's blocker - his board looked wrong the
>       moment a real question was typed into it.
> - [ ] **The owner walks goals 4/5/6 from the 2026-08-25 SVG-road walk** - all three BUILT
>       2026-08-26 (one line per thing + ⓘ; "what travels with it" explains itself; SPEED visibly
>       changes the preview). Verbatim feedback and costs in the archive. His bar: *"If I can't
>       automatically understand what it is, it's probably not good enough yet."*
>
> - [ ] **Brands: make one, choose it in the wizard, the graphic adapts** (owner, 2026-09-05 - the
>       footer checkbox copies a look nobody chose, and a logo has no road into a brand). Plan and
>       the two wave rows: **`docs/BRAND_PLAN.md`**; level 2 (the PDF brand bible) stays parked there.
>
> **CUSTOMIZING that behaviour is not needed for the near dates** (owner, 2026-08-22 - *"what if
> I don't want to be able to lock it?"*), and it is no longer held for them (owner, 2026-09-15). It is the P2
> question one level up; the rows in `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5 are its first step.
>
> ### The playout dashboard
>
> Binding design `docs/PLAYOUT_DASHBOARD.md`; parity `docs/CONTROL_PANEL_PARITY.md`. **Accepted as
> it stands, owner 2026-08-22**; one amendment since: the verb block stays **two columns wide with
> TAKE spanning them at every window size**. The Preview VERB is gone from the in-app and hosted
> pages, deliberately kept in the exported controller (archive, 2026-08-30).
>
> - [x] **Two Space-key modes, as an operator setting** (owner, ALIGN-2026-09-10-3; build it,
>       2026-09-15). Space previews and Space again airs, like a mixer's cut; or selection
>       is preview and Space airs, as today. Shipped 2026-09-16 - `docs/PLAYOUT_DASHBOARD.md` §2f
>       (the backlog file that held the ask is gone; his words are quoted there verbatim).
> - [ ] **The production control profile, for 2026-10-20** (owner, 2026-09-15): two primitives,
>       ARRANGE and COMBINE, started 2026-09-15 (ALIGN-2026-09-15-4). Design and rows: `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6.
>
> ---
>
> ## NEXT - OGraf-first: the standards-based platform
>
> **Ratified by the owner 2026-08-29, with amendments; `docs/OGRAF_FIRST_REVIEW.md` is the costing
> and the record. Programme P6 in [`PROGRAMMES.md`](PROGRAMMES.md), whose only entry condition is a date, so it may
> start now; the NOW date is a forecast of when it matters, not a wait (owner 2026-09-03).** The
> verdict: OGraf is the canonical interchange and playout contract; the NoaCG-native code-as-truth
> document stays the canonical authoring format (SPX an adapter, keeping the strictest gate); the
> Server API becomes the standard face over the command log, which stays the internal transport.
> Principle: **use the EBU contract wherever it already solves the problem; invent nothing the
> standard already specifies.**
>
> **Sequencing, loosened by the owner 2026-08-30** - *"we need to loosen the sentence."* It used to
> read *nothing below starts before the NOW date*, and OGraf work landed three times in the week that
> sentence was written. What it protects against is the roadmap being RAIDED, not the interchange
> contract going unhonoured while the EBU relationship is live. So **OGraf work that serves the
> current push is current work**: honouring the standard inside what we are already building, and
> answering a question a shipped behaviour actually raises (`docs/OGRAF_STATE_IN_FIELDS.md` is the
> worked example). **The LADDER below is what stays parked** - import, foreign-package playout, the
> Server API facade and outreach are each a NEW surface rather than a contract honoured in an
> existing one. They are ORDERED after the push rather than blocked by it - owner 2026-09-03: a date is a forecast of when work matters, never permission to wait; the test to start is a clear vision and no fire burning.
>
> **The public statement of this direction is the landing page's `#ograf` section (2026-09-08).**
> What is built is on solid cards - export, the six starters, reading a stranger's package through
> the CLI (`src/export/targets/ografImport.ts`, `src/control/ografContract.ts`) - and the three
> ladder rungs below it are dashed cards marked as direction. When a rung lands, its card turns
> solid in the same commit, and its row in `docs/PROMISE_AUDIT.md` changes grade first.
> **The owner walked those cards on 2026-09-10 and kept them**: *"the direction marking is for things
> that don't work right now, am I right? I think it's fine. We just need to fix it at some point.
> There's no hurry for that yet, but it just needs to be on the to-do list."* So the dashed cards are
> ratified as a public device, and the three rungs they name stay ordered on this ladder rather than
> becoming their own push.
>
> - [ ] CasparCG Stage 1 accepted on real hardware (owner-queue, 2026-08-25)
> - [ ] GDD alignment: emit standard `gddType`, honest `stepCount` 0/-1, one step-walk
> - [ ] the interop suite: scripted external-renderer round + foreign-fixture corpus
> - [ ] untrusted-package isolation - the player-host sandbox pattern applied to OGraf hosting;
>       a prerequisite for import, not a feature
> - [ ] **OGraf import v1** - a stranger's package as a first-class library/production citizen:
>       playable, data-editable, operated by the same dashboard; never code-editable
> - [ ] **OGraf playout on the existing output architecture** - foreign packages mounted on
>       `/output` layers behind the sandbox; never a separate playout system (owner ruling
>       2026-08-29 evening: this before any outreach; `docs/OGRAF_ECOSYSTEM.md` §5)
> - [ ] **`/output` speaks the OGraf Server API** - the facade over the command log; the item that
>       puts NoaCG on the lists MXMZ is on
> - [ ] outreach, GATED behind a real production running on the above (owner, 2026-08-29):
>       ecosystem listing (`docs/IBC_LISTING_CHECKLIST.md`), checker-CI, any EBU contact
> - [ ] **the code editor shows OGraf, not only SPX** - a target switch on the code view, read-only
>       to start, so a person can see how the graphic is built for the format they care about. Owner
>       2026-09-10, explicitly unhurried: *"a little bit of a vanity thing"*. Blocked by no rung
>       above it. `docs/backlog/monaco-shows-ograf-not-only-spx.md`
> - then: the controller speaking the Server API outward; the desktop client, which waits a little
>   behind the editor and the control panel (ALIGN-2026-09-14-3); the native SDI renderer.
> - [ ] **GSAP licence**: obtain written clarification from Webflow/GSAP on the prohibited-uses
>       clause (owner); until then preserve replaceability - no new GSAP-only surface area.
>       **Owner, 2026-09-05: not yet - remind me in six months.** The ask is off the walk queue and
>       on a calendar row (`gsap-licence` in `scripts/check-vendored-versions.mjs`), due around
>       2027-03-04. The replaceability half is unchanged and still binding.
>
> **The Yle thread**: one message is owed now (the demo script's B0); the owner re-contacts in a few weeks, and in roughly a
> month Yle would try NoaCG inside one of their productions. Expect one question - which ports and
> hosts their strict network blocks. Answer it when they report it.
>
> ## NEXT - coding agents make NoaCG graphics (the agent door)
>
> **Shipped 2026-08-22** (`docs/AGENT_CLI.md`, `docs/AGENT_SAVE.md`; archive has the detail); the
> measured 25-cell round: all airable, skill stays contract-only (`benchmarks/agent/rounds/
> 2026-08-22/VERDICT.md`). **Programme P5**; the direction pool is `docs/backlog/cli-roadmap.md`.
>
> - [ ] **Publish - past `main`, so the owner's.** `@noacg/cli` 0.3.0 is on npm (published by hand,
>       2026-09-05) and the marketplace entry is live. `npm run release:cli` is the road for every
>       later version and a session may run it (owner, 2026-09-05, `docs/AGENT_CLI.md` "Releasing
>       to npm"), but it cannot publish until the owner adds the trusted publisher on npmjs.com -
>       **needs: account**. Until then nothing publishes by hand; a failed run waits for him.
> - [ ] **What the funded tiers can borrow** - diff the round's winning cells against Lite/Pro.
>
> ## NEXT - AI that anyone can afford
>
> Three execution tiers behind one "Create with AI" door; capability first, funding follows. Detail
> in the plan docs. **The price targets are commitments, not observations** - a tier that cannot be
> served inside its target changes ROUTE, never price.
>
> | Tier | Target | State |
> |---|---|---|
> | **Lite** (us, free) | 100/€1; measured $0.00032 | gate FAILED 2026-08-14, REVIVED 2026-08-15; bar = the same §2 gate re-run (`docs/AI_LITE_BRAND_PLAN.md`); a second FAIL stands |
> | **Pro** (user, a little) | ~€10/100; measured ~$0.004 | LIVE since 2026-08-15; design-language tier, Phase A (`docs/NOACG_PRO_PLAN.md` §15) |
> | **BYO key** | provider price | shipped |
> | **Extreme** (subsidised, not sold) | after income | not started; funded routes stay cheap-model on the managed transport until income. A spend ceiling we carry, never a price we charge (2026-09-07 ruling) |
>
> - [ ] **Lite: make it good, then re-run its gate** - quality, not budget; the catalog is the
>       crutch AND the moat (`docs/ADAPT_FIRST_PLAN.md`). **The gate for every other AI goal.**
>       Two ballot notes still unfixed belong in the re-run build.
> - [ ] **Pro** - open, in order: the two-round set read; validating the fail-closed custom lane;
>       the topic card's read into the package. Every paid round spend-capped, approved separately.
> - [ ] **The Pro Harness** (owner brief 2026-09-05): any custom graphic from a cheap model, as a
>       standard template, through an evidence-driven tool loop - `docs/PRO_HARNESS_PLAN.md`. Loop
>       core built; the first paid round (§10 there) awaits a stated cap.
> - [ ] **A generated graphic can carry its own STATE MACHINE** - every tier. No generation path
>       asks a model for a machine, and `importAnimData` drops one by construction; the fix is a
>       structured MACHINE stage spliced in deterministically. **The gap between "make a graphic"
>       and "run a show".**
> - [ ] **A school account earns more AI** - a verified school-domain address issues a grant
>       (`src/entitlements/contract.ts`). The first honest reason to sign in that is not a paywall.
> - [ ] **AI kits** - Lite generating the set; blocked until Lite passes the §2 re-run.
>
> ---
>
> ## THEN - the custom road (now the programme register)
>
> The old THEN list graduated into [`PROGRAMMES.md`](PROGRAMMES.md) on 2026-09-01:
>
> 0. **TEAMS** - several people holding ONE production (owner, 2026-08-21) -> **P1, in DESIGN now**.
> 1. **WYSIWYG canvas** (`docs/WYSIWYG_PLAN.md`; tried once, did not land) -> **P7**; a second
>    attempt starts by saying what was wrong with the first.
> 2. **The node editor as a first-class authoring surface** (also tried, also did not land) ->
>    the **P2** research question; the answer is not assumed to be a third editor.
> 3. **Singular.Live class** - live data, automation, multi-operator -> **P3 + P4**.
>
> ---
>
> ## Parking lot
>
> Real work, deliberately not now. Each has a plan doc; none is current until pulled up (or until
> its programme activates).
>
> - **Cloud playout stages 2-4** (`docs/CLOUD_PLAYOUT.md`): versions + rollback, operator sharing,
>   rate caps; the **Data Hub** (-> P4); professional automation (-> P4).
> - **Adapt-first paid proofs** (`docs/ADAPT_FIRST_PLAN.md` §6.2/§6.3) - explicit spend approval.
> - **Managed funded AI tier** - belongs with Extreme, subsidised not sold. Payments/subscriptions are
>   not parked but RULED OUT (owner, 2026-09-07).
> - **Nightly auto-generated graphics library** (`docs/NIGHTLY_AUTOMATION_PLAN.md`).
> - **Audience page per-show customisation** + **chat ingestion into the audience plane**
>   (`docs/INTERACTIVE_PLAYOUT_PLAN.md`) - held while the plain join page is being accepted.
> - **Account infrastructure before real students** (`docs/DEPLOYMENT.md`, "Auth email" and "Google
>   sign-in"): custom SMTP (built-in sender caps at a handful of mails/hour; SPF/DKIM lead time is
>   weeks) and the Google OAuth client (button ships hidden behind `GOOGLE_SIGN_IN_ENABLED`). Both
>   owner-only provisioning, asked for 2026-08-24, step-by-step written down. P1 makes them urgent.
> - **Video/animation projects** - the Beta shell stays until the north star lands.
> - **The dedicated preview channel, Home polish** - postponed, still wanted.
>
> ---
>
> ## Quality bar (always-on)
>
> The full procedure is `docs/VERIFICATION.md`; what this file adds is the one bar nothing there
> enforces: **the live suite runs against the real project before a class, and again after any
> change to publish, output or the topbar.** It only ever runs by hand, so nothing reports the rot
> it finds - the 2026-08-08 run went 7 of 18 before repair.
