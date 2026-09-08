# COMPETITORS.md - the capability matrix

**What this is.** One page holding, per competitor and per capability: what they have, whether we
match it, whether we beat it, and where the gap is. It is the standing answer to "are we behind on
anything that matters", and its rows are candidate work for the orchestrator - a **GAP** row is a
thing somebody could pick up tomorrow.

**This file is per-VENDOR. [`LANDSCAPE.md`](LANDSCAPE.md) is the map above it** (added 2026-09-07):
the whole market divided into its seven layers with the buyer and the price for each, one unified
capability matrix across all of them, and the ordered requirements list for what NoaCG has to be.
Read that one when the question is "what should we build"; read this one when the question is
"how do we compare to X". Where the two disagree, LANDSCAPE.md is newer.

**Refresh is TIME-driven, never commit-driven.** Nothing here changes because code changed; it
changes when somebody re-reads the competitor's public material. Each block carries the date it was
last read. Treat anything older than a quarter as stale rather than wrong.

**Sources are public material only.** Most of this file is assembled from
`docs/COMPETITOR_MXMZ.md` (read 2026-08-22, re-read 2026-08-28), `docs/GOALS.md` "Who we are
replacing", and
`docs/EXPORT_TARGETS_RESEARCH.md`. Where a block has no such doc behind it, it carries **its own
dated read with the URLs in the block** - that is the only new research this file may hold, and it
is a read of somebody's public material, never an analysis written without looking. Where a cell says UNRESEARCHED it means nobody has looked, which
is different from "they do not have it". Marketing copy is strong evidence about what a company
SELLS and weak evidence about what it ships; a row that would change an architecture decision gets
re-checked in a demo before it does.

---

## The OGraf convergence - read 2026-09-01

**The most important movement on this page, and it is not one competitor.** Through 2026 OGraf went
from a spec document to the layer several vendors are meeting on - and they arrive at it from
DIFFERENT directions: editors, AI creation tools, controllers, renderers, and now post-production.

