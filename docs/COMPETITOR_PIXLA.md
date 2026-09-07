# Pixla - competitive read and response plan

**Read 2026-09-07 from public material only** ([pixla.graphics](https://pixla.graphics)). Like every
block in [`COMPETITORS.md`](COMPETITORS.md), this file is refreshed on TIME, never on commits:
nothing here changes because our code changed, only because somebody re-reads theirs. Treat it as
stale rather than wrong after a quarter.

The evidence has two grades and the file marks which is which. **Their marketing** is strong
evidence about what they SELL and weak evidence about what ships, and sections 1, 2 and 3 lean on it
because the application lives at `/controller` behind a login, the free tier renders demo data only,
and nobody here has driven it. **Their shipped client code** is a different grade of evidence
entirely, served publicly without an account, and section 1b reads it - correcting four things the
marketing says. Everything about NoaCG is verified against this repository by an adversarial pass
that checked each claim independently, and where a claim about us is really a claim about their
silence, it says so.

---

## 1. What Pixla is

Pixla sells a small control room in a browser and a desktop app, with a graphics designer inside it.
The centre of the product is a rundown: assets on the left, playable rows in the middle, live render
outputs on the right, with graphics cues, video clips and TriCaster commands sitting in the same
list and a stage timer running off the same clock. Around that they have hung everything else a
production needs on the day - a prompter, a stage timer, a media library synced from a facility's
switcher or media server, video playout scheduling, remote operation from other devices on the
network, a scheduler for booking broadcasts, and a 3D studio designer for laying out cameras and
lights. The OGraf motion designer is one item on a list of fifteen, and its output goes into their
own rundown. Pricing is four tiers: free but demo-data-only, EUR 19/month to run your own show, EUR
89/month for a team, and a quoted on-prem tier. They also give away a separate 96 MB multiview
application outright, with no account and no cloud connection, which is the only Pixla software an
unpaid user can do real work with.

They are genuinely good at three things, and I would not talk any of them down. Their copy is
written in production roles rather than features - operator, show caller, presenters, floor teams,
"the room stays in sync" - which reads far better to a technical director than a feature list does.
Their rundown is a timed document rather than an ordered one, with per-row durations, show blocks
that match how a production is actually called, and one clock that the gallery, the floor and the
presenter all read. And they ship a desktop build, which is what lets the same product talk to an
ATEM on the LAN, take NDI into its previews and control other machines in the room. **They are
primarily a control-room competitor and only secondarily a graphics competitor.** That distinction
decides the whole response. Their designer is thinner than ours on almost every measurable axis, and
their controller covers ground we deliberately do not. Which means the temptation this read creates
- to start matching rundown features - is the trap, because everything in their controller is a
surface any rundown vendor ships, none of it is in the OGraf spec, and a rival's next release
replaces it for free. The one place they beat us on a capability our user will actually feel is that
they can put a rectangle on a canvas and we cannot.

---

## 1b. What their shipped code shows

The sections around this one read Pixla's marketing, which is the honest limit of a read done from
outside a login. This section is different: it is their **shipped client code**, served publicly and
without an account. The controller at `/controller` is a single 1,044,216-byte HTML file with
everything inline, and the designer is a separate 272,341-byte bundle at
`/Functions/ografDesigner.js`. Both were read on 2026-09-07. What a company ships is much better
evidence than what it sells, and on four points the two disagree.

**Their "OGraf Motion Designer" does not appear to emit OGraf.** The designer bundle contains no
`.ograf.json`, no `supportsRealTime`, no `stepCount`, no `renderRequirements`, no `customAction` and
no `customElements.define` - and that last one is the Graphic Web Component the EBU v1 spec is built
on. What it does contain is `playAction`, `stopAction` and `updateAction`, three times each, which
is the OGraf action vocabulary and nothing else. For scale: `keyframe` occurs 751 times in the same
file. The engineering went into a keyframe editor, and "OGraf" went onto the button. Their server
could still assemble a package after the fact, which is why this is stated as evidence rather than a
verdict, but the client shows no sign of one. Meanwhile our exporter validates 1470 manifests
against the EBU's published schemas on every CI pass and tests the Web Component MUSTs
([ograf-conformance.spec.ts](../e2e/ograf-conformance.spec.ts)). **On present evidence we are more
OGraf-compliant than the company using OGraf as its product name.** Anyone repeating our "they write
OGraf natively, we adapt to it" framing should stop until the probe below settles it.

**ATEM appears in their page title and nowhere in their controller.** The homepage `<title>` is
"Pixla - TriCaster and Blackmagic Controller" and the features page sells DSK, keyer and output
automation for Blackmagic ATEM. In the shipped controller, "TriCaster" occurs 111 times - including
`navTricasterArmBtn` and a `arm-live-required` state, so there is a real arm-then-go-live interlock
- and "ATEM" and "Blackmagic" occur **zero times each**. A browser cannot open a socket to an ATEM,
so the capability may well live only in the Electron desktop build. Either way, the half of their
headline that names Blackmagic is not in the product a visitor tests.

**They do not touch the open playout stack at all.** "CasparCG", "vMix" and "SPX" occur zero times
in the controller. Their loop is closed: their renderer, their rundown, NDI out, TriCaster. This is
the single sharpest contrast in the whole read, and it is the one our own matrix already claims and
does not advertise. A show that already runs CasparCG or vMix cannot use Pixla's graphics without
replacing its playout; it can use ours without changing anything.

**NDI is their real engineering, and their own comment confines it to the desktop.** "NDI" occurs
391 times, and a code comment in the controller reads that in the macOS and Windows Electron apps
the Render1 and Render2 previews show the exact frame being sent over NDI, while "Online keeps the
HTTP iframe preview unchanged". So the web product is HTTP previews and the desktop product is a
video device. That is the correct shape of the browser-versus-desktop tradeoff, stated by them, and
it is the reason every device row in the matrix below costs us more than it costs them.

Two smaller things worth keeping. Their render outputs are tokenised URLs of the form
`{protocol}//{renderDomain}{port}/{renderNumber}/{renderToken}`, with two layers - which is our own
north-star sentence, arrived at independently. And the app is a hand-built PWA: no bundler output,
an import map, Three.js vendored for the studio designer, Socket.io from a CDN, one megabyte of
inline markup and script. That is a small team shipping fast and wide. It is worth respecting for
the pace and not worth imitating.

**What this changes in the plan.** The Pixla probe in NEXT is now the highest-value item in this
document rather than the fifth, and its question has changed. It was "will their controller play our
package, making them a distribution channel". It is now "is their OGraf anything at all", and the
answer decides whether the distribution hope is real or whether their format is a private one
wearing a standard's name. The probe still needs an account and EUR 19 (**needs: money**, **needs:
account**).


---

## 2. The capability matrix

| Capability | They have | Us | Verdict |
|---|---|---|---|
| Ordered cue rundown over a graphic pool | Assets, rows and live outputs in three columns | `ShowCue` over a pool, auto-cue on add, drag reorder, one flat list by ruling; ~40 tests | **Match** |
| Preview and program monitors | Dual render previews | PVW plus PGM, where PROGRAM is the real renderer; identical geometry on three deployments | **Match** |
| Live video behind the monitors | "Dual render previews and live input" | Nothing. The stage renders transparent graphics only | **GAP, wrong for us** |
| Firing cues: verbs, shortcuts, legality | "Fire cues", keyboard control in the EUR 19 tier | Generated from each graphic's own state machine; a button greys because the machine has no arrow, not because someone wrote a rule | **We beat** |
| Operator notes on rows | Yes, beside the prompter | `ShowCue.note`, deliberately held out of the content field grid | **Match** |
| Per-row duration and a show clock | Readable rundown timing, one production clock | No duration field anywhere; the header clock counts how long the browser tab has been open | **GAP** |
| Show blocks (named segments) | Yes, matched to how the show is called | Flat cue array; the flat list is a recorded decision, not an oversight | **GAP** |
| One rundown holding graphics, clips and switcher cues | Yes | Graphics and stills only; a cue is always a graphic, enforced at the write | **GAP, wrong for us** |
| Dwell time / auto-advance on a cue | "Timed windows" | Timer transitions exist inside the graphic and are shipped; the rundown does not expose them | **GAP** |
| Unattended automation (timed blocks, fallback playlists) | Yes | None. Nothing airs because it was typed; a person presses the button | **GAP, wrong for us** |
| Remote operation over the internet | Devices on the same network | A published control page: a URL, no account, no install, phone breakpoint | **We beat** |
| A second operator with no internet | Local-first desktop, unaffected | The exported relay binds `127.0.0.1`; the offline fallback is one machine | **GAP** |
| Several operators on one live show | "Team live environment", EUR 89 tier | Shared durable command log, DB order is truth, truthful staged-vs-live view; operator identity deliberately absent | **Match** |
| Recovery after a reload or a renderer reboot | Nothing public says | Log replay, gap-fill, hole detection, a match clock that survives a reboot because the wire carries the instant a value was true | **We beat** |
| Draw text on the canvas | Yes | Point text and area text on imported artwork, plus the import wizard's own place-fields canvas; each creation writes a field, a layer and a definition entry | **Match** |
| Draw shapes (rectangle, ellipse, line) | Yes | Nothing. Tools are `select`, `text`, `area-text`. Shapes only arrive as imported SVG | **GAP** |
| Images on the canvas | Yes | Image slots as real fields, plus a drag-a-box image tool in the import wizard | **Match** |
| Layer stack with properties | Yes | Layers derived from the code, multi-select synced across canvas, timeline and Inspector | **Match** |
| Align, distribute, snap guides, z-order, grouping | Implied by "layers and properties" | None of them, on any surface. Our own research doc credits us with snap guides that no code implements | **GAP** |
| Keyframe timeline with easing | Start, hold and end motion with keyframes and easing | Cue-segmented steps on local clocks, 15 keyframable properties, keyframe sets with snapping, per-keyframe and per-step ease, every gesture a readable code diff | **We beat** |
| Expose operator fields from the design | "Tick which fields the operator gets" | Creation IS exposure: a field is born operator-visible, and reaches six surfaces plus a validated OGraf manifest | **Match** |
| Promote an existing element to a field afterwards | Their signature gesture | Absent, and named as absent in our own research | **GAP** |
| Per-element typography and colour | A properties panel | Full on imported designs (including colour); catalog type is contract-only through `:root`, on purpose | **GAP** |
| Canvas format | "A real 16:9 canvas" | Landscape 720p/1080p/2160p, vertical, square, chosen before assembly | **We beat** |
| The design surface as the front door | Presumably the mainstream path | Behind Advanced mode, off by default; graded level 2 in our own docs - authorable, never proven | **GAP** |
| OGraf as the authoring format | Branded as native. Their shipped designer bundle emits no OGraf v1 package artefact (see 1b) | Ruled against 2026-08-29. NoaCG code-as-truth authors; OGraf is one of six adapters and the most heavily validated | **Different product** |
| Our packages running in a foreign OGraf renderer | Unknown, and now doubtful that their renderer is one (see 1b) | Proven twice by hand and once mechanically in SuperFly.tv's `ograf-server`; 1470 manifests against the EBU schemas; six free starters at `/ograf` | **We beat** |
| ATEM control (DSK, keyer, channel) | Sold in the page title; zero occurrences in the shipped web controller (see 1b) | None | **GAP, wrong for us** |
| TriCaster control | Shipped and substantial: 111 occurrences, with an arm-then-go-live interlock | None. Zero occurrences of the word in the entire repository | **GAP, wrong for us** |
| A device playout command from the operator surface | Switcher cues in the rundown | Shipped for CasparCG: an air/stop row on the production page over AMCP. Never yet run against real hardware | **Match** |
| Browser-to-local-device bridge | Free with the desktop app | `noacg caspar agent`: loopback-only, token-checked, origin-allowlisted, published on npm. The exported relay ships a launcher | **Match** |
| Being driven BY an external automation controller | Not applicable - they drive | Not built. Registered as programme P4, and it is the right answer to their whole switcher area | **GAP** |
| Media library shared across graphics | Synced from a TriCaster, ATEM or media server | Assets belong to one template; a saved Brand look already carries a typeface and a logo across every graphic | **GAP** |
| Team-wide asset library | Not sold by them either | Teams carry membership and shared productions, not assets | **GAP** |
| Stills onto air from the rundown | "Media beside the rundown" | Upload straight into the rundown, one cue each, one layer, survives a reload; capped at 20 by a payload limit | **Match** |
| Clips rolled from the rundown | Yes | None | **GAP** |
| Producing broadcast clips | Not claimed | MP4, WebM, ProRes 4444 with alpha and a PNG sequence, from any graphic | **We beat** |
| Sync a switcher's or media server's media pool | Yes | None | **Different product** |
| Scheduled clips, timed windows, fallback playlists | Yes | None | **GAP, wrong for us** |
| Prompter | Info Notes to a clean reading display, WPM, synced to the active row | A presenter page ships with its own reserved slug, RPC and styling - and can only ever display an audience submission | **GAP** |
| Cue notes reaching the person reading them | Speaker notes on the stage timer | Notes exist per cue and only the operator ever sees them | **GAP** |
| Stage timer / room-facing display | Yes | None. A spare laptop on a `startingSoon` wall-clock countdown or the `cr05` Schedule Hold board is the free workaround | **GAP** |
| On-air countdown and game clocks | A display in the room | 21 holding designs and 6 game clocks, deadline-anchored, with start/pause/reset as operator events; E2E-gated | **We beat** |
| Audience-facing plane | Nothing public suggests one | Join page, questions and votes to air, presenter pointers, offline honesty | **We beat** |
| Scheduler (day, week, timeline bookings) | Yes | Nothing. `Show` has no date field of any kind | **GAP, wrong for us** |
| Booking indexes its rundown | Yes, the calendar is the index | A production has a permanent output URL instead, which survives every rehearsal and show | **GAP, wrong for us** |
| People assigned to a dated show | Booking connected to its team | Teams ship with owner/member roles and a share-with-team dialog; no rostering | **GAP, wrong for us** |
| 3D studio designer | Cameras, lights, screens, furniture | None, and none intended | **Different product** |
| Desktop apps (macOS DMG, Windows EXE) | Version 1.0.24, both | None. Parked, with the owner's own sketch of exactly this on file | **GAP, wrong for us** |
| Free multiview for USB and NDI sources | Free forever, no account, separate 96 MB app; NDI is Electron-only by their own comment | None. No video ingest of any kind | **Different product** |
| Live graphics into the edit afterwards | A Premiere Pro CCX extension | ProRes 4444 with straight alpha for any NLE, plus OGraf non-real-time rendering with deterministic seeks. Neither has been opened in an NLE | **Match** |
| Interoperating with the open playout stack | None. Zero occurrences of CasparCG, vMix or SPX in the shipped controller; a closed loop of their renderer, NDI and TriCaster | One document, six adapters, SPX the strictest gate | **We beat** |
| Local-first operation, no cloud | The desktop app; EUR 19 to run your own show | Create, preview and export need no account and no network; the repository is the whole self-hostable product | **We beat** |
| Free tier | Demo data only; "a subscription unlocks building and running your own show" | Everything works free. Publishing a hosted show, hosted AI, cloud sync and the audience plane need a free signup | **We beat** |
| Published price | EUR 19 / EUR 89 / quote | Free, AGPL-3.0, no paid surface and none planned | **We beat** |
| On-prem | Custom quote, on-site hardware, dedicated integration | The whole product self-hosts for nothing. No services business, and no one to call | **We beat** |
| A pricing page a buyer reads in 30 seconds | Yes, four tiers | No pricing page. The claim is a footer clause carrying a stale hedge | **GAP** |
| Maturity signalling | "1.0.24", "Built for live production" | No public version, no changelog, no named production. "Beta" is the first word on our homepage | **GAP** |

---

## 3. The three things that matter

**Pixla is a control-room competitor, and the control room is the one layer we must not race them
on.** The reflex this matrix creates is to start closing rundown rows: durations, show blocks, a
production clock, a prompter, a stage timer. Resist it. Every one of those is a feature any rundown
vendor ships, none of them is in the OGraf spec, and a rival's next release erases the advantage.
Meanwhile the part of the control room that decides whether a student can run their own drawing is
already ours and is ahead: the panel is generated from each graphic's own state machine, so every
event the author drew is a button and a button greys because the machine structurally has no arrow
from the current state. That is what makes an imported SVG operable with zero per-graphic panel
code, and it is what MXMZ pays for with hand-built per-sport panels. Recovery is the same story - a
reloaded renderer rebuilds to the exact on-air state, and a running match clock comes back, because
the wire carries the instant a value was true. Pixla says nothing about either, which is not proof
they handle them badly; read those two rows as claims about us, not measurements of them. The honest
structural gaps in the rundown are that ours is ordered and theirs is timed, and that ours has no
blocks. Both are cheap to add as additive optional cue metadata and neither belongs anywhere near
September, because a quiz and a scoreboard are paced by the room.

**The one thing that forces our user out of the product is that they cannot draw a rectangle.** The
tool set is `select`, `text`, `area-text`, full stop. A student who wants a coloured plate behind
their answer text has to leave for Illustrator, Figma or Canva and come back through the import door
- a hard dependency on software they may not own, and the exact sentence Pixla's "built for layered
broadcast graphics, not just position overrides" is written to win. Our answer to it is a real
ruling, not an oversight: artwork comes in verbatim because SVG is code, and that route produces
better-looking graphics than any in-app rectangle would. But the cost of closing it is a fraction of
what any of the three plans priced, and this is the single most useful thing the verification pass
turned up. `src/blocks/registry.ts:245-311` already holds shipped `box` and `accent-line` transforms
that insert a real `<div data-gfx>` plus fully commented CSS and register a layer;
`src/model/types.ts:122` already declares `LayerType` including `'rect'`; and a drag-a-box gesture
already ships as the import wizard's image-slot tool at `PlaceFieldsStep.tsx:349`. The DOM/CSS idiom
everyone called "the hard part, weeks" is written, commented and unreachable only because the Blocks
tab was removed. This is wiring an existing patcher to an existing gesture.

**This read audited us harder than it audited them, and four public statements are wrong - one of
them scripted for a stage on 12 September.** **All four were fixed in the commit that added this
file; the paragraph is kept as the record of what was found and why.**
`docs/IBC_LISTING_CHECKLIST.md:207` still told the
owner to answer "is it really free?" with "the only paid surface is hosted AI", four days after the
2026-09-07 ruling deleted every paid surface, and he reads that script at an open-source session on
the EBU stand on the same day the students go on air. `index.html:993` claims the product is open
source and a grep for `github` on that page returns zero hits, so the page makes its lead
differentiator and gives the reader nowhere to go. The "Free forever for the core" hedge in the
footer, the README and GOALS.md's own operating principles implies a paid non-core that no longer
exists. And the claim we most want to make is broader than the code supports: `ANONYMOUS_PLAN` turns
off `control.hosted`, cloud sync, the audience plane and every AI feature except bring-your-own-key,
so "run the whole show with no account" is falsifiable in one click. Create, preview and export are
genuinely account-free; publishing a hosted show costs a free signup. Say the narrow thing, which is
still miles better than demo-only data.

---

## 4. The plan

### NOW - before and alongside 2026-09-12

All three lenses agree on one point and I agree with them: **nothing invented by this competitive
read enters the September push.** The NOW list in `docs/GOALS.md` is unchanged. What is added here
is an hour of text, an hour of writing and a rehearsal.

1. **Finish the committed NOW list** - text-box binding (`docs/TEXT_BOX_BINDING.md`), the owner
   walks, and the two graphics walked end to end as a student would. *Effort: days, already in
   flight. Unlocks: the only evidence that any of this works on a real person's graphic in a real
   room.*
2. ~~**Strike the six stale commercial statements before 11 September.**~~ **DONE 2026-09-07, in the
   commit that added this file.** The IBC script's "is it really free?" answer, the "for the core"
   hedge in `index.html`, `README.md` and GOALS.md's own operating principles, the
   Extreme-subscription row and the parking-lot payments line, and the missing repository link on
   the landing page - all six. The footer now carries a `Source` link to the repository, verified
   rendering identically to its siblings. `docs/GOALS_ARCHIVE.md` keeps the old wording on purpose:
   it is the record of what was true then.
3. **Rehearse the wifi-down fallback once and write the two-line procedure into the production's
   notes.** `relay.py:145` binds `ThreadingHTTPServer(('localhost', p))`, so the fallback the docs
   call "the one a show drops to when the network dies" is single-machine. Discovering that at 19:30
   is the failure that ends the show. *Effort: hours. Unlocks: an unknown failure becomes a
   rehearsed one.*
4. **Open the Pixla block in `docs/COMPETITORS.md`** - dated read, URLs in the block, the
   marketing-copy caveat that file already prescribes, and the four never-rows argued in place. A
   grep for "pixla" across docs, src and e2e currently returns nothing, so without this the next
   session re-litigates the scheduler and the 3D designer from scratch. *Effort: one hour. Unlocks:
   every deferral below survives the session that produced it.*
5. **On the day the two graphics pass their walk, export both as OGraf packages and drive them
   through `src/bridge/ografHost.ts`** - load, every customAction, update, stop. *Effort: one hour.
   Unlocks: the cheapest possible test of the sentence the whole distribution argument rests on,
   using graphics that only exist that week.*

### NEXT

1. **A shape tool** - rectangle, rounded rectangle and line, starting in the import wizard's
   place-fields step, then armed on the editor canvas with Inspector rows for fill, stroke and
   radius. It must inherit the brand contract's fills and radii rather than hand over a raw colour
   picker, or it wins convenience and loses the "every design looks like a paid asset" pillar.
   *Effort: days for the wizard tool, one to two weeks for the editor canvas and Inspector rows.
   Unlocks: a complete graphic made without leaving NoaCG, which is the whole no-code claim.*
2. **The presenter slice** - route the live cue's own label and note to the `/join?pv=` page that
   already ships. Take the cheap route the verification found: `control_shows.live_cue` (migration
   0031) already holds the live cue id, written by `control_send` on every take, and the published
   payload already carries every cue's label and note, so this is a join inside
   `audience_presenter_by_slug`, not a new pointer kind and not a new operator gesture. Give the
   page its first E2E spec while you are there; it has never had one, which is how it once shipped
   as unstyled serif text. *Effort: days. Unlocks: Pixla's prompter and half its stage timer, on
   plumbing we already own.*
3. **Two afternoons of post-production evidence** - export one post-production OGraf package into
   DaVinci Resolve 21's media pool, render one ProRes 4444 and open it in an NLE, and write both
   results into `docs/OGRAF.md` beside the SuperFly round, ticking `docs/RENDER.md:318`. A grep for
   "davinci" across all markdown returns exactly one line, `docs/COMPETITORS.md:39`, and it is the
   only line in that block with no URL behind it. The first external renderer we tried found three
   defects our own gate had passed. *Effort: two days, mostly sitting with software. Unlocks: turns
   two plausible "we beat" claims into demonstrated ones on the exact axis Pixla spent months
   building an Adobe plugin for. Highest evidence per hour in the whole read.*
4. **Align and distribute over the multi-selection that already exists**, and size object snapping
   with it rather than discovering later that we do not have it either. *Effort: days. Unlocks:
   `docs/WYSIWYG_PLAN.md` §5 requirement 1, which is a precondition of the second editor attempt,
   and the most visible hole in any side-by-side.*
5. **The Pixla probe** - one month of the Subscriber tier, import a NoaCG OGraf starter from
   `/ograf` into their controller, drive it, and write what happened into the block. **needs:
   money** and **needs: account**, and only the owner can create it. *Effort: hours plus EUR 19.
   Unlocks: whether Pixla is a distribution channel or only a rival, which is the one fact that
   reorders everything else here. If their controller accepts a foreign package, their subscriber is
   running a NoaCG graphic on their air and their rundown, clock and switcher automation are free
   surfaces around it.*
6. **Cue dwell time** - a per-cue "advance after N seconds" driving the existing Take and Next
   verbs, shipping with the armed-timer visibility from `docs/CONTROL_PANEL_PARITY.md` §5.5, because
   a timer that fires with nothing on screen saying it would is the one way this makes a show worse.
   This is a pull-up from `docs/CONTROL_PANEL_ROAD.md`, which parks it "until a show asks". *Effort:
   days. Unlocks: the honest answer to "timed windows" with no scheduler, and a sponsor loop that
   does not need a student standing at a laptop.*
7. **Emit standard OGraf `gddType`** instead of the `v_noacg.kind` vendor hint, and stop reading the
   vendor hint first. This is a named item on the parked NEXT ladder and I am asking for it
   explicitly under that section's own carve-out: honouring the standard inside what we already ship
   is current work; import and the Server API facade are new surfaces and stay parked. *Effort:
   days. Unlocks: our fields rendering correctly in anybody's generated operator form, including
   Pixla's, which is a precondition for the probe above meaning anything.*
8. **Give the exported relay a LAN bind behind a token**, with the Windows firewall step written
   into the launcher's story, and answer the precedent in the same document:
   `docs/CASPARCG_CONNECT.md:110-114` already refused a `0.0.0.0` bind because it turns any page the
   operator visits into a remote control. The relay serves its own package rather than a playout
   server, so the precedent does not kill it, but it has to be answered out loud. *Effort: two to
   three weeks, not the "weeks" two of the three plans assumed. Unlocks: the offline show keeps its
   second device, which is the difference between a degraded show and a stopped one.*
9. **Make the beat rows findable** - `/ograf` and the source repository in the nav, the catalog size
   stated, and one page that says "not a demo, not a trial" with the account boundary drawn
   honestly. *Effort: days. Unlocks: `docs/COMPETITORS.md`'s own rule, that a "We beat" row nobody
   outside can see is its own gap.*

### LATER

- **A clip cue in the rundown.** *Trigger: the owner's own next production hits it again, or any
  user reports leaving the dashboard mid-show to roll a package.* **The lenses split hard here and I
  am picking a side.** One plan called this the first thing to start on 13 September, on the
  strength of the owner's recorded "one reason I can't use it in my productions". Another argued our
  user already has OBS or a switcher that plays clips better than a browser tab ever will. I side
  with the second, with one qualification: the owner's receipt is real evidence, but it is evidence
  about a CasparCG-native room, not about a student running OBS, and putting a clip player in our
  rundown means owning decode, timing and audio in a browser tab. The transport is mostly built
  (`/amcp` on the CLI agent, many cues over one pool entry), so this stays cheap whenever it is
  wanted.
- **Per-cue duration and a show clock that counts against the plan.** *Trigger: a scripted show with
  a producer and a floor manager asks, or programme P3 activates.* Note the honest split the
  verification drew: the calendar above the show is a never, but timed advance within the show is
  already registered under P3.
- **A room-facing display.** *Trigger: cue dwell time ships, which gives the display something true
  to count.* Until then, `cr05` Schedule Hold airs the running order as a static board and six
  `startingSoon` designs chase a wall-clock start time, so a spare laptop on a second `/output`
  already gives a room most of this for nothing.
- **The exposure gesture** - promoting an existing element to an operator field after the fact, plus
  control-surface curation. *Trigger: P7 opens, or an imported SVG needs a field the import wizard
  did not create.*
- **Per-element typography and colour on catalog templates.** *Trigger: P7, since attempt two has to
  say what was wrong with attempt one and this is on the list.*
- **A single-file executable and signed installer for the CasparCG agent**, so it double-clicks the
  way the exported OBS relay does. Fix the POSIX launcher in the same pass; it shells to `python3`,
  which Apple removed from macOS in 12.3. *Trigger: someone who is not a developer needs CasparCG,
  and there is a code-signing certificate.* **needs: money.**
- **Team-scoped assets.** *Trigger: a second cohort has to share one brand, or teams stage 4 lands
  and the missing shared assets become obvious.*
- **OGraf import, untrusted-package isolation and foreign packages on `/output`.** *Trigger: the
  probe shows packages actually moving between vendors, or Yle asks.* Worth recording that this is
  more built than the roadmap implies: `ografImport.ts`, `ografContract.ts` and `ografHost.ts`
  already read, derive an operator surface from, and drive a stranger's package, and both halves are
  E2E-pinned. What is missing is a surface for people and the sandbox.

### NEVER

- **TriCaster and ATEM control from our rundown.** Not a cost argument - the local agent that opens
  the socket a browser cannot already ships, and wrapping `atem-connection` on it is weeks. The
  blocker is the signal path: a NoaCG graphic never reaches a switcher as a keyable video signal, it
  reaches air as a browser source inside OBS, vMix or CasparCG where TAKE is already our own verb
  over our own command log. A DSK button from us would raise a key over a feed we did not produce.
  The ATEMs schools actually own make it worse; the Mini line has no fill/key path at all. If a room
  ever wants one button for graphic-and-key, the answer is the inverse direction already registered
  as programme P4: a scoped playout-verb API plus a Bitfocus Companion module, which needs no device
  protocol and works for every switcher Companion drives.
- **The 3D studio designer.** Bought by a facility manager, used by a set designer, drawn twice a
  year, and it puts zero pixels on air. Real set planners buy Vectorworks Spotlight or wysiwyg; what
  fits inside a EUR 19 graphics subscription is drag-and-drop primitives on a floor grid whose job
  is to complete the "one system for the whole production" sentence on a marketing page.
  `docs/COMPETITORS.md:143` already refuses this category in Zero Density's row, and building it
  would mean vendoring a 3D engine against non-negotiable 3.
- **The scheduler and its bookings.** The school knows when the show is, because it is on the
  timetable. A NoaCG production already has a better durable object than a booking - a permanent
  output URL that survives every rehearsal and every show. Pixla needs a booking to index a show
  because their show is an event; ours is a standing thing. Adding bookings gives a student two
  competing answers to "where is my show", and makes us a system of record competing with the
  calendar every school already runs. Across 138 backlog files, five competitor blocks and a
  year-long programme register, nobody has ever asked for a date on a production.
- **Show automation with fallback playlists.** It inverts the safety model the whole control layer
  is built on: typing STAGES, and nothing airs because it was typed. A fallback sequence is by
  definition something that airs with no operator, and it would put a second writer against a log
  that attributes nothing. The useful few days inside this row is the cue dwell time in NEXT; the
  rest is Pixla serving a facility.
- **A multiview for USB cameras and NDI.** A multiview monitors cameras; we make and play graphics.
  The half a browser could do is the half nobody needs a product for, and the half that makes theirs
  worth installing is NDI, which costs a native process, an SDK with EULA and attribution
  obligations and two OS build targets, to ship a monitoring tool for a person staring at a
  control-room wall rather than a laptop. Take the tactic and refuse the artefact: our
  free-thing-in-the-room already exists as the six OGraf starters at `/ograf`, built by the real
  exporter at click time, and we route nobody to them.
- **A Premiere Pro extension.** We already answer "the show is over, I want the graphic in the edit"
  twice, tool-agnostically. An Adobe panel is a whole distribution stack we do not otherwise carry -
  developer account, signing, Exchange review, a CEP-to-UXP treadmill - for one NLE. The honest
  concession is that MXMZ ships one too, so two competitors think the post handoff matters to their
  buyers. The answer to that is the two afternoons of evidence in NEXT, not a plugin per NLE.
- **A signed desktop build of the studio.** The wrapper is days; the bill afterwards is permanent -
  an Apple developer account, a Windows code-signing certificate, an update channel, two support
  surfaces, and a second thing that can be stale against the deployed app. It buys the studio
  nothing the browser does not already do, and the repo's own parked sketch
  (`docs/backlog/noacg-desktop-client.md`, owner-sourced 2026-08-28) reaches the same conclusion: a
  desktop client is one more consumer of an existing published contract, exactly like OBS. The real
  gap is packaging, and that is a launcher.
- **An on-prem services tier.** We already give away the deployment half, which is strictly more
  than their quoted tier offers, and the 2026-09-07 ruling closed the selling half. The one real
  asymmetry is that a customer wanting somebody accountable on site can pay them and cannot pay us.
  That is a deliberate consequence, and an unmet support promise costs more than the customer is
  worth.
- **OGraf as the authoring format.** A Pixla graphic is an OGraf graphic, so it goes wherever OGraf
  goes and nowhere else. Ours is one HTML document that satisfies the SPX contract and adapts to six
  targets, with the OGraf adapter validated harder than any of them. Switching would surrender every
  single-file target that runs from a bare file on disk, because `graphic.mjs` is an ES module and
  needs http. That trades the anything-goes-export pillar for the convenience of not pressing
  Export.
- **Matching their controller feature for feature** - blocks, per-row durations, rundown timing
  views, a production clock, prompter, stage timer as a suite. This is the most reasonable-sounding
  item on the list and the most dangerous. Specific pieces of it may be pulled up when a show asks,
  and two are in NEXT and LATER above. Building the suite because Pixla lists it is how a free
  product spends a year losing a race it did not need to enter. **One partial dissent from the moat
  lens, which argued we should trade the operator surface away entirely because a generated control
  panel is a fortnight for anyone who owns the contract:** I disagree on the specific surface. Our
  panel is what makes an imported student drawing operable at all, it is what the class drives on 12
  September, and structural greying has no counterpart anywhere in this market. What is right in
  that take is the negative half - do not extend it to chase their feature list.

---

## 5. The positioning line

> **Make the graphic, run the show, keep the files. Not a demo, not a trial - free, open source, and
  it exports to whatever your show already runs on.**

Three facts that are true today and invisible to someone comparing the two websites:

1. **Their free tier is a showroom; ours is the shop.** Pixla's free tier renders demo data, and a
   subscription is what "unlocks building and running your own show". In NoaCG, creating, editing
   and exporting need no account at all, the exports run offline from a local file forever, and the
   whole product is AGPL and self-hostable. Say the narrow version and it stays unfalsifiable:
   publishing a hosted show costs a free signup, nothing more. Neither homepage describes the other,
   so a buyer cannot discover this without installing both.
2. **Our operator panel is generated from the graphic's own logic, and theirs is a rundown.** Every
   event the author drew becomes a button, and a button greys because the state machine has no arrow
   from where the show currently is. That is why a student's imported SVG becomes operable with no
   per-graphic panel code, and it is the thing MXMZ pays for with hand-built per-sport panels.
   Nothing in Pixla's public copy resembles it, and nothing on our landing page mentions it.
3. **Our graphics already run in software we did not write.** An exported package was loaded into
   SuperFly.tv's OGraf server - the one the EBU's own repo points at - and driven through its whole
   lifecycle, twice by hand and once mechanically, and 1470 manifests validate against the EBU's
   published schemas on every CI pass. Pixla writes OGraf natively and owns the rundown that plays
   it, which is a closed loop and reads well; ours is one document that reaches six targets with the
   OGraf adapter validated hardest. Six free starter packages sit at `/ograf` right now, built by
   the real exporter at click time, and the landing page does not link to them.