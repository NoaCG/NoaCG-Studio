// The sports pack's FIELD CONTRACTS for the scoreboard category, in one place.
//
// A field contract belongs to the graphic TYPE, not to any one skin: the compiled `fN` ids are
// what the state machine's payloads, the control page and every export bind to, so four
// designs of one type must emit the same fields, in the same order, with the same types — or
// they are not the same graphic. The MARKUP is still each design's own, which is where a house
// strip and a frosted card are allowed to disagree, so this module holds the field shapes and
// the two fragments that carry machinery (the hidden colour holders, the clock element's
// attributes) and nothing else.
//
// Each builder takes the design's OWN sample values, because the SPX definition's default and
// the text painted in the markup have to be the same string: a board that shows "LAL 88" while
// its definition says "HOME 0" is lying to the operator before they have touched anything.
// (This is the `TypeDesign.samples` gate in docs/GRAPHIC_TYPES.md §5, on the emit side.)
//
// The field SHAPES here mirror what each type declares in `src/templates/types/`; the type is
// the source of truth and `e2e/graphic-types.spec.ts` compares the two on every run.

import type { SpxField } from '../../model/types';
import { DATA_SOURCE_CLASS } from '../shared/base';

/** Escape a value for an HTML attribute or text node in generated markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── The compact scorebug ─────────────────────────────────────────────────────

/** One design's starting values for the scorebug contract. Anything absent falls through. */
export interface ScorebugSamples {
  teamA?: string;
  scoreA?: string;
  teamB?: string;
  scoreB?: string;
  period?: string;
  clock?: string;
  colourA?: string;
  colourB?: string;
}

/**
 * The COMPACT SCOREBUG contract — the strip that stays on air for the whole match.
 *
 * f0/f2 team names · f1/f3 scores · f4 period · f5 clock · f6/f7 club colours.
 *
 * The clock is a visible, EDITABLE field rather than a read-only readout on purpose: every
 * live clock drifts from the stadium's, and an operator who cannot type "43:12" into the one
 * that is on air stops trusting it (shared/matchClock.ts re-seeds the tick from what they
 * typed). The two colours are `color` fields — one of the few places the broadcast field
 * policy's reserved types are the honest answer, because a club colour IS a constrained choice
 * and a hex string in a plain text box is not.
 *
 * THE SCORES ARE `number`, AND THE CLOCK IS NOT. Both halves of that are deliberate. A score is
 * bumped far more often than it is typed, so every control surface renders a number field with
 * +/− steppers and awarding a goal is one press instead of a select-and-retype under pressure.
 * The clock cannot follow it: `matchClockUpdate` parses the value on ':' and no number input
 * can hold "43:12". The cost of the score decision is real and accepted — a number input cannot
 * carry a composite score like a shootout's "3 (4)" or cricket's "241/6", which belong in the
 * period or note line, or in a design that declares its own fields.
 */
export function scorebugFields(s: ScorebugSamples = {}): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: 'Team A', value: s.teamA ?? 'HOME' },
    { field: 'f1', ftype: 'number', title: 'Score A', value: s.scoreA ?? '0' },
    { field: 'f2', ftype: 'textfield', title: 'Team B', value: s.teamB ?? 'AWAY' },
    { field: 'f3', ftype: 'number', title: 'Score B', value: s.scoreB ?? '0' },
    { field: 'f4', ftype: 'textfield', title: 'Period', value: s.period ?? '1H' },
    { field: 'f5', ftype: 'textfield', title: 'Clock', value: s.clock ?? '0:00' },
    { field: 'f6', ftype: 'color', title: 'Team A colour', value: s.colourA ?? '#f6a623' },
    { field: 'f7', ftype: 'color', title: 'Team B colour', value: s.colourB ?? '#7dd3fc' },
  ];
}

// ── The full match board ─────────────────────────────────────────────────────

/** One design's starting values for the match-board contract. */
export interface MatchBoardSamples extends ScorebugSamples {
  periods?: string;
}

/**
 * The FULL MATCH BOARD contract — the board shown at kick-off, at the interval and at the end.
 *
 * The scorebug's eight fields, plus the period-by-period source and two crest slots. The
 * breakdown is ONE repeating field (`label | home | away` per line), never a column per period,
 * which is what lets a single board serve basketball's four quarters, ice hockey's three
 * periods and tennis's five sets: the sport is what the operator types, not what the template
 * is. The two crests are ordinary `filelist` image fields, so an empty one shows the design's
 * placeholder rather than a broken image (`setFieldValue` in shared/base.ts).
 */
