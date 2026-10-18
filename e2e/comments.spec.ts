// covers: src/editor/**, src/components/video/{VideoCodeEditor,VideoAppShell}.tsx

import { test, expect, type Page } from '@playwright/test';
import { reloadVideoShell } from './_video';
import { durableValue } from './_storage';

// The live video code pane owns the comment control. Mode changes and source edits use its UI.
// Selection/find use Monaco's API because its caret and find widget are unreliable headless.
async function codeEditorReady(page: Page) {
  await page.goto('/app#/video');
  await expect(page.getByTestId('video-shell')).toBeVisible();
  const toggle = page.getByTestId('video-toggle-code');
  if ((await toggle.getAttribute('title')) === 'Show the code editor') await toggle.click();
  await expect(page.getByTestId('comment-visibility')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-line').first()).toBeVisible();
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('Control+End');
}
async function setMode(page: Page, mode: 'normal' | 'dimmed' | 'hidden') {
  await page.getByTestId('comment-visibility').selectOption(mode);
}
const source = (page: Page) => page.evaluate(async () =>
  (await import('/src/store/videoProjectStore.ts')).useVideoProjectStore.getState().project.tsx);

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

test('Hidden paints comments transparent and leaves the source untouched', async ({ page }) => {
  await codeEditorReady(page);
  const before = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const s = useVideoProjectStore.getState();
    return { html: s.project.tsx, historyLength: s.history.length };
  });

  await setMode(page, 'hidden');
  const hidden = page.locator('.monaco-editor .comment-hidden');
  await expect(hidden.first()).toBeVisible();
  // Transparent, not removed: the characters keep their place, so every line number holds.
  // Polled, because Monaco re-renders its view lines freely (a span read once can be detached).
  await expect
    .poll(() => hidden.first().evaluate((el) => getComputedStyle(el).color))
    .toBe('rgba(0, 0, 0, 0)');
  expect(await hidden.first().textContent()).not.toBe('');

  await setMode(page, 'dimmed');
  await expect(page.locator('.monaco-editor .comment-hidden')).toHaveCount(0);
  const dimmed = page.locator('.monaco-editor .comment-dimmed');
  await expect(dimmed.first()).toBeVisible();
  await expect.poll(() => dimmed.first().evaluate((el) => getComputedStyle(el).opacity)).toBe('0.35');

  await setMode(page, 'normal');
  await expect(page.locator('.monaco-editor .comment-dimmed')).toHaveCount(0);
  await expect(page.locator('.monaco-editor .comment-hidden')).toHaveCount(0);

  // The whole round trip is a view change: not one character moved.
  const after = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const s = useVideoProjectStore.getState();
    return { html: s.project.tsx, historyLength: s.history.length };
  });
  expect(after.html).toBe(before.html);
  expect(after.historyLength).toBe(before.historyLength); // no undo step was created by any of it
});

