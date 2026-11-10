// THE RESULT BOARDS (interaction spec, AC-12): the vote's result in three LAYOUTS - bars across,
// bars up and a donut - each drawn for three PLACEMENTS - full screen, a lower third and a side
// card. Nine designs, one house family, one runtime, so a production picks the shape its picture
// needs and every one of them follows the look (the family tokens, never a fixed colour).
//
// What makes them result templates rather than more vote boards: the FIGURES field (percent,
// count or both, `shared.ts PollDesign.figures`), room for two to eight options, and a long
// option name that wraps to two lines and then ends in an ellipsis instead of pushing the board
// out of its stage. Everything else is the live vote: the same four fields first, so result
// staging (control/resultStaging.ts `pollFieldMap`) fills them by title, the same arc and
// buttons, the same growth builder and winner call.
//
// The three layouts share the growth builder by sharing its one contract: a `.poll-bar-fill`
// whose WIDTH grows to its share. Bars up turn that track a quarter turn, so the width the
// builder grows reads as height; the donut keeps a hidden track per option and paints its ring
// from those widths as they grow (`pollDonutPaint`), so the ring sweeps with the same timing and
// a snap to the result shows the finished ring.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { NUMERIC_FIGURES } from '../shared/numerals';
import { definePollVariant } from './shared';

export type ResultLayout = 'across' | 'up' | 'donut';
export type ResultPlacement = 'full' | 'lower' | 'side';

const LAYOUT_NAMES: Record<ResultLayout, string> = { across: 'Bars', up: 'Columns', donut: 'Donut' };
const PLACEMENT_NAMES: Record<ResultPlacement, string> = { full: 'Full', lower: 'Lower', side: 'Side' };
const LAYOUT_WORDS: Record<ResultLayout, string> = {
  across: 'bars across',
  up: 'bars up',
  donut: 'a donut with its legend',
};
const PLACEMENT_WORDS: Record<ResultPlacement, string> = {
  full: 'a full-screen board',
  lower: 'a lower-third band',
  side: 'a side card',
};

/** The room each placement was drawn for, in px at 1080p, and where it sits by default. */
const STAGE: Record<ResultPlacement, { width: number; zone: 'mid-center' | 'bottom-center' | 'mid-left' }> = {
  full: { width: 1560, zone: 'mid-center' },
  lower: { width: 1600, zone: 'bottom-center' },
  side: { width: 660, zone: 'mid-left' },
};

const SAMPLE = {
  question: 'Which song closes the show?',
  options: 'The long way home | 4120\nNorthern lights | 2675\nStill standing | 1840\nOne more night | 905',
  footnote: '9,540 votes · voting closed',
  cue: 'RESULT',
};

// ── Rows: one markup per layout, the figures shared ─────────────────────────────────────────

const FIGURES_JS = `// pollFiguresHtml(row): the row's figure as the Figures field asks. The FIRST .poll-row-value
// in a row is the one the growth builder counts up from 0% to its share, so a count-only row
// keeps a hidden one first and shows its count beside it; both show the share, then the count.
function pollFiguresHtml(row) {
  var mode = pollFiguresMode();
  var p = escapeHtml(row.percentText);
  var c = escapeHtml(pollCountText(row.count));
  var share = '<span class="poll-row-value' + (mode === 'count' ? ' poll-row-tally' : '') + '" data-target="' + p + '">' + p + '</span>';
  var count = mode === 'percent' ? '' : '<span class="poll-row-value poll-row-count">' + c + '</span>';
  return '<span class="poll-row-figures">' + share + count + '</span>';
}`;

