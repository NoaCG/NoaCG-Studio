// ONE SPEC, THREE NAMES - and the conversions between them, in one small module every reader of
// the suite can import without pulling the planner in.
//
//   store / annotation identity   e2e/anim-engine.spec.ts   (the failure set, the quarantine, git)
//   planner identity              anim-engine.spec.ts       (the MAP, the durations table, the shards)
//   Playwright filter             [\\/]anim-engine\.spec\.ts$ (what a shard is handed)
//
// The planner (scripts/e2e-affected.mjs) re-exports `specFilterArg`, so its callers are unchanged;
// the quarantine and the retry import from here so neither has to load the planner, and no
// import cycle can form between the three.

/** `e2e/anim-engine.spec.ts` -> `anim-engine.spec.ts`, the name the planner and the durations table key on. */
export function planIdentity(spec) {
  return String(spec).replaceAll('\\', '/').replace(/^e2e\//, '');
}

/** The other direction: a planner name back to the repo-relative path. */
export function specPath(name) {
  const clean = String(name).replaceAll('\\', '/');
  return clean.startsWith('e2e/') ? clean : `e2e/${clean}`;
}

/**
 * The Playwright filter for ONE spec file, anchored at both ends.
 *
 * Playwright's positional args are REGEXES over the whole file path, so a bare `control.spec.ts`
 * also selects `ai-more-control.spec.ts` and `hosted-control.spec.ts`. The leading `[\\/]` accepts
 * either separator, the `$` refuses a longer name, and the regex metacharacters in the file name
 * (the dots) are escaped.
 */
export function specFilterArg(spec) {
  return `[\\\\/]${String(planIdentity(spec)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

/**
 * The spec files a change touches, as planner names. The planner and the retry both ask "does
 * this change edit the failing spec?", and they must agree on the answer.
 * @param {string[]} changed repo-relative paths, either separator
 */
export function editedSpecs(changed) {
  return new Set(
    (changed ?? [])
      .map((f) => String(f).replaceAll('\\', '/'))
      .filter((f) => /^e2e\/.*\.spec\.ts$/.test(f))
      .map(planIdentity),
  );
}
