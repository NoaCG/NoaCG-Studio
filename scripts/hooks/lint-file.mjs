// PostToolUse hook for the file-editing tools: lint the just-edited file so lint debt
// surfaces at the edit, not minutes later at the `npm run build` gate. Scope mirrors
// eslint.config.js; everything else exits silently. Per-file eslint (no type-aware rules
// in this config) runs in about a second.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput, deny } from './lib.mjs';

const input = await readHookInput();
const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || filePath.length === 0) process.exit(0);

// The checkout this hook ships in, never the session's working directory: that drifts into a
// subfolder after a `cd`, and every path below would then miss and lint nothing.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = relative(ROOT, resolve(filePath)).replaceAll('\\', '/');

// The linted surface, mirroring the `files` globs in eslint.config.js.
const LINTED = [
  /^src\/.+\.(ts|tsx)$/,
  /^e2e\/.+\.ts$/,
  /^vite\.config\.ts$/,
  /^playwright.*\.config\.ts$/,
  /^scripts\/.+\.mjs$/,
];
if (rel.startsWith('..') || !LINTED.some((p) => p.test(rel))) process.exit(0);
if (!existsSync(resolve(filePath))) process.exit(0); // deleted since the edit - nothing to lint

// Invoke eslint's bin through this Node - immune to npx/PATH differences across shells.
const eslintBin = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
if (!existsSync(eslintBin)) process.exit(0); // deps not installed - the build gate will catch it

const res = spawnSync(process.execPath, [eslintBin, '--max-warnings', '0', '--no-warn-ignored', rel], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (res.status !== 0) {
  // Every line of this reaches the session after the edit, so a file with many problems shows the
  // first ones and a count; the full list is one command away.
  const lines = (res.stdout || res.stderr || '').trim().split('\n');
  const shown = lines.length > 14 ? [...lines.slice(0, 12), `... ${lines.length - 12} more line(s): npx eslint ${rel}`] : lines;
  deny(
    `eslint failed for ${rel} - the tree must stay lint-clean (fix properly, no eslint-disable sprinkling):\n` +
      shown.join('\n'),
  );
}

process.exit(0);
