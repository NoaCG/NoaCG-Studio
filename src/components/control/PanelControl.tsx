import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelSnapshot, PanelVerb } from '../../control/panelFeedback';
import { verbWords } from '../../control/panelFeedback';
import {
  answerPanel,
  panelList,
  panelPairStart,
  panelRevoke,
  type AnswerStatus,
  type PanelAnswer,
  type PanelKeyRow,
  type PanelList,
  type PanelPressReport,
} from '../../control/panelRelay';
import { useModalGate } from '../spaceKey';

/**
 * HARDWARE PANELS on an operator page (docs/work-specs/hardware-panel-control/spec.md): the
 * "Answer the panel on this page" switch, pairing a Companion panel with a one-time code, and the
 * list of paired panels with Revoke. One component for the production page and the hosted control
 * page; each page hands it what it shows and its own dispatcher, and nothing else changes there.
 */

export interface PanelAnswerState {
  on: boolean;
  status: AnswerStatus | null;
  last: PanelPressReport | null;
  setOn: (on: boolean) => void;
  /**
   * Hand the answer what the page shows and its dispatcher, in the render, once the page has
   * worked them out. A plain call, not a hook, so it can sit after a page's early returns.
   */
  feed: (snapshot: () => PanelSnapshot, run: (verb: PanelVerb, target: string) => void) => void;
}

/** What a page that has not fed anything yet shows: nothing to press. */
const EMPTY: PanelSnapshot = {
  title: '',
  selected: null,
  space: null,
  live: [],
  allowed: {
    take: false, retake: false, update: false, next: false, out: false, 'select-prev': false, 'select-next': false,
    pause: false, resume: false, 'pause-toggle': false, 'all-out': false,
  },
  blocked: [],
  clip: null,
  bridge: 'off',
  rows: [],
};

/**
 * Run the answer while the switch is on. What the page feeds is read through refs, so a page
 * passes fresh closures every render without restarting anything; every render publishes what a
 * panel would see differently.
 */
export function usePanelAnswer(opts: {
  slug: string | null;
  where: 'production' | 'control';
  label: string;
  runs: ReadonlySet<PanelVerb>;
}): PanelAnswerState {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<AnswerStatus | null>(null);
  const [last, setLast] = useState<PanelPressReport | null>(null);
  const snapshot = useRef<() => PanelSnapshot>(() => EMPTY);
  const run = useRef<(verb: PanelVerb, target: string) => void>(() => {});
  const answer = useRef<PanelAnswer | null>(null);
  const { slug, where, label, runs } = opts;

  useEffect(() => {
    if (!on || !slug) return;
    const a = answerPanel({
      slug,
      where,
      label,
      runs,
      snapshot: () => snapshot.current(),
      run: (verb, target) => run.current(verb, target),
      onStatus: (s) => {
        setStatus(s);
        // Another page took the answer: this switch is off now, and says who has it.
        if (s.kind === 'replaced' || s.kind === 'failed') setOn(false);
      },
      onPress: setLast,
    });
    answer.current = a;
    return () => {
      answer.current = null;
      a.stop();
    };
  }, [on, slug, where, label, runs]);

  // Every render: publish if what a key shows changed (cheap when nothing did).
  useEffect(() => {
    answer.current?.changed();
  });

  return {
    on,
    status,
    last,
    setOn: useCallback((next: boolean) => {
      if (next) setStatus(null);
      setOn(next);
    }, []),
    feed: useCallback((snap: () => PanelSnapshot, dispatch: (verb: PanelVerb, target: string) => void) => {
      snapshot.current = snap;
      run.current = dispatch;
    }, []),
  };
}

/** The header door, beside Playout: "Panel" and a dot saying whether this page answers. */
export function PanelButton({ answer, onClick }: { answer: PanelAnswerState; onClick: () => void }) {
  const tone = answer.on && answer.status?.kind === 'answering' ? 'ok' : answer.on ? 'idle' : 'off';
  const words = tone === 'ok' ? 'Answering here' : tone === 'idle' ? 'Connecting…' : 'Off';
  return (
    <button
      className={`pd-target pd-target-${tone}`}
      onClick={onClick}
      title={`Hardware panels (Stream Deck through Companion). ${words}.`}
      aria-label={`Hardware panels (${words})`}
      data-testid="panel-open"
      data-state={tone}
    >
      Panel
      <span className="pd-target-dot" aria-hidden="true" />
      <span className="pd-target-state">{words}</span>
    </button>
  );
}

function ago(iso: string | null, now: number): string {
  if (!iso) return 'never used';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return 'used just now';
  if (s < 5400) return `used ${Math.round(s / 60)} min ago`;
  if (s < 129600) return `used ${Math.round(s / 3600)} h ago`;
  return `used ${new Date(iso).toLocaleDateString()}`;
}

