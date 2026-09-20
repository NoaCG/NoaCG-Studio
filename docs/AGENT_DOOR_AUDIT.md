# The agent door, walked by a stranger

**2026-09-16.** Everything below was run on this laptop tonight. Nothing here is taken from another
document: where a claim has a number, the command that produced it is printed beside it, and where I
could not witness something myself it says **UNVERIFIED** and says why. The subject is the published
`@noacg/cli` **0.3.3** (`noacg --version` -> `0.3.3`, global install) and the `noacg` / `noacg-mcp`
plugins at 0.3.3 in `.claude-plugin/marketplace.json`.

Machine: Windows 10, Node v24.13.0, npm 11.6.2, Claude Code 2.1.269, Codex 0.155.0-alpha.10.

**What I could not witness**, in full, so the rest can be read as measured:

- The interactive `/plugin` panel. I am a Claude Code subagent with no terminal of my own, so I
  cannot say what the NoaCG entry looks like inside it. I tested the same install through
  `claude plugin ...`, which is the same machinery, and say so at the point it matters.
- The hosted Create-with-AI surface. It is paid, and I spent no API money.
- Whether a Codex *session* picks the skill up and follows it (section 6). The install and the load
  are proven; two attempts to get a Codex turn died before one started, neither for capacity.

Everything else in this file I ran, including the full chain to air.

---

## 1. Can a stranger install it?

**Yes, in two commands and about sixteen seconds - but only if they are told the first command.**

The finding is a plain one. `claude plugin install` searches *configured*
marketplaces, and NoaCG is not in any list Claude Code ships with, so a person who has heard of us
and types the obvious thing gets nothing. Reproduced in a pristine config directory:

```
$ CLAUDE_CONFIG_DIR=<fresh> claude plugin install noacg --json -y
{"command":"install","outcome":"failed","plugin":"noacg",
 "message":"Plugin \"noacg\" not found in any configured marketplace","failureCode":"not_found"}
```

Adding the marketplace first makes both commands work, and it is quick:

```
$ CLAUDE_CONFIG_DIR=<fresh> claude plugin marketplace add NoaCG/NoaCG-Studio
  SSH not configured, cloning via HTTPS: https://github.com/NoaCG/NoaCG-Studio.git
  ✔ Successfully added marketplace: noacg-studio          # 23:07:19 -> 23:07:34, 15 s
$ CLAUDE_CONFIG_DIR=<fresh> claude plugin install noacg --json -y
  {"outcome":"ok","pluginId":"noacg@noacg-studio","scope":"user"}   # 23:09:27 -> 23:09:28, 1 s
$ claude plugin list
  noacg@noacg-studio   Version: 0.3.3   Scope: user   Status: ✔ enabled
```

The repository is genuinely public and anonymously reachable, which is the thing that would sink
this if it were wrong: `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/NoaCG/NoaCG-Studio`
-> `200`, and the raw `marketplace.json` -> `200`.

The shorthand `NoaCG/NoaCG-Studio` in `cli/README.md` is correct. Claude Code detects that SSH is not
configured and falls back to HTTPS by itself - four fresh config directories, four clean runs. I
briefly thought otherwise: my first attempt died on `SSH host key is not in your known_hosts file`,
and that turned out to be an artefact of my own over-long scratchpad path, reproducible on demand at
that path and never at a normal one. It is recorded here only so nobody re-finds it and files it.

**The smallest fix, and it needs the owner.** Getting `claude plugin install noacg` to work with no
prior step means being listed in a marketplace Claude Code already knows - `anthropics/claude-plugins-official`,
which is a pull request against someone else's repository from an account. That is the owner's call
and the owner's account; I am not guessing at it. Until then the marketplace-add line is not
optional documentation, it is step one, and every place that tells someone how to install must lead
with it. `cli/README.md` does. **needs: account**

**A caveat for Windows, which is where students are.** The clone failed outright for me at a
config-directory path around 190 characters with `Filename too long`, because `core.longpaths` is not
set on this machine and this repository has deep paths. A default `~/.claude` is short and fine.
Somebody with a long Windows user name, or a redirected profile, will not be.

### The plugin installs, and then quietly stops being the plugin

This laptop - the one demos run from - loads **0.2.0**, nineteen days old:

