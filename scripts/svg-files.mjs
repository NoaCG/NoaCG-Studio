// THE SVG FILES PAGE (/svg-templates): every SVG template and example as a preview with its own
// download, so a person takes the one graphic they need instead of a whole zip.
//
// Owner, 2026-11-21: the two SVG packages were two look-alike cards on /downloads and a long list
// of links in the docs. Now /downloads has one card with both zips, and this page previews each
// file. Two sets, each from its own inventory: the TEMPLATES (docs/tutorials/svg-templates, one
// clean style to restyle) and the EXAMPLES (docs/tutorials/svg-examples, one per import behaviour).
//
// ONE SOURCE. svg-templates.html holds the marker below and the generated-pages plugin in
// vite.config.ts replaces it with renderSvgGallery(), so the page lists exactly the inventories.
// The files it links are copies under public/downloads/svg/<set>/: <slug>.svg is the source SVG
// and <slug>.png its first preview. syncSvgFiles() writes them (pack-svg-examples.mjs runs it) and
// checkSvgFiles() refuses a copy that has drifted (scripts/svg-files.test.mjs).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './behaviour-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SVG_GALLERY_MARKER = '<!--svg-files:gallery-->';

/** The two sets, in page order. `zip` is what pack-svg-examples.mjs writes for that set. */
export const SVG_SETS = [
  {
    id: 'templates',
    title: 'Templates',
    blurb: 'Ready-made graphics in one clean style. Change the words, colours and shapes, then import.',
    source: 'docs/tutorials/svg-templates',
    inventory: 'templates.json',
    zip: '/downloads/NoaCG-SVG-templates.zip',
    zipNote: 'SVG, PNG and PDF',
  },
  {
    id: 'examples',
    title: 'Examples',
    blurb: 'One graphic for every SVG import behaviour, with its layers named the way NoaCG reads them.',
    source: 'docs/tutorials/svg-examples',
    inventory: 'examples.json',
    zip: '/downloads/NoaCG-SVG-examples.zip',
    zipNote: 'Illustrator (.ai), SVG, PNG and PDF',
  },
];

/**
 * PACKAGES BY USE (svg-template-library D3, prototyped in TL1 on the audience pilot): a package
 * lists the inventory entries that name it in `packages`, so one entry can sit in several. Each
 * tile shows the default preview and every named state the operator sees, each with its alt text.
 * TL3 merges the inventories and builds the package zips; until then a package's files are the
 * per-file downloads here and the whole templates zip.
 */
export const SVG_PACKAGES = [
  {
    id: 'audience',
    title: 'Audience',
    blurb: 'Join card, Live vote, Vote results and Message. Import one and Interaction offers it for its feature: the Join card for Add Join card, Vote results for Add results, Message for Prepare.',
    set: 'templates',
  },
];

const publicDir = (set, root) => path.join(root, 'public', 'downloads', 'svg', set.id);
export const fileUrl = (set, slug, ext) => `/downloads/svg/${set.id}/${slug}.${ext}`;

export function readInventory(set, root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, set.source, set.inventory), 'utf8'));
}

/** What public/downloads/svg/<set>/ must hold: file name -> the source file it copies. */
function expectedFiles(set, root) {
  const files = new Map();
  for (const entry of readInventory(set, root)) {
    files.set(`${entry.slug}.svg`, path.join(root, set.source, 'SVG', `${entry.slug}.svg`));
    files.set(`${entry.slug}.png`, path.join(root, set.source, 'Previews', `${entry.preview}.png`));
    for (const state of entry.states ?? []) files.set(`${state.preview}.png`, path.join(root, set.source, 'Previews', `${state.preview}.png`));
  }
  return files;
}

/** Copy every set's SVGs and previews into public/, removing anything the inventory dropped. */
export function syncSvgFiles(root = ROOT) {
  for (const set of SVG_SETS) {
    const dir = publicDir(set, root);
    const files = expectedFiles(set, root);
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) if (!files.has(name)) rmSync(path.join(dir, name));
    for (const [name, from] of files) writeFileSync(path.join(dir, name), readFileSync(from));
  }
}

