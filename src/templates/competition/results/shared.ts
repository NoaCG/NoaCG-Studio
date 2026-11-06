// The RESULTS & STANDINGS category — the four boards that render a LIST the operator typed
// (docs/COMPETITION_PACK.md):
//
//   the ROSTER (type 'roster')          a team's line-up, one player per row, with a spotlight
//                                       the operator can move from player to player.
//   the STANDINGS BOARD (type 'standings') a table: one row per team, any set of columns, a
//                                       highlighted row, and a FINAL state for a result table.
//   the BRACKET (type 'bracket')        the knockout tree as columns of ties, with a cursor on
//                                       the round being played and a champion at the end.
//   the TIMING TOWER (type 'timing-tower') the narrow live order of a timed session: position,
//                                       competitor, time. It stays on air WHILE the session
//                                       runs, so its data changes under it constantly.
//
// All four are DATA BOARDS in the sense docs/DYNAMIC_MOTION_SCOPE.md means: how many rows
// there are is the operator's typing, so the rebuild is a runtime function and the entrance
// cascade is MEASURED (compMotion.ts compCascade) rather than written down as keyframes. What
// the machine adds is the part that is NOT data: which row is being talked about right now,
// and whether the table is provisional or final.
//
// The spotlight and the highlight are the pack's recurring shape: ONE state plus a field
// holding the row number. Ten teams do not need ten states, and adding an eleventh adds none.

import type { ResolvedOptions, TemplateVariant } from '../../../model/wizard';
import type { AnimData } from '../../../blocks/animData';
import type { TypeField } from '../../types/graphicType';
import {
  COMP_WIDTH,
  ESCAPE_HTML_JS,
  READY_GUARD_JS,
  defineCompetitionVariant,
  hiddenSource,
  type CompCategorySpec,
  type CompDesign,
  type CompMeta,
  type CompStep,
} from '../shared';

/** The category: a board that hugs its rows, parked wherever the show wants it. */
export const RESULTS_CATEGORY: CompCategorySpec = {
  type: 'results-board',
  prefix: 'results-board',
  rootComment: 'Results board root — a list the operator typed, and the row being talked about.',
  widthFraction: COMP_WIDTH.board,
};

export const P = RESULTS_CATEGORY.prefix;

// ── The roster / line-up ─────────────────────────────────────────────────────

export const ROSTER_FIELDS: TypeField[] = [
  { key: 'title', label: 'Title', kind: 'text', value: 'STARTING LINE-UP', role: 'line' },
  { key: 'team', label: 'Team', kind: 'text', value: 'TEAM LIQUID', role: 'line' },
  {
    key: 'players',
    label: 'Players (one per line: "Name | role")',
    kind: 'lines',
    value: 'NAF | RIFLER\nELIGE | ENTRY\nTWISTX | SUPPORT\nSKULLZ | AWP\nJKS | IGL',
    role: 'data',
  },
  // 1, not 0: the Focus row press lights a row the first time it is pressed (#2200). A number
  // past either end of the line-up lights the row at that end (`spotlitRow`).
  { key: 'spotlight', label: 'Spotlit player', kind: 'number', value: '1', role: 'data' },
  { key: 'crest', label: 'Team logo', kind: 'image', value: '', role: 'data' },
];

/** The roster's markup — the rows are rebuilt from the source, so the body starts empty. */
export function rosterMarkup(o: ResolvedOptions, fields: TypeField[] = ROSTER_FIELDS): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the crest, the title, and the team it belongs to. -->
      <div class="${P}-head">
        <div class="${P}-logo"><img id="f4" alt="" style="display: none" /></div>
        <div class="${P}-heading">
          <div class="${P}-mask"><span id="f0" class="${P}-kicker">${value(0, 'STARTING LINE-UP')}</span></div>
          <div class="${P}-mask"><span id="f1" class="${P}-title">${value(1, 'TEAM LIQUID')}</span></div>
        </div>
      </div>
      <!-- The accent rule between the heading and the rows. -->
      <div class="${P}-accent"></div>
      <!-- The body: one row per player, rendered from the source field below. -->
      <div class="${P}-body" id="${P}-rows"></div>
    </div>
${hiddenSource('f2', fields[2].value, 'Ordered row source (f2) — one "Name | note" per line.')}
${hiddenSource('f3', fields[3].value, 'The focused row (f3) — DATA. One "spotlight" state carries any row.')}`;
}

/**
 * The roster runtime. compRebuild is DATA; applySpotlight / clearSpotlight are STATE EFFECTS
 * the machine names, so a spotlight is something the operator DID: a data write never starts
 * one. While a row is lit, the lit row follows the field.
 */
export const ROSTER_RUNTIME_JS = `${ESCAPE_HTML_JS}

