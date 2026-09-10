# Promise audit - what the landing page may say

**This file is what `index.html` and `ograf.html` are allowed to claim.** One row per promise the
public pages make, its grade, and the file, spec or command that proves the grade. Copy on the
landing page never outranks its row here: a claim without a row is not on the page, and a row
that says NOT YET IMPLEMENTED is worded on the page as direction, never as a feature.

Grades, exactly three: **WORKS NOW**, **WORKS WITH A STATED LIMITATION** (the limitation is in
the evidence column and on the page), **NOT YET IMPLEMENTED**.

First audit 2026-09-08. Every grade rests on something read or run in a checkout: a spec title, a
source line, or a command with its output. Re-run the audit when a row's evidence moves, and
before any landing-page rewrite. The rows are numbered for reading only; cite a row by its promise,
because the numbers shift when a row is added.

## The rows

| # | Promise on the page | Grade | Evidence (file, spec or run) |
|---|---|---|---|
| 1 | Free and open source, AGPL-3.0, no paid edition of NoaCG | WORKS NOW | `LICENSE` (AGPL-3.0); `package.json` `"license": "AGPL-3.0-only"`; `src/entitlements/contract.ts` FEATURE_KEYS comment: the editor, catalog, preview and the six local export targets have no entitlement key and cannot be paywalled; `docs/OWNER_RULINGS.md` "owner-decisions-2026-09-07". The Lite / Pro / BYO names are AI *tiers* about who runs the model, not editions of NoaCG (`src/components/wizard/steps/AiStep.tsx` TIER_OPTIONS). `cli/` is Apache-2.0 on purpose (`docs/AGENT_CLI.md` "Distribution"). A render tier named `paid` exists in `src/render/limits.ts` as entitlement plumbing; no billing reaches it and the comment now says so. |
| 2 | No account to create, edit and export | WORKS NOW | `src/components/ExportSurface.tsx` gates export on validation only; `e2e/offline.spec.ts` (the editor works with every CDN blocked); `e2e/exports.spec.ts`. |
| 3 | Exports to SPX Graphics, CasparCG, OBS and vMix (HTML overlay), H2R, LiveOS, OGraf | WORKS WITH A STATED LIMITATION | One builder per target in `src/export/targets/` (`spxStarter.ts`, `casparcg.ts`, `htmlOverlay.ts`, `h2r.ts`, `liveos.ts`, `ograf.ts`); `e2e/exports.spec.ts` "export panel offers all six targets" plus one test per target. Limitation: LiveOS is the OGraf package with LiveOS instructions (`exports.spec.ts` "liveos: the OGraf package with LiveOS instructions"); OGraf and LiveOS packages are ES modules and must be served over http(s), not opened from a file (`docs/OGRAF.md` "Give it to the renderer"). |
| 4 | Validated before export; an invalid graphic cannot export or publish | WORKS NOW | `src/validation/publishGate.ts`, `src/validation/productionGate.ts`; `src/export/showExport.ts` refuses through `assertProductionGate`; `e2e/production-gate.spec.ts`. Single-graphic export blocks on errors and warns on an external dependency (`src/validation/validateTemplate.ts` step 4); a production export promotes that warning to an error. |
| 5 | Start from a template: a catalog with live previews, search, filters and kits | WORKS NOW | `src/components/wizard/steps/BrowseStep.tsx`, `KitPicker.tsx`; `e2e/wizard-preview.spec.ts`, `e2e/wizard-kit.spec.ts`, `e2e/wizard-filters.spec.ts`. |
| 6 | Create with AI: NoaCG Lite and NoaCG Pro both free, checked in a live playout test | WORKS WITH A STATED LIMITATION | `src/ai/lite/pipeline.ts` runs the runtime bench before a graphic is offered; `e2e/ai-lite.spec.ts`, `e2e/ai-tiers.spec.ts`, `e2e/pro.spec.ts`. Limitation: **on the hosted studio, Create with AI needs a free NoaCG account before any tier is offered**, bring-your-own-key included (`src/components/wizard/steps/AiStep.tsx`: `needsSignIn` renders the SignInPrompt ahead of the tier picker); Pro is offered only where the hosted service is configured. Bring-your-own-key then runs on the user's own provider account. A self-hosted build with no account backend has no sign-in at all. |
| 7 | Bring your own SVG artwork: text layers become operator fields, the graphic goes on air as drawn | WORKS WITH A STATED LIMITATION | `src/templates/importedDesign/svg.ts`, `artworkFields.ts`; `src/assets/svgImport.ts`; `e2e/import-svg.spec.ts` (mapping from layer names, overflow-only fit, sanitizer, image binding), `e2e/import-svg-corpus.spec.ts`. Limitation: text must stay text; outlined type gets a stand-in line in a real font (`import-svg.spec.ts` "outlined text gets the honest answer"); the file is sanitized and bound in place, not byte-identical (`docs/SVG_IMPORT_PLAN.md` §1, §5). |
| 8 | Behaviour on your own artwork: a quiz locks and reveals, a scoreboard counts, without code | WORKS NOW | `src/templates/importedDesign/behaviour.ts`, `behaviourRuntime.ts`; `e2e/import-svg-behaviour.spec.ts` (scoreboard stepper, quiz select > lock > reveal, countdown, vote board, puzzle, bingo, and the CasparCG package driving the same boards); `e2e/quiz-pilot.spec.ts`. What is still owed is eyes, not code: the owner confirmed the quiz end to end on his own board on 2026-09-03, and the scoreboard half was built to his brief the day after (`docs/acceptance/owner-queue/2026-09-04-a-score-tracker-on-your-own-artwork.md`), so what is left is that board walked again now that the text-box defects under it are fixed (`docs/TEXT_BOX_BINDING.md`) and step 2 of `docs/acceptance/IMPORTED_QUIZ_HOSTED_WALK.md`, the eyes-on half of the hosted walk. |
| 9 | Photos and flattened images import too, with fields placed on top | WORKS NOW | `e2e/import-graphic.spec.ts`, `e2e/import-prepare.spec.ts`. |
| 10 | A custom graphic gets a usable operator panel from its own fields and events, never from a category | WORKS NOW | `src/control/controlModel.ts` (`fieldDescriptors`, `eventButtons`); `e2e/ograf-contract.spec.ts` "a typeless NoaCG graphic joins a production and the operator sees every field plus the lifecycle verbs"; `e2e/bridge.spec.ts` "the operator surface of a scaffold is derived from its fields and machine"; `e2e/control-panel-types.spec.ts`. |
| 11 | Graphic types ship with their own operator buttons (quiz, sports clock, esports, reveals, competition boards, live polls) | WORKS WITH A STATED LIMITATION | 36 of 67 registered types declare buttons today (Vite `ssrLoadModule` over `src/templates/types/registry.ts`, run 2026-09-08; the page used to say 16). Every named button is an authored event: `answerBoard.ts` (Lock it in, Reveal correct, Show audience result), `sportsBugs.ts` (Interval, Back to live, Full time, held cards), `esports.ts` (Map final, Next map, Technical pause), `reveals.ts`, `competitionBoards.ts`. Limitation: a live poll's buttons are Close voting, Show result, Call the winner (`livePoll.ts` LIVE_POLL_CONTROLS); opening the vote is an audience-workspace action, not a graphic button. The page now names no count. |
| 12 | Multi-step reveals, one Continue press at a time | WORKS NOW | `TypeCapabilities.defaultSteps` (`src/templates/types/graphicType.ts`); `e2e/exports.spec.ts` "spx: the folder package plays like a host drives it"; `e2e/import-svg-behaviour.spec.ts` "stepped list: Next reveals the entries". |
| 13 | A production: graphics, a cue rundown, one persistent output URL; PVW/PGM dashboard with keyboard verbs | WORKS WITH A STATED LIMITATION | `src/control/hostedControl.ts` `publishControlShow`; `e2e/production-controls.spec.ts`, `e2e/hosted-control.spec.ts`, `e2e/playout-drills.spec.ts`. Limitation: **publishing the hosted control page and the output URL needs a free account** (`src/components/home/ProductionPage.tsx` `publish`: "Publishing a production needs an account"); operating the published page needs none (`hostedControl.ts` header, `?control=<slug>`). Offline, the exported package carries its own controller and local relay (`e2e/local-relay.spec.ts`). |
| 14 | Point OBS, vMix or CasparCG at the output URL | WORKS WITH A STATED LIMITATION | OBS / vMix load `/output?production=<slug>` as a browser source (`src/output/main.ts`). CasparCG needs the local agent because a browser cannot open an AMCP socket: `noacg caspar agent` and `noacg caspar play --url` (`cli/src/commands/caspar.ts`, `src/control/casparLink.ts`, `e2e/caspar-connect.spec.ts` against a fake server, 15 CLI tests against a fake AMCP). The Connect path has not been run against real CasparCG hardware yet (`docs/acceptance/owner-queue/2026-08-25-casparcg-connect-against-real-hardware.md`); the exported CasparCG package has (owner, 2026-08-19, `docs/GOALS_ARCHIVE.md`). |
| 15 | Drive it from another tab, an OBS dock, a phone, a second laptop | WORKS NOW | The hosted page is capability-addressed and needs no sign-in to operate (`src/control/hostedControl.ts`); `docs/CLOUD_PLAYOUT.md` checklist step 6 (phone, signed out). Rides on row 13's account limitation. |
| 16 | Editable live data: staged first, aired on an explicit take | WORKS NOW | `e2e/production-data.spec.ts`; `e2e/production-controls.spec.ts` "± LIVE NUMBERS bumps a figure on air without publishing other staged edits" (the deliberate exception, per press). |
| 17 | Google Sheets feed | WORKS WITH A STATED LIMITATION | `src/control/liveData.ts` (polls a published CSV, writes through `update`); `e2e/control.spec.ts` "live data: a published CSV drives the graphic". Limitation: the sheet must be published to the web as CSV, and a feed writes live, not through the staged take. |
| 18 | Audience send-in: moderated viewer messages and votes into an on-air graphic | WORKS WITH A STATED LIMITATION | `src/audience/audienceData.ts`; `e2e/production-audience.spec.ts` (arrive, edit a broadcast version, approve, send to the rundown, air it; the vote round). Limitation: the join page needs a published production, so a free account (`production-audience.spec.ts` "the public join page answers honestly on an offline build"). |
| 19 | Live data API over plain HTTPS | WORKS WITH A STATED LIMITATION | `api/data/[...path].ts`, `src/control/productionDataApi.ts`, `docs/DATA_API.md`; `e2e/data-api.spec.ts`. Limitation: needs a published production and its data key (row 13). |
| 20 | No lock-in: real HTML/CSS/JS, self-contained packages, runs from a local file with no internet | WORKS WITH A STATED LIMITATION | `src/export/selfContained.ts`; `e2e/exports.spec.ts` "no export target ships a relative reference its own package cannot resolve" and "every export target carries the fonts its own code references"; `e2e/offline.spec.ts`. Limitation: the single-file targets and the SPX folder run from a file; OGraf and LiveOS packages need an http(s) server (row 3). |
| 21 | Make a video or animation (Remotion / HyperFrames), rendered to MP4 or WebM | WORKS WITH A STATED LIMITATION | `render-worker/render.mjs`; `e2e/video-project.spec.ts`, `e2e/video-hyperframes.spec.ts`, `e2e/render.spec.ts`. Limitation: describing one with AI needs a free account (`src/components/wizard/steps/VideoStep.tsx` SignInPrompt); anonymous rendering is capped at 15 s and two jobs an hour (`src/render/limits.ts` RENDER_LIMITS.anonymous). |
| 22 | The NoaCG CLI: `npx @noacg/cli scaffold / validate / save`, `npx -y @noacg/cli mcp` | WORKS WITH A STATED LIMITATION | `save` needs `noacg login`, so a free account and one consent click (`cli/src/commands/save.ts` refuses without a key and names the Import door as the account-free road); everything else runs without one. Registry: `npm view @noacg/cli version` = 0.3.0, `latest`, Apache-2.0 (run 2026-09-08). Local: `npm --prefix cli ci && npm --prefix cli run build` exit 0; `npm --prefix cli test` 60 tests, 55 pass, 0 fail, 5 skipped (the bridge smoke tier, no dev server); `node cli/dist/index.js --version` = 0.3.0; `--help` lists every verb the page shows; `docs contract` prints the contract with no browser. The unscoped `noacg` does not exist on npm and never will (`docs/AGENT_CLI.md` "Distribution"). |
| 23 | Claude Code and Codex plugin install lines on `/docs#claude-code` | WORKS NOW | `cli/plugin/`, `cli/plugin-mcp/`, `.claude-plugin/marketplace.json`; `e2e/docs.spec.ts` "the agent guide offers both install routes, and they are the real ones". **All four lines re-executed on a clean profile 2026-09-10, every one exit 0** - see "The clean-profile install run" below for what was reset, the timings and the three things it found. Previous executions: 2026-08-22 (Claude Code) and 2026-08-27 (Codex). |
| 24 | An agent-made graphic imports into the studio and keeps its name and type | WORKS NOW | `src/model/importTemplate.ts` reads `v_noacg`; `e2e/import.spec.ts` "import zip: a NoaCG graphic package keeps its name and TYPE through the Import door"; `e2e/bridge.spec.ts` "a dual package round-trips through the bridge". |
| 25 | NoaCG reads any OGraf package: manifest validated, operator surface derived, lifecycle driven | WORKS NOW (through the CLI) | `src/export/targets/ografImport.ts`, `src/control/ografContract.ts`, `src/bridge/ografHost.ts`; `noacg inspect` and `noacg validate` on a third-party package (`cli/src/commands/validate.ts`); `e2e/ograf-contract.spec.ts` "a third-party OGraf package reads as conformant and its operator surface is derived from the manifest" and "the OGraf host mounts a stranger package and drives every lifecycle call with 2xx". |
| 26 | A third-party OGraf graphic in the studio: in the library, in a production, on the output URL, driven from the dashboard | NOT YET IMPLEMENTED | The Import door wants an `.html` entry (`src/model/importTemplate.ts` `importZipTemplate`); `ografImport.ts` is consumed only by `src/bridge/bridgeApi.ts`; `noacg save` refuses a package without NoaCG sources (`cli/src/commands/save.ts`); `docs/AGENT_SAVE.md` §6; the OGraf-first ladder in `docs/GOALS.md` (import v1, foreign-package playout on `/output`). On the page as direction only. |
| 27 | NoaCG as the controller of a NoaCG production running on an OGraf renderer; `/output` speaking the OGraf Server API | NOT YET IMPLEMENTED | `docs/OGRAF.md` "Playing a NoaCG production on an OGraf renderer, today": the renderer owns loading, cueing and data, "there is no NoaCG-to-renderer control link today"; no OGraf route in `api/` or `src/output/`. On the page as direction only. |
| 28 | Any graphic made here exports as an OGraf v1 Graphic, and every catalog graphic's manifest satisfies the schema (only the OGraf and LiveOS targets and the CLI's dual package write a manifest; SPX, CasparCG, overlay and H2R packages carry none) | WORKS NOW | `src/export/targets/ograf.ts`, `ografSchema.ts`; `e2e/ograf-conformance.spec.ts` "every catalog graphic emits a manifest that satisfies the OGraf v1 schema"; the CLI's dual package was driven in SuperFlyTV's ograf-server (`docs/OGRAF.md`, 2026-08-22) and the manifest checked against the EBU's published schema files with a mutation-tested harness (2026-08-26). |
| 29 | `/ograf`: six free starter packages, built by the real exporter at click time, schema-validated on every download | WORKS WITH A STATED LIMITATION | `ograf.html` (six `[data-starter]` cards); `src/ograf/main.ts`; `e2e/ograf-starters.spec.ts` "a starter download is a valid OGraf package with the modification guide inside". Limitation: the schema the download is checked against is NoaCG's transcription of the EBU's, compared with the published files weekly (`scripts/check-ograf-schema.mjs`; `docs/OGRAF.md` "The transcription against the published files, weekly"). |

