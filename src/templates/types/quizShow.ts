// QUIZ SHOW BOARD - the quiz a two-player show actually runs: three moments and nothing else.
//
//   1. the QUESTION comes on with its answers;
//   2. the contestant PICKS, and that answer lights up (the pick can move until the reveal);
//   3. the CORRECT answer is revealed, and a wrong pick is marked as wrong.
//
// It is the classic answer board (answerBoard.ts) with two things taken out and one put in.
//
// OUT: the lock and the audience result. "Who Wants to Be a Millionaire" needs "is that your
// final answer?" as its own beat; a quick-fire show does not, and a control page carrying two
// buttons nobody presses is two chances to press the wrong one live.
//
// IN: the ANSWER COUNT is data. The three classic boards are three graphics because their row
// count is baked into the markup. A show's questions do not agree on how many answers they have,
// and the operator here builds the graphic ONCE in the wizard and then duplicates it in the
// rundown per question - so the count has to travel with each copy's data, not with the
// template. `answerCount` is a dropdown field; the runtime hides the rows past it and the panel
// keeps its stage width (quiz/shared.ts, `QuizContent.variableAnswers`).
//
// THE PICK IS ONE PRESS. The classic board's "Select answer" carries a dropdown as its payload:
// choose the letter, then press. Live, with a contestant talking, that is two actions where one
// is wanted, so each letter has its own button and the press SETS the field (`set`, the payload
// family's third member). Four events rather than four states: the pick is still data, there is
// still exactly one `selected` state, and "Pick C" on a board showing two answers lights nothing
// because the runtime refuses a row the question does not use.

import { paletteById } from '../../model/wizard';
import { qz13 } from '../quiz/qz13';
import { qz14 } from '../quiz/qz14';
import { qz15 } from '../quiz/qz15';
import { SHOW_BOARD_CONTENT } from '../quiz/shared';
import { ANSWER_BOARD_STRUCTURE } from './answerBoard';
import type { GraphicType, TypeControlEvent, TypeEdge, TypeMachine } from './graphicType';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const pickEvent = (letter: string) => `pick${letter}`;

/** One pick event's two arrows: into `selected` from the question, and around `selected` so the
 *  pick can move. Nothing leaves the reveal, which is what makes the verdict final. */
const pickEdges = (letter: string): TypeEdge[] => [
  { from: { waypoint: 0 }, to: 'selected', trigger: 'operator', event: pickEvent(letter) },
  { from: 'selected', to: 'selected', trigger: 'operator', event: pickEvent(letter) },
];

const QUIZ_SHOW_MACHINE: TypeMachine = {
  main: {
    // The walk is question -> reveal -> out, so Continue alone still runs the board on a playout
    // server with no control page: show the question, reveal the answer, take it off.
    pathEvents: ['judge'],
    branches: [
      {
        id: 'selected',
        name: 'Answer picked',
        // Entering or RE-entering repaints the highlight from the field, which is what makes
        // "move the pick" a self-transition rather than a state per answer.
        timeline: {
          name: 'Pick',
          duration: 0.25,
          ease: 'in',
          calls: [{ time: 0, call: 'applySelection' }],
          layers: {},
        },
        edges: [
          ...LETTERS.flatMap(pickEdges),
          // Taking the pick back is a pick of nothing: the same state, an empty field.
          { from: 'selected', to: 'selected', trigger: 'operator', event: 'clearPick' },
          { from: 'selected', to: { waypoint: 1 }, trigger: 'operator', event: 'judge' },
          // And the rejoin, so an operator who picked can still just press Next.
          { from: 'selected', to: { waypoint: 1 }, trigger: 'operator', event: 'next' },
        ],
      },
    ],
  },
};

const QUIZ_SHOW_CONTROLS: TypeControlEvent[] = [
  ...LETTERS.map((letter, i): TypeControlEvent => ({
    event: pickEvent(letter),
    label: `Pick ${letter}`,
    section: 'Contestant picks',
    order: i + 1,
    set: { selectedAnswer: letter },
  })),
  { event: 'clearPick', label: 'Clear pick', section: 'Contestant picks', order: 5, set: { selectedAnswer: '' } },
  { event: 'judge', label: 'Reveal correct answer', section: 'Reveal', order: 6 },
];

const letterOptions = LETTERS.map((letter) => ({ label: letter, value: letter }));

export const quizShowType: GraphicType = {
  id: 'quiz-show',
  name: 'Quiz show board',
  description: 'A question with two to four answers: light up the contestant\'s pick, then reveal the correct answer.',
  structuralScope:
    'One question with two, three or four answers, one contestant pick, and the reveal. ' +
    'No lock-in beat, no audience percentages, and one question per graphic - a show duplicates it per question.',
  structure: ANSWER_BOARD_STRUCTURE,
  fields: [
    { key: 'question', label: 'Question', kind: 'text', value: SHOW_BOARD_CONTENT.question, role: 'line' },
    ...LETTERS.map((letter, i) => ({
      key: `answer${letter}`,
      label: `Answer ${letter}`,
      kind: 'text' as const,
      value: SHOW_BOARD_CONTENT.answers[i],
      role: 'line' as const,
    })),
    { key: 'correctAnswer', label: 'Correct answer', kind: 'select', value: SHOW_BOARD_CONTENT.correct, role: 'data', options: letterOptions },
    {
      key: 'selectedAnswer',
      label: 'Selected answer',
      kind: 'select',
      value: '',
      role: 'data',
      options: [{ label: 'None', value: '' }, ...letterOptions],
    },
    {
      key: 'answerCount',
      label: 'Answers shown',
      kind: 'select',
      value: '4',
      role: 'data',
      options: [{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }],
    },
  ],
  machine: QUIZ_SHOW_MACHINE,
  controls: QUIZ_SHOW_CONTROLS,
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['quiz-reveal'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'qz13',
      name: 'Sticker Quiz',
      description: 'Neo-brutal quiz: a cream card with a thick ink outline and a hard shadow, answers as stuck-on labels in a two-by-two grid.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      create: (_type, options) => qz13.create(options),
    },
    {
      id: 'qz14',
      name: 'Showtime Quiz',
      description: 'Theatre-marquee quiz: a bulb-lit question plaque over a stack of deep pill answers with cream keylines.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      create: (_type, options) => qz14.create(options),
    },
    {
      id: 'qz15',
      name: 'Arcade Quiz',
      description: 'Cabinet-screen quiz: pixel-cornered neon panels with scanlines, a player-select cursor on the pick.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      create: (_type, options) => qz15.create(options),
    },
  ],
};
