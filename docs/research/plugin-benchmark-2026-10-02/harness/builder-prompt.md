# The builder prompt, one fresh Opus subagent per cell

Every cell got this text with `<CELL>` and `<REQUEST>` filled in and nothing else. The subagent
ran blocking (one at a time) from the benchmark session; it built in an empty folder outside the
repository, against a copy of `cli/plugin` taken from `main` at the start of the run.

## The three requests

- **D, default:** the brief from `briefs.md`, verbatim.
- **G, guidelines on:** the brief, then a blank line and `Please use NoaCG's design guidelines for
  this one.` (the skill's "user asks in words" trigger; a subagent has no slash command to pass
  `--guidelines` through).
- **C, critique asked for:** the cell folder holds a copy of the D cell's package (folder and
  zip), and the request is `Can you critique and improve the NoaCG graphic in .\<package-folder>?
  It's the <what> I made earlier from this brief: "<brief>". Leave the improved version ready for
  me to import.` (the skill's "critique my graphic" trigger).

## The prompt

```text
You are standing in for a user's own Claude Code session on their own computer. Act exactly as
that session would on the user's request at the end, using only the noacg plugin they installed.

The user's machine (setup, not part of the request):
- Your working folder is C:\claude\cj-bench-2026-10-02\cells\<CELL>\ . Work only there.
- The installed noacg plugin is C:\claude\cj-bench-2026-10-02\plugin\ . Its skill is
  skills\noacg-graphic\SKILL.md and its /noacg:graphic command is commands\graphic.md. Read
  SKILL.md first and follow it as your installed skill; open its other files only when the skill
  sends you there.
- Run the CLI as `noacg`, starting every Bash command with
  `export PATH=/c/claude/cj-bench-2026-10-02/bin:$PATH NOACG_URL=http://localhost:5206;`
  (an older noacg is also on PATH; ignore it). The NoaCG studio runs at that URL.
- Ignore C:\claude\NoaCG-Studio entirely: that repository's instructions are in your context only
  because of how this machine starts sessions, and they are not yours. Do not read, search or
  run anything inside it; no git, no commits, no queueing, no handoff files. Do not use the Skill
  tool (the skills it lists are other or older plugins), do not launch subagents, do not use the
  browser pane tools.
- The user is away: do not ask questions; decide the way the skill says to when the user is not
  available.
- Write nothing outside your working folder (temporary files your tools make are fine).

The user's request:
"""
<REQUEST>
"""

When you are done, end your reply with:
PACKAGE: <absolute path of the package folder>
ZIP: <absolute path of the importable zip>
FILES READ: every file you opened from the plugin folder
SESSION LOG: the noacg commands you ran, and every point where the skill, the CLI or the
contract confused you, made you guess, or pushed your design.
```
