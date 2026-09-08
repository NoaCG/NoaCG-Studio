// The frozen BRAND fixture bank: the marks a user brings, and the briefs that bring them.
//
// It lives in the repo rather than in `lite-eval-out/` because everything under that directory
// is gitignored and dies with its worktree - and a paid round whose inputs are gone cannot be
// re-read, which is exactly what happened to the 2026-08-08 Pro round's twelve interpretations
// (src/ai/AGENTS.md).
//
// Two consumers, deliberately sharing one bank:
//   - `scripts/ai-lite-brand-audit.mjs` - the FREE geometry/contrast audit. Spends nothing.
//   - a future paid Lite round, which sends the same marks with the same briefs, so the
//     rendered result can be compared against a measurement that already exists.
//
// The marks are AUTHORED SVG, not fetched or uploaded: an audit that depends on a file
// somebody has to supply measures whatever that person happened to have. Each one is a real
// mark SHAPE that a slot can get wrong in a different way - a wide lockup letterboxes to a
// thin strip in a square well, a tall mark overflows one, a knockout mark disappears on a
// pale panel. `tone` says which backdrops the mark can legally sit on, and `inkHex` is the
// colour its contrast is judged on; both are declared because the SVG is authored here, so
// nothing has to guess them back out of the pixels.

const svgAsset = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

/** A wordmark lockup: bar mark + two words. Wide, and its height is mostly whitespace. */
const wordmark = (ink, muted) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">
  <rect x="0" y="26" width="64" height="14" rx="3" fill="${ink}"/>
  <rect x="0" y="53" width="42" height="14" rx="3" fill="${ink}"/>
  <rect x="0" y="80" width="26" height="14" rx="3" fill="${ink}"/>
  <text x="90" y="76" font-family="Helvetica, Arial, sans-serif" font-size="58" font-weight="700" fill="${ink}">Meridian</text>
  <text x="330" y="76" font-family="Helvetica, Arial, sans-serif" font-size="58" font-weight="400" fill="${muted}">TV</text>
</svg>`;

/** A club crest: square, mid-tone, legible on light and on dark. */
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <circle cx="128" cy="128" r="124" fill="#1f4f9c"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="#ffffff" stroke-width="8"/>
  <path d="M128 54 L154 112 L216 112 L166 148 L185 208 L128 172 L71 208 L90 148 L40 112 L102 112 Z" fill="#ffffff"/>
</svg>`;

/**
 * A very wide sponsor rail lockup - 13:1, the shape a square well punishes hardest.
 *
 * The viewBox is 1280 wide because the LOCKUP IS: measured, this text run ends at x=1242, and
 * the first version declared 960 and clipped its own wordmark to "NORTHBRIDGE POLYT…". That
 * shipped into the 2026-08-09 brand round and was written up as a platform defect - a mark the
 * product had clipped - when the product had placed it correctly and the fixture was malformed.
 * A bank is an instrument: a broken fixture does not read as a broken fixture, it reads as a
 * broken product, and it took a diagnosis to tell them apart. Anything added here gets its
 * painted extent checked against its own viewBox first.
 */
const banner = (ink) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="96" viewBox="0 0 1280 96">
  <rect x="0" y="32" width="96" height="32" rx="6" fill="${ink}"/>
  <text x="124" y="70" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="600" letter-spacing="10" fill="${ink}">NORTHBRIDGE POLYTECHNIC</text>
</svg>`;

/** A tall portrait shield - the aspect a slot drawn as a square row gets wrong upward. */
const shield = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="260" viewBox="0 0 180 260">
  <path d="M90 4 L176 40 V150 C176 200 138 236 90 256 C42 236 4 200 4 150 V40 Z" fill="#0f3d2e"/>
  <path d="M90 62 L120 128 H60 Z" fill="#e6c463"/>
  <rect x="52" y="146" width="76" height="12" rx="4" fill="#e6c463"/>
  <rect x="62" y="172" width="56" height="12" rx="4" fill="#e6c463"/>
</svg>`;