const ROW_JS: Record<ResultLayout, string> = {
  across: `// renderPollRow(row): one option on one line - its label, its track, its figures.
function renderPollRow(row) {
  return '<div class="poll-row">'
       +   '<span class="poll-row-label">' + escapeHtml(row.label) + '</span>'
       +   '<div class="poll-bar"><div class="poll-bar-fill" data-value="' + row.percent + '"></div></div>'
       +   pollFiguresHtml(row)
       + '</div>';
}`,
  up: `// renderPollRow(row): one option as a column - its figures, its upright track, its label.
function renderPollRow(row) {
  return '<div class="poll-row">'
       +   pollFiguresHtml(row)
       +   '<div class="poll-col"><div class="poll-bar"><div class="poll-bar-fill" data-value="' + row.percent + '"></div></div></div>'
       +   '<span class="poll-row-label">' + escapeHtml(row.label) + '</span>'
       + '</div>';
}`,
  donut: `// renderPollRow(row): one legend entry - its swatch, its label, its figures - and the hidden
// track whose width the ring is painted from.
function renderPollRow(row) {
  return '<div class="poll-row">'
       +   '<span class="poll-swatch"></span>'
       +   '<span class="poll-row-label">' + escapeHtml(row.label) + '</span>'
       +   pollFiguresHtml(row)
       +   '<div class="poll-bar"><div class="poll-bar-fill" data-value="' + row.percent + '"></div></div>'
       + '</div>';
}`,
};

/** The layout watcher: the row count as an attribute the stylesheet can read (a lower third
 *  turns five or more options into two columns), and the donut's ring repainted from its tracks
 *  whenever a track moves. A MutationObserver rather than a frame loop, so a renderer that never
 *  ticks animation frames (a thumbnail, a snapped preview) still paints the finished ring. */
const WATCH_JS = `// pollDonutPaint(): the ring, from the hidden tracks' current widths - one arc per option in
// row order, a hair of gap between arcs, in the segment colours the stylesheet derives from the
// look. Painted from what the tracks show, so it sweeps as they grow and stands still with them.
function pollDonutPaint() {
  var ring = document.querySelector('.poll-donut');
  if (!ring) return;
  var fills = document.querySelectorAll('#poll-rows .poll-bar-fill');
  var at = 0, stops = [];
  for (var i = 0; i < fills.length; i++) {
    var share = parseFloat(fills[i].style.width) || 0;
    if (share <= 0) continue;
    var end = Math.min(100, at + share);
    var cut = Math.max(at, end - 0.4);
    stops.push('var(--poll-seg-' + (i % 8) + ') ' + at + '% ' + cut + '%');
    stops.push('transparent ' + cut + '% ' + end + '%');
    at = end;
  }
  ring.style.backgroundImage = stops.length ? 'conic-gradient(' + stops.join(', ') + ', transparent ' + at + '% 100%)' : 'none';
}

// pollLayoutWatch(): keep the row count (on the rows and on the board) and the ring in step with
// the rows, from load on.
function pollLayoutWatch() {
  var host = document.getElementById('poll-rows');
  if (!host || host.pollWatched) return;
  host.pollWatched = true;
  var paint = function () {
    var n = String(host.querySelectorAll('.poll-row').length);
    if (host.getAttribute('data-rows') !== n) host.setAttribute('data-rows', n);
    var box = host.closest ? host.closest('.poll-box') : null;
    if (box && box.getAttribute('data-rows') !== n) box.setAttribute('data-rows', n);
    pollDonutPaint();
  };
  if (typeof MutationObserver === 'function') {
    new MutationObserver(paint).observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }
  paint();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pollLayoutWatch);
} else {
  pollLayoutWatch();
}`;

// ── Markup ──────────────────────────────────────────────────────────────────────────────────

