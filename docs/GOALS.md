# Goals

The committed north star. **This file holds only what is NOT done.** A milestone that lands moves
to [`GOALS_ARCHIVE.md`](GOALS_ARCHIVE.md) verbatim - the full shipped record with dates and
rationale, so nothing is lost - and is deleted from here. When the direction changes, rewrite this
file; the archive keeps the history. **Keep it under ~200 lines** (owner-confirmed 2026-09-01;
this is the one place the budget is stated - other docs point here): a roadmap nobody can read in
one sitting steers nothing. Rationale lives in plan docs; this file carries the item and the link.

**`## NOW` IS THE PUSH; EVERYTHING UNDER `## NEXT`, `## THEN` AND `## Parking lot` IS PARKED** -
committed to, described well, and deliberately not started. Parked work begins when the owner
moves it up, never because a section here reads like a plan. **A parked section may carve out an
exception in its own text** - the OGraf one does - and that carve-out binds where it is written.
**A section governed by an ACTIVE programme in [`PROGRAMMES.md`](PROGRAMMES.md) is unparked to
exactly the extent its register row states** - only the owner activates a programme, so the
anti-raid purpose survives. The root `AGENTS.md` states the same rule; this file is where it binds.

---

## North star

> **One link, live anywhere.**
> Pick a broadcast graphic, make it yours without touching code, and put it on air in five
> minutes - in CasparCG, SPX, OBS, vMix, or whatever the show runs on - from **one output URL**,
> driven by a **control panel inside NoaCG**.
>
> And when the catalog does not have what the show needs: **draw your own graphic, give it the
> behaviour the show needs, and play that out the same way** - still without code.

That URL is the product. Everything else serves it: the wizard exists to fill it, the catalog
exists to make it look paid-for, the export adapters exist so it reaches any playout machine, the
control layer exists so a person can drive it live.

**The core question - what NoaCG is actually trying to solve** (owner, 2026-08-22). Drawing a
graphic without code is the easier half; the hard half is **giving it LOGIC, and then CHANGING that
logic**, without code. A quiz that locks an answer and then reveals it is one set of rules - and the
next producer wants no lock at all, just an immediate reveal. Two surfaces have been tried at this
and neither landed as a way a non-programmer authors logic: the **canvas editor** and the **node
editor**. The question stays open, it gets attacked from several angles rather than one, and it has
no hard date. It is also the thing that decides whether NoaCG is usable by productions bigger than
one school, so nothing here is a side quest. It is programme **P2**, a standing research thread.

The first-named user is a **student or non-technical operator** who runs a real production without
ever seeing code; organizations, channels, streamers and universities follow. A **professional**
keeps full control through **Advanced mode** - the editor, one toggle away, never required. The
generated HTML/CSS/JS is the single source of truth and stays clean and readable.

**The binding deadline: students run a real production with their OWN graphics by 2026-09-12.**
Work that does not serve that date is not current work.

**The year beyond this file**: [`NORTH_STAR_2027.md`](NORTH_STAR_2027.md) (ratified 2026-09-01)
is the one-year north star and evidence model; [`PROGRAMMES.md`](PROGRAMMES.md) is the live
register of what the orchestrator may advance. Never mark a capability complete because its
implementation exists - claims advance by evidence rung.

### What "done right" feels like
- **Fast** - open NoaCG, choose a design, make a production, paste the URL, live in under 5 min.
- **Tasteful** - every design looks like a paid MotionArray/Envato asset, not a tutorial demo.
- **Consistent** - graphics made together share one palette and type family across categories.
- **Yours** - custom colors and imported fonts are first-class; fonts embed in the export.
- **Smooth** - 60 fps, transform/opacity only, professional easing.
- **Reliable** - every export passes the validation gate and plugs straight in.
- **Editable** - a pro can open any generated file and extend it. Nobody has to.

### Anything-goes export (a platform, not an SPX generator)
Many environments - **SPX, CasparCG, OBS, vMix, OGraf**, more over time - each an adapter off one
source, so breadth costs no rework. The source is **NoaCG-native, code-as-truth**: one HTML
document that happens to satisfy the SPX contract. SPX is an adapter and the strictest gate;
OGraf is the canonical interchange and playout contract (`docs/OGRAF_FIRST_REVIEW.md`).

### Operating principles
- **Free forever for the core.** Creating, editing, exporting, controlling, self-hosting.
- **One paid surface, later: hosted AI** for users who will not bring their own key.
  **Bring-your-own-key is always free.**
- **Users, not revenue.** Money is a later consequence of a large, happy user base.
- **No sign-in for its own sake.** An account is asked for only where it *buys* something.

