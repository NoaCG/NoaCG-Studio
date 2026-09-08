// The Google Fonts library as a typeface source for NoaCG (the font picker's fourth source,
// beside the bundled OFL faces, an uploaded file, and a font installed on this computer).
//
// WHY: an imported design was drawn in a real typeface, and NoaCG bundles seventeen. Placing
// the operator's text in a face that is merely "close" is the difference between a graphic
// that looks like the student designed it and one that looks approximated. The whole Google
// library is ~1,900 families, all under open licences that permit embedding, which covers
// most of what a design tool offers by default.
//
// THE SHAPE OF IT, and the rule it must never break: the file is fetched HERE, at design
// time, and embedded in `template.assets` exactly like an uploaded one. The emitted template
// keeps NO reference to fonts.googleapis.com — an exported package must play out on a machine
// with no internet, and a CDN reference inside generated code is forbidden outright
// (`root/keep-generated-template-self-contained-runtime`). So the network is the STUDIO's, never
// the graphic's.
//
// PRIVACY, stated to the user rather than buried here: fetching a family sends the browser's
// IP address to Google, as loading any Google-hosted font always has. It happens only when
// somebody picks a family, never on load, and the picker says so before it happens.

import { fontAssetPath, registerAndMeasureFont, type CustomFont } from './fonts';

export type GoogleFontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';

export interface GoogleFontFamily {
  family: string;
  category: GoogleFontCategory;
  /** The upright weights this family publishes, ascending. */
  weights: number[];
}

const CATEGORIES: Record<string, GoogleFontCategory> = {
  s: 'sans',
  f: 'serif',
  d: 'display',
  h: 'handwriting',
  m: 'mono',
};

let index: GoogleFontFamily[] | null = null;
let indexLoad: Promise<GoogleFontFamily[]> | null = null;

/** Parse the generated index once, on first use. Dynamically imported so ~50 KB of family
 *  names never rides the initial bundle of a studio nobody has opened a picker in. */
export function loadGoogleFontIndex(): Promise<GoogleFontFamily[]> {
  if (index) return Promise.resolve(index);
  indexLoad ??= import('./googleFontsIndex').then((mod) => {
    index = mod.GOOGLE_FONTS_RAW.split('\n')
      .map((line) => {
        const [family, category, weights] = line.split('|');
        return {
          family,
          category: CATEGORIES[category] ?? 'sans',
          weights: weights ? weights.split(' ').map(Number).filter(Boolean) : [400],
        };
      })
      .filter((f) => f.family);
    return index;
  });
  return indexLoad;
}

/**
 * Families matching `query`, in the index's own POPULARITY order. A name that starts with the
 * query ranks above one that merely contains it — typing "rob" wants Roboto first, not
 * "Baloo Bhaijaan" — and the order within each group is left alone, because popularity is the
 * only ranking signal there is here and re-sorting alphabetically would bury it.
 */
export function searchGoogleFonts(all: GoogleFontFamily[], query: string, limit = 40): GoogleFontFamily[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const starts: GoogleFontFamily[] = [];
  const contains: GoogleFontFamily[] = [];
  for (const font of all) {
    const name = font.family.toLowerCase();
    if (name.startsWith(q)) starts.push(font);
    else if (name.includes(q)) contains.push(font);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** The weight to fetch when the user has not chosen one: 400 where it exists, else nearest. */
export function defaultWeight(weights: number[]): number {
  if (weights.length === 0) return 400;
  return weights.reduce((best, w) => (Math.abs(w - 400) < Math.abs(best - 400) ? w : best), weights[0]);
}

function cssUrl(family: string, weight: number): string {
  // The css2 endpoint wants '+' for spaces; encodeURIComponent gives %20, which it rejects.
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weight}&display=swap`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The font file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** A file name that survives a zip, a disk and an SPX template folder. */
function fileNameFor(family: string, weight: number): string {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${weight}.woff2`;
}

/**
 * Fetch one family at one weight and return it as an embeddable `CustomFont` — the same shape
 * an upload produces, so everything downstream (the @font-face emit, the asset list, every
 * export target) treats it identically and none of them learn where it came from.
 *
 * The stylesheet is asked for FIRST because it is what resolves a name to a file: Google
 * serves a different subset per browser, and asking for the file directly would mean guessing
 * a URL that is not ours to construct. A name the library does not know answers 400, which is
 * the honest "no such family" this reports.
 */
export async function fetchGoogleFont(family: string, weight?: number): Promise<CustomFont> {
  const w = weight ?? 400;
  const css = await fetch(cssUrl(family, w)).then((r) => {
    if (r.status === 400) throw new Error(`Google Fonts has no family called “${family}”.`);
    if (!r.ok) throw new Error(`Google Fonts answered ${r.status}.`);
    return r.text();
  });
  // The first src url() in the sheet: the latin subset, which is the one every other block
  // repeats for a different alphabet. A single-file embed cannot carry all of them.
  const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if (!url) throw new Error(`No downloadable file was offered for “${family}”.`);
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`The font file answered ${r.status}.`);
    return r.blob();
  });
  const data = await blobToDataUrl(blob);
  // The name the CSS actually declares, so the template's font-family matches Google's own
  // spelling rather than whatever the user typed into the search box.
  const declared = css.match(/font-family:\s*'([^']+)'/)?.[1] ?? family;
  const tabularFigures = await registerAndMeasureFont(declared, data);
  return {
    family: declared,
    format: url.endsWith('.woff2') ? 'woff2' : url.endsWith('.woff') ? 'woff' : 'truetype',
    asset: { path: fontAssetPath(fileNameFor(declared, w)), data },
    tabularFigures,
  };
}
