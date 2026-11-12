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

### Later rollback and painted-output rules (before the second repair)

Current-head review found an inverse-operation ownership gap. Actual source at
`a534b14e5` reproduces it: rollback restores an 08:00 production revision after
its 09:00 installed revision synced; the actual reconciliation rule at a 10:00
bookmark pulls the installation back. A failed rollback confirmation also leaves
a forward receipt, so a default retry can reinstall. These are one product
family: the inverse operation needs its own durable intent and revision.

Before touching the target, rollback must durably prepare one immutable inverse
snapshot with the original contents and a fresh production revision later than
both captured revisions. Every retry, including default Retry after reload,
uses that recorded direction and exact snapshot. A failed intent write leaves
the target untouched; failed target or final receipt writes retain the same
inverse intent. A target equal to the recorded inverse confirms without another
mutation or revision; a target equal to the recorded installed snapshot may be
replaced only after output/prepared/on-air refusal takes precedence, even
when that target exactly matches the installed snapshot. Every other target,
including later edits, refuses and remains byte-for-byte intact. Lost answers
reconcile the same durable inverse; they never mint another revision. All
workspace writers must retain that intent until reconciliation. Existing forward stable IDs and exact
before/after recognition remain required. Rollback cannot turn back into a
forward installation implicitly.

The three staged export replay PNGs at this head are blank white. Counter=1
proves an accepted replay, not painted output. Retain those original images and
receipts. A replacement reference must wait for observable visible source/output
state, preserve all existing data/font/logo/step/Out assertions, capture each
actual SPX/CasparCG/HTML Overlay receiver, and be visually inspected. No task-delay
yield, fixed wait, weakened assertion or host/operator acceptance claim follows.

The independent bounded model challenge agreed with those corrections before
repair: output refusal precedes installed equality; lost answers and every
workspace writer retain the recorded inverse. Full review at a534b14e5 remains
B, with both inverse defects and blank replay references retained.

Current CI also exposed the repeated ownership class before round 2: all three
unchanged first-save leave-replay cases lose their existing iframe load listener.
J-0076 reproduced all three failures; its arrangement and ticker cases passed.
The owned, unchanged admission-source control j-0077 passed all five in 51.9s.
Neither local pass classifies the two nonreproduced CI failures as flakes.

A fresh independent approach reassessment completed before any ownership patch.
Private authoring UUID owns the persistent viewport, playhead and group location;
private UUID + baseline + public identity own short-lived session capabilities;
public identity remains the command/preview compatibility ID. A same-owner Save
As must retain its iframe DOM and view while rebinding commands/controller and
refusing every old capability immediately. A true private-owner switch must not
inherit view state merely because the library UUID is equal. Numeric revision
counters alone never authorize transient drafts across new session instances:
inline edits, marquee/pointers, Pen and artwork gestures are instance-owned and
must clear/refuse at rebinding. Existing proposal/menu/timeline/dialog instance
keys and image/keyboard cancellation remain required. Save/leave's held link,
preview navigation/history event and all final leave/library assertions stay
unchanged. This model was explicitly challenged for the complete caller class.

The scoped existing capture contract is
`templates/after-graphic-settles-capture-runner-temporarily`: its will-change
paint fence is confined to reference capture after visible opacity/data/logo
assertions. It adds no playback task/time delay or assertion allowance.


Round-2 engineering receipts retain the failures as well as the repairs. J-0078
passed all three unchanged save/leave cases, inverse intent refusal and receiving
DOM checks, but two new inverse fixtures initially tried a button inside an
unopened disclosure. Opening that disclosure preserves the intended UI retry;
j-0079 then passed all three inverse crash windows in 15.8s. The durable inverse
snapshot has a fresh revision, survives every slot writer and directs default
retries after reload; newer edits still refuse. The real isolated one-case walk
now additionally requires synced rollback, another close-before-fresh sign-in
and idempotent default retry. That stronger backend proof remains pending the
next exact-head Actions run, with the original 60s/5min limits unchanged.

J-0084 passed five ownership cases in 18.2s: same-private iframe DOM, zoom/pan,
clock and group continuity through Save As/baseline rebind; same-public/new-private
view reset; old command/port refusal before refresh; and pending Pen, inline,
pointer and async-image work discarded without source mutation. Existing numeric
revision checks gain instance ownership; image busy/error resets on rebind while
its existing cleanup invalidates pending reads.

