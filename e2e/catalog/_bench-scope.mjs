// THE CALIBRATION BENCH'S MANIFEST, AND THE GUARD THAT A RUN MEASURED ALL OF IT.
//
// Two halves in one file because they must agree: `catalog-bench.spec.ts` builds its test units
// from the manifest below, and the reporter at the bottom (wired into playwright.catalog.config.ts)
// checks, at the end of every run that plans one of those units, that the units together measured
// exactly the designs the run selected - no fewer, no more, none twice.
//
// WHY. A scoped bench run used to be able to measure nothing and pass. Each unit filtered the
// catalog by `NOACG_ONLY_DESIGNS` on its own and skipped a whole category that
// `NOACG_ONLY_CATEGORIES` left out, and nothing compared what the units measured with what was
// asked: a category missing from the bench's list, a category left out of the scope, or a unit
// that never ran all read as green (cicd-improvement ci12; the rules are numbered in
// docs/work-specs/cicd-improvement/evidence/phase-ci12.md and tested one by one in
// scripts/catalog-bench-scope.test.mjs). The guard reads the catalog itself, from the checkout,
// so it does not take the bench's word for what exists.
//
// NOTHING ABOUT WHAT IS MEASURED CHANGES. The guard refuses incomplete evidence; it selects
// nothing, and a full run is judged exactly as a scoped one, against the whole catalog.

/** The categories the bench benches, in the order its units are declared. */
export const BENCH_CATEGORIES = [
  'lower-third',
  'info-card',
  'end-credits',
  'ticker',
  'starting-soon',
  'game-timer',
  'scoreboard',
  'corner-bug',
  'infographic',
  'versus',
  'quiz',
  'frame',
  'transition',
  'alert',
  'public-info',
  'esports-score',
  'matchup',
  'results-board',
  'reveal',
  'poll',
  'audience',
  'stream-notification',
];

// Slice budgets: a large category benches as SLICES[category] parallel test units (variant i
// belongs to slice i % slices, so every variant is covered by construction). At ~1-1.5 s per
// variant a single test's 120 s timeout caps a category near 80 designs - lower-third reached
// 90 - and slicing turns growth into more parallel units instead of one longer test. Bump a
// category's number when a slice nears ~40 variants; a category not named here runs whole.
export const BENCH_SLICES = {
  'lower-third': 4,
  'info-card': 4,
  'corner-bug': 2,
  'infographic': 2,
};

/**
 * Catalog categories the bench does NOT bench, each with the reason. A category in neither list
 * fails every run (rule S4), so a new category cannot be silently left out again.
 */
export const NOT_BENCHED = {
  'imported-design':
    'never benched since it joined the catalog on 2026-10-29; svg01 fails bench-entrance and bench-replay ' +
    '(cicd-improvement ci12, evidence/phase-ci12.md section 2), tracked in issue #1926',
};

/** The name of the attachment each unit's report travels in. */
export const REPORT = 'catalog-bench-report';

/** The spec file whose units this guard judges. */
export const BENCH_SPEC = 'catalog-bench.spec.ts';

const slicesOf = (category) => BENCH_SLICES[category] ?? 1;

const list = (value) => {
  if (value === undefined) return null;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
};

/** The scope a run was given, read the way the bench reads it, plus whether each variable was present. */
export function scopeFromEnv(env = process.env) {
  return { designs: list(env.NOACG_ONLY_DESIGNS), categories: list(env.NOACG_ONLY_CATEGORIES) };
}

/**
 * Why this bench run is not complete evidence, as sentences (empty when it is), plus a summary.
 *
 * @param {{
 *   catalog: { id: string, category: string }[],
 *   scope: { designs: string[]|null, categories: string[]|null },
 *   units: { category: string, slice: number, slices: number, status: string,
 *            report: { id: string, ok: boolean }[]|null }[],
 *   manifest?: { categories: string[], slices: Record<string, number>, notBenched: Record<string, string> },
 * }} run
 *   `scope` fields are null when the variable was unset and [] when it was set but empty.
 *   `units` is every bench unit the run planned, with its final status and parsed report.
 */
