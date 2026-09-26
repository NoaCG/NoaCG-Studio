# Behaviour state a foreign controller can read - the design, on OGraf v1 as it is

**Written 2026-08-30.** BINDING for every behaviour authored from here on. **This design does not
wait on the standard changing**, and it does not degrade if the standard never changes; §7 states
its own expiry so it cannot become permanent by accident.

The question it answers, asked by the live vote and owed by every behaviour after it:

> A graphic knows things an operator needs to see - the vote is open, the counts are 12/7/3, this
> button would do nothing right now. **How does any of that reach a controller that is not ours,
> using only what OGraf v1 has today?**

**The answer in one line.** Over a wire with no return channel, the only state a controller can be
certain of is state the **controller itself put there** - so a behaviour's operator-visible facts
are modelled as **data the controller owns and the graphic obeys**, mirrored into a FIELD, rather
than as machine state the graphic owns and the controller must ask about. That inversion needs no
return channel at all, which is why it works today.

---

## 1. What the standard actually carries - re-verified line by line

Read 2026-08-30 against `ebu/ograf@8468da1` (`main`), not from memory, because §6 files a public
claim on it. Three artefacts, and **they do not agree with each other.**

| Artefact | What it says about a Graphic's own return value |
|---|---|
| `v1/specification/docs/Specification.md` L241-244 (normative prose) | every action's `ReturnPayload` carries `statusCode`, optional `statusMessage`, and **`result`: "an optional Graphics-specific response object"** |
| `v1/typescript-definitions/src/definitions/types.ts` L6-16 (informative) | `ReturnPayload = { statusCode, statusMessage? } & VendorExtend` - **no `result` at all** |
| `v1/specification/open-api/server-api.yaml` | declares `result` on the **Renderer**'s custom action (L337-346, *"CustomAction successfully executed, returning result"*) and on **none** of the four GraphicInstance action endpoints |

The Server API's GraphicInstance responses, in full:

| Endpoint | 200 response properties |
|---|---|
| `.../graphicInstance/customActions/{id}` (L727-748) | `graphicInstanceId`, `statusCode`, `statusMessage` |
| `.../graphicInstance/playAction` (L579+) | the same, plus `currentStep` (required) |
| `.../graphicInstance/updateAction` (L510+), `.../stopAction` (L653+), `.../load` | ids and status only |
| `GET /renderers/{id}/target` -> `RenderTargetInfo` (L969-993) | per instance: `graphicInstanceId` + which Graphic it is. **No data, no step, no state.** |

And there is no second channel: the Graphics spec defines no events, no subscription, no callback
and no push, and the Server API is plain request/response REST with no websocket or streaming
endpoint. The Graphic never speaks unasked.

### 1a. The correction this round makes - "unspecified", not "dropped"

`docs/CONTROL_PANEL_RESEARCH.md` §4c and `docs/backlog/ograf-graphic-state-return.md` both say the
Server API **drops** `result`. Checked against the de-facto reference implementation, that is too
strong, and the difference matters enough to write down:

- `SuperFlyTV/ograf-server` `packages/renderer-layer/src/lib/LayerHandler.ts` `invokeCustomAction`
  returns the Graphic's **whole** `ReturnPayload` to the server, and
  `packages/server/src/serverApi.ts` L708-718 spreads it into the HTTP body -
  `...result.result, // To pipe through any vendor specific data` - before overriding
  `graphicInstanceId`, `statusCode` and `statusMessage`. A `result` key inside that payload
  therefore **survives**, as a side effect of the vendor pass-through.
- Nothing forbids that: `server-api.yaml` sets `additionalProperties: false` nowhere, so an
  undeclared property is legal in a response.

So the accurate statement is: **`result` is undeclared, not prohibited.** One Server forwards it
today; a Controller written against the OpenAPI document has no field to read it from, no Server
implementer is told to forward it, and nothing tests that any of them do. It is an undocumented
channel, which is exactly what a design may not build on. **The consequence for us is unchanged -
we cannot rely on it - and the reason is now the honest one.**

---

## 2. The rule everything below follows

**If an operator has to SEE it, it is a FIELD. The machine holds what the operator DOES, not what
they read.**

A field is in `SPXGCTemplateDefinition`, in the OGraf manifest's `schema`, in `load()` and
`updateAction()`, and in every generated operator form in the ecosystem. It crosses every boundary
this product has. Machine state - what `noacgMachineState()` answers - is rich in our own surfaces
and **crosses none of them**.

That is not a defect to route around. It is the shape of the wire, and a behaviour designed against
our own runtime and measured against OGraf afterwards is a rewrite.

---

## 3. The design

A behaviour declares a **reported field** for each operator-visible fact. A reported field is:

1. an ordinary `DataField` with a stable `title`, so it appears in the SPX definition, in the OGraf
   `schema`, and in every generated form;
