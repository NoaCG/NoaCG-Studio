// gate: workflow weekly-audit.yml
// guards: src/export/**, scripts/ograf-schema-baseline.json
//
// The OGraf CONFORMANCE report: our manifests, and our transcription of the spec, checked
// against the EBU's PUBLISHED JSON-Schema files with a real JSON-Schema engine.
//
// Why this exists. `src/export/targets/ografSchema.ts` transcribes the seven published schema
// files into a hand-written validator, because shipping a JSON-Schema engine into the browser
// bundle for one manifest would be the "no unnecessary dependencies" rule read backwards. That
// transcription is the export gate: every OGraf and LiveOS package is refused if it fails.
// A transcription has exactly one failure mode - it can drift from what it transcribes - and
// nothing in this repository could see that drift, because the source of truth is on somebody
// else's web server.
//
// The drift is TIME-driven, not commit-driven: it happens when the EBU publishes, which is why
// this is a weekly report beside check:vendored and check:models rather than a build gate. It
// fetches the network, so it must never be able to fail a build (docs/STACK_FRESHNESS.md).
//
// The same check was run by hand once (2026-08-18, then again 2026-08-26 - docs/OGRAF.md), with
// the harness thrown away afterwards. This is that harness, kept.
//
// What it reports, in order:
//
//   1. DRIFT - a sha256 per published file against scripts/ograf-schema-baseline.json, which
//      records the bytes ografSchema.ts was transcribed from. A change here is the signal to
//      re-read the diff and re-transcribe; nothing else in the repo can produce it.
//   2. CORPUS - every *.ograf.json in the repo (plus any directory passed with --from)
//      validated against the published files by ajv, draft 2020-12.
//   3. AGREEMENT - the same manifests, and a battery of MUTATIONS of them, put through BOTH
//      ajv and our transcription. Two validators that answer differently is the drift made
//      concrete: the mutation battery is what makes "0 rejected" a result rather than a
//      harness that accepts anything.
//
// One disagreement is EXPECTED and is recorded as such rather than reported as a fault: a
// duplicate `customActions` id passes the published schema (JSON Schema cannot express
// uniqueness across a keyed array) and our transcription refuses it, because a renderer that
// registers actions by id would silently lose one. That is the strictness the standard's own
// files cannot carry, and it is deliberate.
//
// Usage:
//   node scripts/check-ograf-schema.mjs                 # human report; exit 1 on a real defect
//   node scripts/check-ograf-schema.mjs --json          # machine-readable report on stdout
//   node scripts/check-ograf-schema.mjs --from <dir>    # also validate manifests under <dir>
//   node scripts/check-ograf-schema.mjs --record        # re-record the drift baseline
//
// Exit 1 for: a corpus manifest the published schema refuses, an unexpected disagreement
// between the two validators, a mutation neither validator catches, or drift against the
// recorded baseline. Exit 0 - with the reason printed - when the schemas cannot be fetched:
// "could not check" is not "clean", but a network outage is not a defect in this repository.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv/dist/2020.js';
import { transform } from 'sucrase';

import { measured } from './measured.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, 'scripts', 'ograf-schema-baseline.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const record = args.includes('--record');
const extraRoots = args.flatMap((a, i) => (a === '--from' && args[i + 1] ? [resolve(args[i + 1])] : []));

/** The published root. Everything else is discovered by following its `$ref`s. */
const ROOT_SCHEMA = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

/** ajv carries the draft 2020-12 meta-schemas itself; fetching them would only be slower. */
const isMeta = (url) => url.startsWith('https://json-schema.org/');

// ── fetch the published schema files ─────────────────────────────────────────

/**
 * Crawl the published schemas from the root, following every external `$ref`. Discovery
 * rather than a hard-coded list of seven: if a spec revision splits a file, the report
 * follows it instead of quietly checking a subset.
 */
