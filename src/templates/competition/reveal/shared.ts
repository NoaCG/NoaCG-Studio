// The REVEAL category — the four full-frame graphics whose whole job is a MOMENT
// (docs/COMPETITION_PACK.md):
//
//   the NOMINEE REVEAL (type 'nominee-reveal') the finalists, then the winner. A suspense
//                                              state holds the room before the name lands.
//   the VERDICT (type 'verdict-card')          correct or incorrect — a game-show ruling, a
//                                              referee call, a fact check.
//   the WINNER CARD (type 'winner-card')       the final result: who won and by what, with a
//                                              celebration the operator calls separately.
//   the AWARD / LAUNCH REVEAL (type 'award-reveal') the sealed envelope: a category on screen,
//                                              the subject revealed on the press.
//
// Every one of them is the same argument in a different costume. The MOMENT is a state, and
// what the moment is ABOUT is data. There is one `judged` state carrying either verdict, and
// one reveal step carrying whichever nominee won — never a state per outcome. Ten nominees
// need no more states than two, and the operator changing their mind about the winner is a
// field write, not a re-authored graphic.
//
// The reveal itself is a lifecycle CALL rather than keyframes, for the reason the quiz's answer
// reveal is: WHICH name lights up is chosen at play time, so no static keyframe can name a
// target. The data names the function; the function stays readable JS outside the region.

import type { ResolvedOptions, TemplateVariant } from '../../../model/wizard';
import type { AnimData } from '../../../blocks/animData';
import type { TypeField } from '../../types/graphicType';
import {
  ESCAPE_HTML_JS,
  READY_GUARD_JS,
  defineCompetitionVariant,
  hiddenSource,
  type CompCategorySpec,
  type CompDesign,
  type CompMeta,
} from '../shared';

/** The category: full-frame moment cards. */
export const REVEAL_CATEGORY: CompCategorySpec = {
  type: 'reveal',
  prefix: 'reveal',
  rootComment: 'Reveal root — the category on screen, and the moment the machine fires.',
  fullFrame: true,
};

export const P = REVEAL_CATEGORY.prefix;

// ── The nominee / finalist reveal ────────────────────────────────────────────

export const NOMINEE_FIELDS: TypeField[] = [
  { key: 'category', label: 'Category', kind: 'text', value: 'PLAY OF THE TOURNAMENT', role: 'line' },
  { key: 'kicker', label: 'Kicker', kind: 'text', value: 'THE NOMINEES', role: 'line' },
  {
    key: 'nominees',
    label: 'Nominees (one per line: "Name | detail")',
    kind: 'lines',
    value:
      'S1MPLE | NAVI · MAP 3 CLUTCH\n' +
      'ZYWOO | VITALITY · 1v4 RETAKE\n' +
      'M0NESY | G2 · OPENING AWP\n' +
      'ROPZ | FAZE · FINAL ROUND ACE',
    role: 'data',
  },
  { key: 'winner', label: 'Winner (1-based)', kind: 'number', value: '1', role: 'data' },
];

/** The nominee card's markup — the list is rebuilt from the source field. */
export function nomineeMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the kicker over the category. -->
      <div class="${P}-head">
        <div class="${P}-mask"><span id="f1" class="${P}-kicker">${value(1, 'THE NOMINEES')}</span></div>
        <div class="${P}-mask"><span id="f0" class="${P}-title">${value(0, 'PLAY OF THE TOURNAMENT')}</span></div>
      </div>
      <!-- The accent rule between the head and the moment. -->
      <div class="${P}-accent"></div>
      <!-- The body: one row per nominee, rendered from the source field below. -->
      <div class="${P}-body" id="${P}-rows"></div>
    </div>
${hiddenSource('f2', NOMINEE_FIELDS[2].value, 'Nominee source (f2) — one "Name | detail" per line.')}
${hiddenSource('f3', '1', 'The winner (f3) — DATA. One reveal carries whichever nominee it names.')}`;
}

/**
 * The nominee runtime. compRebuild is DATA; markSuspense and revealWinner are the machine's,
 * and revealWinner is the Continue STEP's call — so `next` alone runs the whole moment under
 * any playout server, and a control page gets a real button for it.
 */
export const NOMINEE_RUNTIME_JS = `${ESCAPE_HTML_JS}

