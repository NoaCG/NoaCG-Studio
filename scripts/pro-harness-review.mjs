#!/usr/bin/env node
// THE BLIND READ SHEET for a Pro Harness round (docs/PRO_HARNESS_PLAN.md §10, step 4).
//
//   node scripts/pro-harness-review.mjs pro-harness-out-gemini
//
// Free, no browser, no model. It reads the round's ledger and the frames the bench already
// wrote, and produces three files inside the round directory:
//
//   review.html  the sheet, cells under OPAQUE IDS in an order the ids decide - so neither the
//                brief order nor the type order tells the reader which cell is which, and the
//                machine's own verdict is nowhere on the page.
//   notes.md     one empty line per cell, to be filled in BEFORE key.json is opened.
//   key.json     the join: opaque id -> brief id, type, machine verdict, rounds, cost.
//
// WHY THE MACHINE VERDICT IS WITHHELD FROM THE SHEET. The question the read answers is whether
// the deliver signal leaks - whether "delivered clean" and "would air" are the same set. A sheet
// that prints the verdict beside the picture cannot answer it, because the reader has been told
// the answer (docs/NOACG_PRO_PLAN.md §23.1, where the leak went from 12-of-24 to zero and only
// a blind read could say so).
//
// WHICH FRAME IS ON DISK. The bench writes `<tag>.hold.png` and `<tag>.long.png` per graphic and
// OVERWRITES them each round, so the frames are the LAST round's, which is the delivered one only
// when the run delivered. For a `refused` cell whose best round was earlier, the sheet says so on
// the cell rather than passing off a worse picture as the result.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const roundDir = path.resolve(process.argv[2] ?? 'pro-harness-out-gemini');
const bankPath = path.resolve(process.argv[3] ?? 'benchmarks/pro/v1/custom/briefs.json');
const ledgerPath = path.join(roundDir, 'results.json');
if (!existsSync(ledgerPath)) {
  console.error(`No ledger at ${ledgerPath} - run the bench first (--generate).`);
  process.exit(1);
}

const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const bank = JSON.parse(await readFile(bankPath, 'utf8'));
const salt = path.basename(roundDir);
const modelTag = (ledger.route ?? 'model').replace(/[^a-z0-9.-]/gi, '_');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const opaqueId = (id) => createHash('sha1').update(`${salt}:${id}`).digest('hex').slice(0, 6);

/** The brief as the operator stated it, which is the only context the reader is entitled to. */
function briefText(entry) {
  const b = bank.briefs.find((x) => x.id === entry.id)?.brief ?? {};
  return [
    b.brief,
    b.fields ? `Fields: ${b.fields.map((f) => `${f.title} = "${f.sample}"`).join('; ')}.` : '',
    b.name && !b.fields ? `Name "${b.name}", title "${b.title}".` : '',
    b.steps?.length ? `Steps: ${b.steps.join(' -> ')}.` : '',
  ].filter(Boolean).join(' ');
}

const rows = ledger.results
  .map((r) => ({ r, key: opaqueId(r.id) }))
  .sort((a, b) => a.key.localeCompare(b.key));

const frame = (label, file) => (existsSync(path.join(roundDir, 'shots', file))
  ? `<figure><img src="shots/${file}" loading="lazy"><figcaption>${label}</figcaption></figure>`
  : '');

const card = ({ r, key }) => {
  const tag = `${r.id}.${modelTag}`;
  const frames = [frame('sample values', `${tag}.hold.png`), frame('long text (1.7x)', `${tag}.long.png`)].filter(Boolean).join('');
  // The one fact about the machine's run the reader NEEDS, because it changes what the picture
  // is evidence of: a picture from a round the loop did not keep is not the result.
  const stale = r.status !== 'delivered' && r.bestRound != null && r.bestRound < r.rounds.length
    ? '<p class="warn">The frames are the last attempt, not the attempt this run kept.</p>' : '';
  return `<section class="cell" id="${key}"><h2>${key}</h2>`
    + `<p class="brief">${escapeHtml(briefText(r))}</p>`
    + `<div class="frames">${frames || '<p class="warn">(no frames - nothing was rendered)</p>'}</div>`
    + stale
    + `<p class="notes"><b>Your read</b>: would you air it? yes / okay as-is / no - and one line on why.</p></section>`;
};

const html = `<!doctype html><meta charset="utf-8"><title>Pro Harness ${salt} - blind read</title>
<style>body{font:15px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}p.lede{color:#bbb;max-width:820px}
.cell{border-top:1px solid #333;padding:18px 0}.cell h2{font-size:17px;margin:0 0 6px;font-family:ui-monospace,monospace}
.brief{color:#ccc;max-width:900px}.frames{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0}figure img{width:560px;max-width:100%;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 0 0/24px 24px;border:1px solid #333}
figcaption{color:#999;font-size:12px;margin-top:4px}.notes{color:#f6a623}.warn{color:#e2725b;font-size:13px}</style>
<h1>Pro Harness ${salt} - ${rows.length} cell(s), blind</h1>
<p class="lede">No verdict, no cost, no model is shown, and the order carries no signal. Write
notes.md against the pictures first; key.json is the join and is for afterwards.</p>
${rows.map(card).join('')}`;

await writeFile(path.join(roundDir, 'review.html'), html, 'utf8');
await writeFile(path.join(roundDir, 'key.json'), JSON.stringify(Object.fromEntries(rows.map(({ r, key }) => [key, {
  brief: r.id, type: r.type, status: r.status, reason: r.reason,
  rounds: r.rounds.length, bestRound: r.bestRound, escalated: r.escalated, spentUsd: r.spentUsd, seconds: r.seconds,
}])), null, 2), 'utf8');
const notesPath = path.join(roundDir, 'notes.md');
if (!existsSync(notesPath)) {
  await writeFile(notesPath, `# Blind read - ${salt}\n\nOne line per cell id: airable (would air / okay as-is / no) and a word on why.\n\n${rows.map(({ key }) => `- ${key}: `).join('\n')}\n`, 'utf8');
}

const delivered = ledger.results.filter((r) => r.status === 'delivered').length;
const spent = ledger.results.reduce((s, r) => s + (r.spentUsd ?? 0), 0);
console.log(`sheet:  ${path.join(roundDir, 'review.html')}  (${rows.length} cells, blind)`);
console.log(`notes:  ${notesPath}  (fill in BEFORE the key)`);
console.log(`key:    ${path.join(roundDir, 'key.json')}`);
console.log(`machine half, for the record only: ${delivered}/${ledger.results.length} delivered clean, $${spent.toFixed(3)} total, $${(spent / Math.max(1, ledger.results.length)).toFixed(4)} per graphic.`);
