import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addGraphicToShow,
  addMessageSource,
  addShowCue,
  removeMessageSource,
  setShowSourcePaused,
  setShowMessageTarget,
  setShowPollLiveFigures,
  loadShows,
  seedValues,
  setShowJoinPage,
  stageShowJoin,
  setShowQuestions,
  showQuestions,
  stageShowResult,
  setShowWordHidden,
  updateShowCueChecked,
  type SheetShowSource,
  type Show,
  type YouTubeShowSource,
} from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { loadGraphics } from '../../model/library';
import { freeName } from '../../model/poolIdentity';
import {
  AUDIENCE_LIMITS,
  addInChunks,
  broadcastValues,
  type AudienceBackend,
  type AudienceRound,
  type AudienceSubmission,
  type AudienceTally,
  type PresenterPointers,
  type ObservableAudience,
  openRoundOf,
  type RoundTarget,
  type SubmitResult,
} from '../../audience/audienceTypes';
import {
  mountJoinSurface,
  type JoinSurfaceClient,
  type JoinSurfaceHandle,
} from '../../audience/joinSurface';
import { createSupabaseAudience } from '../../audience/audienceData';
import { joinPageBrand, lookLogoDataUrl } from '../../audience/audienceBrand';
import { qrPng, qrSvg } from '../../audience/joinQr';
import { JOIN_PAGE_LIMITS, JOIN_WAITING_DEFAULT } from '../../audience/audienceTypes';
import { publishJoinLogo } from '../../control/joinLogo';
import { syncJoinPage } from '../../control/joinPageSync';
import { useMessagesBackend } from './useAudienceInbox';
import { rehearsalPageUrl } from '../../audience/localAudience';
import { useAuthState } from '../auth/useAuthState';
import SignInPrompt from '../auth/SignInPrompt';
import { joinPageUrl } from '../../control/hostedControl';
import { copyLink } from './copyLink';
import { useDeferredEdits } from './useDeferredEdits';
import { QuestionComposer, QuestionList, type QuestionRowState } from './InteractionQuestions';
import {
  addQuestion,
  duplicateQuestion,
  editQuestion,
  isKnownType,
  makeQuestion,
  moveQuestion,
  questionLocked,
  removeQuestion,
  toLive,
  type QuestionType,
  type ShowQuestion,
} from '../../model/questions';
import { countWordTallies, type WordCount, type WordTally } from '../../model/wordCloud';
import { stageWords, wordDestinationOf } from '../../control/wordStaging';
import { copySeededCue, joinPress, linkedCopy, pickerItems, savedCopyPlan, seededCue, type PickerGroup, type PickerItem, type PickerKind, type SavedDesign } from '../../control/audiencePickers';
import { joinCardOf } from '../../model/joinCues';
import {
  chatIntakeFor,
  chatPlatformWord,
  chatReadElsewhere,
  claimChatRead,
  releaseChatRead,
  setYouTubeKey,
  spendYouTube,
  youtubeKey,
  type ChatSourceState,
  type ChatSubmit,
} from '../../audience/chatIntake';
import { normalizeTwitchChannel } from '../../audience/twitchChat';
import { MIN_POLL_MS, normalizeYouTubeVideoId, quotaLine, spentToday } from '../../audience/youtubeChat';
import { fetchComments } from '../../audience/youtubeComments';
import { MESSAGE_SHEET_STARTER, messageSheetId } from '../../audience/sheetMessages';
import { parseSheetLink } from '../../control/sheetSource';
import { uuid } from '../../model/id';
import {
  pollFieldMap,
  rememberedResultTarget,
  resultDestinationOf,
  roundsToFinalise,
  stageResults,
  type ResultOutcome,
} from '../../control/resultStaging';
import LibMenu from './LibMenu';
import {
  destinationRefusal,
  messageDestinations,
  destinationFields,
  rememberedDestination,
  stageMessage,
  type StageResult,
} from '../../control/messageStaging';

/**
 * The production's AUDIENCE workspace (route `#/production/<id>/audience`, the third tab of the
 * playout dashboard — docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5).
 *
 * WHAT IT IS: the moderation surface. Viewers send questions and comments; the operator reads
 * them, edits a BROADCAST version without touching what was actually sent, approves or rejects,
 * shortlists, and — the only exit — turns one into an ordinary cue on the rundown.
 *
 * **Nothing here airs anything.** Send to rundown creates a `ShowCue` and stops; the cue is
 * previewed and taken with the same verbs as every other cue. That is enforced by construction
 * rather than by discipline: the audience backend interface has no method that reaches the
 * command log, so there is no path from a viewer's text to Program that does not pass through
 * an operator pressing Take.
 *
 * WHICH PROVIDER IT RUNS ON is decided by one fact: a PUBLISHED production on a build with a
 * backend moderates its real audience through the Supabase provider (the operator's own control
 * slug is the capability); anything else — unpublished, offline build, the e2e suite — runs the
 * in-memory rehearsal provider with its simulator. The surface itself is identical either way,
 * which is what the seam was built for; the one visible difference is that the "simulate
 * arrivals" button exists only where simulating is meaningful.
 */
/** The candidate list, kept fresh off the provider's change signal while `enabled` (a closed
 *  menu reads nothing, so a published production is not polled for a list nobody sees). */
function useCandidates(backend: ObservableAudience, enabled: boolean): AudienceSubmission[] {
  const [rows, setRows] = useState<AudienceSubmission[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // `list()` holds messages only: a Word question's words never come back from it (W9).
    const refresh = () =>
      void backend.list().then(
        (list) => {
          if (alive) setRows(list);
        },
        () => {},
      );
    refresh();
    const off = backend.onChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [backend, enabled]);
  return rows;
}

/**
 * Add one of the catalog's designs when the operator picks it in a picker: a Q&A card (by its
 * catalog name, which is what the Message picker lists), a live vote board, a word cloud or the
 * Join card (by catalog id). It arrives with its one seeded cue (addGraphicToShow), which the pick
 * then fills, so one press makes one graphic and one cue. Nothing airs.
 */
async function addCatalogDesign(show: Show, idOrName: string): Promise<{ shows: Show[] | null; graphicId: string | null; cueId: string | null; error: string | null }> {
  const [{ variantById, variantsFor }, { buildDraftTemplate, initialDraft, mergeDraft }] = await Promise.all([
    import('../../templates/catalog'),
    import('../wizard/draft'),
  ]);
  const variant = variantById(idOrName) ?? variantsFor('audience').find((v) => v.name === idOrName);
  if (!variant) return { shows: null, graphicId: null, cueId: null, error: 'That graphic is not in this build.' };
  const built = buildDraftTemplate(variant, mergeDraft(initialDraft(), { variantId: variant.id, lines: variant.suggestedLines.map((l) => ({ ...l })) }));
  // A free name, on the production as stored: a same-named graphic already in the pool (one that
  // lost its result fields, or the production's own design beside the built-ins, D6) would
  // otherwise be REPLACED by this one, artwork and all.
  const stored = loadShows().find((x) => x.id === show.id) ?? show;
  const name = freeName(stored.graphics.map((g) => g.name), built.name);
  const template = name === built.name ? built : { ...built, name };
  const { shows, error } = addGraphicToShow(show.id, template, {});
  const failure = error ?? (await commitDurableWrites());
  if (failure) return { shows, graphicId: null, cueId: null, error: failure };
  const after = shows.find((x) => x.id === show.id);
  const before = new Set(stored.graphics.map((g) => g.id));
  const graphic = after?.graphics.find((g) => !before.has(g.id)) ?? null;
  const cue = graphic ? after?.cues?.find((c) => c.sourceId === graphic.id) ?? null : null;
  return { shows, graphicId: graphic?.id ?? null, cueId: cue?.id ?? null, error: graphic ? null : 'The graphic was not added.' };
}

/** A result cue's name in the rundown (tests and older cues know it by its prefix). */
const resultLabel = (question: string) => `Vote — ${question.slice(0, 32)}`;
/** A word cloud cue's name in the rundown. */
const wordCloudLabel = (question: string) => `Words: ${question.slice(0, 32)}`;

/**
 * Bring a SAVED design into the production for a picker (svg-template-library D6): its copy in
 * the pool when there is one (reused by identity, control/audiencePickers.ts `savedCopyPlan`),
 * else a new copy under a free name, linked back to the library record. The cue the pick fills is
 * the copy's one seeded cue, so one pick makes one cue, and a retry after a failed save fills the
 * cue the first try left rather than adding a second. Nothing airs.
 */
async function addSavedDesign(show: Show, savedId: string): Promise<{ shows: Show[] | null; graphicId: string | null; cueId: string | null; error: string | null }> {
  const doc = loadGraphics().find((g) => g.id === savedId);
  if (!doc) return { shows: null, graphicId: null, cueId: null, error: 'That saved design is no longer in your library.' };
  // Planned on the production as stored, so a graphic another tab added meanwhile is never
  // replaced by name.
  let shows: Show[] = loadShows();
  const plan = savedCopyPlan(shows.find((x) => x.id === show.id) ?? show, doc);
  if ('name' in plan) {
    const added = addGraphicToShow(show.id, plan.name === doc.template.name ? doc.template : { ...doc.template, name: plan.name }, { graphicId: doc.id });
    shows = added.shows;
    const failure = added.error ?? (await commitDurableWrites());
    if (failure) return { shows, graphicId: null, cueId: null, error: failure };
  }
  const after = shows.find((x) => x.id === show.id);
  const copy = after ? linkedCopy(after, doc.id) : null;
  const graphic = after?.graphics.find((g) => g.id === copy) ?? null;
  if (!after || !graphic) return { shows, graphicId: null, cueId: null, error: 'The design was not added.' };
  return { shows, graphicId: graphic.id, cueId: seededCue(after, graphic.id, seedValues(graphic.template.fields)), error: null };
}

/** Where a pick came from: a production graphic, a saved design or a built-in. */
type PickOn = { graphicId?: string; saved?: string; board?: string };
const pickOn = (item: PickerItem): PickOn =>
  item.group === 'production' ? { graphicId: item.id } : item.group === 'saved' ? { saved: item.id } : { board: item.id };

/** A pick of a saved design or a built-in brings it into the production first: the graphic it
 *  became and the seeded cue the pick fills. A production graphic that is a saved design's copy
 *  is picked with its still untouched seeded cue too: a pick whose staging failed after the copy
 *  landed leaves that cue, and the retry (now listed under the production) fills it rather than
 *  adding a second cue beside it. Null for any other production graphic: as before. */
async function bringIn(show: Show, on: PickOn) {
  if (on.saved) return addSavedDesign(show, on.saved);
  if (on.board) return addCatalogDesign(show, on.board);
  if (!on.graphicId) return null;
  const shows = loadShows();
  const cueId = copySeededCue(shows.find((x) => x.id === show.id) ?? show, on.graphicId, seedValues);
  return cueId === undefined ? null : { shows, graphicId: on.graphicId, cueId, error: null };
}

/** The same, read on the production as stored. */
const storedSeededCue = (show: Show, graphicId: string | null | undefined) =>
  copySeededCue(loadShows().find((x) => x.id === show.id) ?? show, graphicId, seedValues) ?? null;

/** Each picker's words: the production group's heading, what it says when the production has no
 *  design, and the built-in group's heading. */
const PICKER_WORDS: Record<PickerKind, { here: string; empty: string; builtIn: string; prefix: string; builtInTestid: string }> = {
  results: { here: 'Results on:', empty: 'No graphic here can show results.', builtIn: 'Add a vote board:', prefix: 'result', builtInTestid: 'result-choose-board' },
  message: { here: 'Prepare on:', empty: 'No graphic here can show a message.', builtIn: 'Add a card for it:', prefix: 'audience', builtInTestid: 'audience-choose-card' },
  words: { here: 'Word cloud on:', empty: 'No graphic here can show words.', builtIn: 'Add a word cloud:', prefix: 'word', builtInTestid: 'word-choose-board' },
  join: { here: 'Join card on:', empty: 'No Join card here yet.', builtIn: 'Add a Join card:', prefix: 'join', builtInTestid: 'join-choose-board' },
};
const GROUP_ORDER: PickerGroup[] = ['production', 'saved', 'built-in'];

/**
 * THE AUDIENCE PICKER (svg-template-library D6, AC-10): the production's designs, then the
 * user's saved designs, then the built-ins, as plain buttons in tab order. Each group is a named
 * group and each button's accessible name says what it does, the design and where it comes from
 * (`pickerItems` keeps them distinct). Nothing airs: a pick stages a cue.
 */
