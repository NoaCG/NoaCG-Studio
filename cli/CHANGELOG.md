# Changelog - @noacg/cli

What changed in each published version, written for someone who uses the CLI, the MCP server or
the plugin. This file ships in the package, so a version's section is what the npm page shows,
and the build refuses a version that has no section here (`cli/scripts/release-notes.mjs`).
NoaCG Bridge, the other program built from this package, has its own `BRIDGE_CHANGELOG.md`
and its own release page on GitHub.

Write a section the way you would tell a colleague what they get by updating: what was wrong or
missing, what it does now, and anything they have to do. No pull request lists, no usernames, no
internal names.

## 0.7.1 - unreleased

**New: see every state of a graphic, at any moment, over video.** `noacg screenshot` takes
`--event` (repeatable) to drive the graphic the way an operator does after the Take: its own
buttons, with the payload each press carries, plus `next`, `out`, `field=value` updates and
`wait:4s`. `--at 4s` picks the moment after the last press, on a clock the run controls, so the
frame is the same every time and two minutes later costs seconds. `--background video` paints a
video-like plate behind the graphic; a colour, `checker` or your own image work too.
`validate --screenshots` now also writes one frame per state the graphic's events reach, such as
`pp-b.png` or `timer-running.png`, and prints the presses that reproduce each one. Frames without
these flags are unchanged.

**New: the MCP server sees those states too.** The `noacg` tool's `screenshot` verb takes
`events`, `at` and `background`, the same as `noacg screenshot --event/--at/--background`, and
answers with the frame and the machine state it shows. `validate` with `screenshots: true` returns
one frame per state the events reach, each named with the presses that reproduce it, and takes
`background` as well.

## 0.7.0 - 2026-10-02

**New: `noacg bridge` remembers your CasparCG servers.** The servers NoaCG connects to through the
Bridge are kept in `caspar-servers.json` next to the Bridge's token, so a browser that pairs gets
the last one back and connects to it by itself. Connecting only asks the server for its version.

**New: `noacg pack --save`.** Sends several graphics as one package to your NoaCG Home, with
their layers and an optional `--rundown` of cues. Press Install on Home → Productions and the
production opens, ready to run. It uses your existing `noacg login` key and works from any machine.

**Fixed: `validate` now keeps the step count right for you.** Adding a waypoint to a machine's
default path by hand used to leave the SPX `"steps"` at its old value, so the OGraf `stepCount`
was too low and a playout server offered no Continue for the new step, while validate stayed
green. Validate now derives the number from the default path, writes it into the html, and
prints a `Steps:` line naming the old and new value. Nothing to do: change the path, not the
number.

**Changed: the skill leaves the look to your agent, and teaches the operator's side instead.**
The `noacg-graphic` skill no longer carries any taste rule by default; even the "entrances
0.5-1.4 s" line is gone from the contract, because it cut a slower build a gala title wanted. A
new "Fields and behaviour" section covers what decides whether one person can run the graphic
live: what changes during the show and what is set once, set-once words kept off the operator page
as hidden fields, counters as numbers, and defaults that are a safe sample or empty instead of
"Host Name". The contract reference gains five worked patterns: an optional line that collapses
when empty, a state's word from a hidden field, a timer beside the main lifecycle, a graphic that
ends its own timed state, and a button that works in every state. Step 5 now gives a zip
command for Windows, macOS and Linux.

**New: two opt-in design tools, both off unless you ask.** Ask your agent to "critique and
improve my graphic" (or run `/noacg:graphic --critique ./my-graphic` in Claude Code) and it renders
the graphic, judges it against the brief, makes the changes that matter and shows you before and
after. Ask for NoaCG's design guidelines (or `/noacg:graphic --guidelines`, or put the line
`NoaCG design guidelines: on` in your project's `CLAUDE.md` or `AGENTS.md`) and it follows NoaCG's
own rules for type, colour, placement and motion. Neither costs anything in a session that does
not use it.

