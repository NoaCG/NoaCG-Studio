# North Star 2027 - the credible platform, and the programme system that builds it

**Status: RATIFIED by the owner 2026-09-01, with amendments - all applied below; §9 records the
rulings.** This document answers the owner's 2026-09-01 brief: audit the proposed one-year
direction against the repository, correct it, and design the governance that lets the orchestrator
keep verified work moving through August 2027 without the owner's availability deciding whether
development continues. The live programme state is **`docs/PROGRAMMES.md`** - the register; this
document carries the argument, the claims and the evidence model behind it. `docs/GOALS.md`
remains the owner's concise immediate steering document.

**The overarching rule, owner's words:** *never mark a major capability complete because its
implementation exists - advance the customer-facing claim only when the required evidence rung is
satisfied.* It is restated where it is enforced: the register's rules block and §4 below.

---

## 1. The audit - where the brief and the repository disagree

The brief was reviewed against the tree, `docs/GOALS.md`, the ratified OGraf review, the
orchestrator contract, the verification machinery and GitHub. Corrections, in order of consequence:

1. **Issue #48 is not a plan.** It is a single prose brief (opened 2026-08-31, no checklist, no
   comments), and its ten pre-implementation questions were already answered and ratified two days
   earlier in `docs/OGRAF_FIRST_REVIEW.md` (owner, 2026-08-29, four amendments). The tracked OGraf
   ladder lives in `docs/GOALS.md` "NEXT - OGraf-first" - eight rungs, zero checked. The roadmap
   below adopts that ladder verbatim; nothing about OGraf is redesigned here. GitHub Issues are
   otherwise unused for feature work in this repo (every other issue is a bot-filed CI alert), so
   the canonical home for this roadmap is a doc, with #48 becoming a pointer (§8).
2. **Behaviour & Control is far more built than the brief assumes.** Shipped: the versioned state
   machine model with groups, events, timers and structural guards (`docs/STATE_MACHINE_SCHEMA.md`),
   the node editor (`MachineGraph` over pure mutators), one control generator rendering five
   operator surfaces (`docs/CONTROL_LAYER.md`), graphic types that declare machines, and
   behaviour-attach onto imported artwork (pinned by `e2e/import-svg-behaviour.spec.ts`). What is
   genuinely unsolved is exactly what `docs/GOALS.md` calls "the core question": a surface a
   non-programmer uses to AUTHOR and CHANGE logic. Both prior attempts (canvas editor, node editor)
   failed at that, and GOALS.md rules that "the answer is not assumed to be a third editor". The
   programme is therefore research-shaped at its heart, not build-shaped.
3. **One doctrine collision - RULED (owner, 2026-09-01).** The brief lists "conditions" among
   behaviour capabilities; `docs/STATE_MACHINE_SCHEMA.md` rules "no expression language, ever" -
   guarding is structural. The ruling: the doctrine stands. The requirement is that users achieve
   conditional/state-dependent behaviour through structural states, transitions, events and
   guards; the doctrine reopens only if concrete required behaviour proves impossible or
   materially worse under the structural model.
