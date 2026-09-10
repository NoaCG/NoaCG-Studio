---
kind: walk
date: 2026-09-10
---
# Flex gaps come back on CasparCG 2.3, and the same file is untouched on 2.5

Row BH saw the house scorebug air on the 2.3 server as `HOME3` where 2.5 airs `HOME 5`. The cause
is flexbox `gap`: Chromium 84 shipped it, and the 2.3 LTS a school downloads today renders on
Chromium 71, which reads the declaration and ignores it. Nothing errors, so the graphic looks like a
design mistake. Measured across the catalog, 286 of 504 designs carry such a gap between painted
items (822 containers), and 283 of them move visibly when it collapses.

The fix is one small script that every export and the output page now carry beside GSAP
(`src/assets/flexGapShim.js`). On an engine without flex gap it puts the gap back as margins; on
any newer engine it exits at its first line. The template's own code is untouched: the CSS a person
reads still says `gap: calc(24px * var(--scale))`, once.

## The route, under a minute

Three designs are exported twice each into `C:\casparcg\templates\bk\` (and the 2.5 install's
`template\bk\`): `<id>.html` as the app exports it today, `<id>-noshim.html` with the script cut
out. Start ONE server (both want port 5250), then:

```
node cli/dist/index.js caspar send PLAY 1-10 giorno
node cli/dist/index.js caspar send CG 1-20 ADD 1 "bk/sb01-noshim" 1     # the before
node cli/dist/index.js caspar send CG 1-20 ADD 1 "bk/sb01" 1            # the after
```

`st01` (League Table, 14 gapped containers) and `h201` (Head to Head, 17) are there too, and `PRINT 1`
drops a frame into the media folder if you would rather compare files. The frames this row printed
are in its handoff. Those two were chosen because gap is the ONLY thing 2.3 lacks for them: on the
before frame the table's rows touch and the stat rows sit on top of each other; on the after frame
both graphics are the design, on the 2.3 server, complete.

## What to look at

**On 2.3** (`casparcg-server-v2.3.3-lts-stable`): the before has `HOME` and its score touching and
the two scores crowding the colon; the after has the designed air between them, the same spacing
2.5 shows. **On 2.5** (`casparcg-server-v2.5.0-stable-windows`): before and after show the same graphic,
because the script's first line is a feature test that Chromium 142 passes and it exits. (A
pixel diff of the two prints finds only the entrance animation's own settle noise inside the
animated rows, taken six seconds after the load; the proof that nothing was written is the
sweep's native side, where no element carries a style the script set.)

**What is still wrong on 2.3, on purpose.** On the 2.3 frames the scorebug has no dark slab and no
score chips: those are painted by `inset: 0` (Chromium 87), which that engine drops outright. That
is a different defect with a different mechanism, and this row measured it rather than fixing it:
after the gap fix, 60 designs render as designed on 2.3, 92 more are fixed by this row alone, and 352
still use `color-mix()`, `backdrop-filter` or `inset`. The handoff carries the decision on those.

## How it was proven

`scripts/flex-gap-sweep.mjs` renders every design twice in a modern Chromium - once native, once
with the shim forced on and the native gap zeroed, which is what CEF 71 lays out - and compares
every painted box. All 504 designs are within 1px of native. Then the three designs above were aired
on both real servers, with and without the script, and the frames printed.
