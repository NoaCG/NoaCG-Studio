#!/usr/bin/env node
// gate: build
// guards: cli/**
//
// THE ONE GENERATOR for every shipped copy of the `noacg-graphic` skill (docs/AGENT_CLI.md).
//
// Source of truth: cli/skill/noacg-graphic/ (SKILL.md + references/). Everything an agent can
// install is written FROM it, never beside it, so the contract the npm package ships, the Claude
// Code plugin carries and a Codex session loads can never say three different things:
//
//   1. the npm package's `skill/`        - IS the source: cli/package.json "files" ships cli/skill as-is
//   2. the plugin's `skills/noacg-graphic/` (cli/plugin/) - a byte-identical copy; the same folder
//      is what the Claude Code plugin (.claude-plugin/plugin.json) and the Codex plugin
//      (.codex-plugin/plugin.json, `skills: "./skills/"`) both read, and what a Codex user copies
//      into ~/.codex/skills/ when they want the skill without the plugin
//   3. the version stamped on the four plugin manifests (`noacg` under cli/plugin/, `noacg-mcp`
//      under cli/plugin-mcp/, a Claude Code and a Codex manifest each) and on both marketplace
//      entries at the repo root (.claude-plugin/marketplace.json) - cli/package.json's version,
//      so a release bumps ONE number. The same version goes on cli/server.json, the MCP Registry's record of `noacg mcp` (its own `version` and its
//      npm package's `version`, which the registry requires to name a published version). Its
//      `name` is not stamped but CHECKED against cli/package.json `mcpName`: the registry refuses
//      a publish whose npm package does not carry the same name, and it only says so after npm
//      already holds the version
//   4. cli/plugin-mcp/npm-latest.mjs - a byte-identical copy of cli/src/npmLatest.mjs, the "is
//      this copy behind npm's latest?" check that `noacg doctor` and the MCP launcher both run.
//      The launcher gets a copy rather than importing it from the CLI it resolves, because the
//      copy it resolves may be too old to carry the check at all (that file's header says why)
// cli/LICENSE used to be generated here too - the repository LICENSE copied in, on the assumption
// that the repo keeps one licence text. That assumption ended on 2026-08-25: this package is
// Apache-2.0 and the rest of the repository is AGPL-3.0-only (docs/AGENT_CLI.md explains why).
// cli/LICENSE is therefore its own file, not a copy of anything, and nothing here regenerates it -
// which matters, because while it WAS generated, `prepack` would have quietly rewritten it back to
// the AGPL text on the way to npm.
//
// The in-repo dogfooding triple (.agent-workflows/noacg-graphic.md + .claude/skills/noacg-graphic +
// .agents/skills/noacg-graphic) are thin POINTERS at the source, guarded by
// scripts/check-shared-instructions.mjs - this script never touches them. Pointers do not drift;
// copies do, which is why the copies are generated and checked.
//
//   node cli/scripts/build-skill.mjs          write every generated copy (idempotent)
//   node cli/scripts/build-skill.mjs --check  exit 1 listing every generated file that is missing,
//                                             differs from what would be written, or is a stray
//                                             (a reference deleted from the source must vanish
//                                             from the copy too). Runs inside `npm run build`.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measured } from '../../scripts/measured.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(CLI, '..');
const SOURCE = path.join(CLI, 'skill', 'noacg-graphic');
const PLUGIN = path.join(CLI, 'plugin');
const PLUGIN_SKILL = path.join(PLUGIN, 'skills', 'noacg-graphic');
const MARKETPLACE = path.join(ROOT, '.claude-plugin', 'marketplace.json');
/** The plugins the marketplace offers, read from the marketplace itself so a plugin listed there
 *  can never miss its stamp: today `noacg` (the skill and the command, no server) and `noacg-mcp`
 *  (the always-on MCP server, optional - docs/AGENT_CLI.md "What a session pays" is why they are
 *  two). Each has a Claude Code and a Codex manifest, and all are versioned as the CLI. */
