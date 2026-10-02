# AC-9 (partial): the module builds, passes its fake-relay tests, and loads in Companion

Run on 2026-10-02 on the owner's Windows 10 laptop, branch `claude/hardware-panel-module`.
This covers the module on its own. Pairing, presses and feedback against a real backend and a
real page wait for the server and page pieces (AC-1 to AC-8).

## Commands, in `companion-module/`

| Command | Result |
|---|---|
| `yarn install` | 75 packages; `@companion-module/base` 2.0.4 (Companion 4.3 and later), tools 3.1.1, `@supabase/supabase-js` 2.117.2 |
| `yarn tsc -p tsconfig.json` | no errors |
| `yarn lint` | no errors (Bitfocus's eslint and prettier config) |
| `yarn test` | 28 tests, 28 pass, 0 fail |
| `yarn package` | `noacg-studio-0.1.0.tgz` with `main.js`, `companion/manifest.json`, `companion/HELP.md`, `LICENSE`, `package.json` |

A mutation check confirmed the tests bite: replacing the press guard
`this.#status !== 'ok' || !this.#state` with a key-only check made
"a newer protocol version asks for a module update" fail; restored, 28 of 28 pass again.

What the tests cover (`src/__tests__/panel.test.ts`, `view.test.ts`), all against `FakeRelay`
and `FakeClock`, never a backend: pairing exchanges a normalised code once and saves the key; used,
expired and unknown codes are refused with a sentence; no page means presses are refused without
being sent; 12 s of silence turns the keys to "No operator page"; beats keep it alive; a press
carries `{verb, target, seen, id}` with the selected row, the row of a per-cue key, or the clock's
cue; stale and not-allowed answers flash the key; no answer in 1.5 s says so and nothing is queued
or retried; a network error retries once with the same id; `no-page` and `revoked` refusals change
the status; `moved` follows the new feedback topic and a revoked key is told so; `gone` is
immediate; an older claim's state is ignored; a newer protocol version asks for an update; a
dropped channel reconnects with backoff; presses made with no page do not run when a page appears;
the clip clock maps the page's clock to this machine's with an hour of skew and turns to warning
at 10 s and final at 5 s; paused and holding clips; on air, selected and allowed; every preset's
actions and feedbacks are real ids, the status feedbacks come last, and every preset is in a
section; the variables.

## Isolated Companion

Research §6.1's method: a scratch copy of Companion 5.0.6's `resources` with every built-in surface
module (Stream Deck, X-keys) removed, run headless with its own `--config-dir`, `--admin-port
18010`, `--admin-address 127.0.0.1` and `--extra-module-path` pointing at the unpacked package.
The owner's deck and configuration were never touched.

- Log: `Found 1 extra modules`, `Connection: noacg-studio: NoaCG: NoaCG Studio (Dev & Packaged)`;
  the two surface modules "could not be loaded, unknown module", as intended.
- Adding a NoaCG connection in the admin UI: `Module-host accepted registration`,
  `Found module entrypoint, with 0 upgrade scripts`, `Module initialized successfully`.
- The connection form shows the pairing text, Pairing code, Panel name, Panel key (a secret field
  with a reveal button) and NoaCG address (`https://noacg.studio`).
- The Presets tab lists "NoaCG, 13 presets" in Show control and Server clip; each key renders the
  `offline` feedback's style with the `connection` variable's text, "Pair in the connection
  settings with the code the production page shows".
- Companion was stopped afterwards; no process from the scratch copy remained.

Not checked here: anything that needs the backend (pairing for real, presses, feedback, the Cues
presets, which appear once a page publishes rows).