export function benchScopeProblems({ catalog, scope, units, manifest }) {
  const m = manifest ?? { categories: BENCH_CATEGORIES, slices: BENCH_SLICES, notBenched: NOT_BENCHED };
  const sliceCount = (category) => m.slices[category] ?? 1;
  const problems = [];
  const categoryOf = new Map(catalog.map((v) => [v.id, v.category]));
  const scoped = scope.designs !== null;

  // S2: an empty overall selection, or a category filter posing as a full run.
  if (scoped && scope.designs.length === 0) problems.push('NOACG_ONLY_DESIGNS is set but names no design: an empty selection measures nothing');
  if (!scoped && scope.categories !== null) {
    problems.push('NOACG_ONLY_CATEGORIES is set without NOACG_ONLY_DESIGNS: the bench would skip categories while reporting a full run');
  }

  const selected = scoped ? [...new Set(scope.designs)] : catalog.map((v) => v.id);

  // S1: an id the catalog does not ship.
  const unknown = selected.filter((id) => !categoryOf.has(id));
  if (unknown.length) problems.push(`${unknown.length} selected id(s) the catalog does not ship: ${unknown.join(', ')}`);

  const known = selected.filter((id) => categoryOf.has(id));
  const selectedCategories = [...new Set(known.map((id) => categoryOf.get(id)))];

  // S3: the category list must be exactly the categories the selected ids live in.
  if (scope.categories !== null && scoped) {
    const given = new Set(scope.categories);
    const missing = selectedCategories.filter((c) => !given.has(c));
    const extra = [...given].filter((c) => !selectedCategories.includes(c));
    if (missing.length) problems.push(`NOACG_ONLY_CATEGORIES leaves out ${missing.join(', ')}, where selected designs live`);
    if (extra.length) problems.push(`NOACG_ONLY_CATEGORIES names ${extra.join(', ')}, where no selected design lives`);
  }

  // S4: every category holding a selected id is benched or declared not benched.
  const benched = new Set(m.categories);
  const unaccounted = selectedCategories.filter((c) => !benched.has(c) && !(c in m.notBenched));
  if (unaccounted.length) {
    problems.push(`catalog categor(y|ies) neither benched nor declared not benched: ${unaccounted.join(', ')} (add each to BENCH_CATEGORIES or NOT_BENCHED in e2e/catalog/_bench-scope.mjs)`);
  }

  const expected = new Set(known.filter((id) => benched.has(categoryOf.get(id))));
  const declared = known.filter((id) => !benched.has(categoryOf.get(id)) && categoryOf.get(id) in m.notBenched);

  // S5: every unit of every benched category holding an expected id ran once, with a report.
  const expectedCategories = [...new Set([...expected].map((id) => categoryOf.get(id)))];
  for (const category of expectedCategories) {
    const n = sliceCount(category);
    for (let slice = 0; slice < n; slice++) {
      const label = n === 1 ? category : `${category} slice ${slice + 1} of ${n}`;
      const ran = units.filter((u) => u.category === category && u.slice === slice);
      if (ran.length === 0) problems.push(`bench unit "${label}" was not run, so its designs were never measured`);
      else if (ran.length > 1) problems.push(`bench unit "${label}" ran ${ran.length} times`);
      else {
        const [u] = ran;
        if (u.status !== 'passed' && u.status !== 'failed') problems.push(`bench unit "${label}" ended ${u.status}, so it is not a measurement`);
        else if (!Array.isArray(u.report)) problems.push(`bench unit "${label}" attached no report, so what it measured is unknown`);
        else if (u.slices !== n) problems.push(`bench unit "${label}" reported ${u.slices} slice(s) where the manifest has ${n}`);
      }
    }
  }

  // S6 and S7: measured exactly the expected ids, each once.
  const seen = new Map();
  for (const u of units) for (const r of u.report ?? []) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const omitted = [...expected].filter((id) => !seen.has(id));
  const twice = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  const unexpected = [...seen.keys()].filter((id) => !expected.has(id));
  if (omitted.length) problems.push(`${omitted.length} selected design(s) the bench never measured: ${omitted.join(', ')}`);
  if (twice.length) problems.push(`design(s) measured by more than one unit: ${twice.join(', ')}`);
  if (unexpected.length) problems.push(`design(s) measured that were not selected: ${unexpected.join(', ')}`);

  // S8 and S9 add no failure of their own: an empty unit and a declared vacancy are summarised.
  const emptyUnits = units.filter((u) => Array.isArray(u.report) && u.report.length === 0)
    .map((u) => (u.slices === 1 ? u.category : `${u.category} slice ${u.slice + 1} of ${u.slices}`));
  const summary = {
    mode: scoped ? 'scoped' : 'full',
    selected: selected.length,
    expected: expected.size,
    measured: seen.size,
    categories: expectedCategories.length,
    unitsRun: units.filter((u) => Array.isArray(u.report)).length,
    emptyUnits,
    notBenched: declared.map((id) => ({ id, reason: m.notBenched[categoryOf.get(id)] })),
    results: Object.fromEntries(units.flatMap((u) => u.report ?? []).map((r) => [r.id, r.ok])),
  };
  return { problems, summary };
}

