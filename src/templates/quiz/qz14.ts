// qz14 "Showtime Quiz" - the SHOWTIME family's quiz show board (types/quizShow.ts).
//
// The theatre marquee. The question sits on a stadium-shaped plaque with a row of bulbs chasing
// along its top and bottom edges; the answers hang under it as a centred stack of deep pills,
// each led by a round medallion carrying its letter. Words are set in a high-contrast serif and
// the letters in condensed billing caps - a playbill, not a scoreboard.
//
// The three moments are told apart by LIGHT and by line, so colour is never the only signal:
// the pick gets a second ring and a lit medallion, the correct answer floods to the bulb colour
// with its own bulbs switched on and a drawn tick, and a wrong pick loses its solid edge for a
// dashed one and takes a drawn cross.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineQuizVariant, SHOW_BOARD_CONTENT, showBoardRowsHtml } from './shared';

const CONTENT = SHOW_BOARD_CONTENT;

/** A strip of marquee bulbs: evenly spaced dots in the accent, drawn with one gradient. */
const BULBS = 'radial-gradient(circle, var(--accent) 0, var(--accent) calc(4px * var(--scale)), transparent calc(5.5px * var(--scale)))';

export const qz14: TemplateVariant = defineQuizVariant(
  {
    id: 'qz14',
    category: 'quiz',
    name: 'Showtime Quiz',
    styleTag: 'showtime',
    description:
      'Theatre-marquee quiz: a bulb-lit question plaque over a stack of deep pill answers with cream keylines.',
    maxLines: 1,
    suggestedLines: [{ title: 'Question', sample: CONTENT.question }],
    logo: 'none',
    animationPresets: ['quiz-reveal'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'mid-center',
  },
  {
    name: 'Showtime Quiz',
    description:
      'The theatre-marquee quiz show board. A stadium-shaped question plaque with chasing bulbs ' +
      'over a centred stack of pill answers, each led by a letter medallion. The pick lights ' +
      'its medallion and gains a second ring, the correct answer floods to the bulb colour ' +
      'with a drawn tick, and a wrong pick goes dashed with a cross. Set "Answers shown" to ' +
      '2, 3 or 4 per question.',
    uicolor: '6',
  },
  (o) => ({
    html: `    <!-- Showtime Quiz: the question plaque, then the answer pills stacked under it. -->
    <div class="quiz-box">
      <!-- The plaque. Its two bulb strips are painted layers (::before / ::after). -->
      <div class="quiz-question">
        <div class="quiz-mask"><span id="f0">${o.lines[0]?.sample || CONTENT.question}</span></div>
      </div>
      <!-- The answers. A row past "Answers shown" is hidden by the runtime; the stack closes up. -->
      <div class="quiz-options">
${showBoardRowsHtml(CONTENT)}
      </div>
    </div>`,
    css: `${labelFontFaceCss(fontById('oswald'))}

/* The box: layout only - the plaque and the pills are what is painted. */
.quiz-box {
  text-align: center;              /* a marquee is centred, top to bottom */
}

/* The question plaque: a deep warm stadium with a bulb-coloured keyline inside its edge and a
   dark surround outside it, the way a sign's lettering sits inside its frame. */
.quiz-question {
  position: relative;              /* anchors the two bulb strips */
  padding: calc(40px * var(--scale)) calc(110px * var(--scale));  /* wide sides keep the words
                                      clear of the rounded ends */
  border-radius: var(--panel-radius);  /* the family's full pill - a stadium at this height */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 86%, #ffffff) 0%,
              var(--panel-bg) 55%,
              color-mix(in srgb, var(--panel-bg) 78%, #000000) 100%);  /* lit from above */
  box-shadow: var(--panel-keyline),
              0 0 0 calc(10px * var(--scale)) color-mix(in srgb, var(--panel-bg) 62%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* The bulbs: one strip inside the top edge, one inside the bottom. They stop short of the
   rounded ends, where a straight strip would leave the plaque. */
.quiz-question::before,
.quiz-question::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  left: calc(74px * var(--scale));
  right: calc(74px * var(--scale));
  height: calc(12px * var(--scale));
  background: ${BULBS} 0 50% / calc(28px * var(--scale)) calc(12px * var(--scale)) repeat-x;
  filter: drop-shadow(0 0 calc(5px * var(--scale)) var(--accent));  /* each bulb throws a little light */
  animation: quiz-bulb-chase 0.9s steps(2) infinite;  /* stepped: bulbs switch, they do not slide */
  pointer-events: none;            /* decoration - never in the way of a canvas click */
}
.quiz-question::before { top: calc(11px * var(--scale)); }
.quiz-question::after  { bottom: calc(11px * var(--scale)); animation-direction: reverse; }  /* the two strips chase opposite ways */

/* One period of travel in two steps: every bulb appears to hop to its neighbour's place. */
@keyframes quiz-bulb-chase {
  from { background-position-x: 0; }
  to   { background-position-x: calc(28px * var(--scale)); }
}

/* The question: a high-contrast serif, set like a title on a bill. */
.quiz-mask > span {
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.26;               /* tall enough for the serif's whole glyph box inside the reveal mask */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The answer stack. */
.quiz-options {
  margin: calc(30px * var(--scale)) calc(70px * var(--scale)) 0;  /* narrower than the plaque:
                                      the pills hang under it like the bill under a title */
}
.quiz-option + .quiz-option {
  margin-top: calc(14px * var(--scale));  /* a margin, not a flex gap - an older CEF drops gap */
}

/* The FACE: one answer pill. */
.quiz-face {
  position: relative;              /* anchors the correct answer's own bulbs (::after) */
  display: flex;
  align-items: center;
  min-height: calc(78px * var(--scale));
  padding: calc(8px * var(--scale)) calc(40px * var(--scale)) calc(8px * var(--scale)) calc(8px * var(--scale));
  text-align: left;
  border-radius: var(--panel-radius);
  border: calc(3px * var(--scale)) solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 90%, #ffffff) 0%,
              var(--panel-bg) 60%);
  box-shadow: 0 calc(8px * var(--scale)) calc(22px * var(--scale)) rgba(0, 0, 0, 0.4);
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease;
}

/* The medallion: a round badge carrying the letter, in the billing face. */
.quiz-letter {
  position: relative;              /* anchors the drawn tick and cross */
  flex: none;                      /* never squeezes; the answer takes the rest */
  width: calc(60px * var(--scale));
  height: calc(60px * var(--scale));
  margin-right: calc(24px * var(--scale));
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: calc(2px * var(--scale)) solid var(--accent);
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 600;
  color: var(--label-color, var(--accent));
  transition: background 0.25s ease, color 0.25s ease;
}

/* The answer text. */
.quiz-text {
  font-size: calc(32px * var(--scale) * var(--type-scale));
  font-weight: 600;
  line-height: 1.15;
  color: var(--text-color);
  overflow-wrap: break-word;       /* break very long unbroken answers */
  min-width: 0;                    /* lets a long answer wrap inside its pill */
}

/* ── The pick ── */

/* Picked: a second ring outside the first, and the medallion LIGHTS. */
.quiz-sel .quiz-face {
  border-color: var(--accent);
  box-shadow: 0 0 0 calc(4px * var(--scale)) var(--panel-bg),
              0 0 0 calc(7px * var(--scale)) var(--accent),
              var(--accent-glow);  /* the gap, the outer ring, then the family's glow */
}
.quiz-sel .quiz-letter {
  background: var(--accent);
  color: var(--accent-ink);
}

/* ── The reveal ── */

/* Correct: the lights come on. The pill floods to the bulb colour, and its own bulbs appear. */
.quiz-correct .quiz-face {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 0 calc(4px * var(--scale)) var(--panel-bg),
              0 0 0 calc(7px * var(--scale)) var(--accent),
              var(--accent-glow);  /* the gap, the outer ring, then the family's glow */
}
.quiz-correct .quiz-text {
  color: var(--accent-ink);
  font-weight: 800;
}
.quiz-correct .quiz-face::after {
  content: '';
  position: absolute;
  left: calc(90px * var(--scale));
  right: calc(44px * var(--scale));
  bottom: calc(-22px * var(--scale));  /* under the pill, outside its rings */
  height: calc(12px * var(--scale));
  background: ${BULBS} 0 50% / calc(28px * var(--scale)) calc(12px * var(--scale)) repeat-x;
  filter: drop-shadow(0 0 calc(5px * var(--scale)) var(--accent));
  animation: quiz-bulb-chase 0.45s steps(2) infinite;  /* twice the plaque's pace */
  pointer-events: none;
}
/* The bulbs under the winner need room, so the row below it steps down. */
.quiz-correct + .quiz-option { margin-top: calc(38px * var(--scale)); }

/* The tick and the cross are DRAWN, not typed: a check glyph is missing from most display
   faces, and a playout machine with no symbol font would show an empty box. */
.quiz-correct .quiz-letter,
.quiz-wrong .quiz-letter {
  font-size: 0;                    /* the letter steps aside for the mark */
}
.quiz-correct .quiz-letter {
  background: var(--accent-ink);
  border-color: var(--accent-ink);
}
.quiz-correct .quiz-letter::after {
  content: '';
  width: calc(12px * var(--scale));
  height: calc(25px * var(--scale));
  margin-top: calc(-6px * var(--scale));  /* a tick's visual centre sits above its box centre */
  border: solid var(--accent);
  border-width: 0 calc(6px * var(--scale)) calc(6px * var(--scale)) 0;  /* an L ... */
  transform: rotate(45deg);        /* ... turned into a tick */
}

/* Wrong: the pick that lost. Its solid edge turns DASHED and the medallion takes a cross. */
.quiz-wrong .quiz-face {
  border-style: dashed;
  border-color: #ff8a7a;           /* semantic "wrong" - never a second brand accent */
  box-shadow: none;                /* no lift: it has gone dark */
}
.quiz-wrong .quiz-text {
  opacity: 0.72;
  text-decoration: line-through;
  text-decoration-color: #ff8a7a;
}
.quiz-wrong .quiz-letter { border-color: #ff8a7a; }
.quiz-wrong .quiz-letter::before,
.quiz-wrong .quiz-letter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(32px * var(--scale));
  height: calc(5px * var(--scale));
  margin: calc(-2.5px * var(--scale)) 0 0 calc(-16px * var(--scale));
  border-radius: calc(3px * var(--scale));
  background: #ff8a7a;
  transform: rotate(45deg);
}
.quiz-wrong .quiz-letter::after { transform: rotate(-45deg); }

/* Dim: the answers that were neither right nor picked go dark. The pill keeps its solid ground
   (a translucent pill over moving picture stops being a sign) and what fades is its content and
   its edge - on the inner elements, because the entrance leaves an inline opacity on the row
   that would outrank a rule on the row itself. */
.quiz-dim .quiz-face {
  border-color: color-mix(in srgb, var(--accent) 22%, transparent);
  background: color-mix(in srgb, var(--panel-bg) 80%, #000000);
  box-shadow: none;
}
.quiz-dim .quiz-letter,
.quiz-dim .quiz-text {
  opacity: 0.4;
}`,
    hasAccent: false,
    // The stage: the width the plaque holds a two-line question at.
    stageWidth: 1180,
  }),
  undefined,
  CONTENT,
);
