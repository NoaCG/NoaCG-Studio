// The bench browser: one headless Chromium per process, and the CONTAINED context the bridge
// page and every screenshot page run in.
//
// The bridge's validator EXECUTES the agent's template (the runtime bench mounts it in an iframe
// it reads directly), so the execution environment is the boundary. The recipe, in order
// (docs/AGENT_CLI.md "Containment"): a fresh, non-persistent context that holds no session and no
// key; a request allowlist - the app origin's GET requests outside /api/, plus whatever the caller
// mounts itself (a package under /__noacg-package/) - and everything else aborted; every
// WebSocket closed; service workers blocked; no downloads, no permissions, no CSP bypass; popups
// closed on arrival; an outer timeout that hard-closes the context when a template spins.
//
// Residual, stated rather than hidden: a template can still burn CPU inside its budget, and GPU
// exhaustion is not bounded here.

// TYPE-ONLY, deliberately. Evaluating `playwright-core` costs 69 MB of RSS (measured 2026-09-02,
// https://github.com/NoaCG/NoaCG-Studio/blob/4e81a1225298f48fd6a80d45d83e3f9f64e26536/docs/backlog/cli-mcp-startup-weight.md), and this module is reached at STARTUP by `mcp.ts` and
// `index.ts` for `closeBrowser` alone. A value import here made every MCP session - including
// every session that never opens a browser - pay for Chromium's driver before serving a request.
// Types are erased at compile time; the module itself is loaded in `launchBrowser`, where it is
// used. Do not "tidy" this back into a static import.
import type { Browser, BrowserContext, LaunchOptions, Page } from 'playwright-core';
import { browserExecutable } from './config.js';

let browser: Browser | null = null;
let launchedWith = '';

/** Launch (once) the Chromium the CLI drives: NOACG_BROWSER, else the system Chrome/Edge, else
 *  a Playwright-installed Chromium. */
export async function launchBrowser(): Promise<Browser> {
  if (browser) return browser;
  // The one place Playwright is genuinely needed, so the one place it is loaded.
  const { chromium } = await import('playwright-core');
  const exe = browserExecutable();
  const attempts: Array<{ label: string; opts: LaunchOptions }> = exe
    ? [{ label: `NOACG_BROWSER (${exe})`, opts: { executablePath: exe } }]
    : [
        { label: 'Google Chrome', opts: { channel: 'chrome' } },
        { label: 'Microsoft Edge', opts: { channel: 'msedge' } },
        { label: 'Chromium (Playwright)', opts: {} },
      ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      browser = await chromium.launch({ headless: true, ...attempt.opts });
      launchedWith = attempt.label;
      return browser;
    } catch (e) {
      errors.push(`${attempt.label}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }
  throw new Error(
    'No Chromium found to run the bench in. Install Google Chrome or Microsoft Edge, run ' +
      '`npx playwright install chromium`, or point NOACG_BROWSER at a Chromium executable.\n' +
      errors.map((m) => `  - ${m}`).join('\n'),
  );
}

/** What `launchBrowser` picked, for `noacg doctor`. */
export function browserLabel(): string {
  return launchedWith;
}

export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = null;
  if (b) await b.close().catch(() => undefined);
}

export interface BenchContext {
  context: BrowserContext;
  /** Open a page the CLI OWNS (not closed as a popup). */
  newPage(): Promise<Page>;
  /** Admit one more URL pattern (a package the CLI mounts itself). */
  allow(pattern: RegExp): void;
  close(): Promise<void>;
}

/**
 * A contained context for `appOrigin`. `extraAllow` patterns are tested against the full URL and
 * admit requests the origin rule would refuse (the CLI's own package mount, for instance).
 */
export async function newBenchContext(b: Browser, appOrigin: string, extraAllow: RegExp[] = []): Promise<BenchContext> {
  const origin = new URL(appOrigin).origin;
  const allowed: RegExp[] = [...extraAllow];
  const context = await b.newContext({
    viewport: { width: 1920, height: 1080 },
    serviceWorkers: 'block',
    acceptDownloads: false,
    permissions: [],
    bypassCSP: false,
    javaScriptEnabled: true,
  });
  await context.route('**/*', (route) => {
    const request = route.request();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return route.abort('blockedbyclient');
    }
    const sameOrigin = url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api/');
    const mounted = allowed.some((re) => re.test(url.href));
    return sameOrigin || mounted ? route.continue() : route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  const own = new Set<Page>();
  context.on('page', (page) => {
    // A popup the template opened - not one of ours. Close it.
    setTimeout(() => {
      if (!own.has(page)) page.close().catch(() => undefined);
    }, 0);
  });
  return {
    context,
    async newPage() {
      const page = await context.newPage();
      own.add(page);
      return page;
    },
    allow(pattern) {
      allowed.push(pattern);
    },
    async close() {
      await context.close().catch(() => undefined);
    },
  };
}

/** Race a promise against a hard deadline; on expiry, run `onExpire` (close the context) and
 *  reject with a readable message naming what was waited for. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, onExpire?: () => Promise<void> | void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      try {
        await onExpire?.();
      } finally {
        reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)} s - the template may be blocking its main thread (a busy wait at load?).`));
      }
    }, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}
