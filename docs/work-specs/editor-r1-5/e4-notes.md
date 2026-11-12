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

The implementation keeps the existing account-synced `project` singleton and
adds a versioned multi-document envelope; no database migration or new backend
kind is needed. Normal legacy slot writers retain the envelope. Unknown versions
refuse workspace mutations. Source history and editor view receipts are owned by
the document UUID, independent of its saved library graphic UUID. Existing Save
transactions/reservations and the 800ms autosave are reused. Project removal
removes membership only; retained documents remain on Home. Brand reapplication
uses last-applied source values and logo bytes as the three-way comparison base.
Personal rundown installation stores stable IDs and before/after snapshots,
then conditionally writes the target atomically. Team paths are unchanged.

Later rules found while reproducing (not retroactively claimed Rules-first):
a closed document port must reject every mutation, including view restoration;
a whole legacy replacement starts with empty predecessor history/selection;
Reset edits the same document; view-only changes use the existing autosave
transaction. Jobs j-0056/j-0057 reproduced the first two defects before their
repairs. Job j-0059 reproduced a hidden project error when the aside was closed;
the existing editor status footer now exposes the failure visibly.

Current engineering evidence: j-0060 passed all ten E4 journeys in 39.2s, zero
skips/retries; j-0055 passed 22 project/brand/wizard journeys before the final
ownership fixes. The codec's two Node tests pass. The final lint/types pass.
Changed-path gates ran 85 tests across 12 files, all passed. Final committed-source
broader/build and exact-candidate Actions results are recorded on the PR; they
are not inferred from these working-tree results. The actual receiving artifacts
and supported/unsupported checks are in [the receiving kit](e4-receiving.md).
Comparable executed reference tasks and applicability are in
[e4-reference.md](e4-reference.md).

Failures retained: j-0044 exposed a real Home/reload false stale-context error
(fixed by stable raw-slot parsing/context comparison); j-0046 was a faulty
Home/wizard expectation; j-0049 incorrectly expected the internal step counter
to reset on Out (public Off state and finite root-opacity zero are now asserted);
j-0050 was the documented optional relay probe on the static receiver. The latter
two were fixture/setup expectations, not weakened required asset checks. All
jobs remain in the queue log; only the final passed artifacts are staged. The
prior local Supabase startup exhausted the managed VFS while unpacking before
readiness; no local authentication/persistence PASS is claimed. Real persistence
must pass the exact-source isolated Actions walk.

October save/recovery evidence remains scoped as recorded in
[the scoped closure](../editor-leave-reliability/scoped-closure/README.md) and E1 notes: single active authoring tab/device,
original source/environment receipts and original failures retained. Those older
receipts do not prove this envelope. Current failed-save, migration, reservation,
installed-copy and history checks provide the new-source applicability; no
cross-device/human/receiving-host acceptance follows.


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


Carrier Rules-first fresh read-only challenge returned **AGREE WITH CORRECTIONS**
for the added surface. Incorporated before execution: fresh-context `baseURL`,
managed workdir/status identity, exact candidate SHA (no worker fallback), retained
run-integrity reporter, strict one-pass/zero-skip/zero-retry report verdict,
bounded setup/child execution and receipt only after account cleanup. Its
prospective `sideEnds` was empty. The dedicated configuration lives under
`e2e/endurance/` to preserve the existing root shape. Adding the npm tool script
intentionally accepts the normal whole configured selection. A local negative
probe proved an absent managed stack fails before any ambient credential use,
with sanitized failure JSON retained; this is guard proof, not backend proof.

Job j-0061 caught a faulty new test expectation: reopening the same still-live
document binding is idempotent and need not close that binding. The corrected
assertion verifies it remains usable, while the following different-document
switch still must close it. A retired binding now also refuses every public port
mutation even if a replacement context retains the document UUID.


### Committed-source checks and first isolated attempt

