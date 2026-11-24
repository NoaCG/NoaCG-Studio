// The Template Library page lists every template by package with its previews and its own SVG, the
// downloads the build makes are the sources' own bytes, and every address the two sets were served
// at before TL3 still delivers the same content (svg-template-library AC-1).
// guards: scripts/svg-files.mjs, svg-templates.html, vercel.json, vite.config.ts, docs/tutorials/template-library/**, docs/template-library/old-addresses.json
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import { getTransformedRoutes } from '@vercel/routing-utils';

import {
  LIBRARY_DIR, LIBRARY_ZIP, LIBRARY_ZIP_URL, SVG_GALLERY_MARKER, SVG_PACKAGES, builtInAlternatives, downloadFiles, fileUrl, isListed,
  libraryDownload, libraryDownloads, packageZip, packageZipUrl, previewsOf, readLibrary, renderSvgGallery,
} from './svg-files.mjs';

const ROOT = new URL('../', import.meta.url);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const library = readLibrary();
const old = JSON.parse(readFileSync(new URL('docs/template-library/old-addresses.json', ROOT), 'utf8'));
const vercel = JSON.parse(readFileSync(new URL('vercel.json', ROOT), 'utf8'));
let built;
const downloads = async () => (built ??= await libraryDownloads());

test('one inventory: unique ids, every SVG and picture in the folder listed, every entry in a package', () => {
  assert.equal(new Set(library.map((entry) => entry.slug)).size, library.length, 'ids are unique');
  assert.equal(new Set(library.map((entry) => entry.name)).size, library.length, 'names are unique, so two tiles never read the same');
  const folder = new URL(`${LIBRARY_DIR}/`, ROOT);
  assert.deepEqual(readdirSync(new URL('SVG/', folder)).sort(), library.map((entry) => `${entry.slug}.svg`).sort());
  assert.deepEqual(readdirSync(new URL('Previews/', folder)).sort(), library.flatMap((entry) => previewsOf(entry).map((name) => `${name}.png`)).sort(), 'each picture belongs to one template');
  const packages = new Set(SVG_PACKAGES.map((pkg) => pkg.id));
  for (const entry of library) {
    assert.ok(entry.packages.length > 0 && entry.packages.every((id) => packages.has(id)), `${entry.slug} sits in known packages`);
    assert.ok(['studio', 'navy'].includes(entry.style), `${entry.slug} names its style`);
    // A template from the two old sets says which; one added since (TL4 on) has no old address.
    if (entry.formerly !== undefined) assert.ok(entry.formerly.length, `${entry.slug} says which old set it came from`);
    else assert.ok(!Object.values(old.addresses).some((to) => to.now === fileUrl(entry.slug, 'svg')), `${entry.slug} was served before, so it says which old set it came from`);
    for (const state of entry.states ?? []) assert.ok(state.name && state.alt?.length > 20, `${entry.slug}/${state.preview} is named and described`);
  }
  for (const file of readdirSync(new URL('Illustrator/', folder))) assert.ok(library.some((entry) => `${entry.slug}.ai` === file), `${file} belongs to a template`);
});

test('the page holds the gallery marker and no Examples set', () => {
  assert.ok(readFileSync(new URL('svg-templates.html', ROOT), 'utf8').includes(SVG_GALLERY_MARKER));
  // The old #examples anchor is an address, not copy.
  assert.doesNotMatch(renderSvgGallery().replace(/ id="examples"/, ''), /example/i, 'one library: no Examples set on the page');
  assert.doesNotMatch(readFileSync(new URL('svg-templates.html', ROOT), 'utf8'), /example/i);
});

