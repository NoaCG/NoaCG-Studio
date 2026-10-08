# Receipt: the review loop, NoaCG first (AC-6 to AC-10 for moderator accounts, first slice)

Branch `claude/k-community-packs-workflow`, 2026-10-08. Written by the implementing row; a reviewer
still judges it.

## Server (migration 0079), called against the local stack

Applied to the local Supabase stack (`supabase_db_noacg-studio`) with its ledger row, then a
script that mints two throwaway users (one a moderator), calls every function as `anon` or as
`authenticated` with the caller's JWT claims, records each answer and rolls everything back.
`scripts/db-push.mjs` `classifyMigration('0079', ...)`: not blocked, not live-path, no findings.

Observed, step by step:

```
1 maker submit (not moderator) => REFUSED Submitting packs is open to NoaCG only for now.
2 anon submit => REFUSED permission denied for function community_pack_submit
3 moderator submit, no description => REFUSED The pack needs a description of at most 200 characters.
4 moderator submit, not a pack => REFUSED That is not a NoaCG graphics pack.
5 moderator submit => ok <uuid>
6 direct table read as authenticated => REFUSED permission denied for table community_packs
7 direct insert as moderator => REFUSED permission denied for table community_packs
8 shelf as anon while in review => ok 0
9 other maker reads the in-review file => ok null
10 mine as moderator => ok Mod pack:in_review:NoaCG test
11 waiting as maker => ok 0
12 waiting as moderator => ok 1
13 maker approves => REFUSED Only a NoaCG admin can decide on a pack.
14 moderator turns down without reason => REFUSED Give the maker a reason.
15 moderator approves => ok
16 shelf as anon after approval => ok Mod pack by NoaCG test (2)
17 anon reads the live file: author and license stamped => ok NoaCG test / CC-BY-4.0
18 other maker withdraws it => REFUSED That pack is not yours to withdraw, or it is no longer offered.
19 moderator takes down with reason => ok
20 shelf after takedown => ok 0
21 mine shows the reason => ok taken_down:Test takedown
22 moderator submits a second pack => ok <uuid>
23 maker withdraws own in-review pack => ok
24 mine after withdraw => ok Mod pack:taken_down,Second:withdrawn
```

After the branch's review, the migration's own self-check also CALLS the doors as an existing
account made a moderator for the moment (submit waits for review, a pack carrying cues is
refused, approval reaches the shelf with the licence stamped, withdraw takes it off) inside a
block that rolls itself back; applied to the local stack it passed, the 24-step script above gave
the same 9 refusals again, and the table and `moderators` were empty afterwards.

The first run of this script found a real defect: the submit function called
`public.is_suspended(uuid)`, which migration 0020 reshaped to `is_suspended()`. Fixed before the
migration was committed; the run above is after the fix.

## The loop in the product, `e2e/configured/community-pack-review.spec.ts`

Run against the local stack (`playwright.live.config.ts`, `VITE_SUPABASE_URL` and keys from
`supabase status`), 1 passed. The walk: an admin makes two lower thirds in a Home folder, opens
the wizard's Community packs shelf, Submit a pack, picks the folder (two graphics ticked, name
pre-filled from the folder, Send for review off until the description and the shown name are
filled), sends it; Your packs reads In review; a signed-out visitor's shelf does not list it;
Waiting for review shows "Checks passed" (re-run on the stored pack) and "by Pack Tester";
Approve; Your packs reads Live; the signed-out visitor's shelf lists the card "by Pack Tester ·
CC BY 4.0" with a live preview and installs it as a production with two starter cues; a
signed-in account that is not an admin sees the card and no Submit a pack; Take down with a
reason removes the card, Your packs reads Taken down with the reason, and the visitor's installed
production is still in their Productions. Then the admin sends the same folder again (Shown as
pre-filled with "Pack Tester", the name chosen on the previous pack), Withdraws it from Your packs
through the confirmation, reads Withdrawn, and Waiting for review is empty again.

One run failed mid-walk because another session reset the shared local stack (the ledger fell
back to 0078 and `public.moderators` vanished from PostgREST's cache); after re-applying 0079 the
walk passed again.

Frames: `submit-sheet-desktop.png`, `review-shelf-desktop.png`, `review-shelf-phone.png`
(375x812), `shared-card-desktop.png`, `shared-card-phone.png` (375x812).

## Offline, `e2e/community-packs.spec.ts`

3 passed. Adds to the seed walk: no Submit a pack offline; Install stamps the Pub Quiz graphic
`fromPack { id: 'pub-quiz', version: 1, author: 'NoaCG' }` and the picker's sources leave it out.
A new test: the checks refuse a Google font (naming the graphic and `fonts.googleapis.com`),
placeholder text, two graphics sharing a name and an empty description; a clean two-graphic set
passes, builds with `license: CC-BY-4.0` and the chosen author and no rundown, and installs as a
production with one starter cue per graphic.

## Not covered here

AC-5 (the design lock) and the attribution line are a Playout row's. Withdraw of a LIVE pack is
covered by the same server path as an in-review one (the function accepts both states) but was
walked in the UI only on an in-review pack. Not accepted with a reason was walked
nowhere; only the server's refusal without a reason (step 14) was. Update (AC-11), the door for every maker (D12), and the agent door
(AC-12) are later slices. Runtime request observation (D5) is not built; the admin's try-out
stands in.
