import { useEffect, useRef, useState } from 'react';
import { listedFileKey, measurePart } from '../../control/audioJobs';
import { DEFAULT_LOUDNESS_TARGET, lufsText, normalizeCue, normalizedState, normalizedWords } from '../../control/loudness';
import type { PlayoutSettings } from '../../control/playoutLink';
import type { CuePlayback, PlayoutItem, ShowCue } from '../../model/shows';

/**
 * NORMALIZE, beside a clip's Level (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.5): NoaCG Bridge measures
 * the part that airs, as CasparCG plays it, and the level is set so it airs at the production's
 * target, held under -1 dBTP. The line says what the level is now: normalized, limited and why, or
 * measured for an earlier version of the cue (the level stays; only a press changes it).
 *
 * Until the owner has checked a recording on a real server, the row says it has not been (owner,
 * 2026-11-20).
 */
export default function NormalizeRow({
  settings,
  item,
  cue,
  target = DEFAULT_LOUDNESS_TARGET,
  set,
}: {
  settings: PlayoutSettings;
  item: PlayoutItem;
  cue: ShowCue;
  target?: number;
  set: (patch: { [K in keyof CuePlayback]?: CuePlayback[K] | null }) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [listed, setListed] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // The cue as it is now, for a measurement that finishes after the operator moved its trim.
  const latest = useRef(cue);
  latest.current = cue;
  const n = cue.playback?.normalized;

  // A stored result is checked against the file the server lists now, once per cue.
  useEffect(() => {
    setListed(null);
    if (!n?.fileKey) return;
    let alive = true;
    void listedFileKey(settings, item.name).then((key) => alive && setListed(key));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue.id, item.name, n?.fileKey]);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const part = { trimIn: cue.playback?.trimIn, trimOut: cue.playback?.trimOut };
    setSaid(null);
    setProgress(0);
    const r = await measurePart(settings, item.name, part, { signal: controller.signal, onProgress: setProgress });
    if (abort.current !== controller) return;
    setProgress(null);
    if (!('measure' in r)) {
      setSaid(r.cancelled ? null : r.detail);
      return;
    }
    const now = latest.current.playback;
    if (now?.trimIn !== part.trimIn || now?.trimOut !== part.trimOut) {
      setSaid('The part changed while it was measured. Normalize again.');
      return;
    }
    const done = normalizeCue(target, r.measure, part, r.fileKey);
    if ('refused' in done) {
      setSaid(done.refused);
      return;
    }
    setListed(r.fileKey ?? null);
    set({ levelDb: done.levelDb === 0 ? null : done.levelDb, normalized: done.normalized });
  };

  const state = normalizedState(cue, listed);
  const line = said ?? (state === 'current' && n ? normalizedWords(n) : state === 'stale' ? 'Measured for an earlier version of this cue. Normalize again.' : null);
  return (
    <div className="pd-clip-row" data-testid="clip-normalize">
      <span className="pd-clip-label" />
      <button type="button" disabled={progress !== null} title={`Set the level so this part airs at ${lufsText(target)}`} onClick={() => void run()} data-testid="clip-normalize-run">
        {progress !== null ? `Measuring… ${Math.round(progress * 100)}%` : `Normalize to ${lufsText(target)}`}
      </button>
      {progress !== null && (
        <button type="button" onClick={() => abort.current?.abort()} data-testid="clip-normalize-cancel">
          Cancel
        </button>
      )}
      <span className="pd-clip-hint">
        {line && (
          <>
            <span className={said || state === 'stale' ? 'status-warn' : ''} data-testid="clip-normalize-state" data-state={said ? 'said' : (state ?? 'none')}>
              {line}
            </span>
            {' · '}
          </>
        )}
        <span className="muted" data-testid="clip-normalize-unchecked">Not yet checked on a real server</span>
      </span>
    </div>
  );
}