J-0078's replacement captures were still blank despite root opacity=1. J-0080/81
added strict green-artwork pixel proof and exposed the hidden ancestor:
.info-card-box opacity=0 and a full clip, with valid visible/in-viewport root,
logo and heading geometry. This was premature capture during the authored
0.25-0.9s box entrance, not a demonstrated runtime/compositor defect. J-0082
proved opacity settled but its new clip check used a different zero spelling;
the actual source declares inset(0 0% 0 0), computed inset(0px 0% 0px 0px).
J-0083 requires that endpoint and the heading's identity transform before the
existing capture paint fence. It passed in 23.5s; all three actual receiver PNGs
were opened and inspected at 1920x1080, with 4,400 authored-green pixels each.
The original counter-only blanks and failed new captures remain historical;
`round2-premature-blank-j0078` is explicitly a failed archive. Successful source,
four exact ZIP hashes, manifest and painted references are staged from j-0083
and archived separately as `round2-settled-receiving`. No time/task wait, seek,
engine or sample-output alteration was used to create those reference frames.

A broader local selection was refused before execution while this repair was
uncommitted; it will run only after the coherent reviewed source is committed.
Normal a534 CI43231538681 remains FAILED, even though its full build, all four
configured stacks and ALL63-spec verdict passed. Its three save/leave failures
are reproduced and addressed above. The arrangement async-evaluate failure and
ticker pace measurement failure did not reproduce in either local candidate or
admission-source control; both remain unclassified original CI failures. Their
existing assertions, timing limits and runtime are unchanged.

Final affected checks before the round-2 checkpoint: changed-path gates 96/96,
font/codec checks 13/13, affected ESLint/application TypeScript and dependency
cruise pass. Fresh origin/main c1ce4e4e7 reconciles with a clean merge-tree and
clear merge-order; no merge is required. Check/simplify review covers the full
48-path branch scope, including the four Canvas/import gesture lifetime paths.

### Later workspace-authority rules (before the third repair)

The fresh full 48-path review at 4de8259f9 is B, with one P1 family: unbound
staging can overwrite adopted durable data. The actual-module reproduction
preserves both losses: two projects/documents plus a journal become one with
no journal; an adopted v99 envelope is silently replaced by cached v1. This
requires only serial tab return, not simultaneous authoring. Public verdict
6826989625 and Codex finding 4551914786 remain failed evidence.

A mandatory fresh whole-writer approach reassessment completed before patching.
The existing account-scoped singleton and persisted v1 format stay. In-memory
staging belongs to the loaded library, its exact observed workspace baseline,
and a local generation. Clean cached reads yield to adopted data. Only proven
nonconflicting changes to whole owned units may carry forward: a document's
source/baseline/history/view/link/reservation stay one bundle; projects and
installation receipts keep their identities. Incompatible overlap refuses
persistence and retains the local pending draft plus adopted record. An adopted
change to the loaded document cannot authorize an old live store to snapshot
that document merely because its UUID is equal. No winner policy or concurrent
editing feature is added.

Actual durable format checks run independently of staging. Unknown or malformed
adopted envelopes block destructive slot writes even with an older readable
pending v1. Account/library changes cannot expose or acknowledge another
library's staged value. Sync adoption does not clear pending work before its put
succeeds. Every local intent is staged before another writer can observe the
old envelope or await its receipt; only the captured generation is acknowledged.
Older completion cannot replace later source, view, sample, history, link or
journal staging. Refused/lost answers preserve the pending generation and
immutable installation/inverse identity without claiming success.

These rules cover every slot and workspace writer, including autosave/Save,
explicit project/document operations, sync upsert, dormant superseded links,
view-only staging and installation prepare/confirm/rollback retention. Proof
will include the fixed small state oracle, local held-write interleavings,
serial browser mirror adoption followed by a third fresh page, and adopted v99
while v1 staging remains populated. Existing October one-active-authoring scope,
limits, test allowances and all prior failures remain unchanged.

