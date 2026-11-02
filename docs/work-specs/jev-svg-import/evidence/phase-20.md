# Phase 20: Render role-beside credits using imported styling

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 20: "Test columns, multiple names per role, alignment and overflow using imported samples.
  Do not substitute cr02 and call it preservation."
- Moved here by the owner (2026-11-02), from AC-23: "Ambiguous columns get one mapping choice".

## Pinned main

Worktree from `bc9be3b683654a681ce197bb13eedce9367ce98b` (PR #1956, row 19). Previous verified
main: that SHA. CI, configured-suite, Post-landing and Quarantine all succeeded on its push.
`origin/main` moved to `93d91127` (#1957, `scripts/e2e-traced.json` only) and is merged in.

## What changed

- `creditsRoll.ts`, the styled engine:
  - `CREDITS_RENDERED['role-beside']` is `['roll']`, so a role-beside binding builds styled.
  - `styledCreditsConfig` gives role beside its own numbers:
    - `nameAlign`, the name column's edge (`align` stays the role column's);
    - `roleToName: 0`, because a role and its first name share a baseline;
    - the line step: the name step, or else the group gap.
  - `creditsStyledRuntimeJs` differs for role beside in a few places only:
    - each column sits on its own edge, the mean of its drawn layers;
    - the stylesheet anchors each kind on its own edge;
    - each column's room for the overflow rule ends where the columns meet, halfway across the
      gutter between the drawn layers' ink;
    - a drawing of one line, which shows no step, takes 1.2 times the drawn name size;
    - a marked heading (`# ...`) spans both columns: its room is the whole window, and the line
      after it steps down rather than sitting beside it.
    Role above emits the same bytes as before (`ROLE_ABOVE_PINS`, taken on `bc9be3b`).
- `creditsRoll.ts`, `creditsPreview`. A layer's identity, role or name, is read off the whole
  drawing, never from where the reading of one block happens to start.
  - THE DRAWING is the picked layer, everything below it, and the layers above, nearest first,
    while the whole stays within two looks. A title in a third look stays out.
  - ROLE BESIDE (a line holds two layers in the two looks): the roles are a column. The first
    layer read on the first such line wears the role look; the column answer turns it to the
    other column's look. A role picked starts its block; a name picked reads from its own role,
    the nearest layer at or above it in the role look.
  - ROLE ABOVE: the picked layer is the role, exactly as row 19 read it, on every drawing. A name
    and a later role can be drawn alike (tight groups, roles with no names), so nothing re-reads
    a pick from the layers above it. Every guess tried in review aired roles as names on some
    drawing. The preview shows what the pick reads, and the first role reads the whole block.
  - `ambiguous` is true wherever a line holds a role and a name, whether or not the drawn
    reading of the picked block works. A title above does not hide it. Every preview, styled or
    not, carries it and the drawing's direction (`rtl`), so the question's Left / Right labels
    do not change with the reading.
  - A preview that falls back says why (`reason`, the analysis's own message).
  - It reads the layout once and reuses that reading for every subset.
- Wizard (owner-approved files, see the PR):
  - `BehaviourSection.tsx`, the Credits preview:
    - "Which column contains the roles?" (Left / Right) appears where `ambiguous` is true and at
      least one answer gives styled credits (a title falls back either way and is not asked).
      Its answer updates the preview and is saved as the binding's anchor kinds, which the
      runtime copies.
    - Where a design falls back, the preview says so in one line: "Fixed artwork: <reason>".
    - No fixed-artwork choice for credits that can be styled (Decisions: a departure).
  - `draft.ts`: `creditsSwap` holds the column answer, and `creditsFor` the layer the binding was
    read for. `styledCreditsOf` saves a binding only for the pick it was read for; a binding from
    before this row was read for its first role. That pick may be a name.
- `svg.ts`, `svgBind.ts`, `MapSvgFieldsStep.tsx`: unchanged. The row-19 paths already build,
  mark and describe any styled binding.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Role beside renders in imported styling | Node "the sample rebuilds in its two columns", on credits-2 (the dev sample), roles set against their end, right to left, names drawn left of their roles, and a name layer picked. Every row's first character is within 0.05 units of its source's, with the same fill, size, weight, style, family and effective opacity. e2e: the wizard walk on credits-2 saves the binding. The take shows roles at x 90 in pale green 26 and names at x 440 in white 32, at baselines 195 / 195 / 365 / 365 / 420 |
| Columns and alignment | Node: credits-2 roles start at 90 and names at 440 for every list. Roles set against their end all end at 300 whatever their length, with names from 340. Right-to-left roles reach 900 and names 600 |
| Multiple names per role | Node: nine rows (three names under one role, a role with none, a section break) at 195, 195, 250, 305, 475, 475, 645, 815, 815: names 55 apart, 170 from a group's last line to the next role, a role and its first name on one line. e2e: an Update rebuilds at 195, 195, 250, 305, 475, 645, 645 |
| Overflow, measured | Node, on three drawings: names measured in the drawn name look against their column's room (credits-2: the frame edge 1100, less 440, less 16) fit, shrink, are reported past 55% and floor at 30%. A 39-character role against the role column's room (to where the columns meet) shrinks to it and is reported under the one Credits field. The report clears when the list fits |
| Headings beside | Node: `# SPECIAL THANKS TO EVERYONE AT THE STUDIO` then two names on credits-2. The heading keeps its full size on the whole frame, and the names step down to 250 and 305 in the name column |
| Ambiguous columns get one mapping choice | Node: names drawn left of roles read either way. Read as drawn, the names roll as roles at x 100 in white; with the answer, roles roll in gold at 600 and names in white at 100. Both bindings validate, and the anchors differ. The question is asked when the drawn reading of the pick fails (a last name on its own line, left to right and right to left, with the labels following the drawing's direction), and under a title in either look. e2e (owner's test): the preview first lists the names as roles. After "Right" it lists Director and Sound, the saved field is `Director:\nAlex Rivera\nIda Lake\nSound:\nAri Moss`, and on air the roles are gold at 600 and the names white at 100. Role above never asks (node, and the row-19 e2e) |
| Name layer picked as Credits | Beside, styled from its own role: node, credits-2's Émilie Lac, alone on its line, reads from Image, as picking Image does. e2e: picking the first role and then Léa Orme saves the styled binding for Léa and rolls all five rows. Above, every pick reads from itself as on `main` (a departure; see Decisions). Node, role picks: a later role (Sound) reads `Sound:\nAri Moss`; with a role that has no names, Editor reads `Editor:\nMia Holt`; on even, tight and title-topped pages, and with an empty role at the end, roles stay roles |
| Fallback explained in one line | e2e: picking the title shows "Fixed artwork: <reason>" and its row scrolls as artwork; a stylable pick shows no such line |
| Source and animation identity | Node "role beside keeps the source layers": the take moves the roll's own group, a second take measures the same roll, and Out stops it. Every source layer's markup is unchanged after a take and stays hidden, and a reset of inline styles leaves the rows as built |
| Not cr02 | The rows are copies of the imported drawing's own layers (above). Nothing in the engine reads a catalog design |
| Fixed artwork and saved graphics compatible | Pins of the editable roll, the artwork roll and the three plain credits drawings are unchanged. Row 19's five role-above styled builds are byte for byte as on `bc9be3b` (new test). `check:catalog-emit` PASS (528). Wherever the draft holds no styled binding, it saves `options.artwork` exactly as before. The deliberate fixed-artwork choice is held back (Decisions) |

Mutations, each caught:
- Names placed on the role column's edge: three node tests fail.
- Each column's room set to the whole window: the overflow test fails.
- No reading from a picked name's role (beside): the name-pick tests fail.
- The question decided by the analysis of the drawing (the old rule): the question test fails.
- e2e, in one run (j-0003, 2 failed): the Roles answer not applied, together with
  `styledCreditsOf` restored to "the first anchor only".
- e2e (j-0006, 1 failed): the binding not re-saved when the pick moves to another layer of the
  same block.

## Verification on this worker

- `node --test scripts/imported-credits-model.test.mjs`: 41/41 (the empty-role checks extend an existing test). `scripts/imported-credits-source.test.mjs`: 14/14.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS, 528.
- `scripts/svg-import-passes.test.mjs`: 18 pass, 4 fail. The output is identical to a clean
  worktree of `origin/main` on this machine, apart from paths and timings (row 19 recorded the same).
- Browser, through the job queue: `e2e/import-svg-credits.spec.ts` 9/9 after each round (j-0001,
  j-0007, j-0008, j-0009, j-0010, j-0011, j-0012, j-0013, j-0014, j-0015, j-0017, j-0018, and j-0019 on the final code). Mutation runs j-0003 and j-0006
  above. `check-e2e-protection --changed origin/main`: OK.
- Before the review rounds, the wizard was walked on this worktree's dev server with credits-2:
  the Roles question (Left) and the two columns showed, with no console errors.

## Review rounds

- `/check` on `f582330` (delegated review, 8 findings; 7 fixed, 1 kept as is):
  - The widening for a picked name depended on the column answer, could pull in a title, and
    could fall back to inverted kinds. Replaced (and later reworked; see below).
  - A binding read for one pick was saved for another layer of the block: the draft now records
    the pick it was read for (`creditsFor`; e2e mutation j-0006).
  - In role beside, a heading got only the role column's room, and its first name sat on its
    line. Headings now span both columns.
  - The column answer was derived from the saved binding and could be lost: the draft keeps it.
  - The preview read the layout again for each subset: it now reuses the one reading.
  - Two flags derived the same fact in the preview: one reading now.
  - Kept: the analysis still runs a few times per re-measure. It is arithmetic on a few layers.
- Codex on `91fe641` (P2, product defect): a later role picked (`Sound`) was read from the
  previous group's last name, with roles and names reversed. Family: a layer's identity read from
  where a reading starts.
- `/so` on `91fe641` (session `session_017SdbwMzqUSsHc7p2w57zgR`, AGREE WITH CORRECTIONS, B+):
  - Blocking: "Show as: Fixed artwork" was offered only for separate-layer drawings, and for
    exactly those the artwork roll scrolls only the Credits layer (#1958). The choice was removed
    (Decisions).
  - Non-blocking: the Roles question shows for nearly every role-beside import (by design,
    reported to the owner).
  - Non-blocking: the fallback reasons use the analysis's wording ("look"). Kept: one accurate
    line, and the brief allows no other copy change.
  - Non-blocking: the column answer carries over to another pick, visibly.
- Codex on `ef23674` (2 x P2, product defects, same family as above):
  - the question was not offered when the drawn reading of the pick failed;
  - a title in the role look above a names-left block hid the question.
- `/so` on `ef23674` (session `session_017SdbwNjajnwgJr5qdXeh8r`, AGREE WITH CORRECTIONS, B):
  - Blocking: a title in the names' look flipped role-above credits (a regression from row 19).
  - Blocking: a title in either look hid the question on the names-left drawing.
  - Blocking: these notes still described the removed choice. The edit had not been applied:
    the commit hook refused the command that carried it.
  Its points 4 to 7 are non-blocking: the fixed-artwork departure (#1958), and phase 18's
  pick-the-first-role limit. The Codex fix itself is sound without a title.
- Codex on `7e76517` (2 x P2, product defects, same family):
  - the role-above run heuristic took consecutive role lines (a role with no names) for names;
  - in a right-to-left drawing, the Left / Right labels followed whichever reading worked.
  Role above now trusts only what the drawing proves, the group-air check. The labels come from
  the drawing's direction.
- `/so` on `7e76517` (session `session_017SdbwPt5FARMMtz8XQUxoy`, AGREE WITH CORRECTIONS, B):
  - Blocking: a role with no names flipped role-above credits (the run heuristic). This was
    already removed in `36c8e64`. Its drawing is now a test: under a title in the names' look,
    the first role reads as on main, and Editor reads `Editor:\nMia Holt`.
  - Non-blocking, taken: the question appeared on picks where neither answer styles (a title).
    It now needs at least one styled reading (e2e: the credits-2 title asks nothing).
  - Non-blocking: the fixed-artwork departure (#1958), and the two documented limits below.
  - It confirmed role beside correct in every case it tried, and row 19's first-role picks equal
    to main's on every existing drawing.
- `/so` on `b421bed` (session `session_017SdbwQ3Du2fNpG6cZ977N4`, AGREE WITH CORRECTIONS, B+):
  - Blocking: evenly spaced role-above credits (or tighter between groups than from a role to its
    name) fell back on the first-role pick, where `main` styled them. Fixed: the group-air rule
    only acts where a layer in the block's other look is drawn above the pick (tests: the even
    and tight drawings read as on `main`).
  - Non-blocking, documented in Known limits: a two-look title line above role-above credits
    asks the column question (the default answer is correct); a last role with no names picked
    reads with its kinds reversed in the preview.
  - Non-blocking: the fixed-artwork departure (#1958), and the question on every role-beside
    drawing (a recorded decision).
  - It found row 19's first-role picks identical to `main` on every drawing in the tests and on
    credits-1 to 3, and the owner's names-left walk correct.
- Codex on `34a0fda` (P2, product defect, same family): on an evenly spaced page, a middle role
  picked fell back to artwork. The picked layer's own reading now stands unless the wider
  reading proves it a name (test: `Sound` on a three-group even page reads
  `Sound: Ari Moss / Editor: Sol Reed`).
- `/so` on `34a0fda` (session `session_017SdbwQpVDVFtT7Ej3AfYgn`, AGREE WITH CORRECTIONS, B+):
  - Blocking: a title in the names' look above evenly spaced (or tighter, or centred) role-above
    credits made the first role fall back. Its probe compared main and head on 566 picks over
    133 drawings. Same root cause as the Codex finding above, fixed by the same change: the
    picked layer's own reading stands unless the wider reading proves it a name. Its four
    drawings are now tests, and every role pick in them reads as on `main`.
  - Non-blocking: the fixed-artwork departure (#1958), and the documented limits below.
  - It found role beside, the column answer, the names-left drawing, headings beside, overflow
    and name picks correct. Every role pick with nothing drawn above it matched `main`.
- Codex on `c383116` (P2, product defect, same family), and `/so` on `c383116` (session
  `session_017SdbwQuDDf14T4bEAfdEEp`, AGREE WITH CORRECTIONS, B+): on a page with tighter groups
  than the role-to-name step, a middle role picked read from the name above it, with the kinds
  reversed. The `/so` probe compared main and head on 3,660 picks over 636 drawings, and a
  spacing sweep of 1,350 more. Fixed by its suggestion: the reading from above is taken only if
  it leaves no more roles without names than the picked layer's own reading (tests: two tight
  three-group pages, `Sound` reading as on `main`). Its non-blocking points 2 and 3 are in
  Known limits. It confirmed role beside, the column question and name picks correct.
- Codex on `90ac83a` (P2, product defect, same family): a role with no names at the end let the
  count of roles without names authorize reversed kinds. The sixth round in one family, so the
  rule model was reassessed again: the drawing cannot decide a role-above pick, and every
  heuristic failed somewhere. Role above now reads every pick as `main` does (Decisions).
  Test: that drawing reads `Sound: Ari Moss / Editor:`, as on `main`.
- `/so` on `90ac83a` (session `session_017SdbwPDmsTy9bySpE3vsVv`, AGREE WITH CORRECTIONS, B+;
  24,658 picks over 2,091 drawings, and a sweep of 69,154): its blocker (a tight page with a
  title in the names' look and a trailing role with no names flipped the first role) was
  already gone in `2bab117`, which reads every role-above pick as `main` does. Its points 2 to 4
  are worded into Known limits.
- Codex on `2bab117` (P2, product defect, a different family: a size read from the wrong
  element): in a role-beside drawing of one line, the fallback line step read the text's font
  size, not the size of the run that paints the name, as the copies are painted. Fixed: the
  step uses the painting run. Not covered by a test: the importer moves a run's size onto its
  text in every drawing tried, so no imported sample tells the two apart. A test was written
  and dropped when its mutation stayed green.
- **Repeated family, reassessed.** Three rounds found variants of one missing rule: how a single
  picked layer's identity, and the column question, are decided. Rather than patch a fourth time,
  the rule model was rewritten (What changed, `creditsPreview`):
  - the question follows the drawing's geometry (a line holding a role and a name);
  - the role look follows the column answer in role beside;
  - role above reads every pick as row 19 did (the sixth-round reassessment, above).
  Tests: "a picked layer is a role or a name by the drawing's role look", "a drawing with a role
  and a name on one line always gets the column question", "a title above the credits, in either
  look, changes neither the kinds nor the question".

## Decisions

- **No deliberate fixed-artwork choice yet, a departure from the brief's wording.**
  - The owner's direction asked for fixed artwork as a choice in the Credits preview wherever
    styled credits are supported. That choice can only appear on a drawing of separate role and
    name layers.
  - For exactly those drawings, the artwork roll moves only the text holding the Credits layer,
    so the rest of the credits would stand still on air (#1958).
  - The binding wizard invariant `wizard/offer-control-can-change-graphic-front` says a control
    that cannot keep its promise must be hidden, or name its failing class where it is offered.
    The brief allows no other copy. So the choice is held back until #1958 lets fixed artwork
    move the whole block.
  - `/so` on `91fe641` found it and named it an owner decision. Fixing it here needs
    `creditsArtwork.ts` and an artwork binding that names its layers.
  - The other half, "say why a design falls back", is done.
- **Role beside differs in a few runtime lines, chosen at build.** Role above must keep its bytes,
  so the emitted runtime branches in TypeScript (`beside(...)`). That beats a generic runtime that
  would change every row-19 graphic.
- **Where the columns meet** is halfway across the gutter between the drawn layers' ink, in the
  first role's frame. A column's room runs from its edge to there, or to the window on its outer
  side, less half its type at each side, as role above spends its room.
- **The Roles question appears on every drawing with a role and a name on one line**, including
  credits-2. Geometry cannot tell a role column from a name column, so the author answers. "As
  drawn" is preselected: the left column, or the right for right-to-left text. The labels are
  Left and Right because the author sees the columns.
- **The saved answer is the anchors**, not a new field in the saved graphic. The kinds are what
  the runtime copies, and `validateCreditsBinding` already accepts either answer (row 18). The
  wizard draft also keeps the answer, so the step can show it and apply it again.
- **Identity from the drawing, not the reading; role above as on `main`.** In role beside, the
  column answer decides a layer's identity, so a name picked there reads from its own role.
  Role above has no answer to ask for. Six review rounds found a counterexample to every rule
  that re-read a role-above pick from the layers above it: runs of one look, the widest step,
  the air between groups, and the count of roles with no names. Each counterexample aired roles
  as names. So role above reads the pick as row 19 did, and the brief's "picking a name layer"
  item is met beside, where it is decidable. Above, the preview's roles and names show the
  author what a pick reads, and the first role reads the whole block.
- **Ordinary review scenario.** A renderer, one select and two draft fields; no state rule changes.

## Known limits

- Picking a role or name below the first group lists from that group down (phase 18's limit,
  now also for names). The author picks the first role, or a name on its line; the e2e does.
- Role above: a name picked reads as on `main`, as the first role of whatever it starts. The
  preview lists it as a role, and the author picks the first role. Every role picked reads as
  on `main`.
- A pick whose block below cannot read as credits falls back, and its line repeats the
  analysis's reason ("Credits need at least one role and one name drawn" or "Roles and names
  share one look"), which does not describe the whole page. Above, this is a name whose block
  below holds only names (as on `main`). Beside, it is a last role with no names, for either
  answer. The author picks the first role.
- On a role-beside page, a title in the role look, if picked, becomes a styled role with no
  names. The preview shows it.
- A title line holding one layer in each look (for example "CREDITS" in the role look beside
  "2026" in the name look) above role-above credits makes the column question appear. The
  preselected answer is correct. The other answer can read names as roles for a later pick,
  which the preview shows.
- No deliberate fixed-artwork choice for credits that can be styled (Decisions; #1958, P2). A
  drawing that cannot be styled still saves the original-text roll, as before.
- The Behaviour summary still says the original artwork scrolls. That is the recipe's own line
  (`words.json`), unchanged here because the brief allows no other copy change.
- Row 19's limits stand:
  - validation reads with fallback fonts;
  - a stale binding builds the editable roll;
  - a source's own filter, clip or mask is not carried;
  - letter spacing in px does not scale.

## Follow-ups

- Rows 21 to 23 (#1937): roll qualification (21, including inline opacity on a source in its own
  group), static (22), cards (23).
- #1958 (P2): fixed artwork of a separate-layer drawing rolls only the Credits layer. The
  deliberate fixed-artwork choice comes with its fix.
- #1955 (P3): the editable roll's list holder through the formatter.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-20-build')"

After a revert, new role-beside imports save artwork credits again. A graphic saved with a
role-beside styled binding in between then builds the editable roll of its one list field, and
its other drawn layers show as drawn. Role-above graphics are unaffected.
