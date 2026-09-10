---
kind: agent
date: 2026-09-07
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Its route is a JavaScript console snippet against a dev server, and its question is whether a
developer-facing error message reads like machine output - which the repo's own copy rule answers
and an agent drives.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# A refused animation region now says which line is missing

An agent that hands the studio a hand-written graphic used to be told its ANIMATION region "could
not be converted to keyframe data (no markers, or GSAP the converter cannot read: DOM measurement,
nested timelines, conditionals)" - a list of constructs a correct region does not contain. On
2026-09-06 the identical sentence in the Pro Harness cost a correct timeline four rounds and $0.072,
and the whole defect was two absent `var` lines. Both doors now name the first precondition the
importer could not meet, quoting the form it wants.

**Route, under a minute.** With this checkout's dev server running, open
`http://localhost:<dev port>/bridge` and in the console:

```js
const b = window.noacgBridge;
const { template } = b.scaffold({ type: 'lower-third', design: 'neutral' });
// An authored region in the house grammar, with ONE declaration left out.
const region = `/* == ANIMATION == */
var animSpeed = 1;
var easeOut = 'power2.in';
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.to('.lower-third-box', { opacity: 1, duration: 0.4 / animSpeed });
  return tl;
}
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.lower-third-box', { opacity: 0, duration: 0.3 / animSpeed });
  return tl;
}
/* == END ANIMATION == */`;
b.normalize({ ...template, js: template.js.replace(/\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//, region) }).note;
```

**What to look at.** Does the sentence tell you what to write, in words you could act on without
reading our source? It should name `easeIn` and quote the form (`var easeIn = 'expo.out';`). The
same sentence is what the `noacg` CLI prints and what the AI bench feeds back to a model, so if it
reads like machine output, say so - `animationBreach` in `src/blocks/animationRegion.ts` is the one
place it is written.
