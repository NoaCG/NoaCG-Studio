// THE IDENTITY BUGS — the small persistent marks a channel, an event or a sponsor leaves on
// screen while everything else comes and goes. Eight types, four looks each: the station ident,
// the live-status bug, the logo-only mark, the sponsor strip, the rotating sponsor bug, the
// event ident, the award mark and the location/status chip.
//
// They live next to bugs.ts (the sponsor bug and the social handle) rather than inside it
// because they answer a different question: bugs.ts is "the two persistent bugs the reference
// formats named", this file is the identity family those two turned out to be the corner of.
//
// SIX of the eight declare NO machine, which is the model working as intended (docs/
// GRAPHIC_TYPES.md): a bug's whole job is to persist, stop() removes it, and the derived
// one-group linear machine already describes that exactly. The two that DO declare one earn it:
//
//  - LIVE STATUS is genuinely stateful. "Are we live, is this a replay, are we in standby" is
//    the single most consequential thing a bug can say, and a graphic that only ever showed the
//    word an operator typed would be claiming a status it does not track. So the three modes
//    are real states with real arrows, the legality is structural (from Live the operator may
//    go to Replay or Standby, never to Live again), and each mode's WORDING stays an ordinary
//    editable field — the machine switches state, not copy.
//
//  - SPONSOR ROTATION advances by itself. It is the ticker type's proof re-used for the
//    graphic that most often needs it: a timer arms at the end of the entry timeline, the beat
//    is a crossfade whose midpoint calls sponsorShowNext(), and a self-transition keeps it
//    going. The index is runtime data, never a state per sponsor — "parameterize with data".
//    Empty slots are skipped by the runtime, so the rotation never lands on nothing.

import { paletteById } from '../../model/wizard';
import { bug05 } from '../cornerBug/bug05';
import { bug06 } from '../cornerBug/bug06';
import { bug07 } from '../cornerBug/bug07';
import { bug08 } from '../cornerBug/bug08';
import { bug09 } from '../cornerBug/bug09';
import { bug10 } from '../cornerBug/bug10';
import { bug11 } from '../cornerBug/bug11';
import { bug12 } from '../cornerBug/bug12';
import { bug13 } from '../cornerBug/bug13';
import { bug14 } from '../cornerBug/bug14';
import { bug15 } from '../cornerBug/bug15';
import { bug16 } from '../cornerBug/bug16';
import { bug38 } from '../cornerBug/bug38';
import { bug39 } from '../cornerBug/bug39';
import { bug40 } from '../cornerBug/bug40';
import { bug17 } from '../cornerBug/bug17';
import { bug18 } from '../cornerBug/bug18';
import { bug19 } from '../cornerBug/bug19';
import { bug20 } from '../cornerBug/bug20';
import { bug21 } from '../cornerBug/bug21';
import { bug22 } from '../cornerBug/bug22';
import { bug23 } from '../cornerBug/bug23';
import { bug24 } from '../cornerBug/bug24';
import { bug25 } from '../cornerBug/bug25';
import { bug26 } from '../cornerBug/bug26';
import { bug27 } from '../cornerBug/bug27';
import { bug28 } from '../cornerBug/bug28';
import { bug29 } from '../cornerBug/bug29';
import { bug30 } from '../cornerBug/bug30';
import { bug31 } from '../cornerBug/bug31';
import { bug32 } from '../cornerBug/bug32';
import { bug33 } from '../cornerBug/bug33';
import { bug34 } from '../cornerBug/bug34';
import { bug35 } from '../cornerBug/bug35';
import { bug36 } from '../cornerBug/bug36';
import type { GraphicType, TypeBranch } from './graphicType';

// ── STATION IDENT ────────────────────────────────────────────────────────────

/** STATION / SHOW IDENT — the channel's own mark: who is broadcasting, and what is on. The
 *  most persistent graphic there is; on many channels it never leaves the screen. */
