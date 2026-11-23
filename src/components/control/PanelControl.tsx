import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelSnapshot, PanelVerb } from '../../control/panelFeedback';
import { verbWords } from '../../control/panelFeedback';
import {
  PANEL_BEAT_MS,
  answerPanel,
  panelList,
  panelPairStart,
  panelRevoke,
  tabPageId,
  type AnswerStatus,
  type PanelAnswer,
  type PanelKeyRow,
  type PanelList,
  type PanelPressReport,
} from '../../control/panelRelay';
import { workerInterval } from '../../control/workerTicker';
import {
  companionHealth,
  healthTone,
  healthWords,
  panelHealth,
  panelWords,
  type CompanionHealth,
} from '../../control/companionHealth';
import type { PanelOffer } from '../../control/panelActions';
import { COMPANION_SETUP_URL, DOWNLOADS_COMPANION_URL } from '../../downloads/links';
import { useModalGate } from '../spaceKey';
import './panel.css';

/**
 * HARDWARE PANELS on an operator page (docs/work-specs/hardware-panel-control/spec.md, and the
 * lease of docs/work-specs/panel-ownership-lease/spec.md): which page answers the panel, "Use
 * here", pairing a Companion panel with a one-time code, and the list of paired panels with Revoke.
 * One component for the production page and the hosted control page; each page hands it what it
 * shows and its own dispatcher, and nothing else changes there.
 */

export interface PanelAnswerState {
  /** This page answers the panel, or is taking it. */
  on: boolean;
  status: AnswerStatus | null;
  last: PanelPressReport | null;
  /** A panel is paired with this production (as this page last read it). */
  paired: boolean;
  /** The page that answers the panel when it is not this one, by its label; null when none does. */
  holder: string | null;
  /** The database does not relay graphic actions yet (no 0103): known only while answering. */
  oldRelay: boolean;
  /** Whether a paired Companion is connected, as its liveness reports say, and its words when they
   *  were judged; null before the first read. */
  companion: { health: CompanionHealth; words: string } | null;
  /** Move the panel to this page, from whichever page has it ("Use here"). */
  useHere: () => void;
  /** Read who answers now rather than at the next beat (after pairing, say). */
  refresh: () => void;
  /**
   * Hand the answer what the page shows and its dispatcher, in the render, once the page has
   * worked them out. A plain call, not a hook, so it can sit after a page's early returns.
   */
  feed: (
    snapshot: () => PanelSnapshot,
    /** The page's dispatcher: a Take it starts answers that Take's promise (control/panelRelay.ts). */
    run: (verb: PanelVerb, target: string) => void | Promise<unknown>,
    /** Where the page writes a refused press, naming the panel and why: its activity feed. */
    note?: (text: string) => void,
    /** The graphic actions the page offers a panel and how it runs one (control/panelActions.ts). */
    actions?: PanelOffer,
  ) => void;
  /**
   * Publish now if what a key shows changed, for a change that does not re-render the page: the
   * production page's clip clock moves in its store, not in the page's render.
   */
  changed: () => void;
}

/** With no panel paired, a page reads who answers only every this many beats (about 30 s). */
const IDLE_LOOKS = 8;
/** The answering page reads whether Companion is connected every this many beats (about 8 s). */
const ANSWERING_LOOKS = 2;

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
 * WHICH PAGE ANSWERS (panel lease P1, L1 to L6). Every beat, on a timer a hidden tab cannot
 * starve, a page that is not answering reads who is: with a panel paired and nobody answering, a
 * page that takes a free panel by itself (`auto`: the production page) takes it; any page can move
 * it here with `useHere`. A page answering keeps its lease on the same beat (panelRelay.ts). What
 * the page feeds is read through refs, so a page passes fresh closures every render without
 * restarting anything; every render publishes what a panel would see differently.
 */
