# Goals

The North Star and the outcome specs NoaCG works toward. This is the one direction document:
agents read it to decide what matters, and the orchestrator reads it to find the most important
unsatisfied outcome and the next safe step toward it. Supporting plans are linked from each
outcome; they describe how, this file says what and why. **Keep it under 200 lines**; a roadmap
nobody can read in one sitting steers nothing. Private context (dates, partners, demos) never
goes here; it lives outside public git in `docs/private/` in the main checkout.

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

Implementation never means done. Each claim in an outcome climbs five rungs:

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
- Agents verify everything they reasonably can. The owner is asked only for a decision, a quick
  phone check, or a desktop or production check where product judgment matters.
- "Unproven" means not yet verified, not expected to be broken.
- **Reliability is a quality bar on every outcome, not an outcome of its own.** Production use is
  the final proof.

**Autonomous work** preserves the intended outcome, uses good engineering judgment and keeps going.
Routine releases, ordinary security decisions and trivial expected costs need no owner. Meaningful
owner-level choices are surfaced before a wave starts, when there is time. During unattended work,
defer only a decision that materially changes product direction, costs significantly or unusually,
changes an important external, security or privacy boundary, or is genuinely hard to reverse:
record the decision needed and continue with other useful work.

## Outcomes

Each outcome carries its priority (now, next, later). List order is not priority.

### 1. Create: own designs, templates and brands (now)

- **Why:** most productions start from their own design or a template, and that look must survive.
- **Desired state:** a design made elsewhere (SVG) or a NoaCG template or brand becomes a premium,
  playable graphic with editable fields, without code. The catalog never looks like one house
  style: distinct compositions, type, shapes and motion across news, sport, late-night, events and
  streaming, never palette swaps of one layout.
- **Current state:** SVG import v1 and text-to-box binding are built and machine-verified. Brands
  have a model and a wizard chooser; the brand creator and applying a brand across a production are
  still to build. The catalog has visual quality gates.
- **Done for this phase:** someone unfamiliar imports a layered SVG that is not one of our samples,
  binds its fields, applies a brand and plays it through the standard workflow; text fits its box
  for short and long values; catalog templates pass the visual quality gates.
- **Evidence:** import sweeps over files outside the sample set; owner check on taste only.
- **Plans:** `SVG_IMPORT_PLAN.md`, `TEXT_BOX_BINDING.md`, `BRAND_PLAN.md`, `DESIGN_LANGUAGE.md`.

### 2. Agentic creation: the agent door (now)

- **Why:** describing the need is the lowest-friction path, and it is where NoaCG can lead.
  External frontier agents (Claude Code, Codex and others) are the strongest route today.
- **Desired state:** graphics request -> an agent understands it -> the package appears in NoaCG
  by the shortest path the user wants, straight into a production with its rundown ready or into
  the library -> on air. Through the CLI, the plugin and MCP. Built-in creation (simple template
  and brand automation, and a more capable generator) is a separate, later track, and free.
- **Current state:** the published CLI and the Claude Code plugin create graphics and save them to
  the library; installing into a production is not yet available to agents.
- **Done for this phase:** on a fresh machine, a user installs the published CLI or plugin, asks an
  agent for a package from a brief nobody has seen before, and receives it where they asked,
  including straight into a production, with valid fields and behaviour; it plays on CasparCG and
  in a browser source; the recurring novel-brief benchmark passes.
- **Plans:** `AGENT_CLI.md`, `AGENT_SAVE.md`, `backlog/cli-roadmap.md`.

### 3. Editor (now)

- **Why:** productions often start from an existing package and need quick changes to colour,
  logo, text or motion; new graphics need precise construction and animation.
- **Desired state, done criteria and order:** `EDITOR_PLAN.md` is the source of truth.
- **Principle:** a saved graphic reopens exactly as it was and can reach every supported target
  from one saved graphic. The internal format is an engineering decision, not a product principle.

### 4. Behaviour and control (now)

