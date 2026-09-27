// NoaCG landing motion — entry point.
//
// The page must be fully readable with no JS at all: the `js-motion` class that pre-hides
// the hero is only added by the inline pre-paint script in index.html (never for
// prefers-reduced-motion visitors), and that script removes it again if this module fails
// to boot. Here we only ever ADD motion on top of a working page.
import { gsap } from './gsap';
import { initReveals } from './lang';
import { runHeroEntrance } from './hero';
import { initShowcase } from './demo';
import { initWalk } from './walk';

declare global {
  interface Window {
    /** Set once the motion module booted — read by index.html's fallback timer. */
    __noacgMotion?: boolean;
  }
}

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reduce.matches && typeof gsap !== 'undefined') {
  window.__noacgMotion = true;

  const showcase = initShowcase();
  runHeroEntrance(() => showcase?.start());
  initReveals();
  initWalk();

  // If the user switches reduced-motion on mid-visit, stop everything and settle the
  // page: kill all tweens, drop the inline styles GSAP wrote, un-gate the hero.
  reduce.addEventListener('change', (e) => {
    if (!e.matches) return;
    gsap.globalTimeline.clear();
    gsap.set(
      'header *, .hero *, .platforms > *, .showcase, .showcase *, [data-reveal], [data-reveal-group] > *, .walk-rail-fill, .walk-shot',
      { clearProps: 'all' },
    );
    document.documentElement.classList.remove('js-motion');
  });
} else {
  // Reduced motion (or the UMD failed to register): present the settled page.
  document.documentElement.classList.remove('js-motion');
}
