# E4 projects to rundown

Previous verified main: `91a57833c972f214b45fa7357faf4e830c547e21` (E4 admission pin).
Revert this phase after landing with `git revert -m 1 <E4 queue merge SHA>` on a
feature branch, then use the normal merge queue. The queue assigns that SHA.
This phase changes no release posture: the editor remains Alpha.

## Reproduced gaps and design

At the admission pin `documentAdapter.ts` binds only the current working slot;
`EditorFoundation.tsx` renders one current graphic, and its Project panel has no
other document to switch to. `GraphicsSection.tsx` bulk installation writes each
item without a durable operation receipt or conditional rollback. B19 and E15
therefore remain unimplemented, as the acceptance register already records.
Browser reproductions and final evidence follow below; static inspection alone
is not claimed as an executed journey.

Use an additive versioned authoring workspace on the existing SavedProject
singleton, rather than a new account service or another library. It contains
named projects, stable document IDs and independent source/draft/history snapshots.
The current slot and existing Save transactions remain the compatibility seam.
Authoring projects organise drafts; the flat library still owns explicit saves,
and productions own independent copies for air. The workspace is scoped to the
same account and the accepted one-active-authoring-tab/device restriction. It
rides the existing project sync record. A legacy slot remains intact until its
explicit adoption succeeds. No production credentials/data or model calls enter
this qualification. The real authenticated persistence qualification runs on
GitHub Actions' existing isolated local stack; the managed worker's previously
failed full VFS image pull is not repeated with unchanged capacity.

## Rules stated before product edits

1. A project contains document IDs, never an implicit current-global source.
   Every document owns its baseline, draft, library link, AI provenance,
   legibility, sample values, undo/redo and view receipts. Switching first
   confirms the departing snapshot; a refused write leaves that document open.
   Reload and Home reopen select that document's own draft and history.
   Every slot writer (autosave, Save/Save As, discard, external replacement and
   sync pull) preserves the workspace envelope. Unknown workspace versions block
   destructive slot rewrites. Singleton last-write-wins retains the October
   single-active-tab/device boundary; no concurrent/cross-device history claim.
2. The current source and its history are one revision identity. Restoring a
   document closes the previous session and invalidates pending gestures,
   clipboard and proposals. A command for an old instance cannot edit the next
   document. An in-flight Save must settle against its original document/session
   before switching; a pending answer never belongs to another document. Save
   reservations and retry links belong to their document, including dormant
   documents. Conflict recovery repairs affected dormant links too.
   Undo/redo never crosses document identities. External whole-document
   replacement cannot silently attach to an existing project document.
3. Draft persistence never reports an explicit library Save. Existing Save/Save
   As, refused-save recovery and minted-record reservations retain their existing
   transaction path. Snapshotting or switching never changes library/production
   records. A save that is refused retains the draft, last good library copy and
   retry target. A later edit is never marked saved by an earlier answer.
4. Rename changes labels and preserves IDs/source/history. Removing a project
   removes only its membership: its documents remain available on Home as
   unfiled drafts; library, production and on-air copies remain unchanged.
   Unknown workspace versions are read-only and never overwritten. Legacy
   adoption is additive, repeatable and non-destructive; a failed adoption keeps
   the old working slot usable and writes no success marker.
5. Starter selection uses the existing tested catalog/kit registry, with no AI
   or unfinished animation prerequisite. Only selected items become documents.
   Branding applies only to explicitly selected documents, as one source-history
   transaction per document including the visible logo. Undo restores exact
   prior source/assets; redo restores the branded source. Reapplication compares
   current values with that document's previous brand application: local role,
   typeface and logo overrides survive. Unselected documents and library/air
   copies do not change. Source, assets and previous-applied brand values move
   together through undo, redo, reload and switching. Logo identity includes its
   bytes and slot state as well as its path. Unsupported brand metadata is
   refused, not guessed.
6. Installing selected saved documents into a personal production snapshots
   their approved library sources through the existing production gate. Stable
   operation identity and source/target snapshots are durable before target
   writes. Retry after interruption/reload recognises already-installed copies
   without replaying, replacing newer edits or adding duplicate graphics/cues.
   A requested replacement is explicit; ordinary installation never updates an
   existing or on-air copy. Each target has its own receipt, so a second rundown
   receives exactly its selected subset without aliasing the first.
