# src/landing - the public landing page's motion system

The landing is the static `index.html` at `/` (no React); it loads motion.ts as a module script.

**POLICY: the landing never fakes product UI** (editor, Monaco, timeline) - it shows on-air
output and real screenshots only, and roadmap features are tagged planned/coming, never shown as
shipped.

**Every product screenshot is GENERATED, never hand-taken** - `node scripts/landing-shots.mjs`
drives the running app and writes `public/landing/shot-*.png` (the wizard's entry / browse /
style / AI / video / import steps, the export dialog, Home, and the playout dashboard). Re-run it
after any change to those surfaces: a stale PNG cannot fail a build, so the only thing keeping the
policy true is that re-taking the picture costs one command. Its two deliberate liberties are
documented in the file - a shot may be CUT to a stated selector so a full-height app pane does not
end in a band of empty panel, and the AI step's `/api/ai/lite/status` is answered so the shot shows
the hosted default rather than a dev checkout's fallback.

- **gsap.ts** - evaluates the vendored UMD via `?raw` (it can't be ESM-imported; its global
  branch throws in strict mode).
- **lang.ts** - the motion language: EASE/DUR tokens + `data-reveal`/`data-reveal-group`
  IntersectionObserver reveals.
- **hero.ts** - the hero entrance timeline.
- **demo.ts** - the hero showcase: a program monitor looping five example GRAPHICS (lower third,
  ticker, title card, scorebug, countdown) - deliberately NOT an editor mockup; paused offscreen.
- **walk.ts** - the create-to-air walkthrough: a `position: sticky` viewer (CSS) beside the step
  list, with this module deciding which screenshot is lit off scroll position - scroll-scrubbed
  rail fill + step nodes, no ScrollTrigger and no scroll-jacking. Under 900px the viewer stands
  down and each step shows its own inline picture, so nothing is sticky on a phone.

Everything gates on `prefers-reduced-motion`; the page stays fully readable with no JS (the
`js-motion` pre-hide class is added pre-paint by an inline script and removed again if the
module fails to boot).
