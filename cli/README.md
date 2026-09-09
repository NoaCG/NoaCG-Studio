# @noacg/cli

**The NoaCG CLI** - the agent door into [NoaCG Studio](https://noacg.studio). Make broadcast
graphics for NoaCG from a coding agent, or from your own terminal: scaffold, validate, inspect,
screenshot, package, save - against any NoaCG deployment. The full account is the repo's
`docs/AGENT_CLI.md`.

**The package is `@noacg/cli`; the command it installs is `noacg`.** So `npm i -g @noacg/cli`
gives you `noacg validate …`, and every command below is spelled the way you will type it.

**One tool, three entrances.** The MCP server is not a second thing to choose between. `noacg mcp`
runs this same package as an MCP server, and the Claude Code / Codex plugin carries the
`noacg-graphic` skill, which drives this same package from the terminal. Pick the entrance your
agent uses -

| Entrance | For | Install |
|---|---|---|
| **the plugin** | Claude Code, Codex | two commands, below - it brings the skill and a command, and runs nothing until a graphic is being made; the optional `noacg-mcp` plugin adds the always-on MCP server |
| **the MCP server** | any MCP client | `npx -y @noacg/cli mcp` over stdio |
| **the terminal** | an agent that runs shell commands, and you | `npm i -g @noacg/cli` |

Whichever you pick, the `noacg-graphic` skill is the same text: what a NoaCG graphic must expose,
and the loop to get there. It is the contract, not design guidance.

It also carries `noacg caspar`, which is not about authoring: it talks **AMCP to a CasparCG
server**, so a NoaCG production can go on a channel from the studio page (or straight from the
terminal). A browser cannot open the socket AMCP needs, so this tool holds it -
`docs/CASPARCG_CONNECT.md`.

## Paste this to your agent

The short way in. The agent installs the entrance that matches it, checks the setup, and then
asks what to make. It runs a couple of install commands you have to approve.

```
Set up NoaCG Studio so you can build broadcast graphics for me, then ask me what to make.

1. Install the entrance that matches you. Claude Code:
     claude plugin marketplace add NoaCG/NoaCG-Studio
     claude plugin install noacg@noacg-studio
   Codex:
     codex plugin marketplace add NoaCG/NoaCG-Studio
     codex plugin add noacg@noacg-studio
   Any other agent that speaks MCP: register a stdio server, command "npx", arguments
   "-y @noacg/cli mcp". I will approve these commands as you run them.

2. Do not wait for the install. A plugin only loads in your next session, so use
   "npx -y @noacg/cli <command>" for everything today, starting with
   "npx -y @noacg/cli docs contract" to read what a NoaCG graphic must expose.

3. Verify: "npx -y @noacg/cli doctor" prints the deployment, the browser it will drive and
   the bridge version it found. If it does not, tell me what failed and stop.

4. Then tell me in one or two lines that NoaCG is ready, and ask me to describe the graphic
   I want.

The loop after that: scaffold or author, "npx -y @noacg/cli validate <dir> --screenshots
./shots", fix what it reports, then "npx -y @noacg/cli save <dir>". Saving needs
"npx -y @noacg/cli login" once, which opens a browser for me to approve.
```

The commands it runs are below, for anyone who would rather run them by hand.

## Install

```
npx @noacg/cli doctor                 # no install: runs the published build
npm i -g @noacg/cli                   # or install it once
```

**Claude Code**: the `noacg` plugin ships the `noacg-graphic` skill and a `/noacg:graphic`
command, with nothing to install first; the skill runs this CLI from the terminal. The optional
`noacg-mcp` plugin adds the always-on MCP server (`cli/plugin-mcp/README.md` says what it costs).

```
claude plugin marketplace add NoaCG/NoaCG-Studio
claude plugin install noacg@noacg-studio
```

For the MCP server on its own: `claude mcp add noacg -- npx -y @noacg/cli mcp`.

**Codex**: the same plugin, from the same repository. `codex plugin add` installs the skill, so
there is nothing to copy by hand; `codex plugin add noacg-mcp@noacg-studio` adds the optional
always-on server the same way.

```
codex plugin marketplace add NoaCG/NoaCG-Studio
codex plugin add noacg@noacg-studio
```

On a Codex without `codex plugin`, do it the long way instead: copy `skill/noacg-graphic/` from
this package (or `cli/plugin/skills/noacg-graphic/` in the repo) to `~/.codex/skills/noacg-graphic/`,
then `codex mcp add noacg -- npx -y @noacg/cli mcp`.

**Any MCP client**: run `npx -y @noacg/cli mcp` as a stdio server - command `npx`, args
`-y @noacg/cli mcp`.

## Use

```
npx @noacg/cli types
npx @noacg/cli scaffold --type scoreboard --design neutral --name "Football scoreboard" --out ./football-scoreboard
#  ...design it: edit football_scoreboard.html, css/template.css, js/template.js ...
#  (the html is named after the GRAPHIC, not the folder: the name's spaces become underscores)
npx @noacg/cli validate ./football-scoreboard --screenshots ./shots
npx @noacg/cli inspect ./football-scoreboard
npx @noacg/cli login                  # once per machine: a scoped key that can only create graphics in your library
npx @noacg/cli save ./football-scoreboard
```

| Command | What it does |
|---|---|
| `doctor` | Which browser and which NoaCG deployment (`NOACG_URL`) this tool will use, the bridge version it found, and whether a key is held. |
| `types` | The graphic types the deployment knows: fields, operator events, designs, neutral scaffold. |
| `scaffold --type <id> [--design <id>\|neutral] [--name N] [--set key=value]... --out <dir>` | A complete, valid package from a type: a catalog chassis or the NEUTRAL scaffold (fields, machine, controls and runtime on a plain spine). |
| `scaffold --fields "Label:kind[=value],..." [--name N] --out <dir>` | A typeless graphic with exactly the fields you declare. |
| `validate <dir\|zip> [--no-bench] [--no-house-contract] [--screenshots <dir>]` | The static gate + the live runtime bench, every finding as a teaching line, readiness rows, optional off/on-air/stress frames - and the package's generated half regenerated from the sources. Third-party OGraf packages: manifest conformance + a host-driven lifecycle check. |
| `inspect <dir\|zip>` | The operator surface NoaCG derives from the graphic's own contract (inputs, buttons, steps). |
| `screenshot <dir\|zip> --state off\|onair\|stress --out <png>` | One transparent frame. |
| `pack <dir\|zip>... --out <file.noacgpack.json>` | A multi-graphic production file for the studio's Import door. |
| `docs [topic]` | The skill's reference texts. |
| `mcp` | The same verbs as an MCP server over stdio. |
| `login [--name N] [--no-browser] [--key <noacg_ak_…>]` | Get a scoped agent key for this machine: opens the NoaCG consent page, receives a one-time code on a loopback listener, redeems it. The key can only create graphics in your library; revoke it in Settings → Account → Agent access or with `logout`. `NOACG_AGENT_KEY` for CI. |
| `logout [--local]` / `whoami` | Revoke + forget this machine's key / show which key is held and whether it is still valid. |
| `save <dir\|zip> [--name N] [--folder F] [--no-bench]` | Validate (gate + bench), refuse on errors, then put the graphic in your NoaCG library and print its `#/graphic/<id>` link. Save = the library, never a production. |
| `caspar agent [--port 8899] [--token T] [--origin URL]…` | Hold the AMCP socket a browser cannot: a loopback-only HTTP surface that lets NoaCG's **Settings → Playout** panel drive a CasparCG server. Binds `127.0.0.1` and refuses anything else; needs a token; refuses origins that are not your NoaCG. Leave it running. |
| `caspar status\|send\|play\|stop [--server HOST] [--amcp-port 5250]` | The same AMCP with no browser at all: check a server, send one command, or put a production's output URL on a channel (`play --url <output URL> --channel 1 --layer 20`). |

Add `--json` to any command for one JSON object on stdout. Exit codes: 0 clean, 1 findings or
refused, 2 usage/IO error. Environment: `NOACG_URL` (default `https://noacg.studio`; a dev server
or self-host works), `NOACG_BROWSER` (a Chromium executable; otherwise the system Chrome/Edge or a
Playwright-installed Chromium is used), `NOACG_AGENT_KEY` (a key for CI - beats the stored one).

## The package on disk

```
<slug>/
  SOURCES - edit these                  GENERATED - never edit; `noacg validate` rebuilds them
    <slug>.html                            <slug>.ograf.json   the OGraf v1 manifest (+ v_noacg)
    css/template.css                       graphic.mjs         the OGraf Web Component
    js/template.js                         FIELDS.md  README.md  controlpanel.html
    js/gsap.min.js  images/  fonts/
```

One folder is a valid EBU OGraf v1 Graphic, the SPX/CasparCG package and the workspace you edit.
Zip it and it imports through the studio's Import door; drop it in an OGraf renderer and it plays.
Those two are what the folder satisfies IN PLACE; the graphic itself is plain HTML, CSS and JS,
and NoaCG exports it to an OBS/vMix overlay, H2R or LiveOS from the same sources. In through
NoaCG, out to anything.

## MCP

The same verbs, spoken over stdio - `npx -y @noacg/cli mcp`. One tool, `noacg`, with the
terminal's grammar: `command` is the verb (`types`, `scaffold`, `validate`, `inspect`,
`screenshot`, `docs`, `save` - the last after `noacg login`) and the other arguments are that
verb's flags, so `{ "command": "validate", "path": "./my-graphic", "screenshots": true }` returns
the frames as images. The skill's references are also resources (`noacg://docs/<topic>`). The
`noacg-graphic` skill ships under `skill/`.

