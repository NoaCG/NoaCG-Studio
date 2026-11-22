// THE TEMPLATE LIBRARY PAGE (/svg-templates) AND ITS DOWNLOADS: every SVG template, grouped into
// packages by use, each with its previews, its own SVG and the package's zip, plus one zip of the
// whole library (svg-template-library spec, TL3; D2, D3, D4).
//
// ONE SOURCE. docs/tutorials/template-library/ holds every template: SVG/ (the editable sources),
// Previews/ (a default picture and one per named state), Illustrator/ (legacy .ai sources, D2),
// the README (and its PDF, printed by scripts/print-library-readme.mjs), two guides and
// library.json, the one inventory. An entry may sit in several packages. Until TL3 the files were
// two sets with two inventories (svg-templates and svg-examples); the four slugs both used were
// given canonical ids (the navy ones gained `-navy`), and docs/template-library/old-addresses.json
// records every address the two sets were served at and where its content lives now.
//
// NOTHING HERE IS COMMITTED AS OUTPUT. The page body replaces the marker below (the
// generated-pages plugin in vite.config.ts), and every download is made from the sources by
// libraryDownloads(): the dev server answers them from memory and the build writes them into the
// output (the template-library-downloads plugin). The old addresses are redirects in vercel.json.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { escapeHtml } from './behaviour-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SVG_GALLERY_MARKER = '<!--svg-files:gallery-->';
export const LIBRARY_DIR = 'docs/tutorials/template-library';
const INVENTORY = 'library.json';
const COVERAGE = 'docs/template-library/coverage.json';

/** The whole library's zip, and the folder its files sit in. */
export const LIBRARY_ZIP = 'NoaCG-Template-Library';
export const LIBRARY_ZIP_URL = `/downloads/${LIBRARY_ZIP}.zip`;

/** The packages, by use, in page order. An entry names the packages it sits in. */
export const SVG_PACKAGES = [
  { id: 'audience', title: 'Audience', blurb: 'Join card, votes and messages, made for Interaction.' },
  { id: 'games', title: 'Games and scores', blurb: 'Quizzes, scoreboards, countdowns and game boards.' },
  { id: 'titles', title: 'Titles and information', blurb: 'Titles, lower thirds, tickers, lists and status cards.' },
  { id: 'clocks', title: 'Clocks and holding screens', blurb: 'Clocks, show clocks and break cards.' },
  { id: 'credits', title: 'End credits', blurb: 'Scrolling and editable end credits.' },
];

export const packageZip = (pkg) => `${LIBRARY_ZIP}-${pkg.id}`;
export const packageZipUrl = (pkg) => `/downloads/${packageZip(pkg)}.zip`;
/** Where one file of the library is served: an SVG by its id, a preview by its picture name. */
export const fileUrl = (name, ext) => `/downloads/svg/${name}.${ext}`;

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');
/** A repository path, with forward slashes on every platform. */
const repoPath = (...parts) => path.posix.join(...parts);

export function readLibrary(root = ROOT) {
  return JSON.parse(read(root, path.join(LIBRARY_DIR, INVENTORY)));
}

/** The pictures an entry owns: its default preview, then one per named state. */
export const previewsOf = (entry) => [entry.preview, ...(entry.states ?? []).map((state) => state.preview)];

const illustratorOf = (root, entry) => {
  const file = repoPath(LIBRARY_DIR, 'Illustrator', `${entry.slug}.ai`);
  return existsSync(path.join(root, file)) ? file : null;
};

/** Each served file: its address -> the source file it is a copy of. `<id>.png` is the default
 *  preview again, so a tile's picture is found by the template's id. */
