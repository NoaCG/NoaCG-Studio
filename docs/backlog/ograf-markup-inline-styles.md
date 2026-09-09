---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, altitude AL1 and review B1 - the orchestrator ruled: correct the doc, file the mechanism"
---
# An OGraf graphic's MARKUP can still carry document-global styles

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session, from its own /check.

## Why

`src/export/targets/ograf.ts` re-addresses `template.css` to the graphic's element
(`scopeCssToGraphic`) and refuses the export if a rule would still reach the renderer's
document. `TEMPLATE_HTML` is injected as written. An imported SVG design carries the artwork's
own `<style>` INSIDE the inline `<svg>` (`src/assets/svgImport.ts` keeps the file's block verbatim
and appends one of its own; `src/templates/importedDesign/svg.ts` inlines it), with Illustrator's
shared class names (`.st0`, `.cls-1`). In a renderer's light DOM those rules are document-global:
two imported SVG graphics on two layers, the exact production the current push targets (a quiz
and a scoreboard drawn in Illustrator for 2026-09-12), recolour or hide each other's shapes. The
same last-one-wins shape X-04 was closed for, one carrier over.

## What it would take

1. A fixture that does not exist yet: two imported-SVG graphics with colliding `.st0` rules, each
   built through the real import road (`importedDesign` variants throw on `create({})`, so the
   catalog sweep skips them - the conformance spec needs a created project per design).
2. Run every `<style>` block inside `TEMPLATE_HTML` through `scopeCssToGraphic` at export time
   (`withPackageUrls.html` already walks that markup), and extend the fail-closed gate to those
   sheets. Inline `style=""` attributes are element-local and need nothing.
3. Confirm the SVG import's own runtime does not select by those class names through the real
   `document` (its `document` is the scoped one, so lookups stay inside the element).
4. Alternatively, the document-boundary design row (shadow root or per-graphic iframe) covers both
   carriers without a parser. The argument for it, measured on the row that built the parser and
   recorded here because that row's handoff was drained on 2026-09-09: with `root = this.shadowRoot`
   every `scopedDocument` member works unchanged, the only rewrite left is `html|body|:root` to
   `:host`, and a missed shape degrades to a lost rule INSIDE the graphic rather than a restyled
   renderer. It also closes the inbound leak (host CSS reaching in), which the parser leaves as it
   was. The counter-argument is Chromium ignoring `@font-face` inside a shadow tree (checker X-08);
   the answer is lifting `@font-face` rules into `document.head` once per design id, the way
   `ensureGsap` lifts its script. GSAP, Lottie, `getComputedStyle` and `document.fonts` all work on
   shadow trees.

## Evidence

`docs/OGRAF.md` "Known limits" (the narrowed claim), `e2e/ograf-conformance.spec.ts` (what is
covered: `template.css` only). The /check findings that produced this item were relayed into the
OGraf host-page row's handoff, drained 2026-09-09 and printed by
`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`.
