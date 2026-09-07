# LANDSCAPE.md - the whole market, and what NoaCG has to be

**What this is.** One page holding the entire competitive picture at once, across every segment that
touches a live graphic, and the requirements list that falls out of it.
[`COMPETITORS.md`](COMPETITORS.md) is the per-vendor capability matrix and stays the working file
for individual rivals; this file is the map above it and the argument about what kind of product
NoaCG should become. Where the two disagree, this file is newer and says so in section 7. A single
vendor deep enough to need its own page gets one, and there are two:
[`COMPETITOR_MXMZ.md`](COMPETITOR_MXMZ.md) and [`COMPETITOR_PIXLA.md`](COMPETITOR_PIXLA.md).

**Refresh is TIME-driven, never commit-driven.** Nothing here changes because our code changed. It
changes when somebody re-reads somebody else's public material. Every segment block carries the date
it was read. Treat anything older than a quarter as stale rather than wrong.

**Evidence grades, and they are marked.** Marketing copy is strong evidence about what a company
sells and weak evidence about what it ships. A vendor's own documentation is better. Shipped client
code, a public repository, or a product driven by hand is better still. Where nobody has looked, the
word is **UNRESEARCHED**, which is different from "they do not have it". Every claim about NoaCG in
the matrix was verified against this repository, and where a scan's original claim was wrong the
corrected state is what appears here.

Read 2026-09-07 unless a block says otherwise.

---

## 1. The map

### How this market is actually divided

There is no single "broadcast graphics market". There are seven layers that a live graphic passes
through or sits beside, and each one has its own buyer, its own price and its own incumbents.
Products that look like rivals often occupy different layers entirely, which is why the same vendor
can be a competitor, a host and a distribution channel at once.

**A. Browser and cloud HTML graphics platforms.** Singular.live, Viz Flowics, MXMZ, Loopic,
BroadcastGraphics.io, Erizos, StreamShapers. This is the segment NoaCG is most often compared to. It
splits in two: cloud platforms that sell you a chain (build here, control here, play out from our
URL, you never get files) and template builders that sell authoring only and hand the HTML to
somebody else's playout. Buyers are production companies, sports rights holders and mid-size
channels. Prices run from Loopic at 29 EUR/month to Singular at $150-$350/month with a per-output
tax on the Enterprise tier, to Viz Flowics at a reseller-listed $9,000/year with no vendor-published
price at all.

**B. Broadcast incumbents.** Vizrt, Chyron, Ross Video, Brainstorm, Zero Density, Avid Maestro
(UNRESEARCHED), Grass Valley (UNRESEARCHED), RT Software (UNRESEARCHED). The systems channels
already run. The buyer is a facility, not a person, and the sale is an engine, a chassis,
commissioning, training and an SLA. Nobody publishes a price for the products that matter, including
Viz Flowics, whose pricing page carries a demo button and no numbers. What changed in 2026: they are
all arriving on our ground from the newsroom side. Chyron previewed PRIME HTML, an on-premises HTML
authoring workflow that plugs into an existing NRCS and uses their own PBHX scene format. Vizrt
added HTML5 as a media asset in Viz Engine 5.4. Zero Density announced AI-generated HTML5 templates
and, separately and less noticed, publishes OGraf Studio on GitHub under AGPL-3.0 as a browser OGraf
editor with built-in AI chat.

**C. The free and open stack.** CasparCG, OBS Studio, SPX-GC, Sofie, NodeCG, the OGraf ecosystem,
Ferryman, Bitfocus Companion, Ontime. These are not competitors so much as the machinery our
first-named user already owns. The chain is genuinely free at the bottom and quietly not free in the
middle: SPX caps its open edition at five layers and puts the Server API, MOS/NRCS and SDI/NDI
behind SPX Production at $600/year and SPX Broadcast at a quote. Not one product in this segment
will make you a graphic. SPX's own knowledge base tells you a template is a hand-written mini
website; Sofie renders nothing until a developer writes JavaScript blueprints; NodeCG needs a
developer and a Node process; the free OBS lower-third packs open by asking for HTML, JavaScript and
CSS.

**D. The prosumer and streamer layer.** H2R Graphics, uno (overlays.uno), vMix, StreamElements,
Streamlabs, Ecamm, Wirecast, Canva-to-overlay, ProPresenter (UNRESEARCHED), the ATEM Mini's own
media pool (UNRESEARCHED). This is where NoaCG's first-named user actually lives today, and there is
almost no money in it. H2R does close to NoaCG's job for $80 once, forever, offline, with no
account. uno gives away hundreds of overlays and charges roughly $2-3/month to remove ads from the
operator UI, and uno **is** Singular.live, which their own resource site states outright. vMix wants
$700 before you can author an animated title of your own. Nobody in this segment ships authored
behaviour beyond a toggle, a Page1-10 trigger or a JavaScript counter.

**E. Show running.** Ontime, Rundown Studio, Rundown Creator, Stagetimer, Cuez, Sofie, Bitfocus
Companion, Pixla. Rundowns, timers, prompters, switcher control, multiview. Commoditised, and the
vendors know it: a rundown costs $0 (Ontime, GPL-3.0, self-hostable) to $600/year, a stage timer is
free to $210/year, and Companion is free forever with 814 device connections and a donation model.
The money sits at the newsroom-automation end (Cuez, Sofie services, Rundown Creator Pro at
$90/month for its XPression and Chyron integrations) and in hardware-adjacent switching.

**F. Design and logic tools crossing in.** After Effects with Bodymovin, Figma with Figma Motion,
Rive, LottieFiles, Cavalry, SVGator (UNRESEARCHED beyond a product read), DJ HTML Creator
(UNRESEARCHED), Spline. Two things moved in 2026 and both cut against comfortable assumptions here.
The design tools grew logic: Rive shipped Luau scripting and an AI coding agent into its editor on
2026-01-13, and LottieFiles shipped Prompt to State Machines on 2026-04-22. And they grew code
output: Figma Motion, launched at Config on 2026-06-24, hands a designer CSS, JSON and React
animation code from Dev Mode. For a product whose non-negotiable is that code is the source of
truth, that last one is a better-matched import door than any sealed artefact, and nobody in the
corpus considered it.

**G. The AI layer above the graphics engine.** HighField AI, Ross Video with HighField, nxtedition,
Emergent, Zero Density, Vizrt's AI Platform, the IBC2026 SMART STORIES consortium. Two products get
sold under one word. **Authoring** is a model producing a new graphic. **Assembly** is a model
reading a newsroom story and filling a template a person already built. Assembly is where the money
and the incumbents are, and NoaCG is absent from it. Authoring was uncontested a month ago and is
not now.

There are two segments nobody in this round researched, and both matter more than their absence
suggests. **The switcher's own graphics**: a Blackmagic ATEM Mini Pro is $349 and ships a media pool
of 20 stills plus motion clips, a chroma key, a DVE and a free Photoshop plug-in. In most school and
church control rooms that is the graphics system, and it costs nothing extra because the box is
already bought. **Presentation software**: ProPresenter and EasyWorship in churches, slides over NDI
in schools. Both are UNRESEARCHED and both are what a graphic is actually replacing.

And one more, which is the most consequential unresearched category on the page: **the buyer**. We
know Singular's price to the cent and nothing about how a school decides, what it already owns, or
whether the named user has $80. Every "we beat on price" row is a claim about a purchasing decision
nobody has studied.

### Who plays where

