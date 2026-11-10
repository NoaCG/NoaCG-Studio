// WORD CLOUD: the words a Word question gathered, sized by how many phones sent each (interaction
// spec D5, AC-14).
//
// The words are DATA in one hidden field, Words, one `word | count` line each, most first: "Add word
// cloud to rundown" in Interaction writes a snapshot of the words the operator approved, and an
// operator can type the lines by hand for a rehearsal. The runtime draws them (audienceRuntime.ts
// `audienceWordsPaint`), the most-sent biggest and in the middle; empty Words draws no cloud.

import { paletteById, type ResolvedOptions, type TemplateVariant } from '../../model/wizard';
import { kickerCss, labelFace, panelCss } from './familyCss';
import { defineAudienceVariant, formLines, WORDS_FORM } from './shared';

const FORM = WORDS_FORM;
const S = FORM.lines;

function cloudHtml(o: ResolvedOptions): string {
  return `    <!-- Word cloud: the question above, the words below. -->
    <div class="audience-box">
      <!-- The accent edge: the house amber bar, fused to the panel's left side. -->
      <div class="audience-accent"></div>
      <!-- What this is: an operator FIELD, in the production's own language. -->
      <div class="audience-kicker"><span id="f0">${o.lines[0]?.sample ?? S[0].sample}</span></div>
      <!-- The question the audience answered. -->
      <div class="audience-mask"><span class="audience-question" id="f1">${o.lines[1]?.sample ?? S[1].sample}</span></div>
      <!-- The words, drawn here from the Words field by the runtime. -->
      <div class="audience-words" aria-hidden="true"></div>
    </div>`;
}

const CLOUD_CSS = `/* The question is a heading over the cloud; the cloud is a fixed box the words fill, so the card
   is the same size on air whatever the audience sent. */
.audience-question {
  --message-lines: 2;              /* a question is a line or two */
  font-size: calc(42px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.15;               /* tight, it is a headline */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The cloud: words in rows, centred, the middle row holding the most-sent. Its height is fixed;
   the runtime drops the least-sent words that would not fit rather than spill out of it. */
.audience-words {
  display: flex;
  flex-wrap: wrap;                 /* as many rows as the words need */
  justify-content: center;         /* each row centred */
  align-content: center;           /* the rows centred in the box */
  align-items: baseline;           /* words of different sizes share a line */
  gap: calc(6px * var(--scale)) calc(30px * var(--scale));
  height: calc(440px * var(--scale));
  margin-top: calc(24px * var(--scale));
  overflow: hidden;                /* never paints past the card */
  text-align: center;
}
.audience-word {
  /* One line, bounded by the cloud's own runtime, which sizes each word: the stage fit leaves a
     line that says so alone (stageFit.ts, "bounds its own line") instead of resetting its size. */
  -webkit-line-clamp: 1;
  line-clamp: 1;
  font-family: var(--font-heading);
  font-weight: var(--display-weight);
  line-height: 1.1;
  white-space: nowrap;             /* a word is one word */
  color: var(--text-color);
}
/* The most-sent word in the accent; the least-sent in the dim text colour. */
.audience-word-top {
  color: var(--accent);
}
.audience-word-quiet {
  color: var(--text-dim);
}
/* Empty Words draws no cloud. */
.audience-words-empty .audience-words {
  display: none;
}`;

const SPEC = {
  id: 'wc01',
  name: 'House Word Cloud',
  blurb: 'The words a Word question gathered: the question above, the words sized by how many sent each.',
};

export const wc01: TemplateVariant = defineAudienceVariant(
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
    defaultZone: 'mid-center',
  },
  { name: SPEC.name, description: SPEC.blurb, uicolor: '6' },
  FORM,
  (o) => ({
    html: cloudHtml(o),
    css: `${labelFace('noacg')}${panelCss('noacg', 'calc(32px * var(--scale)) calc(48px * var(--scale)) calc(36px * var(--scale)) calc(44px * var(--scale))')}

${kickerCss('noacg')}

${CLOUD_CSS}`,
    hasAccent: true,
    stageWidth: 1280,
  }),
);
