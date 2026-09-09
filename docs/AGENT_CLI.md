# The agent door: the NoaCG CLI, the `/bridge` page, the graphic package

> Let users use Claude Code, Codex and future coding/design agents to create genuinely
> excellent-looking graphics IN THE WAY THOSE AGENTS WORK BEST, while NoaCG provides the bridge
> that turns those graphics into reliable, editable, controllable broadcast graphics that can be
> saved and played through NoaCG.

Two conditions, both required: the graphic must look genuinely good, and it must be genuinely
NoaCG-playable (fields, actions, animation, validation, compatibility, operator controls and
playout all work). **The agent door is a BRIDGE and broadcast interface, not a creative harness.**
NoaCG tells the agent WHAT the graphic must expose, WHICH runtime/interchange contract to satisfy,
HOW to validate, inspect, play and save it, and the hard broadcast constraints that matter. It is
deliberately silent about composition, hierarchy, shape language and the agent's design process -
the agent does what it is already good at; NoaCG supplies the contract, tools, validation and
destination. The outcome to judge every decision against: *"I asked my coding agent to make a
great graphic. It made one. Now it is in NoaCG, editable and ready to go on air."*

## One name for each thing

Four names had grown for what is really one artifact and one capability, which made the whole
surface read as four products. There is one of each, and everything else is packaging:

| Name | What it means | What it is NOT |
|---|---|---|
| **the agent door** | the CAPABILITY: a coding agent can make a graphic that is genuinely NoaCG-playable, and put it in a library. The subject of this document. | not a thing you install |
| **the NoaCG CLI** | the ARTIFACT: one npm package `@noacg/cli`, installing one command `noacg`. Every verb the door has lives here. | not a second tool beside the MCP server - `noacg mcp` IS this package |
| **the three entrances** | the ways an agent arrives at that one artifact: **the plugin** (Claude Code and Codex), **the MCP server** (`noacg mcp`, for any MCP client), **the terminal** (`noacg <command>`, for an agent that runs shell commands, and for a person) | not three implementations - one library, three front doors |
| **the `noacg-graphic` skill** | the CONTRACT TEXT the door teaches: what a graphic must expose, and the loop. Every entrance carries the same copy, generated from one source. | not an entrance of its own, and not design guidance |

So: "install the NoaCG CLI" (or the plugin, which brings it), "the MCP server exposes one tool
with seven verbs", "the skill teaches the contract", "the agent door works" - and never "the CLI
and the MCP server" as though they were two things to choose between.

**The plugin runs nothing until a graphic is being made** (since 2026-09-02). It is the skill and
the command; the skill drives the CLI from the terminal. The MCP server is a second, optional
plugin, `noacg-mcp`, because a server a plugin declares starts in every session where the plugin
is enabled and cannot be made to start later - the measurements, the design and what is still
open are in "What a session pays" below.

## The shape

```
 user's machine                                            the NoaCG deployment (NOACG_URL)
 ┌──────────────────────────────────────────┐              ┌───────────────────────────────────┐
 │ Claude Code / Codex / any MCP client     │              │ /bridge   window.noacgBridge       │
 │   3 entrances: plugin, mcp, terminal     │   drives     │   hello types scaffold validate    │
 │   all of them THE NoaCG CLI  ────────────├─────────────▶│   inspect compose readPackage      │
 │     (playwright-core, system Chrome/Edge,│  headless    │   exportPackage packEntry          │
 │      a FRESH contained context)          │  Chromium    │   graphicDoc ografHost             │
 │   carries: the noacg-graphic skill       │              │                                   │
 │   holds: a scoped agent key              │              ├───────────────────────────────────┤
 │     (noacg login, docs/AGENT_SAVE.md)    │   POST       │ /api/me/graphics  -> the library  │
 └──────────────────────────────────────────┘              └───────────────────────────────────┘
```

Everything the bridge does is the studio's OWN code - the type registry, `publishGate`, the
runtime bench, `composeDocument`, the exporters, the importer, the control generator - so an
agent is validated by the very deployment it saves into. The bridge page holds no account, no
key and no store (`src/bridge/`, `docs/ARCHITECTURE.md`).

## The graphic package (the workspace on disk)

First, what this package is FOR. An agent needs one folder it can edit, validate and hand over,
and NoaCG's job is that whatever comes out of that folder runs wherever the user needs it: SPX,
CasparCG, an OBS or vMix overlay, H2R, LiveOS, an OGraf renderer, and whatever is added next.
**In through NoaCG, out to anything.** The workspace happens to satisfy two of those targets in
place, without a build step, which is a convenience rather than an identity - the graphic is not
"an SPX template" or "an OGraf graphic" underneath, it is HTML, CSS and JS that every target
adapts (root `AGENTS.md`, "Export anywhere"). The other targets are one `noacg pack` or one
export away from the same sources.

So: one folder that is simultaneously a valid **EBU OGraf v1** Graphic and the **SPX** package,
and the workspace an agent edits (`src/export/noacgPackage.ts`, `docs/OGRAF.md`):

```
<slug>/
  SOURCES - edit these                  GENERATED - never edit, rebuilt by `noacg validate`/`save`
    <slug>.html                            <slug>.ograf.json     the OGraf manifest (+ v_noacg)
    css/template.css                       graphic.mjs           the Web Component wrapping the runtime
    js/template.js                         FIELDS.md  README.md  GETTING-ON-AIR.md  controlpanel.html
    js/gsap.min.js  images/  fonts/     (shared by both halves)
```

A renderer reads the manifest + `graphic.mjs` and ignores the sources; NoaCG reads the sources
(and the manifest's `v_noacg` block for the graphic TYPE) and ignores the generated half; SPX /
CasparCG read `<slug>.html` + `css/` + `js/` as they always have. The manifest's `v_noacg` is the
standard's vendor-extension mechanism used for exactly what plain OGraf cannot express: the type,
pointers at the sources, the sources' content hash (`sourceHash`, so a stale generated half is
detectable), and the generator. Nothing else is NoaCG-specific; there is no second manifest.

`zip` the folder and it imports through the studio's Import door (it is an SPX package); drop it
in an OGraf renderer and it plays (it is an OGraf package); `noacg save` puts it in your library.