function html(layout: ResultLayout, placement: ResultPlacement, lines: { sample: string }[]): string {
  const donut = layout === 'donut' ? `
        <!-- The ring: painted from the options' shares by pollDonutPaint(). -->
        <div class="poll-donut" aria-hidden="true"></div>` : '';
  return `    <!-- Result board: ${LAYOUT_WORDS[layout]} as ${PLACEMENT_WORDS[placement]}. -->
    <div class="poll-box poll-at-${placement} poll-lay-${layout}">
      <!-- The accent edge - the house amber bar. -->
      <div class="poll-accent"></div>
      <div class="poll-head">
        <!-- The badge: the operator's word for this moment; it leaves when voting closes. -->
        <div class="poll-cue"><span id="f3" class="poll-cue-text">${lines[3]?.sample || SAMPLE.cue}</span></div>
        <!-- The question - slides up from behind this overflow mask on entrance. -->
        <div class="poll-mask"><span id="f0">${lines[0]?.sample || SAMPLE.question}</span></div>
        <!-- The count line: how many voted. Plain operator text. -->
        <div class="poll-foot"><span id="f2">${lines[2]?.sample || SAMPLE.footnote}</span></div>
      </div>
      <div class="poll-chart">${donut}
        <!-- The options - rendered by pollRebuild() from the hidden source below the box. -->
        <div id="poll-rows"></div>
      </div>
    </div>`;
}

// ── Style ───────────────────────────────────────────────────────────────────────────────────

/** Sizes per placement, in px at 1080p: question, label, figure, badge, foot. */
const TYPE: Record<ResultPlacement, { q: number; label: number; fig: number; cue: number; foot: number }> = {
  full: { q: 56, label: 30, fig: 32, cue: 22, foot: 22 },
  lower: { q: 38, label: 22, fig: 24, cue: 19, foot: 18 },
  side: { q: 36, label: 22, fig: 24, cue: 19, foot: 18 },
};

function baseCss(placement: ResultPlacement): string {
  const t = TYPE[placement];
  const wide = placement !== 'side';
  return `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The board - the house void panel. */
.poll-box {
  position: relative;              /* anchors the accent edge */
  text-align: left;                /* a results board reads from its left edge */
  padding: calc(${placement === 'full' ? 48 : 30}px * var(--scale)) calc(${placement === 'full' ? 64 : 44}px * var(--scale)) calc(${placement === 'full' ? 48 : 30}px * var(--scale)) calc(${placement === 'full' ? 70 : 50}px * var(--scale));
  background: var(--panel-bg);     /* the family's panel, translucent over the picture */
  backdrop-filter: var(--panel-blur);
  -webkit-backdrop-filter: var(--panel-blur);
  box-shadow: var(--panel-shadow);
${wide ? `  /* The category's wrap cap is drawn for a card; this board is wider. Lifted to its own stage,
     keeping the safe-area limit the cap also carries. */
  max-width: 1680px;               /* fallback: no CSS min() before Chromium 79 */
  max-width: min(calc(var(--stage-width) * var(--scale)), 1680px);
` : ''}}

/* The accent edge, fused to the board's left side. */
.poll-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--accent-weight);
  background: var(--accent);
  box-shadow: var(--accent-glow);
}

/* The badge - the house mono label. */
.poll-cue {
  display: inline-block;
  margin-bottom: calc(12px * var(--scale));
  will-change: transform, opacity; /* it leaves when voting closes */
}
.poll-cue-text {
  font-family: var(--font-label);
  font-size: calc(${t.cue}px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The question - the loudest words on the board. */
.poll-mask > span {
  font-size: calc(${t.q}px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.14;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The count line - quiet, under the question. */
.poll-foot {
  margin-top: calc(12px * var(--scale));
  font-family: var(--font-label);
  font-size: calc(${t.foot}px * var(--scale) * var(--type-scale));
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* An option's name: two lines at most, then an ellipsis - a long name never pushes the board
   out of its stage or a figure off its row. */
.poll-row-label {
  min-width: 0;
  font-size: calc(${t.label}px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.2;
  color: var(--text-color);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* The figures - the share, the count, or both. */
.poll-row-figures {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: calc(10px * var(--scale));
  white-space: nowrap;
}
.poll-row-value {
  ${NUMERIC_FIGURES}
  font-size: calc(${t.fig}px * var(--scale) * var(--type-scale));
  font-weight: 700;
  color: var(--accent);
}
/* The share the builder counts up, kept out of sight when only the count shows. */
.poll-row-tally { display: none; }
/* The count beside a share: the quieter of the two. */
.poll-row-value.poll-row-count:not(:first-child) {
  font-weight: 500;
  color: var(--text-dim);
}

/* The tracks - a faint groove the fill grows along. */
.poll-bar {
  background: color-mix(in srgb, var(--text-color) 10%, transparent);
  overflow: hidden;
}
.poll-bar-fill {
  height: 100%;
  background: var(--accent);
}

/* The called leader - the house glow and weight, never a second colour. */
.poll-winner .poll-bar-fill { box-shadow: var(--accent-glow); }
.poll-winner .poll-row-label {
  color: var(--accent);
  font-weight: 700;
}

/* Tied - nobody leads, so nobody is marked. */
.poll-tied .poll-foot::after {
  content: ' · too close to call';
  color: var(--accent);
}`;
}