```
$ claude plugin list
  noacg@noacg-studio   Version: 0.2.0   Scope: user   Status: ✔ enabled
```

The marketplace checkout behind it was cloned on 2026-08-28 and never refreshed
(`~/.claude/plugins/known_marketplaces.json`, `"lastUpdated": "2026-08-28T11:25:47.632Z"`), and is
still pinned to the pre-rename `miwco/NoaCG-Studio`, which works only because GitHub 301-redirects
it. The skill text a session actually loads is 96 lines against the repository's 107. Nothing warns
about this, and the plugin reports itself enabled and healthy either way. Codex on the same machine
holds 0.3.3, so this is specific to the Claude Code install.

Filed: `docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md`. The one-line
repair for this laptop is `claude plugin marketplace update noacg-studio`, and I
have deliberately not run it: it would swap the skill text under other sessions working tonight.

**2026-09-17: the silence is fixed, the install is not.** `noacg doctor` now prints the installed
skill's version whenever it is behind the CLI, with the harness's own update command
(`docs/AGENT_CLI.md`, "The installed skill can be older than everything else"). This laptop still
holds 0.2.0 - running the repair is still a job for a quiet machine.

---

## 2. The chain, leg by leg

Timed individually, published 0.3.3, against `https://noacg.studio`.

| Leg | Command | Time | Result |
|---|---|---|---|
| Check the setup | `noacg doctor` | **3 s** | deployment, browser, `bridge v1 (main@ec16adf855)`, login state |
| The same with no install | `npx -y @noacg/cli doctor` | **4 s** | identical (npm cache warm - a cold machine pays the download too) |
| See what exists | `noacg types` | **2 s** | 67 types with fields, events, designs |
| Make one | `noacg scaffold --type scoreboard --design sb01 --name "Audit scoreboard" --out <dir>` | **3 s** | 14 files, fonts and GSAP bundled locally |
| Gate it | `noacg validate <dir> --screenshots <shots>` | **10 s** | exit 0, 7 readiness rows, 3 PNGs |
| Read the operator surface | `noacg inspect <dir>` | **2 s** | 4 inputs, 4 buttons, 3 state groups |
| The contract the agent reads | `noacg docs contract` | instant | 402 lines / 22 KB (~5.5k tokens) |

**Where the minutes go: they don't.** Everything a stranger does before touching their account is
twenty seconds of tool time (3 + 2 + 3 + 10 + 2; the `npx` row is the same `doctor` by another
route, not an extra step). The cost in this chain is not the tools, it is the design work
between `scaffold` and `validate`, which is the agent's thinking and is supposed to be where the
time goes.

`validate --screenshots` standing on its own had never been run before tonight, noted by SE as a
completeness gap in method. It works: exit 0, three frames written. That gap is closed in fact,
and this file is the evidence for it.

**Exit codes are honest**, which matters more than it sounds because an agent reads them. Checked by
redirecting rather than piping, since a pipeline reports the pipe's status:

```
$ noacg validate <good package> --no-bench > log 2>&1; echo $?     -> 0
$ noacg validate lower-third.svg          > log 2>&1; echo $?      -> 2
$ noacg validate sample.png               > log 2>&1; echo $?      -> 2
```

### The gate teaches, and once it is wrong

The validator's warnings read like a person wrote them, which is the best thing in this whole walk.
From the lower third: *"Supporting text ("Reporter, Helsinki") is 22px - a little under the ~24px we
prefer for TV viewing distance. Readable, but 24px+ reads more comfortably."* That is a sentence a
student learns from.

But on the scoreboard it fires twice on something that is not true:

```
WARN legibility-protection: "HOME" sits straight over the picture with no panel, shadow or
outline behind it - it will be hard to read over busy footage.
```

The screenshot written by that same command shows white text on a solid near-black slab. The cause
is exact: the chassis paints its slab on `.scoreboard-box::before`
(`src/templates/scoreboards/sb01.ts:77`), and `resolveBacking`
(`src/validation/readabilityCheck.ts:136`) walks real DOM ancestors with `getComputedStyle(node)`
and never asks for a pseudo-element, so every ancestor reads transparent and the
"unprotected over video" branch fires. It happens on a chassis we ship, so it is the first thing a
stranger's first scoreboard tells them, and it drops the readiness row *Reads where it will be
watched* to WARN on a package that deserves PASS.