export const stationBugType: GraphicType = {
  id: 'station-bug',
  name: 'Station ident',
  description: 'The channel logo with the channel name and the show currently on air.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'channel', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'channel', label: 'Channel', kind: 'text', value: 'NOACG TV', role: 'line' },
    { key: 'show', label: 'Show', kind: 'text', value: 'THE MORNING LINE', role: 'line' },
    // The logo compiles LAST — every slot derives its id from the count of everything else.
    { key: 'logo', label: 'Logo', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'built-in',
    animationPresets: ['slide-right', 'fade', 'blur-in', 'slide-up', 'slide-down', 'pop-spring'],
    defaultZone: 'top-left',
  },
  designs: [
    {
      id: 'bug05',
      name: 'House Ident',
      description: 'The house station ident: an amber bar, the channel logo, the channel over its show.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug05.create(options),
    },
    {
      id: 'bug06',
      name: 'Frost Ident',
      description: 'A frosted ident tile: the channel logo, an accent dot, the channel over its show.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { channel: 'Northside', show: 'MIDNIGHT SESSIONS' },
      animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-right', 'slide-down', 'flip-3d'],
      create: (_type, options) => bug06.create(options),
    },
    {
      id: 'bug07',
      name: 'Slab Ident',
      description: 'A solid ident slab: the club logo on a fused accent block, channel over show.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { channel: 'VOLTA SPORT', show: 'MATCHDAY LIVE' },
      animationPresets: ['slide-right', 'snap-stinger', 'pop-spring', 'fade', 'slide-down', 'blur-in'],
      create: (_type, options) => bug07.create(options),
    },
    {
      id: 'bug08',
      name: 'Rule Ident',
      description: 'A panel-free ident: the logo, a thin accent rule, the channel over its show.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { channel: 'CITY NEWS', show: 'THE BRIEFING' },
      animationPresets: ['fade', 'slide-right', 'blur-in', 'slide-down', 'slide-up'],
      create: (_type, options) => bug08.create(options),
    },
  ],
};

// ── LIVE STATUS ──────────────────────────────────────────────────────────────

/** How long a status change takes; the word swaps at the midpoint, while nothing is legible. */
const STATUS_BEAT = 0.4;

/**
 * One status mode as a machine state. The timeline is a crossfade of the word (and its lamp)
 * with the swap called at the midpoint — the ticker's beat, at bug scale.
 *
 * `reachableFrom` is the honest half: the arrows say which switches make sense. From the
 * entrance (which IS live) the operator can go to Replay or Standby but not to Live, because
 * the graphic is already live — and structural guarding means the control page greys that
 * button out with no expression language anywhere.
 */
function statusState(id: string, name: string, event: string, call: string, reachableFrom: TypeBranch['edges']): TypeBranch {
  return {
    id,
    name,
    timeline: {
      name,
      duration: STATUS_BEAT,
      ease: 'in',
      calls: [{ time: STATUS_BEAT / 2, call }],
      layers: {
        status: {
          opacity: [
            { time: 0, value: 1 },
            { time: STATUS_BEAT / 2, value: 0 },
            { time: STATUS_BEAT, value: 1 },
          ],
        },
        dot: {
          opacity: [
            { time: 0, value: 1 },
            { time: STATUS_BEAT / 2, value: 0 },
            { time: STATUS_BEAT, value: 1 },
          ],
        },
      },
    },
    edges: reachableFrom.map((e) => ({ ...e, to: id, trigger: 'operator' as const, event })),
  };
}

/** LIVE / REPLAY / STANDBY — the status bug, and the one type in this file whose state is the
 *  point. The graphic starts live (that is what going on air means) and the operator switches
 *  it from the control panel; each mode owns its own wording as an ordinary field. */