async function fetchSchemas() {
  const files = new Map();
  const queue = [ROOT_SCHEMA];
  while (queue.length) {
    const url = queue.shift();
    if (files.has(url) || isMeta(url)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const text = await res.text();
    files.set(url, text);
    const parsed = JSON.parse(text);
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string' && !node.$ref.startsWith('#')) {
        queue.push(new URL(node.$ref.split('#')[0], url).href);
      }
      for (const value of Object.values(node)) walk(value);
    })(parsed);
  }
  return files;
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// ── our own transcription, run outside the browser bundle ────────────────────

/**
 * `ografSchema.ts` is import-free by design, so it transpiles to a module on its own. Loading
 * the REAL file (rather than a copy kept here) is the whole point: a copy would drift from the
 * validator the export gate actually runs, which is the failure this script exists to catch.
 */
async function loadTranscription() {
  const source = readFileSync(join(root, 'src', 'export', 'targets', 'ografSchema.ts'), 'utf8');
  const { code } = transform(source, { transforms: ['typescript'], disableESTransforms: true });
  const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  return import(url);
}

// ── the corpus ───────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report']);

function findManifests(dir, out = []) {
  let entries;
  try {
    // withFileTypes so a symlink reads as a symlink rather than as whatever it points at: a
    // link back up the tree would otherwise recurse until the weekly job times out.
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(full, out);
    else if (entry.isFile() && entry.name.endsWith('.ograf.json')) out.push(full);
  }
  return out;
}

// ── the mutation battery ─────────────────────────────────────────────────────

/**
 * Each mutation breaks a rule the spec's own files encode, and each is a mistake a generator
 * can make silently. `sharedLimit: true` marks the one the PUBLISHED schema cannot catch - it
 * is recorded, not reported as a fault, and our transcription is required to catch it instead.
 */
const MUTATIONS = [
  {
    id: 'vendor-field-unprefixed',
    why: 'a field we invented that the spec does not define, without the required "v_" prefix',
    apply: (m) => ({ ...m, noacg: { anything: true } }),
  },
  {
    id: 'missing-main',
    why: 'no entry point - the renderer has nothing to import',
    apply: (m) => {
      const out = { ...m };
      delete out.main;
      return out;
    },
  },
  {
    id: 'default-typed-against-property',
    why: 'a "number" property defaulting to a string - a host either refuses it or silently coerces',
    apply: (m) => withProperty(m, { type: 'number', title: 'Bad', default: 'nope' }),
  },
  {
    id: 'null-where-a-number-belongs',
    why: 'JSON null in a numeric slot',
    apply: (m) => withProperty(m, { type: 'number', title: 'Bad', default: null }),
  },
  {
    id: 'unknown-constraint-key',
    why: 'a renderRequirements constraint key that is not min/max/exact/ideal',
    apply: (m) => ({
      ...m,
      renderRequirements: [{ resolution: { width: { roughly: 1920 } } }],
    }),
  },
  {
    id: 'fractional-duration',
    why: 'actionDurations counted in whole milliseconds',
    apply: (m) => ({ ...m, actionDurations: { play: 1000.5 } }),
  },
  {
    id: 'negative-step-count',
    why: 'a graphic claiming a negative number of steps',
    apply: (m) => ({ ...m, stepCount: -2 }),
  },
  {
    id: 'duplicate-custom-action-id',
    why: 'two custom actions sharing an id - a renderer that registers by id loses one',
    sharedLimit: true,
    apply: (m) => ({
      ...m,
      customActions: [...(m.customActions ?? []), { ...(m.customActions?.[0] ?? { id: 'x', name: 'X' }) }],
    }),
  },
];

function withProperty(manifest, property) {
  return {
    ...manifest,
    schema: {
      ...manifest.schema,
      properties: { ...(manifest.schema?.properties ?? {}), noacgMutant: property },
    },
  };
}

// ── run ──────────────────────────────────────────────────────────────────────

const report = {
  checked: false,
  reason: null,
  drift: { changed: [], added: [], removed: [], baselineRecorded: null },
  corpus: [],
  mutations: [],
  disagreements: [],
};