**"Simultaneously valid" is measured, not asserted.** It is the kind of claim that reads true and
can be false in a way nothing local notices, so it is checked against the standard rather than
against our reading of it. Externally, in a renderer nobody here wrote: `docs/OGRAF.md`, twice.
Mechanically, most recently on **2026-08-26** against this branch, on a package the CLI itself
produced (`scaffold --type scoreboard --design neutral`, then `validate`):

- **The manifest, against the EBU's PUBLISHED schema files** - all seven fetched from
  `ograf.ebu.io` that day and loaded into ajv (draft 2020-12), not our transcription of them.
  Valid. The harness was mutation-tested in the same run so that "valid" is a result: a vendor
  field without the `v_` prefix, a missing `main`, a `default` typed against its property, a
  `null` where a number belongs, an unknown constraint key, a fractional duration and
  `stepCount: -2` were each rejected. One mutation was NOT rejected, and it is a limit of the
  standard's schema rather than of the harness: **a duplicate `customActions` id passes the
  published schema**, because JSON Schema cannot express uniqueness across a keyed array. Our own
  `ografSchema.ts` refuses it, and should keep refusing it - a renderer that registers actions by
  id would silently lose one.
- **The OGraf half ALONE, driven as a stranger's package.** The sources and the root `v_noacg`
  block were deleted from a copy, leaving only what a renderer reads: manifest, `graphic.mjs`,
  `js/gsap.min.js`, `fonts/`. `noacg validate` then read that copy as a THIRD-PARTY OGraf Graphic
  (the path that knows nothing about NoaCG) and drove it in the OGraf host: `load`, `updateAction`,
  all four `customAction`s, `playAction`, `stopAction`, `dispose` - nine actions, every one `200`,
  and the on-air frame painted in the bundled Inter fetched from inside the package rather than
  from the host page. The SPX half of the same folder had already passed the static gate and the
  runtime bench in the ordinary `validate` above it.

What that does NOT prove is any particular renderer's behaviour - only that the package satisfies
the contract those renderers read. The external walks in `docs/OGRAF.md` are what covers the rest,
and the honest limits are listed there.

## The NoaCG CLI

One package, one command, and the whole door: install `@noacg/cli` and you have `noacg`. Install:
`npx @noacg/cli <command>` (or `npm i -g @noacg/cli`). Every command takes `--json` for
machine-readable output. Exit codes: `0` clean, `1` the graphic has findings (validate) or the
request was refused, `2` a usage/IO error.

