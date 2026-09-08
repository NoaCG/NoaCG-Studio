#!/usr/bin/env node
// gate: build
// guards: vercel.json
//
// Validate vercel.json's routing config with the same library Vercel validates it with.
//
// Why this exists: on 2026-08-07 a header rule with the source `/join(/(.*))?` reached main. Every
// gate here was green - it is valid JSON, no test reads vercel.json, and the pattern looks like the
// `/(.*)` two rules above it. Vercel rejects it: route sources are path-to-regexp, and an unnamed
// group inside an optional group is not a valid pattern there.
//
// The failure mode is what made it expensive. Vercel validates the config BEFORE it creates a
// deployment, so there is no failed build to look at and no deployment row in the dashboard - the
// project page looks idle and healthy. The only signal is a `Vercel` commit status of "Deployment
// failed." on GitHub, and a "some jobs were not successful" mail that reads like a test failure.
// Production silently kept serving the last commit that deployed, for eight main commits.
//
// So this is the same class as check-workflows.mjs: something only the platform could tell us, moved
// into `npm run build`. @vercel/routing-utils is the package Vercel itself uses for this, which is
// the point - a hand-rolled regex check would be a second opinion, not the deciding one. Apache-2.0,
// a build-time devDependency, never bundled.
//
// Measured against deliberate mutations of our own vercel.json, it rejects the pattern that caused
// the outage, an unbalanced group, a redirect with no destination, and a rewrite whose source names
// a segment its destination does not - see scripts/check-vercel-config.test.mjs.
//
// It also answers a second question the library cannot: whether a config Vercel ACCEPTS is one it
// can SERVE. See internalHtmlDestinations below - that is the rule the audience link tripped.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTransformedRoutes, normalizeRoutes } from '@vercel/routing-utils';

import { measured } from './measured.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const configPath = path.join(repoRoot, 'vercel.json');

/**
 * Validate the routing half of a parsed vercel.json.
 *
 * Returns the list of problems, empty when the config is one Vercel will accept. Anything outside
 * routing (functions, crons, buildCommand) is the deployment's business and is not judged here.
 */
export function validateVercelConfig(config) {
  // Two ways to be rejected, and the library uses both: a bad pattern comes back as `error`, but a
  // rule missing a required key THROWS out of the transform. Catching it keeps a malformed config a
  // reported problem rather than a stack trace, which matters because this runs at the front of the
  // build where the message is the whole point.
  let transformed;
  try {
    transformed = getTransformedRoutes({
      cleanUrls: config.cleanUrls,
      trailingSlash: config.trailingSlash,
      redirects: config.redirects,
      rewrites: config.rewrites,
      headers: config.headers,
      routes: config.routes,
    });
  } catch (error) {
    return [error.message];
  }
  if (transformed.error) return errorMessages(transformed.error);

  let normalized;
  try {
    normalized = normalizeRoutes(transformed.routes);
  } catch (error) {
    return [error.message];
  }
  if (normalized.error) return errorMessages(normalized.error);

  return internalHtmlDestinations(config);
}

/**
 * The second failure mode, and the one that broke the audience link: a config Vercel ACCEPTS and
 * then cannot serve.
 *
 * `cleanUrls: true` stores every page at its extensionless path (`join.html` is served as
 * `/join`) and adds a 308 from `/x.html` to `/x` in the REDIRECT phase. A rewrite runs after the
 * filesystem handle with `check: true`, so its destination re-enters routing at the filesystem -
 * below that redirect. A destination of `/join.html` therefore matches no file and no route, and
 * the request 404s. `/join/friday-night-live` did exactly that on production from 2026-08-07
 * until 2026-08-08 while `/join?p=<slug>` worked, which is why nothing else noticed.
 *
 * The routing library cannot see this: the pattern is valid, and whether the destination exists
 * is a fact about the build output, not about the route table. So it is checked here.
 */
function internalHtmlDestinations(config) {
  if (!config.cleanUrls) return [];
  const problems = [];
  for (const [kind, rules] of [
    ['rewrite', config.rewrites],
    ['redirect', config.redirects],
  ]) {
    for (const rule of rules ?? []) {
      const destination = rule?.destination;
      // Only INTERNAL destinations: a rewrite to another origin is that origin's filesystem.
      if (typeof destination !== 'string' || !destination.startsWith('/')) continue;
      const pathOnly = destination.split(/[?#]/)[0];
      if (!pathOnly.endsWith('.html')) continue;
      problems.push(
        `${kind} "${rule.source}" points at "${destination}", but cleanUrls serves that page at ` +
          `"${pathOnly.slice(0, -'.html'.length)}" — the destination 404s. Drop the .html.`,
      );
    }
  }
  return problems;
}

// A RouteApiError carries the per-entry messages in `errors` and repeats the first one in
// `message`; a plain error only has `message`. Prefer the list so every bad rule is reported at
// once rather than one per push.
function errorMessages(error) {
  const messages = Array.isArray(error.errors) && error.errors.length ? error.errors : [error.message];
  return error.link ? [...messages, `See ${error.link}`] : messages;
}

function main() {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${configPath}: ${error.message}`);
    process.exit(1);
  }

  // The rules both halves of the check read: `getTransformedRoutes` takes these four keys, and
  // `internalHtmlDestinations` walks two of them. Rename a key or move its rules elsewhere and
  // this drops to zero while the config still parses and the gate still says "valid".
  measured(
    [config.redirects, config.rewrites, config.headers, config.routes]
      .reduce((total, rules) => total + (rules?.length ?? 0), 0),
    'route rules',
  );

  const problems = validateVercelConfig(config);
  if (problems.length) {
    console.error('vercel.json would be rejected by Vercel before a deployment is even created:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('vercel.json routing config is valid.');
}

// Only run when invoked as the CLI, so the test can import the validator without it exiting.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
