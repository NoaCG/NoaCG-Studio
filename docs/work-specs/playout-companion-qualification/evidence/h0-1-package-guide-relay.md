# H0.1: the package, the guide walk, and the relay and ownership runs

Run on 2026-10-21 in a Claude cloud worker (Linux 6.18, 4 CPUs), branch
`claude/plan-production-page-p2-build` from main `5d533e6cb`, final runs on `2a89eb41d`. Covers H0 AC-1's packaging and guide
portion, AC-2 and AC-3 (automated, relay and configured). AC-1's owner walk and AC-4 are H0.2.

## Pinned versions

| What | Version |
| --- | --- |
| Module | `noacg-studio` 0.1.2 (`companion-module/package.json`; 0.1.1 is the previous known-good package) |
| Module base API | `@companion-module/base` 2.0.4 |
| Packaging tool | `@companion-module/tools` 3.1.1 (`companion-module-build`, esbuild), Yarn 4.12.0, TypeScript 6.0.3 |
| Supabase client in the module | `@supabase/supabase-js` 2.117.2 |
| Companion | 5.1.0, build `5.1.0+9981-stable-257b325d09`, the official image `ghcr.io/bitfocus/companion/companion:v5.1.0` (linux/amd64 manifest `sha256:c348fcc7822b...`), run headless from its own files with their bundled Node 22.23.3 (`--config-dir` fresh per run, `--admin-port 18010`, `--admin-address 127.0.0.1`) |
| OS | Linux 6.18.44 (container) |
| Stream Deck | none: Companion's own HTTP API presses a button exactly as a surface does (`POST /api/location/1/1/1/press`); the physical deck is H0.2 |
| App | this branch's code on Vite dev, against a local Supabase stack (CLI 2.111.0, migrations 0001 to 0095) |
| Bridge | not involved (the module never reaches it) |

## The archive, inspected (AC-1)

`yarn package` at `2a89eb41d` wrote `noacg-studio-0.1.2.tgz` (sha256 `9914d38334e091a76bc114583747cbce5b8eba209b4356a4c4797fa87f500ce6`,
not reproducible byte for byte: tar keeps build times). Contents: `main.js` (292,538 bytes, one
bundle), `companion/manifest.json`, `companion/HELP.md`, `LICENSE`, `package.json`.

- The source manifest's placeholders are filled by the tool: `version` 0.1.2 (the package's),
  `runtime.apiVersion` 2.0.4 (the installed base), `entrypoint` `../main.js`,
  `isPrerelease: false`. The packaged `package.json` is `{name, version 0.1.2, MIT, type module,
  dependencies: {}}`.
- The packaged `HELP.md` is byte-identical to the committed one. Neither it nor `main.js` contains
  "Answer the panel on this page".
- `main.js` names each of the 14 verbs; `companion-module/src/__tests__/guide.test.ts` pins that
  the action list is exactly the 14 protocol verbs and that HELP.md names every action as
  Companion lists it, and fails on the old HELP.md.
- Companion's Add dialog offered "Module Version v0.1.2" and listed the connection as
  "NoaCG: NoaCG Studio"; the Presets tab counted 19 presets for two cues (13 fixed, then Take,
  Select and Trigger per cue).

Module commands, in `companion-module/`: `yarn test` 35 of 35 pass; `yarn lint` clean; `yarn
package` as above. Mutations: putting back the old HELP.md fails the two guide tests; removing the
pending sentence fails "selected, on air, allowed, pending and stale stay apart". Review fix on #1561: two quick presses shared `last_press`, so the first one's answer could
say Done while the second still waited; only the newest press now writes it, and letting any
press write it again fails "an older press answered after a newer one leaves the newer one
pending".

## The headless guide walk (AC-1)

A scratch Companion with an empty configuration, driven by Playwright through its admin UI,
following only `HELP.md`, against a production published on the local stack and open on its
production page. The walk script stays in the session scratchpad; it is not a suite spec.

