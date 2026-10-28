# E8.2: the runbook and matrix checked against the build

Row 45 of the production-page run (E8.2, project phase 50). Every step in the
[runbook](../runbook.md) and every line of the [capability matrix](../capability-matrix.md) was
checked one of three ways: **run** here on a Claude cloud worker, **read** in the landed code (the
file named), or **receipt** (an earlier record or run, named in the matrix). What could not be
run here, and why, is at the end.

- **Build:** `main` at `c6fc146b8807f629645c980d75fa53735dd0453d`. Its product code is identical
  to `f0adf9b` (row 44's merge; the commit between touched only `docs/work-specs/cicd-improvement/`
  and `.agent-workflows/plan-run.md`), whose runs are green: CI 40745259392, configured-suite
  40745259430 (row 44's ledger entry).
- **Worker:** Linux 6.18, 4 CPUs, environment `env_017nuiDZBW9smUNLdWVQK8cf`, 2026-10-28.

## Run here

| Step | What ran | Result |
| --- | --- | --- |
| Companion module: build and tests | in `companion-module/`: `yarn install --immutable`, `yarn test`, `yarn package` (Node 22.22.0, Yarn 4 from npm) | 73 of 73 on `c6fc146`; 74 of 74 with this row's guide test. `noacg-studio-0.2.0.tgz`, sha256 `983fd6c3c70d33bd34e5fabf42be944f0ddf65d9c23c09874a8da1a1cccbfff5` on `c6fc146`; the rebuild with this row's `HELP.md` is in "The archive on this row's head" below |
| Companion: install from the file (runbook §1) | Companion 5.1.0, the official image `ghcr.io/bitfocus/companion/companion:v5.1.0`, a fresh config, its admin UI driven by Playwright: **Modules**, **Import module package**, the archive | Listed as **NoaCG: NoaCG Studio**, version 0.2.0, as installed; offered under **Connections** as "NoaCG: NoaCG Studio" |
| Companion: the guide's step 1 | read against `src/components/home/ProductionSetupMenu.tsx` | **Wrong in the build, in two places.** `HELP.md` and the connection form's pairing hint (`companion-module/src/config.ts`) said **Setup**, then **Panel**; the menu item has read **Stream Deck panel…** since row 38a (`a9cd11a`). Fixed in both, with a test in `companion-module/src/__tests__/guide.test.ts` that reads the menu's labels and checks both: red with either old wording, green with the new (74 of 74) |
| The agent's start, refusals and log (runbook §1, §2, §5) | the replay server (`--timeline package --step-ms 60000`) and the agent with `replay-agent.json`, without `--send` | without the credential: "the credential NOACG_SOURCE_REPLAY is not set on this machine"; with it: one JSON report per read, log lines `… election changed accepted=1 next=2000ms` then `unchanged`; the replay token appears in neither the output nor the log (0 matches); `--export` writes `"credentialBound": false`, and the exported file is refused with "this configuration is not bound on this machine (an export, say): bind NOACG_SOURCE_REPLAY here before it reads (rebind)"; `--send` without a data key: "set NOACG_DATA_KEY to the production data key before --send" |
| The replay's results carry a counted share (kit task 1) | the first report's `payload.summary` | `{"status": "Preliminary", "counted": "60 of 100 areas counted", "counted_share": "60%"}` |
| Node tests behind runbook §3 to §5 | `node --test` on `scripts/external-data-connector.test.mjs`, `bridge-watch.test.mjs`, `playout-status.test.mjs`, `font-upgrade.test.mjs` | 64, 27, 11 and 16 pass, 0 fail |
| CasparCG restart, and a board taken twice (runbook §5, matrix #1657, #1618) | the job queue: `e2e/bridge-connect.spec.ts:1237` ("after a CasparCG restart the output this page loaded goes back on its slot by itself (#1657)") and `e2e/output-first-paint.spec.ts:250` (the nine "a graphic taken again" tests) | 10 passed |

## Read in the code

| Runbook or matrix words | Where |
| --- | --- |
| The status button beside the production's name opens the Playout panel; **CasparCG via Bridge**, **Download**, **Pair**, **Load**, **Loaded** | `src/components/home/PlayoutStatusControl.tsx` (`production-status`), `PlayoutPanel.tsx`, `useProductionPublish.ts`. (The header's "Playout" is the workspace tab, shown only beside Data or Messages; it does not open the panel.) |
| **Reloading…** amber, **Empty** red with "Loading it again did not bring it back.", "Not on 1-20", three tries | `useProductionPublish.ts` (slot text), `src/control/playoutStatus.ts` (the check line), `src/control/bridgeWatch.ts` (`RELOAD_AFTER_READS`); `docs/BRIDGE.md` §3 says the same |
| "BRIDGE NOT ANSWERING · NOT LIVE", "CONNECTION LOST · NOT LIVE", "sending…", "not confirmed", "logged" | `src/control/playoutStatus.ts` |
| **■ All out**, **Panel ✓** | `ProductionShell.tsx` |
| **Pause**, **Resume** and their notes; "Received N s ago"; **Reveal**, **Copy** | `src/components/home/ProductionDataWorkspace.tsx`, `src/control/anotherSystem.ts` (`receivedWords`). "Received" is stamped when the data API applies something (`control_data_apply`, migration 0100), which an accepted connector revision goes through (0101); an unchanged read applies nothing, so the time ages while results do not change |
| Sources line words, "⚠ stale", "🔗 Connector: …", "waits for the next read" | `src/components/home/SourcesLine.tsx`, `CueEditor.tsx` |
| **Connect data…**, **Read**, **Connect**, **Fill this cue**, **Disconnect**, **Disconnect to edit here**, **Live candidate**, **Fixed values**, "Not on air yet. Press ✎ Update" | `src/components/home/CueEditor.tsx`, `ProductionPage.tsx` |
| OGraf refusals and recovery: the import refusal, "… so it is kept as it is and does not load here.", the integrity lines, "This cue’s typed data … read-only here.", "reload this output", the outcome lines, **Re-cue**, the monitor plate | `src/components/wizard/templateFile.ts`, `src/model/foreignPackage.ts`, `src/model/ografTyped.ts`, `src/control/ografOutcome.ts`, `src/components/home/PlayoutMonitors.tsx`, `src/output/stage.ts` |
| **Pin live controls**, **Lock it in**, **Reveal correct**, ± numbers | `src/components/home/CueRundown.tsx`, `CueActions.tsx`, `src/templates/types/answerBoard.ts` |
| Adjust: place grid, nudge, size 5 %, "smallest text N px", **Only this cue**, **Stop this cue’s exception**, **Look…**, **On**/**Off**, **Send to on-air graphics**, Ctrl+Z | `src/components/home/CueAdjust.tsx`, `ProductionLook.tsx`, `ProductionSetupMenu.tsx`, `src/components/playoutKeys.ts` |
| Renewing the data key: no control on the page; `unpublishControlShow` runs only when a production is deleted, so the runbook sends the operator to the maintainer | `src/control/hostedControl.ts`, `src/components/home/sections/ProductionsSection.tsx`, `docs/DATA_API.md` "For the production owner" |
| The agent's limits (one revision per 5 s, 256 KiB, the 409s) and its restart and handover | `docs/DATA_API.md`, `api/data/[...path].ts`, `scripts/external-data-connector.mjs` |
| Migrations 0101 to 0105 add only | `supabase/migrations/0101` to `0105`: no `drop table`, `drop column` or `alter column` |
| Bridge versions | `cli/package.json` `bridgeVersion` 0.10.0; GitHub releases `bridge-v0.10.0` (2026-10-24) and `bridge-v0.9.0` |

## Receipts

Each matrix line names its receipt. The ones read for this row: the reconciliation's ledger
entries for rows 1 to 44, the endurance record (run 40728515115), the three laptop walks in
`../../production-page-refactor/evidence/local/` (CasparCG 2.5.0, OBS 32.2.1), the Q records,
`docs/VMIX_ON_A_REAL_HOST.md`, `docs/SPX_ON_A_REAL_SERVER.md`,
`docs/PLAYOUT_COMPATIBILITY.md`, `docs/OBS_ON_A_REAL_HOST.md`, the election `rehearsal.md`,
and PRs #1792, #1793 and #1794 with their issues. Every issue in the matrix was read on GitHub on
2026-10-28 and is open, except #1618, #1657 and #1746 (closed by those PRs).

## Not run here, and why

| Step | Why not | Who covers it |
| --- | --- | --- |
| Real CasparCG, NoaCG Bridge and OBS (runbook §1, §5) | no studio hardware or Windows on a cloud worker | the laptop walks on earlier builds (non-gating); S |
| Pairing Companion with a production and pressing keys | needs a published production on a local stack beside the scratch Companion; row 42's checker ran the module through the relay on its merge, and the module has not changed since except `HELP.md` | H0.2 (the physical deck, the owner's guide walk) |
| The agent sending to a published production | needs the local stack and a development build; `e2e/configured/external-data-connector.spec.ts` runs it in the configured suite on every merge | the configured suite; the owner's kit run |
| Restoring a prior release (runbook §7) | a rollback of production is the maintainer's and is never rehearsed on the live site | stated as a maintainer step |
| The kit's tasks with people | the owner's (decision D) | the owner |

## The archive on this row's head

Rebuilt with this row's `HELP.md` and pairing hint (`yarn package`, same worker):
`noacg-studio-0.2.0.tgz`, sha256 `3a4c03230229d26a922ef4962827d429d239abd9667b6b49d44304c41cea5c3c`; its `companion/HELP.md` and `main.js` both name
**Stream Deck panel…**. Only those two texts differ from the archive imported above. (A build with
the `HELP.md` fix alone hashed `3a9a43de…6f79502e`.) The build is not
byte-reproducible (tar keeps build times), so a hash names one build: H0.2 builds, hashes and
records the archive it installs, from the final candidate.
