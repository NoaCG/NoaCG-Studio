import { test, expect } from '@playwright/test';
import * as rules from '../scripts/rules.mjs';

// FIELD TEXT IS DATA, NEVER MARKUP — the whole catalog, driven with a markup payload.
//
// Several categories render operator text through `innerHTML` (a ticker's items, a credits
// roll's rows, a table's cells) because the row count is the operator's content and the motion
// is measured from the rendered rows. That is the right design, and it is also the one place a
// template can turn typed text into code.
//
// It matters because a field value is NOT always typed by the operator. The show-chat block
// (src/showchat/chatGraphicBlock.ts) writes what an anonymous audience member sent in straight
// into a ticker's or a credits roll's line-list field, and the control layer writes staged data
// from whoever holds the panel's link. So an unescaped field is a way for someone outside the
// studio to run code inside a graphic that is on air — and, in the editor, inside a preview
// iframe that shares the app's origin.
//
// This spec is the standing guard: EVERY catalog variant is built, loaded, and handed a payload
// that executes if — and only if — it reaches the DOM as markup. The payload reports itself by
// postMessage, so the check is "did it run", not "does the string look escaped".
//
// The second test is the one that keeps the first honest: it renders the same payload the way an
// unescaped runtime would and asserts it DOES fire. Without it, a harness that silently stopped
// delivering the payload would report a clean catalog forever.

const HARNESS = `
  /** Build one variant, load it in an iframe, write PAY into every text field, report back. */
  async function probe(variant, opts) {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const tpl = variant.create(opts || {});
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; setTimeout(res, 3000); f.srcdoc = composeDocument(tpl); });
    const pay = 'Ada <img src=x onerror="parent.postMessage({ type: \\'escaped-probe\\', id: \\'' +
      variant.id + '\\' }, \\'*\\')">';
    const data = {};
    // NUMBER fields are driven too. Nothing on the wire enforces that a number field carries a
    // number: update() takes a JSON string from a control page, a hosted log row or an export,
    // and a runtime that builds markup from the value is exposed whatever the field is DECLARED
    // as. Filtering these out would have quietly dropped every score from the sweep the day
    // scores stopped being textfields.
    for (const fl of tpl.fields) {
      if (fl.ftype === 'textfield' || fl.ftype === 'textarea' || fl.ftype === 'number') data[fl.field] = pay;
    }
    try { f.contentWindow.update(JSON.stringify(data)); } catch (e) { void e; }
    // play() too: a rotator renders its item from the timeline, not from update().
    try { f.contentWindow.play(); } catch (e) { void e; }
    await new Promise((r) => setTimeout(r, 400));
    return { frame: f, win: f.contentWindow, doc: f.contentDocument, pay: pay };
  }
`;

test('no catalog variant lets field text execute as markup', async ({ page }) => {
  // The whole catalog in one page context, eight frames at a time.
  test.setTimeout(300_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const fired = await page.evaluate(`(async () => {
    ${HARNESS}
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const variants = [];
    for (const key of Object.keys(CATALOG)) for (const v of CATALOG[key]) variants.push(v);

    const hits = new Set();
    window.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'escaped-probe') hits.add(ev.data.id);
    });

    let next = 0;
    const worker = async () => {
      while (next < variants.length) {
        const v = variants[next++];
        try {
          const { frame } = await probe(v);
          frame.remove();
        } catch (e) { void e; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
    // The payload's own error handler is async — give the last frames a beat to report.
    await new Promise((r) => setTimeout(r, 1000));
    return [...hits].sort();
  })()`);

  expect(
    fired,
    'These variants rendered field text as markup and it EXECUTED. Escape it where the runtime ' +
      'reads the field (shared/base.ts ESCAPE_HTML_JS), not inside the design’s row builder. ' +
      rules.text('templates/escape-field-text-shared-data-reading'),
  ).toEqual([]);
});

test('the probe still fires when a runtime skips escaping', async ({ page }) => {
  // The mutation check: a clean run above must mean "nothing executed", not "nothing was
  // delivered". Here the payload is written the way an unescaped rebuild would write it.
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const fired = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const hits = new Set();
    window.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'escaped-probe') hits.add(ev.data.id);
    });
    const { frame, doc, pay } = await probe(variantById('tk01'));
    // Bypass the escaping exactly as the pre-fix runtime did: raw text into the row builder.
    doc.getElementById('ticker-track').innerHTML = frame.contentWindow.renderTickerItem(pay);
    // Poll for the postMessage rather than sleeping a fixed 600ms: the img's onerror (and the
    // message round-trip it sends) is a real browser task, not a guaranteed-fast one, and a
    // fixed sleep under worker contention raced it and lost. 5s ceiling, checked every 25ms, so
    // a payload that truly never fires is still caught almost as fast as the old 600ms did.
    const deadline = Date.now() + 5000;
    while (!hits.has('tk01') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    frame.remove();
    return [...hits];
  })()`);

  expect(fired, 'the escaping probe no longer detects an unescaped runtime — it has stopped testing anything').toEqual(
    ['tk01'],
  );
});