export function matchBoardFields(s: MatchBoardSamples = {}): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: 'Team A', value: s.teamA ?? 'HOME' },
    { field: 'f1', ftype: 'number', title: 'Score A', value: s.scoreA ?? '0' },
    { field: 'f2', ftype: 'textfield', title: 'Team B', value: s.teamB ?? 'AWAY' },
    { field: 'f3', ftype: 'number', title: 'Score B', value: s.scoreB ?? '0' },
    { field: 'f4', ftype: 'textfield', title: 'Period', value: s.period ?? '1H' },
    { field: 'f5', ftype: 'textfield', title: 'Clock', value: s.clock ?? '0:00' },
    { field: 'f6', ftype: 'textarea', title: 'Period breakdown', value: s.periods ?? 'Q1 | 0 | 0' },
    { field: 'f7', ftype: 'color', title: 'Team A colour', value: s.colourA ?? '#f6a623' },
    { field: 'f8', ftype: 'color', title: 'Team B colour', value: s.colourB ?? '#7dd3fc' },
    { field: 'f9', ftype: 'filelist', title: 'Team A logo', value: '', assetfolder: './images/', extension: 'png' },
    { field: 'f10', ftype: 'filelist', title: 'Team B logo', value: '', assetfolder: './images/', extension: 'png' },
  ];
}

// ── The match status card ────────────────────────────────────────────────────

/** One design's starting values for the match-status contract. */
export interface MatchStatusSamples extends ScorebugSamples {
  status?: string;
  note?: string;
}

/**
 * The MATCH STATUS contract — the card that says where the match stands, and the final score.
 *
 * Teams and scores, plus a status LINE the operator writes ("HALF TIME", "FULL TIME",
 * "ABANDONED — WATERLOGGED") and a note under it. The status text is DATA; whether the board
 * looks live, at the interval or finished is a STATE, and the two are deliberately separate:
 * typing "FULL TIME" into a live board must not make it final, and a board the operator has
 * taken final must look final whatever the text says.
 */
export function matchStatusFields(s: MatchStatusSamples = {}): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: 'Team A', value: s.teamA ?? 'HOME' },
    { field: 'f1', ftype: 'number', title: 'Score A', value: s.scoreA ?? '0' },
    { field: 'f2', ftype: 'textfield', title: 'Team B', value: s.teamB ?? 'AWAY' },
    { field: 'f3', ftype: 'number', title: 'Score B', value: s.scoreB ?? '0' },
    { field: 'f4', ftype: 'textfield', title: 'Status', value: s.status ?? 'HALF TIME' },
    { field: 'f5', ftype: 'textfield', title: 'Note', value: s.note ?? 'Matchday 24' },
    { field: 'f6', ftype: 'color', title: 'Team A colour', value: s.colourA ?? '#f6a623' },
    { field: 'f7', ftype: 'color', title: 'Team B colour', value: s.colourB ?? '#7dd3fc' },
  ];
}

// ── The match event card ─────────────────────────────────────────────────────

/** One design's starting values for the match-event contract. */
export interface MatchEventSamples {
  event?: string;
  minute?: string;
  team?: string;
  detail?: string;
  player?: string;
  colour?: string;
}

/**
 * The MATCH EVENT contract — the transient card: a goal, a substitution, a card, a penalty.
 *
 * One KIND word ("SUBSTITUTION", "YELLOW CARD", "2 MIN"), the minute it happened, the team, and
 * two people or two facts (off and on for a substitution, player and offence for a card). Two
 * lines rather than one because every event this graphic serves has exactly two halves, and a
 * card that can only carry one of them sends the operator back to the lower thirds.
 */
