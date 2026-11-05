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
// The cost, accepted: every deploy gives every file a new URL, so a browser fetches the whole app
// once again after each deploy even where a chunk did not change (the frameworks Vercel wires make
// the same trade). Hashed files are served `max-age=0, must-revalidate`, so nothing caches a
// pinned file by path alone.
//
// scripts/skew-protection.test.mjs tests the rewrite; scripts/deploy-skew-build.test.mjs drives a
// pinned build across a simulated deploy.

import fs from 'node:fs';
import path from 'node:path';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The two patterns for `names` (file names under the assets directory), built once per build.
 * `reference`: the name after `./`, `assets/`, `/assets/`, `./assets/` or `../assets/`, opened by a
 * quote, backtick or CSS `url(` and closed by one or by a `#fragment`, without a query of its own.
 * `anyUse`: the name anywhere with no `?dpl=` after it - the check that a form the first pattern
 * does not know (a bare name, a new prefix) cannot pass unseen.
 */
export function referencePatterns(names) {
  const files = names.map(escape).join('|');
  return {
    reference: new RegExp(`(["'\`(])((?:\\./|\\.\\./|/)?(?:assets/)?(?:${files}))(?=[#"'\`)])`, 'g'),
    anyUse: new RegExp(`(?<![\\w.-])(?:${files})(?!\\?dpl=)(?![\\w.-])`, 'g'),
  };
}

/** `code` with every reference matched by `patterns` pinned to deployment `id`, and how many. */
export function pinCode(code, patterns, id) {
  let pinned = 0;
  const next = code.replace(patterns.reference, (_, open, file) => {
    pinned += 1;
    return `${open}${file}?dpl=${encodeURIComponent(id)}`;
  });
  return { code: next, pinned, unpinned: (next.match(patterns.anyUse) ?? []).length };
}

/** `code` with every reference to one of `names` pinned to deployment `id`. */
export function pinReferences(code, names, id) {
  return names.length === 0 ? code : pinCode(code, referencePatterns(names), id).code;
}

/** The deployment id to pin to, or null when this build is not one Skew Protection serves. */
export function skewDeploymentId(env = process.env) {
  return env.VERCEL_SKEW_PROTECTION_ENABLED === '1' && env.VERCEL_DEPLOYMENT_ID ? env.VERCEL_DEPLOYMENT_ID : null;
}

/**
 * Pin every `.js`, `.css` and `.html` file among `files` (paths relative to `dir`) to `id`, in
 * place. What it came to, for the build log: files changed, references pinned, and uses of a built
 * file's name left without the id.
 */
export function pinBuild(dir, files, id) {
  const names = files.filter((file) => file.startsWith('assets/')).map((file) => file.slice('assets/'.length));
  const result = { files: 0, pinned: 0, unpinned: 0 };
  if (names.length === 0) return result;
  const patterns = referencePatterns(names);
  for (const file of files) {
    if (!/\.(m?js|css|html)$/.test(file)) continue;
    const full = path.join(dir, file);
    const before = fs.readFileSync(full, 'utf8');
    const { code, pinned, unpinned } = pinCode(before, patterns, id);
    if (pinned > 0) {
      fs.writeFileSync(full, code);
      result.files += 1;
    }
    result.pinned += pinned;
    result.unpinned += unpinned;
  }
  return result;
}

/** The one build-log line: whether pinning ran, and what it came to. */
export function skewLogLine(env, result) {
  if (!result) {
    const enabled = env.VERCEL_SKEW_PROTECTION_ENABLED === '1' ? 'is 1' : 'is not 1';
    const idPresent = env.VERCEL_DEPLOYMENT_ID ? 'present' : 'absent';
    return `[skew-protection] off: VERCEL_SKEW_PROTECTION_ENABLED ${enabled}, VERCEL_DEPLOYMENT_ID ${idPresent}; built file references are not pinned`;
  }
  return `[skew-protection] on: ${skewDeploymentId(env)}, ${result.pinned} reference(s) pinned in ${result.files} file(s), ${result.unpinned} unpinned`;
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
