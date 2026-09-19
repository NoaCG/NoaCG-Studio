// sb27 "Showtime Score" - the SHOWTIME family's two-player score (types/duelScore.ts), sibling
// of qz14 Showtime Quiz and lt69 Showtime Strap.
//
// One long marquee pill: a deep warm ground inside a bulb-coloured keyline, the two names in
// the family's serif at the ends, the scores in round medallions either side of a lit centre
// star. It is the one score of the three that is a single shape - a sign over the stage door.
//
// Drawn symmetric top to bottom, so it sits as well at the bottom of the frame as at the top.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineScoreboardVariant } from './shared';
import { DUEL_NAMES, duelFields, duelRuntimeJs } from './duelShared';
import { STAR_CLIP } from '../shared/gameShowShapes';

export const sb27: TemplateVariant = defineScoreboardVariant(
  {
    id: 'sb27',
    category: 'scoreboard',
    name: 'Showtime Score',
    styleTag: 'showtime',
    description:
      'Theatre-marquee two-player score: one long pill with a lit centre star, names in serif, scores in round medallions.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Player 1', sample: DUEL_NAMES[0] },
      { title: 'Score 1', sample: '0' },
      { title: 'Player 2', sample: DUEL_NAMES[1] },
      { title: 'Score 2', sample: '0' },
    ],
    logo: 'none',
    animationPresets: ['fade', 'slide-down', 'slide-up', 'mask-wipe', 'pop-spring'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'top-center',
  },
  {
    name: 'Showtime Score',
    description:
      'The theatre-marquee two-player score. One long pill with a bulb-coloured keyline, the ' +
      'names in a high-contrast serif and the scores in round medallions either side of a lit ' +
      'star. A changed score pops; "Final score" lights the leader\'s medallion and dims the other side.',
    uicolor: '6',
  },
  () => ({
    html: `    <!-- Showtime Score: ( NAME  (score)  star  (score)  NAME ) - one pill. -->
    <div class="scoreboard-box">
      <!-- Player 1: the name, then the medallion towards the centre. -->
      <div class="scoreboard-side scoreboard-side-a">
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f0" class="scoreboard-team">${DUEL_NAMES[0]}</span></div>
        <div class="scoreboard-medal"><div class="scoreboard-mask"><span id="f1" class="scoreboard-score">0</span></div></div>
      </div>
      <!-- The centre star - the design's accent, and what kicks when a point is scored. -->
      <div class="scoreboard-accent"></div>
      <!-- Player 2: mirrored - the medallion first, then the name. -->
      <div class="scoreboard-side scoreboard-side-b">
        <div class="scoreboard-medal"><div class="scoreboard-mask"><span id="f3" class="scoreboard-score">0</span></div></div>
        <div class="scoreboard-mask scoreboard-name-mask"><span id="f2" class="scoreboard-team">${DUEL_NAMES[1]}</span></div>
      </div>
    </div>`,
    css: `/* The pill: the family's deep ground, lit from above, inside a bulb-coloured keyline and a
   dark surround - the way a sign's lettering sits inside its frame. */
.scoreboard-box {
  display: flex;
  align-items: center;
  padding: calc(12px * var(--scale)) calc(16px * var(--scale));
  border-radius: var(--panel-radius);  /* the family's full pill */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 86%, #ffffff) 0%,
              var(--panel-bg) 55%,
              color-mix(in srgb, var(--panel-bg) 78%, #000000) 100%);
  box-shadow: var(--panel-keyline),
              0 0 0 calc(8px * var(--scale)) color-mix(in srgb, var(--panel-bg) 62%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* One player's half. Both take an equal share - a long name wraps inside its own half. */
.scoreboard-side {
  flex: 1 1 0;
  min-width: 0;                    /* lets a long name shrink instead of pushing the pill wider */
  display: flex;
  align-items: center;
  transition: opacity 0.3s ease;   /* the final call dims the other side */
}

/* The name: the family's serif, set like a name on a bill. */
.scoreboard-name-mask {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 calc(24px * var(--scale)) 0 calc(36px * var(--scale));  /* clear of the pill's round end */
  text-align: center;              /* a name on a bill is centred in its own half */
}
.scoreboard-side-b .scoreboard-name-mask {
  padding: 0 calc(36px * var(--scale)) 0 calc(24px * var(--scale));
}
.scoreboard-team {
  font-size: calc(36px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.24;               /* tall enough for the serif's whole glyph box inside the reveal mask */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
  transition: color 0.3s ease;
}

/* The medallion: a round badge for the score, ringed in the bulb colour. */
.scoreboard-medal {
  flex: none;                      /* never squeezes */
  width: calc(78px * var(--scale));
  height: calc(78px * var(--scale));
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: calc(3px * var(--scale)) solid var(--accent);
  background: color-mix(in srgb, var(--panel-bg) 70%, #000000);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}
.scoreboard-score {
  font-size: calc(42px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.32;               /* the figure's whole glyph box, so the pop never shaves a digit */
  color: var(--accent);
  font-family: var(--font-numeric);  /* a face whose digits share one width */
  font-variant-numeric: lining-nums tabular-nums;  /* serif figures: lining, and no jitter */
  transition: color 0.3s ease;
}

/* The centre star: five points cut from a square, lit. */
.scoreboard-accent {
  flex: none;
  width: calc(46px * var(--scale));
  height: calc(46px * var(--scale));
  margin: 0 calc(22px * var(--scale));
  background: var(--accent);
  clip-path: ${STAR_CLIP};
  filter: drop-shadow(0 0 calc(8px * var(--scale)) var(--accent));  /* a filter, because clip-path would cut a box-shadow */
  will-change: transform;          /* the Point timeline scales it */
}

/* ── Final score ── the leader's medallion lights and the name takes the bulb colour. */
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-medal,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-medal {
  background: var(--accent);
  box-shadow: var(--accent-glow);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-score,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-score {
  color: var(--accent-ink);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-a .scoreboard-team,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-b .scoreboard-team {
  color: var(--accent);
}
.scoreboard-final.scoreboard-lead-a .scoreboard-side-b,
.scoreboard-final.scoreboard-lead-b .scoreboard-side-a {
  opacity: 0.45;
}`,
    hasAccent: true,
    // The stage: one pill that holds two ten-letter names and two two-digit medallions.
    stageWidth: 1040,
    fields: duelFields(),
    matchClock: false,               // no clock is drawn, so the shared clock runtime stays out
    runtimeExtraJs: duelRuntimeJs(),
  }),
);
