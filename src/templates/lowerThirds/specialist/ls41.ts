// ls41 "Creator Avatar" - the streamer's own name card: a round avatar beside the handle, with
// the platforms the audience can follow set beneath it. Glass family, sibling of lt08 "Frosted
// Card" and ls25 "Now Playing".
//
// It is the third creator strap in this pack and deliberately not a variation on the other two.
// ls31 "Creator Stack" is the OUTRO - a name over a row of platform chips, drawn for the end of
// a stream. ls32 "Stream Identity" is the STATUS mark - handle, live dot, a goal figure. This
// one is the strap the person themself wears while they are on camera, which is why the AVATAR
// is the composition rather than an ornament: on a stream the face on screen is often a game,
// a desk or a shared window, and the round portrait is how the audience is told who is talking.
//
// The avatar is a real SPX image field declared as a PICTURE slot, like ls25's cover artwork
// and unlike a brand mark: a portrait is CONTENT, so cropping it round is correct, where
// cropping a logo would destroy it (src/templates/AGENTS.md).
// Without a file the circle holds a drawn accent ring, so the strap is complete before anyone
// has uploaded anything.
//
// The platform line is ONE field, not one per network: a creator's handle is usually the same
// word everywhere, so "twitch.tv/ultra · @ultra_gamer" is what they actually want to type.
// ls31 is the design for the case where the addresses genuinely differ.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { fontById, labelFontFaceCss } from '../../../model/fonts';
import { defineVariant } from '../shared';
import { slot } from './shared';