| Segment | Who buys | What they pay | Named players | NoaCG in it? |
|---|---|---|---|---|
| A. Browser / cloud HTML platforms | Production companies, rights holders, mid-size channels | 29 EUR/mo to $9,000/yr | Singular, Viz Flowics, MXMZ, Loopic, BroadcastGraphics.io, Erizos | Yes, this is our segment |
| B. Broadcast incumbents | Facilities, national broadcasters | Quoted, six figures with the chassis | Vizrt, Chyron, Ross, Zero Density, Brainstorm | No, and should not be |
| C. Free and open stack | Everyone, including us | $0, with SPX freemium above 5 layers | CasparCG, OBS, SPX, Sofie, NodeCG, Companion, Ontime | Host and ally, not rival |
| D. Prosumer and streamer | Students, churches, streamers, school AV | $0 to $80 once, or $15-27/mo | H2R, uno, vMix, StreamElements, Streamlabs, Canva | Yes, this is our user |
| E. Show running | Show callers, producers, event crews | $0 to $600/yr; Companion free | Ontime, Rundown Studio, Stagetimer, Cuez, Pixla | Adjacent, one foot in |
| F. Design and logic tools | Designers, motion artists | $0 (Cavalry) to $70/mo | After Effects, Figma, Rive, LottieFiles, Cavalry | Import door only |
| G. AI above the engine | Newsrooms, sports operations | Quoted, unpublished everywhere | HighField, Emergent, nxtedition, Zero Density | Absent from assembly |
| H. Switcher-native graphics | Anyone who bought the switcher | $349 and up, included | ATEM Mini, TriCaster, vMix GT | UNRESEARCHED |
| I. Presentation software | Churches, schools, campus AV | Licence, unpublished here | ProPresenter, EasyWorship, PowerPoint over NDI | UNRESEARCHED |

### What kind of company NoaCG is

**NoaCG is a free, open graphics tool for people who are not engineers, whose product is a single
HTML document that carries its own behaviour and generates its own operator surface, and which
reaches air through everybody else's infrastructure rather than its own.**

That sentence has three load-bearing halves and each one is a deliberate refusal. We do not sell a
renderer, so segment B is a bar and not a fight. We do not sell a chain, so unlike segment A the
files are yours and the outputs are unmetered. We do not sell a control room, so segment E's tools
are things we should plug into rather than replace. What is left, and what nothing else in nine
segments does, is a graphic that knows how to behave and hands the operator a panel that greys out
the wrong button.

---

## 2. What everybody has that we do not

The unified matrix. NoaCG states are the **verified** ones, re-derived against this checkout, not
the original scanners' claims. Verdicts: **we beat** (nobody credible matches), **match** (parity),
**gap** (they have it, we should too), **gap-wrong** (they have it and we should not build it),
**different product** (not our category). Effort is hours / days / weeks / months / quarters.

### Creation

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Ready-made design catalog | Flowics 140+, Singular library, Streamlabs, uno. Not Loopic, not MXMZ | Yes | 504 designs (`e2e/catalog-render-baseline.json`) | we beat | done |
| Wizard, no-code, graphic on air fast | uno, StreamElements, Singular, Pixla | Yes | `src/components/wizard/CreationWizard.tsx` | we beat | done |
| SVG import, every layer exposed, no renaming | MXMZ. Singular explicitly cannot; Ferryman needs underscore prefixes | No | `src/assets/svgImport.ts` (1637 lines), 47-file corpus in `e2e/fixtures/svg-corpus/` | match | done |
| Draw a shape on a blank canvas | Pixla, H2R v3, StreamElements, vMix GT Advanced ($700+) | Yes | Canvas reachable in default mode **through the import door only** (`e2e/import-graphic.spec.ts` never calls `enableAdvancedMode`). No blank-canvas entry, no rectangle gesture; `LayerType 'rect'` declared, `box` transform shipped | gap | days |
| Per-property keyframe timeline | Loopic (67 EUR/mo tier), MXMZ. Singular has no keyframes at all | Yes | `src/blocks/animEdit.ts`, `StepTimeline.tsx`, 15 properties | match | done |
| Editable easing **curves** | Loopic sells the easing editor at 67 EUR/mo; presets are on its free tier | No | Named GSAP eases in a select. No bezier handle editor | gap | days |
| Embed the designer's own licensed fonts | Rive embeds; Figma does not ship faces | Yes | Per-family upload with an embedded count (`MapSvgFieldsStep.tsx`) | we beat | done |
| Team-wide shared font and asset library | MXMZ, Flowics (metered), Singular (Enterprise) | Yes | 17 bundled faces, per-user bucket, nothing team-scoped (`src/backend/assets.ts` has no team) | gap | days |
| Version history with restore | MXMZ auto-numbers with restore; Singular ships it on the **free** tier; Ross Project Server | Yes | **Absent.** Undo in-session and saved documents. `durableStore` `previous` is a failed-write rollback, not history | gap | weeks |
| Re-import when the artwork changes | Every AE and SVG bridge faces it | Yes | **Absent.** A corrected SVG means redoing mapping, fonts and behaviour by hand | gap | weeks |
| Import After Effects / Lottie as a door | Ferryman (free, GPL-3.0), Loopic 2.3, DJ HTML Creator | Yes | Planned only (`docs/backlog/ograf-lottie-ferryman-conventions.md`). Import accept string has no `.json` | gap | weeks |
| Preserve motion authored elsewhere | Ferryman replays Lottie byte-exact; Rive's .riv is the motion; Figma exports CSS/JSON motion code | Yes | **Absent.** `svgImport.ts:379` strips SMIL by design, for a stated deterministic-playout reason | gap | months |
| One design adapting to 16:9, 9:16 and 1:1 | Vizrt (Viz Engine 5.4 headline); uno Plus does dual output at ~$2/mo | Yes | Formats are first-class per project (`projectFormat.ts`), nothing re-lays a design out | gap | weeks |
| Real-time co-editing of one file | Figma, Rive, MXMZ, Canva, Lottie Creator | No | Absent. `src/components/teams/` is sharing, not co-editing. P1 non-claim v1 | gap-wrong | quarters |
| 3D / WebGL scenes | Spline, Viz Engine, Zero Density, Brainstorm | No | Absent by design. Stage is DOM, CSS and SVG | different product | quarters |
| AR, virtual sets, camera tracking | Zero Density, Brainstorm, Vizrt, Chyron | No | Absent by design | different product | quarters |
| Charts, maps, weather engines | everviz, Flowics elections, Chyron Weather, Ross Raiden | No | Election and alert **designs** exist; no data engine | gap-wrong | quarters |