/** The problems with the public copies, empty when they match the sources exactly. */
export function checkSvgFiles(root = ROOT) {
  const problems = [];
  for (const set of SVG_SETS) {
    const dir = publicDir(set, root);
    const files = expectedFiles(set, root);
    const present = new Set(readdirSync(dir));
    for (const name of present) if (!files.has(name)) problems.push(`${set.id}/${name} is not in ${set.inventory}`);
    for (const [name, from] of files) {
      if (!present.has(name)) problems.push(`${set.id}/${name} is missing`);
      else if (!readFileSync(path.join(dir, name)).equals(readFileSync(from))) problems.push(`${set.id}/${name} differs from ${path.relative(root, from)}`);
    }
  }
  return problems;
}

/** A package's section: its entries with the default preview and each named state, alt text on all. */
function renderPackage(pkg, root) {
  const set = SVG_SETS.find((s) => s.id === pkg.set);
  const entries = readInventory(set, root).filter((entry) => (entry.packages ?? []).includes(pkg.id));
  const tiles = entries.map((entry) => {
    const states = (entry.states ?? []).map((state) => `
            <li><img src="${fileUrl(set, state.preview, 'png')}" alt="${escapeHtml(state.alt)}" width="960" height="540" loading="lazy" /><span>${escapeHtml(state.name)}</span></li>`);
    return `        <li class="svg-tile svg-tile--package" data-testid="svg-package-${pkg.id}-${entry.slug}">
          <img src="${fileUrl(set, entry.slug, 'png')}" alt="${escapeHtml(entry.alt ?? '')}" width="960" height="540" loading="lazy" />
          <span class="svg-name">${escapeHtml(entry.name)}</span>
          <a class="svg-get" href="${fileUrl(set, entry.slug, 'svg')}" download aria-label="Download ${escapeHtml(entry.name)} SVG">SVG</a>${states.length ? `
          <ul class="svg-states" aria-label="${escapeHtml(entry.name)} states">${states.join('')}
          </ul>` : ''}
        </li>`;
  });
  return `    <section class="svg-set svg-package" id="${pkg.id}" data-testid="svg-package-${pkg.id}">
      <div class="svg-set-head">
        <div>
          <h2>${escapeHtml(pkg.title)}</h2>
          <p>${escapeHtml(pkg.blurb)}</p>
        </div>
      </div>
      <ul class="svg-grid">
${tiles.join('\n')}
      </ul>
    </section>`;
}

/** The page body: the packages, then per set a heading with its zip and a grid of previews with
 *  an SVG download each. */
export function renderSvgGallery(root = ROOT) {
  const packages = SVG_PACKAGES.map((pkg) => renderPackage(pkg, root));
  return [...packages, ...SVG_SETS.map((set) => {
    const tiles = readInventory(set, root).map((entry) => {
      const name = escapeHtml(entry.name);
      return `        <li class="svg-tile" data-testid="svg-file-${set.id}-${entry.slug}">
          <img src="${fileUrl(set, entry.slug, 'png')}" alt="${escapeHtml(entry.alt ?? '')}" width="960" height="540" loading="lazy" />
          <span class="svg-name">${name}</span>
          <a class="svg-get" href="${fileUrl(set, entry.slug, 'svg')}" download>SVG</a>
        </li>`;
    });
    return `    <section class="svg-set" id="${set.id}" data-testid="svg-set-${set.id}">
      <div class="svg-set-head">
        <div>
          <h2>${set.title}</h2>
          <p>${escapeHtml(set.blurb)}</p>
        </div>
        <a class="btn btn-amber" href="${set.zip}" download data-testid="svg-set-${set.id}-zip">All ${set.title.toLowerCase()} (.zip)</a>
      </div>
      <ul class="svg-grid">
${tiles.join('\n')}
      </ul>
    </section>`;
  })].join('\n\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) syncSvgFiles();
  const problems = checkSvgFiles();
  if (problems.length) {
    console.error(`svg-files: the public copies are stale - run node scripts/svg-files.mjs --write\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('svg-files: public/downloads/svg matches both inventories');
}
