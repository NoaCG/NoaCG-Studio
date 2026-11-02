# Phase 24: Apply linked credits and multiline updates without replaying motion

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-14: "Sheet changes update declared imported credits, ticker and editable multiline-text fields
  through existing source/data bindings; adapter mapping, failure, empty data, pause/reconnect,
  closed-page delivery and each existing/selected playback update policy are proven. No AI per
  refresh."
- AC-24: "Use the existing ticker renderer and shared source bindings: replace/reorder/delete
  messages while moving, change speed only, empty then repopulate, and reopen/reconnect. Assert no
  unintended blank interval or entrance replay for nonempty updates; empty content intentionally
  clears. Qualify marquee continuity and flip handover at its existing item boundary using
  frame/time observations. A linked multiline SVG field updates without resetting unrelated
  motion. This row does not add a general imported-SVG ticker motion compiler; unsupported moving
  artwork remains an explicit limit."
- Row 24: "Automatic refresh updates prepared credits. Active roll/cards keep their snapshot; newer
  data is indicated off air and next Play/Take uses it. A linked multiline SVG field updates via
  existing source bindings without resetting unrelated animation; test replace, empty, repopulate
  and reconnect with original styling. No new text layout or motion engine. Native ticker
  continuity is test-only qualification in row 25."

Also #1973 (from row 22): prove the still page's take refit when a face lands late, and refit once
per landing.

## Pinned main