// compRebuild(): parse the hidden #f2 source (one "Name | role" per line) and rebuild the
// line-up. The row count is the operator's data, which is why the cascade is measured.
function compRebuild() {
  var host = document.getElementById('${P}-rows');
  if (!host) return;
  var source = (document.getElementById('f2') || { textContent: '' }).textContent;
  var html = '';
  var n = 0;
  source.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') return;                       // skip blank lines
    var split = line.indexOf('|');                 // first pipe only — names may contain one
    var name = (split === -1 ? line : line.slice(0, split)).trim();
    var role = (split === -1 ? '' : line.slice(split + 1)).trim();
    if (name === '') return;
    n++;
    html += '<div class="${P}-row" data-row="' + n + '">'
          +   '<span class="${P}-row-index">' + n + '</span>'
          +   '<span class="${P}-row-name">' + escapeHtml(name) + '</span>'
          +   '<span class="${P}-row-note">' + escapeHtml(role) + '</span>'
          + '</div>';
  });
  host.innerHTML = html;
  // The rebuild replaced the lit row too. An update while a row is spotlit (a new note, a new
  // number) lights the row the field names now, without moving it again.
  var root = document.querySelector('.${P}');
  var lit = root && root.classList.contains('${P}-spotlit') ? spotlitRow() : null;
  if (lit) lit.classList.add('${P}-row-on');
}

// spotlitRow(): the row the spotlight field names, held to the line-up - the first row below
// it, the last above it - so Focus row never presses into nothing. Null only with no rows.
function spotlitRow() {
  var rows = document.querySelectorAll('.${P}-row');
  if (rows.length === 0) return null;
  var at = parseInt((document.getElementById('f3') || { textContent: '' }).textContent, 10);
  return rows[Math.min(Math.max(isNaN(at) ? 1 : at, 1), rows.length) - 1];
}

// clearSpotlight(): the whole line-up back at one level.
function clearSpotlight() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-spotlit');
  var rows = document.querySelectorAll('.${P}-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('${P}-row-on');
}

// applySpotlight(): lift the row the event's payload named. One state carries any row —
// re-entering it moves the spotlight, which is why a ten-player roster needs no ten states.
function applySpotlight() {
  clearSpotlight();
  var row = spotlitRow();
  if (!row) return;                // no rows: the line-up stays level, nothing dimmed
  var root = document.querySelector('.${P}');
  if (root) root.classList.add('${P}-spotlit');
  row.classList.add('${P}-row-on');
  gsap.fromTo(row, { x: -12 }, { x: 0, duration: 0.38 / motionSpeed(), ease: 'back.out(1.7)' });
}

// compClearMarks(): play()'s visual reset — a level line-up on every replay.
function compClearMarks() {
  clearSpotlight();
}

${READY_GUARD_JS}`;

// ── The standings / result table ─────────────────────────────────────────────

export const STANDINGS_FIELDS: TypeField[] = [
  { key: 'title', label: 'Title', kind: 'text', value: 'GROUP A · STANDINGS', role: 'line' },
  { key: 'subtitle', label: 'Subtitle', kind: 'text', value: 'AFTER MATCHDAY 4', role: 'line' },
  {
    key: 'rows',
    label: 'Rows (one per line: "Team | value | value | …")',
    kind: 'lines',
    value: 'TEAM LIQUID | 4 | 1 | +14 | 12\nNAVI | 3 | 2 | +6 | 9\nFAZE | 3 | 2 | +2 | 9\nVITALITY | 2 | 3 | -5 | 6\nG2 | 1 | 4 | -17 | 3',
    role: 'data',
  },
  { key: 'columns', label: 'Column headers ("W | L | +/- | PTS")', kind: 'text', value: 'W | L | +/- | PTS', role: 'data' },
  // 1, not 0: the Highlight row press lights a row the first time it is pressed (#2181). A
  // number past either end of the table lights the row at that end (`highlightedRow`).
  { key: 'highlight', label: 'Highlighted row', kind: 'number', value: '1', role: 'data' },
];

/** The table's one middle step: Next walks the whole table to the FINAL table, Back walks it
 *  back, and Continue alone runs the board end to end (the quiz precedent, CompStep). */
export const STANDINGS_STEPS: CompStep[] = [{ name: 'Final', call: 'markFinal', duration: 0.4 }];

/** The standings board's markup — the header cells and rows are both rebuilt. */
export function standingsMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the title, its subtitle, and the column headers. -->
      <div class="${P}-head">
        <div class="${P}-heading">
          <div class="${P}-mask"><span id="f0" class="${P}-title">${value(0, 'GROUP A · STANDINGS')}</span></div>
          <div class="${P}-mask"><span id="f1" class="${P}-kicker">${value(1, 'AFTER MATCHDAY 4')}</span></div>
        </div>
        <!-- The column headers, rendered from the source so the table is any shape. -->
        <div class="${P}-columns" id="${P}-columns"></div>
      </div>
      <!-- The accent rule between the heading and the table. -->
      <div class="${P}-accent"></div>
      <!-- The body: one row per team. -->
      <div class="${P}-body" id="${P}-rows"></div>
    </div>
${hiddenSource('f2', STANDINGS_FIELDS[2].value, 'Row source (f2) — one "Team | value | value | …" per line.')}
${hiddenSource('f3', STANDINGS_FIELDS[3].value, 'Column headers (f3) — the labels above the value columns.')}
${hiddenSource('f4', STANDINGS_FIELDS[4].value, 'The highlighted row (f4) — DATA. One "highlighted" state carries any row.')}`;
}

