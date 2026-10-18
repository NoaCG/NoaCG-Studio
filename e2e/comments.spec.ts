// covers: none - no source path selected this spec when coverage moved into spec headers
// (2026-09-27); it runs when edited, on a full escalation and at night

import { test, expect } from '@playwright/test';

// The Comments visibility control (src/editor/commentVisibility.ts) - a VIEW preference over the
// retired code editor pane. Its range finder is pure and still runs here; the control itself,
// its decorations and reveals went with that pane on 2026-10-17.

// ── The range finder (pure, run in the app's module context) ──

test('comment ranges come from the tokenizer, across every language we support', async ({ page }) => {
  await page.goto('/app');
  const out = await page.evaluate(async () => {
    const { monaco } = await import('/src/monacoSetup.ts');
    const { findCommentRanges } = await import('/src/editor/commentVisibility.ts');
    // Slice each range back out of its own line, so the assertion reads as "these characters".
    // Monaco loads a language's tokenizer lazily (creating the model is what asks for it), so
    // this waits for it the same bounded way the controller does.
    const slices = async (text: string, languageId: string) => {
      const lines = text.split('\n');
      const model = monaco.editor.createModel(text, languageId);
      let ranges: { startLineNumber: number; startColumn: number; endColumn: number }[] = [];
      for (let attempt = 0; attempt < 40 && ranges.length === 0; attempt++) {
        ranges = findCommentRanges(monaco, text, languageId);
        if (ranges.length === 0) await new Promise((r) => setTimeout(r, 50));
      }
      model.dispose();
      return ranges.map((r) => lines[r.startLineNumber - 1].slice(r.startColumn - 1, r.endColumn - 1));
    };
    return {
      html: await slices('<div><!-- a note --></div>\n<p>plain text</p>', 'html'),
      css: await slices('.a {\n  color: red; /* why */\n}', 'css'),
      // A `//` inside a string is NOT a comment - the thing a regex gets wrong.
      js: await slices('var s = "// not a comment"; // real\n/* block */', 'javascript'),
      tsx: await slices('export const C = () => (\n  // jsx child\n  <div />\n);', 'typescript'),
      // Embedded languages come along for free: the HTML tokenizer switches modes inside <script>.
      embedded: await slices('<script>\n  var x = 1; // inside html\n</script>', 'html'),
    };
  });
  expect(out.html).toEqual(['<!-- a note -->']);
  expect(out.css).toEqual(['/* why */']);
  expect(out.js).toEqual(['// real', '/* block */']);
  expect(out.tsx).toEqual(['// jsx child']);
  expect(out.embedded).toEqual(['// inside html']);
});

// ── The editor control ──

