import { useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { getCssVariable, listCssVariables, setCssVariable } from '../model/cssVars';
import { setCssDeclaration } from '../blocks/edit';
import {
  FONTS,
  customFontFaceCss,
  customFontStack,
  fontFaceCss,
  fontStack,
  ensureFontFace,
  ensureNumericFontFace,
  fontByStack,
  numericFontStack,
  type CustomFont,
} from '../model/fonts';
import type { Zone9 } from '../model/wizard';
import { detectPrefix } from '../model/structure';
import { zoneDecls } from '../templates/lowerThirds/shared';
import FontPicker from './wizard/FontPicker';
import StyleControls from './style/StyleControls';
import ViewingControls from './wizard/ViewingControls';
import { SIZE_STEPS as SIZES, TYPE_SIZE_STEPS as TYPE_SIZES } from '../model/styleVocabulary';

const ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/**
 * The live Style panel. Reads the template's :root style contract straight from the code
 * and writes deterministic patches back (CSS variables, @font-face swap, root position).
 * Works on any template that keeps its :root variables — hand edits elsewhere are safe.
 */
export default function StylePanel() {
  const template = useTemplateStore((s) => s.template);
  const setCss = useTemplateStore((s) => s.patchCss);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const addAsset = useTemplateStore((s) => s.addAsset);
  const legibility = useTemplateStore((s) => s.legibility);
  const setLegibility = useTemplateStore((s) => s.setLegibility);
  const [note, setNote] = useState<string | null>(null);

  const vars = listCssVariables(template.css);
  const scaleVar = vars.find((v) => v.name === 'scale');
  const typeScaleVar = vars.find((v) => v.name === 'type-scale');

  // The generated @font-face block is swappable while its marker comment survives
  // (bundled or imported — both carry a recognizable marker).
  const FONT_BLOCK_RE = /\/\* (?:Bundled open-source|Imported) font[\s\S]*?\}/;
  const canSwapFont = FONT_BLOCK_RE.test(template.css);
  const currentFamily = (template.css.match(/font-family:\s*"([^"]+)"/) || [])[1];
  // The picker speaks font IDs; the template only records a family name, so map it back. A
  // family the registry does not know is an imported one - 'custom' is what the picker calls it.
  const currentFontId = currentFamily
    ? (FONTS.find((f) => f.family === currentFamily)?.id ?? 'custom')
    : null;

  // Position editing needs the standard structure root (`.{prefix}` with a rule to patch).
  const prefix = detectPrefix(template.html);
  const rootSelector = prefix ? `.${prefix}` : null;
  const canPosition =
    rootSelector !== null && new RegExp(`\\.${prefix}\\s*\\{`).test(template.css);

  const setVar = (name: string, value: string) => {
    let css = setCssVariable(template.css, name, value);
    // A variable may now point at a TYPEFACE (the kicker face, the numeric face). The wizard
    // gets this from its build; here there is no build, so the face's bytes are ensured on the
    // spot — otherwise the export references a font file nothing wrote and `font-display:
    // swap` hides it until playout (model/fonts.ts ensureFontFace).
    css = ensureFontFace(css, fontByStack(value), `--${name} points at this face.`);
    setCss(css);
    setActiveTab('css'); // show the changed line in the editor
  };

  const swapFont = (fontId: string) => {
    const font = FONTS.find((f) => f.id === fontId);
    if (!font) return;
    let css = template.css.replace(FONT_BLOCK_RE, fontFaceCss(font));
    if (getCssVariable(css, 'font-heading')) css = setCssVariable(css, 'font-heading', fontStack(font));
    // Live numbers follow the heading face only where it can hold their width — swapping one
    // without the other is how a countdown silently starts twitching (model/fonts.ts). When
    // they land on a bundled SIBLING instead, its @font-face has to come with them, or the
    // export points at bytes nobody wrote and the graphic quietly plays out in the fallback.
    if (getCssVariable(css, 'font-numeric')) {
      css = setCssVariable(css, 'font-numeric', numericFontStack(font));
      css = ensureNumericFontFace(css, font);
    }
    setCss(css);
    setNote(`Typeface switched to ${font.family} (see the @font-face rule in the CSS).`);
  };

  /** Adopt a typeface the picker imported (an uploaded file or an installed one): embed its
   *  bytes as an asset + swap the marked @font-face. The picker owns reading the file and
   *  MEASURING its figures; this owns what that means for the open template. */
  const applyImportedFont = (custom: CustomFont) => {
    addAsset(custom.asset);
    let css = template.css.replace(FONT_BLOCK_RE, customFontFaceCss(custom));
    if (getCssVariable(css, 'font-heading')) css = setCssVariable(css, 'font-heading', customFontStack(custom));
    if (getCssVariable(css, 'font-numeric')) {
      css = setCssVariable(css, 'font-numeric', numericFontStack(custom));
      css = ensureNumericFontFace(css, custom);
    }
    setCss(css);
    setNote(
      `Imported "${custom.family}" — embedded in the template and its export (see the @font-face rule).`,
    );
  };

  const setZone = (zone: Zone9) => {
    if (!rootSelector) return;
    let css = template.css;
    for (const d of zoneDecls(zone, { x: 0, y: 0 }, template.resolution)) {
      css = setCssDeclaration(css, rootSelector, d.prop, d.value);
    }
    setCss(css);
    setNote(`Moved to ${zone} (see the ${rootSelector} rule in the CSS).`);
  };

  return (
    <div>
      {vars.length === 0 && (
        <div className="panel-section">
          <p className="hint">
            No <code className="inline">:root</code> style variables found. Wizard-made templates
            keep their palette and shape here; you can add your own, e.g.{' '}
            <code className="inline">--accent: #3aa0ff;</code>
          </p>
        </div>
      )}
      {/* Colours AND shape, from the one vocabulary. This panel used to render a flat list of
          raw variable names filtered by a loose colour test — loose enough that
          `--panel-shadow: 0 8px 24px rgba(0,0,0,.4)` appeared as a colour row whose swatch
          overwrote the entire shadow declaration. */}
      <StyleControls vars={vars} onSet={setVar} />

      {scaleVar && (
        <div className="panel-section">
          <h3>Size</h3>
          <div className="row" style={{ gap: 6 }}>
            {/* The SAME ladder the wizard offers (wizard/steps/StyleStep.tsx): the two used to
                disagree, so a graphic sized L in the wizard read as between M and L here. The
                wider spread won because the old one made three near-identical graphics. */}
            {SIZES.map(({ l, s }) => {
              const resFactor = Math.min(template.resolution.width / 1920, template.resolution.height / 1080);
              return (
                <button key={l} onClick={() => setVar('scale', String(+(s * resFactor).toFixed(3)))}>
                  {l}
                </button>
              );
            })}
            <input
              className="grow"
              value={scaleVar.value}
              onChange={(e) => setVar('scale', e.target.value)}
              title="--scale multiplies every size in the design"
            />
          </div>
        </div>
      )}

      {typeScaleVar && (
        <div className="panel-section">
          <h3>Text size</h3>
          <div className="row" style={{ gap: 6 }}>
            {/* A raw multiplier on top of --scale — resolution is already folded into --scale. */}
            {TYPE_SIZES.map(({ l, s }) => (
              <button key={l} onClick={() => setVar('type-scale', String(s))}>
                {l}
              </button>
            ))}
            <input
              className="grow"
              value={typeScaleVar.value}
              onChange={(e) => setVar('type-scale', e.target.value)}
              title="--type-scale multiplies only the text sizes (the graphic keeps its size)"
            />
          </div>
        </div>
      )}

      {canSwapFont && (
        <div className="panel-section">
          <h3>
            Typeface <span className="muted">(every typeface — bundled or imported — ships inside the export)</span>
          </h3>
          {/* THE picker, shared with the wizard. This panel used to carry its own card grid,
              which meant the editor was the one surface that could neither search the library
              nor reach a typeface installed on this computer. */}
          <FontPicker
            value={currentFontId}
            customFont={null}
            onPick={(id) => id && swapFont(id)}
            onCustomFont={(font) => void applyImportedFont(font)}
            defaultLabel="Design typeface"
          />
        </div>
      )}

      {canPosition && (
        <div className="panel-section">
          <h3>Position</h3>
          <div className="wz-zones">
            {ZONES.map((z) => (
              <button key={z} className="wz-zone" onClick={() => setZone(z)} title={z} />
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Zones snap to safe areas and rewrite the <code className="inline">{rootSelector}</code>{' '}
            rule. Fine-tune the pixel values in the CSS tab.
          </p>
        </div>
      )}

      {/* WHERE this graphic will be watched, on the SAME control the wizard offers - so the
          decision is not frozen at create time. A saved project made before this existed (or
          made on a TV default that later turned out to be a phone overlay) can change its
          viewing target here, and the export panel's legibility warnings re-measure off the
          store value on their own. `?? {}` is the default state, which serializes to nothing. */}
      <ViewingControls value={legibility ?? {}} onChange={(next) => setLegibility(next)} />

      {note && <p className="hint">{note}</p>}
    </div>
  );
}
