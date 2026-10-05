import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { trackPageVisit } from './backend/events';
import { hydrateDurableStore } from './model/durableStore';

// Boot stages for app.html's watchdog (its inline script owns the values): 'html' is set
// inline before this module loads, 'js' proves the entry chunk executed, 'mounted' proves
// React rendered. A restricted network that blocks a chunk strands the stage below
// 'mounted', and the watchdog then paints a plain-HTML diagnosis instead of a white screen.
declare global {
  interface Window {
    __noacgBootStage?: 'html' | 'js' | 'mounted';
  }
}
window.__noacgBootStage = 'js';

// /app?diag=1 is the CONNECTION CHECK, rendered entirely by app.html's inline script so it
// works even when every JS chunk is blocked. The app must stand down on that URL - booting
// React would paint the studio over the report.
const diagMode = new URLSearchParams(window.location.search).has('diag');

// One report per page load, before React mounts so a slow first render cannot cost the
// datapoint. Inert without a backend and inert for a visitor who opted out or sends DNT.
if (!diagMode) trackPageVisit();

// The saved documents live in IndexedDB behind a synchronous mirror (model/durableStore.ts).
// Loading that mirror is the one asynchronous step in the boot, and it MUST finish before the
// app is imported: module scope reads the autosaved project as it loads (store/templateStore.ts
// computes the initial template and Reset baseline from it), so importing App first would give
// a returning user a blank studio and then autosave over their work. Hence the dynamic import -
// a static one is hoisted above this await and would run at exactly the wrong moment.
// hydrateDurableStore cannot hang (it degrades to localStorage on a timeout), so the one await
// that can still fail here is the App chunk itself - a blocked or filtered network - and that
// failure must end as a readable screen, never a white page.
async function boot(): Promise<void> {
  await hydrateDurableStore();
  const { startAutoSync } = await import('./backend/syncController');
  startAutoSync();
  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  window.__noacgBootStage = 'mounted';
}

/** Plain-DOM boot failure screen: no React, no classes from blocked stylesheets. */
function renderBootFailure(error: unknown): void {
  const root = document.getElementById('root');
  if (!root) return;
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <div style="max-width:560px;margin:18vh auto 0;padding:0 24px;font:14px/1.6 system-ui,sans-serif;color:#e8eaf0">
      <h1 style="font-size:19px;margin:0 0 10px">NoaCG Studio could not finish loading</h1>
      <p style="margin:0 0 8px;color:#aab0bf">Part of the app failed to load - on a managed or
      filtered network this usually means a proxy blocked one of the app's own files.</p>
      <p style="margin:0 0 18px;color:#aab0bf">Nothing is wrong with your saved work.</p>
      <p style="margin:0 0 18px">
        <button onclick="location.reload()" style="padding:8px 14px;margin-right:12px;cursor:pointer">Try again</button>
        <a href="/app?diag=1" style="color:#f0b429">Run the connection check</a>
      </p>
      <p style="margin:0;font-size:12px;color:#6b7180">${message.replace(/</g, '&lt;')}</p>
    </div>`;
}

if (!diagMode) boot().catch(renderBootFailure);
