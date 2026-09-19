# Goals

The committed north star, holding **only what is NOT done**; a milestone that lands moves verbatim
to [`GOALS_ARCHIVE.md`](GOALS_ARCHIVE.md) and is deleted from here. **Keep it under 200 lines**
(owner-confirmed 2026-09-01): a roadmap nobody can read in one sitting steers nothing. That is the
ONE place the budget is stated - other docs point here, and `npm run check:goals-budget` reads the
number out of it. An item's argument lives in its plan doc; this file carries item and link.

**`## NOW` IS WHAT THE DATED EVENTS NEED; NOTHING ELSE IS PARKED** (owner, 2026-09-15, in
`docs/OWNER_RULINGS.md`). The sections below it are described work in a rough order, any of which
may start when there is a clear vision of how. Every programme in [`PROGRAMMES.md`](PROGRAMMES.md)
is AUTHORIZED; its scope edges still return to the owner.

---

## North star

> **One link, live anywhere.** Pick a broadcast graphic, make it yours without touching code, and
> put it on air in five minutes - in CasparCG, SPX, OBS, vMix, or whatever the show runs on - from
> **one output URL**, driven by a **control panel inside NoaCG**. And when the catalog does not have
> what the show needs: **draw your own graphic, give it the behaviour the show needs, and play that
> out the same way** - still without code.

That URL is the product: the wizard fills it, the catalog makes it look paid-for, the control layer
drives it live, and the export adapters carry it to any playout machine - **SPX, CasparCG, OBS,
vMix, OGraf**, more over time, each an adapter off one **NoaCG-native, code-as-truth** HTML document
of which SPX is the strictest gate. This is a platform, not an SPX generator. Its first-named user
is a **student or non-technical operator** running a real production without ever seeing code, with
organizations, channels, streamers and universities behind them, while a **professional** keeps full
control through **Advanced mode**, one toggle away and never required. What "done right" means is
[`DESIGN_LANGUAGE.md`](DESIGN_LANGUAGE.md): paid-asset taste, one palette across a set, imported
fonts that embed, 60 fps on transform and opacity.

**The core question is authoring LOGIC without code, and then CHANGING it** (owner, 2026-08-22) -
drawing without code is the easier half. It is programme **P2**, which carries the argument and the
two surfaces already tried: a standing thread with no date that decides whether NoaCG serves
productions bigger than one school.

**The dates: 2026-09-25, students and Yle people try NoaCG hands on and their own graphics play;
an early-October production on the scoreboards and quiz boards; 2026-10-20, the Elämäni biisi
DEMONSTRATION - a follow-along score in the room, run on SPX, shown to the programme's producers to
prove how easily the graphic is made. Not an air date, not Yle's playout** (owner, 2026-09-16).
NOW lists what they need; work that serves none of them is still current when it makes sense. The
year beyond this file is [`NORTH_STAR_2027.md`](NORTH_STAR_2027.md), whose evidence model stops a
capability being called complete because its implementation exists. **Who we are replacing**,
capability by capability, is [`COMPETITORS.md`](COMPETITORS.md): Zero Density first (owner,
2026-09-15; its OGraf Studio is the interaction reference for the editor rebuild), then Rive,
Singular.live, Loopic, MXMZ and Pixla - none of which lets a non-programmer author LOGIC.

**The posture** (owner, 2026-09-07): accessibility is what NoaCG competes on, and
`docs/PROMISE_AUDIT.md` grades what the landing page may claim for it. Everything is **free
forever** - creating, editing, exporting, controlling, self-hosting, no "core" held back - with
**no paid surface and none planned**: hosted AI is subsidised rather than sold, and Lite / Pro / BYO
are AI tiers rather than editions. **Users, not revenue**; an account is asked for only where it
buys something.

## NOW - students make their OWN graphics, and play them out

**The goal, owner 2026-08-22:** a student draws **their own graphic** - any graphic, not a lower
third - gives it **the behaviour their show needs**, and plays it out from the dashboard, **without
writing a line of code.** On **2026-09-25** students and Yle people try that hands on, and we owe
one presentation and one step-by-step guide over SVG import and the CLI to the NoaCG player, with
beats, routes and the gap list in **`docs/DEMO_2026-09-25.md`**. The next production is early
October, on the **QUIZ** (lock / reveal) and the **SCOREBOARD** (score + / -) as they exist: the
student draws the graphic, we supply the behaviour, and **a walk that is owed never blocks work**
(owner, 2026-08-30).

- [ ] **1. Prove the SVG road, with eyes on it.** Import v1 is merged (`docs/SVG_IMPORT_PLAN.md`)
      and the owner has walked it five times; what is owed is a STRANGER's walk, which no test
      answers - `claude/d-import-road-guide` writes it up.
