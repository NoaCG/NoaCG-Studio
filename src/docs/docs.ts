// The docs page's section nav: fold each topic's pages under its head, and highlight the
// link for the section on screen. The page is complete without this module (every link
// shows and plain anchors already work), so everything here is progressive and silently
// stands down when it has nothing to do.

const nav = document.querySelector('.doc-nav');
if (nav) {
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.doc-body section[id]')).filter((s) =>
    byId.has(s.id),
  );

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
  const activate = (id: string) => {
    const link = byId.get(id);
    if (!link || link === active) return;
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

  // The section being read is the last one whose top has crossed the upper third of the
  // viewport. A plain scroll listener (rAF-coalesced) over a couple of dozen rect reads is
  // cheap, works for keyboard, anchor and drag scrolling alike, and needs no observer
  // bookkeeping.
  let queued = false;
  const update = () => {
    queued = false;
    const line = window.innerHeight * 0.34;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) current = section;
    }
    if (current) activate(current.id);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
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
