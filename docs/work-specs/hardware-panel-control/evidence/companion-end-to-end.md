# The real module in Companion, end to end, and press to air (AC-1, AC-7, AC-8, AC-9, AC-11)

Run on 2026-10-02 on the owner's Windows 10 laptop (busy: other sessions' suites held the browser
budget and free memory was 0.7 to 2 GB), against the temporary preview branch
`tyefsqusudalbwysqbhe` with migration 0073.

## The setup

- **The app**: this branch's code (main after #632), served by `npm run dev:worktree` on
  `localhost:5290` with the branch's URL and publishable key in its environment; `/panel.json` there
  answered `{v: 1, supabaseUrl: <the branch>, supabaseKey}`.
- **Companion 5.0.6**, isolated as research §6.1: a scratch copy of `resources` with the built-in
  Stream Deck and X-keys surface modules removed, its own `--config-dir`, `--admin-port 18010`,
  `--admin-address 127.0.0.1`. The owner's deck and configuration were never touched.
- **The module**: `yarn package` of `companion-module/` at #634 (the merged module plus its
  follow-up), loaded with `--extra-module-path`.

## Pairing and setup, as an operator does it (AC-1, AC-11)

1. On the hosted control page, the header's Panel door opened the dialog and "Pair a panel" showed
   a code (`XXXX-XXXX`, "works once, for 4:55 more").
2. In Companion's NoaCG connection the code went into Pairing code, the name "Desk deck", and the
   NoaCG address `http://localhost:5290` (on noacg.studio the default stays); Save.
3. Within one refresh of the page's list (3 s) the panel appeared as "Desk deck, used just now" and
   the code was spent. Companion's form then showed Pairing code empty and Panel key filled (a
   secret field).
4. "Answer the panel on this page" on: the dialog said "This page answers the panel."
5. Companion's Presets tab offered **17 NoaCG presets**: the 13 fixed ones plus a Take and a Select
   key for each of the rundown's two cues, built from the rows the page published. Dragging
   "Take (SPACE)" onto key 0/1 stored a button whose action is the NoaCG `take` and whose feedbacks
   are on air, allowed, refused, no page and offline (read back from Companion's config).

So the operator's steps are: add the connection, type the code, switch the answer on, drag the
keys. The elapsed time of this run is not reported: the admin UI was driven through a hidden
browser pane that kept losing its layout, which is the research's known difficulty, not the
operator's. Re-pairing to a second production was clearing Panel key and typing a new code.

## Feedback in the keys (AC-7)

Companion's HTTP API read the module's variables while the page answered: `connection` "Answered
by Hosted control page", `production` the production's title, `selected` "Anna", `on_air` empty,
`answering` "Hosted control page", `row_1` "Anna", `row_2` "Ben". After a Companion press:
`on_air` "Anna", `last_press` "Done", and the hosted page's live chip "on air: ● Anna".
Before a page answered, `connection` read "No operator page".

## Press to first frame (AC-8)

`latency.mjs` (session scratchpad), research §6.1's method: a headless Chromium holds the hosted
page (answering the panel) and the output page; a watcher inside the output's graphic frame stamps
the first animation frame in which the graphic's effective opacity (the product of every
ancestor's) rises above 0.05, at `performance.timeOrigin + performance.now()`; a press is
`POST /api/location/1/0/1/press` on Companion, stamped with `Date.now()` just before it, on the same
machine clock. 10 presses each, the graphic taken off and settled between them.

| Run | Graphic | Route | p50 | min | worst |
|---|---|---|---|---|---|
| j-2926 | House Scorebug (`.scoreboard`), as research §6.4 | Companion key, module, relay, hosted page | **168 ms** | 153 ms | 253 ms |
| j-2926 | House Scorebug | keyboard SPACE on the hosted page | 115 ms | 108 ms | 142 ms |
| j-2924 | Hairline lower third (its text "Alexandra") | Companion key, module, relay, hosted page | 429 ms | 419 ms | 538 ms |
| j-2924 | Hairline lower third | keyboard SPACE | 407 ms | 380 ms | 420 ms |

Research §6.4 measured 192 ms through Companion (Generic HTTP and a forwarder) and 133 ms for the
keyboard. The module route is 168 ms at p50, so it is not slower; it carries about 53 ms over the
keyboard in the same run (research: about 59). The lower third's figures are higher for both routes
alike because its entrance fades in; the relay's share there is about 22 ms.

A first run (j-2918) missed every sample: the output's graphic runs in a sandboxed `srcdoc` frame the
page's own script cannot read, so the watcher now runs inside that frame (Playwright's frame
handle). The chain itself had worked (j-2923: press 200, on air Anna).

## Not checked here

A real Stream Deck (the owner's deck stays untouched; Companion's HTTP API runs a key exactly as a
deck does); the production page (its hook-up waits for the playout session's change to land);
hosted production.