2. **input-only and hidden** - a `<div id="fN" class="noacg-data-source">` holder, never a drawn
   element. The artwork stays the designer's; the runtime reads the holder and writes into the
   layers (`docs/GRAPHIC_TYPES.md`, the countdown's minutes are the same shape);
3. **written by the controller** whenever the fact changes;
4. **read back by the graphic's own runtime** on `update()` and on state entry, so an inbound write
   is authoritative and the graphic obeys it.

Point 4 is the mechanism, not a nicety. It is what lets a controller that cannot dispatch a NoaCG
event still change the graphic's visible behaviour - it sends data, which is the one verb every
OGraf host has.

### 3a. Ownership is inverted on purpose

The naive model is *the graphic owns the fact and reports it*. That model needs a return channel,
and there is none. The design's model is *the controller owns the fact and the graphic renders it*.
A controller never has to ask, because it already knows: it wrote it.

Everything in §4 is a consequence of that one inversion.

---

## 4. The three facts a poll needs, judged honestly

### 4a. The tally - served COMPLETELY

The counts never originated in the graphic. The audience plane counts votes on read over the votes'
own primary key and hands them to an operator, who takes them as an ordinary cue's field values
(`docs/INTERACTIVE_PLAYOUT_PLAN.md` Phase 6); a rehearsing operator types the same box by hand. The
controller holds the numbers before the graphic ever does.

So there is nothing to report and nothing to approximate. The counts ride the `Options` field as
`"Label | count"` lines, cross as one `string`, and any renderer at all can carry them.

**The one real loss is the WIDGET, not the value.** GDD's `gddType` vocabulary is ten scalar values;
`array` is a legal JSON-Schema `type` with no array `gddType` and no specified GUI. A stranger's
generated form has nothing to draw for "four options, each with a count", so the operator gets a
textarea of pipe-delimited text. That is a hole in the standard, not something we failed to read -
`docs/backlog/tally-field-shape.md` owns the improvement, and it is an editor change with the
storage staying a string, so it does not touch this design.

### 4b. Open / closed - served WELL, at the price of one prohibition

Status crosses the same way: a field the controller writes and the runtime reads back. The shipped
imported poll does exactly this - the count line says `"4 votes · voting open"` / `"· voting
closed"`, and `pollVotingClosed()` reads that word back, so the badge comes down whether the
operator pressed **Close voting** or a foreign controller merely sent data.

The two closers do not fight because they are not equals: pressing Close voting takes the machine
out of the voting state, so the badge stays down whatever the data later says; a data close follows
the data, so a controller that reopens the vote gets its badge back.

**The prohibition.** This only holds while the controller can observe every way the fact can change.
A transition the GRAPHIC fires by itself - a timer - changes a visible fact that no controller can
learn about, and there is no channel that would ever tell it. So:

> **A behaviour meant to survive export owns no fact its controller cannot observe.** No internal
> timer transitions on operator-visible state, no internal branching on data the controller did not
> write. Where a window genuinely needs to close itself, the TIMER belongs to the controller, which
> writes the field when it fires.

The imported poll already dropped the catalog board's 20-second auto-close, on the grounds that a
timer nobody drew closing a real audience vote is a hazard rather than a safety net. This design
promotes that from a UX judgement to a **wire requirement**: the arrow had to go anyway.

### 4c. Legality - only APPROXIMATED, and it has no faithful expression

State it plainly, because this is the one where a comfortable answer would be a false one.

**Legality cannot be expressed in OGraf v1, and no arrangement of fields fixes that.** Two
independent reasons, either of which is sufficient:

1. **Legality is a function of the CURRENT state**, and current state is precisely what does not
   cross. A static manifest field can carry the *graph* - that is what
   `docs/backlog/ograf-legality-vendor-block.md` proposes, and it is worth doing for our own
   round trip - but never the *position* to evaluate it at.
2. **`customActions` has nowhere to put the answer.** It is a flat array of `{id, name,
   description?, schema?}`; every action is a peer of every other, always available, with no
   `enabled`, no precondition, no ordering and no grouping. Even a controller that somehow knew the
   position would have no standard field to render greying from.

What the field mirror does buy is a bounded approximation: **once every operator-visible fact lives
in a field the controller owns, the controller can compute legality itself** from its own copy of
the graph, because it knows what it wrote. That approximation is *exact* for a machine whose every
transition is triggered by an operator event the controller sent or a field the controller wrote -
which is exactly the class §4b's prohibition confines behaviours to - and it is *wrong* for any
machine with an internal timer or an internal branch. It is the same prohibition doing the work
twice, which is a good sign it is the right prohibition.

**And the fallback must stay safe, always.** `src/control/ografContract.ts` already says it out
loud - OGraf has no state graph, so every button is live - and `isEventLegal` treats "nothing has
reported" as "every button legal" rather than greying a whole panel out. So:

> **Legality is a courtesy, never a precondition.** Every event must be safe in every state. An
> illegal event answers 200 and moves nothing, leaving the graphic in a defined state. No behaviour
> may ever *depend* on the greying, because on somebody else's renderer there is none.

That is the honest verdict: the tally crosses completely, the status crosses well under one rule,
and **legality does not cross at all** - what crosses is a safety property that makes its absence
harmless.

---

## 5. The rules, as things a reviewer can check

| # | Rule | Why |
|---|---|---|
| R1 | If an operator must SEE it, it is a field. | §2 - a field crosses every boundary; machine state crosses none. |
| R2 | A reported field is READ BACK by the runtime, not only written into. | §3 point 4 - the read-back is what lets a data-only controller change behaviour. |
| R3 | A behaviour that must survive export owns no fact its controller cannot observe. | §4b - no internal timer or branch on operator-visible state. |
| R4 | A reported field is hidden and input-only, never a drawn element. | §3 point 2 - the artwork stays the designer's; the form still offers the input, correctly, because the controller may write it. |
| R5 | Legality is a courtesy, never a precondition; every event is safe in every state. | §4c - on a foreign renderer every button is live. |
| R6 | Where a NoaCG surface must FIND the field, the `title` is a contract and is named in the code that owns it. | `pollFieldMap` matches `Question` / `Options` / `Vote count` / `Vote status` / `Live figures`; renaming one silently unbinds the board from the audience workspace. |
| R7 | One field, one fact. A machine-readable status does not ride inside a human-facing display string. | §5a. |

### 5a. R7, and the deviation that was shipped and then fixed

The imported poll's status token first lived **inside** the `Vote count` line - the same string
that is written into the designer's total layer, read back with `/voting\s+closed/i`. It worked, it
was the cheapest thing that could work, and it had a named cost: **that string is human-facing and
localisable**, so a station writing `"4 ääntä · äänestys suljettu"` got a board saying VOTE NOW
through a closed vote, with nothing anywhere reporting the fault.

**Fixed 2026-08-30, and the reproduction is worth recording** because it is what a deviation from
R7 actually looks like: driven through the dashboard with the count line reworded into Finnish, the
board's `#p-open` badge stayed lit through a genuinely closed vote (`e2e/import-svg-behaviour.spec.ts`,
the vote-board walk). The board now carries a fourth wire field, `Vote status` - a hidden
`noacg-data-source` holder with the vocabulary `open` / `closed` and empty meaning "not stated" -
and `pollVotingClosed()` reads that. `tallyValues` writes both halves: the sentence into
`Vote count` for the designer's total layer, the token into `Vote status` for the runtime.

