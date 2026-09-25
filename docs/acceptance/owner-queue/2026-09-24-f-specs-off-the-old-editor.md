---
kind: walk
date: 2026-09-25
because: direction
serves: now
---
# Tests that stood in the old editor run again from Home, productions and the export window

**Date:** 2026-09-25 · **Branch:** `claude/f-rewrite-skipped-specs`

## What changed

When the old code editor closed on 2026-09-24, every test that passed through it started to skip.
Most of them only used the editor as a place to stand: they made a graphic there, then opened a
production, the Export panel or the save dialog. They now stand on Home and open those surfaces
directly, the way the studio does today. 160 tests run again: 145 in the everyday suite and
15 in the signed-in suite (productions going live, published output, the audience link, the save
dialog). What they check is unchanged.

The new editor's Home button now carries the `open-home` test hook the old editor's topbar had,
so tests find it without guessing. Nothing on screen looks different.

Before this, the signed-in suite was red on `main` from the moment the old editor closed: sign-in
now lands on Home, where an empty library shows two "+ New graphic" buttons, and the tests' click
matched both. That fix landed on its own first (pull request 412, which also gave the door a
`data-door="new-graphic"` hook), and the signed-in suite has been green on `main` since.
The two same-named buttons are a real accessibility wrinkle and are filed in
`docs/backlog/home-empty-library-has-two-new-graphic-buttons.md`.

## The route, under a minute

1. Open https://github.com/NoaCG/NoaCG-Studio/actions/workflows/configured-suite.yml and click
   the newest run on `main`. The summary line says how many signed-in tests ran: 46 or more once
   this lands (31 before it), with 0 failed.
2. Open `docs/backlog/specs-that-still-open-the-old-editor.md` on `main`. It lists only what is
   still skipped, each file with its count. It was 687 offline and 24 signed-in tests; this
   landing takes 160 off it.

## What to look at

Whether the list that is left matches what you expect to lose for now: mostly tests whose subject
was a panel of the old editor itself (its timeline, canvas, Inspector, code pane, machine graph),
which the new editor does not have yet.
