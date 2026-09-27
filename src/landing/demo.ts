// The hero showcase — a program monitor cycling through the kinds of graphics NoaCG
// makes: lower third (with a live data update mid-hold), markets ticker, title card,
// scoreboard (the score changes on air), countdown. Deliberately NOT a mockup of the
// editor UI — just the on-air output, moving the way the product's presets move:
// Out-curve entrances, In-curve exits ~35% faster, linear only for the ticker travel,
// back.out only for the score pop. Loops forever; fully idle while off screen.
import { gsap, type Timeline } from './gsap';
import { EASE } from './lang';

const PERSONAS: ReadonlyArray<readonly [string, string]> = [
  ['Maya Lindqvist', 'Political Correspondent'],
  ['Jon Okafor', 'Live · Election Night HQ'],
];

export interface ShowcaseHandle {
  start(): void;
}

export function initShowcase(): ShowcaseHandle | null {
  const root = document.querySelector<HTMLElement>('.showcase');
  if (!root) return null;
  const q = (sel: string): HTMLElement | null => root.querySelector<HTMLElement>(sel);

  const pill = q('.show-pill');
  const clock = q('.show-clock');
  const chips = Array.from(root.querySelectorAll<HTMLElement>('.show-chip'));
  const setChip = (i: number | null): void => {
    chips.forEach((chip, n) => chip.classList.toggle('on', n === i));
  };
  const setOnAir = (on: boolean): void => {
    if (!pill) return;
    pill.classList.toggle('on', on);
    pill.textContent = on ? 'ON AIR' : 'READY';
  };

  // ── 1 · Lower third: in, hold, operator pushes new data, out ──
  const l3Seg = (): Timeline | null => {
    const l3 = q('.gfx-l3');
    const bar = q('.gfx-l3-bar');
    const name = q('.gfx-l3-name');
    const role = q('.gfx-l3-role');
    if (!l3 || !bar || !name || !role) return null;
    let persona = 0;
    const seg = gsap.timeline();
    seg
      .call(() => {
        setChip(0);
        persona = 0;
        name.textContent = PERSONAS[0][0];
        role.textContent = PERSONAS[0][1];
      }, undefined, 0)
      .fromTo(l3, { x: -36, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: EASE.reveal }, 0)
      .fromTo(bar, { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.45, ease: EASE.major }, 0.06)
      .fromTo([name, role], { yPercent: 120 }, { yPercent: 0, duration: 0.55, ease: EASE.reveal, stagger: 0.09 }, 0.15)
      .to([name, role], { yPercent: -120, duration: 0.26, ease: EASE.exit, stagger: 0.05 }, 2.0)
      .call(() => {
        persona = 1;
        name.textContent = PERSONAS[persona][0];
        role.textContent = PERSONAS[persona][1];
      }, undefined, 2.34)
      .fromTo([name, role], { yPercent: 120 }, { yPercent: 0, duration: 0.5, ease: EASE.reveal, stagger: 0.08 }, 2.4)
      .to(l3, { x: -28, autoAlpha: 0, duration: 0.4, ease: EASE.exit }, 4.3);
    return seg;
  };

  // ── 2 · Markets ticker: slide up, linear travel (doctrine: 'none'), slide out ──
  const tickerSeg = (): Timeline | null => {
    const ticker = q('.gfx-ticker');
    const track = q('.gfx-ticker-track');
    if (!ticker || !track) return null;
    // Items are authored once; double them so the linear travel never shows a gap.
    track.innerHTML += track.innerHTML;
    const seg = gsap.timeline();
    seg
      .call(() => setChip(1), undefined, 0)
      .fromTo(ticker, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: EASE.reveal }, 0)
      .fromTo(track, { x: 0 }, { x: () => -track.scrollWidth / 2, duration: 4.8, ease: 'none' }, 0.25)
      .to(ticker, { y: 26, autoAlpha: 0, duration: 0.4, ease: EASE.exit }, 4.7);
    return seg;
  };

  // ── 3 · Title card: masked line reveals around a drawn rule ──
  const titleSeg = (): Timeline | null => {
    const card = q('.gfx-title');
    const kicker = q('.gfx-title-kicker');
    const main = q('.gfx-title-main');
    const rule = q('.gfx-title-rule');
    const sub = q('.gfx-title-sub');
    if (!card || !kicker || !main || !rule || !sub) return null;
    const seg = gsap.timeline();
    seg
      .call(() => setChip(2), undefined, 0)
      .fromTo(card, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0)
      .fromTo(kicker, { yPercent: 120 }, { yPercent: 0, duration: 0.5, ease: EASE.reveal }, 0.05)
      .fromTo(main, { yPercent: 115 }, { yPercent: 0, duration: 0.75, ease: 'power4.out' }, 0.18)
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: EASE.major }, 0.4)
      .fromTo(sub, { yPercent: 120 }, { yPercent: 0, duration: 0.5, ease: EASE.reveal }, 0.5)
      .to(card, { y: -18, autoAlpha: 0, duration: 0.45, ease: EASE.exit }, 3.7);
    return seg;
  };

  // ── 4 · Scoreboard bug: drops in, the score changes on air (back.out — a real pop) ──
  const scoreSeg = (): Timeline | null => {
    const bug = q('.gfx-score');
    const scoreA = q('.gfx-score-a');
    const minute = q('.gfx-score-min');
    if (!bug || !scoreA || !minute) return null;
    const seg = gsap.timeline();
    seg
      .call(() => {
        setChip(3);
        scoreA.textContent = '2';
        minute.textContent = "78'";
      }, undefined, 0)
      .fromTo(bug, { y: -26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: EASE.reveal }, 0)
      .to(scoreA, { yPercent: -120, duration: 0.22, ease: EASE.exit }, 1.6)
      .call(() => {
        scoreA.textContent = '3';
        minute.textContent = "79'";
      }, undefined, 1.86)
      .fromTo(scoreA, { yPercent: 120 }, { yPercent: 0, duration: 0.45, ease: EASE.pop }, 1.9)
      .to(bug, { y: -26, autoAlpha: 0, duration: 0.4, ease: EASE.exit }, 3.9);
    return seg;
  };

  // ── 5 · Countdown: ticks real seconds toward air time ──
  const countSeg = (): Timeline | null => {
    const count = q('.gfx-count');
    const label = q('.gfx-count-label');
    const time = q('.gfx-count-time');
    const sub = q('.gfx-count-sub');
    if (!count || !label || !time || !sub) return null;
    const seg = gsap.timeline();
    seg
      .call(() => {
        setChip(4);
        time.textContent = '05:00';
      }, undefined, 0)
      .fromTo(count, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0)
      .fromTo([label, time, sub], { yPercent: 120 }, { yPercent: 0, duration: 0.55, ease: EASE.reveal, stagger: 0.1 }, 0.05);
    for (let s = 1; s <= 3; s++) {
      seg.call(() => {
        time.textContent = `04:${60 - s < 10 ? '0' : ''}${60 - s}`;
      }, undefined, 0.9 + s);
    }
    seg.to(count, { y: -14, autoAlpha: 0, duration: 0.45, ease: EASE.exit }, 4.5);
    return seg;
  };

  const master = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.2 });
  master.call(() => setOnAir(true), undefined, 0);
  for (const seg of [l3Seg(), tickerSeg(), titleSeg(), scoreSeg(), countSeg()]) {
    if (seg) master.add(seg, '+=0.45');
  }
  master.call(() => {
    setChip(null);
    setOnAir(false);
  }, undefined, '+=0.1');

  // Keep the ticker's function-based travel honest across resizes.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => master.invalidate()).observe(root);
  }

  // The monitor clock shows real time-of-day — but only while the panel is on screen.
  const tick = (): void => {
    if (clock) clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  };
  let clockTimer: number | undefined;
  let started = false;
  let onScreen = true;

  const sync = (): void => {
    if (started && onScreen) {
      if (master.paused()) master.play();
      if (clockTimer === undefined) {
        tick();
        clockTimer = window.setInterval(tick, 1000);
      }
    } else {
      if (!master.paused()) master.pause();
      if (clockTimer !== undefined) {
        window.clearInterval(clockTimer);
        clockTimer = undefined;
      }
    }
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
        sync();
      },
      { threshold: 0.1 },
    ).observe(root);
  }

  return {
    start(): void {
      started = true;
      sync();
    },
  };
}