4. **Teams matches owner intent and is genuinely absent.** Already THEN item 0 in GOALS.md
   ("several people holding ONE production", owner 2026-08-21, "numbered 0 because the deadline
   case leans on it"). No team/org/membership table exists in any of the 52 migrations; every RLS
   policy is `auth.uid() = user_id`; entitlements resolve for one uid; sync is last-write-wins with
   conflict copies. One nuance the brief misses: capability URLs already let several people
   OPERATE one production today - the gap is shared ownership and preparation under named accounts,
   and the acceptance claim in §5 is scoped to that.
5. **Production/Rundown/Media is half-built.** Cue rundown, layer stack, staged-vs-take, the
   persistent `/output` renderer, per-graphic boot recovery and stills all shipped. Absent: video
   and audio in productions, and timed/automated rundown advance. The designed path for clips
   (`docs/backlog/video-through-playout-wrapper.md`) is reference playout - NoaCG sends the file
   reference, CasparCG plays it; media never travels through the web. The owner has named clip
   playout the one reason he cannot use productions for his own shows - it is the highest-value
   small slice in the whole brief.
6. **"Playout infrastructure" mostly dissolves - with one owner correction (2026-09-01).**
   SDI/NDI output through CasparCG exists today (DeckLink consumer, native NDI); own-renderer/
   desktop work stays parked on the 2026-08-16 ruling ("rent the engine forever"), with
   `docs/NATIVE_PLAYOUT_RESEARCH.md` as the dossier for the day it reopens. No separate programme
   is warranted - but the CUSTOMER-FACING professional playout requirement does not dissolve with
   it: P3 and H0 must explicitly prove that a NoaCG operator runs graphics, stills, video and
   audio through the NoaCG rundown and reaches real SDI/NDI via CasparCG or other proven
   infrastructure. "CasparCG supports SDI/NDI" is never sufficient evidence that the NoaCG
   workflow does.
7. **The governance seed already exists and lacks only an artifact.** `.agent-workflows/`
   `orchestrator.md` "Big projects are phased" already grants ratify-once-then-run: the owner
   ratifies a concrete picture once, then phases chain without per-step checks. What is missing is
   any record of WHICH pictures are ratified, what stage each is at, and what evidence advances
   them - so the licence is currently unusable across sessions. §3 builds exactly that record and
   nothing else; the lifecycle the brief proposed collapses into it almost unchanged.
8. **The autonomy mechanics must not be the ones the brief implies.** The 24-hour unattended
   ceiling and "the report is the checkpoint - the loop can extend a wave, never extend itself"
   are load-bearing owner protections. They stay. Continuous work does not come from longer
   chains; it comes from every new wave finding legitimate next stages in the programme register.
   Each wave still reports daily; the alignment questionnaire remains the cheap after-the-fact
   veto. This satisfies "never idle because the owner is busy" without re-opening "the day that
   went happily in the wrong direction".
9. **The maturity model maps almost one-to-one onto existing machinery** (§4). The genuine holes,
   in priority order: multi-user tests against a real backend (zero `newContext` uses in
   `e2e/configured/`), a soak harness (nothing runs longer than ~45 minutes), property-based tests
   (absent; the machine mutators and the event queue are the natural first home), and a reusable
   fault-injection harness (the doctrine exists, the injections are per-spec and ad-hoc). True
   pixel regression is a smaller gap than the brief assumes - geometry/computed-style fingerprints
   already gate the catalog; extend the render-smoke pixel-read pattern only where geometry is
   blind (color, theming).
10. **Concurrency is machine-bound, not ambition-bound.** The laptop holds 3-4 sessions
    (~1 GB each), one browser-driving job, one orchestrator (soft rule after the 28-stranded-commit
    collision), and merge cost is the measured bottleneck. Two to three ACTIVE programmes beside
    the owner's NOW push is the realistic ceiling; eight is not.
11. **Prerequisite housekeeping.** GOALS.md stands at 419 lines against its own ~200 budget and
    the fix is already filed (`docs/backlog/goals-over-its-own-budget.md`). Slimming it (archive
    the landed prose, restate the budget once) should land before the register adds any lines to
    the planning surface.
12. **Two live sequencing facts the brief could not know.** Yle expects to try NoaCG inside one of
    their productions roughly a month out, and the owner ruled playout-before-any-outreach - so
    OGraf activates early (its design cost is already paid), not sixth. And the class that needs
    Teams is THIS autumn, so Teams design starts immediately even while implementation waits for
    the NOW date.

Everything else in the brief survives contact: the one-year scope, the reuse-not-rebuild posture,
agent addressability as an architectural requirement, MOS/NLE as kept-possible-not-built, and
"test the claim, not the implementation" - which the repo already practices (the catalog gates
measure the rendered graphic; the external OGraf renderer round found three defects our own gates
passed).

---

## 2. North Star 2027

The GOALS.md north star ("One link, live anywhere") stays word-for-word. This extends its horizon:

> **By August 2027, NoaCG is a credible open professional graphics and playout platform** - the
> serious alternative for organisations that want open, standards-based, customizable live
> graphics: broadcasters, schools, sports organisations, NGOs, streamers.
>
> A production team can create any live graphic - from NoaCG designs, imported artwork, AI, or
> code - edit it visually, animate it, give it arbitrary behaviour without programming, receive a
> generated control surface and customize it, build a rundown carrying graphics, stills, video and
> audio, connect live data, automate through APIs, work as a team, and play out through browser
> workflows, CasparCG, OGraf infrastructure and professional SDI/NDI paths - and trust it during a
> real broadcast, including crashes, reconnects and old versions.
>
> Coding agents are first-class users of every one of those capabilities: **one capability,
> multiple interfaces** - the visual UI, the CLI/MCP door, the public API and NoaCG's own AI all
> drive the same platform functions, never parallel implementations. The `/bridge` page already
> works this way; new capabilities keep the pattern.
>
> OGraf remains the canonical interchange and playout contract exactly as ratified; NoaCG never
> differentiates on the format - the moat is authored behaviour, the generated control layer, the
> agent door, the catalog, and free-forever/self-hostable. Mature engines (CasparCG, GStreamer,
> existing OGraf implementations) are rented, not rebuilt; local software exists only where a
> concrete requirement (SDI/NDI, large media) demands it. Replay/slow-motion/EVS-class work stays
> outside the year.

---

## 3. The programme system (governance)

**A programme is a ratified long-running body of work the orchestrator may advance without asking.**
The register `docs/PROGRAMMES.md` is the single artifact - in-repo, versioned, never consumed:
the durable cross-wave state that handoffs, wave-state files and the backlog deliberately are not.
The register holds the LIVE state; when it and this document disagree, the register wins.

### States

| State | Meaning | Who moves it there |
|---|---|---|
| IDEA | Filed thought. Research allowed, implementation not. Lives in `docs/backlog/` as today; the register only lists it when promotion is plausible. | anyone |
| DESIGN | A plan doc is being written: goal, why, user journey, architectural fit, risks, test strategy, acceptance claims, stages. Research and design sessions allowed; product code not. | owner names the candidate; sessions do the design work |
| AUTHORIZED | The owner has ratified the plan doc's picture, with entry conditions if any ("after branch X lands"). **A DATE IS NEVER ONE**: it is a forecast of when the work will matter, never permission to wait (owner 2026-09-03, quoted in `docs/PROGRAMMES.md`, "A DATE IS NOT A GATE"). The register row cites the ruling: date + receipt, same convention as GOALS.md carve-outs. | **owner only** |
| ACTIVE | Entry conditions met. The orchestrator may plan waves from the programme's stage list: implement, fix, consume handoffs, verify, advance stages - no per-step permission. | owner, or automatically when an AUTHORIZED programme's entry condition becomes true (the register row says which). A date-only condition is MET the moment the row is written, so such a row waits for nothing and flips with the first work it permits |
| DELIVERED | Every acceptance claim has reached scenario-proven; owner walks may still be pending (walks never block, so they cannot gate this state either). | orchestrator, citing evidence |
| MAINTENANCE | Delivered, with reopen triggers armed: a red gate mapped to one of its claims, owner feedback naming its surface, or new evidence (a failed challenge scenario) reopens the relevant stage and the programme returns to ACTIVE. | automatic |

**Programmes never self-authorize.** Only the owner writes AUTHORIZED. A session may write a new
IDEA/DESIGN row; it may never promote one. The two harness-enforced hard edges (permission posture,
merge-safety verdicts) are untouched - "owner ratification does not reach it" stays true.

**Scope edges - what sends an ACTIVE programme back to the owner mid-flight.** Ratification covers
the plan doc's picture. Outside it, and named per-programme in the register: a new persisted format
or migration beyond the plan, a new public page/URL, real-money spend, an external account or
publication past `main`, a security-boundary change, and any change to a stated doctrine (the
no-expression-language rule, the free-core rule, client-neutrality). Everything inside the picture
- including reordering stages, adding a discovered stage of the same kind, and all defect work -
is the orchestrator's to do.

### What changes in the existing system, and what pointedly does not

- **`docs/GOALS.md` NOW/NEXT/THEN survives unchanged as the owner's push.** One sentence is added
  to its gate rule: a section governed by an ACTIVE programme in `docs/PROGRAMMES.md` is unparked
  to exactly the extent that register row states. This generalizes the carve-out mechanism the
  OGraf section already uses; the anti-raid purpose survives because only the owner activates.
- **The orchestrator fill order gains one rung**: owner feedback, then handoffs, then GOALS `## NOW`,
  **then the next stages of ACTIVE programmes**, then backlog items serving NOW. "Never invent work
  to fill a wave" survives - a register stage is not invented work. Grounding gains one cheap read
  (two greps over `docs/PROGRAMMES.md`, like the GOALS reads).
- **Untouched**: the 24-hour ceiling, "the report is the checkpoint", continuation bounds, the
  follow-on rule, queue-merge as the declaration of done, the landing queue, the walk queue as a
  record-never-a-gate, the backlog's graduate-or-die contract (with one wording amendment: an item
  may graduate into a programme stage as well as into NOW), and the ask-test.