/**
 * The standings runtime. The table takes ANY number of columns, because the operator's header
 * line decides them: a league table, a prize-money list and a race result are the same board.
 */
export const STANDINGS_RUNTIME_JS = `${ESCAPE_HTML_JS}

// compRebuild(): rebuild the header cells and the rows from the two source fields. The column
// COUNT comes from the header line, so one board serves a league table, a medal table and a
// race result without a second design.
function compRebuild() {
  var host = document.getElementById('${P}-rows');
  var head = document.getElementById('${P}-columns');
  if (!host) return;
  var headers = (document.getElementById('f3') || { textContent: '' }).textContent
    .split('|').map(function (h) { return h.trim(); }).filter(function (h) { return h !== ''; });
  if (head) {
    head.innerHTML = headers.map(function (h) {
      return '<span class="${P}-col">' + escapeHtml(h) + '</span>';
    }).join('');
  }
  var source = (document.getElementById('f2') || { textContent: '' }).textContent;
  var html = '';
  var n = 0;
  source.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') return;
    var parts = line.split('|').map(function (p) { return p.trim(); });
    var name = parts.shift();
    if (!name) return;
    n++;
    var cells = '';
    for (var i = 0; i < headers.length; i++) {
      // A row shorter than the header line renders an em dash rather than an empty gap:
      // a table with a hole in it reads as a bug, and this reads as "no value".
      cells += '<span class="${P}-cell">' + escapeHtml(parts[i] === undefined ? '—' : parts[i]) + '</span>';
    }
    html += '<div class="${P}-row" data-row="' + n + '">'
          +   '<span class="${P}-row-index">' + n + '</span>'
          +   '<span class="${P}-row-name">' + escapeHtml(name) + '</span>'
          +   '<span class="${P}-row-cells">' + cells + '</span>'
          + '</div>';
  });
  host.innerHTML = html;
  // The rebuild replaced the lit row too. An update while a row is highlighted (a live ± on its
  // number, the data half of a Back or a Reset) lights the row the field names now.
  var root = document.querySelector('.${P}');
  var lit = root && root.classList.contains('${P}-spotlit') ? highlightedRow() : null;
  if (lit) lit.classList.add('${P}-row-on');
}

// highlightedRow(): the row the highlight field names, held to the table - the first row below
// it, the last above it - so Highlight row never presses into nothing.
function highlightedRow() {
  var rows = document.querySelectorAll('.${P}-row');
  if (rows.length === 0) return null;
  var at = parseInt((document.getElementById('f4') || { textContent: '' }).textContent, 10);
  return rows[Math.min(Math.max(isNaN(at) ? 1 : at, 1), rows.length) - 1];
}

// clearHighlight(): every row back at one level.
function clearHighlight() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-spotlit');
  var rows = document.querySelectorAll('.${P}-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('${P}-row-on');
}

// applyHighlight(): lift the row the payload named — the one the caster is talking about.
function applyHighlight() {
  clearHighlight();
  var row = highlightedRow();
  if (!row) return;
  var root = document.querySelector('.${P}');
  if (root) root.classList.add('${P}-spotlit');
  row.classList.add('${P}-row-on');
  gsap.fromTo(row, { x: -10 }, { x: 0, duration: 0.36 / motionSpeed(), ease: 'back.out(1.6)' });
}

// markFinal(): the table is no longer provisional. This is what turns a standings board into
// a RESULT table — same rows, same columns, a different claim about them. The leader's row is the
// one lit, so a highlight the table had goes.
function markFinal() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  clearHighlight();
  root.classList.add('${P}-final');
  gsap.fromTo('.${P}-box', { scale: 1.015 }, { scale: 1, duration: 0.4 / motionSpeed(), ease: 'back.out(1.5)' });
}

// clearFinal(): back to provisional (a correction mid-show is a real thing).
function clearFinal() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-final');
}

// compClearMarks(): play()'s visual reset — provisional, level, ready to replay.
function compClearMarks() {
  clearHighlight();
  clearFinal();
}

${READY_GUARD_JS}`;

