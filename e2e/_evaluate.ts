import { type Page } from '@playwright/test';

// AN EVALUATE CHROME CANNOT LOSE (issue #465, docs/research/context-destroyed-flake.md).
//
// The nightly's "page.evaluate: Execution context was destroyed, most likely because of a
// navigation." was no navigation. Playwright's Chromium `page.evaluate` rewrites EVERY protocol
// error that is not a JavaScript exception or a closed session into those words and throws the
// real error away (`rewriteError`, crExecutionContext.ts). A real navigation reaches a spec as the
// same words WITHOUT the final full stop, because the destroyed-context event arrives first.
//
// The error it hid is `Promise was collected`. The bundled Chromium's V8 holds the promise an
// evaluate awaits only WEAKLY (V8 fixed that upstream on 2026-07-27, commit 5177b108, "hold on to
// promises"). When the promise has settled but the inspector has not yet reported it, a garbage
// collection can take it, and the evaluate fails although its function ran to the end. The
// window opens when the function's last statement queues page work, which is exactly what a
// store mutation (`applyTemplate`, `patchSettings`, `setAdvanced`) does.
//
// This helper sends the evaluate over its own CDP session and keeps the promise reachable from
// the page until the reply has arrived, so the collection cannot happen. Any protocol error
// still reaches the spec with Chrome's own words, and a page exception as the page's own error.
// There is no retry: nothing is left for one to absorb. Arguments and the result travel as JSON,
// like a `page.evaluate` that returns plain data.

let nextId = 0;

export async function evaluateInPage<R>(page: Page, fn: () => R | Promise<R>): Promise<R>;
export async function evaluateInPage<R, A>(page: Page, fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
export async function evaluateInPage<R, A>(page: Page, fn: (arg?: A) => R | Promise<R>, arg?: A): Promise<R> {
  const id = `e${++nextId}`;
  const call = `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;
  // The page-side registry is what holds the promise; the inspector's own reference is weak.
  const expression = `(() => { const p = Promise.resolve(${call}); (globalThis.__e2eEvaluations ??= new Map()).set('${id}', p); return p; })()`;
  const cdp = await page.context().newCDPSession(page);
  try {
    const reply = await cdp
      .send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      .catch((error: Error) => {
        throw new Error(`evaluateInPage: Chrome failed the evaluate: ${error.message}`, { cause: error });
      });
    if (reply.exceptionDetails) {
      const { text, exception } = reply.exceptionDetails;
      throw new Error(`evaluateInPage: the page function threw: ${exception?.description ?? text}`);
    }
    return reply.result.value as R;
  } finally {
    // A page that navigated meanwhile took the registry with it, so a failure here is harmless.
    await cdp.send('Runtime.evaluate', { expression: `globalThis.__e2eEvaluations?.delete('${id}')` }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
}