- **Relation to `docs/ORCHESTRATION_NEXT.md`** (its status lives in that doc): fully compatible
  and mutually reinforcing - its verdict-artifact and outcome-ledger machinery supply harder
  evidence for register gates, and the register gives its "which pictures are ratified" question
  a home. Neither depends on the other landing first.

---

## 4. Evidence: how "done" works

Five maturity rungs per **claim** (not per feature). The brief's vocabulary survives review; every
rung already has machinery behind it:

| Rung | Meaning | Existing machinery |
|---|---|---|
| implemented | capability exists in code | `npm run build` gate, factory checks |
| machine-verified | deterministic automated evidence of the functional requirements | CI affected-plan + shards, nightly FULL, the five catalog gates, migration tests, conformance gates |
| scenario-proven | realistic end-to-end use succeeds, including adversarial and NOVEL cases | `e2e/configured/` against a real stack, hosted-latency, render-smoke pixel reads, external-renderer rounds, bench rounds with blind reads |
| owner-accepted | the owner has personally verified the customer-facing claim where judgment matters | `docs/acceptance/owner-queue/` + `/walk` - non-blocking by owner law |
| production-proven | survived real production use | class productions, Yle trials, `deploy-verify`, feedback digest |

Rules that make the rungs mean something:

- **The overarching rule (owner, 2026-09-01): never mark a major capability complete because its
  implementation exists.** The claim advances only when the required evidence rung is satisfied.
  Every rule below serves this one.
