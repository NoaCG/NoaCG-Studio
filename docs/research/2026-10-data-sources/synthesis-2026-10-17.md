# Whole-plan synthesis: production page, data and messages

Decision record, 2026-10-17. Planning only: no product code, migration, run or merge. Draft until
the owner agrees the plan it proposes; nothing here approves it on his behalf.

## 0. Inputs and method

- **Plan reviewed:** PR [#1390](https://github.com/NoaCG/NoaCG-Studio/pull/1390), head `7313cd8`
  on `codex/data-binding-research` (open, draft, unmerged at synthesis time). Base `6cd6f30`;
  `origin/main` had moved to `c1e02c6` without touching any planning file or any code file the
  reviews cite.
- **Review A** (`reviews/review-a-2026-10-17.md`, received as pasted text): reviewed `7313cd8`;
  verdict revise. Code-backed; no browser, provider or Sheet measurement.
- **Review B** (`reviews/review-b-2026-10-17.md`, received as a file): reviewed `7313cd8`; verdict
  revise. Code-backed, with provider pages fetched the same day; no browser, provider call or
  measurement. Both reviews are complete; neither is truncated.
- **Verification by this session:** every consequential code claim was re-read in the current
  checkout (identical files in the cited areas). The table in §1 says what held and what did not.
  No browser walk, provider call, Sheet edit or timing was made here either.

The reviews were formed independently and agree on most structure. Agreement was not taken as
proof: each shared conclusion below was checked against the code, and two shared proposals were
rejected (§2 rows 12 and 19).

## 1. Claims checked against the code

| Claim (A = review A, B = review B) | Result |
| --- | --- |
| Bindings are keyed by graphic name and overlay cue values at Preview, Take, timed fire and Update (A, B) | Holds. `ProductionPage.tsx` `withBoundValues` 1654-1660; call sites 2045-2047, 3034, 3074, 3189. The bound box in the cue editor shows the resolved value with the path as a mark (5165-5190). |
| `/api/data/update` resolves a cue to its pool graphic and appends a command row by graphic name, bypassing the tree (A, B) | Holds, by NAME not id. `api/_lib/dataIngest.ts` 133-141, 256-264; `0047` 95-97. One renderer iframe per pool graphic (`CLOUD_PLAYOUT.md` 201-203), so the row reaches whichever cue of that graphic is on air. |
| An emptied or deleted bound path emits no clearing update; an empty string would (A) | Holds. `production_data_format` returns null for `[]` (`0048`:89); the diff is after-left-join-before with no before-only query (`0071` 262-267, the live body); documented as intended in `0060` 90-92 and `0088` 75-76. A string `""` formats to `""` on both sides, so a managed adapter can clear by writing `""`. Nuance A missed: the operator door after `0088` refuses null on a bound path and accepts `[]` only over an existing list. |
| Staging falls back to `show.graphics[0]` and its first text field; a vote board can be chosen by its Question title (A, B) | Holds. `ProductionAudienceWorkspace.tsx` 606-609, 617. Poll detection is exact lowercase title equality on question/poll question/prompt and options/answers/choices (88-98), not the regexes A quotes. The by-title search runs first; the blind fallback is the last tier. |
| Two presses create two cues (B) | Holds. No pending guard; `addShowCue` is synchronous; the row is marked used after the durable write (628-636). |
| The YouTube reader handles live chat only, discards the first page, holds the key in memory, loses the source on reload (A, B) | Holds. `youtubeChat.ts` 90-99, 66, 105-108, 24; key at `ProductionAudienceWorkspace.tsx` 248 (A's 161 is the component line); registry `chatIntake.ts` 169-172. No `commentThreads` use anywhere. |
| The local inbox is deliberately not durable and a test pins that (B) | Holds. `localAudience.ts` 9-12, 71-72; `e2e/production-audience.spec.ts` 118-120. |
| Standings need rows (f2) and headers (f3) together; the column count comes from f3 (A, B) | Holds. `results/shared.ts` 153-165, 192-213: cells drawn = header count; extra row values are dropped silently. |
| Credits break sections on blank lines; a role needs `Role:` or `Role \| Name` (A, B) | Holds. `endCredits/shared.ts` 203-243. A `#` line is a heading; `# PRODUCTION \|` keeps the pipe in the heading text, so an adapter trims trailing empty cells before joining. |
| A ticker splits `KICKER: text` on the colon; a pipe is plain text (A, B) | Holds with a precision: tab first, then the first `:` or `;` followed by whitespace or line end within 32 characters (`tickers/shared.ts` 107-157). The bilingual crawl splits on the pipe in its own row builder. |
| No seconds-scale scheduler exists; Vercel cron runs at most once a minute (B) | Holds. `vercel.json` one daily cron; pg_cron runs daily prunes and a daily unpublish job; no edge functions; scheduled workflows touch staging or read only. |
| The function budget is full at 12 of 12 (B) | Stale figures, right conclusion. The cap is 13 (`scripts/check-function-budget.mjs`:33); the folder is full at 13 at the PR's base and at 12 on current main after the admin routes were consolidated; `api/AGENTS.md` still says 12 of 12. The plan adds no function: the feed route and the server tick are segments of the existing data catch-all (§3). |
| The hosted page's staged buffer is per graphic (B) | Holds, and the hosted page already keys staged edits per cue inside it (`src/control/cueStaging.ts`, issue #1036): the same class of fault, solved once. |
| `AudienceSubmission` has original and broadcast text, anonymity, status and usedAt; the backend has no airing method (B) | Holds. `audienceTypes.ts` 35-53, 147-167. The database table also carries `skipped_at`, `moderated_at` and `device_token`. |
| Publish pins bindings; a later binding moves nothing on air until the next publish (A, B) | Holds. `hostedControl.ts` 558; the column is `bindings`, not `data_bindings`. The row is owner-writable, so no new RPC is needed to update it. |
| The output renderer could poll Sheets while OBS has it open (A) | Rejected. The output page holds no operator credential and must not write the log; giving it a writer would open a public write path (`sheet-data-flow` "Sheet safety"). |

## 2. Reconciliation table

Columns: the issue; the plan at `7313cd8`; review A; review B; the conclusion; evidence; phases
affected; what stays uncertain.

| # | Issue | Plan at 7313cd8 | Review A | Review B | Conclusion | Evidence | Phases | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Where the task starts | Shared content workspace with a Messages view; field actions too | Cue editor plus an in-page message tray; no workspace as the home | Cue editor "Fill from / Follow" as the home; Messages inbox for candidates; Data view as overview plus Advanced | **Field-led.** The cue editor is the home: its graphic is the destination by construction, which removes the #1313 class. The Messages view stays for candidates and sources; the Data view becomes an overview with Advanced. No new workspace. | `ProductionPage.tsx` 5094-5137 already offers "Load data row" and `editDraft` | C0, C1, C6 | Trial (Q) confirms students find the menu |
| 2 | Navigation | Stable content entry; tab rules unchanged | Stop opening Data and Messages in their own browser tab; dock a drawer on Playout | Stable Messages and Data entries | Keep today's own-tab views and the "views in use" switcher rule, which is pinned by a spec and justified in the code (monitors stay on screen). Make the Setup items permanent so nothing vanishes. The main journeys never leave Playout. A docked tray is not built in this run; the trial can ask for it. | `PLAYOUT_DASHBOARD.md` 102-121; `ProductionPage.tsx` 5614-5626 | C0 | Single-screen students may still want a drawer |
| 3 | Refactor before content | All fourteen phases first | Keep 1-2 trimmed, 7, 13; defer ten | Keep 1 (defects), 2+7, a props-only cue editor move; defer the rest | **Run 1, 2+7 and 13a (props only); the rest in a later window.** Phase 1 stays because S1 and S3 are reliability defects, not maintenance. | `production-page-refactor/spec.md` §2 names 3/4/6/8/9 droppable; 11-13 safety-sensitive | Steps 2-4 | None |
| 4 | When paste lands | Phase 21, after feeds and the API, gated on 23 | Stage 1 after extraction | First, before phase 1, as a declared feature change | **First (C0).** It touches the audience workspace and one cue-editor menu; it needs no extraction. | B §5.1; verified: the staging path is `addShowCue` plus values | C0 | None |
| 5 | Protection of a prepared message | Field-level snapshot flag; refuse later bindings; `/update` cannot bypass | Pool-graphic role: message graphics unbound; `/update` refuses them (409); auto-clone a graphic | Destination hygiene: no binding on body or name field; warn on a later binding; leave `/update` alone | **Destination hygiene** (B), with A's offer to add a separate card when the only candidate is bound. No `/update` protection: an integrator addressing a graphic by name is deliberate and documented; the data API is not a message intake. A later binding on a graphic with prepared cues names those cues and asks, offering a card. | §1 rows 1, 2; `DATA_API.md` 8-14, 235-238 | C0 | None |
| 6 | Candidate record and persistence | Reuse audience records; local persistence required | A uniform candidate shape; `stagedFrom` on the cue | Keep `AudienceSubmission`; add `externalId` and `source`; durable local provider; published rows in the audience table | **B's record plus A's receipt.** `AudienceSubmission` gains optional `externalId`, `source`, `reference`; the cue gains optional `stagedFrom`. Local provider durable for authored and imported rows; simulated rows stay in memory. Published: the audience table gains the same optional columns. | `audienceTypes.ts` 35-53; `0035` 89-112 | C0, C2 | None |
| 7 | Identity of ID-less Sheet rows | "Never row position"; rule left to phase 16 | Content hash plus occurrence index; staged receipt | Content hash over Name, Message, Source, Reference; a changed row is a new candidate | **Both say the same thing.** Hash of the four cells plus an occurrence index for identical rows. Edited row: new candidate, old one shown as changed once; prepared cue untouched. | None needed | C2 | None |
| 8 | Duplicate staging | AC-2 asks for it | `stagedFrom` dedupe with "add as another cue" | Pending guard; dedupe by (submission, graphic) | Both. Button disabled while pending; a second prepare of the same candidate focuses the existing cue; "Prepare again" for deliberate reuse. | §1 row 5 | C0 | None |
| 9 | Format adapters | Six shapes with fixtures | Four adapters with specific rules | Four shapes: lines, standings, row table, values | **Five small adapters plus values:** lines (ticker), schedule, standings, credits, rows. Named by what the graphic parses, not by catalog type. | §1 rows 7-9 | C1 | None |
| 10 | Empty list | Valid empty clears (DS18); mechanism unsaid | Write `""` | Clears under the new contract only | **Adapters write strings, and `""` for a valid empty read.** Legacy `[]` and null behaviour untouched. | §1 row 3 | C1, C3 | None |
| 11 | Who reads a Sheet, how fresh | Server when published, browser when not; 5 s read, 10 s on screen; server scheduler to qualify | Browser or output renderer every 5 s through a cached proxy; no server cron yet | Browser lead at 5 s under a lease; server tick about once a minute when no page is open; measure | **B.** Browser at 5 s while any page of the production is open, local or published, under one lease; a server tick about once a minute for published sources with no live lease. Closed-page latency is reported as measured, not promised. Revises D1 and the closed-page half of D3. | §1 rows 10, 15 | C1, C3, Q | Google export limits unmeasured until Q |
| 12 | A fetch proxy or renderer poll | None | `/api/data/sheet-fetch`; renderer heartbeat | None | **Neither.** The export URL answers cross-origin (measured 2026-10-16); the browser reads it directly. The renderer never writes (§1 last row). | sheet spec "Measured" | C1 | A change by Google would need the proxy later |
| 13 | Bindings on a published production (DS17) | Reach the server at once | New RPC `control_update_data_config` | Owner-authenticated write of the `bindings` column | **B.** The owner already writes the row at publish; a partial update of `bindings` and `sources` needs no RPC. | §1 row 14 | C3 | None |
| 14 | Pause for pushed data (DS20) | Held patches with null deletions and order, for `/patch` and `/update` | `data_paused` plus held patch and held per-graphic updates | Suppress-and-diff: merge into the tree, skip dispatch, store what was dispatched, diff on Resume; or defer | **B's suppress-and-diff, late (C5).** The tree stays the authority, so `/state` stays truthful; held `/update` rows are a per-graphic last-write map applied after the tree diff. If C5 finds it disproportionate, the card states today's doctrine ("to freeze, stop the sender") and Pause ships for Sheets and feeds only. | `0060` 93-102; `0047` 66-99 | C5 | Cost of the two held streams |
| 15 | YouTube scope | Qualify live chat and comments separately; server credentials and closed-page intake in 25 | Comments (1 unit, one-shot or 30-60 s poll) and live chat fixes now; server intake deferred; key in localStorage | Comments one-shot; live chat kept; history page decided; key in memory with an opt-in to remember; server intake deferred | **Both, browser-side only.** Comments: one call, newest 100, refresh is a press. Live chat: first page delivered marked "earlier"; the 5 s floor stays. Key remembered only on opt-in (B). Video and mode persist with the production. Server intake and all new Twitch work deferred. | §1 row 6; B Appendix B quota figures | C2, Q | Key-only authorization for public content: expected, confirmed by a receipt in Q |
| 16 | Twitch | Compatibility and an extension path | Untouched behind a disclosure | Untouched; documented flow needs auth | Untouched; one regression check in C7. | `twitchChat.ts` 95-97 | C7 | None |
| 17 | Trial targets | Under 2 min paste, under 5 min Sheet | Sharper times with embedded safety checks | Unaided completion and comprehension questions; times recorded, no target | **B's measures with A's embedded safety checks.** Pass: four of five complete unaided and answer the three comprehension questions; medians reported. | None | Q, C7 | None |
| 18 | Feeds | Guarded cached route, 5 min | Same, plus a colon toggle | Same; colon convention shown, never altered | **Keep; no toggle.** The split lives in the template parser, which this run does not change; the preview shows it. Route: a public segment of the existing data catch-all; budget unchanged. | §1 rows 9, 11 | C4 | None |
| 19 | Scoreboard preset, grid editors | Not in plan | One-click scoreboard preset; two-column grid editors | Not proposed | **Not built.** Scores already have controls; list fields already are textareas, and "Paste rows" converts pasted cells through the same adapter. | GOALS outcome 4 | C1 | Trial may ask for a grid later |
| 20 | Private metadata on air | Source and Reference never fill fields | Reference hidden | Platform suffix rides the author line today | Source and Reference are provenance only. The " · YouTube" suffix moves to provenance; owner's taste (§7). | `chatIntake.ts` 135-140 | C0, C2 | Owner |
| 21 | Verification gaps | Phase 15 writes the matrix | Per-phase tests named | Output player check, comprehension, migration test, metadata check | **All four added.** The matrix is in the data-sources spec, per phase, with file names. | None | all | None |
| 22 | Standings, credits, schedule details | Headers and rows together; breaks survive | Both fields bound; interior blanks kept; tab join for two-column tickers | Trailing cells trimmed; role-only row becomes `Role:`; fixtures named | All adopted in the adapter contract (C1). The schedule's second field is the heading, not a note. | §1 rows 7-9 | C1 | None |

## 3. The design, in one page

Two words on the surface. **Fill** copies content into a cue once: paste a message, pick a
message, load a table row, paste rows into a list. The cue owns the values afterwards, which is
what the cue editor and "Send to rundown" already do. **Connect** makes a graphic field follow a
live value or list: a Google Sheet tab, a news feed, another system through the data API, or an
existing production value. A connection belongs to the graphic, so all its cues follow it, and
the dialog says so.

The place for both is the **cue editor**, where a non-technical operator already fills fields.
A field offers "Fill from…" and "Connect…". The destination is the cue's own graphic. A message
destination must have no binding on its body or name field; when the graphic cannot hold a
message, the menu says so and offers one of the four Q&A cards.

**Messages** (today's Audience view, renamed) is where candidates arrive and are moderated: a
pasted message, rows of a message Sheet, YouTube comments or live chat, join-page submissions.
Each candidate keeps its original text; the operator edits the broadcast text and name or makes
it anonymous, presses "Prepare cue on…" with an explicit compatible picker (remembered per
production), then Takes it in Playout. Nothing airs from this view. The **Data** view lists each
content set, its source and the graphics using it, with Pause; paths, seed, Raw JSON and per-field
bindings sit behind Advanced. The **Playout** tab shows one line per source with status and Pause.

Storage is additive: `Show.sources[]` (kind, config, use, paused, label, writes), `Show.bindings`
unchanged as the resolution contract, `AudienceSubmission` with optional `externalId`, `source`
and `reference`, `ShowCue.stagedFrom`, a durable local inbox for authored and imported rows, and
the same optional columns on the published audience table. No new general store, no new wire
format, no template change.

Five small format adapters turn rows into the text each graphic already parses: lines (ticker),
schedule, standings (headers and rows in one update), credits (headings, `Role:` groups, section
breaks), rows (guest tables and message Sheets). They serve pasted cells, Sheet tabs and feeds
alike, and write strings, `""` when a valid read is empty.

A Sheet is read by the browser every 5 seconds while any page of the production is open, under
one lease per source; published sources with no live lease are read by a server tick about once a
minute. A failed read keeps the last good list. YouTube runs in the browser with the operator's
own key. Feeds are fetched by a guarded public route. The data API keeps `/patch` as the door,
with a generated example; Pause for it comes last and smallest.

The three protective sentences: a message destination has no live binding on its body or name
field; a destination is chosen explicitly or offered as a new card, never guessed; a candidate's
identity is its content, never its row position.

## 4. Operator journeys

Each names what the operator sees and does, what makes it safe, and what happens when the source
changes. "Today" is `7313cd8`.

**Paste a WhatsApp or SMS message.** Playout. The production has a Q&A card. The operator presses
"+ cue" on it, or selects a cue, and in the cue editor chooses "Fill from… Paste a message". A
small box: Message, Name (optional), Anonymous. They paste, trim a sentence, type the first name.
The preview monitor shows the card. Save, then Take. Later: the sender writes again; the operator
pastes a new message into a new cue; the first cue keeps its text. On air: nothing in WhatsApp
reaches NoaCG by itself. The candidate is kept in Messages with "In rundown (cue 4)" and its
original text. Today: impossible without a published production and a phone.

**No compatible graphic.** The production holds one scoreboard. "Fill from… Paste a message" says
"No graphic here can show a message" and offers the four Q&A cards; one press adds the card and a
cue on it; nothing airs. The same offer appears in Messages. Today: a scoreboard cue is created
with the message as Team A (#1313). The mutation test restores the fallback and must fail.

**Select a message from a Sheet.** Messages › "Add a message Sheet": "Copy starter rows" (Name,
Message, Source, Reference), a link box. Candidates show Name and Message; Source and Reference
are small grey provenance and never fill a field. Pick one, edit, "Prepare cue on…", pick the card
once, Take. Reordering the Sheet changes nothing. Editing a row makes a new candidate and marks the
old one changed; the cue is untouched. Deleting a row removes the candidate, not the cue. On a
later cue the operator can also "Fill from… Pick a message" in the cue editor. Today: a Sheet
cannot reach the inbox.

**Use YouTube.** Messages › "Add YouTube": "Comments on a video" or "Live chat of a stream", the
video link, the operator's key with "Remember on this browser" unticked by default, and the quota
cost in one line. Comments: "Fetch newest comments" brings the newest 100 once; refresh is a
press. Live chat: the first page arrives marked "earlier"; new messages arrive every 5 seconds or
slower if YouTube asks. Pick, edit, prepare, Take as above. Reload: the source is remembered;
with the key remembered it reconnects, otherwise it asks for the key. A new chat message never
touches a prepared cue.

**Fill a ticker, schedule, standings board or credits.** Select the cue; on the items field,
"Fill from… Paste rows": paste cells from any spreadsheet or lines from a document; the preview
shows the lines on the real graphic; a schedule row missing a time is flagged; standings headers
and rows both fill. Save, Take. No Google account. Or "Connect… Google Sheet": "Copy starter rows"
from the field's current content, paste the tab link, see the parsed lines on the graphic and
"Used by 2 cues", Save. A cell edit is on air within 10 seconds while the production page is open;
a marquee continues and a flip finishes its item. Pause holds. Disconnect returns the field to
the cue with the last value. A failed read keeps the last good list and the sources line says
since when; an empty tab clears the field and says "empty". Today: only the frozen graphic-level
block.

**Connect pushed scores.** Publish. Data › "Another system": the address, the key behind Reveal,
an example built from the production's own names. "Connect… Another system" on the score field
binds it; on a published production the binding reaches the server at once. The sender pushes;
"Received 2 s ago"; Take; later pushes follow on air. A ± press moves the shared value and the
next push overwrites it (D4). Pause, when built (C5), holds pushes and Resume applies the
difference. Today: bind by path on the Data tab, then publish again.

**Add a news feed.** Ticker cue, "Connect… News feed", paste the address. NoaCG's route fetches
and parses it; the newest 20 titles show on the graphic. Save, Take. New headlines within about 5
minutes. "Weather: storm warning" airs as kicker and story; the preview shows it. A failed fetch
keeps the last list.

**Two prepared messages on one card.** Cue A and cue B on the same card. Take A; prepare B from a
new message; Take B replaces A on the layer; A's cue still holds A's text; re-Take A brings it
back. Editing B's candidate in Messages after preparing changes nothing in cue B. Binding the
card's Question field later names cues A and B and asks, offering a separate card.

**Failure, reload, Pause, retries.** A Sheet that stops answering: the line says "can't read it
(not shared) since 20:14"; after 15 seconds the fields show the stale mark; reading resumes by
itself. Reload mid-show: sources, bindings, candidates and prepared cues are all there; a browser
reader resumes under its lease; a published production with no page open is read by the server
tick within about a minute. A double press on "Prepare cue" makes one cue. A retry after a failed
save does not mark the candidate used.

## 5. Phase disposition and run order

Dispositions of the 26 phases at `7313cd8`:

| Phase | Was | Now |
| --- | --- | --- |
| 1 | Safety net, S1 and S3, perf baseline | Keep; step 2 |
| 2 | Pure helpers, session skeleton | Merge into step 3 with 7 |
| 3, 4, 6, 8, 9 | Maintenance extractions | Defer to the later refactor window (the spec already calls them droppable) |
| 5, 10 | Take blockers, folder playout | Defer; reliability work unrelated to content |
| 7 | Production-data session | Keep; step 3 (with 2). The Sheet and feed readers write through it |
| 11, 12 | liveCue move, graphic verbs | Defer; safety-sensitive and unrelated to content; their own window |
| 13 | Cue draft and editor | Split: props-only `CueEditor.tsx` now (step 4, "13a"); the draft part later ("13b") |
| 14 | Close-out | Defer with the later window; the compiled rule can land with 13a |
| 15 | Prototype, qualification, matrix | Becomes track Q: measurements and the trial on C0's build; no A/B of two workspaces; the matrix is written now (§6) |
| 16 | Contracts | Dissolved into C0 (messages), C1 (connections, formats) and C2 (identity) |
| 17 | Native lists, local Sheets | C1 |
| 18 | Published ownership | C3, with the lease model and DS17 |
| 19 | Feeds | C4 |
| 20 | API setup and Pause | C5, smallest form |
| 21 | Selected rows, paste, Sheet messages | Paste to C0; Sheet messages and the cue-editor pick to C2 |
| 22 | Journeys, compatibility, docs | C6 |
| 23 | Safe staging, #1313 | C0, first |
| 24 | Shared workflow, join, presenter, votes | One primary action to C0; the walks to C7 |
| 25 | YouTube, Twitch compatibility | C2 (browser-side scope) and C7 (Twitch check) |
| 26 | Combined rehearsal | C7 |

Run order, one `/plan-run production-page`, sequential:

1. **C0 Paste and safe staging** (feature change, outside the refactor fence).
2. **Refactor phase 1** safety net and the two suspected defects.
3. **Refactor phases 2+7** store part, session skeleton, production-data session.
4. **Refactor phase 13a** props-only cue editor extraction.
5. **C1 Native lists and local Sheets** (adapters, starter rows, browser reader, status line).
6. **C2 Sheet messages and YouTube** (identity, cue-editor pick, comments and live chat).
7. **C3 Published ownership** (sources and bindings persist at once; lease; server tick; cost).
8. **C4 Feeds.**
9. **C5 Another-system card and Pause.**
10. **C6 Journeys, compatibility, docs** (retire the graphic-level panel for new graphics).
11. **C7 Combined rehearsal, trials, Twitch check, output-player check.**

Track **Q** (qualification and trial) runs beside C0 in its own session with network access and
the owner's keys: 20 real Sheet edits timed; an hour of 5-second export reads; five public feeds;
a YouTube video and a live stream with the operator's key; the trial of §7 of the data-sources
spec on C0's build and a disposable Connect dialog. Q is recorded before step 5 starts. A miss
on the Sheet measurement stops the plan at step 5 and asks (D3's rule, kept).

Later window, its own run: refactor phases 3, 4, 5, 6, 8, 9, 10, 11, 12, 13b and 14, as the
refactor spec describes them.

What this costs against the current plan: `docs/GOALS.md` outcome 5's bullet ("the page cleanup,
then the Sheet data flow, then audience") changes to this order; the refactor spec's "After the
refactor" section is replaced by the run order; sheet D1 and the closed-page half of D3 are
revised; DS1/3/7/9/11/14/16/18/20 and A1/A4 are superseded where they conflict (each spec marks
which).

## 6. Verification

The continuation's matrix is in `docs/work-specs/data-sources/spec.md` §Verification, one row per
phase naming Node tests, offline journeys, configured scenarios, database conformance cases,
provider receipts and the assessment. It adds what review B found thin: list graphics updating
live on a real player (an OBS browser source at least, CasparCG if the owner can), comprehension
questions in the trials, a migration test on a record saved by today's build, a check that no
Source or Reference reaches a field, and a check that a bound destination is refused on local and
published productions. Phase 1's matrix in the refactor spec is unchanged for steps 2-4.

## 7. Decisions for the owner

Recommendation first. Routine choices are made in the specs and not repeated here.

1. **Run order.** C0 first as a declared feature change, then refactor phases 1, 2+7 and 13a, then
   content; the other refactor phases in a later window. This changes outcome 5's bullet in
   `docs/GOALS.md`. Recommended yes: the paste result depends on nothing in the refactor, and the
   safety-sensitive moves get their own window.
2. **Sheet reading on a published production.** Browser lead at 5 seconds while a page is open;
   server tick about once a minute with every page closed; closed-page latency reported as
   measured. Revises D1 ("the server reads it, and no browser does") and D3's closed-page promise.
   Recommended yes: no seconds-scale scheduler exists, Google's limits are unmeasured, and the
   teaching case has the page open. The alternative is building and paying for one before knowing
   either.
3. **Protection by destination hygiene.** No `/update` protection; a later binding on a card with
   prepared cues names them and asks, offering a separate card, rather than being refused.
   Recommended yes: the prepared cue is already plain values; the only live routes are a binding
   on the destination and a deliberate graphic-addressed write, and the first is closed by the
   picker.
4. **YouTube key and the platform word.** The key is remembered only when the operator ticks
   "Remember on this browser"; " · YouTube" moves from the broadcast name to provenance.
   Recommended yes for both; the second is taste.

## 8. Facts, assumptions, limits

Measured or verified: the code citations in §1 (current checkout); the sheet spec's export
measurement of 2026-10-16 (attributed); review B's provider pages (attributed, Appendix B of
`reviews/review-b-2026-10-17.md`).

Assumed until Q records a receipt: an API key suffices for public live chat and comments; one
browser reading an export every 5 seconds for an hour is tolerated; students operate with the
production page open; a minute-scale server tick costs little on the hosting plan.

Not done here: no browser walk, no provider call, no Sheet edit, no timing, no trial, no owner
conversation beyond the brief. The refactor spec's line numbers remain of `70fad3a94` and its
reconcile receipt applies. Issue #1313 stays open until C0 lands.
