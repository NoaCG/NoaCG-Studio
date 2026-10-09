// gate: build
// guards: cli/scripts/toolkit-distribution.mjs, cli/scripts/build-skill.mjs, cli/plugin/**, cli/plugin-mcp/**, cli/skill/**, cli/NOTICE, cli/LICENSE, cli/package.json, cli/package-lock.json, cli/src/mcp.ts, .github/workflows/release-cli.yml
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { assemble, ROOT, validateArchiveLimits, validatePackage, validatePaths, writeDistribution, zip } from '../cli/scripts/toolkit-distribution.mjs';

const result = assemble(ROOT, 'a'.repeat(40));
const { version } = result.report;
const options = { host: 'claude', name: 'noacg', version };
function scratch(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-toolkit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('every independent ZIP extracts with verified CRCs and canonical bytes', async () => {
  const again = assemble(ROOT, 'a'.repeat(40));
  assert.deepEqual(result.report, again.report);
  for (const [kind, files] of Object.entries(result.packages)) {
    const bytes = result.archives.get(result.report.packages[kind].filename);
    assert.deepEqual(bytes, zip(files));
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
    assert.deepEqual(Object.keys(archive.files).sort(), [...files.keys()].sort());
    for (const [name, expected] of files) assert.deepEqual(await archive.file(name).async('nodebuffer'), expected, `${kind}: ${name}`);
  }
  assert.ok(!result.packages.codex.has('.claude-plugin/plugin.json'));
  assert.ok(!result.packages.codex.has('commands/graphic.md'));
  assert.ok(!result.packages.codex.has('.mcp.json'));
  assert.ok(![...result.packages.repository.keys()].some((p) => /(^|\/)(src|research|benchmarks|node_modules|\.gitattributes)\//.test(p)));
});

test('both MCP manifests name every verb the tool has', () => {
  const verbs = readFileSync(path.join(ROOT, 'cli/src/mcp.ts'), 'utf8').match(/MCP_COMMANDS = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((v) => v.slice(1, -1));
  assert.ok(verbs.length >= 8 && verbs.includes('pack'), verbs.join());
  for (const host of ['claude', 'codex']) {
    const { description } = JSON.parse(result.packages[`${host}-mcp${host === 'codex' ? '-local' : ''}`].get(`.${host}-plugin/plugin.json`));
    const listed = description.match(/\(types[^)]*\)/)?.[0] ?? '';
    for (const verb of verbs) assert.match(listed, new RegExp(`\\b${verb}\\b`), `${host}: ${verb} missing from ${listed}`);
  }
});

test('each host gets an MCP entry it can start: Claude expands its root variable, Codex resolves cwd', () => {
  assert.ok(result.packages['claude-mcp'].has('.mcp.json') && !result.packages['claude-mcp'].has('codex-mcp.json'));
  const codex = new Map(result.packages['codex-mcp-local']);
  assert.ok(codex.has('codex-mcp.json') && !codex.has('.mcp.json'));
  const mcpOptions = { host: 'codex', name: 'noacg-mcp', version };
  validatePackage(codex, mcpOptions);
  // The Claude form, which Codex 0.163 starts as a literal "${CLAUDE_PLUGIN_ROOT}/..." path.
  codex.set('codex-mcp.json', result.packages['claude-mcp'].get('.mcp.json'));
  assert.throws(() => validatePackage(codex, mcpOptions), /codex: MCP entry/);
});

test('output is idempotent, and altered or stray output is refused without deletion', (t) => {
  const dir = path.join(scratch(t), 'out');
  writeDistribution(dir, result);
  writeDistribution(dir, result);
  writeFileSync(path.join(dir, 'extra.txt'), 'keep');
  assert.throws(() => writeDistribution(dir, result), /output differs/);
  assert.equal(readFileSync(path.join(dir, 'extra.txt'), 'utf8'), 'keep');
});

for (const [title, mutate, error] of [
  ['missing licence', (f) => f.delete('LICENSE'), /required file missing/],
  ['wrong licence', (f) => f.set('LICENSE', Buffer.from('MIT')), /Apache licence/],
  ['missing reference', (f) => f.delete('skills/noacg-graphic/references/contract.md'), /missing skill reference/],
  ['stale setup pin', (f) => f.set('skills/noacg-graphic/references/setup.md', Buffer.from('npx -y @noacg/cli@0.0.1')), /setup CLI pin drift/],
  ['floating skill launcher', (f) => f.set('skills/noacg-graphic/SKILL.md', Buffer.from(f.get('skills/noacg-graphic/SKILL.md').toString() + '\nnpx -y @noacg/cli validate')), /unpinned or stale/],
  ['text limit', (f) => f.set('README.md', Buffer.alloc(256 * 1024 + 1, 65)), /text exceeds/],
  ['file limit', (f) => f.set('assets/large.png', Buffer.alloc(5 * 1024 * 1024)), /exceeds 5 MiB/],
  ['binary/LFS pointer', (f) => f.set('extra.md', Buffer.from('version https://git-lfs.github.com/spec/v1')), /binary\/LFS/],
  ['main accidentally starts MCP', (f) => f.set('.mcp.json', Buffer.from('{}')), /remain lazy/],
  ['manifest outside path', (f) => { const j=JSON.parse(f.get('.claude-plugin/plugin.json')); j.skills='../skill'; f.set('.claude-plugin/plugin.json', Buffer.from(JSON.stringify(j))); }, /unsafe skills/],
]) test(`reject ${title}`, () => {
  const files = new Map(result.packages.claude);
  mutate(files);
  assert.throws(() => validatePackage(files, options), error);
});

test('reject plugin file count and malformed Codex metadata independently', () => {
  const files = new Map(result.packages.claude);
  for (let n=0; n<513; n++) files.set(`extra/${n}.md`, Buffer.from('text'));
  assert.throws(() => validatePackage(files, options), /file count/);
  const codex = new Map(result.packages.codex);
  const j=JSON.parse(codex.get('.codex-plugin/plugin.json'));
  j.interface.developerName='x'.repeat(80);
  j.interface.longDescription='First paragraph\nSecond paragraph';
  codex.set('.codex-plugin/plugin.json', Buffer.from(JSON.stringify(j)));
  validatePackage(codex, {...options, host:'codex'});
  j.interface.displayName='x'.repeat(31);
  codex.set('.codex-plugin/plugin.json', Buffer.from(JSON.stringify(j)));
  assert.throws(() => validatePackage(codex, {...options, host:'codex'}), /invalid displayName/);
});

test('reject traversal, Windows devices, attributes, system files and case collisions in parents', () => {
  for (const name of ['../escape.md', 'con.md', 'foo./x.md', '/root.md', 'a:b.md', '.gitattributes', '.npmrc', 'Thumbs.db']) {
    assert.throws(() => validatePaths(new Map([[name, Buffer.from('')]])), /path|forbidden/);
  }
  assert.throws(() => validatePaths(new Map([['A/x.md', Buffer.from('')], ['a/y.md', Buffer.from('')]])), /case collision/);
});

test('repository compressed, unpacked and entry boundaries are rejected independently', () => {
  const limits = { compressedBytes: 50 * 1024 * 1024, unpackedBytes: 256 * 1024 * 1024, entries: 10000 };
  validateArchiveLimits(Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, value - 1])));
  for (const [key, value] of Object.entries(limits)) {
    assert.throws(() => validateArchiveLimits({ compressedBytes: 1, unpackedBytes: 1, entries: 1, [key]: value }), /archive limits/);
  }
});