/** Where the question sits against the chart: above it on a card or a full board, beside it on
 *  a lower third, which has to stay short. */
function placementCss(placement: ResultPlacement): string {
  if (placement === 'lower') {
    return `/* A lower third: the ask in a fixed left column, the chart taking the rest. */
.poll-box {
  display: grid;
  grid-template-columns: calc(440px * var(--scale)) minmax(0, 1fr);
  column-gap: calc(44px * var(--scale));
  align-items: center;
}
.poll-head {
  align-self: stretch;
  padding-right: calc(40px * var(--scale));
  border-right: 1px solid color-mix(in srgb, var(--text-color) 16%, transparent);
}
.poll-chart { min-width: 0; }`;
  }
  return `/* The ask above the chart. */
.poll-chart {
  margin-top: calc(${placement === 'full' ? 40 : 24}px * var(--scale));
  min-width: 0;
}`;
}

function layoutCss(layout: ResultLayout, placement: ResultPlacement): string {
  const label = { full: 420, lower: 220, side: 190 }[placement];
  const track = { full: 26, lower: 14, side: 14 }[placement];
  const colHeight = { full: 420, lower: 150, side: 240 }[placement];
  const colWidth = { full: 64, lower: 34, side: 30 }[placement];
  const ring = { full: 440, lower: 196, side: 300 }[placement];
  const gap = { full: 22, lower: 12, side: 14 }[placement];
  if (layout === 'across') {
    return `/* Bars across: one line per option - label, track, figures - every track starting at the
   same x, so the bars compare at a glance. */
#poll-rows {
  display: flex;
  flex-direction: column;
  gap: calc(${gap}px * var(--scale));
}
.poll-row {
  display: grid;
  grid-template-columns: calc(${label}px * var(--scale)) minmax(0, 1fr) auto;
  align-items: center;
  column-gap: calc(18px * var(--scale));
}
.poll-bar { height: calc(${track}px * var(--scale)); }
${placement === 'full' ? `/* Six or more options full screen: one line per name, so eight rows and a two-line question
   stay inside the safe area. */
#poll-rows[data-rows="6"] .poll-row-label, #poll-rows[data-rows="7"] .poll-row-label, #poll-rows[data-rows="8"] .poll-row-label {
  -webkit-line-clamp: 1;
}` : ''}
${placement === 'lower' ? `/* Five or more options in a lower third run in two columns, so the band stays short. */
#poll-rows[data-rows="5"], #poll-rows[data-rows="6"], #poll-rows[data-rows="7"], #poll-rows[data-rows="8"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: repeat(4, auto);
  grid-auto-flow: column;
  column-gap: calc(40px * var(--scale));
  row-gap: calc(8px * var(--scale));
}
#poll-rows[data-rows="5"] .poll-row, #poll-rows[data-rows="6"] .poll-row, #poll-rows[data-rows="7"] .poll-row, #poll-rows[data-rows="8"] .poll-row {
  grid-template-columns: calc(150px * var(--scale)) minmax(0, 1fr) auto;
}` : ''}`;
  }
  if (layout === 'up') {
    return `/* Bars up: one column per option, standing on one baseline - figures over the column, the
   name under it. The track is turned a quarter, so the width the builder grows reads as height. */
#poll-rows {
  display: flex;
  align-items: flex-end;
  gap: calc(${gap}px * var(--scale));
  --poll-col-h: calc(${colHeight}px * var(--scale));
}
.poll-row {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(8px * var(--scale));
}
.poll-row .poll-row-figures {
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.poll-row-label {
  align-self: stretch;
  text-align: center;
}
.poll-col {
  position: relative;
  width: calc(${colWidth}px * var(--scale));
  height: var(--poll-col-h);
}
.poll-col .poll-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  width: var(--poll-col-h);
  height: calc(${colWidth}px * var(--scale));
  transform-origin: 0 100%;
  transform: rotate(-90deg) translateY(100%);
}${placement === 'side' ? `
/* Six or more columns on a side card: the narrowest room any board here has, so the columns,
   their names and their figures step down a size. */
#poll-rows[data-rows="6"], #poll-rows[data-rows="7"], #poll-rows[data-rows="8"] {
  gap: calc(8px * var(--scale));
}
#poll-rows[data-rows="6"] .poll-row-label, #poll-rows[data-rows="7"] .poll-row-label, #poll-rows[data-rows="8"] .poll-row-label {
  font-size: calc(15px * var(--scale) * var(--type-scale));
}
#poll-rows[data-rows="6"] .poll-row-value, #poll-rows[data-rows="7"] .poll-row-value, #poll-rows[data-rows="8"] .poll-row-value {
  font-size: calc(17px * var(--scale) * var(--type-scale));
}
#poll-rows[data-rows="6"] .poll-col, #poll-rows[data-rows="7"] .poll-col, #poll-rows[data-rows="8"] .poll-col {
  width: calc(22px * var(--scale));
}
#poll-rows[data-rows="6"] .poll-col .poll-bar, #poll-rows[data-rows="7"] .poll-col .poll-bar, #poll-rows[data-rows="8"] .poll-col .poll-bar {
  height: calc(22px * var(--scale));
}` : ''}`;
  }
  return `/* A donut: the ring, and beside it (under it on a side card) the legend - a swatch in the
   ring's colour, the name, the figures. The legend's tracks only carry the shares. */
.poll {
  --poll-seg-0: var(--accent);
  --poll-seg-1: color-mix(in srgb, var(--text-color) 82%, transparent);
  --poll-seg-2: color-mix(in srgb, var(--accent) 50%, var(--text-color));
  --poll-seg-3: color-mix(in srgb, var(--text-color) 45%, transparent);
  --poll-seg-4: color-mix(in srgb, var(--accent) 55%, transparent);
  --poll-seg-5: color-mix(in srgb, var(--text-color) 28%, transparent);
  --poll-seg-6: color-mix(in srgb, var(--accent) 30%, var(--text-color));
  --poll-seg-7: color-mix(in srgb, var(--text-color) 16%, transparent);
}
.poll-chart {
  display: flex;
  ${placement === 'side' ? 'flex-direction: column;\n  align-items: stretch;' : 'align-items: center;'}
  gap: calc(${placement === 'full' ? 64 : 36}px * var(--scale));
}
.poll-donut {
  flex: none;
  ${placement === 'side' ? 'align-self: center;\n  ' : ''}width: calc(${ring}px * var(--scale));
  height: calc(${ring}px * var(--scale));
  border-radius: 50%;
  background-color: color-mix(in srgb, var(--text-color) 8%, transparent);
  -webkit-mask: radial-gradient(circle closest-side, transparent 58%, #000 calc(58% + 1px));
  mask: radial-gradient(circle closest-side, transparent 58%, #000 calc(58% + 1px));
}
#poll-rows {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(${gap}px * var(--scale));
}
.poll-row {
  display: grid;
  grid-template-columns: calc(${placement === 'full' ? 22 : 16}px * var(--scale)) minmax(0, 1fr) auto;
  align-items: center;
  column-gap: calc(14px * var(--scale));
}
.poll-swatch {
  width: calc(${placement === 'full' ? 22 : 16}px * var(--scale));
  height: calc(${placement === 'full' ? 22 : 16}px * var(--scale));
  border-radius: 50%;
}
.poll-row .poll-bar { display: none; }
${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `.poll-row:nth-child(${i + 1}) .poll-swatch { background: var(--poll-seg-${i}); }`).join('\n')}
${placement === 'side' ? `/* Six or more options on a side card: a smaller ring and one line per name, so the card stays
   inside the picture's safe area. */
