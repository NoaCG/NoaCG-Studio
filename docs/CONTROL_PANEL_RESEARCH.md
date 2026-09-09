# From a drawing to a control panel - what the others let a user do, and what OGraf obliges us to keep

**Written 2026-08-30.** The owner named a capability bar - *"we need to at least match their
capabilities"* - and no file recorded what that bar is on this one axis, so every behaviour added
after tonight was going to be designed blind. This file draws the bar, on one narrow question and
nothing else:

> Between **"here is my drawing"** and **"here is my control panel"**, what does the user do, what
> does the system do, and what does the operator end up holding?

**What this file is not.** It is not a second competitor dossier. `docs/COMPETITOR_MXMZ.md` owns
the MXMZ read whole (including the HighField/ToolsOnAir assembly-layer finding, which this axis
does not touch). `docs/EDITOR_RESEARCH.md` owns the AUTHORING axis across ten systems.
`docs/CONTROL_PANEL_ROAD.md` owns OUR road and the decisions on it. `docs/OGRAF_FIRST_REVIEW.md`
§4-5 owns the full NoaCG↔OGraf concept mapping. This file is narrower than all four and defers to
each; where it corrects one, it says so.

**Evidence grades**, used on every claim below:

| Tag | Means |
|---|---|
| **[quoted]** | verbatim from a public vendor page, read this round |
| **[spec]** | read out of the EBU's own published spec, schema or OpenAPI file this round |
| **[code]** | read out of this repository this round |
| **[docs-ask]** | answered by the vendor's own documentation-query endpoint - their words, machine-summarised, weaker than a quote |
| **[repo]** | already established by an earlier NoaCG research round; cited, not re-derived |
| **[blank]** | no public material found. **A blank is a finding, not a gap to fill with a guess.** |

---

## 1. The ruler: six links in the chain

Comparing three very different systems needs one spine. Everything between a drawing and a working
panel decomposes into six links, and each of the three answers them differently:

1. **Get the artwork in.** What happens to an Illustrator/Figma file.
2. **Address a part of it.** Can a single layer be named and reached.
3. **Promote a part to an operator control.** The gesture that turns "this layer" into "a box the
   operator types in".
4. **Declare what HAPPENS on a press.** Anything beyond writing a value: a reveal, a lock, a
   score bump, a vote closing. This is the behaviour link.
5. **Assemble the operator surface.** Generated, hand-built, or authored.
6. **Tell the operator what is legal, and what state it is in.** Greying, a state chip, a tally.

Links 1-3 are the import story. Link 4 is the one every product in this market solves differently
and none solves declaratively. Links 5-6 are where NoaCG's lead actually lives.

---

## 2. MXMZ

Public material only: the two product pages, re-read 2026-08-30, plus the evidence base already
recorded in `docs/COMPETITOR_MXMZ.md` and `docs/EDITOR_RESEARCH.md` §MXMZ. **There is no public
documentation site, no API reference and no trial**; every claim below is marketing copy or a
marketing video frame. Treat accordingly.

1. **Artwork in.** *"Design in Adobe Illustrator, Figma, Canva, or any SVG-capable application.
   Import your designs directly into MXMZ and enhance them with interactive data bindings,
   animations, and real-time preview."* [quoted, cloud-editor]
2. **Address a part.** Every layer is exposed and independently keyframable; the editor is
   After-Effects-shaped with per-property lanes and sub-composition tabs. [repo - from their own
   editor video and screenshot, `docs/EDITOR_RESEARCH.md` §MXMZ] The cloud-editor page itself says
   nothing about layer exposure - it only shows "Layer 5 - Clock" in an illustration. [quoted]
3. **Promote to a control.** A **Variables panel**: label, type (text/array/image/object), a
   default, and a JSONata data path with live autocomplete against the connected feed. [repo -
   editor screenshot] The cloud-editor page does not mention variables at all. [blank on the
   public page; the artifact is the only evidence]
