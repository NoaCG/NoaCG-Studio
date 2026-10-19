import type { Page } from '@playwright/test';

export function beginDeepLinkObservation(page: Page) {
  const events: unknown[] = [];
  const stamp = () => Date.now();
  page.on('console', message => {
    if (message.text().startsWith('DEEP_LINK_DOCUMENT_STATE ')) {
      events.push(JSON.parse(message.text().slice('DEEP_LINK_DOCUMENT_STATE '.length)));
    }
  });
  page.on('pageerror', error => events.push({ kind: 'pageerror', at: stamp(), message: error.message }));
  page.on('requestfailed', request => events.push({ kind: 'requestfailed', at: stamp(), method: request.method(),
    path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')) {
      events.push({ kind: 'response', at: stamp(), method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) events.push({ kind: 'navigation', at: stamp(), hash: new URL(frame.url()).hash }); });
  return {
    async observeCurrentDocument() {
      await page.evaluate(async () => {
        const sync = await import('/src/backend/syncController.ts');
        const teams = await import('/src/backend/teamProductions.ts');
        const teamShows = await import('/src/model/teamShows.ts');
        let previous = '';
        const snapshot = () => {
          const s = sync.getSyncState(), t = teams.getTeamState();
          const state = { hash: location.hash, sync: { phase: s.phase, firstPass: s.firstPass,
            hasLast: !!s.last, detail: s.detail ?? null, verifiedAt: s.verifiedAt ?? null },
            teams: { status: teamShows.teamShowsStatus(), loaded: t.loaded, loadError: t.loadError },
            dom: { loading: document.querySelector('[data-testid="production-loading"]')?.textContent ?? null,
              missing: !!document.querySelector('[data-testid="production-missing"]'),
              signIn: !!document.querySelector('[data-testid="production-page"] [data-testid="signin-prompt"]'),
              productionName: document.querySelector('.pd-name')?.textContent ?? null } };
          const serialized = JSON.stringify(state);
          if (serialized !== previous) { previous = serialized; console.log('DEEP_LINK_DOCUMENT_STATE ' + JSON.stringify({ kind: 'state', at: Date.now(), ...state })); }
        };
        const stopSync = sync.onSyncState(snapshot), stopTeams = teams.subscribeTeamState(snapshot);
        const timer = setInterval(snapshot, 200);
        (window as unknown as { __stopDeepLinkObservation: () => void }).__stopDeepLinkObservation = () => {
          snapshot(); stopSync(); stopTeams(); clearInterval(timer);
        };
        snapshot();
      });
    },
    async finish() {
      await page.evaluate(() => (window as unknown as { __stopDeepLinkObservation?: () => void }).__stopDeepLinkObservation?.()).catch(() => undefined);
      return events;
    },
  };
}