### Behaviour and logic

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Declarative authored behaviour: states, structural guards, timers, parallel groups | Rive (the reference), dotLottie (states, four guard types, GlobalState). **Nobody in broadcast** | No | Shipped: `src/blocks/animMachine.ts`, `animData.ts`, `animRuntime.ts`, `docs/STATE_MACHINE_SCHEMA.md` | match on model | done |
| Authoring feel of that machine for a non-programmer | Rive is ahead: listeners, blend states, live preview while you draw. LottieFiles matches | Yes | **Our own research says it did not land**: `docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §1, five ranked causes. Node editor sits behind Advanced mode | gap | quarters |
| A library of named behaviours attached to somebody else's artwork | **Nobody, anywhere in nine segments** | No | 16 recipes in `src/templates/behaviours/`, walked by `e2e/import-svg-behaviour.spec.ts` (119 KB) | we beat | done |
| Operator panel generated from the graphic | Singular (control nodes), Flowics (frozen at publish), MXMZ, SPX (fields only) | Yes | One generator, three receivers (`src/control/`) | we beat | done |
| Legality: a control greys out because the machine has no arrow | **Nobody.** OGraf v1 has no way for a graphic to declare valid actions | No | `controlModel.ts:392 isEventLegal`, `controlPanelHtml.ts:611` disables the button, one rule for editor, hosted page and export | we beat | done |
| An operator panel for a **stranger's** graphic | Nobody | No | `src/export/targets/ografImport.ts` + `src/control/ografContract.ts` turn a foreign OGraf Graphic into the same descriptors and buttons | we beat | done |
| Scripting escape hatch with types and autocomplete | Rive Luau with a language server and an AI agent; AE expressions; Cavalry | No | The code **is** the artefact and Advanced mode opens it, but there is no typed in-editor logic surface | partial | months |
| AI generates behaviour, not just look | Nobody. Every assembly vendor fills a hand-built template | No | 33 graphic types carry authored machines and the Pro harness can select one; no path asks a model to invent one; `patch.ts:19` bars patches from the machine | partial | weeks |

### Playout and export

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Hosted output URL with nothing to install | Singular, Flowics, MXMZ, uno, BroadcastGraphics. **No free competitor**: SPX, ograf-server, CasparCG and the OBS packs all need a local process | Yes | `output.html`, `src/output/`, `docs/CLOUD_PLAYOUT.md` | we beat (vs free stack) | done |
| Extra on-air outputs with no per-output charge | MXMZ, BroadcastGraphics. Singular taxes it, Flowics sells outputs as SKUs | Yes | `src/entitlements/contract.ts` has **no output key**; the only enforced meter is AI generation | we beat | done |
| Export as readable HTML/CSS/JS you keep | Only Loopic, which sells "Unminified templates" as a **paid row**. Singular, Flowics and MXMZ have no export at all | No | Six targets in `src/export/targets/` plus whole-show export | we beat | done |
| Export into a rival's tool | Nobody exports into a rival | No | `h2r.ts` emits the GDD block; `htmlOverlay.ts` targets OBS and vMix. Caveat: GDD was archived 2026-01-19 in favour of OGraf | we beat | done |
| OGraf v1 export against the live EBU schema | Loopic (one-click, since May 2025), Ferryman, everviz, DJ HTML Creator, Zero Density's OGraf Studio | No | Whole catalog validated against `ograf.ebu.io/v1/.../schema.json` every CI pass | match | done |
| **Interoperability** proven in a renderer we did not write | Loopic demonstrates against SPX on video | Yes | Schema-conformant is not interoperability-proven. Owner refused to assert it 2026-09-01 | gap | days |
| Run a stranger's OGraf package in the app | ograf-server, SPX-GC 1.4+, LiveOS, Erizos 3.4+, BBright | Yes | CLI only (`ografBench` via `src/bridge/ografHost.ts`). No in-app library item, no sandboxed host in preview or `/output` | gap | weeks |
| Sandbox isolation for untrusted third-party code | ograf.dev/check, ograf-devtool. ograf-server does not isolate | Yes | The pattern is load-bearing in three places (`stage.ts:143`, `VideoPlayerFrame`, `composeDocument`) and has never been pointed at OGraf hosting | gap | weeks |
| OGraf Server API face | ograf-server (no auth, no recovery), SPX Broadcast (paid) | No | Planned only. Zero source hits | gap | months |
| On-air recovery after a renderer reboot | Incumbents by redundant hardware. ograf-server has a TODO where recovery goes | Yes | `src/control/outputRecovery.ts` replays from the oldest per-graphic baseline; match clock anchored to epoch | we beat | done |
| Surviving a frozen playout browser (CEF 117) | **Nobody addresses it** | Yes | `src/validation/engineSupport.ts` with `effect: 'kills-the-file'`, nightly `engine-floor.mjs` | we beat | done |
| Driving a graphic in OBS from a different browser | Nobody free. The OBS packs use BroadcastChannel, which cannot cross engines | Yes | `src/export/local-relay/relay.py` and `.ps1`, stdlib only, double-click launchers | we beat | done |
| CasparCG over AMCP from the operator's browser | CasparCG Client (desktop), SPX (local Node) | Yes | `ProductionLinks.tsx` "Put on air" plus `cli/src/commands/caspar.ts` loopback agent | match | done |
| SDI, NDI, ST 2110 | Everyone in B; CasparCG free; SPX paid tiers | Yes | Absent. Zero source hits. Parked by the 2026-08-16 ruling | gap-wrong | quarters |
| Broadcast-legal colour and gamut check | UNRESEARCHED. No scanner looked at any vendor | Yes | **Absent.** `CanvasGuides.tsx` does safe *areas*; 16 validation modules check legibility, none checks signal legality | gap | weeks |
| Render to video with alpha | Rive, Cavalry, DJ HTML Creator, incumbents | No | `src/render/`, ProRes 4444, WebM, PNG sequence | match | done |
| NLE plugin or round trip | Ross (Avid, Premiere, Edius), Zero Density Live Link, Pixla CCX | No | DaVinci Resolve 21 imports our OGraf **for us**. One NLE, one direction, no plugin | gap | months |
| Lottie / dotLottie as an export target | DJ HTML Creator, Cavalry, SVGator, Jitter, Figma, Lottie Creator | No | Absent. Six targets, no Lottie. It is the interchange format of segment F | gap | weeks |

### Show running

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Cue rundown with preview, take and layers | Singular, Flowics, MXMZ, SPX, Pixla, Sofie, Viz Trio | Yes | `ProductionPage.tsx` (2635 lines), PVW/PGM, per-layer live cue, drag ordering | match | done |
| Per-cue duration and a recalculating running order | Ontime, Rundown Studio, Cuez, Pixla, Rundown Creator | Yes | `ShowCue` is `{id, sourceId, label, values, note}`. No duration field at all | gap | days |
| Auto-advance from a cue timer | MXMZ, Pixla, Cuez, Sofie | No | `animMachine.ts:246` caps one timer per state and `animRuntime.ts:389` arms it. Nothing at rundown level | gap | days |
| Back-timing to a hard out | Rundown Studio, Ontime, Cuez | Yes | Absent. The reason durations exist at all | gap | days |
| Import a running order from a spreadsheet | Ontime, Rundown Studio, Stagetimer, Sofie | Yes | `src/model/csv.ts` parses CSV/TSV/JSON and lands it in a **dataset**, not in cues | gap | days |
| Clip playout from the rundown | Chyron PRIME Clips, XPression Clips, Viz Trio, Pixla, Sofie | Yes | Planned. P3 clip-by-reference is AUTHORIZED and may start now. The owner: "one reason I can't use it in my productions" | gap | weeks |
| Audio: stinger hits, beds, chimes | CasparCG, OBS, vMix, H2R (Pro), Ontime. **No scanner opened this row** | Yes | **Absent.** No `<audio`, `new Audio(` or `AudioContext` outside the AI-video subsystem | gap | weeks |
| Media library beside the rundown | Pixla, Cuez Browz, Sofie | Yes | Assets belong to one template | gap | weeks |
| Prompter following the active row | Cuez, Rundown Studio, Rundown Creator, Pixla | Yes | **Absent.** The expensive half exists: `presenterBySlug()` is a read-only URL following live operator state | gap | weeks |
| Crew timer, backstage view, studio clock | Stagetimer ($210/yr, $980 offline), Ontime, Pixla, Cuez | Yes | Absent. Same presenter plumbing would carry it | gap | days |
| Stream Deck / Companion module | Companion, 814 connections, free. uno ships two Elgato products. NewBlue announces Companion support | Yes | Keyboard emulation only, gated on window focus and the playout column being on screen. No feedback to the deck, no second machine | gap | weeks |
| Switcher automation (ATEM, TriCaster) | Pixla (111 TriCaster occurrences), Cuez, Sofie, Rundown Creator Pro | No | Absent. Our graphic reaches air as a browser source, so a DSK button keys over a feed we did not make | gap-wrong | weeks |
| Multiview of camera inputs | Pixla (free), vMix, Tractus ($97 perpetual), Kiloview (free to 16 NDI), OBS built-in | No | Absent | different product | months |
| Broadcast scheduler | Pixla, Cuez | No | Absent | different product | weeks |
| MOS / NRCS ingest | Chyron CAMIO, Ross Gateway, Sofie, Cuez, HighField (8 systems) | No | Absent. Zero source hits. `PROGRAMMES.md` P4: kept possible, not built | gap-wrong | quarters |
| Rehearse the operator surface before air | Singular's data panel doubles as the control app. Loopic's actions do not run in the editor at all | Yes | `PlayoutSimulator.tsx`, three drill specs | we beat | done |
| Rehearse a whole **show** | Sofie, Cuez, any rundown vendor | Yes | Absent. We drill one machine, never a running order or a handoff | gap | weeks |
| As-run log / proof of play | Every cloud platform sells it to sponsors and rights holders | Yes | **Absent, and we delete the material.** `0029_cloud_playout.sql` §5 prunes rows older than 7 days on publish. Nothing exports the log | gap | days |

### The room

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Graphics built into the switcher | ATEM Mini media pool, TriCaster, vMix GT | Yes for that buyer | UNRESEARCHED as a competitor. We reach OBS and vMix as a browser source | UNRESEARCHED | - |
| Presentation software as the graphics system | ProPresenter, EasyWorship, slides over NDI | Yes for churches and schools | UNRESEARCHED. Our output URL fits a ProPresenter web slide and nobody has tried it | UNRESEARCHED | - |
| Scoreboard data off the venue wire | Sportzcast ScoreLinks (Daktronics, Stat Crew, Scorebird), Genius Sports | Yes for sports | Absent. Every data row in this corpus assumed REST and Sheets. **Where a school's score actually comes from is UNRESEARCHED** | gap | weeks |
| NDI in, camera inputs | vMix, Pixla, Tractus, BirdDog | No | Absent. USB is browser-reachable, NDI is not | different product | months |

### Planning

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Plan the graphics a show needs before the day | Cuez, Sofie, Rundown Creator, any NRCS | Yes | **Absent as a phase.** Every surface starts at "make a graphic". The rundown only exists once graphics do | gap | weeks |
| Teams with roles, RBAC and SSO | Loopic (SAML), Flowics Professional (RBAC), Singular (Enterprise SSO), BroadcastGraphics | Yes | Teams ship (`0053`, `0054`, `src/backend/teams.ts`). Roles are owner/member as a **UI label**; the migration says so. Zero hits for saml, sso, rbac | gap | weeks |
| Per-department read/write on one rundown | Ontime, Cuez | No | Absent. P1 stage 4 is the nearest thing | gap | weeks |
| Locked master template with permitted variations | MXMZ sells it; Flowics approximates with RBAC plus a two-stage publish | No | Planned in `SVG_IMPORT_PLAN.md` P2 and `BRAND_PLAN.md`. No implementing code | gap | weeks |
| Human approval before something airs | HighField's headline claim, Zero Density Journalist Preview, Chyron LUCI | Yes | **Partial, and better than reported.** A full moderation queue ships for audience and community content (`audienceTypes.ts`, `ModerationQueue.tsx`, three specs). It is not pointed at AI output or at graphics | gap | days |
| Training ladder with a certificate | Chyron Academy (four belts, ~150 lessons, free 90-day PRIME), Viz University (free courses, paid exams, 60-day licence) | No | `src/teach/cssReference.ts` teaches **CSS**, in Advanced mode, to the user we promised would never see code | gap | weeks |

### Data and AI

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Pull data connectors and a provider catalog | Flowics 80+ providers, Singular Data Streams, MXMZ JSONata with Opta/Gracenote/Sportradar, H2R Sheets, uno API on its free tier | Yes | **More than three of the seven scans claimed.** `src/control/liveData.ts` generates an in-template block that polls any published CSV, maps columns to fields and runs in OBS, SPX and CasparCG. `scripts/weather-feed.mjs` is a shipped REST poller driving three catalog designs. No provider catalog, no inferred mapping, and the Sheets route sits behind Advanced mode | gap | weeks |
| Authenticated live-data push | Singular (20k calls at $150/mo), H2R, SPX Broadcast (paid), uno (free tier) | No | `api/data/[...path].ts`, per-production bearer key, migration 0047 | match | done |
| Automation that runs a show off a feed with no operator | LIGR, Emergent agents | No | Data API is deliberately barred from play/stop/take. The data half runs unattended today | gap | weeks |
| Story context in, filled graphic out | HighField (five agent functions, 8 NRCS), Zero Density, Chyron, Ross+HighField, nxtedition | Yes | Selection exists (`src/ai/retrieval.ts`), filling exists (`dataIngest.ts`), nothing joins them | gap | weeks |
| Being a named engine on an assembly layer's list | MXMZ, XPression, Viz Pilot Edge, Unreal | No | Absent. `COMPETITORS.md` already admits it | gap | weeks |
| Open interchange for story context (SOM) | AP, BBC, NBCU, EBU, SMPTE, Reuters, Sky, ITV, Channel 4 and 16 participants, demoed at IBC2026 | No | Absent, and until this file **unheard of** in the repo | gap | months |
| AI that authors a whole graphic | Emergent (sells it), Zero Density (announced), Zero Density OGraf Studio (**AGPL, downloadable today**) | No | `src/ai/` Lite, Pro, harness, creative; the wizard door | contested | done |
| Agent door: an outside model authors against a validated contract | nxtedition exposes agent tools over MCP, but for a newsroom, not for authoring | No | `cli/` with MCP server and plugins, `docs/AGENT_CLI.md`, 25-cell benchmark | we beat, narrowly | done |
| Deterministic validation before air | HighField and Emergent assert it; neither publishes a mechanism | Yes | `publishGate.ts` composes validate + bench and gates gallery, hosted publish, export and the agent save; `polish.ts` reverts a patch that breaks a contract | we beat | done |
| Source traceability on aired facts | HighField ("every fact traces to a verified source") | Yes | Absent. We validate code exhaustively and facts not at all | gap | weeks |
| Spell and name check on field content | UNRESEARCHED across all vendors | Yes | Absent. The most common on-air graphics failure and 16 validators all look at pixels | gap | days |
| AI image generation inside the graphic | Emergent (prompt-to-image plus region edit), Chyron AXIS Canvas | No | Transport and a model catalog exist (`aiGateway.ts` image branch, `ModelsSection.tsx`). No surface asks for one | gap | weeks |
| On-air text translated | Chyron PRIME Translate | No | Absent. The catalog already carries a `translation` caption subtype, so the surface exists | gap | weeks |

### Business model and reach

| Capability | Who has it | Table stakes? | NoaCG today | Verdict | Effort |
|---|---|---|---|---|---|
| Free tier that produces airable output | **Nobody in A or D.** Singular watermarks, Loopic caps at 3 fields and minifies, Pixla renders demo data only | No | AGPL-3.0, no meter that can degrade an output, no watermark anywhere in `src/` | we beat | done |
| Free **and** open and self-hostable | CasparCG, OBS, Sofie, Ontime, NodeCG, Ferryman, OGraf Studio | No | Same position, one layer down. This is a **match**, not a lead | match | done |
| The only free path that reaches air with no watermark and no expiry | Nobody. Chyron gives students 90 days, Viz Artist watermarks its free output | No | True, and this is the narrow form the claim must take | we beat | done |
| Interface in the user's language | UNRESEARCHED per vendor | Yes | **Absent.** Zero i18n in `src/`, while `taxonomy.ts` carries Finnish and Swedish search terms. First-named user is a Finnish student; named reference customer is Yle | gap | weeks |
| A price page a buyer reads in 30 seconds | Pixla, Singular, Loopic, H2R, Stagetimer | Yes | A footer clause with a stale hedge | gap | hours |
| 24/7 support and an SLA | Every vendor in A and B | Yes for facilities | Absent, and structurally impossible with no paid surface | gap-wrong | quarters |
| Listed in the ecosystem directory | 29 entries at ograf.dev, seven of them editors | No | Deliberately not, by the owner's 2026-09-01 ruling, until our output runs in software we did not write | gap | days |

---

## 3. Where we are genuinely ahead

The strict test: a competitor would have to rebuild their architecture, not merely spend a month.
Three rows pass it. The rest are real leads and I mark them as what they are, which is work nobody
else has done yet.

**Architectural, and this is the moat.**

**1. Behaviour bound to a playout contract, with a generated operator surface.** This is the claim,
stated carefully, and the careful version is the strong one. Rive and dotLottie both ship a visual
state machine, and Rive's is better to author in than ours. Neither has playout, an operator, a
rundown or a notion of legality, and adding them means becoming a different company. Singular,
Flowics and MXMZ all have operator surfaces and none has an authored machine; Singular's answer to
behaviour is JavaScript composition scripting, Flowics has single-clause conditional visibility and
no scripting at all. So the defensible sentence is not "we author behaviour and they do not". It is
that we are the only product where the behaviour a person authored **is what the operator's buttons
are made of**, and a button greys because the machine has no arrow from the current state
(`controlModel.ts:392`, `controlPanelHtml.ts:611`, the same rule reused by the editor, the hosted
page and the exported panel).

**2. Generating an operator panel for a graphic we did not make.**
`src/export/targets/ografImport.ts` reads a stranger's OGraf package and
`src/control/ografContract.ts` turns it into the same descriptors and buttons every NoaCG surface
renders. A graphic we have never seen gets an operator surface with no category and no second
control system. Nothing in nine segments does this, and no scan gave it a row. It is also the
falsifiable form of claim 1: if a generated panel can drive somebody else's graphic, the generator
really is derived from a contract rather than from our own internals.

**3. Code as the artefact, with six targets off one document.** Singular, Viz Flowics and MXMZ have
no export path at all, which is not an oversight but their revenue model. Loopic exports and sells
"Unminified templates" as a paid feature row. For any cloud platform in segment A, matching this
means giving up the lock-in the business is built on. Note the correction owed to `COMPETITORS.md`:
Singular does have an HTML Widget and a Widget SDK, so "no supported path" for import is wrong. The
lock-in that is real is on the way **out**.

**Real leads that are work, not architecture.**

- **Surviving the playout browser the user actually has.** `src/validation/engineSupport.ts` carries
  per-feature `since` / `where` / `effect` data with `kills-the-file` as a value, and a nightly
  sweep. It exists because a quiz board went on air on 2026-08-06 as "just the blue line and the
  numbers" on a Chromium 111-blind engine. Nobody else in nine segments addresses this at all, and
  the reason is that everyone else either owns the renderer or does not care.
- **Recovery by log replay.** `outputRecovery.ts` replays from the oldest per-graphic baseline, and
  the match clock carries the instant a value was true rather than a tick count, so a mid-show
  reboot returns to the right minute. `ograf-server`, the reference implementation of the standard,
  has a TODO where instance recovery goes.
- **Crossing browser engines with a stdlib relay.** The free OBS lower-third packs all use
  BroadcastChannel, which cannot leave one engine. `relay.py` and `relay.ps1` are 165 and 131 lines
  of standard library with double-click launchers, and they solve the thing that breaks every free
  pack the moment the graphic is loaded somewhere else.
- **No meter that can degrade an output.** `src/entitlements/contract.ts` declares the complete
  limit vocabulary and there is no output key in it. Singular charges $100/month per extra output on
  Enterprise (and a Pro customer going from one graphic to two pays +$200/month, because the add-on
  is Enterprise-only, which is a correction owed to any public copy).
- **Sixteen named behaviour recipes.** Rive, Lottie Creator, Figma, Cavalry and Spline all make you
  build the logic from primitives. Nobody ships a catalog of behaviours you attach.
- **504 designs.** Only Flowics is close, at 140+ and only for its own users.

**One claim I am removing from the ahead list.** "AI that authors a graphic, on an axis nobody is
contesting" no longer holds. Emergent sells prompt-and-data-to-graphic today, Zero Density announced
generative HTML5 templates, and Zero Density also publishes **OGraf Studio** on GitHub under
AGPL-3.0 with built-in AI chat and MCP agents, last pushed two days before this round of research.
Three separate segment scans asserted nothing of Zero Density's had been seen running; it is
downloadable. What survives is narrower and still good: OGraf Studio's own feature list has **no
control panel and no behaviour authoring**, so the closest competitor confirms the moat by omission
rather than by our assertion.

---

## 4. Where we are exposed

### Gaps we must close, ordered by how often they bite

1. **A student breaks their graphic and cannot go back.** No version history, no restore. Singular
   gives this away on its free tier and MXMZ auto-numbers every save. We have in-session undo and
   saved documents with nothing behind them. This bites on day one of real use and it is the single
   most common thing a person needs from a creative tool.
2. **The rundown does not know about time.** No per-cue duration, no auto-advance, no back-timing to
   a hard out. Every rundown product in segments A and E has all three. The 2026-09-12 quiz is a
   sequence of timed reveals, so this bites the current push directly.
3. **The one live-data route a non-technical operator would use is behind Advanced mode.**
   `liveData.ts` is wired only into `ControlPanel.tsx`, which is the editor's Rehearse panel. H2R
   shipped Google Sheets binding in January and vMix charges $350 for it. The backlog item was
   raised 2026-09-04 and is unstarted.
4. **There is no blank page.** A user who wants a rectangle has to go and draw one somewhere else,
   then import it. `LayerType 'rect'` is declared and a `box` transform ships, so this is a missing
   gesture rather than a missing capability, but it is the one gap that pushes our own user into
   another product.
5. **We delete the record of what aired.** The command log is pruned past seven days on publish and
   nothing exports it. So there is no as-run log, no proof of play, no answer to "what did we put up
   last Friday" and nothing to review after an incident. We already hold the ordered, durable,
   baseline-anchored log that Sofie is admired for and `ograf-server` lacks, and we throw it away.
6. **A show is graphics only.** No clip, no still beside it, no audio bed, no stinger hit. The
   operator leaves our surface at the first VT and the dashboard becomes a second window instead of
   the show. The owner has already said this in his own words. P3 authorizes the clip slice; audio
   has never been scanned by anyone.
7. **Nothing for the crew.** No prompter, no stage timer, no backstage clock. Stagetimer sells the
   timer alone for $210/year and a $980 offline licence, which tells you what a live production will
   pay for one small thing done well. The presenter URL that follows live operator state already
   ships; both surfaces are that page with different content.
8. **No Companion module.** Keyboard emulation needs the window focused and the playout column on
   screen, gives no feedback to the deck and cannot be driven from a second machine. Companion has
   814 connections, is free, and is the shelf CasparCG, ATEM, vMix, OBS, Ontime, Stagetimer and H2R
   already sit on. Being absent from it is being absent from the room.
9. **You cannot paste in a running order.** `src/model/csv.ts` already parses CSV, TSV and JSON; it
   lands in a dataset instead of in cues. Ontime, Rundown Studio, Stagetimer and Sofie all import
   from a spreadsheet. This is the cheapest row in the whole matrix.
10. **The interface speaks only English.** Zero i18n, for a first-named user who is a Finnish
    student and a named reference customer who is Yle, in a repo that already localised the
    catalog's *search index* into Finnish and Swedish.
11. **A corrected SVG means starting over.** No re-import path, so the mapping, the font embedding
    and the behaviour binding are all done again by hand. For a student production with a deadline
    that is the failure that ends the workflow.
12. **A team of six cannot share a logo.** `src/backend/assets.ts` has no team scoping, and roles
    are a two-value label the migration explicitly says is not authority.
13. **Nothing checks the words or the signal.** A misspelt name is the most common on-air graphics
    failure and all 16 validators look at pixels. And for a chain that ends in SDI, a pure-white
    plate is exactly what an engineer rejects, while we check legibility harder than anyone in this
    corpus.
14. **We are on nobody's list.** Not in the ograf.dev directory (by ruling, and the ruling is
    right), not on any assembly layer's supported engines, and not in SPX's own article on how to
    create HTML graphics, which names Ferryman, Loopic, Rive, Adobe Animate, Godot and Lottie
    Creator. SPX is a target we support and a gate we pass. That absence is marketing debt, not
    capability debt, and it is fixable this month.

### Gaps that are wrong for us, and why

**SDI, NDI and ST 2110 output.** Every rival's "SDI support" turns out to be a customer's Windows
box running OBS, TouchDesigner or CasparCG pointed at a browser URL, which is exactly what our
export already feeds. BroadcastGraphics.io sells its offline capability as a Windows app. Buying
this row costs a desktop client and a pacing contract that is unsolved outside CasparCG, and returns
nothing a student can use. The 2026-08-16 parking ruling is right and this round strengthens it.

**A MOS gateway.** MOS is a TCP protocol on ports 10540/10541 that needs a process on a newsroom
LAN, it serves buyers who do not exist for us, and Sofie already does the job free with a national
broadcaster behind it. If the Story Object Model lands, the input to the assembly layer becomes a
public schema consumable over HTTPS from a browser, and a MOS gateway will have been the expensive
way to buy the same thing. Build the cheap half: let a running order arrive over HTTPS, which the
Data API is already shaped for.

**Multiview.** Tractus sells the real thing for $97 perpetual, Kiloview gives away 16 NDI channels,
OBS has one built in and Pixla gives theirs away as a 96 MB download because a multiview is a lead
magnet. The market rate is approximately zero.

**A scheduler and a 3D studio designer.** Facility booking and set planning are different products
wearing the same subscription.

**Switcher automation.** Not a cost problem, a signal-path problem: our graphic reaches air as a
browser source, so a DSK button would key over a feed we did not produce. The correct inverse is a
Companion module, which needs no device protocol and reaches every switcher Companion drives.

**Platform-event alert triggers.** Automatic follower, sub and donation alerts mean OAuth against
Twitch and YouTube, per-platform webhook infrastructure and a permanent maintenance tax on APIs we
do not control, to win a user whose product is free, entrenched and monetised through merchandise.
The designs already exist; an operator cueing them by hand is the right answer for a school, a
church or an esports team.

**Conversational live control.** "Ask for what you need" mid-show is a trade-show demo. A generated
panel where every legal action is a button and every illegal one is greyed is strictly better under
time pressure, and we have it.

**Real-time co-editing of one graphic.** It is P1's stated non-claim, it is quarters of CRDT work,
and the collaboration a school actually needs is a shared production and a shared asset library,
which are both cheaper.

**24/7 support and an SLA.** Structurally impossible with no paid surface, and it should be said out
loud in the public copy rather than left as a hole a buyer discovers.

**A paid tier to match H2R's $80.** Free-forever is the wedge precisely in a segment where the
incumbent's free tier is deliberately capped to one output. Our free tier should be better than
uno's paid one.

---

## 5. What we should have

Build order, in four tiers. Every item names its effort and what it unlocks. Where an item sits
under `## NEXT`, `## THEN` or `## Parking lot` in `docs/GOALS.md` it is **parked**, and where I want
it pulled up I say so and give the reason.

### NOW - serving the 2026-09-12 production

These are the current push's own items plus four additions that serve the same date. Nothing here is
a new subsystem.

1. **Text has to know its box.** Already the named blocker in GOALS.md, design in
   `docs/TEXT_BOX_BINDING.md`. Unlocks step 3 of the push. Effort: as scoped there.
2. **Cue durations and auto-advance.** Effort: days. Unlocks the quiz walking as a timed sequence
   instead of a person pressing next on cue, and it closes a GAP row that every product in segments
   A and E holds. The machinery exists: `animMachine.ts` already caps one timer per state and
   refuses a timer on an endless timeline, and `CONTROL_PANEL_ROAD.md` already calls this "cue
   metadata driving the existing verbs, not architecture". **Pull-up requested**: this sits parked
   under P3's rundown v2 and in the CONTROL_PANEL_ROAD parking. The reason to pull it: a show is
   asking, and it is the cheapest row on the whole page relative to what it unlocks.
3. **Version history with restore.** Effort: weeks, and days for a minimum that keeps the last N
   saved documents with a restore button. Unlocks a student surviving their own mistake an hour
   before the show, which is the failure mode most likely to end a real production badly. The
   durable store already versions its persisted format, so keeping a chain of prior documents is
   closer than it looks. **Pull-up requested**: this is in the Parking lot as "Cloud playout stages
   2-4: versions + rollback". The reason: Singular gives it away on its free tier, MXMZ auto-numbers
   every save, and it is the only capability on this page that two rivals ship, that a production
   tool is incomplete without, and that we have in no form at all.
4. **Move the Google Sheet binding out of Advanced mode.** Effort: days. The design is already
   written in `docs/backlog/the-google-sheet-route-is-behind-the-editor-toggle.md` (raised
   2026-09-04, unstarted). Unlocks a non-technical operator filling a scoreboard from a sheet, which
   is exactly the 2026-09-12 shape, and it turns a shipped feature into a visible one.
5. **Export the command log before it is pruned.** Effort: hours to days. One button that writes
   what aired, when, with what values, as CSV or JSON. Unlocks an as-run record, a handover to next
   week's operator, an incident review, and eventually proof of play, which every cloud rival sells.
   We already hold better raw material than the reference OGraf server and we currently delete it
   after seven days.

### NEXT

6. **Clip playout by reference.** Effort: weeks. Already AUTHORIZED under P3 and may start now.
   Unlocks the operator staying on our surface through a VT, and it is the owner's own named reason
   he cannot use NoaCG in his productions. The file never travels through the web; we send a
   reference and CasparCG plays it.
7. **Audio beds and stinger hits in the same way.** Effort: weeks. P3 says "audio beds the same way"
   and no competitive scan ever opened an audio row, so this gap has been invisible rather than
   considered. Unlocks a reveal that lands and a countdown with a bed.
8. **The OGraf ladder as ratified, in its own dependency order.** Sandbox isolation, then import,
   then foreign-package playout on `/output`, then the Server API face. Effort: weeks each, months
   for the Server API. Already AUTHORIZED under P6 and may start now. Unlocks being a place other
   people's graphics run, which is the scarce half of that ecosystem: seven editors and everybody
   exports, while good playout is thin and the reference server has a TODO where recovery goes. Our
   command log is the advantage here, not a catch-up.
9. **Play one of our packages in software we did not write.** Effort: days. `ograf-server` or SPX-GC
   1.4. Unlocks the one claim the owner has explicitly refused to assert on 2026-09-01, and it sits
   under the whole P6 ladder. Schema conformance and interoperability are different evidence rungs
   and we currently only hold the first.
10. **A Bitfocus Companion module.** Effort: weeks, plus an owner ruling. Unlocks hardware button
    control from any machine in the room, feedback back to the deck, and being on the shelf beside
    CasparCG, ATEM, vMix, OBS and Ontime. **Two things to say honestly.** It is the last of four
    items in P4, which is at IDEA. And its prerequisite is not engineering: `docs/DATA_API.md`
    deliberately refuses commands, and P4 already writes the answer, that a playout-command API is a
    new consented permission and not an extension of the data key. So the ask to the owner is a key
    scope, not a build. **Pull-up requested** for the scope ruling only.
11. **Prompter and crew timer off the presenter URL.** Effort: days for the timer, weeks for the
    prompter. One piece of work, because `presenterBySlug()` already delivers a read-only page that
    follows live operator state on a phone. Unlocks the two surfaces a live show needs that we
    cannot currently give it, at a fraction of what Stagetimer and Cuez charge for them separately.
12. **Import a running order from a spreadsheet into cues.** Effort: days. `src/model/csv.ts`
    already parses the file. Unlocks a teacher pasting the quiz bank in instead of typing 30 cues.
13. **A blank canvas door and a rectangle gesture.** Effort: days. Unlocks the user never leaving
    for another tool, which is the only gap in the Pixla read that forces our own user out of the
    product.
14. **Re-import a corrected artwork without losing the binding.** Effort: weeks. Unlocks the
    designer fixing the logo on the morning of the show.
15. **Team-scoped fonts and assets, and roles that mean something.** Effort: weeks. Unlocks P1 being
    useful to a class rather than to two people, and it is what every product in segment A sells as
    the org story.
16. **Point the shipped moderation queue at AI output.** Effort: days. The queue exists with `new` /
    `approved` / `rejected`, an immutable original beside an editable broadcast copy, and three e2e
    specs. Unlocks the human gate every vendor in segment G leads their pitch with, for a fraction
    of a new build.

### LATER

17. **Story in, filled graphic out, over text and HTTPS.** Effort: weeks. Both halves exist and are
    not joined: `retrieval.ts` ranks the catalog against a brief, `dataIngest.ts` writes field
    values into a live production. Unlocks moving from absent to present in segment G without a
    single MOS connection.
18. **Track the Story Object Model and implement it the day there is a schema.** Effort: months when
    it exists. Same shape as the OGraf bet, with the EBU and SMPTE among the champions. Add a dated
    block to this file after IBC2026. Note the honest caveat that no scanner spotted: HighField was
    on the winning team of the 2025 IBC Accelerator, so the vendors with most to gain from private
    story context are co-authoring the standard for it.
19. **One design adapting across 16:9, 9:16 and 1:1.** Effort: weeks. This is the one capability
    where our technology is right and theirs is wrong: CSS was built to re-lay-out a design at
    another size and Vizrt is doing it inside a scene graph. Unlocks a claim we can make honestly
    and they cannot make cheaply.
20. **A Lottie and After Effects import door, plus Lottie as an export target.** Effort: weeks each.
    The backlog item is scoped, the player is vendored and already inlined by every target. Unlocks
    the working broadcast designer, who does not hand you an SVG. Consider the cheaper door first:
    Figma Motion now hands over CSS and JSON animation code from Dev Mode, which for a code-as-truth
    product is a better-matched input than a sealed artefact.
21. **A training ladder with a certificate.** Effort: weeks. Chyron and Vizrt both seed schools
    deliberately and a certificate is what a student takes to an interview. Ours would be free all
    the way to air, which theirs is not. Also: point the existing teaching surface at the operator
    rather than at CSS.
22. **Localise the interface.** Effort: weeks. Finnish first, for reasons that should not need
    arguing.
23. **Broadcast-legal colour checking, and a spelling check on field content.** Effort: weeks and
    days. Unlocks the two failures an engineer and an audience actually notice.
24. **Source traceability on data-driven fields.** Effort: weeks. Unlocks the sentence HighField
    leads with, and it is cheap because an update row could carry a source today.
25. **On-air translation.** Effort: weeks. The catalog already carries a translation caption
    subtype, so the surface exists and only the translator is missing.
26. **Research the buyer, the switcher's own graphics, and presentation software.** Effort: days
    each of reading, and it is overdue. Every price claim on this page is a claim about a purchasing
    decision nobody has studied.

### NEVER

Each of these is a deliberate refusal with a reason, and the reason is in section 4: our own
SDI/NDI/2110 renderer; a MOS gateway; a multiview; a broadcast scheduler; a 3D studio designer; AR,
virtual sets and camera tracking; telestration over live video; weather and map data engines;
switcher device automation; platform-event OAuth alert triggers; conversational live playout
control; a desktop client as the product; 24/7 support with an SLA; any paid surface; real-time
co-editing of one graphic in v1. And one process refusal: **no third authoring surface for behaviour
before the two cheap tests in section 6 have been run.**

---

## 6. The strongest argument against this whole plan

The owner's brief is "we want NoaCG to be an all-around broadcast tool", and section 5 answers it
with a list of rundown, timer, prompter and audio work. The case against that answer is strong and
deserves its best form.

**The case against.** An all-around tool wins only where the seams between tools cost more than the
tools do. In this market they do not, because every adjacent layer is already free and better than
anything a graphics team would build beside a graphics product. The rundown is free, mature and
open: Ontime is GPL-3.0, self-hostable, browser-based, with multiple rundowns per project,
per-department read/write, Excel import, OSC, HTTP and WebSocket APIs, a Companion module and an MCP
server. It holds NoaCG's exact strategic position one layer up. The control surface is free and
universal: Companion, 814 connections, no hardware required, already speaking to CasparCG, ATEM,
vMix, OBS, Ontime, Stagetimer and H2R. The switcher is free (OBS) or $349 with its own media pool
and keyer. The playout is free and twenty years old. The automation is free and airs national news
at NRK, the BBC and TV 2 Norway.

Bundling commodities buys no moat. It buys maintenance. And the corpus shows what the bundle looks
like from outside when it competes: Pixla sells graphics, rundown, prompter, timer, playout and
switcher automation for 19 EUR a month, and its own features page fails to mention four of the
things its homepage advertises.

The cost is not hypothetical. This checkout already carries more surface than several funded vendors
on this page, maintained with no revenue under an explicit no-paid-surface principle. Free forever
means every new subsystem is a permanent unfunded liability. `AGENTS.md` already rations
browser-driving jobs to one per machine because the laptop is RAM-bound. A prompter, a timer, a
scheduler, a media library and a multiview are five more subsystems competing with the catalog and
the control layer for a budget that will not grow.

And the failure mode is documented in this repository rather than imagined. `docs/WYSIWYG_PLAN.md`
records why attempt one did not land: the editor was a destination no task led into. What landed
instead was task-entered gestures on the user's own artwork. An all-around tool is a machine for
manufacturing destinations no task leads into, a prompter nobody opens because the script is in
Google Docs, a scheduler nobody opens because the calendar is in Teams.

**Where I land, and why.**

I think the critic is right about scope and wrong about the boundary, and the difference is where
you draw the line between "the show" and "the graphic being a first-class part of the show".

Read "all-around broadcast tool" as all-around **reach** rather than all-around **scope**: one
graphic, any behaviour, any target, driven from anywhere, and logged afterwards. Everything in the
NOW and NEXT tiers passes that test. A cue with a duration is not a rundown product, it is our cue
failing to say when it ends. A clip beside it in the same running order is not a media server, it is
our rundown refusing to hold the thing the show actually cuts to. An audio bed is not an audio
product, it is the reveal landing. An as-run export is not a compliance system, it is the log we
already keep, kept. A Companion module is not a control room, it is us becoming a first-class
citizen of somebody else's.

Everything in the NEVER list fails that test, and so does the version of the plan the critic is
arguing against. The right move at every adjacent layer is integration rather than absorption, and
it costs a fraction as much: a Companion module is a small Node module in their repository, the
Server API face is a facade over a log we already have, running-order import is a parser we already
ship pointed at cues instead of datasets. That makes NoaCG a first-class citizen of every show in
this corpus rather than the fifth-best rundown in it.

The positive form of the argument is already in our own file. `COMPETITORS.md` on the OGraf
convergence: a commodity interchange favours whoever has the better surfaces on top of it, provided
the surfaces really are better. Better, not more. The two surfaces OGraf does not standardise are
authored behaviour and generated control, and every hour spent on a scheduler is an hour not spent
widening the one part of the stack where a rival would have to rebuild an engine to follow.

**Where I do not get to resolve it with an opinion.** The moat claim is the most load-bearing and
least verified thing in this whole corpus, and I will not pretend otherwise. Our own research says
the node editor did not land, GOALS.md says two surfaces have been tried and neither worked, the
2026-09-12 plan reads "the student draws the graphic; **we** supply the behaviour" with
customisation explicitly out of scope, and nobody outside the project has ever been watched
authoring or re-parameterising a machine. Meanwhile Rive's authoring feel is judged ahead of ours by
our own segment scan, and LottieFiles will now write a state machine from a prompt.

So two tests are owed before P2 round 2, and both are an afternoon.

- **Put the sixteen recipes in front of two people who have never seen the product.** If a
  non-programmer can attach and re-parameterise a behaviour, the claim is real in the form section 3
  states it. If they cannot, the honest position is that our differentiator is a *catalog* of
  behaviours rather than an authoring surface, which is still valuable, is still uncontested, and
  points at completely different work: more recipes and more binding, not a third editor.
- **Play one of our OGraf packages in `ograf-server` or SPX-GC 1.4.** This closes the other
  explicitly unverified load-bearing claim, that schema conformance equals interoperability, which
  the owner already refused to assert.

And a falsifier for the whole integration bet, so this is a position rather than a preference: **if
in six months the schools that adopt NoaCG also adopt Ontime and Companion and are content running
three tools, integration was right. If they bounce because "it is five different things", the bundle
was right and this section is wrong.** That is a question about the buyer, and the buyer is the
biggest UNRESEARCHED item on the page.

---

## 7. How to keep this file honest

**Refresh is TIME-driven, never commit-driven**, exactly as `COMPETITORS.md` handles it. Nothing
here changes because our code changed. Each block carries the date it was read; treat anything older
than a quarter as stale rather than wrong. This whole file was read on **2026-09-07** unless a block
says otherwise.

**UNRESEARCHED is the honest word and it should make you uncomfortable.** Three things on this page
carry it and each is a half-day of reading: the switcher's own graphics (ATEM media pool, TriCaster,
vMix GT as a graphics system rather than a device), presentation software as the graphics system
(ProPresenter, EasyWorship), and the buyer. The last one is not a vendor read at all, it is asking
three schools and two churches what they already own and how they decide, and it would change more
rows on this page than any competitor re-read.

