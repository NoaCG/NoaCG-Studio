# Phase 19: Render role-above credits using imported styling

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 19: "Test repeated roles/names, bold roles, long names and spacing from the sample. Use
  measured overflow expectations; retain original source text and animation anchors."

## Pinned main

Worktree from `516ec2c9615c595dc1b8f32010930af7fee3a5a9` (PR #1950). Previous verified main: that
SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on main all
succeeded on it.

## What changed

- `creditsRoll.ts`, the styled engine:
  - `creditsEngine` answers `styled` only where the binding validates and its layout and playback
    are in `CREDITS_RENDERED` (row 19: role above, roll). A styled binding anything else describes,
    or a stale one, builds its declared fallback, the original-text roll (`isArtworkCredits`).
  - `styledCredits` / `styledCreditsConfig`: the style read at build (one laid-out reading per
    markup and binding, memoised), and the runtime's numbers: aligned edge, role to name, name to
    name, group gap, and what the drawn roles end with.
  - `creditsMarkAnchors`: the source layers keep their text, ids and attributes, take the hiding
    class and a `data-noacg-credit="<place> <kind>"` mark.
  - `creditsStyledRuntimeJs` / `creditsStyledCss`: every role row is a copy of the first drawn role,
    every name row of the first drawn name (class, runs, paint and transform kept; words and
    position changed), placed on the shared edge at the drawn steps, in the first role's frame.
    A copy whose source sits in another group carries that group's look. A row too wide for its
    room shrinks, is reported past 55% through `noacgTextOverflow()` under the one Credits field,
    and stops at the 30% floor.
  - The editable roll's field and take code is shared, extracted verbatim (`creditsFieldJs`,
    `creditsTakeJs`); the editable and artwork pins are unchanged.
  - #1941 points 2 and 3: the look and position come from the element painting the first
    character; the parsed reading compares colours, not spellings.
- `creditsSampleText`: a styled binding's one field starts with the list the drawn layers spell.
- `svg.ts`: emits the styled css and runtime where `styledCreditsConfig` answers. `svgBind.ts`:
  calls `creditsMarkAnchors` before the markers come off.
- Wizard: `draft.ts` holds the binding the step read (`SvgRecipeDraft.credits`,
  `styledCreditsOf`), saves it instead of `options.artwork`, and keeps the other drawn layers out
  of the field list. `BehaviourSection.tsx` hands the preview's role-above reading to the draft.
  `MapSvgFieldsStep.tsx` says on those rows what they become.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Role above renders in imported styling | `imported-credits-model` "rebuilds exactly where and how the designer drew it": credits-1, a bold-class drawing and a grouped drawing; every row's first character within 0.05 units of its source's, and the same fill, size, weight, style, family and effective opacity. e2e: the wizard walk saves the binding and the take shows the rows at baselines 175 / 240 / 295 / 445 / 510 in the drawn colours and sizes |
| Repeated roles and names, multiple names | Node: nine rows (Research twice, three names, a role with none, a section break) at steps 65, 55, 55, 150, 65, 150, 150, 65. e2e: an Update with repeated roles rebuilds at 175 ... 780 |
| Bold roles | Node: a stylesheet class sets the roles 700; rows read 700 / 400 as drawn |
| Long names, measured overflow | Node: four names measured in the drawn name look (316, 965, 1614, 4533 units) against the room 765 (800 frame, centred at 400, half the 35 type kept at each side): fits; shrinks to the room unreported; shrinks reported past 55%; floors at 30%. The report names the Credits field and clears when the list fits |
| Spacing from the sample | Steps are `analyseCreditsStyle`'s, in the first role layer's units; the pace rides the drawn name step (55) |
| Original source text retained | Node: each source layer in the built html is the import's text element word for word with its attributes; the take leaves every source layer's markup unchanged; e2e: the five drawn layers keep their words after Take and Update, laid out and hidden |
| Animation anchors retained | The roll moves its own group (`.imported-design-credits-roll`); a second take measures the same roll; sources are not motion targets and are not rewritten |
| Defined overflow per playback | Roll: tall runs through, wide shrinks and reports (above). Static and cards build the original-text roll until rows 22 and 23 render them (test "what no row renders yet") |
| One list, no field per name | Node and e2e: one textarea holding `Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss`, the drawn title, Scroll speed; no fourth field. The other drawn layers' checklist rows are greyed: "sets the look of every name in Credits" |
| Fixed artwork compatible | Pins of the editable roll, the artwork roll and the plain credits drawings unchanged; `check:catalog-emit` PASS (528). Byte comparison through the wizard's draft path (`svgDraftFromImport` then `svgDesignOptions` then build) of credits-roll, credits-artwork and credits-1 to 3 without the step's styled reading: identical hashes on this branch and on `516ec2c`. e2e: the artwork import's rows still say "scrolls as artwork"; role beside still saves artwork credits |

