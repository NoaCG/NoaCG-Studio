// gate: workflow weekly-audit.yml
// guards: src/assets/**
//
// The VENDORED-DEPENDENCY freshness check: everything this repo ships that npm cannot see.
//
// Why this exists: `npm outdated` and `npm audit` only know about entries in package.json. The
// two libraries that reach EVERY user's exported graphic are not entries — GSAP and the Lottie
// player are committed files under src/assets/, bundled locally because a generated template
// must play offline with no CDN reference (`root/keep-generated-template-self-contained-runtime`).
// Nothing warns when they go stale, and nothing did: GSAP sat at 3.10.4 while upstream reached 3.15.0, so every
// exported template carried a five-minor-versions-old runtime.
//
// Usage:
//   node scripts/check-vendored-versions.mjs           # exit 1 if anything is behind or due
//   node scripts/check-vendored-versions.mjs --json    # machine-readable report on stdout
//
// This is NOT in the build gate. It is a time-driven check (weekly-audit.yml) — the answer
// changes when upstream publishes, not when someone commits, so running it per push would only
// re-prove the previous run. Nothing here edits a file; upgrading a vendored library is a
// deliberate human step, because the bundled copy is the one users get and the es2017 output
// floor (docs/CLOUD_PLAYOUT.md §3, CasparCG 2.3.x) has to be re-checked when it moves.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The vendored files, each with the banner pattern that carries its version and the npm package
 * the upstream release is published as.
 *
 * The pattern reads the file's OWN banner rather than a number recorded beside it: a version
 * written down separately is a second source of truth, and it goes stale exactly when someone
 * updates the library without updating the note — which is the failure this check exists to
 * catch.
 */
const VENDORED = [
  {
    id: 'gsap',
    file: 'src/assets/gsap.min.js',
    pattern: /GSAP (\d+\.\d+\.\d+)/,
    npm: 'gsap',
    note: 'ships inside every exported template',
  },
  {
    id: 'lottie',
    file: 'src/assets/lottie.min.js',
    pattern: /lottie-web v(\d+\.\d+\.\d+)/,
    npm: 'lottie-web',
    note: 'lottie_light build — injected only when a template uses a Lottie asset',
  },
  // Vendored by a DEPENDENCY rather than by us, which is why no other tool sees it. monaco's ESM
  // build — the one Vite bundles — imports ./dompurify/dompurify.js by relative path and never
  // imports the npm `dompurify` package, so `npm ls` and `npm audit` both describe a different
  // artefact. Since 2026-08-04 an override pins that npm entry to a patched release and audit
  // reports zero, which makes this row the only thing left that can say what actually ships.
  {
    id: 'dompurify',
    file: 'node_modules/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js',
    pattern: /DOMPurify\.version = '(\d+\.\d+\.\d+)'/,
    npm: 'dompurify',
    note: 'the sanitizer monaco actually runs (hover + suggest markdown); moves only when monaco does',
    // The banner sits well past the first few KB of a big file, unlike the two minified bundles.
    scan: Infinity,
    // node_modules is not committed, so a checkout without an install has nothing to read. That
    // is "not checked", never "current" — the same rule check-model-ids.mjs applies to a missing
    // provider key.
    optional: true,
    // REPORTED, never a failure. We cannot fix this file: it moves only when monaco publishes a
    // release that vendors a newer copy. A row that goes red the moment upstream diverges, and
    // stays red for months with no action available, is precisely the standing alarm this
    // project refuses to keep (docs/STACK_FRESHNESS.md, Group 1).
    advisory: true,
  },
];

/**
 * Things with no machine-readable version at all, reviewed on a calendar instead.
 *
 * A woff2 carries no version, and the bundled faces' provenance already lives in ONE place
 * (src/assets/OFL.txt, which names every upstream project) — duplicating it here would create
 * the second source of truth src/export/AGENTS.md exists to prevent. So these entries record
 * only WHEN someone last looked, which is the one fact nothing else in the repo holds.
 *
 * Update `lastReviewed` when you actually check, not when the reminder fires.
 */
const MANUAL_REVIEW = [
  {
    id: 'bundled-fonts',
    what: 'the 7 woff2 faces in public/fonts (upstream projects listed in src/assets/OFL.txt)',
    whyNoVersion: 'a woff2 carries no version string, and the upstream projects tag irregularly',
    lastReviewed: '2026-08-03',
    intervalDays: 180,
  },
  {
    // Owner, 2026-09-05, dropping this from the walk queue: "Gsap verification: not yet. Remove
    // it from the list. Remind me in 6 months." A licence answer has no version and no commit -
    // it arrives when a person at Webflow writes back - so a calendar row is the only thing that
    // can carry it. The clause: GSAP's prohibited uses cover tools "that allow users to build
    // visual animations without code", which is what this product is
    // (docs/OGRAF_FIRST_REVIEW.md §11). Until an answer exists the standing requirement is
    // unchanged: preserve replaceability.
    id: 'gsap-licence',
    what:
      'written clarification from Webflow/GSAP on the prohibited-uses clause - his to ask, and only his',
    whyNoVersion: 'a licence question is answered by a person, and nothing in git moves when it is',
    lastReviewed: '2026-09-05',
    intervalDays: 180,
  },
  {
    id: 'supabase-postgres',
    what: "the production project's Postgres version (dashboard → Infrastructure)",
    whyNoVersion: 'a platform upgrade is a dashboard action and never appears in git',
    lastReviewed: '2026-08-03',
    intervalDays: 180,
  },
];

