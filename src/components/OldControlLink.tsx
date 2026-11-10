import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { getSupabase } from '../backend/supabase';

/**
 * AN OLD CONTROL LINK: `<app-url>?control=<slug>`. The hosted control page is retired
 * (docs/work-specs/retire-hosted-control/spec.md, C2): the production page is the one operator
 * surface. A saved link still resolves its slug and opens that production's page, which shows it
 * to a member or asks a signed-out visitor to sign in. A slug that names no published production
 * says so, with a way home. A backend that does not answer is not an answer: the page keeps asking.
 */

/** What one ask of the server said: the production's id, no production, or no answer. */
type Lookup = { kind: 'found'; id: string } | { kind: 'gone' } | { kind: 'unanswered' };

async function lookUp(slug: string): Promise<Lookup> {
  const sb = await getSupabase().catch(() => null);
  if (!sb) return { kind: 'unanswered' };
  const { data, error } = await sb.rpc('control_show_by_slug', { p_slug: slug }).select('id');
  if (error) return { kind: 'unanswered' };
  const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown } | null | undefined;
  return typeof row?.id === 'string' ? { kind: 'found', id: row.id } : { kind: 'gone' };
}

/** How long to wait before asking again after no answer: 2 s, doubling, at most 15 s. */
const retryDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 15_000);

export default function OldControlLink({ slug }: { slug: string }) {
  // Offline builds have no published productions, so no control link can open anything.
  const [state, setState] = useState<'asking' | 'waiting' | 'gone'>(() => (isBackendConfigured() ? 'asking' : 'gone'));

  useEffect(() => {
    if (!isBackendConfigured()) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async (attempt: number) => {
      const answer = await lookUp(slug).catch((): Lookup => ({ kind: 'unanswered' }));
      if (stopped) return;
      if (answer.kind === 'found') {
        // Replace, not push: Back must not return to a link that only forwards.
        window.location.replace(`${window.location.pathname}#/production/${encodeURIComponent(answer.id)}`);
        return;
      }
      if (answer.kind === 'gone') {
        setState('gone');
        return;
      }
      setState('waiting');
      timer = setTimeout(() => void ask(attempt + 1), retryDelay(attempt));
    };
    void ask(0);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug]);

  return (
    <div className="sendin">
      {state === 'gone' ? (
        <div className="sendin-card" data-testid="old-control-link" data-state="gone">
          <div className="sendin-title">This link no longer works</div>
          <p>
            <a href={`${window.location.pathname}#/home`}>Go to NoaCG Studio</a>
          </p>
        </div>
      ) : state === 'waiting' ? (
        <div className="sendin-card" data-testid="old-control-link" data-state="waiting">
          <div className="sendin-title">Waiting for the server</div>
          <p className="muted">The server is not answering right now. This page keeps trying.</p>
          <p>
            <a href={`${window.location.pathname}#/home`}>Go to NoaCG Studio</a>
          </p>
        </div>
      ) : (
        <div className="sendin-card" data-testid="old-control-link" data-state="asking">
          <p className="muted">Opening the production…</p>
        </div>
      )}
    </div>
  );
}
