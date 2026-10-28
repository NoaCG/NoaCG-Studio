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
import { AUDIENCE_LIMITS, type AudienceBrand, type JoinView, type SubmitResult } from './audienceTypes';

export interface JoinSurfaceClient {
  load(): Promise<JoinView>;
  submit(author: string, body: string): Promise<SubmitResult>;
  vote(roundId: string, option: number): Promise<SubmitResult>;
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
.nj { --nj-accent:#ffb84d; --nj-text:#f4f4f5; --nj-panel:#141417; --nj-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height:100%; box-sizing:border-box; margin:0 auto; max-width:560px;
  /* viewport-fit=cover means the page runs under the notch and the home indicator, so the
     padding has to know about both — a Send button behind the indicator is unpressable. */
  padding:calc(20px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
          calc(40px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
  color:var(--nj-text); font-family:var(--nj-font); }
.nj * { box-sizing:border-box; }
.nj-title { margin:0 0 4px; font-size:15px; letter-spacing:.14em; text-transform:uppercase; opacity:.6; }
.nj-prompt { margin:0 0 20px; font-size:23px; line-height:1.3; font-weight:600; }
/* The border does the work, not the fill: a production's published panel colour is often within
   a few percent of the page behind it (the studio's own is rgba(10,12,16,.86) on #0b0b0d), and a
   card that reads as a card only for SOME brands is not a card. */
.nj-card { background:var(--nj-panel); border:1px solid rgba(255,255,255,.16); border-radius:14px;
  padding:16px; margin-bottom:14px; box-shadow:0 1px 0 rgba(255,255,255,.05) inset; }
/* margin, not margin-bottom: the presenter view uses this class on a <p>, which would otherwise
   keep the browser's 1em top margin and sit lower in its card than the same label does here. */
.nj-label { display:block; font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.6; margin:0 0 6px; }
/* 44px minimum on everything a thumb aims at, inputs included — the iOS/Android floor, and the
   reason the padding is not simply "looks about right". */
.nj input[type=text], .nj textarea { width:100%; min-height:44px; background:rgba(255,255,255,.05); color:inherit; font:inherit;
  font-size:16px; border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:11px 12px; }
/* No resize grabber: it is a desktop affordance that lands as a stray mark over the corner of a
   phone-sized box, and a phone scrolls the field instead. */
.nj textarea { min-height:112px; resize:none; }
.nj input[type=text]:focus, .nj textarea:focus { outline:2px solid var(--nj-accent); outline-offset:1px; border-color:transparent; }
.nj-field + .nj-field { margin-top:14px; }
.nj-count { text-align:right; font-size:12px; opacity:.55; margin:6px 0 0; }
.nj-count:empty { display:none; }
.nj-count.over { color:var(--nj-accent); opacity:1; }
.nj-send { width:100%; min-height:52px; margin-top:14px; padding:14px; font:inherit; font-weight:700; font-size:16px;
  color:#151006; background:var(--nj-accent); border:0; border-radius:10px; cursor:pointer; }
/* A disabled send is its own colour, not the accent at 45%: a washed-out amber slab reads as a
   broken button rather than as one waiting for something to be typed. */
.nj-send[disabled] { background:rgba(255,255,255,.08); color:rgba(244,244,245,.5); cursor:default; }
.nj-opts { display:grid; gap:10px; }
.nj-opt { display:flex; align-items:center; gap:12px; width:100%; min-height:52px; text-align:left; font:inherit; font-size:16px;
  color:inherit; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.14);
  border-radius:10px; padding:14px; cursor:pointer; }
.nj-opt[aria-pressed=true] { border-color:var(--nj-accent); box-shadow:inset 0 0 0 1px var(--nj-accent); }
.nj-opt .nj-key { flex:0 0 26px; height:26px; display:grid; place-items:center; border-radius:7px;
  background:rgba(255,255,255,.1); font-size:13px; font-weight:700; }
.nj-opt[aria-pressed=true] .nj-key { background:var(--nj-accent); color:#151006; }
.nj-note { margin:10px 0 0; font-size:14px; line-height:1.45; opacity:.8; }
.nj-note.bad { color:var(--nj-accent); opacity:1; }
.nj-mine { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.nj-mine li { font-size:14px; line-height:1.45; opacity:.75; border-left:2px solid var(--nj-accent); padding-left:10px; }
.nj-waiting { text-align:center; padding:26px 10px; opacity:.7; font-size:16px; line-height:1.5; }
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

function applyBrand(root: HTMLElement, brand: AudienceBrand | null | undefined): void {
  // Only the four published values, and only when they are strings — a brand arrives as jsonb
  // written at publish, so it is data, and data gets checked before it becomes a style.
  const set = (name: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) root.style.setProperty(name, value);
  };
  set('--nj-accent', brand?.accent);
  set('--nj-text', brand?.text);
  set('--nj-panel', brand?.panel);
  set('--nj-font', brand?.font);
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
  let note: { text: string; bad: boolean } | null = null;
  let busy = false;
  let destroyed = false;
  let timer = 0;
  // Kept across renders so a re-poll mid-typing never clears what someone is writing.
  const draft = { author: '', body: '' };

  const pollMs = options.pollMs ?? 5_000;
  const polling = options.poll !== false;

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
    const name = view.productionName || 'This production';
    root.appendChild(el('p', 'nj-title', name));

    const { state } = view;
    if (!state.open) {
      root.appendChild(
        el('p', 'nj-waiting', 'Not taking part right now. Keep this page open — it updates by itself.'),
      );
      renderMine();
      return;
    }

    root.appendChild(el('p', 'nj-prompt', state.prompt || defaultPrompt(state.mode)));

    if (state.round && (state.mode === 'poll' || state.mode === 'quiz')) renderRound();
    else if (state.mode === 'question' || state.mode === 'comment') renderCompose();
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
    const isComment = view?.state.mode === 'comment';

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
    const bodyLabel = el('label', 'nj-label', isComment ? 'Your message' : 'Your question');
    bodyLabel.htmlFor = 'nj-body';
    const bodyInput = el('textarea');
    bodyInput.id = 'nj-body';
    bodyInput.maxLength = AUDIENCE_LIMITS.body;
    bodyInput.value = draft.body;
    bodyInput.placeholder = isComment ? 'Type your message…' : 'Type your question…';
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
      void sendNow(nameInput.value, bodyInput.value);
    });

    card.append(nameField, bodyField, send);
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
        void voteNow(round.id, index);
      });
      list.appendChild(button);
    });
    card.appendChild(list);
    root.appendChild(card);
  };

  const renderMine = () => {
    if (!view?.mine.length) return;
    const card = el('div', 'nj-card');
    card.appendChild(el('p', 'nj-label', 'What you sent'));
    const list = el('ul', 'nj-mine');
    for (const item of view.mine) list.appendChild(el('li', undefined, item.body));
    card.appendChild(list);
    root.appendChild(card);
  };

  const defaultPrompt = (mode: JoinView['state']['mode']): string =>
    mode === 'comment' ? 'Send us a message' : mode === 'quiz' ? 'Pick your answer' : mode === 'poll' ? 'Cast your vote' : 'Standing by';

  const load = async () => {
    try {
      const next = await client.load();
      if (destroyed) return;
      view = next;
      render();
    } catch {
      // A failed poll is not an event a viewer needs told about: the next one is five seconds
      // away, and the page keeps showing the last thing that was true.
    }
  };

  const sendNow = async (author: string, body: string) => {
    if (busy) return;
    busy = true;
    note = null;
    render();
    const result = await client.submit(author, body);
    busy = false;
    if (result.ok) {
      draft.body = '';
      note = { text: 'Sent — thanks. It goes to the team, who choose what to show.', bad: false };
    } else {
      note = { text: result.error ?? 'That could not be sent right now.', bad: true };
    }
    await load();
    render();
  };

  const voteNow = async (roundId: string, option: number) => {
    if (busy) return;
    busy = true;
    note = null;
    render();
    const result = await client.vote(roundId, option);
    busy = false;
    note = result.ok
      ? { text: 'Counted. You can change your mind while the vote is open.', bad: false }
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
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      root.textContent = '';
      root.classList.remove('nj');
    },
  };
}