Historical 4de CI43239502125 completed overall FAILURE solely on missing Reviewed;
CI gate131264604152, all 15 offline shards, full build, Factory/catalog and ALL63
configured specs/four stacks/verdict131264352458 succeeded. No stamp or rerun
followed the known P1. Its stronger isolated43239590134 passed one case in25.5s,
with zero skips/retries, synced rollback/fresh sign-in, account deletion, clean
teardown and artifact13952344884. Its actual passing COST verdict is REPAY,
198.2/213 table-minutes93%, overhead122% including main-side nightly work counted
through frozen PR_BASE7e306913; #2450 tracks attribution. Newest growth remains
partial, judged on complete43014542120. No debt, exception or owner is invented.

Third-repair engineering follows that model in the shared project boundary: loaded
library, observed workspace baseline, local generation and exact receipt lineage.
Whole document bundles, project membership and journals use three-way unit
comparison; incompatible overlap refuses instead of selecting a winner. A
rebased candidate is published before its optimistic mirror can be read by the
next local writer. Completion advances its baseline without reinstalling an
older generation. Every loaded private ID is tracked, including an external
source before retention; an explicit load refreshes authority only for the exact
adopted bundle. Same-live-document reopen preserves its existing binding, while
adopted different revisions refuse until explicit reload. Pending external
retention does not count as confirmed ownership for Home/Starter guards.

The maintained actual-module oracle now has 17 cases (30 total with font/codec),
all passing: clean/dirty nonconflicting adoption, same-document conflict, exact
bundle/link/history/view preservation, unknown/malformed formats with populated
staging, old/refused completion, before-await intent, sync upsert, loaded-library
isolation, membership deletion/overlap, inverse identity, exact same-UUID load,
formerly external ownership and a rebased write overlapping another slot write.
No test compares against a reimplementation of the production algorithm.

Maintained browser j-0089 passed real serial adoption and the v99 boundary in
16.9s: one authoring editor at a time, adoption observed from the actual mirror,
then exact documents/membership/journal read from a third fresh page. J-0090
passed three forced project/install/rollback receipt interleavings. The stronger
j-0092 also requested a real Save As before releasing the held receipt: the link
remained unchanged while held, then the new link, later source/history/sample/
view and immutable journal survived completion/reload (3/3,18.8s). J-0091's
new fixture expected undefined rather than saveGraphicAs's documented null
success error; that initial failure is retained and the strict null assertion
matches the existing API. No allowance changed.

Other original failures remain: j-0086 found an optimistic confirmed status after
a refused journal confirmation; the correction restores only the unchanged
submitted unit to its accepted status, retaining immutable intent and later
work. J-0087 found duplicate creation proposals after a refused legacy adoption;
identical in-session retry now keeps the same creation IDs, and j-0088 passed
both the unchanged two-document legacy assertion and independent history.
J-0093 passed31/32 but exposed unconfirmed retention bypassing the existing
cancel guard. J-0094 passed that guard/serial/held paths but exposed a baseline
object replacement on idempotent reopen. Both product corrections retain their
original assertions. J-0095 passed all four affected lifecycle cases; j-0096
passed the original idempotence/cancel/unknown cases plus an adopted same-private
revision: old persistence refused, old source stayed open, explicit reload used
the exact newer bundle and old packets received stale_context. No new conflict
resolution UI or concurrent-authoring feature was introduced.

The staged receiving source, four ZIPs and painted references remain those
verified at j-0083/4de8259f9. This repair changes workspace retention, not the
brand/export/runtime/font/artwork closure; the next exact-source browser/CI run
still exercises the receiving journey and its strict painted-pixel oracle.
Fresh origin/main619ebc835 reconciles by clean merge-tree and clear merge-order;
no merge/rebase, whole local build or test-policy change is needed.

Final third-repair checks passed113/113 gate tests across14 files, source-oracles
30/30, affected lint, app TypeScript and dependency cruise (0 violations,1471
modules/7029 dependencies). The initial VM oracle failure came from testing an
Error across different VM realms; sharing the harness Error constructor retained
the exact production refusal assertion. The original failure log remains.

The receiving oracle previously painted the replay entrance but established Next
only through its counter. Before this checkpoint it now additionally requires
the authored first row, settled identity transform, visible/unclipped parent,
and opaque white row pixels in transparent captures, for operator and all three
browser-replayed exports. Source/runtime/package bytes and all old assertions
remain unchanged. This is an acceptance-evidence correction; no playback wait,
seek or sample change was introduced.