/** One line for the log: what the run measured, against what it was asked to. */
export function describe(summary) {
  const declared = summary.notBenched.length
    ? `; ${summary.notBenched.length} selected design(s) declared not benched (${summary.notBenched.map((d) => d.id).join(', ')})`
    : '';
  const empty = summary.emptyUnits.length ? `; ${summary.emptyUnits.length} unit(s) held none of them` : '';
  return `catalog bench scope (${summary.mode}): measured ${summary.measured} of ${summary.expected} expected design(s) ` +
    `in ${summary.categories} categor(y|ies) over ${summary.unitsRun} unit(s), from ${summary.selected} selected${declared}${empty}`;
}

const fileOf = (test) => String(test.location?.file ?? '').replaceAll('\\', '/');

/** The reporter. It changes a passing run's status to failed when the evidence is incomplete. */
export default class BenchScopeGuard {
  constructor(options = {}) {
    this.active = options._mode !== 'list' && options._mode !== 'merge';
    this.readCatalog = options.readCatalog ?? (async () => (await import('../../scripts/catalog-emit.mjs')).catalogIndex());
    this.env = options.env ?? process.env;
    this.write = options.write ?? ((path, text) => import('node:fs').then((fs) => fs.writeFileSync(path, text)));
    this.log = options.log ?? ((line) => console.log(line));
    this.tests = [];
    this.results = new Map();
  }

  printsToStdio() {
    return false;
  }

  onBegin(_config, suite) {
    this.tests = suite.allTests().filter((t) => fileOf(t).endsWith(`/${BENCH_SPEC}`));
  }

  onTestEnd(test, result) {
    this.results.set(test, result);
  }

  async onEnd(result) {
    if (!this.active || this.tests.length === 0) return;
    let catalog;
    try {
      catalog = await this.readCatalog();
      if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('the catalog read back empty');
    } catch (err) {
      // S10: no oracle, no verdict.
      this.log(`catalog bench scope: could not read the catalog to check the run against (${err?.message ?? err}) - not a verdict`);
      return { status: 'failed' };
    }
    const units = this.tests.map((test) => {
      const unit = test.annotations.find((a) => a.type === REPORT);
      const { category, slice, slices } = unit ? JSON.parse(unit.description) : { category: '?', slice: -1, slices: 0 };
      const res = this.results.get(test);
      const attached = res?.attachments.find((a) => a.name === REPORT && a.body);
      let report = null;
      try {
        report = attached ? JSON.parse(String(attached.body)) : null;
      } catch {
        report = null;
      }
      return { category, slice, slices, status: res?.status ?? 'not run', report: Array.isArray(report) ? report : null };
    });
    const { problems, summary } = benchScopeProblems({ catalog, scope: scopeFromEnv(this.env), units });
    this.log(describe(summary));
    for (const d of summary.notBenched) this.log(`  not benched: ${d.id} - ${d.reason}`);
    const out = this.env.NOACG_CATALOG_BENCH_REPORT;
    if (out) await this.write(out, `${JSON.stringify({ ...summary, problems }, null, 1)}\n`);
    if (problems.length === 0) return;
    this.log(`\ncatalog bench scope: NOT COMPLETE EVIDENCE - the run is failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    if (result.status === 'passed') return { status: 'failed' };
  }
}
