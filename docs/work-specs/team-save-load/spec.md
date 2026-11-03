# Team saves that do not carry their images

Why: on 2026-11-03 a live session sent seven 4 MB team saves in under 90 seconds, three hit the
statement timeout, and the production database then stalled and crashed. The session's polling
kept running with no backoff while the database was down. The root cause of the crash is not
proven, because the disk and memory graphs were not readable; these are the parts the logs show
and this repository owns.

## Behaviour

A team save sends images and fonts to Storage once and keeps a small reference in the document,
the way personal sync already does. Every member of the team can read them, and nobody else can.
A team's uploads have their own 200 MB ceiling. A document saved before this change stays readable
and shrinks at its next save, so nothing scans production.

While the backend fails, the team poll and team saves back off, a panel's lease renewal does not
stack up behind a hung request, and regaining window focus runs personal sync at most every 30 s.

## Preserved behaviour

- A save never fails because of an upload. A refused or failed upload keeps that asset inline.
- A failed asset download never clears an asset. The read fails and is retried; an object that is
  really gone keeps its reference, so a later save cannot erase it.
- An explicit flush, a move or a join still acts at once.
- A healthy panel still renews every 4 s.

## Non-goals

- The published `control_shows` write, which carries the same assets to the outputs. It happens on
  publish rather than on every edit, and moving it changes what an output loads.
- `body->updatedAt` in the personal listing. Replacing it needs a column and a backfill on the
  largest table, which the logs do not justify yet.
- Template JavaScript in the document: 0.74 MB of the incident's 3.97 MB document stays.
- Removing a team's old uploads, a batch migration of existing documents, compute size.

## Decisions

- Objects live at `team/<team id>/<hash>-<length>` in `user-assets`. Length joins the hash because
  several people's files now share one folder and the hash is 32-bit.
- A tab opened before this change shows these assets as missing until it reloads. Its saves keep
  the references intact.

### AC-1: A team save leaves its images and fonts out of the request

A document of 3.97 MB with 3.08 MB in assets saves in under 1 MB. Node test
(`scripts/team-assets.test.mjs`).

### AC-2: A teammate sees the same assets, and nobody else can read them

Two accounts in the configured suite (`e2e/configured/teams.spec.ts`): the saved row holds a
reference, the teammate's copy holds the original bytes, and a non-member's download is refused.

### AC-3: Uploads and downloads fail safely

Node test: a refused upload keeps the asset inline and the save succeeds; a failed download fails
the read and changes nothing; a missing object keeps its reference.

### AC-4: Failure backs off and recovers

Node test (`scripts/team-save.test.mjs`): consecutive failed reads and saves wait longer, up to a
ceiling, and one success returns to the normal rate.

### AC-5: Renewals do not stack, and focus does not hammer sync

Node test (`scripts/backend-pacing.test.mjs`): one hung renewal holds later beats back until it is
stale, and focus within 30 s of the last pass runs nothing.

### AC-6: The migration is additive and bounded

`scripts/db-push.test.mjs` accepts `0106`, and the configured suite applies it to a local stack.
