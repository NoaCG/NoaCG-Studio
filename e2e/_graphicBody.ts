// HOW A SPEC OR A WALK READS INSIDE A MOUNTED NOACG OGRAF GRAPHIC.
//
// An exported Graphic runs its template with a `document` whose `body` is the template's canvas
// (`scopedDocument` in src/export/targets/ograf.ts). In the light mount that is the element
// itself; in a shadow mount it is the canvas element in the element's shadow root, which
// `document.querySelector` and `el.querySelector` do not reach. Reading through `graphicBody(el)`
// keeps every reader working in either mount (docs/work-specs/ograf-shadow-root/spec.md, decision
// 7): markup lookups, attributes the template sets on its body, and the canvas box all answer
// there. A read of the graphic's own stylesheet uses `el.shadowRoot ?? el` instead.
//
// Page JS cannot import, so the function is a page global. scripts/ograf-external-walk.mjs
// installs the same script with `addInitScript`.

import type { Page } from '@playwright/test';

declare global {
  /** The template's `body` inside the mounted Graphic `el`: the element, or its shadow canvas. */
  function graphicBody(el: Element): HTMLElement;
}

/** Defines `graphicBody` in a page. */
export const GRAPHIC_BODY_SCRIPT = "globalThis.graphicBody = (el) => el.shadowRoot?.querySelector('[data-noacg-graphic]') ?? el;";

const installed = new WeakSet<Page>();

/** Define `graphicBody` in the page's current document and in every document it opens next. */
export async function installGraphicBody(page: Page): Promise<void> {
  if (installed.has(page)) return;
  installed.add(page);
  await page.addInitScript(GRAPHIC_BODY_SCRIPT);
  await page.evaluate(GRAPHIC_BODY_SCRIPT);
}