let schemas;
try {
  schemas = await fetchSchemas();
  report.checked = true;
} catch (err) {
  report.reason = String(err.message ?? err);
}

if (report.checked) {
  // The crawl follows `$ref`s from one root URL, so a spec revision that moves that root would
  // leave this holding nothing to compare digests against.
  measured(schemas.size, 'ograf schema files');

  // 1. drift against the recorded baseline
  const digests = Object.fromEntries([...schemas].map(([url, text]) => [url, { sha256: sha256(text), bytes: text.length }]));
  if (record) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), specVersion: 'v1', files: digests }, null, 2)}\n`,
      'utf8',
    );
    report.drift.baselineRecorded = BASELINE;
  } else {
    let baseline;
    try {
      baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    } catch {
      // No baseline yet (or an unreadable one): every file reports as NEW, which is the correct
      // first-run verdict — "not recorded" is not "unchanged".
      baseline = { files: {} };
    }
    for (const [url, digest] of Object.entries(digests)) {
      const known = baseline.files?.[url];
      if (!known) report.drift.added.push(url);
      else if (known.sha256 !== digest.sha256) report.drift.changed.push({ url, was: known.sha256, now: digest.sha256 });
    }
    for (const url of Object.keys(baseline.files ?? {})) {
      if (!digests[url]) report.drift.removed.push(url);
    }
  }

  // 2. compile the published files
  const ajv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true });
  for (const [url, text] of schemas) {
    const parsed = JSON.parse(text);
    ajv.addSchema(parsed, parsed.$id ?? url);
  }
  const validate = ajv.getSchema(ROOT_SCHEMA);
  if (!validate) throw new Error(`ajv could not resolve ${ROOT_SCHEMA}`);
  const published = (manifest) => (validate(manifest) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`));

  // 3. our transcription
  const { validateOgrafManifest } = await loadTranscription();

  // 4. the corpus
  const manifests = [...new Set([root, ...extraRoots].flatMap((dir) => findManifests(dir)))];
  measured.optional(
    manifests.length,
    'ograf manifests',
    'A checkout that ships no *.ograf.json still has the published schemas to compare digests ' +
      'against, and the corpus and the mutation battery are skipped rather than answered from an ' +
      'empty set - pass --from <dir> to check an exported package.',
  );
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const where = relative(root, file).replaceAll('\\', '/');
    const byPublished = published(manifest);
    const byOurs = validateOgrafManifest(manifest);
    report.corpus.push({ file: where, publishedErrors: byPublished, ourErrors: byOurs });
    if (byPublished.length === 0 && byOurs.length > 0) {
      report.disagreements.push({ case: where, note: 'ours refuses a manifest the published schema accepts', ourErrors: byOurs });
    }
    if (byPublished.length > 0 && byOurs.length === 0) {
      report.disagreements.push({ case: where, note: 'ours accepts a manifest the published schema refuses', publishedErrors: byPublished });
    }
  }

  // 5. the mutation battery, applied to every valid corpus manifest.
  //
  // With no valid base to mutate there is nothing to conclude, and saying so is the only honest
  // answer: "no mutation was rejected" out of an empty set is not evidence that either validator
  // has gone lax. The battery is skipped and the report says the corpus is empty instead.
  const bases = report.corpus.filter((row) => row.publishedErrors.length === 0 && row.ourErrors.length === 0);
  for (const mutation of bases.length ? MUTATIONS : []) {
    const rows = [];
    for (const base of bases) {
      const manifest = mutation.apply(JSON.parse(readFileSync(join(root, base.file), 'utf8')));
      rows.push({
        base: base.file,
        publishedRejects: published(manifest).length > 0,
        oursRejects: validateOgrafManifest(manifest).length > 0,
      });
    }
    // `every` over a non-empty set: the loop does not run without a base to mutate.
    const publishedRejects = rows.every((r) => r.publishedRejects);
    const oursRejects = rows.every((r) => r.oursRejects);
    report.mutations.push({ id: mutation.id, why: mutation.why, sharedLimit: !!mutation.sharedLimit, publishedRejects, oursRejects, cases: rows.length });

    if (mutation.sharedLimit) {
      // Expected: the published schema cannot express it, and ours must.
      if (!oursRejects) {
        report.disagreements.push({ case: mutation.id, note: 'ours no longer catches what the published schema structurally cannot' });
      }
    } else if (!publishedRejects) {
      report.disagreements.push({ case: mutation.id, note: 'the published schema no longer refuses this - the spec may have loosened' });
    } else if (!oursRejects) {
      report.disagreements.push({ case: mutation.id, note: 'the published schema refuses this and ours does not - the transcription has drifted' });
    }
  }
}

