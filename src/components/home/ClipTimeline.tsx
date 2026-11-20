import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadWaveform } from '../../control/audioJobs';
import { trimClock } from '../../control/cuePlayback';
import type { PlayoutSettings } from '../../control/playoutLink';
import type { AudioWaveform } from '../../control/playoutProtocol';

/** The shortest part the handles keep: more than a frame at every channel rate, so the start and the
 *  end never round to one frame on the server. */
export const MIN_PART_S = 0.05;

/**
 * THE TIMELINE (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.6): a server file's waveform with two handles
 * for the part that airs. Opened when needed; no preview playback and no thumbnails (owner decision):
 * the operator plays the cue on the server to hear it. The waveform is read by NoaCG Bridge through
 * the server's linked media folder and kept in this browser (control/audioJobs.ts).
 *
 * A handle moves freely while dragged and the part is committed once, on release, through the same
 * path as the typed boxes (`onCommit`). Arrow keys move the focused handle by a frame, Shift by a
 * second, and each press commits. Times snap to the hundredth; the server rounds to its own frames.
 */
export default function ClipTimeline({
  settings,
  name,
  seconds: knownSeconds,
  fps,
  trimIn,
  trimOut,
  disabled,
  onCommit,
}: {
  settings: PlayoutSettings;
  name: string;
  /** The file's length from the server's list, when it gave one. */
  seconds?: number;
  fps?: number;
  trimIn?: number;
  trimOut?: number;
  /** Why the handles are off (the Bridge or server cannot trim), or null. */
  disabled: string | null;
  onCommit: (trimIn: number, trimOut: number) => void;
}) {
  const [wave, setWave] = useState<AudioWaveform | null>(null);
  const [progress, setProgress] = useState<number | null>(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ which: 'in' | 'out'; at: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const read = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setProblem(null);
    setProgress(0);
    void loadWaveform(settings, name, { signal: controller.signal, onProgress: (f) => setProgress(f) }).then((r) => {
      // A read replaced by a newer one (another file, Try again) says nothing; Cancel says it stopped.
      if (abort.current !== controller) return;
      setProgress(null);
      if ('waveform' in r) setWave(r.waveform);
      else setProblem(r.cancelled ? 'Stopped. The typed start and end still work.' : r.detail);
    });
  };
  useEffect(() => {
    read();
    return () => abort.current?.abort();
    // A new file or server is a new read; the settings object itself changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, settings.host, settings.amcpPort, settings.agentUrl]);

  const length = knownSeconds ?? wave?.seconds;
  const from = drag?.which === 'in' ? drag.at : (trimIn ?? 0);
  const to = drag?.which === 'out' ? drag.at : (trimOut ?? length ?? 0);

  // Draw the waveform: one vertical bar per column, min to max, scaled to the canvas's own pixels.
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || !wave) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * ratio));
    const h = Math.max(1, Math.round(c.clientHeight * ratio));
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).color;
    const n = wave.max.length;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n);
      const b = Math.max(a + 1, Math.floor(((x + 1) / w) * n));
      let lo = 0;
      let hi = 0;
      for (let i = a; i < b && i < n; i++) {
        if (wave.min[i] < lo) lo = wave.min[i];
        if (wave.max[i] > hi) hi = wave.max[i];
      }
      const top = Math.round(((1 - hi) / 2) * h);
      const bottom = Math.round(((1 - lo) / 2) * h);
      g.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }, [wave]);

  const snap = (t: number) => Math.round(t * 100) / 100;
  const clamp = (which: 'in' | 'out', t: number) => {
    if (!length) return t;
    return which === 'in' ? Math.max(0, Math.min(t, to - MIN_PART_S)) : Math.min(length, Math.max(t, from + MIN_PART_S));
  };
  const timeAt = (clientX: number) => {
    const r = strip.current?.getBoundingClientRect();
    if (!r || !length) return 0;
    return ((clientX - r.left) / r.width) * length;
  };
  const commit = (which: 'in' | 'out', at: number) => onCommit(which === 'in' ? at : from, which === 'out' ? at : to);

  const handle = (which: 'in' | 'out') => {
    const at = which === 'in' ? from : to;
    const step = 1 / (fps && fps > 0 ? fps : 25);
    return (
      <div
        className={`pd-timeline-handle pd-timeline-handle--${which}`}
        style={{ left: `${length ? (at / length) * 100 : which === 'in' ? 0 : 100}%` }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={which === 'in' ? 'Start' : 'End'}
        aria-valuemin={0}
        aria-valuemax={length ?? 0}
        aria-valuenow={at}
        aria-valuetext={trimClock(at)}
        aria-disabled={!!disabled || undefined}
        onPointerDown={(e) => {
          if (disabled || !length) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ which, at });
        }}
        onPointerMove={(e) => {
          if (drag?.which !== which) return;
          setDrag({ which, at: clamp(which, snap(timeAt(e.clientX))) });
        }}
        onPointerUp={() => {
          if (drag?.which !== which) return;
          setDrag(null);
          commit(which, drag.at);
        }}
        onKeyDown={(e) => {
          if (disabled || !length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
          e.preventDefault();
          const by = (e.shiftKey ? 1 : step) * (e.key === 'ArrowLeft' ? -1 : 1);
          commit(which, clamp(which, snap(at + by)));
        }}
        data-testid={`clip-timeline-${which}`}
      />
    );
  };

  return (
    <div className="pd-timeline" data-testid="clip-timeline" data-state={wave ? 'ready' : problem ? 'problem' : 'reading'}>
      <div className="pd-timeline-strip" ref={strip} title={disabled ?? undefined}>
        <canvas className="pd-timeline-wave" ref={canvas} data-testid="clip-timeline-wave" />
        {length !== undefined && length > 0 && (
          <>
            <div className="pd-timeline-shade" style={{ left: 0, width: `${(from / length) * 100}%` }} />
            <div className="pd-timeline-shade" style={{ left: `${(to / length) * 100}%`, right: 0 }} />
            {handle('in')}
            {handle('out')}
          </>
        )}
      </div>
      <div className="pd-timeline-foot">
        {length !== undefined ? (
          <span data-testid="clip-timeline-part">
            {trimClock(from)}–{trimClock(to)} · {trimClock(Math.max(0, to - from))}
          </span>
        ) : (
          <span className="muted">Length not known yet</span>
        )}
        {progress !== null && !wave && (
          <>
            <span className="muted" data-testid="clip-timeline-progress">
              Reading the file… {Math.round(progress * 100)}%
            </span>
            <button type="button" onClick={() => abort.current?.abort()} data-testid="clip-timeline-cancel">
              Cancel
            </button>
          </>
        )}
        {problem && (
          <>
            <span className="status-warn" data-testid="clip-timeline-problem">{problem}</span>
            <button type="button" onClick={read} data-testid="clip-timeline-retry">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