export function usePanelAnswer(opts: {
  slug: string | null;
  where: 'production' | 'control';
  label: string;
  runs: ReadonlySet<PanelVerb>;
  /** Take a free panel by itself (the production page only, P1). */
  auto: boolean;
}): PanelAnswerState {
  /** Answer, taking a free panel (`take`) or moving it here (`move`); null: not answering. */
  const [want, setWant] = useState<'take' | 'move' | null>(null);
  const [status, setStatus] = useState<AnswerStatus | null>(null);
  const [last, setLast] = useState<PanelPressReport | null>(null);
  const [list, setList] = useState<PanelList | null>(null);
  const [companion, setCompanion] = useState<{ health: CompanionHealth; words: string } | null>(null);
  const lastRead = useRef<PanelList | null>(null);
  const snapshot = useRef<() => PanelSnapshot>(() => EMPTY);
  const run = useRef<(verb: PanelVerb, target: string) => void | Promise<unknown>>(() => {});
  const note = useRef<((text: string) => void) | undefined>(undefined);
  const actions = useRef<PanelOffer | undefined>(undefined);
  const [oldRelay, setOldRelay] = useState(false);
  const answer = useRef<PanelAnswer | null>(null);
  const { slug, where, label, runs, auto } = opts;

  /** Look now, rather than at the next beat (after pairing, say). */
  const lookNow = useRef<() => void>(() => {});
  // Who answers, while this page does not: and a free panel, taken where this page may take one.
  // With no panel paired it looks every IDLE_LOOKS beats only: there is nothing to answer.
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    let paired = false;
    let beats = 0;
    /** Whether Companion is connected, from the last list read and the time now: a read that fails
     *  leaves the last one ageing, so the chip never stays green on a list it cannot refresh. Set
     *  only when its words change, so the page renders no more often than they do. */
    const judge = () => {
      const now = Date.now();
      const health = companionHealth(lastRead.current, now);
      const next = health && { health, words: healthWords(health, now) };
      setCompanion((cur) => (cur && next && cur.health.kind === next.health.kind && cur.words === next.words ? cur : next));
    };
    const look = () => {
      panelList(slug).then(
        (read) => {
          if (!alive) return;
          lastRead.current = read;
          judge();
          paired = read.panels.length > 0;
          // Answering: read for whether Companion is connected, and for a panel paired or revoked.
          if (answer.current) {
            setList((cur) => (cur && cur.panels.length === read.panels.length ? cur : { ...read, answering: null }));
            return;
          }
          // This tab held it before a reload (L4): carry on under it, whichever page this is.
          const mine = read.answering?.page === tabPageId(slug);
          setList(mine ? { ...read, answering: null } : read);
          if (paired && (mine || (auto && !read.answering))) setWant('take');
        },
        () => {
          // Not answered: the next beat asks again, and the last read keeps ageing.
          if (alive) judge();
        },
      );
    };
    lookNow.current = look;
    look();
    const stop = workerInterval(PANEL_BEAT_MS, () => {
      beats += 1;
      if (answer.current ? beats % ANSWERING_LOOKS === 0 : paired || beats % IDLE_LOOKS === 0) look();
    });
    return () => {
      alive = false;
      lookNow.current = () => {};
      stop();
    };
  }, [slug, auto]);

  useEffect(() => {
    if (!want || !slug) return;
    const a = answerPanel({
      slug,
      where,
      label,
      runs,
      move: want === 'move',
      snapshot: () => snapshot.current(),
      run: (verb, target) => run.current(verb, target),
      // A page that feeds no actions (the hosted control page) runs none.
      actions: () => actions.current ?? null,
      onRelay: (relays) => setOldRelay(!relays),
      onStatus: (s) => {
        setStatus(s);
        // Held elsewhere, taken by another page, or not reached: this page is not answering, and
        // reads who is on its next look.
        if (s.kind === 'held' || s.kind === 'replaced' || s.kind === 'failed') {
          answer.current = null;
          setWant(null);
          if (s.kind !== 'failed') setList((cur) => (cur ? { ...cur, answering: { page: '', where: 'production', label: s.by, at: '' } } : cur));
        }
      },
      onPress: (report) => {
        setLast(report);
        // A refusal, or a graphic action that ran and then was refused, failed or went unanswered.
        const outcome = outcomeWords(report);
        if (outcome !== 'done') note.current?.(`${report.panel}: ${pressWords(report)} ${outcome}`);
      },
    });
    answer.current = a;
    return () => {
      if (answer.current === a) answer.current = null;
      a.stop();
    };
  }, [want, slug, where, label, runs]);

  // Every render: publish if what a key shows changed (cheap when nothing did).
  useEffect(() => {
    answer.current?.changed();
  });

  const on = want !== null;
  return {
    on,
    status,
    last,
    paired: (list?.panels.length ?? 0) > 0,
    holder: on ? null : (list?.answering?.label || (list?.answering ? 'Another page' : null)),
    oldRelay: on && oldRelay,
    companion,
    useHere: useCallback(() => {
      setStatus(null);
      setWant('move');
    }, []),
    refresh: useCallback(() => lookNow.current(), []),
    feed: useCallback((snap: () => PanelSnapshot, dispatch: (verb: PanelVerb, target: string) => void | Promise<unknown>, write?: (text: string) => void, offered?: PanelOffer) => {
      note.current = write;
      actions.current = offered;
      snapshot.current = snap;
      run.current = dispatch;
    }, []),
    changed: useCallback(() => answer.current?.changed(), []),
  };
}

