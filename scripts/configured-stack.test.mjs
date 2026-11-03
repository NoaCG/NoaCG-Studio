// The configured stack's allocation and isolation rules (cf04): pure parts, no Docker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holding, isStackProcess, parseRanges, projectIdOf, reservedValue, setTomlKey, slotConfig, slotPorts, socketsOn, SLOTS } from './configured-stack.mjs';

test('slot 0 is the CLI default block and every slot block is disjoint', () => {
  const p = slotPorts(0);
  assert.deepEqual([p.shadow, p.api, p.db, p.studio, p.inbucket, p.analytics, p.pooler], [54320, 54321, 54322, 54323, 54324, 54327, 54329]);
  const seen = new Set();
  for (let s = 0; s < SLOTS; s++) {
    const b = slotPorts(s);
    for (let x = b.first; x <= b.last; x++) { assert.ok(!seen.has(x), `port ${x} in two slots`); seen.add(x); }
    for (const k of ['shadow', 'api', 'db', 'studio', 'inbucket', 'analytics', 'pooler']) assert.ok(b[k] >= b.first && b[k] <= b.last);
  }
  assert.throws(() => slotPorts(SLOTS));
  assert.throws(() => slotPorts(-1));
});

test('the slot config renames the project and moves every published port into the block', () => {
  const source = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const out = slotConfig(source, 3);
  assert.match(out, /^project_id = "noacg-studio-s3"$/m);
  assert.equal(projectIdOf(3), 'noacg-studio-s3');
  const table = (name) => {
    const lines = out.split('\n');
    const i = lines.findIndex((l) => l.trim() === `[${name}]`);
    assert.ok(i >= 0, `[${name}] missing`);
    const end = lines.findIndex((l, j) => j > i && /^\s*\[/.test(l));
    return lines.slice(i + 1, end === -1 ? undefined : end).join('\n');
  };
  assert.match(table('api'), /^port = 54621$/m);
  assert.match(table('db'), /^port = 54622$/m);
  assert.match(table('db'), /^shadow_port = 54620$/m);
  assert.match(table('studio'), /^port = 54623$/m);
  assert.match(table('inbucket'), /^port = 54624$/m);
  assert.match(table('analytics'), /^port = 54627$/m);
  assert.match(table('analytics'), /^vector_port = 54628$/m);
  assert.match(table('db.pooler'), /^port = 54629$/m);
  // Nothing else moved: the rest of the file is the source line for line.
  const strip = (t) => t.split('\n').filter((l) => !/^\s*(project_id|port|shadow_port|vector_port)\s*=/.test(l) && !/^\[(inbucket|analytics|db\.pooler)\]$/.test(l.trim()) && l.trim() !== '');
  assert.deepEqual(strip(out), strip(source));
  // And no default port survives anywhere a key sets one.
  assert.doesNotMatch(out, /^\s*\w*port\s*=\s*543\d\d/m);
});

test('setTomlKey edits in its own table only, adds a missing key and appends a missing table', () => {
  const t = 'a = 1\n[x]\nport = 1 # c\n[y]\nport = 2\n';
  assert.equal(setTomlKey(t, 'y', 'port', 9), 'a = 1\n[x]\nport = 1 # c\n[y]\nport = 9\n');
  assert.equal(setTomlKey(t, 'x', 'shadow', 5), 'a = 1\n[x]\nshadow = 5\nport = 1 # c\n[y]\nport = 2\n');
  assert.equal(setTomlKey(t, 'z', 'port', 3), 'a = 1\n[x]\nport = 1 # c\n[y]\nport = 2\n\n[z]\nport = 3\n');
  assert.equal(setTomlKey(t, '', 'a', 'v'), 'a = "v"\n[x]\nport = 1 # c\n[y]\nport = 2\n');
  assert.equal(setTomlKey('[x]\n', '', 'b', 2), 'b = 2\n[x]\n');
});

test('the reservation keeps other ranges and holds exactly the claimed blocks', () => {
  assert.deepEqual(parseRanges(''), []);
  assert.deepEqual(parseRanges('8080,54320-54329'), [[8080, 8080], [54320, 54329]]);
  assert.equal(reservedValue('', [0]), '54320-54329');
  assert.equal(reservedValue('8080', [0, 1]), '8080,54320-54329,54420-54429');
  // A released slot's block goes; a port between blocks (not ours) stays.
  assert.equal(reservedValue('54320-54329,54335,54420-54429', [1]), '54335,54420-54429');
  assert.equal(reservedValue('54320-54329', []), '');
});

const SS = [
  'ESTAB      0 0 10.1.0.4:54322   140.82.112.21:443 users:(("dockerd",pid=812,fd=40))',
  'TIME-WAIT  0 0 10.1.0.4:54327   52.1.2.3:443',
  'LISTEN     0 4096 0.0.0.0:54321 0.0.0.0:*',
  'LISTEN     0 4096 [::]:54421    [::]:*',
  'ESTAB      0 0 127.0.0.1:41000  127.0.0.1:54322 users:(("node",pid=9,fd=3))',
].join('\n');

test('the free check sees a socket on a block port in any state, by its LOCAL port only', () => {
  const on0 = socketsOn(SS, 54320, 54329);
  assert.equal(on0.length, 3); // the client to 54322 uses local port 41000: not on the block
  assert.ok(on0.some((l) => l.startsWith('TIME-WAIT')));
  assert.deepEqual(socketsOn(SS, 54420, 54429).map((l) => l.split(/\s+/)[0]), ['LISTEN']);
  assert.deepEqual(socketsOn(SS, 54520, 54529), []);
});

test('a port is held by a listener or an owned socket, not by an ownerless TIME_WAIT', () => {
  const held = holding(socketsOn(SS, 54320, 54329));
  assert.equal(held.length, 2);
  assert.ok(held.every((l) => !l.startsWith('TIME-WAIT')));
});

test('only a supabase CLI process of this workdir is the stack\'s, not every process carrying the job env', () => {
  const env = (w) => `PATH=/usr/bin\0SUPABASE_WORKDIR=${w}\0HOME=/home/runner`;
  const w = '/tmp/noacg-configured-stacks/slot-0';
  assert.equal(isStackProcess('supabase\n', env(w), w), true);
  assert.equal(isStackProcess('bash\n', env(w), w), false); // the step's shell inherits SUPABASE_WORKDIR
  assert.equal(isStackProcess('node\n', env(w), w), false);
  assert.equal(isStackProcess('supabase\n', env('/tmp/noacg-configured-stacks/slot-1'), w), false);
  assert.equal(isStackProcess('supabase\n', env(`${w}0`), w), false);
});
