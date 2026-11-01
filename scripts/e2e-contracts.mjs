// THE D2 CONTRACT MAP AND THE CRITICAL SET (cicd-improvement ci07; docs/work-specs/cicd-improvement
// spec.md D2, evidence/phase-ci07.md Rules K1 to K5).
//
// Six black-box contracts, each with the faithful layers that prove it and the existing checks at
// each layer. What a check is FOR lives here, once per contract; which offline specs are CRITICAL
// JOURNEYS lives in each spec's own header (`// critical: <contract>`, read by scripts/e2e-lists.mjs),
// beside its `covers:` and `focus` lines.
//
// TWO SETS, NOT ONE. The critical journeys are the small set every product change is meant to keep
// green (the D2 design target is 5 minutes of execution); the shared-change set (`// focus`) is the
// broader escalation a shared or uncertain change plans instead of the full suite. Every critical
// journey is also in the shared-change set (Rule K2), so no escalation can plan fewer than the
// critical journeys. Nothing here selects a spec on its own: the planner still selects from
// headers, escalations and readers exactly as before.
//
// A BACKEND EXCEPTION is a contract whose faithful layer is the configured stack (grants, tenancy,
// concurrent writers, recovery against a real database). The offline critical set cannot prove
// it, so the contract names the configured specs that do and where they run instead. The
// exception deletes nothing and moves nothing to a later cadence.
//
// A check path that leaves the disk fails the build (Rule K3): deleting a mapped check needs this
// map changed in the same pull request, where a reviewer sees the protection go.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The D2 critical-journey execution target, in measured test-minutes, setup excluded. */
export const CRITICAL_TARGET_MINUTES = 5;

/**
 * The faithful layers a check can sit at.
 * node: a Node test of pure logic or a parser; browser: an offline Playwright spec on the app;
 * artifact: an offline spec that loads an exported package in its harness; catalog: the catalog
 * renderer battery (e2e/catalog); configured: a spec on the isolated local backend
 * (e2e/configured); deployed: verification of the build production actually serves.
 */
export const LAYERS = ['node', 'browser', 'artifact', 'catalog', 'configured', 'deployed'];

/**
 * @typedef {{ path: string, layer: string }} Check
 * @typedef {{ id: string, title: string, proof: string, defects: string[], layers: string[],
 *   checks: Check[], cadence: string, detection: string, gaps: string[],
 *   backend?: { specs: string[], runs: string, why: string } }} Contract
 */

