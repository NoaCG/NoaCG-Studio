// qz13 "Sticker Quiz" - the STICKER family's quiz show board (types/quizShow.ts).
//
// Neo-brutal: every piece is its own flat label with a thick ink outline and a hard offset
// shadow, stuck onto the picture rather than framed by a panel. The question is one wide card;
// the answers are a two-by-two grid of labels under it, each tilted a fraction of a degree the
// way a hand-placed sticker is. There is no enclosing box, which is the layout difference from
// every other board in the catalog - they all stack rows INSIDE a panel.
//
// The three moments are told apart by SHAPE as well as colour, so they survive a colour-blind
// viewer and a bad monitor: the pick is PRESSED IN (the label moves onto its own shadow), the
// correct answer gets a drawn tick and a heavier outline, and a wrong pick inverts to ink with
// a hatch across it and its words struck through.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineQuizVariant, SHOW_BOARD_CONTENT } from './shared';

const CONTENT = SHOW_BOARD_CONTENT;

/** One answer label. The FACE is the painted sticker; the row around it is what the presets
 *  tween, so the tilt, the press and the shadow all live on the face and no tween flattens them. */
const row = (n: number, letter: string, answer: string) =>
  `        <div class="quiz-option quiz-option-${n}"><div class="quiz-face"><span class="quiz-letter">${letter}</span><span class="quiz-text" id="f${n}">${answer}</span></div></div>`;

