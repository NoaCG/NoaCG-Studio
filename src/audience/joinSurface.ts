// THE JOIN SURFACE — what a viewer actually sees, rendered by ONE function.
//
// It is deliberately framework-free (no React, no store, no app CSS) for two reasons:
//   * `/join` is its own MPA entry, following the `/output` pattern — a page a phone on a school
//     wifi loads once, so it ships the smallest thing that can do the job;
//   * the SAME renderer backs the operator's rehearsal preview inside the studio, so what an
//     operator practises against and what the room sees cannot drift apart. A second
//     React-shaped copy would have drifted the first time either changed.
//
// It knows nothing about Supabase. It is handed a tiny client (load / submit / vote), which is
// what lets the local rehearsal provider drive it with no backend at all.
//
// WHAT IT MAY SHOW is the capability discipline made visible: the production's name, the
// operator's prompt, the open round's question and options, and THIS device's own submissions.
// Never a tally (the reveal is a graphic, on air, at the operator's moment), never the answer
// key, never anybody else's words.

import { bundledFaceRules, FONTS } from '../model/fonts';
import { css, joinColours, type Rgb } from './joinColours';
import { pageWords } from '../model/joinPage.ts';
import { cleanWord, WORD_MAX } from '../model/wordCloud.ts';
import { AUDIENCE_LIMITS, JOIN_PAGE_LIMITS, JOIN_WAITING_DEFAULT, WORD_REFUSED, type AudienceBrand, type JoinView, type RoundTarget, type SubmitResult } from './audienceTypes';

export interface JoinSurfaceClient {
  load(): Promise<JoinView>;
  /** An answer to the live Open question this page READ (interaction spec R6). */
  submit(author: string, body: string, target: RoundTarget): Promise<SubmitResult>;
  vote(roundId: string, option: number, revision: number): Promise<SubmitResult>;
}

export interface JoinSurfaceOptions {
  /** How often to re-read, in ms. A jitter of up to 20% is added so a room full of phones that
   *  all loaded at the interval bell does not arrive in one spike. */
  pollMs?: number;
  /** Rehearsal: the studio's preview mounts with polling off and refreshes by hand. */
  poll?: boolean;
}

export interface JoinSurfaceHandle {
  /** Re-read and re-render now (after a local write, or from a rehearsal surface). */
  refresh(): void;
  destroy(): void;
}

const STYLE_ID = 'noacg-join-style';

/** The page's own look, in the studio's control-room vocabulary. A production's published brand
 *  overrides the three colours and the face; everything structural stays put, because a viewer
 *  on a 5-inch screen needs the layout to be the same one every time. */