J-0097 retained the initial new Next-oracle failure: the operator row's60x7
preview visibly painted (opened image), but antialiasing over its dark stage
produced maximum RGB224 rather than exact255. The preview oracle now requires
exact computed white plus opaque neutral glyph pixels contrasting with the captured dark background; full-resolution
exports still require exact opaque white. Existing green artwork, source,
geometry, timing and counter assertions remain unchanged.

J-0098 passed the strengthened receiving journey1/1 (25.9s total). All four
new row captures were opened: operator preview and HTML/SPX/Caspar each paint
“Post your question in the chat”. The initial midpoint-brightness proposal for
the preview was replaced before commit by exact neutral opaque glyph contrast
against the actual crop background; no guessed brightness allowance is retained.

The final background-relative Next oracle passed j-0099,1/1 in26.4s. All
four actual new crops were opened and archived at round3-next-row-j0099; the
three exports paint exact opaque white glyphs, while the scaled operator
requires opaque neutral glyphs lighter than the captured dark background.
Final affected lint/app TypeScript and diff checks pass. Explicit fresh main
fetch remains619ebc835; merge-tree is clean and merge-order has no dependency.
One committed-source bounded save/adoption matrix follows this checkpoint;
normal Actions full build/configured/backend and a fresh full SO remain required.

### Fourth review checkpoint: active-document boot projection (discovered after coding)

The fresh FULL50-path SO on42be82a91 gradedB with oneP1; Codex's exact-head
clean receipt6829372771 did not detect it. The reviewer statically traced an
active-document/compatibility-slot projection defect. Actual frozen-source
browser diagnostic j-0102 confirms it: A's library record lands while its K/link
put is refused; opening pristineB succeeds, with workspace.active=B and B's
saved link null/reservation fields absent, but the outer slot still has A's
reservation and mintingReserved=true. Reload boots B's source linked to A's
record; Save B returns saved and changes A's existing record to B's source.
The original failing assertion and full before/after evidence are retained in
reservation-provenance/j0102-original.txt and reproduction-summary.json.
J-0101 was setup-only: a quote in the new diagnostic's assertion label caused
parse failure before any case; it is retained separately. Neither diagnostic
changes product, maintained tests, normal selection, limits or workflows.

This is the complete active-document-to-compatibility/boot projection family,
not a relabel or reset of earlier transition/view/adoption attempts. The boot
reader at templateStore.ts190 last changed at217c6c485 and has no diff from03e
through42be. PR review round4 is retained; this distinct failure's first repair
attempt remains governed by the existing per-failure cap. The round cap requires
a fresh approach reassessment before any patch and grants no additional attempt.

Observable Rules for that reassessment, recorded before its repair:

- An active document owns its complete source-correlated bundle at boot. Its
  absent optional reservation, minting, AI and legibility fields mean absent or
  default metadata; they never inherit from a preceding compatibility slot.
  The legacy slot is the source only when no readable active document exists.
- Every active-pointer writer publishes a compatibility projection from that
  selected document, including explicit clearing of absent optional fields.
  The outer slot and active document cannot describe different reservation
  provenance. Keep independent documents, membership and journals intact.
- A first-save reservation/mint mark is recorded in the exact private document
  that minted it before its library record can land. Ordinary autosave/Save/link
  writes update that owner's bundle even when another active-pointer candidate
  is awaiting confirmation. A caller's save cannot transplant metadata into the
  selected destination. Preserve the existing baseline/generation/refusal guard.
- A refused link followed by switch or project creation and immediate reload
  preserves A's saved master and B's independent link/reservation. Cover a
  pristine destination and a destination with its own reservation. Returning to
  A must still recover/retry its own mint without duplicates. Existing R/K/F,
  lost-answer, unknown-version, account, undo/history and installed/on-air-copy
  invariants remain binding. No sleep, autosave delay or weakened source judge
  may substitute for the ownership rule.

The model challenge precedes implementation.42be source and all receipts remain
historical: isolated43257955547 SUCCESS1case28.6s/zero skips or retries/account
deleted, teardown0 and artifact13962766118 uploaded; normalCI43257726630 was
in progress at that checkpoint. No acceptance stamp, auto-merge or known-bad rerun is authorized.