Two shapes fell out of it that are the pattern for the next behaviour, not incidental to this one:

- **APPEND THE FIELD LAST.** A behaviour's fields compile after the artwork's, and `fieldIdFor`
  resolves a control's payload key by INDEX, so a field added at the END moves no existing `fN`.
  That is what makes a reported field ADDITIVE - no version bump, no migration - by construction
  rather than by luck.
- **KEEP THE OLD READ AS A FALLBACK.** An unstated status falls through to the count line, so a
  board exported before the field existed still closes. A board that suddenly ignored its own
  status line would be a worse failure than the one being fixed.

The catalog board (`src/templates/types/livePoll.ts`) is a different case and still open: its badge
is a keyframe track on the machine's states, so it never read a status back and never had this
defect - what it has is no way for a data-only controller to close it at all.
`docs/backlog/behaviour-state-as-fields.md` owns that.

### 5b. `Live figures`, the second field to take the same shape - and where it differs

The owner ruled on 2026-08-30 that a vote board's percentage figures should keep waiting for Show
result by default, with an opt-in for shows that want them running live. That is a **decision a
production makes**, not a property of the artwork, so by §3 it is a field: a controller that can
only send data can put a board into either mode, and the studio's own checkbox is just one writer
of it. `POLL_LIVE_TITLE` = `Live figures`, vocabulary `live`, empty meaning "wait for the result".

It follows the first shape above exactly - **appended last**, so the four fields before it keep
their `fN`. It deliberately does **not** follow the second: there is no fallback read, and an
unrecognised token reads as empty rather than as anything else.

**The two fields resolve "not stated" in opposite directions, and that is the rule generalising
rather than breaking.** The safe half of not knowing is whatever cannot mislead a room:

| Field | Unstated / unrecognised reads as | Because |
|---|---|---|
| `Vote status` | **closed** | a board wrongly showing VOTE NOW invites votes that will not be counted; a board wrongly plain only looks plain. |
| `Live figures` | **wait for the result** | it is what every board did before the field existed, so a board that has never heard of it behaves byte for byte as it shipped. |

