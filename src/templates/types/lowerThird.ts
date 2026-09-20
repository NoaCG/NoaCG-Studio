// LOWER THIRD — the most-needed graphic there is: 52 of the 60 reference formats call for
// one (anchor, guest, speaker, artist, player, pastor, candidate…). It is also the type that
// proves the model stays out of the way: one group, three states (off -> on -> out), no
// machine key at all, and the SPX Continue contract drives it with nothing else declared.
//
// Design: promotes lt11 "House Strap" unchanged — the family flagship every other house
// variant is already judged against.

import { paletteById } from '../../model/wizard';
import { lt02 } from '../lowerThirds/lt02';
import { lt05 } from '../lowerThirds/lt05';
import { lt11 } from '../lowerThirds/lt11';
import { lt15 } from '../lowerThirds/lt15';
import { lt25 } from '../lowerThirds/lt25';
import { lt32 } from '../lowerThirds/lt32';
import { lt68 } from '../lowerThirds/lt68';
import { lt69 } from '../lowerThirds/lt69';
import { lt70 } from '../lowerThirds/lt70';
import type { GraphicType } from './graphicType';
import { sampleName } from '../shared/sampleNames';

export const lowerThirdType: GraphicType = {
  id: 'lower-third',
  name: 'Lower third',
  description: 'A name and a title, anchored bottom-left. The workhorse of live graphics.',
  frequency: 52,
  structure: {
    prefix: 'lower-third',
    category: 'lower-third',
    parts: [
      { id: 'accent', selector: '.lower-third-accent', kind: 'accent', required: true },
      { id: 'box', selector: '.lower-third-box', kind: 'panel', required: true },
      { id: 'name', selector: '#f0', kind: 'line', required: true },
      { id: 'title', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'name', label: 'Name', kind: 'text', value: sampleName('lower-third-type'), role: 'line' },
    { key: 'title', label: 'Title', kind: 'text', value: 'Anchor · Evening News', role: 'line' },
  ],
  // No branches, no parallel groups, no event overrides: the derived linear machine is
  // already exactly right, so nothing is persisted and the emitted template is unchanged.
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    // The BRAND SLOT, 2026-08-09. A compiled variant takes the TYPE's capabilities, so this is
    // what the wizard's logo toggle, the Template step's logo filter and the AI's chassis
    // metadata read - and while it said 'none', the six designs the managed free profile is
    // allowed to use could not carry a channel mark at all (benchmarks/lite/BRAND-AUDIT-2026-08-09.md).
    // The field is NOT in `fields` above on purpose: an optional logo is emitted by the shared
    // slot only when the user turns it on, so the declared field list stays the two lines this
    // type is. `briefings.ts` and `cards.ts` already work exactly this way.
    logo: 'optional',
    animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'lt11',
      name: 'House Strap',
      description: 'The NoaCG house strap: amber accent bar, void blur panel, mono kicker title.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => lt11.create(options),
    },
    {
      id: 'lt02',
      name: 'Underline',
      description: 'Panel-free name and title separated by a short accent underline.',
      styleTag: 'minimal',
      palette: paletteById('signal'),
      fontId: 'space-grotesk',
      samples: { name: 'Marcus Chen', title: 'Senior Analyst' },
      // The underline is the design's one accent moment, so line-reveal leads; it was never
      // drawn for a mask-wipe, which the type's list adds.
      animationPresets: ['line-reveal', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => lt02.create(options),
    },
    {
      id: 'lt05',
      name: 'Angle Slab',
      description: 'A forward-leaning dark slab with a chunky accent edge - fast, aggressive sport energy.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { name: 'JAKE MORRISON', title: '24 PTS · 11 AST' },
      // The design labels its lines "Player" and "Stat line" where the type says "Name" and
      // "Title" — but they are the same two roles: a player name is the primary identifier, a
      // stat line is the secondary descriptor. Sport-flavoured wording for a name and a title.
      semantics: 'Player = the name (primary identifier); stat line = the title (secondary line).',
      // The lean is painted on a pseudo-layer precisely so the stinger's skew cannot flatten
      // it; taking the type's line-reveal default would retire the preset it is drawn around.
      animationPresets: ['snap-stinger', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => lt05.create(options),
    },
    // On the semantics gate, which is the only one that had to be argued here: lt05 names its
    // fields Player and Stat line where this type names them Name and Title. That is the type
    // GENERALISING its instances, not redefining them - both graphics answer "who is on screen,
    // and one thing about them", and lt05's own file opens by calling itself a sport lower
    // third. It is the mirror of the lt01 mistake rather than a repeat of it: that was a lower
    // third claimed by a DIFFERENT type whose fields mean something else entirely, while here
    // the type and the design already agree on what the graphic is.
    //
    {
      // Designed FOR this cell. NO EXISTING GLASS LOWER THIRD IS PROMOTABLE, and all three
      // fail differently, which is why this cell needed a new design rather than a promotion:
      //  - lt08 Frosted Card fails two gates at once - it emits no .lower-third-accent element
      //    (the accent is its keyline) and carries three lines against this type's two. (A third
      //    reason stood until 2026-08-09: it declared logo 'optional' where this type declared
      //    none. The type declares 'optional' now, so that one is gone; the other two are not.)
      //  - lt09 Gradient Pill fails parts for the same reason (its accent is an edge ring drawn
      //    by a pseudo-element, so there is no accent NODE for a timeline to address) and fails
      //    semantics besides: its second line is an @handle, which is the social bug's subject;
      //  - lt10 Soft Stack has a real accent but emits three fields against this type's two.
      // The parts gate is doing genuine work here: five of the fourteen original lower thirds
      // paint their accent rather than placing it, and a type that names `accent` as a required
      // part cannot take any of them however well the rest lines up. lt15 keeps lt08's frosted
      // card but leads it with a real soft accent edge and holds to the two lines this type
      // declares.
      id: 'lt15',
      name: 'Frost Strap',
      description: 'A frosted glass strap led by a soft accent edge — name over a dimmed title.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { name: 'Sofia Lindqvist', title: 'Creative Director' },
      animationPresets: ['blur-in', 'pop-spring', 'line-reveal', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => lt15.create(options),
    },
    {
      // The EDITORIAL cell. Promotable as written: a real .lower-third-accent element (the
      // masthead rule), exactly the two lines this type declares, and no logo slot.
      id: 'lt25',
      name: 'Masthead',
      description: 'A rule across the top, the name beneath it, the role as a tracked caps line.',
      styleTag: 'editorial',
      palette: paletteById('vermilion'),
      fontId: 'archivo',
      samples: { name: 'Alexandra Riva', title: 'Chief Correspondent' },
      // The design calls line 1 "Role" where this type says "Title". Same role in the graphic:
      // the secondary descriptor under a name. Editorial wording for a title line.
      semantics: 'Role = the title (the secondary descriptor under the name).',
      // The masthead rule IS the entrance, so line-reveal leads; the design was never drawn
      // for a mask-wipe, which the type's default list adds.
      animationPresets: ['line-reveal', 'fade', 'mask-wipe', 'slide-up', 'slide-down'],
      create: (_type, options) => lt25.create(options),
    },
    {
      // The CINEMATIC cell. Same story: a real accent element (the hairline over the name),
      // two lines, no logo slot.
      id: 'lt32',
      name: 'Scrim',
      description: 'Name and role on a scrim that fades into the shot — no panel, no edges.',
      styleTag: 'cinematic',
      palette: paletteById('noir'),
      fontId: 'inter',
      samples: { name: 'Alexandra Riva', title: 'Marine Biologist' },
      semantics: 'Role = the title (the secondary descriptor under the name).',
      // Cinematic motion is slow and still: a fade leads and nothing overshoots.
      animationPresets: ['fade', 'blur-in', 'line-reveal', 'slide-up', 'mask-wipe'],
      create: (_type, options) => lt32.create(options),
    },
    // ── The three GAME-SHOW cells. Each was designed FOR this type (a real accent element, the two
    // declared lines, the shared optional logo band), as the lower third of a set whose other two
    // members are a quiz show board (types/quizShow.ts) and a two-player score (types/duelScore.ts).
    {
      id: 'lt68',
      name: 'Sticker Strap',
      description: 'A flat paper label with a thick ink outline and a hard shadow - the name on paper, the title on an ink strip.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      samples: { name: 'Alex Rivera', title: 'Contestant · Helsinki' },
      // The family snaps: the stinger leads, and the type's line-reveal default is not drawn for.
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down'],
      create: (_type, options) => lt68.create(options),
    },
    {
      id: 'lt69',
      name: 'Showtime Strap',
      description: 'A theatre-marquee pill led by a lit star - the name in serif over a title in billing caps.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      samples: { name: 'Vivian Laine', title: 'Host of the evening' },
      // A marquee lights up; it does not slam.
      animationPresets: ['fade', 'pop-spring', 'slide-up', 'mask-wipe', 'slide-down'],
      create: (_type, options) => lt69.create(options),
    },
    {
      id: 'lt70',
      name: 'Arcade Strap',
      description: 'A pixel-cornered neon player tag with scanlines - the name in squared caps, the title in mono.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      samples: { name: 'Mika Storm', title: 'Player one · 3 wins' },
      // A screen draws itself on: the wipe leads.
      animationPresets: ['mask-wipe', 'snap-stinger', 'slide-up', 'fade', 'slide-down'],
      create: (_type, options) => lt70.create(options),
    },
    //
    // lt07 is NOT promotable here either, and the reason it taught is worth keeping even though
    // the fact behind it has changed: a compiled variant takes the TYPE's capabilities, not the
    // design's, so while this type said `logo: 'none'` promoting lt07 silently stripped the
    // badge it is named for and dropped it out of the wizard's logo-first ordering. The type
    // carries an optional logo since 2026-08-09, so the LOGO half no longer bites; lt07 still
    // emits three lines against this type's two, and that is the disqualifier that remains.
    // lt10 is NOT promotable here: this type declares two fields (name, title) and lt10 emits
    // three. A type's field count is part of its contract — the control page and the compiled
    // fN ids are built from it — so a design carrying an extra field is a different graphic,
    // not the same graphic in another skin. The glass lower-third cell needs a two-field design.
  ],
};