The fresh independent projection reassessment returned AGREE WITH CORRECTIONS
before product edits. It requires caller ownership independent of active,
synchronous R metadata in that owner's bundle without a mandatory successful-R
gate, recovery on both boot and restore, effective-envelope sync normalization
before projection, and complete Discard replacement rather than mixed history.
A bounded follow-up accepted preserving Discard's existing new-private-instance
flow with explicit retirement after confirmation, subject to three corrections:
refused Discard conditionally restores its submitted staging to the live owner's
complete bundle; pulled nested mint marks are stripped before projection while
legacy pull semantics remain; and an explicit full replacement snapshot bypasses
legacy reservation inheritance, including cleared views and optional fields.
There is no new cache, migration, format version, UI, winner policy or allowance.

The implementation uses the existing model serialization lifecycle and explicit
full snapshots from store callers. A pure projection enumerates name/template/
baseline/link/dirty/AI/thread/legibility/reservation/mint fields, preserving slot
identity/time/tombstone/workspace administration. Confirmed unchanged Discard
retires the old binding synchronously before its existing new-instance load;
normal external replacements still retain the departing project draft. Failure
or changed context preserves the appropriate live bundle and unrelated journals.
These NoaCG reservation/recovery semantics have no equivalent in the pinned
reference editor; no additional reference-editor parity claim is made.

Within the same unpushed first projection repair, j-0106 exposed the model's
view-only Discard interleaving: a newer staged view could retain the old source
while the answer claimed Discard succeeded. The original source/error assertion
is retained. Discard now also checks the captured workspace generation, reusing
the existing changed-context refusal/correction path for any newer staged work;
its view, source and history must survive reload/Home reopen. No assertion or
time allowance changed, and no review round/attempt was reset.

A final fixed-oracle edge within that same unpushed replacement inverse initially
failed19/20: restoring a refused owner could resurrect a former active pointer
whose document had independently been removed. Conditional staging recovery must
preserve that removal and keep a valid selection; it may restore the prior
selection only while that document still exists. The exact null/valid-envelope
assertions and original failure log are retained; no counter or judge changed.

The same model's unknown-envelope boundary was then fault-injected during the
Discard await (j-0109): adopted v99 bytes stayed durable, but the answer still
claimed success and replaced the live owner. Its original failure remains.
Before retiring/replacing a confirmed owner, Discard must re-check the shared
workspace refusal against the actual adopted envelope, just as project actions
do; a future format or incompatible newer revision preserves the live draft and
adopted bytes. Conditional staging recovery cannot overwrite a newer unit.

First projection-repair engineering receipts (all pre-push working-source proof):
j-0103 passes the unchanged original overwrite reproduction1/1 (9.1s).
Maintained j-0104 passes six switch/create/reservation and Discard cases24.4s;
j-0105 passes actual landed-L/lost-answer dormant recovery plus older-v1 absent
AI/thread/legibility boot2/2 (11.5s). J-0107 passes all four Discard outcomes,
including view-only generation refusal,4/4 (19.2s). J-0108 passes all42 then-current
E4 journeys in2.2min, including old ownership/history/rollback/font and painted
operator/export Next assertions. The final j-0110 passes adopted-v99 and
incompatible readable-revision arrival during Discard2/2 (10.4s), preserving the
live draft and exact adopted bytes. Maintained fixed source/font/codec oracles
pass34/34, including the independently removed selection inverse. Gates117/117
across14 files, affected lint/app types and dependency cruise0 violations
(1471modules/7030dependencies) pass; final source checks/committed-source bounded
save matrix and exact-head Actions/fullSO still follow.

Historical42be CI43257726630 is terminal FAILURE16:35:48Z, all33 jobs terminal.
Build/Factory/catalog/all15 offline shards and all four configured stacks pass.
The merged configured verdict131329323145 fails146PASS/0failed/1flaky,3existing
skips: per-graphic-replacement.spec.ts failed then passed its unchanged built-in
retry on the same test merge. Its first failure was strict locator cardinality:
after readyv3, marked() at64/call170 matched an old probed iframe and the new
unmarked iframe. CI gate131329642625 fails that verdict; Reviewed is separately
missingstamp only. Cause/closure classification belongs to the documented
quarantine route, not a test edit or same-head rerun. The coordinator owns the
mandatory separate quarantine PR2453; this E4 diff edits no quarantine or judge.
No landing or non-causality is inferred here. Isolated42be persistence success
and Codex's clean receipt remain historical; its fullSO gradeB remains blocking.

