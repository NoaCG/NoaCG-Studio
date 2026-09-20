// The two CLOCK types. Both carry the same small parallel group — a clock that an operator
// can pause and resume — which is the cheapest honest demonstration of the model's core
// claim: state that has nothing to do with the graphic's entrance lives in its own group,
// runs alongside the default path, and never multiplies the states on it.
//
// The group's initial state is `running`, so its timeline never plays at play() (a parallel
// group's initial state is where it rests, not something it enters). The clock is started
// exactly as before, by the entrance step's own startClock call. All the group adds is the
// ability to hold it.

import { paletteById } from '../../model/wizard';
import { gt01 } from '../gameTimers/gt01';
import { gt02 } from '../gameTimers/gt02';
import { gt05 } from '../gameTimers/gt05';
import { gt06 } from '../gameTimers/gt06';
import { gt07 } from '../gameTimers/gt07';
import { gt08 } from '../gameTimers/gt08';
import { gt09 } from '../gameTimers/gt09';
import { ss01 } from '../startingSoon/ss01';
import { ss02 } from '../startingSoon/ss02';
import { ss03 } from '../startingSoon/ss03';
import { ss04 } from '../startingSoon/ss04';
import type { GraphicType, TypeGroup } from './graphicType';

/** The pause/resume group, shared by both clock types. The two states carry a short dim/undim
 *  so the operator can SEE that the clock is held, and a call that does the holding. */
function clockGroup(): TypeGroup {
  return {
    id: 'clock',
    initial: 'running',
    states: [
      {
        id: 'running',
        name: 'Running',
        timeline: {
          name: 'Resume',
          duration: 0.25,
          ease: 'in',
          calls: [{ time: 0, call: 'resumeClock' }],
          layers: { clock: { opacity: [{ time: 0, value: 0.55 }, { time: 0.25, value: 1 }] } },
        },
        edges: [{ from: 'paused', to: 'running', trigger: 'operator', event: 'resume' }],
      },
      {
        id: 'paused',
        name: 'Paused',
        timeline: {
          name: 'Pause',
          duration: 0.25,
          ease: 'out',
          calls: [{ time: 0, call: 'pauseClock' }],
          layers: { clock: { opacity: [{ time: 0, value: 1 }, { time: 0.25, value: 0.55 }] } },
        },
        edges: [{ from: 'running', to: 'paused', trigger: 'operator', event: 'pause' }],
      },
    ],
  };
}

const CLOCK_CONTROLS = [
  { event: 'pause', label: 'Pause clock', section: 'Clock', order: 1 },
  { event: 'resume', label: 'Resume clock', section: 'Clock', order: 2 },
];

/** COUNTDOWN / TIMER — 30 of the 60 formats need one (countdown, interval timer, round timer,
 *  deal timer, break timer). A label and a clock; the duration is DATA the operator sets. */
