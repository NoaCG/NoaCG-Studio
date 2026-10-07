// THE SITE'S TOP BAR: one list of links, the same on every public page that carries the landing's
// header (the landing, /docs, /downloads, /whats-new and /roadmap).
//
// Each page holds the marker `<!--site:nav-->` where its <nav> goes, and the generated-pages plugin
// in vite.config.ts replaces it with renderSiteNav(<that page's path>), in the dev server and in the
// build. Before this the five pages each carried a hand-written copy, and the copies drifted: the
// What's new page showed a different set of links from the landing, and a reader lost the links
// they had come in with (owner, 2026-10-07). The only thing that changes between pages is which
// link is marked as the current one.
//
// `section` links point into the landing; on the landing itself they stay same-page anchors.
// `always` links stay on a phone; the others leave the header below the width where the full row
// stops fitting (index.html and src/docs/docs.css carry that cut, 860px).

/** The top bar, left to right, before the Start creating button. */
export const SITE_NAV = [
  { label: 'Create', href: '#start', section: true },
  { label: 'Play or export', href: '#playout', section: true },
  { label: 'OGraf', href: '#ograf', section: true },
  { label: "What's new", href: '/whats-new' },
  { label: 'Docs', href: '/docs', always: true },
  { label: 'Downloads', href: '/downloads' },
];

/** `/whats-new.html`, `/whats-new` and `/whats-new/` all name the What's new page; `/index.html` is `/`. */
export function pagePath(path) {
  const p = String(path ?? '/').split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/+$/, '');
  return p === '' || p === '/index' ? '/' : p;
}

/** The top bar's <nav> for the page at `path`, indented to sit inside the header. */
export function renderSiteNav(path) {
  const here = pagePath(path);
  const links = SITE_NAV.map((link) => {
    const href = link.section && here !== '/' ? `/${link.href}` : link.href;
    const cls = link.always ? '' : ' class="gh"';
    const current = link.href === here ? ' aria-current="page"' : '';
    return `        <a${cls} href="${href}"${current}>${link.label}</a>`;
  });
  return ['<nav>', ...links, '        <a class="btn btn-amber" href="/app#/new">Start creating</a>', '      </nav>'].join('\n');
}
