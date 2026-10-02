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
- **Configured, on a local Supabase stack** (2026-10-02, the owner's Windows laptop, after merging
  `origin/main` at f5cae71). Never production: `supabase start` with every migration in the tree,
  0001 to 0073, and the throwaway accounts CI uses (`e2e@noacg.local`), created through the local
  admin API. Job j-2961, `npx playwright test --config=playwright.live.config.ts
  panel-production-page.spec.ts panel-page.spec.ts panel-relay.spec.ts`: 9 of 9 passed, none on a
  retry.
  - `panel-production-page.spec.ts`, 1 of 1: pair, answer (`where: production`, `bridge: off`, no
    clip), `select-cue`, a relayed Take (press call to the page's result in 14 ms), a duplicate id,
    a stale Take and a stale Out, `take-cue` on and off with the cursor left on Anna, All out
    refused with nothing up and then run, the hosted control page taking the answer over, and the
    claim let go when it closes.
  - `panel-page.spec.ts`, 1 of 1, with its publish wait on the status control's `data-started`:
    the relayed Take on the hosted page took 13 ms. This is the spec that kept the configured
    suite red on `main` (issue #636), still waiting for the SHOW chip #640 removed.
  - `panel-relay.spec.ts`, 7 of 7.
- **The merge with `main`** removed `feedNote` with Combined controls, which the production page's
  panel answer used to write a refused press to the activity feed; `npm run build` caught it
  (`TS2304`), and the note is now written in place. The stale-press step above reads that line
  back ("Spec deck: Take refused, what Take does changed").
- **Screenshots**: the Panel door changed the production header, so the six
  `e2e/playout-baseline.spec.ts` pictures were re-recorded on both platforms (Linux by
  `rerecord-screenshots.yml` run 37029696001, Windows by job j-2960). Each was compared with the
  picture it replaced: the only change is the Panel door left of Export (at 1366 px "Panel ○"
  without the word Off, beside Export's icon), plus single-level antialiasing noise.

## What did not run, and why

- **The clip clock from the production page to a panel.** No configured spec puts a server clip up
  (that needs the fake Bridge of `e2e/playout-clock.spec.ts` inside a configured spec). The clock's
  shape rests on `panelClip`'s unit test and the module's clock tests.
- **Latency of a page state change to the module (AC-7, p50 under 100 ms)** on this page: not
  measured; the hosted page's figure is in `page-on-hosted-control.md`.
