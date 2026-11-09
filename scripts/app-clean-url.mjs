// The dev and preview servers' clean URLs: the same pages Vercel serves through `cleanUrls` and
// the rewrites in vercel.json. vite.config.ts installs it, and a test that serves a built page
// (e2e/configured/join-cold-load.spec.ts) uses it too, so both route exactly alike.
//
// Twelve pages; Terms and Privacy are public pages for the optional hosted service.

const CLEAN_PAGES = ['/app', '/output', '/join', '/terms', '/privacy', '/ograf', '/bridge', '/docs', '/downloads', '/whats-new', '/roadmap'];

// The pages also served under `/<name>/<segment>`: the join page reads its name off the path.
// scripts/e2e-affected.mjs plans the specs that open these routes from the same two lists.
export const PATH_PAGES = ['/join'];
// Short prefixes for a path page: `/j/<name>` is the join page's short link (src/join/joinPath.ts).
export const SHORT_PATHS = { '/j/': '/join' };

/** The file a request is served from, or the URL unchanged. */
export function cleanUrlPath(url) {
  if (!url) return url;
  // A path form keeps its name in the URL the page reads it from, and its query, as Vercel's
  // rewrites do.
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  for (const [prefix, page] of Object.entries(SHORT_PATHS)) {
    if (url.startsWith(prefix)) return `${page}.html${query}`;
  }
  for (const page of PATH_PAGES) {
    if (url.startsWith(page + '/')) return `${page}.html${query}`;
  }
  for (const page of CLEAN_PAGES) {
    if (url === page || url.startsWith(page + '?')) return `${page}.html` + (url.slice(page.length) || '');
  }
  return url;
}

/** @returns {import('vite').Plugin} */
export function appCleanUrl() {
  const prepare = (req, res) => {
    // Preview iframes are deliberately sandboxed without allow-same-origin, so their origin
    // is opaque. Bundled OFL fonts are public static assets and need an explicit CORS response
    // to render there. Keep the allowance scoped to /fonts rather than every app response.
    if (req.url?.startsWith('/fonts/')) res.setHeader('Access-Control-Allow-Origin', '*');
    req.url = cleanUrlPath(req.url);
  };
  return {
    name: 'app-clean-url',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        prepare(req, res);
        next();
      });
    },
  };
}
