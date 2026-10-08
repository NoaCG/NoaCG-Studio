# Goals

The North Star and the outcome specs NoaCG works toward, and the one direction document: agents
read it to decide what matters, the orchestrator to find the most important unsatisfied outcome
and the next safe step. Plans linked from each outcome say how; this file says what and why.
**Keep it under 200 lines**; a roadmap nobody can read in one sitting steers nothing. Private
context (dates, partners, demos) lives outside public git in `docs/private/` in the main checkout.

## North Star

NoaCG is a professional broadcast graphics creation and cloud playout platform.

**From a graphics need to a professional live graphic, with as little friction as possible, played
out wherever the production runs.**

The user is anyone in a live production who needs a professional graphic on air quickly and
reliably without a graphics developer: small production teams, broadcasters, streamers, events,
churches, schools and student productions. Student productions are the main proving ground today;
they do not define the product.

There are two ways in, and both end in the same production and playout workflow:

- **Visual:** design elsewhere and import SVG, start from a template or brand, adjust and animate
  in the NoaCG editor.
- **Agentic:** describe what is needed, and an agent creates or adapts the graphics and puts them
  into the production.

**The two end-to-end scenarios every outcome serves:**

1. Need -> import, template or editor -> production -> on air.
2. Need -> agent -> graphics package in a production, rundown ready -> on air.

**Where NoaCG is different.** Adopting a standard is not the differentiator; compatibility is
expected. What NoaCG adds is what standards leave open: graphics that expose the states and
controls a production needs, one consistent control model, the agent door, a catalog that looks
paid-for, and free self-hosting.

**Posture.** NoaCG is free and open source. Everything is free: creating, editing, exporting,
controlling, self-hosting, and the built-in AI. There is no paid surface and none is planned; product architecture is not built
around monetization. The goal is to be useful, excellent and widely used.

**Standing non-goals.**

- Native SDI/NDI playout, until it can come through an OGraf-compatible runtime or server.
- Recreating After Effects. The editor is a focused broadcast tool.
- A code editor as a product goal.
- A second cue or control system beside the production workflow.

## How done works

Implementation never means done, and "unproven" means not yet verified, not expected to be
broken. Each claim in an outcome climbs five rungs:

| Rung | Meaning |
|---|---|
| implemented | the capability exists in code |
| machine-verified | automated checks prove the functional requirements |
| scenario-proven | a realistic end-to-end run succeeds, including cases the work was not built around |
| owner-accepted | the owner has judged it, only where human judgment adds value |
| production-proven | it survived real production use |

- Test the claim, not the implementation. The verifying scenario is never the development example:
  a real production case is evidence for a general capability, never its design target.
- A reproducible defect becomes an automated regression check when practical. Not every taste or
  UI observation needs a permanent test.
- **Reliability is a quality bar on every outcome, not an outcome of its own.** Production use is
  the final proof.

**Autonomous work** keeps going on good engineering judgment; routine releases, ordinary security
decisions and trivial costs need no owner. Owner-level choices are surfaced before a wave starts;
unattended work records for the owner, and defers, only what changes direction, costs significantly
or unusually, moves an important external, security or privacy boundary, or is hard to reverse.

## Outcomes
Each outcome carries its priority (now, next, later) and rank (owner, 2026-10-02; work top down):
1 production, rundown and playout (5); 2 agent door (2); 3 editor (3); 4 create (1); 5 behaviour and
control (4); 6 OGraf and EBU (6). List order is not rank.

### 1. Create: own designs, templates and brands (now; rank 4)

- **Why:** most productions start from their own design or a template, and that look must survive.
- **Desired state:** a design made elsewhere (SVG) or a NoaCG template or brand becomes a premium,
  playable graphic with editable fields, without code. The catalog never looks like one house
  style: distinct compositions, type, shapes and motion across news, sport, late-night, events and
  streaming, never palette swaps of one layout.
