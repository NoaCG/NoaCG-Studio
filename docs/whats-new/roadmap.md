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
- an item holds one or two bullets, and every bullet passes the same plain-words check as the
  What's new notes (`docs/whats-new/README.md`).

The page reads as a progression, Now to Next to Later, so each item is one big capability a
visitor would recognise, never a small fix. Say what it will let them do, in a single short line.
The landing page shows each Now item with its first bullet only, so make the first bullet the one
line that says the item best.

No competitors, partners, customers or shows, no people, no dates or promises, and nothing that
claims more than the current state in GOALS: what is already built belongs in What's new.

## 1. Create: own designs, templates and brands

### Your own designs and brands

- Import a layered SVG from any design tool and keep its look, with text you can edit.
- Make a brand once and apply it across a whole production.

## 2. Agentic creation: the agent door

### Graphics from your AI agent

- Ask Claude Code, Codex or another agent for graphics and get a production with its rundown
  ready.

## 3. Editor

### The editor

- Restyle and animate the parts of an imported design without rebuilding it.
- A timeline for In, steps, Out and loops, with keys and easing you can see.

## 4. Behaviour and control

### Controls for any graphic

- Quiz, score and clock controls that work on any graphic, even one you drew yourself.

## 5. Production, rundown and playout

### Productions and playout

- Clips and audio that play reliably from the rundown on CasparCG.
- vMix tested through a real show, next to CasparCG and OBS.

## 6. Standards and interoperability: OGraf and EBU

### OGraf, the open standard

- Every exported graphic passes the official OGraf checker and plays in other OGraf players.

### next: OGraf packages from other tools

- Play OGraf graphics made in other tools from NoaCG Playout.
- Then let other systems control NoaCG's output through the OGraf Server API.

## 7. Data and automation

### Live data

- Graphics that take their values from data, APIs and feeds.

## 8. Later

### Rendered video

- Video projects, after the live tools.
