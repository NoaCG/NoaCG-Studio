# Phase 23: Qualify successive credits cards

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 23: "Reuse applicable paging primitives; qualify page boundaries, role/name association,
  long cards, ordering, replay and the selected automatic/manual advance policy. Existing native
  presets alone do not prove SVG compatibility."

## Pinned main

Worktree from `8fa8504c07538a97469c2250a2255e8983df3955` (PR #1972, row 22). Previous verified
main: that SHA. CI, configured-suite, Post-landing and Quarantine on the push to main all
succeeded on it.

## What was there before

Row 22 rendered static and roll for both layouts. A styled binding with `playback: 'cards'` was
not in `CREDITS_RENDERED`, so it built the editable roll of its one list field, byte for byte as a
binding without `credits`, and the wizard never saved one. Phase 16's model already held cards and
an optional `advance` of 2 to 60 seconds ("absent = the operator's Next"), and
`CREDITS_OVERFLOW.cards` named the tall policy `next-card` with nothing implementing it.

The native paging primitive is the catalog's page swap (`endCredits/creditsMotion.ts`
`creditsPages`, the `credits-pages` preset): one page per section, each fading in, holding, and
fading out, the last holding until Out. It advances on a timer only. No native credits design has
a manual Next.

## What changed

- `creditsRoll.ts`:
  - `CREDITS_RENDERED` adds `cards` to role above and role beside.
  - `styledCreditsConfig` sets `still` and `cards` for a cards binding. Cards are still pages:
    every card is laid out and fitted by row 22's code. `cards` only chooses emitted lines and is
    kept out of the spacing table. With it off, the roll and the still page emit exactly what they
    did (Evidence).
  - Cards only, through a `cards(page, cardsJs)` switch like `still` and `beside`:
    - `creditsRender(shrink, card, probe)`: `card` paints rows `from..to` of the list from the top;
      `probe` lays out the whole list once at the drawn size and hands back each row and the room.
    - `creditsCardsJs()`, the cards take: `creditsCardsOf` deals the list into cards,
      `creditsDeal` fits every card once and shows the one on air, `creditsArm` holds a card for
      the card time, `creditsTurn` changes cards the way the page swap does (fade out 0.4 s, fade
      in 0.5 s, over `motionSpeed()`), `noacgCreditsNext` is the press.
    - The load-time and faces-landed hooks deal the cards, so the first card is what a preview
      shows, and a card too long is reported before the take.
- `credits.ts`: a cards graphic offers `Card time (s)` (the author's seconds, blank for Next card
  only) in place of Scroll speed, and a `Next card` press: a parallel group of one state with a
  self-transition that runs `noacgCreditsNext` (the puzzle's Reveal letter pattern, so the press
  never replays the entrance). Roll and still keep `machine: {}` and no controls.
- Approved departure from TOUCHES (pre-approved in the brief):
  - `draft.ts`: `creditsCards` and `creditsAdvance` hold the author's choice.
  - `BehaviourSection.tsx`: "Plays as" adds Cards; with Cards, "Seconds per card" (blank: Next
    card). The saved binding carries `playback: 'cards'` and `advance` only when stated.
  - `scripts/imported-credits-model.test.mjs`: the cards "not yet" placeholder is replaced by a
    real cards assertion. The stale case is kept, now compared byte for byte against the
    unstyled build itself. Pins untouched.
  - `recipe.ts` and `behaviour.ts` needed no change: row 22's `RecipeContext.credits` already
    carries the binding to `fields`, `machine` and `controls`.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Reuse applicable paging primitives | A section is a card, as in `creditsPages`; a card changes with the page swap's fade timings and the last holds until Out. Each card is laid out and fitted by row 22's still-page code (`creditsRender`), from the same hidden source layers. No new text layout or motion engine |
| Page boundaries | e2e "styled credits as cards, role above / role beside": one section of one group, a blank line, then four groups. Role above deals 1 + 2 + 2 groups (two groups of three names fill credits-1's 800 frame), role beside 1 + 1 + 1 + 1 + 1 (one fills credits-2's 540 frame). Every card's last ink is within its room (772.5 / 512.5), and the first row of every card stands on the drawn first-role baseline (175 / 195) |
| Role/name association | Same tests: every role on a card is followed by all its names on that card, kinds checked row by row. A group never splits across cards. Node "row 23" asserts the build |
| Long cards | Same tests, a group too long for one card (30 names above, 15 beside) is a card of its own: shrunk as a whole below 55% and not below 30%, filling its room within 2 units without passing it, and the Credits field reported before it is shown. 200 names: that card is refused (hidden, reported). A list that fits again clears the report |
| Ordering | Same tests: the cards read in order are the list without its blank line |
| Replay | Same tests: Out, Next off air (ignored), Take: the first card again |
| Manual advance (the default) | Same tests: no card time, the first card still shows after 2.5 s; `nextCard` turns each card; on the last card Next does nothing and no timer runs. Wizard walk: Cards with blank seconds, on the production page the Card time field is blank, and the `Next card` press shows the second card at the drawn baselines (175, 240) |
| Automatic advance | Same tests, `advance: 2`: the first card holds at least 1.9 s, then turns by itself; Next still skips ahead, and the next hold starts again (none on the last card) |
| Refusal visible before air | Wizard walk: the choice says "A blank line starts a new card. A card too long for the page is not shown, and its field says so." Pasting a second card of 200 names marks the field and the cue's note says "too long for the design" before any take |
| No dead control | Node "row 23": a cards build has Card time (`''` for Next, `'8'` for 8 s), no Scroll speed, the `nextCard` event and `noacgCreditsNext`; the roll of the same binding has no `nextCard` |
| Roll, still page and fixed artwork unchanged | The emitted styled runtime for six configurations (roll, roll with faces, still, still with faces, beside roll, beside still) hashes the same on this branch and on main (`1fcac77a…`). Node pins of the editable roll, the artwork roll, the three plain drawings and `ROLE_ABOVE_PINS` pass unchanged; a stale binding still builds the editable roll byte for byte |
| Native presets are not the proof | Every check above builds the imported SVG (credits-1, credits-2) and reads its own rows; no catalog preset is used |

