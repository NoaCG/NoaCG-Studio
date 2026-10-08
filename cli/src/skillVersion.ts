// Which `noacg-graphic` skill this machine actually has installed, and how to update it.
//
// Nothing auto-updates a Claude Code or Codex marketplace. A plugin installed once keeps the skill
// text it was installed with - measured on this laptop 2026-09-16 (
// https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md): `claude plugin list` reported
// noacg@noacg-studio 0.2.0 while the marketplace shipped 0.3.3, and the SKILL.md a session loaded
// was eleven lines shorter than the repository's. The plugin reports itself as enabled either way,
// so a user has no reason to suspect anything. `noacg doctor` is where that becomes visible.
//
// HOW DOCTOR LEARNS THE VERSION. The backlog names two routes, and this is the second one: read
// the plugin manifest sitting next to the skill on disk. The first route - have the skill's own
// command lines pass the version they were loaded from - was rejected, for one decisive reason:
// the skill text would have to carry its version, so the check could only ever fire for people who
// had ALREADY updated to a version that carries it. The 0.2.0 copy on this laptop has no such line
// and never will, and it is exactly the copy worth warning about. (It is also a version number
// retyped by a language model reading a document, which is not a measurement.) Reading the
// manifest works on the installs that exist today, including the stale one.
//
// WHAT IT REFUSES TO DO. Never print a version it guessed. A version comes from a manifest lying
// beside a real SKILL.md, never from a cache directory's name, never from the harness's index
// alone. Anything unreadable, ambiguous or absent is silence.
//
// The reads are synchronous, unlike the rest of `src/` - a handful of local stats and two small
// JSON files, where async would buy nothing and cost every caller an await.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** One installed copy of the skill, with the exact command that updates it. */
export interface InstalledSkill {
  /** The agent harness holding it, as a person would name it. */
  harness: string;
  /** The plugin id, `name@marketplace`, as the harness's own commands spell it. */
  plugin: string;
  /** The version on the manifest beside the skill. */
  version: string;
  /** The plugin root on disk - the folder holding `skills/noacg-graphic/`. */
  path: string;
  /** What to run to bring it current. */
  update: string;
}

interface Harness {
  name: string;
  /** The harness's config directory, honouring the env var it uses to relocate it. */
  home: () => string;
  update: (plugin: string, marketplace: string) => string;
}

const HARNESSES: Harness[] = [
  {
    name: 'Claude Code',
    home: () => process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), '.claude'),
    // Two commands, because they do different halves: the first refreshes the marketplace checkout
    // (`claude plugin marketplace --help`: "Update marketplace(s) from their source"), the second
    // re-installs the plugin from it. Refreshing alone leaves the installed copy where it was.
    update: (plugin, marketplace) =>
      `claude plugin marketplace update ${marketplace} && claude plugin update ${plugin}`,
  },
  {
    name: 'Codex',
    home: () => process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex'),
    // Codex spells the same two steps differently and has no `update` verb - `add` re-installs.
    update: (plugin, marketplace) =>
      `codex plugin marketplace upgrade ${marketplace} && codex plugin add ${plugin}`,
  },
];

/** The skill folder a plugin must carry for any of this to be about the skill at all. */
const SKILL_FILE = path.join('skills', 'noacg-graphic', 'SKILL.md');

/**
 * Where a plugin keeps its manifest. One plugin folder ships both (`cli/plugin/`), and which one
 * an install was made by does not matter here: `cli/scripts/build-skill.mjs` stamps both from the
 * package's single version, and its `--check` refuses a tree where they disagree. So the first one
 * found answers, and the order is arbitrary rather than per-harness.
 */
const MANIFEST_DIRS = ['.claude-plugin', '.codex-plugin'];

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function dirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** The version on the manifest beside the skill, or null when no manifest there carries one. */
function manifestVersion(root: string): string | null {
  for (const dir of MANIFEST_DIRS) {
    const version = readJson(path.join(root, dir, 'plugin.json'))?.version;
    if (typeof version === 'string' && version) return version;
  }
  return null;
}

/**
 * Plugin roots that carry the skill, as `{ root, plugin }` where `plugin` is `name@marketplace`.
 *
 * Preferred source is the harness's own install record, which names the ACTIVE install path. The
 * cache-directory scan is the fallback for a harness that keeps no such file (Codex, today), and
 * it refuses to choose when a plugin has several versions cached: the newest directory is not
 * necessarily the one a session loaded, and a guess here is exactly what this command must not do.
 */
function pluginRoots(home: string): { root: string; plugin: string }[] {
  const plugins = path.join(home, 'plugins');
  const carriesSkill = (root: string) => existsSync(path.join(root, SKILL_FILE));

  const index = readJson(path.join(plugins, 'installed_plugins.json'))?.plugins;
  const found: { root: string; plugin: string }[] = [];
  if (index && typeof index === 'object') {
    for (const [plugin, records] of Object.entries(index as Record<string, unknown>)) {
      // The records are an ARRAY because one plugin can be recorded once per scope (user and
      // project), and those records share one cache directory. Same folder, same manifest, same
      // version - so keep the first and drop the rest, or `doctor` prints one identical stale
      // block per scope.
      const seen = new Set<string>();
      for (const record of Array.isArray(records) ? records : []) {
        const installPath = (record as { installPath?: unknown })?.installPath;
        if (typeof installPath !== 'string' || seen.has(installPath)) continue;
        seen.add(installPath);
        if (carriesSkill(installPath)) found.push({ root: installPath, plugin });
      }
    }
  }
  if (found.length) return found;

  // `plugins/cache/<marketplace>/<plugin>/<version>/`, the layout both harnesses use.
  const cache = path.join(plugins, 'cache');
  for (const marketplace of dirNames(cache)) {
    for (const name of dirNames(path.join(cache, marketplace))) {
      const versions = dirNames(path.join(cache, marketplace, name))
        .map((v) => path.join(cache, marketplace, name, v))
        .filter(carriesSkill);
      if (versions.length === 1) found.push({ root: versions[0], plugin: `${name}@${marketplace}` });
    }
  }
  return found;
}

/**
 * Every installed copy of the skill this machine can be shown to have, one per harness that has
 * one. An empty list is the normal answer for a terminal user who never installed a plugin, and
 * also the answer whenever anything about an install is unreadable.
 *
 * It reports what is INSTALLED rather than trying to work out which harness invoked it. A
 * subprocess cannot tell that reliably - this laptop's own sessions carry both `CLAUDECODE` and
 * `CODEX_*` in the same environment - and a wrong attribution would print the wrong update
 * command. Naming the harness on the line costs one word and is always true.
 */
export function installedSkills(): InstalledSkill[] {
  const out: InstalledSkill[] = [];
  for (const harness of HARNESSES) {
    let home: string;
    try {
      home = harness.home();
    } catch {
      continue; // no home directory to speak of (a service account) - not an error worth a word
    }
    for (const { root, plugin } of pluginRoots(home)) {
      const version = manifestVersion(root);
      if (!version) continue; // no manifest, no claim - a hand-copied skill folder has no version
      const marketplace = plugin.includes('@') ? plugin.slice(plugin.lastIndexOf('@') + 1) : plugin;
      out.push({ harness: harness.name, plugin, version, path: root, update: harness.update(plugin, marketplace) });
    }
  }
  return out;
}
