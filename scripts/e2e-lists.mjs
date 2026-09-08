// SPRINT FOCUS - the student-critical spec set (added 2026-08, docs/GOALS_ARCHIVE.md "Student release").
//
// While the student-release sprint runs, a change that would escalate to the FULL suite runs
// this set instead (scripts/e2e-affected.mjs, gated on E2E_SPRINT_FOCUS=1), and the nightly
// verdict classifies failures as focus (fix now) vs paused (drift, swept at sprint end)
// through scripts/nightly-triage.mjs. Both consumers import THIS list so they cannot drift.
//
// The list is the sprint's definition of "the product": wizard, home/library, productions,
// control/playout, export, auth/sync, landing, layout. Retire the whole file - together with
// the E2E_SPRINT_FOCUS env in ci.yml and the focus branch in e2e-affected.mjs - when the
// sprint ends.
export const FOCUS = [
  'agent-access.spec.ts',
  'analytics.spec.ts',
  'advanced-mode.spec.ts',
  'auth.spec.ts',
  // CasparCG Connect is a NICE-TO-HAVE over routes that already air (docs/CASPARCG_CONNECT.md),
  // so it earns a place here for one reason only: it puts a control on the production page and a
  // section in Settings, both of which ARE student-critical surfaces. What it protects during the
  // sprint is that those two surfaces keep working, not that CasparCG does.
  'caspar-connect.spec.ts',
  'control.spec.ts',
  'cross-tab.spec.ts',
  'data-api.spec.ts',
  'design-rules-product.spec.ts',
  // The public docs home: the guides students and operators follow to get on air at all.
  'docs.spec.ts',
  'exports.spec.ts',
  'feedback.spec.ts',
  'flows.spec.ts',
  'format.spec.ts',
  'hosted-control.spec.ts',
  // SVG IMPORT is how a student's own artwork gets in, so the road belongs to the sprint's
  // definition of the product. This is the EXPORTER CORPUS spec - six files shaped the way
  // Illustrator, Figma, Inkscape and Affinity really export, each pinning an answer the importer
  // used to get wrong (e2e/fixtures/svg-corpus/README.md). Its 2180-line sibling
  // `import-svg.spec.ts` deliberately stays out: it covers the same road far more slowly, and
  // merge latency is the bottleneck the sprint is protecting.
  'import-svg-corpus.spec.ts',
  // A DATA-LOSS shape on the road every student walks in the class: import your own
  // artwork, build a production on it, then import your next version under the same name.
  // Until 2026-09-08 the second import minted a twin library record and quietly detached
  // the graphic the production's cues were built on. Four import doors, one rule - and the
  // rule's two halves live in `model/library.ts` and `model/shows.ts`, which are CORE in
  // e2e-affected.mjs, so a change to either escalates to the full suite and reaches it that
  // way. The `src/components/wizard/` MAP row is what runs it for a change to the doors.
  'import-name-collision.spec.ts',
  'landing.spec.ts',
  'layout.spec.ts',
  'lazy-editor.spec.ts',
  'library.spec.ts',
  'library-bulk.spec.ts',
  // WHICH GRAPHICS BELONG TO WHICH PRODUCTION. It reads the pool's `graphicId` back-link, so
  // the change most likely to break it is one to model/shows.ts - which escalates to this list
  // rather than to the mapping, and would otherwise run the two library specs beside it and
  // never the one written to protect this surface.
  'library-productions.spec.ts',
  'local-relay.spec.ts',
  'motion-presets.spec.ts',
  'network-resilience.spec.ts',
  'offline.spec.ts',
  'ograf-conformance.spec.ts',
  'ograf-starters.spec.ts',
  // WHAT PAINTS OVER WHAT. It belongs to the sprint because of the failure that produced it:
  // a corner notice outranked every dialog in the app, so an undecided first-time visitor
  // could not press the wizard's own "Add it and go there" - the student's last click before
  // a production. The offline suite is also the only tier that can hold this: the banner that
  // caused it exists only on a configured deployment, which is why it went unseen until the
  // scheduled configured run failed on it.
  'overlay-layers.spec.ts',
  'package.spec.ts',
  'playout-drills.spec.ts',
  'production-audience.spec.ts',
  'production-chat-intake.spec.ts',
  'production-controls.spec.ts',
  'production-data.spec.ts',
  'production-gate.spec.ts',
  'production-pack.spec.ts',
  'production-persistence.spec.ts',
  'productions.spec.ts',
  'quiz-pilot.spec.ts',
  'project.spec.ts',
  'project-format.spec.ts',
  // The BOOT SURFACE - that opening the studio never paints a screen it was not going to stay
  // on. It belongs here because of what it guards rather than what it costs: src/App.tsx is a
  // CORE file, and a CORE escalation resolves to THIS list under E2E_SPRINT_FOCUS, so without
  // the row a later branch could move the boot decision back into an effect and still get a
  // green merge gate - the regression would surface only in the nightly full run. The spec is
  // four fast page loads and drives no catalog.
  'route-transition-flash.spec.ts',
  'shows.spec.ts',
  'snap-recovery.spec.ts',
  'storage-full.spec.ts',
  // The 2026-09-12 rehearsal, walked on artwork a STUDENT drew rather than on the shipped
  // samples: an Illustrator export with the dialog untouched and layer names that honour none
  // of our conventions, both graphics into one production, and the dashboard reloaded mid-run.
  // It is the whole sprint goal in one file, so it belongs in the sprint's own set.
  'student-rehearsal.spec.ts',
  'sync.spec.ts',
  'template-deep-link.spec.ts',
  // THE BRAND CHOOSER (docs/BRAND_PLAN.md). It belongs to the sprint set for the same reason the
  // logo spec does: it is the road a student's own channel look takes into a graphic, and its
  // model half (model/brand.ts, model/packets.ts) is CORE - so a change there escalates to THIS
  // list, and without the row the one spec written to protect the surface would never run.
  'wizard-brand.spec.ts',
  'wizard-entry-fit.spec.ts',
  'wizard-filters.spec.ts',
  'wizard-finish.spec.ts',
  'wizard-kit.spec.ts',
  'wizard-logo.spec.ts',
  'wizard-preview.spec.ts',
  'wizard-shell.spec.ts',
];

