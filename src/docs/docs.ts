// The docs page's section nav and its pages: fold each topic's links under its head, and show
// ONE guide at a time. The page is complete without this module (the whole document shows, every
// link shows and plain anchors already work), so everything here is progressive and silently
// stands down when it has nothing to do.

const root = document.documentElement;
const nav = document.querySelector('.doc-nav');
const body = document.querySelector<HTMLElement>('.doc-body');
if (nav && body) {
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));

  // A newcomer's first view is the five topic heads. Each topic with pages under it gets a
  // toggle, and while the nav is sticky beside the text the topic being read opens itself,
  // so the highlighted link is always on screen. Where the nav sits above the text (a
  // phone) it only opens on a tap: growing it there would push the text the reader is on.
  const sticky = window.matchMedia('(min-width: 901px)');
  const topics = Array.from(nav.querySelectorAll<HTMLElement>('.doc-nav-topic'));
  const setOpen = (topic: HTMLElement, open: boolean) => {
    const sub = topic.querySelector<HTMLElement>('.doc-nav-sub');
    const toggle = topic.querySelector<HTMLButtonElement>('.doc-nav-toggle');
    if (!sub || !toggle) return;
    sub.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  for (const topic of topics) {
    const head = topic.querySelector<HTMLAnchorElement>(':scope > a');
    const sub = topic.querySelector<HTMLElement>('.doc-nav-sub');
    if (!head || !sub) continue;
    const row = document.createElement('div');
    row.className = 'doc-nav-head';
    topic.insertBefore(row, head);
    row.appendChild(head);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'doc-nav-toggle';
    toggle.setAttribute('aria-controls', sub.id);
    toggle.setAttribute('aria-label', `Pages under ${head.textContent ?? ''}`);
    toggle.addEventListener('click', () => setOpen(topic, sub.hidden));
    row.appendChild(toggle);
    setOpen(topic, false);
  }

  let active: HTMLAnchorElement | null = null;
  let activeTopic: HTMLElement | null = null;
  const openActiveTopic = () => {
    if (sticky.matches) for (const topic of topics) setOpen(topic, topic === activeTopic);
  };
  const activate = (link: HTMLAnchorElement) => {
    if (link === active) return;
    active?.classList.remove('is-active');
    link.classList.add('is-active');
    active = link;
    const topic = link.closest<HTMLElement>('.doc-nav-topic');
    if (topic === activeTopic) return;
    activeTopic?.classList.remove('is-current');
    topic?.classList.add('is-current');
    activeTopic = topic;
    openActiveTopic();
  };
  sticky.addEventListener('change', openActiveTopic);

  // PAGES. Every section the nav links is a page, in the nav's order, and one shows at a time.
  // The Graphics topic is a section that holds its pages as nested sections, so its own opening
  // text is wrapped here to be a page beside them. The others are hidden with "until-found":
  // the browser's find-in-page still searches them and fires `beforematch` on the one it lands
  // in, and where that is not supported the value behaves as a plain `hidden`.
  const graphics = document.getElementById('graphics');
  const intro = document.createElement('div');
  if (graphics) {
    while (graphics.firstChild && !(graphics.firstChild instanceof HTMLElement && graphics.firstChild.matches('section'))) {
      intro.appendChild(graphics.firstChild);
    }
    graphics.prepend(intro);
  }
  type DocPage = { el: HTMLElement; link: HTMLAnchorElement; title: string };
  const pages: DocPage[] = [];
  for (const link of links) {
    const section = document.getElementById(link.hash.slice(1));
    const el = section === graphics ? intro : section;
    const title = (section?.querySelector('h2, h3')?.textContent ?? link.textContent ?? '').trim();
    if (el) pages.push({ el, link, title });
  }

  const pager = document.createElement('nav');
  pager.className = 'doc-pager';
  pager.setAttribute('aria-label', 'Previous and next page');
  body.appendChild(pager);
  const pagerLink = (page: DocPage | undefined, className: string, label: string) => {
    if (!page) return;
    const a = document.createElement('a');
    a.className = className;
    a.href = page.link.hash;
    const small = document.createElement('small');
    small.textContent = label;
    a.append(small, page.title);
    pager.appendChild(a);
  };

  // Show the page that holds `target`, and land on the target: a heading inside a page, or the
  // page's own top. The first page beside the sticky nav starts from the top of the window, so
  // the page head above it shows.
  // 'none' leaves the scroll alone (first load without a hash, and a find-in-page match, which
  // the browser scrolls to itself).
  const show = (target: HTMLElement | null, scroll: 'land' | 'none') => {
    const at = target === graphics ? intro : target;
    const index = Math.max(0, pages.findIndex((page) => at !== null && page.el.contains(at)));
    const page = pages[index];
    if (!page) return;
    for (const other of pages) {
      if (other === page) other.el.removeAttribute('hidden');
      else other.el.setAttribute('hidden', 'until-found');
    }
    root.classList.toggle('docs-first', index === 0);
    activate(page.link);
    pager.replaceChildren();
    pagerLink(pages[index - 1], 'prev', 'Previous');
    pagerLink(pages[index + 1], 'next', 'Next');
    if (scroll === 'none') return;
    if (at && at !== page.el) at.scrollIntoView({ behavior: 'instant' });
    else if (index === 0 && sticky.matches) window.scrollTo({ top: 0, behavior: 'instant' });
    else page.el.scrollIntoView({ behavior: 'instant' });
  };
  const fromHash = () => {
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      // A malformed escape in the hash names nothing: fall through to the first page.
    }
    return id ? document.getElementById(id) : null;
  };

  if (pages.length > 0) {
    root.classList.add('docs-paged');
    for (const page of pages) {
      page.el.addEventListener('beforematch', () => show(page.el, 'none'));
    }
    window.addEventListener('hashchange', () => show(fromHash(), 'land'));
    // A link to the hash the address already has changes nothing the browser reports, so it is
    // handled here: pressing "Quiz" twice still goes to the top of Quiz.
    document.addEventListener('click', (event) => {
      const a = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      if (a && a.hash === location.hash) show(fromHash(), 'land');
    });
    const first = fromHash();
    show(first, first ? 'land' : 'none');
  }
}
root.classList.add('docs-ready');