export const liveBugType: GraphicType = {
  id: 'live-bug',
  name: 'Live status',
  description: 'The on-air status mark: live, replay or standby, switched by the operator.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'status', selector: '#f0', kind: 'line', required: true },
      { id: 'dot', selector: '.corner-bug-dot', kind: 'accent', required: true },
    ],
  },
  fields: [
    { key: 'status', label: 'Status', kind: 'text', value: 'LIVE', role: 'line' },
    // The three words the machine switches between. Data, not states: the wording is the
    // operator's (DIREKTE, REPRISE, RECORDING), the state machine only decides which is shown.
    { key: 'liveWord', label: 'Live word', kind: 'text', value: 'LIVE', role: 'data' },
    { key: 'replayWord', label: 'Replay word', kind: 'text', value: 'REPLAY', role: 'data' },
    { key: 'standbyWord', label: 'Standby word', kind: 'text', value: 'STANDBY', role: 'data' },
  ],
  machine: {
    main: {
      branches: [
        // Live is reachable only from the other two — from the entrance the graphic already IS
        // live, and offering a button that changes nothing is a lie the guard can prevent.
        statusState('live', 'Live', 'live', 'bugStatusLive', [
          { from: 'replay', to: '', trigger: 'operator' },
          { from: 'standby', to: '', trigger: 'operator' },
        ]),
        statusState('replay', 'Replay', 'replay', 'bugStatusReplay', [
          { from: { waypoint: 0 }, to: '', trigger: 'operator' },
          { from: 'live', to: '', trigger: 'operator' },
          { from: 'standby', to: '', trigger: 'operator' },
        ]),
        statusState('standby', 'Standby', 'standby', 'bugStatusStandby', [
          { from: { waypoint: 0 }, to: '', trigger: 'operator' },
          { from: 'live', to: '', trigger: 'operator' },
          { from: 'replay', to: '', trigger: 'operator' },
        ]),
      ],
    },
  },
  controls: [
    { event: 'live', label: 'Live', section: 'Status', order: 1 },
    { event: 'replay', label: 'Replay', section: 'Status', order: 2 },
    { event: 'standby', label: 'Standby', section: 'Status', order: 3 },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['pop-spring', 'fade', 'blur-in', 'slide-down', 'slide-left'],
    defaultZone: 'top-right',
  },
  designs: [
    {
      id: 'bug09',
      name: 'House Live',
      description: 'The house live bug: a void chip, a breathing amber dot, and a switchable status word.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug09.create(options),
    },
    {
      id: 'bug10',
      name: 'Frost Live',
      description: 'A frosted live pill: a breathing accent dot beside a switchable status word.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['blur-in', 'pop-spring', 'fade', 'slide-down', 'slide-left'],
      create: (_type, options) => bug10.create(options),
    },
    {
      id: 'bug11',
      name: 'Volt Live',
      description: 'A solid accent live chip: the status word in chip ink, neutral when off air.',
      styleTag: 'sport',
      palette: paletteById('signal'),
      fontId: 'oswald',
      animationPresets: ['snap-stinger', 'pop-spring', 'slide-left', 'fade', 'blur-in'],
      create: (_type, options) => bug11.create(options),
    },
    {
      id: 'bug12',
      name: 'Signal Live',
      description: 'A panel-free live mark: a breathing accent dot beside a switchable status word.',
      styleTag: 'minimal',
      palette: paletteById('signal'),
      fontId: 'inter',
      animationPresets: ['fade', 'blur-in', 'slide-left', 'slide-down', 'pop-spring'],
      create: (_type, options) => bug12.create(options),
    },
  ],
};

// ── LOGO ONLY ────────────────────────────────────────────────────────────────

/** LOGO-ONLY MARK — a bug with no text at all. It exists as its own type rather than as a
 *  station ident with empty fields because "no caption" is a structural decision: there are no
 *  line fields to fill, so the wizard offers none and the operator cannot leave one blank. */
