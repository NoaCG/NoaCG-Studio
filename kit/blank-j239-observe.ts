import { test as base, type Page } from 'playwright/test';
import { createWriteStream, writeFileSync } from 'node:fs';
import path from 'node:path';
export * from 'playwright/test';
export const test = base.extend<{ passiveDiagnostic: void }>({
  passiveDiagnostic: [async ({ page, context, browser }, use, info) => {
    const stem = path.resolve('e5f.local/built-api-protocol', `sample-${info.repeatEachIndex}-worker-${info.workerIndex}`);
    const out = createWriteStream(`${stem}.jsonl`, { flags: 'wx' });
    let phase = 'test', count = 0, incomplete: string | null = null;
    out.on('error', error => { incomplete = `observer IO: ${error.message}`; });
    const ids = new WeakMap<object, number>(); let nextId = 0;
    const id = (value: object) => { if (!ids.has(value)) ids.set(value, ++nextId); return ids.get(value); };
    const url = (value: string) => { try { const u = new URL(value); u.search = u.searchParams.get('editor') === 'foundation' ? '?editor=foundation' : ''; return u.href; } catch { return value.slice(0, 500); } };
    const log = (kind: string, data: object = {}) => {
      try {
        if (++count > 5000) { incomplete = 'observer overflow'; return; }
        out.write(JSON.stringify({ at: new Date().toISOString(), phase, kind, ...data }) + '\n');
      } catch (error) { incomplete = `observer logging: ${String(error)}`; }
    };
    const cleanups: (() => void)[] = [];
    const listen = (emitter: any, event: string, handler: (...args: any[]) => void) => {
      const safe = (...args: any[]) => { try { handler(...args); } catch (error) { incomplete = `observer ${event}: ${String(error)}`; } };
      emitter.on(event, safe); cleanups.push(() => emitter.off(event, safe));
    };
    const observe = (p: Page) => {
      log('page', { pageId: id(p), url: url(p.url()) });
      for (const event of ['frameattached', 'framedetached', 'framenavigated']) listen(p, event, f => log(event, { pageId: id(p), frameId: id(f), parentId: f.parentFrame() ? id(f.parentFrame()) : null, main: f === p.mainFrame(), url: url(f.url()) }));
      listen(p, 'crash', () => log('crash', { pageId: id(p) }));
      listen(p, 'close', () => log('close', { pageId: id(p) }));
      listen(p, 'pageerror', error => log('pageerror', { pageId: id(p), message: error.message, stack: error.stack }));
      listen(p, 'console', msg => { const text = msg.text(); if (['error', 'warning'].includes(msg.type()) || text.startsWith('__E5F_PASSIVE__')) log('console', { pageId: id(p), type: msg.type(), text: text.slice(0, 2000), location: { ...msg.location(), url: url(msg.location().url) } }); });
      listen(p, 'requestfailed', req => log('requestfailed', { pageId: id(p), url: url(req.url()), resourceType: req.resourceType(), navigation: req.isNavigationRequest(), failure: req.failure() }));
    };
    observe(page); listen(context, 'page', observe);
    listen(browser, 'disconnected', () => log('browser-disconnected'));
    log('begin', { title: info.title, repeat: info.repeatEachIndex, worker: info.workerIndex, browserVersion: browser.version() });
    await context.addInitScript(() => {
      const documentId = crypto.randomUUID();
      const emit = (kind: string, event?: any) => {
        try { const payload = event?.payload ?? event?.error; console.debug('__E5F_PASSIVE__' + JSON.stringify({ kind, documentId, at: Date.now(), url: location.origin + location.pathname + location.hash, main: window === window.top, persisted: event?.persisted, message: payload?.message ?? event?.message, stack: payload?.stack })); } catch { /* Logging never changes browser event semantics. */ }
      };
      emit('document');
      for (const kind of ['beforeunload', 'pagehide', 'pageshow', 'hashchange', 'popstate', 'error', 'unhandledrejection', 'vite:preloadError']) addEventListener(kind, event => emit(kind, event));
    });
    try { await use(); }
    finally {
      phase = 'teardown'; log('fixture-teardown', { status: info.status });
      for (const cleanup of cleanups) cleanup();
      await new Promise<void>(resolve => { out.end(resolve); if (out.errored) resolve(); });
      writeFileSync(`${stem}.json`, JSON.stringify({ complete: !incomplete, incomplete, records: Math.min(count, 5000), repeat: info.repeatEachIndex, worker: info.workerIndex, status: info.status, originalRetries: info.retry, testId: info.testId }, null, 2) + '\n');
      if (incomplete) console.error(`E5F_DIAGNOSTIC_INCOMPLETE: ${incomplete}`);
    }
  }, { auto: true }],
});
