# Pasteable second-opinion request

Please review the attached NoaCG custom-graphics mockups and the plan below. This is research/design only. Do not implement product changes, start `/plan-run production-page`, or change agreed authorities.

Goal: someone should create/import a graphic for an unfamiliar sport or broadcast, expose editable fields and controls, prepare cues, connect Google Sheets or API data without a catalogue template, preview it, operate it live, recover from failures and reuse it.

Baseline: current-main snapshot `63b3e00b9ff27db221c3f71ead5abb2c2a599336`. PR #1390 is merged and records agreed planning decisions. Preserve its field-led Fill/Connect workflow, graphic-wide bindings, destination hygiene, Sheet reader ownership, manual override rules and C0–C7 sequencing. The run remains unstarted.

The 23 mockups show:
- An Illustrator SVG imported without a template, including text/image selection, numeric controls, a Sheet cell, a scrolling column, mapping verification and live operation.
- A Top 16 bracket with explicit match IDs and relationships, proposed keyed row mapping, and deliberate winner progression.
- A commercial roll from a compatible provider package, contrasted with externally hosted content that may expose no editable contract.
- A player-video overlay combining text, images, scores, status, a scrolling list, API values, selected-row snapshots and manual actions.
- Failure recovery, Pause/manual override/Resume, a valid empty list, disconnect and reuse.

Important distinctions:
- Existing code supports arbitrary ordinary field bindings and scalar/text-list values; it does not directly bind object collections.
- Fill copies once into a cue. Connect follows live data for every cue of the graphic.
- The SVG importer already exposes text/images and numeric fields; the proposed layout makes this more explicit.
- Structured bracket mapping, provider inspection, hosted controls and cross-production remapping are proposals needing evidence.
- Sheet manual values hold until that cell changes; pushed API data may overwrite on the next write. Do not assume a persistent operator lock.
- A source may update content but never Take, advance, reset or operate the show.
- The API mockup uses pushed `/patch` values. It does not imply arbitrary JSON URL fetching.

Proposed next research:
1. Build a capability/evidence matrix from AGENTS.md, current-main code, synthesis-2026-10-17.md, data-sources/sheet-data-flow specs, production-page/audience/refactor plans and work.json, PRODUCTION_DATA_PLAN.md and DATA_API.md.
2. Verify the minimum common authoring contract for text, numbers, images, lists, grouped structures and separate actions. Compare Codex generation with visual SVG configuration.
3. Test whether finite cell/column/keyed-row mappings plus existing bindings meet the scenarios. Avoid a formula language or new binding engine without evidence.
4. Compare a few relevant primary sources, including SPX, CasparCG, vMix and OGraf, for contract and operator-design lessons.
5. Run realistic creator/operator tasks against the mockups; revise confusing scope, value ownership and recovery interactions.
6. Draft custom-graphic acceptance criteria and a precise amendment matrix for C1/C2/C5/C6/C7 and authoring work. Keep bracket/provider expansions separate until their contracts are justified.

Please answer:
1. Which mockup flows are intuitive, and where would an unfamiliar operator make a consequential mistake?
2. Which screens imply capabilities unsupported by the inspected engine or agreed plan?
3. Is there a smaller coherent approach that still handles all four scenarios?
4. Are graphic-wide scope, source sharing, Fill snapshots and manual overrides understandable?
5. What additional evidence and visual states are necessary before implementation approval?

Return concrete changes by screen number, their rationale, and whether each is a correction to agreed behavior or a new proposal. Static previews and simulated status do not count as implementation/provider verification.
