#!/usr/bin/env node
// Which rules apply to a path - the on-demand half of the compiled contracts.
//
//   npm run rules -- src/components/wizard/import/MapSvgFieldsStep.tsx
//   npm run rules -- --area wizard
//
// Claude Code loads the path-scoped files under .claude/rules/ by itself when a matching file
// is read; this is for everything else: a Codex task preamble (scripts/codex-rescue.mjs), a
// session that edited through the shell and wants to know what it just walked past, a person.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRules, rulesFor } from './contracts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const args = process.argv.slice(2);
  const { rules, problems } = loadRules(ROOT);
  if (problems.length > 0) {
    console.error(`[rules] the store has ${problems.length} problem(s); run npm run check:contracts`);
    process.exit(1);
  }
  const areaIndex = args.indexOf('--area');
  const selected = areaIndex >= 0
    ? rules.filter((r) => r.status === 'active' && r.area === args[areaIndex + 1])
    : args.flatMap((file) => rulesFor(rules, path.relative(ROOT, path.resolve(file))));
  const unique = [...new Map(selected.map((r) => [r.id, r])).values()];
  if (unique.length === 0) {
    console.log('[rules] nothing in the store applies here.');
    return;
  }
  for (const rule of unique) {
    console.log(`- ${rule.kind} \`${rule.id}\` (${rule.fires}): ${rule.body.replace(/\s*\n\s*/g, ' ')}`);
  }
}

main();