- **Current state:** SVG import v1 and text-to-box binding are built and machine-verified. Brands
  have a model, a wizard chooser and a creator on Home; applying one across a production is still
  to build. The catalog has visual quality gates. The Community packs shelf installs finished
  packages; NoaCG admins submit and review there, and every maker waits on the design lock.
- **Done for this phase:** someone unfamiliar imports a layered SVG that is not one of our samples,
  binds its fields, applies a brand and plays it through the standard workflow; text fits its box
  for short and long values; catalog templates pass the visual quality gates.
- **Evidence:** import sweeps over files outside the sample set; owner check on taste only.
- **Plans:** `SVG_IMPORT_PLAN.md`, `TEXT_BOX_BINDING.md`, `BRAND_PLAN.md`, `DESIGN_LANGUAGE.md`.

### 2. Agentic creation: the agent door (now; rank 2)

- **Why:** describing the need is the lowest-friction path, and it is where NoaCG can lead.
  External frontier agents (Claude Code, Codex and others) are the strongest route today.
- **Desired state:** graphics request -> an agent understands it -> the package appears in NoaCG
  by the shortest path the user wants, straight into a production with its rundown ready or into
  the library -> on air. Through the CLI, the plugin and MCP. Built-in creation (simple template
  and brand automation, and a more capable generator) is a separate, later track, and free.
- **Current state:** CLI 0.7.1 is on npm and the MCP Registry. Agents make graphics, render each
  state and save to the library; `noacg pack --save` sends a package and rundown to Home, where one
  Install press opens the production. The agent designs the look and NoaCG owns everything around
  it; critique and design guide are opt-in (owner, 2026-10-02). Listings need the owner's accounts.
- **Done for this phase:** on a fresh machine, a user installs the published CLI or plugin, asks an
  agent for a package from a brief nobody has seen before, and receives it where they asked,
  including straight into a production, with valid fields and behaviour; it plays on CasparCG and
  in a browser source; the recurring novel-brief benchmark passes.