Filed: `docs/backlog/the-legibility-check-cannot-see-a-slab-painted-on-a-pseudo-element.md`.
Smallest fix named there: have `resolveBacking` also read `::before` / `::after` when the element's
own background is transparent.

### The last hop is not ours

`noacg save` puts a graphic in the **library**. Putting it in a production and taking it to air is a
dashboard action - there is no CLI verb for either, by design (`save` = the library, never a
production). So the agent door does not reach the end of the sentence "make a graphic, publish it,
put it in a production and play it out": it reaches the library and stops, and a person finishes in
the browser.

I judge that correct rather than a gap, and the reason is whose hands those two actions belong in.
Choosing which graphic goes into tonight's production, and pressing TAKE while something is on air,
are operator decisions with an audience on the other end. An agent that could do the second one
unattended is a worse product, not a better one. What would be a real gap is if the handover were
hard to find, and it is not: `save` prints the `#/graphic/<id>` link to the graphic in the library.

**And it does reach air, driven end to end.** `scripts/save-to-air-bench.mjs` walks the whole thing
headlessly against `https://noacg.studio` with the shared test account, including pressing Allow on
the real consent page. I re-derived it rather than citing anyone (job `j-1226`, 2026-09-16):

| | |
|---|---|
| `scaffold` (neutral) | **1.8 s** |
| `login`, interactive consent | **4.6 s**, exiting 4.01 s after Allow with the tab still open |
| `save` -> `#/graphic/50fc20fb…` | **7.0 s** |
| the library shows it | +3.6 s |
| make a production, put the graphic in it, publish | +0.2 s, +0.1 s, +0.9 s |
| open the output URL cold and let it settle | +2.9 s |
| TAKE -> the entrance -> a readable frame | +0.2 s, +0.5 s |
| **`save` returning -> readable on the public output URL** | **8.4 s** |
| the same take again, warm, output page already open | 0.2 s to the entrance, 0.6 s readable |

Two qualifications I would make unprompted. It is DRIVEN, so nobody's thinking or typing is inside
those numbers - the take figures are the product's own, and a person doing this by hand is slower by
however long they take to decide. And the output URL is opened cold inside the measurement, where a
real gallery leaves a browser source open, which makes the 8.4 s pessimistic by roughly the 2.9 s
settle. The run cleaned the shared account after itself: production unpublished and deleted, graphic
deleted, key revoked, `logout` exit 0.

One thing to fix in the instrument rather than the product: it runs the CHECKOUT's `cli/dist`, not
the published CLI, so my first attempt (`j-1223`) died with `Cannot find module …\cli\dist\index.js`
in a worktree that had never been built. `npm --prefix cli install && npm --prefix cli run build`
fixed it. It then waited **19 minutes** for a turn behind another session's browser job, because one
browser job runs per machine - working as intended, and worth knowing if somebody plans to measure
this on the day.

---

## 3. Can they hand over an SVG or an image?

**Not through this door.** The CLI has no import verb - the set is doctor, types, scaffold, validate,
inspect, screenshot, pack, docs, login, logout, whoami, save, caspar, mcp.

```
$ noacg import                        -> Unknown command "import".
$ noacg validate ./lower-third.svg    -> expected a package directory or a .zip file.   (exit 2)
$ noacg validate ./sample.png         -> expected a package directory or a .zip file.   (exit 2)
```

The message is clear and the exit code is right. The studio, meanwhile, does this properly:
`src/assets/svgImport.ts` parses, sanitizes and inventories a dropped SVG without redrawing it,
`ImportDesignStep` accepts `image/*,.svg,.html,.htm,.zip`, and `MapSvgFieldsStep` binds its text
nodes to fields. So the capability exists and is good; it is browser-only.

The part that worries me is not the missing verb, it is the silence. `grep -ci "svg"
cli/plugin/skills/noacg-graphic/SKILL.md` returns **0**: the skill does not contain the word at all,
and its single sentence about importing is about zipping a finished package for the studio's Import
door. An agent handed a customer's SVG therefore has no instruction and will do the
obvious confident thing: redraw the artwork as HTML. That produces a clean `validate` and the wrong
graphic - which is precisely what the import module's own header says it exists to prevent, calling
a verbatim import "the user's exact graphic". A wrong answer that passes the gate is worse than a
refusal.

