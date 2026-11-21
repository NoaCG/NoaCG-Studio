// ALERT LEVEL — the type whose states are the graphic's MEANING, not just its choreography.
//
// Every other type in the registry animates: a state is a pose the graphic passes through on
// its way somewhere. An alert's severity is different. The state IS the message — "this is a
// Watch, not a Warning" is the single most important thing the graphic says — and it can
// change while the graphic sits on air, several times, in either direction, driven by an
// operator who is reading a wire feed.
//
// That shape is exactly what a PARALLEL group is for (docs/STATE_MACHINE_SCHEMA.md): the
// severity runs on its own pointer, independent of where the main path is, so escalating does
// not re-run the entrance and going off air does not lose the level's own bookkeeping. The
// main group stays the ordinary linear walk every alert shares.
//
// ── Why the level change is a CUT, and not a cross-fade ──────────────────────────────────
//
// Two reasons, one editorial and one mechanical.
//
// Editorially, a severity word half-way between "Watch" and "Warning" is unreadable, and the
// half-second in which it is unreadable is the half-second a viewer is most likely to be
// looking. Broadcast warning systems cut for the same reason.
//
// Mechanically, the keyframe model applies a track's FIRST keyframe as a hard set at time 0
// (shared/animRuntime.ts buildStepTimeline). A cross-fade would therefore have to name a
// starting opacity for all four level blocks, and the only honest value for "the level we
// happen to be on" is unknowable from a per-STATE timeline — so any fade-out we authored
// would first flash three levels the graphic is not at. The cut has no such failure mode:
// each state sets its own block to 1 and the other three to 0, at time 0, always correct
// whatever the previous level was.
//
// What the states DO animate is the acknowledgement: a single short dip on the flag, so an
// operator watching the output sees that their press landed. One dip, no repeat, no strobe —
// a flashing warning graphic is an accessibility hazard (photosensitivity) long before it is
// a design choice.
//
// ── Why there is no timer here ───────────────────────────────────────────────────────────
//
// Severity never changes by itself. Every arrow is an operator event, which is also what
// makes the control page honest: four buttons, all four legal from every level, because an
// operator escalating or standing down is never illegal.

import { paletteById } from '../../model/wizard';
import { al01 } from '../alerts/al01';
import { al02 } from '../alerts/al02';
import { al03 } from '../alerts/al03';
import { al04 } from '../alerts/al04';
import { al12 } from '../alerts/al12';
import { al05 } from '../alerts/al05';
import { al06 } from '../alerts/al06';
import { ALERT_LEVELS, alertLevelSelector } from '../alerts/shared';
import type { GraphicType, TypeBranch, TypeEdge, TypeTimeline } from './graphicType';

/** How long the acknowledgement dip lasts (speed-relative seconds). Short on purpose: it
 *  confirms a press, it does not perform. */
const BEAT = 0.34;

/**
 * One level's entry timeline: cut every block to its right value, then dip the flag once.
 *
 * The dip is authored on the ENTERING block rather than on `.alert-flag`, so the whole thing
 * is one layer's business and the timeline reads as "this level arrives" instead of "the flag
 * does something". `emphasis` gives the top of the ramp a second, deeper beat — an emergency
 * should not arrive with the same shrug as an advisory.
 */
function levelTimeline(index: number, emphasis: boolean): TypeTimeline {
  const layers: TypeTimeline['layers'] = {};
  ALERT_LEVELS.forEach((_level, i) => {
    if (i === index) return;
    // The levels this state is NOT: a hard set to 0 at time 0. One keyframe, no tween.
    layers[`level${i + 1}`] = { opacity: [{ time: 0, value: 0 }] };
  });
  // The level this state IS: opaque from the first frame (the cut), then the dip.
  layers[`level${index + 1}`] = {
    opacity: emphasis
      ? [
          { time: 0, value: 1 },
          { time: 0.08, value: 0.45 },
          { time: 0.17, value: 1 },
          { time: 0.25, value: 0.45 },
          { time: BEAT, value: 1 },
        ]
      : [
          { time: 0, value: 1 },
          { time: 0.1, value: 0.5 },
          { time: BEAT, value: 1 },
        ],
  };
  return {
    name: ALERT_LEVELS[index].word,
    duration: BEAT,
    ease: 'out',
    layers,
  };
}