const driftCount = report.drift.changed.length + report.drift.added.length + report.drift.removed.length;
const badManifests = report.corpus.filter((row) => row.publishedErrors.length > 0);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (!report.checked) {
  console.log('NOT CHECKED - the published OGraf schemas could not be fetched.');
  console.log(`  ${report.reason}`);
  console.log('\n"Could not check" is not "clean". Re-run when the network is back.');
} else if (report.drift.baselineRecorded) {
  console.log(`Recorded ${schemas.size} published schema files into ${relative(root, BASELINE).replaceAll('\\', '/')}.`);
} else {
  console.log(`${schemas.size} published OGraf schema files fetched from ograf.ebu.io.\n`);

  console.log('Drift against the bytes ografSchema.ts was transcribed from:');
  if (driftCount === 0) console.log('  ok   every published file is byte-identical to the baseline');
  for (const row of report.drift.changed) console.log(`  DIFF ${row.url}`);
  for (const url of report.drift.added) console.log(`  NEW  ${url} (not in the baseline)`);
  for (const url of report.drift.removed) console.log(`  GONE ${url} (in the baseline, no longer published)`);

  console.log('\nManifests, against the published files (ajv, draft 2020-12):');
  for (const row of report.corpus) {
    console.log(`  ${row.publishedErrors.length === 0 ? 'ok  ' : 'FAIL'} ${row.file}`);
    for (const error of row.publishedErrors) console.log(`       ${error}`);
  }
  if (report.corpus.length === 0) console.log('  (no *.ograf.json found - pass --from <dir> to check an exported package)');

  console.log('\nMutation battery - what each validator refuses:');
  if (report.mutations.length === 0) console.log('  (skipped - no valid manifest to mutate)');
  for (const row of report.mutations) {
    const mark = row.sharedLimit
      ? `${row.oursRejects ? 'ok  ' : 'FAIL'} (published: cannot express it; ours: ${row.oursRejects ? 'refuses' : 'ACCEPTS'})`
      : `${row.publishedRejects && row.oursRejects ? 'ok  ' : 'FAIL'} (published: ${row.publishedRejects ? 'refuses' : 'ACCEPTS'}; ours: ${row.oursRejects ? 'refuses' : 'ACCEPTS'})`;
    console.log(`  ${mark} ${row.id} - ${row.why}`);
  }

  if (report.disagreements.length) {
    console.log('\nDISAGREEMENTS (this is the drift this report exists to find):');
    for (const row of report.disagreements) console.log(`  - ${row.case}: ${row.note}`);
  }
  if (driftCount) {
    console.log('\nThe published schemas moved. Read the diff, update src/export/targets/ografSchema.ts');
    console.log('if a rule changed, then re-record: node scripts/check-ograf-schema.mjs --record');
  }
}

// `process.exitCode`, never `process.exit()`: forcing exit while a fetch handle is still closing
// trips a libuv assertion on Windows and the run reports 127 instead of the verdict.
process.exitCode = report.checked && !record && (driftCount > 0 || badManifests.length > 0 || report.disagreements.length > 0) ? 1 : 0;
