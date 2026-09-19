// sb28 "Arcade Score" - the ARCADE family's two-player score (types/duelScore.ts), sibling of
// qz15 Arcade Quiz and lt70 Arcade Strap.
//
// The top of a cabinet screen: one pixel-cornered bar with a glowing neon rim and scanlines,
// each player a mono name tag over a big glowing figure, and a column of three pixels as the
// divider between them. The figures are the loudest thing on it, the way a high score is.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the bar is
// TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.
//
// Drawn symmetric top to bottom, so it sits as well at the bottom of the frame as at the top.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineScoreboardVariant } from './shared';
import { DUEL_NAMES, duelFields, duelRuntimeJs } from './duelShared';

/** A rectangle with one square step cut out of each corner - the pixel corner. */
const pixelCorners = (px: number): string => {
  const s = `calc(${px}px * var(--scale))`;
  const e = `calc(100% - ${px}px * var(--scale))`;
  return `polygon(0 ${s}, ${s} ${s}, ${s} 0, ${e} 0, ${e} ${s}, 100% ${s}, 100% ${e}, ${e} ${e}, ${e} 100%, ${s} 100%, ${s} ${e}, 0 ${e})`;
};

export const sb28: TemplateVariant = defineScoreboardVariant(
  {
    id: 'sb28',
    category: 'scoreboard',
    name: 'Arcade Score',
    styleTag: 'arcade',
    description:
      'Cabinet-screen two-player score: a pixel-cornered neon bar, mono player tags, big glowing figures either side of a pixel divider.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Player 1', sample: DUEL_NAMES[0] },
      { title: 'Score 1', sample: '0' },
      { title: 'Player 2', sample: DUEL_NAMES[1] },
      { title: 'Score 2', sample: '0' },
    ],
    logo: 'none',
    animationPresets: ['slide-down', 'slide-up', 'mask-wipe', 'fade', 'snap-stinger'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'top-center',
  },
  {
    name: 'Arcade Score',
    description:
      'The cabinet-screen two-player score. One pixel-cornered bar with a glowing neon rim and ' +
      'scanlines: a mono name tag and a big glowing figure per player, a column of pixels ' +
      'between them. A changed score pops; "Final score" fills the leader\'s half and powers the other down.',
    uicolor: '3',
  },
  () => ({
    html: `    <!-- Arcade Score: [ NAME  00 ]  pixels  [ 00  NAME ] - one bar. -->
    <div class="scoreboard-box">
      <!-- Player 1: the name tag, then the figure towards the centre. -->
      <div class="scoreboard-side scoreboard-side-a">
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f0" class="scoreboard-team">${DUEL_NAMES[0]}</span></div>
        <div class="scoreboard-mask scoreboard-score-mask"><span id="f1" class="scoreboard-score">0</span></div>
      </div>
      <!-- The divider - three stacked pixels. The design's accent, and what kicks on a point. -->
      <div class="scoreboard-accent"></div>
      <!-- Player 2: mirrored - the figure first, then the name tag. -->
      <div class="scoreboard-side scoreboard-side-b">
        <div class="scoreboard-mask scoreboard-score-mask"><span id="f3" class="scoreboard-score">0</span></div>
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f2" class="scoreboard-team">${DUEL_NAMES[1]}</span></div>
      </div>
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The bar. Two clipped layers make the pixel-stepped rim (see the file header); the glow is a
   filter, because a box-shadow would be cut away by the clip. */
.scoreboard-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  display: flex;
  align-items: stretch;            /* both halves run the bar's full height, so the fill does too */
  padding: calc(5px * var(--scale));  /* the rim's weight - the halves start where the ground does */
  filter: drop-shadow(0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.scoreboard-box::before,
.scoreboard-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;                     /* behind the names and the figures */
}
/* The rim: the whole shape, in the neon. */
.scoreboard-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(10)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.scoreboard-box::after {
  top: calc(5px * var(--scale)); right: calc(5px * var(--scale));
  bottom: calc(5px * var(--scale)); left: calc(5px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    var(--panel-bg);
  clip-path: ${pixelCorners(7)};
}

/* One player's half. Both take an equal share - a long name wraps inside its own half. */
.scoreboard-side {
  flex: 1 1 0;
  min-width: 0;                    /* lets a long name shrink instead of pushing the bar wider */
  display: flex;
  align-items: center;
  min-height: calc(88px * var(--scale));
  padding: calc(6px * var(--scale)) calc(30px * var(--scale));
  transition: opacity 0.2s steps(2), background-color 0.2s steps(2);  /* a screen switches, it does not fade */
}

/* The name tag: the family's mono label face, in the neon. */
.scoreboard-name-mask {
  flex: 1 1 0;
  min-width: 0;
}
.scoreboard-side-b .scoreboard-name-mask { text-align: right; }  /* player 2 reads from the outside in */
.scoreboard-team {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The figure: big, in the display face, with phosphor bloom. */
.scoreboard-score-mask {
  flex: none;                      /* never squeezes */
  min-width: calc(96px * var(--scale));  /* two digits without the halves jumping */
  padding: calc(6px * var(--scale)) calc(8px * var(--scale));  /* the mask clips: leave the bloom some room */
  text-align: center;
}
.scoreboard-score {
  font-size: calc(64px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.34;               /* Saira's glyph box is tall - the whole figure, so the pop never shaves a digit */
  color: var(--text-color);
  font-family: var(--font-numeric);  /* a face whose digits share one width */
  font-variant-numeric: lining-nums tabular-nums;  /* no jitter as the score climbs */
  text-shadow: 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 75%, transparent);
}

/* The divider: three stacked pixels, drawn with one gradient so they stay three at any height. */
.scoreboard-accent {
  flex: none;
  align-self: center;
  width: calc(14px * var(--scale));
  height: calc(62px * var(--scale));
  background: linear-gradient(to bottom, var(--accent) 58%, transparent 58%) 0 0 / 100% calc(24px * var(--scale)) repeat-y;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
  will-change: transform;          /* the Point timeline scales it */
}

/* ── Final score ── the leader's half fills with the neon and its type goes dark. */
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b {
  background: var(--accent);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-team,
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-score,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-team,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-score {
  color: var(--accent-ink);
  text-shadow: none;
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-b,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-a {
  opacity: 0.4;                    /* powered down */
}`,
    hasAccent: true,
    // The stage: one bar that holds two ten-letter name tags and two two-digit figures.
    stageWidth: 1000,
    fields: duelFields(),
    matchClock: false,               // no clock is drawn, so the shared clock runtime stays out
    runtimeExtraJs: duelRuntimeJs(),
  }),
);
