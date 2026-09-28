# src/landing - the public landing page's motion system

The landing is the static `index.html` at `/` (no React); it loads motion.ts as a module script.

**POLICY: the landing never fakes product UI** (editor, Monaco, timeline) - it shows on-air
output and real screenshots only, and roadmap features are tagged planned/coming, never shown as
shipped.

**The page is short on purpose, and it reads in the product's order: create, then play.** A
stranger should understand NoaCG in about thirty seconds: the hero, then step 1, the three ways
to create (a template, your own SVGs, your AI coding agent - the wizard's card order), then step 2, the three ways to use them (NoaCG Playout with NoaCG Bridge to
CasparCG, OBS and browser sources, export packages), then OGraf and free/open source. The
wizard's intro (`EntryStep.tsx`) is the owner's wording of the same story; borrow from it rather
than writing a second version. Every claim about a playout target is held to the current state
in `docs/GOALS.md` outcomes 5 and 6: no route wears a badge, and an untested target is said to be
untested. Add a section only when it answers something a first-time visitor needs; detail belongs
in `/docs`.

**Every product screenshot is GENERATED, never hand-taken** - `node scripts/landing-shots.mjs`
drives the running app and writes `public/landing/shot-*.png` (the template library, the SVG
import's text step, and the playout dashboard). Re-run it after any change to those surfaces: a
stale PNG cannot fail a build, so the only thing keeping the policy true is that re-taking the
picture costs one command. It makes only the shots the page shows: one the page stops using
leaves the script and `public/landing/` in the same change. The on-air frames (`shot-strap`,
`shot-markets`, `shot-title`) are captures of graphics on air, not generated. The page takes one
framing liberty: the playout shot is shown through a fixed-ratio frame (`.shot-frame`) that crops
the empty panel under it.

- **gsap.ts** - evaluates the vendored UMD via `?raw` (it can't be ESM-imported; its global
  branch throws in strict mode).
- **lang.ts** - the motion language: EASE/DUR tokens + `data-reveal`/`data-reveal-group`
  IntersectionObserver reveals.
- **hero.ts** - the hero entrance timeline, ending on the program monitor. The monitor's three
  on-air frames are real captures cross-faded in CSS, not page-drawn graphics.

Everything gates on `prefers-reduced-motion`; the page stays fully readable with no JS (the
`js-motion` pre-hide class is added pre-paint by an inline script and removed again if the
module fails to boot).