Mutations, each caught: the old first-run look rule (#1941 test); no colour normalising (two tests);
the role step for every name (positions and spacing); no shrink (overflow); the edge read from the
ink box (positions, 0.67 units off); no group look (positions and looks). e2e: with the wizard's
save disabled the role-above walk fails (j-0003).

## Verification on this worker

- `node --test scripts/imported-credits-model.test.mjs`: 27/27.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS, 528.
- `scripts/svg-import-passes.test.mjs`: 18 pass, 4 fail, and the whole output is identical on an
  unmodified worktree of `516ec2c` (this machine's Chromium build; CI is the authority for the
  corpus records). No record regenerated.
- Browser, through the job queue: `e2e/import-svg-credits.spec.ts` 6/6 (j-0001, j-0002 after the
  checklist line). `check-e2e-protection --changed origin/main`: OK.

## Decisions

- **The Roles choice moves to phase 20 (owner decision, 2026-11-02).** "Ambiguous columns get one
  mapping choice" is explicitly deferred to phase 20, where role-beside credits are first
  rendered. Evidence: `creditsColumnsAmbiguous` (`creditsRoll.ts`, the function after
  `CreditsChoice`) answers false unless the drawing reads role beside, and phase-18.md test 5 pins
  that role above is never ambiguous. A select here could only appear on a role-beside drawing,
  which still saves artwork credits, so it would change nothing built
  (`wizard/offer-control-can-change-graphic-front`). The draft field that carries the anchors is in
  place for phase 20 and changes nothing for imports today (byte comparison above).
- **Only what a row has rendered builds styled** (`CREDITS_RENDERED`): role above as a roll. The
  wizard saves the styled binding only there; other layouts and playbacks, and a binding gone
  stale, build the original-text roll, so an untested picture never airs.
- **Copies of the drawn layers, not a second look model.** A row is the source layer cloned with
  new words, so classes, runs, paint, transform and anything a stylesheet sets travel without a
  property list. Only a source in another group gets its inherited look written on the copy.
- **Positions on the page, steps from the build.** The steps come from the same reading the
  wizard showed; where each row stands is measured on air in the first role's own frame after
  fonts load, so a turned or scaled block places correctly.
- **Room is the window less half a row's type at each side it meets**, the typographic margin the
  fit uses for a centred line (`wizard/measure-line-room-alignment-line-own`), spent from the
  aligned edge.
- **Playback is roll.** The recipe is the roll; static and cards are rows 22 and 23. No playback
  control is offered until a second playback renders.
- **Ordinary review scenario.** A renderer and a draft field; no state rule changes. The roll's
  take, Out and speed handling are the editable roll's own code, shared verbatim.

## #1941

- Point 2 fixed: the element painting the first non-blank character gives the look and position.
- Point 3 fixed for colours. A `%` position still reads as a plain number in the parsed reading:
  a documented safe limit, since every in-product caller lays the markup out (phase 16).
- Point 1 was closed by phase 18. The issue closes with this row.

## Known limits

- A styled build validates with fallback fonts when the design's own faces are not on the page;
  centring drawn without a stated anchor could then read `misaligned` and build the
  original-text roll (phase 16's limit, unchanged).
- Letter spacing set in px does not scale with a shrunk row.
- A row past the 30% floor is reported and clipped by the roll's window, as the policy states.

## Follow-ups

- Rows 20 to 23 (#1937): role beside with the Roles choice (phase 20), roll qualification (21),
  static (22), cards (23), each adding its entry to `CREDITS_RENDERED`.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-19-build')"

A revert returns new credits imports to the original-text roll. A graphic saved with a styled
binding in between then builds the editable roll: its list in the Credits layer's one look, and
the other drawn role and name layers shown as drawn.