So the pattern for the next reported field is not "empty means off" or "empty means on" - it is
**empty means the outcome you would defend to an operator who never touched this field**.

---

## 6. What we told EBU, and what we did not

An issue was filed on `ebu/ograf` describing the §1 asymmetry - purely technical: the three
artefacts that disagree, the exact files and lines, one concrete thing a Controller cannot learn,
and the smallest additive change that would close it. It pitches nothing and invites nobody; the
standing ruling that EBU and broadcaster **outreach** waits until a real production runs on working OGraf
playout is untouched by it, and remains in force.

**URL: https://github.com/ebu/ograf/issues/82** (filed 2026-08-30)

**This design does not wait on that issue.** A standards change may take months or go nowhere, the
poll needs an answer now, and §7 is written so that either outcome leaves us correct.

---

## 7. The expiry - what would change this design, and what would not

A workaround with no stated exit becomes permanent by accident. This one has four exits and a
default.

- **If the Server API declares `result` on the GraphicInstance action responses** (the filed issue,
  plus the matching `ReturnPayload` fix in the TypeScript definitions): reported fields **stay** -
  they are still the only thing a generated operator form draws, and the tally is data either way -
  but the emitted graphic starts returning its group map and overflow report in `result`, so the
  state CHIP and the greying come back for any host that forwards it. R3 relaxes from *no internal
  timer* to *an internal timer must report through `result`*. R5 does not relax: an unreliable
  return is still not a precondition.
- **If OGraf ever gains a push or subscription channel** (issue #55 was closed 2026-04-29 for want
  of a strong use case, explicitly reopenable): the mirror becomes redundant for STATUS. It stays
  for the tally, because a tally is data and always was.
- **If GDD gains an array presentation**: the pipe-line string can become an `array`-of-`object`
  property with a real widget. Independent of everything above, and owned by
  `docs/backlog/tally-field-shape.md`; the storage stays a string until a real third-party form has
  been observed drawing an array (`docs/backlog/ograf-form-oracle.md` is that instrument).
- **If we ever ship the manifest legality block** (`docs/backlog/ograf-legality-vendor-block.md`):
  a NoaCG package re-imported into NoaCG greys correctly again. It changes nothing for a stranger's
  renderer and nothing in this design - it restores the map, not the position.
- **If nothing changes at all**: this design is permanent and correct. It costs one hidden field per
  visible fact and one prohibition, and it buys a behaviour that works identically in our editor, in
  our dashboard, in an exported overlay, under SPX, and on a renderer we have never seen.

---

## 8. Where it is implemented

- `src/templates/importedDesign/pollBehaviour.ts` - the first customer, and the whole design is
  visible in it: five fields whose titles are the join (`Question`, `Options`, `Vote count`, the
  `Vote status` token of §5a and the `Live figures` token of §5b), hidden `noacg-data-source`
  holders, `pollVotingClosed()` and `pollLiveFigures()` as the
  read-backs, the removed timer arrow, and `paintPollState()` painting from the machine plus the wire
  so a snap recovery repaints instead of replaying beats.
- `src/components/home/ProductionAudienceWorkspace.tsx` - the CONTROLLER half of §3a: `pollFieldMap`
  finds the fields by title and `tallyValues` writes them, which is where "the controller owns the
  fact" stops being a sentence.
- `src/templates/types/livePoll.ts` - the catalog board the arc is derived from.
- `src/export/targets/ograf.ts` - `dataSchema()` turns each field into a GDD property; the emitted
  actions return status and step only (returning `result` is the small in-house half of
  `docs/backlog/ograf-graphic-state-return.md`, still unbuilt and still worth doing per §7).
- `src/control/controlModel.ts` - `eventLegality` / `isEventLegal`, and the "no answer yet means
  every button live" rule R5 depends on.
- `src/control/ografContract.ts` - the import side, which already degrades honestly.

## 9. Evidence

- `ebu/ograf@8468da1`: `v1/specification/open-api/server-api.yaml` (L337-346, L510+, L579+, L653+,
  L727-748, L969-993), `v1/specification/docs/Specification.md` L241-244,
  `v1/typescript-definitions/src/definitions/types.ts` L6-16,
  `v1/specification/json-schemas/gdd/object.json`.
- `SuperFlyTV/ograf-server@HEAD`: `packages/server/src/serverApi.ts` L708-718,
  `packages/renderer-layer/src/lib/LayerHandler.ts` L180-200 - the pass-through behind §1a.
- `docs/CONTROL_PANEL_RESEARCH.md` §4a-4d, §5 - the round that established the gap, corrected here
  on one point (§1a).
- `docs/OGRAF_FIRST_REVIEW.md` §2, §4, §6 - the concept mapping and the wire architecture.
- `docs/CONTROL_LAYER.md` - machine state as what every surface polls, and the one legality
  implementation.