export const ls41: TemplateVariant = defineVariant(
  {
    id: 'ls41',
    category: 'lower-third',
    name: 'Creator Avatar',
    styleTag: 'glass',
    description: 'A round avatar beside the streamer handle, with the platforms they are on beneath it.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Handle', sample: 'ULTRA_GAMER_99' },
      { title: 'Platforms', sample: 'twitch.tv/ultra · @ultra_gamer' },
      { title: 'Status', sample: 'STREAMING NOW' },
    ],
    logo: 'optional',
    // The slot holds a PORTRAIT, not a brand mark: a face is content, so the round crop is the
    // right answer here and the wrong one for a logo. Same declaration as ls25's cover art.
    imageSlot: 'picture',
    animationPresets: ['slide-left', 'pop-spring', 'blur-in', 'fade', 'slide-up', 'mask-wipe'],
    defaultPalette: paletteById('orchid'),
    defaultFontId: 'manrope',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Creator Avatar',
    description:
      'The streamer name card: a round avatar - a real SPX image field - beside the handle, ' +
      'with the platforms underneath and a status chip in the band above them. Built for ' +
      'the stream where the picture is a game or a shared window rather than a face, so the ' +
      'portrait is what tells the audience who is talking. Without a file the circle holds a ' +
      'drawn accent ring.',
    uicolor: '5',
  },
  (o) => {
    // A real SPX image field; its id comes after every wizard field so nothing collides.
    const avatarField = `f${o.lines.length + o.extraFields.length}`;
    const avatarPath = o.logoAssetPath ?? '';
    const avatar = o.logoEnabled
      ? `      <!-- The avatar (image field ${avatarField}) - round, because a portrait on a stream is. -->
      <div class="lower-third-accent${avatarPath ? ' has-image' : ''}">
        <img id="${avatarField}" class="lower-third-logo"${avatarPath ? ` src="${avatarPath}"` : ' style="display: none"'} alt="" />
      </div>
`
      : `      <!-- No avatar slot - turn it on in the wizard's Fields step. -->
      <div class="lower-third-accent"></div>
`;

    return {
      html: `    <!-- The strap: [round avatar] | [handle over platforms], status chip on the top edge. -->
    <div class="lower-third-box">
${avatar}      <div class="lower-third-text">
${slot(o, 0, 'lower-third-name', '        ')}
${slot(o, 1, 'lower-third-title', '        ')}
      </div>
${slot(o, 2, 'lower-third-extra', '      ')}
    </div>`,

      extraFields: o.logoEnabled
        ? [
            {
              field: avatarField,
              ftype: 'filelist',
              title: 'Avatar',
              value: avatarPath,
              assetfolder: './images/',
              extension: 'png',
            },
          ]
        : [],

      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The card - the glass family's surface, cut away on its trailing edge so the strap reads as
   a stream overlay rather than as a broadcast bar. The status chip sits in a band above the
   words, INSIDE the cut, because a clip-path crops the children of the box it cuts. */
.lower-third-box {
  position: relative;              /* anchors the status chip and the overhanging avatar */
  display: flex;                   /* avatar and text side by side */
  align-items: center;             /* the portrait sits on the text block's centre line */
  gap: calc(26px * var(--scale));  /* air between the portrait and the words */
  min-width: calc(600px * var(--scale));  /* the strap floor - a short handle still reads as a strap */
  max-width: calc(920px * var(--scale));  /* a long platform line wraps rather than running on */
  padding-top: calc(56px * var(--scale));  /* the band the status chip sits in, above the words */
  padding-right: calc(46px * var(--scale));  /* the cut tail needs room past the words */
  padding-bottom: calc(18px * var(--scale));  /* the panel's foot */
  padding-left: calc(24px * var(--scale));  /* the avatar's clear space */
  background: var(--panel-bg);     /* the family's translucent panel */
  border-radius: var(--panel-radius);  /* the family's radius */
  box-shadow: var(--panel-shadow), var(--panel-keyline);  /* soft wide lift + the 1px inner edge */
  backdrop-filter: var(--panel-blur);  /* the frost itself */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  clip-path: polygon(0 0, 100% 0, calc(100% - 34px) 100%, 0 100%);  /* the stream overlay's cut tail */
}

/* The avatar slot - a circle, held square by its own aspect ratio so a portrait is never
   letterboxed and an empty slot is never a coloured sliver. It stands taller than the card's
   text, which is what makes the portrait the composition rather than an ornament beside it. */
.lower-third-accent {
  position: relative;              /* the portrait covers this box */
  flex: 0 0 auto;                  /* never squeezed by a long handle */
  width: calc(124px * var(--scale));  /* the portrait's size… */
  aspect-ratio: 1 / 1;             /* …and its circle, whatever the text does */
  border-radius: 50%;              /* round: the stream convention, not a broadcast square */
  background: color-mix(in srgb, var(--accent) 22%, transparent);  /* the empty slot's quiet ground */
  box-shadow: 0 0 0 calc(4px * var(--scale)) var(--accent);  /* the accent ring around the portrait */
  overflow: hidden;                /* the portrait's corners follow the circle */
}

/* The portrait itself (the ${avatarField} image field - hidden while empty). A face is meant
   to fill its frame, so this one crops to fill rather than fitting inside. */
.lower-third-logo {
  position: absolute;              /* covers the circle */
  inset: 0;                        /* all four edges */
  width: 100%;                     /* fill the slot… */
  height: 100%;                    /* …both ways */
  object-fit: cover;               /* crop to fill - the right choice for a portrait */
}

/* The words - handle over platforms. */
.lower-third-text {
  display: flex;                   /* stack the two lines */
  flex-direction: column;          /* top to bottom */
  justify-content: center;         /* centred against the portrait */
  gap: calc(6px * var(--scale));   /* the two lines read as one unit */
  min-width: 0;                    /* let it shrink so a long handle wraps instead of overflowing */
}

/* The handle (f0) - the headline. Streamers' names are typed in caps and underscores, and the
   type has to survive both. */
.lower-third-name {
  font-size: calc(46px * var(--scale) * var(--type-scale));  /* headline size (1080p reference) */
  font-weight: 800;                /* the glass family's heavy end - a handle is shouted */
  line-height: 1.08;               /* tight for a wrapping display line */
  letter-spacing: 0.01em;          /* underscores and caps need a hair of air */
  color: var(--text-color);        /* primary text colour */
  overflow-wrap: break-word;       /* a 30-character handle breaks rather than overflowing */
}

/* The platforms (f1) - set in the mono label face, because a handle is an address and reads
   as one. Dimmed, so the name stays the loudest thing on the card. */
.lower-third-title {
  font-family: var(--font-label);  /* the mono handle face */
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* clearly below the handle */
  font-weight: 600;                /* small type needs the weight over a moving picture */
  line-height: 1.3;                /* room if the platform line wraps */
  letter-spacing: 0.02em;          /* mono text sets tight - open it slightly */
  color: var(--text-dim);          /* the quieter voice */
}

/* The status chip (f2) - a small capsule in the band above the words, where a stream overlay
   puts it. It is a FIELD, never a state: the machine says nothing about what a creator calls
   being live, and "STREAMING NOW", "REPLAY" and "BE RIGHT BACK" are all the same chip. */
.lower-third-extra {
  position: absolute;              /* in the panel's own top band */
  left: calc(174px * var(--scale));  /* clear of the portrait beside it */
  top: calc(16px * var(--scale));    /* in the band above the words - INSIDE the panel, because
                                        the box is clip-path cut and a clip crops its children:
                                        an overhanging chip came out sliced in half */
  padding: calc(4px * var(--scale)) calc(16px * var(--scale));  /* a tight capsule */
  border-radius: 999px;            /* the pill idiom - frame-anchored, so not scaled */
  background: var(--accent);       /* the card's one solid accent surface */
  font-family: var(--font-label);  /* the mono label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest type here, at the floor */
  font-weight: 700;                /* solid on a filled chip */
  line-height: 1.3;                /* one tight label row */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;       /* reads as a status stamp, whatever they type */
  color: var(--accent-ink);        /* the dark-on-accent ink token */
  white-space: nowrap;             /* the chip never wraps */
}`,
      hasAccent: true,
    };
  },
);
