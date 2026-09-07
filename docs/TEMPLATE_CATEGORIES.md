# The template catalog: what the categories are

An index of what lives under `src/templates/`, and nothing more. It is a doc rather than part of
`src/templates/AGENTS.md` because knowing which categories exist is orientation a reader looks up
once, not a rule that binds every edit - and the contract is read in full by every session
touching any template, where 1.5 KB of index costs twenty-four instruction chains.

**A category's rules live in its own contract**, beside its code, loaded only when you work in
that directory. A new design writes its lesson there. A new category mints its contract on its
first commit rather than starting as a paragraph here or in the parent.

## The registries

- **`types/`** - the GRAPHIC TYPE registry (`docs/GRAPHIC_TYPES.md`). A **type** declares what a
  graphic IS - structure contract, fields, state groups and default path, control events -
  independent of what it looks like; a **design** is one look. Contract:
  `src/templates/types/AGENTS.md`.
- **`pack4/`** - the TITLE / TOPIC / INFORMATION pack. 36 designs over nine graphic types, and
  nothing in it is a new mechanism: the word-shaped ones build on the info-card assembler, the two
  LIST boards on the infographic one. The design files live in `infoCards/pack4/` and
  `infographics/pack4/`. Contract: `src/templates/pack4/AGENTS.md`.

## The categories


- **lowerThirds/** - lt01…lt67 (six ids retired 2026-08-28, never re-minted) plus the
  ls01…ls41 SPECIALIST pack -> `lowerThirds/AGENTS.md`
- **infoCards/** - card01…card71, the standard contract's other line-based family ->
  `infoCards/AGENTS.md`
- **endCredits/** - cr01…cr13 (cr10 retired 2026-08-28, never re-minted), the LIST category
  (rolls, walls, boards) -> `endCredits/AGENTS.md`
- **startingSoon/** - ss01…ss20, every screen shown while the show is NOT happening ->
  `startingSoon/AGENTS.md`
- **scoreboards/** - sb01…sb25, the sports boards and `shared/matchClock.ts` ->
  `scoreboards/AGENTS.md`
- **cornerBug/** - bug01…bug36, the IDENTITY family -> `cornerBug/AGENTS.md`
- **infographics/** - ig01…ig39, where every motion is MEASURED -> `infographics/AGENTS.md`
- **importedDesign/** - imp01 + svg01, the user's own artwork and the BEHAVIOUR pilot ->
  `importedDesign/AGENTS.md`
- **audience/** - what the people watching sent in, five forms -> `audience/AGENTS.md`
- **quiz/** - qz01…qz12, the answer boards -> `quiz/AGENTS.md`
- **competition/** - the COMPETITION PACK, 38 designs over four sub-categories ->
  `competition/AGENTS.md`
- **tickers/** - tk01…tk22, the travelling and rotating strips; a strip that neither travels
  nor rotates belongs in `alerts/` or `publicInfo/` -> `tickers/AGENTS.md`
- **alerts/** - al01…al13, the standard contract plus a SEVERITY flag -> `alerts/AGENTS.md`
- **publicInfo/** - pi01…pi10, official notices and two-language panels ->
  `publicInfo/AGENTS.md`
- **gameTimers/** - gt01…gt04, the on-air countdown clocks -> `gameTimers/AGENTS.md`
- **versus/** - vs01…vs02, the full-frame match-up -> `versus/AGENTS.md`
- **poll/** - pl01…pl05, the LIVE VOTE board (the poll while it is happening) ->
  `poll/AGENTS.md`
- **frames/** - fr01…fr15, the one category that is chrome around a HOLE -> `frames/AGENTS.md`
- **transitions/** - tr01…tr04, the full-frame cover-and-hold wipes -> `transitions/AGENTS.md`
- **streamNotifications/** - sn01…sn04, the stream event alerts ->
  `streamNotifications/AGENTS.md`