test('each package shows each of its templates with its pictures and SVG, and its zip', () => {
  const html = renderSvgGallery();
  assert.ok(html.includes(`href="${LIBRARY_ZIP_URL}"`), 'the whole library zip is offered');
  for (const anchor of ['templates', 'examples']) assert.match(html, new RegExp(`id="${anchor}"`), `the old #${anchor} address lands on the library`);
  for (const pkg of SVG_PACKAGES) {
    const start = html.indexOf(`id="${pkg.id}"`);
    const section = html.slice(start, html.indexOf('</section>', start));
    assert.ok(section.includes(`href="${packageZipUrl(pkg)}"`), `${pkg.id} offers its zip`);
    const entries = library.filter((entry) => isListed(entry) && entry.packages.includes(pkg.id));
    assert.ok(entries.length > 0, `${pkg.id} lists templates`);
    assert.equal(section.split('class="svg-tile"').length - 1, entries.length, `${pkg.id}: one tile per template`);
    for (const entry of entries) {
      assert.equal(section.split(`href="${fileUrl(entry.slug, 'svg')}" download`).length, 2, `${entry.slug} SVG once in ${pkg.id}`);
      assert.ok(section.includes(`src="${fileUrl(entry.slug, 'png')}"`), `${entry.slug} preview`);
      assert.ok(entry.alt?.length > 20, `${entry.slug} describes its default preview`);
      assert.ok(section.includes(`alt="${entry.alt}"`), `${entry.slug} default preview with alt`);
      for (const state of entry.states ?? []) assert.ok(section.includes(`src="${fileUrl(state.preview, 'png')}" alt="`), `${entry.slug}/${state.preview} shown`);
    }
    assert.doesNotMatch(section, /alt=""/, `${pkg.id}: no preview without alt text`);
  }
});

test('an unlisted template leaves the page and the package zips, and keeps its downloads', async () => {
  const hidden = library.filter((entry) => !isListed(entry));
  assert.ok(hidden.some((entry) => entry.slug === 'vote-results'), 'Vote results gives way to Vote results with counts');
  const html = renderSvgGallery();
  const all = await downloads();
  const names = Object.keys((await JSZip.loadAsync(all.get(LIBRARY_ZIP_URL))).files);
  for (const entry of hidden) {
    assert.ok(!html.includes(`href="${fileUrl(entry.slug, 'svg')}"`), `${entry.slug} is not on the page`);
    assert.ok(all.has(fileUrl(entry.slug, 'svg')), `${entry.slug} is still served`);
    assert.ok(names.includes(`${LIBRARY_ZIP}/SVG/${entry.slug}.svg`), `${entry.slug} stays in the library zip`);
  }
});

test('a template names the built-in designs of its type (D4)', () => {
  const builtIns = builtInAlternatives();
  assert.ok(builtIns.get('lower-third')?.length > 0, 'the Lower third has built-in alternatives');
  assert.ok(renderSvgGallery().includes('Built-in alternatives: '), 'the page shows them');
  for (const slug of builtIns.keys()) assert.ok(library.some((entry) => entry.slug === slug), `${slug} is a library template`);
});

test('every download is the source file itself', async () => {
  const files = downloadFiles();
  for (const entry of library) {
    assert.equal(files.get(fileUrl(entry.slug, 'svg')), `${LIBRARY_DIR}/SVG/${entry.slug}.svg`);
    for (const picture of previewsOf(entry)) assert.ok(files.has(fileUrl(picture, 'png')), `${picture}.png is served`);
  }
  const all = await downloads();
  for (const [url, file] of files) assert.ok(all.get(url).equals(readFileSync(new URL(file, ROOT))), url);
  // What the dev server answers is what the build writes.
  for (const url of [fileUrl('join-card', 'svg'), packageZipUrl(SVG_PACKAGES[0])]) assert.ok((await libraryDownload(url)).equals(all.get(url)), url);
  assert.equal(await libraryDownload('/downloads/nothing.zip'), null);
});