4. **What happens on a press.** **Nothing public describes a customer authoring behaviour** - no
   states, no conditions, no triggers, no scripting surface, on either product page. [quoted,
   re-confirmed 2026-08-30] What exists instead is **Match Control**: *"Dedicated match control
   interface for live sports production. Clock management, score tracking, team rosters, and event
   logging with one-click graphic triggers."* [quoted, operator] **Who builds that per sport is
   unpublished.** [blank] The reading `docs/COMPETITOR_MXMZ.md` §3 reached - that behaviour lives
   in a panel MXMZ built for that vertical, not in something a customer authored - is unchanged by
   this round and remains an inference from absence.
5. **Assemble the surface.** *"Custom control panels with large touch targets designed for
   fast-paced live production"*; *"Build and manage graphic rundowns with drag-and-drop
   sequencing. Pre-load templates, set auto-advance timers, and control playout in real-time"*;
   *"Manage unlimited channels from a single interface. Each channel operates independently with
   its own template library, playlists, and data connections."* [quoted, operator] The rundown
   item's field form appears to be generated from the variables. [repo, marked inferred there]
6. **Legality and state.** [blank] Nothing public describes a disabled control, a state readout,
   or an illegal press.

**The shape:** links 1-3 are excellent and are the thing Yle named them for. Link 4 is absorbed by
services. Links 5-6 are a product somebody at MXMZ builds.

---

## 3. Singular.Live

Public material: the developer portal (which answers machine queries against its own docs) and the
public support portal. **`support.singular.live` returns HTTP 403 to automated fetches**, so the
support-portal claims below come from search-result excerpts and the developer portal's own
answers, never from a page read end to end. Said plainly because it changes how much weight the
control-node-type list can carry.

1. **Artwork in.** This is the sharpest difference in the whole file. A composition is built from
   **widgets**; an SVG arrives through an **SVG widget** (paste the SVG code) or as an image asset.
   Asked directly whether an Illustrator/Figma SVG's layers become separate animatable objects,
   their own documentation answers: *"an SVG is treated as one widget (an image widget) unless you
   manually split the SVG artwork into multiple widgets/sub-compositions and animate each one
   separately"*, and *"The documentation does not describe automatic layer extraction from
   Illustrator or Figma SVGs."* [docs-ask] **Singular's road does not start at a drawing.** It
   starts at a composition you rebuild in their tool.
2. **Address a part.** A widget, or a sub-composition of widgets. Composition tree, absolute
   percent-of-parent positioning, no anchors or auto-layout. [repo]
3. **Promote to a control.** Their signature gesture, and it is a good one: *"Control nodes expose
   widgets in a composition to a control application or the Singular APIs so that you can
   dynamically update them without having to go into the composition itself."* [docs-ask] You
   *"click on the underlined property in the Property Panel that you wish to add a control node
   to. Then, enter in a name for the control field (what will be seen in the control application)
   and click Add."* [support-portal excerpt] Each node carries `id`, `title`, `type`,
   `defaultValue`, `resetValue`, `index`, `immediateUpdate`, plus type-specific fields (`rows` for
   text); sub-compositions nest their own model arrays. [quoted, from the REST API's control-app
   model example] The node types are `text`, `textarea`, `number`, `normalizednumber`, `counter`,
   `selection`, `image`, `color`, `checkbox`, `audio`, `json`, `timecontrol`, `button`. [docs-ask -
   and treat the list as approximate: the answer said "14 control node types" and enumerated 13, so
   one is missing and there is no public page to check it against]