#poll-rows[data-rows="6"], #poll-rows[data-rows="7"], #poll-rows[data-rows="8"] {
  gap: calc(8px * var(--scale));
}
#poll-rows[data-rows="6"] .poll-row-label, #poll-rows[data-rows="7"] .poll-row-label, #poll-rows[data-rows="8"] .poll-row-label {
  -webkit-line-clamp: 1;
}
.poll-box[data-rows="6"] .poll-donut, .poll-box[data-rows="7"] .poll-donut, .poll-box[data-rows="8"] .poll-donut {
  width: calc(220px * var(--scale));
  height: calc(220px * var(--scale));
}` : `/* Five or more options run the legend in two columns, so the board stays as tall as its ring. */
#poll-rows[data-rows="5"], #poll-rows[data-rows="6"], #poll-rows[data-rows="7"], #poll-rows[data-rows="8"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: repeat(4, auto);
  grid-auto-flow: column;
  column-gap: calc(36px * var(--scale));
}`}`;
}

// ── The nine designs ────────────────────────────────────────────────────────────────────────

function resultBoard(id: string, layout: ResultLayout, placement: ResultPlacement): TemplateVariant {
  const name = `Result ${LAYOUT_NAMES[layout]} ${PLACEMENT_NAMES[placement]}`;
  const description = `The vote's result as ${LAYOUT_WORDS[layout]} on ${PLACEMENT_WORDS[placement]}: two to eight options, the share, the count or both.`;
  return definePollVariant(
    {
      id,
      category: 'poll',
      name,
      styleTag: 'noacg',
      description,
      maxLines: 4,
      suggestedLines: [
        { title: 'Question', sample: SAMPLE.question },
        { title: 'Options', sample: SAMPLE.options },
        { title: 'Vote count', sample: SAMPLE.footnote },
        { title: 'Vote badge', sample: SAMPLE.cue },
      ],
      logo: 'none',
      animationPresets: ['poll-open'],
      defaultPalette: paletteById('noacg'),
      defaultFontId: 'space-grotesk',
      defaultZone: STAGE[placement].zone,
    },
    { name, description, uicolor: '4' },
    (o) => ({
      stageWidth: STAGE[placement].width,
      html: html(layout, placement, o.lines),
      css: `${baseCss(placement)}

${placementCss(placement)}

${layoutCss(layout, placement)}`,
      rowBuilderJs: `${FIGURES_JS}

${ROW_JS[layout]}`,
      extraJs: WATCH_JS,
      hasAccent: true,
      figures: true,
    }),
  );
}

export const RESULT_BOARD_SAMPLES = SAMPLE;

/** Every layout in every placement, by id: pl06..pl14. */
export const RESULT_BOARD_GRID: readonly { id: string; layout: ResultLayout; placement: ResultPlacement }[] = [
  { id: 'pl06', layout: 'across', placement: 'full' },
  { id: 'pl07', layout: 'across', placement: 'lower' },
  { id: 'pl08', layout: 'across', placement: 'side' },
  { id: 'pl09', layout: 'up', placement: 'full' },
  { id: 'pl10', layout: 'up', placement: 'lower' },
  { id: 'pl11', layout: 'up', placement: 'side' },
  { id: 'pl12', layout: 'donut', placement: 'full' },
  { id: 'pl13', layout: 'donut', placement: 'lower' },
  { id: 'pl14', layout: 'donut', placement: 'side' },
];

export const RESULT_BOARDS_CATALOG: TemplateVariant[] = RESULT_BOARD_GRID.map((g) => resultBoard(g.id, g.layout, g.placement));