7. An installation outcome is accepted, confirmed, interrupted or conflicted;
   absence of an answer is never success. Rollback applies only while the
   production still equals the operation's confirmed after-snapshot. Newer edits
   produce a visible conflict and remain intact. Refused writes retain a
   retryable receipt and last confirmed production. Prepared/accepted means the
   before/after snapshots and fixed graphic/cue IDs are stored before target
   submission; confirmed means the exact target after-state was observed. A
   refused target write leaves before-state; missing target or receipt answers
   stay unknown/interrupted. After reload, exact before-state permits retry with
   those same IDs; exact after-state permits confirmation without replay; any
   other state is a conflict. Failure of the confirmation receipt after a landed
   target write remains unknown. Retry and rollback compare-and-write atomically
   against stored production state while preserving other productions.
   Team productions retain
   their existing path and are not silently treated as personal records.
8. Export fixtures are built by the shipped exporters from the verified saved
   source, with bundled font/logo, hashes, expected output and receiving steps.
   Browser rehearsal exercises data/In/Next/Out and interruptions/replay. It is
   neither named-host/operator acceptance nor a replacement for E6. October
   failures, source pins, original receipts and single-device limits stay intact.

The transition checks use a small hand-written state oracle derived from these
rules (document ownership, refused writes, retry identity and conditional inverse),
not a second implementation of the production algorithm. Any rule discovered
later will be listed separately. The Rules-first independent review must complete
before product edits. A fresh final-diff second opinion must grade A or A+.

## External preparation

NoaCG is open source, entirely free, earns no revenue and serves broadcast
graphics. [GSAP inventory/request](gsap.md) retains the owner's advanced request,
exact artifact inventory, licence/provenance/notices and redistribution questions.
Written disposition gates OW1; it does not delay E4 engineering. No provider,
funding, engine, licence or release decision changes here. Participant/device and
receiving-system leads remain those in [E1](e1-notes.md); none is claimed available.

## Verification and later rules

Rules-first fresh reviewer `/root/editor_r15_e4_cloud_builder/e4_rules_first_so`
reviewed base `91a57833c972f214b45fa7357faf4e830c547e21` and checkpoint
`0515e370d5c58185430ea08066d0c0b10e7e9996`: **AGREE WITH CORRECTIONS**.
All three corrections are incorporated above before product edits: every slot
writer and dormant save ownership; undoable brand receipts including logo bytes;
atomic before/after reconciliation across the target/receipt crash window.
The reviewer independently recommends keeping the existing account singleton.
No implementation or acceptance PASS follows from that Rules-first judgment.

Cloud queued baseline probe `j-0043` reproduced the missing project controls on
the admission source: Project lists only House Strap, assets and operator fields;
its only buttons are Close, Import files, Template graphic, Bin and Upload sound.
The preceding probe `j-0042` failed before navigation with `ERR_CONNECTION_REFUSED`
against 127.0.0.1. The sanctioned dev server reported a localhost binding; using
that reported address fixed the diagnostic setup. This is retained as an
infrastructure failure, not a product pass or a test retry.

Implementation/runtime verification pending.


### Added isolated-backend carrier rules (before carrier edits)

The initial new backend walk was never committed or run. It currently sits in the
configured folder with a credentials skip; that is unsuitable for a mandatory E4
receipt. Hosted configured runs lack the isolated local stack this walk requires.
Automatic approval rejected a non-executed proposal to add a configured skip
allowance and loosen the logo assertion. Neither proposal was executed. Existing
`expected-run.json`, `allowedSkips`, `minTests`, selection and judges stay intact;
the logo runtime assertion remains exactly 32 natural pixels.

The authorized existing manual `endurance.yml` carrier will run this one new walk
at the exact candidate commit, with `local-supabase: true`. Its workflow, stack
bootstrap/teardown, 90-minute cap and other scripts are unchanged. This is added
E4 qualification, not a substitute for normal PR configured gates. No previously
committed test moves or disappears: the new walk moves from its uncommitted
configured location to its own endurance location. The normal configured set and
all existing skip allowances remain unchanged; the ten new offline regression
journeys remain in ordinary automated selection.

The wrapper must obtain identity only from the managed isolated stack's
`SUPABASE_WORKDIR` and `supabase status -o json`, reject absent/non-loopback URLs,
and override ambient Supabase credentials with that stack's keys. No hosted URL,
production data, supplied user account or secret transplant is accepted. The walk
mints and deletes its own account, signs in through the application, closes the
first authoring page before a fresh context signs in, and proves source/history,
project membership and two independent installed copies against actual rows.

There is exactly one expected test, zero skips, zero retries, one browser worker,
a five-minute whole-run cap and a required sanitized JSON receipt containing the
exact source SHA and assertions. Missing test, skipped test, missing receipt,
failed assertion or unsuccessful child exit fails qualification; failures and
Playwright diagnostics are retained under `endurance-output/`. This run does not
claim receiving-host/operator or real-device acceptance. Before carrier edits,
a fresh independent Rules-first challenge must assess this added tooling surface,
normal selection compatibility and `sideEnds` impact, then the final SO assesses
the complete final diff and actual Actions receipt.