// ── The bracket ──────────────────────────────────────────────────────────────

export const BRACKET_FIELDS: TypeField[] = [
  { key: 'title', label: 'Title', kind: 'text', value: 'PLAYOFF BRACKET', role: 'line' },
  {
    key: 'ties',
    label: 'Ties (one per line: "Round | Side A score | Side B score")',
    kind: 'lines',
    value:
      'QUARTER-FINALS | TEAM LIQUID 2 | MOUZ 1\n' +
      'QUARTER-FINALS | NAVI 2 | G2 0\n' +
      'SEMI-FINALS | TEAM LIQUID 2 | VITALITY 1\n' +
      'SEMI-FINALS | NAVI 2 | FAZE 1\n' +
      'FINAL | TEAM LIQUID — | NAVI —',
    role: 'data',
  },
  { key: 'round', label: 'Round being played', kind: 'text', value: 'FINAL', role: 'data' },
  { key: 'champion', label: 'Champion', kind: 'text', value: 'TEAM LIQUID', role: 'data' },
];

/** The bracket's markup — the round columns are rebuilt from the source. */
export function bracketMarkup(o: ResolvedOptions): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: the bracket's title, and the champion banner once there is one. -->
      <div class="${P}-head">
        <div class="${P}-heading">
          <div class="${P}-mask"><span id="f0" class="${P}-title">${value(0, 'PLAYOFF BRACKET')}</span></div>
        </div>
        <span class="${P}-champion"></span>
      </div>
      <!-- The accent rule between the heading and the rounds. -->
      <div class="${P}-accent"></div>
      <!-- The body: one column per round, each holding that round's ties. -->
      <div class="${P}-body" id="${P}-rounds"></div>
    </div>
${hiddenSource('f1', BRACKET_FIELDS[1].value, 'Tie source (f1) — one "Round | Side A score | Side B score" per line.')}
${hiddenSource('f2', BRACKET_FIELDS[2].value, 'The round being played (f2) — the cursor the advance event moves.')}
${hiddenSource('f3', BRACKET_FIELDS[3].value, 'The champion (f3) — named by the crown event, never by a data write.')}`;
}

/**
 * The bracket runtime. Rounds are GROUPED from the tie lines, in the order they first appear,
 * so the operator never types a structure — they type the ties and the board finds the rounds.
 */
export const BRACKET_RUNTIME_JS = `${ESCAPE_HTML_JS}

// compRebuild(): parse the hidden #f1 source and rebuild the round columns. Ties are grouped
// by their round name IN THE ORDER THE ROUNDS FIRST APPEAR — so quarter-finals stay left of
// semi-finals without the operator declaring a structure anywhere.
function compRebuild() {
  var host = document.getElementById('${P}-rounds');
  if (!host) return;
  var source = (document.getElementById('f1') || { textContent: '' }).textContent;
  var order = [];
  var byRound = {};
  source.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') return;
    var parts = line.split('|').map(function (p) { return p.trim(); });
    var round = parts[0];
    var a = parts[1] || '';
    var b = parts[2] || '';
    if (!round || (a === '' && b === '')) return;  // a line with no tie in it is skipped
    if (!byRound[round]) { byRound[round] = []; order.push(round); }
    byRound[round].push({ a: a, b: b });
  });
  var html = '';
  order.forEach(function (round) {
    var ties = byRound[round].map(function (tie) {
      return '<div class="${P}-tie">'
           +   '<span class="${P}-tie-side">' + escapeHtml(tie.a) + '</span>'
           +   '<span class="${P}-tie-side">' + escapeHtml(tie.b) + '</span>'
           + '</div>';
    }).join('');
    html += '<div class="${P}-round" data-round="' + escapeHtml(round).toUpperCase() + '">'
          +   '<span class="${P}-round-name">' + escapeHtml(round) + '</span>'
          +   '<div class="${P}-ties">' + ties + '</div>'
          + '</div>';
  });
  host.innerHTML = html;
}

