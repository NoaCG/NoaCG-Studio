import { useEffect, useState, useRef } from 'react';
import {
  FONTS,
  fontNameKey,
  fontAssetPath,
  fontFormatForExt,
  registerAndMeasureFont,
  type CustomFont,
} from '../../../model/fonts';
import { fetchGoogleFont, loadGoogleFontIndex } from '../../../model/googleFonts';
import { extOf, fileToDataUrl } from '../../../assets/assetUtils';
import type { DraftPatch } from '../draft/core';
import type { SvgFontDraft } from './draft';
import SectionHead from '../SectionHead';

/** The published weight closest to the one the file's own name asked for. */
function nearestWeight(weights: number[], want: number): number {
  return weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), weights[0] ?? want);
}

/** The bundled face's own family name, for a row that matched one under a different spelling. */
function bundledName(fontId: string): string {
  return FONTS.find((b) => b.id === fontId)?.family ?? fontId;
}

/**
 * WHAT EACH TYPEFACE THE ARTWORK NAMES RESOLVES TO (docs/SVG_IMPORT_PLAN.md).
 *
 * An SVG carries the typeface NAME and not the font file, so every referenced family is one of
 * three things: a bundled face matched by name at drop, a face fetched or uploaded and embedded
 * in the template, or unresolved - which ships and WARNS rather than blocking, because a
 * licensed foundry face is the designer's to supply and refusing the import over it would be
 * refusing the design.
 *
 * THE SECTION OWNS ITS OWN STATE, all of it. The busy family, the error line, the pending upload
 * and the Google index are read by nothing else in the step, and a section that holds what only
 * it reads is one the next reader can change without checking the rest of the file. The index
 * load is lazy and unconditional here because the section only renders for a file that names a
 * family at all - a graphic whose fonts all matched pays nothing for a 50 KB list of names.
 */
