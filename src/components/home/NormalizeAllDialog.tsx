import { useRef, useState } from 'react';
import { measurePart } from '../../control/audioJobs';
import { DEFAULT_LOUDNESS_TARGET, LOUDNESS_PRESETS, MAX_TARGET, MIN_TARGET, levelSetByHand, lufsText, normalizeCue } from '../../control/loudness';
import type { PlayoutSettings } from '../../control/playoutLink';
import { loadShows, setCuesPlayback, setShowLoudnessTarget, type CuePlayback, type PlayoutItem, type Show, type ShowCue } from '../../model/shows';
import { useModalGate } from '../spaceKey';
import { isServerCue } from '../../model/controlCue';

type Patch = { cueId: string; patch: { [K in keyof CuePlayback]?: CuePlayback[K] | null } };

/**
 * NORMALIZE ALL (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.5): the production's loudness target, and
 * every clip and audio cue measured by NoaCG Bridge, one file at a time, and set to it. Stills and
 * vMix cues are left out. A cue whose level was set by hand keeps it unless the operator includes
 * those. The results are saved as ONE edit through the rundown's history, so one undo brings every
 * level back, and only for cues nothing changed while they were measured. Cancel writes nothing.
 */
export default function NormalizeAllDialog({
  show,
  settings,
  onAir,
  write,
  setShows,
  onClose,
}: {
  show: Show;
  settings: PlayoutSettings;
  /** How many server cues are on air now: reading files loads the playout computer's disk. */
  onAir: number;
  write: (mutation: () => { shows: Show[]; error: string | null }, label: string) => Promise<boolean>;
  setShows: (shows: Show[]) => void;
  onClose: () => void;
}) {
  useModalGate();
  const start = show.loudnessTarget ?? DEFAULT_LOUDNESS_TARGET;
  const preset = LOUDNESS_PRESETS.some((p) => p.value === start);
  const [choice, setChoice] = useState<string>(preset ? String(start) : 'other');
  const [typed, setTyped] = useState(preset ? '' : String(start));
  const [includeHand, setIncludeHand] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number; name: string; fraction: number } | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const abort = useRef<AbortController | null>(null);

  const items = new Map((show.playoutItems ?? []).map((i) => [i.id, i] as const));
  const candidates = (show.cues ?? []).filter((c): c is ShowCue & { sourceId: string } => {
    const item = isServerCue(c) ? items.get(c.sourceId) : undefined;
    return !!item && item.kind === 'media' && item.mediaKind !== 'still' && item.adapter !== 'vmix';
  });
  const byHand = candidates.filter(levelSetByHand);
  const target = choice === 'other' ? Number(typed) : Number(choice);
  const targetOk = Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET && (choice !== 'other' || typed.trim() !== '');

  const run = async () => {
    if (!targetOk) return;
    setShows(setShowLoudnessTarget(show.id, target === DEFAULT_LOUDNESS_TARGET ? null : target));
    const controller = new AbortController();
    abort.current = controller;
    const cues = candidates.filter((c) => includeHand || !levelSetByHand(c));
    // The same file and part is measured once, whichever cues play it.
    const parts = new Map<string, { item: PlayoutItem; trimIn?: number; trimOut?: number; cues: ShowCue[] }>();
    for (const c of cues) {
      const item = items.get(c.sourceId)!;
      const key = JSON.stringify([item.name, c.playback?.trimIn ?? null, c.playback?.trimOut ?? null]);
      const part = parts.get(key) ?? { item, trimIn: c.playback?.trimIn, trimOut: c.playback?.trimOut, cues: [] };
      part.cues.push(c);
      parts.set(key, part);
    }
    const patches: Patch[] = [];
    const limited: string[] = [];
    const failed: string[] = [];
    const moved: string[] = [];
    const list = [...parts.values()];
    for (const [i, part] of list.entries()) {
      setProgress({ done: i, of: list.length, name: part.item.name, fraction: 0 });
      const r = await measurePart(settings, part.item.name, { trimIn: part.trimIn, trimOut: part.trimOut }, {
        signal: controller.signal,
        onProgress: (fraction) => setProgress({ done: i, of: list.length, name: part.item.name, fraction }),
      });
      if (controller.signal.aborted) {
        setProgress(null);
        setSummary(['Cancelled. No level changed.']);
        return;
      }
      if (!('measure' in r)) {
        failed.push(`${part.cues.map((c) => c.label).join(', ')}: ${r.detail}`);
        continue;
      }
      const done = normalizeCue(target, r.measure, { trimIn: part.trimIn, trimOut: part.trimOut }, r.fileKey);
      if ('refused' in done) {
        failed.push(`${part.cues.map((c) => c.label).join(', ')}: ${done.refused}`);
        continue;
      }
      for (const c of part.cues) {
        patches.push({ cueId: c.id, patch: { levelDb: done.levelDb === 0 ? null : done.levelDb, normalized: done.normalized } });
        if (done.normalized.limit) limited.push(`${c.label}: airs at ${lufsText(done.normalized.airsAt)}, ${done.normalized.limit === 'peak' ? 'peak limited' : 'at the level limit'}`);
      }
    }
    setProgress(null);
    // Only cues nothing changed while they were measured: their trim and level as they were at the start.
    const now = loadShows().find((s) => s.id === show.id)?.cues ?? [];
    const kept = patches.filter(({ cueId }) => {
      const before = cues.find((c) => c.id === cueId)?.playback;
      const after = now.find((c) => c.id === cueId)?.playback;
      const same = before?.trimIn === after?.trimIn && before?.trimOut === after?.trimOut && before?.levelDb === after?.levelDb;
      if (!same) moved.push(cues.find((c) => c.id === cueId)?.label ?? cueId);
      return same;
    });
    const saved = kept.length ? await write(() => setCuesPlayback(show.id, kept), `Normalize all to ${lufsText(target)}`) : true;
    setSummary([
      saved ? `${kept.length} ${kept.length === 1 ? 'cue' : 'cues'} set to ${lufsText(target)}.` : 'The levels could not be saved.',
      ...limited,
      ...(!includeHand && byHand.length ? [`Kept the level set by hand on ${byHand.map((c) => c.label).join(', ')}.`] : []),
      ...moved.map((label) => `${label} changed while it was measured, so it was left as it is.`),
      ...failed,
    ]);
  };

  const running = progress !== null;
  return (
    <div className="gallery-backdrop" onClick={running ? undefined : onClose}>
      <div
        className="wz-modal save-dialog pd-output-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Normalize audio"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !running) {
            e.stopPropagation();
            onClose();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="normalize-all"
      >
        <div className="wz-header">
          <h2>Normalize audio</h2>
          <button className="gallery-close" onClick={onClose} disabled={running} title="Close">✕</button>
        </div>
        <div className="prod-export-body">
          <div className="dlg-row">
            <label htmlFor="normalize-target">Target</label>
            <div className="dlg-pair">
              <select id="normalize-target" value={choice} disabled={running || !!summary} onChange={(e) => setChoice(e.target.value)} data-testid="normalize-target">
                {LOUDNESS_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {lufsText(p.value)}{p.word ? ` · ${p.word}` : ''}
                  </option>
                ))}
                <option value="other">Other…</option>
              </select>
              {choice === 'other' && (
                <input type="number" step={0.5} min={MIN_TARGET} max={MAX_TARGET} value={typed} placeholder="−23" data-suggest="-23" disabled={running || !!summary} onChange={(e) => setTyped(e.target.value)} aria-label="Target in LUFS" data-testid="normalize-target-other" />
              )}
            </div>
          </div>
          {byHand.length > 0 && (
            <label className="dlg-check">
              <input type="checkbox" checked={includeHand} disabled={running || !!summary} onChange={(e) => setIncludeHand(e.target.checked)} data-testid="normalize-include-hand" />
              <span className="dlg-check-text">
                <span className="dlg-check-title">Include levels set by hand</span>
                <span className="dlg-check-desc">{byHand.map((c) => c.label).join(', ')}</span>
              </span>
            </label>
          )}
          <p className="hint">{candidates.length} clip and audio {candidates.length === 1 ? 'cue' : 'cues'}. Not yet checked on a real server.</p>
          {onAir > 0 && !summary && (
            <p className="status-warn" data-testid="normalize-on-air">Something is on air. Reading the files loads the playout computer's disk.</p>
          )}
          {progress && (
            <p data-testid="normalize-progress">
              {progress.done + 1} of {progress.of} · {progress.name} · {Math.round(progress.fraction * 100)}%
            </p>
          )}
          {summary && (
            <ul data-testid="normalize-summary">
              {summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="dlg-foot">
          {running ? (
            <button onClick={() => abort.current?.abort()} data-testid="normalize-cancel">Cancel</button>
          ) : (
            <button onClick={onClose}>{summary ? 'Close' : 'Cancel'}</button>
          )}
          {!summary && (
            <button className="primary" disabled={running || !targetOk || candidates.length === 0} onClick={() => void run()} data-testid="normalize-start">
              Normalize
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
