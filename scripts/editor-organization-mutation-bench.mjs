// gate: none - queued, isolated editor organization mutation proof with byte-exact restoration
// guards: src/model/editorOrganization.ts, src/blocks/editorOrganization.ts, src/components/editorFoundation/OrganizationControls.tsx, src/components/editorFoundation/InlineOrganizationName.tsx, src/components/editorFoundation/operations.ts, src/components/AssetsPanel.tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { transform } from 'sucrase';
import { activeRuns, blockingRuns, nodeProcesses, selfAndAncestors, describeRuns } from './e2e-runs.mjs';
import { measured } from './measured.mjs';

const self = { pid: process.pid, startedAt: nodeProcesses().find(item => item.pid === process.pid)?.startedAt ?? Date.now() };
const waitingSince = Date.now();
let blockers = blockingRuns(activeRuns({ excludePids: selfAndAncestors() }), self);
if (blockers.length) console.log('Waiting for earlier browser work before any mutation:\n' + describeRuns(blockers));
while (blockers.length) {
  if (Date.now() - waitingSince > 30 * 60_000) throw new Error('Browser isolation wait expired. No mutation was started.');
  await new Promise(resolve => setTimeout(resolve, 5000));
  blockers = blockingRuns(activeRuns({ excludePids: selfAndAncestors() }), self);
}
const patcher = 'src/blocks/editorOrganization.ts';
const cases = [
  ['folder parent ownership', patcher, 'if (memberScope(organization, member, parts, hierarchy) !== expectedScope)', 'if (false)', 'folder guards refuse mixed group scopes'],
  ['bin collision refusal', patcher, "if (dirs.some(dir => dir === operation.to || dir.startsWith(operation.to + '/') && !dir.startsWith(operation.from + '/')))", 'if (false)', 'bin rename retains field defaults'],
  ['bin moving-path collision', patcher, 'if (moving.some(asset => template.assets.some(other => other.path === target(asset.path))))', 'if (false)', 'nested bin renames refuse occupied moving paths'],
  ['folder opening revision', 'src/components/editorFoundation/OrganizationControls.tsx', 'run(operation, current.expected)', 'run(operation)', 'organization refuses stale revisions'],
  ['bin opening revision', 'src/components/AssetsPanel.tsx', ' }, draft.expected);', ' }, actions!.bins!.revision());', 'bin rename retains field defaults'],
  ['inline Escape cancellation', 'src/components/editorFoundation/InlineOrganizationName.tsx', "finish(event.key === 'Enter')", 'finish(true)', 'folders organize, rename, collapse'],
  ['future organization version', 'src/model/editorOrganization.ts', 'value.version !== 1 || ', '', 'unsupported organization metadata disables'],
  ['inert source header ownership', 'src/model/editorOrganization.ts', 'matches.length !== 1 || matches[0].index !== 0', 'matches.length !== 1', 'native:a metadata-shaped string'],
];
const originals = new Map(cases.map(([, file]) => [file, readFileSync(file)]));
const delay = () => new Promise(resolve => setTimeout(resolve, 2000));
const run = grep => spawnSync(process.execPath, grep.startsWith('native:') ? ['--test', '--test-name-pattern', grep.slice(7), 'scripts/editor-organization.test.mjs'] : [resolve('node_modules/@playwright/test/cli.js'), 'test', 'e2e/editor-folders-bins.spec.ts', '--grep', grep], {
  encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, E2E_WORKERS: '3' }, windowsHide: true,
});
const nativeControl = run('native:a metadata-shaped string');
if (nativeControl.status !== 0) { process.stdout.write(nativeControl.stdout + nativeControl.stderr); throw new Error('The unmodified source header control failed.'); }
const control = run(cases.filter(row => !row[4].startsWith('native:')).map(row => row[4]).join('|'));
if (control.status !== 0) { process.stdout.write(control.stdout + control.stderr); throw new Error('The unmodified control failed.'); }
console.log('Unmodified control passed.');
let survived = 0, restored;
try {
  for (const [name, file, from, to, grep] of cases) {
    const source = originals.get(file).toString();
    if (!source.includes(from)) throw new Error('Missing mutation target: ' + name);
    const changed = source.replace(from, to);
    transform(changed, { transforms: ['typescript', 'jsx'], jsxRuntime: 'automatic' });
    writeFileSync(file, changed); await delay();
    let result = run(grep);
    const assertion = () => !result.error && /Error: expect\(|AssertionError \[ERR_ASSERTION\]/.test(result.stdout);
    if (result.status !== 0 && !assertion()) {
      console.log('Inconclusive infrastructure result for ' + name + '; retrying once.');
      process.stdout.write(result.stdout + result.stderr); await delay(); result = run(grep);
    }
    if (result.status !== 0 && !assertion()) { process.stdout.write(result.stdout + result.stderr); throw new Error('Mutation did not reach a behavior assertion: ' + name); }
    console.log((result.status !== 0 ? 'KILLED: ' : 'SURVIVED: ') + name);
    process.stdout.write(result.stdout + result.stderr);
    if (result.status === 0) survived++;
    writeFileSync(file, originals.get(file)); await delay();
  }
} finally {
  for (const [file, bytes] of originals) writeFileSync(file, bytes);
  await delay(); restored = [...originals].every(([file, bytes]) => readFileSync(file).equals(bytes));
  console.log(restored ? 'Every source restored byte-for-byte.' : 'Source restoration failed.');
}
if (!restored) throw new Error('Source restoration failed.');
measured(cases.length, 'editor organization guard mutations');
console.log(`${cases.length - survived}/${cases.length} mutations killed.`);
process.exitCode = survived ? 1 : 0;
