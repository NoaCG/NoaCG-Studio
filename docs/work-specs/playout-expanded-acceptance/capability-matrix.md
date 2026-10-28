# Capability and limitation matrix

E8 AC-4 (row 45 of the production-page run, E8.2). What the build on `main` can do, how far each
part has been measured, and what it cannot do yet. Every line cites its receipt. The operator's
steps are in the [runbook](runbook.md); the criterion-by-criterion record is the
[reconciliation](evidence/e8-1a-reconciliation.md).

**Build.** `main` at `c6fc146b8807f629645c980d75fa53735dd0453d` (product code identical to
`f0adf9b`, row 44's merge: the commit between changed only `docs/work-specs/cicd-improvement/`
and `.agent-workflows/plan-run.md`), plus this row's merge. Checked on 2026-10-28.

## How to read the status

| Status | Meaning |
| --- | --- |
| **Software** | Passed in software: tests and walks on a cloud worker and in GitHub Actions, checked by an independent checker on the merge. No real CasparCG, OBS, Stream Deck or studio. |
| **Laptop walk** | A scratch walk on the owner's laptop on an earlier build, with real CasparCG 2.5, NoaCG Bridge and OBS. Never gating, and bound to the build it ran on. |
| **Owed to H0.2** | Needs the physical Stream Deck. Not passed until the owner runs it. |
| **Owed to S** | Needs the real studio (CasparCG through Bridge, OBS, the 30-minute dress rehearsal). Not passed until the owner runs it. |
| **Not qualified** | Never measured for real use. Do not rely on it. |

Nothing below is passed by H0.2 or S yet: both are the owner's, after this row.

## What it can do

