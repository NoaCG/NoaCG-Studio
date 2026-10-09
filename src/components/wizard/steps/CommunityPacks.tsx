import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Show } from '../../../model/shows';
import { installPack, parsePack, type GraphicsPack } from '../../../packs/graphicsPack';
import { trackEvent } from '../../../backend/events';
import type { PackStamp } from '../../../model/graphicDoc';
import { useAuthState } from '../../auth/useAuthState';
import { useIsModerator } from '../../../community/useIsModerator';
import {
  decidePack,
  dismissReports,
  listMyPacks,
  listReportedPacks,
  listSharedPacks,
  listWaitingPacks,
  PACK_STATE_LABEL,
  reportPack,
  sharedPackText,
  withdrawPack,
  type MyPack,
  type ReportedPack,
  type SharedPack,
} from '../../../community/packs';
import { candidateOf, checkPack, checkPackRequests, type PackFinding } from '../../../community/packChecks';
import { sharedPackId } from '../../../community/packStamp';
import MiniPreview from '../MiniPreview';
import WizardConfirm from '../WizardConfirm';
import SubmitPackSheet, { PackFindings } from '../../community/SubmitPackSheet';

/**
 * COMMUNITY PACKS - Browse's third answer (docs/work-specs/community-packs/spec.md).
 *
 * A community pack is a FINISHED package: install it and it is a production, ready to run. Its
 * design cannot be changed (the operator still types into its fields), so a card's one action
 * for a visitor is Install, with no route into the editor. Install is the same parse -> export
 * gate -> production path as Home's "Import a package" (`installPack`), so a pack from the
 * shelf, from a file and from an agent are one installer.
 *
 * The shelf is where packs are got AND given (spec D8): the NoaCG seeds (the built index under
 * public/packs/community/), then the approved shared packs (migration 0079), a Submit a pack
 * door, the maker's own submissions under Your packs, and - for a NoaCG admin - what waits for
 * review. A live pack of the maker's takes an update, a new version that waits for review while
 * the live one stays on the shelf (AC-11). Every signed-in account may submit (D12, migration 0082)
 * now that the design lock (AC-5) keeps an installed pack's design as its maker made it. A signed-in
 * visitor may Report a shared pack that is not theirs (migration 0083); the admin reads the reports
 * under Reported and takes the pack down or dismisses them.
 */

/** One shelf entry, as public/packs/community/index.json lists it. */
export interface CommunityPackEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  graphics: number;
  cues: number;
  file: string;
  preview: string;
}

/** A card: a built seed, or a shared pack the server approved. */
type Card = ({ kind: 'seed' } & CommunityPackEntry) | ({ kind: 'shared' } & SharedPack);

const SHELF = '/packs/community/';

interface Props {
  /** The search box above Browse's branch - it filters the shelf by name, description and maker. */
  query: string;
  onClearQuery: () => void;
  /** The production exists: the wizard closes and opens it. */
  onInstalled: (show: Show) => void;
}

/** What an action is keyed by, so a pack shown in two places (a card, Your packs, a review row)
 *  reads its own progress and errors in the place it was pressed. */
