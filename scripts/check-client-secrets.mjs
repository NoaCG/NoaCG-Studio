// gate: build
// guards: src/**, docs/**, e2e/**, scripts/**

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { measured } from './measured.mjs';

const root = process.cwd();
const requested = process.argv[2] ? [process.argv[2]] : ['src', 'e2e', 'scripts', 'docs'];
const skip = new Set(['node_modules', '.git', '.vercel', 'bench-out', 'compare-out', 'video-bench-out']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.txt']);
const publicKeyName = /\b(?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]*(?:ANTHROPIC|OPENAI|AI_GATEWAY|HUGGINGFACE)[A-Z0-9_]*KEY\b/g;
const providerSecret = /\b(?:sk-ant-[A-Za-z0-9_-]{24,}|sk-proj-[A-Za-z0-9_-]{24,}|sk-or-v1-[A-Za-z0-9_-]{24,})\b/g;

async function files(directory) {
  const absolute = path.resolve(root, directory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries
    .filter((entry) => !skip.has(entry.name))
    .map(async (entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return files(relative);
      return textExtensions.has(path.extname(entry.name).toLowerCase()) ? [relative] : [];
    }));
  return nested.flat();
}

const findings = [];
// How many files were actually OPENED, not how many directories were asked for. `files()` answers
// an unreadable directory with an empty list, so a mistyped or moved target used to end in an OK
// line naming directories this scan never looked inside.
let scanned = 0;
for (const target of requested) {
  for (const file of await files(target)) {
    scanned += 1;
    const source = await readFile(path.resolve(root, file), 'utf8');
    for (const pattern of [publicKeyName, providerSecret]) {
      pattern.lastIndex = 0;
      const matches = source.match(pattern) ?? [];
      for (const match of matches) findings.push(`${file}: ${match.slice(0, 24)}…`);
    }
  }
}

measured(scanned, 'source files scanned');

if (findings.length) {
  console.error('Client secret scan failed:\n' + findings.map((finding) => `- ${finding}`).join('\n'));
  process.exit(1);
}
console.log(`Client secret scan OK (${requested.join(', ')}).`);