export function matchEventFields(s: MatchEventSamples = {}): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: 'Event', value: s.event ?? 'SUBSTITUTION' },
    { field: 'f1', ftype: 'textfield', title: 'Minute', value: s.minute ?? "67'" },
    { field: 'f2', ftype: 'textfield', title: 'Team', value: s.team ?? 'HOME' },
    { field: 'f3', ftype: 'textfield', title: 'Out / detail', value: s.detail ?? 'M. ØDEGAARD' },
    { field: 'f4', ftype: 'textfield', title: 'In / player', value: s.player ?? 'K. HAVERTZ' },
    { field: 'f5', ftype: 'color', title: 'Team colour', value: s.colour ?? '#f6a623' },
  ];
}

// ── Shared markup fragments (the parts that carry machinery) ─────────────────

/**
 * Clip a scorebug's team name to ONE line, with an ellipsis, at a given width.
 *
 * A compact scorebug is a fixed strip that stays on air for the whole match, so a long club
 * name has to be trimmed rather than wrapped: "Borussia Mönchengladbach" wrapping to three
 * lines grows the bug from 71px tall to 127px in the middle of play, which moves everything
 * the director framed around it.
 *
 * THE GOTCHA THIS EXISTS FOR — worth reading before hand-writing the rule again. The
 * assembler's own `.scoreboard-mask > span` rule sets `text-wrap: balance`, which in modern
 * engines resolves to `text-wrap-mode: wrap`. `white-space: nowrap` is a SHORTHAND that
 * expands to `text-wrap-mode: nowrap`, so the assembler's rule — one specificity step higher
 * (0,1,1 against a plain class's 0,1,0) — silently wins and the name wraps anyway. It looks
 * exactly like the nowrap was never written. Winning it back needs both the higher specificity
 * (`.scoreboard-mask > .name`) and the modern longhand alongside the shorthand.
 */
export function clipOneLineCss(selector: string, maxWidthPx: number): string {
  return `/* One line, clipped with an ellipsis: a fixed strip must not change height mid-match.
   The child selector and the text-wrap longhand are both load-bearing — the assembler's
   \`.scoreboard-mask > span { text-wrap: balance }\` outranks a plain white-space: nowrap. */
.scoreboard-mask > ${selector} {
  max-width: calc(${maxWidthPx}px * var(--scale));  /* the width a long club name is trimmed to */
  overflow: hidden;                /* everything past that width is cut… */
  text-overflow: ellipsis;         /* …and the cut is marked, so a trimmed name reads as trimmed */
  white-space: nowrap;             /* one line (the shorthand, for older engines) */
  text-wrap: nowrap;               /* one line (the longhand that actually beats \`balance\`) */
}`;
}

/**
 * Wrap a team name to at most two lines. The club/amateur board is a growing stack rather than
 * a fixed strip, so wrapping is right there — but unbounded wrapping is not, and a three-line
 * club name would push the footer off the safe area.
 */
export function clampTwoLinesCss(selector: string): string {
  return `/* At most two lines: a stack may grow for a long club name, but not without limit. */
.scoreboard-mask > ${selector} {
  display: -webkit-box;            /* the only cross-engine way to clamp a line count */
  -webkit-box-orient: vertical;    /* stack the lines… */
  -webkit-line-clamp: 2;           /* …and cut after the second, with an ellipsis */
  line-clamp: 2;                   /* the standard property, for engines that have it */
  overflow: hidden;                /* required for the clamp to take effect */
}`;
}

/*
 * THE DATA HOLDERS' HIDING RULE — the CATALOG-WIDE `.noacg-data-source` class, never an inline
 * `style="display: none"`.
 *
 * These three holders carry values the runtime reads and a viewer must never see: two club
 * colours as raw hex, and the period breakdown as "Q1 | 24 | 19" lines. Inline hiding looks
 * equivalent and is not — the entrance reset clears inline props off the root AND every
 * descendant (animRuntime's `noacgResetGraphic`), so the reset itself unhid them. That is not a
 * corner case for a scoreboard: reset is the visual half of RECOVERY, so every output-renderer
 * reboot mid-match put "#f6a623" and the period lines on air.
 *
 * The scoreboards briefly carried their own copy of the rule (a `.scoreboard-colour-a, …`
 * block emitted by this file). It worked, and one rule with two homes is how the two come to
 * disagree — so the boards now wear `DATA_SOURCE_CLASS` alongside their semantic class and the
 * assembler emits `dataSourceCss` for it, exactly as every other category does. The semantic
 * classes stay: `boardRuntimes.ts` selects on them, and the render baseline records them.
 * `e2e/catalog-baseline.spec.ts` fails on any `<div id="fN" style="…display: none">`.
 */

