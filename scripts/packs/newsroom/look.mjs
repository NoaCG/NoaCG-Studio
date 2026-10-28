// The Uutishuone pack's shared look — one voice for all six graphics.
//
// Design language: a modern public-broadcaster news identity (violet era) — deep violet
// fields, dark gray-violet straps, one pill label motif, rounded squares with a companion
// dot, a white full-width ticker. Inspired by the 2024 wave of European news rebrands;
// palette, mark and wording are this pack's own. Finnish sample content throughout.
//
// Every value the templates share lives here so the six read as one show
// (docs/DESIGN_LANGUAGE.md §8): palette, typeface, radii, the :root contract emit, and the
// SPX definition scaffold. Templates are plain strings — no imports from src/, so this
// builds in node with nothing but the standard library.

export const LOOK = {
  // Palette — exactly one accent (violet) over a neutral dark system; the ticker flips to
  // a white bar with dark ink, which is the composition's one deliberate contrast move.
  accent: '#6C4CF1',        // the violet — pills, bars, dots, the ticker's label block
  accentDeep: '#5636D8',    // pressed/darker edge of the accent family (gradients only)
  fieldTop: '#241B49',      // full-frame violet field, top of the gradient
  fieldBottom: '#150F2E',   // …and its darker foot
  panel: 'rgba(30, 26, 44, 0.94)',   // the dark gray-violet strap container
  keyline: 'rgba(255, 255, 255, 0.08)', // 1px inner keyline lifting panels off video
  text: '#ffffff',
  textDim: 'rgba(255, 255, 255, 0.72)',
  tickerBar: '#ffffff',
  tickerInk: '#17131f',
  tickerInkDim: 'rgba(23, 19, 31, 0.6)',
};

/** The pack's typeface: bundled Outfit (variable 400–900, tabular digits — so the clock and
 *  the ticker never twitch). One family, contrast through weight (DESIGN_LANGUAGE §1). Its
 *  latin and latin-ext files, as model/fonts.ts `fontFaceCss` writes them, so Š and Ž set in Outfit. */
export const FONT_FACE_CSS = `/* Bundled open-source font (the file ships with the export — no internet at playout). */
@font-face {
  font-family: "Outfit";
  src: url("fonts/outfit.woff2") format("woff2");
  font-weight: 400 900;  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}
@font-face {
  font-family: "Outfit";
  src: url("fonts/outfit-latin-ext.woff2") format("woff2");
  font-weight: 400 900;  /* variable font: covers this weight range */
  font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;  /* latin-ext: Š Ž Ł ő ğ and the rest of Latin Extended */
}`;

/** The :root style contract every NoaCG template exposes (src/templates/AGENTS.md), tinted
 *  to the pack. `--scale` is the whole-graphic knob, `--type-scale` text only. */
export function rootVarsCss() {
  return `:root {
  --accent: ${LOOK.accent};                 /* the one accent — pills, bars, dots */
  --text-color: ${LOOK.text};                 /* primary text */
  --text-dim: ${LOOK.textDim};  /* secondary line */
  --panel-bg: ${LOOK.panel};    /* the dark gray-violet strap */
  --font-heading: "Outfit", Arial, sans-serif; /* one family; weight makes the hierarchy */
  --font-numeric: "Outfit", Arial, sans-serif; /* Outfit's digits are tabular — clocks hold width */
  --scale: 1;                               /* whole-graphic size (resolution folds in here) */
  --type-scale: 1;                          /* text-only size knob */
}`;
}

/**
 * The SPX definition script block (docs/SPX_TEMPLATE_FORMAT.md). `fields` are entries of
 * the DataFields array, already as JS object literals (strings).
 */
export function definitionScript({ description, playlayer, webplayout, uicolor, fields }) {
  const rows = fields.map((f) => `          ${f}`).join(',\n');
  return `  <!-- SPX template definition: the operator's fields and playout settings. -->
  <script id="spx-template-definition" type="text/javascript">
  window.SPXGCTemplateDefinition = {
      "description": "${description}",
      "playserver": "OVERLAY",
      "playchannel": "1",
      "playlayer": "${playlayer}",
      "webplayout": "${webplayout}",
      "out": "manual",
      "steps": "0",
      "dataformat": "json",
      "uicolor": "${uicolor}",
      "DataFields": [
${rows}
      ]
  };
  </script>`;
}

/** The shared HTML page scaffold — same layout the SPX starter export repackages 1:1. */
export function pageHtml({ title, definition, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>

  <!-- GSAP animation library (bundled — no network at playout). -->
  <script src="js/gsap.min.js"></script>

  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>

${definition}
</head>
<body>
${body}
</body>
</html>
`;
}

/** The transparent-stage CSS opening every template shares. */
export function stageCss(width = 1920, height = 1080) {
  return `${FONT_FACE_CSS}

${rootVarsCss()}

/* Transparent ${width}x${height} stage — a broadcast graphic renders over video. */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: transparent;
  font-family: var(--font-heading);
}`;
}

/** escapeHtml() for runtimes that build rows with innerHTML (the base.ts contract). */
export const ESCAPE_HTML_JS = `// escapeHtml(): rows below are built with innerHTML — operator text is escaped first, so
// input like "Team <3" reads as text and never runs as markup.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}`;

/** The plain field-writing update() shared by the word-shaped graphics (no innerHTML). */
export const SIMPLE_UPDATE_JS = `// update(data): SPX sends field values as JSON, e.g. {"f0":"Anna Virtanen"}.
// Each field fN writes into the element with the same id — plain text only.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) el.textContent = fields[key];
  }
}`;
