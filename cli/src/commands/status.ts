// `noacg status <id>` - read back what THIS key delivered under an operation or resource id
// (docs/AGENT_SAVE.md §9): which account and deployment it went to, and whether it is there now -
// saved, pending Install, installed as a production, dismissed or missing.
//
// It answers only for this key's own deliveries; another key's or another account's id is the same
// "nothing here" as an id that never existed. A readback is a fact about the account, not about a
// browser: it never says anyone opened the link.

import { noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { explainError, readDelivery, resolveKey } from '../auth.js';
import { describeReceipt, isUuid } from '../receipt.js';
import { notLoggedIn } from './save.js';

export async function runStatus(args: ParsedArgs, out: Out): Promise<number> {
  const id = args._[1]?.trim();
  if (!id || !isUuid(id)) throw new UsageError('status needs the operation or resource id a save or pack --save printed.');
  refuseStrayArgs(args, 1);
  const origin = noacgUrl();
  const found = await resolveKey(origin);
  if (!found) {
    const error = notLoggedIn(origin);
    out.result({ ok: false, reason: 'not-logged-in', error });
    out.say(error);
    return EXIT_FINDINGS;
  }
  try {
    const receipt = await readDelivery(origin, found.key, id);
    if (!receipt) {
      const error = `Nothing delivered under ${id} by this key on ${origin}. Check NOACG_URL and \`noacg whoami\`; another key's or another account's delivery is not visible here.`;
      out.result({ ok: false, reason: 'not-found', error });
      out.say(error);
      return EXIT_FINDINGS;
    }
    out.result({ ok: true, receipt });
    for (const line of describeReceipt(receipt)) out.say(line);
    return EXIT_OK;
  } catch (e) {
    const error = explainError(e);
    out.result({ ok: false, reason: 'refused', error });
    out.say(`Could not check it: ${error}`);
    return EXIT_FINDINGS;
  }
}
