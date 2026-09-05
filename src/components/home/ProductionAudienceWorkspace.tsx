import { useEffect, useMemo, useRef, useState } from 'react';
import { addShowCue, setShowPollLiveFigures, updateShowCue, type Show } from '../../model/shows';
import {
  AUDIENCE_LIMITS,
  broadcastValues,
  type AudienceBackend,
  type AudienceMode,
  type AudienceRound,
  type AudienceSubmission,
  type AudienceTally,
  type PresenterPointers,
  type ObservableAudience,
} from '../../audience/audienceTypes';
import { localAudienceFor } from '../../audience/localAudience';
import {
  mountJoinSurface,
  type JoinSurfaceClient,
  type JoinSurfaceHandle,
} from '../../audience/joinSurface';
import { createSupabaseAudience } from '../../audience/audienceData';
import {
  chatIntakeFor,
  chatPlatformWord,
  type ChatSourceState,
  type ChatSubmit,
} from '../../audience/chatIntake';
import { normalizeTwitchChannel } from '../../audience/twitchChat';
import { normalizeYouTubeVideoId } from '../../audience/youtubeChat';
import { isBackendConfigured } from '../../backend/config';
import {
  POLL_LIVE_ON,
  POLL_LIVE_TITLE,
  POLL_STATUS_CLOSED,
  POLL_STATUS_OPEN,
  POLL_STATUS_TITLE,
} from '../../templates/behaviours/vote';
import type { SpxField } from '../../model/types';

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
function pollFieldMap(
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
  const byTitle = (...wanted: string[]): string | null => {
    let found: string | null = null;
    for (const f of fields) {
      const title = (f.title ?? '').trim().toLowerCase();
      if (wanted.some((w) => title === w)) found = f.field;
    }
    return found;
  };
  const question = byTitle('question', 'poll question', 'prompt');
  const options = byTitle('options', 'answers', 'choices');
  if (!question || !options) return null;
  return {
    question,
    options,
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

export default function ProductionAudienceWorkspace({
  show,
  setShows,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
}) {
  // ONE provider per PRODUCTION. The local one is held ABOVE this component (the workspace
  // unmounts on every trip to Playout or Data, and an inbox that emptied itself on a tab
  // switch would be the PROGRAM monitor's round-trip defect wearing different clothes; nothing
  // durable — see localAudience.ts). The Supabase one holds no state to lose: its whole memory
  // is the database, so a fresh instance per mount reads the same inbox.
  const live = Boolean(show.hostedSlug) && isBackendConfigured();
  const backend = useMemo<ObservableAudience>(
    () =>
      live && show.hostedSlug
        ? createSupabaseAudience({ controlSlug: show.hostedSlug })
        : localAudienceFor(show.id, show.name),
    [live, show.hostedSlug, show.id, show.name],
  );

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

  // ── CHAT SOURCES (src/audience/chatIntake.ts) ─────────────────────────────────────────────
  // Twitch / YouTube live chat as a PRODUCER of submissions: every accepted line goes in
  // through the same viewer-half `submit` a phone uses - the synthesized per-author device
  // token is what makes the per-device caps meter per chat user - so moderation, approval and
  // the rundown exit above need to know nothing about platforms. The intake lives in a
  // per-production registry (the localAudienceFor pattern): a Twitch socket must survive the
  // operator's trip to Playout, or the feature dies on every tab switch.
  const intake = useMemo(() => chatIntakeFor(show.id), [show.id]);
  const [chatSources, setChatSources] = useState<ChatSourceState[]>(() => intake.sources());
  const [chatPlatform, setChatPlatform] = useState<'twitch' | 'youtube'>('twitch');
  const [chatChannel, setChatChannel] = useState('');
  const [chatVideo, setChatVideo] = useState('');
  const [chatKey, setChatKey] = useState('');
  const [chatNote, setChatNote] = useState<string | null>(null);

  // The intake writes through whichever door is CURRENT: a published production's real join
  // slug, otherwise the local rehearsal provider. Deliberately not cleared on unmount - the
  // sources keep collecting while the operator is on Playout, exactly like the inbox keeps
  // its rows.
  useEffect(() => {
    const viewer = live && show.joinSlug ? createSupabaseAudience({ joinSlug: show.joinSlug }) : backend;
    const submit: ChatSubmit = (token, author, body) => viewer.submit(token, author, body);
    intake.setSubmit(submit);
  }, [intake, backend, live, show.joinSlug]);

  useEffect(() => {
    const refresh = () => setChatSources(intake.sources());
    refresh();
    return intake.onChange(refresh);
  }, [intake]);

  const addChatSource = () => {
    if (chatPlatform === 'twitch') {
      const channel = normalizeTwitchChannel(chatChannel);
      if (!channel) return setChatNote('Not a Twitch channel name - the name or the channel URL both work.');
      intake.add({ platform: 'twitch', channel });
      setChatChannel('');
    } else {
      const videoId = normalizeYouTubeVideoId(chatVideo);
      if (!videoId) return setChatNote('Not a YouTube video id or URL.');
      if (!chatKey.trim()) return setChatNote('Paste a YouTube Data API key - YouTube has no anonymous chat read.');
      intake.add({ platform: 'youtube', videoId, apiKey: chatKey.trim() });
      setChatVideo('');
    }
    setChatNote(null);
  };

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
        if (cue && final) {
          const target = show.graphics.find((g) => g.id === cue.sourceId);
          const map = target ? pollFieldMap(target.template.fields ?? []) : null;
          if (map)
            setShows(
              updateShowCue(show.id, cue.id, {
                values: tallyValues(closing, final, map, true, liveFigures),
              }),
            );
        }
        setRound(null);
        // The room goes back to what it was asked for before the vote. Leaving it in poll mode
        // would show every phone the vote heading over an empty card, because the join surface
        // draws a round only while there IS one.
        setMode(back);
        await backend.setState({ mode: back });
        setNote(
          cue
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
   */
  const stageTally = () => {
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
      setNote(`✓ Updated the cue for “${target.name}” with ${tally.total} ${tally.total === 1 ? 'vote' : 'votes'}. Take it to move the numbers on air.`);
      return;
    }
    const made = addShowCue(show.id, target.id, { label: `Vote — ${round.question.slice(0, 32)}`, values });
    setShows(made.shows);
    if (made.cueId) stagedCue.current[round.id] = made.cueId;
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

  /**
   * THE ONE EXIT: a submission becomes an ordinary cue at the end of the rundown.
   *
   * The values are matched to the target graphic's fields BY TITLE, the same by-the-words
   * binding a dataset row uses — an audience card titles its fields "Message" and "Name", so a
   * question lands in the right slots with no mapping UI and no per-template special case. A
   * graphic that carries neither still gets a cue, with the text in its first text field, which
   * is honest: the operator can see where it went.
   */
  const sendToRundown = (row: AudienceSubmission) => {
    const titled = (fields: SpxField[], ...wanted: string[]): string | null => {
      for (const f of fields) {
        const title = (f.title ?? '').trim().toLowerCase();
        if (wanted.some((w) => title === w)) return f.field;
      }
      return null;
    };
    const BODY_TITLES = ['message', 'question', 'comment', 'body', 'text'] as const;
    // THE POOL IS SEARCHED, not indexed, AND THE TITLES RANK IT. `graphics[0]` is the
    // BACKMOST LAYER, which has nothing to do with where a viewer's words belong: a
    // production carrying the news kit put every approved question into its TICKER, because
    // the ticker happens to be the bottom of the stack, while the chat-highlight card built
    // for exactly this sat unused two layers up. `stageTally` right above already searches
    // the pool for a graphic whose fields fit; this is the same move over the same
    // by-the-words titles.
    //
    // A VOTE BOARD IS NOT WHERE A MESSAGE GOES, even though it answers to the same word. The
    // audience cards title their body "Question" or "Comment", and a live-vote board titles
    // ITS question "Question" too - so a plain title search hands every viewer message to the
    // vote board whenever one was added to the production first. `pollFieldMap` is this
    // module's own definition of "this graphic is a vote board" (stageTally aims AT it with
    // the same function), so the message search steps around exactly that shape and needs no
    // per-template knowledge of its own. A vote board still beats the blind index if it is
    // the only thing in the pool that can hold text at all.
    const messageTarget = (pool: typeof show.graphics) =>
      pool.find((g) => titled(g.template.fields ?? [], ...BODY_TITLES) !== null);
    const target =
      messageTarget(show.graphics.filter((g) => pollFieldMap(g.template.fields ?? []) === null)) ??
      messageTarget(show.graphics) ??
      show.graphics[0];
    if (!target) {
      setNote('This production has no graphics yet — add one, then send a question to it.');
      return;
    }
    const { author, body } = broadcastValues(row);
    const fields = target.template.fields ?? [];
    const byTitle = (...wanted: string[]): string | null => titled(fields, ...wanted);
    const bodyField = byTitle(...BODY_TITLES) ?? fields.find((f) => f.ftype === 'textfield' || f.ftype === 'textarea')?.field ?? null;
    // 'handle' and 'asked by' are the audience category's own attribution titles (the chat
    // highlight and the viewer question) - without them a chat line reached those cards with
    // its author dropped on the floor.
    const authorField = byTitle('name', 'author', 'from', 'sender', 'handle', 'asked by');
    const values: Record<string, string> = {};
    if (bodyField) values[bodyField] = body;
    if (authorField) values[authorField] = author;
    if (!bodyField) {
      setNote(`“${target.name}” has no text field to put a message in — pick a graphic that does.`);
      return;
    }
    const label = body.length > 40 ? `${body.slice(0, 40)}…` : body;
    setShows(addShowCue(show.id, target.id, { label, values }).shows);
    patch(row.id, { status: 'approved', usedAt: new Date().toISOString() });
    setNote(`✓ Added a cue to the rundown for “${target.name}”. It airs when you Take it — nothing has gone out.`);
  };

  return (
    <section className="pd-audience" data-testid="production-audience">
      <div className="pd-data-head">
        <h2>Audience</h2>
        <p className="hint">
          What viewers sent in. Nothing here goes on air by itself: you edit a broadcast version,
          approve it, and send it to the rundown as a normal cue.
        </p>
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

      {/* CHAT SOURCES. Live chat pulled into the SAME inbox: a source is a producer of
          submissions and nothing more - what arrives here is moderated, approved and sent to
          the rundown exactly like a phone's question, and the platform is TEXT on the author
          line, never a logo (the audience category's own rule). Compact on purpose: this is
          intake plumbing, and the inbox below is the show. */}
      <div className="pd-aud-sources" data-testid="chat-sources">
        <div className="pd-aud-sources-head">
          <h3>Chat sources</h3>
          <span className="hint">
            Twitch or YouTube chat lands in this inbox as ordinary submissions - nothing airs
            without you.
          </span>
        </div>
        {chatSources.length > 0 && (
          <ul className="pd-aud-source-list">
            {chatSources.map((s) => (
              <li key={s.id} className="pd-aud-source" data-testid={`chat-source-${s.platform}`}>
                {/* The dot is the LIVE indicator; its title says the same thing in words. */}
                <span
                  className={`pd-aud-source-dot ${s.paused ? 'paused' : s.status}`}
                  title={s.paused ? 'Paused' : s.status}
                  aria-hidden="true"
                />
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
          <select
            value={chatPlatform}
            onChange={(e) => setChatPlatform(e.target.value as 'twitch' | 'youtube')}
            aria-label="Chat platform"
            data-testid="chat-add-platform"
          >
            <option value="twitch">Twitch channel</option>
            <option value="youtube">YouTube live</option>
          </select>
          {chatPlatform === 'twitch' ? (
            <input
              type="text"
              value={chatChannel}
              placeholder="Channel name or twitch.tv URL"
              onChange={(e) => setChatChannel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChatSource()}
              data-testid="chat-add-channel"
            />
          ) : (
            <>
              <input
                type="text"
                value={chatVideo}
                placeholder="Video URL or id"
                onChange={(e) => setChatVideo(e.target.value)}
                data-testid="chat-add-video"
              />
              <input
                type="password"
                value={chatKey}
                placeholder="YouTube Data API key"
                onChange={(e) => setChatKey(e.target.value)}
                data-testid="chat-add-key"
              />
            </>
          )}
          <button onClick={addChatSource} data-testid="chat-add-connect">
            Connect
          </button>
        </div>
        {chatNote && (
          <p className="status-bad pd-data-note" data-testid="chat-add-note">
            {chatNote}
          </p>
        )}
        {chatPlatform === 'youtube' && (
          <p className="hint pd-aud-source-hint">
            Reading YouTube chat needs your own API key and spends its quota: about 3,600 units
            an hour of polling, so the free daily 10,000 covers roughly 2½ hours of continuous
            chat. Pause the source to stop the spend.
          </p>
        )}
        {/* The door refusal made visible: submit refuses while the audience is closed, so a
            connected source with the door shut would count every line as dropped and an
            operator would read that as a broken connector. */}
        {!open && chatSources.length > 0 && (
          <p className="hint pd-aud-source-hint" data-testid="chat-sources-closed-hint">
            Accepting messages is off - chat is refused until you turn it on above.
          </p>
        )}
      </div>

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
              <button className="primary" onClick={stageTally} data-testid="audience-round-stage">
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
              ? 'Not accepting messages yet — turn it on above, or simulate a few to rehearse.'
              : 'Not accepting messages yet — turn it on above, then share the audience link.'}
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
                  {row.usedAt && <span className="pd-aud-used" data-testid="audience-used">on air already</span>}
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
                  <button
                    className={row.shortlisted ? 'active' : ''}
                    onClick={() => patch(row.id, { shortlisted: !row.shortlisted })}
                    title="Keep it back for later — not the same as approving it"
                    data-testid="audience-shortlist"
                  >
                    ★ Shortlist
                  </button>
                  <button onClick={() => patch(row.id, { status: 'approved' })} data-testid="audience-approve">
                    ✓ Approve
                  </button>
                  <button onClick={() => patch(row.id, { status: 'rejected' })} data-testid="audience-reject">
                    ✕ Reject
                  </button>
                  {/* THE PRESENTER'S AUTOCUE. Pointing at a question tells a person what to
                      say; it airs nothing, which is why it sits beside Approve rather than
                      next to "Send to rundown". Each is a TOGGLE, so the same press clears it -
                      an autocue you cannot empty is worse than none. */}
                  <button
                    className={presenter.current === row.id ? 'active' : ''}
                    onClick={() => pointPresenter('current', row.id)}
                    title="Show this to the presenter as what they are on now"
                    data-testid="audience-presenter-now"
                  >
                    🎤 Now
                  </button>
                  <button
                    className={presenter.next === row.id ? 'active' : ''}
                    onClick={() => pointPresenter('next', row.id)}
                    title="Show this to the presenter as what comes next"
                    data-testid="audience-presenter-next"
                  >
                    ⇢ Next
                  </button>
                  <div className="spacer" />
                  <button className="primary" onClick={() => sendToRundown(row)} data-testid="audience-send">
                    → Send to rundown
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
