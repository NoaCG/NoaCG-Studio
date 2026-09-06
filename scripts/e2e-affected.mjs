#!/usr/bin/env node
// Run the e2e specs that cover the files you changed - the inner loop locally, and the per-merge
// tier in CI (docs/DEPLOYMENT.md; the nightly still runs the whole suite).
//
//   npm run test:e2e:affected            # diff against the merge-base with main + working tree
//   npm run test:e2e:affected -- <ref>   # diff against an explicit base ref
//   npm run test:e2e:integration         # after taking main in: diff from the FORK POINT, so the
//                                        # plan covers BOTH sides' changes (automatic when HEAD
//                                        # is a merge of main; --no-integration opts out)
//   npm run test:e2e:affected -- --list  # print the plan without running Playwright
//   npm run test:e2e:affected -- --json  # print the plan as JSON, for CI to branch on
//   npm run test:e2e:affected -- --help  # the accepted flags, generated from the one list
//
// AN ARGUMENT THIS CLI DOES NOT RECOGNISE IS AN ERROR, not a no-op (see `parseArgs`): a
// misspelt plan-only flag used to be dropped on the floor, leaving the plan to RUN.
//
// The mapping below is CURATED, not traced: it errs toward running more. Anything touching the
// shared core (store, model, preview composer, validation, the shell, the e2e helpers, build
// config) runs the full suite, because those files feed every flow.
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIGURED_TRIGGERS, FOCUS } from './e2e-lists.mjs';
import {
  budgetMinutes,
  predictShardMinutes,
  readTable,
  specFilesOnDisk,
  SHARD_CAP_MINUTES,
  SHARD_SAFETY_MINUTES,
} from './e2e-durations.mjs';

/**
 * True only when this file was RUN, not imported. `planFor` below is exported for tests, and
 * without this guard importing it executes the CLI at the bottom - which, given no `--list` or
 * `--json`, means spawning Playwright and the whole offline suite. That is not hypothetical:
 * it happened on the first attempt to import this module, and a 150-test run had to be killed.
 */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