One tool rather than seven because an MCP client puts every tool's schema into the model's
context in every session where the server is configured, whether or not that session is about
graphics. This shape is about 590 tokens against about 1,160 for the seven-tool one it replaced.
The teaching is in the skill, which loads only when a graphic is being made.

`caspar` is deliberately not an MCP tool: it drives live playout hardware, which is an operator's
decision rather than an authoring agent's.

## Develop

```
npm install
npm run build                                # generates the plugin's skill copy, then tsc
NOACG_URL=http://localhost:5174 npm test     # against a NoaCG dev server's /bridge
npm run check:skill                          # every shipped copy of the skill matches cli/skill/
```

## Licence

**Apache-2.0** - deliberately different from NoaCG Studio itself, which is AGPL-3.0-only. This
tool is the door into NoaCG for coding agents, so it is licensed to be installed anywhere without
a policy review: a permissive licence, an explicit patent grant, no copyleft reaching anything you
build with it. The AGPL on the studio protects the hosted application; it was never meant to gate
the client that talks to it.

Graphics you create are yours. Nothing in either licence attaches to the templates this tool
scaffolds or to what you export and put on air.

One third-party note, since a scaffolded package carries it: the animation runtime bundled into a
graphic (`js/gsap.min.js`) is GreenSock's GSAP, under its own
[standard licence](https://gsap.com/standard-license), not ours. It is not part of this npm
package - it arrives inside the graphic your deployment generates.
