// THE SITE'S CHROME: one top bar and one footer, the same on every public page (the landing,
// /ograf, /privacy, /terms, /docs, /downloads, /whats-new and /roadmap).
//
// Each page holds the markers `<!--site:header-->` and `<!--site:footer-->`, and the
// generated-pages plugin in vite.config.ts replaces them with renderSiteChrome(<page>, <path>), in
// the dev server and in the build. Their look is src/site-chrome.css, which every one of those
// pages links. Before this each page carried a hand-written copy of both, and the copies drifted:
// the What's new page showed a different set of links from the landing, a reader lost the links
// they had come in with (owner, 2026-10-07), and the eight footers listed eight different sets.
// The only thing that changes between pages is which link is marked as the current one, and the
// page's name beside "NoaCG Studio" in the footer.
//
// `section` links point into the landing; on the landing itself they stay same-page anchors.
// `always` links stay on a phone; the others leave the header below the width where the full row
// stops fitting (src/site-chrome.css carries that cut, 860px).

/** The top bar, left to right, before the Start creating button. */
export const SITE_NAV = [
  { label: 'Create', href: '#start', section: true },
  { label: 'Play or export', href: '#playout', section: true },
  { label: 'OGraf', href: '#ograf', section: true },
  { label: "What's new", href: '/whats-new' },
  { label: 'Docs', href: '/docs', always: true },
  { label: 'Downloads', href: '/downloads' },
];

/** The footer's links, left to right (the landing's footer, which carried the fullest set). */
export const SITE_FOOTER = [
  { label: 'contact.noacg@gmail.com', href: 'mailto:contact.noacg@gmail.com' },
  { label: 'Docs', href: '/docs' },
  { label: 'Downloads', href: '/downloads' },
  { label: "What's new", href: '/whats-new' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Source', href: 'https://github.com/NoaCG/NoaCG-Studio', external: true },
];

/** Every public page: its source file, and its name beside "NoaCG Studio" at the start of the
 *  footer (the landing says what NoaCG is). A page with the chrome markers must be listed here. */
export const SITE_PAGES = {
  '/': { file: 'index.html', name: 'Broadcast graphics and playout' },
  '/ograf': { file: 'ograf.html', name: 'OGraf starters' },
  '/privacy': { file: 'privacy.html', name: 'Privacy' },
  '/terms': { file: 'terms.html', name: 'Terms' },
  '/docs': { file: 'docs.html', name: 'Documentation' },
  '/downloads': { file: 'downloads.html', name: 'Downloads' },
  '/whats-new': { file: 'whats-new.html', name: "What's new" },
  '/roadmap': { file: 'roadmap.html', name: 'Roadmap' },
};

export const SITE_HEADER_MARKER = '<!--site:header-->';
export const SITE_FOOTER_MARKER = '<!--site:footer-->';

/** `/whats-new.html`, `/whats-new` and `/whats-new/` all name the What's new page; `/index.html` is `/`. */
export function pagePath(path) {
  const p = String(path ?? '/').split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/+$/, '');
  return p === '' || p === '/index' ? '/' : p;
}

const current = (href, here) => (href === here ? ' aria-current="page"' : '');

/** The top bar's <nav> for the page at `path`, indented to sit inside the header. */
export function renderSiteNav(path) {
  const here = pagePath(path);
  const links = SITE_NAV.map((link) => {
    const href = link.section && here !== '/' ? `/${link.href}` : link.href;
    const cls = link.always ? '' : ' class="gh"';
    return `        <a${cls} href="${href}"${current(link.href, here)}>${link.label}</a>`;
  });
  return ['<nav>', ...links, '        <a class="btn btn-amber" href="/app#/new">Start creating</a>', '      </nav>'].join('\n');
}

/** The whole top bar: the mark, the wordmark home and the nav. */
export function renderSiteHeader(path) {
  return [
    '<header class="top">',
    '      <div class="mark" aria-hidden="true"><i></i><i></i><i></i></div>',
    '      <a href="/" class="wordmark">Noa<span>CG</span><small>Studio</small></a>',
    `      ${renderSiteNav(path)}`,
    '    </header>',
  ].join('\n');
}

/** The footer for the page at `path`. */
export function renderSiteFooter(path) {
  const here = pagePath(path);
  const page = SITE_PAGES[here];
  if (!page) throw new Error(`site-nav: ${path} carries the site footer but is not in SITE_PAGES`);
  const links = SITE_FOOTER.map((link) => {
    const ext = link.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `        <a href="${link.href}"${current(link.href, here)}${ext}>${link.label}</a> &middot;`;
  });
  return [
    '<footer class="site">',
    `      <span class="fm">NoaCG Studio &middot; ${page.name}</span>`,
    '      <span>',
    ...links,
    '        Free, AGPL-3.0',
    '      </span>',
    '    </footer>',
  ].join('\n');
}

/** A page's source with its header and footer markers replaced. */
export function renderSiteChrome(html, path) {
  return html
    .replace(SITE_HEADER_MARKER, () => renderSiteHeader(path))
    .replace(SITE_FOOTER_MARKER, () => renderSiteFooter(path));
}