const PLUGINS = readJson(MARKETPLACE).plugins.map((p) => ({ name: p.name, dir: path.resolve(ROOT, p.source) }));
if (!PLUGINS.some((p) => p.dir === PLUGIN)) {
  console.error(`${path.relative(ROOT, MARKETPLACE)} no longer lists the plugin at cli/plugin, which carries the skill copy`);
  process.exit(2);
}

const check = process.argv.includes('--check');

const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The npm package's version - the one number a release bumps. */
const pkg = readJson(path.join(CLI, 'package.json'));
const version = pkg.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`cli/package.json has no semver version (got ${JSON.stringify(version)})`);
  process.exit(2);
}
/** The MCP Registry's record of `noacg mcp`. */
const SERVER_JSON = path.join(CLI, 'server.json');

/** Every generated file, as the bytes it must hold. */
const expected = new Map();

// 1. Versioned install commands in maintained documentation, then byte-identical skill copies.
if (!existsSync(SOURCE)) {
  console.error(`missing the skill source ${rel(SOURCE)}`);
  process.exit(2);
}
function pinCommands(bytes) {
  return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')
    .replace(/((?:npx -y|npm i -g) @noacg\/cli)(?:@\d+\.\d+\.\d+)?/g, `$1@${version}`)
    .replace(/@noacg\/cli@\d+\.\d+\.\d+/g, `@noacg/cli@${version}`)
    .replace(/(match |match\s+)(\d+\.\d+\.\d+)( for this package)/g, `$1${version}$3`));
}
for (const file of walk(SOURCE)) {
  const sourceFile = path.join(SOURCE, ...file.split('/'));
  const bytes = pinCommands(readFileSync(sourceFile));
  expected.set(sourceFile, bytes);
  expected.set(path.join(PLUGIN_SKILL, ...file.split('/')), bytes);
}
for (const plugin of PLUGINS) {
  expected.set(path.join(plugin.dir, 'README.md'), pinCommands(readFileSync(path.join(plugin.dir, 'README.md'))));
  for (const file of ['LICENSE', 'NOTICE']) {
    expected.set(path.join(plugin.dir, file), readFileSync(path.join(CLI, file)));
  }
}

// 2. The version on every plugin's two manifests and on the marketplace entries. The manifests are
//    hand-authored (descriptions, keywords, the Codex `interface` block); only `version` is owned
//    here, rewritten in place so the file stays readable and reviewable in the repo.
function stamped(file, mutate) {
  if (!existsSync(file)) {
    console.error(`missing ${rel(file)} - the manifest is hand-authored; only its version is generated`);
    process.exit(2);
  }
  const json = readJson(file);
  mutate(json);
  return Buffer.from(stableJson(json));
}
for (const plugin of PLUGINS) {
  for (const manifest of [path.join(plugin.dir, '.claude-plugin', 'plugin.json'), path.join(plugin.dir, '.codex-plugin', 'plugin.json')]) {
    expected.set(manifest, stamped(manifest, (json) => { json.version = version; }));
  }
  listingProblems(plugin.dir, readJson(path.join(plugin.dir, '.codex-plugin', 'plugin.json')));
}

/**
 * The OpenAI plugin directory's own limits on the Codex manifest
 * (https://developers.openai.com/plugins/deploy/submission, read 2026-10-02). The directory refuses
 * an upload that breaks one, and only after a person has built the ZIP and opened the dashboard,
 * so the build refuses it first. The 30-character display name is why the Codex listing reads
 * "NoaCG Graphics and Playout" where every other listing has the full name.
 */
