import { useMemo, useState } from 'react';
import type { Show, ShowCue } from '../../model/shows';
import { hasReaderLine } from '../../model/shows';
import { sceneCueMap } from '../../model/obsScenes';
import type { SourceStatusStore } from '../../control/sheetSource';
import { TONE_DOT } from '../../control/readiness';
import type { SceneRow } from '../../control/obsSceneRows';
import { hms } from '../../control/playoutStatus';
import { deadlineAtLocal, deadlineIn, deadlineOf, deadlinePaths, dockScenes, sceneHealth, type DeadlinePath } from '../../control/liveDock';
import { panelTone, type PanelAnswerState } from '../control/PanelControl';
import { clockText } from '../../control/serverState';
import { OwnReaderLine, SourceLine, type CurrentMatchControl, type OwnSheetReader } from './SourcesLine';
import './LiveDock.css';

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
  ownReaders,
  panel,
  published,
  selected,
  note,
  now,
  rows,
  scenes,
  cueState,
  onPress,
  deadlineValue,
  writeDeadline,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  store: SourceStatusStore;
  currentMatch: CurrentMatchControl;
  /** Graphics reading a Sheet in their own code, listed as the data panel lists them. */
  ownReaders: readonly OwnSheetReader[];
  panel: PanelAnswerState;
  /** Not published, the production has no panel lease (K1). */
  published: boolean;
  /** What the page's own selection holds, which Companion's selection keys act on (K2). */
  selected: string | null;
  note: string | null;
  /** The page's own clock, ticking every second. */
  now: number;
  /** The OS3 scene rows, while the switch is on; null otherwise. */
  rows: readonly SceneRow[] | null;
  scenes: readonly { id: string; name: string }[];
  /** Whether a cue is on air, and why its Take would be refused (or null). */
  cueState: (cue: ShowCue) => { onAir: boolean; refused: string | null };
  /** Take (`onAir` false) or Out (`onAir` true) of a cue, run only while the cue is in that state. */
  onPress: (cueId: string, onAir: boolean) => void;
  deadlineValue: (path: string) => unknown;
  writeDeadline: (path: string, value: string) => void;
}) {
  /** The picked scene, while no scene is on program (K3): this dock's session only. */
  const [pick, setPick] = useState<string | null>(null);
  // Each scene's cues (K4) and the deadline paths (K7), read again only when what they read changes.
  const sceneCues = useMemo(() => sceneCueMap(show), [show]);
  const paths = useMemo(() => deadlinePaths(show.graphics, show.bindings, (show.sources ?? []).map((s) => s.id)), [show.graphics, show.bindings, show.sources]);
  const health = rows ? sceneHealth(rows) : null;
  const choice = rows ? dockScenes(scenes, rows, pick) : null;
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
      {health && (
        <div className={`live-dock-health live-dock-tone--${health.tone}`} title={health.title} data-testid="dock-health" data-tone={health.tone}>
          <span aria-hidden="true">{TONE_DOT[health.tone]}</span> {health.words}
        </div>
      )}
      <DeadlineSection paths={paths} value={deadlineValue} write={writeDeadline} now={now} />
      {sources.length + ownReaders.length > 0 && (
        <section className="live-dock-section" data-testid="dock-sources">
          {sources.map((source) => (
            <SourceLine key={source.id} show={show} setShows={setShows} source={source} store={store} currentMatch={currentMatch} />
          ))}
          {ownReaders.map((reader) => (
            <OwnReaderLine key={reader.graphic} reader={reader} />
          ))}
        </section>
      )}
      {choice && (
        <section className="live-dock-section live-dock-scenes" data-testid="dock-scenes" data-mode={choice.mode}>
          {choice.mode === 'program' ? (
            // On program, the scenes whose buttons are below, by name: never the fallback pick.
            <div className="live-dock-row" title="Following the OBS program scene">
              <span className="live-dock-label">Program</span>
              <span className="live-dock-dim" data-testid="dock-scene-program">{choice.ids.map(nameOf).join(', ')}</span>
            </div>
          ) : (
            <label className="live-dock-row">
              <span className="live-dock-label">Picked</span>
              <select value={choice.picked} onChange={(e) => setPick(e.target.value)} title="OBS has not said which scene is on program" data-testid="dock-scene-pick">
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {choice.ids.map((id) => (
            <div key={id} className="live-dock-scene" data-testid="dock-scene" data-scene={id}>
              {choice.ids.length > 1 && <div className="live-dock-scene-name">{nameOf(id)}</div>}
              {(sceneCues.get(id) ?? []).map((cue) => {
                const { onAir, refused } = cueState(cue);
                return (
                  <div key={cue.id} className={`live-dock-cue${onAir ? ' live-dock-cue--on' : ''}`} data-testid="dock-cue" data-cue={cue.id} data-on={onAir ? 'true' : 'false'}>
                    <span className="live-dock-cue-name" title={refused ?? cue.label}>{cue.label}</span>
                    <button type="button" className="primary" onClick={() => onPress(cue.id, false)} disabled={onAir || !!refused} title={refused ?? undefined} data-testid="dock-take">
                      Take
                    </button>
                    <button type="button" onClick={() => onPress(cue.id, true)} disabled={!onAir} data-testid="dock-out">
                      Out
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}
      {/* Last, so a note coming and going moves no control (K5). */}
      {note && (
        <p className={`live-dock-note ${note.startsWith('✓') ? 'status-ok' : 'status-bad'}`} data-testid="production-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** The break deadline (K7): In 2 min, In 5 min and Set, each a whole time written to the path. */
function DeadlineSection({ paths, value, write, now }: { paths: readonly DeadlinePath[]; value: (path: string) => unknown; write: (path: string, value: string) => void; now: number }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [skipped, setSkipped] = useState(false);
  const path = paths.find((p) => p.path === chosen)?.path ?? paths[0]?.path ?? null;
  const held = path ? deadlineOf(value(path)) : null;
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
    // A time the clocks skip that day (summer time) has no instant: nothing is written, and it says so.
    setSkipped(!at);
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
      <div className="live-dock-row live-dock-held" data-testid="dock-deadline-value" data-value={held === null ? undefined : String(value(path))}>
        {/* A time the clocks skip says so here, in the value's own row, so nothing below moves (K5). */}
        {skipped ? (
          <span className="status-warn" data-testid="dock-deadline-skipped">The clocks skip {typed} that day.</span>
        ) : held === null ? 'No deadline set' : `Until ${hms(held)} · ${left === 0 ? 'reached' : `${clockText(left!)} left`}`}
      </div>
      <div className="live-dock-row">
        <button type="button" onClick={() => write(path, deadlineIn(Date.now(), 2))} data-testid="dock-deadline-2">
          In 2 min
        </button>
        <button type="button" onClick={() => write(path, deadlineIn(Date.now(), 5))} data-testid="dock-deadline-5">
          In 5 min
        </button>
        <input type="time" value={typed} onChange={(e) => {
            setTyped(e.target.value);
            setSkipped(false);
          }} aria-label="Deadline time" data-testid="dock-deadline-time" />
        <button type="button" onClick={set} disabled={!/^\d{1,2}:\d{2}$/.test(typed)} data-testid="dock-deadline-set">
          Set
        </button>
      </div>

    </section>
  );
}
