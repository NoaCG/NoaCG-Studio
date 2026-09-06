// The /ograf STARTERS page (ograf.html) — vanilla TS, no React, the join/output pattern.
//
// The page's card copy is STATIC in ograf.html (crawlable without this module); this module
// enhances every [data-starter] card with a live preview and a working download. The download
// is built by the REAL exporter at click time — `ografTarget.build()` on `variant.create()` —
// so a starter can never drift from what the product exports, and every package passes the
// same EBU-schema gate (`addOgrafPackage`) on its way out. The one addition over an ordinary
// export is GUIDE.md (./guide.ts), the modification walkthrough the starters exist for.
//
// The card names a design by its CATALOG NAME (data-starter). A catalog rename would strand a
// card, so an unresolved name shows an honest note instead of a dead button — and
// e2e/ograf-starters.spec.ts fails the build when it happens.

import { CATALOG } from '../templates/catalog';
import type { TemplateVariant } from '../model/wizard';
import type { SpxTemplate } from '../model/types';
import { composeDocument } from '../preview/composeDocument';
import { frameGraphic, framingTransform, type GraphicBox } from '../preview/frameGraphic';
import { ografTarget } from '../export/targets/ograf';
import { slug } from '../model/slug';
import { starterGuideMd } from './guide';

function findVariant(name: string): TemplateVariant | null {
  for (const list of Object.values(CATALOG)) {
    const hit = list.find((v) => v.name === name);
    if (hit) return hit;
  }
  return null;
}

/** The preview's settle data: the graphic's own field defaults — the GraphicThumb recipe,
 *  without the store around it. */
function defaultData(template: SpxTemplate): string {
  const merged: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.ftype === 'button') continue;
    merged[f.field] = String(f.value ?? '');
  }
  return JSON.stringify(merged);
}

function mountPreview(host: HTMLElement, template: SpxTemplate): void {
  const frame = document.createElement('iframe');
  // Generated template code runs sandboxed exactly as every in-app preview does — scripts
  // only, opaque origin (the bundled /fonts responses carry CORS for this).
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('title', `${template.name} preview`);
  frame.srcdoc = composeDocument(template, { settleWithData: defaultData(template) });
  frame.style.width = `${template.resolution.width}px`;
  frame.style.height = `${template.resolution.height}px`;
  // FRAMED ON THE GRAPHIC, not on the canvas (preview/frameGraphic.ts — the MiniPreview /
  // GraphicThumb rule): a strap or a corner bug is a sliver of a 1920×1080 frame, and the
  // whole-canvas view made six starters read as five empty tiles. The settled document posts
  // its own box back (composeDocument settleWithData); until then, whole canvas.
  let box: GraphicBox | null = null;
  const fit = () => {
    frame.style.transform = framingTransform(
      frameGraphic(box, template.resolution, { w: host.clientWidth, h: host.clientHeight }),
    );
  };
  window.addEventListener('message', (ev) => {
    if (ev.source !== frame.contentWindow) return;
    const msg = ev.data as { type?: string; x?: number; y?: number; w?: number; h?: number };
    if (msg?.type === 'spx-preview-box' && typeof msg.w === 'number' && msg.w > 0) {
      box = { x: msg.x ?? 0, y: msg.y ?? 0, w: msg.w, h: msg.h ?? 0 };
      fit();
    }
  });
  host.appendChild(frame);
  fit();
  new ResizeObserver(fit).observe(host);
}

async function downloadStarter(variant: TemplateVariant, note: HTMLElement): Promise<void> {
  note.textContent = 'Building and validating the package…';
  try {
    const template = variant.create();
    // Live intent: every starter must download, and the post-production gate rightly refuses
    // content-driven motion (the ticker). A user who wants the non-real-time flavour exports
    // from the studio, where the intent is a choice.
    const zip = await ografTarget.build(template, { graphicUsage: 'live' });
    zip.file(`${slug(template.name)}/GUIDE.md`, starterGuideMd(template));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(template.name)}-ograf.zip`;
    a.click();
    URL.revokeObjectURL(url);
    note.textContent = 'Validated against the EBU OGraf v1 schema before download.';
  } catch (e) {
    // An export refusal is a NoaCG defect on this page — the starters are ours, curated.
    note.textContent = `This package could not be built: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function enhanceCard(card: HTMLElement): void {
  const name = card.dataset.starter ?? '';
  const note = card.querySelector<HTMLElement>('[data-note]');
  const button = card.querySelector<HTMLButtonElement>('[data-download]');
  const customize = card.querySelector<HTMLAnchorElement>('[data-customize]');
  const preview = card.querySelector<HTMLElement>('[data-preview]');
  const variant = findVariant(name);
  if (!variant) {
    if (note) note.textContent = `“${name}” is not in the current catalog — this card is out of date.`;
    return;
  }
  if (customize) customize.href = `/app#/new/${encodeURIComponent(variant.id)}`;
  if (preview) mountPreview(preview, variant.create());
  if (button) {
    button.disabled = false;
    button.addEventListener('click', () => {
      button.disabled = true;
      void downloadStarter(variant, note ?? document.createElement('p')).finally(() => {
        button.disabled = false;
      });
    });
  }
}

for (const card of document.querySelectorAll<HTMLElement>('[data-starter]')) enhanceCard(card);