/**
 * `tone`:
 *   'dark'  - the mark's ink is DARK, so it needs a LIGHT surface under it.
 *   'light' - the mark's ink is LIGHT (a knockout), so it needs a DARK surface.
 *   'both'  - the mark carries its own field and reads either way.
 * A real brand kit ships more than one of these, which is why a graphic has to say which
 * surface it offers rather than assuming the file will cope.
 *
 * `shape` is the bucket `LiteMarkShape` sorts this aspect into (src/ai/lite/types.ts owns the
 * cuts: portrait <0.85, square <=1.4, wordmark <=4.5, rail above). Declared rather than derived
 * because these five SVGs are authored here, and because the audit is a .mjs script that cannot
 * import the TypeScript that owns the boundaries - so the data lives here and the logic lives
 * there, rather than the boundaries living in both.
 *
 * `inkHex` is the colour that has to READ; `fieldHex` is the mark's own background, or null
 * when the mark is transparent. The pair matters because they are two different physical
 * questions and only one of them can be failed. A transparent lockup composites its ink
 * straight onto whatever the design gives it, so a knockout mark on a pale panel is simply
 * gone - measurable, and fatal. A mark carrying its own field cannot disappear; the worst it
 * can do is sit on a surface too close to that field to separate, which is a much lower floor.
 * Judging both against the surface at 3:1 was the audit's own first bug: it failed a crest with
 * a white ring and a white star for being dark blue on blue.
 */
export const LITE_BRAND_MARKS = [
  {
    id: 'wordmark-dark',
    label: 'Wordmark (dark ink)',
    path: 'images/brand-wordmark-dark.svg',
    data: svgAsset(wordmark('#12161c', '#5d6472')),
    natural: { width: 480, height: 120 },
    shape: 'wordmark',
    inkHex: '#12161c',
    fieldHex: null,
    tone: 'dark',
    note: 'A channel lockup for light packages. 4:1 - a square well letterboxes it.',
  },
  {
    id: 'wordmark-light',
    label: 'Wordmark (knockout)',
    path: 'images/brand-wordmark-light.svg',
    data: svgAsset(wordmark('#ffffff', '#b7bdc9')),
    natural: { width: 480, height: 120 },
    shape: 'wordmark',
    inkHex: '#ffffff',
    fieldHex: null,
    tone: 'light',
    note: 'THE LIGHT-ONLY VERSION. Invisible on any pale panel - the case a slot must refuse.',
  },
  {
    id: 'badge-square',
    label: 'Club crest (square)',
    path: 'images/brand-badge.svg',
    data: svgAsset(badge),
    natural: { width: 256, height: 256 },
    shape: 'square',
    inkHex: '#ffffff',
    fieldHex: '#1f4f9c',
    tone: 'both',
    note: '1:1 with its own field. The shape most slots were actually drawn for.',
  },
  {
    id: 'banner-wide',
    label: 'Institution rail (13:1)',
    path: 'images/brand-banner.svg',
    data: svgAsset(banner('#ffffff')),
    natural: { width: 1280, height: 96 },
    shape: 'rail',
    inkHex: '#ffffff',
    fieldHex: null,
    tone: 'light',
    note: '13:1 lockup. In a square slot it paints a hairline strip; its own viewBox fits it.',
  },
  {
    id: 'shield-tall',
    label: 'Shield (portrait)',
    path: 'images/brand-shield.svg',
    data: svgAsset(shield),
    natural: { width: 180, height: 260 },
    shape: 'portrait',
    inkHex: '#e6c463',
    fieldHex: '#0f3d2e',
    tone: 'both',
    note: 'Taller than wide - the aspect a row-shaped slot gets wrong upward.',
  },
];

export const LITE_BRAND_MARKS_BY_ID = new Map(LITE_BRAND_MARKS.map((mark) => [mark.id, mark]));

/**
 * Brand palettes carrying NO house amber, so "the accent came from the brand" and "the house
 * amber did not survive" are two questions with one unambiguous answer in the render
 * (docs/CATALOG_VARIETY.md §5.1: fourteen designs keep a piece of their original accent, and
 * thirteen of those are a literal value written past the token).
 */