// currentRound(): the column the cursor field names, or null.
function currentRound() {
  var host = document.getElementById('${P}-rounds');
  var wanted = String((document.getElementById('f2') || { textContent: '' }).textContent).trim().toUpperCase();
  if (!host || wanted === '') return null;
  return host.querySelector('[data-round="' + wanted.replace(/"/g, '') + '"]');
}

// clearRound(): no column is the live one.
function clearRound() {
  var rounds = document.querySelectorAll('.${P}-round');
  for (var i = 0; i < rounds.length; i++) rounds[i].classList.remove('${P}-round-on');
}

// applyRound(): put the cursor on the round the payload named, and say so with a small move.
function applyRound() {
  clearRound();
  var round = currentRound();
  if (!round) return;              // an unknown round name leaves the board unmarked
  var root = document.querySelector('.${P}');
  // The root remembers that a cursor is live, so a rebuild (new ties typed mid-show) can put
  // the mark back without the machine having to re-fire the event.
  if (root) root.classList.add('${P}-round-live');
  round.classList.add('${P}-round-on');
  gsap.fromTo(round, { y: -10 }, { y: 0, duration: 0.36 / motionSpeed(), ease: 'back.out(1.6)' });
}

// crownChampion(): the bracket is won. The banner takes the name from the champion field —
// which is DATA, applied here because the operator's event said the moment had come.
function crownChampion() {
  var root = document.querySelector('.${P}');
  var banner = document.querySelector('.${P}-champion');
  if (!root || !banner) return;
  var name = String((document.getElementById('f3') || { textContent: '' }).textContent).trim();
  if (name === '') return;         // nothing typed yet — nothing to crown
  banner.textContent = name + ' — CHAMPIONS';
  root.classList.add('${P}-crowned');
  gsap.fromTo(banner, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5 / motionSpeed(), ease: 'back.out(1.8)' });
}

// compRepaint(): the cursor is machine-owned, but a rebuilt board must not FORGET where it
// was — repainting keeps the mark the machine put there, without animating it again.
function compRepaint() {
  var root = document.querySelector('.${P}');
  if (!root || !root.classList.contains('${P}-round-live')) return;
  var round = currentRound();
  if (round) round.classList.add('${P}-round-on');
}

// compClearMarks(): play()'s visual reset — no cursor, no champion.
function compClearMarks() {
  var root = document.querySelector('.${P}');
  var banner = document.querySelector('.${P}-champion');
  clearRound();
  if (root) root.classList.remove('${P}-crowned', '${P}-round-live');
  if (banner) banner.textContent = '';
}

${READY_GUARD_JS}`;

// ── The timing tower ─────────────────────────────────────────────────────────

export const TIMING_FIELDS: TypeField[] = [
  { key: 'title', label: 'Session', kind: 'text', value: 'RACE · LAP 24 / 58', role: 'line' },
  { key: 'subtitle', label: 'What the times mean', kind: 'text', value: 'GAP TO LEADER', role: 'line' },
  {
    key: 'order',
    label: 'Running order (one per line: "VER +0.000", or "VER | +0.000 | PIT")',
    kind: 'lines',
    value: 'VER | +0.000\nNOR | +1.284\nLEC | +3.902\nHAM | +5.117\nRUS | +8.640 | PIT',
    role: 'data',
  },
  // 1, not 0: the Focus competitor press lights a row the first time it is pressed (#2268). A
  // number past either end of the order lights the row at that end (`focusedRow`).
  { key: 'focus', label: 'Competitor in focus', kind: 'number', value: '1', role: 'data' },
];

/**
 * The type's field list carrying ONE design's own running order.
 *
 * `TypeDesign.samples` lets a design keep the LINES it was written around; a tower's rows are
 * the same kind of thing and cannot go through that map, because only line fields ride the
 * wizard's Fields step. So a design passes its own order here instead — which is what makes
 * "one type, many sports" a real claim rather than a caption: a swimming split board, a
 * qualifying sheet and a cycling gap board are the same graphic showing different content, and
 * they browse as three recognisable designs instead of three motorsport towers.
 */
export function timingFields(order: string): TypeField[] {
  return TIMING_FIELDS.map((field) => (field.key === 'order' ? { ...field, value: order } : field));
}

/** The tower's markup — the rows are rebuilt from the source, so the body starts empty. */
export function timingMarkup(o: ResolvedOptions, order: string): string {
  const value = (i: number, fallback: string) => o.lines[i]?.sample ?? fallback;
  return `    <div class="${P}-box">
      <!-- The head: which session this is, and what the time column is measuring. -->
      <div class="${P}-head">
        <div class="${P}-heading">
          <div class="${P}-mask"><span id="f0" class="${P}-title">${value(0, 'RACE · LAP 24 / 58')}</span></div>
          <div class="${P}-mask"><span id="f1" class="${P}-kicker">${value(1, 'GAP TO LEADER')}</span></div>
        </div>
      </div>
      <!-- The accent rule between the heading and the order. -->
      <div class="${P}-accent"></div>
      <!-- The body: one row per competitor, rendered from the source field below. -->
      <div class="${P}-body" id="${P}-rows"></div>
    </div>
