// es01 "Series Scorebug" — the match-night strip, sibling of sb01 Match Strip. A hard sport
// slab: a volt accent block down the left edge, the two team logos beside their names, big
// tabular map scores in dark chips, and the series pip row between them. The phase chip on the
// head says where the match is — PRE-MATCH, LIVE, FINAL, PAUSE — and the machine is what puts
// it there.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  P,
  SCORE_FIELDS,
  SCORE_RUNTIME_JS,
  defineEsportsVariant,
  scoreMarkup,
  scoreStructureCss,
} from './shared';

const MARKUP = { logos: true, center: 'pips' as const };

export const es01: TemplateVariant = defineEsportsVariant(
  {
    id: 'es01',
    category: 'esports-score',
    name: 'Series Scorebug',
    styleTag: 'sport',
    description: 'The match-night strip: logos, big map scores, and a series pip row.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Team A', sample: 'TEAM LIQUID' },
      { title: 'Score A', sample: '1' },
      { title: 'Team B', sample: 'NAVI' },
      { title: 'Score B', sample: '1' },
      { title: 'Stage / map', sample: 'MAP 3 · MIRAGE' },
    ],
    logo: 'none',
    animationPresets: ['comp-impact', 'comp-rise', 'comp-bloom'],
    defaultPalette: paletteById('volt'),
    defaultFontId: 'oswald',
    defaultZone: 'top-center',
  },
  {
    name: 'Series Scorebug',
    description:
      'The esports match strip: a volt accent block, team logos beside their names, map ' +
      'scores in dark chips, and one pip per map of the series. The phase chip carries the ' +
      'match state the operator sets.',
    uicolor: '5',
  },
  (o) => ({
    html: scoreMarkup(o, MARKUP),
    fields: compFieldsFor(SCORE_FIELDS, o),
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 1180,
    runtimeExtraJs: SCORE_RUNTIME_JS,
    css: `${scoreStructureCss(MARKUP)}

/* The strip — a hard sport slab, square-cut, sitting on its own shadow. */
.${P}-box {
  display: flex;                   /* head above body */
  flex-direction: column;          /* stacked */
  gap: calc(13px * var(--scale));  /* air between the head and the score row */
  padding: calc(18px * var(--scale)) calc(35px * var(--scale)) calc(20px * var(--scale)) calc(43px * var(--scale));
  background: var(--panel-bg);     /* the near-black sport panel */
  border-radius: var(--panel-radius);  /* sport: square */
  box-shadow: var(--panel-shadow); /* the family's hard drop */
  min-width: calc(1175px * var(--scale));  /* a match strip reads at a fixed measure — wide enough that two-word team names stay on one line */
}

/* The accent block — fused to the left edge, and the surface the phase marks tint. */
.${P}-accent {
  position: absolute;              /* pinned over the strip's left edge */
  left: 0;                         /* flush… */
  top: 0;                          /* …full height */
  bottom: 0;
  width: var(--accent-weight);     /* the family's bar weight */
  background: var(--accent);       /* the one accent surface */
  transform-origin: left center;   /* the impact preset flashes it from its own edge */
}

/* The stage line — where in the series this map sits. */
.${P}-stage {
  font-family: var(--font-label);  /* the family's label face */
  font-size: calc(21px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* stage lines shout, quietly */
  color: var(--label-color);
}

/* The phase chip — the machine's word, in the accent's ink on a dim tile. */
.${P}-status {
  padding: calc(4px * var(--scale)) calc(13px * var(--scale));
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.18em;          /* a chip's word needs the extra air */
  text-transform: uppercase;
  color: var(--text-dim);          /* pre-match is quiet by default */
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;                  /* the chip never squeezes */
}

/* The team name — big sport display type. */
.${P}-team {
  font-size: calc(43px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.05;               /* tight — big text needs little leading */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
  color: var(--text-color);
}

/* The score chip — a denser tile holding the map score. */
.${P}-chip {
  min-width: calc(78px * var(--scale));
  padding: calc(5px * var(--scale)) calc(18px * var(--scale));
  background: rgba(0, 0, 0, 0.45);  /* a second, darker layer of the panel */
}

.${P}-figure {
  font-size: calc(50px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--accent);            /* the scores wear the accent… */
  font-variant-numeric: tabular-nums;  /* …and never jitter as they tick */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* The logo slot's placeholder — a dim square until the operator picks a file. */
.${P}-logo {
  background: rgba(255, 255, 255, 0.06);
}
.${P}-logo.has-image {
  background: transparent;         /* a real logo needs no plate behind it */
}

/* The series pips — the accent claims a map for its side. */
.${P}-pip-a,
.${P}-pip-b {
  background: var(--accent);
}

.${P}-series-label {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ── Phase marks (applied by the machine's states, never by the data). ── */

/* LIVE — the phase chip lights up in the accent's ink. */
.${P}-live .${P}-status {
  color: var(--accent-ink);
  background: var(--accent);
}

/* FINAL — the match is decided: the scores settle to white and the chip goes solid. */
.${P}-final .${P}-figure {
  color: var(--text-color);
}
.${P}-final .${P}-status {
  color: var(--accent-ink);
  background: var(--text-color);
}

/* PAUSE — an independent group, so it reads on top of whatever phase is showing. */
.${P}-paused .${P}-status {
  color: var(--panel-bg);
  background: var(--text-dim);
}
.${P}-paused .${P}-body {
  filter: opacity(0.55);           /* the match is on hold; a filter, since the entrance writes the body's opacity inline (#2275) */
}`,
  }),
);
