// PIN EVERY CODE FILE TO THE DEPLOY THAT SERVED THE PAGE (Vercel Skew Protection; issue #758).
//
// Every build names its files by content hash and the host serves only the newest deploy, so a
// page loaded before a deploy that later asks for a file of its own build gets a 404. Vercel's
// Skew Protection is on for the project and answers such a request from the deploy it names in
// `?dpl=<deployment id>` (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.5), but Vite is not a framework
// Vercel wires, so nothing sends the id. This adds it to every reference the build writes to one
// of its own files: the HTML's script and link tags, `./x.js` imports between chunks (static and
// lazy), the `"assets/x.js"` preload lists and the `/assets/x.js` worker URLs. All of them, or
// none: one module reached by two URLs runs twice, with two copies of its state.
//
// It runs only on a Vercel build with Skew Protection on (VERCEL_SKEW_PROTECTION_ENABLED=1 and a
// VERCEL_DEPLOYMENT_ID), after Vite has written the files, so local builds, CI and the gates that
// read dist/ see exactly what they saw before. The in-page reload (src/app/deploySkew.ts) stays the
// fallback for a deploy older than Skew Protection's maximum age.
//
// scripts/skew-protection.test.mjs tests the rewrite; scripts/deploy-skew-build.test.mjs drives a
// pinned build across a simulated deploy.

import fs from 'node:fs';
import path from 'node:path';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `code` with every reference to one of `names` (file names under the assets directory) pinned to
 * deployment `id`. A reference is the name after `./`, `assets/` or `/assets/`, between quotes,
 * backticks or a CSS `url(...)`, and without a query of its own.
 */
export function pinReferences(code, names, id) {
  if (names.length === 0) return code;
  const files = names.map(escape).join('|');
  const reference = new RegExp(`(["'\`(])((?:\\./|/?assets/)(?:${files}))(?=["'\`)])`, 'g');
  return code.replace(reference, (_, open, file) => `${open}${file}?dpl=${encodeURIComponent(id)}`);
}

/** The deployment id to pin to, or null when this build is not one Skew Protection serves. */
export function skewDeploymentId(env = process.env) {
  return env.VERCEL_SKEW_PROTECTION_ENABLED === '1' && env.VERCEL_DEPLOYMENT_ID ? env.VERCEL_DEPLOYMENT_ID : null;
}

/** References to `names` in `code` that carry no deployment id. */
export function unpinnedReferences(code, names) {
  if (names.length === 0) return 0;
  const files = names.map(escape).join('|');
  return (code.match(new RegExp(`["'\`(](?:\\./|/?assets/)(?:${files})(?=["'\`)])`, 'g')) ?? []).length;
}

/**
 * Pin every `.js`, `.css` and `.html` file among `files` (paths relative to `dir`) to `id`, in
 * place. What it came to, for the build log: files changed, references pinned and left unpinned.
 */
export function pinBuild(dir, files, id) {
  const names = files.filter((file) => file.startsWith('assets/')).map((file) => file.slice('assets/'.length));
  const result = { files: 0, pinned: 0, unpinned: 0 };
  const marker = `?dpl=${encodeURIComponent(id)}`;
  for (const file of files) {
    if (!/\.(m?js|css|html)$/.test(file)) continue;
    const full = path.join(dir, file);
    const code = fs.readFileSync(full, 'utf8');
    const next = pinReferences(code, names, id);
    if (next !== code) {
      fs.writeFileSync(full, next);
      result.files += 1;
    }
    result.pinned += next.split(marker).length - 1;
    result.unpinned += unpinnedReferences(next, names);
  }
  return result;
}

/** The one build-log line: whether pinning ran, and what it came to. */
export function skewLogLine(env, result) {
  const enabled = env.VERCEL_SKEW_PROTECTION_ENABLED === '1';
  const idPresent = Boolean(env.VERCEL_DEPLOYMENT_ID);
  if (!result) return `[skew-protection] off: VERCEL_SKEW_PROTECTION_ENABLED ${enabled ? 'is 1' : 'is not 1'}, VERCEL_DEPLOYMENT_ID ${idPresent ? 'present' : 'absent'}; built file references are not pinned`;
  return `[skew-protection] on: ${env.VERCEL_DEPLOYMENT_ID}, ${result.pinned} reference(s) pinned in ${result.files} file(s), ${result.unpinned} unpinned`;
}

/** The Vite plugin. It reads Vercel's build environment; `env` is for tests. */
export function skewProtectionPlugin(env = process.env) {
  const id = skewDeploymentId(env);
  return {
    name: 'noacg-skew-protection',
    apply: 'build',
    writeBundle: {
      order: 'post',
      sequential: true,
      handler(options, bundle) {
        const dir = options.dir ?? path.dirname(options.file ?? '');
        const result = id ? pinBuild(dir, Object.keys(bundle), id) : null;
        console.log(skewLogLine(env, result));
      },
    },
  };
}
