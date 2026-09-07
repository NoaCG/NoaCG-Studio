# NoaCG Studio

**Free, open source broadcast graphics: built by choosing, then exported to whatever you already run.**

Lower thirds, tickers, scoreboards, countdowns, alerts, credits and more: pick a design, set your
fields, style it to your brand, animate it, and export a working template for **SPX**,
**CasparCG**, **OGraf**, **H2R**, **LiveOS**, or a plain **HTML overlay** for OBS and vMix. Or skip
the export and render finished **MP4 / transparent WebM / ProRes / PNG** media instead.

**No account needed to create, preview, or export.** Free forever, with no paid surface and none
planned, self-hostable in full, AGPL-3.0.

**[noacg.studio](https://noacg.studio)** - the app · **[noacg.studio/docs](https://noacg.studio/docs)** - the guides

![The New Project entry: start from a template, create with AI, import your own graphic, or start blank](docs/images/start.png)

## The 60-second version

Broadcast graphics are usually one of two bad deals: a closed composer that locks your work
inside it, or hand-written HTML that only one person on the team can touch. NoaCG Studio refuses
the trade.

- **You never have to write code.** The wizard walks Browse → Fields → Style → Animation → Finish
  with a live preview at every step, and a non-technical user can make a broadcast-ready graphic
  without opening the editor once.
- **The code is always real and always there.** Every visual and AI action writes clean,
  commented HTML/CSS/JS. Nothing hides behind a proprietary scene model. A professional drops into
  the bundled Monaco editor and takes full control at any point, and the panels keep working on
  what they wrote.
- **Your work leaves with you.** Six export targets plus rendered media, all plug-and-play:
  relative paths, bundled GSAP and fonts, no CDN, no runtime dependencies, no phone-home.

![The template storefront: categories, search, and facets for fields, style and capabilities](docs/images/browse.png)

## What's in it

- **A catalog that covers a whole show, and keeps growing.** Lower thirds, info cards, bugs and
  corner logos, scoreboards, tickers and crawls, timers and clocks, alerts and status, public
  information, credits, holding and break screens, infographics, polls and quizzes, audience
  questions, results and standings, matchups and reveals, esports scores, frames, stingers and
  more. Designs are tuned to read as siblings, so a project's graphics form one coherent package.
- **A faceted storefront.** Search by what you're making ("countdown", "church verse"), rank by
  programme type, then narrow by field count, style family, structure, capability and motion.
- **Create with AI.** Describe what you need, optionally with a logo, brand stills, or an
  existing `.html`/`.zip` to convert. Every result is validated *and exercised in a live runtime
  bench* before it can be applied, with bounded repair rounds. It lands as ordinary editable code.
  Bring your own key, or use the free managed tier where available.
- **Import your own artwork.** Drop in a finished design or an SVG, erase baked-in text, place
  real editable fields on it, pick fonts and animation. No AI involved; you place every piece.
- **A real timeline and node editor.** Keyframes, per-property tracks, easing, multi-step
  reveals, and a state-machine graph for graphics that are more than one linear run.
- **Operator control panels, generated.** Every graphic's fields become an operator UI and every
  state-machine event becomes a button, with illegal actions greyed out. Ships as a self-contained
  `controlpanel.html`, or runs as a hosted page for a whole rundown.
- **Video and animation projects.** A second project kind for stingers, intros and logo reveals,
  generated as React/Remotion or HyperFrames compositions and rendered through the same service.

## For coding agents (Claude Code, Codex, any MCP client)

Ask your coding agent for a graphic "for NoaCG" and it designs one the way it normally designs;
NoaCG supplies the contract, the tools, the validation and the destination. The `noacg` CLI and
MCP server (`cli/`, published to npm as
**[`@noacg/cli`](https://www.npmjs.com/package/@noacg/cli)**) scaffolds a graphic package - one
folder that is a valid **EBU OGraf** Graphic, the **SPX/CasparCG** package and the workspace the
agent edits - validates and benches it against the deployment's own gate, screenshots it, prints
the operator surface NoaCG derives from it, and saves it straight into your NoaCG library with a
scoped agent key (`noacg login`). The `noacg-graphic` skill teaches the contract, not a look.

```bash
npx @noacg/cli scaffold --type scoreboard --design neutral --name "Football scoreboard" --out ./football-scoreboard
```

```bash
npx @noacg/cli validate ./football-scoreboard --screenshots ./shots
```

```bash
npx @noacg/cli save ./football-scoreboard
```

Claude Code installs the skill and the `/noacg:graphic` command; the plugin runs nothing until a
graphic is being made:

```bash
claude plugin marketplace add NoaCG/NoaCG-Studio
```

```bash
claude plugin install noacg@noacg-studio
```

For the `noacg` MCP tool in every session, add the optional `noacg-mcp@noacg-studio` plugin
(`cli/plugin-mcp/README.md`), or `claude mcp add noacg -- npx -y @noacg/cli mcp`. Codex:
`cli/plugin/README.md`. The whole account: [`docs/AGENT_CLI.md`](docs/AGENT_CLI.md) and
[`docs/AGENT_SAVE.md`](docs/AGENT_SAVE.md).

## Run it yourself

```bash
npm install
```

The dev server puts the landing page at `/` and the studio at `/app`:

```bash
npm run dev
```

`npm run build` is the CI gate: typecheck, lint, and a production build into `dist/`.

The dev port is per-checkout; `node scripts/dev-port.mjs` prints it (5174 in a plain clone - see
[`docs/DEV_PORTS.md`](docs/DEV_PORTS.md) for why a git worktree gets its own).

**A clean clone with an empty `.env` is the whole product.** Everything above works offline with
no accounts, no server, and no telemetry. Supabase and the AI routes are strictly optional: with
their environment variables unset the app grows no auth UI, no sync, and reports nothing anywhere.
See [`.env.example`](.env.example) for what turns each optional piece on.

## Documentation

User guides - SVG import, OBS and vMix, CasparCG, the playout dashboard, the agent door - are at
**[noacg.studio/docs](https://noacg.studio/docs)**. The contracts below are for people working on
the code.

| Doc | What it covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The authoritative project contract: architecture, conventions, non-negotiables |
| [`docs/GOALS.md`](docs/GOALS.md) | North star and the open road ahead (shipped work: [`docs/GOALS_ARCHIVE.md`](docs/GOALS_ARCHIVE.md)) |
| [`docs/SPX_TEMPLATE_FORMAT.md`](docs/SPX_TEMPLATE_FORMAT.md) | The SPX template contract |
| [`docs/OGRAF.md`](docs/OGRAF.md) | The EBU OGraf v1 export: manifest, Web Component, limits |
| [`docs/AGENT_CLI.md`](docs/AGENT_CLI.md) | The agent door: `noacg` CLI + MCP server, the `/bridge` page, the graphic package, the plugin |
| [`docs/STATE_MACHINE_SCHEMA.md`](docs/STATE_MACHINE_SCHEMA.md) | What a graphic *is*: states, transitions, the default path |
| [`docs/CONTROL_LAYER.md`](docs/CONTROL_LAYER.md) | Operator panels, rundowns, hosted control |
| [`docs/RENDER.md`](docs/RENDER.md) | The video/image render service |
| [`docs/AI_PROVIDER_GATEWAY.md`](docs/AI_PROVIDER_GATEWAY.md) | Model routing, managed and BYO keys |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers and allowed import edges |
| [`docs/DEV_PORTS.md`](docs/DEV_PORTS.md) | Per-checkout dev ports |

## The SPX field convention

Each data field `fN` maps to **one element `id="fN"`**; `update(data)` (a JSON string) writes the
value straight into it via `getElementById`. No hidden holders, no `_gfx` display split. Full
contract in [`docs/SPX_TEMPLATE_FORMAT.md`](docs/SPX_TEMPLATE_FORMAT.md).

## License

**AGPL-3.0** - see [LICENSE](LICENSE).

Use it, self-host it, modify it, and ship graphics made with it however you like: **your output is
yours**, with no licence obligations attached to the templates you export. The copyleft applies to
*NoaCG Studio itself*: if you offer a modified version of the app as a network service, you must
publish your changes under the same licence. This repository is the complete, self-hostable
product; nothing is held back in a paid edition.

The bundled fonts ship under the SIL Open Font License - `src/assets/OFL.txt` is the single
licence source copied into every export. GSAP and the Lottie player are vendored locally too, so
nothing an export needs is ever fetched from a CDN.

The `cli/` package is **Apache-2.0** rather than AGPL, deliberately: it is a client that talks to
any NoaCG deployment, and a permissive licence is what lets it be installed into anyone's
toolchain. [`docs/AGENT_CLI.md`](docs/AGENT_CLI.md) carries the reasoning.
