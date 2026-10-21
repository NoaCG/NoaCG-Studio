# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

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

