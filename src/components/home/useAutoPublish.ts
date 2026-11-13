// AUTOMATIC UPDATES ON THE PRODUCTION PAGE (docs/work-specs/live-publishing/designs/G3.md sections 3
// and 8). Runs the publisher (control/autoPublish.ts) for the production the page shows, only while
// every guard is in place: the server says the publication guard is installed and the
// `auto_publish` switch is on (`auto_publish_state`, read on open and every 30 s), the production is
// published, and this page's account may publish it. Off, the page is today's page (Publish
// changes). Decides nothing about air; it hands the publisher the browser and reports its view.

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../backend/supabase';
import { confirmedRevision, storedRevision } from '../../backend/savedRevision';
import { onSyncState, syncNow } from '../../backend/syncController';
import { refreshTeams, subscribeTeamState, getTeamState } from '../../backend/teamProductions';
import { loadShows, type Show } from '../../model/shows';
import { createAutoPublisher, CHECK_EVERY_MS, type AutoPublishView } from '../../control/autoPublish';
export { oldOutputNames } from '../../control/autoPublish';
import { publishRevision, publishStepMs } from '../../control/publishRevision';
import type { CuePublished } from '../../control/hostedControl';
import type { PayloadVersion } from '../../control/payloadVersion';

/** Whether the server has the guard installed and the switch on; null while unknown. */
async function readSwitch(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('auto_publish_state');
  if (error || !data) return false;
  const state = data as { installed?: unknown; on?: unknown };
  return state.installed === true && state.on === true;
}

export interface AutoPublishState {
  /** The publisher runs for this production: no Publish changes. */
  active: boolean;
  view: AutoPublishView | null;
}

export function useAutoPublish(o: {
  show: Show | null;
  /** Signed in with an account that may author (the Publish gate). */
  mayPublish: boolean;
  /** The signed-in account: another account starts a fresh publisher (a refusal for the old one no
   *  longer holds). */
  account: string | null;
  appearanceFor: { readonly current: ((show: Show) => Promise<CuePublished | undefined>) | undefined };
  /** A publish landed: the stamp it wrote. */
  onPublished: (ver: PayloadVersion) => void;
}): AutoPublishState {
  const [switchOn, setSwitchOn] = useState(false);
  const [view, setView] = useState<AutoPublishView | null>(null);
  const showId = o.show?.id ?? null;
  const teamId = o.show?.teamId ?? null;
  const published = !!o.show?.hostedSlug;
  const enabled = !!showId && published && o.mayPublish;
  const latest = useRef(o);
  latest.current = o;

  useEffect(() => {
    if (!enabled) {
      setSwitchOn(false);
      return;
    }
    let alive = true;
    const ask = () => void readSwitch().then((on) => { if (alive) setSwitchOn(on); }, () => {});
    ask();
    const timer = setInterval(ask, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);

  const active = enabled && switchOn;
  useEffect(() => {
    if (!active || !showId) {
      setView(null);
      return;
    }
    const current = () => loadShows().find((s) => s.id === showId) ?? null;
    /** The record a confirmed revision was read from: the publish builds from that very object. */
    let confirmedRecord: { rev: number; show: Show } | null = null;
    /** This page's own catch-up pass is running: its sync is not a save of this page. */
    let catchingUp = false;
    const publisher = createAutoPublisher({
      now: () => Date.now(),
      setTimer: (ms, run) => {
        const t = setTimeout(run, ms);
        return () => clearTimeout(t);
      },
      confirmed: async () => {
        const show = current();
        if (!show) return null;
        const answer = await confirmedRevision(show);
        if (answer && 'rev' in answer) confirmedRecord = { rev: answer.rev, show };
        return answer;
      },
      stored: async () => {
        const show = current();
        if (!show) return null;
        const sb = await getSupabase();
        if (!sb) return null;
        const [record, row] = await Promise.all([
          storedRevision(show),
          sb.from('control_shows').select('published_rev').eq('id', show.id).maybeSingle(),
        ]);
        if (!record || row.error) return null;
        const rev = (row.data as { published_rev?: unknown } | null)?.published_rev;
        return { rev: record.rev, published: typeof rev === 'number' ? rev : null };
      },
      catchUp: async () => {
        catchingUp = true;
        try {
          if (teamId) await refreshTeams(false);
          else await syncNow();
        } finally {
          catchingUp = false;
        }
      },
      publish: async (rev) => {
        const held = confirmedRecord && confirmedRecord.rev === rev ? confirmedRecord.show : null;
        if (!held) return { kind: 'transient', reason: 'the saved production changed while it was being published' };
        const measure = latest.current.appearanceFor.current;
        const outcome = await publishRevision(held, rev, measure ? () => measure(held) : undefined);
        if (outcome.kind === 'published' && outcome.ver) latest.current.onPublished(outcome.ver);
        return outcome;
      },
      changed: (next) => setView(next),
    });
    publisher.check(true);
    // THE MEASURE HARNESS ONLY (designs/G3.md section 13): with this session flag set, the page
    // publishes its current saved revision again and again, whole, so press-to-ran can be measured
    // during a publish on a production build. Nothing sets the flag but the harness.
    const measuring = (() => {
      try {
        return window.sessionStorage.getItem('noacg-measure-publish-loop') === '1';
      } catch {
        return false;
      }
    })();
    let looping = measuring;
    if (measuring) {
      void (async () => {
        while (looping) {
          const show = current();
          const answer = show ? await confirmedRevision(show) : null;
          if (show && answer && 'rev' in answer) {
            const w = window as unknown as { __noacgPublishWindows?: [number, number, string, number][]; __noacgPublishRunning?: number | null };
            const t0 = performance.timeOrigin + performance.now();
            const from = publishStepMs.length;
            w.__noacgPublishRunning = t0;
            const measure = latest.current.appearanceFor.current;
            const outcome = await publishRevision(show, answer.rev, measure ? () => measure(show) : undefined, true);
            w.__noacgPublishRunning = null;
            const longest = Math.max(0, ...publishStepMs.slice(from));
            (w.__noacgPublishWindows ??= []).push([t0, performance.timeOrigin + performance.now(), outcome.kind, longest]);
          }
          await new Promise((r) => setTimeout(r, 20));
        }
      })();
    }
    // A save of this page confirmed: a personal one when a sync pass ends synced, a team one when its
    // save is no longer pending.
    let wasSaving = false;
    const offSync = teamId
      ? subscribeTeamState(() => {
          const saving = getTeamState().saving[showId] === 'pending';
          if (wasSaving && !saving && !catchingUp) publisher.saved();
          wasSaving = saving;
        })
      : onSyncState((s) => {
          if (s.phase === 'syncing' || s.phase === 'pending') wasSaving = !catchingUp;
          else if (s.phase === 'synced' && wasSaving) {
            wasSaving = false;
            publisher.saved();
          }
        });
    return () => {
      looping = false;
      offSync();
      publisher.stop();
    };
  }, [active, showId, teamId, o.account]);

  return { active, view: active ? view : null };
}