/**
 * The level graph is COMPLETE: every level reaches every other one directly, because an
 * operator escalating two steps at once (or standing straight down to Advisory) is a normal
 * thing to do and a graphic that made them walk the ladder would be inventing a rule the
 * world does not have. Each arrow carries the TARGET's event name, so one button means one
 * level from wherever the graphic is.
 */
function levelEdges(index: number): TypeEdge[] {
  const target = ALERT_LEVELS[index].id;
  return ALERT_LEVELS.filter((_l, i) => i !== index).map((from) => ({
    from: from.id,
    to: target,
    trigger: 'operator' as const,
    event: target,
  }));
}

const levelStates: TypeBranch[] = ALERT_LEVELS.map((level, i) => ({
  id: level.id,
  name: level.word,
  timeline: levelTimeline(i, i === ALERT_LEVELS.length - 1),
  edges: levelEdges(i),
}));

export const alertLevelType: GraphicType = {
  id: 'alert-level',
  name: 'Alert level',
  description: 'An urgent notice whose severity level an operator can raise or lower on air.',
  structure: {
    prefix: 'alert',
    category: 'alert',
    parts: [
      { id: 'box', selector: '.alert-box', kind: 'panel', required: true },
      { id: 'flag', selector: '.alert-flag', kind: 'block', required: true },
      // One part per level. They are required: a design that dropped one would leave a button
      // on the control page pointing at nothing, which is the exact failure `missingParts`
      // exists to make loud.
      ...ALERT_LEVELS.map((_level, i) => ({
        id: `level${i + 1}`,
        selector: alertLevelSelector(i),
        kind: 'block' as const,
        required: true,
      })),
    ],
  },
  fields: [
    { key: 'headline', label: 'Headline', kind: 'text', value: 'Severe weather warning for coastal districts', role: 'line' },
    { key: 'detail', label: 'Detail', kind: 'text', value: 'High winds and flooding expected from 18:00 until midnight', role: 'line' },
    { key: 'source', label: 'Source', kind: 'text', value: 'National Weather Service', role: 'line' },
    // The four severity WORDS, in ALERT_LEVELS order. The machine owns which level is
    // showing; the broadcaster owns what it is called (templates/alerts/shared.ts
    // alertLevelStackHtml). Declared from the same constant the designs emit from, so the
    // type's declaration and the emitted fields cannot drift — which is exactly what the
    // factory's fields gate checks.
    ...ALERT_LEVELS.map((level) => ({
      key: `word${level.id}`,
      label: `${level.word} word`,
      kind: 'text' as const,
      value: level.word,
      role: 'data' as const,
    })),
  ],
  machine: {
    parallel: [
      {
        id: 'level',
        // The resting level is the lowest one. It matches the CSS default and the entrance
        // step's rest pose (templates/alerts/shared.ts alertLevelRestRefine) — three places
        // that have to agree, and do, because all three name ALERT_LEVELS[0].
        initial: ALERT_LEVELS[0].id,
        states: levelStates,
      },
    ],
  },
  controls: ALERT_LEVELS.map((level, i) => ({
    event: level.id,
    label: level.word,
    section: 'Severity',
    order: i + 1,
  })),
  capabilities: {
    maxLines: 3,
    logo: 'none',
    animationPresets: ['slide-up', 'fade', 'mask-wipe', 'blur-in', 'snap-stinger'],
    defaultZone: 'bottom-center',
  },
  designs: [
    {
      id: 'al01',
      name: 'Signal Alert',
      description: 'Flat alert band with a severity flag, a headline, a detail line and a source.',
      styleTag: 'minimal',
      palette: paletteById('signal'),
      fontId: 'inter',
      create: (_type, options) => al01.create(options),
    },
    {
      id: 'al02',
      name: 'House Alert',
      description: 'The house void bar as an alert: mono severity flag, headline, detail, source.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      samples: {
        headline: 'Power outage affecting the eastern grid',
        detail: 'Repair crews on site — restoration expected by 21:00',
        source: 'City Energy Authority',
      },
      animationPresets: ['slide-up', 'fade', 'mask-wipe', 'blur-in'],
      create: (_type, options) => al02.create(options),
    },
    {
      id: 'al03',
      name: 'Frost Alert',
      description: 'A frosted alert panel with a full-height severity flag — for a busy picture.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: {
        headline: 'Travel disruption on the northern line',
        detail: 'Replacement buses running between Central and Harbour',
        source: 'Regional Transport Authority',
      },
      animationPresets: ['slide-left', 'fade', 'pop-spring', 'blur-in'],
      defaultZone: 'bottom-left',
      create: (_type, options) => al03.create(options),
    },
    {
      id: 'al04',
      name: 'Volt Alert',
      description: 'A hard-edged alert rail with a leaning severity flag and heavy caps.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        headline: 'MATCH SUSPENDED — SEVERE WEATHER',
        detail: 'Spectators asked to leave the stands and use the concourse',
        source: 'Venue Safety Officer',
      },
      animationPresets: ['snap-stinger', 'slide-left', 'slide-up', 'fade'],
      create: (_type, options) => al04.create(options),
    },
    {
      id: 'al12',
      name: 'Quiet Warning',
      description: 'A restrained cinematic warning on a soft scrim with a single hairline.',
      styleTag: 'cinematic',
      palette: paletteById('noir'),
      fontId: 'inter',
      samples: {
        headline: 'Strong winds expected along the western coast',
        detail: 'Conditions deteriorate after 21:00 · Avoid exposed routes',
        source: 'Coastal Safety Service',
      },
      animationPresets: ['fade', 'line-reveal', 'slide-up'],
      defaultZone: 'bottom-left',
      create: (_type, options) => al12.create(options),
    },
    {
      // A second minimal design, and deliberately so: the met-office CAP layout is a different
      // graphic from the band, not a retheme of it — the level sits above the hazard rather
      // than beside it, which is the reading order a weather bulletin needs. Packs resolve a
      // family to its FIRST design, so al01 stays the minimal cell and this one is a choice.
      id: 'al05',
      name: 'Weather Warning',
      description: 'A weather-warning card: severity cap on top, headline, area and validity below.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        headline: 'Coastal flooding',
        detail: 'Southern coast · valid 18:00 today until 06:00 tomorrow',
        source: 'National Weather Service',
      },
      animationPresets: ['slide-up', 'fade', 'mask-wipe', 'blur-in'],
      defaultZone: 'bottom-right',
      semantics:
        'Its lines are labelled for a met-office bulletin (Warning / Area and validity) rather ' +
        'than the type’s generic Headline / Detail. Same three facts in the same three slots — ' +
        'the words are the domain’s, and the type is the shape.',
      create: (_type, options) => al05.create(options),
    },
    {
      id: 'al06',
      name: 'Civil Emergency',
      description: 'A full-width emergency card: severity cap, hazard, instruction and source.',
      styleTag: 'minimal',
      palette: paletteById('signal'),
      fontId: 'inter',
      samples: {
        headline: 'Chemical release — industrial estate',
        detail: 'Go indoors. Close all windows and doors. Wait for the all-clear.',
        source: 'Civil Protection Authority',
      },
      animationPresets: ['fade', 'blur-in', 'slide-up'],
      defaultZone: 'mid-center',
      semantics:
        'Its second line is an INSTRUCTION, not a detail, and the design sizes it accordingly ' +
        '(undimmed, near-headline size). The slot is the type’s; what a civil-protection ' +
        'message puts in it is the design’s decision.',
      create: (_type, options) => al06.create(options),
    },
  ],
};
