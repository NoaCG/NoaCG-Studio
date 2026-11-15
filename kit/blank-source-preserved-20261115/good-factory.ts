import { IMPORTED_DESIGN, PREFIX } from './importedDesign/shared';
import { parseDefinition } from '../model/spxDefinition';
import { DEFAULT_SETTINGS, type Resolution, type SpxTemplate } from '../model/types';
import { DEFAULT_GRAPHICS_FORMAT, DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';

export function createBlankTemplate(
  res: Resolution = DEFAULT_GRAPHICS_RESOLUTION,
  fps = DEFAULT_GRAPHICS_FORMAT.fps,
): SpxTemplate {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Blank template</title>

  <!-- GSAP animation library (optional — remove if not using animations). -->
  <script src="js/gsap.min.js"></script>

  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>

  <!-- SPX template definition: add your DataFields here. -->
  <script id="spx-template-definition" type="text/javascript">
  window.SPXGCTemplateDefinition = {
      "description": "My template",
      "playserver": "OVERLAY",
      "playchannel": "1",
      "playlayer": "1",
      "webplayout": "1",
      "out": "manual",
      "steps": "0",
      "dataformat": "json",
      "uicolor": "7",
      "DataFields": []
  };
  </script>
</head>
<body>
  <!--
    Add your graphic elements here.
    Convention: each data field "fN" maps to one element with id="fN". SPX writes the
    field value straight into it. Example:
      <div id="f0">Sample text</div>
  -->

</body>
</html>
`;

  const css = `/* Reset: transparent 1920×1080 stage (broadcast graphics render over video). */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: ${res.width}px;
  height: ${res.height}px;
  overflow: hidden;
  background: transparent;
  font-family: "Open Sans", Arial, sans-serif;
}

/* Add your styles below. */
`;

  const js = `// SPX calls play(), stop(), and update(data) to control the graphic.
// Add your HTML elements above, style them in the CSS tab, and animate them here.

// update(data): SPX sends field values as JSON, e.g. {"f0":"Hello"}.
// Each value is written into the element whose id matches the field name (f0 -> id="f0").
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) el.innerHTML = fields[key];
  }
}

// play(): show / animate in your graphic.
function play() {
  // Example: gsap.fromTo('#graphic', { opacity: 0 }, { opacity: 1, duration: 0.5 });
}

// stop(): hide / animate out your graphic.
function stop() {
  // Example: gsap.to('#graphic', { opacity: 0, duration: 0.5 });
}

// next(): advance to the next step (for multi-step templates). Usually not needed.
function next() {}
`;

  const parsed = parseDefinition(html);
  return {
    name: 'Blank',
    type: 'blank',
    resolution: res,
    fps,
    html,
    css,
    js,
    fields: parsed?.fields ?? [],
    settings: parsed?.settings ?? { ...DEFAULT_SETTINGS, description: 'My template' },
    assets: [],
    layers: [],
  };
}

/** Empty placed artwork keeps the existing first-text and drawing source contract. */
export function createAuthoringBlankTemplate(res: Resolution = DEFAULT_GRAPHICS_RESOLUTION, fps = DEFAULT_GRAPHICS_FORMAT.fps): SpxTemplate {
  const template = IMPORTED_DESIGN.create({
    lines: [], importedImages: [], resolution: res, fps,
    designArt: { path: '', width: res.width, height: res.height },
    sizeScale: 1 / Math.min(res.width / 1920, res.height / 1080),
  });
  // Only this freshly generated empty-art stand-in changes. A literal remains editable
  // and stays transparent when a later brand legitimately replaces its panel palette.
  const placeholder = 'background: var(--panel-bg);      /* stand-in until the artwork is imported */';
  const artRule = template.css.match(new RegExp('\\.' + PREFIX + '-art\\s*\\{[^{}]*\\}'));
  if (!artRule?.[0].includes(placeholder) || template.css.split(placeholder).length !== 2) {
    throw new Error('The empty artwork source could not be prepared.');
  }
  return { ...template, name: 'Untitled graphic', css: template.css.replace(placeholder, 'background: transparent;') };
}