## The clean-profile install run (row 23), 2026-09-10

Row 23 used to be graded down purely for staleness, and `docs/DEMO_2026-09-25.md` B5 points here
because these dates should live in exactly one place. This is that place.

**What "clean profile" means here, precisely, because it decides what the run proves.** Not a new
Windows account and not a new machine. A directory tree at `C:\noacg-be-clean` with `USERPROFILE`,
`APPDATA`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `npm_config_cache` and `npm_config_prefix` all
pointed into it, so every piece of state these four commands read or write was empty at the start:
no configured marketplace, no installed plugin, no npm cache, no global npm prefix, and no
`%APPDATA%\noacg` (which is where the CLI keeps its login key - `cli/src/config.ts` `configDir()`
reads `APPDATA` on Windows, NOT the home directory, so resetting the profile alone is not enough
and the first attempt read the real machine's key). `GIT_CONFIG_GLOBAL` was deliberately left
pointing at the real `.gitconfig`, since git identity is not part of what this proves.

**What it therefore does NOT prove.** Node 24.13.0, npm 11.6.2, Chrome, Edge and the `claude` and
`codex` binaries were already installed and on `PATH`. A student starting from a bare OS installs
those first, and this run says nothing about that half.

**The four lines, in order, all exit 0**, with the prompt's own verification step under them.

| line | time |
|---|---|
| `claude plugin marketplace add NoaCG/NoaCG-Studio` | 13.1 s |
| `claude plugin install noacg@noacg-studio` | 0.7 s |
| `codex plugin marketplace add NoaCG/NoaCG-Studio` | 21.5 s |
| `codex plugin add noacg@noacg-studio` | 0.2 s |
| `npx -y @noacg/cli doctor` (the prompt's own verify step, cold npm cache) | 18.0 s |

`claude plugin list` then reports `noacg@noacg-studio` 0.3.1, scope user, enabled. What it
delivered is read off the installed directory rather than that summary: the
`skills/noacg-graphic/` tree and `commands/graphic.md` are there and no `.mcp.json` is, which is
the split holding on the Claude side too. `doctor` names the deployment, the browser, the bridge
version, the fresh config directory and "not logged in". The optional `noacg-mcp` plugin installs
on Codex the same way and registers the server; `docs/AGENT_CLI.md` carries that walk.

**Three things the run found, none of them a limitation on the promise.**

- **The version stamp disagrees with the registry.** `main` stamps both plugin manifests 0.3.1
  (`cli/package.json` is 0.3.1) while `npm view @noacg/cli dist-tags` is still `latest: 0.3.0`, so
  today's install is a plugin calling itself 0.3.1 that drives 0.3.0. Nothing breaks; the plugin
  ships the skill and the command, and the version it prints is cosmetic. Publishing is a separate
  row's work and was deliberately not done here.
- **A stale global install wins silently, forever.** `cli/plugin-mcp/mcp-server.mjs` prefers an
  installed `@noacg/cli` over npx by design, so a machine that ever ran `npm i -g @noacg/cli` keeps
  that version. This laptop carries a global **0.2.0**, and driving the server against it returned
  the old seven-tool shape instead of 0.3.0's single `noacg` tool. `npm i -g @noacg/cli@latest`
  fixes it, and the one command you would check with cannot show it: the docs prompt says to run
  `npx -y @noacg/cli doctor`, which prints the version NPX just fetched, not the global the server
  will import. (A bare `noacg doctor` from the stale global does print 0.2.0 - but nobody is told
  to run it that way.) Filed as
  `docs/backlog/a-stale-global-cli-wins-over-npx-silently.md`; `docs/AGENT_CLI.md` carries the
  measurement.
- **Adding the marketplace costs 107 MB of the user's disk.** Both agents clone the whole
  repository to read `.claude-plugin/marketplace.json`. That is the host's behaviour and not
  something this repo chooses, so there is nothing here to fix; it is recorded because it surprises
  people and because the room on the 25th will do it on their own laptops.

## What changed on the page because of the grades

- The video note used to say video was "the one part that needs a free account". Rows 6, 13, 18,
  19, 21 and 22 each ask for one, so the page now states the rule (an account only where a hosted
  service does work for you) and the cases a visitor meets first, and never a count.
- "16 graphic types ship with their own operator buttons" was stale (row 11) and a count of that
  kind ages; the page now names the kinds and no number.
- "Open the vote" was not an authored poll button (row 11); the page names the three that are.
- OGraf was two chips and an alt text. Rows 25 to 29 now have their own section: what works
  today, what is the stated direction.
- "Runs from a local file" is scoped to the targets it is true of (row 20).
- The agent section says the CLI is published and what version (row 22); the plugin road is
  pointed at, not sold (row 23).
- The SVG card says "bring your own artwork" as the workflow it is (rows 7 and 8), and names the
  one rule that decides whether a file imports well.

## Two doors that exist in the tree and the page did not mention

Found by the audit, now on the page or in `docs/`:

- Reading a stranger's OGraf package through the CLI (row 25) - on the page.
- The exported package's own local controller and relay for a renderer that cannot reach the
  hosted page (row 13's offline half) - on the page in the no-lock-in section.

Not on the page, deliberately, because the page is for a stranger and these are operator detail:
ProRes and PNG sequences for signed-in rendering, the presenter now/next view, CSV dataset import,
the running-clock recovery drills, and per-engine compatibility diagnostics.