- **Test the claim, not the implementation.** Every programme's stages exist to advance named
  acceptance claims (§5); a stage with no claim behind it is scope creep. "A node editor exists"
  is never evidence; "a non-programmer defined behaviour on an unfamiliar graphic and operated it"
  is.
- **Challenge scenarios are mandatory for general capabilities.** The verifying scenario must not
  be the development example. The pattern exists (novel-brief agent bench cells, the foreign
  OGraf fixture corpus, the hostile vision bench) and becomes a standing requirement: Behaviour
  proven on a graphic class it was not built around, SVG import on files outside `docs/svg-samples/`,
  data integrations on feeds with faults the connector author did not pick.
- **A human-found defect class becomes a permanent oracle.** Already repo practice (mutation-tested
  guards, the e2e trap doctrine, gates born from incidents); the register makes it a checklist
  line on every reopened stage: what oracle now catches this class.
- **Owner acceptance is parallel, never serial - and held only for the major promises** (owner,
  2026-09-01): own-artwork creation/import; behaviour + generated/customizable controls; Teams;
  complete rundown/media operation; external data/automation; OGraf interoperability; agentic
  end-to-end creation; professional reliability. Subclaims advance on machine/scenario evidence
  without waiting. The walk queue receives one item per major claim when its evidence is
  complete; other programmes and later stages never wait on a pending walk. Owner feedback
  reopens - it does not pre-block.
