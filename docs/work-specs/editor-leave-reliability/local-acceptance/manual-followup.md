# Owner-operated local follow-up

2026-10-20. **PARTIAL / INCOMPLETE. Whole Phase 2 acceptance remains pending.**
Product source remains `12eccdd8533ba710f0917cb3bcc78101070ecca8`.
This follows the [stopped automation receipt](README.md); its original failure,
queue record, deadline and retry count are unchanged. These are later manual
observations, not a successful retry of job `j-4653` or proof of its key delivery.

## Execution and observations

The owner asked this chat to restore the page and guide the checks. The remaining
local tab initially showed connection refused, rather than the original dialog.
The sanctioned worktree dev server was restored on its reserved localhost:5282
port. Reload recovered the newer `Discard experiment` draft. Only that existing
offline authoring tab was used; no account was authenticated. No headless suite,
Docker startup, product edit or limit change followed.

The owner then performed and reported the following in this chat:

| Check | Owner observation |
| --- | --- |
| Escape from the leave dialog | Dialog closed and editor stayed open |
| Home, Discard, reopen | Saved text `Phase 2 local check` returned |
| Actual Chrome zoom 125% | Save, Home, inspector and timeline visible and usable |
| Reload saved work | Text, position and tilt retained; no save prompt or missing work |
| SPX download | `p2_local_12ecc_spx.zip` downloaded without warnings or errors |
| Windows file-picker import of that ZIP | Imported preview retained the text, position and tilt without errors |

Read-only browser snapshots separately observed the saved editor text, Saved
indicator, playhead at about 1.26 seconds and its Name rotation key. After the
owner's native import, a snapshot observed the wizard import preview with
`Phase 2 local check`, 1920x1080, 25 fps and two operator fields. These snapshots
do not independently prove native picker operation, actual browser zoom, exact
position/rotation values or archive byte equality. The native steps and 125%
observations above are attributed to the owner.

## Remaining boundary

The first follow-up did not find the ZIP in the usual Downloads folder.
Download-history access through the browser interface was denied by URL policy;
no alternate surface or policy workaround was used. At that point the imported
copy remained at the wizard preview, unsaved, and the saved original remained in
Home. The server was then stopped at the owner's request for a break.

On resumption at home, the owner supplied `C:\downloads\p2_local_12ecc_spx.zip`.
Read-only inspection found 285733 bytes, SHA256
`e3e8fbb191e379f018ff8e63420a138514be70d7f1f1e5841c126e496f55fec4`.
The HTML retains the edited text and independent author metadata. Original CSS is
unchanged, followed by the expected Name placement block with x=12px, y=0px,
relative positioning and scaled left/top offsets. The animation state differs
from the original fixture only by the intended Name rotation key, 5 degrees at
1.26 seconds. JavaScript outside that state block is byte-identical, including
the custom author function. The SVG mark, font, GSAP and flex-gap shim are each
byte-identical to the fixture. See [archive-inspection.json](archive-inspection.json).
This is source preservation evidence, not a fresh imported-animation runtime or
playout-host receipt.

The inspection's first inline command failed before execution because of shell
quoting. A subsequent ad hoc CSS expectation wrongly assumed the placement block
contained only x. Inspection of `src/blocks/baseEdits.ts` confirmed the full
generated block; the corrected check compared all five declarations exactly.
Neither event is a product failure, and no maintained acceptance assertion,
source byte or budget was changed. An independent readiness port probe also
failed before connecting because its inline module format was ambiguous; no
backend reachability claim is based on that probe.

The resumed Git read and Actions read preflight each passed. REST PR reads passed
through gh and the GitHub connector; gh GraphQL reads separately passed. These
reads do not qualify writes or dispatch. Remote main was
`1b909153753eb3043092ced7c681592a3d924820`; it was not adopted. Both held PRs
remained OPEN with null auto-merge/queue entries; #1466 remained CLOSED and #1498
OPEN. No competing editor work was reported by worktree activity; the previous
repair-owner cloud chat was idle, with terminal duty already complete.

At resumption the browser inventory had no NoaCG authoring tab. No new server,
authoring tab, profile, account or browser acceptance run was started. Free memory
was 727 MiB. The current shell could not find Docker or Supabase executables;
usual Docker installation paths were absent. This updates readiness without
rewriting the earlier installed-but-unreachable observation. Worktree environment
file metadata revealed no separate account-test configuration; production env
contents were not read or copied. The repository's hosted staging ref was found
in its registry, but the connected Supabase project inventory exposed only
production. No keys, production data or project settings were read or changed.