export const qz13: TemplateVariant = defineQuizVariant(
  {
    id: 'qz13',
    category: 'quiz',
    name: 'Sticker Quiz',
    styleTag: 'sticker',
    description:
      'Neo-brutal quiz: a cream card with a thick ink outline and a hard shadow, answers as stuck-on labels in a two-by-two grid.',
    maxLines: 1,
    suggestedLines: [{ title: 'Question', sample: CONTENT.question }],
    logo: 'none',
    animationPresets: ['quiz-reveal'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'mid-center',
  },
  {
    name: 'Sticker Quiz',
    description:
      'The neo-brutal quiz show board. A wide question card over a two-by-two grid of answer ' +
      'labels, each a flat sticker with a thick outline and a hard offset shadow. The pick ' +
      'presses its label in, the reveal draws a tick on the correct one, and a wrong pick ' +
      'inverts to ink with a hatch. Set "Answers shown" to 2, 3 or 4 per question.',
    uicolor: '2',
  },
  (o) => ({
    html: `    <!-- Sticker Quiz: a question card, then the answer labels in a two-by-two grid. The box
         itself paints nothing - every piece is its own sticker. -->
    <div class="quiz-box">
      <!-- The question card. The mask is what the question slides up from behind. -->
      <div class="quiz-question">
        <div class="quiz-mask"><span id="f0">${o.lines[0]?.sample || CONTENT.question}</span></div>
      </div>
      <!-- The answers. A row past "Answers shown" is hidden by the runtime, and the grid
           re-flows: three answers put the third across the full width, two sit side by side. -->
      <div class="quiz-options">
${CONTENT.answers.map((answer, i) => row(i + 1, 'ABCD'[i], answer)).join('\n')}
      </div>
    </div>`,
    css: `/* The box: layout only. The presets tween it (rise + fade), and it paints nothing. */
.quiz-box {
  text-align: left;                /* printed matter reads from the left edge, whatever the zone centres */
  padding: 0 calc(12px * var(--scale)) calc(12px * var(--scale)) 0;  /* room for the hard shadows,
                                      which fall down-right and would otherwise be cut by the stage */
}

/* The question card: the family's flat panel, thick outline and hard shadow. */
.quiz-question {
  position: relative;              /* anchors the halftone corner (::after) */
  padding: calc(26px * var(--scale)) calc(36px * var(--scale));
  background: var(--panel-bg);     /* the opaque light ground */
  border-radius: var(--panel-radius);  /* 0 - a sticker is cut square */
  box-shadow: var(--panel-keyline), var(--panel-shadow);  /* the outline, then the offset shadow */
}

/* The halftone corner: a patch of printed dots in the accent, top right. Pure gradient, no image. */
.quiz-question::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;              /* tucked into the top-right corner ... */
  top: calc(5px * var(--scale));   /* ... just inside the outline */
  right: calc(5px * var(--scale));
  width: calc(150px * var(--scale));
  height: calc(64px * var(--scale));
  background: radial-gradient(var(--accent) 34%, transparent 38%) 0 0 / calc(12px * var(--scale)) calc(12px * var(--scale));
  -webkit-mask-image: linear-gradient(to left, #000, transparent);  /* the dots thin out leftward */
  mask-image: linear-gradient(to left, #000, transparent);
  pointer-events: none;            /* decoration - never in the way of a canvas click */
}

/* The question: heavy grotesque, tight, sentence case - it is printed, not shouted. */
.quiz-mask > span {
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.12;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The answer grid. Flex-wrap with margins rather than CSS grid + gap: gap in a flex container
   needs Chromium 84 and an older CasparCG CEF drops it, so the air is margins on the rows. */
.quiz-options {
  display: flex;
  flex-wrap: wrap;
  margin-top: calc(10px * var(--scale));
}

/* One answer ROW: the slot in the grid, and the element the presets stagger in. It is never
   tilted or shadowed itself - its face is. */
.quiz-option {
  box-sizing: border-box;
  width: 50%;                      /* two to a line */
  padding: calc(18px * var(--scale)) calc(22px * var(--scale)) 0 0;  /* the air between labels */
}
.quiz-option:nth-child(even) { padding-right: 0; }  /* the right column ends at the card's edge */

/* Three answers: the third runs the full width, so the board stays a rectangle. */
.quiz[data-answers='3'] .quiz-option-3 {
  width: 100%;
  padding-right: 0;
}

/* The FACE: the sticker itself. Outline, hard shadow, and a fraction of a degree of tilt. */
.quiz-face {
  position: relative;              /* anchors the wrong-pick hatch (::after) */
  display: flex;                   /* letter badge, then the answer */
  align-items: center;
  min-height: calc(84px * var(--scale));
  background: var(--panel-bg);
  box-shadow: var(--panel-keyline), var(--panel-shadow);
  transform: rotate(-0.6deg);      /* hand-placed, not machine-aligned */
  transition: transform 0.12s steps(2), box-shadow 0.12s steps(2), background-color 0.12s steps(2);  /* stepped: the family snaps, it never eases */
}
.quiz-option:nth-child(even) .quiz-face { transform: rotate(0.6deg); }  /* alternate the lean */

/* The letter badge: a solid ink square, the label's leading edge. */
.quiz-letter {
  position: relative;              /* anchors the drawn tick and cross */
  flex: none;                      /* the badge never squeezes; the answer takes the rest */
  align-self: stretch;             /* full height of the label */
  width: calc(84px * var(--scale));
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--text-color);   /* ink */
  color: var(--panel-bg);          /* paper-coloured letter on it */
  font-size: calc(38px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
}

/* The answer text. */
.quiz-text {
  padding: calc(14px * var(--scale)) calc(24px * var(--scale));
  font-size: calc(32px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
  overflow-wrap: break-word;       /* break very long unbroken answers */
  min-width: 0;                    /* lets a long answer wrap inside its label */
}

/* ── The pick ── */

/* Picked: the label is PRESSED IN - it moves onto its own shadow and floods accent. Position,
   not colour alone, says "this one". */
.quiz-sel .quiz-face,
.quiz-option.quiz-sel:nth-child(even) .quiz-face {
  background: var(--accent);
  transform: translate(calc(6px * var(--scale)), calc(6px * var(--scale))) rotate(0deg);
  box-shadow: var(--panel-keyline), calc(4px * var(--scale)) calc(4px * var(--scale)) 0 var(--text-color);
}
.quiz-sel .quiz-text { color: var(--accent-ink); }

/* ── The reveal ── */

/* Correct: a semantic green flood, a HEAVIER outline, and a drawn tick where the letter was. */
.quiz-correct .quiz-face,
.quiz-option.quiz-correct:nth-child(even) .quiz-face {
  background: #00c781;             /* semantic "right" - never a second brand accent */
  transform: rotate(0deg);         /* the winner sits straight */
  box-shadow: inset 0 0 0 calc(8px * var(--scale)) var(--text-color), var(--panel-shadow);
}
.quiz-correct .quiz-text { color: #111111; }

/* The tick and the cross are DRAWN, not typed: a check glyph is missing from most display
   faces, and a playout machine with no symbol font would show an empty box. */
.quiz-correct .quiz-letter,
.quiz-wrong .quiz-letter {
  font-size: 0;                    /* the letter steps aside for the mark */
}
.quiz-correct .quiz-letter::after {
  content: '';
  width: calc(16px * var(--scale));
  height: calc(34px * var(--scale));
  margin-top: calc(-8px * var(--scale));  /* a tick's visual centre sits above its box centre */
  border: solid var(--panel-bg);
  border-width: 0 calc(8px * var(--scale)) calc(8px * var(--scale)) 0;  /* an L ... */
  transform: rotate(45deg);        /* ... turned into a tick */
}

/* Wrong: the pick that lost. The label inverts to ink, a hatch crosses it, the words are struck. */
.quiz-wrong .quiz-face,
.quiz-option.quiz-wrong:nth-child(even) .quiz-face {
  background: var(--text-color);
  transform: rotate(0deg);
}
.quiz-wrong .quiz-face::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: repeating-linear-gradient(45deg, transparent 0 calc(14px * var(--scale)), #ff5c39 calc(14px * var(--scale)) calc(18px * var(--scale)));
  -webkit-mask-image: linear-gradient(to right, transparent 30%, #000 75%);  /* the hatch gathers at the far end, clear of the words */
  mask-image: linear-gradient(to right, transparent 30%, #000 75%);
  opacity: 0.7;
  pointer-events: none;
}
.quiz-wrong .quiz-text {
  position: relative;              /* above the hatch */
  z-index: 1;
  color: var(--panel-bg);
  text-decoration: line-through;
  text-decoration-thickness: calc(4px * var(--scale));
}
.quiz-wrong .quiz-letter {
  z-index: 1;                      /* above the hatch */
  background: #ff5c39;             /* semantic "wrong" */
}
/* The cross: two diagonal bars. */
.quiz-wrong .quiz-letter::before,
.quiz-wrong .quiz-letter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(44px * var(--scale));
  height: calc(8px * var(--scale));
  margin: calc(-4px * var(--scale)) 0 0 calc(-22px * var(--scale));
  background: #111111;
  transform: rotate(45deg);
}
.quiz-wrong .quiz-letter::after { transform: rotate(-45deg); }

/* Dim: the answers that were neither right nor picked step back. The label loses its shadow -
   it is flat on the table now - and its CONTENT fades, never the paper: a translucent label
   over moving picture is the one thing in this family that stops reading as a sticker. */
.quiz-dim .quiz-face {
  box-shadow: var(--panel-keyline);
}
.quiz-dim .quiz-letter,
.quiz-dim .quiz-text {
  opacity: 0.35;
}`,
    hasAccent: false,
    // The stage: the width the grid holds two full-length answers a line at. Wider than the
    // stacked boards, because two labels share every line.
    stageWidth: 1280,
  }),
  undefined,
  CONTENT,
);