function statusWords(answer: PanelAnswerState, list: PanelList | null): string {
  const s = answer.status;
  if (answer.on) return s?.kind === 'answering' ? 'This page answers the panel.' : 'Connecting…';
  if (s?.kind === 'replaced') return `${s.by} answers the panel now.`;
  if (s?.kind === 'failed') return `Could not answer the panel: ${s.why}`;
  if (list?.answering) return `${list.answering.label || 'Another page'} answers the panel.`;
  return 'No page answers the panel. Keys show "No operator page".';
}

/** The dialog: the switch, pairing, and the paired panels. */
export function PanelDialog({
  slug,
  answer,
  onClose,
}: {
  /** The production's control slug; null before the first publish. */
  slug: string | null;
  answer: PanelAnswerState;
  onClose: () => void;
}) {
  useModalGate();
  const pressedOnBackdrop = useRef(false);
  const [list, setList] = useState<PanelList | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    if (!slug) return;
    panelList(slug).then(setList, (err: Error) => setNote(`The panel list did not load: ${err.message}`));
  }, [slug]);

  useEffect(() => {
    refresh();
    // A code is waiting to be typed: watch for the panel to appear, and count the code down.
    const t = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 3_000);
    return () => clearInterval(t);
  }, [refresh]);

  // The code is spent once a new panel appears in the list.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!list) return;
    const ids = new Set(list.panels.map((p) => p.id));
    if (known.current && code && [...ids].some((id) => !known.current!.has(id))) setCode(null);
    known.current = ids;
  }, [list, code]);

  const pair = async () => {
    if (!slug) return;
    setNote(null);
    try {
      const r = await panelPairStart(slug);
      if ('refused' in r) setNote(r.refused);
      else setCode(r);
    } catch (err) {
      setNote(`No code could be made: ${(err as Error).message}`);
    }
  };

  const revoke = async (p: PanelKeyRow) => {
    if (!slug) return;
    try {
      await panelRevoke(slug, p.id);
      refresh();
    } catch (err) {
      setNote(`${p.label} was not revoked: ${(err as Error).message}`);
    }
  };

  const left = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="wz-modal settings-modal panel-modal" role="dialog" aria-modal="true" aria-label="Hardware panel" data-testid="panel-dialog">
        <div className="wz-header">
          <h2>Hardware panel</h2>
          <p className="hint wz-header-sub">Run this production from a Stream Deck or any Companion surface.</p>
          <button className="gallery-close" onClick={onClose} title="Close" data-testid="panel-close">
            ✕
          </button>
        </div>
        <div className="settings-content">
          {!slug ? (
            <p className="hint" data-testid="panel-unpublished">
              Publish this production once, then pair a panel here.
            </p>
          ) : (
            <>
              <section>
                <label className="check" data-testid="panel-answer">
                  <input type="checkbox" checked={answer.on} onChange={(e) => answer.setOn(e.target.checked)} />
                  Answer the panel on this page
                </label>
                <p className="hint" data-testid="panel-status">
                  {statusWords(answer, list)}
                </p>
                {answer.last && (
                  <p className="hint" data-testid="panel-last">
                    Last press: {answer.last.panel}, {verbWords(answer.last.verb)}:{' '}
                    {answer.last.verdict.outcome === 'ran' ? 'done' : `refused, ${answer.last.verdict.note ?? answer.last.verdict.outcome}`}
                  </p>
                )}
              </section>
              <section>
                <p className="dlg-caption">Pair a panel</p>
                {code && left > 0 ? (
                  <p data-testid="panel-code">
                    <strong className="panel-code">{code.code}</strong>{' '}
                    <span className="hint">
                      In Companion, add the NoaCG Studio connection and type this code. It works once, for {Math.floor(left / 60)}:
                      {String(left % 60).padStart(2, '0')} more.
                    </span>
                  </p>
                ) : (
                  <button className="pd-verb" onClick={() => void pair()} data-testid="panel-pair">
                    Pair a panel
                  </button>
                )}
              </section>
              <section>
                <p className="dlg-caption">Paired panels</p>
                {list?.panels.length ? (
                  <ul className="panel-list" data-testid="panel-list">
                    {list.panels.map((p) => (
                      <li key={p.id} data-testid="panel-row">
                        <strong>{p.label}</strong>{' '}
                        <span className="hint">
                          paired {new Date(p.created_at).toLocaleDateString()}, {ago(p.last_used_at, now)}
                        </span>{' '}
                        <button className="pd-verb" onClick={() => void revoke(p)} data-testid="panel-revoke">
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">No panel is paired yet.</p>
                )}
              </section>
            </>
          )}
          {note && (
            <p className="hint" role="alert" data-testid="panel-note">
              {note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
