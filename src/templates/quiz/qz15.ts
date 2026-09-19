// qz15 "Arcade Quiz" - the ARCADE family's quiz show board (types/quizShow.ts).
//
// The cabinet screen. One enclosed panel with stair-stepped pixel corners, a neon rim that
// glows, and scanlines running under the type; the answers are four slots in a column, each a
// smaller pixel-cornered panel with a mono letter chip. It is the one board of the three that
// keeps everything INSIDE a frame, because a screen is a frame.
//
// The three moments borrow from a menu screen, and each changes shape as well as colour: the
// pick gets a blinking player-select cursor and inverts to a filled slot, the correct answer
// flashes and takes a drawn tick, and a wrong pick jitters, splits into a glitch and drops to a
// dotted outline with a cross.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so every
// panel here is TWO clipped layers - the rim colour underneath, the ground inset on top of it -
// and the glow is a drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineQuizVariant, SHOW_BOARD_CONTENT } from './shared';

const CONTENT = SHOW_BOARD_CONTENT;

/** A rectangle with one square step cut out of each corner - the pixel corner. */
const pixelCorners = (px: number): string => {
  const s = `calc(${px}px * var(--scale))`;
  const e = `calc(100% - ${px}px * var(--scale))`;
  return `polygon(0 ${s}, ${s} ${s}, ${s} 0, ${e} 0, ${e} ${s}, 100% ${s}, 100% ${e}, ${e} ${e}, ${e} 100%, ${s} 100%, ${s} ${e}, 0 ${e})`;
};

/** One answer slot. The FACE is the painted slot; the row around it is what the presets tween
 *  and where the player-select cursor hangs. */
const row = (n: number, letter: string, answer: string) =>
  `        <div class="quiz-option quiz-option-${n}"><div class="quiz-face"><span class="quiz-letter">${letter}</span><span class="quiz-text" id="f${n}">${answer}</span></div></div>`;