// Two screenshots side by side are half the column each, so a click opens one to the full
// column and a second click puts it back.
for (const pair of Array.from(document.querySelectorAll<HTMLElement>('.doc-shots'))) {
  pair.classList.add('is-zoomable');
  pair.addEventListener('click', (event) => {
    if (event.target instanceof HTMLImageElement) event.target.closest('.doc-shot')?.classList.toggle('is-wide');
  });
}

// Copy buttons. Every command block on this page is meant to be one copy-paste, so each
// <pre> gets a button that puts its text on the clipboard. The markup in docs.html stays a
// plain <pre>: the wrapper and the button are built here, so a page with no JavaScript is
// still a complete, readable, selectable document with nothing missing but the shortcut.
const RESET_MS = 1600;

const copyText = async (text: string): Promise<boolean> => {
  // The Clipboard API needs a secure context. The docs are served over HTTPS (and localhost
  // counts), but a saved or file:// copy of this page is neither, so fall back to the old
  // selection trick rather than leaving the button dead.
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // A rejected write is not a reason to give up: fall through to the fallback.
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(field);
  field.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  return ok;
};

for (const pre of Array.from(document.querySelectorAll<HTMLPreElement>('.doc-body pre'))) {
  const shell = document.createElement('div');
  shell.className = 'cmd';
  if (!pre.textContent?.includes('\n')) shell.classList.add('cmd-single-line');
  pre.parentNode?.insertBefore(shell, pre);
  shell.appendChild(pre);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cmd-copy';
  button.textContent = 'Copy';
  // The label carries the result, so a screen reader hears it without a second live region.
  button.setAttribute('aria-live', 'polite');
  shell.appendChild(button);

  let timer = 0;
  button.addEventListener('click', () => {
    void copyText(pre.innerText).then((ok) => {
      window.clearTimeout(timer);
      button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      button.classList.toggle('is-done', ok);
      timer = window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-done');
      }, RESET_MS);
    });
  });
}

export {};
