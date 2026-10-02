# The page half on the production page (AC-1, AC-3, AC-4, AC-6, AC-7 in part)

Built on 2026-10-02 in a cloud session, branch `claude/confident-bohr-vjr8eh`, on `origin/main` at
1ee6a2c (after #640 and #641). The page side is the hosted page's (`page-on-hosted-control.md`):
the same `usePanelAnswer`, `PanelButton` and `PanelDialog`, fed by the production page's own state
and running presses through its own `onVerb`.

## What ran

- **Unit: `scripts/panel-feedback.test.mjs`**, 14 tests, 14 pass. New: `rundownPanelRows` sends
  the rundown as drawn, with a folder header as a `folder` row and a collapsed folder's cues listed
  under it, a blank folder name as "Untitled folder", server cues as `source: server`; a `take-cue`
  for a hidden cue is judged a row, not stale.
- **Offline e2e: `e2e/panel-production-page.spec.ts`**, 2 tests, 2 pass (Chromium, this
  container): the Panel door reads Off and sits left of Export and All out; before a publish its
  dialog says "Publish this production once, then pair a panel here." and offers no switch, no
  pairing and no list; at 390 px wide the door stands down and All out stays on screen. Mutation:
  removing the phone rule from `panel.css` fails the phone test.
- **`npm run build`**: green (gates, `tsc`, `tsc -p tsconfig.api.json`, `eslint . --max-warnings 0`,
  dependency rules, `vite build`, prerender, client secret scan).

## What did not run, and why

- **Configured: `e2e/configured/panel-production-page.spec.ts`** (1 test; `minTests` 69 to 70).
  This cloud session has no Supabase token or E2E credentials, so the spec only lists here. It is
  the hosted walk on the production page: pair, answer (`where: production`, `bridge: off`, no
  clip), `select-cue`, a relayed Take, a duplicate id, a stale Take and a stale Out, `take-cue` on
  and off with the cursor left alone, All out refused with nothing up and then run, the hosted
  control page taking the answer over, and the claim let go when it closes. Its first run is CI's
  configured suite or a local session through the job queue.
- **Configured: `e2e/configured/panel-page.spec.ts`**, edited, also not run here: its publish wait
  read the SHOW chip that #640 replaced, and now reads the status control's `data-started`; the
  module's side moved to `e2e/configured/_panel.ts` unchanged except a `rows()` reader.
- **The clip clock from the production page to a panel.** No configured spec puts a server clip up
  (that needs the fake Bridge of `e2e/playout-clock.spec.ts` inside a configured spec). The clock's
  shape rests on `panelClip`'s unit test and the module's clock tests.
- **Latency of a page state change to the module (AC-7, p50 under 100 ms)** on this page: not
  measured; the hosted page's figure is in `page-on-hosted-control.md`.