The coordinator's failed-receipt/view audit is covered by maintained j-0111,
PASS1/1 (11.3s): D is held then actually aborted after view-only work. The
private owner, exact source/history and newer.42 view survive an unrelated real
installation receipt and reload/Home. The fallback's previous views apply only
while the complete latest unit still equals the submitted replacement; a newer
view makes that comparison fail, so no product change was needed. The original
j-0102/j-0106/j-0109 and fixed-oracle failures remain retained.

The coherent first projection checkpoint contains45 maintained E4 cases. Its
final affected gates pass117/117, source/font/codec oracles34/34, lint/app types
pass and dependency cruise remains0 (no additional graph edges after that check).
Fresh main e394954becdbb292c914b3d20339418c9f9172c2 reconciles cleanly; the
coordinator's separate quarantine2453 is not yet landed at this checkpoint.
A source-pinned bounded seven-file save/adoption matrix follows the commit;
exact new-head normalCI/configured/backend/Codex and freshFULLSO remain required.

### Fifth review checkpoint: selection-only view freshness (existing view-ownership family)

The fresh FULL50-path SO on2767a30cb gradedB, agreeing with Codex review5879149260,
inline4554033976: oneP2 view-state preservation family remains. Cached view
receipts update on edits/undo/redo/seek, while selection-only changes only update
the session context token. snapshot()/captureProjectDocument() can reuse the old
selection; the subscription ignores selectedParts. The earlier selection test
followed selection with setSessionTime and therefore masked the independent path.