- **Plans:** `AGENT_CLI.md`, `AGENT_SAVE.md`, [issue #772](https://github.com/NoaCG/NoaCG-Studio/issues/772).

### 3. Editor (now; rank 3)

- **Why:** productions often start from an existing package and need quick changes to colour,
  logo, text or motion; new graphics need precise construction and animation.
- **Desired state, done criteria and order:** `EDITOR_PLAN.md` is the source of truth.
- **Current state:** release 1 is the studio's one editor, marked Alpha. Keys, Out and the 1.2a
  animation slices have landed, 1.2b (transforms, anchor, type) is under way; acceptance is open.
- **Principle:** a saved graphic reopens exactly as it was and can reach every supported target
  from one saved graphic. The internal format is an engineering decision, not a product principle.

### 4. Behaviour and control (now; rank 5)

- **Why:** a live graphic is only useful if the operator can drive what the show needs.
- **Desired state:** any graphic exposes the states, editable data and controls its production
  needs (quiz lock, reveal and correct, scores, clocks, steps, fields, data bindings) through one
  consistent control model that also stretches to graphic types nobody has imagined yet. Controls
  come from a few composable primitives, never a general automation or programming system. A
  downloaded graphic works on its own in a generic OGraf host; behaviour across graphics (shared
  data, sequencing, a folder's All together) lives in NoaCG's playout and control layer.
- **Principle:** the control model stays structural. Visible states, transitions and events decide
  which controls are available, so NoaCG can generate correct, predictable controls for any
  graphic without hiding operator logic in formulas. Graphic-specific logic can live in the
  graphic's own code. Revisit only if a real use case proves the model too limiting.
- **Current state:** quiz and score behaviours exist and attach to imported graphics; control
  panels for any graphic have landed; the authoring research is at round 2. A Companion module
  drove hosted control on a preview backend; the production page and noacg.studio come next.
- **Done for this phase:** quiz and score controls work on graphics someone else drew; a graphic
  type outside the development set gets its controls with no new code path; the operator never
  sees code.
- **Plans:** `STATE_MACHINE_SCHEMA.md`, `CONTROL_LAYER.md`, `CONTROL_PANEL_ANY_GRAPHIC.md`,
  `SVG_BEHAVIOUR_PLAN.md`, `BEHAVIOUR_AUTHORING_RESEARCH.md`.

### 5. Production, rundown and playout (now; rank 1)

- **Why:** a graphic is worth something only on air, wherever the production runs, and a group
  must be able to prepare and run one production without one person being a single point of
  failure.
- **Desired state:** one reliable production workflow (rundown, cues, control panel, basic media)
  that plays out to every environment the production uses. No player is preferred forever. A
  production and its rundown belong to the team, not to one account.
- **Current state:** CasparCG with NoaCG Bridge is production-proven and the main production path;
  Bridge cues the server's clips from the rundown, with the owner's real-production check open. OBS
  and browser sources are proven; a NoaCG output in a real vMix 29 browser input has taken and
  cleared a graphic. Real SPX 1.2.1 and 1.4.1 play the SPX exports with fields, Continue and Stop,
  and open a production export's rundown copied in by hand; 1.4.1 also plays the OGraf package.
  Values with ' & < > or a line break show as HTML entities, Update on the OGraf package is an SPX
  defect, and cueing through the output embed is unproven (`SPX_ON_A_REAL_SERVER.md`). A
  three-member walk on a local backend proves a team's production playing with its creator signed
  out; saved entries and later library edits still resolve through whoever publishes.
- **Done for this phase:**
  - **Basic media:** clips and audio play reliably from the rundown through CasparCG, with volume,
    loop and the other attributes a production genuinely needs; more than that is optional.
  - **Shared productions,** proved by verification before anything is rebuilt: members join the
    same team; several members add graphics to the same production; they open and use it later;
    it stays accessible when its creator is absent; its graphics and data are available to the
    team rather than trapped in one account; normal playout from it works.
  - **Targets:** vMix runs a production-realistic walk (browser input, take, update, out, several
    layers); SPX installs and operates a graphic on a real SPX server (done, `SPX_ON_A_REAL_SERVER.md`); CasparCG and OBS stay green.
- **Needs the owner's accounts:** custom email (SMTP), the Google sign-in client, the status page.
- **Plans:** `BRIDGE.md`, `CLOUD_PLAYOUT.md`, `CONTROL_PANEL_ROAD.md`, `TEAMS_PLAN.md`, `STATUS_PAGE.md`.

### 6. Standards and interoperability: OGraf and EBU (now, with a high-priority next milestone; rank 6)

- **Why:** interoperability through a standard beats building around one vendor's assumptions.
- **Desired state:** NoaCG stays compatible with OGraf as the EBU standard evolves. Where the
  standard and a proprietary platform disagree on interoperability, NoaCG follows the standard.
  OGraf is the long-term interoperability direction, not a declared internal format.
- **Current state:** OGraf exports play on SPX 1.4.1; a foreign package plays isolated on the
  output stage, not yet from the library or rundown. Standard fields and the interop suite are open.
- **Done for this phase:** every exported graphic passes the official checker and an
  external-renderer round; field definitions follow the standard; the interop suite runs.
- **Next milestone (important):** compliant foreign OGraf packages play reliably through NoaCG
  playout, safely isolated. Then the OGraf Server API on the output.
- **Plans:** `OGRAF.md`, `OGRAF_FULL_STACK_PLAN.md`, `OGRAF_ECOSYSTEM.md`.

### 7. Data and automation (later)

- **Why:** many graphics are only as good as their live data.
- **Desired state:** graphics bind to external data, APIs, feeds and automation, not only typed
  fields. Data changes values and never operates the show: taking to air and advancing stay
  operator presses, and the operator wins over a feed.
- **Done for this phase:** one data model instead of the two that coexist today; a connector design.

### 8. Later

- Video projects (Remotion, HyperFrames): not abandoned, not active; the wizard shows the Video
  door greyed, not hidden (owner, 2026-09-27).