- **New verification machinery is built inside programmes, on the existing stack** - never as a
  parallel architecture. The year's four build-outs, each owned by the programme that needs it
  first: multi-context configured e2e (Teams), the property-test harness on machine mutators and
  the event queue (Behaviour), the reusable fault-injection harness (Data), and the soak/scenario
  driver (Reliability). Hardware-loop automation (DeckLink capture cards, NDI loopback, captured
  frames) is investigated inside Reliability late in the year; until then hardware claims ride the
  existing owner-queue hardware items.

---

## 5. The programmes

Seven programmes plus one horizontal. Each entry: claim(s), what exists, first stages, owner-only
items. Proposed initial states in §7. Every programme obeys the iteration shape the brief asks
for: small slice, machine verification, realistic scenario, adversarial check, inspect failures,
improve - the wave system already works this way; the register only supplies the next slice.

### P1 Teams
**Claim:** three students with separate accounts prepare and operate the same production - same
graphics, same rundown - without sharing credentials or coordinating whose personal account holds
the show. **Non-claim (v1):** simultaneous co-editing of one graphic; LWW plus conflict copies
stays, made visible.
**Exists:** capability-URL operating (four slugs per production), per-user RLS on ~18 tables,
entitlements per uid, moderated community copies. **Absent:** any WHO concept.
**First stages:** design doc settling the model (team principal in RLS vs server-authoritative
productions - the audit leans server-authoritative for team-owned productions, since published
slugs already live server-side and LWW cannot carry shared ownership); migration + RLS rewrite
with the existing migration-test pattern; multi-context configured e2e (three authenticated
contexts, the named hole); simple-by-default UX - a solo user never sees team machinery.
**Owner-only:** ratify the design; custom SMTP + Google OAuth provisioning (already parked,
becomes urgent with real multi-account classes); the three-student walk.

### P2 Behaviour & Control
**Claims:** (a) a non-programmer takes a graphic they did not make, gives it the behaviour their
show needs - states, operator actions, timers, independent groups - receives a generated control
surface, and operates it live without code; (b) the next producer CHANGES that behaviour (remove
the lock; reveal immediately) without code; (c) the control surface is customizable without
forking the generator's parity across its five renderers.
**Exists:** everything listed in audit §1.2. **Open:** the authoring surface (both attempts
failed), behaviour customization (explicitly deferred out of the NOW push), control customization
(`docs/backlog/control-panel-road-v2-brief.md`), and the deferred machine-model extensions
(external events, interruption priorities - schema-ready, consciously unbuilt).
**First stages:** a research round that starts from why the canvas and node editors failed
(GOALS.md demands this); candidate surfaces prototyped against CHALLENGE graphics (a debate
clock, an auction board - behaviours the quiz/scoreboard work never touched); the property-test
harness on `machineEdit` mutators, the event queue and snap recovery; then the chosen surface,
then customization. The structural-guard doctrine holds per the §1.3 ruling.
**Owner amendment (2026-09-01): the search starts NOW and runs continuously** - research,
prototypes, challenge scenarios and investigations proceed beside other programmes'
implementation throughout the year; only implementation waits for evidence. This is probably the
year's hardest UX problem and serious exploration is not deferred to a quarter.
**Owner-only:** taste rulings on candidate surfaces; the claim-(a) walk on an unfamiliar graphic.

### P3 Production, Rundown & Media
**Claim (owner-amended, 2026-09-01):** an operator runs a complete ordinary show - graphics,
stills, video clips, audio beds, sequenced cues across layers - from one NoaCG production,
replacing the CasparCG-Client-style operating experience, recovers cleanly from a mid-show
renderer restart, **and reaches real SDI/NDI output through CasparCG or other proven
infrastructure - proven as the NoaCG workflow end to end, never assumed from the engine's own
capability.**
**Exists:** cue rundown, layer stack, staged-vs-take, `/output` recovery, stills, the parity-bound
dashboard. **Absent:** clips, audio, timed advance.
**First stages:** clip playout by reference (the designed `filelist` pattern - the owner's own
named blocker; media never travels through the web); audio beds the same way; rundown v2
(sequences, timed advance where the show model warrants it - never a parallel control system:
data prepares, the operator's verbs air things); the scripted-show scenario driver (a 90-minute
show as a spec). Interactive-playout phases 1-7 are Implemented-not-Verified: verification debt
is a stage here, not new build.
**Owner-only:** the show-model rulings GOALS.md already holds open (Re-take, SPACE-to-preview);
the full-show walk.

