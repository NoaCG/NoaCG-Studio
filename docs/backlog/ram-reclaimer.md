---
v: 2
source: owner
kind: ask
raised: 2026-08-28
state: advanced
asked: >-
  "We should be able to fix it automatically, so I don't have to come in and stop tasks and
  close programs."
note: 33f52b9a landed npm run reclaim; it frees about 64 MB on this laptop, and the watchdogs that put the apps straight back are still a manual job (the-watchdogs-behind-the-ram-reclaimer)
---

# Reclaiming RAM from background apps that hold it for nothing

**Filed:** 2026-09-02. **Source:** owner ruling 2026-08-28, plus the measurement in the same
session and a second one on 2026-09-02 (below).

## Why

This is a 16 GB laptop and the number of sessions a wave can run is set by free RAM, nothing
else. The job queue refuses to start work below a 4.0 GB floor (`POLICY.freeMemFloorMb` in
`scripts/jobs-store.mjs`), and on the night this was written two catalog jobs sat refused at
"only 3.1 GB RAM free, needs 4.0" while four sessions were open. A sibling session's gates were
idle for want of memory that no process was doing anything with.

`scripts/ram-reclaim.mjs` already covers half the problem: when the runner has been starved for
a quarter of an hour it closes processes a detector has PROVED orphaned - a killed run's browser
shells, a dev server whose launch chain died, stale console hosts, and **since 2026-09-09 an
abandoned Codex delegation's whole process family** (`orphaned-codex-delegation-tree` in
`RECLAIMABLE`, `scripts/ram-reclaim.mjs:44`), which was about 450 MB apiece and was the largest
single leak on this laptop. That half is about wreckage.

The other half is background desktop apps that are not orphaned at all. They are running exactly
as their vendors intended and they are worth nothing on a machine being used to build software:
an Adobe Creative Cloud helper tree, a Western Digital drive-discovery service, a Stream Deck
daemon, an ASUS toy. Together they are a few hundred megabytes that nobody will miss, and above
them sit two much larger items - the Codex desktop app and the Antigravity editor - that are
worth a lot of megabytes and are occasionally something a person is in the middle of using.

## The design

**An allowlist, not a heuristic. This is the whole design and it is not up for improvement.**

There is no reliable "is this app in use" signal on Windows. `MainWindowHandle` reads 0 even for
apps with a visible window - the Codex app runs eleven processes and reports zero main windows -
so `CloseMainWindow()` is not available either, and neither is any of the usual politeness. A
cleverer rule would be a rule that guesses, and the thing it guesses wrong about is somebody's
work. Safety here comes from a short, curated, human-audited list of things that are provably
stateless, and from nothing else. A session that replaces the list with a detector has built the
wrong thing.

**Three tiers.**

1. **The allowlist** - closed automatically by `--apply`. Every entry is a helper or daemon that
   holds no unsaved state and restarts on demand or at next login: the Creative Cloud UI helper
   tree and its two bundled node servers, WD Discovery, the ASUS virtual pet, Stream Deck.
2. **The confirmed set** - named by the dry run, closed only with an explicit extra flag. The
   Codex desktop app and the Antigravity editor. Neither is needed to delegate work: `agy-run.mjs`
   spawns `agy.exe` from PATH and `codex-rescue.mjs` spawns its own codex app-server, both
   verified by running the binaries. But a person may have a conversation open in one, so
   closing them is a choice somebody makes, not a thing that happens overnight.
3. **The never-touch list** - refused whatever else matches. Chrome, Wispr Flow, any live Claude
   session and every child process under it, and the whole of `C:\Program Files\nodejs` - the
   repo's own dev servers, runners, sweeps and MCP servers all run from there.

**Matching is by executable path, never by process name alone.** The 2026-09-02 enumeration is
the reason: thirteen `node.exe` processes were running, two of them Adobe's bundled servers under
`C:\Program Files\Adobe\...` and `C:\Program Files\Common Files\Adobe\...`, and eleven of them
this repo's own work - two Vite dev servers, a jobs runner, a queued e2e suite, a field-coverage
sweep, two `@noacg/cli mcp` servers. A name-based rule would have killed all of them.

**Dry run by default.** `npm run reclaim` prints what it would close and frees nothing;
`npm run reclaim -- --apply` acts and reports the megabytes actually recovered.