### Who we are replacing
Four products; their proven capabilities are our requirements list. The full read, per capability
and per gap, is [`COMPETITORS.md`](COMPETITORS.md):
- **Rive** - designer-first state-machine logic; sets the bar for our machine + logic surface.
- **Singular.live** - cloud graphics + browser control room; our gap to open is breadth.
- **Loopic** - closest positioning; its timeline/canvas are what Advanced mode has to beat.
- **MXMZ** - Yle's named model; proves "your own SVG, playable" at broadcast scale. Nothing
  public shows them authoring LOGIC at all - that gap is ours to take.

---

## NOW - students make their OWN graphics, and play them out

**The goal, owner 2026-08-22:**

> A student draws **their own graphic** - any graphic, not a lower third - gives it **the behaviour
> their show needs**, and plays it out from the dashboard. **Without writing a line of code.**

**The date is 2026-09-12** - a real production with real students. Two graphics decide it: a
**QUIZ** (lock / reveal) and a **SCOREBOARD** (score + / -). **The student draws the graphic; we
supply the behaviour.** The student release before this is CLOSED (archive).

**A WALK THAT IS OWED NEVER BLOCKS WORK** (owner, 2026-08-30, unprompted and twice): *"It's up to
me to test what I need to test. You don't have to block any work just because I haven't tested
something or something is not done... nothing should block stuff."* `docs/acceptance/owner-queue/`
is a record of what is waiting to be SEEN, never a gate on what may be STARTED; nothing in it
expires. Keep building; he catches up when he catches up.

- [ ] **1. Prove the SVG road, with eyes on it.** SVG import v1 is merged
      (`docs/SVG_IMPORT_PLAN.md`) and nobody has walked it. The owner walks it first, because
      whether the workflow is CLEAR is the half no test can answer. Everything below assumes it.