- [ ] **2. Attach BEHAVIOUR to a graphic somebody else drew.** Both cases work, pinned by
      `e2e/import-svg-behaviour.spec.ts` and `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10. **What is left
      is the OWNER WALK.**
- [ ] **3. The two graphics, walked as a student would.** Draw, import, bind, attach behaviour, one
      production, run from the dashboard - lock, reveal, +1, -1 - operator never sees code. The
      acceptance test for the whole goal, and the dress rehearsal for early October.
- [ ] **TEXT HAS TO KNOW ITS BOX** (owner walk, 2026-09-02): every field lives in the shape drawn
      under it, the text owning its alignment and the box its growth, short text or long -
      **`docs/TEXT_BOX_BINDING.md`**, and step 3's blocker.
- [ ] **The owner walks goals 4/5/6 of the 2026-08-25 SVG-road walk**, built 2026-08-26; his
      feedback and the costs are in the archive.
- [ ] **Brands: make one, choose it in the wizard, the graphic adapts** (owner, 2026-09-05).
      **`docs/BRAND_PLAN.md`** holds the plan and the two wave rows, and parks level 2, the bible.
- [ ] **The production control profile, for 2026-10-20** (owner, 2026-09-15): the ARRANGE and
      COMBINE primitives (**`docs/CONTROL_PANEL_ANY_GRAPHIC.md`** §6). All ten rows of §5 landed by
      2026-09-16, and the date's two open ends are an EYE on the hosted page and the door into SPX -
      the output embed that keeps the profile has never run on a real SPX server. §5a is the day's
      own list.

**CUSTOMIZING that behaviour is not needed for the 25th**, and is no longer held for it (owner,
2026-09-15): it is the P2 question one level up, first step `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5.

---

## NEXT - OGraf-first: the standards-based platform

**Research update, 2026-09-13:** [OGRAF_STUDIO_RESEARCH.md](OGRAF_STUDIO_RESEARCH.md) makes
Zero Density the primary editor/agent comparison; [OGRAF_FULL_STACK_PLAN.md](OGRAF_FULL_STACK_PLAN.md)
records the full-stack boundaries and implementation-ready backlog. This is planning evidence,
not a new push or permission to implement: successful creation/editing/animation, SVG and CLI
workflows, and reliable CasparCG production remain the immediate priorities. The ladder below
and the parked native-renderer position are unchanged.

**Ratified by the owner 2026-08-29, with amendments; `docs/OGRAF_FIRST_REVIEW.md` is the costing
and the record. Programme P6 in [`PROGRAMMES.md`](PROGRAMMES.md), whose only entry condition is a date, so it may
start now; the NOW date is a forecast of when it matters, not a wait (owner 2026-09-03).** The
verdict: OGraf is the canonical interchange and playout contract; the NoaCG-native code-as-truth
document stays the canonical authoring format (SPX an adapter, keeping the strictest gate); the
Server API becomes the standard face over the command log, which stays the internal transport.
Principle: **use the EBU contract wherever it already solves the problem; invent nothing the
standard already specifies.**

**OGraf work that serves the current push is current work** (owner, 2026-08-30) - honouring the
standard inside what we already build. **The LADDER below is what stays parked**: each rung is a NEW
surface, ordered after the push rather than blocked by it, and shown publicly as a dashed card in
the landing page's `#ograf` section until the commit that lands it turns that card solid. **Yle**
would try NoaCG inside a production of their own in roughly a month; one message is owed them now,
the demo script's B0.

- [ ] CasparCG Stage 1 accepted on real hardware (owner-queue, 2026-08-25)
- [ ] GDD alignment: standard `gddType`, honest `stepCount` 0/-1, one step-walk
- [ ] the interop suite: scripted external-renderer round + foreign-fixture corpus
- [ ] untrusted-package isolation - the player-host sandbox applied to OGraf hosting, which is a
      prerequisite for import rather than a feature
- [ ] **OGraf import v1** - a stranger's package as a playable, data-editable library and
      production citizen, operated by the same dashboard and never code-editable
- [ ] **OGraf playout on the existing output architecture** - foreign packages on `/output` layers
      behind the sandbox, before any outreach (owner, 2026-08-29; `docs/OGRAF_ECOSYSTEM.md` §5)
- [ ] **`/output` speaks the OGraf Server API** - the facade over the command log, and the item
      that puts NoaCG on the lists MXMZ is on
- [ ] outreach, GATED behind a real production running on the above (owner, 2026-08-29): the
      ecosystem listing (`docs/IBC_LISTING_CHECKLIST.md`), checker-CI, any EBU contact
- [ ] **the code editor shows OGraf, not only SPX** - a read-only target switch on the code view,
      unhurried (owner, 2026-09-10). `docs/backlog/monaco-shows-ograf-not-only-spx.md`
