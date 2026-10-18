import type { Page, FrameLocator } from '@playwright/test';

// The editor's live preview iframe carries no `allow-same-origin` (the template it renders can
// be AI-generated or imported code) — a page-JS reach into `contentWindow`/`contentDocument`
// (`page.evaluate(() => document.querySelector('iframe.preview-frame').contentWindow…)`) throws
// a SecurityError. Playwright's frame-scoped APIs (`frameLocator`, `locator.evaluate`) reach in
// via CDP instead — a separate channel the browser's cross-origin JS restriction does not gate —
// which is why e2e/wizard-preview.spec.ts's `page.frameLocator('.wz-side iframe')` already works
// unaffected by the same sandbox. Use these helpers instead of a raw `contentWindow`/
// `contentDocument` read anywhere a spec needs to reach into the preview.

export function previewFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

/** The new editor's preview document (editorFoundation/Canvas.tsx), for a spec that lands there. */
export function editorPreview(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Foundation graphic preview"]');
}

/** Run `fn` inside the preview document's own window/global scope. */
export function frameEval<T>(page: Page, fn: () => T): Promise<T> {
  return previewFrame(page).locator('body').evaluate(fn);
}

export interface FrameMachineState {
  groups: Record<string, string>;
}

export type SimWin = Window & {
  play?: () => void;
  stop?: () => void;
  next?: () => void;
  update?: (data: string) => void;
  noacgDispatch?: (event: string, payload?: Record<string, string>) => unknown;
  noacgSnap?: (assignments: Record<string, string> | null, opts?: { timers?: boolean }) => unknown;
  noacgMachineState?: () => FrameMachineState;
};

export function framePlay(page: Page): Promise<void> {
  return frameEval(page, () => {
    (window as unknown as SimWin).play?.();
  });
}

export function frameStop(page: Page): Promise<void> {
  return frameEval(page, () => {
    (window as unknown as SimWin).stop?.();
  });
}

export function frameNext(page: Page): Promise<void> {
  return frameEval(page, () => {
    (window as unknown as SimWin).next?.();
  });
}

export function frameDispatch(page: Page, event: string, payload?: Record<string, string>): Promise<void> {
  return previewFrame(page)
    .locator('body')
    .evaluate(
      ({ event, payload }) => {
        (window as unknown as SimWin).noacgDispatch?.(event, payload);
      },
      { event, payload },
    );
}

export function frameSnap(page: Page, assignments: Record<string, string> | null, opts?: { timers?: boolean }): Promise<void> {
  return previewFrame(page)
    .locator('body')
    .evaluate(
      ({ assignments, opts }) => {
        (window as unknown as SimWin).noacgSnap?.(assignments, opts);
      },
      { assignments, opts },
    );
}

export function frameMachineState(page: Page): Promise<Record<string, string>> {
  return frameEval(page, () => (window as unknown as SimWin).noacgMachineState?.().groups ?? {});
}

/** Computed `opacity` of an element inside the preview document. */
export function frameOpacity(page: Page, selector: string): Promise<number> {
  return previewFrame(page)
    .locator(selector)
    .evaluate((el) => Number(getComputedStyle(el).opacity));
}

