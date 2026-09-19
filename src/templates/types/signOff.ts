// The SIGN-OFF type - the card a production ends on. It is deliberately machine-less: one
// entrance, a hold, and stop() are exactly the derived linear lifecycle.

import { paletteById } from '../../model/wizard';
import { ss14 } from '../startingSoon/ss14';
import { ss15 } from '../startingSoon/ss15';
import { ss16 } from '../startingSoon/ss16';
import { ss17 } from '../startingSoon/ss17';
import { ss22 } from '../startingSoon/ss22';
import { ss23 } from '../startingSoon/ss23';
import { ss24 } from '../startingSoon/ss24';
import { optionalLine, type GraphicType } from './graphicType';

export const signOffType: GraphicType = {
  id: 'sign-off',
  name: 'Sign-off',
  description:
    'The card a show ends on: closing line, thank-you, next appointment, and logo.',
  structure: {
    prefix: 'starting-soon',
    category: 'starting-soon',
    parts: [
      // The panel and logo wrapper exist in every design, even when the optional image is empty.
      {
        id: 'box',
        selector: '.starting-soon-box',
        kind: 'panel',
        required: true,
      },
      {
        id: 'logo',
        selector: '.starting-soon-logo',
        kind: 'image',
        required: true,
      },
      // Lines remain optional structurally so a caller may clear copy without breaking create().
      optionalLine('closing', '#f0'),
      optionalLine('message', '#f1'),
      optionalLine('next', '#f2'),
    ],
  },
  fields: [
    // Visible lines compile first, preserving the starting-soon assembler's f0/f1/f2 order.
    {
      key: 'closing',
      label: 'Closing line',
      kind: 'text',
      value: 'UNTIL NEXT TIME',
      role: 'line',
    },
    {
      key: 'message',
      label: 'Message',
      kind: 'text',
      value: 'Thanks for watching',
      role: 'line',
    },
    {
      key: 'next',
      label: 'Next broadcast',
      kind: 'text',
      value: 'Back Thursday at 19:00',
      role: 'line',
    },
    // The shared image slot derives its id from the preceding fields, so the logo stays last.
    { key: 'logo', label: 'Logo', kind: 'image', value: '', role: 'logo' },
  ],
  // Entrance, hold, and stop are already the derived linear lifecycle. Persisting a machine
  // here would duplicate that answer and make saved templates noisier for no behavioural gain.
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 3,
    logo: 'optional',
    animationPresets: ['hold-still'],
    defaultZone: 'mid-center',
  },
  designs: [
    // House is the new noacg design because ss09 has no logo field and cannot be promoted.
    {
      id: 'ss17',
      name: 'House Sign-off',
      description:
        'The NoaCG end card with a logo, display message, amber rule, and next appointment.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => ss17.create(options),
    },
    // Each family keeps its authored copy through samples while sharing the same field shape.
    {
      id: 'ss14',
      name: 'Clean Sign-off',
      description:
        'A quiet end card with a logo, thank-you line, and optional next-broadcast note.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { closing: 'Until next time' },
      create: (_type, options) => ss14.create(options),
    },
    {
      id: 'ss15',
      name: 'Volt Sign-off',
      description:
        'A hard-edged end card with a logo, bold sign-off, and the next fixture line.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        closing: 'FULL TIME',
        message: 'THANKS FOR WATCHING',
        next: 'NEXT MATCH - SATURDAY 18:00',
      },
      create: (_type, options) => ss15.create(options),
    },
    {
      id: 'ss16',
      name: 'Frost Sign-off',
      description:
        'A frosted end card with a logo, gracious sign-off, and optional next appointment.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: {
        closing: 'Until we meet again',
        message: 'Thank you for joining us',
        next: 'The next session begins Friday at 20:00',
      },
      create: (_type, options) => ss16.create(options),
    },
    // The three GAME-SHOW cells (sticker, showtime, arcade). Each was designed FOR this type, as
    // one graphic of the quiz show kit (packs.ts, 'quiz-show').
    {
      id: 'ss22',
      name: 'Sticker Sign-off',
      description: 'A big paper label on a halftone accent field: closing line on an ink strip, a heavy thank-you, the next broadcast.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      create: (_type, options) => ss22.create(options),
    },
    {
      id: 'ss23',
      name: 'Showtime Sign-off',
      description: 'A bulb-lit marquee plaque on a burgundy curtain: billing caps, a serif thank-you, a lit star.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      create: (_type, options) => ss23.create(options),
    },
    {
      id: 'ss24',
      name: 'Arcade Sign-off',
      description: 'A pixel-cornered neon panel on a scanline screen: mono closing line, squared-caps thank-you, a row of pixels.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      create: (_type, options) => ss24.create(options),
    },
  ],
};