Filed: `docs/backlog/the-agent-door-has-no-answer-for-here-is-my-svg.md`. Smallest fix named there
is text, not code: teach the skill to say "I cannot import your SVG here, use the studio's Import
door" instead of improvising.

---

## 4. Can they just describe what they want?

**Yes, and this is the strongest thing in the walk.** One sentence - *a lower third for a Finnish
news interview, name and role* - through the skill's own road:

```
$ noacg scaffold --type lower-third --design lt11 --name "Interview lower third" \
        --set name="Anna Virtanen" --set title="Reporter, Helsinki" --out ./lt      # 2 s
$ noacg validate ./lt --screenshots ./lt-shots                                      # exit 0
  OK - 0 error(s), 1 warning(s)
```

I judged the frame, not the exit code: `lt-shots/onair.png` is a dark slab in the lower-left safe
area with an amber accent bar, the name in bold white, the role in tracked-out amber caps. It is
production-credible as it stands - I would put that on air. The `--set` values landed in the fields,
and `inspect` shows them as the operator's two inputs. Twelve seconds from sentence to a frame worth
looking at.

Two honest qualifications. The type and the design id were chosen by me, an agent that had already
read `noacg types`; the road works because the catalog is good, not because anything guessed. And
this is the *authoring* road, not the hosted Create-with-AI surface, which is paid and out of scope
tonight - so what a non-technical person gets from a sentence in the browser is **UNVERIFIED** here.

One thing to know rather than fix. Validate reported for this design:

```
Engines: Needs a browser engine of Chromium 111 or newer — CasparCG 2.3.x, OBS Studio 30.x,
         vMix 27+ will not render it as designed.
```

The ceiling is `color-mix()` (`src/validation/engineSupport.ts:87`), tracked deliberately, and the
effect is that one declaration drops rather than the graphic breaking. The tool says so plainly,
which is the right behaviour.

I first read that line as bad news for students and it is not, which is worth writing down because
the warning's wording invites the mistake. `PLAYOUT_ENGINES` (`engineSupport.ts:172-180`) puts a
CURRENT OBS at Chromium 127, measured 2026-08-07 - comfortably past 111. The `obs-30` entry that
appears in the warning is labelled in the source as "an OBS not updated since 2023". So the graphic
is fine on anything a student installs today, and the affected population is somebody running a
three-year-old OBS. Not a defect and not filed. What is mildly awkward is only that the news arrives
at `validate` rather than at `scaffold`, after the design has been chosen.

---

## 5. The MCP entrance

**It works, and for a Claude Code user it is not worth its process.** Driven over stdio with a real
JSON-RPC client (`initialize`, `tools/list`, `tools/call`):

```
INIT ok: noacg 0.3.3
TOOLS: ["noacg"]  schema properties: command,path,out,type,design,fields,name,values,palette,
       font,zone,bench,houseContract,screenshots,state,data,topic,folder
CALL  command=inspect, path=<lt>  -> the same operator surface the terminal prints
```

A wrong call is answered well: passing `args` instead of `path` returned `noacg inspect needs
"path".` - one line, and it names the fix.

The cost, measured rather than assumed. `claude plugin details` prices the plugin honestly and the
server not at all:

| | always-on | on invoke |
|---|---|---|
| `noacg` plugin | **~132 tok** | ~1.9k (the skill, when it fires) |
| `noacg-mcp` plugin | reported as ~0 - *"tool schemas resolved at runtime; not counted"* | - |

So I measured what it actually injects: the `tools/list` payload is **2489 characters, ~622 tokens**,
in every session, plus a node process. Against a plugin that costs ~132 tokens always-on and only
pays for itself when a graphic is being made, the server is about **4.7x** the standing context -
and for a SMALLER verb set, not the same one: `MCP_COMMANDS` (`cli/src/mcp.ts:40`) exposes seven
verbs, so `doctor`, `login`, `logout`, `whoami`, `pack` and `caspar` are not behind this door at all.
The marketplace description already says it "costs a process and some context"; that is true and now
has a number behind it.

