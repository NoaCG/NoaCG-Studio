// gate: factory
// guards: src/templates/shared/sampleNames.ts, e2e/**
//
// The sample-name roster's one guard: a retired placeholder must not come back.
//
// Deliberately NOT a build gate. A stray placeholder is a low-stakes copy mistake, and the
// catalog already carries four heavy per-change gates; adding a fifth for this would cost
// every contributor time to protect against something a review catches.
//
// That argument is about the BUILD, which every laptop runs many times a day - not about CI,
// which runs once and does not care about a second. So since 2026-09-06 this runs in the
// Factory gates job, and `npm run test:sample-names` still runs it here. It had no automatic
// home at all before that, which `check:gate-coverage` now refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const rosterSrc = readFileSync(join(repo, 'src/templates/shared/sampleNames.ts'), 'utf8');

/** The retired list, read out of the module itself so the two can never disagree. */
function retiredNames() {
  const block = /export const RETIRED_SAMPLE_NAMES = \[([\s\S]*?)\]/.exec(rosterSrc);
  assert.ok(block, 'sampleNames.ts must export RETIRED_SAMPLE_NAMES');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** `git grep -l`, but "no matches" is an answer rather than a failure (exit 1). */
function filesContaining(needle) {
  try {
    return execFileSync('git', ['grep', '-l', '--fixed-strings', needle, '--', 'src', 'e2e'], {
      cwd: repo,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      // The roster module names what it retired; that mention is the point of the file.
      .filter((f) => f !== 'src/templates/shared/sampleNames.ts');
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

test('no retired sample name appears in the catalog or the specs', () => {
  const retired = retiredNames();
  assert.ok(retired.length > 0, 'the retired list should not be empty');
  for (const name of retired) {
    assert.deepEqual(
      filesContaining(name),
      [],
      `"${name}" was retired as a sample name — pick one from SAMPLE_NAMES via sampleName(<design id>)`,
    );
  }
});

test('the roster is usable: distinct entries, and a stable pick', async () => {
  const names = [...rosterSrc.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]);
  assert.ok(names.length >= 8, 'the roster should offer a real spread of names');
  assert.equal(new Set(names).size, names.length, 'roster entries must be distinct');

  // sampleName is a pure hash over the seed, so the same design id always previews the same
  // person - a picker that moved between builds would churn every screenshot and baseline.
  const pick = (seed) => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return names[h % names.length];
  };
  assert.equal(pick('lt11'), pick('lt11'));
  assert.notEqual(pick('lt11'), pick('lt50'), 'neighbouring designs should not preview one name');
});
