/**
 * Stage B of the architecture enforcement roadmap (docs/ARCHITECTURE.md §7): the dependency
 * ratchet. The `allowed` array below IS the §3 edge table - anything not matching an entry
 * fails `npm run build`. Adding a cross-domain edge therefore means editing BOTH the doc's §3
 * table and this file in the same PR. The entries marked "§6 debt" mirror the grandfathered
 * rows in docs/ARCHITECTURE.md §6 - delete the allowance together with its row when the debt
 * is paid.
 *
 * Scope is src/ only: api/, render-worker/ and player-host/ are separate programs with their
 * own tsconfigs; their sanctioned imports into src/render are outside this graph on purpose.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'The runtime module graph stays a DAG (docs/ARCHITECTURE.md §3) - break the cycle, do ' +
        'not extend it. Cycles containing an `import type` edge are tolerated: they are erased ' +
        'at compile time (the registry/type-hub patterns in export/, ai/ and templates/shared ' +
        'rely on this), so only cycles made entirely of value imports - the kind that can bite ' +
        'at module-init time - are banned.',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'creative-pilot-is-bench-only',
      severity: 'error',
      comment:
        'The Creative Mode pilot (src/ai/creative/, docs/CREATIVE_MODE_PLAN.md §10) is a ' +
        'BENCH RIG: its only callers are scripts/creative-pilot-bench.mjs and its e2e ' +
        'coverage, both outside this graph. No app module may import it - a production edge ' +
        'would put an unratified pipeline behind a user-facing button, and arm A would stop ' +
        'being the frozen control the whole comparison rests on (§8). When phase E promotes ' +
        'something out of the pilot, delete this rule together with the promotion.',
      // src/ai/spike/ is the OTHER bench rig and is exempted rather than excused: it is itself
      // unreachable from the app (the rule below), so letting it read the neutral skeleton
      // keeps two bench rigs sharing one de-anchored scaffold instead of growing a second
      // copy - it cannot put anything behind a user-facing button, which is what this rule
      // protects. Delete the exemption with the spike.
      from: { path: '^src/', pathNot: '^src/ai/(creative|spike)/' },
      to: { path: '^src/ai/creative/' },
    },
    {
      name: 'pro-phase0-spike-is-bench-only',
      severity: 'error',
      comment:
        'The NoaCG Pro Phase 0 spike (src/ai/spike/, docs/NOACG_PRO_PLAN.md §0.1) is a BENCH ' +
        'RIG: its only caller is scripts/pro-spike.mjs, outside this graph. No app module may ' +
        'import it. The plan is explicit that the wrapper either graduates into the later ' +
        'harness or is DELETED once the go/no-go verdict is recorded, and a production edge is ' +
        'how a deletable experiment stops being deletable. Phase 1 promotes deliberately, and ' +
        'deletes this rule in the same change.',
      from: { path: '^src/', pathNot: '^src/ai/spike/' },
      to: { path: '^src/ai/spike/' },
    },
  ],

  allowed: [
    // ---- generic allowances ---------------------------------------------------------------
    {
      comment: 'Everything may import the layer-0 kernel (model/, assets/) - §3 preamble',
      from: { path: '^src/' },
      to: { path: '^src/(model|assets)/' },
    },
    {
      comment: 'A domain may import itself freely',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/$1/' },
    },
    {
      comment:
        'Everything may import entitlements/ - a layer-0 PURE contract that imports nothing ' +
        'in return (§2). It is the one answer to "what may this user do", shared by the ' +
        'browser, api/ and the admin page; a second copy of that answer is the bug it exists ' +
        'to prevent. Its own outgoing edges are absent from this table on purpose.',
      from: { path: '^src/' },
      to: { path: '^src/entitlements/' },
    },
    {
      comment:
        'Everything may import feedback/ - the second layer-0 PURE contract, same shape and ' +
        'same reasoning as entitlements/ (§2). It is the one vocabulary for a rating, a ' +
        'reason code and a triage state, and it has FOUR consumers that must agree: the ' +
        'browser form, the API validator, the admin inbox and the CHECK constraints in ' +
        'migration 0028. Four copies of one enumeration is the bug it exists to prevent - ' +
        'the discard-reason list was already living in three places before it. It imports ' +
        'nothing in return.',
      from: { path: '^src/' },
      to: { path: '^src/feedback/' },
    },
    {
      comment: 'The entry files at the src root (App.tsx, main.tsx) wire the app, and reach styles/',
      from: { path: '^src/[^/]+$' },
      to: { path: '^src/' },
    },
    {
      comment:
        'Vite asset-suffix imports (?raw / ?url / ?inline) do not resolve under enhanced-resolve; the eslint layer and the build cover them',
      from: { path: '^src/' },
      to: { path: '[?](raw|url|inline)$', couldNotResolve: true },
    },

    // ---- the §3 edge table ----------------------------------------------------------------
    {
      comment: '§3: templates -> blocks (animData, animMachine, shared runtime)',
      from: { path: '^src/templates/' },
      to: { path: '^src/blocks/' },
    },
    {
      comment: '§3: blocks -> templates (preset data tables, shared/animRuntime, shared/textFit)',
      from: { path: '^src/blocks/' },
      to: { path: '^src/templates/' },
    },
    {
      comment: '§3: validation -> blocks, templates, preview',
      from: { path: '^src/validation/' },
      to: { path: '^src/(blocks|templates|preview)/' },
    },
    {
      comment: '§3: store -> blocks, validation',
      from: { path: '^src/store/' },
      to: { path: '^src/(blocks|validation)/' },
    },
    {
      comment: '§3: store -> templates (defaultTemplate only - the initial document is the first catalog variant)',
      from: { path: '^src/store/' },
      to: { path: '^src/templates/defaultTemplate\\.ts$' },
    },
    {
      comment: '§3: ai -> templates, blocks, validation, video',
      from: { path: '^src/ai/' },
      to: { path: '^src/(templates|blocks|validation|video)/' },
    },
    {
      comment: '§3: ai -> backend, getAccessToken only (proxy metering)',
      from: { path: '^src/ai/' },
      to: { path: '^src/backend/auth' },
    },
    {
      comment: '§3: video -> validation, render',
      from: { path: '^src/video/' },
      to: { path: '^src/(validation|render)/' },
    },
    {
      comment: '§3: render -> control, preview, showchat',
      from: { path: '^src/render/' },
      to: { path: '^src/(control|preview|showchat)/' },
    },
    {
      comment: '§3: render -> backend, getAccessToken only',
      from: { path: '^src/render/' },
      to: { path: '^src/backend/auth' },
    },
    {
      comment: '§3: export -> blocks, control (panel/receiver generators are the packaging seam)',
      from: { path: '^src/export/' },
      to: { path: '^src/(blocks|control)/' },
    },
    {
      comment:
        '§3: export -> validation, the production gate only. A production export is a door a ' +
        'library draft leaves through, and it is gated in the BUILDER (showExport.ts) so the ' +
        'promise "an invalid graphic cannot export" holds for every caller, not only the dialog ' +
        'that shows the verdict (docs/AGENT_SAVE.md).',
      from: { path: '^src/export/' },
      to: { path: '^src/validation/productionGate\\.ts$' },
    },
    {
      comment: 'OGraf export -> shared deterministic virtual-clock runtime',
      from: { path: '^src/export/targets/ograf\\.ts$' },
      to: { path: '^src/render/runtimeScript\\.ts$' },
    },
    {
      comment: '§3: control -> blocks, backend',
      from: { path: '^src/control/' },
      to: { path: '^src/(blocks|backend)/' },
    },
    {
      comment:
        '§3: control -> validation, the production gate only. Publishing a production is the ' +
        'library->air boundary: publishControlShow refuses an invalid graphic before it pins ' +
        'anything to an output URL, whoever calls it (docs/AGENT_SAVE.md).',
      from: { path: '^src/control/' },
      to: { path: '^src/validation/productionGate\\.ts$' },
    },
    {
      comment:
        '§3: control -> audience, audienceBrand only. Publishing carries the production look ' +
        'into the audience plane (migration 0035 audience_state.brand) and the audience domain ' +
        'owns that shape - a copy of the mapping inside the publish path would be a second ' +
        'opinion about what a viewer page looks like, held by the module least likely to be ' +
        'edited when the join page changes.',
      from: { path: '^src/control/' },
      to: { path: '^src/audience/audienceBrand\\.ts$' },
    },
    {
      comment:
        '§3: audience -> backend. The Supabase provider is eleven slug-keyed RPCs through ' +
        'getSupabase(). It reaches no other domain, which is what keeps "nothing ' +
        'viewer-written airs without an operator" structural: there is nowhere for it to ' +
        'write a command.',
      from: { path: '^src/audience/' },
      to: { path: '^src/backend/' },
    },
    {
      comment:
        '§3: join -> audience, backend. The public join page (docs/INTERACTIVE_PLAYOUT_PLAN.md ' +
        'Phase 5) is its own MPA entry: it reads the capability off the URL, mounts ' +
        'audience/joinSurface over the Supabase provider, and feature-detects the backend. It ' +
        'reads no store, no components, no templates and no control module - a viewer page must ' +
        'not even be able to name the command log.',
      from: { path: '^src/join/' },
      to: { path: '^src/(audience|backend)/' },
    },
    {
      comment:
        '§3: the /ograf STARTERS page entry (docs/OGRAF.md). It builds real catalog templates ' +
        '(templates + the model types they carry), previews them through preview/composeDocument ' +
        '+ frameGraphic, and packages them through the OGraf export target - the point of the ' +
        'page is that its downloads ARE the exporter. It reads no store, no components, no ' +
        'backend: a static marketing surface with a build button.',
      from: { path: '^src/ograf/' },
      to: { path: '^src/(templates|model|preview|export)/' },
    },
    {
      comment:
        '§3: the /bridge page entry (docs/AGENT_CLI.md) - the platform\'s headless surface for the ' +
        '`noacg` CLI / MCP server. It composes the studio\'s OWN functions for a driver: the type ' +
        'registry + neutral scaffold (templates), the gate + bench + readiness + engine scan ' +
        '(validation), the share-safety gate (community/gate), the preview document (preview), the ' +
        'dual package + OGraf reader (export), the pack wire entry (packs), and the operator-surface ' +
        'generator + OGraf contract adapter (control). It reads no store, no components, no backend: ' +
        'it holds no account and no key, and answers questions about bytes it is handed.',
      from: { path: '^src/bridge/' },
      to: { path: '^src/(templates|blocks|model|validation|community|preview|export|packs|control)/' },
    },
    {
      comment: '§3: community -> backend, validation',
      from: { path: '^src/community/' },
      to: { path: '^src/(backend|validation)/' },
    },
    {
      comment:
        '§3: packs -> validation. A downloadable graphics pack goes through the ONE export ' +
        'gate before it installs - the importer refusing what export would refuse is the ' +
        'whole safety story of "install a file somebody handed you".',
      from: { path: '^src/packs/' },
      to: { path: '^src/validation/' },
    },
    {
      comment:
        '§3: admin -> backend (getAccessToken + isBackendConfigured only). The admin page is ' +
        'its own MPA entry, so it needs the session token to authorize its API calls; it ' +
        'reads no other domain, because every fact it shows comes from api/admin/*.',
      from: { path: '^src/admin/' },
      to: { path: '^src/backend/' },
    },
    {
      comment: '§3: showchat -> backend, control',
      from: { path: '^src/showchat/' },
      to: { path: '^src/(backend|control)/' },
    },
    {
      comment:
        '§3: output -> control, preview, backend. The browser-output renderer ' +
        '(docs/CLOUD_PLAYOUT.md §3) is its own MPA entry: it resolves and follows the ' +
        'hosted-control log through control/hostedControl, composes each published graphic ' +
        'through preview/composeDocument, and feature-detects the backend. It reads no ' +
        'store, no components, no templates - the published payload is its whole world.',
      from: { path: '^src/output/' },
      to: { path: '^src/(control|preview|backend)/' },
    },
    {
      comment: '§3: components may import any lower domain (through its seam - review-time)',
      from: { path: '^src/components/' },
      to: { path: '^src/' },
    },

    // ---- §6 grandfathered debts (delete together with the doc row) ------------------------
    {
      comment: '§6 debt: model -> editor (prefs type-imports CommentVisibility)',
      from: { path: '^src/model/prefs\\.ts$' },
      to: { path: '^src/editor/commentVisibility' },
    },

    // ---- the row-1 shim (docs/WORKFLOW_ARCHITECTURE.md §5.5) - deleted together with the shim --
    {
      comment:
        'Domain row 1 shim: src/model/wizard.ts is a re-export of templates/contract.ts and ' +
        'templates/importedDesign/designTypes.ts for ONE landing, so the branches that are ' +
        'open while its importers are rewritten keep compiling. The next landing deletes the ' +
        'shim and this allowance with it; it permits no other model -> templates edge.',
      from: { path: '^src/model/wizard\\.ts$' },
      to: { path: '^src/templates/(contract|importedDesign/designTypes)\\.ts$' },
    },
  ],
  allowedSeverity: 'error',

  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^src/',
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