test('the mode survives a model swap, a manual edit, pane remount and reload', async ({ page }) => {
  await codeEditorReady(page);
  await setMode(page, 'hidden');
  await expect(page.locator('.monaco-editor .comment-hidden').first()).toBeVisible();

  // The video pane has one source tab. Exercise its controller's model-swap contract directly,
  // then restore the original model; this probe does not write application state.
  const swapped = await page.evaluate(async () => {
    const { monaco } = await import('/src/monacoSetup.ts');
    const editor = monaco.editor.getEditors()[0], original = editor.getModel()!;
    const replacement = monaco.editor.createModel('// replacement model note\nconst value = 1;\n', 'typescript');
    try {
      editor.setModel(replacement);
      editor.setPosition({ lineNumber: 2, column: 1 });
      const until = performance.now() + 5000;
      while (!replacement.getAllDecorations().some(d => d.options.inlineClassName === 'comment-hidden') && performance.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return replacement.getAllDecorations().some(d => d.options.inlineClassName === 'comment-hidden');
    } finally { editor.setModel(original); replacement.dispose(); }
  });
  expect(swapped).toBe(true);
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  const before = await source(page);
  await page.keyboard.insertText('freshvisibilitynote');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => source(page)).toContain('freshvisibilitynote');
  await expect(page.locator('.monaco-editor .comment-hidden').filter({ hasText: 'freshvisibilitynote' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect.poll(() => source(page)).toBe(before);
  await expect(page.locator('.monaco-editor .comment-hidden').first()).toBeVisible();

  await page.getByTestId('video-toggle-code').click();
  await expect(page.getByTestId('comment-visibility')).toHaveCount(0);
  await page.getByTestId('video-toggle-code').click();
  await expect(page.getByTestId('comment-visibility')).toHaveValue('hidden');
  await expect(page.locator('.monaco-editor .comment-hidden').first()).toBeVisible();
  await expect.poll(async () => (await durableValue(page, 'spx-gfx-video-project'))?.includes('Starter composition') ?? false).toBe(true);
  await reloadVideoShell(page);
  await expect(page.getByTestId('comment-visibility')).toHaveValue('hidden');
  await expect(page.locator('.monaco-editor .comment-hidden').first()).toBeVisible();
  expect(await source(page)).toBe(before);
});

test('a selection inside a hidden comment reveals it', async ({ page }) => {
  await codeEditorReady(page);
  await setMode(page, 'hidden');
  const hidden = page.locator('.monaco-editor .comment-hidden');
  await expect(hidden.first()).toBeVisible();

  // Put the cursor in the first comment and read the decorations back off the model. (Matching
  // the rendered span by its text would not survive word wrap, which splits a long comment into
  // several spans, nor the fact that Monaco only paints the lines in view.)
  const decorated = await page.evaluate(async () => {
    const { monaco } = await import('/src/monacoSetup.ts');
    const { findCommentRanges } = await import('/src/editor/commentVisibility.ts');
    const editor = monaco.editor.getEditors()[0];
    const model = editor.getModel();
    if (!model) return null;
    const target = findCommentRanges(monaco, model.getValue(), model.getLanguageId())[0];
    if (!target) return null;
    const classesAt = () =>
      model
        .getDecorationsInRange(target)
        .map((d: { options: { inlineClassName?: string | null } }) => d.options.inlineClassName)
        .filter(Boolean);
    const before = classesAt();
    editor.setSelection(target);
    await new Promise((r) => setTimeout(r, 50));
    return { before, after: classesAt() };
  });
  expect(decorated?.before).toContain('comment-hidden');
  // That comment is legible again — while the others around it stay hidden.
  expect(decorated?.after).not.toContain('comment-hidden');
  await expect(hidden.first()).toBeVisible();
});

test('a find match inside a hidden comment reveals it', async ({ page }) => {
  await codeEditorReady(page);
  await setMode(page, 'hidden');
  await expect(page.locator('.monaco-editor .comment-hidden').first()).toBeVisible();

  // Search for a word that only exists inside a comment, through the find widget's own state
  // (the path the editor's Ctrl+F drives), and check the comment stops being hidden.
  const decorated = await page.evaluate(async () => {
    const { monaco } = await import('/src/monacoSetup.ts');
    const { findCommentRanges } = await import('/src/editor/commentVisibility.ts');
    const editor = monaco.editor.getEditors()[0];
    const model = editor.getModel();
    if (!model) return null;
    const lines = model.getValue().split('\n');
    // A word inside a comment that appears nowhere else in the file.
    let target: { range: unknown; word: string } | null = null;
    for (const range of findCommentRanges(monaco, model.getValue(), model.getLanguageId())) {
      const text = lines[range.startLineNumber - 1].slice(range.startColumn - 1, range.endColumn - 1);
      const word = (text.match(/[A-Za-z]{6,}/g) ?? []).find(
        (w) => model.findMatches(w, false, false, true, null, false, 2).length === 1,
      );
      if (word) { target = { range, word }; break; }
    }
    if (!target) return null;
    const classesAt = () =>
      model
        .getDecorationsInRange(target!.range as Parameters<typeof model.getDecorationsInRange>[0])
        .map((d: { options: { inlineClassName?: string | null } }) => d.options.inlineClassName)
        .filter(Boolean);
    const before = classesAt();
    const controller = editor.getContribution('editor.contrib.findController') as unknown as {
      getState(): { change(value: Record<string, unknown>, moveCursor: boolean): void };
    };
    controller.getState().change({ searchString: target.word, isRevealed: true }, false);
    await new Promise((r) => setTimeout(r, 100));
    return { before, after: classesAt(), word: target.word };
  });
  expect(decorated?.before).toContain('comment-hidden');
  expect(decorated?.after).not.toContain('comment-hidden');
});