**Evidence grades stay marked.** Marketing copy is what a company sells. Vendor documentation is
better. Shipped code, a public repository or a product driven by hand is best. This round's failure
mode was consistent and worth naming: every error the verification passes caught would have been
avoided by one more click onto the primary source. Reseller prices attributed to vendor pages,
twice. A competitor's public GitHub repository missed while three scans asserted nothing of theirs
had been seen running. A press-release format claim used to argue a capability gap.

**Corrections owed to `COMPETITORS.md`.** These are verified wrong or stale in the sibling file and
should be edited there:

- Singular has an **HTML Widget** and a Widget SDK, so "no supported path" for importing third-party
  HTML is wrong. Move the "we beat" to the way out, where there is genuinely no route to take a
  composition off the platform as files.
- Singular and Loopic are described as "largely UNRESEARCHED" and Loopic as "the single biggest hole
  in this file". That is a cross-reference failure, not a research failure:
  `docs/EDITOR_RESEARCH.md` §2 and `docs/CONTROL_PANEL_RESEARCH.md` already carry dense reads of
  both. What is genuinely missing across all three files is the **commercial** layer, and that is
  where the sharpest facts turned out to live.
- The AI verdict "an axis nobody else is contesting" is superseded twice over: Emergent sells it
  today, and Zero Density publishes **OGraf Studio** publicly (AGPL-3.0, browser, built-in AI chat,
  MCP agents). The Zero Density block's "nothing has been seen running" is false.