/** @type {Contract[]} */
export const CONTRACTS = [
  {
    id: 'site-entry',
    title: 'Site entry and creation',
    proof: 'The app loads; a user can create or import a graphic and reach the production.',
    defects: ['the app fails to boot', 'the wizard creates a graphic without the walk\'s answers', 'the created graphic is lost on reload'],
    layers: ['browser', 'deployed'],
    checks: [
      { path: 'e2e/flows.spec.ts', layer: 'browser' },
      { path: 'e2e/project.spec.ts', layer: 'browser' },
      { path: 'e2e/wizard-finish.spec.ts', layer: 'browser' },
      { path: '.github/workflows/deploy-verify.yml', layer: 'deployed' },
    ],
    cadence: 'critical journeys on every escalation and per landing; the served build after every production deployment',
    detection: 'pre-merge for an escalating change; the landing\'s full run otherwise',
    gaps: ['deploy-verify proves the served build is the landed one, not every browser a school uses'],
  },
  {
    id: 'edit-save-reopen',
    title: 'Edit, save and reopen',
    proof: 'Reopened fields and appearance match the accepted edit; a refused save is not reported as saved.',
    defects: ['cross-tab lost update', 'a failed write reported as saved', 'a refresh mid-edit losing the draft'],
    layers: ['node', 'browser', 'configured'],
    checks: [
      { path: 'scripts/team-save.test.mjs', layer: 'node' },
      { path: 'scripts/store-part.test.mjs', layer: 'node' },
      { path: 'e2e/production-persistence.spec.ts', layer: 'browser' },
      { path: 'e2e/storage-full.spec.ts', layer: 'browser' },
      { path: 'e2e/cross-tab.spec.ts', layer: 'browser' },
      { path: 'e2e/configured/sync-one-pass-per-edit.spec.ts', layer: 'configured' },
    ],
    cadence: 'node tests in every build; critical journeys on every escalation; configured spec when selected and per landing',
    detection: 'pre-merge for the build and an escalating change; the landing\'s full runs otherwise',
    gaps: [],
  },
  {
    id: 'production-playout',
    title: 'Production and playout',
    proof: 'Preview, Take, Update and Stop have their visible effect; a wrong or stale writer cannot replace current output.',
    defects: ['competing writers', 'stale or delayed acknowledgement', 'a Take sent late or out of order'],
    layers: ['node', 'browser', 'configured'],
    checks: [
      { path: 'scripts/take-blockers.test.mjs', layer: 'node' },
      { path: 'scripts/playout-session.test.mjs', layer: 'node' },
      { path: 'e2e/production-controls.spec.ts', layer: 'browser' },
      { path: 'e2e/playout-drills.spec.ts', layer: 'browser' },
      { path: 'e2e/productions.spec.ts', layer: 'browser' },
      { path: 'e2e/configured/playout-resolve-race.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/take-behind-out.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/playout-switch-mid-flight.spec.ts', layer: 'configured' },
    ],
    cadence: 'node tests in every build; critical journeys on every escalation; configured specs when selected and per landing',
    detection: 'pre-merge for the build and an escalating change; the landing\'s full runs otherwise',
    gaps: ['physical playout devices (CasparCG servers, vision mixers) are a qualification limit, not an automated check'],
  },
  {
    id: 'export-portability',
    title: 'Export portability',
    proof: 'An exported artifact loads in its supported harness, accepts fields and performs its lifecycle.',
    defects: ['an export that passes a schema check but does not play', 'a field the harness cannot set', 'a lifecycle step the host never reaches'],
    layers: ['node', 'artifact', 'catalog'],
    checks: [
      { path: 'scripts/ograf-steps.test.mjs', layer: 'node' },
      { path: 'e2e/exports.spec.ts', layer: 'artifact' },
      { path: 'e2e/ograf-conformance.spec.ts', layer: 'artifact' },
      { path: 'e2e/spx-operator.spec.ts', layer: 'artifact' },
      { path: 'e2e/catalog/ograf-parity.spec.ts', layer: 'catalog' },
    ],
    cadence: 'critical journey on every escalation; the catalog battery when the catalog gate is raised and nightly',
    detection: 'pre-merge for an escalating or catalog-reaching change; nightly otherwise',
    gaps: ['third-party hosts (SPX, CasparCG, LiveOS) are driven by in-repo harnesses, not the vendors\' builds'],
  },
  {
    id: 'graphics-runtime',
    title: 'Graphics runtime',
    proof: 'Text, media and data updates paint, assets load, layout stays in bounds and entry and exit reach their state.',
    defects: ['asset or font loading fault', 'a data update that never paints', 'layout overflow on a long value'],
    layers: ['node', 'browser', 'catalog'],
    checks: [
      { path: 'scripts/bundled-font-glyphs.test.mjs', layer: 'node' },
      { path: 'e2e/snap-recovery.spec.ts', layer: 'browser' },
      { path: 'e2e/offline.spec.ts', layer: 'browser' },
      { path: 'e2e/output-font-hold.spec.ts', layer: 'browser' },
      { path: 'e2e/catalog/catalog-bench.spec.ts', layer: 'catalog' },
      { path: 'e2e/catalog/long-value-containment.spec.ts', layer: 'catalog' },
      { path: 'e2e/catalog/stage-fit-honesty.spec.ts', layer: 'catalog' },
    ],
    cadence: 'critical journeys on every escalation; affected designs through the catalog gate; whole catalog nightly',
    detection: 'pre-merge for an escalating or catalog-reaching change; nightly otherwise',
    gaps: ['representatives do not certify every design, font, viewport or browser'],
  },
  {
    id: 'access-durability',
    title: 'Access and durability',
    proof: 'Tenant and access boundaries, concurrent writes, identity and recovery keep their contract.',
    defects: ['an incorrect grant', 'a cross-tenant read or write', 'a lease taken by two writers', 'recovery that loses the live state'],
    layers: ['node', 'configured'],
    checks: [
      { path: 'scripts/definer-grants.test.mjs', layer: 'node' },
      { path: 'scripts/client-grants-migration.test.mjs', layer: 'node' },
      { path: 'e2e/configured/connector-grants.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/account.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/shared-lab-computer.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/output-url-cannot-push.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/panel-lease.spec.ts', layer: 'configured' },
      { path: 'e2e/configured/hosted-control-recovery.spec.ts', layer: 'configured' },
    ],
    backend: {
      specs: ['connector-grants.spec.ts', 'account.spec.ts', 'shared-lab-computer.spec.ts', 'output-url-cannot-push.spec.ts', 'panel-lease.spec.ts', 'hosted-control-recovery.spec.ts'],
      runs: 'selected on every triggered pull request (ci06) and the full configured suite on every landing; the merge group is exempt, so the combined tree is first checked after landing',
      why: 'grants, row-level security, leases and recovery need a real isolated database; an offline mock cannot fail on them',
    },
    cadence: 'node tests in every build; configured specs when selected and per landing',
    detection: 'pre-merge on a triggered pull request; the landing\'s full configured run otherwise',
    gaps: ['the combined tree\'s backend is not checked before merge (merge-group exemption, #1846)'],
  },
];

