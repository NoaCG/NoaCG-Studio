import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Show } from '../../../model/shows';
import { installPack, parsePack, type GraphicsPack } from '../../../packs/graphicsPack';
import { trackEvent } from '../../../backend/events';
import { isBackendConfigured } from '../../../backend/config';
import { subscribeAuth } from '../../../backend/auth';
import { commitDurableWrites } from '../../../model/durableStore';
import { updateGraphic, type GraphicDoc } from '../../../model/library';
import { useIsModerator } from '../../../community/useIsModerator';
import {
  decidePack,
  listMyPacks,
  listSharedPacks,
  listWaitingPacks,
  PACK_STATE_LABEL,
  sharedPackId,
  sharedPackText,
  withdrawPack,
  type MyPack,
  type SharedPack,
} from '../../../community/packs';
import { candidateOf, checkPack, type PackFinding } from '../../../community/packChecks';
import MiniPreview from '../MiniPreview';
import WizardConfirm from '../WizardConfirm';
import SubmitPackSheet from './SubmitPackSheet';

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
 * review. Until the design lock lands, submitting is open to admins only (D12), on the server
 * and here.
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

/** Install a pack and stamp every graphic it created with where it came from (spec D7): the
 *  submit picker leaves those out, and the design lock (AC-5) reads the same stamp. */
async function installStamped(pack: GraphicsPack, fromPack: NonNullable<GraphicDoc['fromPack']>): Promise<Show> {
  const show = await installPack(pack);
  for (const g of show.graphics) if (g.graphicId) updateGraphic(g.graphicId, { fromPack });
  const writeError = await commitDurableWrites();
  if (writeError) throw new Error(writeError);
  trackEvent('activation', 'community-pack');
  return show;
}

async function packFor(card: Card): Promise<{ pack: GraphicsPack; fromPack: NonNullable<GraphicDoc['fromPack']> }> {
  if (card.kind === 'shared') {
    return { pack: await readShared(card.id), fromPack: { id: sharedPackId(card.id), version: card.version, author: card.author } };
  }
  const res = await fetch(`${SHELF}${card.file}`);
  if (!res.ok) throw new Error(`The pack could not be downloaded (${res.status}).`);
  const { pack, error } = parsePack(await res.text());
  if (!pack) throw new Error(error ?? 'That file is not a NoaCG graphics pack.');
  return { pack, fromPack: { id: card.id, version: 1, author: card.author } };
}

