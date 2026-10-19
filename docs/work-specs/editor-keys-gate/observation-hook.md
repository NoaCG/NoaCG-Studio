# Temporary observational patch

Exact patch applied for the single owner-authorized observational run. It was
removed after the run. This is evidence, not a maintained test change.

SHA256 of the original diff bytes: `d967b50438b914913416252a487ff97903b01058e9670740a9ebf29ef6e0723c`.

```diff
diff --git a/e2e/editor-keys.spec.ts b/e2e/editor-keys.spec.ts
index 227897109..4ced6c5a5 100644
--- a/e2e/editor-keys.spec.ts
+++ b/e2e/editor-keys.spec.ts
@@ -159,7 +159,49 @@ test('nonzero first key, diamond last removal, interpolated disable and exact un
 });
 
 test('nested SVG armed parent-coordinate drag and explicit base offset preserve motion', async ({ page }) => {
-  await setup(page);
+  try {
+  await setup(page);  await page.evaluate(async () => {
+    const { foundationDiagnostics } = await import('/src/components/editorFoundation/Canvas.tsx');
+    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
+    const events: unknown[] = [];
+    const stamp = () => performance.timeOrigin + performance.now();
+    const pose = (part: { selector: string; appearance?: { time?: number; cue?: number; revision?: unknown; exiting?: boolean } }) => ({
+      selector: part.selector, time: part.appearance?.time ?? null, cue: part.appearance?.cue ?? null,
+      revision: part.appearance?.revision ?? null, exiting: part.appearance?.exiting ?? false,
+    });
+    const dom = () => {
+      const canvas = document.querySelector('[data-testid="foundation-canvas"]');
+      return Object.fromEntries(['data-pending', 'data-request', 'data-generation', 'data-pose-time', 'data-pose-cue'].map(name => [name, canvas?.getAttribute(name) ?? null]));
+    };
+    const sessionState = () => {
+      const session = activeEditorSession(), version = session.version(), view = session.port.view();
+      return { documentId: session.documentId, version, view: { time: view.time, cue: view.cue ?? null, selectedParts: view.selectedParts },
+        receipt: foundationDiagnostics()?.receipt(version, view) ?? null };
+    };
+    const replies = (event: MessageEvent) => {
+      const message = event.data;
+      if (message?.type !== 'noacg-editor-foundation-v1') return;
+      const frame = document.querySelector('iframe[title="Foundation graphic preview"]') as HTMLIFrameElement | null;
+      events.push({ kind: 'reply-before-handler', at: stamp(), sourceMatchesFrame: event.source === frame?.contentWindow,
+        reply: { type: message.type, kind: message.kind, documentId: message.documentId, generation: message.generation,
+          requestId: message.requestId, revision: message.revision, renderedAt: message.renderedAt ?? null,
+          parts: message.parts?.map(pose) ?? [], message: message.message ?? null }, dom: dom(), session: sessionState() });
+    };
+    const pointer = (event: PointerEvent) => {
+      if (!(event.target instanceof Element) || !event.target.closest('[data-testid="foundation-canvas"]')) return;
+      events.push({ kind: event.type, at: stamp(), target: event.target.tagName, x: event.clientX, y: event.clientY,
+        dom: dom(), session: sessionState() });
+    };
+    window.addEventListener('message', replies, true);
+    document.addEventListener('pointerdown', pointer, true);
+    document.addEventListener('pointerup', pointer, true);
+    (window as unknown as { __editorKeysObservation: unknown }).__editorKeysObservation = { events, stop: () => {
+      window.removeEventListener('message', replies, true);
+      document.removeEventListener('pointerdown', pointer, true);
+      document.removeEventListener('pointerup', pointer, true);
+    } };
+  });
+
   await page.evaluate(async () => {
     const { useTemplateStore } = await import('/src/store/templateStore.ts');
     const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
@@ -182,7 +224,14 @@ test('nested SVG armed parent-coordinate drag and explicit base offset preserve
   const input = details.getByRole('textbox', { name: 'Base Position X', exact: true });
   const value = Number(await input.inputValue()); await input.fill(String(value + 40)); await input.press('Enter'); await ready(page);
   expect((await source(page)).js).toBe(before.js);
-  expect(await (await preview(page)).locator('#nested').evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(pose + 69.282032, 1);
+  expect(await (await preview(page)).locator('#nested').evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(pose + 69.282032, 1);  } finally {
+    const observation = await page.evaluate(() => {
+      const state = (window as unknown as { __editorKeysObservation?: { events: unknown[]; stop(): void } }).__editorKeysObservation;
+      state?.stop(); return state?.events ?? [];
+    });
+    console.log('EDITOR_KEYS_OBSERVATION ' + JSON.stringify(observation));
+  }
+
 });
 
 test('bar movement carries disjoint spans and keys, cancel and refusal are atomic', async ({ page }) => {
```