Worktree from `7b95dcb7ac5d1976fb0fcd5efd365e89e9e659cc` (PR #1974, row 23). Previous verified
main: that SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on
main all succeeded on it.

## What was there before

Every Sheet road (this page's reader, the published log rows, the closed-page server tick) ends in
the graphic's `update()`, which a preloaded graphic receives on air and off air alike
(docs/PRODUCTION_DATA_PLAN.md §2.6). The styled roll rebuilt its rows on every `update()`, so a
refresh changed the moving list under the viewer. Cards dealt again and kept the card index, so
the card on screen could change content. Rows 21 and 23 handed "snapshot until the next take" to
this row.

## Rules

This changes a state rule (what is on air against what the data says), so it is the Risky
scenario. The rules, as observable lines. They were written with the code, not before it; the
fresh `/so` challenged them on the PR.

1. A take of a styled roll or of cards holds the list field's text as it stands at that moment
   (`noacgCreditsHeld`). Take and Re-take both do this.
2. While a list is held, `update()` never builds rows or deals cards from the field. The rows,
   the card on screen and the cards still to come are the held list's. `noacgCreditsWaiting` is
   true while the field differs from the held list, and false when it is equal again.
3. While a list is held, a new Scroll speed still retimes the running roll from that frame, and a
   new Card time still applies to the hold under way (rows 19 to 23, unchanged).
4. A measure again on air (faces landing: the roll's settle, the cards' deal) uses the held list.
5. Out releases the hold and clears `noacgCreditsWaiting`. The rows are not rebuilt at Out (the
   exit is playing). The next `update()` off air builds from the field.
6. A still page holds nothing: an update on air refits the page in place (the decision below).
7. The legacy editable roll and the fixed-artwork roll keep their existing policies (the editable
   roll rebuilds from the list on `update()`; the artwork roll follows nothing). Their emitted
   bytes are unchanged.
8. The production page's source line says "Newer data shows on the next Take" while (a) a
   graphic on air holds a list (its runtime declares the rule) whose list field is bound to that
   source, and (b) the source's content changed after that graphic's latest Take entry was first
   seen. A new Take entry marks it again; off air it is forgotten; a paused source shows nothing.
   The source's first read is not a change, and a Take entry the log has dropped keeps its mark.

Rules found after coding: none changed. The first mutation round showed that rule 2 has two
layers (the render reads the held list, and `update()` skips the render while held). Only the
first is observable on its own, because a render on air of the held list paints the same rows.

## What changed

- `creditsRoll.ts`:
  - `creditsHeldJs()`: the held list, its waiting flag and three helpers (`creditsHeldList`,
    `creditsHoldList`, `creditsListWaits`), emitted for a styled roll and for cards only.
  - The styled render (`creditsRender`) and the deal (`creditsCardsOf`) read `creditsHeldList()`.
  - The roll's take (`creditsTakeJs(settle, held)`) holds the list before it builds; its settle
    keeps the list it took. `creditsDataUpdated` builds only when nothing is held. Out
    (`stopCreditsRoll`) releases the hold.
  - Cards: the take holds the list after `stopCreditsRoll()`; `creditsDataUpdated` keeps the
    hold rule (`creditsKeepHold`) on air and deals off air.
  - The roll's settle clears its flag in a `finally`.
  - Still page (#1973): `creditsHold` registers at most one refit per landing (`noacgCreditsRefit`);
    the cards' deal does the same.
  - `creditsTakeJs` is shared with the legacy editable roll. Its new `held` parameter is false
    there, so that roll's bytes do not move (PINS pass).
- `contentFormats.ts`: `heldListOnAir(graphic)` (the list field of a graphic whose runtime holds
  its list on air, read from the runtime itself) and `listsWaitingForTake` (rule 8, pure).
- `SourcesLine.tsx`: an optional `onAir` (the live map and the action log). A source line adds
  "· Newer data shows on the next Take" by rule 8; the title names the graphics on air.
- `svg.ts`: unchanged. The update hook that calls `creditsDataUpdated` is the one rows 16 to 23
  emit.

### Approved departure from TOUCHES

Each was asked of the coordinator before editing and approved (2026-11-02):

1. `scripts/imported-credits-model.test.mjs`: the five `ROLE_ABOVE_PINS` roll hashes re-taken,
   and a new node test "row 24: a styled roll keeps the list its take took..." that asserts the
   snapshot rule in those five builds and its absence from the editable and artwork rolls. No other
   pin moved: `PINS` (editable, artwork, three plain drawings), still, cards, role beside and
   catalog emit are unchanged.
2. `e2e/import-svg-credits.spec.ts`: the on-air list writes now follow the snapshot rule.
   - Row 19 walk and row 20 walk: an Update on air leaves the rolling rows as taken (new
     assertion), then Re-take airs the new list with the original layout assertions unchanged.
   - Row 23 cards test 1: the long-card and refused-card lists are written off air (an Out
     first), then taken and turned to. Every assertion on them is unchanged.
   - Row 23 cards test 2: a list written on air keeps the cards taken (new assertion). The
     grow and shrink hold-rule checks now drive a deal of the held list (as a face landing does),
     with the same assertions. A write during a change lands on the taken card (new). The shrink
     during a change still lands on a dealt card. Every card-time assertion is unchanged.
3. `src/components/home/ProductionPage.tsx` line 4090: passes the existing `liveCue` and
   `wireLog` to `SourcesLine` as `onAir`. Nothing else changed.

The emitted js diff for the five role-above roll builds, main to branch, is the same for all five
(html and css unchanged):

```diff
+// The list the take on air took, null off air; whether the holder has a newer one since; and a
+// take measured again when its faces land (creditsSettle), which keeps the list it took.
+var noacgCreditsHeld = null;
+var noacgCreditsWaiting = false;
+var noacgCreditsSettling = false;
+function creditsHeldList() { ... }      // the held list while on air, else the field's
+function creditsHoldList() { ... }      // a take holds the field's list
+function creditsListWaits() { ... }     // after update(): held? and is a newer list waiting?
 ...
-  var text = holder ? holder.textContent : '';
+  var text = creditsHeldList();
 ...
 function stopCreditsRoll() {
   if (noacgCreditsTween) noacgCreditsTween.kill();
   noacgCreditsTween = null;
+  noacgCreditsHeld = null;
+  noacgCreditsWaiting = false;
 }
 ...
   noacgCreditsTween = null;
+  creditsHoldList();
   var built = creditsRender();
 ...
 function creditsDataUpdated() {
-  creditsRender();
+  // A roll on air keeps the list it took (creditsHeldList); a new list waits for the next take.
+  if (!creditsListWaits()) creditsRender();
```

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Automatic refresh updates prepared credits | `imported-credits-live-data` 1 (production page, stubbed Sheet, credits adapter): after Out, a Sheet change reaches the off-air rows at once. Preview monitors follow every refresh (cards journey: PREVIEW shows the newer card while PROGRAM keeps the taken one) |
| Active roll keeps its snapshot | Same test: a Sheet change while rolling reaches the graphic (`noacgCreditsWaiting` true), the rows stay as taken, the marked roll is the one running and its progress kept growing. Blank page test 3: updates on air, a speed change and the faces landing (settle) all keep the taken list |
| Active cards keep their snapshot | `imported-credits-live-data` 2 (journey): the card on screen stays; Next card turns to the taken list's second card. Test 4 (blank page): a three-card list written on air leaves the two cards taken; a Card time set on air still starts their hold and turns |
| Newer data indicated off air | Journey 1 and 2: the source line reads "· Newer data shows on the next Take", titled "On air: Live roll", and clears on Re-take. Node `imported-text-source` "row 24: a held list waits...": rule 8's fold (first change after the Take, a new Take, off air, not yet read, two graphics) |
| Next Play/Take uses it | Journey 1: Re-take airs the newer list from a new roll. Journey 2: Re-take deals the newer list from its first card. Blank tests 3 and 4: the next `play()` |
| Empty data, repopulate | Journey 1: an emptied tab waits on air as any change does; Re-take clears the list; filled again off air the rows follow, and Take airs them in the drawn looks (role gold 25, name white 35) |
| Pause/reconnect | Journey 1: Pause reads nothing on air; Resume reads, and the change waits. Text journey: Pause holds the field on air; Resume reconnects and the newest value arrives |
| Each existing/selected playback update policy | Roll and cards: above. Still page: test 5, an update on air shows at once, no tween, no travel. Editable and artwork rolls: unchanged policy, row 17's node test 9 plus the new node test (no snapshot rule emitted) and PINS |
| Linked multiline SVG field updates without resetting unrelated motion | `imported-text-live-data`: multiline.svg on the production page, connected through the keyed-values adapter (`Field ID,Label,Value`). Replace, empty (clears), repopulate, Pause and Resume each reach the field on air. The drawn size, fill, family and `x` stay as drawn. A motion running on the drawing's own decoration (a repeating turn) keeps running and its time only grows. The program monitor's entrance count (`data-plays`) stays 1. Node: the emitted `update()` plays, restarts, seeks or kills no motion |
| Original styling | Credits: the drawn looks after empty and repopulate (journey 1). Text: the drawn look after every refresh |
| No new text layout or motion engine | No layout or motion code added; the held list feeds the existing render, deal and fit |
| No AI per refresh | The reader and adapters are row 17's; nothing added on the refresh road. Text node test "no model request" stands |
| Closed-page delivery | Row 17's server tick (node `imported-credits-source` "with every page closed...") is unchanged. Its writes reach the graphic's `update()` like any other, and the rule holds there |
| #1973 refit when a face lands late | `imported-credits-live-data` 6: the drawn layers point at Anton only after the load-time refit has run, so the take is the first layout in the face. When it lands the page is fitted again by the still page's rule (share below 1, last ink within 2 units of the room's end and not past it) |
| #1973 once per landing | Same test: the take plus three updates while the face loads give exactly one fit when it lands |

Mutations, each caught (this worker's queue):

- The render and the deal reading the field instead of the held list: blank-page roll test (faces
  landing) and both cards tests fail (j-0012).
- The settle not keeping the taken list: the roll's faces-landing check fails (j-0013).
- No refit on a late face: #1973 "fitted again" fails (j-0013); no pending flag: "once per
  landing" fails (j-0011).
- Not caught, by design: `update()` building the rows while held (j-0011). The render reads the
  held list, so it paints the same rows; the guard only saves the work (Rules, "found after
  coding").

## Decisions

- **The hold lives in the graphic, not on the page.** Every road that writes a field (this page,
  the published log rows, the closed-page server tick) ends in the graphic's `update()`. A hold on
  the page would miss the other two. The graphic already gets every write on air and off air, so
  it holds the list taken and lets the newest wait. That is "prepare new source content
  automatically" with "no second data owner": the field keeps the newest value, and only what
  plays on air is held.
- **A held-still page updates in place on air** (agreed with the coordinator). This departs from
  the wording of spec.md's Updates bullet, "Static credits use the snapshot on Take". The reading
  chosen: the Take airs the list as it stands, and after that an update refits the page in place.
  Nothing on a still page moves, so an update has nothing to replay, and a last-minute correction
  reaches air at once, which is what the owner asks of credits. Row 22's in-place refit already
  does it, with its tests unchanged.
- **Every update on air waits, the operator's own Update included.** The graphic cannot tell a
  Sheet write from a typed Update, and the spec's rule is "until the next Play/Take". Re-take is
  the existing explicit apply control, and the source line names it. The cue editor keeps its own
  "not on air yet" note for typed edits.
- **The indicator is the source line's, in a few plain words.** "Newer data shows on the next
  Take" sits on the line of the source that changed, beside its status and Pause, only while
  something on air holds an older list. Its title names the graphics.
- **Read the rule from the runtime.** `heldListOnAir` looks for the declared `noacgCreditsHeld`,
  so a graphic saved before this row (which still rebuilds on air) is never said to hold.
- **Ordinary text fields are row 17's.** The multiline field needed no change: `update()` writes
  the field and refits it, and nothing replays. The new spec proves it on the production page.

## Verification on this worker

- Browser, through the job queue: `e2e/imported-credits-live-data.spec.ts` 6/6 and
  `e2e/imported-text-live-data.spec.ts` 1/1 (j-0002 to j-0006), `e2e/import-svg-credits.spec.ts`
  21/21 with the adjusted assertions (j-0009, then the cards tests again, j-0010),
  `e2e/production-views.spec.ts` with the text spec 5/5 (j-0014). Mutations above.
- `node --test scripts/imported-credits-model.test.mjs scripts/imported-credits-source.test.mjs
  scripts/imported-text-source.test.mjs scripts/content-formats.test.mjs`: 95/95.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass (149 tests). `npm run check:catalog-emit`:
  PASS, 528. `check-e2e-protection --changed origin/main`: OK.

## Review rounds

- `/check` review (delegated, 10 findings; 5 fixed, 5 kept):
  - Fixed: a Take before the source's first read made that read look like a change (a mark made
    before the first read now takes it as its own); the marks lived in the line's component, so
    leaving for the Data view lost a waiting note (they now live for the page's life, per
    production and source); a Take entry the 200-line log has dropped re-marked and cleared the
    note (a missing entry now keeps its mark); the cards' deal queued one more deal per update while
    a face loads (one per landing now, as #1973's still page); the settle's flag now clears in a
    `finally`.
  - Kept: the note judges the source's last change, not the list field's (a credits source's tab
    is its list; an edit undone before the Take still says newer data waits, a safe direction).
    Reading the graphic's own `noacgCreditsWaiting` from the program monitor would be more exact,
    but it means changing the monitor and the output report, outside this row's files; the
    runtime flag stays for readers and specs. Leaving air by a snap that suppresses calls keeps the
    hold until the next take (Known limits). The two new spec files are the ones the spec names
    (`+e2e/imported-credits-live-data.spec.ts`, `+e2e/imported-text-live-data.spec.ts`).
    `creditsListWaits` keeps its name: renaming it would move the five roll pins again.
- `/simplify` (inline): nothing applied. The three reads of the list field's text in the runtime
  would fold into one helper only by moving the pinned roll bytes again, and the Sheet stub shared
  by the two new specs would need a helper file outside the row's files.

## Known limits

- A typed line break in an imported SVG text value is painted as a space: the fit ladder reads a
  value as words and wraps it into the drawn room (#1977, filed by this row). The spec forbids a
  new text layout engine, so it is the import's existing behaviour.
- The source line judges by the source's last change, so a page opened while the credits are
  already on air marks from what it first sees: a change before that is not said.
- While a list is held, the overflow report is the held list's. A newer list too long for the
  page is reported by the preview (which follows every write), and on air at the next take.
- On the editor's own preview, a roll that was played keeps its list until played again, as on
  air.
- A route that leaves air without running the exit's calls (a snap with callbacks suppressed)
  keeps the hold until the next take, so the off-air program rows keep the taken list meanwhile;
  the next take airs the newest list either way.
- A drawn ticker still has no motion engine (row 17's limit); native ticker continuity is row 25's.
- Rows 19 to 23's limits stand.

## Follow-ups

- #1977: typed line breaks in imported SVG text (P3).
- Row 25: Sheet delivery failures and native ticker continuity in the browser.
- #1955, #1965, #1969 stand.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-24-build')"

After a revert a styled roll and cards rebuild on every update again, as rows 19 to 23 built
them; the source line no longer says newer data waits. Saved graphics are untouched: a graphic
saved in between keeps the held-list runtime it was built with until it is rebuilt.
