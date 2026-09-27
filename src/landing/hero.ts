// The hero entrance - one choreographed timeline, about 1.5s to settled. Order tells the
// story: brand first, headline (masked line reveals), supporting copy, the CTAs, then the
// program monitor.
// Beats overlap so it reads as one move, not a slideshow.
import { gsap } from './gsap';
import { EASE } from './lang';

export function runHeroEntrance(): void {
  const tl = gsap.timeline({ defaults: { ease: EASE.reveal } });

  tl
    // Brand mark: the three bars draw in like level meters, wordmark follows.
    .fromTo(
      'header .mark i',
      { scaleX: 0, opacity: 0, transformOrigin: '0 50%' },
      { scaleX: 1, opacity: 1, duration: 0.5, stagger: 0.07 },
      0,
    )
    .fromTo('header .wordmark', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 0.1)
    .fromTo(
      'header nav > *',
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.08 },
      0.18,
    )
    // Headline: masked line reveals — the house move (expo/power3, "masked lines").
    .fromTo(
      '.hero .kicker',
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5 },
      0.15,
    )
    .fromTo(
      '.hero .hl-in',
      { yPercent: 112, opacity: 1 },
      { yPercent: 0, duration: 0.85, ease: 'power4.out', stagger: 0.13 },
      0.28,
    )
    .fromTo('.hero .lede', { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 0.58)
    .fromTo(
      '.hero .cta-row > *',
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.07 },
      0.72,
    )
    // The program monitor lands last, like a graphic taking air.
    .fromTo(
      '.pgm',
      { y: 20, scale: 0.97, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.9, ease: EASE.major },
      0.6,
    );
}