**These numbers disagree slightly with our own, and I am not going to pretend they don't.**
`docs/AGENT_CLI.md` ("What a session pays", measured 2026-09-02) records 151 tokens always-on and a
2,434-char / 590-token schema, which would make the ratio 3.9x. Mine are 132 and 2,489 / 622,
measured tonight against 0.3.3 in a fresh config directory with `claude plugin details` and a real
`tools/list` call. Both are the right order of magnitude and neither changes the judgement. The
likely causes are two weeks of drift between 0.2.x and 0.3.3 and two different tokenizers - that
document says outright that its own figures come from public tokenizers and will not match
Anthropic's exactly. Worth one re-measurement by whoever next touches that table, rather than two
numbers sitting in two files.

My judgement: keep it, recommend it to nobody who has a terminal. It is the right answer for an MCP
client that cannot run shell commands, and the wrong default for Claude Code and Codex, which is how
it is already shipped - optional, and second in the list.

---

## 6. Codex

**The same plugin installs and loads there, verbatim from the documented commands.** In an isolated
`CODEX_HOME`:

```
$ codex plugin marketplace add NoaCG/NoaCG-Studio
  Added marketplace `noacg-studio` from https://github.com/NoaCG/NoaCG-Studio.git.
$ codex plugin add noacg@noacg-studio
  Added plugin `noacg` from marketplace `noacg-studio`.
$ codex plugin list
  noacg@noacg-studio      installed, enabled  0.3.3
  noacg-mcp@noacg-studio  not installed
```

The skill and its five reference documents land on disk, and both manifests
(`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`) are complete. The machine's real Codex
home already holds **0.3.3** - current, where Claude Code's is not.

**Whether a Codex *session* then picks the skill up and runs the verbs is UNVERIFIED.** Two bounded
attempts through the rescue workflow, neither of which reached a Codex turn, and neither of which
failed for the reason worth knowing about - Codex capacity never refused anything:

1. `401 Unauthorized: Missing bearer or basic authentication in header` against
   `https://api.openai.com/v1/responses`. My fault: I had pointed `CODEX_HOME` at the isolated
   profile I installed the plugin into, which carries no credentials. It tested my setup, not the
   product.
2. Re-run against the machine's real, authenticated Codex home, which already holds 0.3.3. It died
   before launching: `exec_command failed: CreateProcess { message: "Rejected(\"Failed to create
   unified exec process: CreateProcessWithLogonW failed: 267\")" }` - a Windows sandbox error
   (267 is `ERROR_DIRECTORY`), 10.7 s, no Codex turn, no tokens spent.

Cost: two rescue subagents, ~57k subagent tokens, zero Codex model tokens and zero weekly capacity,
because no turn ever started. I stopped there rather than take a third attempt: this leg was
budgeted for one.

So what stands is the install and the load, both proven above and both on disk. What is open is one
question only: does a Codex session, handed "make me a graphic", find `noacg-graphic` and follow it?
The verbs are the same binary this audit already exercised, so this is about skill discovery, not
execution - but it is the half that matters for the claim "it works in Codex too", and tonight I
cannot say it.

---

## Defects filed

| Defect | Smallest fix named | File |
|---|---|---|
| The legibility check misses a slab painted on `::before`, so a shipped scoreboard chassis is warned about twice, wrongly | `resolveBacking` reads `::before` / `::after` when the element's own background is transparent | `docs/backlog/the-legibility-check-cannot-see-a-slab-painted-on-a-pseudo-element.md` |
| Nothing tells a user their installed plugin is stale; this laptop runs 0.2.0 | one row in `noacg doctor` comparing the running skill against the shipped version - **done 2026-09-17**, the file now holds only the marketplace re-point | `docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md` |
| The agent door has no answer for "here is my SVG", so an agent will redraw it | a section in `SKILL.md` telling the agent to send the user to the studio's Import door | `docs/backlog/the-agent-door-has-no-answer-for-here-is-my-svg.md` |

Nothing was fixed in code tonight. Nothing found was a broken link or a wrong command in a README -
the documented commands all ran as written - so there was nothing trivially safe to repair.

---

## The verdict

**Yes to both, on the road this is strongest on - two commands and sixteen seconds to install, one
sentence to a broadcast-credible graphic, and 8.4 seconds from `save` to that graphic readable on a
public output URL, all of it run tonight - provided the marketplace line is treated as step one
rather than a footnote and this laptop's own nineteen-day-old plugin is updated; the
one thing I would not promise a stranger is that they can hand over their own SVG through an agent,
because the door has no answer for that and an agent will quietly redraw it instead.**