/** A shared pack's card preview: its first graphic, rendered live and settled (spec D3). */
function SharedPreview({ id, name }: { id: string; name: string }) {
  const [template, setTemplate] = useState<GraphicsPack['graphics'][number]['template'] | null>(null);
  useEffect(() => {
    let live = true;
    readShared(id)
      .then((pack) => live && setTemplate(pack.graphics[0]?.template ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <div className="wz-community-preview wz-community-live" role="img" aria-label={`${name} on air`}>
      {template && <MiniPreview template={template} lazy />}
    </div>
  );
}

/** A reason the maker will read, asked inline under the button that needs it. */
function ReasonAsk({ label, onSend, onCancel }: { label: string; onSend: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="wz-community-reason">
      <input
        value={reason}
        maxLength={300}
        placeholder="Reason the maker reads"
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason the maker reads"
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

/** One submission waiting for an admin: the checks run again here, on the stored pack (D9). */
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
      .then((parsed) => live && setFindings(checkPack(candidateOf(parsed, pack.author))))
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
        </span>
        {findings === null ? (
          <span className="hint">Checking…</span>
        ) : findings.length === 0 ? (
          <span className="wz-community-ok">Checks passed</span>
        ) : (
          <ul className="wz-submit-findings">
            {findings.map((f, i) => (
              <li key={i}>{f.graphic ? <><strong>{f.graphic}:</strong> {f.message}</> : f.message}</li>
            ))}
          </ul>
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
  const [signedIn, setSignedIn] = useState(false);
  const moderator = useIsModerator();
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((n) => n + 1), []);

  const [busy, setBusy] = useState<string | null>(null);
  // Every action is single-flight (every button disables while one runs), so one note at a time.
  const [note, setNote] = useState<{ id: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<MyPack | null>(null);
  const [takingDown, setTakingDown] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    readShelf()
      .then((list) => live && setSeeds(list))
      .catch((error: Error) => live && setLoadError(error.message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!isBackendConfigured()) return;
    return subscribeAuth((s) => setSignedIn(s.status === 'signed-in' && !!s.user));
  }, []);

  // The shared half. A failed read leaves the seeds standing: the shelf never goes blank because
  // the backend is unreachable.
  useEffect(() => {
    if (!isBackendConfigured()) return;
    let live = true;
    void listSharedPacks().then((list) => live && setShared(list)).catch(() => {});
    if (signedIn) void listMyPacks().then((list) => live && setMine(list)).catch(() => {});
    else setMine([]);
    if (moderator) void listWaitingPacks().then((list) => live && setWaiting(list)).catch(() => {});
    else setWaiting([]);
    return () => {
      live = false;
    };
  }, [signedIn, moderator, rev]);

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

  const install = (card: Card) =>
    run(card.id, async () => {
      const { pack, fromPack } = await packFor(card);
      onInstalled(await installStamped(pack, fromPack));
    });

  const tryOut = (pack: SharedPack) =>
    run(pack.id, async () => {
      onInstalled(await installStamped(await readShared(pack.id), { id: sharedPackId(pack.id), version: pack.version, author: pack.author }));
    });

  const decide = (id: string, state: 'live' | 'not_accepted' | 'taken_down', reason?: string) =>
    run(id, async () => {
      await decidePack(id, state, reason);
      setTakingDown(null);
      refresh();
    });

  const offered = (seeds?.length ?? 0) + shared.length;

  return (
    <div className="wz-community" data-testid="community-packs">
      <div className="wz-community-head">
        <p className="wz-kit-lede">Install one and it opens as a production, rundown included.</p>
        {signedIn && moderator && (
          <button type="button" onClick={() => setSubmitting(true)} data-testid="submit-pack-open">
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
                  <span className={`wz-community-state is-${p.state}`}>{PACK_STATE_LABEL[p.state]}</span>
                  {p.reason && <span className="hint">{p.reason}</span>}
                  {note?.id === p.id && <span className="wz-community-error" role="alert">{note.message}</span>}
                </div>
                {(p.state === 'in_review' || p.state === 'live') && (
                  <button type="button" disabled={busy !== null} onClick={() => setWithdrawing(p)}>
                    Withdraw
                  </button>
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
                onTry={() => void tryOut(p)}
                onDecide={(state, reason) => void decide(p.id, state, reason)}
              />
            ))}
          </ul>
          {note && waiting.some((p) => p.id === note.id) && <p className="wz-community-error" role="alert">{note.message}</p>}
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
              <ReasonAsk label="Take down" onSend={(reason) => void decide(p.id, 'taken_down', reason)} onCancel={() => setTakingDown(null)} />
            ) : (
              <div className="wz-community-row-actions">
                <button
                  type="button"
                  className="primary wz-community-install"
                  disabled={busy !== null}
                  onClick={() => void install(p)}
                  aria-label={`Install ${p.name}`}
                >
                  {busy === p.id ? 'Installing…' : 'Install'}
                </button>
                {moderator && p.kind === 'shared' && (
                  <button type="button" disabled={busy !== null} onClick={() => setTakingDown(p.id)}>
                    Take down
                  </button>
                )}
              </div>
            )}
            {note?.id === p.id && <p className="wz-community-error" role="alert">{note.message}</p>}
          </li>
        ))}
      </ul>

      {submitting && (
        <SubmitPackSheet
          lastAuthor={mine[0]?.author ?? ''}
          onClose={() => setSubmitting(false)}
          onSent={() => {
            setSubmitting(false);
            refresh();
          }}
        />
      )}
      {withdrawing && (
        <WizardConfirm
          title={`Withdraw “${withdrawing.name}”?`}
          confirmLabel="Withdraw"
          cancelLabel="Keep it"
          testid="withdraw-pack"
          onCancel={() => setWithdrawing(null)}
          onConfirm={() => {
            const p = withdrawing;
            setWithdrawing(null);
            void run(p.id, async () => {
              await withdrawPack(p.id);
              refresh();
            });
          }}
        >
          <p>
            {withdrawing.state === 'live'
              ? 'It leaves the shelf now. Productions people already installed from it stay theirs.'
              : 'It leaves the review queue now.'}
          </p>
        </WizardConfirm>
      )}
    </div>
  );
}
