# Single unsuccessful editor-keys probe

This exact temporary instrumentation ran once and was removed. It is not a repair.

## Spec patch

```diff
diff --git a/e2e/editor-keys.spec.ts b/e2e/editor-keys.spec.ts
index 227897109..ecd20f632 100644
--- a/e2e/editor-keys.spec.ts
+++ b/e2e/editor-keys.spec.ts
@@ -7,6 +7,7 @@ import { test, expect, type Page } from '@playwright/test';
 import { installGraphicBody } from './_graphicBody';
 import { settleDurableWrites } from './_durable';
 import { pickDesign } from './_browse';
+import { installKeysProbe, connectKeysProbe, keysProbeResult } from './_phase2-keys-probe';
 
 test('Quiz source-controlled animation is preserved and explains the base editing path', async ({ page }) => {
   await page.goto('/app#/new'); await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'House Quiz');
@@ -159,7 +160,10 @@ test('nonzero first key, diamond last removal, interpolated disable and exact un
 });
 
 test('nested SVG armed parent-coordinate drag and explicit base offset preserve motion', async ({ page }) => {
+  await installKeysProbe(page);
+  try {
   await setup(page);
+  await connectKeysProbe(page);
   await page.evaluate(async () => {
     const { useTemplateStore } = await import('/src/store/templateStore.ts');
     const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
@@ -183,6 +187,7 @@ test('nested SVG armed parent-coordinate drag and explicit base offset preserve
   const value = Number(await input.inputValue()); await input.fill(String(value + 40)); await input.press('Enter'); await ready(page);
   expect((await source(page)).js).toBe(before.js);
   expect(await (await preview(page)).locator('#nested').evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(pose + 69.282032, 1);
+  } finally { console.log('KEYS_MATCHING_PROBE ' + JSON.stringify(await keysProbeResult(page))); }
 });
 
 test('bar movement carries disjoint spans and keys, cancel and refusal are atomic', async ({ page }) => {
```

## Temporary helper

```ts
import type { Page } from '@playwright/test';

export async function installKeysProbe(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const events: unknown[] = [];
    let armed = false, ruler = false, released = false;
    let old: MessageEvent | null = null;
    const replay = new WeakSet<Event>();
    const w = window as unknown as { __keysProbe: { events: unknown[]; snapshot?: () => unknown } };
    w.__keysProbe = { events };
    const stamp = () => performance.timeOrigin + performance.now();
    const dom = () => {
      const c = document.querySelector('[data-testid="foundation-canvas"]');
      return Object.fromEntries(['data-pending', 'data-request', 'data-generation', 'data-pose-time', 'data-pose-cue'].map(n => [n, c?.getAttribute(n)]));
    };
    const record = (kind: string, event?: MessageEvent) => events.push({ kind, at: stamp(), dom: dom(), session: w.__keysProbe.snapshot?.(),
      reply: event ? { ...event.data, parts: event.data.parts?.map((p: { selector: string; appearance?: unknown }) => ({ selector: p.selector, appearance: p.appearance })) } : undefined });
    const deliver = (event: MessageEvent, kind: string) => {
      record(kind + '-before', event);
      const copy = new MessageEvent('message', { data: event.data, source: event.source, origin: event.origin });
      replay.add(copy); window.dispatchEvent(copy); record(kind + '-after', event);
    };
    // This listener exists before any application module/controller is registered.
    window.addEventListener('message', event => {
      if (replay.has(event) || !armed || event.data?.type !== 'noacg-editor-foundation-v1') return;
      const frame = document.querySelector('iframe[title="Foundation graphic preview"]') as HTMLIFrameElement | null;
      if (event.source !== frame?.contentWindow) return;
      const part = event.data.parts?.find((p: { selector: string }) => p.selector === '#nested');
      if (event.data.kind !== 'pose' || !part) return;
      if (!old && !released && !ruler && Math.abs(part.appearance?.time ?? -1) < .00001) {
        event.stopImmediatePropagation(); old = event; record('old-zero-stopped-before-controller', event);
        setTimeout(() => record('old-zero-still-unconsumed', event), 0);
      } else if (ruler && Math.abs((part.appearance?.time ?? -1) - 1) < .00001 && !released) {
        event.stopImmediatePropagation(); record('latest-one-stopped-before-controller', event);
        setTimeout(() => { released = true; deliver(event, 'latest-one-release'); }, 1500);
        setTimeout(() => record('latest-one-still-unconsumed', event), 0);
      } else record('actual-reply', event);
    });
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('button')?.textContent?.trim() === 'Enable Position X animation') { armed = true; record('armed'); }
    }, true);
    document.addEventListener('pointerdown', event => {
      if (!(event.target instanceof Element)) return;
      if (armed && event.target.closest('[role="slider"][aria-label="Playhead"]')) {
        ruler = true; record('real-ruler-pointerdown');
        if (old) setTimeout(() => { const actual = old!; old = null; deliver(actual, 'old-zero-release-after-ruler'); }, 0);
      }
      if (armed && event.target.closest('[data-testid="foundation-canvas"]')) record('real-canvas-pointerdown');
    }, true);
  });
}

export async function connectKeysProbe(page: Page) {
  await page.evaluate(async () => {
    const { foundationDiagnostics } = await import('/src/components/editorFoundation/Canvas.tsx');
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const w = window as unknown as { __keysProbe: { snapshot: () => unknown } };
    w.__keysProbe.snapshot = () => {
      const session = activeEditorSession(), version = session.version(), view = session.port.view();
      const controller = foundationDiagnostics();
      const raw = controller as unknown as { expected?: unknown; acknowledgement?: { requestId: number; generation: number } };
      return { version, view: { time: view.time, cue: view.cue ?? null, selectedParts: view.selectedParts },
        receipt: controller?.receipt(version, view), expected: raw?.expected,
        consumedRequest: raw?.acknowledgement?.requestId, consumedGeneration: raw?.acknowledgement?.generation };
    };
  });
}

export async function keysProbeResult(page: Page) {
  return page.evaluate(() => ({ events: (window as unknown as { __keysProbe: { events: unknown[] } }).__keysProbe.events,
    stageError: document.querySelector('.ef-stage-error')?.textContent ?? null }));
}
```

## Actual result

```text
Running 1 test using 1 worker

(node:1643) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
KEYS_MATCHING_PROBE {"events":[],"stageError":null}
  ✓  1 [chromium] › e2e/editor-keys.spec.ts:162:1 › nested SVG armed parent-coordinate drag and explicit base offset preserve motion (3.0s)

  1 passed (8.2s)
```
