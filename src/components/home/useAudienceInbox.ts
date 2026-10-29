import { useEffect, useMemo, useState } from 'react';
import type { Show } from '../../model/shows';
import type { ObservableAudience } from '../../audience/audienceTypes';
import { localAudienceFor, moveKeptMessages } from '../../audience/localAudience';
import { createSupabaseAudience } from '../../audience/audienceData';
import { isBackendConfigured } from '../../backend/config';

/** How often the production page's header re-reads a REAL inbox. The Audience view reads at the
 *  provider's own 4 s; a count in the header is a nudge, not the moderation surface, so it asks a
 *  third as often and costs a third of the requests. */
const HEADER_READ_MS = 12_000;

/**
 * The production's inbox provider: a PUBLISHED production on a build with a backend reads its real
 * inbox through its control slug, anything else the local provider (src/audience/localAudience.ts).
 * One choice, shared by the header count, Messages and the cue editor's Fill, so none of them can
 * read a different inbox.
 */
export function useMessagesBackend(show: Pick<Show, 'id' | 'name' | 'hostedSlug'>): { live: boolean; backend: ObservableAudience };
export function useMessagesBackend(show: Pick<Show, 'id' | 'name' | 'hostedSlug'> | null): { live: boolean; backend: ObservableAudience | null };
export function useMessagesBackend(show: Pick<Show, 'id' | 'name' | 'hostedSlug'> | null): { live: boolean; backend: ObservableAudience | null } {
  const id = show?.id;
  const name = show?.name ?? '';
  const slug = show?.hostedSlug;
  const live = Boolean(slug) && isBackendConfigured();
  const backend = useMemo<ObservableAudience | null>(
    () => (!id ? null : live && slug ? createSupabaseAudience({ controlSlug: slug }) : localAudienceFor(id, name)),
    [live, slug, id, name],
  );
  // Published: the messages kept in this browser before publishing join the published inbox.
  useEffect(() => {
    if (live && id && backend) void moveKeptMessages(id, backend).catch(() => {});
  }, [live, id, backend]);
  return { live, backend };
}

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
 * On an unpublished production the local provider's operator-added messages are in browser
 * storage and reach every tab of the production; its simulated rows live in one tab only, so they
 * count only on the Messages view's own tab (src/audience/localAudience.ts).
 */
export function useAudienceInbox(show: Pick<Show, 'id' | 'name' | 'hostedSlug'> | null): AudienceInbox {
  const { live, backend } = useMessagesBackend(show);
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