/** What a press was, in the operator's words: a graphic action names itself. */
function pressWords(report: PanelPressReport): string {
  return report.action ?? verbWords(report.verb as PanelVerb);
}

/** What a press came to, in the operator's words: done, or what stopped it and why. */
function outcomeWords(report: PanelPressReport): string {
  const { verdict, settled } = report;
  if (verdict.outcome !== 'ran') return `refused, ${verdict.note ?? verdict.outcome}`;
  if (!settled || settled.outcome === 'accepted') return 'done';
  return `${settled.outcome === 'unknown' ? 'not confirmed' : settled.outcome}, ${settled.note ?? settled.outcome}`;
}

export type PanelTone = 'ok' | 'idle' | 'held' | 'off';

/** Whether this page answers a panel: `ok` answering, `idle` taking it, `held` another page
 *  answers, `off` nobody does or no panel is paired. */
export function panelTone(answer: PanelAnswerState): PanelTone {
  if (answer.on) return answer.status?.kind === 'answering' ? 'ok' : 'idle';
  return answer.holder ? 'held' : 'off';
}

/** The words for a tone, the same on every door. */
export function panelToneWords(tone: PanelTone, holder: string | null = null): string {
  if (tone === 'held') return `On ${holder ?? 'another page'}`;
  return tone === 'ok' ? 'Answering here' : tone === 'idle' ? 'Connecting…' : 'Off';
}

const HEALTH_TITLES: Record<CompanionHealth['kind'], string> = {
  connected: 'Companion reported in the last 45 seconds',
  reconnecting: 'Companion is reconnecting to NoaCG',
  update: 'Update the NoaCG module in Companion',
  refused: 'Companion holds a revoked panel key: pair it again',
  unseen: 'No report from Companion for 45 seconds: check that it is running',
  none: 'No panel is paired',
};

/**
 * THE PANEL CHIP on a page answering the panel (header and live dock): whether Companion is
 * connected, green only when a paired Companion reported in the last 45 s (companionHealth.ts);
 * null while the page is not answering. Before the first read it says the page is connecting.
 */
export function panelChip(answer: PanelAnswerState): { words: string; tone: 'ok' | 'warn' | 'bad' | 'idle'; title: string; health: string } | null {
  const tone = panelTone(answer);
  if (tone !== 'ok' && tone !== 'idle') return null;
  const c = answer.companion;
  if (tone === 'idle' || !c) return { words: 'Panel …', tone: 'idle', title: 'Connecting to the Stream Deck panel…', health: '' };
  return { words: c.words, tone: healthTone(c.health), title: HEALTH_TITLES[c.health.kind], health: c.health.kind };
}

function statusWords(answer: PanelAnswerState, list: PanelList | null): string {
  const s = answer.status;
  if (answer.on) return s?.kind === 'answering' ? 'This page answers the panel.' : 'Connecting…';
  if (s?.kind === 'failed') return `Could not answer the panel: ${s.why}`;
  const holder = answer.holder ?? (list?.answering ? list.answering.label || 'Another page' : null);
  if (holder) return `${holder} answers the panel.`;
  return 'No page answers the panel.';
}