- SPX is not simply free. It is the free rung of a four-tier ladder ($59.99 Solo one-off, $600/year
  Production, Broadcast quoted), the open edition caps at five layers, and the Server API, MOS/NRCS,
  in-layer transitions and SDI/NDI are paid. Every doc here describes SPX as our free host and
  stops.
- Rive is described as "not a broadcast product". Rive now publishes a broadcast and live-events
  use-case page with four case studies including a state-machine-driven scoreboard, and it has been
  on air at Games Done Quick driven from a Node broadcast framework. The "different product" line
  needs a date on it, and the authoring-feel row should read **behind**, not **unjudged**, on our
  own research's evidence.
- Ferryman is **GPL-3.0**, not AGPL-3.0.
- The ograf.dev directory is a community hub, not the EBU's, and it now holds 29 entries. Loopic is
  not the only commercial browser editor in it; everviz is a second.

**Numbers that must not reach public copy as stated anywhere in this corpus**, because they are
wrong in the direction a competitor would enjoy correcting: Singular's $100 per extra output is
Enterprise-only (a Pro customer going to two outputs pays +$200/month); Loopic's free tier caps at
**60** frames, not 30; Viz Flowics publishes **no** price and the $292-$990 figures came from a
reseller and an upgrade SKU; Streamlabs Ultra advertises from $15.75/month on its own page; After
Effects for Teams is $99.99/month on Adobe's page, not $37.99; and our catalog is **504 designs**
from the pixel baseline, not the 621 TypeScript file count.

**How to use this file.**

- A **gap** row is a candidate piece of work, not a commitment. It competes with everything else in
  the drain order.
- A **we beat** row is a marketing asset and should be findable in the public copy. If it is true
  and nobody outside can tell, that is its own gap, and section 3 has at least three of those.
- A **gap-wrong** row is an argument, and it should be re-argued when its reason changes rather than
  carried forward as a habit.
- When this file and `COMPETITORS.md` disagree, this file is newer. When either disagrees with the
  repository, the repository wins.