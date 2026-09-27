// The create-to-air walkthrough — a sticky product VIEWER beside a scrolling list of steps.
//
// The steps are real screenshots of the real app (scripts/landing-shots.mjs), so the section's
// whole job is to keep exactly one of them on screen and swap it at the right moment. That is
// scroll-position work, not a timeline: the reader owns the clock, and a reader who scrolls back
// up must see the section run backwards just as smoothly.
//
// No ScrollTrigger (the page carries only the vendored GSAP core), and no scroll-jacking: the
// viewer is `position: sticky` in CSS and this module only decides which shot is lit. Under
// `prefers-reduced-motion` it is never called at all, and with no JS the section degrades to its
// first shot plus a readable list — every step also carries its own inline picture for narrow
// screens, where nothing is sticky.
import { gsap } from './gsap';
import { DUR, EASE } from './lang';

export function initWalk(): void {
  const walk = document.querySelector<HTMLElement>('.walk');
  if (!walk) return;
  const steps = Array.from(walk.querySelectorAll<HTMLElement>('.walk-step'));
  const shots = Array.from(walk.querySelectorAll<HTMLElement>('.walk-shot'));
  const fill = walk.querySelector<HTMLElement>('.walk-rail-fill');
  if (steps.length === 0 || shots.length !== steps.length) return;

  if (fill) gsap.set(fill, { scaleY: 0, transformOrigin: '50% 0' });
  // The stack starts settled on the first shot (the class the markup ships with), so the swap
  // below always animates FROM a known state rather than from whatever CSS happened to win.
  shots.forEach((shot, i) => {
    gsap.set(shot, { opacity: i === 0 ? 1 : 0, scale: 1 });
    shot.classList.toggle('was-on', i === 0);
  });

  let current = -1;
  const show = (index: number): void => {
    if (index === current) return;
    const previous = current;
    current = index;
    shots.forEach((shot, i) => {
      shot.classList.toggle('is-on', i === index);
      if (i === index) {
        // The incoming shot lands from slightly under-scale: a plain cross-fade between two
        // dark screenshots reads as a flicker, while the settle reads as a monitor cutting.
        gsap.killTweensOf(shot);
        gsap.fromTo(
          shot,
          { opacity: 0, scale: previous === -1 ? 1 : 0.985 },
          { opacity: 1, scale: 1, duration: DUR.reveal, ease: EASE.major, overwrite: 'auto' },
        );
      } else if (shot.classList.contains('was-on')) {
        gsap.to(shot, { opacity: 0, duration: DUR.exit, ease: EASE.exit, overwrite: 'auto' });
      }
      // Only the shot that was actually up needs an exit tween; the other three are already at
      // zero and animating them would fight the incoming one for the same frames.
      shot.classList.toggle('was-on', i === index);
    });
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === index);
      step.classList.toggle('is-passed', i <= index);
    });
  };

  let queued = false;
  const update = (): void => {
    queued = false;
    // The decision line sits above centre: a step becomes current once its heading has
    // comfortably entered the reading zone, not when its last pixel scrolls in.
    const line = window.innerHeight * 0.45;
    const rect = walk.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (line - rect.top) / rect.height));
    if (fill) gsap.set(fill, { scaleY: progress });

    let next = 0;
    steps.forEach((step, i) => {
      if (step.getBoundingClientRect().top <= line) next = i;
    });
    show(next);
  };
  const onScroll = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}
