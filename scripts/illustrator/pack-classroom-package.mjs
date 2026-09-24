#!/usr/bin/env node
// PACKS THE NOACG CLASSROOM PACKAGE: the README as a one-page PDF, then the whole folder as a zip.
//
//   node scripts/illustrator/pack-classroom-package.mjs [--copy-to <file.zip>]...
//
// Run it after scripts/illustrator/build-classroom-package.jsx has drawn the graphics in
// Illustrator, and again after any change to docs/tutorials/classroom-package/README.md.
//
// 1. README.md -> README.pdf. README.md is the source and README.pdf is what a student opens from
//    the learning platform. Chromium prints it on one A4 page, headings in Oswald like the
//    graphics. The Markdown is the small subset the README uses (headings, bullets, bold, inline
//    code, one code block), converted here so the repo needs no Markdown package for one page.
// 2. The zip: Illustrator/, SVG/, Previews/, README.md and README.pdf inside one folder named
//    NoaCG-classroom-package, written to public/downloads/NoaCG-classroom-package.zip, which the
//    site serves at /downloads/NoaCG-classroom-package.zip (linked from /downloads and /docs).
//    Each --copy-to writes the same bytes to another place, such as the owner's Downloads folder.
//
// It drives a headless Chromium for the print, so run it through the job queue on the laptop:
//   node scripts/jobs.mjs add "node scripts/illustrator/pack-classroom-package.mjs" --cost 0.25
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { chromium } from '@playwright/test';
import { escapeHtml } from '../behaviour-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE = path.join(ROOT, 'docs', 'tutorials', 'classroom-package');
const ZIP_NAME = 'NoaCG-classroom-package';
const ZIP_OUT = path.join(ROOT, 'public', 'downloads', `${ZIP_NAME}.zip`);
/** What goes in the zip, in this order. Anything else in the folder stays out. */
const CONTENTS = ['README.pdf', 'README.md', 'Illustrator', 'SVG', 'Previews'];

// ── README.md -> HTML ────────────────────────────────────────────────────────────────────────

const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

function markdownToHtml(md) {
  const out = [];
  let list = false;
  let code = null;
  const closeList = () => {
    if (list) out.push('</ul>');
    list = false;
  };
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    if (code !== null) {
      if (line.startsWith('```')) {
        out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      closeList();
      code = [];
    } else if (/^#{1,3} /.test(line)) {
      closeList();
      const level = line.indexOf(' ');
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (line.startsWith('- ')) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

// The page: A4, one column of type, the paste example in two columns so the page stays one page.
const page = (body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
  @font-face { font-family: Oswald; src: url('${pathToFileURL(path.join(ROOT, 'public', 'fonts', 'oswald.woff2'))}'); }
  @font-face { font-family: Inter; src: url('${pathToFileURL(path.join(ROOT, 'public', 'fonts', 'inter.woff2'))}'); }
  @page { size: A4; margin: 14mm 16mm; }
  body { font-family: Inter, Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1d2b53; }
  h1, h2 { font-family: Oswald, Arial, sans-serif; font-weight: 700; margin: 0; }
  h1 { font-size: 22pt; border-bottom: 4px solid #ffcc00; padding-bottom: 2mm; margin-bottom: 2mm; }
  h2 { font-size: 13pt; margin-top: 4mm; }
  p { margin: 1.5mm 0; }
  ul { margin: 1mm 0; padding-left: 5mm; }
  li { margin: 0.6mm 0; }
  pre { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; line-height: 1.3;
        background: #eef1f6; border-left: 3px solid #ffcc00; padding: 2mm 4mm; margin: 2mm 0;
        column-count: 2; column-gap: 8mm; white-space: pre-wrap; }
</style></head><body>${body}</body></html>`;

async function writePdf() {
  const html = page(markdownToHtml(readFileSync(path.join(PACKAGE, 'README.md'), 'utf8')));
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage();
    await tab.setContent(html, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    const pdf = await tab.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    // One page is the brief: count the page objects in what Chromium wrote, and keep the last
    // good README.pdf when it is more.
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (pages !== 1) throw new Error(`README.pdf would be ${pages} pages - the README is one page, shorten it`);
    writeFileSync(path.join(PACKAGE, 'README.pdf'), pdf);
    console.log('pack-classroom-package: README.pdf, 1 page');
  } finally {
    await browser.close();
  }
}

// ── The zip ──────────────────────────────────────────────────────────────────────────────────

function addTree(zip, abs, rel) {
  if (statSync(abs).isDirectory()) {
    for (const name of readdirSync(abs).sort()) addTree(zip, path.join(abs, name), `${rel}/${name}`);
  } else {
    // A fixed date, so an entry's bytes change only when its file does. README.pdf still differs
    // on every run: Chromium stamps a new creation date and id into it.
    zip.file(rel, readFileSync(abs), { date: new Date('2026-09-25T00:00:00Z') });
  }
}

async function writeZip(copies) {
  const zip = new JSZip();
  for (const entry of CONTENTS) addTree(zip, path.join(PACKAGE, entry), `${ZIP_NAME}/${entry}`);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  mkdirSync(path.dirname(ZIP_OUT), { recursive: true });
  writeFileSync(ZIP_OUT, bytes);
  console.log(`pack-classroom-package: ${path.relative(ROOT, ZIP_OUT)}, ${Object.keys(zip.files).filter((f) => !zip.files[f].dir).length} files, ${bytes.length} bytes`);
  for (const copy of copies) {
    mkdirSync(path.dirname(copy), { recursive: true });
    writeFileSync(copy, bytes);
    console.log(`pack-classroom-package: copied to ${copy}`);
  }
}

const args = process.argv.slice(2);
const copies = args.flatMap((a, i) => (a === '--copy-to' && args[i + 1] ? [args[i + 1]] : []));
await writePdf();
await writeZip(copies);
