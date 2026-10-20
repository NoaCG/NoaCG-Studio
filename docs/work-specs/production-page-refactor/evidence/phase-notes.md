# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

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
  transaction; `patchShowRebased` (model/shows.ts) uses it for `setFieldBinding`,
  `setFieldBindings`, a prepare (`addShowCue` / `updateShowCueChecked` with `stagedFrom`, which
  now also refuse a bound body or name field there) and `setShowMessageTarget` (the prepare's
  first write, which from a stale Messages tab erased the binding). `adoptWrite` no longer
  overwrites a write this tab queued while its read was out. Other writes keep the ordinary path:
  the general whole-record hazard stays as `durableStore.ts` describes it.
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

