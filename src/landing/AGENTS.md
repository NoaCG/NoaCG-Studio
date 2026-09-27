# src/landing - the public landing page's motion system

The landing is the static `index.html` at `/` (no React); it loads motion.ts as a module script.

**POLICY: the landing never fakes product UI** (editor, Monaco, timeline) - it shows on-air
output and real screenshots only, and roadmap features are tagged planned/coming, never shown as
shipped.

**The page is short on purpose.** A stranger should understand NoaCG in about thirty seconds:
the hero, then NoaCG Playout and NoaCG Bridge, then the three ways to start (coding agent, own
SVG artwork, templates, in that order), then OGraf and free/open source. Every claim about a
playout target is held to the current state in `docs/GOALS.md` outcomes 5 and 6: only a proven
route is marked proven, and an untested target is said to be untested. Add a section only when
it answers something a first-time visitor needs; detail belongs in `/docs`.

**Every product screenshot is GENERATED, never hand-taken** - `node scripts/landing-shots.mjs`
drives the running app and writes `public/landing/shot-*.png` (the wizard's steps, the export
dialog, Home, and the playout dashboard). Re-run it after any change to those surfaces: a stale
PNG cannot fail a build, so the only thing keeping the policy true is that re-taking the picture
costs one command. Its two deliberate liberties are documented in the file - a shot may be CUT
to a stated selector so a full-height app pane does not end in a band of empty panel, and the AI
step's `/api/ai/lite/status` is answered so the shot shows the hosted default rather than a dev
checkout's fallback. The page itself takes the same framing liberty once: the playout shot is
shown through a fixed-ratio frame (`.shot-frame`) that crops the empty panel under it.

- **gsap.ts** - evaluates the vendored UMD via `?raw` (it can't be ESM-imported; its global
  branch throws in strict mode).
- **lang.ts** - the motion language: EASE/DUR tokens + `data-reveal`/`data-reveal-group`
  IntersectionObserver reveals.
- **hero.ts** - the hero entrance timeline, ending on the program monitor. The monitor's three
  on-air frames are real captures cross-faded in CSS, not page-drawn graphics.

Everything gates on `prefers-reduced-motion`; the page stays fully readable with no JS (the
`js-motion` pre-hide class is added pre-paint by an inline script and removed again if the
module fails to boot).
