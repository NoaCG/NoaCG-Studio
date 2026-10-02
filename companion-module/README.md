# companion-module-noacg-studio

The [Bitfocus Companion](https://bitfocus.io/companion) module for [NoaCG Studio](https://noacg.studio): run a NoaCG production from a Stream Deck or any Companion surface, with on-air, selection, allowed-action and clip-clock feedback on the keys. Operator help is in [`companion/HELP.md`](companion/HELP.md).

MIT licensed (see [`LICENSE`](LICENSE)). It lives in the NoaCG Studio repository, whose own licence does not apply to this folder, and is copied into Bitfocus's `companion-module-noacg-studio` repository for publishing.

## How it works

The module pairs once with a one-time code from the production page and keeps the resulting panel key in Companion's secret field. Each press goes to the NoaCG cloud (`panel_press`), which relays it to the one operator page that answers the panel; the page runs it through its own verb dispatcher and publishes the feedback state the keys draw from. The module never writes the command log and never reaches NoaCG Bridge or a playout server. The wire protocol is `docs/work-specs/hardware-panel-control/protocol.md` in the NoaCG Studio repository.

| File                                                                      | What                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/protocol.ts`                                                         | the wire protocol's types and readers                                                              |
| `src/relay.ts`                                                            | the `Relay` interface and its Supabase implementation; backend discovery at `<address>/panel.json` |
| `src/panel.ts`                                                            | `PanelClient`: pairing, connection, status, presses (no Companion code)                            |
| `src/view.ts`                                                             | pure feedback logic: on air, selected, allowed, the clip clock                                     |
| `src/actions.ts`, `feedbacks.ts`, `variables.ts`, `presets.ts`, `main.ts` | the Companion glue                                                                                 |
| `src/__tests__/`                                                          | tests against a fake relay and a hand-driven clock                                                 |

## Develop

Node 22 and Yarn 4.

```sh
yarn install
yarn test      # node:test over a fake relay
yarn lint      # Bitfocus's eslint and prettier config
yarn build     # tsc to dist/
yarn package   # the .tgz Companion 4.3 and later import as a developer module
```

This folder is outside the NoaCG app's lint, typecheck and build; its own commands above cover it.
