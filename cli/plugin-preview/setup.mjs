import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('./app.mjs', import.meta.url))], bundle: true, format: 'iife', outfile: fileURLToPath(new URL('./dist/app.js', import.meta.url)) });
await build({ entryPoints: [fileURLToPath(new URL('../src/browser.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', external: ['playwright-core'], outfile: fileURLToPath(new URL('./dist/browser.mjs', import.meta.url)) });
await writeFile(new URL('./runtime.local.json', import.meta.url), JSON.stringify({ runtimeRoot: await realpath(root) }, null, 2) + '\n');
await mkdir(new URL('./.agents/plugins/', import.meta.url), { recursive: true });
await writeFile(new URL('./.agents/plugins/marketplace.json', import.meta.url), JSON.stringify({
  name: 'noacg-preview-local',
  interface: { displayName: 'NoaCG local trials' },
  plugins: [{ name: 'noacg-preview-trial', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }],
}, null, 2) + '\n');
process.stdout.write(`Prepared local runtime and editable fixture in ${root}\n`);