| Command | What it does |
|---|---|
| `noacg doctor` | Reports the browser it will use, the bridge it reaches at `NOACG_URL` and its protocol version, and whether a key is held for it (`whoami` asks the deployment if it is still valid). |
| `noacg types [--json]` | The graphic TYPES the deployment knows: fields (key, label, kind, role), operator events, designs, whether a neutral scaffold exists. Optional - an agent may author from scratch against the contract. |
| `noacg scaffold --type <id> [--design <id>\|neutral] [--name N] [--set key=value ...] [--palette id] [--font id] [--zone z] --out <dir>` | A complete, valid graphic package from a type: a catalog chassis (a proven composition to restyle) or the NEUTRAL scaffold (the type's fields, machine, controls and runtime on a plain spine). |
| `noacg scaffold --fields "Label:kind[=value],..." [--name N] --out <dir>` | A typeless graphic (`blank`) with exactly the fields you declare - every one an operator input, the implicit lifecycle machine. |
| `noacg validate <dir\|zip> [--no-bench] [--no-house-contract] [--screenshots <dir>] [--json]` | For a NoaCG package: the static gate (`publishGate`), the live runtime bench (binding, pre-play, entrance, overlap/overflow, doubled-text stress, exit, replay, editability, field paint, type floor), readiness rows, engine compatibility - then REGENERATES the OGraf half from the sources and warns when it was stale. For a third-party OGraf package: manifest + package conformance, then the OGraf host drives load / update / custom actions / play / stop and reports every ReturnPayload. `--screenshots` writes `off.png`, `onair.png`, `stress.png` (transparent) - the agent's eyes. |
| `noacg inspect <dir\|zip> [--json]` | The operator surface NoaCG derives from the graphic's own contract: one input per field, one button per action/event, the step semantics - for a NoaCG template from its definition + machine, for any OGraf manifest from `schema` + `customActions` + `stepCount`. No category is consulted, ever. |
| `noacg screenshot <dir\|zip> --state off\|onair\|stress [--data k=v ...] --out <png>` | One transparent frame of the settled graphic. |
| `noacg pack <dir...> --out <file.noacgpack.json> [--layer n]` | A multi-graphic production file for the studio's Import door (`docs/GRAPHICS_PACKS.md`). |
| `noacg docs [contract\|package\|validator\|ograf]` | Prints the skill's reference texts (the same files the skill ships). |
| `noacg login [--name N] [--no-browser] [--key <noacg_ak_…>]` / `logout [--local]` / `whoami` | Obtain, end and show this machine's SCOPED AGENT KEY (docs/AGENT_SAVE.md): `login` opens the consent page in your browser and receives a one-time code on a loopback listener - the key is minted at redeem and never transits the browser; it can only create graphics in your library. `--key` stores a key minted elsewhere. |
| `noacg save <dir\|zip> [--name N] [--folder F] [--no-bench]` | Validate (gate + bench) in the bridge, refuse on errors, then POST the library record to `/api/me/graphics` with the key; prints the `#/graphic/<id>` link, which opens at once (a miss while signed in runs one sync pass). SAVE is the library - never publish, never a production. |
| `noacg caspar agent [--port 8899] [--token T] [--new-token] [--origin URL ...] [--quiet]` | The ONE command here that is not about authoring a graphic (`docs/CASPARCG_CONNECT.md`). It holds an AMCP socket to CasparCG on behalf of the STUDIO PAGE, because a browser's only socket is a WebSocket and AMCP will never answer an HTTP Upgrade. Loopback-only bind, a stored per-machine token, an origin allowlist, and a `Host`-header check; `/health` is the one unauthenticated route so the panel can tell a missing agent from a rejected token. It lives in this CLI rather than as a second local helper, the same call `docs/PLAYOUT_INTEGRATION.md` §4 made for the exported package's relay. |
| `noacg caspar status\|send\|play\|stop [--server HOST] [--amcp-port 5250] [--channel 1] [--layer 20]` | The same AMCP with no browser in the loop at all - which is also the answer for Safari and any browser that will not let a page reach a local address. `play --url <output URL>` is the whole live link: one `PLAY <channel>-<layer> [HTML] "<url>"`, after which every cue rides the durable command log. |
| `noacg mcp` | The SAME code as the rows above, spoken as an MCP server over stdio - the second entrance, not a second tool. ONE tool, `noacg`, with the terminal's grammar: `command` is the verb (`types`, `scaffold`, `validate`, `inspect`, `screenshot`, `docs`, `save`) and the other arguments are that verb's flags; screenshots are returned as images, and the skill's references are also resources at `noacg://docs/<topic>`. One tool rather than seven because the schema sits in the model's context in every session the server is configured for - about 590 tokens against the seven-tool shape's 1,160 (measured 2026-09-02). `caspar` is deliberately NOT a verb: it drives live playout hardware, which is an operator's decision and not an authoring agent's. That exclusion, the verb set, the arguments and a size ceiling on the schema are pinned offline by `cli/test/mcp.test.mjs`. |

Environment: `NOACG_URL` (the deployment to drive and save to; default `https://noacg.studio`;
`http://localhost:<port>` for a dev server; any self-host), `NOACG_BROWSER` (a Chromium
executable when the system Chrome/Edge channel is not wanted), `NOACG_AGENT_KEY` (a key for CI /
containers - beats the stored one), `NOACG_AGENT_NAME` (what `login` calls itself).

Vocabulary (the product's): `save` puts a graphic in the LIBRARY. `publish` is what a PRODUCTION
does when it goes to the hosted control page / output URL; `add`, `publish`, `take`/`update`/
`next`/`out` are reserved verbs for later capabilities and are never what `save` does.

### Protocol

The CLI opens `${NOACG_URL}/bridge` in its own headless browser, waits for
`window.__noacgBridgeReady`, calls `hello()` and reads `{ channel: 'noacg-bridge', v, app }`
(`src/bridge/bridgeApi.ts`, `BRIDGE_V`). The CLI declares the `v` range it speaks; a deployment
speaking a newer `v` is refused with *"this NoaCG speaks bridge v2 - update noacg"*, an older one
with the reverse - the pack format's refuse-with-upgrade idiom, because a human can act on it.
Additive fields on any result never bump `v`; a breaking change does.

### Containment (the bench executes the agent's code)

The bridge's validator runs the template - in the bench browser, at the app origin, in an iframe
the bench reads directly. The execution environment is therefore the boundary, and the CLI's
browser context is built for it, in this order: the share-safety regex screen runs FIRST and a
template it refuses is never benched (`unsafe-js-*` findings are taught, not run); the context is
FRESH and non-persistent (never the user's profile - it holds no session, no key; the agent
credential is sent from Node, never from the browser); a `context.route('**/*')` allowlist admits
the app origin's GET requests outside `/api/*` and the CLI's own package mount, and aborts
everything else; `routeWebSocket` closes every socket; `serviceWorkers: 'block'`,
`acceptDownloads: false`, `permissions: []`, `bypassCSP: false`; popups are closed on arrival; the
bench's own `timeoutMs` is explicit and an outer race at about twice that hard-closes the context
(the bench's race only stops waiting). Residual: a template that spins the main thread, GPU
exhaustion - stated, not hidden. A later hardening is to sandbox the bench iframe and take the
measurements from the driver through `frameLocator().evaluate()` (see `src/ai/safety.ts`).

Third-party OGraf packages are mounted under the app origin at `/__noacg-package/<id>/...` by
`context.route` (a module import needs a real http(s) URL, and a component's
`new URL(…, import.meta.url)` needs a base) and hosted by `src/bridge/ografHost.ts` - a minimal
renderer for ONE Graphic with a driver the CLI calls.

### Verifying the CLI

`cli/` is its own package with its own gate, and it runs in two tiers for one reason: only the
first can run in CI.

| Tier | File | Needs | Runs |
|---|---|---|---|
| offline | `cli/test/unit.test.mjs`, `cli/test/mcp.test.mjs`, `cli/test/caspar.test.mjs` | nothing - no network, no browser, no deployment | **every push** (the CLI step in `ci.yml`) and `npm --prefix cli test` |
| against a bridge | `cli/test/smoke.test.mjs` | a dev server at `NOACG_URL` and a headless Chromium | `npm run bench:cli` on a developer machine |

The offline tier is where a regression actually gets caught, so it covers the parts a fault would
hide in until it hurt someone: the flag grammar every command reads its arguments through, the
workspace ↔ zip boundary (the module that has been wrong twice, and the one place the CLI writes
attacker-named paths to disk), the credential store and its `NOACG_AGENT_KEY`-beats-the-file
precedence, the `--fields` grammar, and the process contract - exit codes, and the rule that
`--json` puts exactly one parsable object on stdout however the command ended.

**`mcp.test.mjs` covers the MCP ENTRANCE the same way** (added 2026-08-26). Until it existed, the
terminal entrance was pinned by `unit.test.mjs` and the MCP entrance by nothing that runs in CI -
everything about it lived in `smoke.test.mjs`, which skips itself whenever no bridge answers. So
the surface an installed plugin actually talks to could change shape and every green run in this
repository would have said nothing. It drives a real MCP client against `noacg mcp` over stdio,
with `NOACG_URL` pointed at a closed port, and asserts: the server exposes one tool, `noacg`,
whose `command` enum is exactly the seven authoring verbs; **`caspar` is not among them**, which
was a rule stated only in prose; the tool's title, description and argument list, and a
character ceiling on the rendered schema (since 2026-09-02, when the seven tools became one to
cut what every session pays); the server's own name and version; that a verb missing its
argument is a usage error naming it rather than a bridge attempt; and that `docs` and the
`noacg://docs/<topic>` resources answer with no deployment, no browser and no key, because an
agent has to be able to read the contract before it has any of those. The original assertions
were mutation-tested before landing - renaming one tool and dropping one required argument each
failed three of the eight tests.

`smoke.test.mjs` **skips itself with a message** when no bridge answers, rather than passing: an
offline `npm test` that reported six green tests it never ran would be worse than no test at all.
It walks scaffold → validate → inspect → screenshot, a typeless graphic from a field list, a
third-party OGraf package driven in the host, and `save` - which is the one command whose far end
this repository does not own, so it asserts the whole CLIENT path (read, normalize, gate, bench,
build the library record) and then that the server hop's refusal is the DOCUMENTED one.

`npm run bench:cli` is named `*bench*` on purpose: that puts it in `SWEEP_SCRIPTS`, so it queues
behind a live e2e suite instead of running beside one (root `AGENTS.md`, "Verifying changes").

## Time to air, measured

The owner's bar for this door is *"create graphics in your own Codex or Claude Code and, in
minutes, play them out in the NoaCG CG player system."* Until 2026-09-09 nobody had timed it, so
the sentence was a hope. These are wall-clock numbers off one walk, on one machine, on one day.
**A number with no date is not a measurement**, so every row below carries all three.

**When:** 2026-09-09, 11:07-11:18 UTC. **Machine:** Windows 10 (10.0.19045), 16 cores, 17 GB,
Node v24.13.0, Google Chrome as the bench browser. **Entrance:** the TERMINAL one, walked by hand
from an empty directory outside the repo (`C:\claude\noacg-cli-walk`), following `cli/README.md`'s
own "Use" block line by line. **Deployment:** this checkout's dev server (`npm run dev:worktree`,
`http://localhost:5290`), driving the branch's own bridge. **CLI:** built from `cli/` in this
checkout, run as `node cli/dist/index.js …` - the same code `npx @noacg/cli` ships.

### Setup, once per machine

| Step | Wall clock |
|---|---|
| `npm install` in `cli/` (110 packages, cold) | 6.5 s |
| `npm run build` in `cli/` (skill generator + tsc) | 2.2 s |

A stranger does not pay this: they type `npx @noacg/cli <command>`, which pays a registry fetch
instead. The walk used the local build so the numbers describe THIS branch rather than 0.3.0.

### The verbs

| Verb | The command as typed | Wall clock | Exit |
|---|---|---|---|
| `doctor` | `noacg doctor` | **2.4 s** | 0 |
| `types` | `noacg types` | **1.7 s** | 0 |
| `scaffold` | `noacg scaffold --type scoreboard --design neutral --name "Football scoreboard" --out ./football-scoreboard` | **2.1 s** | 0 |
| `validate` | `noacg validate ./football-scoreboard --screenshots ./shots` | **10.7 s** | 0 |
| `inspect` | `noacg inspect ./football-scoreboard` | **1.9 s** | 0 |
| `screenshot` | `noacg screenshot … --state onair --out ./one-frame.png` | **4.0 s** | 0 |
| `pack` | `noacg pack ./football-scoreboard --out ./walk.noacgpack.json` | **2.0 s** | 0 |
| `whoami` | `noacg whoami` (against `https://noacg.studio`) | **3.8 s** | 0 |
| `save` | `noacg save ./football-scoreboard` against a DEV SERVER | **0.3 s** | 1, refused |

**24.8 seconds of tool time** for the seven authoring verbs, of which `validate` is 43% - it is
the only one that launches Chromium, runs the gate, drives the bench and writes three 1920x1080
frames, and it is the verb an author runs most. Everything else is a bridge round trip. Nothing
in the door needed a retry, and no verb sat silent for longer than it worked.

### The leg to a player

The graphic went on air through the package's own fallback player, which is the route
`GETTING-ON-AIR.md` names for anyone with no playout host in the room: serve the package folder
over any local http address, open the graphic's `.html` in one tab and `controlpanel.html` in
another, drive it from there. Measured the same day, immediately after `pack`:

| Step | Result |
|---|---|
| serve the folder (a 30-line static server, port 8123) | the panel found the graphic and reported `connected: spx-control-football` |
| **Play** | the graphic came on air - root opacity 0 -> 1, state `main: Off` -> `Enter` |
| **Goal A** (an operator button the type's machine declares) | `HOME 0 AWAY 0` -> `HOME 1 AWAY 0` |
| **Stop** | state back to `main: Off`, the exit animation ran |

That leg took about six minutes of wall clock as walked, and that number is honest but not
useful: two of those minutes were my own browser tooling losing a tab and a stale element
reference. The product steps are three, and each is seconds.

### What could NOT be walked, and why

- **`save` stopped twice on this machine, and neither wall is the one you would guess.** The
  route is served: `vite.config.ts` registers `meApiPlugin()`, which `ssrLoadModule`s the real
  `api/me/[...path].ts`, so `POST /api/me/graphics` answers on the dev server. What the walk hit
  was, in order: (1) **the CLI's key store is per ORIGIN** (`cli/src/auth.ts`), and the machine
  held a key for `https://noacg.studio` and none for `http://localhost:5290`, so `save` refused
  client-side in 0.3 s - *"Not logged in to http://localhost:5290 - run `noacg login` first…
  No account? Zip the package and use the studio's Import door."*; and (2) had it been logged in,
  the endpoint answers **503** `{"code":"unavailable","message":"This NoaCG has no account
  backend, so there is no library to save into here."}` (measured with `curl` the same day),
  because a LINKED WORKTREE has no `.env.local` - the file is per checkout and gitignored. So the
  wall is a local backend, not the architecture, and a checkout that carries the env can walk the
  whole line. **What is true either way is that the README's Use block ends on a line a fresh
  local walk cannot run**, which is worth knowing before anyone times themselves against it. The
  local route the CLI itself points at is the Import door, which `noacg pack` also names.
- **`save` against `https://noacg.studio` was not run in this walk.** A valid key was held
  (`whoami` above), but writing into the owner's live library from an unattended session is a
  remote account write, and this session's permission gate refused it. The client half of that
  path is what `cli/test/smoke.test.mjs` covers; the server half is `docs/AGENT_SAVE.md`.
- **The studio's own production output URL** (`/output?production=<slug>`) needs a published
  production, which needs the backend. Same wall as `save`.

### What the walk found

Three things, in the order a stranger meets them:

1. **An unquoted flag value was swallowed in silence.** `--name Football scoreboard` (no quotes)
   left "scoreboard" as a stray word, and `scaffold` ignored it: the graphic came out named
   "Football", in its `<title>`, its SPX description and its file names, with nothing said. The
   same hole was open on `save`, where that name goes into the user's LIBRARY. Fixed on the same
   branch: `refuseStrayArgs` (`cli/src/output.ts`) refuses a word past what a verb takes and
   names the word to quote - `scaffold` takes none, `save` / `validate` / `inspect` / `screenshot`
   take one package, `pack` takes any number and `caspar` has sub-commands, so those two keep
   their own grammar. Pinned by `cli/test/unit.test.mjs`.
2. **`noacg types` prints lines up to 354 characters**, 67 rows of them, which no terminal shows.
   Filed: `docs/backlog/noacg-types-prints-a-table-no-terminal-can-show.md`.
3. **Three of six neutral scaffolds warn on their own bench.** Filed:
   `docs/backlog/neutral-scaffolds-fail-their-own-stress-bench.md`.

One documentation fix came out of it too: `cli/README.md` told the reader to edit
`football-scoreboard.html`, and the file the scaffold writes is `football_scoreboard.html` - the
html is named after the GRAPHIC, not the folder.

## The skill (`cli/skill/noacg-graphic/`)

The contract TEXT, carried by all three entrances - not a fourth thing to install and not an
entrance of its own. Contract-only by default: the SPX/NoaCG runtime contract (definition + DataFields, `fN` ->
`id="fN"`, `play/stop/update/next`, ES5, GSAP only, relative references), the EDITABILITY contract
(the structure spine `.<prefix> > .<prefix>-box > .<prefix>-mask > span#fN`, the `:root`
variables, the marked ANIMATION region with its NOACG_ANIM data and the interpreter you never
edit), the package anatomy, the OGraf contract, the control verbs and the two markup conventions
the control layer reads (`.<prefix>-clock` + `data-count`/`data-start`; A/B side tokens), and a
glossary of WHAT THE VALIDATOR MEASURES so a finding is understood. The loop it teaches:
(optionally `types` / `scaffold` when the graphic needs a type's machine or a chassis saves work)
-> author the way the agent normally works -> `validate` (+ screenshots) until clean -> `save`.
The one content rule: content an operator or another broadcaster would change is a field;
decoration and genuinely fixed semantic labels may stay static; never bake event-specific
content. NOT in the default skill: taste rules, motion doctrine, composition/hierarchy/shape
guidance - those live in `references/design-notes.md`, off by default, to be tested as its own
arm. With a design skill active, NoaCG's rules bind only for correctness, editability,
compatibility and playout; the look is the agent's; page/responsive/mobile guidance does not
apply to a fixed 1920x1080 frame.

The canonical source is the one under `cli/skill/`; the in-repo dogfooding adapters
(`.agent-workflows/noacg-graphic.md`, `.claude/skills/noacg-graphic/`, `.agents/skills/noacg-graphic/`)
and every shipped copy (npm, the Claude Code plugin, the Codex skill) are generated from it by
`cli/scripts/build-skill.mjs` - never hand-copied.

## Distribution (one source, every shipped copy generated)

**The npm package is `@noacg/cli`, SCOPED, and cannot be unscoped.** npm's typosquatting filter
refuses to create an unscoped `noacg` - it is judged too similar to the long-established `nock`:

```
403 Forbidden - PUT https://registry.npmjs.org/noacg
Package name too similar to existing package nock; try renaming your package to ...
```

Worth knowing before anyone "fixes" this back: `npm view noacg` returns **404**, so the name looks
free and only the write reveals it is not. The scope is exempt from that filter. The **bin name is
still `noacg`**, so nothing a user types changes - only the install identifier does, which is why
the docs say `npx @noacg/cli` but every command line says `noacg`.

**`cli/` is Apache-2.0. The rest of the repository is AGPL-3.0-only.** That split is deliberate
and should not be "tidied" back into one licence (owner decision, 2026-08-25).

The AGPL exists to stop the hosted application being taken proprietary and run as a competing
NoaCG cloud. That threat lives in the web app, and the app's licence guards it. This package is a
CLIENT - a tool an outside agent installs to talk to a deployment - so copyleft here protects
nothing and costs real installs: organisations run automated dependency-licence policies that
block or flag AGPL on sight, without distinguishing a tool you EXECUTE from a library you LINK.
Since adoption is the goal for this surface and no revenue depends on it, permissive wins.
Apache-2.0 over MIT for the explicit patent grant and trademark clarity, which is what enterprise
review treats as safest.

The split is clean because `cli/` imports nothing from `src/` - it drives the deployment over the
bridge page instead - and every dependency is permissive (MCP SDK MIT, playwright-core Apache-2.0,
zod MIT, jszip MIT-or-GPL). `cli/LICENSE` and the `license` field in `cli/package.json` and both
plugin manifests must stay in step; a published version's licence is frozen in the registry, so
this had to be right BEFORE the first publish rather than after.

Every channel below ships the same one artifact; what differs is which entrance it opens.

| Channel | What ships | Install |
|---|---|---|
| **npm** `@noacg/cli` (`cli/`) | the NoaCG CLI (`dist/`, which is the terminal AND the MCP server), the skill (`skill/` IS `cli/skill/noacg-graphic/`), README, LICENSE | `npx @noacg/cli <cmd>` / `npm i -g @noacg/cli` |
| **Claude Code plugin** `noacg` (`cli/plugin/`, marketplace `noacg-studio` = root `.claude-plugin/marketplace.json`) | the skill copy and `/noacg:graphic` - NO server; the skill drives the CLI from the terminal | `claude plugin marketplace add NoaCG/NoaCG-Studio` then `claude plugin install noacg@noacg-studio`; from a clone `claude plugin marketplace add ./`, or for one session `claude --plugin-dir ./cli/plugin` |
| **Claude Code plugin** `noacg-mcp` (`cli/plugin-mcp/`, same marketplace) - OPTIONAL | `.mcp.json` running `node mcp-server.mjs`, the launcher that resolves `@noacg/cli` and imports it in-process (npx in-process as the zero-install fallback) | `claude plugin install noacg-mcp@noacg-studio`; for one session `--plugin-dir ./cli/plugin-mcp` with `NOACG_CLI=<checkout>/cli/dist/index.js` |
| **Codex** (`.codex-plugin/plugin.json` in each plugin directory, the same `skills/`, the same root marketplace) | the whole plugin directory: the skill copy and the command (`noacg`), or `.mcp.json` (`noacg-mcp`) | `codex plugin marketplace add NoaCG/NoaCG-Studio` then `codex plugin add noacg@noacg-studio` (and `noacg-mcp@noacg-studio` for the server) |
| **In-repo dogfooding** | the thin adapter triple (`.agent-workflows/noacg-graphic.md`, `.claude/skills/`, `.agents/skills/`) - POINTERS at the source | already there |

**Two hand-kept copies of the install lines exist outside `build-skill.mjs`'s reach** - the docs
page's Reference (`docs.html#agent-setup`, and the paste-prompt above it) and the studio's own
steer, `src/components/wizard/steps/ai/AgentRouteCard.tsx` (the AI step's *Preferred* card, which
shows the Claude Code pair, the Codex pair and `/noacg:graphic`). A change to the marketplace
name, the plugin name or the command updates both in the same commit; nothing measures the drift
yet, and `e2e/ai-tiers.spec.ts` pins only the studio copy's current text.

**Codex reads the SAME root marketplace manifest** (measured 2026-08-27, `codex plugin`): a
`codex plugin marketplace add` of either `NoaCG/NoaCG-Studio` or a local checkout resolves the
marketplace name `noacg-studio` out of `.claude-plugin/marketplace.json`, and `codex plugin add
noacg@noacg-studio` copies the whole `cli/plugin/` directory to
`~/.codex/plugins/cache/noacg-studio/noacg/<version>/` - skill, command and (when the plugin
still carried it) `.mcp.json` alike. `codex mcp list` then showed the `noacg` server as enabled
with **no `[mcp_servers.noacg]` block in `~/.codex/config.toml`**, which is how you can tell the
plugin is what registered it: remove the plugin and the row disappears. Since 2026-09-02 the
server lives in the `noacg-mcp` plugin, which Codex copies the same way (not yet re-verified on
Codex after the split). So the manual skill copy and the separate `codex mcp add` that this
document used to require are both gone, and Codex now installs in the same two commands as Claude
Code. The `.codex-plugin/plugin.json` manifest carries the Codex-side interface metadata; the
marketplace entry it is found through is the Claude one. Nothing shrinks the CLAUDE side below two
commands: `claude plugin install` resolves `plugin@marketplace` only against a marketplace that is
already configured, and a repo shorthand in that position fails with *"Plugin "noacg" not found in
marketplace "NoaCG/NoaCG-Studio""*.

`cli/scripts/build-skill.mjs` writes every generated copy from `cli/skill/noacg-graphic/` and stamps
the npm version onto the four plugin manifests (two plugins, a Claude Code and a Codex manifest
each) and both marketplace entries; `npm run build` runs it in `--check` mode and fails on drift
(a deleted reference must vanish from the copy too).

### What a session pays

The owner's ask (2026-09-02): "if people want to use my CLI tool, it can't be heavy - it should
be minimal and only used when they are creating graphics", and later the same day, "installing
NoaCG should not noticeably consume or pollute a user's context window during normal Claude Code
work. If it does, that will eventually become a reason for people to uninstall it." A plugin that
declares an MCP server costs an unrelated session in two currencies, and they are different
problems: **context** (every tool's schema, the skill's description and the command's description
sit in the system prompt of every session where the plugin is enabled, read on every turn) and
**RAM** (the server process starts at session start and stays for the life of the session).

**Method** (2026-09-02, Node v24.13.0, Windows 10). Tokens: the exact text a client renders was
captured - the `tools/list` answer as one `{"description","name","parameters"}` object per tool,
and the skill and command lines as Claude Code lists them - and counted with two public BPE
tokenizers, o200k and cl100k, which agree within 4%. Claude's own tokenizer is not public and the
API count needs a logged-in `claude` (this machine's had expired: `claude auth status` said
`loggedIn: false`), so the o200k number is what is reported; `claude plugin details
noacg@noacg-studio` gives Claude Code's own estimate for the skill and command (~180, and "tool
schemas resolved at runtime; not counted"). RAM: the launcher spawned exactly as Claude Code
spawns it (`node mcp-server.mjs`, stdio), an MCP client performing the same `initialize` +
`tools/list` handshake, 20 s of settle, then `Get-Process` private bytes and working set. A bare
idle `node` measures 20 MB private / 44 MB working set by the same method; an MCP SDK server
with one trivial tool and nothing else loaded, 34 MB.

| | before (2026-09-02 morning) | after |
|---|---|---|
| tool schemas in the system prompt | 7 tools, 4,897 chars, **1,162 tokens** | 1 tool, 2,434 chars, **590 tokens** - and 0 unless the optional `noacg-mcp` plugin is installed |
| skill + command descriptions | 729 chars, **194 tokens** | 535 chars, **151 tokens** |
| always-on context, `noacg` plugin alone | **~1,356 tokens** | **~151 tokens** (89% less) |
| always-on context, with `noacg-mcp` too | ~1,356 tokens | ~741 tokens (45% less) |
| resident processes, `noacg` plugin alone | 1 | **0** |
| private bytes of the server at 20 s | 37 MB (local build); **83 MB on the published 0.2.0**, which still loads Playwright eagerly | 0 with `noacg` alone; 37 MB with `noacg-mcp` |
| working set at 20 s | 61 MB (local) / 110 MB (0.2.0) | 0 / 66 MB |
| server ready (initialize + tools/list) | 352 ms (local) / 923 ms (0.2.0) | 0 / 363 ms |

Two facts about the context number, both of which change what "small" means. Claude Code
2.1.232+ has tool search on by default, which lists MCP tools by NAME in the system prompt and
loads the schema on demand; the docs do not say at what size it kicks in, and a session whose
only MCP server is this one is well under any plausible threshold, so the full-schema number is
the honest one for the plugin's target user (under deferral the seven names alone cost about 90
tokens; the one name about 13). And the Anthropic tokenizer will not give exactly 590 or 151; it
will be within the spread of the two public tokenizers (o200k 590 / cl100k 568) rather than off
by a factor.

**What changed, and why the split rather than a lazy start.** The seven tools became one
(`cli/src/mcp.ts`; every description one line about dispatch, a character ceiling on the rendered
schema pinned by `cli/test/mcp.test.mjs`), the skill description was cut with every trigger
phrase kept, and the server moved out of the `noacg` plugin into the optional `noacg-mcp`. "Do
not run at all until needed" is not available for a stdio server today, and the evidence:

- Claude Code starts a plugin's stdio MCP servers at session start, for every session where the
  plugin is enabled, and documents no lazy, deferred or on-first-call start for them
  (code.claude.com/docs/en/mcp: "At session startup, Claude Code connects the servers for enabled
  plugins automatically"). The one lazy mechanism that exists, the discovery cache
  (`MCP_DISCOVERY_CACHE=1`, 2.1.221+, "connects the server the first time Claude calls one of the
  server's tools"), is for HTTP/SSE servers only. **The upstream change that would let the server
  move back into the `noacg` plugin is that same cache for stdio servers**: remember the last
  `tools/list`, spawn on first call. Worth asking for; not something to wait for.
- A plugin cannot ship a server disabled by default. `enabledMcpjsonServers` and
  `disabledMcpjsonServers` apply to a project's own `.mcp.json`, not to plugin-declared servers;
  a plugin's `defaultEnabled: false` disables the whole plugin, skill included.
- A skill cannot declare or start a server, and nothing connects a new server mid-session
  without the user choosing Reconnect in `/mcp`.
- A server that exits when it is not wanted (start, look at the cwd, quit) would show as a
  failed server in every unrelated session, which is worse than the cost it removes.

What IS expressible today is what shipped: the skill drives the terminal entrance, which the
agent already has, and the MCP entrance is opt-in - the `noacg-mcp` plugin for "in every
session", or a project's own `.mcp.json` for "in exactly the sessions about graphics". The price
of the terminal path is a browser launch per verb: `noacg types` against the hosted bridge
measures 2.0 s cold, `noacg docs contract` 0.4 s with no browser. The agent-round bench
(`scripts/agent-round-bench.mjs`) has driven every one of its cells through that same terminal
path since 2026-08-27, so it is the proven road, not the fallback.

**Still open**, in order of value: the Anthropic token count once a machine has `claude login`
(re-capture the rendered text with any MCP client's `tools/list`; expect the same ratio);
publishing 0.3.0 (the owner's call - until then `noacg-mcp` and any `claude mcp add` user run
the 83 MB 0.2.0 server with the seven-tool shape); the MCP SDK's 14 of the 37 MB, which a
hand-written JSON-RPC stdio server near the 20 MB floor would remove along with two dependencies,
worth it only once `noacg-mcp` has users; re-verifying the Codex side after the split; and the
MCP verbs `scaffold`, `inspect` and `screenshot`, which still re-implement the terminal commands'
package-open sequence rather than sharing a core the way `save` and the regenerate step now do
(`scaffold` also round-trips typed input through the flag grammar, so `--size-scale`,
`--type-scale`, `--fps` and `--resolution` are not reachable over MCP and a value beginning with
`--` is swallowed). The adapter
triple is guarded by `scripts/check-shared-instructions.mjs` and never generated. Verified
2026-08-22: `npm pack --dry-run` = 31 files (dist, skill, package.json, README, LICENSE); the plugin
installed from this repository as a marketplace (`claude plugin install noacg@noacg-studio`) and
`claude plugin details` listed the skill, the command and the MCP server at v0.2.0. **0.2.0 is on
npm** (published by hand 2026-08-25; the registry lists it Apache-2.0 under the `noacg` org), so the
plugin's MCP server starts for anyone - `npx -y @noacg/cli mcp` has something to fetch. Every
version after it is released by the workflow below, not by hand.

### Releasing to npm

The package is published to the **`noacg` organisation** on npm (the account `miwco` owns it), by
**`.github/workflows/release-cli.yml` running in GitHub Actions**. There is no publish token
anywhere - not in `.env`, not on a laptop, not in repository secrets. npm **trusted publishing**
tells npm to trust that one workflow file in this repository, and npm exchanges the run's GitHub
OIDC token for a credential that lives for the length of the publish. Nothing is left to leak,
rotate, or forget to revoke, and a published version carries a signed **provenance** statement
linking it to the commit and the run that built it (automatic for a public repo + public package -
no `--provenance` flag).

**Releasing a version, start to finish:**

1. Bump `version` in `cli/package.json`, then run `npm --prefix cli run build`. **That second step
   is not optional**: `cli/scripts/build-skill.mjs` stamps the version onto every plugin's two manifests
   and the root marketplace entry, and the workflow refuses a tree where they disagree.
2. Commit, and land it on `main` the normal way (`/queue-merge`).
3. Then one command, from any checkout:
   ```bash
   npm run release:cli
   ```
   It reads the version from `cli/package.json` **on `origin/main`**, refuses if any of the six
   version stamps disagree or if the registry already has that version, tags the commit, pushes,
   watches the run, and then verifies the PUBLISHED package from the registry - version,
   `latest`, the provenance attestation - and installs it with `npx` to ask its own version.
   `npm run release:cli -- --check` does the preflight and stops without touching anything.

The run also creates the matching **GitHub Release**, with notes generated from the commits since
the previous one, so every version on npm is also a version a visitor to the repository page can
see. The Actions tab's "Run workflow" button is the manual door when a tagged run needs re-driving
(untick `dry_run`), and it is the one route that works from a phone.

**A session may run this without asking** - owner ruling, 2026-09-05, after publishing 0.3.0 by
hand and observing that a human following an agent's instructions verifies nothing:

> I think you could just release the new versions if I think it's okay so I don't have to do the
> clicking.

That ruling narrows his standing rule about publishing past `main`, **for this path only**,
because this path cannot spend money, holds no credential, and refuses anything that is not already
on `main`. Everything else past `main` still reaches him in the message.

The first session to run it on a machine will hit a permission prompt - the harness classifier
refuses `git push` of a release tag by default, correctly, since that push IS the publish. Answer
it with **"Yes, and don't ask again"**; it is asked once per machine. The checks above are what
replaced the click, so a session that works around a refusal by tagging some other way has removed
the only verification there is.

**A published version can never be taken back.** That is why the preflight is stricter than the
workflow rather than thinner: everything it can refuse locally costs nothing to refuse.

**A rehearsal costs nothing.** Run the workflow from the Actions tab with `dry_run` left checked
(its default): every guard, the install, typecheck, build, the tests and `npm pack --dry-run` run
for real, and the job stops without burning a version. The GitHub Release is rehearsed too: the
dry run asks GitHub to *generate* the release notes and prints them, which exercises everything
about that step except the write. Unchecking `dry_run` publishes - the same thing a tag push
does, for when a tagged run needs re-driving.

The packing proof (`npm pack --dry-run`) touches no registry, so it runs whatever state the version
is in. The step after it (`npm publish --dry-run`) is the first that talks to the registry, and it
runs **only when the version is free** - `npm publish --dry-run` refuses a version that already
exists, so on a tree whose version is already published a dry run would otherwise only ever be able
to fail. A real publish always reaches it, because a taken version is refused long before.

**What the workflow refuses**, each one a way a release has gone wrong somewhere before:

| Refusal | Why |
|---|---|
| the commit is not an ancestor of `origin/main` | a published version must be a version on main - this is what makes that structural rather than remembered |
| a `cli-vX.Y.Z` tag that disagrees with `cli/package.json` | a tag naming a version it does not release is always a mistake |
| the version already exists on the registry | npm would refuse too; here the answer is readable and arrives in seconds. A dry run downgrades this to a notice, so a rehearsal is not limited to the window between a bump and its release |
| `build-skill.mjs --check` finds drift, or the build changes a tracked file | the bump was committed without running the generator, so the plugin would advertise the previous version |
| `npm --version` below 11.5.1 | trusted publishing needs it; the workflow upgrades npm and then asserts, because the install succeeding proves nothing about what is on PATH |
| the run is on a fork | `github.repository` is pinned and there is no `pull_request` trigger at all |

`prepack` re-runs the full build, so the `dist/` that is packed is always built from the checkout
being published - a stale local build cannot reach the registry even in principle.

**Two things only the owner can do**, both one-time (`docs/acceptance/owner-queue/`):

- On npmjs.com → the package → Settings → **Trusted publishers**, add a GitHub Actions publisher:
  organisation `miwco`, repository `NoaCG-Studio`, workflow filename **`release-cli.yml`** (the
  filename only, not a path), environment left blank. Every field is case-sensitive, and
  `repository.url` in `cli/package.json` must match the GitHub repository - it does.
- Delete `NPM_TOKEN` from `.env` and **revoke both tokens** in npm account settings.

Until the trusted publisher is configured, the workflow's dry run passes and a real publish fails
at the registry call. That failure is safe and repeatable; nothing else about the run changes.

**Appendix - the manual path (0.2.0, superseded).** 0.2.0 was published by hand: a granular token
in `.env` as `NPM_TOKEN`, read by a gitignored root `.npmrc` holding `_authToken=${NPM_TOKEN}` (an
environment reference, never a literal), with `npm publish` run from `cli/`. **npm does not read
`.env`**, so the variable had to be exported in the publishing shell or the publish failed with a
401 that read like a broken token; a prompt for a one-time code was 2FA rather than an error. That
token bypassed 2FA, expired in 30 days, and could publish as the owner from anywhere it leaked,
which is why it is gone. Keep this paragraph only as the explanation of what the revoked tokens
were for. Also from that first publish: an unscoped package belongs to whoever published it, so
the package was transferred to the `noacg` org in its npm settings afterwards.

## The category-agnostic proof

The playout boundary derives every operator surface from the graphic itself - fields -> inputs,
the machine's operator events -> buttons, nothing from a category (`docs/CONTROL_LAYER.md`,
`src/control/controlModel.ts`). Two acceptance cases pin it for the agent door:
`e2e/ograf-contract.spec.ts` renders the REAL control components from a hand-written third-party
OGraf manifest (semantic keys, custom actions, `stepCount`) through `control/ografContract.ts`,
and drives the Graphic in the host; and a typeless NoaCG graphic (`scaffold --fields`) added to a
production shows an input per field + Take/Update/Next/Out. No application code names either.

## Status

- **P1 (this document's subject):** the bridge page, the dual package, the neutral scaffold, the
  OGraf contract adapter, the CLI core + MCP, the skill. LANDED on the branch, offline-verified:
  `e2e/bridge.spec.ts` + `e2e/ograf-contract.spec.ts`, the CLI smoke (`npm run bench:cli`, six
  tests including the third-party OGraf host and the `save` client path), and the pre-existing
  OGraf conformance, import, export and SVG-import specs all green.
- **P2 (docs/AGENT_SAVE.md):** `save` - a scoped agent key minted through a loopback one-time
  code, the permission vocabulary (`src/entitlements/permissions.ts`), `/api/me/agent-keys` +
  `/api/me/graphics` (the server never executes template code), the consent route, Settings →
  Account → Agent access, and the library->air gates at hosted publish and production export.
  LANDED on its branch; offline-verified by `e2e/agent-access.spec.ts` + `e2e/production-gate.spec.ts`
  and the api unit tests; the live walk is `e2e/configured/agent-access.spec.ts`.
- **P3, part A (distribution):** LANDED on its branch - the one skill generator + check, the
  Claude Code plugin + marketplace entry, the Codex manifest + skill copy, the npm package at
  0.2.0 (`npm pack --dry-run` clean), the plugin installed from the repo marketplace for real; the
  two P1 leftovers closed (the dual package loaded and driven in SuperFlyTV's ograf-server -
  `docs/OGRAF.md` - and the CLI-produced zip walked through the Import door, which also found
  and fixed a PowerShell-backslash zip and the scaffold-name round trip); a typeless graphic
  reads "Custom" in the library; the round's brief bank (`benchmarks/agent/v1/briefs.json`) and
  runner (`scripts/agent-round-bench.mjs`, control mode free, `--run` spends).
- **P3, part B (the measured round): RUN 2026-08-22, blind-read 2026-08-23, decided.** 25/25
  cells validator-clean across arms A-E; the owner could not separate the arms visually and
  called every graphic airable ("so much better than through the Create with AI and the API").
  The verdict (`benchmarks/agent/rounds/2026-08-22/VERDICT.md`): the skill STAYS contract-only
  with free authoring as the default; design-notes stays optional (arm E showed no visible gain,
  arm D none for the highest cost); the one sharpened rule is "actions come from a type" -
  scaffold arms carried the machine every time, free arms shipped state as fields on 4 of 7
  typed-action cells; and all five novel-brief cells authored a WORKING machine from scratch -
  the evidence the Future item "agent-authored machines" was waiting on (owner gate).
- **Round two (2026-08-26): one vocabulary, a measured OGraf claim, an entrance with tests.** The
  four names became one artifact and one capability ("One name for each thing" above, applied
  across the CLI, the plugin, the skill's own description and the `/docs` page). The dual
  package's "simultaneously valid" claim stopped resting on a hand walk: the manifest against the
  EBU's published schema files with a mutation-tested ajv harness, and the OGraf half alone -
  sources and `v_noacg` deleted - driven through nine lifecycle actions as a stranger's package
  (both above, and `docs/OGRAF.md`). `docs/OGRAF.md` also gained the practical answer to "how do I
  play a NoaCG production on an OGraf renderer today", which is that NoaCG packages and the
  renderer controls. And the MCP entrance got the offline tests it had never had
  (`cli/test/mcp.test.mjs`), which is what turned the "caspar is not exposed" rule from prose into
  something a build can fail on. Version stayed 0.2.0; nothing was published.
