# templates/generate-playout-behaviour-controls-template-machine

Rule: `templates/generate-playout-behaviour-controls-template-machine`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 203-210. - The categories themselves grew to 27 and stayed the machine vocabulary (search aliases, meta,   AI retrieval, the factory). A group NEVER selects behaviour - playout controls generate from   the machine + fields inside the template (docs/CONTROL_LAYER.md), and nothing at playout reads   a category or group. - The id registries (families/formats with verbatim sheet names, the 27 graphic categories   and their ten groups, structures, semantics, capabilities, placements, motion   intensity/styles, style aliases) live in **src/model/taxonomy.ts**; display labels there,   never in stored ids.