export const logoBugType: GraphicType = {
  id: 'logo-bug',
  name: 'Logo mark',
  description: 'A logo and nothing else — the quietest way to keep a brand on screen.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'media', selector: '.corner-bug-media', kind: 'image', required: true },
    ],
  },
  fields: [{ key: 'logo', label: 'Logo', kind: 'image', value: '', role: 'logo' }],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 0,
    logo: 'built-in',
    animationPresets: ['fade', 'blur-in', 'slide-up', 'pop-spring', 'slide-down'],
    defaultZone: 'top-right',
  },
  designs: [
    {
      id: 'bug13',
      name: 'House Mark',
      description: 'Logo only: the house mark over a short amber rule, with no caption at all.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      defaultZone: 'top-left',
      create: (_type, options) => bug13.create(options),
    },
    {
      id: 'bug14',
      name: 'Frost Mark',
      description: 'Logo only: one small frosted tile holding the logo and nothing else.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-down', 'flip-3d'],
      create: (_type, options) => bug14.create(options),
    },
    {
      id: 'bug15',
      name: 'Block Mark',
      description: 'Logo only: a solid slab with the logo and a fused accent edge — no text.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      animationPresets: ['pop-spring', 'slide-down', 'snap-stinger', 'fade', 'blur-in'],
      create: (_type, options) => bug15.create(options),
    },
    {
      id: 'bug16',
      name: 'Clear Mark',
      description: 'Logo only: the bare logo over the video, with nothing else around it.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['fade', 'blur-in', 'slide-down', 'slide-up', 'pop-spring'],
      create: (_type, options) => bug16.create(options),
    },
    // The three GAME-SHOW cells (sticker, showtime, arcade). Each was designed FOR this type, as
    // one graphic of the quiz show kit (packs.ts, 'quiz-show').
    {
      id: 'bug38',
      name: 'Sticker Mark',
      description: 'Logo only: the mark on a small paper label with a thick ink outline and a hard shadow.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      animationPresets: ['pop-spring', 'fade', 'slide-down', 'slide-up', 'blur-in'],
      create: (_type, options) => bug38.create(options),
    },
    {
      id: 'bug39',
      name: 'Showtime Mark',
      description: 'Logo only: the mark on a small marquee plaque with a bulb-coloured keyline.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      animationPresets: ['fade', 'pop-spring', 'slide-down', 'slide-up', 'blur-in'],
      create: (_type, options) => bug39.create(options),
    },
    {
      id: 'bug40',
      name: 'Arcade Mark',
      description: 'Logo only: the mark in a small pixel-cornered frame with a glowing neon rim.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      animationPresets: ['fade', 'slide-down', 'slide-up', 'pop-spring', 'blur-in'],
      create: (_type, options) => bug40.create(options),
    },
  ],
};

// ── SPONSOR STRIP ────────────────────────────────────────────────────────────

/** SPONSOR / PARTNER STRIP — a kicker and several partner logos in a row. Three slots, because
 *  three is what a strip can hold at bug scale and still be read; an unused slot simply keeps
 *  its placeholder, so the same design serves one partner or three. */
export const sponsorStripType: GraphicType = {
  id: 'sponsor-strip',
  name: 'Sponsor strip',
  description: 'A "supported by" kicker with up to three partner logos beside it.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'kicker', selector: '#f0', kind: 'line', required: true },
      { id: 'row', selector: '.corner-bug-row', kind: 'block', required: true },
    ],
  },
  fields: [
    { key: 'kicker', label: 'Kicker', kind: 'text', value: 'SUPPORTED BY', role: 'line' },
    // Three image slots. Only the LAST carries the `logo` role: the shared slot helper derives
    // its id from the field count, and the other two are ordinary operator data of image kind.
    { key: 'sponsor1', label: 'Sponsor 1', kind: 'image', value: '', role: 'data' },
    { key: 'sponsor2', label: 'Sponsor 2', kind: 'image', value: '', role: 'data' },
    { key: 'sponsor3', label: 'Sponsor 3', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 1,
    logo: 'built-in',
    animationPresets: ['slide-up', 'fade', 'blur-in', 'pop-spring', 'slide-down'],
    defaultZone: 'bottom-center',
  },
  designs: [
    {
      id: 'bug17',
      name: 'House Sponsor Strip',
      description: 'A house partner strip: a mono kicker over three sponsor slots on the void panel.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug17.create(options),
    },
    {
      id: 'bug18',
      name: 'Frost Sponsor Strip',
      description: 'A frosted partner bar: the kicker inline at the left, three sponsor slots beside it.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { kicker: 'IN PARTNERSHIP WITH' },
      animationPresets: ['blur-in', 'slide-up', 'fade', 'pop-spring', 'slide-down'],
      create: (_type, options) => bug18.create(options),
    },
    {
      id: 'bug19',
      name: 'Slab Sponsor Strip',
      description: 'A sponsor slab: an accent kicker chip fused to a row of three partner slots.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { kicker: 'MATCH SPONSORS' },
      animationPresets: ['slide-up', 'snap-stinger', 'pop-spring', 'fade', 'slide-down'],
      create: (_type, options) => bug19.create(options),
    },
    {
      id: 'bug20',
      name: 'Quiet Sponsor Strip',
      description: 'A panel-free partner strip: a kicker over a short accent rule and three slots.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { kicker: 'WITH THANKS TO' },
      animationPresets: ['fade', 'slide-up', 'blur-in', 'slide-down', 'pop-spring'],
      create: (_type, options) => bug20.create(options),
    },
  ],
};

