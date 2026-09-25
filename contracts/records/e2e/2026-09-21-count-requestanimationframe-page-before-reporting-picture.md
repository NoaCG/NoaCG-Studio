# e2e/count-requestanimationframe-page-before-reporting-picture

Rule: `e2e/count-requestanimationframe-page-before-reporting-picture`. Recorded 2026-09-21 on `claude/o-out-clears-program` at ed4af16c.

Row E reported Out leaving the imported quiz and scoreboard painted in the production dashboard PROGRAM monitor four times on noacg.studio. Row O reproduced it on ed4af16c in the browser pane on E's own production: the header read nothing on air and the picture was still there after 10 s. The pane measured 0 rAF callbacks in 3 s with document.visibilityState visible, and five to ten back-to-back screenshots then cleared the monitor. The same walk in Playwright against the live site with the docs quiz.svg and scoreboard.svg (each alone, both with one Out while the other stays, and All out) reached opacity 0 and machine state off within 1.1 s every time, at about 64 rAF per second.

2026-09-26: re-measured in the desktop browser pane (Claude desktop, engine 2.1.280/281) with the pane hidden: a background tab on example.com ran 4 requestAnimationFrame callbacks in 1.5 s while reporting `visibilityState: visible`. The trap still holds.
