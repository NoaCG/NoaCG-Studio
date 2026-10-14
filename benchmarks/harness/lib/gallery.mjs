// THE GALLERY: a local, private page of a run's graphics, blind (docs/work-specs/noacg-harness/
// spec.md 4.6). One section per brief; each graphic under an opaque id, never its arm; every
// render of the coverage matrix as a row, so the same state of each graphic sits side by side and
// a strip reads left to right. `key.json` beside it maps the ids to arms and is opened only after
// `notes.md` holds the verdicts. The frames are copied under `gallery/<id>/` beside the page, so no
// path names an arm either; none of it is ever committed.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const opaqueId = (salt, cellId) => createHash('sha1').update(`${salt}:${cellId}`).digest('hex').slice(0, 6);

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `cells`: [{ id, dir, brief, arm, model, cell }] with `dir` holding frames/coverage.json. */
export function buildGallery({ runDir, cells, briefs, salt = path.basename(runDir) }) {
  const rel = (p) => path.relative(runDir, p).split(path.sep).join('/');
  const byBrief = new Map();
  for (const c of cells) {
    const list = byBrief.get(c.brief) ?? [];
    const key = opaqueId(salt, c.id);
    list.push({ ...c, key, coverage: publish(path.join(c.dir, 'frames'), path.join(runDir, 'gallery', key)) });
    byBrief.set(c.brief, list);
  }
  const sections = [];
  for (const [briefId, list] of byBrief) {
    list.sort((a, b) => a.key.localeCompare(b.key));
    const brief = briefs.find((b) => b.id === briefId);
    const renders = [];
    for (const c of list) for (const f of c.coverage?.frames ?? []) if (!renders.some((r) => r.name === f.render)) renders.push({ name: f.render, state: f.state, ground: f.ground, values: f.values });
    const head = `<tr><th></th>${list.map((c) => `<th>${c.key}</th>`).join('')}</tr>`;
    const rows = renders.map((r) => {
      const cellsHtml = list.map((c) => {
        const frames = (c.coverage?.frames ?? []).filter((f) => f.render === r.name);
        if (!frames.length) return '<td class="none">(none)</td>';
        return `<td><div class="strip">${frames.map((f) => `<figure><img loading="lazy" src="${escapeHtml(rel(path.join(runDir, 'gallery', c.key, f.file)))}"><figcaption>${frames.length > 1 ? `${f.atMs} ms` : ''}</figcaption></figure>`).join('')}</div></td>`;
      });
      return `<tr><th>${escapeHtml(r.name)}<small>${escapeHtml(r.state)} · ${escapeHtml(r.values)} · ${escapeHtml(r.ground)}</small></th>${cellsHtml.join('')}</tr>`;
    });
    const crops = `<tr><th>crops<small>field elements at native pixels</small></th>${list.map((c) => `<td><div class="strip">${(c.coverage?.crops ?? []).map((k) => `<figure><img loading="lazy" class="crop" src="${escapeHtml(rel(path.join(runDir, 'gallery', c.key, k.file)))}"><figcaption>${escapeHtml(k.key)}</figcaption></figure>`).join('') || '(none)'}</div></td>`).join('')}</tr>`;
    const facts = `<tr><th>measured<small>validator, operator surface</small></th>${list.map((c) => `<td class="facts">${facts_(c.cell, brief)}</td>`).join('')}</tr>`;
    sections.push(`<section><h2>${escapeHtml(briefId)}</h2><p class="brief">${escapeHtml(brief?.prompt ?? '')}</p><table>${head}${facts}${rows.join('')}${crops}</table></section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Harness run ${escapeHtml(salt)} - blind</title>
<style>body{font:14px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}h2{font-size:18px;margin:28px 0 6px}.brief{color:#ccc;max-width:960px}table{border-collapse:collapse}th,td{border-top:1px solid #333;padding:8px;vertical-align:top;text-align:left}th small{display:block;color:#999;font-weight:400;max-width:180px}.strip{display:flex;gap:6px;flex-wrap:wrap}figure{margin:0}img{width:240px;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 0 0/16px 16px;border:1px solid #333}img.crop{width:auto;max-width:480px}figcaption{color:#999;font-size:11px}.none{color:#666}.facts{color:#bbb;max-width:520px}</style>
<h1>Harness run ${escapeHtml(salt)}</h1><p>No arm is shown. Write notes.md per id before opening key.json.</p>${sections.join('')}`;
  writeFileSync(path.join(runDir, 'review.html'), html);
  const all = [...byBrief.values()].flat();
  writeFileSync(path.join(runDir, 'key.json'), `${JSON.stringify(Object.fromEntries(all.map((c) => [c.key, { cell: c.id, brief: c.brief, arm: c.arm, model: c.model }])), null, 2)}\n`);
  const notes = path.join(runDir, 'notes.md');
  if (!existsSync(notes)) writeFileSync(notes, `# Blind read - run ${salt}\n\nOne line per id (review.html): would it air, what is wrong, and per brief which is better.\n\n${[...byBrief].map(([b, list]) => `## ${b}\n${list.map((c) => `- ${c.key}: `).join('\n')}`).join('\n\n')}\n`);
  return { review: path.join(runDir, 'review.html'), key: path.join(runDir, 'key.json'), notes, ids: all.map((c) => c.key) };
}

/** A cell's frames copied under its opaque id: the cell's own folder is named for its arm, and a
 *  frame's path on the page must not say which arm made it. */
function publish(framesDir, galleryDir) {
  const file = path.join(framesDir, 'coverage.json');
  if (!existsSync(file)) return null;
  const coverage = JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(galleryDir, { recursive: true });
  for (const f of [...(coverage.frames ?? []), ...(coverage.crops ?? [])]) {
    const from = path.join(framesDir, f.file);
    if (existsSync(from)) copyFileSync(from, path.join(galleryDir, f.file));
  }
  return coverage;
}

function facts_(cell, brief) {
  if (!cell) return '(no record)';
  if (!cell.validation) return escapeHtml(`${cell.outcome}${cell.reason ? `: ${cell.reason}` : ''}`);
  const lines = [
    `validator: ${cell.validation.ok ? 'clean' : `ERRORS - ${cell.validation.errors.join('; ')}`}${cell.validation.warnings ? ` (${cell.validation.warnings} warning(s))` : ''}`,
    `operator: ${cell.operator.inputs} input(s); ${cell.operator.buttons.join(', ') || 'Take/Update/Next/Out only'}`,
    `brief's actions: ${(brief?.expect?.actions ?? []).join(', ') || 'none'}${cell.operator.missing.length ? ` - MISSING ${cell.operator.missing.join(', ')}` : ''}`,
    ...(cell.capture?.findings?.length ? [`coverage findings: ${cell.capture.findings.join('; ')}`] : []),
  ];
  return lines.map(escapeHtml).join('<br>');
}
