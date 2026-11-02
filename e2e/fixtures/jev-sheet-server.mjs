// A LOCAL FAKE OF GOOGLE'S SHEET CSV EXPORT (jev-svg-import row 25, AC-14).
//
// One real HTTP server on 127.0.0.1 that answers the two addresses the Sheet reader builds
// (src/control/sheetSource.ts `sheetCsvUrl`): `/spreadsheets/d/<id>/export?format=csv&gid=<n>`
// and the published `/spreadsheets/d/e/<id>/pub?output=csv`. Each tab holds the CSV a test writes
// and a mode that says how the next reads answer, so a test can walk the failures a live Sheet
// meets on air and then put it right again (reconnect):
//
//   ok       200 text/csv with the tab's text (an empty text is a valid empty tab)
//   deny     403, as an unshared Sheet answers a signed-out reader
//   missing  404, as a deleted tab or Sheet does
//   error    500, a refusal Google can give for a moment
//   signin   200 with an HTML sign-in page instead of cells
//   hang     accepts the request and never answers (the reader's timeout cuts it)
//   reset    destroys the connection (offline, or a refused cross-origin redirect)
//
// Malformed rows are the tab's own text: the test writes them with `set`. Nothing here parses or
// judges them. The server answers any origin, as Google's export does, and records every read
// (`hits`), so a test can count reads and see that nothing else was asked for.
//
// Node tests hand the reader a fetch that sends Google's address here (`fetchFor`). Browser specs
// route the page's request here (`routeTo`) and answer the page with what came back, so the page
// and the Node side read the same fake. No credential, no network beyond loopback.

import http from 'node:http';

const GOOGLE = /^https:\/\/docs\.google\.com(\/spreadsheets\/d\/.*)$/;

/** Start the fake. `await server.close()` when done: it also ends every hanging read. */
export async function startSheetServer() {
  /** `${id}#${gid}` -> { csv, mode }. A gid-less read is gid "0", the first tab. */
  const tabs = new Map();
  const hits = [];
  const sockets = new Set();
  const keyOf = (id, gid) => `${id}#${gid ?? '0'}`;
  const tabOf = (id, gid) => {
    const key = keyOf(id, gid);
    if (!tabs.has(key)) tabs.set(key, { csv: null, mode: 'ok' });
    return tabs.get(key);
  };

  const server = http.createServer((req, res) => {
    try {
      answer(req, res);
    } catch (error) {
      // A fixture fault answers 500 and is recorded, rather than killing the test process.
      hits.push({ at: Date.now(), id: null, gid: null, mode: `fault: ${error.message}` });
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  const answer = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = /^\/spreadsheets\/d\/(?:e\/)?([^/]+)\/(export|pub)$/.exec(url.pathname);
    const at = Date.now();
    if (!match) {
      hits.push({ at, id: null, gid: null, mode: 'not-a-sheet' });
      res.writeHead(404, { 'access-control-allow-origin': '*' }).end();
      return;
    }
    const id = decodeURIComponent(match[1]);
    const gid = url.searchParams.get('gid');
    const tab = tabOf(id, gid);
    // A tab nobody wrote is not there.
    const mode = tab.csv === null && tab.mode === 'ok' ? 'missing' : tab.mode;
    hits.push({ at, id, gid, mode });
    const cors = { 'access-control-allow-origin': '*' };
    switch (mode) {
      case 'ok':
        res.writeHead(200, { ...cors, 'content-type': 'text/csv; charset=utf-8' }).end(tab.csv);
        return;
      case 'deny':
        res.writeHead(403, { ...cors, 'content-type': 'text/html' }).end('<html>Forbidden</html>');
        return;
      case 'missing':
        res.writeHead(404, { ...cors, 'content-type': 'text/html' }).end('<html>Not found</html>');
        return;
      case 'error':
        res.writeHead(500, { ...cors, 'content-type': 'text/html' }).end('<html>Error</html>');
        return;
      case 'signin':
        res.writeHead(200, { ...cors, 'content-type': 'text/html' }).end('<!DOCTYPE html><html><body>Sign in - Google Accounts</body></html>');
        return;
      case 'hang':
        return; // never answered; close() ends it
      case 'reset':
        req.socket.destroy();
        return;
      default:
        throw new Error(`jev-sheet-server: unknown mode ${mode}`);
    }
  };
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  /** Google's export address, or a pasted Sheet link's path, as this server's address. */
  const local = (googleUrl) => {
    const m = GOOGLE.exec(String(googleUrl));
    if (!m) throw new Error(`jev-sheet-server: not a Google Sheet address: ${googleUrl}`);
    return origin + m[1];
  };

  return {
    origin,
    hits,
    local,
    /** Write the tab's cells (CSV text, or rows that are quoted as Google quotes them) and answer ok. */
    set(id, content, gid = '0') {
      const tab = tabOf(id, gid);
      tab.csv = typeof content === 'string' ? content : csvOf(content);
      tab.mode = 'ok';
    },
    /** How the tab's next reads answer, until `set` or `mode(.., 'ok')`. */
    mode(id, mode, gid = '0') {
      tabOf(id, gid).mode = mode;
    },
    /** Reads of one tab so far. */
    reads(id, gid = '0') {
      return hits.filter((h) => h.id === id && (h.gid ?? '0') === gid).length;
    },
    /** A `SheetFetch` (and a plain fetch) that reads Google's addresses from this server. */
    fetchFor(realFetch = globalThis.fetch) {
      return (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        return GOOGLE.test(url) ? realFetch(local(url), init) : realFetch(input, init);
      };
    },
    /**
     * A Playwright route handler: the page's read of Google's address is answered with what this
     * server answers. A hanging read stays unanswered until the page gives up on it; a reset is a
     * network error to the page.
     */
    routeTo() {
      return async (route) => {
        let response;
        try {
          response = await route.fetch({ url: local(route.request().url()), timeout: 0 });
        } catch {
          await route.abort('connectionreset').catch(() => {});
          return;
        }
        const headers = { ...response.headers(), 'access-control-allow-origin': '*' };
        await route.fulfill({ status: response.status(), headers, body: await response.body() }).catch(() => {});
      };
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** Rows as Google's CSV export writes them: a cell with a comma, a quote or a line break is quoted. */
export function csvOf(rows) {
  return rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}
