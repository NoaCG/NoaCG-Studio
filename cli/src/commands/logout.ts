// `noacg logout` - end this machine's agent key: revoke it on the deployment (the key may revoke
// ITSELF and nothing else) and forget it locally. `--local` only forgets, for a key you mean to
// keep using elsewhere.

import { noacgUrl } from '../config.js';
import { EXIT_OK, flagBool, refuseStrayArgs, type Out, type ParsedArgs } from '../output.js';
import { forgetKey, resolveKey, revokeSelf } from '../auth.js';

export async function runLogout(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const origin = noacgUrl();
  const found = await resolveKey(origin);
  if (!found) {
    out.result({ ok: true, url: origin, revoked: false, forgotten: false });
    out.say(`Not logged in to ${origin}.`);
    return EXIT_OK;
  }
  let revoked = false;
  if (flagBool(args, 'local', false) === false) {
    try {
      revoked = await revokeSelf(origin, found.key);
    } catch (e) {
      out.log(`Could not revoke the key on ${origin} (${e instanceof Error ? e.message : String(e)}); forgetting it locally anyway - revoke it in Settings → Account → Agent access.`);
    }
  }
  const forgotten = found.source === 'file' ? await forgetKey(origin) : false;
  out.result({ ok: true, url: origin, revoked, forgotten, source: found.source });
  if (found.source === 'env') out.say(`The key came from NOACG_AGENT_KEY${revoked ? ' and was revoked' : ''} - unset the variable to stop using it here.`);
  else out.say(`${revoked ? 'Revoked and forgot' : 'Forgot'} the key for ${origin}.`);
  return EXIT_OK;
}