## What the first real run measured, and why it changes the answer

Applied on 2026-09-02 with four sessions and a live e2e suite running. It closed eight of twelve
processes holding 341 MB; the other four were WD Discovery children already taken down by their
parent's tree kill, which the first version wrongly reported as failures.

**Then almost all of it came straight back, larger.** WD Discovery and the Creative Cloud helper
both have service watchdogs. Within seconds WD Discovery was back at 339 MB against the 60 MB it
went down with, and the Creative Cloud helper at 474 MB against 72 MB, because a cold start
allocates before it settles. Ten minutes later the same set read 907 MB, which is about 570 MB
WORSE than before the kill. Stream Deck stayed closed.

So the honest verdict on this machine is that **the list is worth more than the kills**. Of the
allowlist, only Stream Deck's 64 MB actually stays free. The memory that is really there to take
is the confirmed set - the Codex app at around 700 MB - and that is a person's decision by design.

The tool now says this itself rather than leaving it in a doc: every closeable entry declares
whether it stays closed, comes back, or has not been measured, and both the dry run and `--apply`
report the stays-free figure separately from the total. A tool that reported only what it killed
would have claimed a 341 MB win on the run that made the machine worse.

The next thing worth trying is the watchdog services rather than the processes they guard. That is
a system settings change, so it is the owner's to make, not this script's.

## What is done and what is not

Landed on `claude/f-reclaim-the-ram`: `scripts/reclaim.mjs` (the pure core plus the CLI),
`scripts/reclaim.test.mjs` (which proves the never-touch list is never touched), and the
`reclaim` script in `package.json`.

Still open, and the reason this file stays on the shelf:

- **The starved runner does not call it.** `jobs.mjs` reclaims orphans after fifteen minutes of
  starvation and stops there. Wiring this in is the part that actually answers the owner's ask,
  and it needs a decision about whether an unattended reclaim may touch the confirmed set (it
  should not) and how it reports what it freed into the queue's own output.
- **The list is this machine's.** Every entry was measured here. A second machine needs its own
  audit, which is an argument for keeping the list in one obvious place rather than making it
  configurable before anyone has a second machine.
- **The confirmed set is unmeasured under load.** The 1.7 GB figure for Codex plus Antigravity
  came from a busier moment; on 2026-09-02 they were 670 MB and 78 MB with both mostly idle.
  Nothing has yet closed either of them, so `stays-closed` is a reasonable belief about both and
  a measurement about neither.
- **The watchdogs are the real target - ANSWERED 2026-09-04, and the answer corrects this bullet.**
  Killing a watchdogged process still costs more than it frees, and the several hundred megabytes
  is still behind the watchdogs. But "the services behind them" was wrong about the two that matter:
  `Adobe Desktop Service.exe`, `Creative Cloud.exe` and `WD Discovery.exe` are **user startup
  entries**, not Windows services, so they come off from Task Manager's Startup apps and go back the
  same way. Only ASUS's Armoury Crate and a 3 MB Adobe updater are real services, and the ASUS one
  is not worth the keyboard lighting. Measured, with what each costs if it is off, in
  `the-watchdogs-behind-the-ram-reclaimer.md` - which also names the change that would fold it into
  this tool: read the startup entries and print which one puts each process back, beside the
  `comes back` line, instead of a `why` string the reader cannot act on.

## Evidence

Measured 2026-09-02, 16.2 GB total and 5.5 GB free, four sessions and a live e2e suite running:

| Group | Processes | Working set |
|---|---|---|
| Creative Cloud UI Helper | 4 | 72 MB |
| Adobe node servers (2) | 2 | 134 MB |
| Adobe Desktop Service + Creative Cloud + brokers | 4 | 125 MB |
| WD Discovery | 5 | 60 MB |
| StreamDeck | 1 | 64 MB |
| Codex desktop app (`ChatGPT.exe`) | 11 | 670 MB |
| Antigravity | 5 | 78 MB |

The ASUS virtual pet was not running at measurement time; it is on the list so it is covered when
it is. The RAM economics behind the 3-4 session ceiling were measured on 2026-08-28 and the floor
they feed is `POLICY.freeMemFloorMb` in `scripts/jobs-store.mjs`.
