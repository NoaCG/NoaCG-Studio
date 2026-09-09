// `noacg whoami` - which key this machine holds for the configured deployment, and whether the
// deployment still honours it. Prints the PREFIX the Settings list shows, never the key.

import { noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, refuseStrayArgs, type Out, type ParsedArgs } from '../output.js';
import { ApiError, describeKey, displayPrefix, explainFailure, resolveKey } from '../auth.js';

export async function runWhoami(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const origin = noacgUrl();
  const found = await resolveKey(origin);
  if (!found) {
    out.result({ ok: false, url: origin, loggedIn: false });
    out.say(`Not logged in to ${origin} - run \`noacg login\` (or set NOACG_AGENT_KEY).`);
    return EXIT_FINDINGS;
  }
  const prefix = found.stored?.prefix ?? displayPrefix(found.key);
  try {
    const info = await describeKey(origin, found.key);
    if (!info) {
      out.result({ ok: false, url: origin, loggedIn: false, prefix, source: found.source, valid: false });
      out.say(`The key ${prefix} (${found.source === 'env' ? 'NOACG_AGENT_KEY' : 'stored'}) is no longer valid on ${origin} - revoked, or minted elsewhere. Run \`noacg login\`.`);
      return EXIT_FINDINGS;
    }
    out.result({ ok: true, url: origin, loggedIn: true, source: found.source, valid: true, key: info });
    out.say(`${origin}: "${info.name}" (${info.prefix}) - may ${info.scopes.join(', ')}; created ${info.createdAt.slice(0, 10)}, last used ${info.lastUsedAt ? info.lastUsedAt.slice(0, 16).replace('T', ' ') : 'never'}${found.source === 'env' ? ' [NOACG_AGENT_KEY]' : ''}.`);
    return EXIT_OK;
  } catch (e) {
    const message = e instanceof ApiError ? explainFailure(e.failure) : e instanceof Error ? e.message : String(e);
    out.result({ ok: false, url: origin, loggedIn: true, prefix, source: found.source, error: message });
    out.say(`Holding ${prefix} for ${origin}, but it could not be checked: ${message}`);
    return EXIT_FINDINGS;
  }
}
