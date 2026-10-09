// `noacg doctor` - what this tool will use: the browser, the deployment, its bridge version.
//
// It also answers a question nothing else on the machine answers: is what you are running CURRENT?
// Two halves, both silent when there is nothing to say - the NoaCG plugins installed in Claude
// Code or Codex (src/skillVersion.ts), and this CLI against the version it should be. With a
// plugin installed that is the plugin's own version: the noacg-mcp launcher runs only the CLI
// version on its manifest and skips any other, and the skill tells the agent the same. With no
// plugin it is npm's `latest` (src/npmLatest.mjs). Neither can fail the command: a version check
// is a report, and the exit code stays what the browser and the bridge say, so a script that
// gates on `doctor` does not start failing the day a release lands.

import { browserLabel, launchBrowser } from '../browser.js';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion, configDir, credentialsDir, noacgUrl, UNKNOWN_VERSION } from '../config.js';
import { displayPrefix, resolveKey } from '../auth.js';
import { fetchLatestVersion, isBehind } from '../npmLatest.mjs';
import { installedPlugins, type InstalledPlugin } from '../skillVersion.js';
import { EXIT_OK, EXIT_USAGE, refuseStrayArgs, type Out, type ParsedArgs } from '../output.js';

/** The two lines one installed plugin earns when it is not the newest one that exists. */
function stalePluginLines(plugin: InstalledPlugin, cli: string, latest: string | null): string[] | null {
  // Measure against the newest version KNOWN to exist, which is this CLI unless npm is ahead of
  // it. One release stamps the package, both plugins' manifests and the marketplace entries from
  // one number (cli/scripts/build-skill.mjs), so a published 0.3.3 means a 0.3.3 plugin is
  // installable. It matters on the ordinary machine, where the CLI and the plugin were installed
  // on the same day and are equally old: comparing the plugin against the CLI alone would find
  // them in agreement and say nothing.
  const behindNpm = isBehind(cli, latest);
  const newest = behindNpm ? (latest as string) : cli;
  const source = behindNpm ? "npm's latest is" : 'this CLI ships';
  if (!isBehind(plugin.version, newest)) return null; // current, or a version nobody can order
  const label = plugin.kind === 'mcp' ? 'mcp plugin   ' : 'skill        ';
  return [
    `${label}${plugin.version} in ${plugin.harness}, but ${source} ${newest} - an installed plugin does not update itself unless its marketplace has auto-update on`,
    `             run: ${plugin.update}`,
  ];
}

/** The CLI version the installed plugins run, or null with no plugin installed: the noacg-mcp
 *  launcher's when there is one, since it skips any other version, else the skill's. The newest
 *  when several disagree, because the older plugin gets its own update line. */
function pluginCliVersion(plugins: InstalledPlugin[]): string | null {
  const launchers = plugins.filter((p) => p.kind === 'mcp');
  const versions = (launchers.length ? launchers : plugins).map((p) => p.version);
  return versions.reduce<string | null>((a, b) => (a === null || isBehind(a, b) ? b : a), null);
}

export async function runDoctor(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const cli = cliVersion();
  // Ask npm first and read the answer last: the browser launch below is seconds and this is a
  // cached read with a 1.5 s cap, so the check costs no wall clock at all. It never rejects.
  const asked = fetchLatestVersion();
  const report: Record<string, unknown> = { cli, url: noacgUrl(), configDir: configDir(), credentialsDir: credentialsDir() };
  // Whether a key is HELD here, not whether it is still honoured - `noacg whoami` asks the
  // deployment; doctor stays a local report that works with no network at all.
  const held = await resolveKey(noacgUrl());
  report.login = held
    ? `${held.stored?.prefix ?? displayPrefix(held.key)}${held.source === 'env' ? ' (NOACG_AGENT_KEY)' : ''} - run \`noacg whoami\` to check it`
    : 'not logged in - run `noacg login` to save into your library';
  const plugins = installedPlugins();
  report.skills = plugins.filter((p) => p.kind === 'skill');
  report.mcpPlugins = plugins.filter((p) => p.kind === 'mcp');
  try {
    await launchBrowser();
    report.browser = browserLabel();
  } catch (e) {
    report.browser = null;
    report.browserError = e instanceof Error ? e.message : String(e);
  }
  if (report.browser) {
    try {
      const bridge = await BridgeClient.connect();
      report.bridge = bridge.hello;
      await bridge.close();
    } catch (e) {
      report.bridge = null;
      report.bridgeError = e instanceof Error ? e.message : String(e);
    }
  }
  report.latest = await asked;
  out.result(report);
  out.say(`noacg ${report.cli}`);
  out.say(`deployment   ${report.url}`);
  out.say(`browser      ${report.browser ?? `NONE - ${report.browserError}`}`);
  if (report.bridge) {
    const h = report.bridge as { v: number; app: { commit: string; ref: string } | null };
    out.say(`bridge       v${h.v}${h.app ? ` (${h.app.ref}@${h.app.commit.slice(0, 10)})` : ' (dev server, no version marker)'}`);
  } else if (report.browser) {
    out.say(`bridge       NONE - ${report.bridgeError}`);
  }
  out.say(`config dir   ${report.configDir}`);
  if (report.credentialsDir !== report.configDir) out.say(`key store    ${report.credentialsDir} (NOACG_CREDENTIALS_DIR)`);
  out.say(`login        ${report.login}`);
  // Both version rows compare against the version of the CLI executing this, so a CLI that could
  // not read its own package.json has nothing to compare with: `cliVersion()` answers a sentinel
  // there, and instructing anybody from a fallback constant is the one thing these rows must not
  // do. Silence, exactly as for an unreadable install.
  const latest = report.latest as string | null;
  if (cli !== UNKNOWN_VERSION) {
    // Silent when they match. Every installed plugin that is behind gets its own two lines,
    // because the command that fixes one harness does nothing for the other.
    for (const plugin of plugins) for (const line of stalePluginLines(plugin, cli, latest) ?? []) out.say(line);
    // And this CLI against the version it should be. Never `@latest` with a plugin installed: its
    // launcher skips any CLI but its own version, and the lines above already say when a newer
    // plugin exists. `isBehind`, not `!==`, so a checkout built ahead of the published version -
    // every developer of this repo between a bump and its release - is told nothing.
    // A plugin ahead of npm (taken from the marketplace between a release landing and its publish)
    // names a version npm would refuse, so that waits for npm.
    const pinned = pluginCliVersion(plugins);
    if (pinned) {
      if (isBehind(cli, pinned) && !isBehind(latest, pinned)) {
        out.say(`update       the installed plugin uses @noacg/cli ${pinned} - run: npm i -g @noacg/cli@${pinned}`);
      }
    } else if (isBehind(cli, latest)) {
      out.say(`update       npm's latest @noacg/cli is ${latest} - run: npm i -g @noacg/cli@latest`);
    }
  }
  return report.browser && report.bridge ? EXIT_OK : EXIT_USAGE;
}