${hiddenSource('f2', order, 'Running order (f2) — one competitor per line, in position order.')}
${hiddenSource('f3', TIMING_FIELDS.find((field) => field.key === 'focus')!.value, 'The competitor in focus (f3) — DATA. One "focused" state carries any row.')}`;
}

/**
 * The timing-tower runtime.
 *
 * The tower is the one board in this category that stays on air WHILE its data moves: an
 * operator retypes the order every few seconds during a session. Two consequences are written
 * into the code below and are not decoration:
 *
 *  - the rebuild throws the rows away and makes them again, so `compRepaint` puts the machine's
 *    focus mark BACK afterwards (the bracket's cursor precedent) — otherwise the caster's
 *    highlight would vanish on the next timing update, which no operator would ever trust;
 *  - nothing here reorders anything. The order on screen is the order in the field, in the
 *    operator's typing order, because the timing feed is the authority on who is where and a
 *    graphic that sorted would disagree with it the moment a lap time was mis-keyed.
 */
export const TIMING_RUNTIME_JS = `${ESCAPE_HTML_JS}

// The tags that mean a competitor is no longer running. A tower dims those rows rather than
// dropping them: "who retired" is information, and a row that silently disappears reads as a
// bug to the person watching the order.
var TIMING_GONE = ' OUT DNF DNS DSQ RET RETIRED ';

// timingParts(line): one competitor row, split the two ways an operator actually types one.
//
//   "VER | +0.000 | PIT"  the canonical pipe form — competitor, time, and an optional tag
//   "VER +0.000"          the shorthand, because a tower gets typed at speed mid-session: the
//                         LAST run of whitespace splits it, and a time never contains a space
//
// A line with neither a pipe nor a space is all competitor — someone with no time yet.
function timingParts(line) {
  var pipe = line.indexOf('|');
  if (pipe !== -1) {
    var rest = line.slice(pipe + 1);
    var second = rest.indexOf('|');
    return {
      name: line.slice(0, pipe).trim(),
      time: (second === -1 ? rest : rest.slice(0, second)).trim(),
      tag: second === -1 ? '' : rest.slice(second + 1).trim()
    };
  }
  var split = /^(.*\\S)\\s+(\\S+)$/.exec(line);
  if (!split) return { name: line, time: '', tag: '' };
  return { name: split[1].trim(), time: split[2].trim(), tag: '' };
}

// compRebuild(): rebuild the running order from the hidden #f2 source. The POSITION is the
// line's place in the field — an operator types the order, never the numbers, so the tower and
// the timing feed cannot disagree about who is third.
function compRebuild() {
  var host = document.getElementById('${P}-rows');
  if (!host) return;
  var source = (document.getElementById('f2') || { textContent: '' }).textContent;
  var html = '';
  var n = 0;
  var anyTag = false;
  source.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') return;                       // skip blank lines
    var parts = timingParts(line);
    if (parts.name === '') return;
    if (parts.tag !== '') anyTag = true;
    n++;
    var gone = parts.tag !== '' && TIMING_GONE.indexOf(' ' + parts.tag.toUpperCase() + ' ') !== -1;
    var cls = '${P}-row'
      + (n === 1 ? ' ${P}-row-lead' : '')          // the leader is a look, not a state
      + (gone ? ' ${P}-row-gone' : '');
    html += '<div class="' + cls + '" data-row="' + n + '">'
          +   '<span class="${P}-row-index">' + n + '</span>'
          +   '<span class="${P}-row-name">' + escapeHtml(parts.name) + '</span>'
          +   '<span class="${P}-row-time">' + escapeHtml(parts.time) + '</span>'
          +   '<span class="${P}-row-tag">' + escapeHtml(parts.tag) + '</span>'
          + '</div>';
  });
  host.innerHTML = html;
  // The status column is reserved only while somebody is using it — see the CSS note on
  // .${P}-has-tags. This is DATA, so the rebuild owns it in both directions.
  var root = document.querySelector('.${P}');
  if (!root) return;
  if (anyTag) root.classList.add('${P}-has-tags');
  else root.classList.remove('${P}-has-tags');
}