/** The two hidden club-colour holders the board runtimes lift onto the root. */
export function colourHoldersHtml(aId: string, bId: string, aValue: string, bValue: string): string {
  return `      <!-- Club colours — hidden holders; the runtime lifts them onto the root as --team-a / --team-b. -->
      <div id="${aId}" class="scoreboard-colour-a ${DATA_SOURCE_CLASS}">${esc(aValue)}</div>
      <div id="${bId}" class="scoreboard-colour-b ${DATA_SOURCE_CLASS}">${esc(bValue)}</div>`;
}

/** A single hidden club-colour holder (the match-event card wears one team's colour). */
export function colourHolderHtml(id: string, value: string): string {
  return `      <!-- Team colour — a hidden holder; the runtime lifts it onto the root as --team-a. -->
      <div id="${id}" class="scoreboard-colour-a ${DATA_SOURCE_CLASS}">${esc(value)}</div>`;
}

/** The hidden period-breakdown source the match board's runtime renders from. */
export function periodSourceHtml(id: string, value: string): string {
  return `      <!-- Period breakdown source — one "label | home | away" per line; JS renders it above. -->
      <div id="${id}" class="scoreboard-periods-src ${DATA_SOURCE_CLASS}">${esc(value)}</div>`;
}

/**
 * The match clock element. `data-count` is the DESIGN's decision (football counts up, hockey
 * and basketball count down) and `data-start` is what `resetMatchClock` returns to — never
 * zero-by-assumption, because a period that runs from 12:00 resets to 12:00.
 */
export function clockSpanHtml(id: string, direction: 'up' | 'down', start: string, extraClass = ''): string {
  const cls = extraClass === '' ? 'scoreboard-clock' : `scoreboard-clock ${extraClass}`;
  return `<span id="${id}" class="${cls}" data-count="${direction}" data-start="${esc(start)}">${esc(start)}</span>`;
}

// ── The podium board (game shows) ────────────────────────────────────────────

/** One design's starting values for the podium contract. */
export interface PodiumSamples {
  heading?: string;
  names?: [string, string, string, string];
  scores?: [string, string, string, string];
}

const PODIUM_NAMES: [string, string, string, string] = ['MAYA', 'JONAS', 'PRIYA', 'SAM'];

/**
 * The PODIUM BOARD contract — up to four contestants, each a name and a score, for the game
 * show a two-team scorebug cannot serve. f0 heading · f1/f3/f5/f7 names · f2/f4/f6/f8 scores ·
 * f9 the spotlight index (DATA — the machine's `spotlight` payload names a podium, so one
 * state carries any of the four; see types/podiumScore.ts).
 *
 * FOUR PODIUMS IS THE CONTRACT, THREE OR TWO IS CONTENT: a cleared name hides that podium
 * (the runtime toggles `scoreboard-podium-empty`), the same rule that lets a lower third drop
 * its role line. A quiz with three contestants is a smaller podium board, not a different
 * graphic — "parameterize with data, not states", applied to people.
 *
 * The scores are `number` for the scorebug's reason, doubled: game-show points change every
 * question, so they must be one press on every control surface.
 */
export function podiumFields(s: PodiumSamples = {}): SpxField[] {
  const names = s.names ?? PODIUM_NAMES;
  const scores = s.scores ?? ['0', '0', '0', '0'];
  const out: SpxField[] = [
    { field: 'f0', ftype: 'textfield', title: 'Heading', value: s.heading ?? 'SCORES' },
  ];
  for (let i = 0; i < 4; i += 1) {
    out.push({ field: `f${i * 2 + 1}`, ftype: 'textfield', title: `Player ${i + 1}`, value: names[i] });
    out.push({ field: `f${i * 2 + 2}`, ftype: 'number', title: `Score ${i + 1}`, value: scores[i] });
  }
  // 1, not 0: the Spotlight press lights a podium the first time it is pressed (#2268).
  out.push({ field: 'f9', ftype: 'number', title: 'Spotlit podium', value: '1' });
  return out;
}

/** The four podium columns — shared markup so every design pairs the same ids the same way.
 *  The design's CSS draws the columns; this fixes only the id ↔ podium pairing. */