4. **What happens on a press.** A **`button` node** *"triggers a button click event"* by sending an
   execute command to the control app; a **`timecontrol`** node accepts *"play/pause/reset/start"*;
   a **`counter`** holds a number. [docs-ask] What the press then DOES is **composition
   scripting - JavaScript**. Four nested scopes (global / root / sub-composition / overlay), each
   with `init()` and `close()`, and listeners for `'message'`, `'state_changed'`
   (*"When the animation state of the sub-composition has changed"*), `'payload_changed'`
   (*"When the content of any control node changes"*), `'datanode_payload_changed'`, and
   `'timeline_event'` (*"Triggered on the start and the end of an animation"*); a script may
   *"Access the dom element to create various animation effects"* and *"Use jump and play to
   control the animation"*. [quoted, composition-scripting overview] **Singular's answer to link 4
   is a code editor.** It is a real answer, and it is the opposite of ours: not a declared machine
   a panel is generated from, but a listener a person writes.
5. **Assemble the surface.** The control app is generated from the control nodes, then instantiated
   per show. [repo] In Studio the operator gets, per overlay, *"the play button next to the
   overlay's name. It will appear in the output window"* and *"the stop button to take it Out"*,
   with a playlist panel you add overlays to from a drop-down and reorder by dragging. [quoted]
   Custom operator apps are the **App SDK**, and its documentation is **behind an email request** -
   *"Contact thomas(at)singular.live to receive access to our App SDK documentation."* [quoted]
   So the custom-controller surface area is genuinely unknown from public material. [blank]
6. **Legality and state.** [blank] Nothing public describes a control disabled because the graphic
   is in the wrong state. A script can read `'state_changed'`, so a determined author can build
   greying by hand inside their own app - that is an escape hatch, not a product capability, and no
   public page claims it.

