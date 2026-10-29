import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg, index) => index % 2 === 0 && !['--package', '--entry'].includes(arg)) || args.length % 2) throw new Error('Usage: npm run build -- [--package <directory>] [--entry <relative.html>]');
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const packageRoot = option('--package') ? await realpath(option('--package')) : undefined;
const entry = option('--entry') ?? 'graphic.html';
await build({ entryPoints: [fileURLToPath(new URL('./app.mjs', import.meta.url))], bundle: true, format: 'iife', outfile: fileURLToPath(new URL('./dist/app.js', import.meta.url)) });
await build({ entryPoints: [fileURLToPath(new URL('../src/browser.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', external: ['playwright-core'], outfile: fileURLToPath(new URL('./dist/browser.mjs', import.meta.url)) });
// Only detectAuthoredFormat is imported from the importer; discard its unused ZIP
// dependency rather than adding a package reader or editor runtime to the graphic.
await build({ entryPoints: [fileURLToPath(new URL('./runtime.mjs', import.meta.url))], bundle: true, format: 'iife', globalName: 'NoacgPreviewRuntime', plugins: [{ name: 'format-only', setup(builder) { builder.onResolve({ filter: /^jszip$/ }, () => ({ path: 'jszip', external: true, sideEffects: false })); } }], outfile: fileURLToPath(new URL('./dist/runtime.js', import.meta.url)) });
await writeFile(new URL('./runtime.local.json', import.meta.url), JSON.stringify({ runtimeRoot: await realpath(root), packageRoot, entry }, null, 2) + '\n');
await mkdir(new URL('./.agents/plugins/', import.meta.url), { recursive: true });
await writeFile(new URL('./.agents/plugins/marketplace.json', import.meta.url), JSON.stringify({
  name: 'noacg-preview-phase2-local',
  interface: { displayName: 'NoaCG local trials' },
  plugins: [{ name: 'noacg-preview-phase2-trial', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }],
}, null, 2) + '\n');
process.stdout.write(`Prepared local runtime and editable fixture in ${root}\n`);