export function podiumColumnsHtml(names: readonly string[], scores: readonly string[]): string {
  return [0, 1, 2, 3].map((i) => `        <!-- Podium ${i + 1}: name over score. An empty name hides the whole column. -->
        <div class="scoreboard-podium scoreboard-podium-${i + 1}">
          <div class="scoreboard-mask"><span id="f${i * 2 + 1}" class="scoreboard-team">${esc(names[i])}</span></div>
          <div class="scoreboard-chip">
            <div class="scoreboard-mask"><span id="f${i * 2 + 2}" class="scoreboard-score">${esc(scores[i])}</span></div>
          </div>
        </div>`).join('\n');
}

/** The hidden spotlight holder — the `spotlight` event's payload field. */
export function spotlightHolderHtml(id: string, value = '1'): string {
  return `      <!-- Spotlight index — a hidden holder; the machine's spotlight payload writes it. -->
      <div id="${id}" class="scoreboard-spotlight-src ${DATA_SOURCE_CLASS}">${esc(value)}</div>`;
}

/**
 * The podium runtime — design-owned JS outside the marked region (the boardRuntimes rule).
 *
 * `rebuildScoreboard` is the name the assembler's update() already calls, so empty-podium
 * collapse and the spotlight repaint ride every data write with no extra wiring. The spotlight
 * CLASS is repainted from the MACHINE plus the field, never toggled imperatively alone — a
 * class is what a visual reset does not touch, so a board recovered mid-show would otherwise
 * come back spotlit while its machine says level (the paintMatchState recovery rule).
 */
export function podiumRuntimeJs(): string {
  return `// ── Podium runtime: empty-podium collapse + the spotlight state's painter. ──

// rebuildScoreboard(): called by update() after every data write, and at load.
// A podium whose NAME is empty disappears whole — three contestants is content, not a state.
function rebuildScoreboard() {
  for (var i = 1; i <= 4; i += 1) {
    var name = document.getElementById('f' + (i * 2 - 1));
    var podium = document.querySelector('.scoreboard-podium-' + i);
    if (!name || !podium) continue;
    var empty = String(name.textContent || '').trim() === '';
    podium.classList.toggle('scoreboard-podium-empty', empty);
  }
  paintSpotlight();
}

// spotlitPodium(): the podium the index field names, held to the podiums that have a name - the
// first one below them, the nearest one before it otherwise (the last above them, a collapsed
// podium's neighbour) - so Spotlight never presses into nothing. 0 only with no podium showing.
function spotlitPodium() {
  var at = parseInt((document.getElementById('f9') || { textContent: '' }).textContent, 10);
  if (isNaN(at)) at = 1;
  var first = 0;
  var pick = 0;
  for (var i = 1; i <= 4; i += 1) {
    var podium = document.querySelector('.scoreboard-podium-' + i);
    if (!podium || podium.classList.contains('scoreboard-podium-empty')) continue;
    if (first === 0) first = i;
    if (i <= at) pick = i;
  }
  return pick || first;
}

// paintSpotlight(): make the columns agree with the MACHINE + the index field. Repainted
// rather than toggled so recovery (snap suppresses state callbacks) still lands right, and so
// an update while a podium is lit keeps the podium the field names lit.
function paintSpotlight() {
  var inSpotlight = false;
  if (typeof noacgMachineState === 'function') {
    var groups = (noacgMachineState() || {}).groups || {};
    for (var id in groups) if (groups[id] === 'spotlight') inSpotlight = true;
  }
  var idx = inSpotlight ? spotlitPodium() : 0;
  for (var i = 1; i <= 4; i += 1) {
    var podium = document.querySelector('.scoreboard-podium-' + i);
    if (!podium) continue;
    podium.classList.toggle('scoreboard-podium-spot', idx === i);
    podium.classList.toggle('scoreboard-podium-dim', idx !== 0 && idx !== i);
  }
}

// applySpotlight() / clearSpotlight(): the state effects the machine's timelines name.
// One state carries any podium — re-entering spotlight with a new payload moves it.
function applySpotlight() { paintSpotlight(); }
function clearSpotlight() { paintSpotlight(); }

// First paint: collapse any podium the design ships empty, before the entrance runs.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rebuildScoreboard);
} else {
  rebuildScoreboard();
}`;
}
