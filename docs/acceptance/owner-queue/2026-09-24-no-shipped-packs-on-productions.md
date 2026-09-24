---
kind: walk
date: 2026-09-24
because: taste
---
# Productions no longer offers our own packs: the import card is for packages made outside

**Date:** 2026-09-24 · **Branch:** `claude/funny-mccarthy-nt1jb1`

## What changed

The "Import a package" card on Home → Productions no longer lists Uutishuone and Fight Night
with Install buttons. Everything NoaCG provides now comes through the template wizard. The card
is kept as the door for a package made OUTSIDE the studio: a `.noacgpack.json` written by the
NoaCG CLI (`noacg pack`), or a production someone exported as a graphics pack. Such a file still
installs in one step, with its layers and cue rundown, and opens the production.

Until the two packs are rebuilt as ordinary wizard kits, they are only reachable as files in the
repository (`public/packs/`).

## The route, under a minute

1. `/app#/home/productions`.
2. The dashed **Import a package** card shows one line of explanation and one button,
   **Import a package file…**, with no Uutishuone or Fight Night rows.
3. Press it and pick `public/packs/fight-night.noacgpack.json` from the repository: the Fight
   Night production opens with its 19 cues.

## What to look at

- **Whether the card's sentence says who it is for.** It names the CLI and a production export.
- **Whether you want the card at all while no agent package exists.** It is kept so
  `noacg pack` and the production export keep a way in.

## Decided, so you can overrule a thing that exists

- **The pack files stay in the repo** as the specs' fixtures and as the source for the kit
  rebuild. They are still served at `/packs/…`, just no longer listed anywhere.
