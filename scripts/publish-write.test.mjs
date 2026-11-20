// guards: src/control/hostedControl.ts
//
// THE PRESS'S COMPARE-AND-SET READS THE SMALL COLUMN (#2616, docs/work-specs/live-publishing/
// evidence/fix-2616.md, R1). A whole publish reads the stored stamp and lands only over it. Reading
// or matching it inside `output` makes the database decompress the whole multi-megabyte payload to
// learn one number; `published_ver` (0118) holds the same stamp. Read and filter use one column; an
// instance behind 0118 (42703 naming the column) falls back once to the payload's stamp, and no
// other error is retried here.
//
// A recording client stands in for supabase-js: each request is the chain of calls made on it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'publish-write-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** A fresh copy of the module, so the per-page fallback starts unset in each test. */
async function load() {
  const entry = path.join(dir, `entry-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(entry, `export { readPublishedWhole, writeControlShow } from ${JSON.stringify(path.join(root, 'src/control/hostedControl.ts'))};`);
  const bundle = await rolldown({ input: entry, platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = `${entry}.mjs`;
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

/** Answers each request with the next of `answers` ({ data, error }) and records its calls. */
function client(answers) {
  const requests = [];
  return {
    requests,
    from(table) {
      const calls = [['from', table]];
      requests.push(calls);
      const chain = new Proxy({}, {
        get(_, name) {
          if (name === 'then') {
            const answer = answers.shift() ?? { data: null, error: null };
            return (resolve) => resolve(answer);
          }
          return (...args) => { calls.push([name, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
}

/** Every column a request names in a select or a filter. */
const named = (calls) => calls.filter(([m]) => ['select', 'eq', 'is'].includes(m)).map(([m, a]) => `${m}:${a}`);
const touchesOutput = (calls) => named(calls).some((n) => n.includes('output->ver'));

test('the press reads the stamp from published_ver and lands only over its number there', async () => {
  const { readPublishedWhole, writeControlShow } = await load();
  const sb = client([{ data: { ver: { n: 4 }, scenes: [], panel: [] }, error: null }, { data: [{ id: 'p' }], error: null }]);
  const prev = await readPublishedWhole(sb, 'p');
  assert.deepEqual(prev.ver, { n: 4 });
  assert.equal(await writeControlShow(sb, { id: 'p', output: { ver: { n: 5 } } }, { exists: true, n: 4 }), null);
  const [read, write] = sb.requests;
  assert.ok(named(read).some((n) => n.startsWith('select:ver:published_ver,')), named(read).join(' '));
  assert.ok(named(write).includes('eq:published_ver->>n'), named(write).join(' '));
  for (const calls of sb.requests) assert.ok(!touchesOutput(calls), `reads the stamp inside output: ${named(calls).join(' ')}`);
});

test('a row published before stamps is matched by a null published_ver, and another landing first answers moved', async () => {
  const { writeControlShow } = await load();
  const sb = client([{ data: [], error: null }]);
  assert.equal(await writeControlShow(sb, { id: 'p', output: {} }, { exists: true, n: null }), 'moved');
  assert.deepEqual(sb.requests[0].find(([m]) => m === 'is'), ['is', 'published_ver', null]);
  assert.ok(!touchesOutput(sb.requests[0]));
});

test('an instance behind 0118 falls back once to the payload stamp, for the read and the write', async () => {
  const { readPublishedWhole, writeControlShow } = await load();
  const missing = { data: null, error: { code: '42703', message: 'column control_shows.published_ver does not exist' } };
  const sb = client([missing, { data: { ver: { n: 2 } }, error: null }, { data: [{ id: 'p' }], error: null }]);
  assert.deepEqual((await readPublishedWhole(sb, 'p')).ver, { n: 2 });
  assert.equal(await writeControlShow(sb, { id: 'p', output: {} }, { exists: true, n: 2 }), null);
  assert.equal(sb.requests.length, 3, 'one retry, then the write');
  assert.ok(named(sb.requests[1]).some((n) => n.startsWith('select:ver:output->ver,')));
  assert.ok(named(sb.requests[2]).includes('eq:output->ver->>n'));

  // The write meeting it first falls back the same way, once.
  const fresh = await load();
  const sb2 = client([missing, { data: [{ id: 'p' }], error: null }]);
  assert.equal(await fresh.writeControlShow(sb2, { id: 'p', output: {} }, { exists: true, n: 2 }), null);
  assert.equal(sb2.requests.length, 2);
  assert.ok(named(sb2.requests[1]).includes('eq:output->ver->>n'));
});

test('a refusal or any other error is reported as it is and never retried by the fallback', async () => {
  const { readPublishedWhole, writeControlShow } = await load();
  const refusal = { code: 'P0001', message: 'Reload this page to edit' };
  const sb = client([{ data: null, error: refusal }]);
  assert.deepEqual(await writeControlShow(sb, { id: 'p', output: {} }, { exists: true, n: 1 }), refusal);
  assert.equal(sb.requests.length, 1);

  const other = { code: '42703', message: 'column control_shows.collections does not exist' };
  const sb2 = client([{ data: null, error: other }]);
  assert.deepEqual(await writeControlShow(sb2, { id: 'p', output: {} }, { exists: true, n: 1 }), other);
  assert.equal(sb2.requests.length, 1);

  const sb3 = client([{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }]);
  await assert.rejects(readPublishedWhole(sb3, 'p'), /statement timeout/);
  assert.equal(sb3.requests.length, 1);
});
