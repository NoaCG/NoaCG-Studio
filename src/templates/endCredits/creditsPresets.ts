// End-credits motion presets. Same marked-region + knob contract as every category
// (animSpeed / easeIn / easeOut), but the travel itself is LINEAR (ease: 'none') per the
// easing doctrine — continuous motion never eases. animSpeed scales the travel speed, and
// the OPERATOR scales it again from the control page's speed field (creditsMotion.ts).
//
// The credits structure contract (see shared.ts):
//   .credits (root, opacity:0) → .credits-box (viewport, overflow hidden)
//     → #credits-track (rows injected by rebuildCredits())
// The end of the track is the .credits-end block (logo placeholder + year) — which the roll
// and the crawl deliberately leave OUT of the travel, so the list runs all the way through
// and the mark arrives afterwards as its own beat.
//
// The box's fade is ordinary keyframeable motion and lives here. The TRAVEL is not: a roll
// covers its own content height, a crawl its own width, a page swap runs one segment per
// page — all measured from the operator's text. So the region does not inline that code — it
// calls a named builder from creditsMotion.ts (emitted outside the region) and adds what it
// returns. That keeps the region fully parseable, which is what lets these templates be data
// blocks with a read-only "measured motion" segment on the timeline
// (docs/DYNAMIC_MOTION_SCOPE.md).

import type { AnimPresetId } from '../../model/wizard';
import type { AnimPreset, PresetConfig } from '../lowerThirds/animPresets';

const MARK_OPEN = '/* == ANIMATION (generated — the Animation panel rewrites this block) == */';
const MARK_CLOSE = '/* == END ANIMATION == */';

function knobs(cfg: PresetConfig): string {
  return `var animSpeed = ${cfg.speed};  // 1 = normal · 0.75 = slower · 1.5 = faster (scales travel speed)
var easeIn = '${cfg.easeIn}';   // entrance ease (the fade-in — travel itself stays linear)
var easeOut = '${cfg.easeOut}';   // exit ease (the fade-out)`;
}

/** The exit is the same clean fade for every credits preset — credits never roll back down. */
/** Every ending scene brings in its programme background with the content. */
function backgroundIn(): string {
  return `  tl.fromTo('.credits-background',
    { opacity: 0, scale: 1.01 },                 // begin as a soft, slightly enlarged field
    { opacity: 1, scale: 1, duration: 0.65 / animSpeed, ease: easeIn },
    0                                           // background and content enter together
  );`;
}

/** A slow transform-only drift that remains subtle under long-form reading. */
function backgroundIdle(): string {
  return `  tl.fromTo('.credits-ambient',
    { xPercent: -1.25, yPercent: -0.8 },
    {
      xPercent: 1.25,
      yPercent: 0.8,
      duration: 8.4 / animSpeed,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    },
    0.6                                         // explicit: never queues behind measured travel
  );`;
}

function outTimeline(seconds: number): string {
  return `// buildOutTimeline(): a clean fade — credits don't animate back down.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.credits-box', { opacity: 0, duration: ${seconds} / animSpeed, ease: easeOut });
  tl.to('.credits-background', { opacity: 0, duration: ${seconds} / animSpeed, ease: easeOut }, 0);
  tl.set('.credits', { opacity: 0 });          // fully hidden; ready to play again
  return tl;
}`;
}