const cardKey = (card: Card) => `card:${card.kind}:${card.id}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A first version says nothing; an update says which version it is. */
const versionNote = (version: number) => (version > 1 ? ` · version ${version}` : '');
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What withdrawing a pack does, said in the confirmation. An in-review version above the first is
 *  an update: the live version stays. A live pack takes its waiting update with it. */
function withdrawCopy(p: MyPack, updateWaits: boolean): string {
  if (p.state !== 'live') {
    return p.version > 1 ? 'It leaves the review queue now. The live version stays on the shelf.' : 'It leaves the review queue now.';
  }
  const update = updateWaits ? ' and its waiting update is withdrawn with it' : '';
  return `It leaves the shelf now${update}. Productions people already installed from it stay theirs.`;
}

/** The seed index, read once per page: switching Browse's answer back and forth remounts this
 *  component, and the list is static for the life of the deployment. A failed read is not kept,
 *  so the next visit tries again. */
let shelfRead: Promise<CommunityPackEntry[]> | null = null;
function readShelf(): Promise<CommunityPackEntry[]> {
  shelfRead ??= fetch(`${SHELF}index.json`)
    .then((res) => (res.ok ? (res.json() as Promise<{ packs?: CommunityPackEntry[] }>) : Promise.reject(new Error())))
    .then((index) => index.packs ?? [])
    .catch(() => {
      shelfRead = null;
      throw new Error('The community shelf could not be read. Check the connection and open it again.');
    });
  return shelfRead;
}

/** A shared pack's file, parsed once per page: the card's preview, the admin's checks and
 *  Install all read the same one. A failed read is dropped so the next asks again. */
const sharedRead = new Map<string, Promise<GraphicsPack>>();
function readShared(id: string): Promise<GraphicsPack> {
  let read = sharedRead.get(id);
  if (!read) {
    read = sharedPackText(id).then((text) => {
      const { pack, error } = parsePack(text);
      if (!pack) throw new Error(error ?? 'That pack could not be read.');
      return pack;
    });
    read.catch(() => sharedRead.delete(id));
    sharedRead.set(id, read);
  }
  return read;
}

/** Read a list into state once; the returned cleanup drops an answer that arrives too late. */
function readInto<T>(read: () => Promise<T>, set: (value: T) => void): () => void {
  let live = true;
  read().then((value) => live && set(value)).catch(() => {});
  return () => {
    live = false;
  };
}

async function packFor(card: Card): Promise<{ pack: GraphicsPack; fromPack: PackStamp }> {
  if (card.kind === 'shared') {
    return { pack: await readShared(card.id), fromPack: { id: sharedPackId(card.lineage), version: card.version, author: card.author, name: card.name } };
  }
  const res = await fetch(`${SHELF}${card.file}`);
  if (!res.ok) throw new Error(`The pack could not be downloaded (${res.status}).`);
  const { pack, error } = parsePack(await res.text());
  if (!pack) throw new Error(error ?? 'That file is not a NoaCG graphics pack.');
  return { pack, fromPack: { id: card.id, version: 1, author: card.author, name: card.name } };
}

/** A shared pack's card preview: its first graphic, rendered live and settled (spec D3). */
function SharedPreview({ id, name }: { id: string; name: string }) {
  const [template, setTemplate] = useState<GraphicsPack['graphics'][number]['template'] | null>(null);
  // The file is fetched only once the card scrolls into view: a pack can be megabytes, and a
  // visitor who never reaches the card should not download it.
  const frame = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = frame.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    let live = true;
    readShared(id)
      .then((pack) => live && setTemplate(pack.graphics[0]?.template ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, seen]);
  return (
    <div ref={frame} className="wz-community-preview wz-community-live" role="img" aria-label={`${name} on air`}>
      {template && <MiniPreview template={template} />}
    </div>
  );
}

/** A reason asked inline under the button that needs it: by default one the maker will read; a
 *  report asks what is wrong instead, because the maker never reads a reporter's words. */
function ReasonAsk({ label, placeholder = 'Reason the maker reads', onSend, onCancel }: {
  label: string;
  placeholder?: string;
  onSend: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="wz-community-reason">
      <input
        value={reason}
        maxLength={300}
        placeholder={placeholder}
        onChange={(e) => setReason(e.target.value)}
        aria-label={placeholder}
        autoFocus
      />
      <button type="button" disabled={!reason.trim()} onClick={() => onSend(reason.trim())}>
        {label}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** One submission waiting for an admin: the checks run again here, on the stored pack (D9), and
 *  once they pass, each graphic is played with outside requests refused (D5). */
function ReviewRow({ pack, busy, onTry, onDecide }: {
  pack: SharedPack;
  busy: boolean;
  onTry: () => void;
  onDecide: (state: 'live' | 'not_accepted', reason?: string) => void;
}) {
  const [findings, setFindings] = useState<PackFinding[] | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let live = true;
    readShared(pack.id)
      .then(async (parsed) => {
        const candidate = candidateOf(parsed, pack.author);
        const found = checkPack(candidate);
        return found.length ? found : checkPackRequests(candidate.graphics);
      })
      .then((found) => live && setFindings(found))
      .catch((error: unknown) => live && setFindings([{ message: message(error) }]));
    return () => {
      live = false;
    };
  }, [pack.id, pack.author]);
  return (
    <li className="wz-community-row" data-review-pack={pack.id}>
      <div className="wz-community-row-text">
        <strong>{pack.name}</strong>
        <span className="hint">
          {pack.description} · {plural(pack.graphics, 'graphic')} · by {pack.author}
          {versionNote(pack.version)}
        </span>
        {findings === null ? (
          <span className="hint">Checking…</span>
        ) : findings.length === 0 ? (
          <span className="wz-community-ok">Checks passed</span>
        ) : (
          <PackFindings findings={findings} />
        )}
      </div>
      {asking ? (
        <ReasonAsk label="Not accepted" onSend={(reason) => onDecide('not_accepted', reason)} onCancel={() => setAsking(false)} />
      ) : (
        <div className="wz-community-row-actions">
          <button type="button" disabled={busy} onClick={onTry}>Install to try</button>
          <button type="button" disabled={busy} onClick={() => setAsking(true)}>Not accepted</button>
          <button type="button" className="primary" disabled={busy || !findings || findings.length > 0} onClick={() => onDecide('live')}>
            Approve
          </button>
        </div>
      )}
    </li>
  );
}

export default function CommunityPacks({ query, onClearQuery, onInstalled }: Props) {
  const [seeds, setSeeds] = useState<CommunityPackEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedPack[]>([]);
  const [mine, setMine] = useState<MyPack[]>([]);
  const [waiting, setWaiting] = useState<SharedPack[]>([]);
  const [reportedPacks, setReportedPacks] = useState<ReportedPack[]>([]);
  const auth = useAuthState();
  const backendConfigured = auth.backendConfigured;
  // Offline `signedIn` is true (nothing is gated); here it means a real account.
  const signedIn = backendConfigured && auth.signedIn;
  // True only for a signed-in admin (the hook checks the session itself).
  const moderator = useIsModerator();
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((n) => n + 1), []);

  const [busy, setBusy] = useState<string | null>(null);
  // Every action is single-flight (every button disables while one runs), so one note at a time.
  const [note, setNote] = useState<{ id: string; message: string } | null>(null);
  // The submit sheet: a new pack, or an update of one of the maker's live packs.
  const [sheet, setSheet] = useState<{ updating?: MyPack } | null>(null);
  const [withdrawing, setWithdrawing] = useState<MyPack | null>(null);
  const [takingDown, setTakingDown] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  /** Cards this visitor reported on this visit: each says thank you and offers nothing more. */
  const [reported, setReported] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    readShelf()
      .then((list) => live && setSeeds(list))
      .catch((error: Error) => live && setLoadError(error.message));
    return () => {
      live = false;
    };
  }, []);

  // The shared half, each list on its own trigger so auth resolving does not re-read the shelf.
  // A failed read leaves the seeds standing: the shelf never goes blank because the backend is
  // unreachable.
  useEffect(() => {
    if (!backendConfigured) return;
    return readInto(listSharedPacks, setShared);
  }, [backendConfigured, rev]);
  useEffect(() => {
    if (!signedIn) return setMine([]);
    return readInto(listMyPacks, setMine);
  }, [signedIn, rev]);
  useEffect(() => {
    if (!moderator) return setWaiting([]);
    return readInto(listWaitingPacks, setWaiting);
  }, [moderator, rev]);
  useEffect(() => {
    if (!moderator) return setReportedPacks([]);
    return readInto(listReportedPacks, setReportedPacks);
  }, [moderator, rev]);

  const cards = useMemo<Card[]>(() => {
    const all: Card[] = [
      ...(seeds ?? []).map((s) => ({ kind: 'seed' as const, ...s })),
      ...shared.map((s) => ({ kind: 'shared' as const, ...s })),
    ];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((p) => {
      const text = `${p.name} ${p.description} ${p.author}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [seeds, shared, query]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setNote(null);
    try {
      await action();
    } catch (error) {
      setNote({ id, message: message(error) });
    } finally {
      setBusy(null);
    }
  };

  // An admin's Install to try is the ordinary Install, reported on the review row it came from.
  const install = (card: Card, key = cardKey(card)) =>
    run(key, async () => {
      const { pack, fromPack } = await packFor(card);
      // Every graphic is stamped as it is created (spec D7): the submit picker leaves it out,
      // and the design lock (AC-5) reads the same stamp.
      const show = await installPack(pack, undefined, fromPack);
      trackEvent('activation', 'community-pack');
      onInstalled(show);
    });

  const decide = (key: string, id: string, state: 'live' | 'not_accepted' | 'taken_down', reason?: string) =>
    run(key, async () => {
      await decidePack(id, state, reason);
      setTakingDown(null);
      refresh();
    });

  const report = (card: Card, reason: string) =>
    run(cardKey(card), async () => {
      await reportPack(card.id, reason);
      setReporting(null);
      setReported((prev) => new Set(prev).add(card.id));
    });

  const offered = (seeds?.length ?? 0) + shared.length;
  // The maker's packs with a version waiting for review: one waits at a time.
  const waitingLineages = useMemo(() => new Set(mine.filter((p) => p.state === 'in_review').map((p) => p.lineage)), [mine]);
  // A maker's own pack offers no Report; Withdraw is theirs under Your packs.
  const mineLineages = useMemo(() => new Set(mine.map((p) => p.lineage)), [mine]);
  const canReport = (card: Card) => signedIn && !moderator && card.kind === 'shared' && !mineLineages.has(card.lineage);

  return (
    <div className="wz-community" data-testid="community-packs">
      <div className="wz-community-head">
        <p className="wz-kit-lede">Install one and it opens as a production, rundown included.</p>
        {signedIn && (
          <button type="button" onClick={() => setSheet({})} data-testid="submit-pack-open">
            Submit a pack
          </button>
        )}
      </div>

      {mine.length > 0 && (
        <section className="wz-community-section" aria-label="Your packs" data-testid="your-packs">
          <h3>Your packs</h3>
          <ul className="wz-community-list">
            {mine.map((p) => (
              <li key={p.id} className="wz-community-row" data-my-pack={p.id}>
                <div className="wz-community-row-text">
                  <strong>{p.name}</strong>
                  <span className={`wz-community-state is-${p.state}`}>
                    {PACK_STATE_LABEL[p.state]}
                    {versionNote(p.version)}
                  </span>
                  {p.reason && <span className="hint">{p.reason}</span>}
                  {note?.id === `mine:${p.id}` && <span className="wz-community-error" role="alert">{note.message}</span>}
                </div>
                {(p.state === 'in_review' || p.state === 'live') && (
                  <div className="wz-community-row-actions">
                    {/* The door is the submit door's (D12). */}
                    {signedIn && p.state === 'live' && !waitingLineages.has(p.lineage) && (
                      <button type="button" disabled={busy !== null} onClick={() => setSheet({ updating: p })}>
                        Submit an update
                      </button>
                    )}
                    <button type="button" disabled={busy !== null} onClick={() => setWithdrawing(p)}>
                      Withdraw
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {moderator && waiting.length > 0 && (
        <section className="wz-community-section" aria-label="Waiting for review" data-testid="waiting-packs">
          <h3>Waiting for review</h3>
          <ul className="wz-community-list">
            {waiting.map((p) => (
              <ReviewRow
                key={p.id}
                pack={p}
                busy={busy !== null}
                onTry={() => void install({ kind: 'shared', ...p }, `review:${p.id}`)}
                onDecide={(state, reason) => void decide(`review:${p.id}`, p.id, state, reason)}
              />
            ))}
          </ul>
          {note && waiting.some((p) => `review:${p.id}` === note.id) && <p className="wz-community-error" role="alert">{note.message}</p>}
        </section>
      )}

      {moderator && reportedPacks.length > 0 && (
        <section className="wz-community-section" aria-label="Reported" data-testid="reported-packs">
          <h3>Reported</h3>
          <ul className="wz-community-list">
            {reportedPacks.map((p) => (
              <li key={p.id} className="wz-community-row" data-reported-pack={p.id}>
                <div className="wz-community-row-text">
                  <strong>{p.name}</strong>
                  <span className="hint">
                    {plural(p.reports, 'report')} · by {p.author}
                    {versionNote(p.version)}
                  </span>
                  {p.reasons.map((reason, i) => (
                    <span key={i} className="hint">“{reason}”</span>
                  ))}
                  {note?.id === `reported:${p.id}` && <span className="wz-community-error" role="alert">{note.message}</span>}
                </div>
                {takingDown === `reported:${p.id}` ? (
                  <ReasonAsk
                    label="Take down"
                    onSend={(reason) => void decide(`reported:${p.id}`, p.id, 'taken_down', reason)}
                    onCancel={() => setTakingDown(null)}
                  />
                ) : (
                  <div className="wz-community-row-actions">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run(`reported:${p.id}`, async () => {
                        await dismissReports(p.id);
                        refresh();
                      })}
                    >
                      Dismiss
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => setTakingDown(`reported:${p.id}`)}>
                      Take down
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {loadError && <p className="wz-community-error" role="alert">{loadError}</p>}
      {!seeds && !loadError && <p className="hint">Loading the shelf…</p>}
      {seeds && offered === 0 && <p className="hint">No packs on the shelf yet.</p>}
      {seeds && offered > 0 && cards.length === 0 && (
        <div className="wz-browse-empty">
          <p className="hint">No pack matches “{query.trim()}”.</p>
          <button type="button" className="wz-filter" onClick={onClearQuery}>✕ Clear the search</button>
        </div>
      )}
      <ul className="wz-community-grid">
        {cards.map((p) => (
          <li key={`${p.kind}:${p.id}`} className="wz-community-card" data-community-pack={p.id}>
            {p.kind === 'seed' ? (
              <img
                className="wz-community-preview"
                src={`${SHELF}${p.preview}`}
                alt={`${p.name} on air`}
                loading="lazy"
                width={640}
                height={360}
              />
            ) : (
              <SharedPreview id={p.id} name={p.name} />
            )}
            <div className="wz-community-body">
              <strong>{p.name}</strong>
              <span className="hint">{p.description}</span>
              <span className="wz-community-meta">
                {plural(p.graphics, 'graphic')}
                {p.kind === 'seed' ? ` · ${plural(p.cues, 'cue')}` : ''} · by {p.author}
                {p.kind === 'shared' ? ' · CC BY 4.0' : ''}
              </span>
            </div>
            {takingDown === p.id ? (
              <ReasonAsk label="Take down" onSend={(reason) => void decide(cardKey(p), p.id, 'taken_down', reason)} onCancel={() => setTakingDown(null)} />
            ) : reporting === p.id ? (
              <ReasonAsk label="Report" placeholder="What is wrong with it" onSend={(reason) => void report(p, reason)} onCancel={() => setReporting(null)} />
            ) : (
              <div className="wz-community-row-actions">
                <button
                  type="button"
                  className="primary wz-community-install"
                  disabled={busy !== null}
                  onClick={() => void install(p)}
                  aria-label={`Install ${p.name}`}
                >
                  {busy === cardKey(p) ? 'Installing…' : 'Install'}
                </button>
                {moderator && p.kind === 'shared' && (
                  <button type="button" disabled={busy !== null} onClick={() => setTakingDown(p.id)}>
                    Take down
                  </button>
                )}
                {canReport(p) && !reported.has(p.id) && (
                  <button type="button" className="link-inline wz-community-report" disabled={busy !== null} onClick={() => setReporting(p.id)}>
                    Report
                  </button>
                )}
                {reported.has(p.id) && <span className="hint wz-community-reported" role="status">Reported. Thank you.</span>}
              </div>
            )}
            {note?.id === cardKey(p) && <p className="wz-community-error" role="alert">{note.message}</p>}
          </li>
        ))}
      </ul>

      {sheet && (
        <SubmitPackSheet
          updating={sheet.updating}
          onClose={() => setSheet(null)}
          onSent={() => {
            setSheet(null);
            refresh();
          }}
        />
      )}
      {withdrawing && (
        <WizardConfirm
          title={withdrawing.state === 'live' || withdrawing.version === 1
            ? `Withdraw “${withdrawing.name}”?`
            : `Withdraw the update of “${withdrawing.name}”?`}
          confirmLabel="Withdraw"
          cancelLabel="Keep it"
          testid="withdraw-pack"
          onCancel={() => setWithdrawing(null)}
          onConfirm={() => {
            const p = withdrawing;
            setWithdrawing(null);
            void run(`mine:${p.id}`, async () => {
              await withdrawPack(p.id);
              refresh();
            });
          }}
        >
          <p>{withdrawCopy(withdrawing, waitingLineages.has(withdrawing.lineage))}</p>
        </WizardConfirm>
      )}
    </div>
  );
}
