#!/usr/bin/env node
// Plan A step (c), run #1967: move the browser specs' in-page `import('/src/x.ts')` onto
// `__noacgImport('/src/x.ts')` (src/app/e2eModules.ts), the door that answers on the dev server
// and on the e2e build alike. Only literal paths move; a run-time path (`'/src/x.ts' + bust`,
// `'/src/x.ts?t=' + Date.now()`) asks for a deliberate second copy, which only the dev server can
// serve, so it is left as it is. Changes no assertion.
//
//   node docs/work-specs/cicd-followup/evidence/plan-a-codemod.mjs <file>...   # rewrite in place
//   node docs/work-specs/cicd-followup/evidence/plan-a-codemod.mjs --count <file>...
import { readFileSync, writeFileSync } from 'node:fs';

const LITERAL = /\bimport\(\s*(['"`])(\/src\/[\w./-]+\.tsx?)\1\s*\)/g;
const count = process.argv.includes('--count');
let total = 0;
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const text = readFileSync(file, 'utf8');
  let n = 0;
  const out = text.replace(LITERAL, (_m, q, path) => { n++; return `__noacgImport(${q}${path}${q})`; });
  total += n;
  if (n && !count) writeFileSync(file, out);
  if (n) console.log(`${n}\t${file}`);
}
console.log(`${total} import(s) ${count ? 'found' : 'rewritten'}`);