// ── Source-area → spec globs ────────────────────────────────────────────────
// Order does not matter; every matching rule contributes its specs (union).
const MAP = [
  [/^(?:terms|privacy)\.html$|^src\/legal\.css$/, ['legal.spec.ts']],
  [/^src\/backend\/events\.ts$|^api\/(events\.ts|_lib\/funnelEvents)/, ['analytics.spec.ts']],
  [/^src\/components\/(AnalyticsConsentBanner|SettingsDialog)\.tsx$/, ['analytics.spec.ts', 'auth.spec.ts']],
  [/^supabase\/migrations\/0037_funnel_opt_in_retention\.sql$/, ['analytics.spec.ts']],
  [/^src\/ai\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  // creative-routing covers the mode + intent ROUTER and the brief-satisfaction check, both
  // of which live here - it was previously nightly-only for src/ai changes, which is exactly
  // the surface it exists to protect.
  // Phase A's composer (docs/NOACG_PRO_PLAN.md §15.5). Listed BEFORE the generic pro rule and
  // union'd with it: the language path shares nothing with the concept-and-compile pipeline
  // pro.spec.ts covers, so its guarantees had no gate at all until this spec existed.
  [/^src\/ai\/pro\/language\//, ['pro-language.spec.ts']],
  [/^src\/ai\/pro\/custom\//, ['pro-custom.spec.ts', 'pro-language.spec.ts']],
  // …and the platform HALF of that composer, which since Phase B (§15.9) is the graphic-type
  // registry and two category assemblers rather than one. A Pro sponsor bug is compiled through
  // `types/bugs.ts` and a Pro countdown through `types/clocks.ts`, and both take their mark
  // placement from the shared logo slot - so a change to any of them can break a Pro package
  // while every catalog spec stays green, which is exactly the mapping hole this file exists to
  // close. Union'd with the generic src/templates rule below.
  [
    /^src\/templates\/(types\/(bugs|clocks|graphicType|registry)\.ts|shared\/(logoSlot|standard)\.ts|(cornerBug|gameTimers|lowerThirds)\/shared\.ts)$/,
    ['pro-language.spec.ts'],
  ],
  [/^src\/ai\/pro\//, ['pro.spec.ts', 'import-graphic.spec.ts']],
  // The bench-only spike instruments. They never gate a user flow, but they are what a paid
  // round's numbers MEAN - and the panel-overflow blindness (docs/NOACG_PRO_PLAN.md §15.6) is
  // exactly the class that builds green and reports a defect as its opposite.
  [/^src\/ai\/spike\//, ['spike-instruments.spec.ts']],
  // The design rules as a PRODUCT property (docs/DESIGN_RULES_PLAN.md §5 R4): the canonical
  // module, the shared measurement instruments (moved out of the spike so product and bench
  // read one code), and the warn-first product warnings. src/model and src/validation are
  // CORE (full suite), but under the sprint focus that escalation runs the FOCUS list - so
  // the spec is in e2e-lists.mjs FOCUS as well, and this line documents the pairing.
  [/^src\/(model\/designRules\.ts|validation\/(designRulesWarnings|readabilityCheck|tickerCheck)\.ts)$/, ['design-rules-product.spec.ts', 'spike-instruments.spec.ts']],
  // The mark PROBE is read by the Lite legibility gate and by Pro's mark-field trigger, and the
  // trigger rests entirely on `inkSpread` separating one ink from several.
  [/^src\/assets\/assetInfo\.ts$/, ['spike-instruments.spec.ts', 'mark-legibility.spec.ts', 'assets.spec.ts']],
  [/^src\/ai\//, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-lite.spec.ts', 'ai-tiers.spec.ts', 'ai-retrieval.spec.ts', 'adapt-first.spec.ts', 'import-graphic.spec.ts', 'creative-routing.spec.ts', 'creative-pilot.spec.ts', 'pro.spec.ts', 'lite-line-fit.spec.ts', 'lite-type-floor.spec.ts', 'lite-parity.spec.ts', 'lite-field-paint.spec.ts', 'lite-line-content.spec.ts']],
  // The AI step and its child panels are what the ai-* specs actually drive; the generic
  // wizard rule below does not name them, which silently left an AiStep edit unpinned.
  [/^src\/components\/wizard\/steps\/(AiStep|ai\/)/, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-lite.spec.ts', 'ai-tiers.spec.ts', 'ai-more-control.spec.ts', 'ai-consent.spec.ts', 'image-purpose.spec.ts', 'adapt-first.spec.ts', 'pro.spec.ts', 'design-rules-product.spec.ts']],
  // The shared provider/model/key surface. The tier door is where its WORDING is pinned - the
  // one defect class (a mislabelled tier, a transport offered as a choice) that builds green.
  [/^src\/components\/AiProviderSettings\.tsx$/, ['ai-tiers.spec.ts', 'video-settings.spec.ts', 'ai.spec.ts']],
  // The pilot brief bank is read by the anchor re-verification (the decay rule) - a bank edit
  // needs that spec and nothing else.
  [/^benchmarks\/creative\//, ['creative-routing.spec.ts']],
  // The Pro brief bank feeds the spike runner and scripts/lite-on-pro-bank.mjs; the offline
  // product flow it relates to is Phase A's composer, pinned by pro-language.spec.ts. (Until
  // 2026-08-15 this pointed at pro.spec.ts and the fixture bank beside it - both belonged to the
  // retired concept-and-reconstruct engine.)
  [/^benchmarks\/pro\//, ['pro-language.spec.ts']],
  [/^src\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  [/^src\/components\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  [/^player-host\//, ['video-player-host.spec.ts', 'video-project.spec.ts', 'video-readability.spec.ts']],
  // The host BUILD is load-bearing for the preview: it inlines the player JS and the bundled
  // video fonts into public/player-host/index.html, which the video specs load.
  [/^scripts\/build-player-host/, ['video-player-host.spec.ts', 'video-project.spec.ts', 'video-readability.spec.ts']],
  [/^src\/render\//, ['render.spec.ts', 'render-schedule.spec.ts']],
  // ai-dev-routes rides along because a function ADDED, RENAMED or MOVED under api/ai changes
  // what the dev server can reach, and nothing else here would notice.
  [/^api\/(ai\/|_lib\/ai)/, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-tiers.spec.ts', 'ai-more-control.spec.ts', 'ai-dev-routes.spec.ts', 'video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts']],
  [/^api\//, ['render.spec.ts', 'render-schedule.spec.ts']],
  // The Production Data API (docs/DATA_API.md): the routed function, its logic module, and
  // the dev middleware that makes the route exist locally at all.
  [/^(api\/data\/|api\/_lib\/dataIngest|scripts\/dataDevPlugin)/, ['data-api.spec.ts']],
  // The dev server's own route RESOLVER. ai-dev-routes.spec.ts drives the real middleware instead
  // of mocking it, which is the only thing that can prove a route is reachable at all - every
  // other AI spec mocks at the network level, which is why an allowlist hid three surfaces.
  [/^scripts\/(aiDevPlugin|apiRouteTable)/, ['ai-dev-routes.spec.ts', 'ai.spec.ts', 'ai-depth.spec.ts', 'ai-more-control.spec.ts']],
  [/^src\/export\//, ['exports.spec.ts', 'package.spec.ts', 'offline.spec.ts', 'control.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'template-pack-10.spec.ts', 'production-gate.spec.ts']],
  // The two walks that drive a CasparCG package's own operator page live with the imported
  // boards they drive, so an export change has to schedule them from here - they are the only
  // gate on that package's panel, and it was missing from that package entirely until
  // 2026-09-04 with nothing red to say so.
  [/^src\/export\/(common|selfContained|targets\/casparcg)/, ['import-svg-behaviour.spec.ts']],
  [/^src\/control\/receiverScript/, ['import-svg-behaviour.spec.ts']],
  // OGraf conformance is checked over the whole CATALOG, so a template change can break it as
  // surely as an exporter change can (a new field type, a new machine shape).
  [/^src\/(export\/targets\/ograf|templates)\//, ['ograf-conformance.spec.ts']],
  // The free OGraf starters page (/ograf, docs/OGRAF.md): its own files, and it rides on the
  // OGraf target (the download IS that target's build) and on src/templates (a catalog RENAME
  // must fail the card-resolution test, not strand a dead card on a public page).
  [/^(ograf\.html|src\/ograf\/|src\/export\/targets\/ograf|src\/templates\/)/, ['ograf-starters.spec.ts']],
  // The /bridge page (docs/AGENT_CLI.md) and what it composes that nothing else exercises: the
  // dual graphic package + the OGraf package reader (export), the neutral scaffold (templates),
  // the OGraf manifest -> operator-surface adapter (control). The CLI under cli/ has its own
  // package tests (CI) and `npm run bench:cli`; a change there runs no e2e spec.
  [/^(bridge\.html|src\/bridge\/)/, ['bridge.spec.ts', 'ograf-contract.spec.ts']],
  [/^src\/export\/(noacgPackage|targets\/ografImport|targets\/ograf)/, ['bridge.spec.ts', 'ograf-contract.spec.ts']],
  [/^src\/templates\/types\/neutralDesign/, ['bridge.spec.ts']],
  [/^src\/control\/ografContract/, ['ograf-contract.spec.ts', 'bridge.spec.ts']],
  [/^cli\//, []],
  // The plugin marketplace entry (root .claude-plugin/) and the agent round's brief bank +
  // results (benchmarks/agent/): read by `claude plugin` and by scripts/agent-round-bench.mjs,
  // never by a spec.
  [/^(\.claude-plugin\/|benchmarks\/agent\/)/, []],
  // The OUTPUT EMBED is an export file about the cloud output, so it belongs to the production
  // suite rather than to the package specs the rule above lists (rules union, never shadow).
  [/^src\/export\/outputEmbed/, ['productions.spec.ts']],
  [/^src\/control\//, ['control.spec.ts', 'control-panel-types.spec.ts', 'exports.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'production-controls.spec.ts', 'snap-recovery.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts', 'production-gate.spec.ts']],
  // The library->air gate (docs/AGENT_SAVE.md): publishControlShow and the production builders
  // refuse an invalid graphic. src/validation is CORE, so a change to the gate itself runs the
  // full suite; this line is for the two call sites and the dialog that shows the verdict.
  [/^(src\/export\/showExport|src\/components\/home\/ProductionExportDialog)/, ['production-gate.spec.ts']],
  // The readable audience name is minted by the publish path but READ on the audience surfaces,
  // and rules union rather than shadowing - so this adds to the src/control/ list above.
  [/^src\/control\/joinName/, ['production-audience.spec.ts']],
  // Loading a DATASET row into a cue: the matcher is shared by the in-app page (live) and the
  // publish path (the hosted page's rows), so the production-data specs that drive the gesture
  // have to run alongside the control ones the rule above selects.
  [/^src\/control\/cueData/, ['production-data.spec.ts']],
  // The browser-output renderer (docs/CLOUD_PLAYOUT.md): its own MPA entry + the stage module.
  [/^src\/output\//, ['productions.spec.ts', 'snap-recovery.spec.ts']],
  [/^output\.html$/, ['productions.spec.ts']],
  // The universal in/out bank (blocks/motionPresets.ts) rides the `^src/blocks/` rule below as
  // well, so naming it here only puts its own spec first. Its PICKER rides NOTHING: it sits at
  // `src/components/MotionPresetPicker.tsx`, which matches neither the wizard rule nor the
  // home rule, so whatever is listed on this line is its ENTIRE coverage. That cost a red
  // shard on 2026-08-23 - the picker grew a direction-arrow row sharing the wizard Travel
  // box's class, and `ux.spec.ts`, which broke on the resulting ambiguous locator, was never
  // planned. The surfaces that MOUNT the picker are therefore named here explicitly.
  // The behaviour binding table and the recipes it is compiled from (docs/SVG_BEHAVIOUR_PLAN.md):
  // every imported-artwork behaviour, the rehearsal, and the machine-graph spec that reads the
  // same machine.
  [/^src\/blocks\/behaviourData\.ts$|^src\/templates\/behaviours\/|^src\/templates\/importedDesign\/(behaviour|behaviourRuntime|artworkFields)\.ts$/, ['import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts', 'import-svg.spec.ts', 'motion-presets.spec.ts']],
  [/^src\/blocks\/motionPresets\.ts$/, ['motion-presets.spec.ts']],
  [
    /^src\/components\/MotionPresetPicker\.tsx$/,
    ['motion-presets.spec.ts', 'ux.spec.ts', 'wizard-preview.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts'],
  ],
  // animData.ts is the animation DATA MODEL, and one of its questions is read outside the
  // timeline entirely: `hasMeasuredMotion` decides whether the wizard's preview plays a
  // graphic or settles it (components/wizard/WizardPreview.tsx). A change to that predicate
  // changes the FIRST FRAME somebody judges a template by, and both specs that measure it
  // live here rather than under the timeline rule below.
  [/^src\/blocks\/animData\.ts$/, ['wizard-preview.spec.ts', 'end-credits.spec.ts', 'public-service.spec.ts']],
  // defaultTemplate.ts left src/model (CORE) for src/templates, so the specs that seed a graphic
  // from it by importing it directly are named here; the templates subset alone would miss
  // storage-full, which builds its own fixture off createDefaultTemplate().
  [/^src\/templates\/defaultTemplate\.ts$/, ['format.spec.ts', 'storage-full.spec.ts']],
  // The Import-graphic road's option shapes (DesignSvg*, DesignArt, DesignStretch). They were
  // full-suite as part of src/model/wizard.ts; the generic ^src/templates/ rule below does not
  // name the import road, whose consumers are the wizard steps, so the specs are named here.
  [/^src\/templates\/importedDesign\/designTypes\.ts$/, ['import.spec.ts', 'import-graphic.spec.ts', 'import-prepare.spec.ts', 'import-stretch.spec.ts', 'import-canvas.spec.ts', 'import-analysis.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts']],

  // src/model/cssVars.ts has no row: it is CORE (src/model), and CORE is decided before MAP is
  // read, so a row here would never fire. The two specs that pin `cssPaintsWith` - whether the
  // wizard offers a palette role at all (components/wizard/steps/StyleStep.tsx) - are
  // wizard-setup-fields.spec.ts and wizard-preview.spec.ts; the full-suite escalation runs both.
  [/^src\/blocks\//, ['motion-presets.spec.ts', 'anim-engine.spec.ts', 'timeline-v2.spec.ts', 'inspector.spec.ts', 'canvas-keyframe.spec.ts', 'legacy-timeline.spec.ts', 'multi-select.spec.ts', 'pasteboard.spec.ts', 'ux.spec.ts', 'bench.spec.ts', 'import-graphic.spec.ts', 'state-machine.spec.ts', 'machine-graph.spec.ts', 'asset-workflow.spec.ts', 'template-insert.spec.ts']],
  // creative-routing rides along because ROUTING and SATISFACTION resolve live against the
  // catalog and the type registry (src/templates/structuralAnchor.ts): a structure the
  // catalog gains or loses moves a route, which is the decay rule the spec enforces.
  // ai-retrieval rides along for the same reason one level down: the shortlist is RANKED over
  // the catalog's own metadata and FILTERED by the same anchor table, so a design added,
  // renamed or re-declared moves what a brief retrieves.
  // The quiz runtime is also the exported control panel's recovery subject and the audience
  // pack's answer boards - the generic src/templates rule below unions with this one.
  [/^src\/templates\/quiz\//, ['control.spec.ts', 'control-panel-types.spec.ts', 'audience-pack.spec.ts', 'production-controls.spec.ts', 'quiz-pilot.spec.ts']],
  // The four types whose MACHINE the per-graphic control page is generated from. A type file is
  // where a state, an arrow or a control label is authored, and control-panel-types.spec.ts is
  // the only place the resulting BUTTONS and their greying are driven on that page - so an edit
  // to any of them has to run it. (types/scoreboard.ts is covered by the sports rule below.)
  [/^src\/templates\/(poll|gameTimers)\//, ['control-panel-types.spec.ts']],
  [/^src\/templates\/types\/(answerBoard|quizBoard|livePoll|clocks)\.ts$/, ['control-panel-types.spec.ts']],
  // The scoreboards are the OTHER stateful family with a runtime of their own - the match
  // clock, the club-colour lift and the period rebuild - and sports.spec.ts is the only place
  // any of that is driven. It had been mapped nowhere at all, so a scoreboard change reached
  // air having run none of its 13 tests until the nightly. control.spec.ts rides along because
  // its exported-panel case is built from a scorebug (sb01).
  [/^src\/templates\/(scoreboards|types\/(sportsBugs|scoreboard))/, ['sports.spec.ts', 'control.spec.ts', 'control-panel-types.spec.ts', 'production-controls.spec.ts']],
  // WHAT A KIT CONTAINS is resolved in kit.ts + packs.ts and offered by the Browse step's kit
  // half, so a pack edit or a change to `kitChoices` moves what the picker offers, what the
  // count promises and what the production ends up holding. Unions with the generic
  // src/templates rule below (which never named this spec).
  [/^src\/templates\/(kit|packs)\.ts$/, ['wizard-kit.spec.ts']],
  // The PICTURE graphic is generated by the production page and by nothing else - no catalog
  // route reaches it - so the generic src/templates rule below would run thirty catalog specs
  // and miss the one spec that actually drives it.
  [/^src\/templates\/picture\.ts$/, ['productions.spec.ts']],
  // THE PACK SPECS BELONG HERE, and for six of them they did not. A spec that iterates the
  // CATALOG asserts over exactly what a design addition changes, so adding one design must
  // select every one of them - yet `competition-pack`, `holding-pack`, `full-frame-offering`,
  // `public-service`, `template-escaping` and `sports` were reachable from no template path at
  // all (sports only from `src/templates/scoreboards`, which a new esports design does not
  // touch). Measured on 2026-08-08: ten designs landed on claude/new-session-d34962, every
  // local and CI branch gate stayed green, and competition-pack.spec.ts only ran because that
  // branch's FIRST push gave CI no diff base and it escalated to the full suite by accident.
  // `scripts/e2e-affected.test.mjs` now pins the rule this list was failing - every catalog
  // importer is selected by a `src/templates/` change - so the hole cannot silently reopen.
  // package.spec.ts and images.spec.ts both CREATE catalog variants and assert on the markup they
  // emit (package.spec drives Classic Roll's parsed roll; images.spec drives its logo slot), so a
  // design's markup changing under them is a real templates dependency. Neither was mapped, which
  // is how a renamed credits row got past a local affected run and red-mained CI on 2026-08-26.
  // anim-engine.spec.ts is the same class one layer down, and it cost main a full day of red on
  // 2026-08-27. It RECONSTRUCTS a preset's emitted region - the only spec that imports
  // presetRegistry - and measures that against the interpreter, so the emit authored under
  // src/templates/ is literally its subject; yet it was reachable only from src/blocks/. The
  // count-from-zero fix changed an infographic emit, every branch plan skipped the one spec that
  // compares the two representations, and the mismatch surfaced in the nightly. The pin lives in
  // scripts/e2e-affected.test.mjs and is derived from that import rather than from this list.
  [/^src\/templates\//, ['anim-engine.spec.ts', 'catalog-baseline.spec.ts', 'package.spec.ts', 'images.spec.ts', 'stage-fit-determinism.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts', 'graphic-types.spec.ts', 'bench.spec.ts', 'house.spec.ts', 'wave2.spec.ts', 'timeline-v2.spec.ts', 'wizard-brand.spec.ts', 'wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'format.spec.ts', 'ux.spec.ts', 'state-machine.spec.ts', 'machine-graph.spec.ts', 'template-pack-10.spec.ts', 'stream-notification.spec.ts', 'creative-routing.spec.ts', 'ai-retrieval.spec.ts', 'snap-recovery.spec.ts', 'lite-parity.spec.ts', 'competition-pack.spec.ts', 'holding-pack.spec.ts', 'full-frame-offering.spec.ts', 'public-service.spec.ts', 'template-escaping.spec.ts', 'sports.spec.ts', 'audience-pack.spec.ts', 'community.spec.ts', 'library.spec.ts', 'library-productions.spec.ts', 'exports.spec.ts', 'wizard-kit.spec.ts', 'lite-field-paint.spec.ts', 'lite-line-content.spec.ts', 'wizard-setup-fields.spec.ts', 'end-credits.spec.ts', 'counting-settle.spec.ts', 'productions.spec.ts']],
  // The Import-graphic capability lives behind its own folder and its own index
  // (src/components/wizard/import/, docs/WORKFLOW_ARCHITECTURE.md §5.5 wizard row 2), so a
  // change inside it selects the import road's own specs and the four others that assert on
  // testids these files render - 38 specs down to 13. The rules below are UNION'd, not
  // first-match, so the narrowing is what the negative
  // lookahead in the generic wizard rule does; this line only names the road's own specs. A
  // change ANYWHERE ELSE under the wizard still runs all nine, because the shell mounts these
  // steps and the draft re-exports their state.
  [
    /^src\/components\/wizard\/import\//,
    [
      // The road's own nine.
      'import.spec.ts', 'import-graphic.spec.ts', 'import-prepare.spec.ts', 'import-stretch.spec.ts',
      'import-canvas.spec.ts', 'import-analysis.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts',
      'import-svg-behaviour.spec.ts',
      // And the four that reach these components through the import entry and assert on testids
      // only they render: the quiz and behaviour rows of MapSvgFieldsStep (student-rehearsal, the
      // spec that gates the quiz and scoreboard push), ImportDesignStep's format and raster
      // warnings (project-format), PlaceFieldsStep's tool area (text-tools) and its font field
      // (google-fonts). They were reached by the generic wizard rule before the lookahead.
      'student-rehearsal.spec.ts', 'project-format.spec.ts', 'text-tools.spec.ts', 'google-fonts.spec.ts',
    ],
  ],
  // wizard-finish, wizard-kit and wizard-shell were MISSING from this list, so a FinishStep,
  // kit-flow or wizard-header change ran neither the spec named after it nor anything that
  // walks to its step - the "runs FEWER specs" failure mode with no alarm attached
  // (scripts/e2e-affected.mjs's own safety argument is that it fails toward running more).
  // import-prepare, import-canvas, import-stretch and import-analysis were mapped from NOWHERE
  // - not from this list, not from src/assets/ below - so the four specs that own the Import
  // Graphic flow's Prepare and Text steps only ever ran at night. That is the same "runs FEWER
  // specs" failure mode the wizard-finish line above records, and it has already bitten twice:
  // auto-placement broke import-analysis, and the erase's opening proposal changes the very
  // step import-prepare and import-canvas walk through.
  // library rides along because the wizard HEADER is a door out of the wizard, and where its
  // controls land is asserted over there: library.spec.ts walks Home -> wizard -> Home through
  // the header. Splitting the logo and Home into two controls changed both of its walks while
  // every spec named after the wizard stayed green, which is this list's own failure mode
  // again - a header change running nothing that leaves the header.
  // AiStep.tsx and steps/ai/ LIVE in this directory, so every AI spec is a real dependency of it
  // - and none of them was mapped. Rewriting one line of the result card's copy on 2026-08-26
  // broke 21 assertions across seven AI specs, and the affected plan selected none of them.
  [/^src\/components\/wizard\/(?!import\/)/, ['ai.spec.ts', 'ai-lite.spec.ts', 'ai-more-control.spec.ts', 'adapt-first.spec.ts', 'image-purpose.spec.ts', 'project-format.spec.ts',
    'motion-presets.spec.ts', 'wizard-brand.spec.ts', 'wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'wizard-entry-fit.spec.ts', 'wizard-finish.spec.ts', 'wizard-kit.spec.ts', 'wizard-shell.spec.ts', 'library.spec.ts', 'flows.spec.ts', 'ux.spec.ts', 'import.spec.ts', 'import-graphic.spec.ts', 'import-prepare.spec.ts', 'import-canvas.spec.ts', 'import-stretch.spec.ts', 'import-analysis.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts', 'text-tools.spec.ts', 'project.spec.ts', 'video-project.spec.ts', 'video-hyperframes.spec.ts', 'pro.spec.ts', 'storage-full.spec.ts', 'wizard-setup-fields.spec.ts', 'google-fonts.spec.ts', 'design-rules-product.spec.ts', 'end-credits.spec.ts']],
  // WHAT HAPPENS WHEN A WRITE FAILS is its own contract (e2e/storage-full.spec.ts) and it cuts
  // across the storage layer, the two save paths over it, and the surface that announces the
  // failure. It is mapped separately because the failure mode it guards - a door that saves
  // nothing and says nothing - reads as "worked" to every other spec in the suite.
  [/^src\/(model\/(library|shows|prefs|storageHealth)|store\/(saveActions|storageAlert)|ai\/settings)/, ['storage-full.spec.ts']],
  [/^src\/components\/save\/StorageAlertDialog/, ['storage-full.spec.ts']],
  // The AUDIENCE plane (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5). Its whole workflow runs on
  // the local provider, so the offline suite really does cover it - which is why the seam was
  // built before the backend.
  [/^src\/audience\//, ['production-audience.spec.ts', 'production-chat-intake.spec.ts']],
  [/^src\/components\/home\/ProductionAudienceWorkspace/, ['production-audience.spec.ts', 'production-chat-intake.spec.ts']],
  // The public join page is its own MPA entry, so it needs its own mapping: a change to
  // join.html or src/join/ touches no module the app imports, and would otherwise map to
  // nothing at all.
  [/^(join\.html|src\/join\/)/, ['production-audience.spec.ts']],
  // The canvas surface moved into its own directory on 2026-08-22 (the overlay, the gesture
  // layer, the guides, the locks and the pasteboard), so the pattern is the DIRECTORY now -
  // pasteboard.ts and partLocks.ts used to fall through to the components fallback.
  [/^src\/components\/canvas\//, ['canvas-selection.spec.ts', 'canvas-keyframe.spec.ts', 'multi-select.spec.ts', 'wysiwyg.spec.ts', 'inline-edit.spec.ts', 'pasteboard.spec.ts', 'import-graphic.spec.ts', 'asset-workflow.spec.ts']],
  // THE TIMELINE DOCK's components. The path matters: these five moved into
  // `src/components/timeline/` and both rules kept naming `src/components/<Name>`, so from the
  // move until 2026-08-29 they matched NOTHING and every timeline change escalated to the full
  // suite as an unmapped path. That direction is the safe one - it ran more, never less - but it
  // ran the whole suite to verify a comment in Inspector.tsx, which is the cost this file exists
  // to avoid. (`TimelineDock` was in the old list and is not a file at all; the dock is
  // WorkspaceDock.tsx, already mapped below.) keyboard.spec.ts is named because StepTimeline owns
  // the Space-plays handler - one half of a two-surface key contract whose other half sits in
  // PreviewFrame, which is CORE.
  [/^src\/components\/timeline\/(StepTimeline|LegacyTimeline|Inspector|PlayoutSimulator)/, ['timeline-v2.spec.ts', 'legacy-timeline.spec.ts', 'inspector.spec.ts', 'anim-engine.spec.ts', 'canvas-keyframe.spec.ts', 'ux.spec.ts', 'import-graphic.spec.ts', 'machine-graph.spec.ts', 'asset-workflow.spec.ts', 'keyboard.spec.ts']],
  [/^src\/components\/timeline\/MachineGraph/, ['machine-graph.spec.ts', 'state-machine.spec.ts', 'timeline-v2.spec.ts']],
  // components/spaceKey.ts is deliberately NOT mapped. It answers who owns Space, Delete, Escape,
  // Ctrl+C and the arrows for the canvas, the timeline, every modal and every focused control, so
  // the set of specs a change to it can move is not a list anybody would keep correct. It
  // escalates, and that is the decision rather than an omission.
  [/^src\/components\/(fields|SampleDataPanel|ControlPanel|HostedControlPage)/, ['control.spec.ts', 'shows.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'images.spec.ts', 'ux.spec.ts', 'video-inputs.spec.ts', 'import-graphic.spec.ts']],
  // The playout dashboard's VERB KEYS, shared by the in-app production page and the hosted
  // control page. Named here rather than left to the components fallback because the spec that
  // actually presses them (playout-drills) is not in either surface's own row - the keymap is a
  // foundation two surfaces read, which is exactly the shape that gets mapped as a helper and
  // then verified by specs that never touch it.
  [/^src\/components\/playoutKeys\.ts$/, ['playout-drills.spec.ts', 'production-controls.spec.ts', 'productions.spec.ts', 'hosted-control.spec.ts']],
  [/^src\/components\/(AssetsPanel|assetInfo|InsertTemplateDialog)/, ['assets.spec.ts', 'images.spec.ts', 'asset-workflow.spec.ts', 'template-insert.spec.ts']],
  // The graphics-pack ROUND TRIP (src/packs/graphicsPack.ts buildPack + the export dialog's
  // download): one spec drives export -> re-import through the real UI, plus the shipped
  // Fight Night pack's install (rundown order included) - so the format owner and both UI
  // ends select it, unioning with the pack-import rules below.
  [/^src\/(packs\/|components\/home\/(ProductionExportDialog|sections\/ProductionsSection))/, ['production-pack.spec.ts']],
  // The pack CONTENT and its builder: the sample-import test drives the built file end to
  // end (import gate included), so editing a pack graphic or the assembler selects it.
  [/^(packs\/|public\/packs\/|scripts\/build-production-pack)/, ['production-pack.spec.ts', 'pack-import.spec.ts']],
  // wizard-kit rides along: the kit's export door lands on ProductionPage and asks it to open
  // THE production export dialog (templateStore `pendingProductionExport`), so a change to
  // that page can break a wizard flow whose name says nothing about productions.
  // import-svg-behaviour rides along too: the cue editor's TOO LONG warning
  // (docs/SVG_IMPORT_PLAN.md §3) is drawn by home/CueOverflowNote and only an IMPORTED graphic
  // reports one, so that spec is the only thing that would catch it going quiet. It is also the
  // only one, which is why it is worth saying twice: a FOCUS run drops it, so a change to that
  // warning is not verified by `test:e2e:focus` - use the full affected plan for it.
  [/^src\/components\/(home|save)\//, ['motion-presets.spec.ts', 'library.spec.ts', 'library-bulk.spec.ts', 'library-productions.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'production-controls.spec.ts', 'production-data.spec.ts', 'production-persistence.spec.ts', 'playout-drills.spec.ts', 'storage-full.spec.ts', 'wizard-kit.spec.ts', 'control-panel-types.spec.ts', 'pack-import.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts']],
  // The graphics-pack door: the format/importer, the shipped pack + its sources and build
  // script, and the shared multi-template save path (also the wizard kit's, hence
  // wizard-kit rides along on templateSet changes).
  [/^src\/packs\//, ['pack-import.spec.ts']],
  [/^(scripts\/packs\/|scripts\/build-news-pack|public\/packs\/)/, ['pack-import.spec.ts']],
  [/^src\/model\/templateSet/, ['pack-import.spec.ts', 'wizard-kit.spec.ts']],
  // The EXPORT SCREEN and the compatibility panel it mounts. Same spec set as `src/export/`
  // above, because they are the same surface from the other side: those specs drive the Export
  // panel, so they are what renders these components at all. Unmapped, each of them escalated a
  // one-component edit to the whole suite - measured 2026-08-07, when a comment fix in
  // PlayoutCompatibility.tsx ran 759 specs to prove nothing.
  // NOTE: no spec asserts the compatibility panel's CONTENT yet (its `playout-compat` testids
  // are unused). These specs mount it, so a crash or a render fault is caught; a wrong VERDICT
  // is not. That gap wants a spec, not a wider mapping.
  [/^src\/components\/(ExportSurface|PlayoutCompatibility)/, ['exports.spec.ts', 'package.spec.ts', 'offline.spec.ts', 'control.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'template-pack-10.spec.ts', 'design-rules-product.spec.ts']],
  [/^src\/components\/auth\//, ['auth.spec.ts', 'sync.spec.ts']],
  // TEAMS (docs/TEAMS_PLAN.md §7). The offline claim - a build with no backend grows ZERO team
  // UI - is pinned in auth.spec.ts, and the door hangs off the two PRODUCTION surfaces, whose
  // own rule (`src/components/(home|save)/` above) does not name that spec. Rules union, so this
  // adds it rather than replacing what those files already select. `src/backend/teams.ts` needs
  // no row: the `src/backend/` rule already reaches auth.spec.ts.
  [/^(src\/components\/teams\/|src\/components\/home\/(ProductionPage|sections\/ProductionsSection)\.tsx$)/, ['auth.spec.ts']],
  // AGENT ACCESS (docs/AGENT_SAVE.md): the consent query route, the Settings key list, the
  // browser client and the two /api/me routes it calls. The offline spec pins the no-backend
  // posture; the live half is e2e/configured/agent-access.spec.ts (CONFIGURED_TRIGGERS).
  [/^(src\/backend\/agentAccess|src\/components\/auth\/AgentAccessConsent|src\/components\/SettingsDialog|api\/_lib\/me\/(agentKeys|graphics|graphicShape)|api\/_lib\/(principal|agentAccessStore)|src\/entitlements\/permissions)/, ['agent-access.spec.ts']],
  [/^src\/backend\//, ['auth.spec.ts', 'sync.spec.ts', 'offline.spec.ts', 'network-resilience.spec.ts']],
  // Restricted-network resilience (docs/GOALS.md "the SVG road"): the boot watchdog and the
  // inline connection check live in app.html, the hydration timeout in the durable store, and
  // the app-level notice in its own component - a change to any of them must run the spec
  // that boots with the network or the storage broken. src/model and src/main are CORE, so
  // for them this line documents the pairing; for app.html (otherwise unmapped, so it
  // escalated by accident) and the notice component it IS the mapping. flows rides along on
  // app.html because that file frames every /app load.
  // durableStore also owns CROSS-TAB safety: its mirror is per-tab and every model mutator is a
  // read-modify-WHOLE-RECORD write, so a change here can silently reintroduce one tab eating
  // another tab's work (docs/INTERACTIVE_PLAYOUT_PLAN.md, and cross-tab.spec.ts's own header).
  [/^(app\.html|src\/model\/durableStore\.ts|src\/main\.tsx|src\/components\/StorageHealthNotice\.tsx)$/, ['network-resilience.spec.ts', 'cross-tab.spec.ts']],
  [/^app\.html$/, ['flows.spec.ts']],
  [/^src\/community\//, ['community.spec.ts']],
  [/^src\/showchat\//, ['community.spec.ts']],
  [/^src\/landing\//, ['landing.spec.ts']],
  [/^index\.html$/, ['landing.spec.ts']],
  // The public docs home (docs.html + src/docs/, docs/AGENT_CLI.md's landing half).
  // public/docs/ holds the screenshots docs.html embeds, and docs.spec.ts asserts they load;
  // left unmapped, one regenerated picture escalated to the full suite plus the catalog gate
  // (measured 2026-08-30). The landing spec rides along on the entry because the two pages
  // cross-link: a docs section renamed out from under the landing's anchors is exactly the
  // break neither page sees alone.
  [/^(docs\.html$|public\/docs\/)/, ['docs.spec.ts', 'landing.spec.ts']],
  [/^src\/docs\//, ['docs.spec.ts']],
  [/^src\/teach\//, ['lazy-editor.spec.ts']],
  // import-graphic rides along because assets/eraseRegion.ts is not only an assets helper: it is
  // the deterministic flat-fill erase behind the Import Graphic Prepare step. Without this edge,
  // editing the file the behaviour lives in runs the assets specs and never the one that would
  // catch a break, leaving it to the nightly. (`pro.spec.ts` was here too while the Pro
  // compiler's baked-text removal and ring matte used the same helper; that engine was deleted
  // on 2026-08-15 and the Import Graphic step is the only caller left.)
  // eraseRegion.ts also owns the SCAN that draws the Prepare step's opening box, and
  // suggestFields.ts the Text step's auto-placement, so the four Import Graphic specs ride
  // along here for the same reason they now ride along on the wizard directory.
  [/^src\/assets\//, ['assets.spec.ts', 'images.spec.ts', 'bench.spec.ts', 'asset-workflow.spec.ts', 'import-graphic.spec.ts', 'import-prepare.spec.ts', 'import-canvas.spec.ts', 'import-stretch.spec.ts', 'import-analysis.spec.ts', 'import-svg.spec.ts', 'import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts', 'student-rehearsal.spec.ts']],
  [/^src\/admin\//, ['admin.spec.ts']],
  [/^admin\.html$/, ['admin.spec.ts']],
  [/^api\/admin\//, ['admin.spec.ts']],
  [/^api\/_lib\/admin/, ['admin.spec.ts']],
  [/^scripts\/adminDevPlugin/, ['admin.spec.ts']],
  [/^api\/me\//, ['admin.spec.ts', 'render.spec.ts', 'feedback.spec.ts']],
  [/^scripts\/meDevPlugin/, ['admin.spec.ts', 'feedback.spec.ts']],
  // The feedback flow. Its OFFLINE contract is that no surface renders at all, which is the
  // half this suite can check; the interactive half is e2e/configured/feedback.spec.ts and
  // needs a configured backend. src/components/AppShell is already in CORE, so the topbar
  // button's own file does not need naming here - but the contract and the client do.
  [/^src\/feedback\//, ['feedback.spec.ts', 'ai.spec.ts']],
  [/^src\/components\/feedback\//, ['feedback.spec.ts', 'ai.spec.ts']],
  [/^src\/backend\/feedback/, ['feedback.spec.ts']],
  [/^api\/_lib\/feedbackStore/, ['feedback.spec.ts']],
  // The caller's own entitlement drives format greying, the template browser and the gallery.
  [/^src\/backend\/myEntitlement/, ['admin.spec.ts', 'render.spec.ts', 'wizard-filters.spec.ts', 'community.spec.ts']],
  [/^src\/components\/useMyEntitlement/, ['admin.spec.ts', 'render.spec.ts', 'wizard-filters.spec.ts']],
  // The entitlement contract is what the render and AI paths gate on, so a change there can
  // move behaviour in either - and in the admin surface that explains it.
  [/^src\/entitlements\//, ['admin.spec.ts', 'render.spec.ts', 'ai.spec.ts']],
  // These files are assertions over catalog output, not shared application foundations.
  // Refreshing them should verify the catalog baseline without expanding to every UI flow.
  [/^e2e\/catalog(?:-render)?-baseline\.json$/, ['catalog-baseline.spec.ts']],
  // The EXPORTER CORPUS (e2e/fixtures/svg-corpus/README.md): artwork and expectation sidecars,
  // not application code, so they verify the spec that walks them and nothing else. Adding a
  // fixture is how a new real-world export shape enters the road, and it has to run something.
  // TWO SPECS, not one. The corpus spec sweeps every file; import-svg-behaviour ALSO walks three
  // of them by name - the vote band since 2026-08-30, the four-team scoreboard since 2026-09-04
  // and the question timer since 2026-09-05 - because a behaviour needs artwork carrying real
  // exporter idioms and none of the three is offered as a shipped sample. That second load was
  // invisible to this plan until the scoreboard arrived: editing the vote band would have re-run
  // the sweep and not the walk that drives it.
  [/^e2e\/fixtures\/svg-corpus\//, ['import-svg-corpus.spec.ts', 'import-svg-behaviour.spec.ts']],
  // The SHOW corpus (e2e/fixtures/svg-shows/README.md): the game-show and late-night graphics the
  // behaviour spec walks through the wizard and the operator's controls.
  [/^e2e\/fixtures\/svg-shows\//, ['import-svg-behaviour.spec.ts']],
  // THE PRACTICE LIBRARY (docs/svg-samples/) is documentation by location and a FIXTURE SET by
  // use: `e2e/_svg-import.ts` loads scorebug.svg and quiz-board.svg out of it, and
  // import-svg.spec.ts loads illustrator-export.svg. The blanket `^docs/` ignore below has a
  // carve-out for this folder so those loads are not invisible to the plan. Measured 2026-08-30:
  // the branch that grew the library from 5 files to 23 got a green CI run with every E2E shard
  // SKIPPED, because the plan saw only ignored `docs/` paths - a green gate over zero specs.
  // The rule covers the WHOLE folder, not just `*.svg`, so it agrees with that carve-out: a
  // path the ignore admits and no rule maps is `unmapped`, which escalates to the full suite.
  // Adding a preview image here would otherwise run 100+ specs to prove nothing.
  [/^docs\/svg-samples\//, ['import-svg.spec.ts', 'import-svg-behaviour.spec.ts', 'motion-presets.spec.ts']],
  // CASPARCG CONNECT (docs/CASPARCG_CONNECT.md). The browser half is one file, and the two
  // surfaces it grows are already mapped elsewhere for their own reasons - SettingsDialog to
  // analytics/auth, ProductionPage into the productions set - so those rules are UNION'd with
  // this one rather than replaced. Without this row a change to the link contract would run
  // specs that pin the panels' other contents and never the four diagnosis states, which are
  // the whole point of the feature.
  [/^src\/control\/casparLink\.ts$/, ['caspar-connect.spec.ts']],
  [/^src\/components\/SettingsDialog\.tsx$/, ['caspar-connect.spec.ts']],
  // ProductionLinks.tsx is where CasparAirRow itself lives since the 2026-08-28 split, so it is
  // named here rather than left to the components/home rule above: that rule's set does not
  // include this spec, and the ONE button is the whole browser half of the feature.
  [/^src\/components\/home\/(ProductionPage|ProductionLinks)\.tsx$/, ['caspar-connect.spec.ts']],
  // THE WIZARD DOOR (components/NewGraphicButton.tsx) is mounted by five shells at once, so a
  // change to it moves the same control on Home, the editor, the control page, the production
  // dashboard and the video shell. AppShell and styles.css are already CORE, so this row is not
  // what makes such a change verified - it records which specs OWN the door, so a later refactor
  // touching only this file still runs them instead of falling through to the unmapped
  // escalation and reading as covered by everything in general.
  [
    /^src\/components\/NewGraphicButton\.tsx$/,
    ['project.spec.ts', 'library.spec.ts', 'control.spec.ts', 'productions.spec.ts', 'wizard-kit.spec.ts'],
  ],
  // The door's ORDER beside Home and the wizard's own mount (guarded start-over, guard over
  // the wizard) are pinned in project.spec.ts - so the two shells whose headers it measures,
  // and the save dialogs whose z-order it clicks through, select it too. AppShell and App.tsx
  // are CORE already; VideoAppShell and SaveDialogs are not.
  [/^src\/components\/video\/VideoAppShell\.tsx$/, ['project.spec.ts']],
  [/^src\/components\/save\/SaveDialogs\.tsx$/, ['project.spec.ts']],
];

// Anything matching these runs the FULL suite - shared foundations with fan-out everywhere.
const CORE = [
  /^src\/store\//,
  /^src\/model\//,
  /^src\/preview\//,
  /^src\/validation\//,
  /^src\/components\/(AppShell|PreviewFrame|WorkspaceDock|CodeEditor|App\.)/,
  /^src\/(App|main)\./,
  // The hash router. Every surface in /app is reached through it and browser Back/Forward are
  // part of what it promises, so a route-shape change fans out to every flow that navigates -
  // which is all of them. It reached the full suite anyway, as the unmapped fallback; naming it
  // here records that the escalation is DELIBERATE rather than a file nobody got round to.
  /^src\/app\/router\./,
  /^src\/styles/,
  // The bundled GSAP build is a shared foundation that happens to live under src/assets/, and
  // the `src/assets/` MAP entry below is written for asset HELPERS (eraseRegion, assetInfo,
  // lottieSupport) - so without this line an upgrade of the animation engine ran the assets
  // and Pro specs and never anim-engine.spec.ts. Measured on the 3.10.4 -> 3.15.0 upgrade: 57
  // specs, none of them the one that pins editor-vs-runtime motion parity. Every preview and
  // every export inlines this file verbatim (imported `?raw`, so Vite never even transpiles
  // it), which is the definition of fan-out. Matching CORE as well as MAP is harmless - the
  // full suite is a superset - and it fails toward running MORE, the direction this script
  // says its safety comes from.
  /^src\/assets\/gsap\.min\.js$/,
  /^e2e\/_/,
  // The suite's own machinery, which lives under scripts/ but is imported by the Playwright
  // configs and by the offline globalSetup: the port every spec connects to, the worker count,
  // and the cross-checkout queue that runs before any test does. Naming them here rather than
  // leaving them to the unmapped fallback records WHY they escalate - they are foundations, not
  // files nobody got round to mapping. Their exception in IGNORE above is what lets them reach
  // this list at all.
  /^scripts\/(dev-port|port-registry|e2e-runs|e2e-workers)\.mjs$/,
  /^playwright\.config\.ts$/,
  /^(package|package-lock)\.json$/,
  /^vite\.config/,
  // The template contract: TemplateVariant, WizardOptions, the palettes and the resolvers that
  // every catalog design and every wizard surface reads. It lived in src/model (CORE) until
  // domain row 1 moved it here, and moving a file does not narrow what depends on it - 617
  // template files and the whole wizard do. The files AROUND it keep their subset; this one
  // path escalates, which is what CORE is for (docs/WORKFLOW_ARCHITECTURE.md §5.5, row 1).
  /^src\/templates\/contract\.ts$/,
  /^app\.html$/,
];

// Files that never affect the offline e2e surface.
//
// `.gitignore` is here because it is VCS metadata: nothing imports it, nothing serves it, and
// no spec can observe it. Left unmapped it escalated a branch to the FULL suite on its own -
// measured on the 2026-07-31 merge of claude/ai-benchmark-harness-routing, where it was the
// only unmapped file and cost a 619-spec run plus the catalog gate to prove nothing.
//
// `benchmarks/corpus-eval/` is the visual eval set's CURATION (docs/SPX_EXAMPLES_CORPUS.md
// workstream 4): pairings and written observations, read only by scripts/spx-eval-set.mjs,
// which is local-only and already ignored above. It ships no code and no spec loads it -
// unlike benchmarks/creative/, whose brief bank creative-routing.spec.ts really does read.
//
// `scripts/` is ignored WHOLESALE on the premise that it is local tooling the app never loads,
// which makes the exception list load-bearing: anything under it that the SUITE ITSELF imports
// must be named here, or a change to it runs no spec at all. The Playwright configs and the
// offline globalSetup import dev-port (hence port-registry, which it imports in turn) for the
// port, e2e-workers for the worker count, and e2e-runs for the cross-checkout queue. A fault in
// any of those does not break one flow - it breaks every spec in the suite, which is the exact
// profile of a file that must escalate. Measured the hard way on 2026-08-06: a commit rewriting
// e2e-runs' checkout attribution, which globalSetup calls before a single test starts, produced
// plan `mode: none` and a green gate that had run zero specs.
//
// Add to the IGNORE list only for a file that genuinely cannot change what a spec sees. The
// script's safety comes from failing TOWARD running more (an unmapped path escalates), so a
// wrong entry here silently runs FEWER specs - the one failure mode with no alarm attached.
// `e2e-affected` and `e2e-lists` are here for a different reason than the rest: they cannot
// break a spec, they decide WHICH specs run. Left ignored, the one change guaranteed to go
// unverified is a change to the thing that chooses the verification - a mistake in this file
// reports `mode: none`, the gate goes green, and nothing ran. Covering them costs one focus run.
// `.github/` is CI configuration. No spec can observe it: Playwright drives a local dev server
// and never reads a workflow file, so running one spec - let alone all 103 - proves exactly
// nothing about a change to it. Its real gate is `scripts/check-workflows.mjs`, which validates
// every workflow against the GitHub Actions schema and runs FIRST in `npm run build`.
//
// The one entry that looks like an exception is not one. `ci.yml` sets `E2E_SPRINT_FOCUS=1`, so
// it decides WHICH specs run - the same category as `e2e-affected`/`e2e-lists`, which are
// deliberately NOT ignored above. The difference is that escalating cannot catch the fault:
// running the full suite locally tells you nothing about whether a workflow's env block is
// right. Nothing is given up by ignoring it, because nothing was being gained. Measured
// 2026-08-07: `nightly.yml` was the unmapped file that turned a two-line gate addition into a
// 759-spec run.
const SUITE_CRITICAL_SCRIPTS =
  'renderDevPlugin|aiDevPlugin|dataDevPlugin|apiRouteTable|build-player-host|dev-port|port-registry|e2e-runs|e2e-workers|e2e-affected|e2e-lists';
// `.env.example` is a template a human copies; nothing loads it. Vite and the dev-server middleware
// read `.env`, and a spec drives a dev server that has never opened the example - so escalating on
// it ran 53 specs to prove nothing. It already has a real gate in `npm run build`:
// `scripts/ai-lite-bench.test.mjs` fails if it ships a concrete AI_LITE_PROMPT_VERSION, which is the
// one way this file has ever changed a deployment's behaviour.
//
// `.claude/`, `.codex/`, `.agents/` and `.agent-workflows/` are the AGENT HARNESS, and they are
// here for exactly the reason `.github/` is: no spec can observe them. Playwright drives a local
// dev server; it never reads a settings file, a skill adapter or a hook. Five tracked files
// across all four directories are not markdown (`.claude/settings.json`, `.codex/config.toml`,
// `.codex/environments/environment.toml`, two `agents/openai.yaml` adapters), and all five
// configure the tools a session runs, not the product a spec drives. Measured over the 119
// first-parent commits on `main` to 2026-09-04: eight of them escalated on nothing but
// `.claude/settings.json` or `.codex/config.toml`, each running the 55-spec focus set to prove
// something no spec can see. `.claude-plugin/` is NOT covered by this - it is the published
// plugin manifest and has its own MAP rule.
//
// `scripts/*.test.mjs` is here because a test cannot change the thing it tests. The suite-critical
// exception above matches on a NAME, so `scripts/e2e-affected.test.mjs` was pulled back out of
// the wholesale `scripts/` ignore and escalated, which was an accident of the regex rather than a
// decision anybody took. These files have a real gate that runs on every change: the
// `node --test` block in `npm run build`, which names each of them.
const IGNORE = [/^docs\/(?!svg-samples\/)/, /\.md$/, /^scripts\/[^/]*\.test\.mjs$/, new RegExp(`^scripts/(?!.*(${SUITE_CRITICAL_SCRIPTS}))`), /^e2e\/configured\//, /^render-worker\//, /^supabase\//, /^NoaCG-Brand-Kit\//, /^example_projects\//, /^benchmarks\/corpus-eval\//, /^\.dependency-cruiser\.cjs$/, /^\.gitignore$/, /^\.github\//, /^\.(claude|codex|agents|agent-workflows)\//, /^\.env\.example$/];

// Anything matching these also needs the catalog-wide gate (npm run test:e2e:catalog -
// e2e/catalog/catalog-bench.spec.ts, excluded from the default suite above). Same reasoning as
// type-floor.mjs/overflow-sweep.mjs: it only needs to run when the catalog itself, or the
// runtime bench it's calibrated against, could have changed.
// `src/model/fonts.ts` is here because a font change is a catalog-wide LOOK change: the
// registry decides every design's default face, and `tabularFigures` decides what its live
// numbers are set in (scripts/numerals.mjs). Editing it without the calibration gate is how a
// width budget silently moves under 430 designs at once.
const CATALOG_TRIGGERS = [
  // The gate's own config. It is the one file that can change what the tripwire MEASURES -
  // its worker count, its timeouts, its offline pinning - while touching no catalog source at
  // all, so no other rule here would ever raise it. Left unmapped it escalates to `full`
  // instead, and under sprint focus a `full` escalation deliberately drops the catalog
  // coupling: the change to the catalog gate would be the one change that never runs it.
  /^playwright\.catalog\.config\.ts$/,
  // The gate's own SPECS, for the same reason one line up and with the same failure if omitted:
  // they live outside the default suite, so no other rule here mentions them, and an unmapped
  // change escalates to `full` - which under sprint focus drops the catalog coupling, making a
  // change to a catalog spec the one change that never runs that spec. Editing the rule and never
  // executing it is how a gate quietly stops measuring what it claims to.
  /^e2e\/catalog\//,
  /^src\/templates\//,
  /^src\/blocks\//,
  /^src\/assets\//,
  /^src\/model\/fonts\.ts$/,
  /^src\/model\/themeTokens\.ts$/,
  /^src\/validation\/runtimeBench\.ts$/,
  // The modules the bench MEASURES THROUGH, for the same reason as the line above: the catalog
  // gate is what says a bench rule does not fire on the house's own 502 designs, and a rule
  // whose measurement lives in its own file would otherwise be edited without ever running that
  // gate. `occlusion.ts` is the first of those; anything the bench comes to import for a
  // catalog-visible finding belongs here beside it.
  /^src\/validation\/occlusion\.ts$/,
];

/**
 * THE CLASSIFICATION, as a pure function of a changed-file list.
 *
 * Split out from the CLI so it can be tested without a git repository and a real diff. That is
 * not tidiness: this function decides how much of the suite runs, and its worst failure - saying
 * "nothing to run" when something should have - is silent by construction. It shipped exactly
 * that on 2026-08-06 (a change to files the Playwright configs import, hidden by the blanket
 * `scripts/` exemption) and the gate went green having executed zero specs. A pure function is
 * one that can be pinned with a list of realistic merges and an expected size for each.
 *
 * @param {string[]} changed        repo-relative paths, forward slashes
 * @param {{ sprintFocus?: boolean }} [opts]
 * @returns {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean,
 *             unmapped: string[], focusApplied: boolean }}
 */
export function planFor(changed, { sprintFocus = false } = {}) {
  const specs = new Set();
  let full = false;
  let catalog = false;
  let configured = false;
  const unmapped = [];

  for (const file of changed) {
    // Asked BEFORE the ignore list, deliberately: `e2e/configured/**` is ignored for the
    // offline plan (those specs cannot run here), and that is precisely the file set whose
    // change most needs the configured suite named.
    if (CONFIGURED_TRIGGERS.some((r) => r.test(file))) configured = true;
    if (IGNORE.some((r) => r.test(file))) continue;
    if (CATALOG_TRIGGERS.some((r) => r.test(file))) catalog = true;
    if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
      specs.add(file.replace(/^e2e\//, ''));
      continue;
    }
    if (CORE.some((r) => r.test(file))) {
      full = true;
      continue;
    }
    const rules = MAP.filter(([r]) => r.test(file));
    if (rules.length === 0) {
      unmapped.push(file); // Unknown territory: be safe, run everything, and say why.
      full = true;
    } else {
      for (const [, list] of rules) for (const s of list) specs.add(s);
    }
  }

  // Under sprint focus, the escalation that would have run everything runs the focus set
  // (union with whatever the mapped rules already named). The full->catalog coupling below is
  // deliberately skipped for an intercepted run: a styles.css tweak stops paying the 25-minute
  // catalog gate, while a direct CATALOG_TRIGGERS match above still raises the flag.
  let focusApplied = false;
  if (full && sprintFocus) {
    full = false;
    focusApplied = true;
    for (const s of FOCUS) specs.add(s);
  }
  // A core/unmapped change gets the same conservative default the offline suite gets: assume it
  // could touch the catalog too, rather than trusting CATALOG_TRIGGERS to have named every path.
  if (full) catalog = true;

  const list = full ? [] : [...specs].sort();
  // `configured` never changes `mode`: the configured suite is opt-in, needs secrets, and is
  // reported rather than run (scripts/e2e-lists.mjs). A change that touches ONLY its territory
  // still reports 'none' for this gate, and the printed line is what says otherwise.
  const mode = full ? 'full' : list.length === 0 && !catalog ? 'none' : 'subset';
  return { mode, specs: list, catalog, configured, unmapped, focusApplied };
}

/**
 * How much runner time one shard should be worth, in minutes of measured test execution.
 *
 * SET FROM THE FIXED COST OF ADDING A SHARD, which is about a minute when nothing is wrong: 0.3
 * of job setup (checkout 0.08, setup-node 0.03, a cached install 0.13, the browser cache 0.08)
 * and about 0.7 inside the step for Playwright's own start and the dev-server boot. Measured on
 * run 32301623379: three shards, 22.0 table-minutes, 7.8-9.7 min per job - which the model
 * `minutes / n + 1.0` predicts to within a few seconds, and which the nine-shard full runs
 * beside it match too.
 *
 * "WHEN NOTHING IS WRONG" IS NOT AN ASSUMPTION ANY MORE, and it should never have been one. That
 * 0.3 was a reading from a good day: over the 90 shard jobs of the ten runs to 2026-09-04 08:43
 * the install alone averaged 6.4 minutes and reached 10.2 at the p90, which is what actually
 * killed the two shards this file's packer was meant to save. `budgetMinutes`
 * (scripts/e2e-durations.mjs) now carries the MEASURED per-job cost, `shardsFor` sizes against
 * the job cap as well as against this target, and a plan that cannot fit says so instead of
 * discovering it one cancelled shard at a time.
 *
 * At three minutes a shard the setup is ~25% overhead, and below that an extra runner stops
 * paying. It is deliberately much lower than it could have been before 2026-08-19: until the
 * apt call in `.github/actions/playwright-chromium` was tied to the browser cache miss, adding a
 * shard cost 3.5 minutes of setup rather than one, and the old workflow comment's "beyond four,
 * the 52 s of per-shard setup costs more than it saves" was understating its own case. Making a
 * shard cheap is what makes sharding finely correct.
 *
 * The FULL plan is 99.7 measured minutes (2026-09-04, run 33825716179), so this target would ask
 * for 34 shards and the cap below is what holds it at the nine ci.yml has run since 2026-08-08.
 * Nine is not tight: 99.7 minutes over nine runners is 11.1 each against a 20-minute job cap, so
 * the suite uses a little over half its budget. What made runs die at that cap was never the
 * total, it was the SPLIT - see `packShards`.
 */
export const SHARD_TARGET_MINUTES = 3;

/**
 * The ceiling, for the reasons ci.yml's `strategy` comment gives: every shard is an independent
 * runner, so the chance one of them hits an infrastructure hiccup grows with the count, and the
 * account's 20-concurrent-job limit is a real constraint here - runs starting while two other
 * branches were mid-gate waited 22 to 45 minutes for a runner over the 60 runs to 2026-08-19.
 */
export const MAX_SHARDS = 9;

/**
 * HOW MANY RUNNERS THIS PLAN IS WORTH, from measured minutes rather than from a file count.
 *
 * The old rule was `full ? 9 : min(4, floor(files / 4))`, and the cap was the expensive half:
 * under sprint focus and the curated map, a "subset" is routinely 70-100 of the 128 spec files,
 * so 80% of the suite ran on 44% of the runners and a targeted run finished LATER than the full
 * one. Measured on run 32174589727: 103 specs, 58.3 min of tests, 4 shards, 14.6 min each -
 * against 7.4 min a shard on the full run beside it.
 *
 * A spec the table has never measured counts as the MEDIAN rather than as zero: a new spec file
 * must be able to raise the shard count, and zero would let a plan made entirely of new specs
 * ask for one runner. This function still decides only the runner COUNT and never which tests
 * run, so a wrong number here cannot cost coverage - but since `packShards` began spending the
 * same durations on balance, the accuracy matters more than it did, and `emitJson` names every
 * spec it had to guess at rather than guessing quietly.
 *
 * TWO REASONS TO ASK FOR A RUNNER, and the bigger one wins. The target above is an EFFICIENCY
 * question - below three minutes an extra runner stops paying for itself. `budgetMinutes` is a
 * DEADLINE question - how much a shard can carry and still come in under ci.yml's 20-minute cap,
 * given the measured per-job overhead. The target has always asked for more runners than the cap
 * needs, so on a healthy day this second term changes nothing; it earns its place on an unhealthy
 * one, where it is what makes `emitJson` able to say the plan does not fit instead of finding out
 * from a cancelled shard.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[] }} plan
 * @param {{ minutes: Record<string, number> }} [table]
 * @returns {number} shard count, at least 1
 */
export function shardsFor({ mode, specs }, table = readTable(), suite = specFilesOnDisk()) {
  if (mode === 'none') return 1;
  const minutes = planMinutes({ mode, specs }, table, suite);
  const forThroughput = Math.ceil(minutes / SHARD_TARGET_MINUTES);
  const forCap = Math.ceil(minutes / budgetMinutes(table));
  return Math.min(MAX_SHARDS, Math.max(1, forThroughput, forCap));
}

/**
 * The measured minutes a plan is worth, over THE FILES IT WILL ACTUALLY RUN.
 *
 * A full plan's file list is the e2e DIRECTORY, not `specs` (which a full plan deliberately
 * leaves empty) and not the table's keys. Summing the table's keys instead - which is what this
 * did until the review of 2026-09-04 - gets both ends wrong in the same direction the sizing
 * cannot afford: a spec on disk that the table has never measured contributes ZERO rather than
 * the median, so a stale table under-asks for runners exactly when the cap term exists to catch
 * it, and an entry left behind by a deleted spec is counted for work nobody will do. `packShards`
 * and the prediction beside it already enumerate from the directory, so this is also what makes
 * the two agree about the same plan.
 */
export function planMinutes({ mode, specs }, table = readTable(), suite = specFilesOnDisk()) {
  return minutesFor(mode === 'full' ? suite : specs, table);
}

/**
 * WHAT ONE SPEC IS WORTH, as a function bound to a table.
 *
 * The one place the "unmeasured counts as the median" rule lives. Sizing, packing and the
 * wall-clock prediction all need it and all used to carry their own copy, which is how two of
 * them can come to disagree about the same plan.
 */
function weigher(table) {
  const median = medianOf(Object.values(table.minutes));
  return (spec) => table.minutes[spec] ?? median;
}

/** What a list of spec files is worth, in measured minutes. */
function minutesFor(files, table) {
  const weight = weigher(table);
  return files.reduce((sum, spec) => sum + weight(spec), 0);
}

/** The middle measured duration - what an unmeasured spec is worth to both sizing and packing. */
function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/**
 * ONE SPEC FILE, as a Playwright positional filter that matches THAT FILE AND NO OTHER.
 *
 * Playwright's positional arguments are REGULAR EXPRESSIONS matched against the whole test-file
 * path, not file names, so a bare `control.spec.ts` also selects `ai-more-control.spec.ts` and
 * `hosted-control.spec.ts`. Five such collisions exist in `e2e/` today (`control`, `format`,
 * `import`, `project`, and the pairs above), and under the old `--shard=i/n` split they cost
 * nothing: the filter was the whole plan and Playwright divided the union, so a file pulled in
 * twice was still run once. Handing each runner its OWN file list removes that protection - the
 * same spec would land on two shards, run twice, and unbalance both.
 *
 * The leading separator class is what anchors it, and it has to be a class rather than `/`
 * because the path is built by the OS: `C:\...\e2e\control.spec.ts` on a developer's machine,
 * `/home/runner/.../e2e/control.spec.ts` on the runner. Verified both directions against
 * `playwright test --list`.
 */
export function specFilterArg(spec) {
  return `[\\\\/]${String(spec).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

/**
 * WHICH SPEC FILES EACH RUNNER GETS, bin-packed by measured duration.
 *
 * WHY THIS REPLACED `--shard=i/n`. Playwright shards by test COUNT, so the spread inside a shard
 * set is whatever the split happens to give. Measured over the 30 ci.yml runs on `main` from
 * 2026-09-02 23:06 to 2026-09-04 02:23, per-shard mean wall clock on the 26 green runs was:
 *
 *   shard 1  8.8 min      shard 4  12.5     shard 7  13.0
 *   shard 2 14.6 min      shard 5  11.0     shard 8  12.3
 *   shard 3 10.1 min      shard 6  11.1     shard 9  12.4
 *
 * A 1.66x spread with nothing wrong: shard 2 sat at 14.6 against the job's 20-minute cap while
 * shard 1 idled at 8.8. Ordinary runner variance on top of that is what tipped 4 of those 30 runs
 * over the cap - and a shard killed by its own `timeout-minutes` is recorded by GitHub as
 * `cancelled`, which makes the whole RUN cancelled and poisons every instrument downstream
 * (docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md). Longest-processing-time-first
 * packing pulls every shard to within a few percent of the balanced 11.1 min, which turns shard
 * 2's 2.6 minutes of headroom into about eight.
 *
 * WHAT MAKES IT SAFE, and it is the objection ci.yml raised for three weeks: an explicit per-shard
 * file list means a spec missing from the assignment is a spec nobody runs, where a missing
 * DURATION used to cost only wall clock. So the packer takes the suite from `allSpecs` (the
 * DIRECTORY, via `specFilesOnDisk`) and the table supplies weights only; an unmeasured spec is
 * packed at the median, never dropped. The union of the returned bins is then asserted to be
 * exactly the input, and a mismatch THROWS - failing the plan job loudly rather than quietly
 * testing less than it claims.
 *
 * Bins are returned non-empty and at most `shardCount` of them: an empty list handed to Playwright
 * is not "no tests", it is EVERY test, so a shard with nothing to do must not exist at all.
 *
 * @param {string[]} specs the files to divide - the whole suite for mode 'full'
 * @param {number} shardCount the ceiling from `shardsFor`
 * @param {{ minutes: Record<string, number> }} [table]
 * @returns {string[][]} one sorted file list per runner, heaviest bin first
 */
export function packShards(specs, shardCount, table = readTable()) {
  const files = [...new Set(specs)];
  const bins = Math.max(1, Math.min(Math.floor(shardCount), files.length));
  if (files.length === 0) return [];

  const weight = weigher(table);

  // Longest-processing-time-first: heaviest spec onto the lightest bin. A 4/3-approximation in
  // the worst case and far better than that here, where no single spec is a large fraction of a
  // bin - the slowest file in the table is 3.3 min against an 11.1-min bin.
  const packed = Array.from({ length: bins }, () => ({ total: 0, files: [] }));
  const order = [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  for (const spec of order) {
    let lightest = packed[0];
    for (const bin of packed) if (bin.total < lightest.total) lightest = bin;
    lightest.files.push(spec);
    lightest.total += weight(spec);
  }

  const result = packed
    .sort((a, b) => b.total - a.total)
    .map((bin) => bin.files.sort());

  // THE COVERAGE ASSERTION. Everything above is arithmetic that decides what gets tested, so it
  // states its result rather than trusting it. Cheap, total, and the only thing standing between
  // a packing bug and a gate that silently runs less than the whole plan. The length check is not
  // redundant with the membership one: it is what catches a spec assigned TWICE.
  const assigned = result.flat();
  const seen = new Set(assigned);
  const missing = files.filter((f) => !seen.has(f));
  if (missing.length > 0 || assigned.length !== files.length) {
    throw new Error(
      'packShards did not assign every spec exactly once - refusing to plan a run that tests less than it claims. ' +
        `Got ${assigned.length} assignment(s) for ${files.length} file(s)` +
        (missing.length ? `; never assigned: ${missing.join(', ')}` : ''),
    );
  }
  return result;
}

/**
 * THE RUN LIST, as a pure function of a plan. One entry per Playwright invocation this command
 * is responsible for: the mapped/full suite, and the catalog calibration tripwire, which is a
 * SEPARATE config and therefore a separate process.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @returns {{ name: string, args: string[] }[]}
 */
export function runsFor({ mode, specs, catalog }) {
  const runs = [];
  // An empty spec list handed to Playwright is not "no tests", it is EVERY test - which is why
  // `full` names the suite with no arguments and `subset` only ever runs with a non-empty list.
  if (mode === 'full' || specs.length > 0) {
    runs.push({ name: 'suite', args: ['playwright', 'test', ...specs] });
  }
  if (catalog) {
    runs.push({ name: 'catalog gate', args: ['playwright', 'test', '--config=playwright.catalog.config.ts'] });
  }
  return runs;
}

/**
 * Run everything the plan named and report the FIRST FAILURE's status, never the last run's.
 *
 * This command can spawn two Playwright processes, and the catalog gate is the one that usually
 * goes second. Returning only its status would mean a failing suite followed by a passing gate
 * exits 0 - a green light over a red run, on the command that IS the per-merge gate
 * (docs/DEPLOYMENT.md). Both runs still execute on a failure: the gate's verdict is information
 * worth having even once the suite has gone red, and skipping it would turn one red run into two
 * round trips.
 *
 * `runOne` is injected so this is testable without spawning Playwright - the point being that a
 * defect here is silent by construction, exactly like `planFor`'s.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @param {(run: { name: string, args: string[] }) => number|null|undefined} runOne
 * @returns {{ status: number, runs: { name: string, args: string[], status: number }[] }}
 */
export function runPlan(plan, runOne) {
  const runs = [];
  let status = 0;
  for (const run of runsFor(plan)) {
    // A spawn that was killed by a signal, or never started, reports a null status. That is a
    // failure, not a pass - the one case where "no exit code" must not read as zero.
    const code = runOne(run) ?? 1;
    runs.push({ ...run, status: code });
    if (code !== 0 && status === 0) status = code;
  }
  return { status, runs };
}

/** The one-line verdict, naming each run - so a red overall status says WHICH run went red. */
export function summariseRuns(runs, status) {
  const parts = runs.map((r) => `${r.name} ${r.status === 0 ? 'passed' : `FAILED (exit ${r.status})`}`);
  return `e2e-affected: ${parts.join('; ')}. Overall: ${status === 0 ? 'passed' : `FAILED (exit ${status})`}.`;
}

/**
 * `git`, in a named repository. `undefined` keeps the process's own directory, which is what this
 * file's own CLI wants; `catalog-affected.mjs` passes its repository root, because it pins every
 * git call there rather than to wherever the process was started.
 */
function gitIn(cwd, ...cmd) {
  return execFileSync('git', cmd, { encoding: 'utf8', ...(cwd ? { cwd } : {}) }).trim();
}

/**
 * THE CHANGED-FILE LIST: everything committed since `base`, plus the working tree.
 *
 * Exported because `scripts/catalog-affected.mjs` asks the same question of the same repository
 * and had a byte-identical copy of this, comment-free - including the porcelain-prefix regex whose
 * reason is the next paragraph. Two copies of "what changed" is two answers waiting to differ.
 *
 * Porcelain lines are `XY path` (a rename is `XY old -> new`); a global `trim()` would eat the
 * first line's leading status space, so the prefix is stripped by pattern, not by position.
 *
 * @param {string} base  a ref; the diff is `base...HEAD`
 * @param {string} [cwd] the repository to ask - a linked worktree passes its own root
 * @returns {string[]} repo-relative paths, forward slashes, deduplicated
 */
export function changedFilesSince(base, cwd = undefined) {
  const opts = { encoding: 'utf8', ...(cwd ? { cwd } : {}) };
  const committed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], opts).trim().split('\n');
  const working = execFileSync('git', ['status', '--porcelain'], opts)
    .split('\n')
    .map((l) => l.replace(/^.{2} /, '').replace(/^.* -> /, '').trim());
  return [...new Set([...committed, ...working])].filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}

/**
 * The main refs this checkout actually has, most local first.
 *
 * A worktree's local `main` is routinely stale here - several are live at once and only one of
 * them pulls - and a CI checkout of a feature branch has NO local `main` at all, because
 * `actions/checkout` creates a branch only for the ref it checked out. Both callers below have to
 * survive each case, so the question is asked once.
 */
function mainRefs(cwd) {
  return ['main', 'origin/main'].filter(
    (ref) =>
      spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore', cwd }).status === 0,
  );
}

/**
 * The ordinary base: where this branch left main. Exported for `catalog-affected.mjs`, which
 * needs the same answer and used to hardcode `main` - unresolvable on a CI checkout.
 *
 * `cwd` for the same reason `changedFilesSince` takes one: catalog-affected pins every git call
 * to the repository root rather than to wherever it was invoked from, and a base resolved in one
 * repository and diffed in another is not a smaller answer, it is a crash.
 */
export function branchBase(cwd = undefined) {
  const ref = mainRefs(cwd)[0];
  if (!ref) throw new Error('neither main nor origin/main exists in this checkout - cannot compute a base');
  return gitIn(cwd, 'merge-base', 'HEAD', ref);
}

/**
 * True when HEAD is a merge commit - which, on a feature branch, means main was just taken in.
 * Module scope and exported for the same reason `integrationBase` is: `catalog-affected.mjs`
 * asks the same question and the two must answer it identically.
 */
export function headIsMainMerge(cwd = undefined) {
  return gitIn(cwd, 'rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/).length > 2;
}

/** True when `maybeAncestor` is contained in `ref`. Exit status, so no output to parse. */
function isAncestor(maybeAncestor, ref, cwd) {
  return spawnSync('git', ['merge-base', '--is-ancestor', maybeAncestor, ref], { stdio: 'ignore', cwd }).status === 0;
}

/**
 * THE INTEGRATION BASE - the fork point, for a branch that has taken `main` in.
 *
 * The default base is `merge-base HEAD main`, which answers "what has this branch changed".
 * After `git merge main` that base IS `main`, so the plan covers only the branch's own files
 * and everything main just brought in is invisible to the gate. That is the wrong question at
 * exactly the moment the right one matters: a clean textual merge says nothing about whether
 * the COMBINED state holds, and the two sides are individually green by construction - each was
 * verified against a tree that no longer exists.
 *
 * So when HEAD has taken main in, diff from where the two sides diverged instead: for the most
 * recent first-parent merge whose SECOND parent came from main, that is `merge-base P1 P2`. The
 * resulting file list is the union of both sides' changes since the fork, which is what "verify
 * the combined state" means in terms this script can classify. It is deliberately
 * over-inclusive - the same direction every other fallback here fails in - and the cost is
 * bounded by sprint focus, which collapses the escalation to the 34-spec set rather than 103.
 *
 * Walking the first-parent chain (rather than only looking at HEAD) keeps this working after
 * follow-up commits: the integration is not verified until it is verified, and adding a commit
 * on top does not make the merge older news. The walk stops at the first merge that is ALREADY
 * contained in main - see the comment on that line; below it there is nothing of this branch's
 * to integrate.
 *
 * Exported because `scripts/catalog-affected.mjs` needs the identical answer and must not grow a
 * second implementation of it: the two planners already share `changedFilesSince`, and a fork
 * point that drifted between them would mean the E2E gate and the catalog gate disagreed about
 * what a post-merge branch had changed.
 *
 * @returns {string|null} the fork point, or null when this branch has merged nothing from main
 */
export function integrationBase(cwd = undefined) {
  // "Came from main" is asked of `origin/main` as well as `main` (see `mainRefs`): a branch that
  // merged `origin/main` directly would otherwise look like it had merged nothing, and the silent
  // answer would be the old, narrower base - the exact failure this exists to prevent.
  const refs = mainRefs(cwd);
  const merges = gitIn(cwd, 'rev-list', '--merges', '--first-parent', '--max-count=50', 'HEAD')
    .split('\n')
    .filter(Boolean);
  for (const merge of merges) {
    // A MERGE THAT IS ALREADY ON MAIN IS NOT THIS BRANCH'S INTEGRATION TO VERIFY. Landing a
    // branch leaves a merge commit on main, so every branch cut from main afterwards inherits it
    // in its first-parent chain - and without this line the walk finds that one, hands back a
    // fork point from somebody else's work, and a six-file branch gets planned as if it had
    // merged half the repository. It was measured doing exactly that on run 32301201748: a
    // six-file push planned 6 shards instead of 3, because this branch was cut from a `main`
    // whose tip happened to be a merge commit. Everything below such a merge is main's own
    // history and was verified when it landed, so stopping here is the whole answer, not a skip.
    if (refs.some((ref) => isAncestor(merge, ref, cwd))) return null;
    const [, p1, p2] = gitIn(cwd, 'rev-list', '--parents', '-n', '1', merge).split(/\s+/);
    // A merge with one parent is an octopus artefact or a grafted history; skip rather than
    // guess. `p2` came from main only if a main ref still contains it.
    if (!p1 || !p2 || !refs.some((ref) => isAncestor(p2, ref, cwd))) continue;
    return gitIn(cwd, 'merge-base', p1, p2);
  }
  return null;
}

/** The plan, as CI consumes it. `mode` covers the specs to run; `catalog` is independent of it,
 *  because a catalog change can need the calibration gate while needing no feature spec.
 *
 *  `shardSpecs` is the ASSIGNMENT - one explicit file list per runner, bin-packed by measured
 *  duration (`packShards`) - and `shards` is simply how many of them there are, so the matrix
 *  size and the assignment cannot disagree. For mode 'full' the suite comes from the directory
 *  rather than from `specs`, which stays `[]` because that is what the rest of the CLI means by
 *  "no filter"; the two are consistent because every runner is now handed its files explicitly. */
function emitJson({ mode, specs, catalog, base, changed }) {
  const onDisk = specFilesOnDisk();
  const suite = mode === 'full' ? onDisk : specs;

  // A SPEC NAME THAT NAMES NOTHING used to be harmless: Playwright took the plan as filters and
  // simply matched nothing extra. Now each name becomes one runner's whole file list, so a ghost
  // left behind by a rename can land alone in a bin and red that shard with "no tests found" -
  // a MAP typo reported as a test failure. `e2e-affected.test.mjs` already documents that a MAP
  // rule pointing at a path that no longer exists is otherwise silent.
  const ghosts = suite.filter((spec) => !onDisk.includes(spec));
  if (ghosts.length > 0) {
    throw new Error(`the plan names ${ghosts.length} spec file(s) that do not exist: ${ghosts.join(', ')} - fix MAP in scripts/e2e-affected.mjs`);
  }

  const table = readTable();
  // The same `suite` goes to the sizing and to the packing, so the runner count and the
  // assignment are answering about one file list rather than two.
  const shardSpecs = mode === 'none' ? [] : packShards(suite, shardsFor({ mode, specs }, table, suite), table);
  const shards = Math.max(1, shardSpecs.length);

  // UNMEASURED SPECS ARE NOW LOUD. They are packed at the median, which was a harmless guess while
  // the table only sized the shard COUNT (capped at 9, so drift changed nothing). Bin-packing
  // spends those weights on balance, and the median is a bad guess for the specs that most need a
  // good one: on 2026-09-04 the table was 15 days stale and the two heaviest files in the whole
  // suite - counting-settle.spec.ts at 4.96 min and import-svg-corpus.spec.ts at 3.36 - were both
  // missing from it, so each would have been packed as 0.51. A bin holding both would have run
  // roughly seven minutes over its planned 11.
  const unmeasured = suite.filter((spec) => table.minutes[spec] === undefined);
  if (unmeasured.length > 0) {
    process.stderr.write(
      `e2e-affected: ${unmeasured.length} spec file(s) have no measured duration and were packed at the median - ` +
        `shard balance is a guess for them. Refresh with \`npm run record:e2e-durations\`.\n` +
        `  ${unmeasured.join('\n  ')}\n`,
    );
  }

  // WHAT EACH SHARD IS PREDICTED TO COST IN WALL CLOCK, and whether that fits the job's cap.
  //
  // The table measures TEST time; a runner also checks out, installs, starts Playwright and
  // boots a dev server. Until 2026-09-04 nothing carried that second term, so the packer aimed
  // nine bins at 11.1 table-minutes each, called it comfortable against a 20-minute cap, and two
  // shards of the first run under it were killed at exactly that cap - each carrying 9.8 measured
  // minutes behind a ten-minute `npm ci`. `predictShardMinutes` applies the measured overhead, so
  // the plan states the number it is betting on rather than implying one.
  //
  // An over-cap plan is a WARNING and not a refusal: a shard that might run out of clock still
  // tests more than a shard that never starts. But it is said out loud, in the plan job's own
  // log and as a run annotation, because the alternative is what the last fortnight was - the
  // gate discovering it one cancelled run at a time, with every downstream instrument reading a
  // verdict that was never reached.
  const predicted = shardSpecs.map((bin) => Number(predictShardMinutes(minutesFor(bin, table), table).toFixed(1)));
  // The line is the cap MINUS the variance margin, not the cap itself. The same shard index
  // varied by 2-3 minutes run to run over the 26 green runs to 2026-09-04 with nothing wrong, so
  // a prediction that only just clears 20 is a shard that fails on an ordinary bad day - and a
  // warning that waits for the average to fail is a warning that arrives after the cancellations.
  const limit = SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES;
  const overCap = predicted.filter((m) => m > limit).length;
  if (overCap > 0) {
    process.stderr.write(
      `e2e-affected: ${overCap} of ${predicted.length} shard(s) are predicted at more than ${limit} min ` +
        `(worst ${Math.max(...predicted)}), which leaves less than the ${SHARD_SAFETY_MINUTES}-minute variance margin ` +
        `under the ${SHARD_CAP_MINUTES}-minute job cap. Either the per-job overhead has grown - re-measure with ` +
        '`npm run record:e2e-durations` - or the plan selects more than the change needs (docs/TEST_SELECTION.md).\n',
    );
  }

  process.stdout.write(
    `${JSON.stringify({ mode, specs, catalog, shards, shardSpecs, predicted, overCap, unmeasured, base, changed })}\n`,
  );
}

/**
 * EVERY FLAG THIS CLI ACTS ON, and the one line of help each gets.
 *
 * The list is the contract `parseArgs` enforces. Adding a flag to `main` without adding it here
 * makes the CLI refuse its own callers, which is a loud failure on the first run - the direction
 * this whole file is supposed to fail in.
 */
const KNOWN_FLAGS = new Map([
  ['--all', 'the whole suite and the catalog gate, with no diff at all'],
  ['--focus', 'collapse a core/unmapped escalation to the sprint focus set'],
  ['--no-focus', 'force the honest full escalation even with E2E_SPRINT_FOCUS=1'],
  ['--integration', 'move the base to the FORK POINT, covering both sides of a merge of main'],
  ['--no-integration', 'force the plain branch-only diff, never the fork point'],
  ['--json', 'print the plan as one JSON object and run nothing (implies --list)'],
  ['--list', 'print the plan and run nothing'],
  ['--help', 'print this and exit'],
]);

/** The usage text, generated from KNOWN_FLAGS so it cannot drift from what is accepted. */
function usage() {
  const rows = [...KNOWN_FLAGS].map(([f, why]) => `  ${f.padEnd(18)}${why}`);
  return [
    'usage: node scripts/e2e-affected.mjs [<base-ref>] [flags]',
    '',
    'With no base ref the diff is against the merge-base with main, plus the working tree.',
    '',
    ...rows,
  ].join('\n');
}

/**
 * PARSE THE ARGUMENTS, AND REFUSE THE ONES WE DO NOT UNDERSTAND.
 *
 * This used to accept anything: unrecognised flags were filtered out by `startsWith('--')` and
 * then never looked at again. That is the most expensive fail-open in the repository, because
 * the flags people mistype are the plan-only ones. `--print` is not `--list`, so `listOnly`
 * stayed false, and a command whose author expected a printed plan instead spawned
 * `npx playwright test` with NO spec arguments - which is not "no tests", it is all 1179 of
 * them - plus the 25-minute catalog gate. It happened twice in one day, once beside another
 * session's live run on a laptop where one browser job per machine is the standing rule
 * (AGENTS.md "Verifying changes" rule 3). A typo must not be able to start the most expensive
 * thing this repository can do.
 *
 * Single-dash arguments are flags too, so `-h` is a named error rather than being taken as a
 * base ref and handed to git (no git ref may begin with `-`). A SECOND positional is refused
 * for the same reason the first unknown flag is: the old code silently used the first and
 * dropped the rest, so `e2e-affected <old> <new>` planned from a base its author had corrected.
 *
 * Pure and exported so the refusal is testable without a git repository or a Playwright install.
 *
 * @param {string[]} args  process.argv.slice(2)
 * @returns {{ ok: true, flags: Set<string>, base: string|undefined }
 *          | { ok: false, message: string, help: boolean }}
 */
export function parseArgs(args) {
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f));
  if (unknown.length > 0) {
    return {
      ok: false,
      help: false,
      message: [
        `e2e-affected: unrecognised ${unknown.length === 1 ? 'flag' : 'flags'}: ${unknown.join(', ')}`,
        'Refusing to run. An ignored flag here means running the FULL suite by accident.',
        '',
        usage(),
      ].join('\n'),
    };
  }
  if (positional.length > 1) {
    return {
      ok: false,
      help: false,
      message: [
        `e2e-affected: expected at most one base ref, got ${positional.length}: ${positional.join(', ')}`,
        'Refusing to run rather than silently planning from the first one.',
        '',
        usage(),
      ].join('\n'),
    };
  }
  if (flags.includes('--help')) return { ok: false, help: true, message: usage() };
  return { ok: true, flags: new Set(flags), base: positional[0] };
}

/** Everything the CLI does: resolve the diff, classify it, report it, and run what it named. */
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    // stderr, never stdout: with --json stdout is a data channel, and CI captures it into a
    // shell variable. An empty capture plus a non-zero exit fails the step, which is the
    // verdict we want; a usage message on stdout would be parsed as a plan.
    (parsed.help ? console.log : console.error)(parsed.message);
    return parsed.help ? 0 : 2;
  }
  // The parsed flags, asked directly. Rebuilding an argv array here just to call `.includes` on
  // it would leave a second, looser copy of "was this flag given" beside the one `parseArgs`
  // has already validated - and the looser copy is the one that would drift.
  const has = (flag) => parsed.flags.has(flag);
  // SPRINT FOCUS (docs/GOALS_ARCHIVE.md "Student release", scripts/e2e-lists.mjs): while the sprint
  // runs, a CORE/unmapped escalation runs the student-critical focus set instead of the full
  // suite. Opt-in via env so nothing changes for a checkout that has not set it; --no-focus
  // forces the honest full escalation for a one-off. Mapped subsets are NOT intersected - they
  // are already small and precisely targeted, and intersecting would run zero relevant specs
  // for a paused-area fix. The nightly still runs everything.
  // `--focus` is the same switch as the env var, spelled so an npm script can carry it: Windows
  // runs package scripts through cmd.exe, where the posix `VAR=1 cmd` prefix is a syntax error,
  // so the env-only form could never be baked into `npm run` and every local run had to remember
  // it by hand. It could not, which is why a core change on this laptop kept escalating to the
  // full 103-file suite while CI - where ci.yml does set the env - ran the 34-file focus set.
  const sprintFocus =
    (process.env.E2E_SPRINT_FOCUS === '1' || has('--focus')) && !has('--no-focus');
  // --json prints the plan as one machine-readable object and runs nothing, which is how CI
  // decides between "skip the suite", "run these specs" and "run everything". It implies
  // --list, and it silences the human commentary: in this mode stdout is a data channel and a
  // stray progress line would corrupt it.
  const asJson = has('--json');
  const listOnly = asJson || has('--list');
  const baseArg = parsed.base;
  const log = asJson ? () => {} : console.log;

  // --all is "the whole suite, with no diff at all" - what `main` and an unusable diff base both
  // want. It lived as a hand-written `{"mode":"full",...}` literal inside ci.yml, which meant the
  // two paths that run the MOST tests were the two the tested code never saw, and neither could
  // be given a shard count without duplicating the arithmetic in YAML. Sprint focus deliberately
  // does not apply: this is the honest full escalation, which is the point of asking for it.
  if (has('--all')) {
    if (asJson) {
      emitJson({ mode: 'full', specs: [], catalog: true, base: null, changed: null });
      return 0;
    }
    log('e2e-affected: --all - running the FULL suite and the catalog gate, with no diff.');
    if (listOnly) return 0;
    const { status, runs } = runPlan({ mode: 'full', specs: [], catalog: true }, ({ args: a }) =>
      spawnSync('npx', a, { stdio: 'inherit', shell: true }).status,
    );
    log(summariseRuns(runs, status));
    return status;
  }

  // INTEGRATION MODE. `--integration` asks the question a post-merge run has to ask - "does the
  // COMBINED state hold" - by moving the base back to the fork point (see `integrationBase`).
  // It is also taken automatically when HEAD is itself a merge that brought main in, because
  // that is precisely the moment someone is about to push an unverified combination and the
  // ceremony of remembering a flag is what fails. `--no-integration` forces the plain
  // branch-only diff for a one-off.
  //
  // A BASE ARGUMENT AND `--integration` COMPOSE, and that is what CI needs. Passing a base used
  // to switch integration off entirely ("it was asked for"), which was right for a person naming
  // a ref by hand and wrong for the automated caller: ci.yml passes `github.event.before`, so on
  // a merge commit the plan diffed the pre-merge branch tip against the merge and saw only the
  // files MAIN had brought in. Measured over the last 120 merge-of-main commits in this
  // repository, 71 of them (59%) would have been planned differently from the fork point: 17
  // skipped the catalog calibration gate the combined tree needed, and 8 skipped E2E altogether
  // with `mode: none` - a green verdict on a combination nothing had run. The fork point is
  // always an ancestor of the push base, so preferring it fails toward running MORE, which is
  // the direction every other fallback in this file fails in. Without the flag the old rule
  // stands untouched: a bare `e2e-affected <ref>` still means exactly that ref.
  const wantsIntegration = !has('--no-integration');
  const askedForIntegration = has('--integration');
  const integration =
    wantsIntegration && (askedForIntegration || (!baseArg && headIsMainMerge())) ? integrationBase() : null;
  const base = integration ?? baseArg ?? branchBase();
  if (integration) {
    log(
      `e2e-affected: INTEGRATION base ${base.slice(0, 8)} - this branch has taken main in, so the plan covers BOTH sides' changes since the fork, not just the branch's.`,
    );
  }
  const changed = changedFilesSince(base);

  if (changed.length === 0) {
    if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changed: 0 });
    log('e2e-affected: no changes vs', base, '- nothing to run.');
    return 0;
  }

  const { mode, specs: plan, catalog: catalogAffected, configured, unmapped, focusApplied } = planFor(changed, { sprintFocus });
  const full = mode === 'full';

  // Printed BEFORE the 'none' early return below: a change confined to hosted Pro's wire
  // contract or to e2e/configured/ leaves this gate with nothing to run, and that verdict on
  // its own reads as "covered" when the covering suite is the one that never ran.
  if (configured) {
    log('e2e-affected: this change touches behaviour only a CONFIGURED deployment has - run `npm run test:e2e:live:queued` (needs .env + a throwaway test account; not runnable in CI).');
  }

  if (unmapped.length > 0) {
    log(`e2e-affected: no mapping for these files (falling back to the ${focusApplied ? 'SPRINT FOCUS set' : 'full suite'}):`);
    for (const f of unmapped) log('  -', f);
  }

  if (focusApplied) {
    log(`e2e-affected: SPRINT FOCUS - a core/unmapped change would run the full suite (${specFilesOnDisk().length} files); running the ${plan.length}-spec student-critical set instead (npm run test:e2e:focus; nightly still runs everything).`);
  }
  if (full) {
    log(`e2e-affected: core/unmapped change detected - running the FULL suite (${changed.length} changed files).`);
  } else if (mode === 'none') {
    if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changed: changed.length });
    log('e2e-affected: changes touch nothing the offline e2e suite covers - nothing to run.');
    return 0;
  } else if (plan.length > 0) {
    log(`e2e-affected: ${changed.length} changed files -> ${plan.length} spec files:`);
    for (const s of plan) log('  -', s);
  }
  if (catalogAffected) {
    log('e2e-affected: catalog/bench-affecting change detected - will also run npm run test:e2e:catalog.');
  }

  if (asJson) {
    // `mode` is only ever none/subset/full; the catalog gate rides alongside as its own flag,
    // because a catalog-only change needs that gate and no feature spec at all - and that case
    // is exactly why the empty plan must report 'none' rather than 'subset'. An empty spec list
    // handed to Playwright is not "no tests", it is EVERY test, so a mislabelled subset would
    // quietly run the whole suite.
    emitJson({ mode, specs: plan, catalog: catalogAffected, base, changed: changed.length });
    return 0;
  }

  if (listOnly) return 0;

  const { status, runs } = runPlan(
    { mode, specs: plan, catalog: catalogAffected },
    ({ args }) => spawnSync('npx', args, { stdio: 'inherit', shell: true }).status,
  );
  if (runs.length > 1 || status !== 0) log(summariseRuns(runs, status));
  return status;
}

if (isEntrypoint) process.exit(main());
