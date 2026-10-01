# What's new and the roadmap

The notes behind two public pages: `/whats-new` (one file per update here) and `/roadmap`
(`roadmap.md` here, placed by `docs/GOALS.md`). Both pages are generated at build; nothing is
copied into HTML by hand.

## Writing an update

About twice a week, only the biggest changes, so a visitor can tell in a minute what moved.

1. `npm run whats-new:draft` prints what landed on `origin/main` since the newest update, grouped
   by area, plus what the CLI and Bridge changelogs already say for users. It is raw material:
   most of it is internal and stays out.
2. Write `docs/whats-new/<YYYY-MM-DD>.md`, named for the day you write it:

   ```
   ## Playout systems

   - Rundowns have folders. A folder can step through its cues one by one, and All out
     clears everything on air.

   ## NoaCG Bridge

   - The Bridge remembers your CasparCG servers and connects to the last one by itself.
   ```

   - Areas, in this order: Playout systems, Editor and templates, CLI, MCP server, AI workflows,
     NoaCG Bridge. Leave out an area with nothing big in it; never write it empty.
   - At most 4 bullets an area and 12 an update, each at most 30 words. A wrapped bullet
     continues on a line indented two spaces.
   - Say what changed for the user, in plain words: what they can now do, or what no longer goes
     wrong. Not the pull request title, not how it was built.
   - Only what is true and public today: check each claim against the current state in
     `docs/GOALS.md`. A CLI or Bridge change counts once that version is released.
   - No pull request numbers, file paths, code names, internal plan or row names, people,
     partners, customers, shows or dates, nothing from `docs/private/`, no hype words, no
     exclamation marks and no em dashes.
3. `npm run check:whats-new` refuses what breaks these rules, with the line and the reason. The
   build runs it too, so an update that fails it cannot ship.

## The roadmap

`roadmap.md` says each GOALS outcome in plain words; GOALS decides whether it shows under Now,
Next or Later. `npm run check:roadmap` fails when the two disagree, and the file's own preamble
says how to fix each case.
