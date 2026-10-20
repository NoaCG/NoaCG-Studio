# Production-page run: phase notes

Newest first. Each phase's pull request adds what the next phase must allow for: the previous
verified `main` sha, the previous merge sha, the revert command, decisions taken, traps found,
and the check's findings (parent spec, "Phases"). This is an evidence file, so adding to it never
changes a spec's digest.

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
  `e2e/_workspace.ts` (a comment naming the old Setup labels), `e2e/production-chat-intake.spec.ts`
  (it pressed Approve and Send, which moved), `e2e/configured/expected-run.json` (the configured
  test this phase adds), `scripts/audience-operator-migration.test.mjs` (the migration's static
  guard). No stylesheet changed: the paste box reuses `.pd-aud-round` and the popovers use
  `LibMenu`'s default surface.
- **Left for later phases.** `scripts/acceptance-pack.mjs` presses the presenter buttons, which are
  now in the row menu; its clicks are tolerant (`.catch`), so it skips them rather than failing.
  C3 adds the unique `external_id` index this phase's dedupe anticipates.