const CSS = `
.nj { --nj-accent:#ffb84d; --nj-text:#f4f4f5; --nj-muted:#a3a3a6; --nj-panel:#141417; --nj-card-text:#f4f4f5;
  --nj-card-muted:#a6a6a8; --nj-edge:#77777b; --nj-on-accent:#151006; --nj-accent-line:#ffb84d; --nj-accent-text:#ffb84d;
  --nj-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height:100%; box-sizing:border-box; margin:0 auto; max-width:560px;
  /* viewport-fit=cover means the page runs under the notch and the home indicator, so the
     padding has to know about both — a Send button behind the indicator is unpressable. */
  padding:calc(20px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
          calc(40px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
  color:var(--nj-text); font-family:var(--nj-font); overflow-wrap:anywhere; }
.nj * { box-sizing:border-box; }
/* Every colour below is a variable that joinColours.ts has made readable for the production's
   look (WCAG AA): muted text is a blended colour, never opacity, so it cannot dim below the line. */
.nj-logo { display:block; height:56px; width:auto; max-width:60%; object-fit:contain; margin:0 0 12px; }
.nj-title { margin:0 0 4px; font-size:15px; letter-spacing:.14em; text-transform:uppercase; color:var(--nj-muted); }
.nj-prompt { margin:0 0 20px; font-size:23px; line-height:1.3; font-weight:600; }
/* The border does the work, not the fill: a production's published panel colour is often within
   a few percent of the page behind it (the studio's own is rgba(10,12,16,.86) on #0b0b0d), and a
   card that reads as a card only for SOME brands is not a card. */
.nj-card { background:var(--nj-panel); color:var(--nj-card-text); border:1px solid var(--nj-edge); border-radius:14px;
  padding:16px; margin-bottom:14px; }
/* margin, not margin-bottom: the presenter view uses this class on a <p>, which would otherwise
   keep the browser's 1em top margin and sit lower in its card than the same label does here. */
.nj-label { display:block; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--nj-card-muted); margin:0 0 6px; }
/* 44px minimum on everything a thumb aims at, inputs included — the iOS/Android floor, and the
   reason the padding is not simply "looks about right". */
.nj input[type=text], .nj textarea { width:100%; min-height:44px; background:transparent; color:inherit; font:inherit;
  font-size:16px; border:1px solid var(--nj-edge); border-radius:10px; padding:11px 12px; }
.nj input::placeholder, .nj textarea::placeholder { color:var(--nj-card-muted); opacity:1; }
/* No resize grabber: it is a desktop affordance that lands as a stray mark over the corner of a
   phone-sized box, and a phone scrolls the field instead. */
.nj textarea { min-height:112px; resize:none; }
.nj input[type=text]:focus, .nj textarea:focus { outline:2px solid var(--nj-accent-line); outline-offset:1px; border-color:transparent; }
.nj-field + .nj-field { margin-top:14px; }
/* A Word question's word, once sent: big, because it is the whole answer. */
.nj-word { margin:0; font-size:28px; line-height:1.2; font-weight:700; overflow-wrap:anywhere; }
.nj-count { text-align:right; font-size:12px; color:var(--nj-card-muted); margin:6px 0 0; }
.nj-count:empty { display:none; }
.nj-count.over { color:var(--nj-card-text); font-weight:700; }
.nj-send { width:100%; min-height:52px; margin-top:14px; padding:14px; font:inherit; font-weight:700; font-size:16px;
  color:var(--nj-on-accent); background:var(--nj-accent); border:2px solid var(--nj-accent-line); border-radius:10px; cursor:pointer; }
/* A disabled send is its own look, not the accent at 45%: a washed-out slab reads as a broken
   button rather than as one waiting for something to be typed. */
.nj-send[disabled] { background:transparent; color:var(--nj-card-muted); border-color:var(--nj-edge); cursor:default; }
.nj-opts { display:grid; gap:10px; }
.nj-opt { display:flex; align-items:center; gap:12px; width:100%; min-height:52px; text-align:left; font:inherit; font-size:16px;
  color:inherit; background:transparent; border:1px solid var(--nj-edge);
  border-radius:10px; padding:14px; cursor:pointer; }
.nj-opt[aria-pressed=true] { border-color:var(--nj-accent-line); box-shadow:inset 0 0 0 1px var(--nj-accent-line); }
.nj-opt .nj-key { flex:0 0 26px; height:26px; display:grid; place-items:center; border-radius:7px;
  border:1px solid var(--nj-edge); font-size:13px; font-weight:700; }
.nj-opt[aria-pressed=true] .nj-key { background:var(--nj-accent); color:var(--nj-on-accent); border-color:var(--nj-accent-line); }
.nj-note { margin:10px 0 0; font-size:14px; line-height:1.45; }
.nj-card .nj-note { color:var(--nj-card-muted); }
.nj-note.bad { color:var(--nj-accent-text); }
.nj-mine { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.nj-mine li { font-size:14px; line-height:1.45; color:var(--nj-card-muted); border-left:2px solid var(--nj-accent-line); padding-left:10px; }
.nj-waiting { text-align:center; padding:26px 10px; color:var(--nj-muted); font-size:16px; line-height:1.5; }
`;