export const CREDITS_PRESETS: AnimPreset[] = [
  {
    id: 'credits-roll' as AnimPresetId,
    name: 'Rolling credits',
    description: 'The classic upward roll — the list runs right off the top, then the logo + year arrive.',
    autoEase: { easeIn: 'power2.out', easeOut: 'power2.in' },
    emit: (cfg) => `${MARK_OPEN}
// Preset: Rolling credits — linear upward travel; the list runs all the way off the top,
// and then the logo + year arrive as their own beat (creditsRoll() above).
${knobs(cfg)}

// buildInTimeline(): fade in, then roll the track up at a steady reading speed.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.credits', { opacity: 1 });          // reveal the (CSS-hidden) graphic
${backgroundIn()}
  tl.fromTo('.credits-box', { opacity: 0 }, { opacity: 1, duration: 0.6 / animSpeed, ease: easeIn }, 0);
  // The roll's distance is MEASURED from the rendered rows — see creditsRoll() above.
  tl.add(creditsRoll('#credits-track'), 0.55);
${backgroundIdle()}
  return tl;
}

${outTimeline(0.5)}
${MARK_CLOSE}`,
  },

  {
    id: 'credits-loop' as AnimPresetId,
    name: 'Repeating reel',
    description: 'The roll, looping seamlessly — production credits or a sponsor wall that plays all event.',
    autoEase: { easeIn: 'power2.out', easeOut: 'power2.in' },
    emit: (cfg) => `${MARK_OPEN}
// Preset: Repeating reel — the same linear travel as the roll, but the list is cloned so
// it comes back around with no seam and no jump. It runs until stop(), which is what a
// hold-screen credit reel or a sponsor wall wants.
${knobs(cfg)}

// buildInTimeline(): fade in, then loop the track forever.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.credits', { opacity: 1 });          // reveal the (CSS-hidden) graphic
${backgroundIn()}
  tl.fromTo('.credits-box', { opacity: 0 }, { opacity: 1, duration: 0.6 / animSpeed, ease: easeIn }, 0);
  // The loop's distance is MEASURED from the rendered rows — see creditsLoop() above.
  tl.add(creditsLoop('#credits-track'), 0.55);
${backgroundIdle()}
  return tl;
}

${outTimeline(0.5)}
${MARK_CLOSE}`,
  },

  {
    id: 'credits-pages' as AnimPresetId,
    name: 'One-pager swap',
    description: 'Each section appears as a full page, holds long enough to read, then swaps to the next.',
    autoEase: { easeIn: 'power2.out', easeOut: 'power2.in' },
    emit: (cfg) => `${MARK_OPEN}
// Preset: One-pager swap — sections fade in as pages, hold, and swap; the last page
// (logo + year) stays up until stop().
${knobs(cfg)}

// buildInTimeline(): sequence every page in the track.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.credits', { opacity: 1 });          // reveal the (CSS-hidden) graphic
${backgroundIn()}
  tl.set('.credits-box', { opacity: 1 });      // undo a previous stop()'s box fade — replays start visible
  // One segment PER PAGE, each holding as long as its own row count needs. See creditsPages().
  tl.add(creditsPages('#credits-track'), 0.35);
${backgroundIdle()}
  return tl;
}

${outTimeline(0.5)}
${MARK_CLOSE}`,
  },

  {
    id: 'credits-board' as AnimPresetId,
    name: 'Static board',
    description: 'No travel at all — the whole list fades up and holds, for a schedule, a wall or a sponsor board.',
    autoEase: { easeIn: 'power2.out', easeOut: 'power2.in' },
    emit: (cfg) => `${MARK_OPEN}
// Preset: Static board — the list is not a sequence, it is a BOARD. Everything is on screen
// at once and stays there until stop(). Rolling a six-line schedule past the audience would
// mean the line they need is the one that just left; a board is always readable.
//
// This is the one credits format with no measured motion: nothing travels, so nothing has to
// be measured, and the entrance is ordinary keyframeable choreography.
${knobs(cfg)}

// buildInTimeline(): raise the board into place and leave it there.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.credits', { opacity: 1 });          // reveal the (CSS-hidden) graphic
${backgroundIn()}
  tl.fromTo('.credits-box',
    { opacity: 0, y: 18 },                     // start slightly low and invisible
    { opacity: 1, y: 0, duration: 0.7 / animSpeed, ease: easeIn },
    0                                           // background and board enter together
  );
${backgroundIdle()}
  return tl;
}

${outTimeline(0.5)}
${MARK_CLOSE}`,
  },

  {
    id: 'credits-crawl' as AnimPresetId,
    name: 'Horizontal crawl',
    description: 'A single-line crawl across the frame — linear, ticker-style; it runs right off the edge.',
    autoEase: { easeIn: 'power2.out', easeOut: 'power2.in' },
    emit: (cfg) => `${MARK_OPEN}
// Preset: Horizontal crawl — the track travels across the frame at constant speed until the
// last item has left it, and then the logo + year block arrives on its own.
${knobs(cfg)}

// buildInTimeline(): fade in the strip, then crawl the track from right to left.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.credits', { opacity: 1 });          // reveal the (CSS-hidden) graphic
${backgroundIn()}
  tl.fromTo('.credits-box', { opacity: 0 }, { opacity: 1, duration: 0.4 / animSpeed, ease: easeIn }, 0);
  // The crawl's distance is MEASURED from the rendered track — see creditsCrawl() above.
  tl.add(creditsCrawl('#credits-track'), 0.35);
${backgroundIdle()}
  return tl;
}

${outTimeline(0.4)}
${MARK_CLOSE}`,
  },
];

export function creditsPresetById(id: AnimPresetId): AnimPreset {
  const p = CREDITS_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown credits preset: ${id}`);
  return p;
}
