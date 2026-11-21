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

/** The page body: per set, a heading with its zip, then a grid of previews with an SVG download each. */
export function renderSvgGallery(root = ROOT) {
  return SVG_SETS.map((set) => {
    const tiles = readInventory(set, root).map((entry) => {
      const name = escapeHtml(entry.name);
      return `        <li class="svg-tile" data-testid="svg-file-${set.id}-${entry.slug}">
          <img src="${fileUrl(set, entry.slug, 'png')}" alt="" width="960" height="540" loading="lazy" />
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
  }).join('\n\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) syncSvgFiles();
  const problems = checkSvgFiles();
  if (problems.length) {
    console.error(`svg-files: the public copies are stale - run node scripts/svg-files.mjs --write\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('svg-files: public/downloads/svg matches both inventories');
}