export function downloadFiles(root = ROOT) {
  const files = new Map();
  const put = (url, file) => {
    if (files.has(url) && files.get(url) !== file) throw new Error(`${url} would serve both ${files.get(url)} and ${file}`);
    files.set(url, file);
  };
  for (const entry of readLibrary(root)) {
    put(fileUrl(entry.slug, 'svg'), repoPath(LIBRARY_DIR, 'SVG', `${entry.slug}.svg`));
    put(fileUrl(entry.slug, 'png'), repoPath(LIBRARY_DIR, 'Previews', `${entry.preview}.png`));
    for (const picture of previewsOf(entry)) put(fileUrl(picture, 'png'), repoPath(LIBRARY_DIR, 'Previews', `${picture}.png`));
  }
  return files;
}

// A fixed date, so a zip's bytes change only when a file in it does.
const ENTRY = { date: new Date('2026-09-25T00:00:00Z') };

/** A file as it goes into a zip. TEXT GOES IN WITH LF, whatever the checkout wrote (a Windows
 *  checkout with core.autocrlf writes CRLF; the repository stores LF). */
function zipBytes(root, file) {
  const abs = path.join(root, file);
  return /\.(md|svg|json)$/i.test(file) ? Buffer.from(readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')) : readFileSync(abs);
}

/** What a zip holds, folder-relative path -> bytes, in order: the README and its PDF, the
 *  inventory of exactly what is inside, the guides its entries use, then every entry's SVG,
 *  pictures and legacy Illustrator source. */
function zipContents(entries, root = ROOT) {
  const out = new Map();
  const add = (name, file) => out.set(name, zipBytes(root, file));
  add('README.pdf', repoPath(LIBRARY_DIR, 'README.pdf'));
  add('README.md', repoPath(LIBRARY_DIR, 'README.md'));
  out.set(INVENTORY, Buffer.from(`[\n${entries.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n')}\n]\n`));
  for (const guide of [...new Set(entries.map((entry) => entry.guide).filter(Boolean))].sort()) add(guide, repoPath(LIBRARY_DIR, guide));
  const sorted = [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const entry of sorted) {
    const ai = illustratorOf(root, entry);
    if (ai) add(`Illustrator/${entry.slug}.ai`, ai);
  }
  for (const entry of sorted) add(`SVG/${entry.slug}.svg`, repoPath(LIBRARY_DIR, 'SVG', `${entry.slug}.svg`));
  for (const entry of sorted) for (const picture of previewsOf(entry)) add(`Previews/${picture}.png`, repoPath(LIBRARY_DIR, 'Previews', `${picture}.png`));
  return out;
}

async function zip(folder, contents) {
  const archive = new JSZip();
  // Pictures, the PDF and .ai sources are compressed already: stored, they cost no CPU to pack.
  for (const [name, bytes] of contents) archive.file(`${folder}/${name}`, bytes, /\.(png|pdf|ai)$/i.test(name) ? { ...ENTRY, compression: 'STORE' } : ENTRY);
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

/** The templates a package holds. */
const inPackage = (entries, pkg) => entries.filter((entry) => entry.packages.includes(pkg.id));

/** The zips, the whole library then one per package: [address, folder, entries]. */
const zipPlan = (entries) => [
  [LIBRARY_ZIP_URL, LIBRARY_ZIP, entries],
  ...SVG_PACKAGES.map((pkg) => [packageZipUrl(pkg), packageZip(pkg), inPackage(entries, pkg)]),
];

/** Every download the site serves for the library: address -> bytes. */
export async function libraryDownloads(root = ROOT) {
  const out = new Map();
  for (const [url, file] of downloadFiles(root)) out.set(url, readFileSync(path.join(root, file)));
  for (const [url, folder, entries] of zipPlan(readLibrary(root))) out.set(url, await zip(folder, zipContents(entries, root)));
  return out;
}

/** The catalog designs of the type or kind each template customizes (D4), read from the coverage
 *  matrix, where scripts/template-coverage.mjs writes them from the catalog and checks them. */
export function builtInAlternatives(root = ROOT) {
  const matrix = JSON.parse(read(root, COVERAGE));
  const byTemplate = new Map();
  for (const row of matrix.rows) {
    if (!row.builtIns?.length) continue;
    for (const file of row.templates ?? []) {
      const slug = path.basename(file, '.svg');
      const names = byTemplate.get(slug) ?? [];
      for (const name of row.builtIns) if (!names.includes(name)) names.push(name);
      byTemplate.set(slug, names);
    }
  }
  return byTemplate;
}

/** How many built-in design names a tile shows. */
const BUILT_INS_SHOWN = 4;

/** Text for an attribute value: escapeHtml plus the double quote that would end it. */
const attr = (text) => escapeHtml(text ?? '').replace(/"/g, '&quot;');

function renderTile(pkg, entry, builtIns) {
  const states = (entry.states ?? []).map((state) => `
            <li><img src="${fileUrl(state.preview, 'png')}" alt="${attr(state.alt)}" width="960" height="540" loading="lazy" /><span>${escapeHtml(state.name)}</span></li>`);
  // A few names, never a count (scripts/check-copy.mjs design-count: the catalog is not counted).
  const named = builtIns?.slice(0, BUILT_INS_SHOWN) ?? [];
  const alternatives = named.length ? `
          <p class="svg-builtins">Built-in alternatives: ${escapeHtml(named.join(', '))}${builtIns.length > named.length ? ' and more' : ''}</p>` : '';
  return `        <li class="svg-tile" data-testid="svg-package-${pkg.id}-${entry.slug}">
          <img src="${fileUrl(entry.slug, 'png')}" alt="${attr(entry.alt)}" width="960" height="540" loading="lazy" />
          <span class="svg-name">${escapeHtml(entry.name)}</span>
          <a class="svg-get" href="${fileUrl(entry.slug, 'svg')}" download aria-label="Download ${attr(entry.name)} SVG">SVG</a>${states.length ? `
          <ul class="svg-states" aria-label="${attr(entry.name)} states">${states.join('')}
          </ul>` : ''}${alternatives}
        </li>`;
}

/** The page body: the whole library's zip, then each package with its zip and its templates. The
 *  two empty anchors keep the old set addresses (#templates, #examples) landing on the library. */
export function renderSvgGallery(root = ROOT) {
  const entries = readLibrary(root);
  const builtIns = builtInAlternatives(root);
  const packages = SVG_PACKAGES.map((pkg) => {
    const tiles = inPackage(entries, pkg).map((entry) => renderTile(pkg, entry, builtIns.get(entry.slug)));
    return `    <section class="svg-set" id="${pkg.id}" data-testid="svg-package-${pkg.id}">
      <div class="svg-set-head">
        <div>
          <h2>${escapeHtml(pkg.title)}</h2>
          <p>${escapeHtml(pkg.blurb)}</p>
        </div>
        <a class="svg-get svg-zip" href="${packageZipUrl(pkg)}" download data-testid="svg-package-${pkg.id}-zip">${escapeHtml(pkg.title)} (.zip)</a>
      </div>
      <ul class="svg-grid">
${tiles.join('\n')}
      </ul>
    </section>`;
  });
  return [`    <div class="svg-library-head" id="library">
      <span id="templates" aria-hidden="true"></span><span id="examples" aria-hidden="true"></span>
      <a class="btn btn-amber" href="${LIBRARY_ZIP_URL}" download data-testid="svg-library-zip">All templates (.zip)</a>
      <nav class="svg-package-nav" aria-label="Packages">${SVG_PACKAGES.map((pkg) => `<a href="#${pkg.id}">${escapeHtml(pkg.title)}</a>`).join('')}</nav>
    </div>`, ...packages].join('\n\n');
}

const TYPES = { svg: 'image/svg+xml', png: 'image/png', zip: 'application/zip' };
export const contentType = (url) => TYPES[url.slice(url.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

/** One download by its address, made on request (the dev server), or null when the library has
 *  no such file. A zip is built alone, so a request never builds the others. */
export async function libraryDownload(url, root = ROOT) {
  const file = downloadFiles(root).get(url);
  if (file) return readFileSync(path.join(root, file));
  const planned = zipPlan(readLibrary(root)).find(([address]) => address === url);
  return planned ? zip(planned[1], zipContents(planned[2], root)) : null;
}