export const countdownType: GraphicType = {
  id: 'countdown',
  name: 'Countdown',
  description: 'A labelled clock counting down to zero, pausable on air.',
  frequency: 30,
  structure: {
    prefix: 'game-timer',
    category: 'game-timer',
    parts: [
      { id: 'box', selector: '.game-timer-box', kind: 'panel', required: true },
      { id: 'clock', selector: '.game-timer-clock', kind: 'block', required: true },
      { id: 'label', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'label', label: 'Label', kind: 'text', value: 'ROUND 1', role: 'line' },
    // The duration is an operator VALUE, not a state: a timer's length has to be typed, and
    // timer-transition durations are authored data the operator cannot reach. `hidden` is the
    // ROLE (it lives in a display:none holder — a bare "3" painted on air means nothing), and
    // `number` is the control: a round is lengthened by a minute far more often than it is
    // retyped, so every operator surface gives it steppers.
    // NO LOGO FIELD IS DECLARED, and that is what `optional` means. A declared field is one the
    // template ALWAYS emits - `signOffType` declares one because its designs draw the slot
    // unconditionally - while an optional mark appears only when the operator turns it on. Declare
    // one here and the type contract gate reads "type declares 3, template emits 2" on every
    // catalog timer, which is the honest complaint: the count would be a promise the emit breaks.
    // `lowerThirdType` is optional and declares none either.
    { key: 'minutes', label: 'Timer (minutes)', kind: 'number', value: '3', role: 'hidden' },
  ],
  machine: { parallel: [clockGroup()] },
  controls: CLOCK_CONTROLS,
  capabilities: {
    maxLines: 1,
    // A CLOCK TAKES A MARK. It read `none` until 2026-08-21, and that was an accident of
    // authoring rather than a property of the type: nothing about a label over a clock excludes a
    // channel mark, and the catalog already proves it - `ss14`-`ss17` are clock-family designs
    // shipping an optional slot, with CSS that collapses it when empty.
    //
    // What it cost while it stood: a Pro package carried its mark on the lower third and the
    // sponsor bug and never on the countdown, so the owner's sixth taste rule - a package's mark
    // is on every piece or on none - fired on all 36 archived rows and all 4 topic-card rows
    // (docs/NOACG_PRO_PLAN.md §25.4). The owner's ruling, 2026-08-21: a mark is allowed anywhere
    // unless the type genuinely cannot hold one, and a model placing one badly is a reason to
    // teach the model, never to forbid the mark in the platform.
    logo: 'optional',
    animationPresets: ['timer-line-reveal', 'timer-run'],
    defaultZone: 'top-center',
  },
  designs: [
    {
      id: 'gt01',
      // AUTHORED WITHOUT A MARK, and it stays that way. The type PERMITS one - a clock is not a
      // kind of graphic that excludes a mark - but whether this DESIGN has somewhere to put one is
      // a drawing decision, and nobody has drawn it. Opt in by changing this line and placing it.
      logo: 'none',
      name: 'Clean Clock',
      description: 'A quiet label over big tabular digits — the timer that gets out of the way.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      create: (_type, options) => gt01.create(options),
    },
    {
      id: 'gt02',
      // AUTHORED WITHOUT A MARK, and it stays that way. The type PERMITS one - a clock is not a
      // kind of graphic that excludes a mark - but whether this DESIGN has somewhere to put one is
      // a drawing decision, and nobody has drawn it. Opt in by changing this line and placing it.
      logo: 'none',
      name: 'Power Clock',
      description: 'A corner slab clock with a leaning accent edge — flips to the accent and flashes at zero.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'archivo',
      samples: { label: 'SHOT CLOCK' },
      // The slab flips to the accent on the run-in; it was never a line reveal.
      animationPresets: ['timer-run'],
      // A corner slab, not a centred clock — it is drawn to sit against the top-right edge.
      defaultZone: 'top-right',
      create: (_type, options) => gt02.create(options),
    },
    {
      // Designed FOR this cell: no noacg countdown existed. The house strap as a timer —
      // amber bar, void panel, mono label, display clock. Sibling of lt11 House Strap.
      id: 'gt05',
      // AUTHORED WITHOUT A MARK, and it stays that way. The type PERMITS one - a clock is not a
      // kind of graphic that excludes a mark - but whether this DESIGN has somewhere to put one is
      // a drawing decision, and nobody has drawn it. Opt in by changing this line and placing it.
      logo: 'none',
      name: 'House Countdown',
      description: 'The house timer: an amber bar and void panel, a mono label over a display clock.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['timer-line-reveal', 'timer-run'],
      defaultZone: 'top-center',
      create: (_type, options) => gt05.create(options),
    },
    {
      // Designed FOR this cell: no glass countdown existed. A frosted card with the clock in
      // an accent-ringed pill — sibling of lt08 Frosted Card and the ss03 Frost Hold.
      id: 'gt06',
      // AUTHORED WITHOUT A MARK, and it stays that way. The type PERMITS one - a clock is not a
      // kind of graphic that excludes a mark - but whether this DESIGN has somewhere to put one is
      // a drawing decision, and nobody has drawn it. Opt in by changing this line and placing it.
      logo: 'none',
      name: 'Frost Countdown',
      description: 'A frosted card with a soft label over a clock set in an accent-ringed glass pill.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { label: 'BREAK' },
      animationPresets: ['timer-run', 'timer-line-reveal'],
      defaultZone: 'top-center',
      create: (_type, options) => gt06.create(options),
    },
    // The three GAME-SHOW cells (sticker, showtime, arcade). Each was designed FOR this type, as
    // one graphic of the quiz show kit (packs.ts, 'quiz-show').
    {
      id: 'gt07',
      name: 'Sticker Clock',
      description: 'A paper label with an ink title strip, a big heavy clock and an accent bar along the bottom.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      // Authored without a mark, like every countdown so far: the type permits one, and this
      // design has nowhere drawn for it.
      logo: 'none',
      animationPresets: ['timer-line-reveal', 'timer-run'],
      defaultZone: 'top-center',
      create: (_type, options) => gt07.create(options),
    },
    {
      id: 'gt08',
      name: 'Showtime Clock',
      description: 'A marquee pill: the round in billing caps, a lit star, and the clock in a ringed dark well.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      // Authored without a mark, like every countdown so far: the type permits one, and this
      // design has nowhere drawn for it.
      logo: 'none',
      animationPresets: ['timer-line-reveal', 'timer-run'],
      defaultZone: 'top-center',
      create: (_type, options) => gt08.create(options),
    },
    {
      id: 'gt09',
      name: 'Arcade Clock',
      description: 'A pixel-cornered neon panel: mono round name, a big glowing clock, a row of pixels.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      // Authored without a mark, like every countdown so far: the type permits one, and this
      // design has nowhere drawn for it.
      logo: 'none',
      animationPresets: ['timer-line-reveal', 'timer-run'],
      defaultZone: 'top-center',
      create: (_type, options) => gt09.create(options),
    },
  ],
};

/** HOLDING SCREEN — the pre-show front door (starting soon, be right back, break screen);
 *  9 of the 60 formats call for one. Not a countdown wearing a different hat: it carries the
 *  show's title as well as the clock, and it breathes while it waits. */
export const holdingScreenType: GraphicType = {
  id: 'holding-screen',
  name: 'Holding screen',
  description: 'The pre-show screen: what is starting, and how long until it does.',
  frequency: 9,
  structure: {
    prefix: 'starting-soon',
    category: 'starting-soon',
    parts: [
      { id: 'box', selector: '.starting-soon-box', kind: 'panel', required: true },
      { id: 'clock', selector: '.starting-soon-clock', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'title', label: 'Title', kind: 'text', value: 'STARTING SOON', role: 'line' },
    { key: 'show', label: 'Show name', kind: 'text', value: 'The Late Line', role: 'line' },
    // Same contract as the countdown type's duration: hidden holder, number control.
    { key: 'minutes', label: 'Countdown (minutes)', kind: 'number', value: '5', role: 'hidden' },
  ],
  machine: { parallel: [clockGroup()] },
  controls: CLOCK_CONTROLS,
  capabilities: {
    maxLines: 2,
    // A HOLDING SCREEN TAKES A MARK, and of all the graphics that declined one this is the least
    // defensible: it is what a channel sits on longest, and the only thing on screen while an
    // audience waits. The sign-off screens beside it in this very category have carried a slot
    // all along (`signOffShared.ts`), so the category was never the obstacle - the assembler was
    // (docs/MARK_CAPABILITY_AUDIT.md, 2026-08-21).
    //
    // The type PERMITS; each design says whether it draws one. All four decline today for the
    // honest reason: nobody has placed a mark in them yet.
    logo: 'optional',
    animationPresets: ['hold-loop'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      // Designed FOR this cell: no noacg holding screen existed. The house void panel as a
      // pre-show front door — sibling of lt11 House Strap and card05 House Title.
      id: 'ss04',
      // THE ONE HOLDING SCREEN THAT DRAWS A MARK, so the path is exercised rather than merely
      // offered. The placement follows this category's own shipped composition - ss14-ss17 put
      // the mark above the words - rather than any rule: it is a drawing decision, and moving it
      // is one line here plus the CSS the design already owns.
      logo: 'optional',
      name: 'House Hold',
      description: 'The house holding screen: mono kicker, display show name, a breathing void clock chip.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => ss04.create(options),
    },
    {
      id: 'ss01',
      // AUTHORED WITHOUT A MARK. The type permits one; nobody has placed one in this design yet.
      logo: 'none',
      name: 'Quiet Hold',
      description: 'A breathing hold screen: the show name, a countdown, and room to wait.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      create: (_type, options) => ss01.create(options),
    },
    {
      id: 'ss02',
      // AUTHORED WITHOUT A MARK. The type permits one; nobody has placed one in this design yet.
      logo: 'none',
      name: 'Volt Hold',
      description: 'Centered sport stack — accent chip, huge condensed show name, slab-mounted countdown.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'archivo',
      samples: { show: 'FRIDAY FIGHT NIGHT' },
      create: (_type, options) => ss02.create(options),
    },
    {
      id: 'ss03',
      // AUTHORED WITHOUT A MARK. The type permits one; nobody has placed one in this design yet.
      logo: 'none',
      name: 'Frost Hold',
      description: 'A centered frosted card with the countdown breathing inside a soft glass pill.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { show: 'Midnight Sessions' },
      create: (_type, options) => ss03.create(options),
    },
  ],
};