export const LITE_BRAND_PALETTES = {
  meridian: { accent: '#3b7dd8', text: '#f2f5fa', textDim: '#b3bccb', panel: '#111722' },
  northbridge: { accent: '#7b1f3a', text: '#fdf7f2', textDim: '#cbb4bd', panel: '#1b0d13' },
  clubBlue: { accent: '#1f4f9c', text: '#ffffff', textDim: '#c3cee2', panel: '#0b1626' },
  paper: { accent: '#0f3d2e', text: '#12161c', textDim: '#4a5560', panel: '#eef1ec' },
  // A brand whose ACCENT is pale, which is the only pairing that puts a knockout mark on a
  // pale surface. `paper` does not: its accent is a dark green, and every catalog logo well
  // measured so far is painted in the accent - so a white mark on the "light package" was
  // still landing on something dark, and the case a knockout-only kit actually walks in with
  // was never being tested. Read that as the general lesson: the palette that fights a mark is
  // decided by the SURFACE the slot paints, not by the package's overall lightness.
  sand: { accent: '#e8dcc8', text: '#1b1b1b', textDim: '#5a5a5a', panel: '#f5f2ec' },
  // NOT a brand. The DETECTOR PROBE for the house-amber check: a palette whose accent IS
  // #f6a623, so `--palette houseAmberProbe` must make `house-accent-survives` fire on any
  // design that paints an accent surface. No lower third in the catalog hard-codes the amber
  // (measured 2026-08-09), so on the real bank that check reports clean for every chassis -
  // and a clean column from a check nobody has ever seen fire is not evidence of anything.
  houseAmberProbe: { accent: '#f6a623', text: '#f2f5fa', textDim: '#b3bccb', panel: '#111722' },
};

export const LITE_BRAND_FIXTURE_VERSION = 1;

/**
 * The brief bank. Each brief is one real customer job: a mark, the colours it comes with, and
 * the graphic it has to end up inside.
 *
 * `servable` records whether Lite can answer it TODAY. Five are lower thirds, which is Lite's
 * whole allowlist; three are the categories the widening plan reaches next
 * (docs/AI_LITE_PLAN.md §3) and are carried here rather than written later, because a bank
 * that only contains what already works cannot show what widening costs.
 */
export const LITE_BRAND_FIXTURES = [
  {
    id: 'brand-news-wordmark',
    category: 'lower-third',
    markId: 'wordmark-dark',
    palette: 'meridian',
    servable: true,
    prompt:
      'A restrained evening-news lower third for anchor name Martin Hale and role Evening News, '
      + 'carrying the channel wordmark. Keep our blue as the accent, keep the mark clear of the '
      + 'text, and never crop or recolour it.',
  },
  {
    id: 'brand-sports-badge',
    category: 'lower-third',
    markId: 'badge-square',
    palette: 'clubBlue',
    servable: true,
    prompt:
      'A match-day lower third for player name Mateo Silva and team Northbridge FC with the club '
      + 'crest beside the name. Club blue throughout, condensed hierarchy, fast controlled entrance.',
  },
  {
    id: 'brand-university-banner',
    category: 'lower-third',
    markId: 'banner-wide',
    palette: 'northbridge',
    servable: true,
    prompt:
      'A university lecture lower third for speaker name Dr. Anika Ramanathan and role Professor '
      + 'of Environmental Engineering, with the full institutional lockup shown at a readable size. '
      + 'Calm, credible, generous spacing.',
  },
  {
    id: 'brand-knockout-only',
    category: 'lower-third',
    markId: 'wordmark-light',
    palette: 'paper',
    servable: true,
    prompt:
      'A lower third for spokesperson name Marisol Vega and role Emergency Management Director on '
      + 'our light paper package, carrying our logo. We only have the white version of the mark.',
  },
  {
    id: 'brand-creator-shield',
    category: 'lower-third',
    markId: 'shield-tall',
    palette: 'paper',
    servable: true,
    prompt:
      'A warm creator lower third for name Tomas Aalto and role Fourth-Generation Baker with our '
      + 'shield mark. Light package, friendly but not generic, mark small and never stretched.',
  },
  {
    id: 'brand-corner-ident',
    category: 'corner-bug',
    markId: 'badge-square',
    palette: 'clubBlue',
    servable: false,
    prompt:
      'A persistent corner ident carrying our crest and the word LIVE. Small by construction, '
      + 'always legible over moving pictures, club blue.',
  },
  {
    id: 'brand-holding-sponsor',
    category: 'starting-soon',
    markId: 'banner-wide',
    palette: 'meridian',
    servable: false,
    prompt:
      'A holding screen that says the programme starts in five minutes and carries our partner '
      + 'rail lockup along the bottom. Calm, dark, nothing flashing.',
  },
  {
    id: 'brand-esports-crest',
    category: 'scoreboard',
    markId: 'shield-tall',
    palette: 'northbridge',
    servable: false,
    prompt:
      'An esports series scorebug for Arctic Rift versus Helsinki Comets carrying each team crest '
      + 'beside its score. Our maroon as the accent, sharp hierarchy, no bounce.',
  },
];