export const qz15: TemplateVariant = defineQuizVariant(
  {
    id: 'qz15',
    category: 'quiz',
    name: 'Arcade Quiz',
    styleTag: 'arcade',
    description:
      'Cabinet-screen quiz: pixel-cornered neon panels with scanlines, a player-select cursor on the pick.',
    maxLines: 1,
    suggestedLines: [{ title: 'Question', sample: CONTENT.question }],
    logo: 'none',
    animationPresets: ['quiz-reveal'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'mid-center',
  },
  {
    name: 'Arcade Quiz',
    description:
      'The cabinet-screen quiz show board. One pixel-cornered panel with a glowing neon rim and ' +
      'scanlines; the question over a dashed rule, then four answer slots with mono letter ' +
      'chips. The pick gets a blinking select cursor and a filled slot, the correct answer ' +
      'flashes with a drawn tick, and a wrong pick glitches to a dotted outline with a cross. ' +
      'Set "Answers shown" to 2, 3 or 4 per question.',
    uicolor: '3',
  },
  (o) => ({
    html: `    <!-- Arcade Quiz: one screen - the question, a dashed rule, then the answer slots. -->
    <div class="quiz-box">
      <div class="quiz-question">
        <div class="quiz-mask"><span id="f0">${o.lines[0]?.sample || CONTENT.question}</span></div>
      </div>
      <!-- The answers. A row past "Answers shown" is hidden by the runtime; the screen gets shorter. -->
      <div class="quiz-options">
${CONTENT.answers.map((answer, i) => row(i + 1, 'ABCD'[i], answer)).join('\n')}
      </div>
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The screen. Two clipped layers make the pixel-stepped rim (see the file header); the glow is
   a filter, because a box-shadow would be cut away by the clip. */
.quiz-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  padding: calc(40px * var(--scale)) calc(20px * var(--scale)) calc(44px * var(--scale));  /* narrow sides: each row brings its own gutters */
  filter: drop-shadow(0 0 calc(14px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.quiz-box::before,
.quiz-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;                     /* behind the question and the slots */
}
/* The rim: the whole shape, in the neon. */
.quiz-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(12)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.quiz-box::after {
  top: calc(5px * var(--scale)); right: calc(5px * var(--scale));
  bottom: calc(5px * var(--scale)); left: calc(5px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 62%),
    var(--panel-bg);
  clip-path: ${pixelCorners(9)};
}

/* The question, and the dashed rule under it - a row of pixels, not a line. */
.quiz-question {
  margin: 0 calc(28px * var(--scale));  /* the rule runs a little wider than the slots under it */
  padding-bottom: calc(24px * var(--scale));
  background: linear-gradient(to right, var(--accent) 60%, transparent 60%) 0 100% / calc(20px * var(--scale)) calc(4px * var(--scale)) repeat-x;
}
.quiz-mask > span {
  font-size: calc(42px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.46;               /* Saira's glyph box is tall, and the bloom needs room inside the reveal mask */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;       /* a screen shouts in caps */
  color: var(--text-color);
  text-shadow: 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent);  /* phosphor bloom */
}

/* The answer column. */
.quiz-options {
  margin-top: calc(28px * var(--scale));
}
.quiz-option + .quiz-option {
  margin-top: calc(14px * var(--scale));  /* a margin, not a flex gap - an older CEF drops gap */
}

/* One answer ROW: it keeps a gutter for the player-select cursor, and the same again on the
   right so the slots stay centred under the question. */
.quiz-option {
  position: relative;              /* anchors the cursor (::before) */
  padding: 0 calc(46px * var(--scale));
}

/* The FACE: a slot. The same two-layer pixel panel as the screen, one size down. */
.quiz-face {
  position: relative;              /* anchors the slot's rim and ground */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the text */
  display: flex;
  align-items: center;
  min-height: calc(70px * var(--scale));
  padding: calc(8px * var(--scale)) calc(26px * var(--scale)) calc(8px * var(--scale)) calc(12px * var(--scale));
}
.quiz-face::before,
.quiz-face::after {
  content: '';
  position: absolute;
  z-index: -1;
}
.quiz-face::before {
  top: 0; right: 0; bottom: 0; left: 0;
  background: color-mix(in srgb, var(--accent) 45%, transparent);  /* a quiet rim until picked */
  clip-path: ${pixelCorners(8)};
}
.quiz-face::after {
  top: calc(3px * var(--scale)); right: calc(3px * var(--scale));
  bottom: calc(3px * var(--scale)); left: calc(3px * var(--scale));
  background: color-mix(in srgb, var(--panel-bg) 82%, #ffffff);  /* one step lighter than the screen */
  clip-path: ${pixelCorners(6)};
}

/* The letter chip: a filled pixel square with the letter in the family's mono. */
.quiz-letter {
  position: relative;              /* anchors the drawn tick and cross */
  flex: none;                      /* never squeezes; the answer takes the rest */
  width: calc(50px * var(--scale));
  height: calc(50px * var(--scale));
  margin-right: calc(22px * var(--scale));
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  clip-path: ${pixelCorners(6)};
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 700;
  color: var(--accent-ink);
}

/* The answer text. */
.quiz-text {
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
  color: var(--text-color);
  overflow-wrap: break-word;       /* break very long unbroken answers */
  min-width: 0;                    /* lets a long answer wrap inside its slot */
}

/* ── The pick ── */

/* Picked: the player-select cursor - a drawn triangle in the gutter, blinking in hard steps. */
.quiz-sel::before {
  content: '';
  position: absolute;
  left: calc(8px * var(--scale));
  top: 50%;
  margin-top: calc(-16px * var(--scale));
  border-style: solid;
  border-width: calc(16px * var(--scale)) 0 calc(16px * var(--scale)) calc(26px * var(--scale));
  border-color: transparent transparent transparent var(--accent);  /* a right-pointing triangle */
  filter: drop-shadow(0 0 calc(8px * var(--scale)) var(--accent));
  animation: quiz-cursor-blink 0.7s steps(1) infinite;
}
@keyframes quiz-cursor-blink {
  0%   { opacity: 1; }
  60%  { opacity: 0; }
  100% { opacity: 1; }
}
/* ... and the slot INVERTS: full neon rim, neon ground, dark type. */
.quiz-sel .quiz-face::before { background: var(--accent); }
.quiz-sel .quiz-face::after  { background: var(--accent); }
.quiz-sel .quiz-text {
  color: var(--accent-ink);
  text-shadow: none;
}
.quiz-sel .quiz-letter {
  background: var(--accent-ink);
  color: var(--accent);
}

/* ── The reveal ── */

/* Correct: the slot flashes three times and settles on a semantic green, with a drawn tick.
   The type goes DARK for the whole of it, so every frame of the flash is readable - a renderer
   that holds one frame of it still shows the answer. */
.quiz-correct .quiz-face::before { background: #7cff6b; }  /* semantic "right" - never a second brand accent */
.quiz-correct .quiz-face::after {
  background: #7cff6b;
  animation: quiz-slot-flash 0.36s steps(1) 1;
}
@keyframes quiz-slot-flash {
  0%   { background: #ffffff; }
  17%  { background: #7cff6b; }
  34%  { background: #ffffff; }
  51%  { background: #7cff6b; }
  68%  { background: #ffffff; }
  85%  { background: #7cff6b; }
}
.quiz-correct .quiz-face {
  filter: drop-shadow(0 0 calc(12px * var(--scale)) rgba(124, 255, 107, 0.7));
}
.quiz-correct .quiz-text {
  color: #120b2e;
  text-shadow: none;
}

/* The tick and the cross are DRAWN, not typed: a check glyph is missing from most display
   faces, and a playout machine with no symbol font would show an empty box. */
.quiz-correct .quiz-letter,
.quiz-wrong .quiz-letter {
  font-size: 0;                    /* the letter steps aside for the mark */
}
.quiz-correct .quiz-letter { background: #120b2e; }
.quiz-correct .quiz-letter::after {
  content: '';
  width: calc(10px * var(--scale));
  height: calc(22px * var(--scale));
  margin-top: calc(-5px * var(--scale));  /* a tick's visual centre sits above its box centre */
  border: solid #7cff6b;
  border-width: 0 calc(6px * var(--scale)) calc(6px * var(--scale)) 0;  /* an L ... */
  transform: rotate(45deg);        /* ... turned into a tick */
}

/* Wrong: the pick that lost. The slot jitters once, the type splits into a glitch, and the rim
   breaks up into dots. */
.quiz-wrong .quiz-face {
  animation: quiz-slot-jitter 0.32s steps(4) 1;
}
@keyframes quiz-slot-jitter {
  0%   { transform: translateX(calc(-5px * var(--scale))); }
  25%  { transform: translateX(calc(5px * var(--scale))); }
  50%  { transform: translateX(calc(-3px * var(--scale))); }
  75%  { transform: translateX(calc(3px * var(--scale))); }
  100% { transform: translateX(0); }
}
.quiz-wrong .quiz-face::before {
  background: repeating-linear-gradient(to right, #ff3d7f 0, #ff3d7f calc(8px * var(--scale)), transparent calc(8px * var(--scale)), transparent calc(14px * var(--scale)));  /* semantic "wrong", dotted */
}
.quiz-wrong .quiz-face::after { background: var(--panel-bg); }
.quiz-wrong .quiz-text {
  opacity: 0.85;
  text-shadow: calc(2px * var(--scale)) 0 #ff3d7f, calc(-2px * var(--scale)) 0 #00f0ff;  /* the split */
}
.quiz-wrong .quiz-letter { background: #ff3d7f; }
.quiz-wrong .quiz-letter::before,
.quiz-wrong .quiz-letter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(30px * var(--scale));
  height: calc(6px * var(--scale));
  margin: calc(-3px * var(--scale)) 0 0 calc(-15px * var(--scale));
  background: #120b2e;
  transform: rotate(45deg);
}
.quiz-wrong .quiz-letter::after { transform: rotate(-45deg); }

/* Dim: the answers that were neither right nor picked power down. The slot keeps its ground
   and what fades is its content and its rim - on the inner elements, because the entrance leaves
   an inline opacity on the row that would outrank a rule on the row itself. */
.quiz-dim .quiz-face::before { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.quiz-dim .quiz-face::after  { background: var(--panel-bg); }
.quiz-dim .quiz-letter,
.quiz-dim .quiz-text {
  opacity: 0.32;
}`,
    hasAccent: false,
    // The stage: the width the screen holds a two-line question at.
    stageWidth: 1120,
  }),
  undefined,
  CONTENT,
);