/**
 * THE BUILD'S REFUSALS for the map (Rules K1 to K4), pure so each is driven by a fixture.
 * @param {{ contracts?: Contract[], headers: Map<string, { focus: boolean, critical: string[] }>,
 *           exists?: (path: string) => boolean }} input
 * @returns {string[]} one line per problem; empty when the map and the headers agree
 */
export function auditContracts({ contracts = CONTRACTS, headers, exists = (p) => existsSync(join(ROOT, p)) }) {
  const problems = [];
  const ids = new Set(contracts.map((c) => c.id));
  const journeys = new Map(contracts.map((c) => [c.id, []]));
  for (const [spec, h] of headers) {
    for (const id of h.critical ?? []) {
      if (!ids.has(id)) problems.push(`e2e/${spec} is critical for \`${id}\`, which is not a contract in scripts/e2e-contracts.mjs`);
      else journeys.get(id).push(spec);
    }
    if ((h.critical ?? []).length > 0 && !h.focus) problems.push(`e2e/${spec} is a critical journey and is not in the shared-change set - add \`// focus\` so every escalation still plans it`);
  }
  for (const c of contracts) {
    for (const check of c.checks) {
      if (!LAYERS.includes(check.layer)) problems.push(`${c.id}: ${check.path} names an unknown layer \`${check.layer}\``);
      if (!exists(check.path)) problems.push(`${c.id}: ${check.path} is not on disk - a mapped check is removed only with this map changed`);
    }
    for (const layer of c.layers) {
      if (!c.checks.some((check) => check.layer === layer)) problems.push(`${c.id}: no check at its faithful layer \`${layer}\``);
    }
    if (journeys.get(c.id).length === 0) {
      if (!c.backend) problems.push(`${c.id}: no critical journey and no backend exception`);
      else {
        if (!c.backend.runs || !c.backend.why || c.backend.specs.length === 0) problems.push(`${c.id}: a backend exception names its configured specs, where they run and why`);
        for (const s of c.backend.specs) if (!exists(`e2e/configured/${s}`)) problems.push(`${c.id}: backend exception names e2e/configured/${s}, which is not on disk`);
      }
    }
  }
  return problems;
}

/** The critical journeys, from the headers: bare spec names, sorted. */
export function criticalSpecs(headers) {
  return [...headers].filter(([, h]) => (h.critical ?? []).length > 0).map(([spec]) => spec).sort();
}

/**
 * The critical set's measured minutes against the target (Rule K5). Pure.
 * @param {string[]} specs bare names
 * @param {Record<string, number>} minutes the durations table's per-spec minutes
 * @returns {{ minutes: number, unmeasured: string[], target: number, over: boolean, text: string }}
 */
export function criticalBudget(specs, minutes) {
  const unmeasured = specs.filter((s) => typeof minutes[s] !== 'number');
  const total = specs.reduce((sum, s) => sum + (minutes[s] ?? 0), 0);
  const rounded = Math.round(total * 100) / 100;
  const over = rounded > CRITICAL_TARGET_MINUTES;
  const text = `Critical journeys: ${specs.length} spec(s), ${rounded} measured test-minutes against the ${CRITICAL_TARGET_MINUTES}-minute target${unmeasured.length ? `, ${unmeasured.length} unmeasured (${unmeasured.join(', ')}): the total is a lower bound` : ''}${over ? ' - over the target; reported, never met by removing a journey' : ''}.`;
  return { minutes: rounded, unmeasured, target: CRITICAL_TARGET_MINUTES, over, text };
}

/** The durations table's per-spec minutes (scripts/e2e-durations.json). */
export function readMinutes(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'scripts', 'e2e-durations.json'), 'utf8')).minutes ?? {};
}