/** Where the Companion module and its setup steps are: what a first pairing needs before a code. */
function ModuleLinks() {
  return (
    <p className="hint panel-module-links">
      <a href={DOWNLOADS_COMPANION_URL} target="_blank" rel="noopener" data-testid="panel-module-download">
        Download the Companion module
      </a>
      <a href={COMPANION_SETUP_URL} target="_blank" rel="noopener" data-testid="panel-module-setup">
        Setup steps
      </a>
    </p>
  );
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
  /** The panel whose Revoke has been pressed once: a second press revokes it for good. */
  const [armedRevoke, setArmedRevoke] = useState<string | null>(null);

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
    if (ids.size > 0 && !answer.paired) answer.refresh();
  }, [list, code, answer]);

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
    // Two presses: a revoked key never works again, and the Companion connection holding it has to
    // be paired from scratch (studio session, 2026-11-23: what Revoke did was not clear).
    if (armedRevoke !== p.id) {
      setArmedRevoke(p.id);
      return;
    }
    setArmedRevoke(null);
    try {
      await panelRevoke(slug, p.id);
      refresh();
    } catch (err) {
      setNote(`${p.label} was not revoked: ${(err as Error).message}`);
    }
  };

  const left = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  const health = companionHealth(list, now);

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
          <button className="gallery-close" onClick={onClose} title="Close" data-testid="panel-close">
            ✕
          </button>
        </div>
        <div className="settings-content">
          {!slug ? (
            <>
              <p className="hint" data-testid="panel-unpublished">
                Publish this production once, then pair a panel here.
              </p>
              <ModuleLinks />
            </>
          ) : (
            <>
              <section>
                <p className="panel-answer-line" data-testid="panel-answer">
                  <span data-testid="panel-status">{statusWords(answer, list)}</span>
                  {!answer.on && (
                    <button className="pd-verb" onClick={answer.useHere} data-testid="panel-use-here">
                      Use here
                    </button>
                  )}
                </p>
                {health && health.kind !== 'none' && (
                  <p className="panel-answer-line">
                    <span data-testid="panel-health" data-health={health.kind}>
                      {healthWords(health, now)}
                    </span>
                    {health.kind === 'refused' && !code && (
                      <button className="pd-verb" onClick={() => void pair()} data-testid="panel-pair-again">
                        Pair again
                      </button>
                    )}
                  </p>
                )}
                {answer.oldRelay && (
                  <p className="hint" data-testid="panel-old-relay">
                    Graphic actions on the panel wait for a NoaCG server update.
                  </p>
                )}
                {answer.last && (
                  <p className="hint" data-testid="panel-last">
                    Last press: {answer.last.panel}, {pressWords(answer.last)}:{' '}
                    {outcomeWords(answer.last)}
                  </p>
                )}
              </section>
              <section>
                <p className="dlg-caption">Pair a panel</p>
                {code && left > 0 ? (
                  <p className="panel-code-line" data-testid="panel-code">
                    <strong className="panel-code">{code.code}</strong>
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
                <ModuleLinks />
              </section>
              <section>
                <p className="dlg-caption">Paired panels</p>
                {list?.panels.length ? (
                  <ul className="panel-list" data-testid="panel-list">
                    {list.panels.map((p) => (
                      <li key={p.id} data-testid="panel-row">
                        <span className="panel-list-text">
                          <strong>{p.label}</strong>
                          <span className="hint" data-testid="panel-row-health">
                            paired {new Date(p.created_at).toLocaleDateString()}, {panelWords(panelHealth(p, list.readAt, now), now)}
                          </span>
                        </span>
                        <button
                          className={`pd-verb${armedRevoke === p.id ? ' armed' : ''}`}
                          onClick={() => void revoke(p)}
                          onBlur={() => setArmedRevoke((at) => (at === p.id ? null : at))}
                          title="Disconnects this Companion connection for good. To use it again, clear its Panel key in Companion and pair with a new code."
                          data-testid="panel-revoke"
                        >
                          {armedRevoke === p.id ? 'Press again to revoke' : 'Revoke'}
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
