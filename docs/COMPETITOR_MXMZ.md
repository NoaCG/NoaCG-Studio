# MXMZ - the competitor we are measured against

**Written 2026-08-22, re-read 2026-08-28** - section 8 is what the re-read found, and it changes
the read. Public sources only: `mxmz.com` (home, products, Cloud Editor, Operator), the Grass Valley
Alliance partner page, an SVG Europe interview with business manager Milo Boer, and - new on
2026-08-28 - the HighField AI platform pages and the ToolsOnAir 2026 product pages.
`mxmzmedia.com` 301s to `mxmz.com` - one company, not a separate services arm.

**Read the caveat first.** This is marketing copy and one interview, not a product trial. Where
this file says a capability is ABSENT it means *no public material mentions it* - which is weak
evidence about a shipped feature and strong evidence about a SOLD one, because a platform does not
hide the thing it competes on. Anything here that would change an architecture decision should be
re-checked in a demo before it does.

The closest working model of the "your own SVG, playable" workflow, which is why they matter more
than the older three in `docs/GOALS.md` "Who we are replacing".

---

## 1. What they are

Cloud-native broadcast graphics: *"Design, playout, and control all from your browser. HTML5 & SVG
real-time motion graphics for modern broadcast workflows."* Three products - **Cloud Editor**,
**Operator**, **Integrations** (graphics inside Premiere; Media Composer planned).

Their origin explains the shape. Banijay's sports arm **Southfields** was quoted up to **25% of a
production budget** for graphics and built a lightweight HTML5/SVG alternative instead. Ziggo Sports
took it to **22 live channels** in 2022; it spun out as a company and now sells across Europe and
North America. Euro Hockey League is a reference customer. Grass Valley embeds it in **AMPP**.

**Price floor: under $3,000/year** for smaller users, with day, month and annual licences.

## 2. Their workflow, end to end

1. **Design in Illustrator, Figma, Canva or any SVG-capable app.** No proprietary design tool.
2. **Import the SVG directly, every layer exposed** for animation. Fonts upload once to S3 and the
   whole team has them.
3. **Animate in the browser** - *"a full animation timeline with keyframe control"*, *"Every layer,
   every property, every transition is fully editable on a frame-accurate timeline"*, stacking
   multiple animations with *"precise in/out points"* and tuned easing curves.
4. **Bind data** - *"Layers, masks, and data bindings update in real-time via JSON"*; Opta,
   Gracenote, Sportradar and custom APIs.
5. **Expose variables** so producers change copy, colours and element positions without design
   skill. Master templates are LOCKED, local variations allowed.
6. **Publish to one URL per channel**, per Grass Valley. Operator drives it: rundowns with
   drag-and-drop, pre-loaded templates, **auto-advance timers**, MOS/CII for newsroom, touchscreen
   panels with large targets, unlimited channels each with its own library and data connections.
7. **Version control** logs every adjustment with rollback to any previous iteration.

## 3. The finding that matters: they do not solve the logic problem, they route around it

**Scope, restated because it has been read more widely than it was written: this section is about
AUTHORED LOGIC and nothing else.** It says that no public MXMZ material describes a CUSTOMER
authoring behaviour. It does not say they have no AI, no assistance and no automation - section 8
answers that question, and the answer there is not in our favour.

Nothing public - not the Cloud Editor page, not Operator, not Grass Valley's write-up - mentions
**states, conditions, guards, triggers, or authored logic of any kind**. Their whole behaviour
vocabulary is: layers, multiple timelines, in/out points, variables, live data, and an operator
pressing something. That is a strictly weaker model than the one NoaCG already runs
(`docs/STATE_MACHINE_SCHEMA.md`).

They get away with it three ways, and each is a real product answer worth taking seriously:

- **They train the designer.** Boer: *"we teach them for one day, and then they can start
  animating. And there are millions of people out there who understand Illustrator."* Their promise
  is not zero-training authoring - it is a ONE-DAY learning curve on a familiar timeline.
- **The NON-TECHNICAL person is the OPERATOR, not the author.** *"keep design familiar, keep
  operation non-technical, and make deployment fast."* Producers get variables and locked
  templates; they do not author behaviour, and they are not expected to.
- **Bespoke vertical panels absorb the rest.** Grass Valley: *"dedicated interfaces for specific
  Sports and News"*; MXMZ's own feature list carries **Match Control** with *"one-click graphic
  triggers"*. At Euro Hockey League they wired **referees' Stream Decks** to fire venue graphics,
  on-air scoring and synchronised audio. That behaviour lives in a panel somebody at MXMZ built for
  that sport - not in something a customer authored.