export default function FontsSection({ fonts, onDraft }: { fonts: SvgFontDraft[]; onDraft: (patch: DraftPatch) => void }) {
  const [fontBusy, setFontBusy] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // WHICH FAMILIES GOOGLE ACTUALLY HAS. The index is a local module (no network), so the step
  // can answer this before anyone clicks: offering "Get from Google Fonts" for a licensed face
  // like Gotham is offering a button whose only outcome is an error. Loaded once, lazily, and
  // only for a file that names an unresolved family.
  const [googleFamilies, setGoogleFamilies] = useState<Set<string> | null>(null);
  const needsGoogleIndex = fonts.some((f) => !f.fontId && !f.customFont);
  useEffect(() => {
    if (!needsGoogleIndex || googleFamilies) return;
    let live = true;
    void loadGoogleFontIndex().then((all) => {
      if (live) setGoogleFamilies(new Set(all.map((g) => fontNameKey(g.family))));
    });
    return () => {
      live = false;
    };
  }, [needsGoogleIndex, googleFamilies]);

  const patchFont = (family: string, patch: Partial<SvgFontDraft>) =>
    onDraft({ svgFonts: fonts.map((f) => (f.family === family ? { ...f, ...patch } : f)) });

  /** Fetch one family from Google Fonts, embedded like an upload (model/googleFonts.ts).
   *  Google is asked for the LOOKUP name and the weight the file's own name implied — asking
   *  it for Illustrator's "Archivo-Bold" only ever returns "no such family". The @font-face
   *  must then declare the name the SVG references, so the fetched face is re-labelled to it. */
  const fetchFont = async (row: SvgFontDraft) => {
    const family = row.family;
    setFontBusy(family);
    setFontError(null);
    try {
      // Ask the local family index for the LIBRARY'S OWN spelling first: the lookup name is
      // reconstructed from a PostScript name, and no rule can know that "JetBrainsMono" is
      // "JetBrains Mono" rather than "Jet Brains Mono". Compared on identity alone
      // (model/fonts.ts fontNameKey), so every spelling of one family lands on it. The weight is
      // then clamped to one the family actually publishes — Google answers 400 for a weight it
      // does not have, which would quietly return the wrong cut of the right face.
      const index = await loadGoogleFontIndex();
      const known = index.find((g) => fontNameKey(g.family) === fontNameKey(row.lookup));
      const weight = row.weight !== null && known ? nearestWeight(known.weights, row.weight) : row.weight;
      const font = await fetchGoogleFont(known?.family ?? row.lookup, weight ?? undefined);
      patchFont(family, { customFont: font.family === family ? font : { ...font, family } });
    } catch (e) {
      setFontError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontBusy(null);
    }
  };

  /** Upload a licensed font file for one family. The family name is the SVG's, never the
   *  file name's — the @font-face has to answer the name the artwork asks for. */
  const uploadFont = async (family: string, file: File | undefined) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      setFontError('A font file is .woff2, .woff, .ttf or .otf.');
      return;
    }
    setFontBusy(family);
    setFontError(null);
    try {
      const data = await fileToDataUrl(file);
      const tabularFigures = await registerAndMeasureFont(family, data);
      const font: CustomFont = {
        family,
        format: fontFormatForExt(ext),
        asset: { path: fontAssetPath(file.name), data },
        tabularFigures,
      };
      patchFont(family, { customFont: font });
    } catch (e) {
      setFontError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontBusy(null);
    }
  };

  return (
    <div className="panel-section" data-testid="map-svg-fonts">
      <SectionHead
        title="Typefaces"
        summary={`${fonts.filter((f) => f.fontId || f.customFont).length} of ${fonts.length} embedded in the template`}
        testid="map-svg-why-fonts"
      >
        <p>
          An SVG carries the typeface NAME, not the font file. A typeface we can find gets
          embedded in the template, so the graphic looks the same on every playout machine.
          One we cannot find falls back to whatever that machine has, so the row warns.
        </p>
      </SectionHead>
      {fonts.map((f) => (
        <div className="map-svg-font" key={f.family} data-testid={`map-svg-font-${f.family}`}>
          <strong className="map-svg-font-name">{f.family}</strong>
          {f.fontId ? (
            <span className="status-ok" data-testid={`map-svg-font-ok-${f.family}`}>
              {/* When the file asks for a PostScript name ("Archivo-Bold"), name the face it
                  actually matched — otherwise the row claims a match for a family the reader
                  cannot see anywhere in their design. */}
              ✓ Bundled with NoaCG
              {bundledName(f.fontId) !== f.family ? ` (${bundledName(f.fontId)})` : ''}
            </span>
          ) : f.customFont ? (
            <span className="status-ok">✓ Embedded in the template</span>
          ) : (
            <>
              <span className="status-warn" data-testid={`map-svg-font-warn-${f.family}`}>
                Not embedded. Playout will substitute another face unless that machine has
                this one installed.
              </span>
              <span className="map-svg-font-actions">
                {/* The Google door is offered only for a family Google HAS. A licensed face
                    (Gotham, a foundry's own) is not on that list, and a button whose only
                    outcome is an error reads as the product being broken rather than as the
                    font being private. Until the index has loaded the button stands. */}
                {googleFamilies && !googleFamilies.has(fontNameKey(f.lookup)) ? (
                  <span className="muted" data-testid={`map-svg-font-nogoogle-${f.family}`}>
                    Not on Google Fonts? Upload the file
                  </span>
                ) : (
                  <button
                    disabled={fontBusy !== null}
                    onClick={() => void fetchFont(f)}
                    title="Downloads the family from Google Fonts and embeds it in the template. The download shows your IP address to Google."
                    data-testid={`map-svg-font-google-${f.family}`}
                  >
                    {fontBusy === f.family ? 'Fetching…' : 'Get from Google Fonts'}
                  </button>
                )}
                <button
                  disabled={fontBusy !== null}
                  onClick={() => {
                    uploadFor.current = f.family;
                    fileInput.current?.click();
                  }}
                >
                  Upload font file…
                </button>
              </span>
            </>
          )}
        </div>
      ))}
      {fontError && <p className="status-bad">✗ {fontError}</p>}
      <input
        ref={fileInput}
        type="file"
        accept=".woff2,.woff,.ttf,.otf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const family = uploadFor.current;
          uploadFor.current = null;
          if (family) void uploadFont(family, e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
