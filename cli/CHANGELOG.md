# Changelog - @noacg/cli

What changed in each published version, written for someone who uses the CLI, the MCP server or
the plugin. This file ships in the package, so a version's section is what the npm page shows,
and the build refuses a version that has no section here (`cli/scripts/release-notes.mjs`).
NoaCG Bridge, the other program built from this package, has its own `BRIDGE_CHANGELOG.md`
and its own release page on GitHub.

Write a section the way you would tell a colleague what they get by updating: what was wrong or
missing, what it does now, and anything they have to do. No pull request lists, no usernames, no
internal names.

## 0.4.1 - unreleased

**New: send a whole graphics package to NoaCG with `noacg pack --save`.** `noacg save` puts one
graphic in your library; a show usually needs several, on their own playout layers, with a
running order. `noacg pack ./opener ./strap ./scorebug --name "Friday Fight Night" --save` now
validates every graphic and sends them together to your NoaCG Home, where the package waits on
Home → Productions with an **Install** button. Install creates the production and opens its
rundown. Add `--rundown cues.json` (a list of `{ "graphic", "label", "values" }` in show order)
to send the cues too, and `--layer` to set the layers. It uses the key `noacg login` already
gave you, so it works from any machine, a cloud agent included; there is nothing to re-authorise.
`--out` still writes the package as a file for the Import a package card, and can be combined
with `--save`. The MCP tool has the same verb: `command: "pack"`. The skill now tells agents to
use it when you ask for a package rather than a single graphic.

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