Mutations, each caught (the jobs are in Verification):

- No paging inside a section (every group fits): both layout tests fail at the deal (role above
  `[4, 16]` at share 0.52, beside at 0.33) (j-0006).
- Next card does nothing: both layout tests and the wizard walk fail at card 1 (j-0007).
- No card time ever armed: both layout tests fail at "timed" (j-0008).
- A take that keeps the card it stopped on: both fail at "the replay starts on the first card"
  (j-0009).
- The wizard never saving cards: the walk fails at the Cards hint (j-0010).

## Decisions

- **Advance: Next card by default, a card time when stated.** The spec's Credits bullet, verbatim:
  "Cards default to operator Next; optional timed advancement requires an explicit profile value
  and tested bounds." Phase 16's model already says it (`advance` absent = the operator's Next).
  The native page swap is timer-only, so the brief's condition applied: the options went to the
  coordinator before building, and the coordinator chose this one (B) on 2026-11-02, with these
  conditions, each met here:
  1. Without an advance, Next card is the only advance; with one, the timer plus Next.
  2. The wizard says in one sentence that hosts without custom actions need a card time:
     "Blank waits for Next card; playout systems without custom actions need a card time."
     It names no playout client: `check:client-neutral` refuses SPX as product copy, and allowing
     it would need a file outside this row's list. SPX is one such system.
  3. Next card stays on the existing one-state parallel group primitive, with no file outside
     TOUCHES and the pre-approved list.
  4. The last card holds until Out.
  5. Both modes are tested, Next during a timed card included; the native `credits-pages` preset
     and catalog emit are unchanged (`check:catalog-emit` PASS, 528, which builds every
     `endCredits` design; no file under `src/templates/endCredits/` changed).
  The time is the binding's `advance` (2 to 60, `CREDITS_CARD_SECONDS`) and is the production
  page's `Card time (s)` field, so a last-minute change needs no re-import. Blank means Next only.
  A new time applies to the hold under way, counted from its start.
- **Next card is a machine event on a one-state parallel group**, so it reaches the Control tab
  and OGraf hosts as a custom action. A playout road without custom actions (SPX's fixed Continue
  count) cannot press it; such a show sets a card time (Known limits).
- **Paging: sections are cards, whole groups fill them, a long group is fitted on its own card.**
  The brief's overflow rule (row 22's shrink, report past 55%, refuse below 30%) wins over phase
  16's "continue at a name boundary under its role repeated", since the native page swap does not
  split. `CREDITS_OVERFLOW.cards.tall` keeps its value `next-card` (overflow moves whole groups to
  the next card; the node test pins it) and its comment now says the policy above.
- **A heading stays with what follows it**, so a card never ends on a bare heading.
- **Dealing is measured once**: the whole list is laid out at the drawn size and each card's
  bottom is read off it, moved up to the first role's baseline. Then each card is fitted once, so
  the report covers every card, not only the one on air.
- **Updates on air deal again and keep the card index** (clamped), as the roll and still page
  rebuild in place today. Holding a snapshot until the next take is row 24's.
- **Ordinary review scenario.** A new playback renderer, one press and a wizard select. The
  press rides the existing structural machine; no state rule changes.

## Known limits

- On a playout road with no custom actions (SPX Continue), cards without a card time stay on the
  first card. The wizard says so where the seconds are set.
- A single name too wide for 30% is still cut at the window's edge, as on the roll (row 19).
- A card refused for length leaves the artwork on air without that card's credits until Next or a
  shorter list (row 22's limit, per card).
- An update on air re-deals: if the operator inserts groups before the card on air, the card at
  that index shows the new content. Row 24 owns snapshot-until-next-take.
- Row 19 to 22's limits stand.

## Follow-ups

- Row 24: live Sheet updates without replaying motion (snapshot for cards on air), #1973.
- #1955, #1965, #1969 stand.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-23-build')"

After a revert the wizard no longer offers Cards. A graphic saved as cards in between builds the
editable roll of its one list field again, with Scroll speed and without Next card, as row 19
built every playback it did not render.