test('the library zip holds every file, and each package zip exactly its templates', async () => {
  const all = await downloads();
  const full = await JSZip.loadAsync(all.get(LIBRARY_ZIP_URL));
  const names = Object.keys(full.files).filter((name) => !full.files[name].dir);
  for (const entry of library) {
    assert.ok(names.includes(`${LIBRARY_ZIP}/SVG/${entry.slug}.svg`), entry.slug);
    for (const picture of previewsOf(entry)) assert.ok(names.includes(`${LIBRARY_ZIP}/Previews/${picture}.png`), picture);
  }
  for (const file of ['README.md', 'README.pdf', 'library.json', 'CLOCKS.md', 'EDITABLE-CREDITS.md']) assert.ok(names.includes(`${LIBRARY_ZIP}/${file}`), file);
  // Every entry, its folders too, carries the fixed date, so a zip's bytes never depend on when
  // it was built (a folder dated at build time made two builds a second apart differ).
  for (const [url, bytes] of all) {
    if (!url.endsWith('.zip')) continue;
    const dated = await JSZip.loadAsync(bytes);
    for (const [name, file] of Object.entries(dated.files)) assert.equal(file.date.toISOString(), '2026-09-25T00:00:00.000Z', `${url}: ${name}`);
  }
  for (const pkg of SVG_PACKAGES) {
    const zip = await JSZip.loadAsync(all.get(packageZipUrl(pkg)));
    const entries = library.filter((entry) => isListed(entry) && entry.packages.includes(pkg.id));
    const svgs = Object.keys(zip.files).filter((name) => name.includes('/SVG/') && !zip.files[name].dir).sort();
    assert.deepEqual(svgs, entries.map((entry) => `${packageZip(pkg)}/SVG/${entry.slug}.svg`).sort(), pkg.id);
    const inventory = JSON.parse(await zip.file(`${packageZip(pkg)}/library.json`).async('string'));
    assert.deepEqual(inventory.map((entry) => entry.slug), entries.map((entry) => entry.slug), `${pkg.id} lists what it holds`);
    for (const file of ['README.md', 'README.pdf']) assert.ok(zip.file(`${packageZip(pkg)}/${file}`), `${pkg.id} ships the README with the font note`);
  }
  // The README says where the fonts come from and their licence (D2).
  const readme = readFileSync(new URL(`${LIBRARY_DIR}/README.md`, ROOT), 'utf8');
  for (const word of ['Manrope', 'Oswald', 'Open Font License']) assert.ok(readme.includes(word), word);
});

/** The redirect routes Vercel compiles from vercel.json, in order (as scripts/vercel-frame-headers.test.mjs
 *  compiles the header routes), so the old addresses are checked against Vercel's own matching. */
const { routes, error } = getTransformedRoutes({
  cleanUrls: vercel.cleanUrls, trailingSlash: vercel.trailingSlash, redirects: vercel.redirects, rewrites: vercel.rewrites, headers: vercel.headers,
});
assert.equal(error, null);
const redirects = routes.filter((route) => route.status && route.headers?.Location);

/** Where an address ends up: the first matching redirect, hop by hop as a browser follows them. */
function resolve(url) {
  let at = url;
  for (let i = 0; i < 5; i += 1) {
    const route = redirects.find((r) => new RegExp(r.src).test(at));
    if (!route) return { at };
    const match = at.match(new RegExp(route.src));
    at = route.headers.Location.replace(/\$(\d+)/g, (_, n) => match[Number(n)] ?? '');
  }
  throw new Error(`${url}: a redirect loop`);
}

test('every old address still delivers: each file the same bytes, each zip a zip holding every old file', async () => {
  const all = await downloads();
  const full = await JSZip.loadAsync(all.get(LIBRARY_ZIP_URL));
  for (const [url, record] of Object.entries(old.addresses)) {
    const { at } = resolve(url);
    assert.equal(at, record.now, `${url} is redirected to ${record.now}`);
    assert.ok(all.has(at), `${url} -> ${at} is served`);
    if (record.sha256) assert.equal(sha(all.get(at)), record.sha256, `${url} delivers what it did before`);
  }
  for (const [url, files] of Object.entries(old.zips)) {
    assert.equal(old.addresses[url].now, LIBRARY_ZIP_URL);
    for (const [file, record] of Object.entries(files)) {
      if (!record.now) continue;
      const entry = full.file(`${LIBRARY_ZIP}/${record.now}`);
      assert.ok(entry, `${url} held ${file}; the library zip holds it as ${record.now}`);
      assert.equal(sha(await entry.async('nodebuffer')), record.sha256, `${file} is the same file`);
    }
    // Only the old READMEs, their PDFs and inventories were replaced.
    for (const [file, record] of Object.entries(files)) if (!record.now) assert.match(file, /^(README\.(md|pdf)|examples\.json|templates\.json)$/, file);
  }
  assert.equal(Object.keys(old.addresses).length, 124, 'the record is the one written at TL3, never regenerated');
});

test('no download is committed: the build makes them', () => {
  assert.ok(!existsSync(new URL('public/downloads/', ROOT)), 'public/downloads/ would shadow what the build makes');
});