**New: `NOACG_CREDENTIALS_DIR`.** Names the folder where `noacg login` keeps its key, for when
one account needs more than one login at a time, for example several project folders whose
agents each log in and out. A `logout` in one folder then leaves the others signed in, and
`noacg doctor` shows the folder in use. Unset, the key stays where it always was, so there is
nothing to do.

**New: `noacg mcp` is in the official MCP Registry**, as `io.github.NoaCG/noacg`, so MCP server
directories that read the registry can list it and keep it at the newest version. Every release
from now on updates it there by itself. The package carries `mcpName` for that; nothing changes in
how you run it.

**The plugin is now called NoaCG Broadcast Graphics and Playout** in plugin lists (NoaCG Graphics
and Playout in Codex, which allows 30 characters), with a description that names lower thirds,
scoreboards, tickers, CasparCG, OBS and vMix, so a search for those words finds it. It installs
under the same name, `noacg`. In a Claude Code session you can now install it in one command,
`/plugin install noacg --marketplace NoaCG/NoaCG-Studio`, and each plugin's README says exactly
what it runs and what it sends.

## 0.4.1 - 2026-09-23

**New: `noacg bridge`.** It runs NoaCG Bridge, the local program that lets the NoaCG page in your
browser drive a CasparCG server on your studio network without the CasparCG Client, and replaces
`noacg caspar agent`, which still runs it under the old name. Operators get the same program as
a download, `NoaCG-Bridge.exe`, from the repository's GitHub Releases page, and need nothing
from this package; the command here is for anyone who already has it installed.

**Pairing is a link, not a token to paste.** The Bridge prints and opens a link; one click on
that page pairs the browser. The code in the link works once, for two minutes, and the token
never travels in a URL. Anyone paired with the old agent stays paired.

**The production page can cue what is already on the server.** "From the playout server…" lists
the CasparCG box's own templates and media (through the server's media scanner) and adds them
to the rundown beside the production's graphics. A server template is taken with its field
values as JSON, updated, stepped and taken off; a clip rolls, pauses, resumes and stops. NoaCG's
own graphics still go on air the one way they always have - the output URL on the channel - so
a quiz reveal or a score change works exactly as before.

**Clip lengths in the server list are right.** CasparCG lists a clip's frame timing as seconds
per frame, and `noacg bridge` read it as frames per second, so a 27-second clip listed at a
thirtieth of a frame a second and looked hours long. It is read the right way round now.

**Fixed: a clip whose name has an ä or an ö.** The AMCP wire was written and read as latin1; it is
UTF-8 now, so `Jääkiekko.mp4` lists and plays under its own name.

**`noacg pack` says when a name was not quoted.** `--name My Pack` without quotes used to call
the pack "My", start the browser, and then fail on a package called "Pack" that does not exist.
Every package path is now checked first, and a missing one is named with the quoting that fixes
it: `--name "My Pack"`.

**What to do.** Nothing, if you use `npx`. If you had `noacg caspar agent` in a startup script,
`noacg bridge` is its new name; both work. The studio needs a Bridge of this version or newer:
an older agent is told apart from a missing one, and Settings -> Playout says "update NoaCG
Bridge".

## 0.3.4 - 2026-09-20

**Fixed: `validate` could show you old screenshots while reporting success.** If the screenshots
folder was inside the graphic's own folder - which is where `noacg validate . --screenshots ./shots`
puts it - the next validate read the previous frames back in as if they were the graphic's images,
then wrote them over the frames it had just taken. You edited the CSS, validated, got `OK`, and
looked at a picture of the version before your edit. `thumbnail.png` was stuck on the first
validate for the same reason, and the generated control page grew from about 40 KB to about 1 MB.

A screenshots folder inside a package is now marked with a small `.noacg-frames` file and is never
packaged, validated or saved. `noacg screenshot --out` marks its folder the same way, and tells
you when you write a frame straight in among the graphic's own files, where it cannot be told
from an image the graphic uses.