- **Why:** a live graphic is only useful if the operator can drive what the show needs.
- **Desired state:** any graphic exposes the states, editable data and controls its production
  needs (quiz lock, reveal and correct, scores, clocks, steps, fields, data bindings) through one
  consistent control model that also stretches to graphic types nobody has imagined yet. Controls
  come from a few composable primitives, never a general automation or programming system. A
  downloaded graphic works on its own in a generic OGraf host; behaviour across graphics (shared
  data, combined presses, sequencing) lives in NoaCG's playout and control layer.
- **Principle:** the control model stays structural. Visible states, transitions and events decide
  which controls are available, so NoaCG can generate correct, predictable controls for any
  graphic without hiding operator logic in formulas. Graphic-specific logic can live in the
  graphic's own code. Revisit only if a real use case proves the model too limiting.
- **Current state:** quiz and score behaviours exist and attach to imported graphics; control
  panels for any graphic have landed; the authoring research is at round 2.
- **Done for this phase:** quiz and score controls work on graphics someone else drew; a graphic
  type outside the development set gets its controls with no new code path; the operator never
  sees code.
- **Plans:** `STATE_MACHINE_SCHEMA.md`, `CONTROL_LAYER.md`, `CONTROL_PANEL_ANY_GRAPHIC.md`,
  `SVG_BEHAVIOUR_PLAN.md`, `BEHAVIOUR_AUTHORING_RESEARCH.md`.

### 5. Production, rundown and playout (now)

- **Why:** a graphic is worth something only on air, wherever the production runs, and a group
  must be able to prepare and run one production without one person being a single point of
  failure.
- **Desired state:** one reliable production workflow (rundown, cues, control panel, basic media)
  that plays out to every environment the production uses. No player is preferred forever. A
  production and its rundown belong to the team, not to one account.
- **Current state:** CasparCG with NoaCG Bridge is production-proven and the main production path;
  OBS and browser sources are proven; vMix exports exist but are unproven in vMix; SPX is unproven
  on a real SPX server. Bridge lists the server's clips and cues them from the rundown, with loop;
  volume is not built. Teams, join codes, team productions on Home and moving a production into a
  team exist.
- **Done for this phase:**
  - **Basic media:** clips and audio play reliably from the rundown through CasparCG, with volume,
    loop and the other attributes a production genuinely needs. Anything beyond reliable basic
    playback is optional.
  - **Shared productions,** proved by verification before anything is rebuilt: members join the
    same team; several members add graphics to the same production; they open and use it later;
    it stays accessible when its creator is absent; its graphics and data are available to the
    team rather than trapped in one account; normal playout from it works.
  - **Targets:** vMix runs a production-realistic walk (browser input, take, update, out, several
    layers); SPX installs and operates a graphic on a real SPX server; CasparCG and OBS stay green.
    Agents verify all they can first; a real-environment test is asked for only where it adds
    evidence.
- **Needs the owner's accounts:** custom email (SMTP) and the Google sign-in client.
- **Plans:** `BRIDGE.md`, `CLOUD_PLAYOUT.md`, `CONTROL_PANEL_ROAD.md`, `TEAMS_PLAN.md`.

### 6. Standards and interoperability: OGraf and EBU (now, with a high-priority next milestone)

- **Why:** interoperability through a standard beats building around one vendor's assumptions.
- **Desired state:** NoaCG stays compatible with OGraf as the EBU standard evolves. Where the
  standard and a proprietary platform disagree on interoperability, NoaCG follows the standard.
  OGraf is the long-term interoperability direction, not a declared internal format.
- **Current state:** NoaCG exports OGraf packages; standard field definitions and the interop suite
  are open.
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
- **Done for this phase:** one data model instead of the two that coexist today, and a connector
  design.

### 8. Later and parked

- Video projects (Remotion, HyperFrames): not abandoned, not active; the video surface may be hidden.
- Native SDI/NDI playout: see the standing non-goals.