// focusedRow(): the row the focus field names, held to the order - the first row below it, the
// last above it - so Focus competitor never presses into nothing. Null only with no rows.
function focusedRow() {
  var rows = document.querySelectorAll('.${P}-row');
  if (rows.length === 0) return null;
  var at = parseInt((document.getElementById('f3') || { textContent: '' }).textContent, 10);
  return rows[Math.min(Math.max(isNaN(at) ? 1 : at, 1), rows.length) - 1];
}

// clearFocus(): the whole field back at one level.
function clearFocus() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-spotlit');
  var rows = document.querySelectorAll('.${P}-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('${P}-row-on');
}

// applyFocus(): lift the row the event's payload named — the competitor being talked about.
// One state carries any row, so a twenty-car field needs no twenty states.
function applyFocus() {
  clearFocus();
  // The tower is in focus even with no rows yet (the CSS dims rows only), so the rows a timing
  // update brings in next light the named one through compRepaint.
  var root = document.querySelector('.${P}');
  if (root) root.classList.add('${P}-spotlit');
  var row = focusedRow();
  if (!row) return;                // no rows: nothing to lift yet
  row.classList.add('${P}-row-on');
  gsap.fromTo(row, { x: -10 }, { x: 0, duration: 0.34 / motionSpeed(), ease: 'back.out(1.6)' });
}

// markFinal(): the session is over and the order stops being live — the same claim the
// standings board's FINAL makes, at the moment a chequered flag makes it.
function markFinal() {
  var root = document.querySelector('.${P}');
  if (!root) return;
  root.classList.add('${P}-final');
  gsap.fromTo('.${P}-box', { scale: 1.015 }, { scale: 1, duration: 0.4 / motionSpeed(), ease: 'back.out(1.5)' });
}

// clearFinal(): back to a running session (a red flag, or a result declared too early).
function clearFinal() {
  var root = document.querySelector('.${P}');
  if (root) root.classList.remove('${P}-final');
}

// compRepaint(): a rebuild destroyed the rows the machine had marked, so put the mark back —
// without animating it again. This is what lets the timing data keep moving underneath a
// focus the caster set two laps ago.
function compRepaint() {
  var root = document.querySelector('.${P}');
  if (!root || !root.classList.contains('${P}-spotlit')) return;
  var row = focusedRow();
  if (row) row.classList.add('${P}-row-on');
}

// compClearMarks(): play()'s visual reset — a level, running session on every replay.
function compClearMarks() {
  clearFocus();
  clearFinal();
}

${READY_GUARD_JS}`;

// ── Shared layout ────────────────────────────────────────────────────────────

/** The board layout every results design has in common (rows, heading, columns). */
export function boardStructureCss(): string {
  return `/* ── The board's layout (shared by every results design). ── */

/* A board reads left-to-right whatever corner it is parked in — the root's zone alignment is
   for straps, and would otherwise right-align every name in a right-hand zone. */
.${P}-head,
.${P}-body {
  text-align: left;
}

/* The accent is a RULE, sitting in the flow between the heading and the rows: no design has
   to guess an offset that a two-line heading would then break. */
.${P}-accent {
  width: 100%;
  flex-shrink: 0;
}

.${P}-head {
  display: flex;                   /* the heading block, and whatever sits beside it */
  align-items: flex-end;           /* headings and column labels share a baseline */
  justify-content: space-between;
  gap: calc(24px * var(--scale));
}

.${P}-heading {
  display: flex;                   /* title over its kicker */
  flex-direction: column;
  min-width: 0;
}

