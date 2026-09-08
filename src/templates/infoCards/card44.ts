// card44 "House Scan" — the NoaCG QR card, sibling of lt11 "House Strap" / card38
// "House Product". The house amber bar and void panel carrying a scannable code beside a
// headline, the written-out address, and one supporting line.
//
// WHAT THIS DESIGN DOES NOT DO, on purpose: it does not GENERATE the QR code. NoaCG bundles no
// encoder and generated templates take no runtime dependency
// (`root/keep-generated-template-self-contained-runtime`), so a
// template that drew its own code would either need an encoder inlined into every export or a
// CDN call at playout — and a graphic that silently renders an unscannable code is worse than
// one that never claims to. So the code is an ordinary SPX image field ("filelist"): the
// operator makes the PNG/SVG once, drops it in the project's images folder, and picks it here.
// The URL field beside it is real text, so the address is readable to anyone who cannot scan.
//
// The quiet zone is the design's job and it is not decoration: a QR code is only reliably
// scannable on a light background with a clear margin around it, so the tile is white and
// padded whatever the graphic's palette is. That is why the tile does not read `--panel-bg`.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { designFieldId, maskLine, maskLines } from '../shared/standard';
import { defineCardVariant } from './shared';

export const card44: TemplateVariant = defineCardVariant(
  {
    id: 'card44',
    category: 'info-card',
    name: 'House Scan',
    styleTag: 'noacg',
    description: 'A QR card: your code image in a scannable quiet zone beside a headline and the URL.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Headline', sample: 'Scan to donate' },
      { title: 'Address', sample: 'noacg.studio/give' },
      { title: 'Detail', sample: 'Every euro goes to the appeal' },
    ],
    logo: 'none',
    animationPresets: ['slide-up', 'pop-spring', 'line-reveal', 'fade', 'slide-down', 'blur-in'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-right',
  },
  {
    name: 'House Scan',
    description:
      'The NoaCG QR card: an 8px amber bar fused to a void blur panel, holding a white quiet-zone ' +
      'tile for your QR image beside a headline, the written-out address, and a supporting line. ' +
      'The code is an image field — generate the PNG once (any QR tool), drop it in the project ' +
      'images folder, and pick it in the "QR image" field. Nothing here encodes a URL for you, ' +
      'so what airs is exactly the code you checked.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- House Scan: [amber bar] | [void panel: quiet-zone QR tile | headline / address / detail]. -->
    <div class="info-card-accent"></div>
    <div class="info-card-box">
      <!-- The quiet zone: a white tile the operator's QR image sits inside, with a margin
           on every side. Empty = the img stays hidden and the tile shows its dashed mark. -->
      <div class="info-card-qr">
        <img id="${designFieldId(o)}" class="info-card-qr-image" style="display: none" alt="" />
      </div>
      <div class="info-card-body">
${maskLines([
  maskLine('info-card', o, 0, 'info-card-scan-head', '        '),
  maskLine('info-card', o, 1, 'info-card-url', '        '),
  maskLine('info-card', o, 2, 'info-card-detail', '        '),
])}
      </div>
    </div>`,
    css: `/* The accent bar — the house 8px amber edge with its one restrained glow. */
.info-card-accent {
  position: absolute;               /* pinned inside the positioned .info-card root */
  left: 0;                          /* at the very left edge */
  top: 0;                           /* full panel height… */
  bottom: 0;                        /* …top to bottom */
  width: var(--accent-weight);      /* the family's bar weight */
  background: var(--accent);        /* the one accent surface */
  box-shadow: var(--accent-glow);   /* the family's glow — follows the accent color */
  will-change: transform;           /* hint the browser: presets grow this bar in */
}

/* The panel — the house void, laid out as [code] | [words]. */
.info-card-box {
  display: flex;                    /* the code and the copy sit side by side */
  align-items: center;              /* the tile centres against the text block */
  gap: calc(26px * var(--scale));   /* the seam between them */
  margin-left: var(--accent-weight);  /* starts where the accent bar ends */
  padding: calc(24px * var(--scale)) calc(38px * var(--scale)) calc(24px * var(--scale)) calc(24px * var(--scale));
  background: var(--panel-bg);      /* void rgba(10,12,16,.86) by default */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow);  /* one deep lifting shadow */
}