function DesignPicker({ kind, items, busy, onPick, onCancel }: { kind: PickerKind; items: PickerItem[]; busy: boolean; onPick: (on: PickOn) => void; onCancel: () => void }) {
  const words = PICKER_WORDS[kind];
  const heading: Record<PickerGroup, string> = { production: words.here, saved: 'Add a saved design:', 'built-in': words.builtIn };
  const testid: Record<PickerGroup, string> = { production: `${words.prefix}-choose-graphic`, saved: `${words.prefix}-choose-saved`, 'built-in': words.builtInTestid };
  const here = items.some((i) => i.group === 'production');
  return (
    <div className="pd-aud-choose" role="group" aria-label={words.here.replace(/:$/, '')} data-testid={`${words.prefix}-choose`}>
      {!here && (
        <span className="hint" data-testid={`${words.prefix}-no-destination`}>
          {words.empty}
        </span>
      )}
      {GROUP_ORDER.map((group) => {
        const list = items.filter((i) => i.group === group);
        if (!list.length) return null;
        return (
          <div key={group} className="pd-aud-choose-group" role="group" aria-label={heading[group].replace(/:$/, '')} data-testid={`${words.prefix}-group-${group}`}>
            <span className="hint">{heading[group]}</span>
            {list.map((item) => (
              <button key={item.id} type="button" disabled={busy} aria-label={item.label} onClick={() => onPick(pickOn(item))} data-testid={testid[group]}>
                {item.name}
              </button>
            ))}
          </div>
        );
      })}
      <button type="button" onClick={onCancel} data-testid={`${words.prefix}-choose-cancel`}>
        Cancel
      </button>
    </div>
  );
}

/** A stable number per Blob, so a replaced Blob logo of the same size still reads as a change. */
const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 0;
function blobId(blob: Blob): number {
  let id = blobIds.get(blob);
  if (id === undefined) blobIds.set(blob, (id = ++nextBlobId));
  return id;
}

/** Save a file the browser made. */
function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The stores staging writes through, and how a staged candidate is marked used. */
function stagingDeps(backend: AudienceBackend, setShows: (shows: Show[]) => void) {
  return {
    addCue: addShowCue,
    updateCue: updateShowCueChecked,
    commit: commitDurableWrites,
    setShows,
    markUsed: (id: string, at: string) => backend.update(id, { status: 'approved', usedAt: at }),
  };
}

/** The ✓ said once a message is in a cue: it names the cue and that Take is still needed. */
function preparedNote(result: Extract<StageResult, { ok: true }>): string {
  const ready = `✓ Cue “${result.label}” is ready on ${result.graphic}. It airs when you Take it.`;
  return result.warning ? `${ready} ${result.warning}` : ready;
}

/**
 * THE CUE EDITOR'S DOOR (data-sources C0): "Fill from…" on a message body field. Paste a message
 * or pick one from the inbox; it goes through the same `stageMessage` as Messages' Prepare, into
 * THIS cue, whose graphic is the destination. Nothing needs the audience to be open, published or
 * signed in. A pasted message is also kept in the inbox, as the candidate it came from.
 */
