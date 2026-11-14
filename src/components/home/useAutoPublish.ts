// AUTOMATIC UPDATES ON THE PRODUCTION PAGE (docs/work-specs/live-publishing/designs/G3.md sections 3
// and 8). Runs the publisher (control/autoPublish.ts) for the production the page shows, only while
// every guard is in place: the server says the publication guard is installed and the
// `auto_publish` switch is on (`auto_publish_state`, read on open and every 30 s), the production is
// published, and this page's account may publish it. Off, the page is today's page (Publish
// changes). Decides nothing about air; it hands the publisher the browser and reports its view.

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../backend/supabase';
import { catchUpRecord, confirmedRevision, storedRevision } from '../../backend/savedRevision';
import { onSyncState } from '../../backend/syncController';
import { subscribeTeamState, getTeamState } from '../../backend/teamProductions';
import { addGraphicToShow, loadShows, removeShowGraphic, updateShowCue, type Show } from '../../model/shows';
import { createAutoPublisher, CHECK_EVERY_MS, type AutoPublishView } from '../../control/autoPublish';
import { publishRevision, publishStepMs } from '../../control/publishRevision';
import type { CuePublished } from '../../control/hostedControl';
import type { PayloadVersion } from '../../control/payloadVersion';
import type { ObsScene } from '../../model/obsScenes';
import { partialWritesOn, setUnitPace } from '../../backend/partialWrites';
import { prefetchRecordBase } from '../../backend/supabaseProvider';
import { prefetchTeamBase } from '../../backend/teamProductions';
import { prefetchPublishedBase } from '../../control/publishParts';
import { sendsIdle } from '../../control/sendsInFlight';

/** Resolves on a later task, so a click queued meanwhile runs first. */
function laterTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

/** Whether the server has the guard installed and the switch on; null while unknown. */
async function readSwitch(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('auto_publish_state');
  if (error || !data) return false;
  const state = data as { installed?: unknown; on?: unknown };
  return state.installed === true && state.on === true;
}

/** The record's revision and the published one, or null when either cannot be read. */
async function readRevisions(show: Pick<Show, 'id' | 'teamId'>): Promise<{ rev: number; published: number | null } | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const [record, row] = await Promise.all([
    storedRevision(show),
    sb.from('control_shows').select('published_rev').eq('id', show.id).maybeSingle(),
  ]);
  if (!record || row.error) return null;
  const rev = (row.data as { published_rev?: unknown } | null)?.published_rev;
  return { rev: record.rev, published: typeof rev === 'number' ? rev : null };
}

/** BUILD-TIME: only a build made for the measure harness (`VITE_MEASURE_HOOKS=1`) carries its loops
 *  and counters; every other build compiles them out (e2e/configured/measure/measure.config.ts). */
const MEASURE_HOOKS = import.meta.env.VITE_MEASURE_HOOKS === '1';

/** The measure harness's edit loop is on (a session flag only that harness sets). */
function editLoopMeasured(): boolean {
  if (!MEASURE_HOOKS) return false;
  try {
    return window.sessionStorage.getItem('noacg-measure-edit-loop') !== null;
  } catch {
    return false;
  }
}

/** THE MEASURE HARNESS ONLY: counts of what the publisher did, by name. */
function tally(name: string): void {
  const w = window as unknown as { __noacgPublisherTally?: Record<string, number> };
  const t = (w.__noacgPublisherTally ??= {});
  t[name] = (t[name] ?? 0) + 1;
}

/** G3 section 9: what a page that may not publish says while a save waits for one that can. */
export const ELSEWHERE_LINE = 'Open it on a device that can publish';