**Nothing to change in your graphics.** If a package already has a `shots` folder from an older
version, run `validate --screenshots` on it once and it is marked.

**`doctor` tells you when the installed plugin is older than the CLI.** A Claude Code or Codex
plugin never updates itself, so a session could be reading an old copy of the `noacg-graphic`
skill. `noacg doctor` now names the installed version and prints the two commands that update it.

Also live for every version, because it ships with the NoaCG site and not with this package: the
stress screenshot no longer cuts a long line in the middle of a word, and a dropdown whose options
are all the same length (a quiz board's "Answers shown: 2, 3, 4") is stressed with its last
option, so every answer row is in the picture.

Update: `npm i -g @noacg/cli`, or nothing at all if you run it through `npx -y @noacg/cli`. Plugin:
`claude plugin marketplace update noacg-studio && claude plugin update noacg@noacg-studio`.

## 0.3.3 - 2026-09-16

**Fixed: `noacg login` kept running after it had your key.** It now exits as soon as the browser
hands the key back, so an agent waiting on the command is not left hanging.

**`validate` tries every operator button, not only Take and Out.** The runtime check now presses
each button a graphic's state machine defines and measures the result, so a state only a button
can reach (a scoreboard's Final, a quiz's Reveal) is checked too. Where it cannot reach a state it
says so with a `bench-skipped` note instead of passing silently.

## 0.3.2 - 2026-09-15

**An agent may now write a graphic's state machine itself.** The `noacg-graphic` skill used to say
that operator buttons beyond Take, Update, Next and Out were "a later capability", so a graphic
that needed them either started from an existing type or kept its state in fields somebody has to
type. The skill's contract reference now has the operator-action section: what a graphic with its
own buttons declares, a worked example, and the three checks that stand behind it.

**The skill says what those three checks really do.** `validate` reports a control that names an
event no arrow fires as a WARNING, not an error, and that is the likeliest typo in a hand-written
machine: the button is silently never drawn. The skill now tells the agent to read the machine
findings, to let the runtime check walk the buttons, and to show the person their buttons from
`noacg inspect` before saving.

**`noacg caspar` was run against real CasparCG servers** (2.3.2 and 2.5.0) for the first time, and
the message after taking a production off a channel no longer reads as though it were still on.

## 0.3.1 - 2026-09-10

**Fixed: a name with a space in it was silently cut.** `noacg save ./my-graphic --name Football
scoreboard` saved a graphic called "Football" and said nothing. Every command that takes a package
(`save`, `validate`, `inspect`, `screenshot`, `scaffold`), and `login` and `caspar`, now refuses a
stray word and shows the quoted form.

**`noacg types` fits the terminal it is printed in.** The table was up to 354 characters wide, so
in an ordinary terminal every row wrapped and the columns stopped lining up. It now shortens cells
to the terminal's width. Piped output, which is what a coding agent reads, still carries every
cell in full, and `--json` is unchanged.

## 0.3.0 - 2026-09-05

**The MCP server is one tool, and it is optional.** The seven MCP tools became a single `noacg`
tool that takes the same verbs and flags as the terminal (`{ "command": "validate", "path":
"./my-graphic" }`), so there is one grammar to learn. The server moved out of the `noacg` plugin
into a separate `noacg-mcp` plugin: installing `noacg` alone brings the skill and runs nothing in
the background until a graphic is being made.

**Much lighter to start.** The browser driver and the zip library are loaded the first time a
command needs them, not at startup, and the plugin's MCP server runs as one process instead of
two. An idle server went from about 83 MB to about 37 MB.

**The first version published from GitHub Actions** with npm trusted publishing. 0.2.0 was
published by hand with a token; from here on no publish token exists anywhere, and every version
carries a signed provenance statement linking it to the commit that built it.

## Earlier versions

0.2.0 (2026-08-25) was the first published version: the terminal commands, the MCP server and the
plugin, published by hand.