/**
 * Read a vendored file's own version banner.
 *
 * Returns `{ version }`, `{ absent: true }` for an OPTIONAL file that is simply not there, or
 * `{ error }` when the file exists but says nothing this pattern recognises.
 *
 * It RETURNS the failure instead of throwing on purpose. The caller is mid-way through awaited
 * registry fetches, and an exception escaping there kills the process while a socket handle is
 * still closing — which on Windows surfaces as `Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)` and no usable exit code, hiding the very message that would explain the
 * problem. Same hazard as the `process.exitCode` note at the foot of this file, reached by a
 * different route.
 */
const readVendored = ({ file, pattern, scan = 4000, optional = false }) => {
  let text;
  try {
    text = readFileSync(resolve(root, file), 'utf8');
  } catch {
    if (optional) return { absent: true };
    return { error: `missing vendored file ${file}` };
  }
  const found = (Number.isFinite(scan) ? text.slice(0, scan) : text).match(pattern);
  // A present file with no banner is a fault whether or not the entry is optional: it means the
  // upstream layout moved and this row has quietly stopped measuring anything.
  if (!found) return { error: `no version banner matching ${pattern} in ${file}` };
  return { version: found[1] };
};

const latestOnNpm = async (pkg) => {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${pkg}`);
  return (await res.json()).version;
};

/** -1 / 0 / 1, comparing plain three-part versions. Vendored releases never carry prereleases. */
const compare = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
};

const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

const findings = [];
// Advisory rows say something true that nobody here can act on, so they are printed but never
// added to `findings` - they must not decide the exit code.
const notes = [];
const report = { vendored: [], manual: [] };

measured(VENDORED.length, 'vendored libraries');

for (const entry of VENDORED) {
  const read = readVendored(entry);
  if (read.error) {
    // A row that cannot measure anything is a FINDING even for an advisory entry: the advisory
    // flag says "we cannot act on this version", never "we do not mind if this stops working".
    report.vendored.push({ id: entry.id, file: entry.file, have: null, latest: null, state: 'broken' });
    findings.push(`${entry.id} cannot be read — ${read.error}`);
    continue;
  }
  const have = read.version ?? null;
  if (have === null) {
    // Not checked is not clean. Say so on its own line rather than omitting the row, or an
    // uninstalled checkout would print a report that looks complete.
    report.vendored.push({ id: entry.id, file: entry.file, have: null, latest: null, state: 'not-checked' });
    notes.push(`${entry.id} NOT CHECKED — ${entry.file} is absent (run npm install first)`);
    continue;
  }
  // An unreachable registry FAILS rather than passing quietly. This check runs on a schedule
  // with network; a silent skip would read as "checked, fine" every week forever.
  const latest = await latestOnNpm(entry.npm);
  const order = compare(have, latest);
  const state = order < 0 ? 'behind' : order > 0 ? 'ahead' : 'current';
  report.vendored.push({ id: entry.id, file: entry.file, have, latest, state, advisory: !!entry.advisory });
  const into = entry.advisory ? notes : findings;
  if (state === 'behind') {
    into.push(`${entry.id} ${have} → ${latest} available (${entry.file}) — ${entry.note}`);
  } else if (state === 'ahead') {
    into.push(
      `${entry.id} ${have} is NEWER than the published ${latest} (${entry.file}) — a prerelease ` +
        'or a hand-edited banner; either way the bundled copy is not a released version',
    );
  }
}

for (const entry of MANUAL_REVIEW) {
  const age = daysSince(entry.lastReviewed);
  const due = age >= entry.intervalDays;
  report.manual.push({ id: entry.id, lastReviewed: entry.lastReviewed, ageDays: age, due });
  if (due) {
    findings.push(
      `${entry.id} last reviewed ${entry.lastReviewed} (${age} days ago, every ` +
        `${entry.intervalDays}) — ${entry.what}`,
    );
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings, notes, ...report }, null, 2));
} else {
  for (const row of report.vendored) {
    if (row.state === 'not-checked') {
      console.log(`??  ${row.id.padEnd(10)} NOT CHECKED — no ${row.file}`);
      continue;
    }
    if (row.state === 'broken') {
      console.log(`ERR ${row.id.padEnd(10)} unreadable — ${row.file}`);
      continue;
    }
    // An advisory row that is behind reads FYI, not DUE: nothing here can act on it.
    const mark = row.state === 'current' ? 'ok  ' : row.advisory ? 'fyi ' : 'DUE ';
    console.log(`${mark}${row.id.padEnd(10)} vendored ${row.have.padEnd(9)} latest ${row.latest}`);
  }
  for (const row of report.manual) {
    console.log(
      `${row.due ? 'DUE ' : 'ok  '}${row.id.padEnd(18)} last reviewed ${row.lastReviewed} ` +
        `(${row.ageDays}d)`,
    );
  }
  if (findings.length) {
    console.log('\nNeeds attention:');
    for (const line of findings) console.log(`  - ${line}`);
  }
  if (notes.length) {
    console.log('\nWorth knowing (nothing to do here):');
    for (const line of notes) console.log(`  - ${line}`);
  }
}

// `process.exitCode`, never `process.exit()` — see the note in scripts/check-model-ids.mjs: an
// exit forced while a fetch handle is still closing trips a libuv assertion on Windows.
process.exitCode = findings.length ? 1 : 0;