/** What a full automatic publish hands the page once it has landed. */
export interface AutoPublished {
  version: PayloadVersion;
  scenes?: { before: ObsScene[]; after: ObsScene[] };
  record: Show;
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
  /** A full publish landed: the stamp it wrote, the OBS scenes it replaced and now holds, and the
   *  record it was built from, for the page's after-publish steps (the same a press's publish runs). */
  onPublished: (published: AutoPublished) => void;
}): AutoPublishState {
  const [switchOn, setSwitchOn] = useState(false);
  const [view, setView] = useState<AutoPublishView | null>(null);
  // A save's unit digests wait for this page's sends, as the publish's own steps do (G4 R18).
  useEffect(() => {
    setUnitPace(async () => {
      await sendsIdle();
      await laterTask();
      await sendsIdle();
    });
  }, []);
  const showId = o.show?.id ?? null;
  const teamId = o.show?.teamId ?? null;
  const published = !!o.show?.hostedSlug;
  const enabled = !!showId && published && o.mayPublish;
  // The stored maps are read when the production opens (G4 section 1), so a first edit's save and
  // publish read nothing more inside the edit.
  useEffect(() => {
    if (!showId || !o.mayPublish) return;
    void (async () => {
      if (!(await partialWritesOn())) return;
      if (teamId) await prefetchTeamBase(showId);
      else await prefetchRecordBase(showId);
      const sb = published ? await getSupabase() : null;
      if (sb) await prefetchPublishedBase(sb, showId);
    })().catch(() => undefined);
  }, [showId, teamId, published, o.mayPublish]);
  const latest = useRef(o);
  latest.current = o;

  // G3 section 8: automatic mode also needs the record's revision known. A record not saved since
  // 0117 has none, and until its next save the page keeps Publish changes. Once known, it stays.
  const [revKnown, setRevKnown] = useState(false);
  useEffect(() => {
    setRevKnown(false);
    if (!enabled || !showId) {
      setSwitchOn(false);
      return;
    }
    let alive = true;
    let known = false;
    const ask = () => {
      void readSwitch().then((on) => { if (alive) setSwitchOn(on); }, () => {});
      if (!known) {
        void storedRevision({ id: showId, teamId: teamId ?? undefined }).then((r) => {
          if (alive && r) { known = true; setRevKnown(true); }
        }, () => {});
      }
    };
    ask();
    const timer = setInterval(ask, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled, showId, teamId]);

  const active = enabled && switchOn && revKnown;

  // MEASUREMENT ONLY (e2e/configured/measure, test `autopublish`, AC-4): a session flag only that
  // harness sets makes this page edit the production at a set pace (`noacg-measure-edit-ms`, default
  // 5 s), with automatic updates on or off. A publish follows a pass that ends synced, so AC-4 is
  // judged at a pace where each pass ends before the next edit (5 s, owner 2026-11-13).
  // `cues`: the last cue's text, then its field values. `labels`: a graphic cue's label every time
  // (every edit changes content). `add`: a graphic added, then removed.
  // `design`: the last graphic's stylesheet changed (a design update).
  useEffect(() => {
    if (!MEASURE_HOOKS || !enabled || !showId) return;
    let mode: string | null = null;
    let pace = 5000;
    try {
      mode = window.sessionStorage.getItem('noacg-measure-edit-loop');
      pace = Number(window.sessionStorage.getItem('noacg-measure-edit-ms')) || pace;
    } catch {
      mode = null;
    }
    if (mode !== 'cues' && mode !== 'labels' && mode !== 'add' && mode !== 'design') return;
    let tick = 0;
    const timer = setInterval(() => {
      const show = loadShows().find((s) => s.id === showId);
      if (!show) return;
      tick += 1;
      const w = window as unknown as { __noacgEdits?: number };
      w.__noacgEdits = (w.__noacgEdits ?? 0) + 1;
      if (mode === 'labels') {
        // Every edit changes what the outputs show: a graphic cue's label, each time a new one.
        const cue = [...(show.cues ?? [])].reverse().find((c) => c.source !== 'playout');
        if (cue) updateShowCue(showId, cue.id, { label: `Edited ${tick}` });
        return;
      }
      if (mode === 'cues') {
        const cue = (show.cues ?? [])[(show.cues ?? []).length - 1];
        if (!cue) return;
        if (tick % 2) updateShowCue(showId, cue.id, { label: `Edited ${tick}` });
        else updateShowCue(showId, cue.id, { values: Object.fromEntries(Object.keys(cue.values ?? {}).map((k) => [k, `Value ${tick}`])) });
        return;
      }
      if (mode === 'design') {
        // A design update: the pool's last graphic replaced by name (the entry keeps its id) with a
        // changed stylesheet, so its copy and its digest change.
        const g = show.graphics[show.graphics.length - 1];
        if (g) addGraphicToShow(showId, { ...g.template, name: g.name, css: `${g.template.css}\n/* loop ${tick} */` });
        return;
      }
      const added = show.graphics.find((g) => g.name === 'Loop strap');
      if (added) removeShowGraphic(showId, added.id);
      else addGraphicToShow(showId, { ...show.graphics[0].template, name: 'Loop strap' });
    }, pace);
    return () => clearInterval(timer);
  }, [enabled, showId]);
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
        if (MEASURE_HOOKS && editLoopMeasured()) tally(answer === null ? 'confirmed:null' : 'rev' in answer ? 'confirmed:rev' : `confirmed:${answer.wait}`);
        if (answer && 'rev' in answer) confirmedRecord = { rev: answer.rev, show };
        return answer;
      },
      stored: async () => {
        const show = current();
        return show ? readRevisions(show) : null;
      },
      catchUp: async () => {
        if (MEASURE_HOOKS && editLoopMeasured()) tally('catchUp');
        catchingUp = true;
        try {
          await catchUpRecord(teamId, false);
        } finally {
          catchingUp = false;
        }
      },
      publish: async (rev) => {
        const held = confirmedRecord && confirmedRecord.rev === rev ? confirmedRecord.show : null;
        if (!held) return { kind: 'transient', reason: 'the saved production changed while it was being published' };
        const measure = latest.current.appearanceFor.current;
        const t0 = performance.timeOrigin + performance.now();
        const from = publishStepMs.length;
        const outcome = await publishRevision(held, rev, measure ? () => measure(held) : undefined);
        if (outcome.kind === 'published' && outcome.ver) latest.current.onPublished({ version: outcome.ver, scenes: outcome.scenes, record: held });
        // THE MEASURE HARNESS ONLY: with its edit loop on, each automatic publish's window and steps.
        if (MEASURE_HOOKS && editLoopMeasured()) {
          const w = window as unknown as { __noacgPublishWindows?: [number, number, string, number, number[]][] };
          const steps = publishStepMs.slice(from);
          (w.__noacgPublishWindows ??= []).push([t0, performance.timeOrigin + performance.now(), outcome.kind, Math.max(0, ...steps), steps]);
        }
        return outcome;
      },
      changed: (next) => setView(next),
    });
    publisher.check(true);
    // THE MEASURE HARNESS ONLY (designs/G3.md section 13): with this session flag set, the page
    // publishes its current saved revision again and again, whole, so press-to-ran can be measured
    // during a publish on a production build. Nothing sets the flag but the harness.
    const measuring = MEASURE_HOOKS && (() => {
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
    /** This production's own `updatedAt` at its last confirmed save: a sync pass that confirms only
     *  other records is not a save of this one. */
    let savedAt = current()?.updatedAt ?? null;
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
            const now = current()?.updatedAt ?? null;
            if (now === savedAt) return;
            savedAt = now;
            if (MEASURE_HOOKS && editLoopMeasured()) tally('saved');
            publisher.saved();
          }
        });
    return () => {
      looping = false;
      offSync();
      publisher.stop();
    };
  }, [active, showId, teamId, o.account]);

  // G3 section 9: a page that may not publish, while automatic updates are on, reads red whenever a
  // saved revision is not published, so a pending save is never green there. It reads only.
  const [elsewhere, setElsewhere] = useState(false);
  const watchesOnly = !!showId && published && !o.mayPublish;
  useEffect(() => {
    setElsewhere(false);
    if (!watchesOnly || !showId) return;
    let alive = true;
    const ask = () =>
      void Promise.all([readSwitch(), readRevisions({ id: showId, teamId: teamId ?? undefined })]).then(([on, r]) => {
        if (alive) setElsewhere(on && !!r && r.published !== null && r.published < r.rev);
      }, () => {});
    ask();
    const timer = setInterval(ask, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [watchesOnly, showId, teamId]);

  if (watchesOnly && elsewhere) return { active: false, view: { tone: 'red', line: ELSEWHERE_LINE, running: false, published: null } };
  return { active, view: active ? view : null };
}

