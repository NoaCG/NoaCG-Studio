// sb26 "Sticker Score" - the STICKER family's two-player score (types/duelScore.ts), sibling of
// qz13 Sticker Quiz and lt68 Sticker Strap.
//
// Two separate labels, one per player, each a flat sticker with a thick ink outline and a hard
// offset shadow: the name on paper, the score in a solid ink block at the label's INNER end, so
// the two numbers face each other across a tilted accent diamond. The box paints nothing - the
// stickers are the graphic, which is what lets the picture show between them.
//
// Drawn symmetric top to bottom, so it sits as well at the bottom of the frame as at the top.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineScoreboardVariant } from './shared';
import { DUEL_NAMES, duelFields, duelRuntimeJs } from './duelShared';

export const sb26: TemplateVariant = defineScoreboardVariant(
  {
    id: 'sb26',
    category: 'scoreboard',
    name: 'Sticker Score',
    styleTag: 'sticker',
    description:
      'Neo-brutal two-player score: two outlined name labels with ink score blocks, a tilted accent diamond between them.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Player 1', sample: DUEL_NAMES[0] },
      { title: 'Score 1', sample: '0' },
      { title: 'Player 2', sample: DUEL_NAMES[1] },
      { title: 'Score 2', sample: '0' },
    ],
    logo: 'none',
    animationPresets: ['snap-stinger', 'slide-down', 'slide-up', 'mask-wipe', 'fade'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'top-center',
  },
  {
    name: 'Sticker Score',
    description:
      'The neo-brutal two-player score. Two flat labels with thick outlines and hard shadows, ' +
      'the scores in solid ink blocks facing each other across a tilted accent diamond. A ' +
      'changed score pops; "Final score" floods the leader\'s label and flattens the other.',
    uicolor: '2',
  },
  () => ({
    html: `    <!-- Sticker Score: [NAME | score]  diamond  [score | NAME] - two labels, nothing around them. -->
    <div class="scoreboard-box">
      <!-- Player 1: the name, then the score block at the label's inner end. -->
      <div class="scoreboard-side scoreboard-side-a">
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f0" class="scoreboard-team">${DUEL_NAMES[0]}</span></div>
        <div class="scoreboard-block"><div class="scoreboard-mask"><span id="f1" class="scoreboard-score">0</span></div></div>
      </div>
      <!-- The centre mark - the design's accent, and what kicks when a point is scored. -->
      <div class="scoreboard-accent"></div>
      <!-- Player 2: mirrored - the score block first, then the name. -->
      <div class="scoreboard-side scoreboard-side-b">
        <div class="scoreboard-block"><div class="scoreboard-mask"><span id="f3" class="scoreboard-score">0</span></div></div>
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f2" class="scoreboard-team">${DUEL_NAMES[1]}</span></div>
      </div>
    </div>`,
    css: `/* The box: layout only. Two labels and a mark on one centre line. */
.scoreboard-box {
  display: flex;
  align-items: center;
  padding: 0 calc(12px * var(--scale)) calc(12px * var(--scale)) 0;  /* room for the hard shadows,
                                      which fall down-right and would otherwise be cut by the stage */
}

/* One player's LABEL: the family's flat panel, thick outline and hard shadow. Both labels take
   an equal share of the strip - a long name wraps inside its own half, it never sizes the graphic. */
.scoreboard-side {
  flex: 1 1 0;                     /* equal halves, whatever the names are */
  min-width: 0;                    /* lets a long name shrink instead of pushing the strip wider */
  display: flex;
  align-items: stretch;            /* the score block runs the label's full height */
  min-height: calc(86px * var(--scale));
  background: var(--panel-bg);
  border-radius: var(--panel-radius);
  box-shadow: var(--panel-keyline), var(--panel-shadow);
  transform: rotate(-0.8deg);      /* hand-placed, not machine-aligned */
  transition: background-color 0.12s steps(2), box-shadow 0.12s steps(2);  /* the family snaps, it never eases */
}
.scoreboard-side-b { transform: rotate(0.8deg); }  /* the two labels lean away from each other */

/* The name. */
.scoreboard-name-mask {
  flex: 1 1 0;                     /* the name takes whatever the block leaves */
  min-width: 0;
  display: flex;
  align-items: center;
  padding: calc(10px * var(--scale)) calc(26px * var(--scale));
}
.scoreboard-side-b .scoreboard-name-mask { justify-content: flex-end; }  /* player 2 reads from the outside in */
.scoreboard-team {
  font-size: calc(36px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.05;
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
  color: var(--text-color);
}

/* The score block: a solid ink slab at the label's inner end. */
.scoreboard-block {
  flex: none;                      /* never squeezes */
  min-width: calc(104px * var(--scale));  /* two digits without the label jumping */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 calc(16px * var(--scale));
  background: var(--text-color);   /* ink */
}
.scoreboard-score {
  font-size: calc(56px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.08;               /* the figure's whole glyph box, so the pop never shaves a digit */
  color: var(--panel-bg);          /* paper-coloured figure on the ink */
  font-family: var(--font-numeric);  /* a face whose digits share one width */
  font-variant-numeric: lining-nums tabular-nums;  /* no jitter as the score climbs */
}

/* The centre mark: a tilted accent diamond with the same outline and hard shadow. */
.scoreboard-accent {
  flex: none;
  width: calc(44px * var(--scale));
  height: calc(44px * var(--scale));
  margin: 0 calc(26px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(5px * var(--scale)) var(--text-color),
              calc(6px * var(--scale)) calc(6px * var(--scale)) 0 var(--text-color);
  transform: rotate(45deg);        /* a square on its corner */
  will-change: transform;          /* the Point timeline scales it */
}

/* ── Final score ── the leader's label floods accent and sits straight; the other goes flat. */
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b {
  background: var(--accent);
  transform: rotate(0deg);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-team,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-team {
  color: var(--accent-ink);
}
/* The other label goes flat on the table and its CONTENT fades - never the paper, because a
   translucent label over moving picture stops reading as a sticker. */
.scoreboard-final.scoreboard-lead-a .scoreboard-side-b,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-a {
  box-shadow: var(--panel-keyline);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-b .scoreboard-block,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-a .scoreboard-block {
  opacity: 0.4;
}
/* The name fades through its COLOUR, not its opacity: the entrance leaves an inline opacity on
   every line, and an inline style outranks any rule written here. */
.scoreboard-final.scoreboard-lead-a .scoreboard-side-b .scoreboard-team,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-a .scoreboard-team {
  color: rgba(17, 17, 17, 0.4);    /* fallback: no color-mix() before Chromium 111 */
  color: color-mix(in srgb, var(--text-color) 40%, transparent);
}`,
    hasAccent: true,
    // The stage: two labels that each hold a ten-letter name beside a two-digit score.
    stageWidth: 1060,
    fields: duelFields(),
    matchClock: false,               // no clock is drawn, so the shared clock runtime stays out
    runtimeExtraJs: duelRuntimeJs(),
  }),
);