At `217c6c4854a22e3759830baaacb346654dcb00ea`, broader job j-0063 passed
110/110 editor command/foundation, library and save-transaction/held-write cases
in 6.7 minutes. Build j-0064 failed within the unchanged five-minute cap (283s):
5,596 Node tests passed, three unchanged networking fixtures failed, and 27
existing skips remained. The failures at `external-data-connector.test.mjs:812`
and `feed-fetch.test.mjs:754,785` route pinned local fixture hostnames through the
managed proxy, which returns 403. Both test files and all `api/` source are
byte-identical to admission source 91a57833c. No proxy bypass, test change or
whole-build rerun was used. Actual candidate CI must prove the complete build.

That build's other lane also found this branch's private wizard-capability import
in ProjectStarter. The narrow correction uses the existing public draft builder
with the chosen catalog variant and collection palette; it leaves private kit
logic and dependency rules untouched. Dependency cruise now reports zero
violations; affected starter UI job j-0065 passes. This is a branch architecture
defect, separate from the three environment-bound fixture failures.

[Isolated attempt 43215844696](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43215844696)
ran source 217c6c485, started the real stack, authenticated, persisted three
graphics/two productions and reached the fresh signed-in browser. It then failed
a new fixture's client use: the existing async `getSupabase()` factory was not
awaited before `auth.getUser()`. The correction awaits that factory and retains
all UID/RLS/source/history/copy assertions, one required case, zero retries/skips
and the original timeout. That failed run stays failed; its stack teardown and
artifact upload passed. It is partial diagnostic evidence, never E4 acceptance.

Current-source `sideEnds` for all 42 committed paths (including package.json's
added tool script and unchanged dependency/build versions) was empty at 217c6c485.
The local capacity estimate was WARN, 92.8%, with the new spec estimated at 0.42
table-minutes. Newest growth artifact 13936121332 / run 43201149088 was unreadable
through normal worker ingress (403 on redirected artifact download), so this is
provisional stale-seed evidence. The actual candidate CI capacity verdict is
required before final acceptance; no ceiling/exception/selection entry changes.

Exact browser/export GSAP source remains 3.15.0 with the receiving kit's hash.
A fresh `@noacg/cli@0.12.4` npm archive was inventoried (63 files), SHA256
`c212397f29ec00a2c7e257260dd153baab18328ec3742f99622f381a4483b130`.
Its version command reports 0.12.4; no GSAP runtime or font payload was found in
that archive. This is artifact inventory, not a new legal conclusion. The owner
sends the [GSAP request](gsap.md); NoaCG is open source, entirely free, earns no
revenue and serves broadcast graphics. Written disposition still gates OW1.


### First post-open review round: B, corrections required

The fresh full SO of all 42 paths at03e88fa9 returned AGREE WITH CORRECTIONS,
grade B, not A. Codex independently reported the same external draft ownership
class. No acceptance or queue approval follows even though isolated43217079413
passed and normal CI's Build/Factory/catalog passed. That source/receipt stays
historical after repair. Normal CI43217043887 also failed two saved folder/bin
cases in shard14/15, with126other cases passing.

The external-to-project boundary must preserve the entire departing source,
history, view, library link and reservation, including batch brand/save callers.
The central replacement API will durably adopt an external draft as unfiled
before replacement; failed adoption keeps it open. This makes the transition
lossless without depending on a particular UI caller. Existing Home/starter
external guards and their cancellation behavior remain required.

Typeface preservation is one effective package: chosen family, derived numeric
face, matching font declarations and referenced bytes. Incoming brand path OR
family-name collisions must not rebind a retained face. Repeated explicit
application, undo/redo and rendered digit stability must preserve that package.
No font-specific exception or weakened numerical assertion is allowed.