export function CueMessageFill({
  show,
  setShows,
  cueId,
  graphicId,
  beforeFill,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  cueId: string;
  graphicId: string;
  /** Lets the editor save a pending draft first, so the fill is not overwritten by it. */
  beforeFill?: () => Promise<unknown>;
}) {
  const { backend } = useMessagesBackend(show);
  const [open, setOpen] = useState(false);
  const rows = useCandidates(backend, open);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const refusal = destinationRefusal(show, graphicId);
  const unused = rows.filter((r) => !r.usedAt && r.status !== 'rejected');

  const fill = async (row: AudienceSubmission | null) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // A draft the editor could not save would be written back over the message later.
      if ((await beforeFill?.()) === false) return setNote('Your edits to this cue are not saved yet. Fill again once they are.');
      let candidate = row;
      if (!candidate) {
        if (!body.trim()) return;
        const [added] = await backend.addCandidates([{ author: name, body, source: 'Pasted' }]);
        if (!added) return setNote('The message was not kept. Try again.');
        // Kept now: a retry picks it from the list rather than pasting a second copy.
        setName('');
        setBody('');
        candidate = added;
      }
      const result = await stageMessage(
        show,
        { id: candidate.id, usedAt: candidate.usedAt, air: broadcastValues(candidate) },
        { graphicId, cueId },
        stagingDeps(backend, setShows),
      );
      if (!result.ok) return setNote(result.message);
      setOpen(false);
    } catch (err) {
      setNote(`The message was not kept: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="lib-menu-host pd-fill-from">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="cue-fill-from">
        Fill from…
      </button>
      <LibMenu open={open} onClose={() => setOpen(false)} testid="cue-fill-menu" role="dialog">
        {refusal ? (
          <p className="hint" data-testid="cue-fill-refused">{refusal}</p>
        ) : (
          <>
            <p className="hint">Paste a message</p>
            <input value={name} maxLength={AUDIENCE_LIMITS.author} placeholder="Name (optional)" aria-label="Name" onChange={(e) => setName(e.target.value)} data-testid="cue-fill-name" />
            <textarea value={body} maxLength={AUDIENCE_LIMITS.body} rows={3} placeholder="Message" aria-label="Message" onChange={(e) => setBody(e.target.value)} data-testid="cue-fill-body" />
            <button type="button" disabled={busy || !body.trim()} onClick={() => void fill(null)} data-testid="cue-fill-paste">
              Fill this cue
            </button>
            <p className="hint">Pick a message</p>
            {unused.length === 0 ? (
              <p className="hint" data-testid="cue-fill-none">No unused messages in Interaction.</p>
            ) : (
              unused.map((r) => {
                const air = broadcastValues(r);
                return (
                  <button type="button" key={r.id} disabled={busy} onClick={() => void fill(r)} data-testid="cue-fill-pick">
                    {air.author}: {air.body}
                    {/* Where it came from, small: provenance never fills the cue. */}
                    {r.source && <span className="hint pd-aud-prov"> {r.source}</span>}
                  </button>
                );
              })
            )}
          </>
        )}
        {note && <p className="hint status-bad" data-testid="cue-fill-note">{note}</p>}
      </LibMenu>
    </span>
  );
}

/** Whether a field of this pool graphic is where a message goes, so the cue editor offers Fill. */
export function isMessageBodyField(show: Pick<Show, 'graphics' | 'messageTarget'>, graphicId: string, fieldId: string): boolean {
  const g = show.graphics.find((x) => x.id === graphicId);
  return Boolean(g && destinationFields(show, g)?.body === fieldId);
}

/** A message source the operator connects here, as the add form names it. */
type SourcePick = 'twitch' | 'youtube-comments' | 'youtube-chat' | 'sheet';

/**
 * THE PRODUCTION'S YOUTUBE CHAT, kept running while the page is open (data-sources C3): its lines
 * go through the production's operator door, and a live-chat source remembered with the production
 * reconnects on reload when this browser has the key (in memory, or remembered). Without the key
 * it waits, and Messages asks for it. Called once by the production page, so a reload on Playout
 * reconnects too.
 */
export function useMessageSources(show: Pick<Show, 'id' | 'sources'> | null, backend: ObservableAudience | null): void {
  const showId = show?.id ?? null;
  const intake = useMemo(() => (showId ? chatIntakeFor(showId) : null), [showId]);
  useEffect(() => {
    if (!intake || !backend) return;
    intake.setAdd((items) => backend.addCandidates(items));
    // Chat votes (interaction spec, "Chat votes"): counted while this production page is open.
    const chatVotes = backend.chatVotes?.bind(backend);
    intake.setVotes(chatVotes ? { live: async () => openRoundOf(await backend.rounds()), send: chatVotes } : null);
  }, [intake, backend]);
  const plan = JSON.stringify(
    (show?.sources ?? []).flatMap((s) => (s.kind === 'youtube' && s.config.mode === 'chat' ? [[s.id, s.config.videoId, Boolean(s.paused)]] : [])),
  );
  useEffect(() => {
    if (!intake) return;
    const chats = JSON.parse(plan) as [string, string, boolean][];
    const wanted = new Set(chats.map(([id]) => id));
    const settle = () => {
      // A source removed here or in another tab stops reading at once.
      for (const running of intake.sources()) {
        if (running.sourceId && !wanted.has(running.sourceId)) {
          intake.remove(running.id);
          releaseChatRead(running.sourceId);
        }
      }
      const key = youtubeKey();
      for (const [sourceId, videoId, paused] of chats) {
        const running = intake.forSource(sourceId);
        if (paused) {
          if (running && !running.paused) intake.setPaused(running.id, true);
          continue;
        }
        // One tab reads: the one with a key that holds the claim.
        if ((!running && !key) || !claimChatRead(sourceId)) {
          if (running) intake.remove(running.id);
          continue;
        }
        if (!running) intake.add({ platform: 'youtube', videoId, apiKey: key!, sourceId });
        else if (running.paused) intake.setPaused(running.id, false);
      }
    };
    settle();
    const every = setInterval(settle, MIN_POLL_MS);
    const leave = () => releaseChatRead();
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(every);
      window.removeEventListener('pagehide', leave);
    };
  }, [intake, plan]);
  // Leaving the production stops its chats here: nothing would keep this tab's claim honest, and
  // another tab with the key takes over within the claim's 15 s.
  useEffect(() => {
    if (!intake) return;
    // Chat counts and files only while this production is open here (C11): a Twitch channel stays
    // connected across a trip to Home, but collects nothing until the production is back.
    intake.setCollecting(true);
    return () => {
      intake.setCollecting(false);
      for (const running of intake.sources()) if (running.sourceId) intake.remove(running.id);
      releaseChatRead();
    };
  }, [intake]);
}

/**
 * MESSAGE SOURCES (data-sources C3; audience spec, "Where candidates come from"): a message Sheet,
 * a video's YouTube comments, a stream's live chat, and Twitch. Every one is a producer of
 * candidates and nothing more: what arrives is prepared and Taken like anything else, and its
 * platform is small provenance, never on air. The Sheet and YouTube sources are remembered with
 * the production (`Show.sources`); the YouTube key is not.
 */
function MessageSources({
  show,
  setShows,
  backend,
  live,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  backend: ObservableAudience;
  live: boolean;
}) {
  // The intake lives in a per-production registry (the localAudienceFor pattern): a Twitch socket
  // or a YouTube poll must survive the operator's trip to Playout.
  const intake = useMemo(() => chatIntakeFor(show.id), [show.id]);
  const [running, setRunning] = useState<ChatSourceState[]>(() => intake.sources());
  const [pick, setPick] = useState<SourcePick>('twitch');
  const [channel, setChannel] = useState('');
  const [video, setVideo] = useState('');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [sheetLink, setSheetLink] = useState('');
  const [note, setNote] = useState<string | null>(null);
  /** A YouTube source waiting for the key on this browser: the one being answered. */
  const [keyFor, setKeyFor] = useState<string | null>(null);
  /** The last comments fetch per source: when, how many were new, or what went wrong. */
  const [fetched, setFetched] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [fetching, setFetching] = useState<string | null>(null);

  // Twitch writes through the VIEWER door that is current: a published production's join slug,
  // otherwise the local rehearsal provider. Deliberately not cleared on unmount. The door is the
  // live Open question now (interaction spec R20): a line is filed under it. With none live, the
  // intake sends it to the inbox through the operator door instead (C10). Which round is live is read through the viewer half, as a
  // phone reads it; a published production asks at most every few seconds, so a busy chat does
  // not double its own request rate.
  useEffect(() => {
    const viewer = live && show.joinSlug ? createSupabaseAudience({ joinSlug: show.joinSlug }) : backend;
    let cached: { at: number; target: RoundTarget | null } | null = null;
    const target = async (): Promise<RoundTarget | null> => {
      if (live && cached && Date.now() - cached.at < 3_000) return cached.target;
      const round = (await viewer.joinView('chat-intake-reader')).state.round;
      cached = { at: Date.now(), target: round?.kind === 'open' ? { roundId: round.id, revision: round.revision } : null };
      return cached.target;
    };
    const submit: ChatSubmit = async (token, author, body, sorted) => {
      let given = sorted;
      const send = async (): Promise<SubmitResult> => {
        // The round the intake sorted this line against, when it did (C10); else read it here.
        const to = given ?? (await target().catch(() => null));
        given = undefined;
        return to ? viewer.submit(token, author, body, to) : { ok: false, error: 'No Open question is live.' };
      };
      const result = await send();
      if (!result.closed) return result;
      // The remembered round closed under a line that arrived after the switch: ask once more, so
      // it answers the question live now. A chat line has no draft to keep, unlike a phone's.
      cached = null;
      return send();
    };
    intake.setSubmit(submit);
  }, [intake, backend, live, show.joinSlug]);

  useEffect(() => {
    const refresh = () => setRunning(intake.sources());
    refresh();
    const off = intake.onChange(refresh);
    // Another tab's claim on a chat comes and goes without a change here: look again each poll.
    const every = setInterval(refresh, MIN_POLL_MS);
    return () => {
      off();
      clearInterval(every);
    };
  }, [intake]);

  const sourcesRef = useRef(show.sources);
  sourcesRef.current = show.sources;
  const messageSources = (show.sources ?? []).filter((s): s is SheetShowSource | YouTubeShowSource => Boolean(s.inbox));
  const others = running.filter((r) => !r.sourceId);

  const save = async (result: { shows: Show[]; error: string | null }, what: string): Promise<boolean> => {
    setShows(result.shows);
    const failure = result.error ?? (await commitDurableWrites());
    if (failure) setNote(`${what} was not saved: ${failure}`);
    return !failure;
  };

  /** The key for a YouTube call: the one typed now (kept as the operator chose), else this browser's. */
  const keyToUse = (typed: string, keep: boolean): string | null => {
    if (typed.trim()) setYouTubeKey(typed, keep);
    return youtubeKey();
  };

  const fetchNewest = async (sourceId: string, videoId: string, apiKey: string) => {
    if (fetching) return;
    setFetching(sourceId);
    try {
      const read = await fetchComments((url) => fetch(url), videoId, apiKey);
      if (read.units) spendYouTube(read.units);
      // Removed while the fetch was out: its answer adds nothing.
      if (!sourcesRef.current?.some((s) => s.id === sourceId)) return;
      if (!read.ok) return setFetched((f) => ({ ...f, [sourceId]: { text: `${read.error}. ${read.fix}`, ok: false } }));
      const added = (await addInChunks(backend, read.items)).length;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setFetched((f) => ({ ...f, [sourceId]: { text: `${added} new of the newest ${read.items.length} at ${time}`, ok: true } }));
    } catch (err) {
      setFetched((f) => ({ ...f, [sourceId]: { text: `The comments were not added: ${(err as Error).message}`, ok: false } }));
    } finally {
      setFetching(null);
    }
  };

  const connect = async () => {
    setNote(null);
    if (pick === 'twitch') {
      const name = normalizeTwitchChannel(channel);
      if (!name) return setNote('Not a Twitch channel name - the name or the channel URL both work.');
      intake.add({ platform: 'twitch', channel: name });
      setChannel('');
      return;
    }
    if (pick === 'sheet') {
      const parsed = parseSheetLink(sheetLink);
      if ('error' in parsed) return setNote(parsed.error);
      const { link } = parsed;
      // The same tab already followed for fields gains the inbox rather than a second reader.
      const same = (show.sources ?? []).find(
        (s): s is SheetShowSource => s.kind === 'sheet' && s.config.sheetId === link.sheetId && s.config.gid === link.gid,
      );
      const source: SheetShowSource = {
        id: same?.id ?? messageSheetId(link.sheetId, link.gid),
        kind: 'sheet',
        label: 'Messages',
        config: { sheetId: link.sheetId, gid: link.gid, ...(link.published ? { published: true } : {}), shape: 'lines' },
        inbox: true,
      };
      if (await save(addMessageSource(show.id, source), 'The message Sheet')) setSheetLink('');
      return;
    }
    const videoId = normalizeYouTubeVideoId(video);
    if (!videoId) return setNote('Not a YouTube video id or URL.');
    const apiKey = keyToUse(key, remember);
    if (!apiKey) return setNote('Paste your YouTube Data API key - YouTube has no anonymous read.');
    const mode = pick === 'youtube-chat' ? 'chat' : 'comments';
    // The same video in the same mode is the same source: connecting it again reads it again (with
    // the key just given), never a second record no reader serves.
    const same = (show.sources ?? []).find(
      (s): s is YouTubeShowSource => s.kind === 'youtube' && s.config.videoId === videoId && s.config.mode === mode,
    );
    const source: YouTubeShowSource = same ?? { id: uuid(), kind: 'youtube', label: videoId, config: { videoId, mode }, inbox: true };
    // The tab the operator pressed Connect in reads it: claimed before the record is saved, so a
    // tab that hears of the new source first finds it taken.
    if (mode === 'chat') claimChatRead(source.id, Date.now(), true);
    if (!same && !(await save(addMessageSource(show.id, source), 'The YouTube source'))) return;
    setVideo('');
    setKey('');
    if (mode === 'chat') {
      // A NEW source is already being read: `useMessageSources` starts it with this key as soon as
      // its record is in the production, while the save above is still landing. Replacing that
      // reader here read the chat twice (issue 1595). The same source connected again is read again.
      const running = intake.forSource(source.id);
      if (running && !same) return;
      if (running) intake.remove(running.id);
      intake.add({ platform: 'youtube', videoId, apiKey, sourceId: source.id });
    } else void fetchNewest(source.id, videoId, apiKey);
  };

  /** The key typed for a source that was waiting for it: reconnect a chat, or fetch comments. */
  const answerKey = (source: YouTubeShowSource) => {
    const apiKey = keyToUse(key, remember);
    if (!apiKey) return;
    setKey('');
    setKeyFor(null);
    if (source.config.mode === 'chat') {
      claimChatRead(source.id, Date.now(), true);
      intake.add({ platform: 'youtube', videoId: source.config.videoId, apiKey, sourceId: source.id });
    } else void fetchNewest(source.id, source.config.videoId, apiKey);
  };

  const removeSource = async (sourceId: string) => {
    const runtime = intake.forSource(sourceId);
    if (runtime) intake.remove(runtime.id);
    await save(removeMessageSource(show.id, sourceId), 'Removing the source');
  };

  /** A chat that stopped on a refusal (not live yet, quota, key) reads again from the start. */
  const reconnect = (source: YouTubeShowSource) => {
    const runtime = intake.forSource(source.id);
    const apiKey = youtubeKey();
    if (!apiKey) return;
    claimChatRead(source.id, Date.now(), true);
    if (runtime) intake.remove(runtime.id);
    intake.add({ platform: 'youtube', videoId: source.config.videoId, apiKey, sourceId: source.id });
  };

  const pauseSource = async (source: YouTubeShowSource) => {
    const runtime = intake.forSource(source.id);
    if (runtime) intake.setPaused(runtime.id, !source.paused);
    await save({ shows: setShowSourcePaused(show.id, source.id, !source.paused), error: null }, 'Pause');
  };

  const keyRow = (source: YouTubeShowSource) => (
    <span className="pd-aud-source-key" data-testid="youtube-key-prompt">
      <input type="password" value={key} placeholder="Your YouTube Data API key" aria-label="YouTube Data API key" onChange={(e) => setKey(e.target.value)} data-testid="youtube-key-input" />
      <label className="hint">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="youtube-key-remember" /> Remember on this browser
      </label>
      <button type="button" disabled={!key.trim()} onClick={() => answerKey(source)} data-testid="youtube-key-use">
        {source.config.mode === 'chat' ? 'Reconnect' : 'Use key'}
      </button>
    </span>
  );

  return (
    <div className="pd-aud-sources" data-testid="chat-sources">
      <div className="pd-aud-sources-head">
        <h3>Message sources</h3>
        <span className="hint">What arrives joins this inbox - nothing airs without you.</span>
      </div>
      {(messageSources.length > 0 || others.length > 0) && (
        <ul className="pd-aud-source-list">
          {messageSources.map((source) => {
            if (source.kind === 'sheet') {
              return (
                <li key={source.id} className="pd-aud-source" data-testid="message-source-sheet">
                  <span className="pd-aud-source-name">Sheet: {source.label}</span>
                  <span className="hint">{source.paused ? 'Paused' : 'New rows arrive while this production is open'}</span>
                  <button onClick={() => void removeSource(source.id)} title="Stop taking messages from this Sheet" data-testid="message-source-remove">
                    ✕
                  </button>
                </li>
              );
            }
            const runtime = running.find((r) => r.sourceId === source.id) ?? null;
            const chat = source.config.mode === 'chat';
            const elsewhere = chat && !runtime && chatReadElsewhere(source.id);
            const needsKey = !runtime && !elsewhere && !youtubeKey();
            const state = source.paused ? 'paused' : (runtime?.status ?? (needsKey ? 'error' : 'connecting'));
            return (
              <li key={source.id} className="pd-aud-source" data-testid={chat ? 'chat-source-youtube' : 'comments-source-youtube'}>
                {chat && <span className={`pd-aud-source-dot ${state}`} title={state} aria-hidden="true" />}
                <span className="pd-aud-source-name">
                  {chat ? 'YouTube live chat' : 'YouTube comments'} · {source.config.videoId}
                </span>
                {chat && runtime && (
                  <span className="pd-aud-source-stats" data-testid="chat-source-stats">
                    {runtime.submitted} in{runtime.votes > 0 && ` · ${runtime.votes} votes`} · {runtime.dropped} dropped
                  </span>
                )}
                {chat && runtime?.detail && !source.paused && (
                  <span className="pd-aud-source-detail" data-testid="chat-source-detail">{runtime.detail}</span>
                )}
                {elsewhere && !source.paused && (
                  <span className="hint" data-testid="chat-source-elsewhere">Read in another tab of this production</span>
                )}
                {!chat && fetched[source.id] && (
                  <span className={fetched[source.id].ok ? 'hint' : 'pd-aud-source-detail'} data-testid="comments-source-detail">
                    {fetched[source.id].text}
                  </span>
                )}
                {needsKey && keyFor !== source.id && (
                  <button type="button" onClick={() => setKeyFor(source.id)} data-testid="youtube-key-needed">
                    Key needed
                  </button>
                )}
                {!chat && !needsKey && (
                  <button type="button" disabled={fetching === source.id} onClick={() => void fetchNewest(source.id, source.config.videoId, youtubeKey() ?? '')} data-testid="comments-fetch">
                    {fetching === source.id ? 'Fetching…' : 'Fetch newest'}
                  </button>
                )}
                {chat && runtime?.status === 'error' && !source.paused && (
                  <button type="button" onClick={() => reconnect(source)} data-testid="chat-source-reconnect">
                    Reconnect
                  </button>
                )}
                {chat && !needsKey && (
                  <button onClick={() => void pauseSource(source)} data-testid="chat-source-pause">
                    {source.paused ? '▶ Resume' : '❚❚ Pause'}
                  </button>
                )}
                <button onClick={() => void removeSource(source.id)} title="Disconnect this source" data-testid="chat-source-remove">
                  ✕
                </button>
                {keyFor === source.id && keyRow(source)}
                {chat && runtime && runtime.status === 'live' && !source.paused && (
                  <span className="hint pd-aud-source-quota" data-testid="youtube-quota">
                    {quotaLine('chat', spentToday(globalThis.localStorage, Date.now()))}
                  </span>
                )}
              </li>
            );
          })}
          {others.map((s) => (
            <li key={s.id} className="pd-aud-source" data-testid={`chat-source-${s.platform}`}>
              {/* The dot is the LIVE indicator; its title says the same thing in words. */}
              <span className={`pd-aud-source-dot ${s.paused ? 'paused' : s.status}`} title={s.paused ? 'Paused' : s.status} aria-hidden="true" />
              <span className="pd-aud-source-name">
                {chatPlatformWord(s.platform)} · {s.label}
              </span>
              {/* The dropped count is deliberately always visible: the throttle and the
                  per-author caps refuse things by design, and a limiter that drops silently
                  is indistinguishable from a broken connector. */}
              <span className="pd-aud-source-stats" data-testid="chat-source-stats">
                {s.submitted} in{s.votes > 0 && ` · ${s.votes} votes`} · {s.dropped} dropped
              </span>
              {s.detail && !s.paused && (
                <span className="pd-aud-source-detail" data-testid="chat-source-detail">
                  {s.detail}
                </span>
              )}
              <button onClick={() => intake.setPaused(s.id, !s.paused)} data-testid="chat-source-pause">
                {s.paused ? '▶ Resume' : '❚❚ Pause'}
              </button>
              <button onClick={() => intake.remove(s.id)} title="Disconnect this source" data-testid="chat-source-remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pd-aud-source-add">
        <select value={pick} onChange={(e) => setPick(e.target.value as SourcePick)} aria-label="Message source" data-testid="chat-add-platform">
          <option value="twitch">Twitch channel</option>
          <option value="youtube-comments">Comments on a video</option>
          <option value="youtube-chat">Live chat of a stream</option>
          <option value="sheet">Message Sheet</option>
        </select>
        {pick === 'twitch' && (
          <input
            type="text"
            value={channel}
            placeholder="Channel name or twitch.tv URL"
            onChange={(e) => setChannel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void connect()}
            data-testid="chat-add-channel"
          />
        )}
        {pick === 'sheet' && (
          <input type="text" value={sheetLink} placeholder="Google Sheets link" onChange={(e) => setSheetLink(e.target.value)} data-testid="sheet-add-link" />
        )}
        {(pick === 'youtube-comments' || pick === 'youtube-chat') && (
          <>
            <input type="text" value={video} placeholder="YouTube video link or id" onChange={(e) => setVideo(e.target.value)} data-testid="chat-add-video" />
            <input
              type="password"
              value={key}
              placeholder={youtubeKey() ? 'API key (one is in use here)' : 'YouTube Data API key'}
              onChange={(e) => setKey(e.target.value)}
              data-testid="chat-add-key"
            />
            <label className="hint">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="chat-add-remember" /> Remember on this browser
            </label>
          </>
        )}
        <button onClick={() => void connect()} data-testid="chat-add-connect">
          Connect
        </button>
      </div>
      {note && (
        <p className="status-bad pd-data-note" data-testid="chat-add-note">
          {note}
        </p>
      )}
      {(pick === 'youtube-comments' || pick === 'youtube-chat') && (
        <p className="hint pd-aud-source-hint" data-testid="youtube-quota-cost">
          {quotaLine(pick === 'youtube-chat' ? 'chat' : 'comments')}
        </p>
      )}
      {pick === 'sheet' && (
        <p className="hint pd-aud-source-hint">
          The first row names the columns: Name, Message, and optional Source and Reference, which stay off air.{' '}
          <button type="button" className="pd-aud-orig" onClick={() => void navigator.clipboard?.writeText(MESSAGE_SHEET_STARTER)} data-testid="sheet-copy-starter">
            Copy starter rows
          </button>
        </p>
      )}
      {/* Chat votes are read in this browser (interaction spec, "Chat votes"), so they count only
          while a production page is open: said once, where the sources are. */}
      {(others.length > 0 || running.some((r) => r.platform === 'youtube')) && (
        <p className="hint pd-aud-source-hint" data-testid="chat-votes-hint">
          While a vote is live, a chat line that is only an option's number or letter counts as a vote. Chat is read only while this production is open, and arrives a few seconds late, so wait a moment before Stop.
        </p>
      )}
    </div>
  );
}

export default function ProductionAudienceWorkspace({
  show,
  setShows,
  publish = null,
  joinName = null,
  library = [],
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  /** The active user's saved graphics (model/library.ts `loadGraphics`): the pickers offer the
   *  compatible ones after the production's own (svg-template-library D6). */
  library?: readonly SavedDesign[];
  /** Publish this production, offered where phones would join (AC-8): a press, never automatic. */
  publish?: { run: () => void; unavailable: string | null } | null;
  /** The link's name (moved here from Links): the claim stays with the page, which owns its
   *  account gate (useProductionPublish.ts `claimName`). */
  joinName?: { draft: string; note: string | null; busy: boolean; onDraft: (value: string) => void; onClaim: () => void } | null;
}) {
  // ONE provider per PRODUCTION. The local one is held ABOVE this component (the workspace
  // unmounts on every trip to Playout or Data, and an inbox that emptied itself on a tab
  // switch would be the PROGRAM monitor's round-trip defect wearing different clothes; what it
  // keeps across a reload is in localAudience.ts). The Supabase one holds no state to lose: its whole memory
  // is the database, so a fresh instance per mount reads the same inbox.
  const { live, backend } = useMessagesBackend(show);
  const { needsSignIn } = useAuthState();

  const [rows, setRows] = useState<AudienceSubmission[]>([]);
  const [filter, setFilter] = useState<'inbox' | 'approved' | 'shortlist' | 'all'>('inbox');
  /** Which question's messages the list shows: all, none, one question (`q:<id>`) or the
   *  questions no longer in the list. */
  const [questionFilter, setQuestionFilter] = useState<string>('all');
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewHost = useRef<HTMLDivElement | null>(null);
  const preview = useRef<JoinSurfaceHandle | null>(null);
  /** What the presenter's own page is showing (`/join?pv=<slug>`), by submission id. */
  const [presenter, setPresenter] = useState<PresenterPointers>({ current: null, next: null });
  /** The same pointers, readable SYNCHRONOUSLY. Two presses in one tick - queue a question as
   *  Next, then immediately move Now onto another - both composed off the rendered value and
   *  the second overwrote the first, blanking a slot a presenter was already reading. Same
   *  hazard, same answer, as GraphicControlPage's read-fresh `patch`. */
  const presenterRef = useRef<PresenterPointers>({ current: null, next: null });
  const applyPresenter = (next: PresenterPointers) => {
    presenterRef.current = next;
    setPresenter(next);
  };

  // ── QUESTIONS (interaction spec, "Question lifecycle") ─────────────────────────────────────
  // The list is the production's (Show.questions); each question's one result is a round with the
  // provider, keyed by the question's id. Which question is live is the provider's, read back on
  // every change; which one is SELECTED is this screen's alone and calls nothing (R12).
  const questions = useMemo(() => showQuestions(show), [show]);
  const [rounds, setRounds] = useState<AudienceRound[]>([]);
  const liveRound = openRoundOf(rounds);
  const roundOf = useMemo(() => new Map(rounds.filter((r) => r.questionId).map((r) => [r.questionId!, r] as const)), [rounds]);
  /** Counts per round, for every vote this production has asked. */
  const [tallies, setTallies] = useState<Record<string, AudienceTally>>({});
  /** Which state of each round its counts were read in: a closed round is read once per state. */
  const tallyRead = useRef(new Map<string, string>());
  const tallyKey = (r: AudienceRound) => `${r.revision}|${r.closedAt ?? 'open'}`;
  /** Each Word round's words per spelling, counted by the provider over every word (W1): the
   *  message list is capped at a page on the server, so it is never counted for a cloud. */
  const [wordTallies, setWordTallies] = useState<Record<string, WordTally[]>>({});
  /** Which state of each Word round its words were read in; the live one is read on every change. */
  const wordsRead = useRef(new Map<string, string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ editing: ShowQuestion | null } | null>(null);
  const [armedClear, setArmedClear] = useState<string | null>(null);
  /** A Go live, Stop, Clear or Delete in flight: their buttons wait for it. */
  const [busy, setBusy] = useState(false);
  /** The question whose "Add results to rundown" is asking where results go (S5). */
  const [choosingResult, setChoosingResult] = useState<string | null>(null);
  /** Does this production run the percentage figures live while a vote is open? Read straight
   *  off the record rather than mirrored into state: the checkbox writes through `setShows`,
   *  so the record is the only copy and a second tab cannot disagree with this one. */
  const liveFigures = show.pollLiveFigures === true;
  /**
   * …and whether any graphic in this production can actually OBEY it.
   *
   * Only a board that carries the `Live figures` field does - which today means an imported one.
   * A CATALOG vote board reveals its figures from its own machine and has no such field, so
   * `tallyValues` would write nothing and the checkbox would promise an operator something that
   * never happens. A control that does nothing is worse than a control that is not there, so the
   * row is only offered where the production has somewhere to send it.
   */
  /** Where results go, once chosen (Show.resultTarget, S5), and what could take them. */
  const resultTarget = rememberedResultTarget(show);
  const canRunLiveFigures = useMemo(
    () => show.graphics.some((g) => pollFieldMap(g.template.fields ?? [])?.live),
    [show.graphics],
  );

  /**
   * WHAT VIEWERS SEE, rendered by the SAME function the public page renders (the plan's own
   * requirement: preview and reality cannot drift if there is only one renderer). It is
   * READ-ONLY — the two write methods refuse — because an operator's own preview must never be
   * able to put words in the audience's mouth.
   *
   * Live, it reads through the production's JOIN slug, which the studio holds locally: what is
   * shown is then literally what a phone gets, not a reconstruction of it.
   */
  // Unpublished, the preview takes the page straight from the production (its look, logo, title
  // and waiting text), since there are no phones to send it to (AudienceBackend.setPage).
  const [lookLogo, setLookLogo] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void lookLogoDataUrl(show.look).then((url) => {
      if (alive) setLookLogo(url);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only when the logo itself changes
  }, [show.look?.logo?.data]);
  const localBrand = useMemo(() => joinPageBrand({ look: show.look, joinPage: show.joinPage }, lookLogo), [show.look, show.joinPage, lookLogo]);
  // Read through a ref, so a settings edit refreshes the open preview instead of remounting it.
  const localBrandRef = useRef(localBrand);
  localBrandRef.current = localBrand;
  useEffect(() => {
    preview.current?.refresh();
  }, [localBrand]);
  const previewClient = useMemo<JoinSurfaceClient>(() => {
    const viewer = live && show.joinSlug ? createSupabaseAudience({ joinSlug: show.joinSlug }) : backend;
    const refuse = async () => ({ ok: false, error: 'This is your preview. Send from a phone to test it.' });
    return {
      load: async () => {
        const view = await viewer.joinView('preview-operator-device');
        return live ? view : { ...view, brand: localBrandRef.current };
      },
      submit: refuse,
      vote: refuse,
    };
  }, [backend, live, show.joinSlug]);

  // PUBLISHED: phones follow the page settings and the look without a publish (interaction spec
  // phase 2, rules P1 to P4 in control/joinPageSync.ts). Opening the tab compares what phones get
  // with the production and sends only a difference; a change is sent a moment later, even if the
  // operator has left the tab by then.
  // The key is what phones would be sent, with the logo by its own bytes.
  const pageKey = useMemo(() => {
    const logo = show.look?.logo?.data;
    return JSON.stringify([joinPageBrand({ look: show.look, joinPage: show.joinPage }, null), typeof logo === 'string' ? logo : logo ? `blob:${blobId(logo)}` : null]);
  }, [show.look, show.joinPage]);
  const pageSynced = useRef(false);
  /** Ask the page queue to bring phones in step (published only). Read through a ref by the
   *  page settings' commit, which can run as this component goes away. */
  const askPageSync = useRef<(delayMs: number) => void>(() => {});
  askPageSync.current = (delayMs: number) => {
    if (!live || !backend.setPage || !backend.readPage) return;
    const showId = show.id;
    void syncJoinPage(
      showId,
      {
        readShow: () => loadShows().find((s) => s.id === showId) ?? null,
        readBrand: () => backend.readPage!(),
        publishLogo: (current, known) => publishJoinLogo(current.id, current.look, known),
        send: (brand) => backend.setPage!(brand),
        onSent: () => preview.current?.refresh(),
        onError: () => setNote('Phones did not get all of this page (the logo or the connection). It is tried again when Interaction opens, and on publish.'),
      },
      delayMs,
    );
  };
  useEffect(() => {
    askPageSync.current(pageSynced.current ? 600 : 0);
    pageSynced.current = true;
    // The key says when to ask; the sync reads the production itself when it runs.
  }, [live, backend, pageKey, show.joinSlug]);

  /** The page settings' boxes: one write per edit, not per keystroke (useDeferredEdits). */
  const pageEdits = useDeferredEdits((key, text) => {
    const { shows, error } = setShowJoinPage(show.id, { [key]: text });
    if (error) setNote(error);
    else setShows(shows);
    // An edit can be committed as this tab closes, when no effect will run after it: ask here too.
    if (!error) askPageSync.current(600);
  });
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    const host = previewHost.current;
    if (!previewOpen || !host) return;
    // Polling is OFF: this surface already has a change signal (the provider's own), and a
    // second timer inside the studio would ask the same questions twice.
    preview.current = mountJoinSurface(host, previewClient, { poll: false });
    return () => {
      preview.current?.destroy();
      preview.current = null;
    };
  }, [previewOpen, previewClient]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void backend.list().then(
        (list) => {
          if (alive) setRows(list);
        },
        // A failed read is not worth interrupting a show for: the next poll is four seconds
        // away and the inbox keeps showing the last thing that was true.
        () => {},
      );
      void backend.rounds().then(
        async (list) => {
          if (!alive) return;
          setRounds(list);
          // Every vote's count, for the list's answer column. A closed round's counts are final, so
          // each is read once per state it is in (reopened, cleared); the live one is re-read
          // below at the tally's own rate.
          const due = list.filter((r) => r.kind !== 'open' && r.kind !== 'word' && tallyRead.current.get(r.id) !== tallyKey(r));
          const counted = await Promise.all(due.map((r) => backend.tally(r.id).then((t) => [r, t] as const, () => null)));
          if (!alive) return;
          for (const done of counted) if (done) tallyRead.current.set(done[0].id, tallyKey(done[0]));
          const fresh = counted.filter((d): d is NonNullable<typeof d> => d !== null);
          if (fresh.length > 0) setTallies((prev) => ({ ...prev, ...Object.fromEntries(fresh.map(([, t]) => [t.roundId, t])) }));
          // Every Word round's words: a closed one once per state, the live one on every change.
          const words = list.filter((r) => r.kind === 'word' && (!r.closedAt || wordsRead.current.get(r.id) !== tallyKey(r)));
          const read = await Promise.all(words.map((r) => backend.wordCounts(r.id).then((w) => [r, w] as const, () => null)));
          if (!alive) return;
          const got = read.filter((d): d is NonNullable<typeof d> => d !== null);
          for (const [r] of got) wordsRead.current.set(r.id, tallyKey(r));
          if (got.length > 0) setWordTallies((prev) => ({ ...prev, ...Object.fromEntries(got.map(([r, w]) => [r.id, w])) }));
        },
        () => {},
      );
      // One change signal drives both halves of this screen, so the viewer preview can never
      // be showing a question the list says is not live.
      preview.current?.refresh();
    };
    refresh();
    // The pointers belong to the PRODUCTION, so an operator who queued a question, went to
    // Playout and came back must not find both slots empty while a presenter's tablet is still
    // showing them.
    void backend.getState().then(
      (state) => {
        if (alive) applyPresenter(state.presenter);
      },
      () => {},
    );
    const off = backend.onChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  // THE LIVE VOTE'S COUNTS move every time a phone is tapped, so they are polled at ~2 s while it
  // is live. Nothing polls a closed round: its counts are final.
  useEffect(() => {
    if (!liveRound || liveRound.kind === 'open' || liveRound.kind === 'word') return;
    let alive = true;
    const read = () =>
      void backend.tally(liveRound.id).then(
        (t) => {
          if (alive) setTallies((prev) => ({ ...prev, [t.roundId]: t }));
        },
        () => {},
      );
    read();
    const timer = setInterval(read, 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [backend, liveRound]);

  /** Each question's row: live or not, and how many answers its result holds (messages filed
   *  under it, or votes). */
  const rowStates = useMemo(() => {
    const out: Record<string, QuestionRowState> = {};
    for (const q of questions) {
      const round = roundOf.get(q.id);
      const isLive = !!round && !round.closedAt;
      const answers = !round
        ? 0
        : round.kind === 'word'
          ? (wordTallies[round.id] ?? []).reduce((n, w) => n + w.count, 0)
          : round.kind === 'open'
            ? rows.filter((r) => r.roundId === round.id).length
            : tallies[round.id]?.total ?? 0;
      out[q.id] = { live: isLive, answers, locked: questionLocked(q, { live: isLive, answers }) };
    }
    return out;
  }, [questions, roundOf, rows, tallies, wordTallies]);
  const liveQuestion = liveRound?.questionId ? questions.find((q) => q.id === liveRound.questionId) ?? null : null;
  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const selectedRound = selected ? roundOf.get(selected.id) : undefined;

  /** Write the list through one of model/questions.ts's edits; said only once it has landed. */
  const editList = async (edit: (list: ShowQuestion[]) => ShowQuestion[] | string, failed: string): Promise<boolean> => {
    const { shows, error } = setShowQuestions(show.id, edit);
    setShows(shows);
    const failure = error ?? (await commitDurableWrites());
    if (failure) setNote(`${failed}: ${failure}`);
    return !failure;
  };

  const saveComposer = (type: QuestionType, text: string, options: string[]) => {
    const editing = composer?.editing ?? null;
    if (editing) {
      const state = rowStates[editing.id];
      void editList((list) => {
        const done = editQuestion(list, editing.id, { text, options }, state?.locked ?? false);
        return 'error' in done ? done.error : done.list;
      }, 'The question was not saved').then((ok) => ok && setComposer(null));
      return;
    }
    const made = makeQuestion(uuid(), type, text, options);
    if ('error' in made) {
      setNote(made.error);
      return;
    }
    void editList((list) => addQuestion(list, made.question), 'The question was not added').then((ok) => {
      if (!ok) return;
      setComposer(null);
      setSelectedId(made.question.id);
    });
  };

  /**
   * ONE TURN AT A TIME (S27): Go live, Stop and Add results run to their note before another of the
   * three starts, so none reads a round another is about to close. A ref, not state: two presses
   * in one frame would both see the same state.
   */
  const turn = useRef(false);
  const takeTurn = (): boolean => {
    if (turn.current) return false;
    turn.current = true;
    setBusy(true);
    return true;
  };
  const endTurn = () => {
    turn.current = false;
    setBusy(false);
  };

  /**
   * THE CLOSING SWEEP (S26, S29): every poll round the provider now reports closed whose result cue
   * still says "voting open" gets the closing write, with counts read now. Whatever closed it (this
   * press, another tab, another operator) and in whatever order, the cue ends up saying closed.
   * A count that cannot be read is said, never replaced by this page's last reading (S28).
   */
  const finaliseClosed = async (
    before: AudienceRound[] | null,
    after: AudienceRound[] | null,
    openedId: string | null,
    closingId: string | null = null,
  ): Promise<{ done: ResultOutcome[]; unread: number }> => {
    const done: ResultOutcome[] = [];
    const current = loadShows().find((x) => x.id === show.id) ?? show;
    // Unread counts matter only where there is a result cue to finalise.
    const hasCue = (questionId: string | null) => Boolean(questionId && current.resultCues?.[questionId]);
    let unread = after ? 0 : Object.keys(current.resultCues ?? {}).length > 0 ? 1 : 0;
    for (const round of after ? roundsToFinalise(current, before, after, openedId, closingId) : []) {
      const final = await backend.tally(round.id).catch(() => null);
      if (!final) {
        if (hasCue(round.questionId)) unread += 1;
        continue;
      }
      done.push(await writeResult(round, final, { closed: true, closeOnly: true }));
    }
    return { done, unread };
  };

  /** What the closing sweep did, in words for the note after `lead`. */
  const sweepWords = ({ done, unread }: { done: ResultOutcome[]; unread: number }): string => {
    const failed = done.find((d) => !d.ok);
    if (failed) return ` A result cue was not updated with its final counts: ${failed.message}`;
    const updated = done.filter((d): d is Extract<ResultOutcome, { ok: true }> => d.ok && d.kind === 'updated');
    const words = updated.length ? ` The result cue on “${updated[0].graphic}” now carries the final counts.` : '';
    return unread ? `${words} The final counts could not be read; press Add results to rundown to write them.` : words;
  };

  /** Put a question in front of every phone (R3). Nothing airs: a vote reaches Program only as a
   *  cue the operator stages and takes. Any round the press closed is finalised by the sweep (S14). */
  const goLive = async (q: ShowQuestion) => {
    if (!isKnownType(q.type) || !takeTurn()) return;
    setArmedClear(null);
    try {
      const before = await backend.rounds().catch(() => null);
      const opened = await backend.goLive(toLive({ ...q, type: q.type }));
      chatIntakeFor(show.id).liveChanged(); // chat sorts its next line against this question
      setSelectedId(q.id);
      const swept = await finaliseClosed(before, await backend.rounds().catch(() => null), opened.id);
      // Going live again continues the question's one result (O1), and a phone that voted before
      // still holds that vote. Said at the press, with the number, because a second run that the
      // operator took for a fresh count read as votes going missing (studio session, 2026-11-23).
      const reopened = opened.kind === 'poll' && (before ?? []).some((r) => r.id === opened.id);
      const carried = reopened ? (await backend.tally(opened.id).catch(() => null))?.total ?? 0 : 0;
      const continues = carried > 0 ? ` Its earlier ${carried} ${carried === 1 ? 'vote still counts' : 'votes still count'}. For a fresh count, Stop and Clear results, or Duplicate it.` : '';
      setNote(`✓ Phones now show “${q.text}”.${continues}${sweepWords(swept)} Nothing is on air.`);
    } catch (err) {
      const message = (err as Error).message;
      // R8: another tab changed the words of a question that already has answers.
      setNote(
        /has answers/.test(message)
          ? `“${q.text}” has answers to the words it was asked with, so it cannot go live with new ones. Duplicate it to ask the changed version.`
          : `The question did not go live: ${message}`,
      );
    } finally {
      endTurn();
    }
  };

  /**
   * Stop the live question (R4) - and FINALISE the cue its vote was staged onto, because stopping
   * is usually the moment before the reveal (S7). Never a new cue, never an event: the board stays
   * where it is and the reveal stays a press. The words reach air only through Take or Update.
   */
  const stop = async (closing: AudienceRound | null = liveRound): Promise<boolean> => {
    if (!closing || !takeTurn()) return false;
    try {
      const after = await backend.stop(closing.id);
      chatIntakeFor(show.id).liveChanged();
      // Stop names its round (R4): if another operator put a question live meanwhile, nothing
      // stopped, and the page says so rather than claiming phones are waiting.
      if (after.round && after.round.id !== closing.id) {
        setNote('Another question went live meanwhile, so nothing was stopped.');
        return false;
      }
      const swept = await finaliseClosed(null, await backend.rounds().catch(() => null), null, closing.id);
      const finalised = swept.done.some((d) => d.ok && d.kind === 'updated');
      setNote(`✓ Stopped. Phones show the waiting text.${sweepWords(swept)}${finalised ? ' Take it when you want them on air.' : ''}`);
      return true;
    } catch (err) {
      setNote(`The question did not stop: ${(err as Error).message}`);
      return false;
    } finally {
      endTurn();
    }
  };

  const duplicate = (q: ShowQuestion) => {
    const id = uuid();
    void editList((list) => duplicateQuestion(list, q.id, id), 'The copy was not added').then((ok) => {
      if (ok) {
        setSelectedId(id);
        setNote(`✓ Added a copy of “${q.text}”. It starts with no answers.`);
      }
    });
  };

  /** Two presses (R9): the first arms, the second clears. Refused while live. */
  const clear = async (q: ShowQuestion) => {
    if (armedClear !== q.id) {
      setArmedClear(q.id);
      return;
    }
    setArmedClear(null);
    setBusy(true);
    try {
      await backend.clearResults(q.id);
      setNote(`✓ Cleared the answers and votes of “${q.text}”.`);
    } catch (err) {
      setNote(`The results were not cleared: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Remove it from the list. Its answers stay, under Earlier questions; a live one stops first
   *  (R10). Whether it is live is asked of the provider at the press, not read off this page:
   *  another operator may have put it live since this page last refreshed. */
  const remove = async (q: ShowQuestion) => {
    const now = await backend.rounds().catch(() => null);
    if (!now) {
      setNote('The question was not deleted: its state could not be read. Try again.');
      return;
    }
    const open = now.find((r) => r.questionId === q.id && !r.closedAt);
    if (open && !(await stop(open))) {
      // Stop changed nothing because another question went live, which already closed this one
      // (R3): deleting it is then safe. Only a round still open keeps it in the list.
      const after = await backend.rounds().catch(() => null);
      if (!after || after.some((r) => r.id === open.id && !r.closedAt)) return;
    }
    if (await editList((list) => removeQuestion(list, q.id), 'The question was not deleted')) {
      if (selectedId === q.id) setSelectedId(null);
      if (questionFilter === `q:${q.id}`) setQuestionFilter(roundOf.get(q.id) ? 'earlier' : 'all');
    }
  };

  const select = (id: string) => {
    setSelectedId(id);
    setArmedClear(null);
    // An edit open on another question closes rather than hiding behind the new selection.
    if (composer?.editing && composer.editing.id !== id) setComposer(null);
    // An Open question's answers are its messages: the list below follows the selection.
    const q = questions.find((x) => x.id === id);
    if (q?.type === 'open') setQuestionFilter(`q:${id}`);
  };

  const patch = (id: string, p: Parameters<AudienceBackend['update']>[1]) => void backend.update(id, p);

  /**
   * Point the presenter at a submission, or clear that slot by pressing the same one again.
   *
   * The pointers are IDS, so what the presenter reads follows every later edit to the broadcast
   * version - a copy taken now would go stale in their hand while the operator was still tidying
   * the wording. Both slots always travel together because 0035 replaces the whole `presenter`
   * object on write; sending one key would silently blank the other.
   *
   * This reaches no rundown and no command log. A presenter holding a question is not the same
   * event as that question going on air, and the two must stay separable - a producer routinely
   * queues three questions the show never gets to.
   */
  const pointPresenter = (slot: 'current' | 'next', id: string) => {
    const prev = presenterRef.current;
    const next: PresenterPointers = { ...prev, [slot]: prev[slot] === id ? null : id };
    applyPresenter(next);
    backend.setState({ presenter: next }).catch((err: Error) => {
      applyPresenter(prev); // springs back rather than lying about what a live tablet shows
      setNote(`Could not update the presenter view: ${err.message}`);
    });
  };

  /** Write a question's result through the one staging function (control/resultStaging.ts). */
  const writeResult = (
    round: AudienceRound,
    tally: AudienceTally,
    opts: { closed: boolean; closeOnly?: boolean; chosen?: string | null; adopt?: string | null },
  ): Promise<ResultOutcome> =>
    stageResults(
      show,
      {
        questionId: round.questionId!,
        round,
        tally,
        closed: opts.closed,
        liveFigures,
        label: resultLabel(round.question),
        chosen: opts.chosen,
        adopt: opts.adopt,
        closeOnly: opts.closeOnly,
      },
      { stage: stageShowResult, commit: commitDurableWrites, setShows, reread: loadShows },
    );

  /**
   * "Add results to rundown" (AC-9; Rules S1 to S9): the counts become the values of the
   * question's one result cue, on the remembered result graphic. A second press, a reload, another
   * tab or a second operator updates that same cue; a deleted cue or a graphic without the fields
   * gets a new one, and the note says so. With nowhere remembered, the operator chooses (S5): one of
   * the production's result graphics, or a catalog vote board, added with its one cue. Nothing airs.
   */
  const addResults = async (round: AudienceRound, on: PickOn = {}) => {
    if (!round.questionId || !takeTurn()) return;
    try {
      let chosen = on.graphicId ?? null;
      let adopt: string | null = null;
      const made = await bringIn(show, on);
      if (made) {
        if (made.shows) setShows(made.shows);
        if (made.error || !made.graphicId) {
          setNote(`The vote board was not added: ${made.error}`);
          return;
        }
        chosen = made.graphicId;
        adopt = made.cueId;
      } else adopt = storedSeededCue(show, resultDestinationOf(show, round.questionId)?.graphicId);
      // The round and its counts as the provider has them NOW, after every other wait of this
      // press (S28). A reading that fails writes nothing: this page's last reading is never written.
      const read = async () => {
        const now = (await backend.rounds().catch(() => null))?.find((r) => r.id === round.id) ?? null;
        const tally = now ? await backend.tally(round.id).catch(() => null) : null;
        return now && tally ? { round: now, tally } : null;
      };
      const fresh = await read();
      if (!fresh) {
        setNote('The counts could not be read, so nothing was written. Try again.');
        return;
      }
      const result = await stageResults(
        show,
        {
          questionId: round.questionId,
          round: fresh.round,
          tally: fresh.tally,
          closed: fresh.round.closedAt !== null,
          liveFigures,
          label: resultLabel(fresh.round.question),
          chosen,
          adopt,
        },
        {
          stage: stageShowResult,
          commit: commitDurableWrites,
          setShows,
          reread: loadShows,
          // S29: once the write landed, the round is read again; closed meanwhile, it is finalised.
          recheck: async () => {
            const again = await read();
            return again ? { closed: again.round.closedAt !== null, tally: again.tally } : null;
          },
        },
      );
      if (!result.ok && result.choose) {
        setChoosingResult(round.questionId);
        setNote(result.message === 'Choose where results go.' ? null : result.message);
        return;
      }
      setChoosingResult(null);
      setNote(result.message);
    } finally {
      endTurn();
    }
  };

  /**
   * "Add word cloud to rundown" (AC-14; W6, W7): a snapshot of the Word question's shown words, most
   * first, becomes the values of its one word cloud cue. Hidden words are never in it. A second
   * press, a reload or another tab updates that same cue; with nowhere remembered the operator
   * chooses one of the production's word clouds, or the catalog's, added with its one cue. Nothing airs.
   */
  const addWordCloud = async (q: ShowQuestion, round: AudienceRound, on: PickOn = {}) => {
    if (!takeTurn()) return;
    try {
      let chosen = on.graphicId ?? null;
      let adopt: string | null = null;
      const made = await bringIn(show, on);
      if (made) {
        if (made.shows) setShows(made.shows);
        if (made.error || !made.graphicId) {
          setNote(`The word cloud was not added: ${made.error}`);
          return;
        }
        chosen = made.graphicId;
        adopt = made.cueId;
      } else adopt = storedSeededCue(show, wordDestinationOf(show, q.id)?.graphicId);
      // The words as the provider counts them NOW, every one of them (like S28): a reading that
      // fails writes nothing.
      const list = await backend.wordCounts(round.id).catch(() => null);
      if (!list) {
        setNote('The words could not be read, so nothing was written. Try again.');
        return;
      }
      // The hidden words as stored now, so a word hidden in another tab stays off the cue.
      // A question still in the stored list decides, an empty list included: another tab may have
      // shown its last hidden word. Only a question gone from it keeps this page's reading. The write
      // itself then takes off every word hidden on the record it lands on (W11).
      const stored = loadShows().find((x) => x.id === show.id) ?? show;
      const now = showQuestions(stored).find((x) => x.id === q.id);
      const hidden = now ? now.hidden ?? [] : q.hidden ?? [];
      // Only the words the operator has seen (W10): fresh counts for the words the panel shows. A
      // word that arrived since the panel last read waits for the next press, after it is listed.
      const seen = new Set(countWordTallies(wordTallies[round.id] ?? []).map((w) => w.key));
      const fresh = countWordTallies(list, hidden);
      const counts = fresh.filter((w) => seen.has(w.key));
      const unseen = fresh.filter((w) => !seen.has(w.key) && !w.hidden).length;
      setWordTallies((prev) => ({ ...prev, [round.id]: list }));
      const result = await stageWords(
        show,
        { questionId: q.id, question: round.question, counts, label: wordCloudLabel(round.question), chosen, adopt },
        { stage: stageShowResult, commit: commitDurableWrites, setShows, reread: loadShows },
      );
      if (!result.ok && result.choose) {
        setChoosingResult(q.id);
        setNote(result.message === 'Choose where the word cloud goes.' ? null : result.message);
        return;
      }
      setChoosingResult(null);
      setNote(
        result.ok && unseen
          ? `${result.message} ${unseen} newer ${unseen === 1 ? 'word is' : 'words are'} listed now and not on the cue; press again to add ${unseen === 1 ? 'it' : 'them'}.`
          : result.message,
      );
    } finally {
      endTurn();
    }
  };

  /** Hide a word from the word cloud, or show it again (W6). Hiding also takes it off the question's
   *  word cloud cue, in the same write, so a word hidden after the press never airs. */
  const hideWord = async (q: ShowQuestion, key: string, hide: boolean) => {
    const { shows, error } = setShowWordHidden(show.id, q.id, key, hide);
    setShows(shows);
    const failure = error ?? (await commitDurableWrites());
    if (failure) setNote(`${hide ? 'The word was not hidden' : 'The word was not shown again'}: ${failure}`);
    // A cue already on air keeps what it showed until the operator's Update (W8): say so.
    else if (hide && shows.find((x) => x.id === show.id)?.resultCues?.[q.id]) {
      // Companion runs the published copy of the cues, which changes only with a publish, as for
      // any cue edit.
      setNote(
        `Hidden, and taken off the word cloud cue. If the cloud is on air, press Update to take the word off air too.${
          show.hostedSlug ? ' Publish again so Companion drops it as well.' : ''
        }`,
      );
    }
  };

  /** Change: ask again where results go (S5, S16). Nothing is forgotten until a graphic is
   *  picked, so Cancel keeps the remembered one. */
  const changeResultTarget = (questionId: string) => setChoosingResult(questionId);

  /** Rounds whose question has left the list: their messages are "Earlier questions" (R10). */
  const earlierRounds = useMemo(() => {
    const listed = new Set(questions.map((q) => q.id));
    return new Set(rounds.filter((r) => !r.questionId || !listed.has(r.questionId)).map((r) => r.id));
  }, [questions, rounds]);

  const byQuestion = useMemo(() => {
    if (questionFilter === 'all') return rows;
    if (questionFilter === 'none') return rows.filter((r) => !r.roundId);
    if (questionFilter === 'earlier') return rows.filter((r) => r.roundId && earlierRounds.has(r.roundId));
    const round = roundOf.get(questionFilter.slice(2));
    return round ? rows.filter((r) => r.roundId === round.id) : [];
  }, [rows, questionFilter, earlierRounds, roundOf]);

  const shown = useMemo(() => {
    const ordered = [...byQuestion].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (filter === 'inbox') return ordered.filter((r) => r.status === 'new');
    if (filter === 'approved') return ordered.filter((r) => r.status === 'approved' && !r.usedAt);
    if (filter === 'shortlist') return ordered.filter((r) => r.shortlisted);
    return ordered;
  }, [byQuestion, filter]);

  const counts = {
    inbox: byQuestion.filter((r) => r.status === 'new').length,
    approved: byQuestion.filter((r) => r.status === 'approved' && !r.usedAt).length,
    shortlist: byQuestion.filter((r) => r.shortlisted).length,
    all: byQuestion.length,
  };

  /** Where messages go, once chosen (Show.messageTarget), and what could take them. */
  const destinations = useMemo(() => messageDestinations(show), [show]);
  const target = rememberedDestination(show);
  /** The row whose Prepare is asking where messages go - the first prepare, or with no target. */
  const [choosing, setChoosing] = useState<string | null>(null);
  /** The candidate being prepared: its buttons are off until the save settles. */
  const [preparing, setPreparing] = useState<string | null>(null);
  const [pasteName, setPasteName] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  /** Where a paste files (R13): the live Open question by default, or none. */
  const [pasteTo, setPasteTo] = useState<'live' | 'none'>('live');
  const pasteRound = pasteTo === 'live' && liveRound?.kind === 'open' ? liveRound : null;
  /** A paste is being added: on a published production that is a server call, and a second
   *  press meanwhile would add the message twice. */
  const [pasting, setPasting] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(() => (show.sources ?? []).some((s) => s.kind === 'youtube' || s.kind === 'sheet'));

  /** Paste: the message joins the inbox as a candidate, like any other, and airs only as a cue. */
  const addPasted = () => {
    if (!pasteBody.trim() || pasting) return;
    setPasting(true);
    backend
      .addCandidates([{ author: pasteName, body: pasteBody, source: 'Pasted', roundId: pasteRound?.id ?? null }])
      .then(() => {
        setPasteName('');
        setPasteBody('');
        setFilter('inbox');
        setNote(null);
      })
      .catch((err: Error) => setNote(`The message was not kept: ${err.message}`))
      .finally(() => setPasting(false));
  };

  const chooseTarget = async (graphicId: string | null): Promise<boolean> => {
    const { shows, error } = setShowMessageTarget(show.id, graphicId);
    setShows(shows);
    const failure = error ?? (await commitDurableWrites());
    if (failure) setNote(`Where messages go was not saved: ${failure}`);
    return !failure;
  };

  /**
   * THE ONE EXIT: a message becomes an ordinary cue through `stageMessage`, the function the cue
   * editor's Fill uses too. The destination is NAMED on the button and was CHOSEN by the operator;
   * with nothing able to hold a message, the choice offers the Q&A cards instead. The candidate is
   * marked used only once the cue's durable write has landed.
   */
  const prepare = async (
    row: AudienceSubmission,
    on: PickOn & { again?: boolean } = {},
  ) => {
    if (preparing) return;
    let graphicId = on.graphicId ?? target?.graphicId ?? null;
    if (!graphicId && !on.board && !on.saved) {
      setChoosing(row.id);
      return;
    }
    setPreparing(row.id);
    try {
      let base = show;
      let cueId: string | undefined;
      // The resolved destination, the remembered one included, so a retry fills a copy's seed (R2).
      const made = await bringIn(show, on.saved || on.board ? on : { graphicId: graphicId ?? undefined });
      if (made) {
        if (made.shows) setShows(made.shows);
        if (made.error || !made.graphicId || !made.shows) {
          setNote(`${on.saved ? 'The design' : on.board} was not added: ${made.error}`);
          return;
        }
        graphicId = made.graphicId;
        cueId = made.cueId ?? undefined;
        base = made.shows.find((x) => x.id === show.id) ?? show;
      }
      if (graphicId !== (show.messageTarget ?? null) && !(await chooseTarget(graphicId))) return;
      setChoosing(null);
      const result = await stageMessage(
        base,
        { id: row.id, usedAt: row.usedAt, air: broadcastValues(row) },
        { graphicId: graphicId!, cueId, again: on.again, relabel: true },
        stagingDeps(backend, setShows),
      );
      setNote(result.ok ? preparedNote(result) : result.message);
    } catch (err) {
      setNote(`The message was not prepared: ${(err as Error).message}`);
    } finally {
      setPreparing(null);
    }
  };

  /** Where messages go, as the row's first Prepare asks it: the production's compatible graphics,
   *  the saved designs that can hold a message, then the cards (D6). */
  const destinationChoice = (row: AudienceSubmission) => (
    <DesignPicker
      kind="message"
      items={pickerItems(show, library, 'message')}
      busy={!!preparing}
      onPick={(on) => void prepare(row, on)}
      onCancel={() => setChoosing(null)}
    />
  );

  const joinUrl = live && show.joinSlug ? joinPageUrl(show.joinSlug) : null;
  const joinQrSvg = useMemo(() => (joinUrl ? qrSvg(joinUrl) : null), [joinUrl]);
  /** The Join picker is open: several Join cards and none remembered, no Join card yet (a design
   *  to choose), or Change. */
  const [choosingJoin, setChoosingJoin] = useState(false);
  const joinItems = useMemo(() => pickerItems(show, library, 'join'), [show, library]);
  const joinCard = joinCardOf(show);
  const joinCardName = typeof joinCard === 'string' && joinCard !== 'choose' ? show.graphics.find((g) => g.id === joinCard)?.name ?? null : null;

  /**
   * "Add Join card to rundown" (svg-template-library "Pickers and targets"): the production's
   * current link goes into its Join card's one Join cue (model/joinCues.ts). With one Join card
   * that card; with several, the operator picks once and it is remembered (`joinTarget`); with
   * none, the Join picker offers saved designs and the built-ins (the house card and the code
   * alone), and the pick adds one card with its one cue (`joinPress`). Nothing airs.
   */
  const addJoin = async (on: PickOn = {}) => {
    if (!joinUrl || qrBusy) return;
    let chosen = on.graphicId ?? null;
    if (!chosen && !on.saved && !on.board) {
      const press = joinPress(joinCardOf(show), joinItems);
      if (press === 'choose') {
        setChoosingJoin(true);
        return;
      }
      if (press) on = press;
    }
    setQrBusy(true);
    try {
      let adopt: string | null = null;
      const made = await bringIn(show, on);
      if (made) {
        if (made.shows) setShows(made.shows);
        if (made.error || !made.graphicId) {
          setNote(`The Join card was not added: ${made.error}`);
          return;
        }
        chosen = made.graphicId;
        adopt = made.cueId;
      }
      const staged = stageShowJoin(show.id, joinUrl, { chosen, adopt });
      setShows(staged.shows);
      const failure = staged.error ?? (await commitDurableWrites());
      const { plan, cueId } = staged.outcome();
      if (!failure && plan?.kind === 'choose') {
        setChoosingJoin(true);
        return;
      }
      setChoosingJoin(false);
      const written = plan && (plan.kind === 'update' || plan.kind === 'add') && cueId ? plan : null;
      const name = written ? staged.shows.find((x) => x.id === show.id)?.graphics.find((g) => g.id === written.graphicId)?.name ?? 'the Join card' : '';
      setNote(
        failure
          ? `The Join card cue was not saved: ${failure}`
          : written
            ? `✓ The Join card cue on “${name}” has the current link. Take it when you want it on air.`
            : 'No Join card cue was written: the production has no Join card now. Press Add Join card again.',
      );
    } finally {
      setQrBusy(false);
    }
  };
  const [copied, setCopied] = useState(false);
  const selectedTally = selectedRound ? tallies[selectedRound.id] : undefined;
  const sum = (counts: number[] | undefined) => (counts ?? []).reduce((a, b) => a + b, 0);
  const chatVoted = sum(selectedTally?.chat) > 0;

  return (
    <section className="pd-audience" data-testid="production-audience">
      <div className="pd-data-head">
        <h2>Interaction</h2>
        <p className="hint">
          Nothing here goes on air by itself. Prepare a cue, then Take it.
        </p>
      </div>

      {note && (
        <p className={note.startsWith('✓') ? 'status-ok pd-data-note' : 'status-bad pd-data-note'} data-testid="audience-note">
          {note}
        </p>
      )}

      <div className="pd-aud-areas">
        <div className="pd-aud-area">
          {/* 1. QUESTIONS: prepared before air; one may be live on phones. */}
          <div className="pd-aud-round pd-aud-questions" data-testid="questions">
            <div className="pd-aud-round-head">
              <h3>Questions</h3>
              <button onClick={() => setComposer({ editing: null })} disabled={composer !== null} data-testid="question-add">
                + Question
              </button>
            </div>
            {/* R27: whatever round is open has a Stop, even when no row in this list is its question
                (deleted elsewhere, or written by another tab this page has not read yet). */}
            {liveRound && !liveQuestion && (
              <div className="pd-aud-round-actions" data-testid="question-orphan-live">
                <span className="hint">“{liveRound.question}” is live on phones and not in this list.</span>
                <button className="danger" disabled={busy} onClick={() => void stop()} data-testid="question-orphan-stop">
                  Stop
                </button>
              </div>
            )}
            {composer && !composer.editing && (
              <QuestionComposer editing={null} onSave={saveComposer} onCancel={() => setComposer(null)} />
            )}
            <QuestionList
              questions={questions}
              states={rowStates}
              selectedId={selectedId}
              busy={busy}
              armedClear={armedClear}
              onSelect={select}
              onGoLive={(q) => void goLive(q)}
              onStop={() => void stop()}
              onEdit={(q) => {
                setSelectedId(q.id);
                setComposer({ editing: q });
              }}
              onMove={(id, to) => void editList((list) => moveQuestion(list, id, to), 'The order was not saved')}
              onDuplicate={duplicate}
              onClear={(q) => void clear(q)}
              onDelete={(q) => void remove(q)}
              onDisarm={() => setArmedClear(null)}
            />
          </div>

          {/* 2. THE SELECTED QUESTION: looked at, never sent anywhere by being looked at. */}
          {selected && (
            <div className="pd-aud-round" data-testid="question-selected">
              <div className="pd-aud-round-head">
                <h3 data-testid="question-selected-text">{selected.text}</h3>
                <span className="hint">
                  {selected.type === 'choice' ? 'Multiple choice' : selected.type === 'word' ? 'Word' : 'Open'}
                  {rowStates[selected.id]?.live ? ' · live on phones' : ''}
                </span>
              </div>
              {composer?.editing?.id === selected.id && (
                <QuestionComposer
                  key={selected.id}
                  editing={selected}
                  onSave={saveComposer}
                  onCancel={() => setComposer(null)}
                />
              )}
              {rowStates[selected.id]?.locked && composer?.editing?.id !== selected.id && (
                <p className="hint" data-testid="question-locked">
                  Its words stay as they were asked while it is live or has answers. Duplicate it to change them.
                </p>
              )}
              {selected.type === 'choice' && (
                <>
                  <ul className="pd-aud-tally" data-testid="audience-tally">
                    {(selectedRound?.options ?? selected.options ?? []).map((option, i) => {
                      const count = selectedTally?.counts[i] ?? 0;
                      const share = selectedTally && selectedTally.total > 0 ? Math.round((count / selectedTally.total) * 100) : 0;
                      return (
                        <li key={option + String(i)}>
                          {/* The full option on hover: a long one ellipsizes to keep the bars in a
                              column, and an operator still has to be able to tell which is which. */}
                          <span className="pd-aud-tally-label" title={option}>
                            {option}
                          </span>
                          {/* The bar is a picture of the same number beside it, never instead of it. */}
                          <span className="pd-aud-tally-bar" aria-hidden="true">
                            <span style={{ width: `${share}%` }} />
                          </span>
                          <span className="pd-aud-tally-count" data-testid={`audience-tally-${i}`}>
                            {count}
                          </span>
                          {/* The share beside the count it is made from, so the figure on air can
                              be checked against the votes behind it. */}
                          <span className="pd-aud-tally-share hint" data-testid={`audience-tally-share-${i}`}>
                            {share}%
                          </span>
                          {/* Phone and chat apart, once chat has voted; the count above is their sum. */}
                          {chatVoted && (
                            <span className="pd-aud-tally-split hint" data-testid={`audience-tally-split-${i}`}>
                              {selectedTally?.phone?.[i] ?? 0} phone · {selectedTally?.chat?.[i] ?? 0} chat
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="pd-aud-round-actions">
                    <button
                      className="primary"
                      disabled={!selectedRound || busy}
                      onClick={() => selectedRound && void addResults(selectedRound)}
                      data-testid="audience-round-stage"
                    >
                      {resultDestinationOf(show, selected.id) ? `Add results to rundown on ${resultDestinationOf(show, selected.id)!.name}` : 'Add results to rundown'}
                    </button>
                    {(resultTarget || resultDestinationOf(show, selected.id)) && (
                      <button disabled={busy} onClick={() => changeResultTarget(selected.id)} data-testid="result-target-change">
                        Change
                      </button>
                    )}
                    {/* Rehearsal votes, only where simulating means anything. */}
                    {backend.simulateVotes && rowStates[selected.id]?.live && selectedRound && (
                      <button
                        onClick={() => backend.simulateVotes?.(selectedRound.options.map((_, i) => (i === 0 ? 2 : 1)))}
                        data-testid="audience-simulate-votes"
                      >
                        ⟳ Simulate votes
                      </button>
                    )}
                    <span className="hint">
                      {selectedTally?.total ?? 0} {(selectedTally?.total ?? 0) === 1 ? 'vote' : 'votes'}
                      {chatVoted && ` (${sum(selectedTally?.phone)} phone, ${sum(selectedTally?.chat)} chat)`}. Nothing is on air until you Take the cue.
                    </span>
                  </div>
                  {choosingResult === selected.id && selectedRound && (
                    <DesignPicker
                      kind="results"
                      items={pickerItems(show, library, 'results')}
                      busy={busy}
                      onPick={(on) => void addResults(selectedRound, on)}
                      onCancel={() => setChoosingResult(null)}
                    />
                  )}
                  {/* HOW THIS PRODUCTION SHOWS ITS NUMBERS (owner ruling, 2026-08-30): off by
                      default, a property of the SHOW rather than of a question. */}
                  {canRunLiveFigures && (
                    <label className="pd-aud-live" data-testid="audience-live-figures-row">
                      <input
                        type="checkbox"
                        checked={liveFigures}
                        onChange={(e) => setShows(setShowPollLiveFigures(show.id, e.currentTarget.checked))}
                        data-testid="audience-live-figures"
                      />
                      Update the percentages on air while voting
                      <span className="hint">
                        {liveFigures
                          ? 'The figures follow the counts from the moment the board is taken.'
                          : 'The figures stay dark until the operator presses Show result.'}
                      </span>
                    </label>
                  )}
                </>
              )}
              {selected.type === 'word' && (
                <WordPanel
                  round={selectedRound ?? null}
                  words={selectedRound ? countWordTallies(wordTallies[selectedRound.id] ?? [], selected.hidden ?? []) : []}
                  destination={wordDestinationOf(show, selected.id)}
                  clouds={choosingResult === selected.id ? pickerItems(show, library, 'words') : []}
                  choosing={choosingResult === selected.id}
                  busy={busy}
                  live={!!rowStates[selected.id]?.live}
                  onStage={(on) => selectedRound && void addWordCloud(selected, selectedRound, on)}
                  onChoose={(open) => setChoosingResult(open ? selected.id : null)}
                  onHide={(key, hide) => void hideWord(selected, key, hide)}
                  onSimulate={backend.simulate ? () => backend.simulate?.(4) : null}
                />
              )}
              {selected.type === 'open' && (
                <p className="hint" data-testid="question-selected-answers">
                  {rowStates[selected.id]?.answers ?? 0} {rowStates[selected.id]?.answers === 1 ? 'answer' : 'answers'}, listed under Messages.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 3. JOIN: where phones come in, the preview, paste and the other ways in. */}
        <div className="pd-aud-area" data-testid="interaction-join">
          <div className="pd-aud-round">
            <div className="pd-aud-round-head">
              <h3>Join</h3>
            </div>
            {joinUrl ? (
              <div className="pd-aud-join" data-testid="join-published">
                {/* The code a phone camera reads: drawn here from the link, no QR service. */}
                <div className="pd-aud-qr" role="img" aria-label={`QR code for ${joinUrl}`} data-testid="join-qr" dangerouslySetInnerHTML={{ __html: joinQrSvg ?? '' }} />
                <div className="pd-aud-join-side">
                  <div className="pd-aud-round-actions">
                    <code className="prod-url" data-testid="join-link">{joinUrl}</code>
                    <button onClick={() => void copyLink(joinUrl).then((ok) => setCopied(ok))} data-testid="join-copy">
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="pd-aud-round-actions">
                    <span className="hint">Download QR</span>
                    <button
                      disabled={qrBusy}
                      onClick={() => {
                        setQrBusy(true);
                        void qrPng(joinUrl)
                          .then((blob) => blob && saveFile(blob, `join-${show.joinSlug}.png`))
                          .finally(() => setQrBusy(false));
                      }}
                      data-testid="join-qr-png"
                    >
                      PNG
                    </button>
                    <button
                      onClick={() => saveFile(new Blob([joinQrSvg ?? ''], { type: 'image/svg+xml' }), `join-${show.joinSlug}.svg`)}
                      data-testid="join-qr-svg"
                    >
                      SVG
                    </button>
                  </div>
                  <div className="pd-aud-round-actions">
                    <button disabled={qrBusy} onClick={() => void addJoin()} data-testid="join-card-add">
                      {joinCardName ? `Add Join card to rundown on ${joinCardName}` : 'Add Join card to rundown'}
                    </button>
                    {joinItems.some((i) => i.group !== 'built-in') && (
                      <button disabled={qrBusy} onClick={() => setChoosingJoin(true)} data-testid="join-target-change">
                        Change
                      </button>
                    )}
                  </div>
                  {choosingJoin && (
                    <DesignPicker kind="join" items={joinItems} busy={qrBusy} onPick={(on) => void addJoin(on)} onCancel={() => setChoosingJoin(false)} />
                  )}
                  {joinName && (
                    <div className="pd-aud-round-actions" data-testid="join-name">
                      <input
                        type="text"
                        value={joinName.draft}
                        placeholder={show.joinSlug ?? 'friday-night-live'}
                        aria-label="Link name"
                        title="Changing the name stops the old link"
                        onChange={(e) => joinName.onDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') joinName.onClaim();
                        }}
                        data-testid="join-name-input"
                      />
                      <button onClick={joinName.onClaim} disabled={joinName.busy || !joinName.draft.trim()} data-testid="join-name-claim">
                        Use this name
                      </button>
                    </div>
                  )}
                  {joinName?.note && (
                    <p className={joinName.note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="join-name-note">
                      {joinName.note}
                    </p>
                  )}
                </div>
              </div>
            ) : needsSignIn ? (
              // AC-8: signed out, the sign-in prompt sits where phones would join, and only here.
              <SignInPrompt feature="Phones" reason="Phones join a published production, and publishing needs a free account." />
            ) : (
              <div className="pd-aud-round-actions" data-testid="join-unpublished">
                <span className="hint">Phones can join once this production is published.</span>
                {publish && (
                  <button
                    className="primary"
                    onClick={publish.run}
                    disabled={publish.unavailable !== null}
                    title={publish.unavailable ?? undefined}
                    data-testid="join-publish"
                  >
                    Publish
                  </button>
                )}
              </div>
            )}
            {!joinUrl && (
              <p className="hint">
                <a href={rehearsalPageUrl(show.id)} target="_blank" rel="noopener" data-testid="join-rehearse">
                  Open a rehearsal phone
                </a>{' '}
                in this browser.
              </p>
            )}
            {/* PAGE SETTINGS (interaction spec D4): the page's title and its waiting text. The look,
                its font and its logo come from the production's look. */}
            <div className="pd-aud-page" data-testid="join-page-settings">
              <label className="pd-aud-correct">
                Title
                <input
                  type="text"
                  maxLength={JOIN_PAGE_LIMITS.title}
                  placeholder={show.name}
                  value={pageEdits.text('title', show.joinPage?.title ?? '')}
                  data-dirty={pageEdits.dirty('title') || undefined}
                  onChange={(e) => pageEdits.type('title', e.target.value)}
                  onBlur={pageEdits.flush}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pageEdits.flush();
                  }}
                  data-testid="join-page-title"
                />
              </label>
              <label className="pd-aud-correct">
                Waiting text
                <input
                  type="text"
                  maxLength={JOIN_PAGE_LIMITS.waiting}
                  placeholder={JOIN_WAITING_DEFAULT}
                  value={pageEdits.text('waiting', show.joinPage?.waiting ?? '')}
                  data-dirty={pageEdits.dirty('waiting') || undefined}
                  onChange={(e) => pageEdits.type('waiting', e.target.value)}
                  onBlur={pageEdits.flush}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pageEdits.flush();
                  }}
                  data-testid="join-page-waiting"
                />
              </label>
            </div>
            {/* THE VIEWER'S VIEW. Same renderer as the public page, read-only, folded away by
                default: an operator wants it when setting up and rarely during a show. */}
            <details
              className="pd-aud-preview"
              open={previewOpen}
              onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)}
              data-testid="audience-preview-details"
            >
              <summary>What phones see</summary>
              {/* The mount host is a CHILD of the frame, never the frame itself: mounting adds the
                  join page's own `.nj` class, whose max-width and auto margins would otherwise beat
                  the frame's and float the preview into the middle of the workspace. */}
              <div className="pd-aud-preview-frame">
                <div ref={previewHost} data-testid="audience-preview" />
              </div>
            </details>
          </div>

          {/* PASTE: the route every operator already has. Body required, name optional; no audience
              link, publish or account needed. It files under the destination shown (R13). */}
          <div className="pd-aud-round pd-aud-paste" data-testid="message-paste">
            <div className="pd-aud-round-head">
              <h3>Paste a message</h3>
            </div>
            <input
              type="text"
              value={pasteName}
              maxLength={AUDIENCE_LIMITS.author}
              placeholder="Name (optional)"
              aria-label="Name"
              onChange={(e) => setPasteName(e.target.value)}
              data-testid="message-paste-name"
            />
            <textarea
              value={pasteBody}
              rows={3}
              maxLength={AUDIENCE_LIMITS.body}
              placeholder="Message"
              aria-label="Message"
              onChange={(e) => setPasteBody(e.target.value)}
              data-testid="message-paste-body"
            />
            <div className="pd-aud-round-actions">
              <button className="primary" disabled={!pasteBody.trim() || pasting} onClick={addPasted} data-testid="message-paste-add">
                Paste
              </button>
              <label className="pd-aud-correct">
                Files under
                <select value={pasteRound ? 'live' : 'none'} onChange={(e) => setPasteTo(e.target.value as 'live' | 'none')} data-testid="paste-destination">
                  {liveRound?.kind === 'open' && <option value="live">{liveQuestion?.text ?? liveRound.question}</option>}
                  <option value="none">No question</option>
                </select>
              </label>
              {/* Where messages go, named and changeable. Only compatible graphics are offered, and
                  nothing is chosen until the operator chooses it. */}
              {destinations.length > 0 && (
                <label className="pd-aud-correct">
                  Messages go to
                  <select
                    value={target?.graphicId ?? ''}
                    onChange={(e) => void chooseTarget(e.target.value || null)}
                    data-testid="message-target"
                  >
                    {!target && <option value="">Choose…</option>}
                    {destinations.map((d) => (
                      <option key={d.graphicId} value={d.graphicId}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          <details
            className="pd-aud-more"
            open={moreOpen}
            onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
            data-testid="interaction-more"
          >
            <summary>More ways in</summary>
            <MessageSources show={show} setShows={setShows} backend={backend} live={live} />
            {/* REHEARSAL, and only where it means something: the simulated rows say "(rehearsal)" in
                their own text, and a published production has a real audience instead. */}
            {backend.simulate && (
              <div className="pd-aud-round-actions">
                <button onClick={() => backend.simulate?.(3)} data-testid="audience-simulate">
                  ⟳ Simulate 3 arrivals
                </button>
              </div>
            )}
          </details>
        </div>
      </div>

      <div className="pd-aud-messages-head">
        <h3>Messages</h3>
        <select value={questionFilter} onChange={(e) => setQuestionFilter(e.target.value)} aria-label="Messages of" data-testid="message-question-filter">
          <option value="all">All questions</option>
          <option value="none">No question</option>
          {questions
            .filter((q) => q.type === 'open')
            .map((q) => (
              <option key={q.id} value={`q:${q.id}`}>
                {q.text}
              </option>
            ))}
          {(earlierRounds.size > 0 || questionFilter === 'earlier') && <option value="earlier">Earlier questions</option>}
        </select>
      </div>

      <div className="pd-aud-filters" data-testid="audience-filters">
        {([
          ['inbox', 'Inbox'],
          ['approved', 'Approved'],
          ['shortlist', 'Shortlist'],
          ['all', 'All'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
            data-testid={`audience-filter-${id}`}
          >
            {label} ({counts[id]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="hint pd-data-empty" data-testid="audience-empty">
          {liveRound?.kind === 'open'
            ? 'Nothing waiting. Answers appear here as they arrive.'
            : backend.simulate
              ? 'Nothing here yet. Paste a message, put an Open question live, or simulate a few to rehearse.'
              : 'Nothing here yet. Paste a message, or put an Open question live and share the link.'}
        </p>
      ) : (
        <ul className="pd-aud-list" data-testid="audience-list">
          {shown.map((row) => {
            const air = broadcastValues(row);
            const edited = row.broadcastBody !== row.body || row.broadcastAuthor !== row.author;
            return (
              <li key={row.id} className={`pd-aud-row${row.usedAt ? ' used' : ''}`} data-testid={`audience-row-${row.id}`}>
                <div className="pd-aud-main">
                  <span className="pd-aud-author">{air.author}</span>
                  <span className="pd-aud-body">{air.body}</span>
                  {row.usedAt && <span className="pd-aud-used" data-testid="audience-used">in a cue</span>}
                  {row.withdrawnAt && <span className="pd-aud-used" data-testid="audience-withdrawn">no longer in the Sheet</span>}
                  {/* Provenance, small and never on air: where it came from and a private note. */}
                  {(row.source || row.reference) && (
                    <span className="hint pd-aud-prov" data-testid="audience-provenance">
                      {[row.source, row.reference].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {/* The ORIGINAL is always one click away and never editable. A moderation
                      surface that only showed the edited text would make it impossible to tell
                      a tidy-up from a rewrite. */}
                  {edited && (
                    <button
                      className="pd-aud-orig"
                      onClick={() => setExpanded((e) => (e === row.id ? null : row.id))}
                      data-testid="audience-show-original"
                    >
                      {expanded === row.id ? 'hide what was sent' : 'what was sent'}
                    </button>
                  )}
                </div>
                {expanded === row.id && (
                  <p className="hint pd-aud-original" data-testid="audience-original">
                    Sent by {row.author || 'no name'}: “{row.body}”
                  </p>
                )}
                <div className="pd-aud-edit">
                  <input
                    value={row.broadcastAuthor}
                    onChange={(e) => patch(row.id, { broadcastAuthor: e.target.value })}
                    placeholder="Name on air"
                    aria-label="Name on air"
                    disabled={row.anonymize}
                    data-testid="audience-edit-author"
                  />
                  <input
                    value={row.broadcastBody}
                    onChange={(e) => patch(row.id, { broadcastBody: e.target.value })}
                    aria-label="Message on air"
                    data-testid="audience-edit-body"
                  />
                </div>
                <div className="pd-aud-actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.anonymize}
                      onChange={(e) => patch(row.id, { anonymize: e.target.checked })}
                      data-testid="audience-anonymize"
                    />
                    Anonymous
                  </label>
                  <button onClick={() => patch(row.id, { status: 'rejected' })} data-testid="audience-reject">
                    ✕ Reject
                  </button>
                  {/* The rest, one press away, each saying what it does. Pointing the presenter at a
                      message airs nothing; each pointer is a toggle, so the same press clears it. */}
                  <span className="lib-menu-host">
                    <button
                      aria-haspopup="menu"
                      aria-expanded={menuFor === row.id}
                      onClick={() => setMenuFor((m) => (m === row.id ? null : row.id))}
                      title="More"
                      data-testid="audience-more"
                    >
                      ⋯
                    </button>
                    <LibMenu open={menuFor === row.id} onClose={() => setMenuFor(null)} testid="audience-more-menu">
                      <button role="menuitem" onClick={() => { setMenuFor(null); patch(row.id, { status: 'approved' }); }} data-testid="audience-approve">
                        ✓ Approve, for later
                      </button>
                      <button
                        role="menuitem"
                        className={row.shortlisted ? 'active' : ''}
                        onClick={() => { setMenuFor(null); patch(row.id, { shortlisted: !row.shortlisted }); }}
                        data-testid="audience-shortlist"
                      >
                        {row.shortlisted ? '★ Off the shortlist' : '★ Shortlist, keep back for later'}
                      </button>
                      <button
                        role="menuitem"
                        className={presenter.current === row.id ? 'active' : ''}
                        onClick={() => { setMenuFor(null); pointPresenter('current', row.id); }}
                        data-testid="audience-presenter-now"
                      >
                        {presenter.current === row.id ? '🎤 Clear Now, for the presenter view' : '🎤 Now, for the presenter view'}
                      </button>
                      <button
                        role="menuitem"
                        className={presenter.next === row.id ? 'active' : ''}
                        onClick={() => { setMenuFor(null); pointPresenter('next', row.id); }}
                        data-testid="audience-presenter-next"
                      >
                        {presenter.next === row.id ? '⇢ Clear Next, for the presenter view' : '⇢ Next, for the presenter view'}
                      </button>
                      {row.usedAt && target && (
                        <button
                          role="menuitem"
                          onClick={() => { setMenuFor(null); void prepare(row, { again: true }); }}
                          data-testid="audience-prepare-again"
                        >
                          Prepare again, as a second cue
                        </button>
                      )}
                    </LibMenu>
                  </span>
                  <div className="spacer" />
                  <button
                    className="primary"
                    disabled={!!preparing || !!row.usedAt}
                    onClick={() => void prepare(row)}
                    data-testid="audience-prepare"
                  >
                    {target ? `Prepare cue on ${target.name}` : 'Prepare cue…'}
                  </button>
                </div>
                {choosing === row.id && destinationChoice(row)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * A Word question's words (AC-14): most first, each with how many phones sent it and Hide, and
 * "Add word cloud to rundown" naming where it writes. Hidden words stay listed, struck through, and
 * never reach the cue (W6). Props only: the workspace owns every write.
 */
function WordPanel({
  round,
  words,
  destination,
  clouds,
  choosing,
  busy,
  live,
  onStage,
  onChoose,
  onHide,
  onSimulate,
}: {
  round: AudienceRound | null;
  words: WordCount[];
  destination: { graphicId: string; name: string } | null;
  clouds: PickerItem[];
  choosing: boolean;
  busy: boolean;
  live: boolean;
  onStage: (on?: PickOn) => void;
  onChoose: (open: boolean) => void;
  onHide: (key: string, hide: boolean) => void;
  onSimulate: (() => void) | null;
}) {
  const sent = words.reduce((n, w) => n + w.count, 0);
  const hidden = words.filter((w) => w.hidden).length;
  return (
    <>
      {words.length > 0 ? (
        <ul className="pd-aud-words" data-testid="word-list">
          {words.map((w) => (
            <li key={w.key} className={w.hidden ? 'hidden' : ''} data-testid="word-row">
              <span className="pd-aud-word" title={w.word} data-testid="word-text">
                {w.word}
              </span>
              <span className="pd-aud-tally-count" data-testid="word-count">
                {w.count}
              </span>
              <button onClick={() => onHide(w.key, !w.hidden)} aria-label={`${w.hidden ? 'Show' : 'Hide'} ${w.word}`} data-testid="word-hide">
                {w.hidden ? 'Show' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" data-testid="word-empty">
          {round ? 'No words yet.' : 'Words arrive once this question is live on phones.'}
        </p>
      )}
      <div className="pd-aud-round-actions">
        <button className="primary" disabled={!round || busy} onClick={() => onStage()} data-testid="word-stage">
          {destination ? `Add word cloud to rundown on ${destination.name}` : 'Add word cloud to rundown'}
        </button>
        {destination && (
          <button disabled={busy} onClick={() => onChoose(true)} data-testid="word-target-change">
            Change
          </button>
        )}
        {onSimulate && live && (
          <button onClick={onSimulate} data-testid="word-simulate">
            ⟳ Simulate words
          </button>
        )}
        <span className="hint">
          {sent} {sent === 1 ? 'word' : 'words'}
          {hidden ? `, ${hidden} hidden` : ''}. The cue changes on air only when you Take or Update it.
        </span>
      </div>
      {choosing && round && <DesignPicker kind="words" items={clouds} busy={busy} onPick={(on) => onStage(on)} onCancel={() => onChoose(false)} />}
    </>
  );
}