.${P}-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(64px * var(--scale));
  height: calc(64px * var(--scale));
  flex-shrink: 0;
}
.${P}-logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.${P}-body {
  display: flex;                   /* one row per line the operator typed… */
  flex-direction: column;          /* …stacked */
  gap: calc(6px * var(--scale));
}

/* One row: its number, the name, and whatever trails it (a role, a set of cells). */
.${P}-row {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--scale));
  will-change: transform, opacity; /* the measured cascade moves each row */
}

.${P}-row-name {
  flex: 1;                         /* the name takes the slack… */
  min-width: 0;                    /* …and wraps rather than overflowing */
}

.${P}-row-index {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;  /* the numbers line up down the board */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* The value cells of a standings row, and the header labels above them: one grid, so the
   columns line up however many the operator declared. */
.${P}-row-cells,
.${P}-columns {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--scale));
  flex-shrink: 0;
}

.${P}-cell,
.${P}-col {
  width: calc(64px * var(--scale));
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* A bracket column and its ties. */
.${P}-round {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--scale));
  min-width: calc(230px * var(--scale));
  will-change: transform, opacity;
}

.${P}-ties {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--scale));
  justify-content: space-around;   /* ties spread down their column, bracket-style */
  height: 100%;
}

.${P}-tie {
  display: flex;
  flex-direction: column;
}

/* The champion banner is empty until the bracket is won, so it takes no room before that. */
.${P}-champion:empty {
  display: none;
}`;
}

/**
 * The timing tower's shape, on top of the board layout — the four timing designs share it.
 *
 * The board designs give themselves a 1000px footprint floor so a table reads as data at a
 * glance. A tower makes the OPPOSITE decision for the opposite graphic: it is a narrow column
 * parked against one edge for a whole session, so the picture behind it stays the shot. Width,
 * not min-width, is the point.
 */
export function towerStructureCss(): string {
  return `/* ── The tower's shape (shared by every timing design). ── */

.${P}-box {
  width: calc(520px * var(--scale));
}

/* One timing row: position · competitor · time · an optional tag. */
.${P}-row {
  gap: calc(14px * var(--scale));
}

/* The position sits in its own fixed cell, so the competitors below it line up whether the
   field runs to five or to twenty. */
.${P}-row-index {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* The competitor — a three-letter code, a surname, a lane. ALWAYS one line, and the bound is
   on the span: overflow on the ROW would clip the paint and leave the layout box wide enough
   to shove the time out of the tower (src/templates/AGENTS.md, the clip rule). overflow-X
   only — the shorthand 'overflow: hidden' clips BOTH axes, and some fonts' glyphs sit a few
   px taller than their own line-height, which clipped the tops of ascenders here. */
.${P}-row-name {
  white-space: nowrap;
  overflow-x: hidden;
  text-overflow: ellipsis;
}

/* The time column — tabular, so the decimal points stack straight down the tower. */
.${P}-row-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  white-space: nowrap;
}

/* The status tag (PIT · OUT · DNF · a team name). Most rows carry none most of the time. */
.${P}-row-tag {
  flex-shrink: 0;
}

.${P}-row-time:empty,
.${P}-row-tag:empty {
  display: none;
}

/* THE RESERVED STATUS COLUMN. The moment ANY competitor carries a status, the tag becomes a
   real column on every row — including the rows that have none, which draw nothing in it.
   Without that, one car pitting steps the whole time column sideways, and a graphic whose
   entire job is a column of times must never move its own numbers. The runtime only sets
   this class when there IS a status, so a clean order still spends no width on it. */
.${P}-has-tags .${P}-row-tag {
  width: calc(58px * var(--scale));
  text-align: center;
}

.${P}-has-tags .${P}-row-tag:empty {
  display: inline-block;           /* keep the column… */
  background: none;                /* …and draw nothing in it */
  box-shadow: none;
}`;
}

/** The bracket's body runs in COLUMNS rather than rows — the one shape change it needs. */
export function bracketBodyCss(): string {
  return `/* The bracket's body is a row of round columns, not a stack of rows. */
.${P}-body {
  flex-direction: row;
  align-items: stretch;
  gap: calc(22px * var(--scale));
}`;
}

// ── The authoring API ────────────────────────────────────────────────────────

/** Define one results-category variant (any of its three types). */
export function defineResultsVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: CompMeta,
  buildDesign: (o: ResolvedOptions) => CompDesign,
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  return defineCompetitionVariant(RESULTS_CATEGORY, spec, meta, buildDesign, refine);
}
