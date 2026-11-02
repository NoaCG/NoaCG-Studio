# Phase 22: Qualify static credits playback

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 22: "Both imported layouts hold without unintended travel; excessive content uses an
  explicit fit/refusal policy rather than clipping or silently switching layout."

## Pinned main

Worktree from `d6eb976501ecf9d472d5055c86d49bc191ef052e` (PR #1966, row 21). Previous verified
main: that SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on
main all succeeded on it.

## What was there before

Phase 19 listed static and cards as playbacks no row renders yet (`CREDITS_RENDERED`): a styled
binding with `playback: 'static'` built the editable roll of its one list field, and the wizard
never saved one. Phase 16 had already declared the static overflow policy in `CREDITS_OVERFLOW`
(`tall: 'shrink-then-refuse'`), with nothing implementing it.

## What changed

- `creditsRoll.ts`:
  - `CREDITS_RENDERED` adds `static` to role above and role beside, so a static binding builds
    styled.
  - `styledCreditsConfig` sets `still` for a static binding. Like `faces`, it chooses emitted
    lines and is kept out of the spacing table.
  - `creditsStyledRuntimeJs` differs for a still page in a few places only (`still(roll, stillJs)`,
    the same pattern as `beside`):
    - the take is `creditsHoldJs()`: it rebuilds the rows and records what it showed
      (`noacgCreditsLast = { still, rows, scale, refused }`). It starts no tween, so nothing
      moves the rows; Out finds no roll to stop.
    - `creditsRender(shrink)` builds every step and every row's type at a share of the drawn
      size (1 unless it calls itself with less).
    - a third pass measures the page against the window and fits it (Decisions, the policy).
  - `creditsWindow` moved into `creditsWindowJs()`, shared by the roll's take and the still page.
    The roll's bytes are unchanged: every pin passes (Evidence).
  - `CREDITS_OVERFLOW`'s comment now says what the static policy does on the page.
- `credits.ts`: a still page offers no Scroll speed (`fields(ctx)`).
- Approved departures from the row's allowed files, each asked of the coordinator first:
  - `recipe.ts` and `behaviour.ts`: `RecipeContext.credits` carries the styled binding where the
    design builds it, so the recipe can leave Scroll speed out of a still page. A stale static
    binding falls back to the editable roll and keeps its speed field.
  - `draft.ts` and `BehaviourSection.tsx` (pre-approved): `creditsStill` holds the author's
    choice. "Plays as: Roll / Hold still" shows on credits that build styled, unless the author
    chose fixed artwork. The saved binding carries `playback: 'static'`.
  - `scripts/imported-credits-model.test.mjs`: row 19's placeholder "static builds the editable
    roll" moves to cards and stale, with its byte comparison now against cards. A new test says a
    static binding builds the still page, with no roll and no Scroll speed, while the roll of the
    same binding keeps both.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Both layouts hold without unintended travel | e2e "styled credits held still, role above and role beside…": credits-1 (role above) and credits-2 (role beside), after Drop, Rise and Pop. After the take `noacgCreditsTween` is null and the roll group has no transform. Each row stands where the drawing put it (above: 175 / 240 / 295 / 445 / 510; beside: 195 / 195 / 365 / 365 / 420) on its column's edge (above centred on 400; beside roles from 90 and names from 440, within 0.6). Read again 700 ms later, after the entrance: the same rows in the same places, still no tween |
| Explicit fit, never clipped | Same test, longer lists on Update and Take: three names fit as drawn (share 1). Longer lists shrink as a whole: the last ink reaches the room's end, within 2 units, and never passes it. The first role stays on its drawn baseline, and every row keeps its column's edge. Above: 12 names, then 30. Beside: 8 names, then 15 |
| Overflow reported past 55% | Same test: the second longer list in each layout sets the page below 55% and names the Credits field in `noacgTextOverflow()`; the first does not |
| Refusal, not clipping or a layout switch | Same test, 200 names: the share would be below the 30% floor, so the rows are hidden (`visibility: hidden`), `refused: true`, the Credits field is reported, and no tween runs. Shortened again, the page shows and the report clears |
| Refusal visible to the author before air | e2e "role-above credits chosen to hold still…": the wizard walk chooses Hold still. On the production page, before any take, pasting 200 names marks the field "Too long for the design" and the cue's note says it "is too long for the design". On Take the page is not shown, with no roll. With the drawn list again, on Update, the page shows still, at the drawn baselines, and the mark clears |
| The wizard saves static; no dead control | Same walk: the select reads Roll / Hold still and starts on Roll. After Hold still the graphic has the Credits list and the title, and no Scroll speed field (`cue-field-f2` absent). Node: a static binding's build has no Scroll speed; the roll's does |
| Static builds the still page | Node "row 22": engine `styled`, the styled table, no editable roll, the still header, and no `gsap.fromTo(roll` |
| Roll and fixed artwork unchanged | Node pins of the editable roll, the artwork roll and the three plain drawings, and `ROLE_ABOVE_PINS`, all pass unchanged. Cards and a stale binding still build the editable roll, byte for byte as the binding without `credits`. `check:catalog-emit` PASS (528). The whole `import-svg-credits` spec passes, row 21's enter and exit and replay tests included |
| Source and animation identity | The still page builds its rows by the same code as the roll, from the same hidden source layers (row 19's tests), in the same roll group. The roll group is never moved |

Mutations, each caught:
- No fit, so the list runs past the window: the blank-page test fails (12 names, last ink at 852 against a room ending at 772.5) (j-0003).
- No refusal, so the page is set below the floor: both tests fail (j-0004).
- The wizard saving `roll` whatever the choice: the walk fails (j-0005).
- The Scroll speed field kept on a still page: node "row 22" fails.

## Verification on this worker

- Browser, through the job queue: the two new tests (j-0002, j-0007), the mutation runs above,
  the whole `e2e/import-svg-credits.spec.ts` 15/15 (j-0006), then with
  `e2e/import-svg-behaviour.spec.ts` (j-0008), since `behaviour.ts` compiles every recipe.
- `node --test scripts/imported-credits-model.test.mjs`: 44/44, pins unchanged.
  `scripts/imported-credits-source.test.mjs`: 14/14.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass. `npm run check:catalog-emit`: PASS, 528.
  `check-e2e-protection --changed origin/main`: OK.

## Decisions

- **The static policy is phase 16's `CREDITS_OVERFLOW` (`tall: 'shrink-then-refuse'`), made
  concrete (agreed with the coordinator before building).**
  - The page stays where the first role is drawn. Its room runs down to half a drawn line above
    the window's bottom (the window is the Credits box, else the frame). Where the lowest drawn
    layer reaches lower, the room runs to it, so the page as drawn always fits as drawn.
  - A longer list is built again at the share that fits. Type and spacing shrink together about
    the first role's baseline, and each column stays on its drawn edge, so the composition keeps
    its shape. Past 55% the Credits field is reported (the SVG fit ladder's numbers).
  - Below the 30% floor nothing is clipped, nothing rolls and the layout never changes. The page
    is not shown, and the Credits field is reported too long. The operator sees "Too long for the
    design" on the field before the take, from the preview. On Take the artwork enters without
    the credits.
  - Wide rows keep the roll's rule (shrink, report, floor); on a still page a row takes the
    smaller of its own share and the page's.
- **Fit by building again, once.** The fit is linear about the first baseline, so one rebuild at
  the measured share fits. The rebuild is only asked for with a smaller share, so it cannot loop.
- **"Plays as: Roll / Hold still" in the Credits preview.** The default stays Roll, so every
  existing walk and saved graphic is unchanged. "Hold still" says what happens on air in plain
  words. Cards join the select in row 23.
- **No Scroll speed on a still page.** A control that does nothing on that graphic is hidden
  (`wizard/offer-control-can-change-graphic-front`; coordinator-approved files above).
- **The page is fitted at every render**: load, a face landing, `update()` and the take. So the
  report is up before the take, and a face landing late refits the page with no second measure.
  Live Sheet updates without replaying motion are row 24's.
- **Ordinary review scenario.** A new playback renderer and a wizard select. No state rule
  changes: take, Out and update keep their meaning.

## Known limits

- The still page fits the window, the Credits box or else the whole frame. On a drawing with no
  Credits box, a long list may reach past a plate drawn inside the frame (credits-2's plate ends
  at 500 of 540). Picking the plate as the Credits box keeps the page on it.
- A row floored for width (a single name wider than 30% can hold) is still cut at the window's
  edge, as on the roll (row 19's limit).
- After a refused take, the artwork is on air without credits until a list that fits is sent.
- Row 19 to 21's limits stand.

## Follow-ups

- Row 23 (#1937): cards. Row 24: live Sheet updates without replaying motion.
- #1955, #1965 (P3) stand.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-22-build')"

After a revert the wizard no longer offers Hold still. A graphic saved as a still page in between
builds the editable roll of its one list field again, as row 19 built every playback it did not
render, and its Scroll speed field returns.