### P4 Data & Automation
**Claim:** a live external source (CSV/HTTP/feed) drives on-air graphics through the production
data API with operator override always winning, and an external system (Companion/Stream Deck
class) automates a real show through a documented, stable API.
**Exists:** the data API with per-production keys, the server data tree + bindings, datasets,
CSV/JSON import. Invariants that bind every stage: writes describe state, never graphic commands;
ordering is the conflict resolution; connectors are one more writer of the same log.
**First stages:** Phase 3 convergence (client follows the server tree; retire the second data
model - the audit found two coexisting models and forbids a third); then the Data Hub exactly as
already designed in the parking lot (a CSV sheet driving a ticker, then a real provider); the
reusable fault-injection harness (malformed feeds, stalls, floods, out-of-order writes); then
Companion-class integration. A playout-command API is a NEW consented permission and a scope edge,
not an extension of the data key. MOS/newsroom: kept possible by the log architecture, not built.
**Owner-only:** any paid data-provider account; the live-data walk.

### P5 Agent Platform
**Claim:** a coding agent builds and airs a complete production - graphics, behaviour, cues, data
bindings - through the CLI/MCP against the documented contract, without a human in the loop, and
a recurring benchmark with novel briefs proves it did not overfit to the examples.
**Exists:** the shipped door - `noacg` CLI, one MCP tool with its seven verbs, the bridge, scoped keys
(`graphics:create` only), dual SPX/OGraf packages, one measured 25-cell round.
**First stages:** `npm publish` (owner call, already on GOALS); scope widening one permission at a
time (`productions:attach`, cues, data bindings - each a security design, per `docs/AGENT_SAVE.md`);
bridge functions before CLI features (one capability, multiple interfaces - the bridge IS the
pattern); the standing benchmark made recurring with novel briefs; agent-authored machines
(GOALS.md says "the owner gate is now armed"); eventually diagnose-and-repair against `validate`
output.
**Owner-only:** the publish; each new key scope; the agentic-creation walk.

### P6 OGraf & Interoperability
**Adopted verbatim** - the ratified GOALS.md ladder IS this programme and becomes the register's
first tenant with zero redesign: CasparCG hardware acceptance; GDD alignment; the interop suite
(scripted external-renderer round + the foreign-fixture corpus already specified in
`docs/OGRAF_FIRST_REVIEW.md`); untrusted-package isolation; import v1; playout on the existing
output architecture; the Server API facade; then outreach, gated exactly as ruled. Claims are the
ladder's own: foreign packages operate in NoaCG; NoaCG packages operate in independent systems
(already proven twice against ograf-server); `/output` speaks the Server API; NoaCG is a visible
ecosystem member. Never differentiate on the format.
**Owner-only:** the GSAP written clarification; the ecosystem-listing PR and any EBU contact (both
gated); Yle's production trial.

### P7 Creation & Advanced Editor
**Claim:** a designer brings real artwork in (layered SVG, Figma/Illustrator exports), refines it
visually, animates it, and never needs code - while a professional keeps the full editor.
**Exists:** wizard, Timeline v2 complete, SVG import v1 shipped and awaiting the owner's walk, the
adapt-first AI tiers with their own binding gates (Lite §2 re-run, Pro's spend-capped rounds - the
AI gates stay exactly as GOALS.md holds them; this programme does not touch AI sequencing).
**First stages:** SVG depth (declared followers, per-layer stagger - the shipped plan's own
remainder); import-corpus challenge rounds beyond `docs/svg-samples/`; the WYSIWYG second attempt,
which by repo law starts with a written account of why the first failed, and may depend on P2's
research findings - the two share the failed-surface history. Presets cover most motion;
behaviour cannot be preset-covered, which is why P2 outranks this.
**Owner amendment (2026-09-01): design/research begins early, not in Jul-Aug.** Incremental
creation/import/preset work continues throughout; the editor attempt is scheduled so
build -> real use -> rejection/improvement -> retest completes before August 2027, leaving the
final two months for proving and hardening rather than discovering the editor for the first time.
**Owner-only:** taste walks; the import-your-own-artwork walk (already queued).

