# Publish setup and rundown clarity

Approved owner specification, 4 October 2026. Baseline: ec70567a7 after sound attachments PR #702 landed with merge-queue CI green. Overnight merge is authorized using automated and browser evidence; physical studio rehearsal remains a morning check.

## Goal and safety

Prevent uploaded images being mistaken for CasparCG files, remove irrelevant Bridge errors, and make cue types and routes easy to scan. Choose output at first Publish, retaining simple home preparation. Prefer additive UI and metadata. Preserve legacy URLs, cues, routes, command protocol, playback and sound. No playback cleanup, architectural consolidation, SQL migration, new Bridge operation, per-cue routing migration or home-to-server transfer. Combined picture/video transfer remains backlog work.

## Decisions

- New production: account default or first-Publish choice. Duplicate: inherit setup including legacy absence. Import: reset setup for the current environment, retaining content/routes.
- OBS, vMix, SPX and Browser/HTML reuse browser output; managed CasparCG uses the existing Bridge. Support one browser destination plus optional CasparCG; store a versioned destination list.
- Remember my choice starts unchecked and saves account metadata after successful publication. Settings/Workflow includes Ask every time; production override is in Playout/Setup, with no playback side effects.
- Bridge relevance follows selected managed CasparCG or native server cues. Legacy relevance uses native cues/recorded managed activity, never global config or renderer names alone.
- Footer and plus share actions. Upload image means NoaCG PNG/JPG, never server transfer. CasparCG files means existing server files.
- New server stills/videos use configured media channel (2 here) and layer 10. Preserve channel overrides/audio layers/folder semantics. Shared file route: N cues confirms changes with Cancel/Change all.
- Icon/text shows cue type; badge shows effective route; default accent follows output/channel. Per-cue custom accent/reset never recolors route badges. Tally, preview, warnings and selection dominate.

## Observable acceptance

1. First Publish cancellation changes nothing; remembered defaults skip the chooser. Publication failures retry; default-saving failure never undoes publication.
2. Defaults are account-bound across devices/sign-in changes. Duplicates inherit, imports reset, and legacy open/save/republish preserves URLs/routes/cues without forced setup.
3. Named profiles reuse output paths; SPX exposes its transparent wrapper download. Setup changes issue zero playback commands.
4. Browser/SPX avoids irrelevant Bridge alerts; native cues/managed CasparCG retain real errors. Combined readiness requires both destinations; untagged outputs remain compatible.
5. Footer and plus actions have equivalent terminology/availability/behavior. Transparent PNG batch/replacement works without implied server copy.
6. Server still/video defaults remain configured media channel/layer 10 with Channel 1 available. Shared-route confirmation changes all references only after confirmation, explaining folder overrides.
7. Type text/route badges scan clearly in both themes/narrow layouts. Palette/custom resets work and accents survive copy/duplicate/reorder without route/status changes.
8. Sound attachment gain, loops, silent previews, cleanup and recovery remain intact. Build, focused tests, affected browser checks and final /check pass before /queue-merge.

## Studio check still required

Rehearse a duplicate of the upcoming production on actual receiving hosts: Channel 1 graphics, Channel 2 stills/videos, alpha video on Channel 1, audio routing/levels, folders, clear and reconnect. Never claim this physical rehearsal happened without evidence.