// THE CONFIGURED SUITE'S TRIGGERS - files whose behaviour the OFFLINE suite structurally
// cannot cover, because the thing they change only exists when a backend is configured.
//
// `scripts/e2e-affected.mjs` ignores `e2e/configured/**` outright: those specs need a real
// Supabase project and a throwaway account, so they can neither run in CI nor be selected by
// the per-merge gate. That is the right call and it leaves a hole - a change to hosted Pro's
// door or its metering maps to specs that pin its ABSENCE, all of which stay green while the
// live path breaks. Naming the triggers turns that hole into a printed line: the affected run
// says "also run npm run test:e2e:live:queued" and it is then a decision rather than an
// oversight. It REPORTS and never runs - running it would start a dev server on the real .env,
// which is exactly what the offline pin exists to prevent.
export const CONFIGURED_TRIGGERS = [
  // The hosted-Pro door and its wire contract: absent offline, so only the configured suite
  // can walk it (e2e/configured/pro-wizard.spec.ts).
  /^src\/ai\/pro\/session\.ts$/,
  /^src\/ai\/pro\/types\.ts$/,
  /^api\/_lib\/pro\//,
  /^api\/ai\/\[\.\.\.path\]\.ts$/,
  /^scripts\/aiDevPlugin\.mjs$/,
  /^scripts\/apiRouteTable\.mjs$/,
  // The step that decides which tiers are offered at all, and the one feature-detection point
  // the second half of that decision reads.
  /^src\/components\/wizard\/steps\/AiStep\.tsx$/,
  /^src\/backend\/config\.ts$/,
  // The practice library is a FIXTURE SET as well as documentation, and one of its files is
  // loaded by the configured suite too: e2e/configured/imported-quiz-output.spec.ts drops
  // `quiz-board.svg` and follows it all the way to a hosted production's output. The offline
  // plan names the three specs that load the folder (scripts/e2e-affected.mjs), and this row is
  // the other half - CONFIGURED_TRIGGERS is asked BEFORE the ignore list, which is what makes it
  // reachable at all for a path under `docs/`.
  /^docs\/svg-samples\/quiz-board\.svg$/,
  // THE BEHAVIOUR COMPILER AND ITS RECIPES (docs/SVG_BEHAVIOUR_PLAN.md), for the sharper half
  // of the same story. These decide how a bound layer is STAMPED - the `data-noacg-role`
  // token and the look class pair every drawn moment is addressed by - and
  // e2e/configured/imported-quiz-output.spec.ts is the only thing that reads those stamps on
  // the far side of the hosted wire. The offline walk reads them too and is migrated with the
  // compiler, so the two drift SILENTLY: on 2026-09-05 the quiz became a declaration, the id
  // namespace it used to stamp (`q-sel-2`, `q-lock`) went with it, e2e/import-svg-behaviour.spec.ts
  // was rewritten in the same commit, and this spec was not. It landed red, and nothing on the
  // way in had said the configured suite was even reachable from that change.
  /^src\/templates\/behaviours\//,
  /^src\/templates\/importedDesign\/(behaviour|behaviourRuntime)\.ts$/,
  /^src\/blocks\/behaviourData\.ts$/,
  // AGENT ACCESS (docs/AGENT_SAVE.md): the consent page with a session, the loopback handoff,
  // redeem, a save 201, the deep link after sync and revoke -> 401 only exist against a real
  // backend (e2e/configured/agent-access.spec.ts). The offline spec can only pin their absence.
  /^src\/backend\/agentAccess\.ts$/,
  /^src\/components\/auth\/AgentAccessConsent\.tsx$/,
  // PASSWORD RECOVERY (docs/backlog/password-reset-link-lands-nowhere.md): the same shape as
  // agent access. Offline the route is INERT by design and e2e/auth.spec.ts can only pin that
  // it stays inert; the expired-link card, the resend door and the pre-route fragment key are
  // only reachable against a real project (e2e/configured/anonymous.spec.ts). A change here
  // that broke the live path would leave every offline spec green.
  /^src\/backend\/recoveryLink\.ts$/,
  /^src\/components\/auth\/PasswordRecoveryPage\.tsx$/,
  // The TOPBAR's account cluster, for the same reason and with a sharper edge: signed in it
  // carries three controls the offline build never renders, so the only thing that measures
  // whether the bar still holds ONE ROW at 1366/1280/1100 is e2e/configured/signed-in-ux.spec.ts.
  // A width regression here lands with every offline spec green - the ladder in app-shell.css
  // records that the bar was already 24px over at 1366 before its 1400px step was added.
  /^src\/components\/auth\/AuthStatus\.tsx$/,
  /^src\/styles\/(auth|app-shell|mobile)\.css$/,
  /^api\/_lib\/me\/(agentKeys|graphics|graphicShape)\.ts$/,
  /^api\/_lib\/(principal|agentAccessStore)\.ts$/,
  /^api\/me\/\[\.\.\.path\]\.ts$/,
  /^scripts\/meDevPlugin\.mjs$/,
  // THE HOSTED PLAYOUT WIRE (docs/CLOUD_PLAYOUT.md §3). The follow discipline, the boot
  // baseline and the renderer that uses both only ever run against a real durable log: offline
  // there is no production to resolve, no log to follow and no channel to join, so the
  // mechanism is ABSENT rather than merely untested. Their live coverage is the four /output
  // walks plus output-realtime-floor and relay-cold-boot, all in the configured suite - so a
  // change here that the offline plan reports as "covered" is covered by nothing.
  /^src\/control\/(hostedControl|hostedReceiver|outputRecovery)\.ts$/,
  /^src\/output\//,
  // THE PRODUCTION DATA API and the panel that hands out its key (docs/DATA_API.md). Offline
  // there is no publish, no data_key row and no key to reveal, so the only honest proof that the
  // revealed string AUTHENTICATES is the configured walk
  // (e2e/configured/production-data-key.spec.ts). The offline data-api spec pins the refusal
  // shapes, and production-data.spec.ts pins the button's absence; both are different claims.
  /^src\/control\/productionDataApi\.ts$/,
  /^src\/components\/home\/ProductionDataPanel\.tsx$/,
  /^api\/data\//,
  /^scripts\/dataDevPlugin\.mjs$/,
  // TEAMS (docs/TEAMS_PLAN.md §7). The whole feature is absent offline BY DESIGN, so the offline
  // plan can only ever pin its absence (e2e/auth.spec.ts). Creating a team, reading its join
  // code, joining by link and leaving all need a real session against migrations 0053/0054, and
  // e2e/configured/teams.spec.ts is the only thing that walks them - it is also what proves the
  // test ids the offline pin asserts to be ABSENT are ids something really renders.
  /^src\/backend\/teams\.ts$/,
  /^src\/components\/teams\//,
  /^e2e\/_teams\.ts$/,
  // The door's two MOUNT POINTS, named individually the way this list names
  // ProductionDataPanel: the configured walk drives the card's overflow item and the production
  // header's button, and offline neither exists to be driven. The `join-team` ROUTE needs no row
  // - `src/app/router.ts` is CORE for the offline plan, and the offline pin fails outright if
  // that route stops resolving, so it is covered where it is cheap to cover.
  /^src\/components\/home\/ProductionPage\.tsx$/,
  /^src\/components\/home\/sections\/ProductionsSection\.tsx$/,
  // The suite's own files.
  /^e2e\/configured\//,
  /^playwright\.live\.config\.ts$/,
];
