// `noacg doctor` - what this tool will use: the browser, the deployment, its bridge version.

import { browserLabel, launchBrowser } from '../browser.js';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion, configDir, noacgUrl } from '../config.js';
import { displayPrefix, resolveKey } from '../auth.js';
import { EXIT_OK, EXIT_USAGE, refuseStrayArgs, type Out, type ParsedArgs } from '../output.js';

export async function runDoctor(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const report: Record<string, unknown> = { cli: cliVersion(), url: noacgUrl(), configDir: configDir() };
  // Whether a key is HELD here, not whether it is still honoured - `noacg whoami` asks the
  // deployment; doctor stays a local report that works with no network at all.
  const held = await resolveKey(noacgUrl());
  report.login = held
    ? `${held.stored?.prefix ?? displayPrefix(held.key)}${held.source === 'env' ? ' (NOACG_AGENT_KEY)' : ''} - run \`noacg whoami\` to check it`
    : 'not logged in - run `noacg login` to save into your library';
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
  out.say(`login        ${report.login}`);
  return report.browser && report.bridge ? EXIT_OK : EXIT_USAGE;
}