- [ ] **2. Attach BEHAVIOUR to a graphic somebody else drew.** Both cases work - pinned by
      `e2e/import-svg-behaviour.spec.ts`, designed in `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10,
      shipped detail in the archive. **What is left is the OWNER WALK.**
- [ ] **3. The two graphics, walked as a student would.** Draw, import, bind, attach behaviour,
      one production, run from the dashboard - lock, reveal, +1, -1 - operator never sees code.
      The acceptance test for the whole goal, and the rehearsal for 2026-09-12.
- [ ] **TEXT HAS TO KNOW ITS BOX** (owner walk, 2026-09-02, on his own quiz board) - *"the system
      has no idea how the text should behave in relation to the graphics behind it... we need to
      establish a system where the text appears as if it is designed on the graphic, regardless of
      whether the text is short or long."* Every field lives in the shape drawn under it; the text
      owns its alignment, the box owns its growth. Design and the two measured defects underneath
      it: **`docs/TEXT_BOX_BINDING.md`**. This is step 3's blocker - his board looked wrong the
      moment a real question was typed into it.
- [ ] **The owner walks goals 4/5/6 from the 2026-08-25 SVG-road walk** - all three BUILT
      2026-08-26 (one line per thing + ⓘ; "what travels with it" explains itself; SPEED visibly
      changes the preview). Verbatim feedback and costs in the archive. His bar: *"If I can't
      automatically understand what it is, it's probably not good enough yet."*

- [ ] **Brands: make one, choose it in the wizard, the graphic adapts** (owner, 2026-09-05 - the
      footer checkbox copies a look nobody chose, and a logo has no road into a brand). Plan and
      the two wave rows: **`docs/BRAND_PLAN.md`**; level 2 (the PDF brand bible) stays parked there.

**Deliberately NOT in the three weeks: CUSTOMIZING that behaviour** (owner, 2026-08-22 - *"what if
I don't want to be able to lock it?"*). That is the P2 question one level up; for the class, our
behaviour used as-is is enough.

### The playout dashboard

Binding design `docs/PLAYOUT_DASHBOARD.md`; parity `docs/CONTROL_PANEL_PARITY.md`. **Accepted as
it stands, owner 2026-08-22**; one amendment since: the verb block stays **two columns wide with
TAKE spanning them at every window size**. The Preview VERB is gone from the in-app and hosted
pages, deliberately kept in the exported controller (archive, 2026-08-30).

- [ ] **Re-take has to justify its place.** Owner: *"why can't you just press take again?"*
      Because TAKE is a TOGGLE (owner, 2026-08-06): re-take is how the NEXT row goes onto a layer
      already up - which is exactly how the quiz bank walks. Only the owner can close this box.
- [ ] **OPEN, the owner's to answer: does SPACE go to preview first?** It would replace
      selection-is-preview and re-open what TAKE means. Either way it is the same button - no
      separate Preview control returns.

---

## NEXT - OGraf-first: the standards-based platform

**Ratified by the owner 2026-08-29, with amendments; `docs/OGRAF_FIRST_REVIEW.md` is the costing
and the record. Programme P6 in [`PROGRAMMES.md`](PROGRAMMES.md), whose only entry condition is a date, so it may
start now; the NOW date is a forecast of when it matters, not a wait (owner 2026-09-03).** The
verdict: OGraf is the canonical interchange and playout contract; the NoaCG-native code-as-truth
document stays the canonical authoring format (SPX an adapter, keeping the strictest gate); the
Server API becomes the standard face over the command log, which stays the internal transport.
Principle: **use the EBU contract wherever it already solves the problem; invent nothing the
standard already specifies.**

**Sequencing, loosened by the owner 2026-08-30** - *"we need to loosen the sentence."* It used to
read *nothing below starts before the NOW date*, and OGraf work landed three times in the week that
sentence was written. What it protects against is the roadmap being RAIDED, not the interchange
contract going unhonoured while the EBU relationship is live. So **OGraf work that serves the
current push is current work**: honouring the standard inside what we are already building, and
answering a question a shipped behaviour actually raises (`docs/OGRAF_STATE_IN_FIELDS.md` is the
worked example). **The LADDER below is what stays parked** - import, foreign-package playout, the
Server API facade and outreach are each a NEW surface rather than a contract honoured in an
existing one. They are ORDERED after the push rather than blocked by it - owner 2026-09-03: a date is a forecast of when work matters, never permission to wait; the test to start is a clear vision and no fire burning.

- [ ] CasparCG Stage 1 accepted on real hardware (owner-queue, 2026-08-25)
- [ ] GDD alignment: emit standard `gddType`, honest `stepCount` 0/-1, one step-walk
- [ ] the interop suite: scripted external-renderer round + foreign-fixture corpus
- [ ] untrusted-package isolation - the player-host sandbox pattern applied to OGraf hosting;
      a prerequisite for import, not a feature
- [ ] **OGraf import v1** - a stranger's package as a first-class library/production citizen:
      playable, data-editable, operated by the same dashboard; never code-editable
- [ ] **OGraf playout on the existing output architecture** - foreign packages mounted on
      `/output` layers behind the sandbox; never a separate playout system (owner ruling
      2026-08-29 evening: this before any outreach; `docs/OGRAF_ECOSYSTEM.md` §5)
- [ ] **`/output` speaks the OGraf Server API** - the facade over the command log; the item that
      puts NoaCG on the lists MXMZ is on
- [ ] outreach, GATED behind a real production running on the above (owner, 2026-08-29):
      ecosystem listing (`docs/IBC_LISTING_CHECKLIST.md`), checker-CI, any EBU contact
- then: the controller speaking the Server API outward; the desktop client; the native SDI
  renderer - in that order, the last still parked on the 2026-08-16 ruling.
- [ ] **GSAP licence**: obtain written clarification from Webflow/GSAP on the prohibited-uses
      clause (owner); until then preserve replaceability - no new GSAP-only surface area.
      **Owner, 2026-09-05: not yet - remind me in six months.** The ask is off the walk queue and
      on a calendar row (`gsap-licence` in `scripts/check-vendored-versions.mjs`), due around
      2027-03-04. The replaceability half is unchanged and still binding.

**The Yle thread**: nothing is owed now; the owner re-contacts in a few weeks, and in roughly a
month Yle would try NoaCG inside one of their productions. Expect one question - which ports and
hosts their strict network blocks. Answer it when they report it.

## NEXT - coding agents make NoaCG graphics (the agent door)

**Shipped 2026-08-22** (`docs/AGENT_CLI.md`, `docs/AGENT_SAVE.md`; archive has the detail); the
measured 25-cell round: all airable, skill stays contract-only (`benchmarks/agent/rounds/
2026-08-22/VERDICT.md`). **Programme P5**; the direction pool is `docs/backlog/cli-roadmap.md`.

- [ ] **Publish** - `npm publish` of `noacg`, the marketplace entry live. Owner's call.
- [ ] **Agent-authored machines - the owner gate is armed.** Decide whether the skill blesses an
      authored machine when no type fits, and what extra validation that path needs.
- [ ] **What the funded tiers can borrow** - diff the round's winning cells against Lite/Pro.

## NEXT - AI that anyone can afford

Three execution tiers behind one "Create with AI" door; capability first, funding follows. Detail
in the plan docs. **The price targets are commitments, not observations** - a tier that cannot be
served inside its target changes ROUTE, never price.

| Tier | Target | State |
|---|---|---|
| **Lite** (us, free) | 100/€1; measured $0.00032 | gate FAILED 2026-08-14, REVIVED 2026-08-15; bar = the same §2 gate re-run (`docs/AI_LITE_BRAND_PLAN.md`); a second FAIL stands |
| **Pro** (user, a little) | ~€10/100; measured ~$0.004 | LIVE since 2026-08-15; design-language tier, Phase A (`docs/NOACG_PRO_PLAN.md` §15) |
| **BYO key** | provider price | shipped |
| **Extreme** (subscription) | after income | not started; funded routes stay cheap-model on the managed transport until income |

- [ ] **Lite: make it good, then re-run its gate** - quality, not budget; the catalog is the
      crutch AND the moat (`docs/ADAPT_FIRST_PLAN.md`). **The gate for every other AI goal.**
      Two ballot notes still unfixed belong in the re-run build.
- [ ] **Pro** - open, in order: the two-round set read; validating the fail-closed custom lane;
      the topic card's read into the package. Every paid round spend-capped, approved separately.
- [ ] **The Pro Harness** (owner brief 2026-09-05): any custom graphic from a cheap model, as a
      standard template, through an evidence-driven tool loop - `docs/PRO_HARNESS_PLAN.md`. Loop
      core built; the first paid round (§10 there) awaits a stated cap.
- [ ] **A generated graphic can carry its own STATE MACHINE** - every tier. No generation path
      asks a model for a machine, and `importAnimData` drops one by construction; the fix is a
      structured MACHINE stage spliced in deterministically. **The gap between "make a graphic"
      and "run a show".**
- [ ] **A school account earns more AI** - a verified school-domain address issues a grant
      (`src/entitlements/contract.ts`). The first honest reason to sign in that is not a paywall.
- [ ] **AI kits** - Lite generating the set; blocked until Lite passes the §2 re-run.

---

## THEN - the custom road (now the programme register)

The old THEN list graduated into [`PROGRAMMES.md`](PROGRAMMES.md) on 2026-09-01:

0. **TEAMS** - several people holding ONE production (owner, 2026-08-21) -> **P1, in DESIGN now**.
1. **WYSIWYG canvas** (`docs/WYSIWYG_PLAN.md`; tried once, did not land) -> **P7**; a second
   attempt starts by saying what was wrong with the first.
2. **The node editor as a first-class authoring surface** (also tried, also did not land) ->
   the **P2** research question; the answer is not assumed to be a third editor.
3. **Singular.Live class** - live data, automation, multi-operator -> **P3 + P4**.

---

## Parking lot

Real work, deliberately not now. Each has a plan doc; none is current until pulled up (or until
its programme activates).

- **Cloud playout stages 2-4** (`docs/CLOUD_PLAYOUT.md`): versions + rollback, operator sharing,
  rate caps; the **Data Hub** (-> P4); professional automation (-> P4).
- **Adapt-first paid proofs** (`docs/ADAPT_FIRST_PLAN.md` §6.2/§6.3) - explicit spend approval.
- **Managed funded AI tier** - belongs with Extreme. **Payments/subscriptions** - long beta first.
- **Nightly auto-generated graphics library** (`docs/NIGHTLY_AUTOMATION_PLAN.md`).
- **Audience page per-show customisation** + **chat ingestion into the audience plane**
  (`docs/INTERACTIVE_PLAYOUT_PLAN.md`) - held while the plain join page is being accepted.
- **Account infrastructure before real students** (`docs/DEPLOYMENT.md`, "Auth email" and "Google
  sign-in"): custom SMTP (built-in sender caps at a handful of mails/hour; SPF/DKIM lead time is
  weeks) and the Google OAuth client (button ships hidden behind `GOOGLE_SIGN_IN_ENABLED`). Both
  owner-only provisioning, asked for 2026-08-24, step-by-step written down. P1 makes them urgent.
- **Video/animation projects** - the Beta shell stays until the north star lands.
- **The dedicated preview channel, Home polish** - postponed, still wanted.

---

## Quality bar (always-on)

The full procedure is `docs/VERIFICATION.md`; what this file adds is the one bar nothing there
enforces: **the live suite runs against the real project before a class, and again after any
change to publish, output or the topbar.** It only ever runs by hand, so nothing reports the rot
it finds - the 2026-08-08 run went 7 of 18 before repair.
