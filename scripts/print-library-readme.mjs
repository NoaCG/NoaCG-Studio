#!/usr/bin/env node
// PRINTS THE TEMPLATE LIBRARY'S README AS A PDF: docs/tutorials/template-library/README.md ->
// README.pdf beside it. README.md is the source and README.pdf is what most people open; both go
// into every library zip, which the build makes from the folder (scripts/svg-files.mjs).
//
//   node scripts/print-library-readme.mjs
//
// Run after editing the README. Chromium prints the authored A4 pages, separated with `---`; a
// page that overflows is refused. The Markdown is the small subset the README uses (headings,
// bullets, bold, inline code, tables, code blocks, `---` as the page break), converted here so the
// repo needs no Markdown package. It drives a headless Chromium, so on the laptop run it through
// the job queue: node scripts/jobs.mjs add "node scripts/print-library-readme.mjs" --cost 0.25
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { escapeHtml } from './behaviour-docs.mjs';
import { LIBRARY_DIR } from './svg-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = path.join(ROOT, LIBRARY_DIR);
/** The README's authored page count, one per `---`-separated part; overflow is refused. */
const PAGES = readFileSync(path.join(PACKAGE, 'README.md'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter((line) => line === '---').length + 1;

// ── README.md -> HTML ────────────────────────────────────────────────────────────────────────

const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

function markdownToHtml(md) {
  const out = [];
  let list = false;
  let table = false;
  let code = null;
  const closeBlock = () => {
    if (list) out.push('</ul>');
    list = false;
    if (table) out.push('</table>');
    table = false;
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
      closeBlock();
      code = [];
    } else if (line === '---') {
      // The page break: what follows starts page 2.
      closeBlock();
      out.push('<hr>');
    } else if (/^#{1,3} /.test(line)) {
      closeBlock();
      const level = line.indexOf(' ');
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (line.startsWith('|')) {
      // A table row. The first row is the header; the |---| row under it only marks that.
      const cells = line.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/);
      if (cells.every((c) => /^-+$/.test(c))) continue;
      const tag = table ? 'td' : 'th';
      if (list) closeBlock();
      if (!table) out.push('<table>');
      table = true;
      out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
    } else if (line.startsWith('- ')) {
      if (table) closeBlock();
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      closeBlock();
    } else {
      closeBlock();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeBlock();
  return out.join('\n');
}

// The page: A4, one column of type; a code block, if the README ever has one, runs in two columns.
const page = (body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
  @font-face { font-family: Oswald; src: url('${pathToFileURL(path.join(ROOT, 'public', 'fonts', 'oswald.woff2'))}'); }
  @font-face { font-family: Inter; src: url('${pathToFileURL(path.join(ROOT, 'public', 'fonts', 'inter.woff2'))}'); }
  @page { size: A4; margin: 14mm 16mm; }
  body { font-family: Inter, Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1d2b53; }
  h1, h2 { font-family: Oswald, Arial, sans-serif; font-weight: 700; margin: 0; }
  h1 { font-size: 22pt; border-bottom: 4px solid #ffcc00; padding-bottom: 2mm; margin-bottom: 2mm; }
  h2 { font-size: 13pt; margin-top: 4mm; }
  h1, h2 { break-after: avoid; }
  p { margin: 1.5mm 0; }
  ul { margin: 1mm 0; padding-left: 5mm; }
  li { margin: 0.6mm 0; }
  hr { break-after: page; border: 0; margin: 0; }
  /* The layer-name table: one row per graphic, a thin rule between rows, header on a tint. */
  table { border-collapse: collapse; width: 100%; margin: 2mm 0; font-size: 9.5pt; line-height: 1.35; }
  th, td { text-align: left; vertical-align: top; padding: 1.8mm 2mm; border-bottom: 1px solid #c9d1e0; }
  th { font-family: Oswald, Arial, sans-serif; font-weight: 700; background: #eef1f6; border-bottom: 2px solid #ffcc00; }
  tr { break-inside: avoid; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 0.95em; white-space: nowrap; }
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
    // Count page objects and keep the last good README.pdf if an authored page overflows.
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (pages !== PAGES) throw new Error(`README.pdf would be ${pages} pages - the README is ${PAGES}, shorten the page that overflows`);
    writeFileSync(path.join(PACKAGE, 'README.pdf'), pdf);
    console.log(`print-library-readme: README.pdf, ${PAGES} pages`);
  } finally {
    await browser.close();
  }
}

await writePdf();