**The shape:** link 1 is weak (rebuild, don't import), link 3 is the best-designed gesture in the
field, link 4 is JavaScript, link 5 is generated (the only one of the three that generates), link 6
is absent.

---

## 4. OGraf v1 - what the manifest can and cannot express

From the spec itself, not from our implementation. Read this round: the Graphics specification, the
graphics JSON schema, the GDD type schema, and the Server API OpenAPI file. All [spec].

### 4a. What the four control-bearing fields say

- **`schema`** - *"The JSON schema definition for the `data` argument to the `load()` and
  `updateAction()` methods. This schema can be seen as the (public) state model of the Graphic."*
  It is **GDD**, a JSON-Schema subset plus `gddType`, `gddOptions`, `hidden` and `order`, built
  precisely to auto-generate operator input forms. The full `gddType` vocabulary is ten values:
  `single-line`, `multi-line`, `file-path`, `file-path/image-path`, `select`, `select-multiple`,
  `color-rrggbb`, `color-rrggbbaa`, `percentage`, `duration-ms`. A property may carry
  `hidden: true`, whose only specified effect is that *"the property's value SHOULD NOT be included
  when building a display name or label for the Graphic in a GUI"*.
  **What it can express:** every scalar control kind an operator form needs, plus ordering and a
  hidden flag. **What it cannot:** any grouping or sectioning; any array or table PRESENTATION
  (`array` is a legal `type` and there is no array `gddType` and no specified GUI for one); any
  relationship between two fields; any notion that a field is read-only, derived, or reported by
  the graphic rather than typed by the operator.
- **`stepCount`** - `0` = no steps (playAction animates in *and* out), `undefined`/`1` = a single
  step, `>1` = multi-step, `-1` = dynamic/unknown. A Controller *"SHOULD display step controls"*
  for `-1` or `>1`. **What it can express:** a linear walk, which is exactly our `defaultPath`.
  **What it cannot:** anything branching, parallel or named. A step has an index and nothing else -
  no title, no description, no icon. An operator driving an OGraf graphic by steps is pressing
  "next" at a number.
- **`customActions`** - an array of `{ id, name, description?, schema? }`, where `schema` is a GDD
  schema for that action's payload. **What it can express:** a flat, named, independently invocable
  verb set with self-describing typed payloads - which is a very good fit for our
  `machine.controls`, and is how our exporter already emits them. [code] **What it cannot:**
  ordering (no `order`), grouping (no section), danger (no destructive flag), any precondition, any
  relationship to a step or to another action. Every custom action is a peer of every other, always
  available.
- **`actionDurations`** - `{ type, duration, customActionId?, steps? }`, ms, `0` = none, `-1` =
  dynamic, at most one per non-custom `type` and one per `customActionId`; `playAction` may carry
  per-step durations with an exact-step → fallback-step → action-level fallback. **What it can
  express:** how long a verb takes, so a controller can pre-roll and know when a take has landed.
  **What it cannot:** anything about a duration that is not statically known at package time. A
  window that runs for a length the operator chose is `-1` and nothing more.

### 4b. The two silences that matter for a control surface

- **There is no return channel.** The Graphic never speaks unasked. There are no events, no
  subscriptions, no callbacks, no status push - the only thing that ever travels graphic→controller
  is a `ReturnPayload` (`statusCode`, `statusMessage?`, `result?`, `currentStep?`) in reply to an
  action the controller chose to call. [spec]
- **There is no legality.** Nothing in the spec defines which actions are valid in which state, no
  preconditions, no guards. *The Graphic implementation determines validity* - and has no way to
  say so. [spec]

### 4c. The finding this round adds: the Server API does not declare `result`

> **Corrected 2026-08-30, same day, before it was filed upstream.** This section originally said the
> Server API **drops** `result`. Re-verified line by line at `ebu/ograf@8468da1` plus the reference
> implementation, the accurate word is **undeclared**: the response schemas set
> `additionalProperties: false` nowhere, and `SuperFlyTV/ograf-server` forwards the Graphic's whole
> `ReturnPayload` as vendor pass-through (`packages/server/src/serverApi.ts` L708-718). A third
> disagreement also came out of that read: the Graphics spec's **prose** lists `result`
> (`Specification.md` L241-244) and its **TypeScript definitions omit it entirely**
> (`types.ts` L6-16). Filed as <https://github.com/ebu/ograf/issues/82>; the practical conclusion
> below is unchanged, because an undocumented channel one Server happens to forward is not something
> a second Controller can be written against. **The design that works regardless is
> `docs/OGRAF_STATE_IN_FIELDS.md`.**

`ReturnPayload.result` is the Graphics spec's one legal home for graphic-specific state. Reading
the Server API OpenAPI file line by line, **that field is nowhere in the contract.** [spec]

| Endpoint | 200 response properties |
|---|---|
| `POST /renderers/{id}/customActions/{customActionId}` (a **Renderer**'s own action) | `result` - and the description literally reads *"CustomAction successfully executed, returning result"* |
| `POST /renderers/{id}/target/graphicInstance/customActions/{customActionId}` (a **Graphic**'s action) | `graphicInstanceId`, `statusCode`, `statusMessage` - **no `result`** |
| `.../graphicInstance/playAction` | `graphicInstanceId`, `statusCode`, `statusMessage`, `currentStep` (required) |
| `.../graphicInstance/updateAction`, `.../stopAction`, `.../load` | ids and status only |
| `GET /renderers/{id}/target` (`RenderTargetInfo`) | per instance: `graphicInstanceId` + which Graphic it is. **No data, no step, no state.** |

So across the standard controller-renderer wire, the total state a controller can ever learn about
a loaded graphic is: *which graphic is loaded where*, *the last `currentStep` a playAction returned*,
and *an HTTP-shaped status string*. Nothing else.

**This corrects one line elsewhere.** `docs/OGRAF_FIRST_REVIEW.md` §2 says status is *"poll-only -
`GET /renderers/{id}` reports renderer and instance status"*. The `status` object lives on
`RendererInfo` - it is the **renderer's** status; the instance listing carries no status field at
all. The conclusion there ("no durable or push graphic-state stream") is right and if anything
understated. That file is not edited here; the correction is filed with this round.

### 4d. Six things OGraf obliges every behaviour we add to keep true

This is the non-optional half. A behaviour designed against our own runtime and only later measured
against OGraf is a rewrite; these are the constraints to design under from the start.

1. **A behaviour's operator verbs must be a flat set of named, independently invocable actions,
   each with a self-describing typed payload.** No chords, no modal sequences, no control that only
   exists as a compound of two others. `machine.controls` already has exactly this shape - keep it.
2. **The default path must survive as a dumb linear walk.** `stepCount` + `playAction({delta})` is
   the whole of what a plain renderer can do. Already a house non-negotiable; OGraf makes it
   external, which means it is now also a compatibility claim rather than only good manners.
3. **Every animated verb should have a statically declarable duration.** A behaviour built out of
   keyframed timelines advertises itself through `actionDurations`; one built out of "until
   something changes" declares `-1` and tells a playout host nothing.
4. **Anything the operator must SEE about behaviour state belongs in a FIELD, not only in machine
   state.** A field is in `schema`, travels through `load`/`updateAction`, and every generated form
   in the ecosystem draws it. Machine state travels nowhere (4b, 4c). This is the single most
   actionable line in this file for the behaviours being built now.
5. **Legality can be enforced and never advertised.** So every behaviour must be safe under any
   button in any order: the structural guard must be a refusal that leaves the graphic in a defined
   state, never a precondition the panel is trusted to enforce. Our runtime already refuses (an
   illegal event answers 200 and moves nothing) [repo] - the obligation is that no behaviour may
   ever *depend* on the greying.
6. **`v_` is the only extension door, and everything behind it must be ignorable.** A behaviour may
   use `v_noacg` to look better in our own surfaces; it may never need it to work.

---

## 5. The poll, answered concretely

Session T is building Open / Close / Reveal plus a live tally. **Can that be expressed as OGraf
actions today?**

**Open / Close / Reveal: yes, completely, and two ways at once.**

- As `customActions`: three entries `{id:"open"|"close"|"result", name:"Open voting"|…, schema}`.
  This is already what our exporter emits from `machine.controls` [code], and the shipped
  `livePoll` type already declares `close` / `result` / `call` as controls. [code]
- As steps: the poll's `defaultPath` walk (`board → result → out`) exports as `stepCount`, so a
  renderer with no idea what a vote is still shows the options, shows the result and takes it off
  by pressing next. [code]
- Each of the three can declare its animation length through `actionDurations`
  (`type: "customAction"`, `customActionId: "result"`, `duration: 450`).

**The live tally: it crosses as DATA, and does not cross as a CONTROL.**

- As a value: it is `schema` properties written by `updateAction`. Fully legal. Where the counts
  come from is entirely outside OGraf's scope and stays ours - `AudienceTally` is counted on read
  over the votes' own primary key and reaches the graphic as an ordinary update. [code]
- As an operator control: **GDD has no array or table `gddType` and no specified GUI for an array**
  (§4a), so a stranger's generated form has nothing to draw for "four options, each with a count".
  Our own answer today is one `string` - the pipe-line textarea, `"Label | count"` per line [code] -
  which is honest, crosses perfectly, and is opaque. **There is no standard to adopt here yet**;
  this is a genuine hole in the spec, not a thing we have failed to read.

**What is missing, in the order it hurts:**

1. **The graphic cannot tell anyone anything.** No push, no subscription (§4b), and even the one
   legal polled answer - `ReturnPayload.result` - is dropped by the Server API on a graphic's custom
   action (§4c). So over the standard wire a poll cannot report the tally it holds, cannot report
   that voting is closed, and cannot report which state it is in. Our own machine-state answer
   (`noacgMachineState()` → `control_report`, which the overflow warning rides too) has **no OGraf
   equivalent at any layer**. Worth knowing: our exporter does not even use the one home that
   exists - the emitted `_customAction` returns `{statusCode: 200, currentStep}` and never a
   `result`. [code]
2. **The three buttons are always live.** Legality cannot be declared (§4b), so an operator on a
   foreign renderer sees Open, Close and Reveal all enabled and finds out by pressing. Our importer
   already says this out loud - *"OGraf has no state graph, so every button is live"* [repo] - and
   it is the biggest single loss in a round trip, because greying is the thing our panels are best
   at.
3. **The voting window is invisible.** `livePoll` closes the vote on a `timer` transition after 20
   speed-relative seconds. [code] OGraf's only time construct is `setActionsSchedule`, which is
   required only for non-real-time graphics and is an offline render schedule, not a live
   countdown. A real-time graphic may of course run its own timer; nothing in the manifest declares
   it and - by (1) - nothing outside it ever learns that it fired. **The auto-close is expressible
   as behaviour and unexpressible as contract.**
4. **The tally has no widget.** §4a / above.

**One-sentence verdict.** *Open / Close / Reveal is fully expressible in OGraf v1 today and needs
nothing new; the tally crosses as data but has no standard control; and the two things a poll panel
actually needs - "which button is legal now" and "the window just closed the vote by itself" - have
no expression anywhere in the standard, only inside the graphic's private runtime.*

**The design consequence for Session T, stated as an instruction rather than an observation:** put
the poll's open/closed status and its counts in **fields**, not only in machine state. A field
crosses every boundary in this document. Machine state crosses none of them.

> **Followed through, 2026-08-30.** That instruction is now a written design -
> **`docs/OGRAF_STATE_IN_FIELDS.md`** - which generalises it (the controller OWNS the fact, the
> graphic obeys and renders it, so no return channel is needed), states which of the three facts it
> serves well and which it only approximates (the tally completely, the status well at the price of
> one prohibition on graphic-owned timers, **legality not at all**), and names its own expiry. The
> spec gap is filed upstream as <https://github.com/ebu/ograf/issues/82>; the design does not wait
> on it.

---

## 6. The verdict table

Ordered by what the current push (`docs/GOALS.md`, `## NOW` - quiz + scoreboard, and the
poll being built now) needs first. **Cost is shape, not schedule.** Rows are only here because
something real is behind them; nothing was invented to fill the table.

| # | Capability | Them | Us | Gap | What closing it costs |
|---|---|---|---|---|---|
| 1 | **A second and third named behaviour attachable to somebody else's artwork** | MXMZ: hand-built per vertical. Singular: hand-written JavaScript. Neither is a library a customer picks from. | One. The quiz. An imported scoreboard has nowhere to bind its goal flash. [repo, §11 of the behaviour plan] | **Real, and it is ours alone to have.** Nobody else has a declarative answer at all - which is why our one entry is both a lead and an embarrassment. | The third behaviour is what tells us the right abstraction; the seams (`DesignSvgBehaviour`, `SvgQuizDraft`) already exist. Already filed: `docs/backlog/playout-logic-for-all-common-graphics.md`. |
| 2 | **Behaviour state visible to the operator SURVIVES export** | Not applicable - their operator surface and their engine are the same product, so nothing has to survive a boundary. | Machine state is rich in-house and vanishes at the OGraf boundary. | Real, and invisible until somebody exports. | A convention, not a build: behaviour-visible state goes in a field. Cheapest row here and it constrains work happening tonight. New: `docs/backlog/behaviour-state-as-fields.md`. |
| 3 | **A list-with-values field the operator edits as rows** | Singular: `json` node + a `counter` node per value. MXMZ: array variable type + a Repeater element. | One textarea, `"Label \| count"` per line. | Real. It is the poll's own shape and every standings/results board's. | A field kind + one widget in the shared descriptor vocabulary, drawn by five surfaces. OGraf offers no standard to copy (§4a). New: `docs/backlog/tally-field-shape.md`. |
| 4 | **Legality survives a round trip through a package** | Neither has legality at all. | Structural guards mirrored as greying on every surface - our clearest lead - erased by an OGraf export/import. | Real but self-inflicted, and cheap. | Emit the precomputed legality table into `v_noacg`, read it first on import, keep "every button live" as the honest degradation for strangers. New: `docs/backlog/ograf-legality-vendor-block.md`. |
| 5 | **A graphic can report its own state to a host that is not ours** | Not applicable (same reason as row 2). | Nothing. Not even the one legal field. | Real, and half of it is not ours to fix. | Our half is small: return `result` from `customAction`/`updateAction`. Their half is a spec proposal to EBU. New: `docs/backlog/ograf-graphic-state-return.md`. |
| 6 | **Touch-first operator layout** | *"Custom control panels with large touch targets designed for fast-paced live production"* [quoted, MXMZ] | Unmeasured. Our panels are mouse-shaped by default. | Probably real; nobody has looked. | A measurement first, then CSS. The 2026-09-12 production is a real customer for it. Not filed - it belongs in an owner-queue walk, not the backlog. |
| 7 | **An operator-set duration** (a vote window, a hold) | Singular: a `timecontrol` node (play/pause/reset/start). MXMZ: clock management in Match Control. | Match-clock verbs shipped, including the origin-stamped log value. A poll's window is AUTHORED data on the arrow, not an operator field - stated as a known limit in the code. [code] | Small, and honestly documented. | A field-driven timer that could disagree with the arrow's `after` is worse than the current honesty; the real fix is a timer arrow whose `after` reads a field. Not filed - it needs the third behaviour (row 1) to say what shape it should take. |
| 8 | **Auto-advance on the rundown** | *"Pre-load templates, set auto-advance timers"* [quoted, MXMZ] | Timer transitions exist inside the machine; the cue rundown has none. | Real, small. | Already taken: `docs/COMPETITOR_MXMZ.md` §7 lists it under "Take". Not re-filed. |
| 9 | **A production arranges the controls it was given** | MXMZ by building the panel; Singular by authoring the app instance; Vizrt by pages. Everyone has it. | Reserved and not built - the production control profile. | Real, deliberately deferred. | Decided already: `docs/CONTROL_PANEL_ROAD.md` §3. Not re-filed. |
| 10 | **The panel is GENERATED at all** | Singular generates from control nodes. MXMZ does not. Nobody else in the field does. | Five renderers off one generator, no per-graphic code, a stranger's OGraf manifest treated identically. | **No gap. This is the lead**, and it is worth writing down that we checked. | Nothing. Protect it: row 9's profile must stay presentation over declared capability. |
| 11 | **A ± stepper an operator holds** | Singular: `counter` node. MXMZ: score steppers in Match Control. | `number` → ± stepper on every surface with no per-template code, plus `adjust` riding an event. | **No gap.** Verified end to end on imported artwork. [repo] | Nothing. Recorded so the bar is honest in both directions. |
| 12 | **Version history with rollback; locked masters with local variations; team font libraries** | MXMZ has all three [repo / quoted]. | Undo and saved documents; org boilerplate open in `docs/SVG_IMPORT_PLAN.md` P2; per-project fonts. | Real, and not this push. | Already named in `docs/COMPETITOR_MXMZ.md` §4. Not re-filed. |

**The two sentences the table is for.**

*On links 1-3 (drawing → controls) MXMZ is the bar and we are close to it; Singular is not on this
road at all, because its road starts at a rebuild rather than a drawing.* And: *on links 5-6
(assemble → legality) nobody is at our bar, and the reason is structural rather than lucky - our
panel is generated from a declared machine, and theirs cannot be, because they have no machine to
generate from.*

The uncomfortable corollary, which is row 1: the advantage is entirely in the mechanism and almost
not at all in the content. One behaviour attaches to a drawing today. The mechanism deserves more.

---

## 7. What was filed

Four new backlog rows, each carrying its own why:

- `docs/backlog/behaviour-state-as-fields.md` - the convention that makes behaviour state survive
  every boundary in this document. Constrains work in flight tonight.
- `docs/backlog/tally-field-shape.md` - a list-with-values field kind, from the poll's own need.
- `docs/backlog/ograf-legality-vendor-block.md` - keep our best property across a round trip.
- `docs/backlog/ograf-graphic-state-return.md` - use the one legal field, and propose the missing
  one upstream.

Deliberately NOT filed, because something already holds them: the behaviour library (row 1,
`playout-logic-for-all-common-graphics.md`), auto-advance timers (row 8,
`COMPETITOR_MXMZ.md` §7), the production control profile (row 9, `CONTROL_PANEL_ROAD.md` §3),
version history / locked masters / team fonts (row 12, `COMPETITOR_MXMZ.md` §4), and touch targets
(row 6, which needs an owner's thumb on a screen rather than a shelf).

---

## 8. Sources

Read 2026-08-30 unless stated. Public material only.

**MXMZ** - <https://www.mxmz.com/products/cloud-editor>, <https://www.mxmz.com/products/operator>.
Everything else about MXMZ in this file is cited to `docs/COMPETITOR_MXMZ.md` (2026-08-22,
re-read 2026-08-28) and `docs/EDITOR_RESEARCH.md` §MXMZ (2026-08-28, from their editor screenshot
and marketing video), and was not re-derived. **No documentation site, no API reference, no trial.**

**Singular.Live** - developer portal:
<https://developer.singular.live/llms.txt> (index),
<https://developer.singular.live/composition-scripting/overview.md> (the four script scopes and the
listener list - the strongest quoted evidence in §3),
<https://developer.singular.live/rest-api/how-to-guides/get-a-control-apps-model.md> (the control
node model's fields, with example JSON),
<https://developer.singular.live/singular-basics/building-overlays-in-composer/how-to-set-up-control-nodes-to-make-widget-properties-available-to-a-control-app.md>
(+ its `?ask=` endpoint for the node-type list and the SVG-widget answer),
<https://developer.singular.live/singular-basics/controlling-overlays-in-studio-and-uno/how-to-use-studio.md>
(the operator surface),
<https://developer.singular.live/software-development-kits/app-sdk.md> (the email gate).
`support.singular.live` **403s to automated fetch**; its contribution here is search-result
excerpts only. Prior round's Singular sources are listed in `docs/EDITOR_RESEARCH.md`.

**OGraf v1** - <https://ograf.ebu.io/v1/specification/docs/Specification.html>;
<https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json>;
<https://ograf.ebu.io/v1/specification/json-schemas/gdd/gdd-types.json>;
`ebu/ograf` `v1/specification/open-api/server-api.yaml` at `main` (read via the GitHub API - the
`raw.githubusercontent.com` path 404s). The `ograf-expert` skill
(`.agent-workflows/ograf-expert.md`) was used for the manifest and Web Component contract rather
than guessing at them.

**This repository** - `src/export/targets/ograf.ts` (the customActions builder, the emitted
`_customAction`'s return, the step walk), `src/templates/types/livePoll.ts` (the shipped poll
machine, its controls and its authored window), `src/audience/audienceTypes.ts` (`AudienceRound`,
`AudienceTally`), `src/control/ografContract.ts` and `docs/CONTROL_LAYER.md` (the one generator and
its five renderers), `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10-§11 (what the import road proved and what
it found structural).

**Refresh discipline.** Competitor claims are time-driven like every other research file here:
treat anything above older than a quarter as stale, and re-check any row before it changes an
architecture decision. The OGraf rows are spec-derived and move only when the spec does -
`scripts/check-ograf-schema.mjs` already watches the schema files weekly, and
`docs/backlog/ograf-ecosystem-watch.md` is the standing ledger.
