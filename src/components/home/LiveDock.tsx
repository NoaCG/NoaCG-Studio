import { useState } from 'react';
import type { Show } from '../../model/shows';
import { hasReaderLine } from '../../model/shows';
import type { SourceStatusStore } from '../../control/sheetSource';
import { TONE_DOT, type ReadyTone } from '../../control/readiness';
import { deadlineAtLocal, deadlineIn, deadlineOf, type DeadlinePath, type DockScenes } from '../../control/liveDock';
import { panelTone, type PanelAnswerState } from '../control/PanelControl';
import { SourceLine, type CurrentMatchControl } from './SourcesLine';
import { useNow } from './ClipClock';
import './LiveDock.css';

/** One cue of a shown scene, as the dock draws it (K4). */
export interface DockCue {
  id: string;
  label: string;
  onAir: boolean;
  /** Why its Take would be refused, or null. */
  refused: string | null;
}

/**
 * THE LIVE DOCK (docs/work-specs/obs-scenes/spec.md OS6): the production page drawn as a 300 px
 * column for an OBS Custom Browser Dock. Props only: the page hands it what it shows and its own
 * verbs (K1), so nothing here decides what airs. The scenes come last, so a program change moves
 * none of the other controls (K5).
 */
export default function LiveDock({
  show,
  setShows,
  store,
  currentMatch,
  panel,
  published,
  selected,
  note,
  health,
  scenes,
  choice,
  onPick,
  cuesOf,
  onTake,
  onOut,
  deadline,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  store: SourceStatusStore;
  currentMatch: CurrentMatchControl;
  panel: PanelAnswerState;
  /** Not published, the production has no panel lease (K1). */
  published: boolean;
  /** What the page's own selection holds, which Companion's selection keys act on (K2). */
  selected: string | null;
  note: string | null;
  health: { tone: ReadyTone; words: string; title: string } | null;
  scenes: readonly { id: string; name: string }[];
  choice: DockScenes | null;
  onPick: (sceneId: string) => void;
  cuesOf: (sceneId: string) => DockCue[];
  onTake: (cueId: string) => void;
  onOut: (cueId: string) => void;
  deadline: { paths: readonly DeadlinePath[]; value: (path: string) => unknown; write: (path: string, value: string) => void };
}) {
  const tone = panelTone(panel);
  const sources = (show.sources ?? []).filter(hasReaderLine);
  const nameOf = (id: string) => scenes.find((s) => s.id === id)?.name ?? '';
  return (
    <div className="live-dock" data-testid="live-dock">
      <header className="live-dock-head">
        <strong className="live-dock-title" title={show.name}>{show.name}</strong>
        {!published ? (
          <span className="live-dock-dim live-dock-flag" data-testid="dock-unpublished">Not published</span>
        ) : tone === 'held' ? (
          <button
            type="button"
            className="pd-panel-status pd-panel-status--held"
            onClick={panel.useHere}
            title={`${panel.holder} answers the Stream Deck panel. Press to answer it here.`}
            data-testid="panel-header-use-here"
          >
            Use panel here
          </button>
        ) : (
          tone !== 'off' && (
            <span
              className={`pd-panel-status pd-panel-status--${tone}`}
              title={tone === 'ok' ? 'This dock answers the Stream Deck panel' : 'Connecting to the Stream Deck panel…'}
              data-testid="panel-header-status"
              data-state={tone}
            >
              Panel {tone === 'ok' ? '✓' : '…'}
            </span>
          )
        )}
      </header>
      <div className="live-dock-dim live-dock-selected" title="What Companion's Select, Take and Next keys act on" data-testid="dock-selected">
        Selected: {selected ?? 'nothing'}
      </div>
      {note && (
        <p className={`live-dock-note ${note.startsWith('✓') ? 'status-ok' : 'status-bad'}`} data-testid="production-note">
          {note}
        </p>
      )}
      {health && (
        <div className={`live-dock-health live-dock-tone--${health.tone}`} title={health.title} data-testid="dock-health" data-tone={health.tone}>
          <span aria-hidden="true">{TONE_DOT[health.tone]}</span> {health.words}
        </div>
      )}
      <DeadlineSection {...deadline} />
      {sources.length > 0 && (
        <section className="live-dock-section" data-testid="dock-sources">
          {sources.map((source) => (
            <SourceLine key={source.id} show={show} setShows={setShows} source={source} store={store} currentMatch={currentMatch} />
          ))}
        </section>
      )}
      {choice && (
        <section className="live-dock-section live-dock-scenes" data-testid="dock-scenes" data-mode={choice.mode}>
          <label className="live-dock-row">
            <span className="live-dock-label">{choice.mode === 'program' ? 'Program' : 'Picked'}</span>
            <select
              value={choice.picked}
              onChange={(e) => onPick(e.target.value)}
              disabled={choice.mode === 'program'}
              title={choice.mode === 'program' ? 'Following the OBS program scene' : 'OBS has not said which scene is on program'}
              data-testid="dock-scene-pick"
            >
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {choice.ids.map((id) => (
            <div key={id} className="live-dock-scene" data-testid="dock-scene" data-scene={id}>
              {choice.ids.length > 1 && <div className="live-dock-scene-name">{nameOf(id)}</div>}
              {cuesOf(id).map((cue) => (
                <div key={cue.id} className={`live-dock-cue${cue.onAir ? ' live-dock-cue--on' : ''}`} data-testid="dock-cue" data-cue={cue.id} data-on={cue.onAir ? 'true' : 'false'}>
                  <span className="live-dock-cue-name" title={cue.refused ?? cue.label}>{cue.label}</span>
                  <button type="button" className="primary" onClick={() => onTake(cue.id)} disabled={cue.onAir || !!cue.refused} title={cue.refused ?? undefined} data-testid="dock-take">
                    Take
                  </button>
                  <button type="button" onClick={() => onOut(cue.id)} disabled={!cue.onAir} data-testid="dock-out">
                    Out
                  </button>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const timeWords = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The break deadline (K7): In 2 min, In 5 min and Set, each a whole time written to the path. */
function DeadlineSection({ paths, value, write }: { paths: readonly DeadlinePath[]; value: (path: string) => unknown; write: (path: string, value: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const path = paths.find((p) => p.path === chosen)?.path ?? paths[0]?.path ?? null;
  const held = path ? deadlineOf(value(path)) : null;
  const now = useNow(held !== null, 1000, Date.now);
  if (!path) {
    return (
      <section className="live-dock-section hint" data-testid="dock-deadline-none">
        Break deadline: no countdown start time is bound to data.
      </section>
    );
  }
  const left = held === null ? null : Math.max(0, Math.ceil((held - now) / 1000));
  const set = () => {
    const at = deadlineAtLocal(typed, Date.now());
    if (at) write(path, at);
  };
  return (
    <section className="live-dock-section" data-testid="dock-deadline">
      <div className="live-dock-row">
        <span className="live-dock-label">Break</span>
        {paths.length > 1 ? (
          <select value={path} onChange={(e) => setChosen(e.target.value)} aria-label="Deadline path" data-testid="dock-deadline-path">
            {paths.map((p) => (
              <option key={p.path} value={p.path}>
                {p.graphics.join(', ')}
              </option>
            ))}
          </select>
        ) : (
          <span className="live-dock-dim" title={path}>{paths[0].graphics.join(', ')}</span>
        )}
      </div>
      <div className="live-dock-row live-dock-held" data-testid="dock-deadline-value">
        {held === null ? 'No deadline set' : `Until ${timeWords(held)} · ${left === 0 ? 'reached' : `${Math.floor(left! / 60)}:${String(left! % 60).padStart(2, '0')} left`}`}
      </div>
      <div className="live-dock-row">
        <button type="button" onClick={() => write(path, deadlineIn(Date.now(), 2))} data-testid="dock-deadline-2">
          In 2 min
        </button>
        <button type="button" onClick={() => write(path, deadlineIn(Date.now(), 5))} data-testid="dock-deadline-5">
          In 5 min
        </button>
        <input type="time" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Deadline time" data-testid="dock-deadline-time" />
        <button type="button" onClick={set} disabled={!deadlineAtLocal(typed, Date.now())} data-testid="dock-deadline-set">
          Set
        </button>
      </div>
    </section>
  );
}