Frozen-source j-0113 reproduces all four instances with the original desired
assertions: switch/reopen, ordinary autosave/reload and Home retention/reload
restore[] instead of[#f0], with source/history unchanged; selection-only work
while Discard awaits is not a changed generation, so it reports success, replaces
the private owner/source and clears that newer selection. Its complete original
log is selection-j0113-original.txt. Product source remains2767, unedited.

This belongs to the existing private-document view-ownership family, including
the prior round2 lifetime/view repair; it is not a new family or an allowance
reset. All earlier checkpoints and per-failure attempts remain. The coordinator
owns final attempt classification. A fresh repeated-family/model reassessment
must precede any further patch, and grants no additional attempt.

Observable Rules recorded before that reassessment/repair:

- Every genuine current view change belongs to the exact private owner. A
  selection-only change must be captured/staged before any await that can switch,
  retain, save, discard or replace it, and must survive the same reload/Home
  paths as seek/sample changes. Do not rely on a later edit or seek to flush it.
- A departing snapshot uses the supplied owner's live selection/sample values,
  including a captured previous state during external replacement, never the
  next document's globals or a stale cached selection. Retain its owned clock,
  cue and history-view receipts; do not invent a zero clock when no clock has
  been observed or overwrite past undo/redo view receipts.
- Genuine view-only changes advance the existing generation and stale-context
  protection without editing source, adding an undo entry or changing links,
  reservations, membership, receipts or installed/on-air copies. Idempotent
  observation/repeated equal selection must not cause recursive staging or
  spuriously advance generations. Retired capabilities cannot refresh a new
  owner's view, including same-private baseline/public-link changes.
- Selection-only work during held/failed Discard or project persistence follows
  the same existing newer-generation refusal/recovery as other newer view work.
  Preserve complete live/adopted bundles and earlier projection/unknown-format
  guards. Cover current-view samples/clock/cue coherently, with no event-only
  UI patch, new cache, guessed timing value, sleep, assertion or limit change.

A bounded fixed oracle and maintained selection-only switch, Home, autosave,
held/failed replacement and idempotence cases must close the gap. The complete
2767 full-review result, successful isolated43270504790 and normalCI results
remain historical; no stamp, rerun, auto-merge or additional allowance follows.

The fresh independent view-freshness reassessment and one bounded clarification
both say AGREE WITH CORRECTIONS (model only). Full normalized receipts are
view-freshness-reassessment-original.txt (SHA25619130233ec6adadb2a0e54ec6556c81c3abca48345ae2f33629d8e8d4a6f9c6f)
and view-freshness-reassessment-clarification.txt
(SHA256a9e48eb5fd840243f99ed8f623a3333dd9141adfb6ea53b05af710186a17191e).
The coordinator classifies this as review round5 and the THIRD AND FINAL repair
of the existing authoring-view family: private view lifetime at4de, view-only
Discard/refusal at2767, then this complete live-view producer/capture repair.
The whole-writer adoption repair remains separate; no allowance resets. A
further confirmed failure of this view family after this repair stops for owner.

Clarified observable rules before product edits: Discard protects its click-time
context while queued and before its first await, establishes its post-flush
expected generation synchronously, checks every preliminary wait, and retains
its submitted-generation/adopted-format guards. A newer view stages the COMPLETE
live owner, never a view spliced into the pending replacement. Refusal prefers
its newest owned receipt, with previous-view fallback only for the exact
unchanged submitted bundle. All publication requires the full private-ID,
baseline, effective-public-ID and unretired binding; construction never notifies.
Equal semantic views are quiet, including sample-map key order. Source/history
operations publish only completed receipts, not intermediate own-write states.
A read-only reservation peek requires the exact live owner and baseline plus
workspace binding, and never allocates/writes device IDs; departing snapshots
use their own fields even for shared baselines, and false mint state clears an
old true flag. Atomic view restore retains the existing paused-account sample
gate. Legacy/no-envelope generation invalidation is not a durable view receipt:
without a real binding/owned clock, capture leaves the view absent.

The first bounded uncommitted repair matrix j-0114 is terminal FAIL:6PASS/4FAIL
(35.4s), retained in selection-j0114-original.txt. App types pass; maintained
session oracle8/8 passes, including sample-map insertion-order equality versus
ordered primary selection, synchronous reentrant publication, completed
execute/travel history, external-reset ordering and restore/cancel.

Two j-0114 assertions are overbroad new-fixture expectations: the switch route
visits another document and legitimately allocates that visited owner's existing
reservation; Save As legitimately chooses the available name E4 Lower third2.
Their original failures are retained and no assertion has been changed.
Two failures remain genuine in the existing view family: a failed/aborted D
retains the new selection in the live staged bundle but immediate reload restores
an empty selection; semantically equal sample-map key reordering leaves the
session context token unchanged but advances workspace generation5 to6, because
the reference-based sample subscription stages the live source over D. The
selection-only autosave, Home, Save, held replacement, preliminary wait and queued
Discard cases pass. No inference beyond these exact working-tree cases follows.

Product edits stop at this checkpoint under the coordinator's THIRD AND FINAL
family repair boundary. The candidate is not ready, not committed/pushed, has
no new-head CI/backend/fullSO, no A grade and no stamp. The previously pushed
2767 remains held. No further family split, allowance or worker reset is claimed.


## Owner exception 1: observable Rules before the combined repair (2026-11-12)

Same run and E4, serial resuming builder `/root/editor_e4_owner_repair`, nonce
`e4-owner1-20261112`. Owner receipt SHA256
`b15285eeb7b3bb92787bfa3df50c65315ec3e024f1fd5b960e7d904dc70a7839`
authorizes exactly one additional bounded combined repair. Five review rounds,
three ordinary family repairs, j-0113 failures and j-0114's six passes/four
failures remain unchanged. Initial retained source HEAD is
`2767a30cb0fccbb9a04f4f2e0ca285b32e4f94d6`; its nine-file patch SHA256 is
`674b343a64c616222c4820fee3746a251c788b8167c5a2920a9187657439997d`.
This is no new run, family, phase or allowance reset. A remaining confirmed
product failure after the combined repair ends this exception.

Observable Rules for the fresh repeated-family pre-code reassessment:

- When Discard is refused or its durable replacement aborts, its answer must
  retain the actual current private owner, source, history and latest legitimate
  complete view through immediate reload. Restoring optimistic staging alone is
  insufficient: confirm a real correction receipt before returning. Preserve
  the original failure and report a correction failure truthfully too. Unknown
  or independently adopted envelopes remain refused, and conditional recovery
  never overwrites their owner or restores a removed active document.
- Equivalent sample maps, including different insertion order, must be filtered
  before full-owner retention, reservation inspection/allocation, staging or
  scheduling. Equal selection arrays and equal observations stay idempotent;
  ordered selection changes and genuine away/back changes remain meaningful.
  A held Discard candidate remains exactly its submitted bundle after equivalent
  view notifications. No equivalent view mutates source/history, links,
  reservations/device IDs, membership, installation journals or on-air copies.
- Keep supplied-state live selection/samples, true owned binding clock/cue,
  historical undo/redo view receipts, completed source/history publication,
  full retired-binding guards, paused-account sample authorization, exact-owner
  nonallocating reservation capture, queued/pre-first-await/submitted Discard
  guards and all adopted/unknown-format/boot-projection recovery boundaries.
- Correct only the two demonstrated new fixture assumptions: ordinary source
  writing when visiting another document may reserve that owner's ID, and
  Save As chooses the actual free name `E4 Lower third 2`. Keep all owned
  source/history/view and durability assertions. Historical six/four stays so
  until a separately recorded new-source execution proves each case.

Use the existing architecture, protocol, formats and persistence lifecycle;
introduce no waits/retries/skips, weakened judge, maintenance/budget exception,
provider/migration/engine/licence change or additional model product round.
The required focused fresh read-only reassessment precedes product edits; a
fresh final FULL SO A/A+ and all current-head gates remain due. These notes
remain in the retained patch until the brief's one coherent final push; this
narrows the generic Rules-first early-push wording to preserve the explicit
single-push instruction and the failed source checkpoint.


Owner-exception model assessment completed before product edits: fresh actor
`/root/editor_e4_owner_repair/e4_owner1_model_so`, AGREE WITH CORRECTIONS,
normalized receipt `owner1-model-so.txt` SHA256
`025552786ae4a82a3bdabcf99ea073fe458c9b9c00399398263af4bee67ec85b`.
It verified frozen pre-code diff `d785964db3c7827b3bc13e07fde11cb8417819a8637d1c246d6989226ebed540`
before and after inspection. No clarification was needed. Root acknowledged
PATCH_START and charged this single grant used1/1, remaining0 before edits.

The combined repair applies semantic sample equality before subscription effects
and in asynchronous project continuation checks. It confirms actual current-owner
correction receipts for aborted/zero-receipt/preliminary failed Discard, preserving
original and correction errors. Unknown/adopted refusal still precedes writing;
conditional recovery is unchanged. A changed owner, library or generation during
correction is reported as unconfirmed, leaving newer staging intact without a
retry loop. Only the documented visited-owner reservation setup and exact free
Save As name assumptions were corrected in the original selection matrix.

New-source targeted verification (not retroactive historical passes):

- Original ten-case selection matrix j-0115: 10/10 PASS in40.2s, two Cloud
  workers, five-minute cap, zero skips/retries. Original failed-replacement
  immediate reload and equal-view/held-Discard assertions both pass.
- Added fixed-rule oracles j-0116: 5/5 PASS in16.4s, two workers, five-minute cap,
  zero skips/retries. Equivalent map ordering during held project switch/Home
  preserves exact submitted workspace/generation/token and succeeds. Preliminary
  aborted write confirms the latest view through immediate reload. Refused
  correction reports both original storage error and quota error. Newer view
  during held correction keeps its complete live owner and reports unconfirmed.
- Maintained session/workspace/reservation source oracles:33/33 PASS. Changed-path
  gates:120/120 PASS across14 files. App TypeScript, affected ESLint and dependency
  cruise pass (zero violations). Per-test protection passes:60 project cases,
  unchanged limits and no removed protection.
- Local pre-review capacity check ran with the standard growth fetch: latest
  run43201149088 artifact remains unreadable through worker ingress (403), so the
  normal frozen-seed fallback reports WARN197.7/213 table-minutes93%, added0.42min.
  This older branch helper is not current-main cost-only REPAY clearance. Actual
  candidate CI capacity/Configured evidence remains mandatory, with #2450 debt
  attribution and no ceiling/exception/maintenance edits.

Current-main reconciliation is clean at `077e959b2` (merge-tree and merge-order;
no merge or rebase needed). The one committed-source broader selection, actual
new-head normal CI/backend/Codex result and final fresh FULL SO remain pending.
No production build is repeated locally: the added script/dependency shape is
unchanged from2767's historical successful CI build, while final-head CI must
prove the complete build again. No migration, model/product call, provider,
licence, engine, acceptance or later-phase change is made.
