# Roadmap wording

The public roadmap page (`/roadmap`) is built from this file and `docs/GOALS.md` together.
GOALS decides WHERE each item stands: an outcome marked (now) shows under Now, (next) under Next,
(later) under Later, so changing a priority in GOALS moves the item on the next build and nobody
copies anything. This file only says it in plain words for a visitor.

`node scripts/roadmap.mjs --check` (part of `npm run build`) fails when the two disagree:

- every outcome in GOALS has a `## <number>. <title>` entry here, with the title exactly as GOALS
  writes it, and no entry names an outcome GOALS does not have. When an outcome is renamed,
  re-read its wording below before you copy the new title;
- an item may name its column (`### next: ...`) only when its outcome's heading in GOALS names
  that priority too, as outcome 6's "next milestone" does;
- every bullet passes the same plain-words check as the What's new notes (`docs/whats-new/README.md`).

The landing page shows each Now item with its first bullet only, so make the first bullet the one
line that says the item best.

Write features we will add or improve, as a visitor would understand them. No competitors, no
partners, customers or shows, no people, no dates, and nothing that claims more than the
current state in GOALS: what is already built belongs in What's new, not here.

## 1. Create: own designs, templates and brands

### Your own designs, templates and brands

- Import a layered SVG from any design tool and keep its look, with fields you can edit.
- A brand creator, and one brand applied across a whole production.
- Text that fits its box for short and long values.
- More catalog designs with their own layouts, type and motion, not colour swaps of one design.

## 2. Agentic creation: the agent door

### Graphics from your AI agent

- Ask Claude Code, Codex or another agent for graphics and get them straight into a production,
  its rundown ready, or into your library.
- Graphics from a brief nobody has tried before that play first time on CasparCG and in a
  browser source.

## 3. Editor

### The editor

- Select, move, restyle and animate the parts of an imported design without rebuilding it.
- A timeline for In, steps, Out and loops, with keys and easing you can see.
- Text, shapes, images and a simple pen, and a saved graphic that reopens exactly as it was.

## 4. Behaviour and control

### Controls for any graphic

- Quiz, score and clock controls that work on graphics someone else drew.
- Controls that come from the graphic's own states, so a new kind of graphic needs no new code.
- The operator never sees code.

## 5. Production, rundown and playout

### Productions and playout

- Clips and audio that play reliably from the rundown on CasparCG, with volume and loop.
- Productions a team shares: members add graphics, and the show runs when its creator is away.
- vMix and SPX walked through a real show, and CasparCG and OBS kept working.

## 6. Standards and interoperability: OGraf and EBU

### OGraf, the open standard

- Every exported graphic passes the official OGraf checker and plays in other OGraf renderers.
- Field definitions that follow the standard.

### next: OGraf packages from other tools

- Compliant OGraf packages made elsewhere play through NoaCG Playout, kept safely apart from the
  rest of the show.
- Then the OGraf Server API on NoaCG's output.

## 7. Data and automation

### Live data

- Graphics that take their values from data, APIs and feeds, not only typed fields.
- Data changes values and never runs the show: taking to air stays the operator's press.

## 8. Later and parked

### Rendered video

- Video projects are paused, not dropped. The live tools come first.
