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
