// The dev and preview servers' clean URLs: the same pages Vercel serves through `cleanUrls` and
// the rewrites in vercel.json. vite.config.ts installs it, and a test that serves a built page
// (e2e/configured/join-cold-load.spec.ts) uses it too, so both route exactly alike.
//
// Twelve pages; Terms and Privacy are public pages for the optional hosted service.

const CLEAN_PAGES = ['/app', '/output', '/join', '/terms', '/privacy', '/ograf', '/bridge', '/docs', '/downloads', '/whats-new', '/roadmap'];

// `/join/<name>`: the readable join URL. The same shape has to work here, or a vanity link is
// testable only in production. The page reads the name off the path itself.
const PATH_PAGES = ['/join'];

// `/j/<name>`: the short join link a QR code and the Join card carry (src/join/joinPath.ts).
const SHORT_PATHS = { '/j/': '/join.html' };

/** The file a request is served from, or the URL unchanged. */
export function cleanUrlPath(url) {
  if (!url) return url;
  // A path form keeps its query, as Vercel's rewrite does (`/j/<name>?p=<slug>`: the query wins).
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  for (const [prefix, entry] of Object.entries(SHORT_PATHS)) {
    if (url.startsWith(prefix)) return entry + query;
  }
  for (const page of CLEAN_PAGES) {
    if (url === page || url.startsWith(page + '?')) return `${page}.html` + (url.slice(page.length) || '');
    // The path form keeps the name in the URL the page reads it from, so the request is
    // rewritten to the entry WITHOUT the segment rather than to `${page}.html/<name>`.
    if (PATH_PAGES.includes(page) && url.startsWith(page + '/')) return `${page}.html${query}`;
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