// compRebuild(): parse the hidden #f2 source (one "Name | detail" per line) and rebuild the
// nominee list. How many finalists there are is the operator's data, which is why the
// entrance cascade is measured rather than keyframed.
function compRebuild() {
  var host = document.getElementById('${P}-rows');
  if (!host) return;
  var source = (document.getElementById('f2') || { textContent: '' }).textContent;
  var html = '';
  var n = 0;
  source.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') return;
    var split = line.indexOf('|');                 // first pipe only — names may contain one
    var name = (split === -1 ? line : line.slice(0, split)).trim();
    var detail = (split === -1 ? '' : line.slice(split + 1)).trim();
    if (name === '') return;
    n++;
    html += '<div class="${P}-nominee" data-row="' + n + '">'
          +   '<span class="${P}-nominee-name">' + escapeHtml(name) + '</span>'
          +   '<span class="${P}-nominee-detail">' + escapeHtml(detail) + '</span>'
          + '</div>';
  });
  host.innerHTML = html;
  // The rebuild replaced the marked rows too. After the reveal (an edit to the list, the
  // trailing update of a recovery) the nominee the winner field names is lit again, with no
  // motion (#2266).
  var root = document.querySelector('.${P}');
  if (root && root.classList.contains('${P}-revealed')) markWinner();
}

// winnerRow(): the nominee the winner field names, or null.
function winnerRow() {
  var host = document.getElementById('${P}-rows');
  var at = parseInt((document.getElementById('f3') || { textContent: '' }).textContent, 10);
  if (!host || isNaN(at) || at < 1) return null;
  return host.querySelector('[data-row="' + at + '"]');
}

// markWinner(): the revealed look on the rows - the named nominee won, the rest out. Returns
// the winner row, or null when the field names none.
function markWinner() {
  var winner = winnerRow();
  var rows = document.querySelectorAll('.${P}-nominee');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('${P}-won', '${P}-out');
    rows[i].classList.add(rows[i] === winner ? '${P}-won' : '${P}-out');
  }
  return winner;
}

// markSuspense(): hold the room. Every nominee falls back and the card breathes — the beat
// before the name. Its own state, so the operator decides how long it lasts.
function markSuspense() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-suspense');
  gsap.fromTo('.${P}-box', { scale: 1 }, { scale: 1.012, duration: 0.6 / motionSpeed(), ease: 'sine.inOut' });
}

// revealWinner(): the moment. The winning nominee lights up and lifts, the others fall away.
// WHICH one is the operator's field — the same reveal serves four nominees or twelve.
function revealWinner() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.remove('${P}-suspense');
  root.classList.add('${P}-revealed');
  var winner = markWinner();
  if (!winner) return;             // an unknown row: the card simply stays with its nominees
  gsap.fromTo(winner,
    { scale: 1.06, y: -6 },
    { scale: 1, y: 0, duration: 0.55 / motionSpeed(), ease: 'back.out(1.9)' }
  );
}

// compClearMarks(): play()'s visual reset — nominees again, nothing revealed. The inline
// styles the reveal left are cleared too: a class alone would not undo a tween.
function compClearMarks() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-suspense', '${P}-revealed');
  var rows = document.querySelectorAll('.${P}-nominee');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('${P}-won', '${P}-out');
  if (rows.length) gsap.set(rows, { clearProps: 'all' });
  gsap.set('.${P}-box', { clearProps: 'scale' });
}

