---
v: 2
source: derived
kind: finding
raised: 2026-09-29
state: unstarted
found: "Production /output is served with frame-ancestors 'self' and X-Frame-Options SAMEORIGIN, which blocks the SPX output embed that iframes it from another origin."
serves: NOW
size: small
touches: vercel.json, src/export/outputEmbed.ts, docs/CLOUD_PLAYOUT.md
needs-owner: none
---

# The SPX output embed cannot frame /output in production

**Filed:** 2026-09-29. **Source:** Phase 6 playout research (`docs/PLAYOUT_ISOLATION_RESEARCH.md`
§16), measured the same day.

## Why

The output embed (`src/export/outputEmbed.ts`, added 2026-08-16) is the file an SPX rundown, a
CasparCG template folder or a local OBS source loads to put a published production on air: its
whole body is an iframe pointed at `https://noacg.studio/output?production=<slug>`.
`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §2 calls it "the door the day wants" for SPX. Since
`a79c37842` (2026-07-24), `vercel.json` sends `Content-Security-Policy: frame-ancestors 'self'` and
`X-Frame-Options: SAMEORIGIN` on `/(.*)`, which includes `/output`, so any browser refuses to show
the production inside the embed and shows its own error page instead: in CasparCG 2.5 that is an
opaque, full-frame grey card on air. It has never failed a test because the Vite dev server sends
neither header.

## What it would take

- A path-scoped rule in `vercel.json` so `/output` may be framed by any origin while every other
  path keeps `frame-ancestors 'self'`. `/output` holds only the render capability and has no
  controls, so framing it gives a clickjacker nothing to click. Check Vercel's header precedence:
  the catch-all may need to exclude `/output` rather than be overridden by a later rule.
- A `node --test` guard that reads `vercel.json` and asserts `/output` is frameable and the other
  paths are not.
- A line in `docs/CLOUD_PLAYOUT.md` where the embed is described.

## Evidence

- `curl -sI "https://noacg.studio/output?production=x"` on 2026-09-29: both headers present.
- The embed-framing run in `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.8 (2026-09-29): the embed that
  `outputEmbedHtml` generates, served from another origin and pointed at production, logged
  "Framing 'https://noacg.studio/' violates the following Content Security Policy directive:
  "frame-ancestors 'self'". The request has been blocked." and its frame ended on
  `chrome-error://chromewebdata/`; the same file pointed at a header-free origin framed the output.
- The same run on a CasparCG 2.5.0 layer, captured from CasparCG's renderer over its debugging
  port: the embed puts Chromium's grey error page on air, opaque over the whole frame. Worse than
  a blank layer.