// ── SPONSOR ROTATION ─────────────────────────────────────────────────────────

/** How long each sponsor holds before the next takes over (speed-relative seconds). Six is the
 *  low end of what a partner contract usually asks for and still reads as deliberate. */
const SPONSOR_HOLD = 6;
/** The crossfade between two sponsors; the swap happens at its midpoint. */
const SPONSOR_BEAT = 0.5;

/** ROTATING SPONSOR BUG — one slot, several partners, advancing on a timer.
 *
 *  This is the ticker type's mechanism at bug scale, and it is only claimed because it works:
 *  the timer arms at the end of the entry timeline (so no design here may carry endless motion),
 *  each beat is a real crossfade whose midpoint calls sponsorShowNext(), and a self-transition
 *  keeps the cycle running. The operator can skip ahead or hold a partner on screen. */
export const sponsorRotatorType: GraphicType = {
  id: 'sponsor-rotator',
  name: 'Sponsor rotation',
  description: 'One sponsor slot that cycles through its partners on a timer, pausable on air.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'kicker', selector: '#f0', kind: 'line', required: true },
      { id: 'stage', selector: '.corner-bug-stage', kind: 'block', required: true },
    ],
  },
  fields: [
    { key: 'kicker', label: 'Kicker', kind: 'text', value: 'SPONSORED BY', role: 'line' },
    // The partners in the rotation. Empty slots are skipped by the runtime, so a two-partner
    // show needs no design change — and the index stays runtime DATA, never a state per sponsor.
    { key: 'sponsor1', label: 'Sponsor 1', kind: 'image', value: '', role: 'data' },
    { key: 'sponsor2', label: 'Sponsor 2', kind: 'image', value: '', role: 'data' },
    { key: 'sponsor3', label: 'Sponsor 3', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {
    main: {
      branches: [
        {
          id: 'advance',
          name: 'Next sponsor',
          // The beat: the stage fades out, the next partner takes its place, the stage returns.
          timeline: {
            name: 'Advance',
            duration: SPONSOR_BEAT,
            ease: 'in',
            calls: [{ time: SPONSOR_BEAT / 2, call: 'sponsorShowNext' }],
            layers: {
              stage: {
                opacity: [
                  { time: 0, value: 1 },
                  { time: SPONSOR_BEAT / 2, value: 0 },
                  { time: SPONSOR_BEAT, value: 1 },
                ],
              },
            },
          },
          edges: [
            // On air, hold the first partner, then start cycling — no operator input at all.
            { from: { waypoint: 0 }, to: 'advance', trigger: 'timer', after: SPONSOR_HOLD },
            // Then keep going: a self-transition replays the beat for as long as it runs.
            { from: 'advance', to: 'advance', trigger: 'timer', after: SPONSOR_HOLD },
            // The operator can always jump to the next partner.
            { from: { waypoint: 0 }, to: 'advance', trigger: 'operator', event: 'skip' },
          ],
        },
        {
          // Pose-only: entering it plays nothing. Holding a partner on screen IS entering it —
          // the machine cancels the armed timer on the way out of the cycling state, and
          // nothing re-arms it until the operator resumes.
          id: 'held',
          name: 'Held',
          timeline: null,
          edges: [
            { from: { waypoint: 0 }, to: 'held', trigger: 'operator', event: 'hold' },
            { from: 'advance', to: 'held', trigger: 'operator', event: 'hold' },
            { from: 'held', to: 'advance', trigger: 'operator', event: 'resume' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'hold', label: 'Hold sponsor', section: 'Sponsors', order: 1 },
    { event: 'resume', label: 'Resume rotation', section: 'Sponsors', order: 2 },
    { event: 'skip', label: 'Next sponsor', section: 'Sponsors', order: 3 },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'built-in',
    // No endless motion in this list, and that is a HARD requirement, not taste: the rotation's
    // timer arms at the end of the entry timeline, so a preset that never finishes would leave
    // the cycle silently unarmed (validateMachine reports it).
    animationPresets: ['fade', 'blur-in', 'slide-up', 'pop-spring'],
    defaultZone: 'bottom-right',
  },
  designs: [
    {
      id: 'bug21',
      name: 'House Sponsor Rotation',
      description: 'A house sponsor bug that cycles three partner logos on a timer — skippable on air.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug21.create(options),
    },
    {
      id: 'bug22',
      name: 'Frost Sponsor Rotation',
      description: 'A frosted sponsor pill that cycles three partner logos on a timer.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { kicker: 'PARTNERS' },
      animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-up'],
      create: (_type, options) => bug22.create(options),
    },
    {
      id: 'bug23',
      name: 'Slab Sponsor Rotation',
      description: 'A sponsor slab that cycles three partner logos on a timer, with an accent kicker chip.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { kicker: 'OFFICIAL PARTNER' },
      animationPresets: ['pop-spring', 'fade', 'slide-up', 'blur-in'],
      create: (_type, options) => bug23.create(options),
    },
    {
      id: 'bug24',
      name: 'Quiet Sponsor Rotation',
      description: 'A panel-free sponsor mark that cycles three partner logos on a timer.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { kicker: 'SUPPORTED BY' },
      animationPresets: ['fade', 'blur-in', 'slide-up', 'pop-spring'],
      create: (_type, options) => bug24.create(options),
    },
  ],
};

// ── EVENT IDENT ──────────────────────────────────────────────────────────────

/** EVENT IDENT — the mark a conference, festival, tournament or ceremony leaves in the corner:
 *  which event this is, and which day, session, round or venue you are watching. */
export const eventBugType: GraphicType = {
  id: 'event-bug',
  name: 'Event ident',
  description: 'The event logo with its name and the day, session, round or venue.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'event', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'event', label: 'Event', kind: 'text', value: 'SUMMER SUMMIT 2026', role: 'line' },
    { key: 'detail', label: 'Detail', kind: 'text', value: 'DAY 2 · MAIN HALL', role: 'line' },
    { key: 'logo', label: 'Event logo', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'built-in',
    animationPresets: ['slide-left', 'fade', 'blur-in', 'slide-down', 'pop-spring'],
    defaultZone: 'top-right',
  },
  designs: [
    {
      id: 'bug25',
      name: 'House Event Bug',
      description: 'The house event mark: the event logo, its name, and the day or venue beneath.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug25.create(options),
    },
    {
      id: 'bug26',
      name: 'Frost Event Bug',
      description: 'A frosted event tile: the event logo above its name and the day or venue.',
      styleTag: 'glass',
      palette: paletteById('orchid'),
      fontId: 'manrope',
      samples: { event: 'Northern Light Festival', detail: 'STAGE TWO · SATURDAY' },
      animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-down', 'flip-3d'],
      create: (_type, options) => bug26.create(options),
    },
    {
      id: 'bug27',
      name: 'Fixture Bug',
      description: 'A solid event slab: the competition logo, the fixture name, and the round or venue.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'oswald',
      samples: { event: 'CITY CUP 2026', detail: 'QUARTER FINAL · ARENA WEST' },
      animationPresets: ['slide-left', 'snap-stinger', 'pop-spring', 'fade', 'slide-down'],
      create: (_type, options) => bug27.create(options),
    },
    {
      id: 'bug28',
      name: 'Session Bug',
      description: 'A panel-free event mark: the logo, a thin rule, the event over its session line.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { event: 'Annual Conference', detail: 'SESSION 4 · AUDITORIUM' },
      animationPresets: ['fade', 'slide-left', 'blur-in', 'slide-down', 'slide-up'],
      create: (_type, options) => bug28.create(options),
    },
  ],
};

// ── AWARD MARK ───────────────────────────────────────────────────────────────

/** AWARD MARK — winner, nominee, champion: the award word and what it was given for. Its own
 *  type rather than an event ident with different words, because the HIERARCHY is inverted —
 *  the first line is the label and the second carries the display weight. */
export const awardBugType: GraphicType = {
  id: 'award-bug',
  name: 'Award mark',
  description: 'The award word ("winner", "nominee") over the category it was given in.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'award', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'award', label: 'Award', kind: 'text', value: 'WINNER 2026', role: 'line' },
    { key: 'category', label: 'Category', kind: 'text', value: 'BEST DOCUMENTARY', role: 'line' },
    { key: 'logo', label: 'Award logo', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'built-in',
    animationPresets: ['pop-spring', 'fade', 'blur-in', 'slide-up', 'slide-right'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'bug29',
      name: 'House Award Bug',
      description: 'The house winner / nominee mark: an amber award kicker over the category, beside the award logo.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug29.create(options),
    },
    {
      id: 'bug30',
      name: 'Gala Award Bug',
      description: 'A frosted winner / nominee mark: the logo in an accent ring, the award word over its category.',
      styleTag: 'glass',
      palette: paletteById('orchid'),
      fontId: 'manrope',
      samples: { award: 'NOMINEE', category: 'Best Original Score' },
      animationPresets: ['blur-in', 'pop-spring', 'fade', 'slide-up', 'flip-3d'],
      create: (_type, options) => bug30.create(options),
    },
    {
      id: 'bug31',
      name: 'Champion Bug',
      description: 'A champion / winner slab: the award word on an accent chip, the category beside the trophy logo.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { award: 'CHAMPIONS', category: 'CITY CUP 2026' },
      animationPresets: ['snap-stinger', 'pop-spring', 'slide-up', 'fade', 'blur-in'],
      create: (_type, options) => bug31.create(options),
    },
    {
      id: 'bug32',
      name: 'Laurel Bug',
      description: 'A panel-free winner / nominee mark: the logo in a hairline ring, the award word over its category.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { award: 'WINNER', category: 'Short Film of the Year' },
      animationPresets: ['fade', 'blur-in', 'slide-up', 'pop-spring', 'slide-right'],
      create: (_type, options) => bug32.create(options),
    },
  ],
};

// ── LOCATION / STATUS CHIP ───────────────────────────────────────────────────

/** LOCATION / STATUS CHIP — where the camera is and what is happening there, on one row. The
 *  smallest graphic in the catalog, and deliberately logo-free: a chip that also carried a mark
 *  would be an ident, and idents already have four designs of their own. */
export const statusChipType: GraphicType = {
  id: 'status-chip',
  name: 'Location chip',
  description: 'A compact chip: where the camera is, and what is happening there.',
  structure: {
    prefix: 'corner-bug',
    category: 'corner-bug',
    parts: [
      { id: 'box', selector: '.corner-bug-box', kind: 'panel', required: true },
      { id: 'place', selector: '#f0', kind: 'line', required: true },
      { id: 'status', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'place', label: 'Location', kind: 'text', value: 'OSLO', role: 'line' },
    { key: 'status', label: 'Status', kind: 'text', value: 'ON LOCATION', role: 'line' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['slide-right', 'fade', 'blur-in', 'pop-spring', 'slide-down'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'bug33',
      name: 'House Location Chip',
      description: 'A compact house chip: the location and the status, split by an amber dot.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => bug33.create(options),
    },
    {
      id: 'bug34',
      name: 'Frost Location Chip',
      description: 'A frosted pill: the location and the status, split by a small accent dot.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { place: 'Lisbon' },
      animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-right', 'slide-down'],
      create: (_type, options) => bug34.create(options),
    },
    {
      id: 'bug35',
      name: 'Venue Chip',
      description: 'A sport chip: the venue on a solid slab, the status in a fused accent block.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { place: 'ARENA WEST', status: 'PITCHSIDE' },
      animationPresets: ['slide-right', 'snap-stinger', 'pop-spring', 'fade', 'slide-down'],
      create: (_type, options) => bug35.create(options),
    },
    {
      id: 'bug36',
      name: 'Quiet Location Chip',
      description: 'A panel-free chip: the location, a short accent rule, then the status.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: { place: 'City Hall', status: 'COUNCIL SESSION' },
      animationPresets: ['fade', 'slide-right', 'blur-in', 'slide-up', 'slide-down'],
      create: (_type, options) => bug36.create(options),
    },
  ],
};

/** The eight identity types, in the order the catalog browses them. */
export const IDENTITY_BUG_TYPES = [
  stationBugType,
  liveBugType,
  logoBugType,
  sponsorStripType,
  sponsorRotatorType,
  eventBugType,
  awardBugType,
  statusChipType,
];
