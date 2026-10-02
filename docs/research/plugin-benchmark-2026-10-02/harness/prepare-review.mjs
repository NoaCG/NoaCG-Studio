// Prepares the blind review: copies each cell's frames into a folder named by brief and a random
// letter (so the quality reviewer does not know which arm made it), with one contact sheet per
// cell of every studio PROGRAM frame plus the CLI stress frame, each labelled with its file name.
// The key (letter -> arm) goes to a separate file the quality reviewer is not given.
// Usage: node prepare-review.mjs <outDir>
import { chromium } from 'file:///C:/claude/NoaCG-Studio/.claude/worktrees/agent-a5568edb9b361f7f9/cli/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.argv[2];
const cells = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'cells');
const byBrief = {};
for (const c of fs.readdirSync(cells)) {
  const [brief, kind, arm] = c.split('-');
  (byBrief[`${brief}-${kind}`] ??= []).push({ cell: c, arm });
}
const key = {};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [brief, list] of Object.entries(byBrief)) {
  const letters = ['X', 'Y', 'Z'].slice(0, list.length).sort(() => Math.random() - 0.5);
  for (const [i, { cell, arm }] of list.entries()) {
    const id = `${brief}-${letters[i]}`;
    key[id] = { cell, arm };
    const src = path.join(cells, cell);
    const dst = path.join(out, id);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['cli-onair-video.jpg', 'cli-stress-video.jpg', 'inspect.txt']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    fs.copyFileSync(path.join(src, 'studio', '01-ready-page.jpg'), path.join(dst, 'panel-at-load.jpg'));
    fs.copyFileSync(path.join(src, 'studio', 'reach.json'), path.join(dst, 'reach.json'));
    const frames = fs.readdirSync(path.join(src, 'studio')).filter((f) => f.endsWith('-program.png'));
    const tiles = [...frames.map((f) => [f, path.join(src, 'studio', f)]), ['cli-stress-video.jpg', path.join(src, 'cli-stress-video.jpg')]];
    const html = `<body style="margin:0;background:#222;font:14px sans-serif;color:#eee;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">`
      + tiles.map(([label, p]) => `<figure style="margin:0"><img src="${pathToFileURL(p)}" style="width:100%;display:block;background:#000"><figcaption>${label}</figcaption></figure>`).join('') + '</body>';
    const tmp = path.join(dst, 'sheet.html');
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dst, 'studio-sheet.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    fs.unlinkSync(tmp);
  }
}
await browser.close();
fs.writeFileSync(path.join(out, '..', 'review-key.json'), JSON.stringify(key, null, 2) + '\n');
console.log(Object.keys(key).sort().join('\n'));