function listingProblems(dir, json) {
  const ui = json.interface ?? {};
  const where = rel(path.join(dir, '.codex-plugin', 'plugin.json'));
  const problems = [];
  const max = (field, value, limit) => {
    if (typeof value !== 'string' || !value) problems.push(`${field} is required`);
    else if (value.length > limit) problems.push(`${field} is ${value.length} characters, the limit is ${limit}: "${value}"`);
  };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(json.name ?? '') || json.name.length > 64) problems.push(`name "${json.name}" must be lowercase letters, digits and single hyphens, at most 64`);
  max('interface.displayName', ui.displayName, 30);
  max('interface.shortDescription', ui.shortDescription, 30);
  max('interface.longDescription', ui.longDescription, 4000);
  const prompts = ui.defaultPrompt ?? [];
  if (prompts.length > 3) problems.push(`interface.defaultPrompt has ${prompts.length} prompts, the limit is 3`);
  for (const p of prompts) if (p.length > 128) problems.push(`interface.defaultPrompt "${p}" is over 128 characters`);
  if (ui.brandColor !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(ui.brandColor)) problems.push(`interface.brandColor "${ui.brandColor}" is not #RRGGBB`);
  for (const field of ['composerIcon', 'logo']) {
    const file = ui[field];
    if (file === undefined) continue;
    if (!file.startsWith('./') || !existsSync(path.join(dir, file))) problems.push(`interface.${field} "${file}" must be a ./ path to a file in the plugin`);
  }
  if (problems.length) {
    console.error(`${where} breaks the OpenAI plugin directory's limits:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(2);
  }
}
expected.set(
  MARKETPLACE,
  stamped(MARKETPLACE, (json) => {
    for (const entry of json.plugins) entry.version = version;
    if (json.metadata && typeof json.metadata === 'object') json.metadata.version = version;
  }),
);
expected.set(
  SERVER_JSON,
  stamped(SERVER_JSON, (json) => {
    if (json.name !== pkg.mcpName) {
      console.error(`${rel(SERVER_JSON)} names ${JSON.stringify(json.name)} but cli/package.json mcpName is ${JSON.stringify(pkg.mcpName)} - the MCP Registry refuses a publish unless they match`);
      process.exit(2);
    }
    json.version = version;
    for (const entry of json.packages ?? []) if (entry.identifier === pkg.name) entry.version = version;
  }),
);

// Every generated copy is now known. `expected` is built by walking the skill source and by
// stamping manifests found through the marketplace, so an empty map is what a moved source folder
// or an emptied marketplace list looks like - and a comparison over no files is a --check that
// passes having compared nothing.
measured(expected.size, 'generated files');

// cli/LICENSE is the Apache source; never copy the application's AGPL root licence here.

// Strays: anything under the generated skill copy that the source no longer has.
const strays = existsSync(PLUGIN_SKILL)
  ? walk(PLUGIN_SKILL).map((f) => path.join(PLUGIN_SKILL, ...f.split('/'))).filter((f) => !expected.has(f))
  : [];

// Compared LF-normalised: a Windows checkout with core.autocrlf hands these files back with CRLF,
// and a generator that re-wrote them on every machine - or a check that failed only there - would
// teach people to ignore it (scripts/check-shared-instructions.mjs learned the same lesson).
const same = (a, b) => a.equals(b) || a.toString('utf8').replace(/\r\n/g, '\n') === b.toString('utf8').replace(/\r\n/g, '\n');
const problems = [];
for (const [file, bytes] of expected) {
  const current = existsSync(file) && statSync(file).isFile() ? readFileSync(file) : null;
  if (current && same(current, bytes)) continue;
  problems.push(`${current ? 'differs' : 'missing'}: ${rel(file)}`);
  if (!check) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}
for (const file of strays) {
  problems.push(`stray (not in the source): ${rel(file)}`);
  if (!check) rmSync(file);
}

if (check) {
  if (problems.length) {
    console.error(`build-skill --check: ${problems.length} generated copy/copies drift from cli/skill/noacg-graphic (run \`node cli/scripts/build-skill.mjs\`):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`build-skill --check OK: ${expected.size} generated files match the source (noacg v${version}).`);
} else {
  console.log(
    problems.length
      ? `build-skill: wrote ${problems.length} file(s) (noacg v${version}):\n${problems.map((p) => `  - ${p}`).join('\n')}`
      : `build-skill: every generated copy already current (noacg v${version}).`,
  );
}
