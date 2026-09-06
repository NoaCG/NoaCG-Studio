#!/usr/bin/env node
// How often work on one capability is forced into a shared file (docs/WORKFLOW_ARCHITECTURE.md
// §5.5). The number the module-boundary rows are measured by.
//
//   npm run metrics:cochange                 # the wizard capabilities, last 60 days
//   npm run metrics:cochange -- --days 30
//
// For each capability (a set of path prefixes), the commits that touch ONLY that capability's
// files among the capability files are "pure"; the fraction of those that also touch a shared
// giant is the coupling. Measured 2026-09-06: import 37%, template 43%, AI 4%. A capability at
// 10% or under can be owned by one session without touching what the others edit.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The wizard as measured on 2026-09-06; phase 2a moves these files, and the prefixes follow. */
export const WIZARD = {
  capabilities: {
    import: [
      'src/components/wizard/steps/MapSvgFieldsStep', 'src/components/wizard/steps/ImportDesignStep',
      'src/components/wizard/steps/PrepareDesignStep', 'src/components/wizard/steps/PlaceFieldsStep',
      'src/components/wizard/DesignPrepCanvas', 'src/components/wizard/fieldAutoMap',
      'src/components/wizard/import/', 'src/templates/importedDesign/',
    ],
    ai: ['src/components/wizard/steps/AiStep', 'src/components/wizard/steps/ai/', 'src/components/wizard/ai/'],
    template: [
      'src/components/wizard/steps/BrowseStep', 'src/components/wizard/steps/FieldsStep',
      'src/components/wizard/steps/StyleStep', 'src/components/wizard/steps/AnimationStep',
      'src/components/wizard/steps/FinishStep', 'src/components/wizard/steps/TemplateStep',
      'src/components/wizard/template/',
    ],
  },
  // src/model/wizard.ts is the pre-row-1 path of the template contract (now
  // src/templates/contract.ts, with the vocabulary in src/model/templateVocabulary.ts). Both
  // are listed: the window this reads still holds commits that touched the old path.
  shared: ['src/components/wizard/CreationWizard.tsx', 'src/components/wizard/draft.ts', 'src/model/wizard.ts', 'src/templates/contract.ts', 'src/model/templateVocabulary.ts'],
};

function commits(days) {
  const out = execFileSync(
    'git',
    ['log', 'origin/main', '--no-merges', `--since=${days}.days`, '--name-only', '--format=@@%h'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  const result = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) {
      current = { sha: line.slice(2), files: [] };
      result.push(current);
    } else if (line.trim() && current) current.files.push(line.trim().replaceAll('\\', '/'));
  }
  return result;
}

const hits = (file, prefixes) => prefixes.some((p) => file.startsWith(p));

export function coupling(log, { capabilities, shared }) {
  const rows = [];
  for (const [name, prefixes] of Object.entries(capabilities)) {
    const others = Object.entries(capabilities).filter(([n]) => n !== name).flatMap(([, p]) => p);
    let pure = 0;
    let forced = 0;
    for (const c of log) {
      const mine = c.files.some((f) => hits(f, prefixes));
      const theirs = c.files.some((f) => hits(f, others));
      if (!mine || theirs) continue;
      pure += 1;
      if (c.files.some((f) => shared.includes(f))) forced += 1;
    }
    rows.push({ name, pure, forced, fraction: pure ? forced / pure : 0 });
  }
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 60;
  const log = commits(days);
  console.log(`[metrics:cochange] last ${days} days, ${log.length} non-merge commits on origin/main`);
  console.log(`  shared giants: ${WIZARD.shared.join(', ')}`);
  for (const r of coupling(log, WIZARD)) {
    console.log(`  ${r.name.padEnd(9)} pure commits ${String(r.pure).padStart(4)}, forced into a giant ${String(r.forced).padStart(4)}  (${(100 * r.fraction).toFixed(0)}%)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
