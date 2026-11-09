// JOIN CARD — how viewers join, on air: a QR code and the short link (interaction spec D8, AC-11).
//
// The QR is drawn INSIDE the graphic from its Join link field, by the encoder the graphic carries
// in its own script (shared/qrEncoder.min.js, qrcode-generator, MIT). Nothing is fetched: an
// exported card opened with no network draws the same code, and a link typed by hand draws its own.
// "Add Join card to rundown" in Interaction fills Join link from the production. An empty Join link
// draws nothing.
//
// The link field is a hidden SOURCE (like the queue's list): the runtime reads it, draws the code
// and shows the link without its `https://`, which nobody types into a phone camera anyway.

import { paletteById, type ResolvedOptions, type TemplateVariant } from '../../model/wizard';
import { kickerCss, labelFace, panelCss } from './familyCss';
import { defineAudienceVariant, formLines, JOIN_FORM } from './shared';

const FORM = JOIN_FORM;
const S = FORM.lines;

function joinHtml(o: ResolvedOptions): string {
  return `    <!-- Join card: the QR code, what to do, and the link. -->
    <div class="audience-box">
      <!-- The accent edge — the house amber bar, fused to the panel's left side. -->
      <div class="audience-accent"></div>
      <!-- The QR code, drawn here from the Join link by the card's own encoder. Dark modules on a
           white plate with its quiet zone, because that is what a phone camera reads. -->
      <div class="audience-join-qr" id="audience-join-qr" aria-hidden="true"></div>
      <div class="audience-join-text">
        <!-- What this is — an operator FIELD, in the production's own language. -->
        <div class="audience-kicker"><span id="f0">${o.lines[0]?.sample ?? S[0].sample}</span></div>
        <!-- What to do. -->
        <div class="audience-mask"><span class="audience-question" id="f1">${o.lines[1]?.sample ?? S[1].sample}</span></div>
        <!-- The link as people read it: the Join link without its scheme, written by the runtime. -->
        <div class="audience-join-url"></div>
      </div>
    </div>`;
}

const JOIN_CSS = `/* The card lays the code beside its words: the code is what a camera reads, the words are what
   a person reads, and both have to be big enough from a sofa. */
.audience-box {
  display: flex;                   /* the code, then the words */
  align-items: center;             /* the words sit level with the code's middle */
  gap: calc(32px * var(--scale));  /* clear air between code and words */
}

/* The QR plate. White, square and never tinted: a code drawn in the look's colours scans badly
   or not at all, so this one piece of the card ignores the palette on purpose. */
.audience-join-qr {
  flex: none;                      /* the code never shrinks to make room for words */
  width: calc(232px * var(--scale));   /* big enough to scan from across a room at 1080p */
  height: calc(232px * var(--scale));
  background: #ffffff;             /* the plate behind the code's own quiet zone */
  border-radius: calc(6px * var(--scale));  /* a soft corner, outside the quiet zone */
}
.audience-join-qr svg {
  display: block;                  /* no inline gap under the code */
  width: 100%;
  height: 100%;
}
/* An empty Join link draws nothing: no plate, no link line. */
.audience-join-empty .audience-join-qr,
.audience-join-empty .audience-join-url {
  display: none;
}

.audience-join-text {
  flex: 1 1 auto;                  /* the words take the rest of the stage */
  min-width: 0;                    /* and wrap inside it rather than push the code off */
}

/* What to do — the loudest words on the card. */
.audience-question {
  --message-lines: 3;              /* a call to action is a line or two */
  font-size: calc(40px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.15;               /* tight, it is a headline */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The link, as people type it: the family's label face, in the accent. */
.audience-join-url {
  margin-top: calc(16px * var(--scale));
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
  overflow-wrap: anywhere;         /* a long production name breaks rather than overflows */
}`;

const SPEC = {
  id: 'jc01',
  name: 'House Join Card',
  blurb: 'How viewers join: a QR code drawn from the production link, a call to action, and the short link beside it.',
};

export const jc01: TemplateVariant = defineAudienceVariant(
  {
    id: SPEC.id,
    category: 'audience',
    name: SPEC.name,
    styleTag: 'noacg',
    description: SPEC.blurb,
    maxLines: FORM.lines.length,
    suggestedLines: formLines(FORM),
    logo: 'none',
    animationPresets: ['audience-rise', 'audience-slide'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-right',
  },
  { name: SPEC.name, description: SPEC.blurb, uicolor: '6' },
  FORM,
  (o) => ({
    html: joinHtml(o),
    css: `${labelFace('noacg')}${panelCss('noacg', 'calc(28px * var(--scale)) calc(40px * var(--scale)) calc(28px * var(--scale)) calc(36px * var(--scale))')}

${kickerCss('noacg')}

${JOIN_CSS}`,
    hasAccent: true,
    stageWidth: 820,
  }),
);
