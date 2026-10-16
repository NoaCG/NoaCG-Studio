// THE LIBRARY RECORD BEHIND A DEEP LINK, including the ones the cloud is still holding.
//
// `#/graphic/<id>` is a link to a record, and the reader who follows it is very often NOT the
// browser that made it: an agent's `noacg save` mints the graphic server-side and prints the link
// (docs/AGENT_SAVE.md), so the studio that opens it has a library from before the save. Looking
// the id up in the local library and giving up is therefore the wrong question asked one moment
// too early - the record is real, it is simply still in the cloud.
//
// This module asks the RIGHT question: is there such a record for this reader, once the cloud has
// had its say? It lives beside the sync controller rather than in the store because answering it
// means driving a sync pass, and the store layer does not reach into `backend/`.
//
// A PRODUCTION LINK IS THE SAME QUESTION. `#/production/<id>` is printed by `noacg save
// --production` and opened cold just as often, and a personal production travels in the same
// sync pass (`show` is a sync kind, backend/sync.ts), so `productionWhenSynced` asks it through
// the same wait rather than a second mechanism. A TEAM production is not in that pass: it arrives
// with the team fetch (model/teamShows.ts), whose own `loading` status the production page reads.
//
// WHAT IT DOES NOT DO: decide what happens next. A miss can mean "deleted", "someone else's" or
// "nobody is signed in here", and those want different answers on screen - a redirect, a prompt,
// nothing at all. The caller (App.tsx's graphic-route effect, GraphicControlPage, ProductionPage) holds that
// decision, which is why this returns a reason rather than performing one.

import { isBackendConfigured } from './config';
import { getAccessToken } from './auth';
import { getSyncState, syncNow } from './syncController';
import { graphicById, type GraphicDoc } from '../model/library';
import { loadShows, type Show } from '../model/shows';

export type RecordLookup<T> =
  | { status: 'found'; doc: T }
  /** Looked everywhere this reader has: the id is deleted, or it belongs to another account. */
  | { status: 'unknown' }
  /** A configured build with no session. The record may exist perfectly well in the account
   *  nobody has signed into here, so the LINK is still good and must not be thrown away. */
  | { status: 'needs-sign-in' };

export type GraphicLookup = RecordLookup<GraphicDoc>;

/**
 * The backstop, and ONLY the backstop: it is reached when a sync pass neither finishes nor fails,
 * which is a wedged request rather than an answer. Every ordinary outcome arrives long before it -
 * the record appears, or a clean pass says it is not there - so making this generous does not slow
 * the "deleted graphic lands on Home" case down at all.
 *
 * It is 60 s because a pass is not one round trip. The list comes first, then a `get()` per record
 * actually pulled (the provider's list returns cheap sentinel bodies - backend/supabaseProvider.ts),
 * so a slow network multiplies. Measured 2026-09-16 with every `documents` request held 8 s: the
 * record reached the library at 27 s, and a 20 s ceiling had already given up on it four seconds
 * earlier. On a classroom's shared WiFi that ceiling is the defect all over again.
 */
const CLOUD_ANSWER_MS = 60_000;

/**
 * The graphic for `id`, waiting for the cloud when this browser has not pulled it yet.
 *
 * Resolves as soon as the answer is known - the local hit is synchronous in all but name, and a
 * record that arrives mid-pass resolves on the library write rather than at the end of the pass.
 */
export function graphicWhenSynced(id: string, timeoutMs = CLOUD_ANSWER_MS): Promise<GraphicLookup> {
  return recordWhenSynced(() => graphicById(id), timeoutMs);
}

/** The production for `id`, asked the same way as a graphic. It finds a team production that is
 *  already held or lands mid-wait, but the "no" comes from the personal sync pass alone. */
export function productionWhenSynced(id: string, timeoutMs = CLOUD_ANSWER_MS): Promise<RecordLookup<Show>> {
  return recordWhenSynced(() => loadShows().find((s) => s.id === id) ?? null, timeoutMs);
}

async function recordWhenSynced<T>(find: () => T | null, timeoutMs: number): Promise<RecordLookup<T>> {
  const local = find();
  if (local) return { status: 'found', doc: local };
  // An offline build has no second place to look: its library IS this browser.
  if (!isBackendConfigured()) return { status: 'unknown' };
  if (!(await getAccessToken().catch(() => null))) return { status: 'needs-sign-in' };
  const pulled = await cloudAnswer(find, timeoutMs);
  return pulled ? { status: 'found', doc: pulled } : { status: 'unknown' };
}

/**
 * Ask the cloud, and take whichever answer comes first:
 *
 *   - the record APPEARS in the library. Every library write announces `spx-data-changed`
 *     (model/library.ts), and a sync pass's pull writes are ordinary library writes, so this
 *     fires the moment the record lands - including from a pass that was already running when
 *     we asked, which is the common case on boot and several seconds earlier than its end.
 *   - a sync PASS that covers this call finishes and the record is still not there. That is the
 *     real "no": the cloud was asked and did not have it.
 *
 * The timeout is the backstop for neither of those happening (a pass wedged on a request that
 * never settles), so the caller is never left with a surface that waits forever.
 */
function cloudAnswer<T>(find: () => T | null, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (doc: T | null): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('spx-data-changed', onData);
      clearTimeout(timer);
      resolve(doc);
    };
    const onData = (): void => {
      const doc = find();
      if (doc) settle(doc);
    };
    window.addEventListener('spx-data-changed', onData);
    const timer = setTimeout(() => settle(find()), timeoutMs);
    // syncNow resolves when a pass that could SEE this record has completed - see the `waiting`
    // list in syncController.ts, which is the half of this fix that lives over there.
    void syncNow()
      .catch(() => undefined)
      .then(() => {
        const doc = find();
        if (doc) {
          settle(doc);
          return;
        }
        // A "NO" IS ONLY WORTH SOMETHING FROM A PASS THAT COMPLETED. One that could not run at
        // all - the session still coming back, the network blinking - knows nothing about
        // whether this record exists, and answering "not there" from it costs the reader their
        // link, while answering nothing costs them a few more seconds on a surface they are
        // already looking at. So the listener and the timeout above carry those, and only a
        // completed pass may say no.
        //
        // COMPLETED IS NOT THE SAME AS 'synced'. A pass that read the whole cloud listing and
        // then failed to APPLY some unrelated record reports 'error' with its result attached
        // (syncController.ts), and that pass answered this question perfectly well - insisting
        // on 'synced' left a deleted id waiting out the whole backstop below. A pass that threw
        // reports 'error' with no result, and that one is the real "we do not know".
        const sync = getSyncState();
        if (sync.phase === 'synced' || (sync.phase === 'error' && sync.last)) settle(null);
      });
  });
}