/**
 * The bundled faces, declared so a production's published typeface actually ARRIVES.
 *
 * `audienceBrandFor` sends a family NAME (`"Saira", Arial, sans-serif`); without a matching
 * `@font-face` the phone has nothing to load it from, so every brand set in a bundled face fell
 * back silently while its colours applied — the one part of a look a viewer could not see.
 *
 * All of them, unconditionally: an `@font-face` is a DECLARATION, so the browser fetches only
 * the family something on the page actually asks for. Declaring just the branded one would mean
 * rebuilding the stylesheet whenever a production's look changed, and `ensureJoinStyle` is
 * deliberately write-once.
 *
 * The URL is ABSOLUTE. The template exports use a relative `fonts/<file>` because they ship the
 * files beside themselves; this page is served from the app's own origin, and `/join/<name>`
 * would resolve a relative path to `/join/fonts/<file>`. `/fonts` serves them with CORS, so the
 * operator's rehearsal preview inside the studio gets the same faces from the same place. Each
 * face is the templates' own pair of rules (latin, then latin-ext for Š and Ž).
 */
const FONT_FACE_CSS = FONTS.map((font) => bundledFaceRules(font.family, font).replace(/url\("fonts\//g, 'url("/fonts/')).join('\n');

/**
 * Put the join look on a document. Exported because the join ENTRY renders two things this
 * function does not — the presenter view and the "nothing to show" message — and both were
 * shipping unstyled: `nj-*` class names against a stylesheet that only existed once
 * `mountJoinSurface` had run. A presenter opening their own link got serif text flush against
 * the left edge of a black page.
 */
export function ensureJoinStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${FONT_FACE_CSS}\n${CSS}`;
  doc.head.appendChild(style);
}

/** A logo address the page may load: the published https one, or (rehearsal) the look's own
 *  image as a data URL. Nothing else becomes an <img> source. */
function logoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  return null;
}

/** The brand each root last had applied: a poll re-renders every few seconds, the brand rarely changes. */
const applied = new WeakMap<HTMLElement, string>();

function applyBrand(root: HTMLElement, brand: AudienceBrand | null | undefined): void {
  const key = JSON.stringify([brand?.accent, brand?.text, brand?.panel, brand?.font]);
  if (applied.get(root) === key) return;
  applied.set(root, key);
  // A brand arrives as jsonb written at publish, so it is data: joinColours reads only colours it
  // can parse, and makes each one readable where it is used (interaction spec, Contrast).
  const c = joinColours(brand);
  const vars: Record<string, Rgb> = {
    '--nj-text': c.text,
    '--nj-muted': c.textMuted,
    '--nj-panel': c.panel,
    '--nj-card-text': c.cardText,
    '--nj-card-muted': c.cardMuted,
    '--nj-edge': c.cardEdge,
    '--nj-accent': c.accent,
    '--nj-on-accent': c.onAccent,
    '--nj-accent-line': c.accentLine,
    '--nj-accent-text': c.accentText,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, css(value));
  // The face, with the page's own stack behind it: a custom face that fails to load falls back to
  // the system font and the layout holds, because nothing here is sized to one face's metrics.
  const font = typeof brand?.font === 'string' && brand.font.trim() ? brand.font : null;
  if (font) root.style.setProperty('--nj-font', `${font}, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`);
  else root.style.removeProperty('--nj-font');
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Mount the join surface into `root`. Returns a handle; call `destroy()` when the page or the
 * preview goes away (it stops the poll — a hidden preview that kept asking would spend a
 * production's request budget on nobody).
 */
export function mountJoinSurface(
  root: HTMLElement,
  client: JoinSurfaceClient,
  options: JoinSurfaceOptions = {},
): JoinSurfaceHandle {
  ensureJoinStyle(root.ownerDocument);
  root.classList.add('nj');

  let view: JoinView | null = null;
  // A note says what happened to the viewer's last send. A thanks belongs to the round it was for
  // (`round`): once the room moves on it goes, so a phone never says "Counted" under the next
  // question or the waiting text. A refusal stays: it explains why the question changed (R14).
  let note: { text: string; bad: boolean; round?: string } | null = null;
  let busy = false;
  let destroyed = false;
  let timer = 0;
  // Kept across renders so a re-poll mid-typing never clears what someone is writing.
  const draft = { author: '', body: '', word: '' };

  const pollMs = options.pollMs ?? 5_000;
  const polling = options.poll !== false;

  // ONE logo element, kept across renders: a poll rebuilds the page every few seconds, and a fresh
  // <img> each time would blink. It shows only once it has loaded, and a URL that failed is never
  // tried again in this page's life, so a broken logo shows nothing rather than a broken image.
  let logo: { url: string; img: HTMLImageElement } | null = null;
  const failedLogos = new Set<string>();
  const logoNode = (url: string | null): HTMLImageElement | null => {
    if (!url || failedLogos.has(url)) return null;
    if (logo?.url !== url) {
      const img = el('img', 'nj-logo');
      img.alt = '';
      img.decoding = 'async';
      img.style.visibility = 'hidden';
      img.addEventListener('load', () => {
        img.style.visibility = '';
      });
      img.addEventListener('error', () => {
        failedLogos.add(url);
        img.remove();
      });
      img.src = url;
      logo = { url, img };
    }
    return logo.img;
  };

  const render = () => {
    if (destroyed) return;
    root.textContent = '';
    applyBrand(root, view?.brand);

    if (!view) {
      root.appendChild(el('p', 'nj-waiting', 'Loading…'));
      return;
    }
    // An unknown or withdrawn join link says the same thing as a closed one. The URL is a
    // capability: "no such production" and "not right now" must be indistinguishable.
    const brand = view.brand;
    const logo = logoNode(logoUrl(brand?.logo));
    if (logo) root.appendChild(logo);
    // The page's title: the operator's, else the production's name (interaction spec, Join).
    const name = pageWords(brand?.title, JOIN_PAGE_LIMITS.title) || view.productionName || 'This production';
    root.appendChild(el('p', 'nj-title', name));

    const { state } = view;
    if (!state.open) {
      root.appendChild(el('p', 'nj-waiting', pageWords(brand?.waiting, JOIN_PAGE_LIMITS.waiting) || JOIN_WAITING_DEFAULT));
      // A send refused because the question closed says so here too (R14).
      renderNote();
      renderMine();
      return;
    }

    root.appendChild(el('p', 'nj-prompt', state.prompt || defaultPrompt(state.mode)));

    // What is live decides the input: an Open question takes a sentence, a Word one a word, a
    // Multiple choice one a tap. Nothing else can be sent, because every send names the live round.
    if (state.round?.kind === 'open') renderCompose();
    else if (state.round?.kind === 'word') renderWord();
    else if (state.round) renderRound();
    else root.appendChild(el('p', 'nj-waiting', 'Standing by.'));

    renderNote();
    renderMine();
  };

  const renderNote = () => {
    if (!note) return;
    const p = el('p', `nj-note${note.bad ? ' bad' : ''}`, note.text);
    p.setAttribute('role', 'status');
    root.appendChild(p);
  };

  const renderCompose = () => {
    const card = el('div', 'nj-card');
    const round = view?.state.round;

    // Labels are wired to their fields with for/id rather than merely sitting above them: on a
    // phone the label is the biggest thing near a small box, and tapping it has to focus.
    const nameField = el('div', 'nj-field');
    const nameLabel = el('label', 'nj-label', 'Your name (optional)');
    nameLabel.htmlFor = 'nj-author';
    const nameInput = el('input');
    nameInput.id = 'nj-author';
    nameInput.type = 'text';
    nameInput.maxLength = AUDIENCE_LIMITS.author;
    nameInput.value = draft.author;
    nameInput.autocomplete = 'off';
    nameInput.addEventListener('input', () => {
      draft.author = nameInput.value;
    });
    nameField.append(nameLabel, nameInput);

    const bodyField = el('div', 'nj-field');
    const bodyLabel = el('label', 'nj-label', 'Your answer');
    bodyLabel.htmlFor = 'nj-body';
    const bodyInput = el('textarea');
    bodyInput.id = 'nj-body';
    bodyInput.maxLength = AUDIENCE_LIMITS.body;
    bodyInput.value = draft.body;
    bodyInput.placeholder = 'Type your answer';
    const count = el('p', 'nj-count');
    bodyField.append(bodyLabel, bodyInput, count);

    const send = el('button', 'nj-send', 'Send');
    send.type = 'button';

    const sync = () => {
      draft.body = bodyInput.value;
      const left = AUDIENCE_LIMITS.body - bodyInput.value.length;
      // The counter appears only once it is news. "500 characters left" over an empty box is a
      // limit nobody is near, printed where the next thing to read should be.
      count.textContent = left <= 120 ? `${left} characters left` : '';
      count.classList.toggle('over', left < 40);
      send.disabled = busy || bodyInput.value.trim().length === 0;
    };
    bodyInput.addEventListener('input', sync);
    send.addEventListener('click', () => {
      if (round) void sendNow(nameInput.value, bodyInput.value, { roundId: round.id, revision: round.revision });
    });

    card.append(nameField, bodyField, send);
    root.appendChild(card);
    sync();
  };

  /** A Word question: one word of at most WORD_MAX characters, once (W2, W3). After it is in, the
   *  phone shows the word instead of the box, also after a reload (the view says which round each
   *  of this phone's messages went to). */
  const renderWord = () => {
    const round = view?.state.round;
    if (!round) return;
    const card = el('div', 'nj-card');
    const sent = view?.mine.find((m) => m.roundId === round.id);
    if (sent) {
      card.append(el('p', 'nj-label', 'Your word'), el('p', 'nj-word', sent.body));
      root.appendChild(card);
      return;
    }
    const field = el('div', 'nj-field');
    const label = el('label', 'nj-label', 'Your word');
    label.htmlFor = 'nj-word';
    const input = el('input');
    input.id = 'nj-word';
    input.type = 'text';
    input.maxLength = WORD_MAX * 2; // UTF-16 units; the count below is in characters
    input.value = draft.word;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.placeholder = 'One word';
    const count = el('p', 'nj-count');
    field.append(label, input, count);
    const send = el('button', 'nj-send', 'Send');
    send.type = 'button';
    const sync = () => {
      draft.word = input.value;
      const typed = input.value.trim();
      const length = Array.from(typed).length;
      // Said only once it is news: a space inside, or past the limit.
      count.textContent = /\s/u.test(typed) ? 'One word only' : length > WORD_MAX ? `${length - WORD_MAX} characters too many` : length >= WORD_MAX - 5 ? `${WORD_MAX - length} characters left` : '';
      count.classList.toggle('over', typed.length > 0 && cleanWord(typed) === null);
      send.disabled = busy || cleanWord(typed) === null;
    };
    input.addEventListener('input', sync);
    send.addEventListener('click', () => {
      const word = cleanWord(input.value);
      if (!word) {
        note = { text: WORD_REFUSED, bad: true };
        render();
        return;
      }
      void sendNow('', word, { roundId: round.id, revision: round.revision }, true);
    });
    card.append(field, send);
    root.appendChild(card);
    sync();
  };

  const renderRound = () => {
    const round = view?.state.round;
    if (!round) return;
    const card = el('div', 'nj-card');
    // The operator's prompt above and the round's own question are usually the same sentence,
    // and printing it twice reads as a rendering fault rather than as emphasis.
    const heading = (view?.state.prompt ?? '').trim();
    if (round.question && round.question.trim() !== heading) {
      card.appendChild(el('p', 'nj-label', round.question));
    }
    const list = el('div', 'nj-opts');
    round.options.forEach((option, index) => {
      const button = el('button', 'nj-opt');
      button.type = 'button';
      // The picked option is shown as picked — this device's own vote, which it already knows.
      // The COUNTS are never here: the reveal belongs to the graphic on air.
      button.setAttribute('aria-pressed', String(view?.myVote === index));
      button.disabled = busy;
      const key = el('span', 'nj-key', String.fromCharCode(65 + index));
      const label = el('span', undefined, option);
      button.append(key, label);
      button.addEventListener('click', () => {
        void voteNow(round.id, index, round.revision);
      });
      list.appendChild(button);
    });
    card.appendChild(list);
    root.appendChild(card);
  };

  const renderMine = () => {
    // A Word question's words are shown in their own card, not in the list of messages.
    const words = new Set(view?.state.round?.kind === 'word' ? [view.state.round.id] : []);
    const items = (view?.mine ?? []).filter((m) => !m.roundId || !words.has(m.roundId));
    if (!items.length) return;
    const card = el('div', 'nj-card');
    card.appendChild(el('p', 'nj-label', 'What you sent'));
    const list = el('ul', 'nj-mine');
    for (const item of items) list.appendChild(el('li', undefined, item.body));
    card.appendChild(list);
    root.appendChild(card);
  };

  const defaultPrompt = (mode: JoinView['state']['mode']): string =>
    mode === 'comment' ? 'Send us a message' : mode === 'quiz' ? 'Pick your answer' : mode === 'poll' ? 'Cast your vote' : mode === 'word' ? 'Send one word' : 'Standing by';

  const load = async () => {
    try {
      const next = await client.load();
      if (destroyed) return;
      view = next;
      if (note && !note.bad && note.round !== (view.state.round?.id ?? undefined)) note = null;
      render();
    } catch {
      // A failed poll is not an event a viewer needs told about: the next one is five seconds
      // away, and the page keeps showing the last thing that was true.
    }
  };

  const sendNow = async (author: string, body: string, target: { roundId: string; revision: number }, word = false) => {
    if (busy) return;
    busy = true;
    note = null;
    render();
    const result = await client.submit(author, body, target);
    busy = false;
    if (result.ok && word) {
      draft.word = '';
      note = { text: 'Thanks, your word is in.', bad: false, round: target.roundId };
    } else if (result.ok) {
      draft.body = '';
      note = { text: 'Sent — thanks. It goes to the team, who choose what to show.', bad: false, round: target.roundId };
    } else {
      // A refusal keeps what was typed. When the question moved on under this phone (R14) the
      // error says so and the re-read below shows the new question; nothing is resent unless the
      // viewer sends again.
      note = { text: result.error ?? 'That could not be sent right now.', bad: true };
    }
    await load();
    render();
  };

  const voteNow = async (roundId: string, option: number, revision: number) => {
    if (busy) return;
    busy = true;
    note = null;
    render();
    const result = await client.vote(roundId, option, revision);
    busy = false;
    note = result.ok
      ? { text: 'Counted. You can change your mind while the vote is open.', bad: false, round: roundId }
      : { text: result.error ?? 'That vote could not be counted.', bad: true };
    await load();
    render();
  };

  const schedule = () => {
    if (!polling || destroyed) return;
    // Up to 20% jitter: a hall full of phones that opened the link together must not poll in
    // lockstep for the rest of the show.
    const wait = pollMs * (0.9 + Math.random() * 0.2);
    timer = window.setTimeout(() => {
      if (document.visibilityState !== 'hidden') void load();
      schedule();
    }, wait);
  };

  render();
  void load();
  schedule();
  // A phone that was in a pocket comes back with a stale question on screen; ask at once.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void load();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    refresh() {
      void load();
    },
    destroy() {
      destroyed = true;
      applied.delete(root);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      root.textContent = '';
      root.classList.remove('nj');
    },
  };
}
