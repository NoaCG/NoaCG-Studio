---
v: 1
scope: src/blocks/lottieInsert.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-emits-positioned-commented-css-rule-shared.md
---
`insertLottieElement` emits a positioned `<div id="lottie-*" data-gfx data-lottie="<path>">`, a commented CSS rule, and ONE shared idempotent bootstrap in the JS that decodes an inlined `data:` URL with `atob` rather than fetching it, so `file://` playout works. The bundled player's `<head>` script tag mirrors the GSAP tag and is injected only when the template uses a Lottie asset (`assets/lottieSupport.ts`); the timeline animates the container like any block part.