| s | Step (the guide's words) | Seen |
| --- | --- | --- |
| 0.0 | start (final run j-0048) | Companion's own first-run windows: "Welcome to Companion" and "What's New in Companion", both closed (the guide now says so) |
| 7.2 | Install: **Modules**, **Import module package**, the file | NoaCG listed after 3.2 s |
| 7.6 | 1: **Setup**, **Panel**, **Pair a panel** | a code `XXXX-XXXX` |
| 14.1 | 2: **Connections**, search `NoaCG`, **Add** beside **NoaCG: NoaCG Studio**, **Add** again; code, **Panel name**, **Save** | the code typed in lower case; Pairing code cleared, Panel key filled and masked, status green |
| 16.7 | | the panel listed on the page as "Walk deck" |
| 18.4 | 3: the production page answers by itself | "This page answers the panel.", header **Panel ✓** |
| 22.3 | 4: **Buttons**, **Presets**, **NoaCG**, **Show control**, drag TAKE onto 1/1 | the key reads "TAKE Ben" from the page's state |
| 24.6 | press 1/1 | the production page: "on air: ● Ben" within 0.3 s |
| 24.7 | press 1/1 again | "nothing on air" |

25.1 s from install to a working Take key (final run j-0048 on `2a89eb41d`; 24.8 s on `9a1c963`, j-0044). The table's times are j-0044's; j-0048's differ by under a second per step. This is a
machine's time: it says the guide's steps are complete and in order, not how long a person takes
(the trial kit and H0.2 measure that). Wrong turns found and fixed in the guide: the connection is
listed as "NoaCG: NoaCG Studio", not "NoaCG Studio"; Add is pressed twice; the presets sit behind a
NoaCG card; first-run windows come before Modules; the config hint said "open Panels", which does
not exist (it is Setup, then Panel). One key fix: UPDATE wrapped at size 18.

## AC-2: every declared verb through the real relay

`e2e/configured/panel-page.spec.ts`, "every transport and selection verb runs once through the
relay, reaching the command log and PROGRAM", on the hosted control page with a stepped graphic
(Clean Steps). Each press goes through `panel_press` with a real panel key; the command log is read
through `control_tail`; PROGRAM's entrance count is `data-plays`.

| Verb | Target | Command log | Rendered |
| --- | --- | --- | --- |
| select-next, select-prev | none | nothing | selection Ben, then Anna |
| take | the selected row | one `play` | PROGRAM plays 1 |
| take, same press id | | nothing (`duplicate`) | plays still 1 |
| next | selected | one `next` | |
| update | selected | one `update`, no `play` | plays still 1 |
| retake | selected | one `play` | plays 2 |
| out | selected | one `stop` | nothing on air |
| trigger-cue | Ben's row id | one `play` | Ben on air, selection stays on Anna |
| trigger-cue again | Ben's row id | one `play` (restart) | plays 4, selection on Anna |
| pause-toggle | | nothing (`not-here`) | |

The rest of D5 is already walked through the relay: `take-cue`, `select-cue`, `all-out` in both
page walks, `pause`, `resume`, `pause-toggle` with a server clip in
`panel-production-page.spec.ts`. Feedback kept apart: selected, on air, allowed, pending and stale
in `companion-module/src/__tests__/panel.test.ts` (module) and in the published state of both page
walks. PREVIEW: protocol v1 publishes what Take does next (`space`, which is `preview` in the
preview-then-take mode) and no separate preview tally; a preview tally is a protocol change, which
extensions.md gives to E6's single protocol bump. Latency: hosted state-to-module p50 42 ms is
the feedback figure; press-to-render is hardware-panel AC-8's laptop measurement. No new budget.

Runs: local stack j-0004 and j-0017 (twice, `--repeat-each 2`), 59 s for both; hosted staging run
[39520008928](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39520008928) passed it (46 s).
Mutations, each in its own job: running a relayed Take twice failed it at "one Take, one play"
(j-0018); Trigger moving the selection failed it at `benUp.selected` (j-0019).

## AC-3: ownership and credentials fail safely

- **Two answering contexts, reload, expired lease, revoked key:** the existing
  `panel-lease.spec.ts` (reload keeps it, a second page never takes it, a closed page lapses and
  the other takes it), `panel-relay.spec.ts` (lease rules, simultaneous takes, lapse, revoke),
  `panel-page.spec.ts` and `panel-production-page.spec.ts` (Use here, close). All passed locally
  (j-0001 and the targeted runs) and on hosted staging in run 39520008928.
- **Hidden page and disconnect** (new, `panel-lease.spec.ts`): while the page says it is hidden,
  its own interval ticks are skipped and timeouts held; after 32 s it still answers under the same
  claim and runs a press. Then its network and Realtime sockets are cut: the lease lapses
  (`hello` says no page), a press is refused `no-page` and never runs later, the phone takes the
  panel with Use here under a newer claim, and back online, two lease times later, the production
  page still defers and only the phone runs presses. Shown again, the page runs and publishes
  fresh presses under the same claim. Local j-0045 pass. Mutations: the beat on a page interval
  instead of the worker fails "a hidden page keeps the lease" (j-0023, again j-0046); a page that
  re-takes the lease when its renewal is refused fails the hand-over check (j-0027, again j-0047). The first
  version of this test passed both mutations and is not evidence: Playwright's offline mode
  leaves WebSockets open, and stubbing timers late leaves running intervals alone.
- **Old, repeated and stale presses:** a repeated id runs nothing (AC-2 table); a press whose cue
  is no longer a row is refused `stale` (`judgePress`, `scripts/panel-feedback.test.mjs`); the
  server stamps every press with the current claim, so a replaced page ignores it.
- **The credential's real routes** (new, `panel-relay.spec.ts`, "a panel key cannot write the
  command log or reach another production"): with only the publishable key and a panel key,
  `control_send`, `control_send_many`, `control_send_seq`, `control_stage`, `panel_list` and
  `panel_lease` all refuse the key; `control_tail` with it reads nothing; `control_data_send`
  refuses it; an insert into `control_events` is denied and a read returns nothing; the
  production's log row count is unchanged. A press with production A's key reaches A's answering
  page and B's page hears nothing. Local j-0004 and j-0045; hosted staging run 39520008928.
- **No secrets in screenshots or logs:** the specs print only timings and counts; the walk's
  screenshots show the Panel key masked. Screenshots stayed in the scratchpad.

## Not checked here

A person's walk and timing (trial kit, H0.2); the physical deck, CasparCG and OBS (H0.2, AC-4);
hardware-panel AC-8, AC-11 and AC-12 on this merge's SHA (the laptop helper). The hosted run
39520008928 was on `13f74fb`, before the lease test was made real; it failed there on its first
version (the reason above) and on `agent-access.spec.ts`, whose browser crashed while launching in
the published-CLI path this change does not touch.
