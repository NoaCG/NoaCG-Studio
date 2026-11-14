#!/usr/bin/env node
// gate: after-build
// guards: src/**, vite.config.ts
//
// THE PRODUCTION BUNDLE CARRIES NO E2E MACHINERY.
//
//   node scripts/check-no-e2e-in-dist.mjs            # part of `npm run build`, once dist/ exists
//   node scripts/check-no-e2e-in-dist.mjs <dir>      # another built directory
//
// The e2e build (`vite build --mode e2e`) adds the source-module registry browser specs reach
// through (src/app/e2eModules.ts) and turns the app's test seams on: the chat intake handle, the
// withheld production prep, and the output's old-build and command hooks. One define switches
// all of it, `__NOACG_E2E__`, which only the build MODE sets (vite.config.ts), never an
// environment variable. This reads what was actually BUILT: a production dist holding any marker
// below means a seam or the registry shipped to users, whatever the source says.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Words only the e2e machinery holds, each with what it means when found. */
export const MARKERS = [
  ['__noacgImport', 'the spec door (src/app/e2eModules.ts)'],
  ["is not in the e2e build's module registry", 'the spec door (src/app/e2eModules.ts)'],
  ['__noacgChatIntake', 'the chat intake seam (src/audience/chatIntake.ts)'],
  ['__noacgWithholdPrep', 'the withheld prep seam (src/components/home/ProductionPage.tsx)'],
  // The output's command hook has no word of its own; it sits under the same switch, in the same
  // file, as this one.
  ['oldbuild', 'the output old-build seam (src/output/main.ts)'],
  ['__NOACG_E2E__', 'an unreplaced e2e switch (vite.config.ts define)'],
];

/** `file: what` for every marker in the given `[file, text]` entries. */
export function findMarkers(entries) {
  const found = [];
  for (const [file, text] of entries) {
    for (const [word, what] of MARKERS) if (text.includes(word)) found.push(`${file}: ${word} - ${what}`);
  }
  return found;
}

function scripts(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? scripts(path) : /\.(js|mjs|html)$/.test(name) ? [path] : [];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = resolve(root, process.argv[2] ?? 'dist');
  if (!existsSync(dist)) {
    console.error(`check-no-e2e-in-dist: ${relative(root, dist)} does not exist - build first`);
    process.exit(1);
  }
  const files = scripts(dist);
  const found = findMarkers(files.map((f) => [relative(root, f), readFileSync(f, 'utf8')]));
  measured(files.length, 'built files read');
  if (found.length) {
    console.error(`check-no-e2e-in-dist: the production bundle carries e2e machinery:\n  ${found.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-no-e2e-in-dist: OK - ${files.length} built file(s) in ${relative(root, dist)}, no e2e machinery`);
}