**This is the gap we can open.** A hand-built per-sport panel cannot serve a student inventing a
quiz format on a Tuesday. A LIBRARY OF NAMED BEHAVIOURS a person attaches to their own artwork is
precisely the thing their architecture has no place to put.

## 4. Where they are ahead of us today

Honest list, because these are what a broadcast designer would notice inside five minutes:

- **The timeline is their trained primary surface.** Frame-accurate keyframes on every layer and
  every property. Ours exists and is real, but it sits in Advanced mode and nobody is taught it.
- **Version control with rollback** and change notes. We have undo and saved documents, not this.
- **Locked master templates with local variations.** Our equivalent is the org boilerplate story,
  still open in `docs/SVG_IMPORT_PLAN.md` P2.
- **Team font libraries** uploaded once. Ours are per-project.
- **MOS/CII newsroom integration** and **auto-advance timers** on the rundown.
- **Multi-channel** as a first-class concept: unlimited channels, each with its own library,
  playlists and data connections.

## 5. Where we are ahead, and it is not small

- **A real state machine** with structural guards, parallel groups, timers, snap and a serial event
  queue - inside the template, so it behaves identically in the editor, in an export and under SPX.
- **Control panels GENERATED from the machine** (`docs/CONTROL_LAYER.md`), not hand-built per
  vertical. Every event a button, legality mirrored as greying.
- **An audience plane** - join page, vote-to-air, presenter view. Nothing public suggests MXMZ has
  an audience-facing surface at all.
- **Export anywhere, and the files are yours** - SPX, CasparCG, OGraf, LiveOS, OBS, vMix. MXMZ is
  cloud-first with a Docker escape hatch; the graphic is not a folder you keep.
- **Free forever, self-hostable, open.** Their floor is ~$3k/year.
- **A catalog.** They import your design; they do not hand you 500 of them.

## 6. What their architecture VALIDATES

Choices we already made that the market leader made too - worth knowing we are not out on a limb:

- SVG imported **verbatim with every layer exposed**, no renaming ritual.
- **Pure SVG + HTML, scriptable**, no proprietary runtime inside the emitted graphic.
- **One persistent URL per channel** as the playout contract.
- **Cloud-first with a local fallback** (their Docker / laptop-with-USB-to-SDI; our export door).
- Resolution independence as an SVG consequence rather than a feature to build.

## 7. What to take, and what not to

**Take:**
- *"Teach them for one day."* A trained-designer path is legitimate. Not every road has to be
  zero-training, and pretending otherwise is how an authoring surface ends up never shipping.
- **Variables + locked master template** as the org story - already scheduled, now with a reason.
- **Auto-advance timers** on the rundown; cheap, and our machine already has timer transitions.
- Team-level font libraries.

**Do not take:**
- **Per-vertical hand-built control panels.** It is their services-shaped answer to logic, it does
  not scale past the sports somebody paid for, and copying it would abandon the generated control
  layer that is our actual advantage.

## 8. The AI answer, and it is not the one section 3 implies (read 2026-08-28)

Section 3 said their behaviour vocabulary is layers, timelines, variables, data and an operator.
That is still true of the MXMZ product. It became a misleading thing to leave standing the moment
somebody else's product started doing the part MXMZ does not, **with MXMZ as one of its four
supported outputs.**

### 8.1 HighField AI - an agentic layer ABOVE the graphics engine

**HighField AI** sells itself as *"the industry's first agentic and multimodal AI platform for
graphics"*. It is not a graphics engine and does not compete with MXMZ; it sits on top of one. Its
own platform page names exactly four graphics engines it drives:

> Ross XPression - Vizrt Pilot Edge - Epic's Unreal Engine - **MXMZ**

and eight newsroom systems it reads from: Avid iNews, CGI OpenMedia, Ross Inception, AP ENPS, AP
Story Telling, SAGA, Octopus, Snews.

**What it actually does**, in its own words, is a pipeline of specialised agents over a story a
journalist already wrote in the NRCS: *"story and context analysis"*, *"asset search and
retrieval"*, *"data verification"*, *"visual composition and layout"*, *"template selection and
playout mapping"*. Trade coverage of the commercial launch describes the same chain concretely:
*"selecting templates from broadcast graphics systems, pulling text, images, and video from content
libraries, and preparing complete graphics packages for editorial review"*, with trial broadcasters
reporting *"efficiency gains of up to 75 per cent in graphics production workflows"*.

**It does not author graphics.** The templates already exist, made in XPression, Viz, Unreal or
MXMZ by somebody who knows how. And a human still gates air: *"Nothing reaches air without a
person's sign-off. AI executes; a human decides."*

