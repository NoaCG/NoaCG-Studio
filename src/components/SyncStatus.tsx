import { useCallback, useEffect, useRef, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { getSyncState, onSyncState, startAutoSync, syncNow, type SyncState } from '../backend/syncController';
import { flushTeamProduction } from '../backend/teamProductions';
import { libraryInUse } from '../model/durableStore';
import { useAuthUi } from './auth/authUi';
import LibMenu from './home/LibMenu';
import { useKeepPanelInView } from './home/InfoTip';

/** How long a save may stay unconfirmed before the chip turns amber (playout-workflow-
 *  simplification D14): a routine save takes seconds, and saying "not saved" for each was noise. */
export const NOT_SYNCED_AFTER_MS = 60_000;

/** What the chip says: green confirmed, grey a save in flight (quiet), amber a save that is late or
 *  failed, grey "Local" for a device-only workspace with no account to sync to. */
type Tone = 'ok' | 'quiet' | 'warn' | 'local';
type Reading = { tone: Tone; summary: string; detail: string; action: 'sync' | 'sign-in' | 'resume' };

const synced = (detail: string): Reading => ({ tone: 'ok', summary: 'Synced', detail, action: 'sync' });
const notSynced = (detail: string, action: Reading['action'] = 'sync'): Reading => ({ tone: 'warn', summary: 'Not synced', detail, action });
/** A save in flight: quiet, until the oldest unconfirmed change (`since`) is a minute old. */
const inFlight = (detail: string, since: number | null | undefined, now: number): Reading =>
  since != null && now - since >= NOT_SYNCED_AFTER_MS ? notSynced(detail) : { tone: 'quiet', summary: 'Syncing', detail, action: 'sync' };

/** The personal library's reading. Failures and an expired session show at once; a save in flight
 *  is quiet until its oldest unconfirmed change is a minute old. Never Synced before confirmation. */
function describe(state: SyncState, now: number): Reading {
  const owner = !!libraryInUse();
  switch (state.phase) {
    case 'synced': {
      const at = state.verifiedAt ? ` at ${new Date(state.verifiedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '';
      const conflicts = state.last?.conflicts ? ` ${state.last.conflicts} conflicting edits were kept as copies.` : '';
      return synced(`Confirmed${at}.${conflicts}`);
    }
    case 'syncing':
      return inFlight(state.detail ?? (owner && state.firstPass ? 'Checking the cloud revision.' : 'Changes on this device are being saved.'), state.unconfirmedSince, now);
    case 'pending':
      return inFlight(typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline. Changes stay on this device until you reconnect.' : 'Changes on this device are waiting to be saved.', state.unconfirmedSince, now);
    case 'error':
      return notSynced(state.detail ?? 'Cloud save failed. Pending changes stay on this device.');
    case 'offline':
      return owner
        ? notSynced('Sign in to resume. Pending work stays on this device.', 'resume')
        : { tone: 'local', summary: 'Saved on this device only', detail: 'Sign in to keep your work in the cloud and on your other devices.', action: 'sign-in' };
  }
}

/** A team production's own save (backend/teamProductions.ts), in the same words. */
function describeTeam(team: TeamSave, since: number | null, now: number): Reading {
  if (team.saving === 'failed') return notSynced(team.note ?? 'The save failed.');
  if (team.saving === 'pending') return inFlight(team.note ?? 'Saving to the team.', since, now);
  return synced('Saved to the team.');
}

/** A team production's save state, as the production page holds it. */
export interface TeamSave {
  productionId: string;
  saving?: 'pending' | 'failed';
  note?: string | null;
}

/**
 * The cloud-sync chip in every top bar (Home, the editor, the video shell, a production's header).
 * Renders nothing in an offline build. When a backend is configured it starts auto-sync and shows
 * one word with a dot: Synced (green), Syncing (grey, quiet), Not synced (amber: a save older than
 * a minute, a failed write or an expired session), Local (a device-only workspace). Its width is
 * fixed, so a change of word never moves the header. A press opens the details with the one action
 * that helps. A team production passes `team` and reads its own save the same way
 * (playout-workflow-simplification AC-12). A save failure also raises AccountSaveNotice, so the
 * chip is never the only place a failure shows.
 */
export default function SyncStatus({ team }: { compact?: boolean; team?: TeamSave } = {}) {
  const [state, setState] = useState<SyncState>(getSyncState());
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [teamSince, setTeamSince] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useKeepPanelInView(host, open);

  useEffect(() => {
    if (!isBackendConfigured()) return;
    startAutoSync();
    return onSyncState(setState);
  }, []);
  // A team save's age runs from when it went pending.
  const teamSaving = team?.saving;
  useEffect(() => {
    setTeamSince((since) => (teamSaving === 'pending' ? since ?? Date.now() : null));
  }, [teamSaving]);
  // Wake once, at the minute mark, while something is in flight: the word changes then by itself.
  const since = team ? (teamSaving === 'pending' ? teamSince : null) : state.phase === 'pending' || state.phase === 'syncing' ? state.unconfirmedSince ?? null : null;
  useEffect(() => {
    if (since === null) return;
    const wait = since + NOT_SYNCED_AFTER_MS - Date.now();
    if (wait <= 0) return setNow(Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), wait + 50);
    return () => window.clearTimeout(timer);
  }, [since]);

  // Unconfigured builds stay offline. Configured anonymous work is explicitly local.
  if (!isBackendConfigured()) return null;

  // `now` moves at the minute mark (the effect above), which is the only moment the word can change
  // with no new state behind it.
  const { tone, summary, detail, action } = team ? describeTeam(team, teamSince, now) : describe(state, now);
  // The chip's one word: the summary, except a device-only workspace, which says Local.
  const word = tone === 'local' ? 'Local' : summary;
  const act = () => {
    setOpen(false);
    if (action === 'resume') useAuthUi.getState().openSignIn('Sign in to resume account editing. Pending work is preserved.', 'resume');
    else if (action === 'sign-in') useAuthUi.getState().openSignIn();
    else {
      // The panel holding the focused button is about to unmount: hand focus back to the trigger.
      host.current?.querySelector<HTMLButtonElement>('.sync-status')?.focus();
      if (team) void flushTeamProduction(team.productionId);
      else void syncNow();
    }
  };
  const busy = team ? teamSaving === 'pending' : state.phase === 'syncing';

  return (
    <div ref={host} className="lib-menu-host">
      <button
        className={`sync-status sync-${team ? teamSaving ?? 'synced' : state.phase}`}
        data-tone={tone}
        aria-label={`Sync: ${summary}`}
        aria-expanded={open}
        title={detail}
        onClick={() => setOpen((o) => !o)}
        data-testid="sync-status"
      >
        <span className="sync-dot" data-tone={tone} aria-hidden="true" />
        {word}
      </button>
      <LibMenu open={open} onClose={close} className="sync-panel" role="group" testid="sync-panel">
        <strong className="sync-panel-summary">
          <span className="sync-dot" data-tone={tone} aria-hidden="true" />
          {summary}
        </strong>
        <p className="hint" data-testid="sync-detail">{detail}</p>
        <button className="sync-panel-action" onClick={act} disabled={busy} data-testid="sync-action">
          {action === 'sync' ? 'Sync now' : 'Sign in'}
        </button>
      </LibMenu>
    </div>
  );
}