${READY_GUARD_JS}`;

// ── The verdict card ─────────────────────────────────────────────────────────

export const VERDICT_FIELDS: TypeField[] = [
  { key: 'prompt', label: 'Prompt', kind: 'text', value: 'WAS THE CALL CORRECT?', role: 'line' },
  { key: 'answer', label: 'Answer', kind: 'text', value: 'THE SHOT WAS OUT OF BOUNDS', role: 'line' },
  { key: 'note', label: 'Note', kind: 'text', value: 'CONFIRMED BY REPLAY', role: 'line' },
  // The ruling itself: a genuinely constrained choice, and DATA — one `judged` state carries
  // either verdict, which is why there is no state per outcome.
  {
    key: 'verdict', label: 'Verdict', kind: 'select', value: 'correct', role: 'data',
    options: [
      { label: 'Correct', value: 'correct' },
      { label: 'Incorrect', value: 'incorrect' },
    ],
  },
];

/** The verdict card's markup. */
export function verdictMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the question being ruled on. -->
      <div class="${P}-head">
        <div class="${P}-mask"><span id="f0" class="${P}-kicker">${value(0, 'WAS THE CALL CORRECT?')}</span></div>
        <div class="${P}-mask"><span id="f1" class="${P}-title">${value(1, 'THE SHOT WAS OUT OF BOUNDS')}</span></div>
      </div>
      <!-- The accent rule between the head and the moment. -->
      <div class="${P}-accent"></div>
      <!-- The body: the ruling mark, its word, and the note under it. -->
      <div class="${P}-body">
        <span class="${P}-mark"></span>
        <span class="${P}-word"></span>
        <span id="f2" class="${P}-note">${value(2, 'CONFIRMED BY REPLAY')}</span>
      </div>
    </div>
${hiddenSource('f3', 'correct', 'The ruling (f3) — DATA. One "judged" state carries either verdict.')}`;
}

/** The verdict runtime — applyVerdict and clearVerdict are the machine's two states. */
export const VERDICT_RUNTIME_JS = `// applyVerdict(): the ruling. Reads the verdict field the event carried in and paints it —
// mark, word and treatment. Re-entering the state with the other value simply repaints, which
// is what a correction mid-show actually is.
function applyVerdict() {
  var root = document.querySelector('.${P}');
  var mark = document.querySelector('.${P}-mark');
  var word = document.querySelector('.${P}-word');
  if (!root || !mark || !word) return;
  var verdict = String((document.getElementById('f3') || { textContent: '' }).textContent).trim().toLowerCase();
  root.classList.remove('${P}-correct', '${P}-incorrect');
  if (verdict !== 'correct' && verdict !== 'incorrect') return;   // unknown: stay unjudged
  root.classList.add('${P}-' + verdict);
  mark.textContent = verdict === 'correct' ? '\\u2713' : '\\u2715';   // a tick, or a cross
  word.textContent = verdict === 'correct' ? 'CORRECT' : 'INCORRECT';
  gsap.fromTo(mark,
    { scale: 0.4, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.5 / motionSpeed(), ease: 'back.out(2.2)' }
  );
  gsap.fromTo(word,
    { y: 14, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.4 / motionSpeed(), ease: 'power3.out' },
  );
}

// clearVerdict(): back to unjudged — the question on screen with no ruling yet.
function clearVerdict() {
  var root = document.querySelector('.${P}');
  var mark = document.querySelector('.${P}-mark');
  var word = document.querySelector('.${P}-word');
  if (root) root.classList.remove('${P}-correct', '${P}-incorrect');
  if (mark) { mark.textContent = ''; gsap.set(mark, { clearProps: 'all' }); }
  if (word) { word.textContent = ''; gsap.set(word, { clearProps: 'all' }); }
}

// compClearMarks(): play()'s visual reset — every replay starts unjudged.
function compClearMarks() {
  clearVerdict();
}`;

// ── The winner / final result card ───────────────────────────────────────────

export const WINNER_FIELDS: TypeField[] = [
  { key: 'kicker', label: 'Kicker', kind: 'text', value: 'GRAND FINAL', role: 'line' },
  { key: 'winner', label: 'Winner', kind: 'text', value: 'TEAM LIQUID', role: 'line' },
  { key: 'result', label: 'Result', kind: 'text', value: '3 — 1', role: 'line' },
  { key: 'runnerUp', label: 'Runner-up', kind: 'text', value: 'NAVI', role: 'data' },
  { key: 'note', label: 'Note', kind: 'text', value: 'IEM COLOGNE 2026', role: 'data' },
  { key: 'crest', label: 'Winner logo', kind: 'image', value: '', role: 'data' },
];