Sequential isolated-profile account handoff is still not run. The previously
identified isolated test backend remains unavailable; only the readiness reads
above occurred on resumption. No Docker startup occurred. A ZIP round trip is not account handoff or
physical-device proof. No authentication/sync repair or renewed diagnostic budget
is claimed; the original shared-lab module-load cause remains unresolved and its
three revised diagnostic attempts remain spent.

All assertions, 32 group cases, budgets, original failures and existing deferrals
remain. Repeated reference execution remains deferred. Step 6 is COMPLETE;
#1466 is CLOSED via #1528; #1498 remains unresolved. #1532/#1533 remain held by the
existing instruction; this follow-up does not change their state. No issue closure,
landing, quarantine workaround, Phase 3 or whole-acceptance stamp is authorized by
these observations. See [manual-followup.json](manual-followup.json).

## Temporary hosted branch attempt

The owner subsequently approved using the NoaCG organization and a temporary
Supabase branch, with deletion at the end. The cost interface quoted USD 0.01344
per hour for compute. One fresh, non-persistent branch was created without
production data at 18:41:03 UTC on October 20. Its automatic setup reached
`MIGRATIONS_FAILED`; its ledger contained versions 0001 through 0073. No browser
acceptance check, account creation, key retrieval, local server or migration
repair followed. One bounded Postgres error-log query returned no rows; the
deployment error itself was not captured.

