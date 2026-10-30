import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addGraphicToShow,
  addMessageSource,
  addShowCue,
  removeMessageSource,
  setShowSourcePaused,
  setShowMessageTarget,
  setShowPollLiveFigures,
  updateShowCue,
  updateShowCueChecked,
  type SheetShowSource,
  type Show,
  type YouTubeShowSource,
} from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import {
  AUDIENCE_LIMITS,
  addInChunks,
  broadcastValues,
  type AudienceBackend,
  type AudienceMode,
  type AudienceRound,
  type AudienceSubmission,
  type AudienceTally,
  type PresenterPointers,
  type ObservableAudience,
} from '../../audience/audienceTypes';
import {
  mountJoinSurface,
  type JoinSurfaceClient,
  type JoinSurfaceHandle,
} from '../../audience/joinSurface';
import { createSupabaseAudience } from '../../audience/audienceData';
import { useMessagesBackend } from './useAudienceInbox';
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
  POLL_LIVE_ON,
  POLL_LIVE_TITLE,
  POLL_STATUS_CLOSED,
  POLL_STATUS_OPEN,
  POLL_STATUS_TITLE,
} from '../../templates/behaviours/vote';
import LibMenu from './LibMenu';
import {
  MESSAGE_CARDS,
  destinationRefusal,
  messageDestinations,
  messageFields,
  lastTitled,
  rememberedDestination,
  stageMessage,
  voteBoardFields,
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
/**
 * Which of a graphic's fields hold a vote — matched BY TITLE, the same by-the-words binding a
 * dataset row and a moderated question already use, so a vote board needs no mapping UI and no
 * per-template special case. `null` means this graphic is not one: a production's pool usually
 * holds straps and bugs too, and staging a tally into a name strap would be worse than saying
 * there is nowhere to put it.
 *
 * The count line and the status are OPTIONAL because they are the fields a board can honestly do
 * without — the bars already carry the numbers, and a catalog board closes from its machine —
 * while a question with no options, or options with no question, is not a vote board at all.
 */
export function pollFieldMap(
  fields: { field: string; title?: string }[],
): {
  question: string;
  options: string;
  count: string | null;
  status: string | null;
  live: string | null;
} | null {
  // THE LAST MATCH WINS, not the first. On a catalog vote board there is only ever one field per
  // title, so this changes nothing there. On IMPORTED artwork the vote's own three fields sit
  // AFTER the artwork's (templates/importedDesign/pollBehaviour.ts), and a designer is perfectly
  // likely to have a text layer called "Question" that they did not bind to the vote - which,
  // scanning forwards, would take the round's question and leave the wire empty while overwriting
  // a layer nobody asked us to touch. Later means more specific here, because later means ours.
  const byTitle = (...wanted: string[]): string | null => lastTitled(fields, wanted);
  // Whether it is a vote board at all is answered once, where messages are kept off one
  // (control/messageStaging.ts): a vote board's Question is not a message body.
  const board = voteBoardFields(fields);
  if (!board) return null;
  return {
    question: board.question,
    options: board.options,
    count: byTitle('vote count', 'votes', 'count', 'total'),
    // The status is a MACHINE-READABLE token in a field of its own, and the title is imported
    // rather than spelled again here: the behaviour that emits the field owns the contract
    // (templates/importedDesign/pollBehaviour.ts, docs/OGRAF_STATE_IN_FIELDS.md R6).
    status: byTitle(POLL_STATUS_TITLE.toLowerCase()),
    // Same shape, same reason: whether the figures run live while the vote is open is a fact the
    // BOARD obeys, so it rides a field of its own and the title comes from the module that emits
    // it. Optional like the other two - a catalog vote board has no such field and simply keeps
    // its own timing.
    live: byTitle(POLL_LIVE_TITLE.toLowerCase()),
  };
}

/**
 * A round's counts as ordinary FIELD VALUES. One function, so staging mid-vote and finalising
 * on close cannot describe the same numbers two different ways.
 *
 * The options line is the poll board's own `Label | count` idiom - the format a hand-typed
 * rehearsal uses - which is exactly why the renderer never has to learn that votes exist.
 */
function tallyValues(
  round: AudienceRound,
  tally: AudienceTally,
  map: {
    question: string;
    options: string;
    count: string | null;
    status: string | null;
    live: string | null;
  },
  closed: boolean,
  liveFigures: boolean,
): Record<string, string> {
  const values: Record<string, string> = {
    [map.question]: round.question,
    [map.options]: round.options.map((label, i) => `${label} | ${tally.counts[i] ?? 0}`).join('\n'),
  };
  // THE COUNT LINE AND THE STATUS ARE TWO DIFFERENT THINGS, written to two different fields.
  //
  // The count line is a SENTENCE, for a human: it goes on the board's own total layer, and a
  // station is free to translate or reword it. The status is a TOKEN, for a machine: it is what
  // the graphic's runtime obeys when it decides whether the VOTE NOW badge is up. They used to be
  // the same string — the runtime pattern-matched "voting closed" out of the count line — so a
  // reworded or translated line left the board saying VOTE NOW through a closed vote, silently
  // (docs/OGRAF_STATE_IN_FIELDS.md R7).
  if (map.count) {
    values[map.count] = `${tally.total} ${tally.total === 1 ? 'vote' : 'votes'} · voting ${closed ? 'closed' : 'open'}`;
  }
  if (map.status) {
    values[map.status] = closed ? POLL_STATUS_CLOSED : POLL_STATUS_OPEN;
  }
  // WHETHER THE FIGURES RUN LIVE, written on every stage rather than only when it is on: a
  // production that ticks the box and then unticks it mid-round has to be able to take the
  // percentages back off air, and a value that is only ever written in one direction cannot say
  // so. Empty is the board's own default, which is to hold them for Show result.
  if (map.live) {
    values[map.live] = liveFigures ? POLL_LIVE_ON : '';
  }
  return values;
}

/** The candidate list, kept fresh off the provider's change signal while `enabled` (a closed
 *  menu reads nothing, so a published production is not polled for a list nobody sees). */
function useCandidates(backend: ObservableAudience, enabled: boolean): AudienceSubmission[] {
  const [rows, setRows] = useState<AudienceSubmission[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
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
 * Add one of the Q&A cards to the production, for messages, when nothing in it can hold one. The
 * card arrives with its one seeded cue (addGraphicToShow), which is the cue the message then fills,
 * so one press makes one card and one cue. Nothing airs.
 */
async function addMessageCard(show: Show, cardName: string): Promise<{ shows: Show[] | null; graphicId: string | null; cueId: string | null; error: string | null }> {
  const [{ variantsFor }, { buildDraftTemplate, initialDraft, mergeDraft }] = await Promise.all([
    import('../../templates/catalog'),
    import('../wizard/draft'),
  ]);
  const variant = variantsFor('audience').find((v) => v.name === cardName);
  if (!variant) return { shows: null, graphicId: null, cueId: null, error: `${cardName} is not in this build.` };
  const draft = mergeDraft(initialDraft(), { variantId: variant.id, lines: variant.suggestedLines.map((l) => ({ ...l })) });
  const template = buildDraftTemplate(variant, draft);
  const { shows, error } = addGraphicToShow(show.id, template, {});
  const failure = error ?? (await commitDurableWrites());
  if (failure) return { shows, graphicId: null, cueId: null, error: failure };
  const after = shows.find((x) => x.id === show.id);
  const before = new Set(show.graphics.map((g) => g.id));
  const graphic = after?.graphics.find((g) => !before.has(g.id)) ?? null;
  const cue = graphic ? after?.cues?.find((c) => c.sourceId === graphic.id) ?? null : null;
  return { shows, graphicId: graphic?.id ?? null, cueId: cue?.id ?? null, error: graphic ? null : 'The card was not added.' };
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
              <p className="hint" data-testid="cue-fill-none">No unused messages in Messages.</p>
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
export function isMessageBodyField(show: Pick<Show, 'graphics'>, graphicId: string, fieldId: string): boolean {
  const g = show.graphics.find((x) => x.id === graphicId);
  return Boolean(g && messageFields(g.template.fields ?? [])?.body === fieldId);
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
  useEffect(
    () => () => {
      if (!intake) return;
      for (const running of intake.sources()) if (running.sourceId) intake.remove(running.id);
      releaseChatRead();
    },
    [intake],
  );
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
  accepting,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  backend: ObservableAudience;
  live: boolean;
  accepting: boolean;
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
  // otherwise the local rehearsal provider. Deliberately not cleared on unmount.
  useEffect(() => {
    const viewer = live && show.joinSlug ? createSupabaseAudience({ joinSlug: show.joinSlug }) : backend;
    const submit: ChatSubmit = (token, author, body) => viewer.submit(token, author, body);
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
                    {runtime.submitted} in · {runtime.dropped} dropped
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
                {s.submitted} in · {s.dropped} dropped
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
      {/* The door refusal made visible: Twitch submits through the viewer door, which refuses while
          the audience is closed, so a connected channel would count every line as dropped. */}
      {!accepting && others.some((s) => s.platform !== 'youtube') && (
        <p className="hint pd-aud-source-hint" data-testid="chat-sources-closed-hint">
          Accepting messages is off - Twitch chat is refused until you turn it on above.
        </p>
      )}
    </div>
  );
}

export default function ProductionAudienceWorkspace({
  show,
  setShows,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
}) {
  // ONE provider per PRODUCTION. The local one is held ABOVE this component (the workspace
  // unmounts on every trip to Playout or Data, and an inbox that emptied itself on a tab
  // switch would be the PROGRAM monitor's round-trip defect wearing different clothes; what it
  // keeps across a reload is in localAudience.ts). The Supabase one holds no state to lose: its whole memory
  // is the database, so a fresh instance per mount reads the same inbox.
  const { live, backend } = useMessagesBackend(show);

  const [rows, setRows] = useState<AudienceSubmission[]>([]);
  const [mode, setMode] = useState<AudienceMode>('question');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'inbox' | 'approved' | 'shortlist' | 'all'>('inbox');
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewHost = useRef<HTMLDivElement | null>(null);
  const preview = useRef<JoinSurfaceHandle | null>(null);

  // ── The VOTE half (Phase 6) ───────────────────────────────────────────────────────────────
  // A round is one question put to the room. The composer below builds it, `openRound` puts it
  // in front of every phone, the tally is counted on read while it is open, and the only way
  // any of it reaches air is the same one a question takes: a CUE the operator takes.
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
  const [round, setRound] = useState<AudienceRound | null>(null);
  const [tally, setTally] = useState<AudienceTally | null>(null);
  const [kind, setKind] = useState<'poll' | 'quiz'>('poll');
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [correct, setCorrect] = useState(0);
  /** Which cue each round is staged onto, so re-staging updates instead of piling rows up. */
  const stagedCue = useRef<Record<string, string>>({});
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
  const canRunLiveFigures = useMemo(
    () => show.graphics.some((g) => pollFieldMap(g.template.fields ?? [])?.live),
    [show.graphics],
  );
  /** What the room was being asked for before a vote took the mode over. */
  const modeBeforeRound = useRef<AudienceMode>('question');

  /**
   * WHAT VIEWERS SEE, rendered by the SAME function the public page renders (the plan's own
   * requirement: preview and reality cannot drift if there is only one renderer). It is
   * READ-ONLY — the two write methods refuse — because an operator's own preview must never be
   * able to put words in the audience's mouth.
   *
   * Live, it reads through the production's JOIN slug, which the studio holds locally: what is
   * shown is then literally what a phone gets, not a reconstruction of it.
   */
  const previewClient = useMemo<JoinSurfaceClient>(() => {
    const viewer = live && show.joinSlug ? createSupabaseAudience({ joinSlug: show.joinSlug }) : backend;
    const refuse = async () => ({ ok: false, error: 'This is your preview — send from a phone to test it.' });
    return {
      load: () => viewer.joinView('preview-operator-device'),
      submit: refuse,
      vote: refuse,
    };
  }, [backend, live, show.joinSlug]);

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
      // One change signal drives both halves of this screen, so the viewer preview can never
      // be showing a door the inbox says is open.
      preview.current?.refresh();
    };
    refresh();
    // The door's own state lives with the production, not in this component: an operator who
    // opened the audience before the interval, then came back through Playout, must not find
    // a toggle claiming it is closed while phones are still sending.
    void backend.getState().then(
      (state) => {
        if (!alive) return;
        setOpen(state.open);
        if (state.mode !== 'waiting') setMode(state.mode);
        // Same reason as the door above: the pointers belong to the PRODUCTION, so an operator
        // who queued a question, went to Playout and came back must not find both slots empty
        // while a presenter's tablet is still showing them.
        applyPresenter(state.presenter);
      },
      () => {},
    );
    const off = backend.onChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  // THE OPEN ROUND, and its counts while it is open. Two intervals rather than one because
  // they answer different questions at different rates (the plan's own numbers): which round is
  // open changes only when the operator says so and rides the provider's change signal, while a
  // tally moves every time a phone is tapped and is polled at ~2 s. Nothing polls once the round
  // is closed - a closed round's counts are final, so asking again could only cost battery.
  useEffect(() => {
    let alive = true;
    const readRound = () =>
      void backend.getState().then(
        (state) => {
          if (alive) setRound(state.round);
        },
        () => {},
      );
    readRound();
    const off = backend.onChange(readRound);
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  useEffect(() => {
    if (!round || round.closedAt) {
      setTally(null);
      return;
    }
    let alive = true;
    const read = () =>
      void backend.tally(round.id).then(
        (t) => {
          if (alive) setTally(t);
        },
        () => {},
      );
    read();
    const timer = setInterval(read, 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [backend, round]);

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

  /** The composer's options, one per line, capped where the schema caps them. */
  const composedOptions = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, AUDIENCE_LIMITS.options);

  /**
   * Put the question in front of every phone. The MODE travels with it for the same reason the
   * door's does: the join page renders a round only in `poll`/`quiz` mode, so opening one
   * without switching would leave every viewer looking at a question nobody could see.
   */
  const openRound = () => {
    if (!question.trim() || composedOptions.length < 2) return;
    backend
      .openRound({
        kind,
        question: question.trim(),
        options: composedOptions,
        correctOption: kind === 'quiz' ? Math.min(correct, composedOptions.length - 1) : null,
      })
      .then(async (opened) => {
        setRound(opened);
        // Remembered so closing can put the room back where it was, rather than leaving every
        // phone on "Cast your vote" with nothing to vote on.
        modeBeforeRound.current = mode;
        setMode(kind);
        await backend.setState({ mode: kind, open: true });
        setOpen(true);
        setNote(`✓ Voting is open on “${opened.question}”. Nothing is on air yet.`);
      })
      .catch((err: Error) => setNote(`Could not open the vote: ${err.message}`));
  };

  /**
   * Stop the vote — and FINALISE the cue it was staged onto, because closing is usually the
   * moment before the reveal. Without this the staged board still read "voting open" beside its
   * final numbers, and there was no way to correct it: staging needs an open round, and by then
   * there isn't one.
   */
  const closeRound = () => {
    if (!round) return;
    const closing = round;
    const back = modeBeforeRound.current;
    backend
      .closeRound(closing.id)
      .then(async () => {
        const final = await backend.tally(closing.id).catch(() => tally);
        const cueId = stagedCue.current[closing.id];
        const cue = cueId ? show.cues?.find((c) => c.id === cueId) : undefined;
        // Said only once the durable write has landed (components/never-report-save-storage-layer-has).
        let failure: string | null = null;
        if (cue && final) {
          const target = show.graphics.find((g) => g.id === cue.sourceId);
          const map = target ? pollFieldMap(target.template.fields ?? []) : null;
          if (map) {
            setShows(
              updateShowCue(show.id, cue.id, {
                values: tallyValues(closing, final, map, true, liveFigures),
              }),
            );
            failure = await commitDurableWrites();
          }
        }
        setRound(null);
        // The room goes back to what it was asked for before the vote. Leaving it in poll mode
        // would show every phone the vote heading over an empty card, because the join surface
        // draws a round only while there IS one.
        setMode(back);
        await backend.setState({ mode: back });
        setNote(
          failure
            ? `Voting is closed, but the staged cue was not updated with the final counts: ${failure}`
            : cue
              ? 'Voting is closed. The staged cue now carries the final counts — Take it when you want them on air.'
              : 'Voting is closed. Nothing was staged, so nothing changed on the rundown.',
        );
      })
      .catch((err: Error) => setNote(`Could not close the vote: ${err.message}`));
  };

  /**
   * THE VOTE'S ONE EXIT, and it is the same shape as a question's: counts become an ordinary
   * cue's field VALUES, and an operator takes it. The renderer never learns votes exist — a
   * poll board is a graphic that draws whatever numbers are in its fields, exactly as it does
   * for a hand-typed rehearsal, so nothing about it has to change for a live vote.
   *
   * Re-staging while the round is open UPDATES the same cue rather than adding another, so a
   * rundown does not fill with a row per refresh; the operator re-takes to move the numbers on
   * air. Which one gets updated is remembered per round.
   *
   * The ✓ is said only once the durable write has landed, and a refused one is said instead
   * (components/never-report-save-storage-layer-has).
   */
  const stageTally = async () => {
    if (!round || !tally) return;
    const target = show.graphics.find((g) => pollFieldMap(g.template.fields ?? []) !== null) ?? show.graphics[0];
    if (!target) {
      setNote('This production has no graphics yet — add a vote board, then stage the counts to it.');
      return;
    }
    const map = pollFieldMap(target.template.fields ?? []);
    if (!map) {
      setNote(`“${target.name}” has no question/options fields to put a vote in — add a vote board to this production.`);
      return;
    }
    const values = tallyValues(round, tally, map, false, liveFigures);
    const existing = stagedCue.current[round.id];
    const cue = existing ? show.cues?.find((c) => c.id === existing) : undefined;
    if (cue) {
      setShows(updateShowCue(show.id, cue.id, { values }));
      const failure = await commitDurableWrites();
      setNote(
        failure
          ? `The cue for “${target.name}” was not updated: ${failure}`
          : `✓ Updated the cue for “${target.name}” with ${tally.total} ${tally.total === 1 ? 'vote' : 'votes'}. Take it to move the numbers on air.`,
      );
      return;
    }
    const made = addShowCue(show.id, target.id, { label: `Vote — ${round.question.slice(0, 32)}`, values });
    setShows(made.shows);
    // Remembered at once, so a second press while this write settles updates the same cue, and
    // forgotten if the write is refused: there is then no cue to update.
    if (made.cueId) stagedCue.current[round.id] = made.cueId;
    const failure = await commitDurableWrites();
    if (failure) {
      if (made.cueId && stagedCue.current[round.id] === made.cueId) delete stagedCue.current[round.id];
      setNote(`No cue was added to the rundown for “${target.name}”: ${failure}`);
      return;
    }
    setNote(`✓ Added a cue to the rundown for “${target.name}”. It airs when you Take it — nothing has gone out.`);
  };

  const shown = useMemo(() => {
    const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (filter === 'inbox') return ordered.filter((r) => r.status === 'new');
    if (filter === 'approved') return ordered.filter((r) => r.status === 'approved' && !r.usedAt);
    if (filter === 'shortlist') return ordered.filter((r) => r.shortlisted);
    return ordered;
  }, [rows, filter]);

  const counts = {
    inbox: rows.filter((r) => r.status === 'new').length,
    approved: rows.filter((r) => r.status === 'approved' && !r.usedAt).length,
    shortlist: rows.filter((r) => r.shortlisted).length,
    all: rows.length,
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
  /** A paste is being added: on a published production that is a server call, and a second
   *  press meanwhile would add the message twice. */
  const [pasting, setPasting] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  /** Paste: the message joins the inbox as a candidate, like any other, and airs only as a cue. */
  const addPasted = () => {
    if (!pasteBody.trim() || pasting) return;
    setPasting(true);
    backend
      .addCandidates([{ author: pasteName, body: pasteBody, source: 'Pasted' }])
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
    on: { graphicId?: string; card?: string; again?: boolean } = {},
  ) => {
    if (preparing) return;
    let graphicId = on.graphicId ?? target?.graphicId ?? null;
    if (!graphicId && !on.card) {
      setChoosing(row.id);
      return;
    }
    setPreparing(row.id);
    try {
      let base = show;
      let cueId: string | undefined;
      if (on.card) {
        const made = await addMessageCard(show, on.card);
        if (made.shows) setShows(made.shows);
        if (made.error || !made.graphicId || !made.shows) {
          setNote(`${on.card} was not added: ${made.error}`);
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

  /** Where messages go, as the row's first Prepare asks it: the compatible graphics, or the cards. */
  const destinationChoice = (row: AudienceSubmission) => (
    <div className="pd-aud-choose" data-testid="audience-choose">
      {destinations.length > 0 ? (
        <>
          <span className="hint">Prepare on:</span>
          {destinations.map((d) => (
            <button key={d.graphicId} disabled={!!preparing} onClick={() => void prepare(row, { graphicId: d.graphicId })} data-testid="audience-choose-graphic">
              {d.name}
            </button>
          ))}
        </>
      ) : (
        <>
          <span className="hint" data-testid="audience-no-destination">
            No graphic here can show a message. Add a card for it:
          </span>
          {MESSAGE_CARDS.map((card) => (
            <button key={card} disabled={!!preparing} onClick={() => void prepare(row, { card })} data-testid="audience-choose-card">
              {card}
            </button>
          ))}
        </>
      )}
      <button onClick={() => setChoosing(null)} data-testid="audience-choose-cancel">
        Cancel
      </button>
    </div>
  );

  return (
    <section className="pd-audience" data-testid="production-audience">
      <div className="pd-data-head">
        <h2>Messages</h2>
        <p className="hint">
          Nothing here goes on air by itself. Prepare a message as a cue, then Take it.
        </p>
      </div>

      {/* PASTE: the route every operator already has. Body required, name optional; no audience
          link, publish or account needed. It joins the inbox below like any arrival. */}
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
            Add to messages
          </button>
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

      <div className="pd-aud-bar">
        <label className="pd-aud-open">
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => {
              const next = e.target.checked;
              setOpen(next);
              // The MODE travels with the door. The dropdown shows a choice from the moment
              // this screen opens, but the production's own state starts at `waiting` — so
              // opening without sending it left the viewer page saying "standing by" beside
              // an operator screen that said "Questions".
              //
              // The door is also the one control here with a real consequence for people
              // outside the room, so a refusal is reported and the switch springs back rather
              // than leaving an operator believing they had opened it.
              backend.setState({ open: next, mode }).catch((err: Error) => {
                setOpen(!next);
                setNote(`Could not ${next ? 'open' : 'close'} the audience: ${err.message}`);
              });
            }}
            data-testid="audience-open"
          />
          Accepting messages
        </label>
        {/* An open VOTE owns the mode, so the control says so instead of claiming the room is
            being asked for questions while every phone shows a ballot. A select whose value is
            not among its options renders as its first one, which is how this read "Questions"
            over an open poll - the option has to exist for the control to be honest. */}
        <select
          value={mode}
          disabled={!!round}
          title={round ? 'A vote is open — close it to ask for questions again.' : undefined}
          onChange={(e) => {
            const next = e.target.value as AudienceMode;
            setMode(next);
            backend.setState({ mode: next }).catch((err: Error) => setNote(`Could not switch: ${err.message}`));
          }}
          data-testid="audience-mode"
        >
          <option value="question">Questions</option>
          <option value="comment">Comments</option>
          {round && <option value={round.kind}>{round.kind === 'quiz' ? 'Quiz — voting' : 'Poll — voting'}</option>}
        </select>
        <div className="spacer" />
        {/* REHEARSAL, and only where it means something. The local provider can invent
            arrivals — which is exactly what an operator wants before a show, and what lets the
            offline suite drive the whole workflow; the simulated rows say "(rehearsal)" in
            their own text, so they can never be mistaken for real material. A LIVE production
            has a real audience instead, so the button is absent rather than disabled: there is
            nothing to enable. */}
        {backend.simulate ? (
          <button onClick={() => backend.simulate?.(3)} data-testid="audience-simulate">
            ⟳ Simulate 3 arrivals
          </button>
        ) : (
          <span className="hint" data-testid="audience-live">
            Live — viewers send from the audience link (Links ▸ Audience link).
          </span>
        )}
      </div>

      <MessageSources show={show} setShows={setShows} backend={backend} live={live} accepting={open} />


      {/* THE VOTE. One question at a time, because that is what a room can answer: opening a
          round closes any previous one server-side, so the panel is either composing or
          running and never both. The counts are shown here and NOWHERE ELSE the audience can
          reach - the join page never shows a tally, in v1 or after, because the reveal is a
          graphic, on air, at the operator's moment. */}
      <div className="pd-aud-round" data-testid="audience-round">
        {!round ? (
          <>
            <div className="pd-aud-round-head">
              <h3>Put a question to the room</h3>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'poll' | 'quiz')}
                data-testid="audience-round-kind"
              >
                <option value="poll">Poll — no right answer</option>
                <option value="quiz">Quiz — one right answer</option>
              </select>
            </div>
            <input
              type="text"
              value={question}
              maxLength={AUDIENCE_LIMITS.body}
              placeholder="What should we play next?"
              onChange={(e) => setQuestion(e.target.value)}
              data-testid="audience-round-question"
            />
            <textarea
              value={optionsText}
              rows={4}
              placeholder={'One option per line\nAt least two, at most eight'}
              onChange={(e) => setOptionsText(e.target.value)}
              data-testid="audience-round-options"
            />
            {kind === 'quiz' && composedOptions.length > 1 && (
              <label className="pd-aud-correct">
                Right answer
                <select
                  value={Math.min(correct, composedOptions.length - 1)}
                  onChange={(e) => setCorrect(Number(e.target.value))}
                  data-testid="audience-round-correct"
                >
                  {composedOptions.map((o, i) => (
                    <option key={o + String(i)} value={i}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="pd-aud-round-actions">
              <button
                className="primary"
                disabled={!question.trim() || composedOptions.length < 2}
                onClick={openRound}
                data-testid="audience-round-open"
              >
                Open voting
              </button>
              <span className="hint">
                {composedOptions.length < 2
                  ? 'Two options at least — a vote with one answer is not a vote.'
                  : `${composedOptions.length} options. Opening it switches every phone to this question.`}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="pd-aud-round-head">
              <h3 data-testid="audience-round-live">{round.question}</h3>
              <span className="hint">{round.kind === 'quiz' ? 'Quiz' : 'Poll'} · voting open</span>
            </div>
            <ul className="pd-aud-tally" data-testid="audience-tally">
              {round.options.map((option, i) => {
                const count = tally?.counts[i] ?? 0;
                const share = tally && tally.total > 0 ? Math.round((count / tally.total) * 100) : 0;
                return (
                  <li key={option + String(i)}>
                    {/* The full option on hover: a long one ellipsizes to keep the bars in a
                        column, and an operator still has to be able to tell which is which. */}
                    <span className="pd-aud-tally-label" title={option}>
                      {option}
                      {round.correctOption === i && <span className="pd-aud-correct-mark"> ✓</span>}
                    </span>
                    {/* The bar is a picture of the same number beside it, never instead of it:
                        an operator reads the count and glances at the shape. */}
                    <span className="pd-aud-tally-bar" aria-hidden="true">
                      <span style={{ width: `${share}%` }} />
                    </span>
                    <span className="pd-aud-tally-count" data-testid={`audience-tally-${i}`}>
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="pd-aud-round-actions">
              <button className="primary" onClick={() => void stageTally()} data-testid="audience-round-stage">
                Stage counts to a graphic
              </button>
              <button onClick={closeRound} data-testid="audience-round-close">
                Close voting
              </button>
              {/* Rehearsal votes, on the same terms as simulated arrivals: only where
                  simulating means anything, and never on a production with a real room. */}
              {backend.simulateVotes && (
                <button
                  onClick={() =>
                    backend.simulateVotes?.(round.options.map((_, i) => (i === 0 ? 2 : 1)))
                  }
                  data-testid="audience-simulate-votes"
                >
                  ⟳ Simulate votes
                </button>
              )}
              <span className="hint">
                {tally?.total ?? 0} {(tally?.total ?? 0) === 1 ? 'vote' : 'votes'} so far. Staging
                writes a cue — nothing is on air until you Take it.
              </span>
            </div>
          </>
        )}
        {/* HOW THIS PRODUCTION SHOWS ITS NUMBERS, and it is one line because it is one decision
            (owner ruling, 2026-08-30): *"Usually people will use it just to show the results, so
            the poll does not have to automatically update. However, we should give that
            possibility to those who want it."*

            OFF is the shipped answer and the default here. It sits OUTSIDE the composing/running
            branches deliberately: it is a property of the SHOW, not of a round, so it reads the
            same whether the operator is writing the next question or watching this one, and
            ticking it mid-round is an ordinary field change on the next stage rather than
            anything the vote has to be interrupted for. */}
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
      </div>

      {/* THE VIEWER'S VIEW. Same renderer as the public page, read-only, folded away by
          default: an operator wants it when setting up and never during a show. */}
      <details
        className="pd-aud-preview"
        open={previewOpen}
        onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)}
        data-testid="audience-preview-details"
      >
        <summary>What viewers see</summary>
        {/* The mount host is a CHILD of the frame, never the frame itself: mounting adds the
            join page's own `.nj` class, whose max-width and auto margins would otherwise beat
            the frame's and float the preview into the middle of the workspace. */}
        <div className="pd-aud-preview-frame">
          <div ref={previewHost} data-testid="audience-preview" />
        </div>
      </details>

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

      {note && (
        <p className={note.startsWith('✓') ? 'status-ok pd-data-note' : 'status-bad pd-data-note'} data-testid="audience-note">
          {note}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="hint pd-data-empty" data-testid="audience-empty">
          {open
            ? 'Nothing waiting. Messages appear here as they arrive.'
            : backend.simulate
              ? 'Nothing here yet. Paste a message above, or simulate a few to rehearse.'
              : 'Nothing here yet. Paste a message above, or turn on Accepting messages and share the audience link.'}
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
