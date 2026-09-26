---
v: 1
scope: .agent-workflows/verify.md, docs/acceptance/**
kind: trap
fires: contract
status: active
since: 2026-09-21
record: contracts/records/e2e/2026-09-21-count-requestanimationframe-page-before-reporting-picture.md
---
Count requestAnimationFrame in the page before reporting a picture that will not leave. The desktop browser pane can render no frames at all while it reports visible, so every GSAP exit freezes where it stood until a screenshot or a click forces a frame; an ordinary visible browser and Playwright clear the same Out in about a second.