- **EBU** froze the **Server API at v1, stable and production-ready, 2026-08-13**, beside the
  Graphics spec (2025-09-17); changes from here are backwards-compatible or optional
  ([ograf.ebu.io](https://ograf.ebu.io/)). OGraf is a named technology demonstration on the EBU's
  own IBC2026 stand **10.D21** - *"open, agile, unified: the new specification for dynamic media
  graphics"* ([tech.ebu.ch](https://tech.ebu.ch/events/ebu_at_ibc2026)).
- **BBright** announced an OGraf graphics engine inside its UHD / ST 2110 software playout,
  2026-08-12.
- **Zero Density** announced AI-assisted HTML5 generative templates in the same breath as OGraf,
  2026-08-21 - block below.
- **DaVinci Resolve 21** (June 2026) imports OGraf natively as rendered animation clips, which puts
  the format in POST, not only on air.
- **ograf.dev**, a community hub outside the EBU (repo created 2026-04-17, active through August),
  carries a ~25-entry ecosystem directory and a public package validator at `ograf.dev/check`.
- **TV2 Denmark** presented OGraf carrying a national election at the EBU Network Technology
  Seminar, 2026-06-09.

**What it means, and it is the strategic point:** this market is **not** shaping into "one OGraf
product wins". It is an interchange layer with many vendors either side of it. That is the argument
FOR the sequencing already ratified in `docs/GOALS.md` "NEXT - OGraf-first" - make OGraf the
contract, and differentiate on what the contract does not standardise: the editor, the agent/CLI
creation door, the generated control layer, and eventually our own renderer. A commodity interchange
format favours whoever has the better surfaces on top of it, provided the surfaces really are
better.

**What it costs us:** any capability we hold that OGraf standardises stops being a differentiator
the day a rival ships it, and export breadth is the first to go. The two that are ours and are NOT
in the spec are authored BEHAVIOUR and generated control (`docs/STATE_MACHINE_SCHEMA.md`,
`docs/CONTROL_LAYER.md`). That is where the moat has to be.

**We are not in the ograf.dev directory.** The bar is four fields and a pull request
(`CONTRIBUTING.md` in `ficosta/ograf`), so it is not a capability gate - the owner ruled 2026-09-01
to wait until our own OGraf output has been watched running in software we did not write, rather
than list on an assertion.

---

## MXMZ - the one Yle named as the working model

Read 2026-08-22, re-read 2026-08-28. Full account: `docs/COMPETITOR_MXMZ.md`. Cloud-native HTML5/SVG
graphics, spun out of Banijay's sports arm, in Grass Valley AMPP, price floor under $3,000/year.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| SVG import, every layer exposed | Yes, from Illustrator / Figma / Canva, no renaming ritual | SVG import v1, the current push | **Match, unproven at their scale** |
| Keyframe timeline as the primary surface | Yes, frame-accurate, every layer and property, trained in one day | Timeline v2 exists, sits in Advanced mode, nobody is taught it | **GAP** - not the feature, the teaching |
| Authored behaviour / logic | **Nothing public shows them authoring logic at all.** This covers AUTHORED LOGIC only - it is not a claim about AI or automation, see the two rows below | Full state machine: structural guards, parallel groups, timers, snap, serial queue, inside the template | **We beat**, on logic |
| AI-assisted assembly from newsroom context | **Not built by MXMZ - but MXMZ is one of four engines HighField AI drives** (story analysis, asset retrieval, data verification, layout, template selection + playout mapping; NRCS in, filled package out, human sign-off before air) | Nothing takes a story, a rundown or a running production as input; no assembly layer lists us as an engine | **GAP, and the biggest one on this page** |
| AI that AUTHORS a graphic | Nothing public, from them or from HighField - the templates are made by hand in XPression, Viz, Unreal or MXMZ | The agent door (`docs/AGENT_CLI.md`) and Create with AI: a chat produces a complete, validated, benched, playable graphic | **We beat**, on an axis nobody else is contesting |
| Third-party playout reach | Grass Valley AMPP; ToolsOnAir just:live / just:play pro 2026 names MXMZ templates on macOS SDI/NDI | **SPX is on that same ToolsOnAir list**, so our canonical format reaches it - unclaimed, and never tested by us | **Match on paper, untested** |
| Control panel | Hand-built per vertical (Match Control, per-sport panels) | GENERATED from the machine, every event a button, legality mirrored as greying | **We beat** |
| Live data binding | JSON, Opta / Gracenote / Sportradar and custom APIs | The production DATA API (`docs/DATA_API.md`), update rows in the control log | **Match** |
| Version control with rollback | Yes, every adjustment logged, rollback to any iteration | Undo and saved documents | **GAP** |
| Locked master template + local variations | Yes, sold as the org story | Open in `docs/SVG_IMPORT_PLAN.md` P2 | **GAP** |
| Team font library | Uploaded once, shared across the team | Per project | **GAP** |
| MOS / CII newsroom integration | Yes | No | **GAP**. Re-weighted 2026-08-28: nobody asked, but the NRCS is where the assembly layer gets its input, so this is the door that row depends on |
| Auto-advance timers on the rundown | Yes | The machine already has timer transitions; the rundown does not expose them | **GAP**, cheap |
| Multi-channel as a first-class concept | Unlimited channels, each with its own library and data | Productions, one persistent output URL each | **Match** |
| Audience-facing plane | Nothing public suggests one exists | Join page, vote-to-air, presenter view | **We beat** |
| Export, and owning the files | Cloud-first, Docker escape hatch; the graphic is not a folder you keep | Six targets, the files are yours | **We beat** |
| Catalog | They import your design; they do not hand you designs | ~500 designs | **We beat** |
| Price | Under $3,000/year floor | Free forever, self-hostable, open | **We beat** |

**The strategic read, corrected 2026-08-28:** their architecture still has no place to put a library
of named behaviours a person attaches to their own artwork, and that is what the 2026-09-12
production tests. What has to sit beside it: the AI competition in this market is **not** about
generating a graphic - nobody sells that. It is an **orchestration layer above the graphics engine**
that selects an existing template and fills it from newsroom context at rundown scale, with a human
gate before air. MXMZ did not build that layer; MXMZ became a supported output of it. **We are not
on any such list**, and that absence is the honest AI verdict for this page. **Amended 2026-09-01:**
"nobody sells generating a graphic" was true of MXMZ and is no longer true of the market - Zero
Density announced AI-assisted HTML5 generative templates for IBC2026 (block below). Nobody has seen
that product, so it moves no verdict yet; it does make this a claim with a date on it rather than a
standing fact. Full account:
`docs/COMPETITOR_MXMZ.md` section 8. What it means for the CLI: `docs/backlog/cli-roadmap.md`.

## Pixla - a control room in a box, with a designer inside it

**Read 2026-09-07.** Full account, with the plan: [`COMPETITOR_PIXLA.md`](COMPETITOR_PIXLA.md).
Sources: [pixla.graphics](https://pixla.graphics) home, `/features`, `/pricing`, `/downloads`, plus
their **shipped client code**, which is served publicly without an account - the controller at
`/controller` (a single 1,044,216-byte HTML file) and the designer bundle at
`/Functions/ografDesigner.js` (272,341 bytes). That second grade of evidence is what makes this block
worth more than the marketing, and it contradicts the marketing four times.

A browser and Electron product that puts a rundown at the centre and hangs the whole room off it:
prompter, stage timer, media library, video playout, TriCaster and (claimed) Blackmagic ATEM
automation, a scheduler, a 3D studio designer, a Premiere Pro extension, and a separate free-forever
local multiview for USB and NDI. EUR 19/month for one operator, EUR 89/month for a team, on-prem
quoted; **the free tier renders demo data only, so nothing you make is yours until you subscribe.**
They are primarily a **control-room** competitor and only secondarily a graphics one.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| A rundown as the operational centre | Rows with duration, show blocks, one production clock, notes | An ordered cue list over a graphic pool, ~40 tests; no durations, no blocks, no show clock | **Match on the list, GAP on time** |
| Operator legality | A rundown, and whatever the operator remembers | Generated from each graphic's own state machine; a button greys because the machine has no arrow | **We beat** |
| Recovery after a renderer reboot | Nothing public says | Log replay, gap-fill, a match clock that survives because the wire carries the instant a value was true | **We beat** (a claim about their silence) |
| Drawing shapes on a canvas | Text, shapes and images on a 16:9 canvas | `select`, `text`, `area-text`. No rectangle. Shapes arrive only as imported SVG | **GAP** - the one that forces our user into another tool |
| Keyframe timeline | Start/hold/end with keyframes and easing | Cue-segmented steps, 15 keyframable properties, per-keyframe ease, every gesture a readable code diff | **We beat** |
| OGraf as the format | Sold as native, and the designer is named for it. Their bundle contains no `.ograf.json`, no `supportsRealTime`, no `stepCount`, no `renderRequirements`, no `customElements.define` - only `playAction`/`stopAction`/`updateAction` | 1470 manifests validated against the EBU schemas every CI pass; driven through SuperFly.tv's `ograf-server` | **We beat, pending the probe.** On present evidence we are more OGraf-compliant than the company using OGraf as its product name |
| Interoperating with the open playout stack | Zero occurrences of CasparCG, vMix or SPX in the shipped controller. A closed loop: their renderer, NDI, TriCaster | One document, six adapters, SPX the strictest gate | **We beat** |
| TriCaster control | Shipped and substantial - 111 occurrences, with an arm-then-go-live interlock | None | **GAP, wrong for us** - our graphic reaches air as a browser source, so a DSK button would key over a feed we did not produce |
| ATEM control | In the page title, in the features copy, and **zero times in the shipped controller**. Plausibly Electron-only | None | **Unverified on their side** |
| NDI in and out | 391 occurrences; their own comment confines the real NDI path to the Electron desktop build | None, and a browser cannot do it | **Different product** |
| Prompter and stage timer | Info Notes to a reading display with WPM; a room-facing timer with speaker notes | A presenter page ships with its own slug, RPC and styling - and can only display an audience submission | **GAP**, and cheap: `control_shows.live_cue` already holds the live cue and the payload already carries every label and note |
| Video clips in the rundown | Clips, timed windows, fallback playlists | Graphics and stills only; a cue is always a graphic, enforced at the write | **GAP**, with the unattended half **wrong for us** |
| Media library | Synced from a TriCaster, ATEM or media server | Assets belong to one template; a Brand look carries a typeface and logo across graphics | **GAP** |
| Scheduler and 3D studio designer | Day/week/timeline bookings; cameras, lights, screens, furniture | Nothing, and nothing intended | **GAP, wrong for us** - see the never-list in the full account |
| Desktop apps | macOS DMG and Windows EXE, v1.0.24, plus a free 96 MB multiview | None. Everything is the browser plus a stdlib relay a student double-clicks | **GAP, wrong for us** |
| Live graphics into post | A Premiere Pro CCX extension | ProRes 4444 with straight alpha for any NLE, plus OGraf non-real-time with deterministic seeks. Neither has been opened in an NLE | **Match, unproven** |
| Free tier | Demo data only | Everything works free; publishing a hosted show costs a free signup | **We beat** |
| Price and openness | EUR 19 / EUR 89 / quote | Free, AGPL-3.0, self-hostable, no paid surface and none planned | **We beat** |
| A pricing page a buyer reads in 30 seconds | Yes, four tiers | None. The claim is a footer clause carrying a stale hedge | **GAP** |

**The strategic read.** The reflex this block creates - start closing rundown rows - is the trap.
Every surface in their controller is one any rundown vendor ships, none of it is in the OGraf spec,
and a rival's next release erases the advantage. The part of the control room that decides whether a
student can run their own drawing is already ours and already ahead. Three things actually follow.
**One**: the only capability here that forces our own user out of the product is that they cannot
draw a rectangle, and the verification pass found the expensive half already built -
`src/blocks/registry.ts` holds shipped `box` and `accent-line` transforms, `src/model/types.ts`
already declares `LayerType` `'rect'`, and a drag-a-box gesture ships in the import wizard.
**Two**: their switcher story is not a cost problem for us, it is a signal-path problem - our graphic
reaches air as a browser source, so the right answer is the inverse direction already registered as
programme P4, a scoped playout-verb API plus a Bitfocus Companion module, which needs no device
protocol and works for every switcher Companion drives. **Three**: whether Pixla is a distribution
channel or only a rival turns on one unanswered question, and it is now sharper than "will they play
our package" - it is whether their OGraf is a format or a name. One month of their Subscriber tier
answers it (**needs: money**, **needs: account**).

## Singular.live

Last read 2026-07-09 (`docs/EXPORT_TARGETS_RESEARCH.md`), plus `docs/GOALS.md`. Cloud graphics with
a browser control room and playout that reaches air. **They do most of what we intend**, so the gap
to open is breadth over equivalent cloud playout rather than any single feature.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| Cloud authoring + browser control room + playout to air | Yes, the whole chain, proven | The whole chain exists (`docs/CLOUD_PLAYOUT.md`); proven on the owner's hardware, not at their scale | **Match, unproven at scale** |
| Importing third-party HTML | **No supported path** - a closed cloud composer | Every graphic is real HTML you can take anywhere | **We beat** |
| Breadth of export targets | Their own playout | Six targets plus whole-show export | **We beat** |
| Everything else | UNRESEARCHED | | Nobody has read their material properly since 2026-07-09 |

## Loopic

Last read 2026-07-09. HTML broadcast graphics, the **closest positioning to ours**.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| Timeline and canvas editing | The bar Advanced mode has to beat | Timeline v2 and the canvas exist | **Unjudged** - nobody has put them side by side |
| LiveOS integration | A legacy `templates.json` export into a LiveOS templates folder | We reach LiveOS through OGraf, which cannot drift | **We beat**, on robustness |
| Everything else | UNRESEARCHED | | The single biggest hole in this file, given the positioning overlap |

## Zero Density

**Read 2026-09-01**, from public IBC2026 material only: an
[ibc.org preview dated 2026-08-21](https://www.ibc.org/production/news/zero-density-unites-graphics-and-newsroom-workflows/22794),
the EBU IBC2026 stand listing, and search coverage of the same announcement. **Nothing here has been
seen running.** Unreal-based virtual production and broadcast graphics - Reality 5, Traxis Hub 3.0,
NODOS, NLE Live Link - on stand **7.B01**. **An established graphics vendor, not an OGraf
experiment**, which is what makes this block worth opening.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| AI that AUTHORS a graphic | **"AI-powered HTML5 Generative Graphics Templates"**, demonstrated at IBC2026 - the first vendor of any size to announce this | The agent door (`docs/AGENT_CLI.md`) and Create with AI: shipped, benched, validated | **Contested.** The MXMZ block called this "an axis nobody else is contesting" until 2026-09-01 |
| OGraf compatibility of those templates | Reported in IBC coverage; **not quotable from Zero Density's own material** - their news page carried no IBC2026 item when read | OGraf export shipped, the whole catalog gated against the live EBU schema (`e2e/ograf-conformance.spec.ts`) | **Unverified** - the one row to re-read after IBC |
| Newsroom assembly | NRCS running orders feeding graphics directly, plus Journalist Preview, for news, sports, weather, elections and finance - **built in-house, not bought in** | Nothing takes a story or a rundown as input | **GAP** - the same one the MXMZ block calls the biggest on this page, now reached by a second vendor from a different direction |
| Renderer | Unreal Engine, multi-renderer with Chaos Vantage and NVIDIA Gaussian splatting | The browser; HTML is the artefact | **Different product** below the graphics layer, converging above it |
| Virtual studio / AR / XR | The core business | None, and none intended | **Different product** |
| Price and openness | Enterprise, quoted | Free forever, self-hostable, open | **We beat** |
| Everything else | UNRESEARCHED | | Nobody has read their material beyond one IBC preview |

**The strategic read.** The announced workflow overlaps our own sentence uncomfortably closely -
AI-assisted creation, HTML5, OGraf, live playout - and it arrives from a vendor with existing
broadcast customers and a newsroom story we do not have. What it is not, on this evidence: free,
self-hostable, export-anywhere, or openable in a browser by a student. Two things follow. **Our
AI-authors-a-graphic edge is contested rather than uncontested**, and the differentiation has to
move onto the surfaces OGraf does not standardise. Re-read this block after IBC2026 (11-14
September), when there is a product to look at instead of a stand listing.

## Rive

From `docs/GOALS.md`. Designer-first interactive animation with **real state-machine logic**. Not a
broadcast product, which is why it appears here as a BAR rather than as a competitor for customers.

| Capability | They have | Us | Verdict |
|---|---|---|---|
| State-machine authoring for designers | The reference implementation of the idea | `NOACG_ANIM` v2 and the node editor (`docs/STATE_MACHINE_SCHEMA.md`) | **Match on model, unjudged on authoring feel** |
| Broadcast playout | None - not what they are | Six targets, hosted playout, an operator layer | **Different product** |

---

## How to use this file

- A **GAP** row is a candidate piece of work, not a commitment. It competes with everything else in
  the drain order (`docs/backlog/README.md`).
- A **We beat** row is a marketing asset and should be findable in the public copy. If it is true
  and nobody outside can tell, that is its own gap.
- **UNRESEARCHED is the honest word and it should make you uncomfortable.** Two of the four blocks
  here are mostly empty. Filling one is a half-day of reading public material and it changes what
  this page is worth.

---

## Who we are replacing - moved from `GOALS.md` 2026-09-01

The four-product framing that used to open the roadmap, verbatim; `GOALS.md` keeps one line per
product and points here. What each obliges us to build - their proven capabilities are our
requirements list.

- **Rive** - designer-first interactive animation with real state-machine logic. State-driven
  behaviour is what a live graphic fundamentally IS, so Rive sets the bar for our machine and node
  editor.
- **Singular.live** - cloud graphics, browser control room, their playout reaching air. They do
  most of what we intend, so our gap to open is **breadth** over equivalent cloud playout.
- **Loopic** - HTML broadcast graphics, closest positioning to ours. Its timeline and canvas
  editing are what Advanced mode has to beat.
- **MXMZ** (mxmz.com - named by Yle as the working model; researched 2026-08-22, re-read
  2026-08-28 in `docs/COMPETITOR_MXMZ.md`) - they prove the "your own SVG, playable" workflow at
  broadcast scale, so our SVG import has to match it: every layer auto-exposed, no renaming ritual.
  We beat them on what they lock away (free-forever, self-host, export anywhere, a catalog) and on
  the gap their architecture has no place to put: **nothing public shows them authoring LOGIC at
  all** - a designer trained for a day on a keyframe timeline, and a control panel hand-built per
  sport. **We no longer claim an AI lead over them outright:** we beat them on AI that AUTHORS a
  graphic, which nobody sells, and we are absent from the assembly layer that reads a newsroom
  story and fills an existing template, which MXMZ is a supported engine of.