test('source/generated skill drift is caught before packaging', (t) => {
  const dir=scratch(t);
  for (const file of ['cli/package.json','cli/package-lock.json','cli/LICENSE','cli/NOTICE','cli/scripts/toolkit-distribution.mjs','.claude-plugin','cli/plugin','cli/plugin-mcp','cli/skill']) {
    mkdirSync(path.dirname(path.join(dir,file)), {recursive:true});
    cpSync(path.join(ROOT,file), path.join(dir,file), {recursive:true});
  }
  writeFileSync(path.join(dir,'cli/plugin/skills/noacg-graphic/SKILL.md'), 'changed');
  assert.throws(() => assemble(dir,'a'.repeat(40)), /generated skill drift/);
});

function launcher(t, { installed, override } = {}) {
  const dir=scratch(t);
  const plugin=path.join(dir,'plugin');
  mkdirSync(path.join(plugin,'.claude-plugin'), {recursive:true});
  cpSync(path.join(ROOT,'cli/plugin-mcp/mcp-server.mjs'),path.join(plugin,'mcp-server.mjs'));
  writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({version}));
  const entry=path.join(dir,'node_modules/@noacg/cli/dist/index.js');
  mkdirSync(path.dirname(entry), {recursive:true});
  writeFileSync(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  writeFileSync(path.join(dir,'node_modules/@noacg/cli/package.json'),JSON.stringify({name:'@noacg/cli',version:installed ?? '9.9.9',type:'module'}));
  // npx runs offline against an empty scratch cache, so its fallback fails fast and fetches nothing.
  const env={...process.env,NOACG_CLI:override==='entry'?entry:override==='directory'?path.dirname(entry):override ?? '',PATH:'',
    npm_config_offline:'true',npm_config_cache:path.join(dir,'npm-cache'),npm_config_update_notifier:'false'};
  return spawnSync(process.execPath,[path.join(plugin,'mcp-server.mjs'),'--help'],{env,encoding:'utf8',timeout:20000,windowsHide:true});
}

test('launcher imports matching install and forwards MCP arguments in one process', (t) => {
  const r=launcher(t,{installed:version});
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(r.stdout),['mcp','--help']);
});
test('launcher never runs an older/newer/unknown installation; it goes to the pinned npx instead', (t) => {
  for (const installed of ['0.0.1','9.9.9','unknown']) {
    const r=launcher(t,{installed});
    assert.equal(r.stdout,'');
    assert.match(r.stderr,/so it is not used/);
    assert.ok(r.stderr.includes(`running @noacg/cli@${version} through npx`),r.stderr);
  }
});
test('explicit development override is disclosed; missing override cannot fall through', (t) => {
  const r=launcher(t,{override:'entry'});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stderr,/development override/);
  const bad=launcher(t,{installed:version,override:path.join(os.tmpdir(),'nonexistent-noacg-entry.js')});
  assert.equal(bad.status,1);
  assert.match(bad.stderr,/Fix or unset/);
  assert.equal(bad.stdout,'');
  const directory=launcher(t,{override:'directory'});
  assert.equal(directory.status,1);
  assert.match(directory.stderr,/entry file/);
});
