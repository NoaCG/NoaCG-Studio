# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

## Fix #1697: one refused resolve no longer costs a page its per-graphic order

- **Previous verified `main` sha:** this branch began on `cad2f01`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Nothing is migrated or stored, so a revert
  leaves nothing behind.
- **Decision: keep the order where the server has it, and say so where it does not.** Only the
  server's press check (0071) orders a graphic's sends, so no client-side fallback can refuse a
  send that commits late. What put pages on protocol 1 was the rule: any answered error on the
  first resolve switched the page for good, silently. A page that sends now goes there at once only
  on PGRST202, and otherwise after five refusals in a row (a lapsed sign-in, 401, does not count),
  so a blip is asked again and a lasting fault still leaves the page working. Until that verdict
  no press goes by row id: a press waits for the production's resolve within its resend window,
  then goes numbered, or counts as unanswered like the resolve. The wait is one per production, so
  presses resume and take their numbers in the order they were made; a press made while it runs
  joins it, and All out waits before numbering its batches. A press on a production the resolve
  answered as missing asks the resolve once more; still missing, the send is the server's to
  refuse, as before. The slow-event hold-back runs from when the send leaves, after any wait. A page on protocol 1 shows
  "order not guaranteed" under the on-air chip (both operator pages, `UnorderedSends`), and its
  automatic sends already hold (`sendsInOrder`, selectionAir.ts). The renderer's rule is unchanged:
  it sends nothing.
- **Left as is (review):** a page that answered on protocol 2 and later gets PGRST202 (a rolled-back
  migration) keeps asking rather than switch mid-session (D7). A dev build's double mount counts
  each refusal twice; production mounts once.
- **Trap:** a dev build mounts the page's wire twice, so two resolves leave at once: a spec that
  refuses only the first proves nothing (the second rescues the old code). The specs refuse two.
- **Trap:** a press made before the resolve answered used to go by row id, unordered and unmarked.
- **Trap:** fake backends that answer every RPC with `null` (publish-output-setup.spec.ts) make the
  resolve say "no such production"; a wait that ignored that answer held All out until it failed.
- **Trap:** a page that resolved on protocol 2 and then got PGRST202 on a reconnect (PostgREST's
  schema cache reloading after a migration) used to switch protocols mid-session, against D7. It
  now asks again. 42883 no longer counts as proof: it can come from inside the function body.
- **Tests:** `scripts/failed-sends.test.mjs` pins the rule for both askers.
  `e2e/production-controls.spec.ts` (offline) refuses the first resolves and checks the Take goes
  numbered with no mark, holds a press made during an outage, sends a press made while the resolve
  is on its way numbered once it answers, keeps two such presses in order, numbers an All out
  pressed as the resolve lands after the older waiting Take, and shows the mark on PGRST202.
  Each was mutation-tested against the old rule. `e2e/configured/command-sequence.spec.ts`
  refuses the first resolve with a 500, then holds a Take 6 s and presses Out: the late Take is
  left out and never airs. The configured election spec now also expects the mark on protocol 1.

## Row 30, phase E7.1: election read gate, keyed selectors and resolver