### H0 Reliability (horizontal)
**Claim:** a representative production runs 24 hours while automated operators update data,
trigger graphics, play media, reconnect clients and deliberately restart components - zero
unrecovered failures.
**Exists:** boot watchdog, per-graphic output recovery, durable-store health, versioning-with-
migration doctrine, fail-closed db-push, deploy-verify. **Absent:** soak, generalized fault
harness, any run longer than 45 minutes.
**Stages:** the soak/scenario driver (build once, parameterize per programme - P3's scripted show
is its first consumer); scheduled fault rounds from the per-spec injection doctrine; performance
budgets where they earn their keep (the repo deliberately refused a hosted-latency threshold once;
re-arguing that needs new evidence, not restating); version/rollback drills on published
productions (cloud playout stages 2-4, already designed); late-year: the hardware-loop
investigation (§4). Every other programme's recovery claims execute through this harness rather
than growing private ones. Per the §1.6 ruling, the soak runs the NoaCG workflow against REAL
professional outputs - the engine's capability is never the evidence.

---

## 6. The year

Planning order, not serialized implementation. Concurrency ceiling: the NOW push plus two to
three ACTIVE programmes (audit §1.10). **Q1 is ratified (owner, 2026-09-01); every later quarter
is an evidence-driven planning hypothesis, not a commitment** - re-cut at each quarter boundary
against what the programmes prove or invalidate.

| Window | The push | ACTIVE programmes (target) | Key exits |
|---|---|---|---|
| Sep 2026 | GOALS NOW: students' own graphics (`docs/GOALS.md`, `## NOW`) | none new - P1 and P2 in DESIGN; GOALS.md slim-down lands; register lands if ratified | the class production; Teams design ratified |
| Oct-Dec 2026 | class productions keep running | **P1 Teams**, **P6 OGraf** (rungs 1-5), P3 first slice (clips by reference) | three-student claim scenario-proven; OGraf import v1; clip playout airing; Yle trial happens on whatever is true then |
| Jan-Mar 2027 | - | **P6** (playout + Server API), **P3** (rundown v2 + scenario driver), **P4** (Phase 3 convergence, Data Hub), P2 research rounds running throughout | OGraf playout claim; outreach unlocks per the ruling; full-show scenario green |
| Apr-Jun 2027 | - | **P2** (chosen surface + customization, if the research has earned it), **P4** (connectors, Companion), **P5** (scope widening, recurring bench), **P7** editor attempt underway | behaviour claim (a) scenario-proven; automation claim; agent production claim |
| Jul-Aug 2027 | - | **H0** (24h soak, hardware loop investigation), **P7** (editor proving + hardening), P6 ecosystem presence | the 24-hour claim; the year's owner walk set; North Star review + next-year cut |

P2 runs as a continuous research thread from September (owner-amended: the search starts now and
never pauses; only implementation waits for evidence) precisely because it is the
highest-uncertainty item; committing it to a quarter would repeat the optimism the brief warns
about. P7's editor design/research likewise starts early (Q1-Q2 windows), so that Jul-Aug is
proving and hardening, never first discovery. H0 stages attach to whichever programme needs them
first rather than waiting for Q4 - the table shows where its own claim lands.

---

## 7. Initial register states - RATIFIED

Confirmed by the owner 2026-09-01, with the two timing amendments (P2 research continuous from
now; P7 design early). **The live source is `docs/PROGRAMMES.md`** - this table is the
ratification record, not the state:

