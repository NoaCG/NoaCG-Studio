import { useEffect, useMemo, useState } from 'react';
import type { Show } from '../../model/shows';
import type { ObservableAudience } from '../../audience/audienceTypes';
import { localAudienceFor } from '../../audience/localAudience';
import { createSupabaseAudience } from '../../audience/audienceData';
import { isBackendConfigured } from '../../backend/config';

/** How often the production page's header re-reads a REAL inbox. The Audience view reads at the
 *  provider's own 4 s; a count in the header is a nudge, not the moderation surface, so it asks a
 *  third as often and costs a third of the requests. */
const HEADER_READ_MS = 12_000;

export interface AudienceInbox {
  /** Submissions waiting in the inbox (status `new`): the header's "Audience 3". */
  waiting: number;
  /** Anything has arrived at all: the join page is in use, so the Audience view is too. */
  any: boolean;
}

/**
 * The production's audience INBOX as the header sees it: how many submissions are waiting, and
 * whether there are any. The same provider choice as `ProductionAudienceWorkspace` makes - a
 * published production on a build with a backend reads its real inbox through its control slug,
 * anything else the in-memory rehearsal provider - so the count and the inbox cannot disagree.
 *
 * The rehearsal provider lives in this browser tab only, so on the Playout tab of an unpublished
 * production it is empty, and the count shows on the Audience view's own tab, where it is.
 */
export function useAudienceInbox(show: Pick<Show, 'id' | 'name' | 'hostedSlug'> | null): AudienceInbox {
  const id = show?.id;
  const name = show?.name ?? '';
  const slug = show?.hostedSlug;
  const live = Boolean(slug) && isBackendConfigured();
  const backend = useMemo<ObservableAudience | null>(
    () => (!id ? null : live && slug ? createSupabaseAudience({ controlSlug: slug }) : localAudienceFor(id, name)),
    [live, slug, id, name],
  );
  const [inbox, setInbox] = useState<AudienceInbox>({ waiting: 0, any: false });
  useEffect(() => {
    if (!backend) return;
    let alive = true;
    let last = 0;
    const read = () => {
      const now = Date.now();
      if (live && now - last < HEADER_READ_MS) return;
      last = now;
      void backend.list().then(
        (rows) => {
          if (!alive) return;
          const waiting = rows.filter((r) => r.status === 'new').length;
          const any = rows.length > 0;
          setInbox((prev) => (prev.waiting === waiting && prev.any === any ? prev : { waiting, any }));
        },
        // A failed read changes nothing: the header keeps the last count it had.
        () => {},
      );
    };
    read();
    const off = backend.onChange(read);
    return () => {
      alive = false;
      off();
    };
  }, [backend, live]);
  return inbox;
}