The original saved folder/bin test deliberately exercises SAME public document
identity with a NEW session instance. Its equality assertion is retained. The
compatible public identity is the workspace document UUID for retained drafts,
and the existing library graphic UUID for unretained saved-library editing;
private authoring UUID/baseline, instance identity and closed-port guards still
own history/view/commands. Stable public/library identity must not revive old
forms or handles. Independent focused review agreed and retracted its initial
suggestion to replace that equality; the regression gains positive internal
instance and stable library-link checks instead.


First-round correction evidence (one coherent checkpoint): j-0066
reproduced the missing external draft before repair. The central replacement API
now durably retains external drafts as unfiled, including direct open, document
button, brand/save batches and creating another project; refusal keeps the draft
open. Home/starter cancellations keep their existing guard. The public library
identity remains compatible while private UUID/baseline/public-link changes
immediately retire old ports, sessions and commands, before a caller refreshes.
The editor subscribes to those ownership changes even if source bytes are equal.
Retained drafts sharing one library link still expose different workspace IDs.

Four valid source/byte probes reproduced the font class before repair. Eleven
cheap Node cases now pass: shared numeric fallback, custom path/family collisions,
byte-only overrides, fixed bundled paths, retained numeric siblings and an
unmodified label receiving the incoming face. The v1 brand receipt keeps immutable
applied font packages (declarations plus referenced bytes), as it already did for
logo identity. Collision handling preserves imported-face markers and uses stable
incoming aliases; bundled file names remain valid. Retained font bytes and
unchanged typography roles survive, while eligible incoming roles still apply.

J-0071 passed46 E4/folder/bin/command cases in 2.0 minutes. J-0072 also proved both
Home and starter cancellation. The new strict rendered fixture initially placed
its font-label declaration in a second :root (j-0068: 12 pass/1 fail); putting it in
the documented first root fixed the fixture, without weakening font/byte/width
assertions. J-0069 then passed the rendered source/undo/redo/repeated-application
check: all ten digit widths stay within 0.5px and local/incoming custom headings
match separate real Saira/Inter-byte reference faces. J-0067's four added command
checks initially expected session_closed for old packets on the NEW receiver;
the established contract is stale_context there, and session_closed on the OLD
object. Both exact refusals are now required, with source equality retained.
The original same-public-ID folder/bin equality is unchanged and passes.

A proposed addition of zero-delay yields was rejected before execution. All four
new post-review task-delay yields were removed from the WIP tests. J-0073 reran only the five affected cases and passed
in 16.7s. Immediate old-object refusal precedes any session refresh/readiness
observation; only afterward do observable receiver readiness and old-packet
stale_context checks run. Source is inspected through the store in the immediate
probe. Lint/app-types/dependency cruise pass; changed-path gates 95/95 pass across
13 files; the final focused source/font and document-codec check passes 13/13. Current-source receiving artifacts were regenerated in j-0071 and their
source/canonical hashes and four ZIP sizes/hashes independently verified.

Current origin/main b5908e67e reconciles by clean merge-tree and merge-order; no
merge was needed. No whole local production build was repeated. The next coherent
candidate's full CI, configured selection, isolated backend and fresh full SO
remain mandatory; historical green receipts do not pass that new head.


The maintained numeric instrument `scripts/numerals.mjs --only sb05` passed in
j-0075 (one relevant live-number variant of360, 0.5px invariant). J-0074 failed
before any browser/instrument run because the temporary harness resolved the
inherited offline guard relative to /tmp; absolute inherited paths fixed that
setup without changing the guard. This narrow catalog baseline is separate from
the actual reapplied-source rendered/byte checks, not whole-catalog proof.
Three more cheap instances of the same font-identity class were reproduced and
corrected before this checkpoint: an incoming uploaded file cannot shadow an
unchanged bundled font URL, and serialization-only asset-key order must not
become a false local override; distinct CSS family names must retain their CSS
identity rather than bundled-lookup normalization. The eleven source/font cases
pass; no per-font
exception was introduced. All original failures remain in their logs/receipts.
