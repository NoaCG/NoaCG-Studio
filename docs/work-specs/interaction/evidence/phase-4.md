# Phase 4 evidence: chat votes

Spec: `docs/work-specs/interaction/spec.md`, phase 4 (AC-10, AC-15 repeated). Base:
`034cbc057621083581361db310d848d7b2530844`. Branch: `claude/plan-interaction-4-build`. The PR, its
reviewed head, the CI run and the merge sha are in the PR description and the receipt to the
coordinator; this file holds what was checked and how.

## Per criterion

| AC | Result | Evidence |
| --- | --- | --- |
| AC-10 | pass (local) | Node: `scripts/chat-votes.test.mjs` (9 tests) runs the real YouTube reader and Twitch reader on recorded-shape fixtures (`scripts/fixtures/youtube/chat-vote-pages.json`, `scripts/fixtures/twitch/chat-votes.json`) through the real intake into the local provider, with the clock set to the fixtures' own times. Pinned: a number or letter counts once per author (`1`, `b`, ` 2 `, a change to `B`); a repeated message id counts once; out-of-order arrival keeps the latest by platform time, inside one page or frame and across pages; the earlier page votes only with what was said after Go live (two lines said before vote on nothing); a paused backlog votes on the new question only with what was said after it went live; a reconnect replay votes on nothing new, both with the page's dedupe and after a reload without it (the window); non-vote lines reach the inbox (YouTube as before, Twitch through the operator door while a vote is live); phone and chat counts apart and summed (`[1,0,0]` + `[2,3,1]` = `[3,3,1]`); a burst of 500 Twitch votes is counted whole while the message throttle still holds messages to 10; a round closed under a send moves only the votes said inside the next question's window; a failed reading of what is live is retried, never taken as nothing live; this page's Go live is read at once. The allowance is read from the recorded fixtures (whole-second YouTube times). Configured, on a local Supabase stack: `e2e/configured/audience-live.spec.ts` "questions on the server" calls `audience_operator_votes` directly: once per voter, latest by platform time across calls, nothing before Go live, no display name as a voter, 500 at once past the phones' 300 cap, 501 refused, a closed round refused as closed, `audience_tally` apart and summed. Migration 0113's self-check ran on the local stack with a throwaway account. |
| AC-15 | repeated with chat votes: local-stack walk run here and in CI | See "Rehearsal walk" below. |

## Rehearsal walk (AC-15, phase 4)

`e2e/configured/audience-live.spec.ts` "the rehearsal walk" is the phase 3 walk with chat votes
added at the vote: after the phone votes Away, a chat source in the studio tab (the test source,
standing in for Twitch) says `1`, `b` and a line that is not a vote. The panel shows Home 1
("0 phone · 1 chat") and Away 2 ("1 phone · 1 chat"), the source reads "1 in · 2 votes · 0
dropped", Add results to rundown stages the summed result on House Vote and Take airs it, and the
room moves through the third question to the waiting text. The phone's six screens and the
studio's tally are attached to the test result.

Run here on a local Supabase stack (CLI 2.111.0, all 113 migrations applied from scratch): the walk
passed twice (jobs j-0005 and j-0007, 45 to 50 s). The screens were read one by one: the phone shows
the vote with A and B marks, the studio's tally reads Home 1 "0 phone · 1 chat" and Away 2 "1 phone ·
1 chat", Take airs Away. The phone still lists the Open answer under "What you sent" during the vote;
that list is the device's own messages, as before this phase, and is not a finding of this phase.

Findings: none blocking, none filed. Considered and not filed: chat viewers need to know to type a
letter or number; the phone already labels options A and B and the vote board recipe has letter
marks, and how results look on air is phase 5.

## Checks run on this machine

- `npm run gates -- run --changed origin/main` on the final state: 187 tests, 0 failed (it includes
  `chat-votes`, `chat-intake`, `twitch-chat`, `youtube-chat`, `advisor-baseline-grants` and the
  migration gates).
- `npx tsc --noEmit -p tsconfig.json` and eslint on the changed files: clean.
- Mutations (each reverted): removing the page's window check fails "Twitch: ... a reconnect
  replay"; letting an older vote overwrite a newer one in the local room fails the YouTube test;
  a no-op `liveChanged` fails "this page's Go live is read at once"; no retry of a failed reading
  fails "a failed reading ... is tried again".
- Migration 0113 on a local Supabase stack: applied in a from-scratch `supabase start`; its
  self-check run with `psql` after a throwaway account was added (a fresh stack has none, so it
  skips on start), again after the tally rewrite: passed.
- Configured, on that stack (`playwright.live.config.ts`): "questions on the server" (with the chat
  vote calls) and "the rehearsal walk": 2 passed (j-0003), again after each review round (j-0007, j-0008, j-0010).
- Offline, local queue: `e2e/production-chat-intake.spec.ts` whole (9 tests; the first run lost two
  YouTube comment tests to the dev server failing to serve `App.tsx` while Docker pulled images,
  both passed on the next run, j-0004) and the chat, vote, tally and result tests of
  `e2e/production-audience.spec.ts`: 13 passed (j-0006, again on the final code j-0011).
- Capacity: `node scripts/e2e-capacity.mjs --changed origin/main`: 174.0 of 210.7 table-minutes
  (83%), no new spec file. `check-e2e-protection` could not build its base tree here (no packages
  in its temporary checkout); CI runs it. No test was added to a spec file (one offline test was
  renamed and rewritten for C10).
- Not run here: the full affected offline selection (the stylesheet edit fans out past the local
  bound) and the catalog battery; both run in the PR's CI gate.

## Review rounds

- `/check` review (delegated, high): 10 findings, 9 fixed. The live reading went stale for three
  seconds after this page's Go live (now read at once); a failed reading read as "nothing live"
  (now retried); only the first page after a resume was a backlog (the window now decides alone);
  the viewer door read what was live a second time (it now takes the intake's reading); a replaced
  vote was counted as sent; the tally counted three times per option (one grouped pass now); a
  duplicated operator-door push (one helper); the local provider's comment claimed the chat
  ceiling; the evidence placeholders. Not changed: votes that reach the page after Stop are not
  counted (C6 says so; a phone's would not be either).
- Read-only `/so` on `b07adf0` (fresh cloud session): AGREE WITH CORRECTIONS, grade A-. Four
  findings, all fixed: the source's vote figure counted sends, not what the server counted (now the
  server's count, the rest dropped); one unreadable time in a call made the whole call fail (each
  item's option and time are now checked before their cast, and 0113's self-check sends a 30
  February and a non-number); a vote said just before Stop that arrives after it is lost (C6 as
  written; the panel now says to wait a moment before Stop); every backend change cleared the
  reading of what is live (now only this page's Go live and Stop do). A fresh `/so` assesses the
  final head.
- Read-only `/so` on `1ec645d`: AGREE, grade A, three low findings, none blocking (a dropped count
  can be credited to the wrong source when one batch mixes YouTube and Twitch; a reading of what is
  live that hangs rather than fails holds lines without a timeout; the fixtures are recorded-shape,
  invented data). Not changed; the coordinator may file them.
- PR review of `1ec645d`: one P2 finding, fixed: a send that failed and was retried could
  overwrite a newer vote from the same voter with the same whole-second time. Vote sends now run
  one at a time in arrival order, and a retry leaves out replaced votes (C4); test "a retried send
  never overwrites a newer vote said in the same second", which fails with the filter removed.
- `45c7c7f` restored `scripts/e2e-traced.json` to main's copy: squashing onto a moved `origin/main`
  with `reset --soft` had put an older nightly map back.