- **Repair 1, 2026-10-25** (independent check `checker-p30-pp-p30c-e6f8` on `cfcf65b`: FAIL).
  - *F1, one revision aired with two contents.* A correction that got no answer marked its revision
    as lost and was sent once more, but with the values of whatever read came next at that revision
    number. A source that rewrote revision 3 (284, then 291) could put both on air, and
    `airedValues` could offer values the output might not show (an Update with no answer at the
    aired revision but with other values). Fix in `src/control/selectionAir.ts`: the lost bound
    keeps the values that send carried (`Marks.lostValues`, additive in the kept format). Only
    those values go again. A read of that revision with other values is a duplicate: it is held
    off air ("this count arrived again with other values: press Update to send it") and never
    sent. Two lost
    sends at one revision with different values leave the values unknown, so neither goes again.
    `airedValues` offers nothing while a send at the aired revision with other values may still
    land. Pinned in `scripts/keyed-selection.test.mjs`: the checker's repro as a pure-reducer
    test, the Update case, and the two-sends case, all red on `cfcf65b`. The generated walk now
    rewrites the current revision with other values, most often right after a correction got no
    answer. A new oracle fails when a correction carries a revision's second content while the
    first may air. That walk is red on `cfcf65b` (seed 36), and 80,000 walks
    (`SELECTION_WALKS=80000`) found no counterexample.
  - *Mutation gaps (F4).* The unknown layer decided at its newest revision instead of its oldest
    is now killed by a test that expects the newer revision to go once more. A resolver that
    accepts a negative revision is killed by a new resolver test (the check was already there).
  - *Hold line (F6).* The protocol-1 line is now "a newer count arrived: press Update to send it".
    The Node test and the configured spec that pin it were updated, and nothing else changed.
  - *Not in this repair.* F2 (a layer dropped on the marker's cue after a late-committing Take)
    stays with #1696. The F1 fix does not touch that path.
- **Previous verified `main` sha:** row 29 (E5.2) passed on `89abb9e`. This branch began on
  `be0cea0`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Nothing is migrated and nothing in this build
  writes a selection, so a revert leaves no record behind it. What a reverted page would do with a
  record a LATER build (E7.2a) wrote is the old behaviour: it ignores `ShowCue.selection` and airs
  the cue's prepared values. That is why E7.2a must not land until this row has been deployed.
  `spx-gfx-selection-air` (this browser's aired instances) is read by nothing once reverted.
- **What landed.** The selection contract's formats in `src/model/productionData.ts`
  (`CollectionRecipe`, `CueSelection`, `SELECTION_VERSION`, `selectionReadOnly`, `selectedFields`,
  `collectionFields`, and the write-door predicate `selectionKeep` / `selectionFrozen`);
  `Show.collections` and `ShowCue.selection` in `src/model/shows.ts`; `readCollectionRecipe`,
  `selectionGate`, `entityOf` and `resolveSelection` in `src/control/sourceMapping.ts`; the aired
  instance in the new `src/control/selectionAir.ts`; Take, Update and the refusals wired through
  `graphicVerbs.ts`, `takeBlockers.ts` and the production page; the off-air hold line
  (`SelectionHolds.tsx`); the editor's read-only candidate fields; tests.
- **The contract, old and new.** Persisted, additive optional, each with its own `v: 1`, no
  migration: `Show.collections[]` `{v, id, sourceId, schemaRevision, graphic, from, key: [paths],
  fields: {<field id>: {from, format?, fallback?}}}` and `ShowCue.selection` `{v, recipe, key:
  [parts]}`. A later `v` of either loads (its type allows it) and is read-only. The collection is
  read from the production tree at `external.<sourceId>.<from>` as `{schemaRevision, revision,
  items}`, or that object as JSON text (how a source route writes a value today). Browser storage,
  new: `spx-gfx-selection-air`, per production, `{v: 1, graphics: {<graphic>: instance}}`. No wire,
  route or output payload change: outputs receive resolved values only, so the output reader is
  untouched (no es2017 or bundle change).
- **Decisions.**
  - *Where the recipe lives*: `Show.collections`, not `Show.sources[].config`, so nothing here
    re-stamps a connector's configuration or bumps `configRevision` (#1691 is not reachable from
    this row). A field map entry is E5.1's `RecipeValue`, so formats and fallbacks are the same
    code; a field with no fallback is required.
  - *Identity* is the ordered key paths' values compared as JSON (`7` and `"7"` are two keys), at
    most four parts of at most 64 characters. Duplicates anywhere in the revision invalidate every
    card of it, an item without a key part too; a missing key is `missing`, never another record.
  - *One revision, one record*: `resolveSelection` reads one tree value, so a card cannot mix two
    candidates or two revisions. 5000 items and 512 KiB of text at most, each pinned at its edge.
  - *The read gate*: `selectionGate` says read-only for a later `v` of the selector or the recipe it
    names; unusable otherwise (wrong graphic, unknown recipe, wrong key, or a mapped field that also
    follows a shared binding, which would let a shared value overwrite the cue's own candidate).
    Take, Update, Re-take, a folder's Take, a step, a direct trigger and a timed end all refuse it
    with the reason; the editor is inert for a read-only cue and shows mapped fields read-only.
  - *Both write doors* (the spec's words) are read as the two ways `patchShowChecked` writes (the
    stored list, and the rebased re-run on the freshest copy), plus every undo
    (`rundownHistory.replaceRundown`, personal and team), all asking `selectionFrozen`: recipes
    byte for byte, every surviving cue's selection byte for byte, a later-version cue's every byte
    and never removed, and no cue gaining a selection (a copy needs the writer, E7.2a). A refusal
    re-reads the stored list, so the page never shows an edit that was not saved. The storage
    seam's whole-record put (`upsertShows`, the sync pull) stores what it is given, which is how
    the fixtures write records. A typed value on a mapped field is refused at
    `updateShowCueChecked`, and a binding onto a mapped field at the one binding write.
  - *Air*: Take captures the cue's selector, entity, revision and values at the press (given back
    if the send fails); the layer then follows that selector only. A newer revision is sent as one
    update of every mapped field; an older or equal one is rejected; anything that does not resolve
    holds the picture and says why, which revision is showing and how old it is, until the
    operator decides (Out, Take, or an Update that resolves). An explicit Update moves the aired
    cue to the selection the cue now has only when that whole record resolves.
  - *Recovery*: the instances are kept per production in this browser, so a reload, another
    production and an app restart follow the aired selector. A page that did not take the layer
    (another device) has no instance and sends nothing for it, so it can never retarget air. An
    instance is forgotten when its layer airs another cue, or is off air once the page has read
    what is live.
  - *What would flatten a selector elsewhere is closed*: the published payload's cue list (the
    hosted page and the exported controller) leaves candidate cues out, and a timed end never
    takes one (`nextGraphicCue`), since the server fires those with prepared values.
  - *Unsent*: a candidate's mapped fields are never "unsent" (like a bound field), and its rundown
    row reads the candidate, not the prepared text.
  - *Every other verb that sends a card's values*: Snap and a machine event send the aired
    instance's values for a candidate's fields, or leave those fields out when this page holds no
    instance; ± never moves a candidate's field; the hosted page's Snap goes without data when the
    layer airs a cue it was not given (it used to fall back to the selected sibling's values).
  - *The capture is pending until its send is answered*, so a marker that has not moved yet (the
    slow road, a recovery) cannot make the page forget the card it just took; a failed send gives
    back only its own layer, and only while nothing else wrote it since; a correction whose send
    failed keeps the aired revision, held with "not sent", so the next read sends it again.
  - *A candidate Take or Update waits for a published tree's first read*, and a production not
    loaded yet (a team production before its fetch) forgets no kept instance.
  - *Undo brings back a deleted candidate cue* with its selection: history slices are the
    record's own bytes. Any other write still may not add a selection.
- **Files beyond the phase's list, and why.** `src/control/selectionAir.ts` (the aired instance's
  pure folds, testable in Node; the page rule wants behaviour in `src/control/`),
  `src/control/playoutSession.ts` (its store part), `graphicVerbs.ts`, `takeBlockers.ts`,
  `cueAuto.ts`, `cueDraft.ts` (the air seams that would otherwise take a candidate cue with its
  prepared values), `src/control/hostedControl.ts` (the published cue list),
  `src/control/productionDataSession.ts` (an older tree read answering late is passed over: without
  it a slow read put an older tree back, and PREVIEW with it), `src/model/rundownHistory.ts` (undo
  is a write door), `src/model/productionState.ts` (the instances' storage), `CueEditor.tsx`,
  `CueRundown.tsx`, `SelectionHolds.tsx`, `ProductionPage.tsx` (the wiring), and
  `scripts/graphic-verbs.test.mjs`, `scripts/production-data-session.test.mjs`,
  `e2e/configured/expected-run.json`.
- **Mutation checks**: 98 Node mutations, all red (43 of them added with the review rounds below). The first 39: every contract rule (duplicate keys, a missing
  required field, the optional fallback, a valid empty list, an unknown B borrowing a record, typed
  keys, the field fit, the schema revision, a missing key part), the gate (a later selector, a later
  recipe, a shared binding, another graphic), every bound at its edge, the follow (newer only, the
  hold, its first time, an older revision's hold, the aired cue only), the reconcile, the kept
  format, the door predicate (collections, whole bytes, removal, gaining), the undo, the Take
  blocker, the timed end, the verbs (Take refusal, the overlay, the undo, Update's refusal) and the
  read ordering. The 16 after Assessment A+: the pending capture (made, skipped by reconcile and
  follow, landed only for its own instance, cleared on reload), the scoped undo, the unsent
  correction, the undo that restores a deleted cue, the verbs (landed, Take and Update undo, ±,
  Snap's overlay and omission) and the older arm. In the browser, the read-gate walk passes on
  this machine with the door in `patchShowChecked` and goes red with it removed; the two published
  walks need the configured stack and run in Actions.
- **Check and Assessment A+.** A fresh read-only session mapped every air-path change and answered
  AGREE WITH CORRECTIONS: Snap and events flattening an aired candidate into prepared values, ±
  airing a figure no revision holds, a capture dropped before its marker moved, a cold open
  forgetting kept instances, the undo and the follow's failure bookkeeping, the hosted Snap's
  sibling fallback, an undo of a deleted candidate cue refused for good, an older arm taking a
  candidate, a Take before the published tree's first read, and three faults in the configured
  walk (an out-of-order read that was not one, a wait on the server rather than the page, a check
  that hit the wrong refusal). All are fixed above and pinned.
- **`/check`.** The review's ten candidates: seven fixed (± on a read-only cue's field, a kept
  record reading `null`, a false hold judged from an unread published tree, the timed end's note
  naming a candidate cue as gone, repeated parsing, the page rendering on every capture, the
  capture and follow folds living in the page rather than `selectionAir.ts`), one doc comment
  moved, two left (a source whose revision restarts lower is ignored rather than held: E4's
  revisions continue and are never reused, so that is a provider fault the contract's "reject
  older" covers; the overlapping helpers went to simplify). Simplify: one recipe lookup in
  `productionData.ts`, one resolution per candidate cue per render read by the rundown, PREVIEW,
  the editor and the Take refusals, the published-tree rule moved into `selectionAir.ts`
  (`readable`), one arm lookup, the store helpers and `useNow` reused, identical writes skipped, a
  small parse cache. Left as reports: a per-cue "fixed fields" set to replace the `boundOf` marker
  in `unsentNow`, one shared read-only field row in the editor, a per-collection key index, and a
  reference fast path in `selectionFrozen`.
- **The pull request's reviews.** Fifteen rounds of the automated pull request review, every finding
  fixed and pinned:
  a press that lands (or fails) follows the newest tree at once, since a revision that arrived
  while it was pending was passed over and nothing else may come; the follow pass reads what is
  live from the session's own part, never the render's paced copy; a machine event may read a
  candidate's field, never move one, including the aired candidate of a cue deleted while a sibling
  stays; the hosted page greys an action that carries field values while the layer airs a cue it
  was not given; an older revision cannot undo a hold a newer one set; and corrections settle
  against what last landed (`confirmed`), so overlapping sends that fail never leave an unsent
  revision recorded as aired, and a capture restored after an overlapping failed press comes back
  settled (two failed presses go back to the last settled capture, not the first failed one); the
  newest revision judged (`seen`) bounds what is sent, and a read with no revision does not lower
  it; a failed correction superseded by a newer one out changes nothing, and one failing after a
  newer revision held the card keeps that bound and that hold. A failed correction is retried at
  the next read, never at once, so a lasting outage cannot start a retry storm; the "not sent"
  hold says so meanwhile. The configured walk's "no Take, advance or reset" check first counted markers and status
  rows (the output's own rows during the outage, reload and restart); it now counts the commands
  that move a card (`play`, `stop`, `next`, `snap`, `event`) and lists them on failure.
  Round eight: a revision that moves only the collection writes no row, so a published page never
  heard it; while a cue has a selection the page now reads the tree every 5 s
  (`productionDataSession.poll`, `CANDIDATE_READ_MS`), and the configured walk ends on such a
  write. A correction whose update a later press skipped or superseded no longer counts as landed
  (`followAired` reads the verb's answer for its own graphic). Mutations: the poll's cadence, the
  poll reading without a key, and the landed check ignoring an overtaken update, each red.
  Round nine: the same holds for a press. A candidate Take or Update whose graphic a later press
  skipped or superseded gives its capture back rather than landing it; one pressed again after
  it lands. One predicate, `reachedOutput`, sits beside `leftAlone` in `src/control/liveCue.ts`
  (an extra file, chosen so the verbs need no resolver import) and serves both roads. Mutations:
  Take and Update each landing regardless, and the predicate ignoring `superseded`, each red.
  Round ten: a page whose session was disposed writes no selection (`SelectionAirIo.alive`, the
  session's own `alive`), so a late answer cannot overwrite what a reopened page of the
  production captured; and a capture restored after a failed replacement Take, whose correction
  was still out when it was displaced, goes back to what last landed, so the follow sends that
  correction again. Mutations: the write ignoring `alive`, the restore keeping the unsettled
  revision, and the restore keeping its `seen` bound, each red.
  Round eleven: the exported controller (`controller.html`) and the SPX rundown copied every cue's
  prepared values, so a candidate cue (a later-version one included) became an ordinary cue
  there. One predicate, `preparedCue` in `productionData.ts`, now leaves such cues out of the
  hosted page, the controller and the SPX rundown (`src/export/showExport.ts`, an extra file),
  and the SPX fallback to pool entries is skipped when cues were left out. A re-read of the aired
  revision clears a hold only when nothing newer was judged. The poll asks at each tick whether
  anything follows a candidate (`followsCandidates`: an authored selection, or a captured
  instance still on air after its cue was deleted). Mutations: the predicate, the hold floor, the
  poll's question and the retained instance, each red in Node. The export wiring is checked by
  the configured read-gate walk, which builds both exports; browser runs on this machine go
  through the job queue, so it is proven by the configured-suite run on the pushed head.
  Round twelve: one helper, `unsettledBack`, brings back an instance whose correction never
  settled as what last landed, on undo of a failed replacement Take and on restoring kept air
  after a reload, so the follow sends that correction again; a newer revision observed since
  keeps its bound, so an older one read out of order is still rejected. Mutations: the bound
  lowered regardless, the restore on reload skipped, and the undo skipping the helper, each red.
  Round thirteen: an explicit Update of the candidate already aired keeps what last landed as
  `confirmed` until it lands (`captureSelection`, `landedSelection`), so a page that went away
  with it unanswered comes back as what the output shows and sends it again; an Update to another
  person starts afresh. Mutations: the kept predecessor, its entity check, and the landing's
  confirmation, each red.
  Round fourteen: a correction that answers while a press of the same candidate is out leaves
  that instance alone (`settleSelection`), so the press's own answer still finds it, ends pending
  and confirms what landed; undone, it goes back to what last landed and the follow sends the
  newest revision again. Mutation: settling over a pending press, red.
  Round fifteen (a regression of round thirteen): a later Update failing while an earlier one is
  out brought the earlier capture back through `unsettledBack` as a copy, so its own answer no
  longer found it and the layer stayed pending. An unanswered capture now comes back as itself;
  only an answered or settled one is rolled back. Mutation: the undo rolling back a pending
  capture, red.
- **The rewrite of `selectionAir.ts` (after round sixteen).** The coordinator asked for a fresh
  read-only `/so` on `selectionAir.ts` alone before any further patch. Verdict: AGREE WITH
  CORRECTIONS, REWRITE. The module never stored what the output shows; it rebuilt it from
  press-time snapshots, object identity and three module-level sets, and every round was a case
  where that rebuild went wrong. It found D1 (two overlapping Updates and a reload trusted the
  newer one as aired, the open round-16 finding), D2 (a reload with an unanswered Update to
  another person restored that person as aired), D3 (a send that landed under a failed press was
  thrown away), D4 (a press could lower the bound), D5 (a hold the aired revision set never ended
  when it read well again) and D6 (send order assumed, not stated).
  *The new shape:* a layer records `onAir`, the landed send with the highest number (every send
  is numbered in press order and seqSend.ts skips a press older than one applied, so the highest
  landed is what airs), and `out`, the unanswered sends in order. What the page believes is the
  newest send out, or `onAir`; an entity's bound is derived from what airs, what is out and the
  newest revision a hold judged (`heldAt`), so a failed send gives back exactly what it raised.
  One reducer (`reduceSelection`) takes a press, an answer or a follow. A reload with a press to
  another cue or person unanswered is `unknown`: held, nothing sent, until the marker names a cue
  only one candidate could be (at its oldest revision, so the follow resends anything newer) or
  an operator press lands. The kept format is v2 (v1 never left this branch). The page's doors
  are unchanged; three reads moved to `airedOf` (`ProductionPage.tsx` `airedCandidate`,
  `airedCandidateFields`; `SelectionHolds.tsx`). Two pinned behaviours changed on purpose: D2
  (now held as unknown) and D3 (the landed send is what airs).
  *Evidence:* every earlier scenario ported to the event API and passing; 4000 seeded walks of
  20 events (Takes, Updates to the same or another person, a cue without a selection, answers
  landing, failing or skipped in any order, new and out-of-order reads, reloads whose sends the
  server may or may not have applied), checked after every step against a model of the server
  (I1 what is recorded as on air is what the page was told landed, or after a reload what truly
  airs; I4 a correction only for the entity the output shows, never while a press is out; I5 with
  nothing out, the output's entity), ending settled, with every kind of event and state reached
  at least 50 times. The walks found two defects in the first draft, both fixed: a second reload
  while unknown dropped the earlier candidates, and the marker deciding among sends for one
  person took the newest revision rather than the oldest. 24 mutations of the reducer, each red;
  three that first survived were a redundant check and a wrong hold-clearing (both removed) and
  an untested case (pinned: a press that fails after a hold keeps what the hold judged).
  *Known limit:* after a reload that lost a correction's answer, while the tree does not
  resolve, the hold names the last revision known to have landed although the output may show a
  newer one of the same person; the picture is held either way, and the first good read resends.
  *Assessment A+ on the rewrite (a fresh read-only session): FAIL*, fixed in the next commits.
  (1) A candidate's bound and hold were keyed by cue and entity only, so switching the card to
  another recipe for the same key (preliminary to official) inherited the old source's revisions:
  a target now carries its recipe's identity (id, source, schema revision, leaf) and the marks
  are keyed by it; a recipe changed under a captured selector holds. (2) A reload with an Update
  to another recipe unanswered kept the old recipe and could send its values: now unknown. (3) A
  reload with the same cue taken without a selection unanswered re-adopted the old candidate:
  such a take is remembered (`plains`), and a marker naming that cue keeps the layer unknown. (6)
  A hold a revision set never ended when that same revision read well; now it ends and is sent.
  (7) A layer the marker decides follows in the same pass. (8) The unknown hold line names the
  graphic, not a guessed candidate, and every candidate's fields stay protected (`selections`).
  (4) The walk now switches the card between two recipes, takes the same cue without a
  selection, fails when a candidate on the marker's cue is forgotten, and holds I1 only to what
  truly airs after a reload. Also from the automated review: send numbers were per layer and
  restarted when a layer was removed and taken again, so a late answer could settle a new press;
  they are now minted once per page (`mintSend`). (5) is not this PR's: `graphicVerbs.ts` leaves
  the live-cue marker where it was when a later press overtook an earlier one (`pressedAgain`)
  and that later press then fails, so the marker names a cue that no longer airs; this is on
  `main` for every graphic, and here it makes the layer stop following (it sends nothing
  wrong). Reported to the coordinator with a proposed patch; not widened into this PR.
  Mutations of the reducer: 33, each red, including the two the assessment showed the earlier
  walk missed (a follow forgetting a layer, a reload forgetting a known layer).
  *Re-assessment on 127a69b: FAIL*, every earlier fix confirmed, three new findings fixed:
  (1) a reload dropped the sends still out for the candidate on air, so the bound fell back and
  an older revision could go out over one that had aired; such a send's revision is now kept
  (`lostAt`): nothing older is sent, it is sent once more, and it stays until a send at or above
  it lands (the walk then found the first draft dropped it on the next correction, and on a
  press). The same holds for a marker decision. (2) After an in-app reopen a send of the page
  that went away can still reach the server inside its resend window; a restored layer with
  lost sends now waits `SETTLE_MS` (twice the resend window plus the attempt timeout) before it
  decides or sends anything, and the page runs one follow when that ends. (3) Field protection
  missed a press still out while the marker named the previous cue; the rule moved into the
  module (`protectedSelections`) and protects every candidate the layer may show while a press
  is out, unknown or settling. (4) On the published fast road the marker moves at the press and
  nothing moves it back when the Take fails, so the layer stops following the candidate that
  still airs: the same fail-safe class as #1696, reported to the coordinator. The walk now leaves
  sends in flight across a reload and lets them reach the server later, lets time pass (past
  the settling window too), drops a field now and then, and its server fails on a correction
  applied over another person or over a newer revision. 41 mutations, each red; the walk alone
  catches each of this round's defect classes.
  From the automated review of 335dd51: a revision held for a missing field, then sent once it
  read well, kept the hold's bound at that revision, so a failed send left no "not sent" hold and
  was never retried; fixed (a failure is "not sent" unless a hold at a newer revision stands).
  *Third assessment on 335dd51: FAIL*, every earlier fix confirmed, two send paths outside the
  reducer could still air another person's values. (F1, F3) Snap and events read the candidate
  the page believes (the newest send out) or, restored, a revision that may trail air: they now
  get a candidate's values only from what airs and only while that is certain (`airedValues`:
  nothing out, not unknown, no lost send above it), else they leave those fields alone; the walk
  now checks that what it offers is exactly what the server's output shows (it found the
  lost-send case at once). (F2) A timed end took the next plain cue on a layer without the layer
  knowing, so a correction sent meanwhile could land on that cue's card: `cueArmEngine.ts` now
  registers that Take through `selectionAired` (an extra file), and the follow waits for its
  answer. (F4) The ordering model holds on protocol 2 only; a page that fell back to protocol 1
  for its life has no per-graphic queue: reported to the coordinator. The SETTLE_MS comment now
  says the server-side tail is closed by the stale and superseded refusals. 47 mutations, each
  red.
  *Protocol 1 (coordinator's ruling):* the general fallback risk predates this PR and is filed
  separately, but the follow sends on its own, so on a page that fell back to protocol 1
  (`askSeqRoad`) it would make that risk happen with nobody pressing anything. The follow now
  sends only on the ordered road (`hostedControl.ts` `sendsInOrder`: a sequence session exists
  for the slug, an extra export); otherwise the layer holds what airs, says off air that a
  newer count arrived and Update sends it, and the operator's own presses still go.
  Pinned in Node, in the walk (a read on protocol 1 must send nothing), and by a fourth
  configured walk that forces the fallback (the resolve answered PGRST202): no correction on
  its own, the hold shown, the operator's Update still airs the newer count (`minTests` 123 to 124).
  48 mutations, each red.
  From the automated review of 2dd893d: Snap and events composed from the ordinary cue the
  marker still named could overwrite a candidate whose Take had reached the output but not been
  answered; `airValues` (graphicVerbs.ts) now leaves out every field the layer protects as well
  as the cue's own candidate fields. Pinned in `scripts/graphic-verbs.test.mjs`, red without it.
  *Fourth assessment on 2dd893d: FAIL*, four findings, all fixed in 76ba41f. (F1) A Take that
  failed with no answer could still commit late, while the layer took it back and sent the old
  card's correction onto the new one. A failed send now says how it failed (graphicVerbs.ts
  `Sent`: `uncertain` when the server did not answer, `stale` when it refused because another
  screen changed the graphic). A press with no answer is treated like a send lost in a reload:
  with the sends before it, it makes the layer settle and, for another card, not know which
  airs, until the marker or a newer press that lands decides. A correction with no answer raises
  the lost-revision bound. The page now follows once more whenever a layer stops settling, not
  only after a load. (F3) A send refused as stale stops the automatic follow for that layer
  (`blocked`, kept across a reload, shown as a hold, no Snap values) until an operator press of
  this page lands: the page then knows the head, and a resend would pass the server's check.
  (F2) ± refused only the edited cue's candidate fields: it now refuses the layer's protected
  fields too, and ± and events ask again after the save wait. (F4) Protection now also comes from
  the field keys captured with each candidate (`protectedFields`), so a recipe changed or removed
  since cannot empty it. The hold line names the revision the output shows (`showing`), not one
  still on its way. The walk now also answers sends with no answer (they may land later) and has
  another screen take a plain card, which the server's per-sender base check refuses for any
  send based before it; it found three of the cases above. 64 reducer and 9 verb mutations, each
  red. The settle timer in ProductionPage has no Node test (it is a timer over `nextSettle`,
  which has one).
  On 063028f: the configured protocol-1 walk failed on CI twice on one commit (a real failure,
  not a flake). It pressed Take on the card already live, and Take on a live card takes it off.
  The hold lines told the operator the same wrong thing; they now say to press Update, and the
  walk presses it. From the automated review of 720de72: a reload decided by the marker dropped
  the candidate's hold, so a revision held for a missing field was never sent once the field came
  back; the decision now keeps the hold. Pinned, red without it.
  *Fifth assessment on 76ba41f: FAIL*, five findings, all fixed. (1) A Take moves this page's
  own marker when it is sent (airState.ts `claimAndApply`, on the fast road), and nothing puts it
  back when the Take does not land (#1696), so the marker could not decide a layer left not
  knowing by that Take: it named the failed card, whose values then went onto the card on air.
  A Take or an Out now tells the layer it moves the marker; when one does not land, the layer
  stops following on its own (`blocked`, shown as "press Update to send it") and an unknown it
  leaves is never decided by the marker (`unknown.pressed`). Both end when a press lands, and a
  reload ends them, since a reopened page reads the marker from the server. The same rule
  covers a later failed Take on a layer a reload left unknown, which the walk found. (2) A
  refusal as stale on any road (event, Snap, ±, Next, a timed end) taught the head without
  blocking the layer: the page's one sender now blocks every live candidate on the graphics the
  refusal names (`staleSelection`; `staleError` names them). (3) An answer the page cannot read
  may follow a press the server applied: it now counts as no answer (`unread`). Rejections that
  never left the page still count as no answer; with (1) that only holds what airs. (4) Out and
  a timed end's Out are presses on their layer, so a correction neither follows them nor
  overtakes them. (5) A recipe's field map and key are part of its identity (`scope`), so a field
  dropped from the map holds the candidate rather than leaving that field at its old count. The
  walk now moves the marker at the press half the time, as the fast road does, and its stale
  refusals go through the same hook as the page's; a layer the page stops following because of
  #1696 is excused there only while it sends nothing. 87 reducer, verb and timed-end mutations,
  each red; 579 gate tests pass.
  From the automated review of 919258b: a press ended its candidate's hold when it was sent, so an
  Update that then failed left a held revision that no later read would send. The hold now ends
  only when the press lands. Pinned, red with the old behaviour.
  *Sixth assessment on 1ed975c: FAIL*, four findings, all fixed. (1) Another screen's Update or
  Take on the same cue reached this page only as frames: the marker stayed, so this page sent its
  captured person back over the other screen's. A command heard from another sender (its stamp,
  livePath.ts `withSender`) on a graphic with a live candidate, pressed after this page's last
  landed press there (`pressedAt`; one pressed before it was overridden, or refused as stale on
  protocol 2), now blocks that layer as a stale refusal does (`foreignSelection`, called from
  ProductionPage `hearCommand`). Server rows and older senders carry no stamp and are left alone.
  (2) A block from a Take or an Out that did not land lasted only until the next follow, which
  dropped the layer on the marker this page had moved, and with it the protection of its fields,
  so Snap or an event on the plain cue sent its own values onto the candidate's card. A layer so
  blocked is no longer dropped or decided by the marker, and every blocked layer protects every
  candidate it holds. The hold now says to take or update the card. (3) A press that landed below
  a revision a hold judged ended the hold while its bound stayed, so that revision never went:
  such a hold now stays. (4) A folder's Outs and All out are presses on their layers too
  (`pressOuts`, in liveCue.ts so Node can load it, an extra file with folderPlayout.ts). The walk
  now has another screen Update the card to another person under the same cue, heard through the
  same hook as the page's; it found the press-time rule (a correction sent before hearing is not
  a press). 14 new mutations, each red, and the earlier sets re-run red; 585 gate tests pass.
  From the automated review of 1ed975c: the settle timer lived in ProductionPage, against this
  directory's rule that a timer deciding what airs is a control module's; it is now
  `watchSettling` in selectionAir.ts, its timers and clock injected, with a Node test (five
  mutations, each red). Its two other findings (a blocked layer dropped on the marker, All out
  not registered) were already fixed in 89314ab.
  From the automated review of 89314ab: a press whose answer came after this page heard another
  screen's newer change ended the block that change set, so the follow wrote over it again. A
  block now keeps the press time of the newest foreign change (`after`), and a landed press ends
  it only if it was sent after both that and the block itself. Pinned, red without each part.
  *Seventh assessment on f29dc54: FAIL*, five findings, all fixed. (1) A block from a Take that did
  not land became a plain stale block when another screen's change or a refusal came too, and the
  follow then dropped the layer on the marker this page had moved: a block now keeps both causes
  (`moved`, `stale`), and the follow returns while `moved` holds (after any settling ends). (2)
  This page's late answer clearing another screen's newer block: fixed in 97a584e. (3) The
  foreign check compared another machine's press time with this page's clock: it now uses only
  this page's clock (when it heard the command), and each command counts once, on whichever road
  came first (ProductionPage `hearCommand` filters by `session.applied`). (4) A duplicated tab
  copies the sessionStorage instance id, so its commands read as this page's own: this page now
  recognises its own echo by the command ids this page load sent (hostedControl.ts `sentHere`, in
  memory only). (5) Value-less commands from a phone or another desk (Next, events, markers)
  blocked the candidate: only an update that writes one of the candidate's fields blocks now; a
  marker that moves makes the follow drop the layer as before. Two pages of one production that
  both follow a candidate still block each other at the next revision, by design: each changed
  the card under the other. A restored layer that did not know what airs now settles again from
  the reload, since sends folded into it may still arrive; the walk found that once its checks no
  longer excused a lost layer. The walk now also checks that while a candidate airs its fields
  stay protected, whatever the marker names, and needs no exception for #1696 any more. The
  `unknown.pressed` flag became redundant with the moved block and is gone. 15 new mutations,
  each red; 589 gate tests pass.
  From the automated review of 97f502e: a Take that did not land while a later one was out left a
  block the later Take could not end once it landed, since it was sent before the failure. The
  two causes now end by their own rule: `moved` holds the newest failed Take's number and any
  later press of this page that lands ends it; `stale` holds when this page last learned of
  another screen's change (refusal or heard command, the latest of them) and only a press sent
  after it ends it. That made the separate `after` time redundant; it is gone. Pinned, each part
  red without it.
  *Eighth assessment on 97f502e: FAIL.* Its findings (1) and (3), a block ended too early or
  kept after a later Take landed, are the review above, fixed in 970b41d. (2) A reopened page never
  heard what another screen did while it was closed, and wrote its restored candidate back over it:
  the log the page reads at boot now goes to the live candidates (sessionWire.ts `history`, an
  extra file; selectionAir.ts `foreignHistory`), and the newest update of a candidate's fields
  there decides. (4) Its own send that committed just after a reload looked like another screen's:
  an update now counts as someone else's only when its values for the candidate's fields are none
  of the candidates the layer holds, so an echo of this page's own send, or another desk sending
  the same values, changes nothing. (5) A clock that steps back delays a block's end until it
  passes again; an Out always ends it: noted, not changed. The walk now writes every update it
  applies into a log the reloaded page reads, and fails without the boot check.
  *Ninth assessment on 50046d8: FAIL.* The boot check ran after the first follow, so a reopened
  page could still send its restored candidate over another screen's change, and the boot log
  cannot say what happened while the page was closed: `hostedControlTail` reads the last 400 event
  ids across every production on the server, and a failed read answers []. *D4, the coordinator's
  ruling (option A):* after a reload, another production and back, or an app restart, a restored
  live candidate holds what airs, shows that off air ("the page reopened: press Update to follow
  again"), and sends nothing on its own until an operator press of this page lands
  (`blocked.reopened`, set by `restored`). This is the spec's hold after a reload and meets AC-3 as
  written: nothing is taken, advanced or reset, the held content and its age are visible, and
  recovered program uses the aired selector. The boot-log check (sessionWire.ts `history`,
  `foreignHistory`) is removed, so sessionWire.ts is back to main's. The configured AC-3 walk now
  asserts, after each reopen, the hold line, that a newer revision does not air on its own and that
  nothing was sent, and only then presses Update and asserts the newer count airs. The pinned
  tests that had a restored layer follow on its own now assert the hold. The coordinator files the
  show-scoped log read (option B) and the global tail's empty-on-failure as issues. The lower
  findings are moot under D4 (a restored layer is held whatever the log says) or recorded: another
  desk following the same candidate at a newer revision blocks this one until Update.
  From the automated review of 333cfe1: a press and another screen's change in one clock tick had
  equal times, so the press's late answer ended the block although it was sent first. A block now
  orders by this page's send numbers, never by the clock: `stale` is the newest number minted when
  the page learned of the change (a fresh one for a heard command or another road's refusal, the
  refused send's own for a layer send), and a press ends it only with a higher number. A reopened
  page's hold is set at 0, below any of its numbers. Pinned, red without it.
  From the clearing assessment of 1886adb (pass with notes, two findings, both fixed): the Update a
  reopen hold asks for takes the cue's current selection, which may be another candidate, and the
  line named neither. The hold line now names the aired key and, when the cue now selects another,
  says "Update would take <key>" (the AC-3 walk asserts both, and that the warning goes once the
  selection is back). It reads the saved cue, so a selection typed but not yet saved is not seen.
  A duplicate answer's head is the current one and may hold another screen's write since: learnt,
  the next press passed as having seen it. From the clearing assessment of 83abe70: a superseded
  answer carries the current head too, and teaching nothing from a duplicate lost an All out's
  off. Both answers now teach only the graphics whose head this page wrote (`by` is its sender);
  the server lets this page's later press over its own earlier one (0071 step 6). Pinned in
  seq-send, each half red without it. A layer this page does not know (restored mid-press) still
  names no key in its hold line: nothing is known to air, and Update says what it takes. A layer refusal's block keeps the refused send's number; sendWith's stale hook also mints a
  fresh one through `staleSelection`, so a press between the two cannot end it.
- **Traps for E7.2a and E7.2b.** *The page hears a published tree change from a row* (`sessionWire`
  on a `src` row) *or from its own 5 s read while a cue has a selection*: a correction that moves
  nothing bound reaches air up to 5 s later. E7.2b may give the page a sooner signal. *The source route writes strings at bound paths only* (migration 0101 refuses anything
  else), so E7.2b writes the collection as JSON text at a leaf, which the resolver reads, and needs
  that leaf to be written although no field binds it. *A published production's corrections are
  sent by the page that took the card*: with that page closed, a correction waits for it. *Two tabs
  of one production in one browser* both follow the kept instances, so a correction is sent twice
  (an absolute update, so harmless) and the last tab to write keeps its copy. *A one-part key*
  (the candidate number alone) passes the reader: E7.2a's writer must require district plus
  candidate. *A team
  production* goes through the same door predicate, but its server save is outside this row.

## Row 29, phase E5.2: Connect, sample, repair and reuse

- **Previous verified `main` sha:** row 28 (E5.1) passed on `8bdec06`. This branch began on
  `fb219ac`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Nothing is migrated. A reverted page stops
  offering connectors in Connect data and writes no recipe; recipes already saved stay in
  `Show.sources[].config.mapping`, and E5.1's evaluator (which stays) keeps reading them. Sample
  rows (`<id>.sample` in `production_source_snapshots`) are read by nothing once reverted and go
  with their production. An agent of this build keeps working against a reverted route: it is told
  no `sample` and never posts one.
- **What landed.** `src/control/connectorReview.ts` (what a sample offers, the proposal, the one
  write with its recipe, repair, the sample read); the connector branch of the Connect review in
  `CueEditor.tsx` (a JSON address, a registered connector in "Use existing content…", the list
  columns, the repair mark, Fill this cue, the provenance in the connected mark, "waits for the next
  read"); `connectConnectorSource` in `src/model/shows.ts`; `op: "sample"` on `/api/data/source`
  and `GET /api/data/feed?as=json` in `api/data/[...path].ts`; the envelope in
  `src/control/externalSource.ts`; the agent's sample in `scripts/external-data-connector.mjs`; the
  connector in the SPX package's notes (`src/export/spxLeftBehind.ts`); tests.
- **The contract, old and new.** Persisted: unchanged shape (E5.1's recipe, now written). Wire, new
  and additive: `op: "sample"` (the page's `{sourceId, asked?}`, the agent's `{configRevision,
  claim, sample}`), `sample: true` on a claim or report answer, and the hosted JSON read. Callers:
  the Connect review and the agent. An agent of the previous build ignores `sample: true`.
- **Decisions.**
  - *Where a sample is kept, without a migration*: a second row of `production_source_snapshots`
    under `<id>.sample`. A source id has no dot, so the fence, the claim and the context (which all
    read the source's own row by its exact id) never see it, and nothing evaluates or applies it.
    The table is service role only and cascades with its production. Any reader that lists a
    production's snapshot rows must filter by source id (the configured spec's helper now does).
  - *The ask*: kept only while an agent holds a live claim (`control_source_reads`, owner
    `agent`, lease not lapsed); the agent hears it beside its next claim renewal or report (within
    about 15 s), posts under its live claim (the post renews it) and only to an ask (409
    `not_asked`), and an ask is given up after a minute. The page waits 45 s, polling every 1.5 s.
    The agent posts what it would send (`sendPaths`), redacted like every report.
  - *The public sample* goes through the feed reader's guard, not the source route: it needs no
    data key, so an unpublished production can map before it publishes, and C4's defences (public
    addresses, every redirect, 10 s, the per-client limit) come with the door. 256 KiB, the source
    route's own cap; never cached, stored or sent a credential. An endpoint answering 401/403 is
    named as needing its agent. A registered source with no agent holding it is read this way too.
  - *No path syntax*: every value is offered under the fewest trailing keys no other value shares
    ("home score"), so the C1/C5 matcher (`proposeMapping`) finds a field titled with those words;
    a key that is a field id (`f2`) is that field's stable key. A list field is offered the
    sample's lists (the one list is its candidate), its record key chosen automatically (`id` or
    `key` when unique, else the first unique key) and its columns picked from the records' keys on a
    line under the field (default: the keys after the record key, as many as a row carries). No
    format or fallback UI: those stay in the recipe for the API; Advanced tree browsing was not
    needed.
  - *The write*: one recipe per source, every bound leaf of the source in it; this graphic's leaves
    read what the review chose, another graphic's keep their stored output, a leaf nobody reads any
    more leaves it. The configuration is rebuilt from known keys only (`v`, `configRevision`,
    `endpoint`, `lists`, `mapping`), so a token or a local destination left in a record is dropped,
    and the recipe is written only when `readSourceRecipe` reads it (finding 1).
  - *Revision fence* (finding 3): the write is fenced on the reused source's configuration as the
    review read it (its JSON), so a replace on a stale review is refused whole, and a later version
    refuses it too. Nothing in this row bumps `configRevision`: a new endpoint is a new source, so
    the recipe is stamped with the source's own revision and never needs re-stamping here.
  - *When a saved recipe first reaches air* (finding 2): never from the sample. A newly connected
    field fills at the agent's next read (its path was never written, so the next receipt, at most
    15 s, evaluates the accepted payload for it; the configured walk pins this); until then the
    field says "waits for the next read". A changed mapping of a path already written reaches air
    with the provider's next changed revision: the database writes an unchanged report only to paths
    never written, and changing that is a migration (out of this row). This departs from row 28's
    note that E5.2 "must make that re-apply happen": the review says "on air at the provider's next
    change" beside such a field, `docs/DATA_API.md` says both cases, and #1679 holds the migration.
  - *Repair*: a bound path the new sample lacks is marked "not in the sample: pick another" and
    keeps its binding (the field keeps its last value; the evaluator holds it) until a pick; a
    proposal never retargets a bound field by itself. "Needs attention" now counts an unmatched or
    ambiguous field only while it follows nothing, so a fully connected review reads 0.
  - *A reconnect keeps what the source already reads*: a leaf the recipe already has keeps its
    output whole (a format, fallback, filter, sort or limit made through the API has no control
    here and is not lost), and a list's columns change only with a pick that fits the list; a pick
    made for another list (the field switched lists) never applies. Only the fields the review shows
    can change a leaf at all: a field the graphic lost, or another graphic's reading of a shared
    leaf, keeps its output and its list. Repair is judged by the input a saved output reads, not
    by the leaf's own name. The columns case was found by the spec, the rest by the pull request's
    review.
  - *The endpoint is non-secret*, stored, synced and sent to the feed reader for a sample; a key in
    its query string is not supported (`docs/DATA_API.md`), and the SPX package writes the address
    without its query anyway.
  - *Fill this cue* is offered for any read (Sheet, feed, connector): it copies what the preview
    shows into the cue's draft, unbound fields only, and connects nothing.
  - *Export*: the SPX package's "What SPX does not carry" names each connector, its endpoint and a
    recipe this build reads (a later one is left out, never printed), and says to register it in
    the new production and start its agent there: the rebind is explicit.
- **Files beyond the phase's list, and why.** `src/control/connectorReview.ts` is new: the writer
  adapter could not live in `productionDataSession.ts` (the live tree, never the show record) or in
  `sourceMapping.ts` (the api imports it, and `shows.ts` would come with it), and `model/` cannot
  import `readSourceRecipe`. `src/control/externalSource.ts` (the envelope), `src/model/shows.ts`
  (the fenced write), `src/export/spxLeftBehind.ts` (AC-4's export), `docs/DATA_API.md` (the wire),
  `e2e/configured/expected-run.json` (one more configured walk).
- **Row 28's test gaps** (finding 4), each pinned in `scripts/source-mapping.test.mjs`: an extra key
  in a filter, a sort, a column, a format or a value refused; `1e400` read as not a number,
  formatted or not; a `+01:75` offset held; `en-US-u-nu-arab` refused; and the route's source-text
  check replaced by a behavioural test (`scripts/connector-sample.test.mjs` drives the real route
  against a stand-in database and reads the writes it hands over). #1671 (finding 5) is untouched:
  this row's UI does not reach the identity path.
- **Mutation checks**: 30 Node mutations (every bound of the review and the route, the recipe check,
  the key rebuild, the fence, the repair, the stamp, the record key, the ask's pending, owner and
  lease checks, the claim check, the size cap, the 401 words, the recipe passed by the route, the
  agent's redaction, `sendPaths` and one-at-a-time, and the five E5.1 gaps), all red; and the
  browser fence (`connectConnectorSource` without its fence turns `e2e/production-api-mapping
  .spec.ts` red).
- **Check and Assessment A.** The review's ten findings: nine fixed (the sample post reads the claim
  and never renews it, so a lapsed lease is never handed out anew; best-effort lookups beside a
  taken claim or report; any refusal of the source falls back to the hosted read; a closed review
  stops asking; fewer lookups; the export's endpoint without its query; a JSON Accept header and the
  256 KiB cap while downloading; concurrent asks share one; dead code), one kept by design (the
  `.sample` row). Simplify: shared `scalarText`, `SEGMENT`, `MAX_SEGMENTS` and
  `readExternalRegistration` instead of copies, structured feed failures (`status`, `tooLarge`)
  instead of matching words, one read and cancel helper and one write in the review. Left as they
  are: a per-kind review adapter and folding `connectConnectorSource` into `connectShowSource`
  (both wider than this row), `LIST_CELLS` beside contentFormats' grammars. Assessment A (a fresh
  read-only session) answered AGREE WITH CORRECTIONS: the re-apply departure (above, #1679), the
  endpoint's query (above) and an unchecked `configRevision` on the agent's sample post (dropped
  from the envelope and the docs) were all corrected.
- **Traps.** *A storage-full Connect* is #1603 and fails on main too. *The production-data spec
  under load*: two of its PROGRAM timing tests failed while mutation runs loaded the machine and
  passed alone; run browser work alone. *Playwright's browser*: this image had `-1243` where the
  repo wants `-1228`, symlinked under `/opt/pw-browsers` (#1647). *A connector registered with no
  field connected is pruned* by any Connect write (`pruneSources`, unchanged from E4.2): register
  one with a field bound, as the docs and the configured walk do.

## Row 28, phase E5.1: the versioned recipe and the target-adapter boundary

- **Previous verified `main` sha:** row 27 (E4.2) passed on `029a114`. This branch began on
  `2cf5268`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Nothing is migrated: a reverted build ignores
  `config.mapping` and projects every bound leaf by identity again, and the recipe stays in
  `Show.sources` untouched (the database never read it). That is the spec's rollback: the recipe
  version is disabled, last values and Fill, manual entry and C1/C5 connections keep working.
- **What landed.** `readSourceRecipe`, `recipeItems` and the recipe branch of `projectSource` in
  `src/control/sourceMapping.ts`; the recipe types (`SourceRecipe`, `RecipeList`, `RecipeValue`,
  `RecipeFormat`) in `src/model/productionData.ts` and `config.mapping` on `ExternalShowSource`;
  the registration carrying the recipe as stored; the route passing it and answering `problems`,
  `held` and `provenance`; tests.
- **The contract, old and new.** Old: a connector's `config` `{v: 1, configRevision, endpoint,
  lists?}`, every bound leaf read by identity. New persisted, additive optional: `config.mapping`
  `{v: 1, sourceId, configRevision, outputs: {<bound leaf>: value | list}}`, a value `{from,
  format?, fallback?}`, a list `{from, id?, where?: {path, equals}, sort?: {by, order}, limit?,
  columns: value[]}`, a format `{kind: 'number', locale, decimals}` or `{kind: 'date', locale,
  timeZone, show: date | time | datetime}`. New wire: a changed report's answer adds `problems`
  (leaf -> what to correct), `held` when nothing was evaluated, and `provenance` (source and
  recipe). Callers: the route (and so the agent); E5.2 writes recipes.
- **Decisions.**
  - *A recipe names bound leaves*, so the binding stays `external.<id>.<leaf>` and the stable field
    ids stay in `Show.bindings`, written once (stored twice they could disagree). A bound leaf the
    recipe does not name reads its own path, so a source with no recipe, or a leaf outside it,
    projects byte for byte as before (row 27's tests unchanged).
  - *All or nothing for the recipe*: an invalid recipe, one made for another source or another
    config revision, or a later version holds every
    bound leaf of the source, identity ones included, with the reason in `held`. No leaf is ever
    written from half a recipe. A recipe `v` above 1 also makes the source read-only for edits
    (`externalReadOnly`), so the page cannot overwrite it.
  - *Strict shape*: every object in a recipe allows only its own keys. That is what keeps it
    declarative (no operator, transform, expression or second predicate can ride along) and free
    of credentials (a `headers` or `token` key is refused, not ignored).
  - *Typed until the cell*: the filter compares typed values (`0` is not `"0"`); a filter that
    matches nothing because the values are of another kind holds (a provider's schema change is a
    correction, not an empty list to air), and so does one whose path no item carries any more
    (a pull request review finding). A number format takes a finite number only, a date
    format a time that states its zone (`Z` or `+hh:mm`), never a bare number (seconds or
    milliseconds would be a guess). A time with no zone is refused because it would read in the machine's zone, and a
    date that does not exist is refused because `Date.parse` rolls 30 February into March.
  - *Deterministic formatting*: the locale must be one the runtime formats
    (`supportedLocalesOf`), never silently another; the zone is always explicit; dates use numeric
    parts and `hourCycle: 'h23'`. The test runs the cases under three machine zones.
  - *The sort* is one key, ascending or descending, with the id always ascending as tie-break (a
    sort needs an id). Keys of mixed kinds have no order and hold. Ids must be unique across the
    whole collection, before the filter; `1` and `"1"` are two ids.
  - *Fallback*: only for a value that is missing or null; zero, false and `""` are values. It is
    literal text that must pass the destination like any value, so a "-" never reaches a number
    field. A list has no fallback, and every item must be a record, so no row is manufactured.
    The evaluator runs only for a changed or unchanged report, so it cannot hide a transport or
    authentication failure.
  - *The target-adapter boundary*: a list output goes through its leaf's registered native adapter
    (`lists`), and any row that adapter marks (`Only the first two cells are used`, `Needs a time
    and a programme`) holds the leaf; then every connected field must take the text
    (`pathValue`). A cell holding the list's own separator holds too (a tab in a ticker line, `|` in
    a schedule row, either in a credits row, whose grammar splits on both), since it would become another cell. A leaf registered as a list takes only a list output: a
    single value there would skip the list's grammar (a schedule line with no `|` airs nothing).
    A record the native list would drop (a first row reading as its pasted header, "Time |
    Programme", or a blank row at either end) holds the leaf: keeping it would change the shared
    adapter Sheets use. A value the formatter itself rounds to zero is written without its sign.
    The identity projection keeps
    ignoring row marks and separators, as it did (a tab in a connector cell splits a ticker line
    there: an issue, not changed here, because that output must stay byte for byte).
  - *Bounds*, each pinned at its edge by a behavioural test: 32 outputs, 8 columns, a limit from 1
    to 500 (no limit: every row), 8 keys per path, 6 decimals, 200 characters of fallback or
    filter text. A 30 000-item collection filtered, sorted, limited and formatted, and one of 30 000
    ties, each well under a second; formatters are made once per format, not per cell.
  - *E7.1's seam*: `recipeItems` returns a list's items in recipe order with identity checked; a
    keyed selector is a separate argument that reads them by id, without rewriting shared bindings.
- **Files beyond the phase's list, and why.** `src/model/productionData.ts` holds the recipe types
  and the read-only gate: `sourceMapping.ts` already imports it at runtime, so the api typecheck
  sees nothing new, while a type import of `shows.ts` would pull the whole page model into it and
  a type in `control/` cannot be imported by `model/`. `src/control/externalSource.ts` carries the
  recipe through the registration. `api/data/[...path].ts` passes it and answers what held.
- **Not in this row**: any UI, `op: "sample"`, keyed selectors, SPX conversion, a migration.
  `productionDataSession` did not need to call the evaluator: no browser reads a connector.
- **Traps for E5.2** (from this row's review). *A new or corrected recipe and an unchanged
  payload*: an unchanged report re-evaluates the accepted payload, but the database writes only
  paths never written, so a recipe saved while the provider is quiet reaches air at the next
  changed read. E5.2's explicit, revision-fenced replace must make that re-apply happen. *The
  revision stamp*: a recipe holds the whole source once its `configRevision` is not the
  registration's, so whatever bumps the revision must re-stamp or review the recipe in the same
  write. Today nothing writes either.
- **Import and rebind**: the recipe's `sourceId` stamp stops a recipe copied onto another source.
  An imported or duplicated production keeps the same ids, so what makes it need an explicit
  rebind is the source's agent registration and data key, held per production by the database
  (row 27), not the recipe. `mapping: null` is no recipe, so clearing one never holds the source.
- **Review fixes in this row**: a number given to a date format held instead of throwing out of
  the route (and then refused outright, from Assessment A); years 0 to 99 are those years; a value rounding to zero is `0.0`, never `-0.0`; a problem
  quotes the row's text rather than a number the adapter's trimming can shift; `held` is answered
  on unchanged reports too. Simplify (no behaviour change): the recipe shares `PATH` with the
  connector grammar and `RECIPE_VERSION` with the read-only gate, formatters are keyed by the
  format object, and the locale and zone verdicts are asked once per runtime. Left as it is: the
  separator check could move beside the row builders in `contentFormats.ts`, outside this row's
  files, and `signDisplay: 'negative'` is not in the api's ES2020 library types.
- **Mutation checks** (on the final code): 74 single mutations of the evaluator, the registration,
  the read-only gate and the route, each run against `scripts/source-mapping.test.mjs` (and
  `scripts/show-fixture-compat.test.mjs` for the last three). 73 turned it red: every bound one
  either way, a filter by `==`, no tie-break, the tie-break applied in the sort's direction, no
  descending, kinds of id compared as values, mixed sort kinds allowed, duplicates allowed
  (string or number), `1` and `"1"` one id, no ids kept for the sort, a non-record item allowed, no limit, null not taking the fallback, falsy values
  taking it, a number format taking text, a non-existent date accepted, the zone's sign flipped or
  bound dropped, a zone-less time parsed, the format's zone or decimals or hour cycle dropped, any
  locale accepted, any zone accepted, a marked row written, a missing adapter read as lines, the
  source id, config revision or key checks dropped, a later version evaluated, an invalid recipe
  evaluating its valid parts, a held recipe reporting nothing unfit, a non-object payload read, a
  missing collection evaluated, a prototype key read as an output, any filter literal, no
  provenance, the read-only gate, the registration or the route dropping the recipe, the kind check and the missing-path check on an
  empty filter, a cleared
  recipe read as invalid, a bare number read as a time, the year fix, the separator check or any of its per-adapter
  separators, a single value written to a list leaf, a record
  the list would drop as its header or a blank end, the zero sign
  fix. One survived
  and is equivalent: a list output with a fallback, which the parser refuses before it is
  evaluated. A first run found five survivors, a later one a sixth (a duplicate number id); three gained tests and one (a fraction of a second
  no format shows) was removed from the code.

## Row 27, phase E4.2: the shared evaluator, /api/data/source, fencing, migration 0101, the installed agent

- **Previous verified `main` sha:** row 26 (E4.1) passed on `b085a14`. This branch began on
  `2180903` (row 25's laptop walk, evidence only, landed after it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0101 is additive and stays applied:
  a reverted build never calls its three functions, so `production_source_snapshots` is read by
  nothing and no connector can write. Stop every agent first (SIGTERM lets its claim go); a
  reverted page drops `external` sources from `Show.sources` the next time it prunes them, and
  their last values stay in the tree. No persisted value needs moving back.
- **What landed.** `src/control/sourceMapping.ts` (the one evaluator, identity projection only);
  the `source` operation in `api/data/[...path].ts` (no new function); migration 0101
  (`production_source_snapshots`, `control_source_claim_by_key`, `control_source_report_by_key`,
  `control_source_context_by_key`, `control_source_registration_refusal`); the agent's sender
  (`createSourceSender`, `--send`, `adopt`, `sendPaths`) in `scripts/external-data-connector.mjs`;
  `ExternalShowSource` in `src/model/shows.ts`; the install, restart and rotation steps in
  `docs/DATA_API.md` ("A trusted JSON agent"); tests (below).
- **The contract, old and new.** Old: `/patch`, `/update`, `/state` unchanged, and no source of
  kind `external`. New wire: `POST /api/data/source` with the data key and `{v: 1, op: claim |
  report | release, sourceId, ...}` (a later `v` is 422). New persisted: a `Show.sources` entry
  `{id, kind: 'external', label, config: {v: 1, configRevision, endpoint, lists?}, paused?}` and the
  snapshot row (`v` 1). A later `v` in either is held read-only: the database answers
  `unsupported`, `readExternalRegistration` answers `readOnly`, `externalReadOnly` refuses edits,
  and the record still loads (`scripts/show-fixture-compat.test.mjs`). Callers: the agent only.
- **Decisions.**
  - *The claim is C2's lease*: `control_source_claim_by_key` calls `control_source_lease` under
    the reader name `agent` (30 s, renewed by every report the owner sends). The epoch is the
    snapshot row's counter, raised whenever the lease hands out a new claim, so the agent cannot
    mint one. The claim answers the accepted revision and provider sequence; the agent `adopt`s
    them, so a restart continues the numbering and an older provider revision stays stale.
  - *The fence is in the database, in one transaction* (the spec's stop rule did not apply): the
    live claim, the current epoch, a v 1 registration with the same config revision and no local
    destination, a revision above the accepted one and a provider sequence not below it. Lock
    order is 0097's (read state, production, snapshot). A registration gone or changed under the
    claim also takes the fence, so a reconnect needs a new claim.
  - *One apply path*: an accepted revision goes through `control_data_apply` as `'api'`, so the
    ingest budget is shared with `/patch` and `/update` and Another system's Pause (0100) holds it
    in `data_pending`, Resume sending the final values once (the configured walk). The source's
    own Pause (`paused` on its entry) refuses application; the agent keeps the revision and offers
    it again, so its Resume applies the latest one once. Both block at the trusted boundary.
  - *The limits* are the report function's constants, each checked before anything is written and
    each refusal named: 256 KiB body (the route) and payload, one accepted revision per source per
    5 s, every row at most 64 KiB, no more rows than the budget has left, an unchanged receipt at
    most every 15 s (ignored, not refused, inside it; a status only when it is news or every 15 s).
  - *Override holds*: a path is written only when its text differs from what this source last
    wrote (the read state's snapshot, as for a Sheet), and a path the production does not bind or
    that 0088's value rules refuse is left out and keeps its snapshot.
  - *Identity projection*: a string, finite number or boolean is its text; null, an object, a
    missing leaf hold the field; a list goes through the adapter its leaf names in the
    registration's `lists` (lines, schedule, credits; standings write two fields from one read, so
    they wait for E5), a record being one row of its values in order; an empty list is "".
    `pathValue` moved here from `sheetSource.ts` (re-exported), so the browser reader, the tick and
    the route resolve a value with one function (pinned by identity in the test).
  - *A local destination is the agent's file's alone* (E4.1 check finding h): `mode` or `caFile` in
    the production's record is refused by the database (`local_refused`), as is a bad `lists` or
    endpoint (`registration`); the database owns registration validity and every such refusal
    takes the fence. `readExternalRegistration` states the same rules for readers.
  - *The claim is renewed every 10 s* (a third of the lease) unless a report renewed it meanwhile,
    so a slow poll or a 60 s backoff never lets the 30 s lease lapse into a claim-and-drop loop (the
    check's finding); a renewal the server did not answer (5xx, 429) keeps the claim.
  - *Waiting as asked*: after a `too_soon` or `budget` refusal the agent holds the revision until the
    `retryMs` the production named, instead of sending it at every read.
  - *No in-process budget on this route*: the database counts the source's rows against the shared
    25, and a refused report must not spend `/patch`'s requests.
  - *`sendPaths`* is the agent's projection (the 2 MiB it may read against the route's 256 KiB),
    applied before the change is judged, so a ticking field outside it is not a revision.
  - *The receipt gap counts from the last receipt taken*, not from the read: the database counts
    its 15 s from its own write, so the agent's gap measured from the read landed a few ms early and
    every other receipt was ignored (found by the configured walk; the E4.1 test that pinned the
    old timing now pins this one).
  - *`--send` is https*, or plain http to this machine only (a local stack). The agent needs no npm
    packages: a clone and Node 22 are the whole install.
- **Files beyond the phase's list, and why.** `src/control/externalSource.ts` (the contract: the
  registration, the envelope, `projectPayload`, the limits), `src/control/contentFormats.ts` (the
  cell fold was quadratic: 200 KB of spaces took 47 s; now a scan, equal to the old regex on 200 000
  random strings, and pinned by a 256 KiB hostile case), `src/control/sheetSource.ts` (`pathValue`
  re-exported from the evaluator), `src/model/productionData.ts` (the `external.` prefix in
  `sourcePrefix`/`isSourcePath`/`sourceIdOf`, so pruning keeps a connector source, and
  `externalReadOnly`), `scripts/source-mapping.test.mjs` (new), `scripts/supabase-advisors.mjs`,
  `supabase/advisor-baseline.json` (187) and `docs/STACK_FRESHNESS.md` (lesson 1: the new table is
  deny-all; its functions are the service role's alone).
- **E4.1 check gaps, pinned here** (`scripts/external-data-connector.test.mjs`, "pinned edges"):
  (a) a real socket to a certificate for `pinned.noacg.invalid`, a name no resolver knows, reached
  only through the pinned address; (b) a declared Content-Length of exactly 2 MiB is read; (c) a
  revision one below the accepted is stale; (d) 403 is denied like 401; (e) stale and invalid
  answers reset the backoff; (f) a credential in an object key is redacted; (g) the receipt goes
  at 15 000 ms, not 14 999; (h) above; (i) row 26's counts corrected (38 tests, 48 mutations, the
  second smoke run 40074390687).
- **Mutation checks** (on the final code). SQL: 35 single mutations of 0101's bodies, each applied in a rolled-back
  transaction on the local stack with the self-check run after it: the revision gap to 4.9 s and
  5.1 s, the receipt gap to 14.8 s and 15.1 s, the payload cap and the row cap one byte either way,
  the budget to 24 and 26, a duplicate revision accepted, an older provider sequence accepted, the
  epoch, the claim and the lease expiry unchecked, the source's Pause ignored, a local destination
  or a v 2 registration accepted, a dotted source id accepted, the paused Resume row not measured, a superseded held field measured, a newer
  sequence from an unchanged read not kept, an unknown list adapter accepted, no fill for a field bound later, a fill while paused, a fill
  moving changed-at, a fill skipping the receipt gap, a v 2 snapshot written, the
  config revision unchecked, a refusal keeping the fence, the claim not raising the epoch, the override overwritten, an unchanged
  report moving changed-at, the apply labelled as an operator, the claim answering revision 0. All
  35 turned it red; the budget at 26 by the apply's own 25-row cap, so the effective budget is still
  25. JavaScript: 39 single mutations of the route, evaluator, contract, model and agent, each
  turning its test red (the body cap either way, a later envelope answered 400, null as "", a list
  with no adapter read as lines, a nested item flattened, prototype keys walked, conflicting field
  forms decided, another prefix of the source evaluated, the old cell regex back, a dotted source id
  accepted in the registration or the envelope, a restart reporting the current revision stale, no deadline on a request to
  the production, shutdown leaving requests running, a local destination accepted, v 2 not read-only,
  standings allowed, a prototype send path, the read-only check inverted, `external` not a source
  path, gaps (a) to (g), adopt keeping the accepted text or ignoring the production's revision, an
  old-epoch report sent, a lost fence kept, a Pause dropping the revision, an old revision offered
  again, `sendPaths` ignored for change detection, the renewal ignoring a recent report, Retry-After
  not waited, a 503 renewal dropping the claim, no release). Four survived a first pass because
  their tests were too weak (an answer that changed on every read hid a re-offer twice; a refusal
  that lifted after one try hid the wait; a prefix test that checked only the writes); each test
  was tightened until it went red.
- **Installed-agent receipt** (cloud worker, 2026-10-24 09:49 to 09:52 UTC, repeating a 09:08 run
  on `4d512a9`; a bare `git clone` of this branch at `4c8f9da` with no `npm ci`, the local stack with every migration through 0101, the
  real route served in Node, the replay server from the command line): run 1 claimed epoch 1 and
  wrote 4 rows (two graphics, two revisions); SIGTERM and restart claimed epoch 2 "continuing after
  revision 2"; SIGKILL and an immediate restart was told "held by another agent" five times, then
  claimed epoch 3 after the lapse, continuing after revision 3; the provider restarted with a new
  token (and certificate) left the old agent failing with nothing written; restarted with the new
  token it claimed epoch 4 and read again (the restarted timeline's revision 1 refused as stale, as
  it should be); the data key rotated on the production drew five 401 answers and no write; the
  agent restarted with the new key waited out the old claim and claimed epoch 5; SIGTERM released
  the lease. Neither credential is in any log. The configured walk repeats this on the dev server.
- **Check findings** (code-review, high; 10): fixed the lease lapsing between slow reads, refused
  reports spending the in-process budget, `sendPaths` applied after the change was judged, a
  dropped report counting as a receipt, a malformed record held read-only, the doubled list of
  adapters, the route projecting an unusable registration, and stray blank lines. Not changed: the
  route fetching the context before the fence (bounded by the poll and the 5 s gap; the fence must
  stay in the locked transaction), and the limits living in SQL beside the route's body cap (the
  database is the authority; `/patch`'s environment override never reached its 25 either).
- **Simplify** (four reviewers): one own-key path walker, `sourcePrefix` and `sourcePaths` from the
  model, `connectedFields` moved beside `pathValue`, the database owning registration validity,
  the wait after `too_soon`, no renewal after a recent report, the split-trim cell fold, unused
  exports and fields dropped, the walk's helpers. Skipped: sharing 0097's fit rules and 0100's
  budget count through new SQL helpers (that means redefining applied live-path functions for no
  behaviour change), one helper for the source-entry lookup in SQL, the remaining quadratic
  `jsonb_merge_patch` in the write loop (bounded by the bound paths, a handful), and a per-cell
  length cap (the 64 KiB row check bounds what airs).
- **Assessment A** (a fresh read-only `/so` session on `7eb4a45`): PASS WITH NOTES, nothing
  blocking. Its note 1 was fixed here: a source id could hold a dot, so source `e1`'s paths
  (`external.e1.`) began every path of a source `e1.x`; a connector source id is now one path
  segment (refused by 0101 at the claim as `registration`, and by the contract). Its other notes
  stand as recorded: concurrency rests on the row locks (0097's order) with no two-writer test; the
  route reads bindings before the lock, and the database re-checks binding and value rules but not
  that every field on a path takes the same form; the 50-commands cap is the apply's own raise (a
  429, nothing kept); and pruning drops an unbound connector source, as it does a Sheet.
- **The automated PR review** (on `2c3dc4e`, P2): after a claim the agent knew the production's
  provider sequence but not its accepted text, so a provider still answering that revision read as
  "came again with other content" and was reported stale at every poll. Fixed: with no accepted
  text, the same revision is sent whole once (the production writes only what differs), then reads
  unchanged; pinned by a test and a mutation. Its second pass (on `9404254`, three P2s), all fixed:
  while Another system is paused, the 64 KiB check now measures the Resume row (the pending tree's
  diff against air with the held `/update` values over it), not this revision alone, so revisions
  held one by one cannot add up past it; an unchanged read's newer provider sequence is kept, so a
  later claim never continues from an older one; and every request to the production has a 10 s
  deadline, its answer included, and shutdown ends those in flight, so a stalled production cannot
  stall the reading. Its third pass (on `3bc9fbd`, one P2), fixed: the Resume row's measure laid
  the held `/update` values over the pending diff, but the apply drops every held field a later
  write names, so a short held value could mask an oversized one; those fields are now dropped
  before measuring, as the apply does. Its fourth pass (on `413f233`, one P2), fixed: the route
  projected a payload only when it changed, so a field bound after the last change stayed empty
  until the provider changed again. Each unchanged receipt now evaluates the accepted payload
  again, and the database writes only paths this source never wrote (so an operator's override of
  an earlier write holds), not while the source is paused, without moving the revision or
  changed-at, and no more than once per 15 s receipt gap. The third configured walk binds a new
  field mid-walk and sees it filled once from the accepted revision.
- **A self-check trap, found by a surviving mutation.** `answer->>'refused' <> 'x'` is NULL, not
  true, when the report is accepted, so a refusal assertion passed silently whenever the function
  accepted instead; other mutations had gone red only because a later state check caught them.
  Every comparison in 0101's self-check is now `is distinct from`.
- **Not done here, and whose.** No UI: the operator does not yet see a connector source in the
  sources line or Connect data, and the Data overview lists no `external.` values; that is E5's
  mapping UI. An old build's page that prunes sources does not know `external.` paths and would
  drop the registration: the route then answers `gone` and writes nothing, the values hold, and the
  next page of this build that writes the source puts it back (a safe failure, recorded rather than
  fixed: old pages reload within the deploy).
- **Traps.**
  - `pkill -f <name>` in a shell whose own command line contains `<name>` kills that shell.
  - The queue's Playwright wants `chromium_headless_shell-1228` and the image has 1243: a symlink
    under `/opt/pw-browsers` (#1647), no repo change.
  - The job queue keeps the caller's environment, so the stack's keys reach a queued configured run.
  - A replay server restarted from the command line makes a new certificate; an agent trusting
    the old one fails TLS rather than reaching the new token's 401 (the walk reuses one).
  - This repository's commit hook refuses Co-Authored-By trailers.

## Row 26, phase E4.1: trusted JSON acquisition (contract, agent, replay server, smoke)

- **Previous verified `main` sha:** row 25 (phase 14) passed on `dda88db`, which is also where
  this branch began.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Nothing calls the new files yet (E4.2 wires
  the sender), so a revert changes no behaviour, storage, persisted format or route.
- **What landed.** `src/control/externalSource.ts` (the `v: 1` config, export/rebind, acceptance
  and schedule, pure), `scripts/external-data-connector.mjs` (the headless agent),
  `scripts/election-replay-server.mjs`, `scripts/replay-smoke.mjs` with the npm script
  `endurance:replay-smoke`, and `scripts/external-data-connector.test.mjs` (38 tests; corrected in row 27 from 36).
- **Supported limits** (the recorded envelope; the config file cannot name any of them):

  | Limit | Default | Moved only by | Envelope |
  | --- | --- | --- | --- |
  | Whole read, redirects and DNS included | 10 s | `NOACG_CONNECTOR_TIMEOUT_MS` | 1 to 30 s |
  | Body read from the provider | 2 MiB | `NOACG_CONNECTOR_MAX_BYTES` | 64 KiB to 8 MiB |
  | Poll interval | 5 s | config `pollMs` | at least 1 s and the provider's `providerMinPollMs` |
  | Backoff after failures | interval doubled per failure, 50 to 100 % jitter | - | capped at 60 s |
  | Retry-After (seconds or a date) | honoured as a floor | - | counted up to 1 hour |
  | Redirects (hosted) | 5 | - | - |
  | Reads in flight per source | 1 | - | no queue of missed reads |
  | "Unchanged" receipts to the sender | at most every 15 s | - | - |

- **Provider assumptions.** HTTPS GET with no body, a JSON answer, optional `Authorization:
  Bearer`. A revision or sequence number at `revisionPath` orders reads: higher is accepted even
  when counts fall (a correction), equal with equal content is unchanged, lower or equal with
  other content is stale. Without `revisionPath` only content is compared, so an unordered
  provider cannot claim recency from arrival time. Event time is read from `eventTimePath` when
  the provider has one; otherwise provider age is unknown. 401 and 403 mean the credential is
  refused. Official Finnish results access, schema and rate expectations remain unverified
  (extensions.md, "Release, failure and completion"); the replay server stands in for them.
- **Decisions.**
  - *Reuse of the C4 guard.* The agent imports `publicAddress` (api/_lib/feedFetch.ts) and
    `addressRefusal` (src/control/feedSource.ts), so the private-address, own-port and
    credential-in-URL rules are one copy. The read loop is not `guardedFetch`: that one hard-codes
    a feed's Accept header and 5 MB cap and cannot add an Authorization header or a certificate
    authority, and changing api/ is E4.2's. The loop keeps its shape: every DNS answer public, the
    connection pinned to the checked address, every redirect checked again.
  - *https only*, in both modes, so a bearer credential never travels in clear text; C4 allows
    http for public feeds, which carry no credential.
  - *The credential goes only to the configured origin*: kept on a same-origin redirect, dropped
    on any other, as `fetch` does.
  - *`local` mode* is the spec's "explicitly configured local agent destination": only the
    configured origin, checked against `caFile` (Node's `ca` option replaces the system
    authorities), so a replay server on 127.0.0.1 is read with TLS validation on and nothing
    outside the configured origin is reachable. It trusts whoever writes the config, as the spec's
    "trusted agent" does. Hosted mode refuses the same loopback server before connecting.
  - *Export and rebind*: the config never holds the secret; `credentialRef` names an environment
    variable, which must be `NOACG_SOURCE_...` so a config cannot send the agent's other secrets
    (a service key, `CRON_SECRET`) to its endpoint. A config is bound only when it says
    `credentialBound: true`, so deleting the flag from an export does not skip the rebind. An
    export copies only known fields and sets `credentialBound: false`; the agent refuses it
    ("rebind") until `bindConnectorCredential` binds this machine's variable.
  - *Accepted revision is the source's own counter*, rising by one per accepted change; the
    provider's number travels as `providerSequence`. `ownerEpoch` is 0 until E4.2's claim.
  - *Invalid and stale reads do not back off*: the provider answered; only denied, refused and
    failed reads count as failures.
  - *The sender seam* receives every report (changed with payload, unchanged at most every 15 s
    without one, every hold and failure); from the command line it writes JSON lines to stdout.
    The credential is redacted once at the seam, so a provider that echoes it cannot pass it on
    and no sender has to remember. A read ended by `stop()` reports nothing.
  - *The replay timeline starts at the first authorized read*, so an agent slow to boot still
    sees step 0; `at(i)` moves it by hand and a fake clock makes it exact.
  - *An unchanged read skips the canonical comparison* when its bytes equal the accepted answer's,
    the common case for a quiet source at 2 MiB every 5 s.
    E4.2 replaces it with `/api/data/source` and the claim, and projects to its 256 KiB body.
  - *Fixtures*: the replay server derives its eight steps at start from the research fixtures
    `results-01/02/03-correction.json` (revision 4 drops candidate `FI2027_02_104`, revision 5 has
    an empty candidate list), so no copy of them was added.
  - *The npm script is `endurance:replay-smoke`*, after the workflow's own example
    `endurance:election`.
  - *Extra file outside the fence:* `.gitignore` gains `endurance-output/`, the folder
    endurance.yml uploads, so a local smoke run leaves the checkout clean.
- **Tests pin behaviour, and were mutation-checked**: 48 single mutations (corrected in row 27 from 43) of the contract, agent
  and server (timeout to 9.999 or 11 s, cap plus or minus one byte, declared length unchecked,
  backoff cap, jitter, doubling, Retry-After ignored or uncapped, poll default, single flight,
  one public DNS answer enough, redirects unchecked, 4 or 6 redirects, connection unpinned,
  credential sent cross-origin, local origin unchecked, export bound, unbound accepted, no
  redaction, server accepting any token, 401 not denied, older or conflicting revision accepted,
  unknown config keys, http, receipt throttle, timeline steps, seam redaction, a log fault
  stopping the polling, deadline and stop confused, the byte-equal shortcut too broad, deep JSON
  crashing, `credentialBound` untyped or defaulting to bound, any variable name accepted as a
  credential, the timeline starting before the first read); every one
  turned the suite red.
- **Endurance smoke:** `endurance.yml` dispatched once on this branch at `113a634`
  (`endurance:replay-smoke`, 2 minutes, local-supabase off): run 40072697365, success, all 13
  checks, 19 reports. The review fixes after it changed the agent and smoke (stop, redaction at
  the seam, timeline start, a 14th check through real DNS); the same smoke passed locally on the
  final code (14 of 14). Corrected in row 27: it WAS dispatched a second time, on the final code:
  run 40074390687.
- **Check findings** (code-review, high; 9 found, 9 verified and fixed): an uncaught fault ending
  the polling, `stop()` reported as a timeout, the smoke reading the agent's output on `exit`
  instead of `close`, the timeline starting before a slow agent's first read, the stdout sender
  unredacted, an export's CA path read before the rebind refusal, `credentialBound` untyped, the
  smoke's hosted check refused only by the port, `--minutes` and `stepMs` unvalidated.
- **Simplify** (four reviewers): applied redaction at the seam, abort reasons instead of a flag,
  failures from the outcome's kind, one export key list, the byte-equal shortcut and older
  revisions checked first, a log that cannot throw, one parse of the export. Skipped: a shared
  argument parser (none exists in scripts/lib; three one-line readers), reusing `getPath` and
  `canonical` from src/model (the contract has no runtime imports), and the private copies of
  `retryAfterMs` and `underSignal` in api/_lib/feedFetch.ts (api/ is E4.2's; feedFetch can import
  `retryAfterMs` from the contract then).
- **Assessment A** (a fresh read-only `/so` session on `458a6f3`): PASS WITH NOTES, nothing
  blocking. Its note 1 was fixed here rather than left to E4.2: a config missing
  `credentialBound` counted as bound, and `credentialRef` could name any variable (a config
  naming a service key would have sent it to its endpoint); now a credential must be
  `NOACG_SOURCE_...` and is bound only when the config says `true`. Its note 2 corrected the
  wording on local mode (above). Its other open item, a dispatched smoke on the final code, is
  the second run below.
- **Traps.**
  - Every `spawn`/`execFileSync` needs `windowsHide: true` (`scripts/windows-hide.test.mjs`).
  - The agent imports the feed guard's TypeScript through `scripts/lib/tsResolve.mjs`, so those
    imports must be dynamic `import()` after it; a static import resolves before the hook exists.
  - `makeTestCertificate` needs `openssl` (present on ubuntu-latest and the cloud image).

## Row 25, phase 14: baseline close-out in software

- **Previous verified `main` sha:** phase 13b passed on main (#1648 at `a56e141`); main was
  `7bb3e64` (configured agent-access quarantined, #1651) when this branch began.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`; reopen #766 by hand if the split guidance is
  reverted. No behaviour, storage key, persisted format, request or marker changes: covers lines,
  comment lines, a compiled rule, docs and evidence.
- **What landed.** The AC-11 rule (`components/playout-behaviour-production-page-lands-verb`,
  through `npm run learn`, scoped to `ProductionPage.tsx`, no line count); the rewritten split
  section and tree bullet of `src/components/home/AGENTS.md`; `playoutSession` (with `storePart`)
  in the control row of `docs/ARCHITECTURE.md` §2; the superseded-for-`liveCue` notes in
  `docs/CLIP_PLAYBACK_PLAN.md` §10 and §17.2; the covers headers; `evidence/rehearsal-automated.md`.
- **Decisions.**
  - *Covers in each spec's header, not a central "page implies its modules" rule*, as the root
    rule on durable checks requires (a flow is "mapped in the spec's own covers header, never in a
    shared list"); the check's review suggested the central rule and was answered with this.
  - *The rule names where code goes, by kind* (a verb, a take refusal, a fold over air, a poll, a
    timer, a lifetime) and what the page keeps (selection, the session hook, the wires, the
    derived view, the render), because no check can tell playout behaviour from view code in a
    React file and D8 withdrew the number.
  - *`src/components/home/AGENTS.md` is hand-written, not compiled* (no "Compiled from" header, no
    rule source), so it was edited directly; the AC-11 rule compiles into
    `src/components/AGENTS.md` and `.claude/rules/src-components-home-productionpage.md`.
  - *`ProductionPage.tsx` (imports): no change needed.* eslint and `tsc --noUnusedLocals` find no
    unused import; every import is used by the page's remaining duties.
  - *The covers gap, measured.* For each moved module, `e2e-affected --list --files <module>` was
    compared with the specs that press its verbs (`verb-take`, `-update`, `-out`, `-next`,
    `-out-all`) or drive `_fakeBridge`. 11 offline specs that pressed verbs and covered
    `ProductionPage.tsx` (by name or by `src/components/{home,save}/**`) did not select
    `graphicVerbs.ts`: playout-baseline, playout-feedback-health, playout-rail-width,
    playout-rundown-feedback, playout-sequence, production-audience, production-chat-intake,
    production-data, production-persistence, public-service, quiz-pilot. Each gains
    `// covers: src/control/{graphicVerbs,verbView,verbDispatch,airState,takeBlockers,cueDraft}.ts`,
    less any module its header already named.
    playout-baseline, playout-rundown-feedback and rundown-history drive the fake Bridge without
    naming it and gain `// covers: src/control/{bridgeWatch,serverVerbs}.ts`. Six specs still press
    Take without selecting the verbs (community-pack-lock, community-packs, import-svg-credits,
    ograf-contract, score-tracker-moments, svg-examples): none covered the page before the split,
    their Take is incidental to what they test, so they are left. Timed cues (`cue-armed`,
    `cue-auto`, `program-auto`) and folders were already mapped.
  - *Comment lines in five `src/control/` modules* (graphicVerbs, serverVerbs, folderPlayout,
    cueArmEngine, productionDataSession) still called `cueView`, `flush`, `resolvedOf` and the
    sender "temporary, until phase 13"; phase 13b kept those names and fills them from
    `cueDraft.ts` and the session, and its notes left the wording to phase 14 (AC-12). Extra files
    outside the fence, comment lines only: the docs must follow the code, and these are the
    module docs a reader meets first. No code line changes (`git diff` shows comment lines only).
  - *Evidence reuse* is recorded in `rehearsal-automated.md` with its material-input comparison:
    nothing under `src/audience/`, `src/model/`, `src/output/`, `api/`, `supabase/` or the
    source readers changed since C7's merge `44bfa89`, so the reader Node results and C7's
    YouTube live smoke stand; every page journey ran again.
- **Check findings** (code-review, high; all verified). Fixed: the rule said all playout state is
  the session's (server ownership and timing are `serverPlayoutStore`'s); the home guidance said
  every verb refuses after the end (All out's clear still goes), that verbs read the `air` part
  (they read the render's copy; folds write the part), and that typing never renders the page
  (renaming a counting cue does); the covers lines repeated modules their headers named; the
  "closed" #766 is "closes". Kept: the evidence-only commits after the material tip (spec §6
  allows them).
- **Simplify:** inline; nothing to change (docs, header lines and comments only).
- **Runs on `5e83e44`:** the full offline suite 15 of 15 (run 40065027495), the whole configured
  suite 124 passed, 0 failed, 3 allowed skips (run 40065025649), chat-intake 9 of 9 locally.
- **Assessment A** (a fresh read-only `/so` session on `5e83e44`): PASS WITH NOTES. Its two
  blocking items were the draft record (filled) and the stale candidate sha (fixed); the rest are
  answered in `rehearsal-automated.md` "Runs".
- **Traps.**
  - `rundown-history.spec.ts` is quarantined (#1649, fixed by #1650, awaiting release), and a PR
    that edits it runs it anyway (the quarantine applies only to unchanged specs). This PR adds a
    covers line to it, so its merge group runs it: the fix is on main, so it should pass, but a
    red there is #1649's signature, not this PR's.
  - `npm run learn` refuses a rule with a date or number in it; the date goes in `--evidence`.
  - The guard hook refuses `Co-Authored-By` trailers in commit messages here.
  - Playwright wants `chromium_headless_shell-1228`; the image has `-1243`. Same symlink as phases
    10 to 13b (#1647); no repo change.
  - A worktree has no `node_modules`; tools resolve the primary checkout's.
- **Left for the laptop helper** (non-gating; `rehearsal-automated.md` "What stays unverified"):
  the perf repeat on `a56e141` (13b) and the final repeat on this phase's merge SHA; the scratch
  CasparCG/Bridge and OBS walk again on this phase's merge SHA. **For the owner:** phase S's
  real-studio receipts, the content trial kit, a live Twitch check.

## Row 24, phase 13b: cueDraft.ts, the `draft` part, final editor subscriptions

- **Previous verified `main` sha:** phase 12 passed on main (#1644 at `69cefde`); this branch
  starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence,
  request, row or marker shape changes; the draft lives only in memory, as the page state did.
- **Decisions.**
  - *The `draft` part* (`session.draft`, `DraftPart | null`, set last, after `log`) holds the cue
    being typed: its id, label, note and values. Whether a save is owed and the 300 ms idle timer
    are `control/cueDraft.ts`'s own: nothing draws them. `createCueDraft(session, io)` is made once
    per session (`useMemo`, as the folder module is); the page's effect `cueDraft.listen(adapters)`
    hears the browser (page hide, tab hidden, the account pausing: save at once; the account asking:
    flush) and its stop saves at once, as the old effect's cleanup did. The session's end saves what
    is owed, drops the idle save, and every later answer and edit changes nothing.
  - *Who subscribes (D12, §7):* `CueEditor` (`useStorePart(draft.part)`, its boxes, headings, folded
    summary and the sound's key, with `data-renders` on its root), `CueRundown` (each row's label,
    note and words), `PlayoutMonitors` (PREVIEW's label and `settleData`, from the `previewCue`,
    `draft` and the page's `settleOf`), and a `DraftView` child in the page for `ServerCueEditor`
    (outside the fence, it takes the text as a prop). The page subscribes to one value through
    `useDrawnDraft`: the edited cue's unsent fields, the on-air cues with any (`unsentNow`) and the
    countdown chip's cue label, compared by value, so a keystroke renders the page only when one of
    them reads differently (the first keystroke into a field that matched air).
  - *No mirror a verb acts on.* The verbs, the timed cues, the server verbs and the folders read the
    part itself at the call (`cueDraft.view`, `cueDraft.label`), after their wait, never a render's
    copy. The page's one remembered value is `useDrawnDraft`'s last answer, kept only to compare;
    what the bar draws from it (the Update dot and title, the rows' amber) is recomputed in every
    render from the part, and Update's enabled state does not depend on the draft. So a Take or
    Update pressed between a keystroke and a render airs the keystroke: it awaits `flush`, which
    starts the save of the newest draft, then reads the part (pinned in Node: "Take waits for the
    flush, then reads what was typed").
  - *The temporary interfaces, mapped.* The modules outside this fence keep their interface names
    (`graphicVerbs.ts`, `serverVerbs.ts`, `cueArmEngine.ts`, `folderPlayout.ts`,
    `useRundownAuthoring.ts`, as phase 11 left `liveCueOf`); the page no longer fills them from its
    own refs: `cueView` is `cueDraft.view` (the part over the newest record), `flush` is
    `cueDraft.flush` then the history's `closeGroup`. `resolvedOf` is not the draft's: it stays the
    render's resolution, which PREVIEW, the timed cues and the folders' Takes read too, so a bound
    field airs the same value whichever of them reads it (moving it alone to the newest tree split
    Take from PREVIEW: the check's review). Old state and refs: `draft`/`draftRef` to the part;
    `draftPending`, `flushTimer` to the module; `editDraft` to `cueDraft.edit(editingCue, patch)`;
    `flushDraft`, `cancelDraft` to `flush`, `cancel`; `retainClosingDraft` and its effect to `listen`
    and the session's end; `cueLabel`'s draft half to `label`; `unsentOf` to `unsent` and
    `unsentNow`; `settleData`, `editingView`, `headingValues`, `setupSummary` to the subscribers
    above; the id-change `cancelDraft` effect to the new session's empty part. `draftOwner` stays
    in the page (the rundown authoring's long-lived writes check it).
  - *Non-mechanical changes,* all listed:
    - the rundown authoring's `setDraft(null)` is `dropDraft`, a `cancel()` one task later: the old
      state cleared at the next render, so `writeRundown`'s flush in the same tick still saved the
      edit and a failed save still stopped the removal. Cancelling at once lost that edit (the
      check's review).
    - leaving a production: the old effect cleanup and the new `listen` stop both save at once; the
      new session's end, one task later, saves again only what is still owed (nothing). A draft of a
      production the page has left is never written through the page's history (now the next
      production's): `writeCue` answers "not saved" and the end saves it directly, where the old
      `flushDraft` answered "nothing to save". Only that session's own timer and closures can call
      it, and the route keys the page by production, so this is only defensive.
    - `cancel` no longer resets "owed" (with no draft nothing is owed, and the next edit owes its
      own); `flush` no longer checks the session (after its end nothing is owed). Both were
      equivalent mutants.
    - the countdown chip's cue label is part of the page's drawn value, so renaming a counting cue
      renders the page per keystroke, as before; a value field never does.
    - the sound is a render function the editor calls with the text it shows (the 13a trap: its key
      reads the picture being typed).
- **Check findings** (code-review, high; all verified against the code). Fixed: the removal's
  draft drop (above); `resolvedOf` back to the render's resolution (above); the editor's headings
  reading the bound map once, not per field. Kept, with the reason: the whole rundown subscribes,
  so a keystroke redraws its rows (the page redrew them before too; a per-row component is a
  larger move than this phase's); `useDrawnDraft`'s closure over the render (one per render, the
  pattern `verbPage` already uses); a draft cleared by a confirmed save renders its subscribers
  from the render's record, which the history handed the page when the store accepted the write,
  before the confirm, so the record already holds the text unless the store confirms before React
  renders that change (then the editor and PREVIEW draw the old text until the next frame; the
  verbs read the same record as the old `cueView` did). The modules outside the fence
  (`graphicVerbs.ts` and the others) still describe `cueView`, `flush` and `resolvedOf` as phase
  13's temporary interfaces; phase 14 (AC-12) rewrites that guidance.
- **Simplify** (four read-only passes: reuse, simplification, efficiency, altitude). Applied: one
  `useCueView(draft, cue)` (in `CueEditor.tsx`) for the editor, PREVIEW and `DraftView`, which
  redraws only when that cue's draft moves, so PREVIEW no longer redraws while another cue is
  typed; one text type (`CueText`, from the part's own shape); the module header naming what the
  page subscribes to and why the page still checks `draftOwner`. Not taken: folding `useDrawnDraft`
  into `usePacedPart` (that hook's selector is a module function that never restarts; this one
  reads the render's inputs, so the two would need a comparator and a latest-ref they do not share);
  moving the removal's drop into `useRundownAuthoring.ts` (outside the fence); a per-row rundown
  subscription (above); `unsentNow` calling `unsentFields` directly (`unsent` is the spec's API).
- **Assessment A+** (a fresh read-only `/so` session on `fbf2261`): PASS WITH NOTES, nothing
  blocking. It compared the old and new draft paths line by line (edit, flush, the synchronous
  saves, blur and tab flushes, undo, the removal's drop, every display), checked StrictMode and the
  unmount, ran the Node files, depcruise and the fence, and 33 mutants of its own (30 caught). Its
  notes, handled: the surviving "save at page hide ignores the account" is now a test; the module
  header no longer says "by construction" for the record read after a confirmed save, and says
  what it relies on (as the old `cueView` did); the configured comment says what it checks; the
  render test also renames the live cue and reads the row's label. Kept: the two near-equivalent
  survivors (the answer's session check, the end resetting "owed"), the StrictMode factor of 2
  (the `cue-unsent` line still catches a page that never renders), and `useDrawnDraft` writing
  refs in render as the page's other refs do.
- **Render counts (§7, AC-7, AC-9 render targets).** New in `e2e/playout-air-contract.spec.ts`,
  timers frozen while ten keys go into the on-air cue: the first keystroke renders the page at most
  once and the nine after it not at all; the editor at most once per key. The dev server runs under
  `React.StrictMode`, which calls a component twice per render, so the spec counts 2 per render.
  Beside the counts: the box, `cue-unsent`, the rundown row and Update show the typed text before
  any save, PREVIEW's `#f0` holds it 200 ms on (it settles at 150, the save comes at 300), and
  Update airs it. `e2e/configured/panel-production-page.spec.ts` gains the panel half: after typing
  into the on-air cue the snapshot still allows `update`. A timing reading moving the page by 0 and
  the clip clock moving stay `e2e/playout-clock.spec.ts`'s (unchanged).
- **Mutation checks.** Browser: the page subscribed to the draft part (fails "the nine keystrokes
  after it do not render the page"); the rundown row reading the record (fails the row); PREVIEW
  reading the record (fails PREVIEW's `#f0`). Node (`scripts/cue-draft.test.mjs`,
  `scripts/playout-session.test.mjs`), 29 mutants: the flush skipped before Take, written twice, the
  idle save kept after the end, nothing saved at the end, unsent never true, never false, a bound
  field counted, the label from the saved cue, a 250 ms delay, the timer not restarted, an answer
  dropping a newer draft, a refused save not owed again, owed after a synchronous save, `view`
  ignoring the newest record, ignoring the draft, reading it for any cue, an edit restarting from
  the record, unsorted group keys, edit and flush ignoring the account, editing after the end, the
  listen stop not saving, hide flushing instead of saving at once, the flush ask ignored, the note
  saved as "", cancel keeping the timer, the history told after the draft is set: 27 caught; the
  two equivalent ones (cancel resetting "owed", flush checking the session) were removed from the
  code rather than kept.
- **Traps.**
  - `scripts/e2e-affected-copy.mjs` scans every `.tsx` with its own tag reader, which reads a generic
    function type (`): <T>(draw: () => T) => T {`) as a tag and then fails on the page's
    `<T,>(value: T)` arrow ("unexpected , in a tag"). CI's Build ran it; the changed-gates run here
    did not. Keep generic type syntax out of `.tsx` return types (`useDrawnDraft` takes a named type).
  - Never run a mutation script against `src/` while a browser job runs: the dev server serves the
    mutants to the running specs. Three unrelated failures here (production-data's quiz Take,
    playout-drills' SPACE, the new render test) came from exactly that and passed on a clean re-run.
  - `data-renders` counts calls, and StrictMode in development calls twice per render.
  - A `useSyncExternalStore` selector cannot sit where the page draws the unsent state: the page's
    one early return comes before it, so the subscription (`useDrawnDraft`) is a hook near the
    session and the value is drawn later in the render.
  - The spec's line numbers (1329-1359, 1654-1671, 2831-2846, 1990-1992) are from `cc3500f2`; on
    `69cefde` the draft was at 1189-1245, `cueView` and `cueLabel` at 1509-1530, `settleData` at
    1701, `unsentOf` and `editDraft` at 2135-2178.
  - Playwright wants `chromium_headless_shell-1228` while the image ships `-1243`; the same symlink
    under `/opt/pw-browsers` as phases 10 to 12 (#1647). Nothing in the repo changed for it.
  - **Extra files:** 47 e2e specs (those whose covers named `CueEditor.tsx` or `graphicVerbs.ts`)
    gain one comment line naming `src/control/cueDraft.ts`. No existing assertion or selector
    changes; two specs gain new assertions (above).
- **Left for the laptop helper:** AC-9's timing repeat on this phase's merge SHA (non-gating).

## Row 23, phase 12: graphicVerbs.ts, verbDispatch.ts, verbView.ts

- **Previous verified `main` sha:** phase 11 passed on main (#1639 at `08389cf`); this branch
  starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence,
  request, row or marker shape changes; the modules hold no state but the bound presses' queue.
- **Decisions.**
  - *Three modules, created or called by the page:* `createGraphicVerbs(session, io, sender,
    page)` once per session (`useMemo` on the session, as the folder module is); `verbView(inputs)`
    once per render; `decideVerb(key, press, view)` at each press. `panelSnapshot(view, facts)` is
    part of `verbView.ts`, as the spec's §2 says.
  - *Two page interfaces, not one.* `verbSender` (what a send needs: slug, show id, PROGRAM and the
    arm engine's `onMarker`, the log line, the arm spec, `applyCommand`, the fast events, the send
    debts, the drawn send state and the note line) is set where `sendVerb` stood, before the page's
    "production not found" return, because the data dispatch effect sends with it while a
    production is still opening. `verbPage` (the rest) is set after the verbs' facts. Both are set
    every render, and each verb reads both once at the press, so a press sends with the render it
    was made from, as the old closures did.
  - *Selection is passed in.* Each verb takes a `VerbSelection` (selected cue and graphic, layer
    live, server cue live, editing cue, editing live, air cue): the page passes `view`, the
    render's. `cueView`, `resolvedOf` and `flush` stay on the page interface as the temporary
    interfaces phase 13 removes.
  - *The mirrors:* the verbs read `liveCue` and `aired` from `verbPage`, which the page fills from
    the render's `usePacedPart` copies (as `takeOffAir` and `airedData` were read before); the
    marker folds write the `air` part through `session.apply` and `moveLiveCue`, as `setLiveCue`
    did.
  - *Browser-only doors through `io`* (`GRAPHIC_VERB_IO` in the page): `sendControlVerbs`, the four
    error readers, `headsSay`, `headsStillOn` (control/hostedControl.ts), `adjustedValue`,
    `movedKeys`, `pressSend` (control/controlModel.ts, which Node cannot load), `nameList`
    (CueRundown), the wall clock and the bound presses' timer. `verbDispatch.ts` takes the verb as a
    plain string: `PlayoutVerb` lives in `components/playoutKeys.ts`, which `control/` does not import.
  - *The panel's offline half.* The inventory asks for the snapshot's `allowed` map against the
    bar's disabled states "read through the existing panel dialog". Offline that dialog only says
    "publish first" (`panel-unpublished`) and shows no snapshot; reading it there would need new UI,
    which this phase may not add. The equivalence is pinned in Node over every state the bar can be
    in (`verb-view`, 500+ states), and the published half stays
    `e2e/configured/panel-production-page.spec.ts` in the configured run. `u` and `n` are pressed
    offline in two new tests in `e2e/live-actions-first.spec.ts`.
  - *Old callbacks, refs and handlers, mapped:* `sendVerb`, `runVerb` to `send`, `run`;
    `takeGraphicCue`, `takeCue` to `takeGraphic`, `take`; `updateLive`, `bumpLive`, `nextLive`,
    `outLive` to `update`, `bump`, `next`, `out` (the page keeps the names as one-line calls with
    `view`); `takeOffAir`, `outAll` to `takeOff`, `allOut`; `fireEvent`, `pressEvent`, `airValues`
    to `event`; `snapTo` to `snap`; `afterBoundPress` and the `boundPresses` ref to the module's
    queue; `onVerb`'s rules to `decideVerb` (the page carries the decision out: selection, staging,
    the walk and `editVerb` stay in the page); the bar's derived facts (`selectedClipUp`,
    `selectedLayerCueId`, `selectedLayerLive`, `airCue`, `editingCue`, `editingIsLive`,
    `selectedCueIsLive`, `selectedCueStaged`, `spaceNext`, `canTake`, `nextMoves`,
    `selectedFolderUp`, `selectedFolderBlocked`, `heldStarted`, `folderSpace`, `folderCanTake`,
    `stepButton`, `takeButton`, `allOutEnabled`) to `verbView`; the panel feed's object to
    `panelSnapshot`. The take refusals (`takeContext`, `takeBlockerFor`, `directBlocker`,
    `stepBlocker`), `folderUp`, `heldStepCue`, `unnamedSlots`, `playbackAbility`, `addressOfItem`,
    `graphicOfCue`, `bridgeDown` and `machineState` moved up the page unchanged, above the view that
    needs them.
  - *Non-mechanical changes,* all listed:
    - after the session's end `send` refuses: nothing is applied here and nothing is sent, and the
      press is told "This production is closed, so nothing was sent." (§5.3's "dispose() refuses
      the next send", deferred to this phase by phase 11). The page's writes a verb makes after a
      wait (a cue's values, the production tree, All out's clear through the Bridge) move nothing
      once the session ended either: the module wraps them once, so a bump, an adjust event or a
      queued bound press cannot move the cue or the tree alone. One exception, on purpose: All out
      pressed before the end still sends its clear of the graphics it named (its targets were
      taken at the press, and a clear can air nothing stale), so leaving the page during the
      Bridge's round trip never leaves a lower third up; its answer moves nothing here and a
      failed clear does not go on to the Bridge. This end rule covers the graphic sends; the server
      verbs (`serverVerb`, phase 5) and the folder runs (phase 10) keep their own rules. The route
      keys the page by production, so this is only the leave-the-page case.
    - `runVerb` is one function for the session, not a `useCallback` keyed on the slug and the
      log's labels, so the data dispatch effect no longer re-runs when only those change. It sends
      what the tree changed since its last send (`diffResolved` against `lastResolved`), so such a
      re-run sent nothing.
    - a caller outside the module reads the page as it stands when it calls, where the old
      closures were the render its caller captured: the data dispatch, a folder run and a timed cue
      send with the newest sender; a One-by-one step's `takeCue`, called after its save wait, takes
      with the newest render (its server verb's rundown, `graphicOf`, `liveCue`); and a removal of
      several graphics checks each one's `liveCue` in the render of that moment, so a graphic
      another operator took off meanwhile gets no Out and one taken meanwhile is taken off. All of
      these read fresher facts; none sends what the operator did not press.
    - the in-flight count's two writes are one `sending(delta)` (`n + 1` never needed the floor).
    - one module clock, `wallClock`, serves the timed cues' engine, the verbs and the wire's 1 s
      tick, which called `Date.now()` inline: with `onVerb`'s and the sender's bodies gone from the
      component, the compiler lint analyses it and reads `Date.now` in a render-built callback as
      called during render.
    - `onVerb` asks `editVerb` first: its keys and the dispatcher's are disjoint, and `editVerb`
      does nothing for a key that is not its own, so the order changes nothing.
    - the held folder's "Everything in ... is on air" refusal is `stepFace`'s own sentence, and a
      server cue's CasparCG-off rule is `casparOffRefusal`, rather than copies of them.
- **Mutation checks** (`scripts/graphic-verbs.test.mjs`, `verb-view`, `verb-dispatch`, plus
  `air-state` and `live-cue` for the two inversions): all 96 caught, including the 13 the
  assessment's survivors suggested (below). Take: no save wait; the draft
  read before the wait; the marker folded before the answer; `leftAlone` dropped; misses cleared on
  a failure; a server take stepping when it did not go. Send: no alive check; an answer after the
  end applied; no arm marker; in-flight never decremented; only the failed batch owed; No output on
  All out; the sender read at the send. Out: `leftAlone` dropped; folded before the answer. All out:
  folders stopped late; server outs not awaited in turn; heads read at the press; `leftAlone`
  dropped; Clearing never cleared; 4 s instead of 5; not paced. Update: no bound overlay; no save
  wait; sent when not live. Bump: base from the cue before air; cue written after the send; bound
  press not queued; bound counted before the save; readiness ignored; a 6 s fallback; a failed press
  holding the next. Next waiting on the save. Event: tree patched when skipped, with `leftAlone`, or
  before the send; air values read before the wait; not queued; the moved figure from the cue.
  Snap: update first; no save wait. `takeOff` when not up. View: Re-take, Update or Next greyed by
  the wrong fact; folder Out ignoring started; TAKE ignoring or overusing the refusal; the Bridge
  ignored; All out ignoring Clearing; unnamed slots asked first; the editor following air unasked;
  a step waiting on the Bridge; the step reading the folder's refusal. Panel: `update` from the
  layer (the wrong button), `take` ignoring `canTake`, a live cue refused, the Bridge always ok.
  Dispatch: `u` mapped to next and `n` to update; `n` ignoring advancing; Re-take on any live
  layer; take-off not staging; take ignoring `canTake`; a folder's repeat firing; its refusal
  silent; its Bridge wait loud; take-cue ignoring air or refusing a take-off; a trigger ignoring the
  Bridge or keeping its folder; H repeating; paste not an edit key; a folder header selected as a
  cue; Pause on any cue; P ignoring the panel's clip; the walk inverted. After the end:
  the Bridge clear, the cue write, the tree write and the bump's cue write each unguarded. **AC-4's
  two inversions:**
  the inverted moves guard (`airState.seedFromResolve`) fails 7 tests; the inverted `leftAlone`
  (answering nothing) fails 5. In the browser, `u` and `n` mapped to nothing in `decideVerb` fail
  both new `live-actions-first` tests.
- **§4.2 rows to tests.** Take graphic, Re-take, Out, All out, Update, ± bump, Next, ⚡ event,
  Snap and the sender: `scripts/graphic-verbs.test.mjs` (held save waits, late, reordered and
  post-end answers; "Take waits for the save, then reads the draft and the bound values as they
  stand after the wait" is the read-after-the-wait test). Panel and keyboard:
  `scripts/verb-dispatch.test.mjs` and `scripts/verb-view.test.mjs`. Take server: phase 5's
  `scripts/server-verbs.test.mjs` (`runAndRecord` is outside this fence); here only its hand-off
  (`take` of a server cue). Folder Take, Out and step: phase 10's `scripts/folder-playout.test.mjs`.
  Timed fire: phase 9's `scripts/cue-arm-engine.test.mjs`. Data dispatch: phase 7's
  `scripts/production-data-session.test.mjs`. The seed's moves guard: phase 11's
  `scripts/air-state.test.mjs`.
- **Assessment A+** (a fresh deciding-tier read-only `/so` session on `c807773`): PASS WITH NOTES,
  nothing blocking. It compared every moved verb, `onVerb` and the bar and panel facts with the base
  line by line, ran the Node files, `tsc`, depcruise and eslint, and 178 mutants of its own (155
  caught, 6 equivalent, 17 surviving where only a test was missing). Its notes, all handled: All
  out's clear refused after the end (now sent, above); the outside callers' fresher reads (listed
  above); the missing tests (now pinned: a One-by-one folder that is up steps, a Take keeps its page
  across the wait, a third bound press waits for the second, a bound key counts from the tree,
  Pause only on a clip, the owed mark after a landed send, No output only with a play, a server Next
  only while up, readiness only for bound events, the moved figure written, the removal reading the
  render, the failure labels, the step face's started); the §4.2 row map (above); the test wording.
  The panel-against-bar sweep in `verb-view` is true by construction now that `disabled` is
  `!allowed`; it guards against a second rule coming back, and the per-state tests pin the rules.
- **Check findings** (code-review, high; all verified against the code). Fixed: All out refused at
  the end cleared through the Bridge; a bump or adjust event whose save wait ended after the end
  wrote the cue or tree; the dispatcher kept a copy of `editVerb`'s keys; a folder decision acted
  on the selection instead of its own folder id; Take read the page twice; `nextMoves` checked the
  selection twice. Simplify (reuse, simplification, efficiency, altitude): the end guard moved to
  one wrapper; `allowed` is computed once and `disabled`, the panel and the dispatcher read it; one
  `clearOne` for Out and the removal; `movedKeys` once per press; one `published` (the sender's);
  the names list and the panel's cue ids built only when read; unused exports dropped. Kept: the
  sender and page as two objects (phase 13 removes the temporary page); rebuilding both every
  render, as `armPage` and `folderPage` are; the direct trigger's Bridge sentence (its home,
  `takeBlockers.directBlocker`, is outside the fence).
- **Traps.**
  - The spec's line numbers (2160-2258, 2960-3305, 3879-3935, 4006-4162, 2756-2830, 3486-3513,
    4173-4210) are from `cc3500f2`; on `08389cf` the sender was at 1889-1978, the verb facts at
    2104-2167 and 2560-2643, the verbs at 2238-2464, events and snap at 2828-2902, `onVerb` at
    2970-3073 and the panel feed at 3076-3124.
  - The queue's shell guard refuses a foreground poll; `node scripts/jobs.mjs wait <id>` is the
    bounded wait.
  - Playwright wants `chromium_headless_shell-1228` while the image ships `-1243`; the same symlink
    under `/opt/pw-browsers` as phases 10 and 11. Nothing in the repo changed for it.
  - The commit hook scans the whole command line for co-author trailer words, a heredoc included.
  - **Extra files:** the 37 e2e specs that phase 11 mapped to `airState.ts` and `sessionWire.ts`
    gain one comment line naming the three new modules, so `e2e-affected` selects them for the
    moved code; `e2e/live-actions-first.spec.ts` gains that line, an import and two tests. No
    assertion or selector changes in any existing test.

## Row 22, phase 11: airState.ts, sessionWire.ts, the `air` and `log` parts (the liveCue move)

- **Previous verified `main` sha:** phase 10 passed on main (#1636 at `40a92d5`); this branch
  starts at `d67d2a6` (production-data-key released from quarantine after it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence,
  request, row or marker shape changes; both parts live only in memory.
- **Decisions.**
  - *The `air` part* (`session.air`, set after `folders`, then `log`) holds the marker
    (`liveCue`), its write count (`moves`), what was aired (`aired`), the monitor's clock memory
    (`clocks`, `speaking`), the commands applied (`commands`) and the boot facts (`reports`,
    `bootReplay`, `bootLive`). One part rather than D4's separate `aired`: the phase names two
    parts, and every reader takes the fields it draws through a selector, so a clock or count
    write renders nothing. The once-set (`createAppliedOnce`) is `session.applied`, one per
    session, not a part: it is mutable memory that nothing draws.
  - *Every write is a named fold in `control/airState.ts`*, applied with `session.apply`:
    `moveLiveCue` (the page's `setLiveCue`, and through it the arm engine's and the folders'),
    `rememberAired`, `programItems` (the page's `applyProgram` and `applySpeakingClocks`),
    `claimAndApply` (`applyCommand`), `seedFromResolve` (the seed block and its moves guard),
    `restoreItems` (`restoreProgram`), `withReports`, `forgetBootReplay`, and the `log` part's
    `logged` and `loggedHere`. No `useState<LiveCueMap>` is left under `components/home/`.
  - *The page draws the parts at React's pace* (`usePacedPart`, a subscription in an effect
    that sets page state, as the `folders` part already is): `liveCue`, `airedData`, `bootLive`
    and the log entries. Read through `useStorePart` they would render synchronously, which is
    what broke `playout-air-contract` S3 for the folders. Why the mirror cannot show a stale
    value the operator acts on: it is set in the same synchronous step as the part (the
    listener runs inside the fold's `set`), so it joins the same React batch as the old
    `setLiveCueState` did and renders at exactly the old moment; everything drawn from it
    (chip, ON AIR rows, Out, Update and Next greying) is the render the old state gave. The
    reads after a wait (`cueOnAirNow`, the history safety check, the arm engine's and the
    folders' `liveCueOf`, the publish flow's `liveCueRef`, the log's event labels through
    `airedRef`) take the render's copy, as the old refs did, so a press, its checks and the
    modules it calls all see the one map that render drew. The folds themselves (and
    `restoreProgram`, which runs only after a render) read the part.
  - *The wire* (`control/sessionWire.ts`) is started by one effect keyed on the session, the
    slug, the backend and the production id, and also stops with the session's end. It reads
    the page through `wirePage` (set every render) for the page's own facts and setters:
    resolve waiting, the resolved facts (heartbeat, stamp, fast events, readers), recovered
    and the machine states, cues, clocks, the arm wire ref, arms state, fire, note, follow and
    command statuses, `hear` (`hearCommand`), the data refresh and the log's row naming.
  - *Phases 9 and 10's interfaces are replaced by the session without touching those modules:*
    `liveCueOf` reads the render's copy of the part and `setLiveCue` is the `moveLiveCue` fold.
    `cueArmEngine.ts` and `folderPlayout.ts` keep their interface names (AC-8's fence does not
    list them); phase 12 can drop them.
  - *Old effects, refs and callbacks, mapped:* `liveCue` state to `air.liveCue`, drawn by
    `usePacedPart`, and `liveCueRef` to the render's copy of it (a getter, which the compiler lint
    accepts where a plain ref handed to the render-time publish call was refused); `liveCueMoves` to
    `air.moves`; `bootLive` state to `air.bootLive`; `airedData` state and `airedRef` to
    `air.aired`; `clockValues`, `speakingValues` refs to `air.clocks`, `air.speaking`;
    `commandsApplied`, `liveReportsRef`, `bootReplayRef` refs to `air.commands`,
    `air.reports`, `air.bootReplay`; the `applied` ref to `session.applied`; `wireLog` state and
    `localLogId` ref to the `log` part; the wire effect (resolve, seed, arm wire, history,
    follow, the 30 s heartbeat, cleanup) to `startSessionWire`; `LOG_HISTORY_SPAN` moved with it
    (400, unchanged). The boot recovery effect, `restoreProgram` as the stage's `onReady`,
    `hearCommand` and `sendVerb` stay in the page and call the folds.
  - *Non-mechanical changes,* all listed:
    - a follow that answers after the wire stopped is unsubscribed at once. The old effect
      assigned `unsubscribe` after its cleanup could run, so a stop during `followControlLog`'s
      await (an unpublish, or a StrictMode remount in development) left that follower running.
      Rows and commands that arrive after the stop now reach nothing.
    - after the session's end every fold is a no-op, so a late command or resolve changes
      nothing and PROGRAM is handed nothing (the old page state still took writes after the
      unmount; the route keys the page by production, so this is only the leave-the-page case).
    - `programItems` takes one `Date.now()` per call where the old loop took one per item; the
      items of one call are applied in the same millisecond, so no clock reads differently.
    - an unpublished send records what it aired and moves the clocks in one write
      (`applyProgram(batch, true)`), where the page set the aired state, then the clock refs.
    - `claimAndApply` hands PROGRAM one batch per call instead of one per item; the stage
      applies a batch item by item, in order, so the commands and `data-plays` are the same.
    - the action log is per session (the old page state lived as long as the page, which the
      route keys by production).
  - *Departure from D11* (defects apart from extraction): the late-follow unsubscribe above is a
    defect fix inside this extraction. It is kept here because the wire's stop is this phase's
    contract (AC-6, "stop"; the switch mid-flight test) and the fix is two lines with no
    operator-visible change while the follow runs.
  - *Deferred to phase 12:* §5.3's "dispose() refuses the next send". `sendVerb` gets no
    `session.alive()` check here: the verbs move in phase 12, and adding it now would change a
    verb this phase must leave alone (AC-2).
- **Check findings** (code-review, high; all verified against the code):
  - fixed: reading the part after a wait made the press's checks and the modules it calls see a
    newer map than the render that decided the press; `liveCueRef` and `airedRef` are the
    render's copies again, as before. The unpublished send wrote the part twice (now once), the
    three PROGRAM folds shared one helper (`foldProgram`), the folders part had its own copy of
    the paced subscription (now `usePacedPart`), and the wire's first request read was dead.
  - kept: the wire reading the page through `wirePage` at each call where the old effect kept the
    closures of the render that started it. Every one it reaches is stable for the page's life
    (`cueLabel`, `eventLabel`, `hearCommand`, `noteMachineState` and the data session are
    `useCallback`/`useMemo` over refs or the session), so the calls are the same. Three
    subscriptions on the `air` part: an unchanged selection bails out in React, and one
    selector per drawn value keeps each one plain. The adapter object rebuilt per render, as
    `armPage` and `folderPage` are.
  - departure from the wording of `src/components/home/AGENTS.md` ("What may NOT move: `liveCue`
    and `selectedCueId`"): the spec's owner decision 1.1.2 moves `liveCue` once, in this phase,
    to one owner (the session); `selectedCueId` stays in the page. That folder guidance is
    rewritten in phase 14 (AC-12) and is outside this phase's fence.
- **Assessment A+** (a fresh deciding-tier read-only `/so` session on `d66529b`): PASS WITH
  NOTES, nothing blocking. It compared every listed behaviour with the base page, ran the Node
  files, `tsc` and depcruise, and 33 mutants of its own (32 caught). Its notes, all handled:
  the surviving mutant (the wire's start not forgetting the boot replay) is now a test;
  `restoreProgram` reads the part (as listed above); the follow fix is named as a departure from
  D11; the refuse-the-next-send item is recorded as deferred; the PR's counts were corrected.
- **Simplify** (four read-only passes: reuse, simplification, efficiency, altitude): applied the
  page's one `logHere` helper for its three log writes; one clock-placement helper and one
  carried-fields read in `programItems`, which also leaves a debate board's memory alone when a
  command moved none of it; `claimAndApply` remembering a batch's commands in one write; the
  wire's IO typed from the real functions (`typeof controlShowBySlug` and so on, type-only), so
  the scripted test is checked against the real API; the adapters passed as the setters
  themselves; a stale "below" comment; an always-true guard. Not taken: a `wire` status part to
  narrow the page adapter (a later phase can, if a part is wanted), and sharing the "is a
  renderer command" rule (its other copies are in files outside the fence).
- **Mutation checks** against `scripts/air-state.test.mjs`, `scripts/session-wire.test.mjs`
  and `scripts/playout-session.test.mjs`: all 39 caught. Inverting the moves guard (12 tests
  fail) and dropping it; applying a duplicate twice; not counting a marker write; replaying the
  rows over a newer command; skipping the aired fold; a command not forgetting the boot replay;
  commands counted once per batch; typing reaching PROGRAM; the seed not setting `bootLive`; the seed
  merging instead of replacing; the baseline keeping the clock stamp; the clock start written
  after; the clock hold written before; a resend erasing the origin; off air keeping the clock; a debate update forwarding the
  plain time; the rebuild keeping clock memory while replaying, dropping the snap, always
  playing, or rebuilding from aired at boot; a silent log line not spending its id; the wire
  reading the request once (not per attempt); the wire keeping a late follow; rows after the
  stop reaching the page; the stop not unsubscribing, keeping the timer or the arm wire; the
  wire not stopped by the session's end; seeding after a stop during the replay; acting on a
  resolve after a stop; a live report keeping the boot replay; a typing row refreshing the
  tree; a heartbeat after the stop; a stood-down arm wire still fed; starting on an ended
  session; the session setting air before folders; one once-set shared by every session; a
  restarted wire not forgetting the old boot replay (the assessor's surviving mutant, now pinned).
- **Traps.**
  - `control/eventLog.ts` cannot be loaded in Node (it imports `./cueAuto` without `.ts`), and it
    is outside the fence, so the log folds take `appendLogEntries` as an argument (`AppendLog`)
    rather than import it. A later phase that may touch it can make it importable.
  - The spec's line numbers (806-828, 907-994, 1013-1034, 1685-1869, 1723-1764, 1896-1921) are
    from `cc3500f2`; on `d67d2a6` the state was at 492 and 597-605, `airedData` at 872-884, the
    clocks and `applyProgram` at 945-1047, `applyCommand` at 1067-1092, the wire at 1626-1840 and
    the rebuild at 1853-1920.
  - The broader browser selection is admitted once per source state; one that fails before any
    test (here the Playwright browser path) spends it. Fix the browser symlink before queueing.
  - Playwright here wants `chromium_headless_shell-1228` while the image ships `-1243`; a symlink
    under `/opt/pw-browsers` (outside the repo) made the queued run start, as in phase 10.
  - **Extra files:** 37 e2e specs gain one comment line naming `airState.ts` and `sessionWire.ts`
    (the specs whose covers named the page or `liveCue.ts`, and the §5.3 air specs), and two
    configured specs' comments name the new homes of `liveCueMoves` and `applyCommand`. No
    assertion or selector changes. No e2e spec patches the moved code's served source.
- **Left for the laptop helper:** AC-9's timing repeat on this phase's merge SHA (non-gating).

## Row 21, phase 10: folderPlayout.ts and the `folders` part

- **Previous verified `main` sha:** phase 9 passed on main (#1634 at `919fbc9`); this branch
  starts at `74cf458` (a quarantine entry after it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence,
  request or marker shape changes; the part lives only in memory.
- **Decisions.**
  - *One module per session, created with it* (`useMemo(() => createFolderPlayout(session,
    FOLDER_IO, () => folderPage.current!), [session])`), registering `stopAll('ended')` with the
    session's end. `folderPage` is set every render beside the folder verbs it replaced; each
    verb reads it once at the press, so the press sees the render it was made from, as the page's
    closures did. Server ownership and `liveCue` are read through getters at each check, as the
    page read `serverPlayout.ownership.get()` and `liveCueRef.current`.
  - *The part* (`session.folders`, set after `arms`) holds `folderSteps`, `takeMisses` and
    `sending`; the page mirrors it into its own state (Traps says why it is not `useStorePart`). *The runs* and their stop flags stay inside
    the module, not in the part: nothing draws them, and a flag must be set synchronously and read
    between members, which a stored immutable value would not give (a departure from the spec's
    "Owns" column, which lists `runs` in the part). `sending` is their drawn face, written in the
    same synchronous step as the run's registration and removal.
  - *Old state and callbacks, mapped:* `folderRuns` (ref) to the module's runs, `running(id)` and
    `stopAll(reason)`; `folderSteps`, `takeMisses`, `sendingFolders` (page state) to the part;
    `clearMisses`, `noteStep` to the module's (the page keeps the names); `runFolder`, `offLate`,
    `takeFolder`, `graphicsOff`, `outFolder`, `stepOff`, `stepFolder` to `take`, `out`, `step`,
    `off`; All out's two lines to `stopAll('all-out')`; `hearCommand`'s misses fold to
    `settleMisses(settle)`.
  - *Temporary interface* (`FolderPage`): `serverVerb`, `takeGraphic` (`takeGraphicCue`), `send`
    (`sendVerb`), `liveCueOf`, `setLiveCue`, `flush` (`flushDraft` and `closeGroup`, awaited), plus
    what the moved code already called: `takeCue` (a step takes its next cue exactly as its own
    TAKE does; moving `takeCue` belongs to phase 12), `note`, `ownership`, the rundown
    (`cues`, `folders`, `members`, `items`, `itemOf`, `graphicOf`, `stepMembers`, `folderName`),
    `takeBlocker`, `stepBlocker` and the All-together `together` rundown. The clock that stamps a
    server take is `io.now` (`performance.now`).
  - *Non-mechanical changes,* all listed:
    - the session's end stops every run (`stopAll('ended')`): nothing more is sent, a member that
      lands after it is not taken back off (§4.1 R3: what the server accepted stands), and the
      run writes no misses and no note. A Take or step whose save wait ends after the session's
      end never registers a run. The old page kept a run sending after the unmount; the route
      keys the page by production, so this is only the leave-the-page case.
    - `folderUp` asks `running(id)` (the module's runs) where it asked `folderRuns.current.has`;
      `sending` is written synchronously now, not at the next render, which only makes the drawn
      value catch up a render sooner.
    - `noteStep` finds the cue's folder in the latest render's rundown, not the calling closure's.
- **Check findings** (code-review, high; all verified against the code):
  - fixed: a step read its memory from the part, not from the render that drew PREVIEW and the
    NEXT mark; it reads the render's again (`FolderPage.folderSteps`). The two identical part
    folds became one helper.
  - kept: the session's end stopping every run without taking late members back off (§3 and §4.1
    R3 ask for it; listed above); `folderPage.current!` before the first full render (no verb or
    `noteStep` can run before it, as with `armPage`); the factory's `onDispose` registration
    inside `useMemo` (a discarded StrictMode instance holds an empty runs map and stops nothing);
    `folderUp` asking both `running(id)` and `sending` (the old ref plus state shape); the page's
    own `cueOnAirNow` beside the module's (the take-cue key and the panel still need it until
    phase 11).
  - reported, not changed: a Play-through folder's late Out calls `serverVerb` with a graphic
    member's null item. Not reachable: a graphic cannot be put in a Play-through folder (pinned
    in `playout-folders`), as before the move.
- **Mutation checks** against `scripts/folder-playout.test.mjs` (a scripted page whose server
  verbs, graphic Takes, sends and save wait answer only when the test says): all 29 caught.
  Dropping the stop flags in `stopAll`; applying a late answer (misses and note after a stop);
  not taking a late Play-through member back off; ignoring `stopped()` in the run; reordering Out's
  server and graphics sends; a step taking before its graphics go off; folding liveCue before the
  answer; ignoring `leftAlone`; skipping the save wait in Take or in step; registering the run
  before the save wait (S3's order); dropping the once-only guard in Take or in step; taking a
  member back off after the session's end; no alive check before a run; the session's end not
  stopping runs; All out not cutting; All out keeping the steps; a stopped step keeping its step;
  Out keeping the step; Out or Take not clearing misses; misses not recorded; the clock rank
  dropped; `sending` never cleared; `clearMisses` writing when nothing moved; `noteStep` for any
  folder; a step going on after its graphics failed to go off; Out not stopping the run. Four of
  them fail by a held send never answering, which cancels the test: still a failure.
- **Verification on this branch.** Node: `folder-playout` 33 and `playout-session` 8 pass, with
  `cue-arm-engine`, `bridge-watch` and `production-data-session` (96 in all). `tsc`, `eslint` on
  the changed files, `npm run depcruise` (no violations) and `gates.mjs run --changed origin/main`
  (103 tests) pass. Browser, through the queue on this cloud machine: `playout-folders` 52/52 and
  `playout-air-contract` 6/6 on the final source (two jobs; in the first, two Play-through tests
  missed ON AIR inside 7 s at twice their usual duration and then passed 3 of 3 each; a folder
  SPACE is dropped silently while the Bridge status is still unanswered, `!folderCanTake`, which
  fits a stalled machine). The configured dispatch (take-behind-out, command-sequence) is
  recorded in the pull request with its run URL and head sha.
- **Assessment A** (fresh read-only `/so` session on `2d0e0ff`): PASS WITH NOTES, nothing
  blocking. AC-2, AC-3, AC-4 and AC-8 pass; it ran depcruise and the two Node files itself. Its
  notes: the stale "reads it with `useStorePart`" sentence here (fixed), the `folderPage.current`
  read (as `armPage`), and the unreachable Play-through `itemOf(m)!` (reported above).
- **S3 kept.** A press registers its run only after the save wait, as phase 1 recorded (refuted
  there); a Node test pins that order.
- **Traps.**
  - The spec's line numbers (3515-3674, 2954-2980) are from `cc3500f2`; on `74cf458` the state was
    at 473-488, `clearMisses`/`noteStep` at 2492-2518, All out's stop at 2696-2701, `folderUp` at
    2840 and the verbs at 2928-3088. A seventh writer of `takeMisses` sat in `hearCommand`
    (1099-1102, a failed send that landed after all), which the spec does not list.
  - *`useStorePart` is not a drop-in for page state whose render timing a key press depends on.*
    `useSyncExternalStore` renders a store change synchronously, where a `setState` from async
    code waits for the scheduler's next task. Read through `useStorePart`, the folder Take's
    `sending` write re-rendered before the next key event, so the second of two SPACE presses
    one task apart read the folder as up and took it off: `playout-air-contract` S3 failed
    (`Strap played once`, 0 against 1). The page now mirrors the part into its own state with a
    subscription in an effect, which renders at the old pace, and S3 passes. Phases 11-13 moving
    more page state into parts should expect the same.
  - The repo's commit hook refuses `Co-Authored-By` trailers.
  - Playwright here wants `chromium_headless_shell-1228` while the image ships `-1243`; a symlink
    under `/opt/pw-browsers` (outside the repo) made the queued run start. Nothing in the repo
    changed for it.

## Row 20, phase 9: cueArmEngine.ts and the `arms` part

- **Previous verified `main` sha:** phase 8 passed on main (#1631 at `dedd457`); this branch
  starts at `3bfd237` (a quarantine entry after it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence,
  request or marker shape changes; the part lives only in memory.
- **Decisions.**
  - *One engine per session, read the page fresh at every call.* The page starts it in one effect
    keyed on the session (`startCueArmEngine(session, CUE_ARM_IO, () => armPage.current)`,
    stopped in its cleanup, and by the session's end) and hands it `{ published, timedCues }` in
    a second effect keyed on `[session, hostedSlug, timedCues]`. `armPage` is set every render
    where `armSpecRef` and `fireLaneRef` were, so a fire or a marker reads the same render it read
    before. The engine is started early in the page (after the session), not where the timer
    effect stood: the data dispatch effect sends through `sendVerb` and is declared before it.
  - *The countdowns are the session's `arms` part* (set after `data` and `bridge`), read with
    `useStorePart(session.arms)`; `armsRef.current` became `session.arms.get()`, and the wire's
    `get`/`set` read and write the part. The part outlives an engine restart (StrictMode's second
    mount), as the page state did.
  - *Old effects, mapped:*
    - timer and tab `[cueArms, hostedSlug]`: while unpublished the engine subscribes to the part
      and sets the timer again at each write; `hostedSlug` is the `published` input, which starts
      or stops the timer and the tab listener.
    - clearing `[timedCues, setCueArms]`: on a change of `timedCues` (and the first update after a
      start) to false, the part is cleared.
  - *Temporary interface* (`CueArmPage`): `send` (`sendVerb`), `cueView`, `liveCueOf`
    (`() => liveCueRef.current`), `withBoundValues`, `cues` (the spec's `cuesOf`), plus what
    `fireLane`, Hold and Manual already called: `graphicOf` (`cueGraphicName`), `setLiveCue`,
    `took` (`clearMisses` and `noteStep`), `flush` (`flushDraft` and `closeGroup`, not awaited),
    `log` (`logAuto`), `note` (`setNote`), `wire` (`armWire.current`), and the two facts
    `published` and `timedOff`. The timer, the clock and the tab are `io` (`CUE_ARM_IO`, whose
    `onVisible` is the Bridge watch's).
  - *Non-mechanical changes,* all listed:
    - the timer is set again at the write to the part, not after the render that followed it:
      the same wake, a commit earlier;
    - one tab listener while unpublished, instead of one removed and added at every arms change;
    - the clear on `timedCues` going false skips a part that is already empty (the old effect set
      a new empty map, which only rendered the page once more);
    - a stopped engine (unmount, production change, StrictMode's first mount) writes nothing:
      runDue, the timer, the tab, markers, Hold, Manual and PROGRAM's reply are no-ops after its
      stop, and the session's end stops it. The old page kept running a stale `runDueRef` after
      a production change; the route keys the page by production, so that never happened in use.
      A fire already sending when the engine stops finishes as before: its answer still moves
      `liveCue`, the folder step and the log, exactly as the old `fireLane` did.
    - the `arms` part is per session, so a production change starts with no countdowns (the old
      page state would have carried them, again only in theory because of the route key).
    - between an engine's stop and the next one's start (StrictMode's remount, or the unmount),
      the published paths reach no engine: a server-confirmed fire from the wire is dropped and a
      Take's marker goes out without `auto`. The old refs always held the last render's closures.
      Both windows are inside one synchronous commit or after the page is gone.
    - the wire's writes go through `session.apply`, so after the session ends they change
      nothing; the old `setCueArms` still wrote page state after the unmount.
- **Assessment A** (fresh read-only `/so` session on `4e1f0d0`): PASS WITH NOTES, nothing
  blocking. Its notes: the two paths above (now listed), the `armPage.current!` assertion (safe
  today because the arms are empty until a full render has sent a Take), and that it did not
  rerun the mutation checks itself.
  - **Mutation checks** against `scripts/cue-arm-engine.test.mjs` (fake clock, timers, tab and
    page; intervals and thresholds pinned as numbers): all 23 caught: dropping the clear on
    re-arm, on stop, or the tab listener's stop; firing twice; keeping a fired arm; the 15 ms floor
    at 10; the 5 s late limit at 6 s; the 3 s air wait at 2 s; firing a missed cue late; ignoring
    Hold; no re-arm on an early timer; no catch-up on visibility; no stopped guard in `runDue`;
    a published Hold not sent to the wire; an anchor while published; the timer kept while
    published; no clear when `timedCues` goes false; an Out sent without this page's view; no
    flush before the next Take; `leftAlone` ignored; the session's end not stopping the engine;
    `timedOff` ignored; the missed line dropped.
  - **Extra files:** `e2e/rundown-timing.spec.ts` and `e2e/configured/rundown-timing-recovery.spec.ts`
    gain `cueArmEngine.ts` in a `// covers:` line. No assertion or selector changes.
- **Traps.**
  - The spec's line numbers (535-564, 2303-2337, 2982-3098) are from `cc3500f2`; on `3bfd237`
    the code was at 521-549, 2161-2178 and 2195-2203 (`sendVerb`), 2283-2318 (the two effects),
    2571-2686 (the handlers) and 1745-1768 (the wire).
  - `startCueArmEngine` registers its stop with `session.onDispose`, which runs the stop at once on
    an ended session: the unregister must exist before that call, or the stop meets it unset.
  - No e2e spec patches the arm code's served source (checked with a grep of `e2e/` for
    `request.get('/src/`).

## Row 19, phase 8: useRundownAuthoring (rundown edits, clipboard, pictures, refresh)

- **Previous verified `main` sha:** phase 6 passed on main (#1627 at `325c246`); this branch
  starts at `acfad2f` (a quarantine release after it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of code only: no state shape,
  storage key, persisted format, sentence or write order changes.
- **Brief.** The coordinator's first brief for row 19 named parent phase 7, which landed in row
  4 (phase 2+7); `extensions.md` row 19 is phase 8. The builder stopped before any edit and the
  coordinator corrected the brief to phase 8.
- **Decisions.**
  - *A hook plus a plain function, in one module,* as phase 4 did and for the same reason: the
    page returns early while its production is missing, and the handlers read values computed
    after that return. `useRundownAuthoring(owner)` holds the five states and three refs that
    stood together in the page, plus the owner ref below, (`rangeIds`, `rangeEnd`, `clip`, `pendingClip`, `rundownNote`,
    `rundownFeedback`, `refreshingRundown`, `refreshingId`) and is called where they stood, so
    the page's hooks keep their order. `rundownActions(state, io)` is called by the page after
    the return, where `writeRundown` stood, on every render, so each handler closes over that
    render's values as the inline code did. The module has no effect.
  - *What moved.* `refreshRundown`, `uploadPictures`, `removeCue`, `removeGraphic`, the
    authoring block (`writeRundown`, `freshShow`, `editIds`, `pastePlace`, `pasteAt`,
    `duplicateCues`, `takeOutOfFolders`, `removeCues`, `cutIds`, `newFolder`, `removeFolderOf`,
    `moveRundown`, `toggleFolder`), and the rundown-editing keys of `onVerb` (the account-pause
    refusal, copy, cut, paste, select-clear, extend-prev/next, folder-new, folder-toggle) as
    `editVerb(key)`.
  - *What stayed.* `selectCue`, `selectFolder` and `clickRow` (the cursor is the page's, and
    `selectedCueId` may not move); `useRundownHistory` and `flushDraft` (the draft is phase
    13b's); the inline `onEditKey` (delete, undo, redo) and the folder editor's `onRename` in
    the JSX, which call `editIds`, `removeCues`, `writeRundown` and `setRundownNote` from the
    module.
  - *The temporary interface* is `offAir` (the page's `takeOffAir`), `serverOut` (the page's
    `playoutVerb(cue, 'out', 'Out')`) and `flush` (the page's `flushDraft`), plus 24 render
    values (`RundownActionsIo`). Nothing in the module sends to air.
  - *Non-mechanical changes,* all listed (the two-way diff of the moved lines shows only these):
    - `playoutVerb(x, 'out', 'Out')` became `serverOut(x)` in `removeCue`, `removeGraphic` and
      `removeCues`; the page binds `serverOut` to exactly that call.
    - `editVerb` answers whether it took the key: each `return;` in the moved branches became
      `return true;`, it ends with `return false;`, and `onVerb` reads `if (editVerb(key))
      return;` where the branches stood, so the keys after them see the same flow.
    - `refreshRundown` reads `pageOwner.current`, a new ref in the hook set on every render from
      `{ id, userId: user?.id }`, instead of the page's `publishOwner` ref, which only the refresh
      read and is gone. Handing the page's ref to `rundownActions` made the React Compiler skip
      the whole page (seven `preserve-manual-memoization` errors: a ref written during render,
      passed to a function, reads as possibly mutated). Both refs held the same value, set at the
      same point of every render, so the refresh's owner check compares the same values.
    - `refreshRundown` is now defined after the early return (it was before it), so its
      `|| !show` guard is gone: `show` cannot be missing there. `uploadPictures` was already after
      the return. Both are plain functions called only from the JSX.
    - `selectCue` and `selectFolder` list `setRangeIds` in their dependency arrays: a setter
      from a custom hook is not known to be stable to `exhaustive-deps`. It is a React state
      setter, so the callbacks keep their identity exactly as before.
  - *Write order and the mutation checks.* The moved code writes in the same order as before;
    nothing was reordered. Mutants run against the moved code, each with the specs that drive it:
    - a cut whose paste leaves the clipboard set (`setClip(null)` dropped in `pasteAt`): caught
      by `playout-folders.spec.ts:371` (Ctrl+X, Ctrl+V);
    - Shift+Down that does not move the range's far end (`setRangeEnd` dropped in `editVerb`):
      caught by `playout-folders.spec.ts:407`;
    - an upload whose first picture keeps the graphic's name as its cue label: caught by
      `productions.spec.ts:1130` and `:1207`;
    - an upload that goes on writing cues after the pictures' save was refused: caught by
      `productions.spec.ts:1207` (it said "✓ 1 picture added.");
    - **not caught:** removals that take nothing off air (`offAir` and `serverOut` as no-ops)
      passed all seven removal walks (`playout-cues:818`, `rundown-history:188/230/269`,
      `productions:117`, `playout-folders:338`, `studio-feedback:76`). No spec deletes a cue
      that is on air and checks that its graphic or server cue goes off first. The gap predates
      this phase (the inline code had no test either) and AC-2 keeps assertions unchanged here,
      so it is [#1630](https://github.com/NoaCG/NoaCG-Studio/issues/1630), not a test added in this PR.
    - `refreshRundown`'s order (flush event, history settle, durable commit, team or sync
      confirmation, owner check, reload) needs a configured backend; no browser spec covers it.
  - **Extra files:** 8 e2e specs gain one comment line naming `useRundownAuthoring.ts`: the
    specs selected for the page that drive a moved flow and were not already selected for the
    new module (`playout-folders`, `rundown-history`, `studio-feedback`,
    `playout-rundown-feedback`, `studio-release-completion`, `rundown-timing`,
    `publish-output-setup`, `dashboard-operator-walk`). No assertion or selector changes.
  - No Node test: the row requires none, and the module is a React hook over browser-only
    imports (pictures, sync), so a Node test would need the very adapters phase 8 does not add.
- **Traps.**
  - The spec's line numbers (1360-1396, 2472-2552, 3190-3220, 3676-3747, 4049-4103) are from
    `cc3500f2`; on `acfad2f` the code was at 507-520, 1323-1359, 2475-2563, 2981-3011,
    3413-3484 and 3793-3848.
  - Passing a ref that the page writes during render (`publishOwner.current = ...`) into a
    plain function makes the React Compiler skip the whole page. `eslint` names the memos it
    could not keep, not the call that caused it; bisect the call's arguments.
  - `e2e/playout-feedback-health.spec.ts` still patches `setSlotRev` in the page's served text;
    this phase did not move it.

## Row 18, phase 6: bridgeWatch.ts and the `bridge` part

- **Previous verified `main` sha:** phase 5 passed on main (#1626 at `fe95daa`); this branch
  starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No storage key, persisted format, sentence or
  request shape changes; the part lives only in memory.
- **Decisions.**
  - *One watch per session, fed after every render.* The page starts it in one effect keyed on
    the session (`startBridgeWatch(session, io, adapters)`, stopped in its cleanup) and hands it
    what it knows in a second effect with no dependency list (`watch.update(inputs)`). Each poll
    restarts on its own key, listed at the top of `control/bridgeWatch.ts`. A single restart rule
    for all five polls, the spec's literal `useEffect(() => startBridgeWatch(...), [checkAgain,
    settingsRev, slotRev])`, would restart the status subscription on Put on air and clear the
    header's status for it, which the page never did; the three named keys are explicit inputs
    instead, and the module's table says which poll each one restarts.
  - *The status is read from the part, not from a render.* A poll waiting on an answering Bridge
    is re-checked in the status callback itself and after each render, so it starts once per
    answer.
  - *Old dependencies, mapped:*
    - status `[statusTarget, checkAgainRev]`: both restart keys (`target`, `checkAgain`).
    - studio setup `[]`: once per start (StrictMode's remount still asks twice, as before).
    - output slot `[hostedSlug, casparOn, bridgeAnswers, slotReadable, outputSlug, slotRev,
      showId, casparTarget]`: all keep their place in its key; `bridgeAnswers` and
      `slotReadable` are now read from the part.
    - server files `[bridgeOk, needsServerFiles, serverFileKey, checkAgainRev]`: `bridgeOk` from
      the part; `needsServerFiles` and `serverFileKey` are one input (`serverFiles`, null when not
      needed); `checkAgainRev` is no longer needed, because Check again clears the status and the
      check restarts with the next answer (the mutation check found it equivalent).
    - pending studio change `[bridgeOk]`: from the part.
    - older clips `[bridgeOk, show, playoutItems, playoutSettingsRev]`: evaluated on every
      update; it was already guarded by `learntFacts` (`${show.id} ${rev}`), so asking again with
      the same inputs is a no-op exactly as before. `show` became `showId`.
    - server state `[serverReadable, hasServerItems, playoutSettingsRev, serverPlayout]`:
      `serverReadable` from the part, `hasServerItems` read from the `playoutItems` input,
      `playoutSettingsRev` a restart key, and `serverPlayout` the watch's adapter (constant for
      the page's life, so the start effect keys on it with the session).
  - *What moved into the part:* `bridgeStatus`, `outputSlot`, `serverFiles`, `slotSeenOurs` and
    the `learntFacts` ref. `checkAgainRev` and `slotRev` stay page state (restart keys); the
    `slotActionRev` ref became the watch's `slotActed()`; `statePoll.current?.wake()` became
    `bridgeWatch.current?.wake()`.
  - *Adapters:* `playoutConfigured` and `stateReadable` come in through `io`, because
    `playoutLink.ts` cannot be loaded in Node; `itemSlot` and `folderSlot` through
    `adapters.slots` (the phase-5 `SlotRules` type returns `Slot`, which has no `channel` on
    every member, so the watch takes the CasparCG-typed pair).
  - *Non-mechanical changes,* all listed:
    - a poll waiting on the status starts in the status callback, one React commit earlier than
      the effect that used to start it; the requests and their order are the same;
    - two requests whose answers were always dropped are no longer made: on Check again the file
      check listed the server's libraries once for the render that still showed the old status,
      and on a settings change that also moved the target, the state poll read once for the same
      stale render;
    - writing `learntFacts` into the part renders the page once per production and settings rev
      (a ref never rendered); it lands in the same task as the status answer that triggers it,
      so React folds the two;
    - the status callback checks its own stop as well as the link's (a late status writes
      nothing even through a fake link).
    - Check again no longer clears the file check's last result at the press: the check stops
      with the cleared status and clears its result when it restarts on the next answer. The
      operator cannot see the difference, because the page shows the file check only while the
      Bridge answers.
    - a poll started from the status callback uses the inputs of the last commit; the update
      after the next render checks the same keys again, so nothing is lost or asked twice.
  - **Extra files:** 10 e2e specs gain one comment line naming `bridgeWatch.ts` (the same ten
    phase 5 mapped to `serverVerbs.ts`). `playout-feedback-health` gains the same line and its
    fault injection follows the moved code: it rewrites the served source to delay `setSlotRev`
    (still in the page) and to count slot replies at the stale-read guard, which is now
    `if (!live || actionRev !== slotActions)` in `bridgeWatch.ts`, so it patches both modules.
    Its assertions are unchanged, and its own mutant (`HEALTH_MUTATE_STALE_SLOT=1`, the guard
    without the action check) still fails on "an older slot reply must not restore intent after
    Unload".
- **Traps.**
  - `e2e/playout-feedback-health.spec.ts` fault-injects by rewriting the served text of the
    modules it names, so moving the code it patches breaks it at its first `toContain` even
    though behaviour is unchanged. The phase-6 matrix row does not list it; CI found it. Grep
    `e2e/` for `request.get('/src/` before moving code out of the page.
  - The spec's line numbers (1134-1327, 1141-1143) are from `cc3500f2`; on `fe95daa` the seven
    effects were at 1222-1415.
  - A Node test that starts a real state poll keeps Node alive through its `setTimeout`: stop
    every watch after each test (`afterEach`), or the run never ends.
  - In the test's fake Bridge the reply is built when `/state` is asked, not when it is
    answered: change what the slot holds before the read you hold.
  - `TakeContext`'s `bridgeDown` and `PublishActionsIo`'s `outputSlot`/`slotReadable` still read
    the page's copies of the part; this phase did not shrink them (the fence keeps
    `useProductionPublish.ts` and `takeBlockers.ts` out). A later phase that touches them can
    read the part directly.

## Row 17, phase 5: takeBlockers.ts and serverVerbs.ts

- **Previous verified `main` sha:** phase 4 passed on main (#1623 at `ab9b5e4`); this branch
  starts there. Receipt: `phase-5.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of code only: no state shape, storage
  key, persisted format, sentence or send order changes.
- **Decisions.**
  - *One context object, the page's names kept.* The refusals read fourteen render values; the
    page builds one `TakeContext` per render and keeps `takeBlockerFor`, `directBlocker`,
    `stepBlocker` and `casparOffRefusal` as one-line wrappers, so none of their callers
    changes. The spec's `{cues, items, folders, places, ownership, settings, ability, casparOn}`
    gains `members` (the rundown's folder members, which `takePlans` reads), `bridgeDown` (a step's
    refusal; it is not the same as `ability`, which is `{state: 'config'}` when nothing is set up),
    `itemOf`, `graphicOf` and `slots`. The verb's intent carries the same context as its rundown,
    so the slot rules reach `runAndRecord` by one route.
  - *`slots` is an adapter.* `itemSlot` and `folderSlot` live in `control/playoutLink.ts`, which
    reads storage and imports `model/shows` without `.ts`, so Node cannot load it (spec §5.2).
    The page passes them in (`PLAYOUT_SLOTS`); the Node tests pass the same rule. Moving them into
    `playoutSlots.ts` would have meant a third `src` file outside AC-8's fence.
  - *The Take refusal is asked by the page, at the press, and handed in as `intent.blocked`.*
    `runAndRecord` then refuses before anything else, exactly where the inline check stood, and
    never for another verb. This keeps `serverVerbs.ts` free of `takeBlockers.ts` at runtime (the
    spec gives it serverPlayout, serverState and cuePlayback only) and keeps R1's "captured at the
    press" visible in the intent.
  - *The 250 ms head start stays a plain `setTimeout` inside the module*, with
    `LOCAL_SAVE_HEAD_START_MS` moved in from the page (its only reader). Node has `setTimeout`; the
    tests measure it with a held save.
  - *What stayed:* `playoutVerb` (it says the note), `addressOfItem`, `folderSlotOf`,
    `graphicOfCue`, `throughRoleOf` and `playbackAbility` (other readers: the editor, the rows,
    All together, the problem list), `canTake`, `folderCanTake` and `selectedFolderBlocked` (bar
    and panel facts: phase 12's `verbView`).
  - *Non-mechanical changes,* all listed: `bridgeDown` moves up about twenty lines, above the
    context that reads it (a plain derivation, read only after render); `throughFolderIdOf` and
    `takePlans` leave the page (their only reader was `takeBlockerFor`); `readable` is
    `stateReadable(bridgeStatus)` of the press render, computed once instead of twice from the same
    `const`; the flush is `io.flush` (the same `flushDraft` then `closeGroup`) with the same
    `.catch`; `now` is `performance.now()` through `io`, still read inside each fold; the graphic
    checks of `directBlocker` and `stepBlocker` read `graphicOf(cue)?.name` (the same pool lookup
    as `cueGraphicName`, so one callback serves both; simplify pass). The identity
    diff in `phase-5.md` prints nothing else.
  - **Extra files:** 10 e2e specs gain one comment line naming both modules: those with a page
    covers header that take server cues through the fake Bridge (`playout-cues`, `playout-clock`,
    `playout-sequence`, `playout-folders`, `bridge-connect`, `studio-evening-reliability`,
    `studio-release-completion`, `playout-air-contract`, `publish-output-setup`,
    `configured/panel-production-page`). No assertion or selector changes.
- **Traps.**
  - The spec's line numbers (3344-3457, 2857-2945, 2894-2906) are from `cc3500f2`; on `ab9b5e4`
    the verb was at 2803-2890 and the refusals at 3327-3442.
  - A new `control/*.ts` file with no covers line falls back to a 13-spec catch-all selection that
    misses every playout spec; the covers lines are what select the four of the row.
  - `TakeContext` and the verb `io` are temporary in part: `cueView` and `flush` go in 13b,
    `bridgeDown` and the slot facts may move into phase 6's `bridge` part. Shrink them there rather
    than add.
  - In a Node test, spreading a new `items` over an old context does not change `itemOf`, which
    closes over the old list: build a fresh context instead (this bit the first draft of a test).

## Row 16, phase 4: useProductionPublish (publish, slot, links)

- **Previous verified `main` sha:** phase 3 passed on main (#1620 at `799924c`); this branch
  starts there. Receipt: `phase-4.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of code only: no state shape, storage
  key, persisted format or write order changes.
- **Decisions.**
  - *A hook plus two plain functions, in one module.* The page returns early while its production
    is missing, and every handler and both facts read values computed after that return
    (`outputUrl`, `playoutStatus`, the slot gate). A hook cannot be called after it. So
    `useProductionPublish` holds the nine states, `slotBusyRef` and the sign-in follow-through,
    and is called where that effect always stood (effect order unchanged); `publishActions` and
    `publishFacts` are plain functions the page calls after the return on every render, so each
    handler closes over that render's values exactly as the inline code did. A ref-based "latest
    deps" hook was rejected: an `await` inside `publishNow` would then read a later render's
    values (`casparOn`, `show`), which is a behaviour change. The spec's "returns handlers,
    `casparFacts`, `headerAction`" is met by the module, not by the hook's own return.
  - *What moved.* The account gate and its two sentences, the audience-name claim, the output
    embed download, `copy`, the slot actions (`slotAction`, `loadOnSlot`, `takeOffSlot`,
    `unloadFromSlot`, `clearThroughBridge`), `publishNow` (with C2/C6's `refreshGraphicCopies`
    with `publishedReaders`, which records the own-reader stops a Publish drops in the same write,
    the published-readers set and the fast-event recompute, all inside it, unchanged), `publish`, and the header action and CasparCG facts with their gates
    (`slotInPlay`, `loadDue`, the two check lines, `slotLoadedHere`).
  - *What stayed.* `uploadPictures` (it sat between the handlers but is rundown authoring, phase
    8), `setCaspar` (the output setup switch; it only calls `setReplaceAsk`), `problemChecks`,
    `flowBusy`, the C6 effect that clears own-reader stops on evidence and the first
    published-sources write (`firstPublishedSources`, the data session's), and the rehearsal clear:
    `onFirstPublish(rehearsed)` keeps `applyProgram` and `setLiveCue({})` in the page, as the
    spec's temporary interface says.
  - *Non-mechanical changes,* all listed: the rehearsal clear becomes `onFirstPublish(rehearsed)`;
    `publishRef.current = publish` is set inside `publishActions` instead of three lines later in
    the page (same render, same point relative to any effect); `publishFacts` reads `replaceAsk`,
    `busy` and `slotBusy` from the hook state; `publishNow`'s comment drops a `forPrepare`
    parameter it never had. Everything else is byte-identical (`phase-4.md` has the diff).
  - **Extra files:** 19 e2e specs gain one comment line naming `useProductionPublish.ts`: the
    specs with a `// covers:` header naming the page that drive Publish, Load, Replace, Unload,
    the output copy or template, or the name claim, directly or through `e2e/_publish.ts`, and
    were not already selected, plus `configured/playout-status` (it covers the panel the facts
    feed). No assertion or selector changes. Left without, as in phase 3: configured specs with
    no covers header (`production-links`, `audience-live` and others), where a first header
    would change how they are selected.
- **Traps.**
  - The spec's line numbers (427-445, 2387-2456, 2565-2755, 4412-4541) are from `cc3500f2`; on
    `799924c` the code was at 479-497, 518-531, 663-667, 2650-3017 and 4624-4688.
  - `PublishActionsIo` is the temporary interface: 26 inputs, most of them page state that later
    phases move (`liveCueRef` in 11, `flushDraft` in 13b, `outputSlot` and `slotReadable` in 6).
    Each of those phases should shrink it rather than add to it.
  - The hook returns its setters because `publishActions` needs them; the page destructures only
    what its JSX reads.

## Row 15, phase 3: ProductionShell and CueActions, props-only

- **Previous verified `main` sha:** C7 passed on main (#1615 at `44bfa89`); this branch starts at
  `823d160` (that plus the C7 walk receipt #1619). Receipt: `phase-3.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of markup only: no state, storage key
  or persisted format changes.
- **Decisions.**
  - *The shell moves with its own hooks.* `ProductionShell` was already a component at the bottom
    of the page, and it already called its own hooks (the verb keys, the edit keys, the cue
    shortcut set, the team state, the rail width). The spec calls this row "a file move" with "the
    current props", so it moves verbatim, hooks included; nothing moves into it from the page, and
    its props are unchanged. Lifting those hooks into the page would have changed the code under
    a move, which this phase forbids. `NO_CUES` moves with it, as its only reader.
  - *CueActions is the `liveBlock` fragment and nothing else.* The page keeps `liveBlock`,
    gated on `selectedGraphic` exactly as before, so where and when the block mounts is unchanged.
    One ⚡ button stays the page's `actionButton`, passed in as a render function (as 13a passed
    `endsRow`): its greying, its name and its hover read `legality`, `machineState` and the
    field descriptors, so drawing it inside the component would have meant deriving there. The
    props keep the page's names, so the moved text is byte-identical.
  - The markup's own expressions move with it unchanged (the section `heading`, the live
    number's `disabled` and `title`, the Recovery select's value parsing). They are part of the
    block as it was; this phase does not re-home them.
  - **Extra files:** 34 e2e specs gain one comment line naming `ProductionShell.tsx`,
    `CueActions.tsx` or both: every spec with a `// covers:` header that drives the moved test
    ids (the header's `verb-out-all`, back, home, tabs, follow line, panel status, team note,
    `data-renders`; the block's `cue-action-*`, `cue-actions*`, `machine-state-chip`,
    `machine-snap`, `live-number*`) and was not already selected by the new files. No assertion
    or selector changes. Left without: `score-tracker-moments` (declares `covers: none`, which a
    second line would make malformed) and four configured specs with no covers header at all
    (`bridge-real-server`, `dashboard-hosted-walk`, `follow-status-is-visible`,
    `hosted-control-profile`), which never mapped to the page either.
- **Traps.**
  - The element at `liveBlock`'s place changes type (a fragment becomes `CueActions`), so React
    mounts it fresh once per page load. Within a session the type is stable, so the Recovery
    disclosure and the arranger keep their state across renders as before.
  - The spec's line numbers (5398-5456, 4236-4410, 3945-3988) are from `cc3500f2`; the shell
    was at 5518-5798 and the block at 4579-4753 on `823d160`. 3945-3988 was `fireEvent`, which
    stays in the page (it is a verb, not markup).
  - Phase 4 (`useProductionPublish`) passes the header's status and action through the same
    `status` slot; nothing here changes that slot.
  - The spec's file table gives `CueActions` the `arranging` and folded state, but no phase in
    the phase list moves them: `arrangingFor` stays page state (it only computes `arranging`),
    and `foldedFields` is the cue editor's (13b). Assessment A flagged it; whichever phase next
    touches `CueActions` either moves `arrangingFor` in or the table drops it.

## Row 14, data-sources C7: combined technical rehearsal (software) and the content trial kit

- **Previous verified `main` sha:** C6 passed on main (#1607 at `198b685`, repair #1610 at
  `f9c9c26`); this branch starts at `6042b4f` (main when the row began).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration, no persisted field, no setting:
  the only product change is the Twitch reader's join check, and reverting it brings back the
  dropped " 366 " lines.
- **What landed.** `docs/work-specs/data-sources/evidence/rehearsal.md` (every AC-16 route, each
  with the journey or test that proves it and its result on this build), `evidence/trial-kit.md`
  (the eight unaided tasks of data AC-14, sheet AC-12 and audience AC-7, the six comprehension
  questions with their right answers, the four-of-five reading guide, where findings go), the
  Twitch regression test and its fixture, four new journeys, and one fix.
- **Decisions.**
  - *One production per route.* The brief says to reuse the journeys that already prove a route,
    so the rehearsal is the union of those journeys on one build, each on its own production;
    rehearsal.md says so at the top rather than claiming one combined production.
  - *Journeys added only where a route had none:* the quiz reveal beside a running clock, a guest
    row, schedule/standings/credits from a Sheet (only the ticker had a Sheet journey), and the
    published audience walk (join on a phone, presenter view, vote; no configured spec submitted
    from the join page or opened the presenter view).
  - *The independent clock is a second graphic.* No quiz template carries a clock, so the quiz
    plays beside Club Scorebug's running match clock, both bound to the data.
  - *Twitch fixtures are written, not captured.* "Captured once" would mean a live Twitch session,
    which is the owner's item; the frames follow Twitch's IRC wire format with invented names and
    text, and rehearsal.md says so.
  - *The message tasks' three questions* (audience AC-7 names "the three comprehension questions"
    without listing them) are read as questions 1, 2 and 6 of the six, the ones a message task
    can answer; the data tasks use all six.
  - *The YouTube live smoke ran 3.5 minutes, not 10*, inside the five-minute cap the job queue
    allows an uncommitted one-off selection; the spec allows at most ten.
- **Fix.** `src/audience/twitchChat.ts`: a line was taken as the end-of-names reply when it merely
  contained ` 366 `, so a chat message about "366 votes" was dropped and reset the reconnect
  ladder. The numeric must now be the IRC command. Found by the new test.
- **Mutation check** (each mutant alone, its test run):
  - `scripts/twitch-chat.test.mjs`, 18 mutants of the reader and the intake: the old ` 366 `
    substring, the tagged end-of-names allowance, the 30 s ceiling, the ladder reset, the first wait, PONG, the CAP request, `\s`
    unescaping, the CTCP strip, the nickname range, the display-name fallback, the asynchronous
    error, a 26-character login, binary frames, the 10-a-window throttle, the device-token
    prefix and the dedupe each turn it red (17). One survives by design: `stop()` without its
    `clearTimeout` (the pending retry still finds the driver stopped and opens nothing), an
    equivalent mutant.
  - Quiz beside a clock: a data write that also re-takes every graphic goes red (the quiz returns
    to Question); one that re-takes only the scoreboard goes red too, but on its machine state
    (Enter, not running), not on the clock's reading: origin-based clocks resume from their stored
    start, so the reading alone cannot see a re-take. Both checks stay.
  - Guest row: loading always the first row goes red. The re-take mutant passes it (the journey
    makes no data write), and its "PROGRAM unchanged after the row's edit and delete" half has no
    code path to mutate: nothing sends a table edit to air. That half guards a future one.
  - Sheet boards: a data write that also re-takes the graphic goes red on the entrance count.
  - The published audience walk runs only in the configured suite; it was not mutation-checked
    locally (no local stack on this worker), and its first configured run is its evidence.
- **Hostile input.** The Twitch test feeds 200,000-character frames (backslashes, tag pairs, a
  login with no `!`, `!` runs, a tag block with no space) and requires under a second; the new
  join check is anchored and linear.
- **Limits pinned by a literal:** the reconnect ladder (1, 2, 4, 8, 16, 30, 30 s), the 25-character
  login, the 10-in-10-seconds throttle, the five-digit `justinfan` nickname.
- **Runs.** The whole configured suite on `e53b7e7` (run 39838648044): 124 passed, 0 failed, 3
  allowed skips, the new audience walk included. The full offline suite on `86ebdd9` (run
  39843292132, `ci.yml` dispatched with no base): 15 of 15 shards green. Quarantined specs are
  outside both PR and dispatch shards; `production-chat-intake.spec.ts` is one, so its YouTube
  journeys are local-run evidence only (rehearsal.md says so per row).
- **Assessment A+** (a fresh read-only `/so` session on the diff and the rehearsal at `93a83e5`):
  PASS WITH NOTES. Its findings and what was done: the Row 13 heading this entry had overwritten
  (restored); the YouTube rows rested on a quarantined spec that CI does not run on a branch
  (restated on the Node tests and the live smoke, the journeys named as local evidence); the
  configured run unfinished (finished green, recorded); the pushed-score row's offline citation
  pushes nothing (restated on the configured spec); the four boards on real CasparCG/Bridge and
  OBS, the actual consumer and a browser output receiving a data update not named as unverified
  (named; the browser-output halves cited separately); operator-page closure checks rows, not
  PROGRAM (said so); the guest edit's landing unchecked (now checked); the trial kit ran the
  message tasks on a published production and named a lower third no task uses and a real-shaped
  phone number (two productions, the lower third dropped, the number zeroed, task 8 tied to its
  row); the mutant count (corrected to 18). Its re-assessment on `01b1b2a`, with both runs
  finished: **PASS**, every finding fixed or accepted, nothing blocking the landing.
- **Advisor judgement:** none needed; no migration and no database object.
- **Traps.**
  - A clock's reading survives a re-take (it resumes from its origin), so "the clock was not
    reset" needs the machine state too.
  - The job queue refuses a broader (12-minute) job on an uncommitted tree; a one-off live smoke
    that must not be committed is held to the five-minute small selection.
  - A Playwright config outside the repository resolves the base config's relative paths against
    its own folder; run a one-off spec from inside `e2e/` instead, and delete it after.

## Row 13, data-sources C6: Compatibility, truthful operation and docs

- **Previous verified `main` sha:** `7057915b44e237fa9879ec49f2363b8ab15bc123` (row 12, C5, #1604);
  this branch starts at `a285d94` (that plus the quarantine entry #1605).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted field: a
  reverted build reads every record this one wrote. A graphic whose reader was removed through
  "Stop its own reader" stays without it after a revert (the removal is an ordinary design edit;
  Undo in the editor or re-adding the block by hand restores it).
- **One way to connect a Sheet (sheet AC-10).**
  - The editor's graphic-level panel (`LiveDataControls`, in `editorFoundation/`, where the former
    `ControlPanel.tsx` panel moved) offers nothing to a graphic without the block. A graphic that
    has one sees what it reads and "Remove live data". The `liveData.set` editor operation stays
    (records and tests still create the block); no UI reaches it.
  - Exports are unchanged: `scripts/legacy-sheet-block.test.mjs` builds the SPX package from the
    C1a fixture's Hairline, finds the block byte for byte in `js/template.js`, and runs it against
    a CSV: it fetches its address and hands `update` the mapped row.
  - **The explicit migration.** Connect data… on a graphic whose code reads a Sheet offers "Stop
    its own reader" or "Keep it" instead of the review (`ownReaderGate`). Stop removes the block
    from the library record (the design every production plays, so other productions using the
    graphic lose it too, and the panel says how many) and, before Publish, from the production's
    copy (`ownReaderRemoval`). Published, the copy is what the output runs, so it is left for
    Publish to replace (`refreshGraphicCopies` takes the newer record), and Connect says "Publish
    changes, then connect" until the copy no longer has it. A published graphic with no library
    record cannot carry the removal to its output, so the migration is refused with that reason
    (a rare case: an unlinked legacy copy on a published production). The review only opens once
    no copy that plays has the block.
  - **Every other binding door refuses too** (assessment A found the Advanced bindings table,
    Bind all by title and a typed path could still bind such a graphic): the binding write path
    (`applyBindings` in shows.ts, beside the prepared-message refusal) refuses a new binding on a
    graphic whose copy or library design has the block (`ownSheetGraphics`, the same reach as
    `ownReaderGate`), and the table says why; Bind all by title names what it skipped, a binding
    saved before C6 stays (and can be unbound) but takes no new path, the prepared-message
    "separate card" offer leaves the block behind, and Connect's refusal names the reader when that
    is the cause (the delta review's findings). The block's marker
    moved to `src/model/liveDataMark.ts` so the model can test for it without importing control/.
    Bindings saved before C6 on such a graphic stay as they were (the C1a fixture has one).
    Not guarded, by scope: a door that gives an already-bound graphic the block afterwards (adding
    a legacy template under the same name, or Publish taking an older library design that still
    has it). Nothing in the app offers the block to a graphic any more, so neither has a way in
    short of hand-editing code.
  - **Cross-production effect, on purpose.** Stop on a library graphic changes the shared design:
    every production using it loses the reader (a published one at its next Publish). The panel
    names how many other productions use it before the press.
  - **Pause is honest.** Every graphic still reading in its own code is listed under the cue editor
    (the Playout sources line) and on the Data overview as "Sheet in X's own code · read by the
    graphic · Pause does not stop it", with no Pause button.
  - The removal itself (`ownReaderOf(...).remove` in ProductionPage.tsx: the library write, the
    copy write, the commit) is page logic beyond "presentation wiring", recorded here; its rules
    are the Node-tested `ownReaderGate` and `ownReaderRemoval`.
  - The page's library snapshot is re-read after the migration (`libraryRev`), so PREVIEW and
    PROGRAM rebuild on the design the production now plays; otherwise the old block would keep
    running in the page's own monitors until a reload. The production's copy write sets `savedAt`
    for the same reason (ProgramStage's pool signature).
  - `/docs` (docs.html, "A Google Sheet") now describes Connect data… and the migration;
    `docs/PRODUCTION_DATA_PLAN.md` carries the supersession note in its status block.
- **AC-9.** Setup's "Messages…" and "Data…", the Data overview, the Playout sources line with
  Pause, local content without freshness and the reader/cadence/checked/changed details were
  C1c's and are unchanged; C6 adds the own-reader line to both lists (the "explicit fallback" for
  a reader Pause cannot reach).
- **AC-16 presentation: which observations the output route supplies.** This page observes:
  whether the production is published; each graphic send's answer from the command log
  (`control_send_many` / the seq road), an accepted write and never a rendered picture; whether it
  can reach the server (the browser's `online`/`offline`, and the resolve retrying); the outputs'
  presence (READY); for server cues, the Bridge's answers and the server's own slot readings.
  No output reports its picture back, and there is no per-command render acknowledgement, so
  nothing says a picture is confirmed on air. What was added:
  - PROGRAM's status tag (`programAir`), in the frame's bottom-left corner like PREVIEW's length
    tag: "sending…" while a send waits, "logged HH:MM:SS" (state `logged`, never `confirmed`) once the log took it (its tooltip says
    outputs do not report their picture), "not confirmed" while a failed send is still owed (read
    from `sendDebts`, the page's one record of that, through a new `owed()`; a later send of
    another graphic does not settle it), and "last logged HH:MM:SS" when the page cannot reach the server
    (the centre tag below says the connection is lost; review found the two said it twice). Nothing pressed yet shows nothing. Unpublished it shows nothing either: the
    header's existing PROGRAM · NOT PUBLISHED and "up, not live" already label the local
    simulation (a first cut put "this page only" in the header, which truncated the monitor's name
    at 1280 px; seen on the after screenshot and moved).
  - A lost connection dims PROGRAM and puts "CONNECTION LOST · NOT LIVE" over it; NoaCG Bridge
    not answering (its `bridge` or `server` state, not a Bridge that answers with a warning) while
    server cues are up puts "BRIDGE NOT ANSWERING · NOT LIVE" (or "CASPARCG NOT ANSWERING" when the
    Bridge answers but CasparCG does not: assessment A), whose badge turns amber with a "last reported"
    tooltip (its words stay short: the header already truncates the monitor name with a long badge).
  - The target line under the verbs (`takeTargets`): "To: this page only", "To: N outputs ·
    CasparCG 1-20", "(not loaded)" when the output is not on its slot, or a server cue's slot
    ("To: CasparCG 2-10"; the re-recorded baselines showed "through NoaCG Bridge" wrapping the
    line at 1366 and 1920 px, and the server badge on PROGRAM already names the Bridge). "0 outputs" rather than a sentence, so the line never wraps the verb row.
  - The folder panel lists every child's own outcome (ON AIR, NOT TAKEN with the reason) and, in
    All together, names both cues of a collision ("same place as …"). The policy is the existing
    one: All together never takes two cues to one place (two clips on a slot, two graphics on a
    layer, two cues of one graphic); the Take is refused before anything is sent and the folder
    says why. A first cut said "the later one replaces it", which the after screenshot showed to be
    false (the refusal line sat right above it); corrected.
  - Selection, PREVIEW and staged edits already had their own words (the cursor, PREVIEW's label,
    the unsent line and ✎ Update); they are unchanged.
  - No new confirmation protocol, renderer acknowledgement or composite renderer.
- **Files beyond the phase's list, and why.** `src/control/liveData.ts` (the gate and removal
  rules, Node-testable), `src/model/shows.ts` (`setGraphicCopyScript`, the copy write),
  `src/control/playoutStatus.ts` (`programAir`, `takeTargets`: the existing Node status contract),
  `src/control/folderAir.ts` (`folderChildren`: the existing folder contract),
  `src/components/home/SourcesLine.tsx` and `src/components/home/ProductionDataPanel.tsx` (the
  own-reader line on Playout and the Data overview), `src/styles/playout-dashboard.css` (the chip,
  the stale picture, the folder rows), `docs.html` (the /docs page is this file).
- **Baselines.** The six `playout-baseline` Linux pictures changed (the target line under the
  verbs); re-recorded only through `rerecord-screenshots.yml`, looked at, masks and thresholds as
  they were. The `-win32` set is not recorded from a Linux cloud worker (as in row 7).
- **Advisor judgement:** none needed; no migration and no database object.
- **The output's own running frame (the PR's automated review, P1).** After Publish, an output keeps
  an on-air graphic's old frame, its embedded reader included, until the graphic is cleared
  (`src/output/swapPlan.ts`), and a Publish that fails after refreshing the copy leaves the output
  on the old version with a clean copy. The copy alone cannot prove the reader stopped, so the gate
  also reads two observations of the output. The published payload this page last saw (at its
  resolve, or its own successful Publish, read from the record as published) still carrying the
  block keeps "Publish first". And for any graphic this page has seen with a reader (design, copy
  or payload), Connect waits while a connected output has not wholly taken the published version:
  it reports a change preparing, failed or waiting for an on-air graphic's clear, or holds another
  version. A first cut read only the per-graphic "waiting for clear" list; a review of it found
  that list misses a failed preparation, whole-page reloads and more than six graphics, so the
  wider rule replaced it. It is limited to graphics seen with a reader, so a routine republish of
  any other on-air graphic never blocks Connect. Not covered: the Data overview's own-reader list reads
  design and copy only; a teammate's Publish is not seen until this page resolves again (which only
  keeps Connect waiting longer).
- **Every binding door reads the output too** (the automated review's second P1): the Playout page
  records what Connect holds back per production in this browser (`src/model/ownReaderHolds.ts`,
  key `spx-gfx-own-reader-holds:<id>`, never synced), and the binding write path and the Data
  view's tab (through the `storage` event) refuse those graphics as well. A device-local record:
  only a page that observes the outputs can say what they run.
- **Across a reload** (the automated review's third P1): the graphics seen with a reader are kept in
  the same device-local store (`spx-gfx-own-reader-former:<id>`) and restored when the page opens,
  so a page reloaded after the migration and Publish still holds Connect and the binding doors
  while an output runs an old frame. An entry clears only when verified: presence has joined, no
  output reports anything pending or another version, and nothing reads in the design, the copy
  or the published payload (an output that connects later loads the published version afresh).
  This closes the reload gap listed above for this browser; another browser that never saw the
  reader did not know it until the repair below.
- **Only positive evidence clears it** (the automated review's fourth P1): an output can drop out of
  Presence and keep running its frames, so absence proves nothing. While a graphic's history entry
  exists, Connect and the binding doors hold it ("take it out, then connect"); the entry clears
  only when the graphic is off air (every output still following the log takes its Out and swaps
  to the published version), presence has joined, no output reports anything pending or another
  version, and nothing reads in the design, the copy or the published payload. And only once this page
  has recovered the production's live state (its resolve has answered, the wire's on-air map and
  the rows after it applied): an empty on-air map before that is no evidence (the fifth P1).
- **Kept on purpose.** The editor's `liveData.set` operation stays: nothing but its own Node test
  (`editor-project.test.mjs`) sends it now that the panel offers no Add, and the specs build the
  legacy block through `liveDataBlock`. Removing it would widen the phase into the editor.
- **One rule for "reads a Sheet in its own code".** The sources line, the Data overview and Connect
  data… all ask `ownReaderGate` through `ownSheetReader` (SourcesLine.tsx), so a published
  graphic whose copy still has the block after the migration stays listed until Publish replaces
  it, and nothing can be offered the migration without being listed (review and simplify findings).
- `src/control/failedSends.ts` and `scripts/failed-sends.test.mjs` are touched for `owed()`;
  `src/model/liveDataMark.ts` (new) holds the block's marker for the binding refusal;
  `src/model/ownReaderHolds.ts` (new) carries the Playout page's holds to the other doors.
- **Assessment A** (fresh read-only `/so` session on the diff at `bc97f3b`): PASS WITH NOTES. Its
  findings and what was done: the binding doors (fixed, above); the CasparCG hop named as the
  Bridge (fixed); journeys for a library graphic on a published production (added: the scope
  count, the design stripped and the copy kept, Publish first, the own-reader line kept); the
  `confirmed` state name (renamed `logged`); the page logic and the cross-production effect
  (recorded above). The refusal for an unlinked graphic on a published production is pinned in
  Node only.
- **Repair 1, 2026-10-22** (independent check `checker-p13-pp-p13c-3605` on `198b685`: FAIL).
  - *Finding 1, competing writers across browsers.* Browser A stops library graphic G's reader and
    publishes while G is on air: the output keeps G's old frame and reader until G is cleared, but
    another browser (a teammate, a second device, A with cleared site data) saw only clean design,
    copy and payload and empty device-local stores, so every binding door let it bind G's fields.
    Fix: the production's own synced record carries the stop (`Show.ownReaderStops`, by graphic
    name). It is written by Publish, in the same write that refreshes the copies
    (`refreshGraphicCopies`), for every published graphic that publish takes a reader from: its copy
    loses one to the refreshed design (this production's Stop, or another production sharing the
    design: the fresh assessment's finding), or the payload the page saw published reads and the
    copy no longer does. Until Publish the synced copy still reads, so every door already refuses
    on it. Every browser reads the record: the gate answers `clear` for a recorded stop
    (`ownReaderGate` `stopRecorded`, through `ownSheetReader`), and `ownSheetGraphics`, which every
    binding door and the Data view ask, includes it, so `applyBindings` refuses too. It clears on
    the same positive evidence as the device-local history (off air, live state recovered,
    Presence joined, no output behind, nothing reading), from whichever Playout page sees that
    first, and the clear syncs. Read only while published (`publishedReaderStops`); unpublishing
    drops it (a re-publish mints a new output URL); left out of the published-record digest (it
    never reaches an output); inert on duplicates and conflict copies, which drop the hosted slug.
    A refused team save merges it by name (`teamShowMerge.ts`): an added stop is kept, one goes
    only when a side cleared it and the other had it unchanged, and a binding the merge leaves on a
    stopped graphic is dropped and reported. Chosen over "hold whatever an output reports waiting
    for its clear": that covers only a browser with the Playout page open and its outputs in
    Presence, not the Data view, a typed binding, or an output that dropped out of Presence and
    still runs its frame. A JSON field on the record: no migration, no database object, no advisor
    judgement. The device-local stores stay: they also carry what this page saw in a payload.
  - *Finding 2, the migrated path uncovered.* The published-migration journey now runs past
    "Publish first": a Publish without the reader while G is on air, a reload in the middle (the
    clear gate `cue-connect-clear-first` restores; the binding write refuses), three reloads that
    must still hold (an output on another version; Presence never joined; G on air with no output in
    Presence and the resolve answering late), and the release on positive evidence (link offered,
    record and stores empty, the binding takes). A second journey stops the reader in one browser
    and opens the production in a fresh browser context holding only the synced record and design:
    held there (gate, binding write, Data view's Advanced row) until the same evidence releases it.
    Node (`scripts/legacy-sheet-block.test.mjs`, shows.ts bundled like the export): the gate holds
    a recorded stop, and the binding write refuses a held graphic and a recorded stop, ignores a
    stop while unpublished, and binds once cleared.
  - *Mutation check* (each applied alone; the two Node files and the four C6 journeys run): the
    checker's two mutants (verified at once and the history forgotten on load; `applyBindings`
    without the holds) and twelve on the new rules (the page ignoring the record; the binding doors
    ignoring it; the gate ignoring it; release before the live state is recovered, while on air,
    without Presence, while an output is behind; Publish recording no stop; Publish ignoring the
    payload's readers; the merge letting theirs win; the merge keeping a binding on a stopped
    graphic; unpublish keeping the stops) each turn at least one test red.
  - *Fresh `/so` assessment* (read-only, on the first cut): FAIL, because the stop was written by
    the Stop button for its own production only, so a second production sharing the design took
    the clean copy at its own Publish with nothing recorded; and a team merge could drop a stop.
    Both fixed as above, with the unpublish clear it suggested. Its re-assessment of the fixed
    diff: PASS WITH NOTES; its note that duplicates and sync conflict copies kept stale stops is
    fixed (both drop them), the others are gaps below.
  - The journeys stand in for Publish (`publishWithoutReader` calls the app's own
    `refreshGraphicCopies` and builds the payload): the real Publish button needs a signed-in
    account, which the offline suite has not got. Publish's recording is pinned in Node.
  - Known gaps now: the Data overview's own-reader list reads design and copy only; a teammate's
    Publish is seen at this page's next resolve; a browser binding from a record older than the
    stop (before sync brings it) is the record's ordinary last-write-wins case; stops and the
    history are keyed by graphic name, so renaming an on-air graphic before its clear escapes the
    hold (as the history already did); the clear is an automatic record write, so on a personal
    production two devices clearing at once can leave a conflicted copy (rare: once per stop); an
    output that stays behind (a stuck prepare, an old output tab) now holds the graphic for every
    browser until it catches up or is closed; a graphic removed and re-added clean under the same
    name, then published from a page whose resolve has not answered, records no stop; a merge
    cannot tell a re-stop inside one save window from the stop it clears; the journeys stand in for
    Publish, so its call site's third argument is pinned only through the function; a team merge
    now drops a binding left on a stopped graphic, reported as "the field bindings".
- **Traps.**
  - The production page reads the library once per mount; a design change made from the page
    itself must re-read it or the monitors keep the old design.
  - The SPX export cannot be imported in Node with the `.ts` resolver (it imports `.txt` licence
    files); bundle it with rolldown to a temp file, as `ograf-timed-exit.test.mjs` does.
  - `context.setOffline(true)` fires the browser's `offline` event, which is what the page reads.

## Row 12, data-sources C5: "Another system" card and Pause

- **Previous verified `main` sha:** `503b029976d78c5b49a758aae449df87b9649f0b` (row 11, C4, #1599 and
  repair #1601). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0100 is additive and stays applied:
  a reverted build never calls `control_data_pause_by_slug`, so no production is paused and the
  widened `control_data_apply` and `control_data_send` behave exactly as 0097's and 0047's. Resume
  any paused production before reverting (the card's Resume), or its held writes stay held until
  someone calls the function. Fields connected to `api.` paths stay ordinary bindings; a reverted
  page shows them as bound paths with no "Another system" name.
- **The tested Pause, named explicitly: suppress-and-diff, not the fallback.** The spec's smallest
  design proved proportionate, so the "to freeze, stop the sender" fallback is not used. One change
  from the spec's wording: while paused, `data` stays the ON-AIR tree and the API's writes go to
  `data_pending` (the spec had `data` take them and a `dispatched` copy hold air). The review found
  that with the spec's layout every reader of `data` (a Take, an Update, the operator pages,
  `/state`) aired held values; with this one they cannot.
  - `/patch` while paused: `control_data_apply` with `'api'` merges into `data_pending` and appends
    nothing; it answers that tree with `paused: true`, and the route adds `paused` and a `message`.
  - `/update` while paused: `control_data_send` keeps the values in `data_held`, a per-graphic
    last-write map, and answers NULL; the route answers `event: null`, `paused: true`.
  - Operator presses, the owner's Data view and the server tick air at once as unpaused, and also
    merge into `data_pending`, so the LAST write wins at Resume either way. A held `/update` field
    is dropped when a later write names its path, a null or a repeated value included (the
    review's ordering finding, then two of the PR's automated review).
  - Resume diffs `data_pending` against `data`, lays the held `/update` values over it (the spec's
    "applied after", as one row so a field is never aired twice), appends one row per graphic,
    `src: 'api'`, and makes `data_pending` the tree. It never refuses: a cap check there could
    leave a production held for good (review); the rows are bounded by the graphics.
  - A null while paused deletes the path in `data_pending`, so Resume sends nothing for it: the
    same as an unpaused null today. The configured walk pins it.
  - `data_received_at` is written by every API write (at most once a second when nothing changed):
    the card's "Received N s ago".
  - The owner's Data view on a published production went through the data key, so Pause held the
    owner's typing and the card counted it as a receipt (review, high). It now goes through
    `control_data_owner_patch` (the row policy's test, then the apply as `'operator'`), falling back
    to the key on a database that has not run 0100.
  The cases are `scripts/data-pause-conformance.mjs`, embedded as a `$pause$` literal in 0100 and
  run by its self-check on the real bodies (twenty cases); `data-pause` fails when the two differ.
  Mutation checks of the final bodies (ten, each turned the self-check red, run on the local
  stack in a rolled-back transaction): held values laid under the diff instead of over it;
  `/update` held without merging per field; the paused API branch removed; the API's paused write
  landing in `data`; a held `/update` kept after a press (and, found by assessment A, kept after a
  press of the value air already showed, now dropped by the API's-tree diff too); kept after a
  later `/patch`; kept after a later null; kept after a later write that repeats the value (the
  last two found by the PR's automated review: held fields are now dropped by
  `production_data_addressed`, every bound field whose path a later write NAMES, under or over a
  written path included, whether or not its value changes); the prefix rule reduced to an exact
  match; the owner's
  door labelled `'api'`; operator writes not joining the API's tree; Resume not making the API's
  tree the tree.
- **Sample sender, run for real** (assessment A asked for the whole chain, not only stubbed tests).
  On the local stack (every migration through 0100 from empty), a production with a scoreboard
  whose four fields were retitled Leading, Margin, Counted and Turnout ("Riverside count", an
  unfamiliar custom graphic) was connected through Connect data…, Another system in one
  confirmation, published, and the card's "For the sample sender" file downloaded: it named the same
  four `api.riverside_count.*` paths as the fixture. With the card's key in `NOACG_DATA_KEY`:
  `results-first.json` -> `Received (200): Riverside count (f0, f1, f2, f3)` ("Polling stations"
  reported as not connected, not sent); `results-correction.json` -> `Received (200): Riverside
  count (f1)` (only the corrected margin moved); `results-cut-off.json` -> "Acquisition failed ...
  Nothing was sent", exit 1. The log held exactly two update rows, `src: api`: the four values,
  then `{f1: "214"}`. The card showed "Received N s ago"; no output line carried the key. No
  lifecycle event was sent: the key reaches only the data RPCs (`data-pause` pins it).
- **Decisions.**
  - Another system is the data key as ONE source with no `Show.sources` record (AC-8: no
    per-sender attribution or Pause). Its fields are ordinary bindings to `api.<graphic>.<field>`
    paths, so no persisted format changed (show-fixture-compat proves an older record with such
    bindings still reads and plays). The group is the graphic's name, made unique against other
    graphics' groups; a connected field keeps its path.
  - Connect data… gains an "Another system" button beside Read: nothing to read, every field is
    offered its path keyed by its field, so the review proposes the whole graphic; the mapping
    table, repair, "Used by", the preview monitor and the one confirmation are the Sheet's.
    `connectApiFields` (shows.ts) is the write, through the one binding path (prepared-message
    fields refused). The connected field says "Another system", names its path, and has
    Disconnect.
  - The card is on the Data view under Production data: published, the address, the key behind
    Reveal and Copy (moved here from the panel's "▾ Data key", so there is one place), the
    receipt and Pause/Resume read from the row every 2 s while open, the connected paths, a curl
    example that reads the key from `$NOACG_DATA_KEY`, and "⬇ For the sample sender" (address,
    example body, which field each path fills; never the key). Local, it says publishing is the
    step, with the page's own Publish on the card. A team member without the key is told it is on
    the owner's view.
  - Pause is on the control slug (`control_data_pause_by_slug`, anon and authenticated like
    `control_data_patch_by_slug`); `control_data_owner_patch` is authenticated only. The judgement
    is in ACCEPTED_CLASSES and the three entries in the advisor baseline (186), with a line in
    `docs/STACK_FRESHNESS.md` (lesson 1).
  - The sample sender (`scripts/data-sample-sender.mjs`) reads one local synthetic file, names its
    records after the destination labels, sends one patch and prints the receipt; a failed
    acquisition (missing, cut off, no records, a non-scalar value) or a report naming no field
    sends nothing; the key comes from `NOACG_DATA_KEY` and is never printed. A path through a list
    index (only possible when bound by hand under Advanced) is in neither the card's example nor
    the sender's patch, since a merge patch would replace the whole list; generated segments never
    look like an index (`2026` becomes `n2026`). Names match in any
    script, and two records that read as one name (or a name of punctuation only) fill no field
    (from the PR's automated review: an ASCII-only match sent one record's value to every
    non-Latin field). Fixtures are an
    unfamiliar custom "Riverside count" board and invented count-night numbers, labelled
    synthetic.
  - "Offline e2e: the receipt": the offline suite has no backend, so it cannot hold a receipt;
    it covers the card, the Connect flow, the example and the sender file, and the receipt's
    words are in `data-pause`; the receipt within 5 s is the configured walk.
- **Files beyond the phase's list, and why.** `api/_lib/dataIngest.ts` (the held answers),
  `src/control/productionDataSession.ts` and `scripts/production-data-session.test.mjs` (the
  owner's Data view names its production, so it takes the owner's door),
  `src/control/anotherSystem.ts` (new: paths, example and words, Node-testable),
  `src/control/productionDataApi.ts` (read the row's Pause and receipt; the Pause RPC),
  `src/model/shows.ts` (`connectApiFields`), `src/components/home/ProductionDataPanel.tsx` (the key
  moved to the card; API values grouped as "Another system" in the overview),
  `src/components/home/ProductionPage.tsx` (hands Publish to the card), `src/styles/feedback.css`
  (the example block), `docs.html` (the /docs page renders the Data API section itself),
  `scripts/supabase-advisors.mjs`, `supabase/advisor-baseline.json`, `docs/STACK_FRESHNESS.md`
  (lesson 1), `scripts/data-pause-conformance.mjs` and `scripts/fixtures/data-sample/`.
- **Pre-existing failure found.** `e2e/production-data.spec.ts` "Connect closes only once the save
  landed" fails 4 of 4 on `origin/main` (`503b029`) on this machine and 1 of 2 on this branch: the
  app's "Could not save" dialog covers the second Connect. Filed as #1603; not this row's.
- **Traps.**
  - `bootstrapGraphic`'s `name` is the catalog VARIANT, not a name for the graphic.
  - A plpgsql `case ... when ... then perform` is a statement and needs every branch, so the
    self-check's unknown step raises.
  - The local stack started before the migration file existed; `supabase@2.111.0 migration up`
    applies a new file to a running stack.

## Row 11, data-sources C4: Feeds

- **Repair, 2026-10-22 (P11 repair 1, the check's FAIL on `ed8394c`).** `childrenOf` copied an
  item's child list on every append, so same-name direct children were quadratic (0.7 MB took
  98 s; 5 MB about an hour, past `maxDuration`). It now pushes in place: 5 MB in 0.35 s. The audit
  of the rest of the parser found one more rescan: `plainText` split on a lazy CDATA regex, which
  rescanned the 16 KB title cap from every unclosed `<![CDATA[` (1.3 s for 5 MB of such titles);
  it now scans forward with `indexOf` (0.25 s). Both shapes joined the 5 MB hostile-markup test
  under its 2 s bound. No time check was added inside the parse: it could only sit between items,
  and the shapes that went quadratic were inside one item; linearity is pinned by the test instead.
- **Previous verified `main` sha:** `570da40a4e32fc6b0876d109fa41e679eb5490c1` (row 10, C3, #1593
  and repair #1594). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0099 is additive and stays applied:
  `feed_cache` is then read by nothing, and `control_data_tick_due` keeps listing feed sources,
  which a reverted tick reads as Sheets and fails harmlessly (`readSheet` of an undefined id; the
  outcome is recorded as failed and nothing is written). Remove feed sources from productions
  (Disconnect) before reverting if any exist; a reverted page ignores them otherwise.
- **Q record used.** `docs/work-specs/data-sources/evidence/feeds.md` and its six fixtures, cited
  for markup and conditional requests: the parser is tested on every fixture (CDATA titles of the
  Node.js blog, `&#39;` in the GitHub releases, emoji and the `media:` namespace of YouTube, the
  Vercel blog's escaped `&lt;script ...&gt;` read as text, PyPI identified by link, Yle's
  `<ttl>5</ttl>`); the record's advice is taken: the reader honours `<ttl>` and `max-age` as lower
  bounds on the 5-minute floor, the size cap (5 MB, decompressed) sits above the Vercel blog's
  3.9 MB whole feed, and an oversized or failed read keeps the last good list.
- **Receipt.** `docs/work-specs/data-sources/evidence/feed-real-receipt.md`: Yle through the
  emitted data function on the local stack (CLI 2.111.0, every migration through 0099 from an empty
  database): 200 with 11 headlines and a weak ETag; a second read served from the row with no
  request; after the wait, a conditional request answered 304 with the headlines unchanged.
- **Decisions.**
  - The route is `GET /api/data/feed?url=<address>`, a public segment of the data catch-all (one
    segment deep; no new function). It answers `{ ok, items, fetchedAt }` (headlines only), or
    `{ ok: false, error, fix, failingSince }` with the last good headlines when there are any.
    One client is refused after 30 reads a minute (`checkFeedIpRateLimit` in
    `api/_lib/rateLimit.ts`, in-process and per instance as the other data gates, `FEED_RATE_MAX`
    to tune); one address is fetched at most once every 5 minutes whatever the readers. A client
    that leaves ends only its own wait, never the fetch other readers are waiting on.
  - The guard (`api/_lib/feedFetch.ts`): http and https only, on their own ports, no credentials;
    the name is resolved by the reader itself and EVERY answer must be public (a name answering one
    private address is refused whole); the connection is pinned to the checked address through the
    request's own `lookup`, so TLS still checks the certificate against the name; every redirect is
    checked the same way, at most 5 (the validators go only to the same site); the body stops at
    5 MB after decompression (`stream.pipeline`, so an abort ends the decoder too) and the read,
    every lookup and redirect included, at 10 s. IPv4 is connected first when a name has both, as
    a function may have no IPv6 egress. The page runs the same address check before asking
    (`normalizeFeedAddress` lives in `src/control/feedSource.ts` and the route imports it). Public means: IPv4 outside the special ranges (private, shared,
    loopback, link-local with the 169.254.169.254 metadata address, documentation, benchmarking,
    multicast, reserved); IPv6 only inside global unicast 2000::/3, minus Teredo and protocol
    assignments, documentation and 6to4, so loopback, unique-local (fd00:ec2::254), link-local,
    IPv4-mapped and NAT64 forms all fall outside. A refused address answers 400, from the row too
    (`refused`), and is not looked up again for 5 minutes. A row whose wait ended a day ago is
    deleted at the next fetch (any address in use is fetched at least hourly), so addresses
    nobody reads do not pile up.
  - Politeness: the wait after a read is the 5-minute floor, or longer when the feed asks
    (`<ttl>`, `max-age`, a `Retry-After` on a refusal), never longer than an hour. ETag and
    Last-Modified go back only for headlines in hand. Headlines: titles as plain text (entities
    decoded once outside CDATA, so escaped markup in a text title stays text; CDATA and Atom
    `type="html"` read as HTML), each item once by guid/id or link, newest first when every item is
    dated (else feed order), 20, at most 300 characters.
  - The shared cache is `feed_cache` (0099), keyed by the SHA-256 of the normalized address, with
    the two lease times defaulting to the epoch so the claim is one conditional update
    (`claimed_until < now and next_allowed_at <= now`) through the service-role client, as the
    spec says; no SQL function, so no new advisor class. A reader that loses the claim serves the
    stale row; before any first read it waits for that read to settle (looking at the row after
    250 ms, then twice as long each time up to a second, never longer than the read's own time),
    so two readers at once make one fetch.
  - The browser reader reuses the Sheet reader: `createSheetReader` gained `read`, `everyMs`,
    `renewMs` and `timeoutMs` options. A feed asks the route every 5 minutes and renews its claim
    every 30 s in between, because the published row holds any lease at most a minute (0097):
    without the renewal the tick or another tab would take the feed while the page is open. The
    lease is three renewals (`leaseOf`, 90 s for a feed, 15 s for a Sheet as before); Connect and
    Resume read at once. One `FEED_CADENCE` and `FEED_LEASE_MS` in `feedSource.ts` feed both the
    reader and the published lease. Feed paths are `feed.<id>.lines` (the spec's content line);
    `sourcePrefix(id, kind)` takes the kind, and `isSourcePath`/`sourceIdOf` know both prefixes.
  - The tick lists feed sources (0099 widens `control_data_tick_due`, same signature and grants)
    and reads them through `readFeed`, never with its own fetch; their rows keep the label
    `'sheet'`, which names the server tick, not the kind (widening `control_data_apply` again for a
    word was not worth a second copy of its body).
  - "Connect… News feed" is the ticker's existing Connect data… box: on a graphic whose shape is
    `lines`, a pasted address that is not a Sheet link is read as a feed through the route, and
    the review, mapping, "Used by" and one confirmation are the Sheet's. The Playout sources line,
    the Data overview and the connected-field mark name the kind ("News feed: …", "about every
    5 min"); a connected feed list says "Connected to News feed: …" with Disconnect, as there is no
    source to edit.
- **Files beyond the phase's list, and why.** `src/control/sheetSource.ts` (the reader's `read`,
  cadence and lease options, kind-aware leaves), `src/control/hostedControl.ts` (the published
  lease's length), `src/model/productionData.ts` (the `feed.` prefix), `src/model/shows.ts`
  (`FeedShowSource`, `fillsFields`, `sourceKindWord`), `src/components/home/ProductionPage.tsx`
  (starts a feed's reader beside the Sheet readers), `SourcesLine.tsx` and
  `ProductionDataPanel.tsx` (show feeds, with their cadence), `ProductionAudienceWorkspace.tsx`
  (one type guard the new union needed), `api/_lib/dataTick.ts` (the tick reads feeds),
  `api/_lib/rateLimit.ts` (the feed route's per-client limit beside the other routes'), and
  `scripts/supabase-advisors.mjs` with `supabase/advisor-baseline.json` (`feed_cache`'s deny-all,
  lesson 1 of the run). Each is the smallest change that puts the feed on the reader and the tick
  the spec names.
- **Mutation checks** (each mutation turned its test red, then was reverted): floor 5 to 4 min;
  the hour cap 60 to 120 min; timeout 10 to 11 s (the test is cancelled: the read never ends at
  10 s); redirects 5 to 6; body 5 MB to 6 MB; claim 20 to 30 s; items 20 to 25; title 300 to 400;
  address 2048 to 4096; client limit 30 to 60 a minute; first answer checked instead of every
  answer; a second lookup at connect time instead of the checked address; redirects not
  re-checked; validators not sent; dedupe off; a failure dropping the last good headlines; the
  browser cadence 5 to 1 min; the lease 3 renewals to 2; the renewal 30 to 60 s; Resume not
  forcing a read; a failure with headlines read as success; the prune age 24 to 48 h; a refusal
  not kept on the row; IPv6 connected first; validators sent across sites; the lookup outside the
  read's time (the test is cancelled); a headline cut by UTF-16 units; and, in the configured
  walk, an insert that claims whether or not it won (two upstream fetches).
- **Check.** Review (delegated, high): 10 findings, all confirmed and fixed (decoder not ended on
  abort, published lease lapsing between reads, unbounded rows, IPv6-first connect, refusal status
  lost from the row, lookup outside the timeout, validators across sites, the route's wait ignoring
  a client gone, surrogate-splitting cut, a defaulted prefix kind). Simplify (four delegated
  angles): the feed cadence and lease in one place, the reader plan carries the kind, one address
  check for page and route, the rate limit as a `rateLimit.ts` pair, shared `sha256`, patch
  builders and a regex cache in the parser, one read path in Connect. Skipped: a shared byte-cap
  helper with C2's `cappedFetch` (would reshape C2's tested path), a `sourceShape` helper (two
  call sites), a longer renewal (30 s keeps margin under the one-minute row lease).
- **Assessment A** (a fresh read-only session with the `/so` brief, on `45f7cf91`): AGREE WITH
  CORRECTIONS. Its four corrections are in: (1) the parser was quadratic on hostile markup (its
  lazy regexes rescanned to the end from every unclosed tag; 400 KB of `<item>` took 5 s), which
  could hold the public route and the tick; it now scans forward only (`indexOf`, an element
  without its end stops the scan, a headline's markup is read up to 16 KB), and `feed-fetch` feeds
  it nine 5 MB hostile documents, each under 2 s (slowest 352 ms; the old comment regex turns it
  red); (2) a tick cut-off was saved as the feed's failure for every reader for 5 minutes; a read
  the caller cuts short now lets only the claim go; (3) the real connection had no test; two now
  run `nodeFeedNet` against a local server, one reaching it only through the pinned address under
  an unresolvable name (with gzip), one proving a stalled compressed body ends at the abort (both
  red when the `lookup` or `pipeline` is removed); (4) the never-written `updated_at` column is
  gone from 0099. The real receipt was repeated on the final code with the same result.
- **Codex review** of `90033f8` (two P2 findings, both regressions this branch introduced, both
  fixed in `a142a68` with a test that fails on `90033f8`): the forward-only parser no longer read
  an Atom feed written with a namespace prefix (`<atom:feed>`, `<atom:entry>`), so such a feed
  would read as empty and clear the ticker; the prefix is now taken from the root and used for the
  entries and their children. And a 304 forgot the feed's own `<ttl>` (only the body carries it),
  dropping an hourly feed to every 5 minutes; 0099 gains `feed_wait_ms`, kept with the headlines
  and applied after a 304 (and kept as at most an hour, so any `<ttl>` fits the column). Its
  re-review of `f665175` found two more, also fixed with tests that fail on `f665175`: an item's
  metadata was the first matching substring, so a `<title>` inside a description's CDATA could
  replace the headline; items are now read as their DIRECT children with CDATA masked, and a
  stray unclosed tag cannot hide the rest of the item. And a 200 body cut off early parsed as an
  empty feed and cleared the ticker; a document without its root's end is now a failed read that
  keeps the last good headlines (a feed with no items still ends its root and reads as empty).
  The final parser read three live feeds (Yle 11, PyPI 20, GitHub releases 10 headlines) and the
  hostile 5 MB set, now twelve cases, stays under 2 s each.
- **Traps.**
  - A lazy regex over a body someone else wrote is a denial of service at 5 MB; scan forward.
  - `node:http`'s `lookup` option must answer both shapes (`all: true` gets an array); a typed
    `LookupFunction` cast keeps the root tsconfig's check.
  - The configured walk replaces `feedNetwork.current` in the route's own process, so the guard
    still resolves and checks every address; the stub answers only the checked public address.
  - A local Supabase stack runs on a cloud machine once `dockerd` is started by hand; `supabase@2.111.0
    start -x studio,edge-runtime` then applies every migration from empty.

## Row 10, data-sources C3: Sheet messages and YouTube

- **Repair, 2026-10-22 (P10 repair 1, the check's FAIL on `a868bc5`).** Post-landing run 39706145334
  failed in Advisors after 0098 applied: `audience_operator_settle` for `anon` and `authenticated`
  was not in `supabase/advisor-baseline.json`. The judgement is now in `ACCEPTED_CLASSES` in
  `scripts/supabase-advisors.mjs`, the two entries were added by hand (180 to 182; re-recording reads
  production, which only that workflow does) and `docs/STACK_FRESHNESS.md` says why. No migration or
  product code changed. The flaky `e2e/production-chat-intake.spec.ts:311` the check also saw is filed
  as its own issue.
- **Previous verified `main` sha:** `4890bbdfd272dcf524b03a63a0de92cd86f0aede` (row 9, C2, #1591 and
  repair #1592). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0098 is additive and stays applied:
  a reverted build calls `audience_list` and `audience_operator_add` with the same arguments,
  reads their columns by name (ignoring `withdrawn_at`) and never calls `audience_operator_settle`.
  YouTube entries already saved in `Show.sources` are skipped by the reverted server tick (0097's
  due query reads `kind = 'sheet'` only) but a reverted page would start a Sheet reader for them that
  fails harmlessly; remove them in Messages before reverting if any exist.
- **Q record used.** `docs/work-specs/data-sources/evidence/youtube.md`, both halves: a key alone
  reads public comments and live chat (so both modes are promised); comments are fetched with
  `order=time`, `textFormat=plainText`, `maxResults=100` and sorted by their own `publishedAt`
  (the record's first slot held a 2020 comment); live chat's first page is history (68 messages
  over 7.6 minutes) and is delivered marked earlier; the API hinted 2,853 to 3,145 ms, so the 5 s
  floor sets the pace: 60 units a minute, 3,600 an hour, the 10,000-unit day lasting 2 h 46 min
  (the spec's "about 2 hours 45 minutes"; the line shows the computed 2 h 46 min). Error shapes
  used: 404 `videoNotFound` and 401 `authorizationRequired` as recorded; `quotaExceeded`,
  `commentsDisabled` and a bad key in the API's documented shapes. Tests run on synthetic fixtures
  (`scripts/fixtures/youtube/`) with the record's shapes, counts, intervals and times and invented
  text; no live call was made in this phase (0 units of the shared key).
- **Decisions.**
  - A message Sheet is a `sheet` source with `inbox: true` (Messages, "Message Sheet"), read by the
    page's one reader under its lease; `src/audience/sheetMessages.ts` is the inbox consumer: rows
    to candidates by the audience spec's identity (a cyrb53 hash of Name, Message, Source and
    Reference plus `#<occurrence>`, external id `sheet:<source id>:<hash>#<n>`), arrivals through
    `addCandidates` at most 100 a call, then `settleImported` with the tab's whole id set. Only the
    tab's first row names columns (Message required; Name, Source, Reference optional, with the
    staging titles as synonyms); Source becomes provenance `Sheet: <label> · <cell>`, Reference the
    private note. At most 2,000 messages a tab; more is said.
  - Vanished rows: the backend gained one method, `settleImported(prefix, present)`: an unused
    candidate under the prefix whose id is not present leaves the inbox; a used one is kept with its
    original and marked `withdrawnAt` ("no longer in the Sheet"); a returning row is unmarked.
    Published, it is `audience_operator_settle` (0098), keyed on the control slug, bounded at
    2,000 ids, refusing any prefix that is not `sheet:<id>:` so it can never touch a paste, a
    YouTube item or another Sheet. A column was needed so every operator page sees the mark, not
    only the reading page.
  - The unique index per show on `external_id` (partial, built concurrently, file safe to re-run
    from the top), and `audience_operator_add` now inserts `on conflict do nothing`: two calls
    adding one id at once give one row and neither fails (proven on a scratch Postgres with two
    sessions: the second waited, skipped the clash, and still added its other item).
  - YouTube sources are `Show.sources` entries of a new kind, `{ kind: 'youtube', config:
    { videoId, mode: 'comments' | 'chat' }, inbox: true }`; the record never holds the key.
    `ShowSource` became the union `SheetShowSource | YouTubeShowSource`; every reader that needs a
    Sheet narrows by `kind` (the Playout sources line and the Data overview show Sheets only; the
    cue editor's "Use existing content" lists Sheets only; the page starts Sheet readers only).
  - YouTube lines and comments go through the OPERATOR door (`addCandidates`, the published
    `audience_operator_add`), not the viewer's `submit`: they need no open audience and dedupe by
    `yt:<platform id>` in the database. Twitch keeps the viewer door unchanged
    (`twitchChat.ts` untouched). The platform word is provenance (`YouTube comments`,
    `YouTube chat`, `YouTube chat · earlier`), never in the name.
  - The key: memory for the tab, browser storage only with "Remember on this browser" (unticked by
    default). On reload a remembered live chat reconnects by itself; without the key Messages shows
    "Key needed" on the source. Live chat is read by ONE tab per browser (a 15 s claim in browser
    storage, renewed every 5 s, only by a tab that has a key), because the Playout tab and the
    Messages tab both run the production page and each poll is quota.
  - The quota line: comments "1 unit of your key's 10,000 a day"; live chat "about 3,600 units an
    hour ... about 2 h 46 min"; while chat runs, "About <h min> of chat left today, counting this
    browser's use since midnight Pacific time; other users of the key are not counted" from a
    per-browser spend record (`{ v: 1, day, units }`, day in `America/Los_Angeles`).
  - The cue editor's "Fill from… Pick a message" shows each candidate's provenance; Sheet and
    YouTube candidates reach it because they are ordinary candidates.
  - Duplicates already in production (owner decision path: the coordinator ruled that this row does
    not read production, and the migration must succeed either way): before the unique build, 0098
    clears `external_id` on every later duplicate, keeping the first row's id. The duplicate keeps
    its row, text and moderation and becomes an ordinary candidate no source settles; nothing is
    deleted. Proven on a scratch Postgres seeded with three rows of one id (one used) and one
    unique: the index built valid, the first kept the id, the used flag survived.
  - A message Sheet's source id is stable per tab (`msg-<hash of sheet id and gid>`), so removing
    and connecting it again finds its candidates instead of adding every row again; a tab already
    followed for fields keeps its own id and gains the inbox.
  - Only the lease's holder feeds the inbox (`sheetSource.ts` calls the consumer after the settle
    is kept): an old owner's late read can no longer put back what the new owner took out.
  - The inbox consumer seeds what the inbox holds on its first read, without withdrawn rows, so a
    reload re-sends nothing and a row restored while no page was open is unmarked.
  - Leaving a production stops this tab's YouTube chats for it and releases their claims; a
    comments answer that lands after its source was removed adds nothing.
  - Messages from a Sheet keep arriving only while a page of the production is open: the server
    tick (C2) reads Sheets for fields, not for the inbox. Not in C3's acceptance; said here so C7
    does not expect closed-page messages.
- **Extra files** (beyond the named ones), each needed by the union type or the backend method:
  `src/model/shows.ts` (the union, `addMessageSource`, `removeMessageSource`),
  `src/audience/audienceTypes.ts`, `src/audience/localAudience.ts`, `src/audience/audienceData.ts`
  (`settleImported`, `withdrawnAt`, `OPERATOR_SETTLE_MAX`), `src/components/home/ProductionPage.tsx`
  (the inbox consumer on the page's Sheet readers, Sheet readers only, the YouTube hook),
  `src/components/home/SourcesLine.tsx` and `src/components/home/ProductionDataPanel.tsx` (Sheets
  only), `src/control/sheetSource.ts` (the inbox fed only by the lease holder, with its test in
  `scripts/sheet-source.test.mjs`), `scripts/message-staging.test.mjs` (the interface list gains `settleImported`),
  `scripts/audience-identity-migration.test.mjs` and `scripts/fixtures/youtube/`.
- **Recorded responses.** The C3 row asks for recorded responses; the repository may hold no comment
  text or author name, so `scripts/fixtures/youtube/` carries the Q record's shapes, counts,
  intervals and times with invented text. That is the departure from the wording, for its intent.
- **Assessment A** (fresh read-only session, `/so`): AGREE WITH CORRECTIONS; the three code
  corrections and the two-cue journey are in, the rest is weighed in the PR.
- **Traps.**
  - `on conflict (show_id, external_id)` inside a `RETURNS TABLE (... external_id ...)` function is
    ambiguous (42702) and an index target cannot be table-qualified; `#variable_conflict
    use_column` fixes it. Only the self-check that CALLS the function caught it (supabase/AGENTS.md).
  - The chat spec's `productionFor` returns nothing; use `openProductionWithCurrent` for an id.
  - `production-chat-intake` "the throttle and the dedupe" failed once (`0 in · 14 dropped`) while
    the machine also ran mutation tests; it passed in the 7 runs before and after. Not reproduced,
    not chased.

## Row 9, data-sources C2: published ownership and the server tick

- **Repair, 2026-10-21 (P9 repair 1, the check's FAIL on `b05bd28`).** The Q record bullet below
  said each guard was tested; two were not. `maxDuration` 30 for `api/data/[...path].ts` and the
  `* * * * *` `/api/data/tick` cron were checked by nothing, and the 26 s cut-off was asserted
  against `READS_END_MS` itself. `data-tick` now reads `vercel.json` and pins both values, and the
  late-read test expects a literal 7 000 ms (26 s less 19 s). Mutation-verified red: 30 to 300,
  the cron removed, the cron to `*/5 * * * *`, and `READS_END_MS` 26 000 to 29 000. Still tested
  by nothing, holding by reading only: the no-`sources`-column fallback in `hostedControl.ts`
  (`PGRST204` in `writePublishedSources`, `PGRST204`/`42703` in `firstPublishedSources`); a Node
  test would need a stub Supabase client for a browser module, more than this repair should add.
- **Previous verified `main` sha:** `63edc790b8bf0dccee0b82c93fc776baaae39c5e` (row 8, C1c,
  #1585). This branch starts there.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0097 is additive and stays applied:
  a reverted build no longer writes `control_shows.sources` or calls the lease functions (the
  column keeps its last value and nothing reads it), and its browser readers go back to the
  localStorage lease. Turn the tick off first if it is on
  (delete the `data_tick_until` system setting): a reverted `vercel.json` drops the cron anyway.
- **Q record used.** `docs/work-specs/data-sources/evidence/tick-cost-estimate.md`: its ceiling
  ($55.53 to $79.78 a month if every tick burned 30 s of CPU) is above the $20 credit, so the
  safety rests on four guards, each in code and each tested (`maxDuration`, and the 26 s cut-off
  below, only since the repair above): the 10-second read timeout
  (`SHEET_TIMEOUT_MS`, `data-tick` "cut at 10 s"), no read started after 20 seconds
  (`NO_NEW_READ_MS`, "no read starts after 20 seconds"), `maxDuration` 30 for
  `api/data/[...path].ts` in `vercel.json`, and the switch's expiry, at most 48 hours ahead
  (`dataTickOnAt`, `data_tick_on()`; the record bounds a runaway 48-hour window at about $5). Its
  advice is also taken: reads run four at a time, and a tab over 1 MB is not read. One more guard
  came from the review: a read started late gets only the time left before 26 s
  (`READS_END_MS`), so its write, the release and the run's record still fit inside the 30 s.
- **Receipts** (`docs/work-specs/data-sources/evidence/sheet-timed-published.md`), on the local
  stack with the owner's sixth test Sheet through the service account, at `169b090`: with an
  operator page open, 20 of 20 API edits on the published output within 10 s, median 3.4 s,
  slowest 5.6 s (sheet AC-3 published); with every operator page closed and the tick called on the
  minute, 6 of 6 edits on the published output in 25.6 to 60.0 s (sheet AC-4); each recorded tick
  run took 1.1 to 1.4 s for one to three sources. Nothing was taken, advanced or removed.
- **Decisions.**
  - The row carries `sources` (0097) beside `bindings`. Publish writes both; Connect, Disconnect
    and Pause write both again at once (`writePublishedSources`, from one effect in
    `ProductionPage.tsx` that skips the value the page opened with or published), so a field connected after
    publishing moves the output with no new publish. A direct column write through the owner's
    row policy, as DS17 says: no RPC.
  - The published lease is on the row: `control_source_reads` holds the owner, claim, expiry,
    snapshot, content fingerprint and status of each published source. `control_source_lease` is
    the one lease function the browser readers (on the control slug), the tick (service role) and
    later E4 call. The claim decides, not the owner's name: a live lease is renewed only with its
    own claim and let go (ttl 0) only with it, so a duplicated cron call, which shares the name
    `tick`, can neither take over nor release the other run's lease. The lease answer also carries
    the row's Pause, so a Pause made on another device holds this page's reader too. The write is `control_source_commit` (browser, through
    `control_data_patch_by_slug` with all its guards) or `control_source_tick_commit` (service
    role only, `control_data_apply` labelled `'sheet'`), both through `control_source_settle`,
    which checks the claim and writes under one row lock. That closes C1b's low note: an old
    owner's write in flight across a handover is refused by the database, not by a browser check.
    The write takes changed paths as text by path; a path the row does not bind yet, or one that
    0088's rules for a press would refuse (an object a feed wrote there, a branch above it that is
    not an object), is left out and keeps its earlier snapshot, for both labels, so the tick can
    never erase what the operator's door protects. That replaced C1b's
    "not a bound path" strip-and-retry in `productionDataSession.applySourcePatch`, whose published
    branch is gone (`holdServerTree` takes the server's answer instead).
  - `control_data_apply` accepts the label `'sheet'` (0071's body, one word wider): the tick's rows
    ride the ordinary 50-per-5-s cap, never the API's ingest budget.
  - The reader (`sheetSource.ts`) now talks to a `SheetLeaseDoor`: this browser's storage while
    unpublished (C1b's rules, unchanged and still tested), the row once published
    (`publishedLeaseDoor` in `hostedControl.ts`). The status rules (`missedStatus`, `readStatus`)
    and `changedTexts` are exported so the tick (`api/_lib/dataTick.ts`) uses the same core:
    read, adapters, diff against the shared snapshot, staleness after three misses. Only the
    panel's ftype to field-kind map is restated in the tick (the converter lives in a client
    module), without hidden fields as the browser reads them; `data-tick` pins the two against
    `fieldDescriptors`.
  - `sheetSource.ts` and `contentFormats.ts` import each other by `.js`, because the function's
    emit keeps the specifier; the Node tests that load them import `scripts/lib/tsResolve.mjs`
    first, one resolve hook for `.js` and extensionless specifiers under `src/` and `api/`. Their type imports moved off `model/packets` to
    `model/types` so the function's typecheck does not pull in browser storage code.
  - The tick (`/api/data/tick`, GET): 401 before anything else without the exact
    `Bearer <CRON_SECRET>` (as `api/render/cleanup.ts`), then the switch, read uncached and off on
    any error; on, it takes up to 50 due sources (published, Sheet, unpaused, no live lease, least
    recently read first), reads each under its own 30-second lease, writes what changed, keeps the
    status, lets the lease go, and records the run (start, wall-clock duration, each source's
    outcome) through `control_data_tick_record`, which keeps seven days.
  - The switch is the `data_tick_until` system setting, `{ "until": "<ISO>" }`; nothing writes it
    in this PR, so it ships off. `data_tick_on()` restates the rule in SQL for the sources line.
  - The sources line says `read by the server` when the tick holds the lease, and
    `closed-page reading off` while published with the switch off; the source details say about
    once a minute by the server, or that closed-page reading is off.
  - A page going away (`pagehide`) lets its leases go: the reload journey found a reloaded page
    showing "read in another tab" for up to 15 s, its own previous page's lease. Published, the
    release is a keepalive request straight to the RPC, because a reload cancels an ordinary one.
  - The value a page opens with (or publishes) is never written to the row, so a page holding an
    older copy cannot overwrite newer sources (assessment A, medium); every change after it is,
    including a return to that first value. Comparing later values with the first one dropped a
    Resume back to it and left the row paused (review, fixed; the configured walk pauses and
    resumes around it). One writer per published production (`latestWriter` in `sheetSource.ts`)
    sends one write at a time with the newest value last, so a slow Pause cannot land after the
    Resume that followed it. Plans are compared as canonical JSON (`publishedRecord.ts`
    `canonical`), since a record read back from the server reorders its keys.
  - `control_shows.sources` is NULL until first written (0097 adds it with no default): a row
    published before it holds no sources, and the page opening it writes its own once
    (`firstPublishedSources`, an update conditional on sources still being NULL, retried under the
    same condition), so it never replaces sources another page wrote meanwhile; a written row, even
    an empty one, is never overwritten on open.
  - Trap: React runs each effect twice in development with its refs kept, so "skip the first
    value" must treat that first value, seen again before any change, as no change. Without it the
    dev server wrote the opening value at once and hid both this and the never-written case from
    the configured walk (found by mutation). A failed write is
    tried again every 10 s while the page shows it (said once); a write that matches no row (signed
    out) counts as failed. A change whose write was lost to a reload reaches the row at the next
    publish.
  - A lease the page cannot reach (offline, or an instance that has not run 0097) is a missed read
    with its reason, so the line goes stale rather than silent.
  - The advisor baseline gains the six findings the migration adds by design (deny-all on the two
    tables, the two slug functions callable by the client roles, like every `control_*` slug
    function). If the hosted advisor words one differently, post-land reports it once and the
    baseline is re-recorded.
  - Not done: a field bound after publishing to a path that already holds its value (explicit
    sharing through "Use existing content…") shows it at the next Take or Update, or when the cell
    next changes; the server writes update rows on a data change, not on a binding change. Every
    new connection's own source paths are written at once.
- **Extra files.** `src/components/home/ProductionPage.tsx` (the published door, the at-once write,
  `pagehide`), `src/components/home/SourcesLine.tsx` (the server reader and the switch-off words,
  sheet AC-4), `src/control/productionDataSession.ts` (the writer entry: `holdServerTree`, the
  published branch removed), `src/control/contentFormats.ts` (two import specifiers),
  `scripts/content-formats.test.mjs` and `scripts/show-fixture-compat.test.mjs` (the resolve hook),
  `scripts/lib/tsResolve.mjs` (the hook itself, shared), `src/model/publishedRecord.ts` (exports
  `canonical`), `scripts/production-data-session.test.mjs`,
  `supabase/advisor-baseline.json`, and the receipt `evidence/sheet-timed-published.md`.
- **Traps.**
  - A `Request` trims a header's trailing whitespace, so `Bearer <secret> ` reaches the handler as
    the exact Bearer; that is the platform, not the check.
  - The configured tick is driven in the Playwright process with the stack's test secret: the dev
    server carries no `CRON_SECRET`, and only this process can answer the tick's own Sheet fetch.
  - The receipt drivers ran from the scratchpad with their own Playwright config: a broader queue
    job refuses an untracked spec in the tree and a second admission on the same source state.

## Row 8, data-sources C1c: Data overview, sources line, real-Sheet receipts

- **Previous verified `main` sha:** `ebbdc78` (row 7, C1b, #1578). This branch starts from
  `b9a32b8` (#1582, two hosted-latency fixes on top of it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted format change:
  the overview, the Advanced disclosure and the sources line are presentation only, and the reader
  change only stops one duplicate report. A reverted build shows C1b's line in the cue editor again.
- **Receipts** (`docs/work-specs/data-sources/evidence/`), made in this cloud session against the
  owner's test Sheets 3 to 5 through the service account, the app's offline dev server and
  Playwright Chromium through the session's egress proxy; no Sheet ID is recorded:
  - `sheet-real-receipt.md` (data AC-13 real-Sheet half, sheet AC-1): a non-first tab previews on
    the ticker 871 ms after Read; starter rows round-trip; a renamed tab keeps reading; a link with
    no tab asks; a deleted tab says so with the fix, goes stale, and the values on air hold.
  - `sheet-timed-local.md` (sheet AC-3 local program): 20 of 20 API edits on the local PROGRAM
    within 10 s, median 3.2 s, slowest 5.25 s; no new entrance, nothing taken, advanced or removed.
  - `sheet-custom-slots.md` (AC-13 custom scalar part): a nine-slot custom bracket's own data
    template, imported as text, reordered and relabelled, connects every slot by Field ID in one
    confirmation; text is kept exactly (`007`, `=1+1`, quotes, Unicode, an emoji); one cell changes
    one slot; duplicated and missing keys are diagnosed and held.
  The receipt drivers were scratch Playwright specs run through the job queue and are not
  committed: the evidence files carry the method. The receipts' tabs were deleted afterwards.
- **Decisions.**
  - The Data view opens on an overview (`DataOverview` in `ProductionDataPanel.tsx`): one block per
    source (Sheet name, checked and changed, who reads it and how often, the graphics following it,
    Pause) with its values by the Sheet's own names, then "Local content" with no freshness words,
    since nothing reads it. Scalars are typed into there (the same deferred box and one write as
    Advanced, so D4's typed value is on the default surface); a list shows its line count and is
    edited in the Sheet or under Advanced. Each table says which graphics load it.
  - Everything that speaks of paths, the seed, Raw JSON or bindings sits behind one closed
    `<details>` "Advanced" (`data-advanced`, toggle `data-advanced-toggle`), unchanged inside. The
    data key stays in the header: it is the API source's credential, not a path tool. The Tables
    copy no longer says "bind".
  - `SourcesLine.tsx` owns the line's words (`statusWords`: checked N s ago · changed N s ago,
    paused, empty, the failure since a time; `readerWords`: this page or another tab, about every
    5 s) and Pause (`toggleSourcePause`, which reads at once on Resume). It renders one line per
    source of the production at the top of the Playout control area, whichever cue is selected,
    and nothing without sources (so the playout baselines, which have none, do not move). The
    overview reuses the same words.
  - The cue editor keeps only what belongs to the graphic: a connected field it no longer has,
    with Disconnect. The source's own health moved to the line, so it is not drawn twice.
  - Not done: a sticky line. At 720 px tall the control area can scroll the line out of sight
    (Connect left it 42 px scrolled once); the connected-field marks still say stale. Sticky would
    cover the editor while scrolling and needs a stylesheet change outside this phase.
- **Extra files.** `src/components/home/CueEditor.tsx` (the line moved out of it; the phase text
  says C1c moves it). `src/control/sheetSource.ts` and `scripts/sheet-source.test.mjs`: the custom
  slot receipt found a duplicated Field ID reported twice, the second time as missing; it is now
  reported once (`SheetContent.doubled`), mutation-tested. `e2e/production-audience.spec.ts` and
  `e2e/configured/production-data-key-dispatch.spec.ts` open Advanced before using the per-field
  table and the add-a-value row. `src/control/cueData.ts` exports `datasetMatches`, the cue loader's own
  column test, so a table's "Loads into" can never disagree with what a cue offers.
- **`/check` review fixes.** Only graphics still in the pool are named as showing or following a
  value (bindings outlive a removed graphic); a data template's Field ID reads as the field's title;
  a Sheet's lines stay a list when emptied; the overview shows a read's problems; values a
  disconnected Sheet left in the tree are not called local; a source not read yet says it waits for
  the first read. Not taken: a `FieldControl` box on the overview (the overview mirrors the
  Advanced rows, which are tree values, not graphic fields); generalising `doubled` into a map of
  withheld leaves (one cause today); memoising the overview's scans (tens of values).
- **Traps.**
  - The graphic's fields sit in a shadow root: `document.querySelector('#f0')` in an iframe finds
    nothing, a Playwright locator does. Time a field with a locator polled in Node.
  - `.pd-bind-graphic h4` now also matches the overview's blocks; scope helpers to
    `production-bindings`.
  - Cloud browser runs go through `node scripts/jobs.mjs add`, and a queued job does not inherit
    the environment of the `add` call that queued it when another job started the runner: write
    outputs to a fixed path.
  - A commit message here carries no `Co-Authored-By` trailer (the command guard refuses it).

## Row 7, data-sources C1b: Sheet source, reader, Connect data

- **Previous verified `main` sha:** `1e81bfed1cd7345de84c3c160c4570a906e82bba` (row 6, C1a, #1576).
  This branch starts from `95078eb` (#1577, an evidence-only Phase 2 acceptance on top of it).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration. `Show.sources` is additive
  optional: a reverted build keeps the field on the record untouched and no longer reads it; the
  connected fields stay bound to their `sheet.<id>.…` paths and hold their last value (nothing
  writes them). Browser leases live under `spx-gfx-sheet-reader:<production>:<source>` in
  localStorage and are ignored by a reverted build.
- **Q records used.** `sheet-latency.md`: an edit is in the export within 441 to 1,011 ms, so the
  ten-second wording stands and no "Publish to the web" fallback is needed for freshness (it is
  still accepted as a link). `sheet-endurance.md`: 720 of 720 five-second reads answered, slowest
  855 ms. Hence `SHEET_READ_MS` 5 s, `SHEET_TIMEOUT_MS` 10 s, stale after 3 misses (15 s), lease
  15 s; an edit reaches the graphic in about 5.9 s at worst while a page is open.
- **Decisions.**
  - `src/control/sheetSource.ts` is the whole reader, pure and Node-tested with a fake clock:
    link parse (share, tab, export and published links; the export address is built from the
    stored id and tab, never fetched as pasted), CSV through `model/csv.ts`, rows through C1a's
    adapters (`fillList`) or keyed values (`Field ID,Label,Value` by id, `Name,Value` by name),
    and the diff. The diff is against the reader's OWN snapshot of what it wrote, never against
    the tree: that is what makes D4 hold (a ± on a connected value stays until its cell changes)
    and makes Resume write only cells changed while paused. Only connected paths are written,
    because the published operator door refuses any path that is not bound (0060).
  - Tree layout: `sheet.<id>.lines` for lines, schedule and credits; `sheet.<id>.rows` and
    `.headers` for standings; `sheet.<id>.values.<key>` for keyed values. A key with a dot loses
    the dot, an all-digit key is reported (it would index an array).
  - One reader per source per browser: a lease in localStorage holding owner, claim id, expiry,
    the world it wrote (unpublished, or the published slug), the snapshot and the status. A second
    tab shows the owner's status and does not read. An expired lease is taken with its snapshot,
    so an unchanged cell after handover does not undo an override. An answer that comes back
    after the claim moved, after Disconnect or after `stop` writes nothing and cannot replace the
    new owner's status or snapshot. Publishing changes the world and so starts a fresh snapshot:
    the server's tree is written in full once.
  - The writer is `productionDataSession.applySourcePatch`: the same road as a ± press (local tree
    unpublished, `control_data_patch_by_slug` published), refactored into one private
    `operatorWrite` both use. It answers whether the write landed; a refused write keeps the
    snapshot so the next read tries again.
  - The one binding write moved into `productionData.ts` as `withBindings(bindings, entries,
    refuses)`; `setFieldBinding`, `setFieldBindings` and `connectShowSource` all call it through
    `applyBindings` in `shows.ts`, which supplies the prepared-message refusal. `proposeMapping`
    (a supplied key first, then one unique name match through `matchTitle`, ambiguous never
    guessed, refused fields marked) and `mappingEntries` (an existing different binding is kept
    until the operator picks a replacement) are the review's contract.
  - "Connect data…" sits in the cue editor's header (`CueConnectData`, on `LibMenu` like Paste
    rows). The review shows the tab's lines, every field's proposal with a picker for repair,
    "N connected · N need attention · Used by N cues", and the proposed values on the real
    PREVIEW monitor (the page overlays them on `settleData` while the review is open). Connect is
    one `connectShowSource` write; Cancel and closing write nothing. A proposal a field cannot hold
    (a number field and "abc") is not made. Reuse is the explicit "Use existing content…" choice;
    its Name box renames the source, which keeps its id and every connection.
  - A link with no tab reads the first tab and requires "Use it?" before Connect. The stored tab
    stays `null` ("the first tab"): the export does not expose the tab's gid to the browser.
  - A graphic whose own code carries the legacy Sheet block (`hasLiveData`) is refused with a plain
    reason until C6's migration, so no field gets two readers.
  - Connected fields stay read-only. The field mark says "🔗 Sheet: <name>" ("⚠ stale" after three
    misses); under the box, a list says "Connected to Sheet: <name>. Edit in the Sheet, or
    Disconnect to edit here." and a value offers Disconnect. Disconnect writes the last shown
    value into every cue of that graphic and removes a source no field follows any more.
  - One source line per source under the editor head: name, checked N s ago, paused, empty, or
    the failure since a time with its fix, stale, Pause/Resume, missing keyed rows, and a
    connected field the graphic no longer has (with Disconnect). The status lives in a small
    store outside React (`createSourceStatusStore`) so a read re-renders only the lines. C1c moves
    the sources line to Playout and adds checked versus changed.
  - Not in this phase (C2): writing `bindings`/`sources` to the published row at connect. A field
    connected after publishing reaches air after the next publish, as every binding does today.
    The operator door refuses a whole patch for one unbound path, so the writer leaves such a path
    out (said once), writes the rest, and the reader retries only that path; without this, one new
    connection froze every working one on the same source (assessment A, medium, fixed). The
    refused path is read whole (a Name/Value key may hold spaces) and is left out for a minute at
    a time, because a republish keeps the slug and so is no mode change (second review round).
  - Assessment A (fresh read-only session on `c5b9028`): PASS WITH NOTES. Its three low notes
    stay: a published write in flight is not cancelled by a handover (bounded by the 15 s lease);
    rename on reuse is a second write after Connect (nothing is lost); the writer now answers
    false once the session has ended.
  - `/check` review fixes: a pasted link mints a new source each read (a second Connect never
    reuses the first source's record); a read answering after the review closed or after a newer
    read is dropped; the PREVIEW overlay clears when the review closes or unmounts; a reader whose
    lease lapsed mid-read (a sleeping laptop) keeps reading instead of stopping; an answer that
    arrives after Pause writes nothing; a source no field follows is dropped by the one binding
    write whichever door unbound it; `/spreadsheets/u/<n>/d/<id>` links parse. Simplify moved the
    source-path helpers (`sourcePrefix`, `isSourcePath`, `sourceIdOf`, `sourcePaths`) and the
    review's choice rule (`chosenPath`) into `productionData.ts`, put the field-kind check into
    `proposeMapping`, and mounts the review only while it is open.
  - Not changed (simplify reports, judged not worth it here): the lease is a few small
    localStorage reads per source per read; moving the lease storage into model/ would add a file.
- **Extra files.** `e2e/configured/production-data-key-sheet.spec.ts` (new) and
  `e2e/configured/expected-run.json` (110 to 111) are the configured row's files.
  `src/control/contentFormats.ts` (C1a's) exports `valueFor`, so a Sheet cell takes the same
  field form as a data-template row (third review round: "TRUE" is "1" for a toggle, a padded
  select option is the option). In the same round the reader keeps its lease in memory when
  localStorage refuses the write, so the only open page still reads instead of standing down.
  `e2e/playout-baseline.spec.ts-snapshots/graphics-only-{1366x768,1920x1080}-chromium-linux.png`
  are re-recorded by `rerecord-screenshots.yml` (run 39602862082 on `8105c2f`): the cue editor's
  head now carries "Connect data…", drawn with the head's compact button class so the head keeps
  its 28 px and nothing below it moves; the other four pictures came back byte-identical. Masks and
  thresholds are unchanged. The `-win32` pair could not be recorded on this Linux worker; the
  laptop helper re-records it from this merge (they gate nothing in Actions). A last review
  round made one Sheet value that feeds fields needing different forms (a toggle's "1", a
  caption's "TRUE") held and reported (`pathValue`). The reader and the Connect review now
  share one rule: `connectedFields` reads each graphic's fields as the editor draws them (the
  library version, `templateForSavedGraphic`) and `pathValue` decides the value, so the review
  previews exactly what the reader will write, held cells included. Published, a Sheet write
  holds only the server's answer, never an optimistic tree, so a value the row refuses cannot
  reach PREVIEW or a Take.
  `src/model/teamShowMerge.ts` gains one label (`sources: 'the data sources'`) so a team merge
  conflict on the new field reads in words.
- **Traps.**
  - A button inside `.pd-bound-mark` is unclickable: the mark is clipped to its column with an
    ellipsis. Keep the mark short and put actions under the field.
  - `react-hooks/purity` refuses `Math.random` inside `useMemo`; a `useState` initializer is fine.
  - The E2E protection gate caps a per-test timeout at 120 s; the journeys take 20 to 30 s.
  - The `""` database case is carried by C1a's 0096 self-check and `production-data-migration`;
    the configured spec now walks it end to end (an emptied tab is an update row with `f0: ""`).

## Row 6, data-sources C1a: format adapters, Paste rows, starter data

- **Previous verified `main` sha:** `66c5f81948e7d37b2b8a0557e61c0b65c43206f5` (row 5, phase 13a,
  #1575).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No persisted format changes. Migration 0096
  is a self-check only (no table, column, function, grant or row), so a revert leaves it applied
  and harmless; nothing has to be undone in the database.
- **Decisions.**
  - The adapters live in `src/control/contentFormats.ts`, pure and Node-importable (they import
    `model/csv.ts` with its `.ts` extension, §5.2). They take rows of cells, so C1b's Sheet CSV
    and this phase's paste go through the same functions. Pasted text with a tab is read as a
    spreadsheet selection; without a tab, each line is one cell. A quoted cell is unquoted only
    when its closing quote ends the cell (and, without tabs, only when it spans a line break, as
    one copied column brings it), so a headline that opens with a quotation stays as typed.
    Review and assessment A each found a paste-reading defect here; both are fixed and tested. A single cell holding a pipe ("20:00 | News") is
    split for schedule and standings, so lines copied from a document work too.
  - A field's adapter is decided by what the graphic is, never by a field title the operator can
    rename: `ticker` f0 lines, `end-credits` f0 credits, an `infographic` whose runtime draws
    `.infographic-time` (the shared schedule runtime) f0 schedule, a `results-board` whose
    runtime draws `-row-cells` (the shared standings runtime) f2 rows and f3 headers.
  - Choices the spec left open: a third cell on a ticker row, or on a schedule row, is flagged
    and dropped rather than joined; a schedule row missing a half is written as it is and flagged,
    so the board drops it on air as its parser always has; credits read the raw cell count, so
    "Camera<TAB>" is "Camera:" while a lone "Camera" line from a document passes through in the
    credits grammar; the standings starter's first header cell is "Name"; blank rows at the ends
    are trimmed, interior blank rows kept for lines and credits (they close a kicker, break a
    section) and dropped for schedule and standings.
  - "Fill from… Paste rows" is a small component in `CueEditor.tsx` beside C0's message Fill.
    It lists the resulting lines with malformed rows flagged and changes nothing until Fill; Fill
    is one `editDraft` with every field the adapter owns (both standings fields in one edit), so
    the preview shows it and the draft saves it like any edit. A bound field shows no Fill (it is
    read-only, as before). The same menu downloads starter rows: the field's current content with
    the adapter's header.
  - The data template (`Field ID,Label,Value`) is downloaded from the cue editor's Advanced
    section (graphic-level, closed by default; C1b's header "Connect data…" is where the import
    lands). It carries every scalar field except pictures and the list fields an adapter owns,
    with the cue's value, the bound value where bound, else the default. The parser is
    `parseScalarCsv`; nothing in the UI reads a template back yet (that is C1b's Connect).
  - **Extra files.** `supabase/migrations/0096_merge_patch_empty_list.sql` and
    `scripts/production-data-migration.test.mjs`: the gate puts the `""`-over-a-list case in
    `scripts/merge-patch-conformance.mjs`, and that table must be answered by the plpgsql merge
    too. 0048 embeds the table and is applied history (never edited), so 0096 calls
    `jsonb_merge_patch` on the added case, and `production_data_format('""')` (an empty string
    writes, an empty array does not). The binding test now reads 0048's cases followed by those
    of each later conformance migration it lists. `scripts/fixtures/show-saved-before-c1a.json`
    is the fixture the spec names.
  - The fixture was made by driving this branch's app with Playwright (a temporary spec, not
    committed): Hairline with an embedded Sheet block appended through `liveDataBlock` and f0
    bound to `guest.name`, News Strip with a tab kicker, a seed and the live tree (`saveLiveData`,
    what Reset to seed does), a roster table, then Take on both and the PROGRAM text read back.
    This branch changes no persisted code, so it is what `main` at `66c5f81` saves.
    `show-fixture-compat` type-checks the record against `Show` with the compiler (an unknown or
    retyped field fails, checked by mutation), resolves it to the text PROGRAM showed, and checks
    the adapters leave its saved list exactly as it is. Later phases extend it.
- **Traps.**
  - The cloud machine refuses a direct `npx playwright test`; every browser run goes through
    `node scripts/jobs.mjs add … --cap`.
  - Commit messages here must not carry `Co-Authored-By` trailers (the commit hook refuses them).
  - A program-monitor locator needs the graphic's `iframe[title=…]`: with several graphics on
    air, `[data-testid="program-stage"] iframe` matches one frame per layer.

## Row 5, phase 13a: props-only cue editor extraction

- **Previous verified `main` sha:** `7ac4b22159ef3cb120271123599f70fda9fa559f` (row 4, phase 2+7,
  #1573).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. A move of markup only: no state, storage key
  or persisted format changes.
- **Decisions.**
  - The graphic cue's editor (`data-testid="cue-editor"`) moves verbatim into
    `home/CueEditor.tsx`; a text diff of the moved block against the old one differs only at the
    two slots and the history prop below. Every value it shows is still derived in the page and
    every piece of state stays there (`advancedFor`, `foldedFields`, `lastLoaded`, `loadSide`,
    `editTarget` and the draft): the component gets them and their setters as props. 13b moves
    the four editor-only states (`advancedFor`, `foldedFields`, `lastLoaded`, `loadSide`) and the
    draft in. `editTarget` stays in the page: it picks `editingCue`, which Take and ✎ Update read.
  - The ends row (`CueEndsRow` with its next-cue hint) and the sound (`ProductionSounds` with its
    save) are built by the page, because both compute from page state (`cueArms`, `cueView`,
    `armsServer`) and write the record through page-owned verbs. The editor itself stays a
    renderer. The ends row is a render function (`endsRow()`), so it is built only while the
    setup fields are open, as the inline code was; the sound is an element, as it always
    rendered. Both keep their keys and their place in the tree.
  - The data-sources C0 "Fill from…" menu (`CueMessageFill`) renders inside the component, so
    C1's Connect menu lands there too. There is no Connect menu yet.
  - The component has no `key`, so its subtree persists across cue changes exactly as the inline
    markup did.
  - The page's rundown history arrives as `rundownHistory`, not `history`, so it never shadows
    `window.history` in the component.
  - **Extra files:** 23 e2e specs gain one comment line, `// covers: src/components/home/CueEditor.tsx`
    (no assertion or selector changes). These are the specs that drive the editor's test ids and
    already covered the page by name, so a later change to `CueEditor.tsx` alone (13b, C1's
    Connect menu) still selects them. Phase 2+7 did the same for its modules.
- **Traps.**
  - The draft still lives in the page, so typing still re-renders the page; this phase is not
    meant to change that (13b does, AC-9).
  - The StrictMode session fix of phase 2+7 (b12dd74) is untouched: this phase moves no effect.
  - The sound slot keys on the draft's `f0` (a picture cue's sound re-keys on its picture). When
    13b moves the draft out of the page, that slot has to move into the editor too, or the page
    reads a stale `f0`.
  - The moved markup keeps `editingCue` null checks that the prop type now rules out. They are
    left in to keep the move verbatim; 13b can drop them.

## Row 4, phase 2+7: store part, session skeleton, the production-data session

- **Previous verified `main` sha:** `304a440a121c51d650f78437496ffc2e1bd56d0a` (row 3, phase 1,
  #1568 and #1569, then the nightly e2e map #1570). Receipt: `phase-2-7.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration and no persisted format: the
  data part holds what the page's state held, under the same storage keys.
- **Decisions.**
  - The session is `createPlayoutSession(productionId)` with `key`, `alive`, `data`, `apply`,
    `onDispose` and `dispose`. `onDispose` is the one place a module registers its stop, so
    disposal runs every stop once and a stop registered late runs at once. It is the hook the
    later watchers (bridge, wire, arms) register with.
  - The page makes the session with `useMemo` on the id, and its end waits one task: the effect's
    cleanup schedules `dispose`, and a re-run of the same effect for the same session cancels it.
    `src/main.tsx` renders under `React.StrictMode`, whose extra cleanup in development would
    otherwise end the session the page goes on using. Two earlier versions on this branch failed
    review: `useMemo` with a plain dispose left the page holding a dead session, and replacing the
    dead session with a new one left the log follower (an effect that never restarts) refreshing
    the old one, so a feed row's re-read did nothing on a page opened while published. The route
    keys the page by production (S4, #1566), so in a production build the session lives exactly
    as long as the page.
  - The `data` part holds `liveData`, `dataKey` and `treeRead`. The dispatch baseline
    (`lastResolved`) stays private to `productionDataSession`: nothing renders from it, and in the
    part every dispatch would re-render the page.
  - `published(slug)` is the mode change of D2 for the data tree: it re-seeds the tree and the
    baseline, listens to other tabs when unpublished, reads the key when published, and answers its
    stop. A number that moves with every mode change drops answers from an earlier mode (the old
    page's `alive` flag did that for the key read only).
  - **Departure:** entering the published mode sets `dataKey` to `undefined` until the key read
    answers. The page kept the previous `null` for that moment, so a first publish could dispatch the
    (empty) tree locally once. `undefined` is the spec's and the folder contract's "not yet known".
  - `dispatch(resolved, tree, send)`: the page passes the resolve it rendered and the tree it came
    from, and the session passes over a tree the part no longer holds. A mode change sets the tree
    and the key in one write, so without the tree check a render's older tree could pair with the
    newer key in the same commit (unpublishing would have sent the server tree's values once).
  - A write that changes no field keeps the part's value, so nothing re-renders for it (as React's
    own bail-out did for an unchanged state).
  - The data API's types come from `productionDataApi.ts` through `typeof`, type-only, so the
    module stays Node-importable.
  - `cueItems.ts` type-imports `ControlSendItem` from `hostedControl.ts`: a type-only cycle, which
    `.dependency-cruiser.cjs` tolerates, so `hostedControl.ts` changes by re-exports only.
  - `// covers:` headers: every spec whose covers selected `hostedControl.ts`, `serverPlayoutStore.ts`
    or `ProductionPage.tsx` before the move now also names the module that code moved to (comment
    lines only, 57 specs), so `e2e-affected --files <new module>` selects them.
- **Traps.**
  - `src/main.tsx` uses `React.StrictMode`. Any session, watcher or engine a later phase creates
    must survive mount, cleanup and mount again in development without being replaced: an effect
    that never restarts (the log follower, eslint-disabled deps) keeps the objects of the first
    render. Keep one session per page and defer its end, as the page does now.
  - A disposed session is final by design: never revive one.
  - The local offline selection passed on both broken versions, so neither lifetime defect shows
    there: the first was found by review, the second by the independent assessment.
    `e2e/configured/production-data-key-dispatch.spec.ts` (a reload of a published page, then a
    feed row) is the walk that exercises the follower's re-read.
- **Left for later:** `ClipClock.tsx` still reads its two store parts with `useSyncExternalStore`
  directly rather than `useStorePart` (outside this phase's files). Answers from one mode that land
  out of order (two refreshes, two PATCHes) can still replace a newer tree with an older one, as
  before this phase: [#1572](https://github.com/NoaCG/NoaCG-Studio/issues/1572).

## Row 3, phase 1: safety net and baseline

- **Previous verified `main` sha:** `995272d56215f6e218da22a2b94baba6adec801f` (H0.1, #1561).
  Built on `4c1ae76` (S1 fix #1564) and the S4 fix #1566. Receipt: `phase-1.md`.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Tests and evidence only, no migration. The two
  fixes revert on their own (`git revert -m 1 <#1564 merge sha>`, `<#1566 merge sha>`); reverting
  either turns its walk red.
- **Decisions.**
  - S1 confirmed and fixed (#1564): a press moving a bound field waits for the one before it on
    its graphic and counts from the newest tree; the ± stepper joins the same wait. The wait ends
    after a send's window plus an attempt, so a dead link cannot hold every later press.
  - S3 refuted: a held folder has no cue editor and holding it saves the draft, so the save wait
    in a folder Take is empty. Recorded with a fault-injection check.
  - S2 characterised and retained: only a press that does not blur the editor (SPACE from a
    checkbox field, a panel key) waits on the save.
  - S4 found and fixed (#1566): the route keys the page by production, so a production opened
    from another starts with nothing up. This is the per-production disposal phase 11 plans, done
    early by remounting; phase 11's session must keep that outcome.
  - The panel snapshot check of §5.3 is not offline-readable; left to the configured panel spec
    and phase 12 (`phase-1.md`).
  - Hosted control page has S1 too: #1567, outside this plan's fence.
- **Traps.**
  - A configured walk that seeds the tree through the data key must wait for the page to show the
    seeded value (`cue-bound-<field>`) before Take, or the Take carries the tree it held.
  - Holding a resolve's REQUEST lets the read reach the server after the Take, so the answer is
    not stale; hold the ANSWER (`route.fetch()`, then fulfil late).
  - A published page holds an empty tree until its data key and the server tree are read, so a
    walk that only holds the key has nothing to dispatch. An edit on the Data workspace while its
    key is unread moves that tab's tree (`setLiveData` takes an unread key as unpublished), which is
    what makes `production-data-key-dispatch` fail when `undefined` is read as unpublished. Hold the
    key on the context, so the workspace tab waits too.
  - Two graphics on PROGRAM are two iframes: read each layer's frame, never the bare locator.
  - Offline, a click or a key from outside the cue editor blurs it first and saves the draft; to
    walk inside the save wait, press SPACE from a checkbox field and hold IndexedDB writes open by
    issuing reads from the transaction's own success callback.
  - Local configured stack in a cloud worker: Supabase CLI from the npm package
    `@supabase/cli-linux-x64@2.111.0`, `dockerd` started by hand, the two accounts made through
    the admin API as `configured-suite.yml` does; jobs take the env from the shell that queues them.
- **Preflight before phase 2.** Phase 1's tests green on `main` (the offline spec, the four
  configured specs, the Node file, the gate test); S1 and S3 decided with evidence, S1's fix
  landed in #1564 and S4's in #1566; S2 characterised. Configured run 39540143070 on `a0682c7`: 118 passed, floor 110.
- **Left for later:** the two perf baselines on this merge's sha (laptop helper, non-gating).

## Row 2, H0.1: Companion package, guide, protocol and presets

- **Previous verified `main` sha:** `046a74598c96b0f161507954511e70bf799407a9` (P1R, #1558,
  checked). Built on `5d533e6cb7b8bd764e724e227953a3e16aca3163` (a quarantine entry on top).
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. No migration. A reverted guide and module go
  back to 0.1.1, which is also the previous known-good package for H0.2's recovery runbook.
- **Decisions.**
  - The module is 0.1.2: the guide (`companion/HELP.md`) in Companion 5.1's own words, with
    install by **Import module package**, the lease instead of the answer switch, "refused, never
    queued", and all 14 actions by the names Companion shows. `guide.test.ts` pins HELP.md to
    the action list and the 14 verbs. Trigger keys per cue in the presets; `last_press` says
    "Sent, waiting for the operator page" while a press is unanswered, so pending is its own
    state. Green means selected (what Take acts on), not PREVIEW.
  - No preview tally: protocol v1 publishes only what Take does next (`space`). A tally would
    bump the protocol, which extensions.md gives to E6 once; E6 should decide it there.
  - Spec and protocol drift fixed in place: D5 names `trigger-cue`, the stale table and `blocked`
    cover it, the switch requirement is marked superseded by the lease, the hosted page refuses
    only the clip verbs, the lease spec says it is built. `hardware-panel-control/work.json` is
    re-recorded against the edited spec (`reconciliation-2026-10-21.md`); AC-11 stays failed for
    the missing operator page in the app's docs.
  - Companion is qualified headless from the official image's own files (no Docker daemon
    needed), fresh `--config-dir` per walk, pressed through its HTTP API; the walk script stays
    in the scratchpad, since a suite spec would need Companion on every runner.
- **Traps.**
  - Two queue jobs of half a budget each run at once. Mutation runs that patch source must go
    one at a time, or one patch leaks into the other's run (here a "Take dispatched twice" showed
    up in an unrelated run and looked like a product defect).
  - Playwright's offline mode leaves open WebSockets alone, and stubbing `setInterval` after a
    page started leaves its running intervals alone. A cut-off or hidden page must be faked by
    routing the Realtime sockets and wrapping timers from the first script; the first version
    of the test passed with the guard removed.
  - The page has two ways to learn it lost the panel (the `claim` broadcast and the refused
    renewal). A mutation of one is hidden by the other unless the sockets are cut.
  - In a cloud worker: Yarn comes from npm (`COREPACK_NPM_REGISTRY` and
    `YARN_NPM_REGISTRY_SERVER` set to `https://registry.npmjs.org`, `NODE_USE_ENV_PROXY=1`);
    the Supabase CLI binary is the npm package `@supabase/cli-linux-x64`; `dockerd` starts.
- **Left for later:** hardware-panel AC-8, AC-11 and AC-12 on this merge's SHA (laptop helper);
  the trial kit (`playout-companion-qualification/evidence/trial-kit.md`) on the owner list; the
  app docs page ([#1560](https://github.com/NoaCG/NoaCG-Studio/issues/1560)).

## Row 1 repair, P1R: the two findings of C0's check

- **Previous verified `main` sha:** `cc3500f2d93359dc8add228d50c2353ec5d46f30`. Previous merge
  sha: `6ecd82133e65ebf7d0672c9b9724c7cc0a504aaa` (C0, #1556), which the check failed.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Reverting the baseline brings back the
  post-land advisor failure, so revert it only together with 0095.
- **F1, post-land advisors (run 39506808457).** What was wrong: 0095 applied cleanly, and
  `scripts/supabase-advisors.mjs` then reported `anon_` and
  `authenticated_security_definer_function_executable` on
  `audience_operator_add(p_slug text, p_items jsonb)`, which no baseline entry covered. Checked
  against 0095 before accepting: it resolves the slug through `audience_owner_for_control`
  (capability and audience kill switch, 0035), refuses a non-list and more than 100 items, only
  inserts into that production's `audience_submissions` (clamped by `audience_guard`), and writes
  no command log or production value. That is the same control-slug door as `audience_list` and
  `audience_update`, which the hosted control page calls signed out, so the grant stays. The fix:
  the judgement in `ACCEPTED_CLASSES` (both classes), the baseline re-recorded with
  `--update-baseline` (174: the 2 new entries in, 4 gone unused-index entries out), and the
  count paragraph in `docs/STACK_FRESHNESS.md`. A live re-run after recording reported no change.
- **F2, `production-audience.spec.ts:542` red in Actions (run 39506957594).** What was wrong: the
  trace shows the Playout tab's bind 4 ms after the Messages tab's prepare landed. Every model
  write rewrites the whole record from that tab's mirror, and the Playout tab had not yet adopted
  the prepare, so `applyFieldBinding` passed on its old copy and wrote it back: a binding and no
  prepared cue in the database. The adoption read, opened before that write, then put the older
  record into the Playout tab's mirror, which is why `record(page)` read `{}` at :578 while the
  Data tab read the binding. The fix: `rebasedDurableSet` (model/durableStore.ts) puts this tab's
  answer in the mirror and re-runs the mutation on the record IndexedDB holds, in one readwrite
  transaction; `patchShowChecked`'s rebased mode (model/shows.ts) uses it for `setFieldBinding`,
  `setFieldBindings`, a prepare (`addShowCue` / `updateShowCueChecked` with `stagedFrom`, which
  now also refuse a bound body or name field there) and `setShowMessageTarget` (the prepare's
  first write, which from a stale Messages tab erased the binding). `adoptWrite` no longer
  overwrites a write this tab queued while its read was out. Other writes keep the ordinary path:
  the general whole-record hazard stays as `durableStore.ts` describes it.
- **Review findings on #1558.** A team production keeps the ordinary save, and a refused
  team save is merged per field, so one member's prepared cue and another's binding on its field
  both survived: `mergeTeamShow` now drops such a binding and reports "the field bindings" as
  lost (two tests in `scripts/team-show-merge.test.mjs`, red before, green after). In the
  localStorage fallback a rebased write that hits the quota is now reported like any refused
  write instead of throwing out of the mutator. `src/model/teamShowMerge.ts` is the other file
  outside the row's list.
- **Reproduction.** Two tests in `production-audience.spec.ts` give one tab a durable-writes
  channel that hears nothing and read back from a fresh tab: a stale tab binding a prepared
  field, and a stale Messages tab preparing onto a bound field. Both failed before the fix (the
  first with the binding stored, the CI signature) and pass after; removing the prepare-side
  refusal fails the second again. :542 is unchanged.
- **Files outside the row's list:** `src/model/durableStore.ts` (the transaction the fix needs),
  `scripts/supabase-advisors.mjs` (where the advisor judgement lives) and
  `docs/STACK_FRESHNESS.md` (the baseline's count history).

## Row 1, C0: paste and safe staging (data-sources C0; fixes #1313)

- **Previous verified `main` sha:** `cc3500f2d93359dc8add228d50c2353ec5d46f30` (first phase; the
  run's base). Previous merge sha: none.
- **Revert:** in an isolated worktree, `git revert -m 1 <this PR's merge sha>` on
  `revert/<sha7>`, then `/check` and `/queue-merge`. Migration 0095 stays applied (additive and
  harmless to the reverted client); its own header names the SQL revert if one is ever wanted.
- **Decisions.**
  - One staging function, `src/control/messageStaging.ts`, pure and Node-importable: the stores
    are handed in, so `scripts/message-staging.test.mjs` runs it against fakes. Messages'
    "Prepare cue on <graphic>" adds a cue; the cue editor's "Fill from…" fills the edited cue and
    keeps its name. A pasted message in the cue editor also joins the inbox, so one candidate
    record backs every prepared cue.
  - The cue receipt is `ShowCue.stagedFrom = { candidateId, fields, at }`: `fields` names what the
    message filled, and `preparedMessageField` in `model/shows.ts` reads it inside the one binding
    write (`applyFieldBinding`), so `setFieldBinding`, `setFieldBindings` and every door over them
    refuse. Unbinding is always allowed. The refusal sits in the model, the explanation and the
    "Add a separate card for live data" offer in `ProductionDataPanel.tsx`.
  - Destinations: body titles Message, Question, Comment, Body, Text, Request; name titles Name,
    Author, From, Sender, Handle, Asked by; vote boards excluded by `voteBoardFields`, which
    `pollFieldMap` now builds on, so "is a vote board" has one answer. A remembered target that
    stops being compatible is asked again, never replaced.
  - The first Prepare asks where messages go, in the row (the compatible graphics, or the four
    Q&A cards); "Messages go to" in the paste box changes it later. A card is added with its seeded
    cue, which the message fills (and renames), so one press makes one card and one cue.
  - Approve, Shortlist and the presenter Now/Next moved into the row's ⋯ menu, each saying what
    it does; the row shows "Prepare cue on <graphic>" and Reject. "Prepare again" is in the menu
    for a used message.
  - Local inbox: operator-added rows live in localStorage under `spx-gfx-audience-inbox`, keyed by
    production, read on every `list()` and announced to the other tab through `storage`, so the
    Playout tab's Fill and the Messages tab see one inbox. Simulated, chat and local-join rows stay
    in memory.
  - Migration 0095: nullable `external_id`, `source`, `reference`; `audience_list` dropped and
    recreated with them (db:push exempts a drop the same file recreates); `audience_operator_add`
    keyed on the control slug, bounded at 100, skips an `external_id` already in the inbox. The
    viewer burst caps in `audience_guard` would refuse a 21-row paste, so the function raises a
    transaction-local `noacg.audience_operator` flag that the guard reads; clients cannot set it.
    Applied to a scratch Postgres 16 with a stub of its 0035 dependencies: both self-checks ran
    (the behavioural one adds 25 items, past the burst cap), viewer caps still held, no
    `control_events` row.
- **Traps.**
  - `model/shows.ts` and `audience/localAudience.ts` are not importable in Node (extensionless
    imports, §5.2), so the binding refusal through `setFieldBinding` and `setFieldBindings` is
    proven in the browser journey (`page.evaluate` against the real store) and on the configured
    published walk, not in Node.
  - `control/` may not import `audience/` (dependency rules), so staging takes the candidate's
    `broadcastValues` from the caller instead of importing it.
  - Commit messages in this repo carry no Co-Authored-By trailer; the commit guard refuses one.
- **Fence.** Files beyond the named list, and why: `src/control/messageStaging.ts` is named;
  `src/components/home/useAudienceInbox.ts` (the shared provider choice and a comment the new
  storage made wrong), `scripts/copy-baseline.json` (re-recorded: the Messages view has fewer em
  dashes), `e2e/_workspace.ts` (a comment naming the old Setup labels), `e2e/production-chat-intake.spec.ts`
  (it pressed Approve and Send, which moved), `e2e/configured/expected-run.json` (the configured
  test this phase adds), `scripts/audience-operator-migration.test.mjs` (the migration's static
  guard). No stylesheet changed: the paste box reuses `.pd-aud-round` and the popovers use
  `LibMenu`'s default surface.
- **Check findings.** The delegated review found 10; 7 fixed in the PR: a refused or no-op cue
  write is now said rather than marking the message used, Prepare reports a failure, Fill stops
  when the editor's own draft did not save and cannot paste a second copy on retry, the cue editor
  reads the inbox only while Fill is open, the per-production viewer cap no longer counts the
  operator's rows (and a viewer may not use the `operator_` device prefix), and the header-count
  comment follows the new storage. Filed: #1554 (messages pasted before publishing are hidden after
  publishing; then fixed in this PR after the PR review, below) and #1555 (kept local messages
  outlive their production). Not changed: the Messages
  workspace keeps its own list effect, which also refreshes the join preview from the same signal.
  Simplify moved the provider choice into `useAudienceInbox.ts` (`useMessagesBackend`), reused
  `lastTitled`, `clampSubmission` and `freeName`. Not taken from simplify: letting `stagedFrom`
  fields win over bindings at resolve time (the spec chose the refusal inside `setFieldBinding`),
  an `origin` column instead of the `operator_` device prefix (the spec names three columns), and
  one shared paste component (the two doors lay out differently).
- **PR review (four findings on `fc41275`, all real, all fixed).** A cue that landed while marking
  its message used failed is now reported ready with a warning, and the page refuses a second cue
  for it unless "Prepare again". Kept local messages move into the published inbox on publish
  (`moveKeptMessages`, through `audience_operator_add`, deduped by `local:<id>` external ids, with
  edits and use carried), which closes #1554. The kept inbox is stored as `{ v: 1, inbox }`;
  damaged rows are skipped and a newer version is read-only. The Messages paste button is off while
  its add is in flight. `localAudience.ts` now uses `.ts` imports, so its store is tested in Node.
- **Left for later phases.** `scripts/acceptance-pack.mjs` presses the presenter buttons, which are
  now in the row menu; its clicks are tolerant (`.catch`), so it skips them rather than failing.
  C3 adds the unique `external_id` index this phase's dedupe anticipates.