/* THE QUIET ZONE. Deliberately NOT --panel-bg and deliberately not retintable: a QR code
   scans reliably as dark modules on a light field with a clear margin around them, so the
   tile stays white and padded whatever palette the graphic is given. Shrinking this padding
   or tinting this white is the one change in the design that can stop the code working. */
.info-card-qr {
  position: relative;               /* the empty-slot mark is placed against this tile */
  flex: none;                       /* the code keeps its size whatever the headline does */
  width: calc(152px * var(--scale));   /* tile width — the code plus its quiet zone */
  height: calc(152px * var(--scale));  /* …and height: a true square */
  padding: calc(12px * var(--scale));  /* THE QUIET ZONE — the clear margin scanners need */
  border-radius: var(--panel-radius);  /* the family's corner treatment */
  background: #ffffff;              /* the light field a QR code needs; not a themed colour */
}

/* The empty-slot mark: a dashed square shown until an image arrives. setFieldValue()
   puts .has-image on this wrapper the moment the operator picks a file. */
.info-card-qr::after {
  content: '';                      /* a pure decoration, no text */
  position: absolute;               /* inside the tile's quiet zone */
  inset: calc(12px * var(--scale));  /* sits exactly where the code will */
  border: 1px dashed rgba(10, 12, 16, 0.35);  /* dark on the white tile: "the code goes here" */
}
.info-card-qr.has-image::after {
  content: none;                    /* a real code needs no mark */
}

/* The code image — fills the quiet zone, never cropped and never stretched: a QR code
   read at the wrong aspect ratio is a QR code that does not scan. */
.info-card-qr-image {
  width: 100%;                      /* fill the padded box's width… */
  height: 100%;                     /* …and its height */
  object-fit: contain;              /* the WHOLE code, undistorted — never 'cover' here */
  display: block;                   /* no inline baseline gap under the image */
}

/* The copy column — headline, address, supporting line. */
.info-card-body {
  min-width: 0;                     /* let a long headline wrap instead of widening the panel */
}

/* The headline — the instruction: what scanning this gets you. */
.info-card-scan-head {
  font-size: calc(36px * var(--scale) * var(--type-scale));  /* card heading size (1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.12;                /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* large display type tightens slightly */
  color: var(--text-color);         /* primary text color */
}

/* The written-out address — the accessible half of the card. Someone watching on a TV
   across a room cannot scan anything; they can still read and type this. */
.info-card-url {
  font-family: var(--font-label);   /* the house mono label face — an address reads as data */
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* clearly readable at distance */
  font-weight: 700;                 /* bold — it is meant to be copied */
  line-height: 1.25;                /* address leading */
  letter-spacing: 0.01em;           /* a URL is read character by character */
  overflow-wrap: anywhere;          /* a very long address breaks rather than overflowing */
  margin-top: calc(10px * var(--scale));  /* headline → address: one clear break */
  color: var(--accent);             /* the accent's main moment in this card */
}

/* The supporting line — the quiet third voice. */
.info-card-detail {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* body scale under the address */
  font-weight: 400;                 /* regular weight */
  line-height: 1.35;                /* body text gets room to breathe */
  margin-top: calc(10px * var(--scale));  /* address → detail: a small break */
  color: var(--text-dim);           /* dimmed — never full white twice */
}`,
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 740,
    // The code is a real SPX image field. It is NOT the shared logo slot: a logo is
    // decoration a design can do without, and this image IS the graphic's payload.
    extraFields: [
      {
        field: designFieldId(o),
        ftype: 'filelist',
        title: 'QR image',
        value: o.logoAssetPath ?? '',
        assetfolder: './images/',
        extension: 'png',
      },
    ],
  }),
);
