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
2. The current source and its history are one revision identity. Restoring a
   document closes the previous session and invalidates pending gestures,
   clipboard and proposals. A command for an old instance cannot edit the next
   document. Undo/redo never crosses document identities. External whole-document
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
   copies do not change. Unsupported brand metadata is refused, not guessed.
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
   retryable receipt and last confirmed production. Team productions retain
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

Pending. No implementation or acceptance PASS is claimed by this rules checkpoint.