| Capability | Status | Receipt |
| --- | --- | --- |
| Browser output (`/output`) on a browser source such as OBS | Software; Laptop walk on `44bfa89`, `dda88db`, `9866960` (OBS 32.2.1); real studio owed to S | rows 13, 14, 25, 40 in the [reconciliation](evidence/e8-1a-reconciliation.md); [`local/c7-casparcg-obs-walk.md`](../production-page-refactor/evidence/local/c7-casparcg-obs-walk.md), [`row-25`](../production-page-refactor/evidence/local/row-25-casparcg-obs-walk.md), [`row-32`](../production-page-refactor/evidence/local/row-32-election-casparcg-obs-walk.md); [`docs/OBS_ON_A_REAL_HOST.md`](../../OBS_ON_A_REAL_HOST.md) |
| CasparCG through NoaCG Bridge (Load, Take, Update, Out, server restart) | Software with a fake Bridge; Laptop walk on the same three builds (CasparCG 2.5.0 through NoaCG Bridge; the server restart was walked on `dda88db`, before #1657's fix, so the output coming back by itself is software only); real studio owed to S | `e2e/bridge-connect.spec.ts`; the three laptop walks above; [`docs/BRIDGE.md`](../../BRIDGE.md) §3 |
| One hour of live election data: 1,000 candidates, a source step every 5 s, a cue switch every 15 s, pauses, reloads, disconnects and reader handovers | Software, 60 minutes, 44 of 44 checks | [`evidence/e8-1b-endurance.md`](evidence/e8-1b-endurance.md), run [40728515115](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40728515115) |
| Take on air within 10 s, a bound field within 10 s of the source moving, a candidates-only change within 13 s | Software (worst seen: 1,466 ms, 9,824 ms, 1,142 ms apply to render) | same receipt, "Timings" |
| Pasted rows, a Google Sheet, a news feed, a pushed score (Another system), viewer messages | Software; Sheet and feed reads measured on the real providers on 2026-10-20 | rows 6 to 14; `data-sources/evidence/sheet-latency.md`, `sheet-endurance.md`, `feeds.md`, `youtube.md` |
| A JSON source read by the trusted agent (E4), with its credential kept on the agent's machine | Software; the agent's start, refusals and no-credential output rechecked on this row's worker | rows 26, 27; [`evidence/e8-2-guide-check.md`](evidence/e8-2-guide-check.md) |
| Mapping a sample answer to a graphic's fields (E5) | Software | rows 28, 29 |
| Live candidates: pick a person, the card follows that person's newer counts and never another person | Software (replay server only) | rows 30, 31, 32; [`playout-election-package/rehearsal.md`](../playout-election-package/rehearsal.md) |
| Pinned live controls: a graphic's controls stay on screen whatever cue is selected | Software; the deck's reach through Companion in software | row 32a; row 42 (its ledger entry carries L1 AC-8) |
| Place, size, type, colour and a production look, prepared on PREVIEW and sent to air | Software | rows 32b, 32c, 32d, 38a |
| Typed OGraf values and controls | Software | rows 33, 35, 36, 37, 38 |
| Imported (foreign) OGraf packages in the rundown, with » Next and ⚡ declared actions | Software with browser outputs; CasparCG and OBS owed to S | rows 39, 40, 41 |
| Companion buttons for Take, Out, cues, pinned graphics and declared actions | Software through the module and the relay; module 0.2.0 built, tested (74 of 74) and imported into Companion 5.1.0 on this row's worker; the physical deck owed to H0.2 | rows 2, 34, 42; [`evidence/e8-2-guide-check.md`](evidence/e8-2-guide-check.md) |

### Packages and their identity on this build

| Package | Identity | Receipt |
| --- | --- | --- |
| Election rehearsal pack (native) | `public/packs/election-rehearsal.noacgpack.json` sha256 `a51b45aef4dd2149c8794b7b2040f13cc10998152be66afb01552698802340be` | unchanged since row 32 |
| Foreign OGraf library fixtures | `e2e/fixtures/ograf-library/` tree `4b4010e5ae7b68421d2861d1d372d3ad70bac901`, every file's sha256 pinned by `scripts/ograf-foreign.test.mjs` | rows 39 to 42 |
| E6 foreign fixture package | `e2e/fixtures/foreign-ograf/` tree `44f5d3fb8e9cb1e32de8def7f387bd2c04fd7999` | row 42 |
| Exports to CasparCG, SPX, HTML overlay, OGraf, LiveOS | `e2e/exports.spec.ts`, `e2e/spx-operator.spec.ts`, the `e2e/ograf-*.spec.ts` set, in the required suites | every merge's CI |
| Companion module | source tree `companion-module/` 0.2.0; the archive this row built is in the guide check. The archive build is not byte-reproducible, so a hash names one build: H0.2 builds, hashes and records the archive it installs | [`evidence/e8-2-guide-check.md`](evidence/e8-2-guide-check.md) |

## Separate status: official feed, vMix and SPX, unattended cloud

| Item | Status | Receipt |
| --- | --- | --- |
| **Official Finnish/Yle election feed** | **Not qualified.** No access, licence, schema or rate agreement exists. Everything above ran against the replay server, never a real results feed. | [`playout-election-package/rehearsal.md`](../playout-election-package/rehearsal.md); `extensions.md` "Release, failure and completion" |
| **vMix** | Existing regressions kept; no expanded qualification in this programme. A production in a vMix Web Browser input aired on 2026-10-12 (vMix 29, Chromium 115, below NoaCG's floor of 117). NoaCG Bridge 0.10.0 can drive vMix overlay channels, but the studio page does not offer vMix as a playout system yet. | [`docs/VMIX_ON_A_REAL_HOST.md`](../../VMIX_ON_A_REAL_HOST.md); [`docs/PLAYOUT_COMPATIBILITY.md`](../../PLAYOUT_COMPATIBILITY.md); `cli/BRIDGE_CHANGELOG.md` 0.10.0 |
| **SPX** | Existing regressions kept (the SPX export and operator specs run on every merge); no expanded qualification in this programme. | [`docs/SPX_ON_A_REAL_SERVER.md`](../../SPX_ON_A_REAL_SERVER.md); `e2e/spx-operator.spec.ts`; [`docs/ACCEPTANCE_SPX_CASPARCG.md`](../../ACCEPTANCE_SPX_CASPARCG.md) is a manual checklist with no result recorded |
| **Unattended cloud reading** | Not claimed. The server tick that reads a published Sheet while every page is closed is switched off in production. The trusted agent is a process on a machine you keep running; it is not a cloud service. | `tick-cost-estimate.md`; row 9; [`docs/DATA_API.md`](../../DATA_API.md) |
| **Running for more than an hour** | Not measured. The output page's memory rises about 10 KB a minute (#1798). | [`evidence/e8-1b-endurance.md`](evidence/e8-1b-endurance.md) |

This matrix makes no claim of parity with any vendor's product, no claim that NoaCG runs
unattended in the cloud, and no claim of readiness for an election day.

## Known on-air defects not fixed

Each can change what is on air or what the operator believes is on air. All are open on
`c6fc146` (#1802 was opened during this row, at 2026-10-28T19:16Z).

| Issue | What happens | What to do meanwhile |
| --- | --- | --- |
| [#1795](https://github.com/NoaCG/NoaCG-Studio/issues/1795) | An **exported** results board (a CasparCG `.html`, SPX or OGraf package) played again after a stop, outside the `/output` page, may show its header and no rows. Read from the code, not yet reproduced. The `/output` page itself is fixed (#1618). | Play results boards through the `/output` page. If you use an exported board, check the picture after a second play. |
| [#1797](https://github.com/NoaCG/NoaCG-Studio/issues/1797) | A value that arrives while the production page is reloading can miss the output until the next update. Seen once in 18 reloads; the next value fixed it 6.6 s later. | After reloading the production page, press **✎ Update** on bound boards if the source may have gone quiet. |
| [#1798](https://github.com/NoaCG/NoaCG-Studio/issues/1798) | The output page's memory grows about 10 KB a minute (about 14 MB a day). Cause not found. Inside the hour measured. | Reload the output page (or the CasparCG/OBS source) between shows; do not leave one running for days. |
| [#1802](https://github.com/NoaCG/NoaCG-Studio/issues/1802) | A value the output never received (a lost update, with no newer one after it) stays missing until the output's 30-second check: up to 30 s with nothing marking it stale, past the 10 s ceiling for a bound field. Cause of the loss not yet known. | If a bound board looks behind the source, press **✎ Update**. |
| [#1760](https://github.com/NoaCG/NoaCG-Studio/issues/1760) | A typed (imported OGraf) value bound to a source reaches air at the next **✎ Update**, not by itself. Native graphics follow within seconds. | Press **✎ Update** after the source moves. |
| [#1769](https://github.com/NoaCG/NoaCG-Studio/issues/1769) | PROGRAM on the page can miss the typed values of an imported graphic; the output is right. | Trust the output, not PROGRAM, for typed values. |
| [#1770](https://github.com/NoaCG/NoaCG-Studio/issues/1770) | An output page from before row 36 (E1.2b) that reboots puts typed graphics back to their defaults. | After restoring an older release, reload every output, then Take typed cues again. |
| [#1775](https://github.com/NoaCG/NoaCG-Studio/issues/1775) | Imported OGraf packages: Back, Goto and skip are not wired; only » Next and ⚡ actions are. | Use » Next and the ⚡ buttons only. |
| [#1777](https://github.com/NoaCG/NoaCG-Studio/issues/1777) | Replacing a production look that uses an imported face while on air, then publishing, can leave a reloaded output in a fallback face, with no press and no warning. Readable, right colours and place. | After replacing a look, press **Send to on-air graphics** (or **✎ Update** on the cue) before you Publish. |
| [#1713](https://github.com/NoaCG/NoaCG-Studio/issues/1713), [#1721](https://github.com/NoaCG/NoaCG-Studio/issues/1721) | The hosted control page's live marker can stay on a Take that failed, or follow the newest press rather than the last one that landed. | Read the output, and the production page's PROGRAM, not the hosted page's marker. |
| [#1719](https://github.com/NoaCG/NoaCG-Studio/issues/1719) | On the hosted control page, PROGRAM can play a Take that was never sent, when the page's first read of the production is slow. The live line reads "nothing on air", correctly. | Believe the live line and the output, not that page's PROGRAM picture. |
| [#1714](https://github.com/NoaCG/NoaCG-Studio/issues/1714) | A live candidate's layer can drop while its candidate airs, after a Take whose answer came late; the card then stops getting newer counts. Fails safe: nothing wrong is sent. | Press **✎ Update** on the candidate cue, or Take it again. |
| [#1698](https://github.com/NoaCG/NoaCG-Studio/issues/1698) | A production page reopened after being closed cannot tell what happened while it was closed, so it holds a restored live candidate until you press. | Look at the output before acting after a reopen; press **✎ Update** to make the card follow again. |
| [#1726](https://github.com/NoaCG/NoaCG-Studio/issues/1726) | A candidate cue's label in the rundown keeps the old person's name after a pick, and a candidate card aired alone has no "synthetic results" label. | Read the cue editor's fields, not the rundown label. In a rehearsal with replayed results, keep a labelled graphic on air beside the card. |
| [#1755](https://github.com/NoaCG/NoaCG-Studio/issues/1755) | Two quick type or colour changes on air can show one brief frame before the text refits. | Wait for one style change to show before making the next. |
| [#1754](https://github.com/NoaCG/NoaCG-Studio/issues/1754) | An uploaded font named like a bundled one can be left out of a package. | Give uploaded fonts their own names. |

### Older on-air defects still open

Filed before this programme's extension rows; open on `c6fc146`.

| Issue | What happens | What to do meanwhile |
| --- | --- | --- |
| [#1567](https://github.com/NoaCG/NoaCG-Studio/issues/1567) | On the hosted control page, two ⚡ Goal presses inside one round trip move a bound score by one, not two, with nothing on screen. (Fixed on the production page.) | Press once per goal and wait for it to land, or use the production page. |
| [#1572](https://github.com/NoaCG/NoaCG-Studio/issues/1572) | An older write answer can replace a newer data tree on the production page, so a score can go back by one. (Out-of-order reads are guarded since row 30; write answers are not.) | After quick successive presses or feed rows, check the figure before the next press. |
| [#885](https://github.com/NoaCG/NoaCG-Studio/issues/885) | A press on a field bound to one element of a list (for example one driver's gap) can write back stale values for the list's other bound elements, if the page's copy is older than the feed's. | Do not press list-element fields while a feed is writing the same list. |
| [#1671](https://github.com/NoaCG/NoaCG-Studio/issues/1671) | A connector without a recipe keeps a tab inside a cell, which splits a ticker or schedule line on air. | Give the connector a recipe (Connect data), which holds such a cell instead. |
| [#1347](https://github.com/NoaCG/NoaCG-Studio/issues/1347) | An exported HTML overlay (OBS, vMix) of a graphic timed to leave by itself, with a looping entrance, leaves straight away. Read from the code. | Do not set a leave time on a graphic with a looping entrance in an HTML-overlay export. |
| [#1048](https://github.com/NoaCG/NoaCG-Studio/issues/1048) | On SPX 1.4, every dual NoaCG package plays on layer 5, so two of them replace each other. (The SPX export itself is fixed.) | Use the SPX export, not the dual package, on SPX 1.4. |
| [#1063](https://github.com/NoaCG/NoaCG-Studio/issues/1063) | Prepare for Live can wait without end on the output's first read if the server never answers. | If READY shows nothing new for a minute, reload the output. |
| [#775](https://github.com/NoaCG/NoaCG-Studio/issues/775) | On Linux playout machines a long name that should shrink can run about 5% past its box. | Check long names on the target machine before the show. |
| [#779](https://github.com/NoaCG/NoaCG-Studio/issues/779) | Two graphics with the same name in one production (for example two "Lower third"s in a team production) replace each other on the output: the production and its output key graphics by name. | Give every graphic in a production its own name; check the rundown for duplicates before the show. |
| [#758](https://github.com/NoaCG/NoaCG-Studio/issues/758) | A page left open across a deploy can fail to load more code. | Do not deploy during a show; reload open pages after one. |

### Data and setup limits (not on-air defects)

| Issue | Limit |
| --- | --- |
| [#1734](https://github.com/NoaCG/NoaCG-Studio/issues/1734) | A source only the agent can reach (a local replay server, a private feed) cannot be registered from Connect data on the published site; it needs a development build (see the runbook). |
| [#1691](https://github.com/NoaCG/NoaCG-Studio/issues/1691) | Saving the Connect review over a stale or unreadable stored recipe replaces it and drops what other graphics connected. |
| [#1690](https://github.com/NoaCG/NoaCG-Studio/issues/1690) | The Connect review's repair state shows a raw data path and cut labels. |
| [#1679](https://github.com/NoaCG/NoaCG-Studio/issues/1679) | A changed mapping of an already written field waits for the provider's next change. |
| [#1737](https://github.com/NoaCG/NoaCG-Studio/issues/1737) | Published collections have no byte cap of their own (the 256 KiB revision cap still holds). |
| [#1733](https://github.com/NoaCG/NoaCG-Studio/issues/1733) | Adjustments: the rundown glyph, the pack install line and a nudge dead zone. |
| [#1586](https://github.com/NoaCG/NoaCG-Studio/issues/1586) | On a short screen the sources line (with a stale Sheet and its **Pause**) can scroll out of sight. Scroll the control area to the top to see it. |
| [#1758](https://github.com/NoaCG/NoaCG-Studio/issues/1758) | The Companion module's own tests run in no GitHub workflow, so a module change is not checked by CI. |

Not affecting any criterion: [#1771](https://github.com/NoaCG/NoaCG-Studio/issues/1771) and
[#1778](https://github.com/NoaCG/NoaCG-Studio/issues/1778) are test gaps or test hygiene;
[#1784](https://github.com/NoaCG/NoaCG-Studio/issues/1784)'s item 2 is display only.

## Fixed in software, physical check owed to S

| Issue | Fix | What the operator sees now | S checks |
| --- | --- | --- | --- |
| [#1618](https://github.com/NoaCG/NoaCG-Studio/issues/1618) | `55f98f9` (PR #1793) | A results board taken again after Out draws its rows on the `/output` page. | Take a League Table, Out, Take again on CasparCG and OBS (also with a ticker on air, and after reloading the output). |
| [#1657](https://github.com/NoaCG/NoaCG-Studio/issues/1657) | `e5d28ef` (PR #1792) | After a CasparCG restart the slot row reads **Reloading…** in amber while the page loads its output again by itself. If three tries fail, the row reads **Empty** in red with the reason under it ("Loading it again did not bring it back."), the status reads **Not on 1-20** (your slot), and **Load** is yours. After the browser page itself was reloaded, a server restart still needs **Load**. | Restart CasparCG during a published production. |
| [#1746](https://github.com/NoaCG/NoaCG-Studio/issues/1746) | `e375917` (PR #1794) | A graphic saved before 2026-10-26 sets Š and Ž in its own typeface and draws no smeared bold. | A saved Bebas Neue or Anton heading with "Šimon Žáková" on CasparCG and OBS. |
