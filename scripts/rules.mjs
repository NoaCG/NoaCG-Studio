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

/** The store, read once per process - `text()` is called from a gate's failure path. */
let cached = null;

/**
 * ONE RULE'S SENTENCE, for the mechanism that carries it.
 *
 * A rule whose `fires:` names a hook, a gate or a spec is CARRIED: the compiler omits it from
 * every loaded contract, because the mechanism is supposed to say it at the moment it matters.
 * That only works if the mechanism actually prints the sentence, and until 2026-09-08 nothing
 * checked - so four rules were deleted from every surface by a `fires:` line and reappeared
 * nowhere. `scripts/contracts-lib.mjs` now proves the claim by looking for this call in the
 * mechanism's source, which is why the id goes in as a literal.
 *
 * Throws on an unknown id rather than returning an empty string: a gate printing nothing where
 * its rule should be is the failure this exists to prevent.
 */
export function text(id) {
  cached ??= loadRules(ROOT);
  const rule = cached.rules.find((r) => r.id === id);
  if (!rule) throw new Error(`[rules] no rule \`${id}\` in the store - the mechanism names a rule that is not there`);
  return rule.body.replace(/\s*\n\s*/g, ' ');
}

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

// Only when a person runs it. `text()` above is imported by the gates that carry a rule, and an
// import must not print the whole contract as a side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