- [ ] **GSAP licence**: clarification on the prohibited-uses clause, put off to about 2027-03-04
      (owner, 2026-09-05) as the `gsap-licence` row in `scripts/check-vendored-versions.mjs`;
      replaceability stays binding, so no new GSAP-only surface
- then: the controller speaking the Server API outward; the desktop client, a little behind the
  editor and the control panel (ALIGN-2026-09-14-3); the native SDI renderer.

## NEXT - coding agents make NoaCG graphics (the agent door)

Shipped 2026-08-22 (`docs/AGENT_CLI.md`, `docs/AGENT_SAVE.md`); **programme P5**, direction pool
`docs/backlog/cli-roadmap.md`.

- [ ] **Publish - past `main`, so the owner's.** `@noacg/cli` 0.3.0 is on npm and `npm run
      release:cli` is the road for later versions, but nothing publishes until the owner adds the
      trusted publisher on npmjs.com - **needs: account**.
- [ ] **What the funded tiers can borrow** - diff the round's winning cells against Lite/Pro.

## NEXT - AI that anyone can afford

Three execution tiers behind one "Create with AI" door, capability first and funding after. **A
price target is a commitment**: a tier that cannot be served inside it changes ROUTE, never price.

| Tier | Target | State |
|---|---|---|
| **Lite** (us, free) | 100/€1; measured $0.00032 | gate FAILED 2026-08-14, REVIVED 2026-08-15; bar = the same §2 gate re-run (`docs/AI_LITE_BRAND_PLAN.md`); a second FAIL stands |
| **Pro** (user, a little) | ~€10/100; measured ~$0.004 | LIVE since 2026-08-15; design-language tier, Phase A (`docs/NOACG_PRO_PLAN.md` §15) |
| **BYO key** | provider price | shipped |
| **Extreme** (subsidised, not sold) | after income | not started; funded routes stay cheap-model until income. A spend ceiling we carry, never a price we charge (2026-09-07) |

- [ ] **Lite: make it good, then re-run its gate** - quality, not budget; the catalog is the crutch
      AND the moat (`docs/ADAPT_FIRST_PLAN.md`). **The gate for every other AI goal.**
- [ ] **Pro** - in order: the two-round set read; validating the fail-closed custom lane; the topic
      card's read into the package. Every paid round spend-capped, approved separately.
- [ ] **The Pro Harness** (owner brief 2026-09-05): any custom graphic from a cheap model, as a
      standard template, through an evidence-driven tool loop (`docs/PRO_HARNESS_PLAN.md`). The
      loop core is built and the first paid round awaits a stated cap.
- [ ] **A generated graphic can carry its own STATE MACHINE**, every tier. No path asks a model for
      a machine and `importAnimData` drops one by construction; the fix is a structured MACHINE
      stage spliced in deterministically - **the gap between making a graphic and running a show.**
- [ ] **A school account earns more AI** - a verified school-domain address issues a grant
      (`src/entitlements/contract.ts`), the first honest reason to sign in that is not a paywall.
- [ ] **AI kits** - Lite generating the set; blocked until Lite passes the §2 re-run.

## THEN, and the parking lot

The custom road that used to be listed here graduated into [`PROGRAMMES.md`](PROGRAMMES.md) on
2026-09-01: **TEAMS**, several people holding ONE production, is **P1, in DESIGN now**; the
**editor rebuild** is **P7**, governed by [`EDITOR_PLAN.md`](EDITOR_PLAN.md). The **node editor**
is deferred from that rebuild; code and lessons remain. The separate **P2** question is not
assumed to need another editor. The **Singular.live class** - live data, automation and
multi-operator - is **P3 + P4**.

The rest is real work, deliberately not now; each has a plan doc, and none is current until pulled
up or its programme activates.

- **Cloud playout stages 2-4** (`docs/CLOUD_PLAYOUT.md`): versions + rollback, operator sharing,
  rate caps; the **Data Hub** and professional automation (both -> P4).
- **Adapt-first paid proofs** (`docs/ADAPT_FIRST_PLAN.md` §6.2/§6.3) - explicit spend approval.
- **Managed funded AI tier** - with Extreme, subsidised not sold. Payments are RULED OUT, not
  parked (owner, 2026-09-07).
- **Nightly auto-generated graphics library** (`docs/NIGHTLY_AUTOMATION_PLAN.md`).
- **Audience page per-show customisation** and **chat ingestion** into it
  (`docs/INTERACTIVE_PLAYOUT_PLAN.md`), held while the plain join page is being accepted.
- **Account infrastructure before real students** - custom SMTP and the Google OAuth client, both
  owner-only provisioning, written down in `docs/DEPLOYMENT.md`.
- **Video/animation projects** - the Beta shell stays until the north star lands.
- **The dedicated preview channel, Home polish** - postponed, still wanted.