/** The winner card's markup — the result stays hidden until the press. */
export function winnerMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the kicker, the crest, and the winner's name. -->
      <div class="${P}-head">
        <div class="${P}-mask"><span id="f0" class="${P}-kicker">${value(0, 'GRAND FINAL')}</span></div>
        <div class="${P}-logo"><img id="f5" alt="" style="display: none" /></div>
        <div class="${P}-mask"><span id="f1" class="${P}-title">${value(1, 'TEAM LIQUID')}</span></div>
      </div>
      <!-- The accent rule between the head and the moment. -->
      <div class="${P}-accent"></div>
      <!-- The body: the score line and the beaten side — held back until the press. -->
      <div class="${P}-body">
        <span class="${P}-subject" id="f2">${value(2, '3 — 1')}</span>
        <span class="${P}-runner" id="f3">${WINNER_FIELDS[3].value}</span>
        <span class="${P}-note" id="f4">${WINNER_FIELDS[4].value}</span>
      </div>
    </div>`;
}

/** The winner runtime — the result reveal, plus the celebration as its own state. */
export const WINNER_RUNTIME_JS = `// revealResult(): the Continue press. The result line and the beaten side arrive together —
// the card introduces the champion first, then says by how much.
function revealResult() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-result-shown');
  gsap.fromTo(['.${P}-subject', '.${P}-runner'],
    { y: 22, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5 / motionSpeed(), ease: 'power3.out', stagger: 0.08 / motionSpeed() }
  );
}

// markCelebration(): the flourish, called by its own state so the operator decides when the
// card stops being a result and starts being a celebration.
function markCelebration() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-celebrating');
  gsap.fromTo('.${P}-title',
    { scale: 1.05 },
    { scale: 1, duration: 0.55 / motionSpeed(), ease: 'back.out(1.9)' }
  );
}

// clearCelebration(): back to the plain result.
function clearCelebration() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-celebrating');
  gsap.set('.${P}-title', { clearProps: 'scale' });
}

// compClearMarks(): play()'s visual reset — the result hidden again, no celebration.
function compClearMarks() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-result-shown', '${P}-celebrating');
  gsap.set(['.${P}-subject', '.${P}-runner', '.${P}-title'], { clearProps: 'all' });
}`;

// ── The award / launch reveal ────────────────────────────────────────────────

export const AWARD_FIELDS: TypeField[] = [
  { key: 'kicker', label: 'Kicker', kind: 'text', value: 'AND THE AWARD GOES TO', role: 'line' },
  { key: 'category', label: 'Category', kind: 'text', value: 'BROADCAST INNOVATION OF THE YEAR', role: 'line' },
  { key: 'subject', label: 'Subject', kind: 'text', value: 'NOACG STUDIO', role: 'line' },
  { key: 'note', label: 'Note', kind: 'text', value: 'ACCEPTED BY THE STUDIO TEAM', role: 'data' },
  { key: 'crest', label: 'Logo', kind: 'image', value: '', role: 'data' },
];

/** The award card's markup — the subject is on the card but not yet shown. */
export function awardMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the kicker over the category — what is on screen before the press. -->
      <div class="${P}-head">
        <div class="${P}-mask"><span id="f0" class="${P}-kicker">${value(0, 'AND THE AWARD GOES TO')}</span></div>
        <div class="${P}-mask"><span id="f1" class="${P}-title">${value(1, 'BROADCAST INNOVATION OF THE YEAR')}</span></div>
      </div>
      <!-- The accent rule between the head and the moment. -->
      <div class="${P}-accent"></div>
      <!-- The body: the subject and its note, revealed on the press. -->
      <div class="${P}-body">
        <div class="${P}-logo"><img id="f4" alt="" style="display: none" /></div>
        <span class="${P}-subject" id="f2">${value(2, 'NOACG STUDIO')}</span>
        <span class="${P}-note" id="f3">${AWARD_FIELDS[3].value}</span>
      </div>
    </div>`;
}