| Programme | Ratified state | Entry condition |
|---|---|---|
| P6 OGraf | AUTHORIZED (ratified 2026-08-29) | none - may start now; the NOW date (`docs/GOALS.md`, `## NOW`) is a forecast, not a wait (owner, 2026-09-03) |
| P1 Teams | DESIGN now, moving to implementation quickly | ACTIVE on plan ratification |
| P3 Production/Rundown/Media | DESIGN; clip slice AUTHORIZED | none - the slice may start now, same ruling |
| P2 Behaviour & Control | DESIGN - standing continuous research | implementation on evidence + ruling |
| P4 Data & Automation | IDEA -> DESIGN in Q1 windows | Phase 3 design first |
| P5 Agent Platform | AUTHORIZED per item | scope items individually, per key-scope edge |
| P7 Creation & Advanced Editor | DESIGN, research starting early | editor attempt gated on P2 findings |
| H0 Reliability | AUTHORIZED with the register | stages attach on demand |

---

## 8. Integration plan - executed 2026-09-01 on ratification

1. **`docs/PROGRAMMES.md`** - the register: DONE. One table plus one short section per programme;
   the argument and the claims stay HERE so the register stays cheap to grep at wave grounding.
2. **`docs/GOALS.md`**: DONE - the carve-out sentence added to the gate rule (§3), and
   `docs/backlog/goals-over-its-own-budget.md` steps 1-2 executed (landed/duplicated prose moved
   to the archive and the docs that already carry it; the ~200 budget confirmed by the owner).
   Step 3 (the build-gate check on the line count) remains open in that backlog file. The
   NEXT-OGraf ladder body moved nowhere - the P6 register row points at it.
3. **`docs/README.md`**: DONE - rows for this doc and the register.
4. **Issue #48**: DONE - body replaced with a pointer at this document and the register; kept
   open as the single external North Star reference; state is never tracked there (the tracker is
   bot-alert territory; docs are the system of record).
5. **`.agent-workflows/orchestrator.md`**: DONE - the deferral resolved itself: the
   orchestration-architecture branch and the stranded branches landed first, so the fill-order
   rung, the grounding read and the "Big projects are phased" pointer went in with this change.
6. **`docs/backlog/README.md`**: DONE - graduate into GOALS "NOW" or a programme stage.
7. **Memory**: nothing - the repo carries all of this.

---

## 9. The rulings (owner, 2026-09-01)

1. **North Star (§2): RATIFIED.**
2. **Programme governance (§3): RATIFIED** - register, owner-only authorization, automatic
   advancement into/within ACTIVE on declared entry conditions, automatic reopening, the
   fill-order rung. NOW/NEXT/THEN, the 24-hour ceiling, walk-as-record-not-gate, the landing
   queue and the handoff architecture preserved.
3. **Programme direction: RATIFIED with two timing amendments** - P2's research runs
   continuously from now (implementation waits for evidence, the search does not), and P7's
   editor design/research begins early so Jul-Aug 2027 is proving/hardening. Teams DESIGN now
   moving quickly; OGraf the register's first tenant on its ratified ladder; clip playout the
   first P3 slice.
4. **Conditions doctrine: preserved** - structural states/transitions/events/guards; reopen only
   on proof of impossibility or material worseness (§1.3).
5. **Playout: the professional customer-facing requirement stays** - P3/H0 prove the NoaCG
   workflow reaches real SDI/NDI through proven engines (§1.6); the native-renderer programme
   stays dissolved.
6. **Owner-held claims limited to the eight major promises** (§4); subclaims advance on
   machine/scenario evidence.
7. **GOALS.md stays ~200 lines** as a readability discipline - concise immediate steering;
   PROGRAMMES.md and programme docs carry the durable long-range detail.
8. **Year table: Q1 ratified; later quarters are evidence-driven hypotheses**, re-cut as
   programmes prove or invalidate assumptions.

Standing over all of it: **never mark a major capability complete because its implementation
exists - advance the customer-facing claim only when the required evidence rung is satisfied.**

Next checkpoint set by the owner: review the resulting canonical North Star / programme system
before activating additional major programmes beyond the states in §7.