The repository's next migration, `0074_seq_log_index.sql`, uses
`CREATE INDEX CONCURRENTLY`. Current [Supabase documentation](https://supabase.com/docs/guides/deployment/branching/github-integration)
states that branching executes each migration file in a single transaction and
cannot apply that statement, whereas the normal CLI migration runner can.
This documents a compatibility mismatch consistent with the stopping point;
it is not a captured error or a demonstrated repair. The compatibility check
should have been made before creating the branch. No production migration or
editor defect is established by this setup failure.

Deletion succeeded. A fresh branch listing at 18:42:51 UTC showed only the main
branch, confirming that the temporary branch no longer incurs ongoing compute.
Usage during its short lifetime may still be billed; no zero-invoice claim is
made. The setup was not retried. See [temporary-branch-attempt.json](temporary-branch-attempt.json).
Whole acceptance remains incomplete, with imported-animation playback and
sequential isolated-profile handoff pending. All original failures and attempt
limits remain; this does not renew the spent shared-lab diagnosis allowance.

## Bounded normal-runner recovery preparation

The owner approved one normal-runner setup recovery with unchanged migrations,
product, tests and limits, branch-only access, stop at any refusal, and cleanup.
The cloud executor qualified CLI 2.111.0 and an authenticated branch metadata
read, but stopped before creating a paid branch: no supported endpoint-specific
database admission was available in that worker. VPN was disabled and TCP grants
were empty; the documented CONNECT route was limited to private IPv4. No database
connection, SQL or migration execution was claimed from HTTPS metadata success.

The coordinator then checked the same normal route locally, without Docker.
Pinned CLI 2.111.0 was downloaded and its read-only branch listing succeeded using
the repository's existing credential loader in place. No credential file or value
was copied to the cloud or printed. Only main was listed. This qualifies that
metadata read, not database connectivity or migration writes.

Before any new paid creation, a source-only call to the existing migration
classifier found `0085_community_gallery_retired.sql` blocked for six DROP
statements. Other files after 0073 classified unblocked. The unchanged 0085 locks
its two legacy tables, refuses unless both are empty, and checks retained
community-pack objects after retirement. Its normal wrapper mechanism requires
an explicit `--allow 0085` decision. The coordinator stopped and asked the owner
for that branch-only approval; no override was used and no paid branch, account,
local server or acceptance run was started. See [backend-recovery.json](backend-recovery.json).

## Branch-only approval and creation refusal

The owner replied `Ok` to the pending request for the normal explicit approval
of 0085 on a new disposable branch only. That approval does not cover production,
another migration override or a changed assertion, limit or SQL file.

After re-reading the workflows, migration wrapper and terminal PR 1537 receipt,
the coordinator reconciled the idle cloud repair owner, local worktrees, shared
port reservations and empty local job queue. The owned 5282 reservation remains.
Local main was 331a98a9 and remote-tracking main was 1b909153; neither is qualified
by the pinned 12ecc receipt. The source paths for product, tests, scripts,
workflows, migrations and package files still have no changes from 12ecc.
Repository PR reads succeeded through the connector; this does not qualify
GraphQL, database connectivity, dispatch or other writes.

One Supabase MCP request attempted to create
`codex-p2-local-recovery-12ecc-20261020`. It returned `INVALID_ARGUMENT` with
`Invalid or expired requestState` and reason `invalid_request_state`. A fresh
branch listing then returned only default main. The coordinator stopped under
the approved stop-at-refusal rule, without retrying creation or substituting
another creation route. No new branch was present to delete. No migration
runner, account creation, key retrieval, local server or acceptance check ran.
Database connectivity remains unqualified. The 0085 approval was not executed.

This is a setup refusal, not a new editor acceptance failure or a repair claim.
Imported-animation playback and sequential isolated-profile handoff remain
pending; whole Phase 2 acceptance remains incomplete. All original failures,
spent diagnosis limits and deferrals remain effective. No paid test branch is
active, and no PR, landing, passing stamp or issue closure was requested.

When the owner asked what comes next, the coordinator investigated the supported
cost-confirmation route. A fresh quote remained USD 0.01344 per hour; the existing
owner approval covered that unchanged cost. `confirm_cost` issued a fresh ID.
The exposed `create_branch` documentation accepts `confirm_cost_id`, but its
server rejected that field with a Zod `unrecognized_keys` error. A fresh branch
listing again showed only main. This is an interface mismatch, not database or
write-access qualification. No confirmation value is retained in this receipt.

The coordinator stopped again and requested a specific decision to resume via
the Supabase dashboard, preserving the same scope, price, migration checks and
cleanup requirement. No alternate creation route, account, migration or local
acceptance check was started while that decision remained pending.

## Dashboard recovery and bounded manual continuation

The owner approved the dashboard route. It created a fresh, non-persistent,
data-less preview branch at 20:09:25 UTC. The coordinator used unchanged
`scripts/db-push.mjs`, pinned CLI 2.111.0, the explicit branch ref and only
`--allow 0085`. The quiet-window read found no renderer heartbeat. All nineteen
pending migrations, 0074 through 0094 with the repository's existing number gaps,
applied without retries. Before/after snapshots and the exact ledger addition
check passed. A fresh query found 92 migration rows, latest 0094, zero users and
zero documents. Local database transport and these branch writes are qualified;
cloud database transport is not. The separate automatic branch deployment later
reported `MIGRATIONS_FAILED`; that pipeline is not reported as passing. A security
advisor query returned definer-execution findings, without a completed baseline
comparison or a clean-advisor claim.

During dashboard sign-in, an accessibility response automatically included
credential-bearing callback fields before redirect completion. No values were
copied or reused. Automatic review blocked a further callback-state read, and
a screenshot safely confirmed the completed sign-in instead. This receipt does
not claim that the callback's tool output was credential-free, and retains none
of its values. Source-path and queue-helper mistakes in read-only setup probes
are also recorded in the JSON receipt; they are not editor acceptance results.

Initial browser readiness was below the recorded manual 1536 MiB admission floor.
The coordinator attempted cleanup, but MCP deletion failed. The owner then asked
to wait while freeing memory, so dashboard deletion was paused. After Chrome
restarted, 2156 MiB was free and no queue runner or live job was present.
Automatic approval review separately refused the prepared account/server script
until the owner explicitly authorized its fresh branch service-key read in
server memory, one confirmed disposable test account with the public fixture
password and the localhost server. No script execution occurred before that
approval. No existing credential was copied to the cloud; no privileged key was
printed, written to a credential file or sent to the browser.

New queue job `j-4660` reserved the browser slot at cost 1 with the same approved
1536 MiB process-local floor and unchanged twelve-minute cap. This did not restart
or alter failed `j-4653`. Only Chrome and one sanctioned worktree server ran;
there was no headless suite, Docker startup or shared-lab diagnosis. The test
account signed in through Home, which showed an empty, Synced account workspace.
The verified backup was imported through the supported file chooser. That tool
operation completed successfully but took 409.4615 seconds, consuming most of
the allowance; it did not reverify the native picker already reported by the owner.

The imported source timeline retained four layers, the edited text and the Name
rotation key at 1.26 seconds. Go to beginning showed a blank 0.00-second canvas;
Play advanced to the rendered artwork and held at 1.26 seconds / 32 frames.
Both rendered states were inspected in inline screenshots. The graphic was saved
as `P2 handoff 12ecc`; the editor showed Saved and Home showed one graphic with
Sync: Synced. An independent database read confirmed that exact graphic name and
ID under the disposable account. A local Saved label alone was not used as cloud
proof. The first NoaCG tab was then closed before asking the owner to sign in
from Chrome Incognito and inspect saved contents without editing.

The allowance expired before a second-profile confirmation arrived. The manual
lease logged its unchanged twelve-minute cap and exited 1; the preserved queue
record is failed. Its generated generic `auto-merge refused it` reason does not
describe this sweep: no merge was attempted. The owner reported `This site can't
be reached` after the server had stopped. This does not establish a product
failure, and it does not prove the handoff. No cap extension or retry followed.

Dashboard deletion completed. At 20:31:48 UTC, a fresh branch listing showed only
main, port 5282 was closed and the queue had no live job. The owned exception
runner had already exited when its PID and start time were checked; subsequent
runners use normal defaults. The branch's short prior usage may still be billed.
See [dashboard-recovery.json](dashboard-recovery.json). Imported animation,
Save and cloud arrival are now observed; sequential isolated-profile handoff
remains incomplete. Whole Phase 2 acceptance is not complete. Original failures,
all assertions and 32 group cases, budgets, skips and deferrals remain intact;
no further historical diagnosis, quarantine workaround, Phase 3, landing or issue
closure follows from this result.

## Owner-approved handoff-only admission, then owner stop

The owner approved one new twelve-minute handoff-only check and required deletion
of its temporary branch. Earlier successful observations and failed/incomplete
admissions remained intact. Readiness again refused browser admission below
1536 MiB; the clock did not start during that wait. Current worktrees and owners,
the empty queue and the retained 5282 reservation were reconciled. No product,
test, script, workflow, migration or package source differed from pinned 12ecc;
the group spec's Git blob remained identical, preserving all 32 cases.

Git origin/main and the Actions API each passed their own preflight. A separate
supported GraphQL read confirmed the repository, PR 1537's exact 12ecc merge,
closed #1466 and open #1498. Observed main was cc3500f2 and was not qualified by
the pinned source receipt. No write or dispatch access followed from those reads.

The dashboard created `codex-p2-handoff-only-12ecc-20261020` at 20:40:22 UTC,
without production data and at the unchanged USD 0.01344/hour compute quote.
The normal pinned CLI wrapper applied its nineteen pending migrations without
retries, using only the previously approved branch-only 0085 override. Its
quiet-window and exact ledger addition checks passed. The separate automatic
deployment was observed as `MIGRATIONS_FAILED`, not passing. No SQL or guard was
edited. The setup dashboard was closed to save memory.

At 2774 MiB free, the empty queue admitted new job `j-4661`, sweep cost 1,
cap twelve minutes, using the approved process-local 1536 MiB floor. It created
one confirmed disposable branch account and started the sanctioned server. The
privileged branch key remained in server memory; no credential file or privileged
browser value was created. A single visible sign-in submission reached an empty,
Synced account workspace. One accessibility observation timed out on
`Page.getFrameTree`; a screenshot confirmed successful sign-in, and a subsequent
accessibility read succeeded without repeating sign-in. That transport failure
is retained, without an app-failure or historical module-cause inference.

The first profile reached the import Design step. The owner was asked to select
the existing native backup, but replied `cant do it im going to bed`. No import,
new graphic save or second-profile observation completed in this admission. The
coordinator immediately requested stop with exit 1, closed the test tab, and
preserved failed `j-4661`. It ran about 173 seconds, within its unchanged cap.
The generic queue reason mentions auto-merge, but no merge was attempted.

Dashboard deletion completed. At 20:50:34 UTC, a fresh branch listing showed
only main and port 5282 was closed, with no live queue job. Only the exact owned
idle exception runner was stopped after checking its PID, start time and empty
queue, restoring normal defaults for later runners. Deletion proof is retained
as an ignored local screenshot. Brief prior branch usage may still be billed.
See [handoff-only.json](handoff-only.json),
[terminal queue record](handoff-only-queue-final.json) and
[log](handoff-only-log.txt).

Work is stopped at the owner's request; no unattended continuation or automatic
restart is armed. The isolated-profile handoff remains incomplete, so whole
Phase 2 is not accepted. All earlier results, original failures, assertions,
32 group cases, budgets, skips and deferrals remain preserved. No issue was
closed and no source change was landed. Keep this chat for a later resumption.

## Morning continuation on October 21

The owner resumed the already-approved local leg in this chat. The source pin,
all assertions and 32 group cases, original failures, skips, budgets and existing
deferrals remained unchanged. Current main was observed through GraphQL as
`7ac4b22159ef3cb120271123599f70fda9fa559f`; it was not adopted or qualified.
The Git preflight timed out, while the separate Actions API read passed.
Supported repository REST and repository/PR GraphQL reads passed independently;
no write or dispatch access followed from them. The prior cloud repair owner
was idle; no relevant competing editor paths appeared in the current activity
scan. The 5282 reservation remained owned by this checkout, with an empty queue.

GitHub reported #1466 CLOSED and #1532/#1533 CLOSED UNMERGED. It now reports
#1498 CLOSED by `github-actions` at 05:10:38 UTC on October 21. This session
changed no issue state and does not infer an original-nightly-failure repair,
completed deferral or qualification of pinned 12ecc from that external closure.

Memory initially remained below 1536 MiB. After the owner closed unused apps,
it reached 2946 MiB; admission later measured 2986 MiB. The dashboard created
`codex-p2-handoff-12ecc-20261021` without production data, at the unchanged
USD 0.01344/hour compute quote. The installed CLI was now 2.112.0 and the
earlier cache shim was unavailable. The official pinned npm package 2.111.0
was restored and qualified; the unchanged normal migration wrapper used its
package PATH and only the already-approved branch-only `--allow 0085`.
All nineteen pending migrations applied once, with exact ledger addition
+19/-0, a quiet window, and fresh readback of 92 migration rows through 0094,
zero users and zero documents. The separate automatic deployment reported
`MIGRATIONS_FAILED`; no automatic-pipeline repair or clean-advisor verdict
is claimed. No SQL, guard, product or maintained test was edited.

Fresh manual job `j-4662`, sweep cost 1 and cap twelve minutes, created one
disposable fixture account and started the sanctioned local server. Fresh
privileged keys remained in server memory, with no credential file, printed key
or privileged browser value. One visible sign-in submission reached an empty
account workspace with `Sync: Synced`. The owner was asked to select the existing
backup in the Windows picker. The final observed page still had an empty file
input; no completion reply arrived during this admission. No backup import,
new Save or isolated-profile inspection completed.

The queue marked the run **timed-out** at its original cap, with null exit code.
The server and its privileged helper stopped, the first authoring tab was closed,
and the queue had no live jobs. The exact owned exception runner had already
exited when checked. No cap extension, assertion retry, older job restart,
historical shared-lab diagnosis or new product defect is claimed.

Cleanup reached the exact disposable branch's deletion warning. A dashboard
announcement initially covered its actions; a screenshot identified that
obstruction and closing the banner exposed the correct menu. Automatic approval
review then rejected permanent deletion despite the owner's earlier cleanup
instruction, requiring fresh confirmation after the unrecoverability warning.
No alternate deletion route was attempted. The confirmation request names the
branch and irreversible loss of its test account/data; its dashboard warning
was retained open. At that point the temporary branch remained active until
confirmation and deletion, subsequently resolved below. See
[morning-handoff.json](morning-handoff.json),
[terminal queue record](morning-handoff-queue-final.json) and
[log](morning-handoff-log.txt).

Whole Phase 2 remains incomplete. Earlier native/125%, persistence, animation,
Save and cloud-arrival observations remain recorded separately; they do not
prove the missing isolated-profile inspection. Step 6 remains COMPLETE. No
quarantine workaround, historical campaign restart, Phase 3, issue closure,
passing whole-acceptance stamp or landing followed.

The owner subsequently replied `Approve permanent deletion` after seeing the
unrecoverability warning. The same dashboard route then deleted exactly
`codex-p2-handoff-12ecc-20261021`. At 10:23:38 UTC, a fresh connector listing
returned only default main; the dashboard also showed no preview branches.
The cleanup tab was closed and a local ignored deletion screenshot retained.
No alternate route was used after the automatic refusal. Usage before deletion
may still be billed; no zero-invoice claim is made. The stopped run and missing
profile proof remain unchanged, and no new admission was started by cleanup.