Dates and reach: unveiled at NAB 2025 (2025-03-30), commercially available 2025-07-09, nine new
channel partners across the Americas, Europe and the Middle East (2025-11-19), and a **Ross Video
partnership announced 2026-04-13** covering XPression, Inception and Streamline, demonstrated at
NAB 2026.

**The MXMZ tie is a vendor listing, not a joint announcement.** No MXMZ+HighField press release
exists; MXMZ appears on HighField's own supported-engine list. That is weaker evidence than a
partnership would be, and it is still the fact that matters: an assembly layer exists, it names
four engines, and MXMZ is on the list.

### 8.2 ToolsOnAir - MXMZ becomes a playout target, and so does SPX

**just:live pro 2026** and **just:play pro 2026** (ToolsOnAir, macOS, announced ahead of IBC 2026 at
RAI Amsterdam, 11-14 September 2026) add *"dynamic HTML Graphics Template Rendering"* which
*"seamlessly integrates with leading web-native platforms such as singular.live, Viz Flowics, SPX,
MXMZ and others"*. The Lite and Lite NDI variants carry MXMZ template compatibility too.

Two readings, both worth holding:

- MXMZ is accumulating **playout reach it did not have to build** - Grass Valley AMPP, and now a
  macOS SDI/NDI playout family. Distribution is becoming their moat, not the editor.
- **SPX is on that same list.** Our canonical internal format is already a named target of a new
  playout product we neither asked for nor have to maintain. That is the "export anywhere,
  SPX-canonical" bet paying a dividend nobody in this repo had noticed.

### 8.3 The corrected strategic read

Old read: *their architecture has no place to put authored behaviour, and that is the gap we open.*
Still true, and still what the 2026-09-12 production tests.

**What has to be added to it:** the AI question is not "do they have a generator". Nobody in this
market is selling AI that AUTHORS a graphic. The thing being sold, and bought, is an
**orchestration layer that selects an existing template and fills it from newsroom context, at
rundown scale, with a human sign-off**. MXMZ did not build it. MXMZ became a supported output of it.

So the honest competitive statement has two halves:

- **On authoring behaviour we are ahead**, and section 3 stands as written.
- **On assembly we are not on the board.** We author one graphic very well from a chat and stop at
  a library record. Nothing in our product takes a story, a rundown or a running production as
  input, and no assembly layer lists us as an engine it can drive. Being absent from that list is
  the one position MXMZ is not in.

The gap analysis, and what it means for the CLI, is `docs/backlog/cli-roadmap.md` - section "What
theirs does that ours cannot".

---

**Where this feeds the roadmap:** `docs/GOALS.md` "NOW", item 2 - attaching behaviour to a graphic
somebody else drew. This file is the competitive half of that question; the engineering half is
`docs/SVG_IMPORT_PLAN.md`.

## Sources

- <https://mxmz.com/> - home
- <https://www.mxmz.com/products> - product list
- <https://www.mxmz.com/products/cloud-editor> - editor, timeline, data binding
- <https://www.mxmz.com/products/operator> - rundowns, match control, multi-channel
- <https://www.grassvalley.com/grass-valley-alliance/mxmz/> - AMPP partner page, one URL per channel
- <https://www.svgeurope.org/blog/headlines/mxmz-puts-svg-and-html5-at-the-heart-of-broadcast-graphics/>
  - SVG Europe interview with Milo Boer (origin, philosophy, training, pricing)

Added by the 2026-08-28 re-read (section 8):

- <https://highfield-ai.com/platform/graphics/> - the agentic pipeline, the four supported graphics
  engines including MXMZ, the eight NRCS integrations, the human-sign-off rule
- <https://www.tvbeurope.com/artificial-intelligence/broadcast-industrys-first-agentic-and-multimodal-ai-platform-for-graphics-now-commercially-available>
  - commercial availability, 2025-07-09; the "up to 75 per cent" trial figure
- <https://www.newscaststudio.com/2025/03/30/highfield-ai-multimodal-agentic-ai-solution-for-broadcast-graphics-workflow-unveiled-at-nab-show/>
  - the NAB 2025 unveiling
- <https://www.newscaststudio.com/2026/04/13/ross-video-highfield-ai-partner-on-ai-assisted-graphics-workflows/>
  - the Ross Video partnership, 2026-04-13
- <https://www.advanced-television.com/2025/11/19/highfield-ai-announces-global-partner-expansion/>
  - nine new channel partners, 2025-11-19
- <https://www.toolsonair.com/products/just-live-pcr-playout.html> and
  <https://www.toolsonair.com/products/just-play-mcr-playout.html> - just:live / just:play pro 2026,
  HTML Graphics Template Rendering naming singular.live, Viz Flowics, SPX and MXMZ