/** The award runtime — the envelope opens, and the celebration is its own state. */
export const AWARD_RUNTIME_JS = `// openEnvelope(): the Continue press. The subject scales up out of nothing while the category
// above it settles back — the classic envelope beat.
function openEnvelope() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-open');
  gsap.fromTo('.${P}-subject',
    { scale: 0.82, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.7 / motionSpeed(), ease: 'back.out(1.7)' }
  );
  gsap.fromTo('.${P}-note',
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5 / motionSpeed(), ease: 'power3.out' },
  );
  gsap.fromTo('.${P}-logo',
    { scale: 0.9, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.6 / motionSpeed(), ease: 'back.out(1.5)' },
  );
}

// markCelebration(): the applause beat — its own state, because the operator decides when the
// room gets there.
function markCelebration() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-celebrating');
  gsap.fromTo('.${P}-accent',
    { opacity: 0.4 },
    { opacity: 1, duration: 0.5 / motionSpeed(), ease: 'power2.out' }
  );
}

// clearCelebration(): back to the plain reveal.
function clearCelebration() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-celebrating');
  gsap.set('.${P}-accent', { clearProps: 'opacity' });
}

// compClearMarks(): play()'s visual reset — the envelope sealed again.
function compClearMarks() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-open', '${P}-celebrating');
  gsap.set(['.${P}-subject', '.${P}-note', '.${P}-logo', '.${P}-accent'], { clearProps: 'all' });
}`;

// ── Shared layout ────────────────────────────────────────────────────────────

/** The moment layout every reveal design has in common. */
export function revealStructureCss(): string {
  return `/* ── The reveal's layout (shared by every design of the category). ── */

/* The accent is a RULE in the flow between the head and the moment: a card whose category
   wraps to two lines must not have the rule land on top of it. */
.${P}-accent {
  width: calc(340px * var(--scale));
  margin-top: calc(20px * var(--scale));
  flex-shrink: 0;
}

.${P}-head {
  display: flex;                   /* kicker over title */
  flex-direction: column;
  align-items: center;
  gap: calc(12px * var(--scale));
  text-align: center;
  max-width: 74%;                  /* a long category wraps rather than running to the edges */
}

.${P}-body {
  display: flex;                   /* the moment itself */
  flex-direction: column;
  align-items: center;
  gap: calc(18px * var(--scale));  /* nominee tiles need air between them */
  margin-top: calc(30px * var(--scale));
  text-align: center;
  max-width: 78%;
}

/* One nominee row. */
.${P}-nominee {
  display: flex;                   /* name over detail */
  flex-direction: column;
  align-items: center;
  gap: calc(4px * var(--scale));
  will-change: transform, opacity; /* the cascade moves each row */
}

.${P}-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(120px * var(--scale));
  height: calc(120px * var(--scale));
}

/* An empty crest slot takes NO ROOM on a reveal card. Elsewhere in the pack an empty slot is
   a visible placeholder (a scorebug is drawn around its crests); here the card is composed
   around its type, and a 120px hole between the category and the name is just a gap. The
   class is setFieldValue's — the slot returns the moment a file is picked. */
.${P}-logo:not(.has-image) {
  display: none;
}
.${P}-logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* The verdict mark and word are empty until a ruling is made, so they take no room. */
.${P}-mark:empty,
.${P}-word:empty {
  display: none;
}`;
}

/**
 * The winner card's "held back until the press" rule.
 *
 * Hidden on the ELEMENTS rather than on the body: the entrance preset animates the body, so
 * hiding that would fight the preset. A replay clears the inline styles the reveal left
 * (compClearMarks), which is what makes the second run start held back like the first.
 */
export function heldResultCss(): string {
  return `/* The result is on the card from the start but not SHOWN — the press reveals it. */
.${P}-subject,
.${P}-runner {
  opacity: 0;
}

.${P}-result-shown .${P}-subject,
.${P}-result-shown .${P}-runner {
  opacity: 1;                      /* after the press, the result stays up */
}`;
}

/** The award card's sealed-envelope rule — the same mechanism, a different set of elements. */
export function heldEnvelopeCss(): string {
  return `/* The subject is on the card from the start but sealed — the press opens the envelope. */
.${P}-subject,
.${P}-note,
.${P}-logo {
  opacity: 0;
}

.${P}-open .${P}-subject,
.${P}-open .${P}-note,
.${P}-open .${P}-logo {
  opacity: 1;                      /* once opened, the moment stays up */
}`;
}

// ── The authoring API ────────────────────────────────────────────────────────

/** Define one reveal-category variant (any of its four types). */
export function defineRevealVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: CompMeta,
  buildDesign: (o: ResolvedOptions) => CompDesign,
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  return defineCompetitionVariant(REVEAL_CATEGORY, spec, meta, buildDesign, refine);
}
