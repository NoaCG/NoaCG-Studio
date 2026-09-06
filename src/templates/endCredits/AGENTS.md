# src/templates/endCredits - the credit rolls and name lists

Loaded alongside the root `AGENTS.md` and `src/templates/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate.

Split out of `src/templates/AGENTS.md` on 2026-08-22, which keeps the catalog-wide rules and
the category index. Add a RULE here; leave the reasoning in the code's own comments.

## endCredits/ - the LIST category

cr01…cr13 (prefix 'credits'; **cr10 retired 2026-08-28** - rendered duplicate of cr01, whose
Emphasis style choice already carries its name-first layout and which took over its
credits-loop preset; never re-mint the id) + creditsPresets.ts (credits-roll /
credits-loop / credits-board / credits-pages / credits-crawl) + **creditsMotion.ts**;
data-driven: a hidden #f0 textarea holds the whole list, template JS parses and rebuilds
#credits-track, ends with logo + year (.credits-end). DATA BLOCKS via convertToDataRegion.
**The category is LISTS, not just credits** - the same data model at a different speed is a
credit roll, a name wall, a donor board, a sponsor acknowledgement, a graduation roll or a
schedule. Choosing a design is choosing that speed, which is what the index groups by.

**THE TEXT FORMAT IS `docs/END_CREDITS.md`** - one mark, `A COLON ENDS A ROLE`, and everything
else is a name. Three rules, no fourth:

- `Role:` / `Role: Name` / `Role<TAB>Name` / `Role | Name` all open a ROLE. Every following bare
  line joins it, which is how one "Camera Operators:" credits five people without repeating
  itself. `;` is accepted wherever `:` is. A guard of `ROLE_LABEL_MAX` (48 chars) keeps a
  sentence containing a colon from becoming a job title.
- `# X` is a heading. **A heading is MARKED or it is not a heading** - nothing is promoted by
  position. The old positional rule (a bare line OPENING a section became its heading) set the
  sentence nearly every roll ends on - "Special thanks to everyone who made this show possible" -
  in accent caps at kicker size, so it is gone and every sample marks its headings.
- Anything else is a name: it joins the open role, or is a plain `entry` when there is none. A
  list pasted with NO marks at all is therefore a clean column of names - the deliberate floor.

**The parser emits GROUPS.** `{ type: 'group', role, names[] }`, plus `heading` and `entry`. A
design defining **`renderCreditGroup(group)`** is handed the role and all its names at once - the
only way one role lays out above (cr01) or beside (cr02) several names. A design without one is
served the group flattened into the original row kinds by `creditGroupRows` (role + first name =
`credit`, the rest = `entry`, no names = `heading`), so the whole category kept working when the
groups landed. **A row builder must still answer all three row kinds**; a design that only handles
'heading' and 'credit' renders `undefined` for a bare name.

**cr01's Emphasis is the catalog's first `TemplateVariant.styleChoices`** (model/wizard.ts) - a
design decision the DESIGN owns and the user picks in the Style step, resolved into
`o.styleChoices`, illegal values dropped back to the design's default. It emits ONE class on
`.credits-box` (`credits-box--emph-role` / `--emph-name`) writing six custom properties, so no
rule below it branches. Reach for it only when both answers are genuinely right for different
shows and neither is a different design - otherwise Browse gets two cards with nothing to choose
between them. A style choice may never change fields or behaviour: those are a graphic TYPE's.
`credits-board` is the one format with NO motion: the list fades up and holds. It exists
because rolling a schedule or a wall past the audience means the line they need is the one
that just left, and it is the reason a board design lays `.credits-page` out in normal flow
where a paged design stacks them absolutely.
`credits-loop` is the seamless repeat, for the long tail after a show. `creditsLoop()` wraps
the track's content in one `.credits-loop-run`, appends as many `.credits-loop-clone` copies as
the viewport needs, and travels exactly one run's height - a bare `repeat: -1` would snap the
list back to the top, which everyone watching a wall of names is watching closely enough to see.

## Speed is the operator's, and the list runs all the way through

Owner walk 2026-08-28, and it holds for anything in here that moves:

- **Every design with motion emits a SPEED field** (`Scroll speed (%)` / `Crawl speed (%)` /
  `Page speed (%)`, ftype `number`, default `100` = the pace the design ships at, clamped to
  10-400 by `creditsSpeed()`). It is appended LAST so the logo keeps `f2`, and it is input only:
  a hidden `.noacg-data-source` holder, never drawn. **The static board emits none** - nothing
  there has a speed, and a control page must not offer a field the graphic cannot use. It applies
  at the next `play()`, because that is when the travel is measured.
- **`creditsRoll()` and `creditsCrawl()` run the LIST off the frame**, then bring the
  `.credits-end` block in as its own beat (`creditsEndBeat()`), centred, with the pages faded
  out. The travel therefore measures to the end block's position, not the track's full extent.
  Do not "fix" it back to stopping on the mark: a roll that ends with the last names on screen
  and the logo held in the middle is the thing that walk was about.
- **A roll's SETTLED pose is now that closing beat** - the mark alone. Every surface that shows
  a graphic without a playback gesture parks it there (`preview/settleGraphic.ts`), so a Browse
  card, a library thumbnail and an operator preview of a roll show the end block rather than a
  frame of names. That is the honest final frame of the new motion; if the cards ever need a
  mid-roll frame instead, that belongs in the settle recipe, not in a template.
