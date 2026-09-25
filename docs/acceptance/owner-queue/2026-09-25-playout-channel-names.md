---
kind: walk-p
date: 2026-09-25
because: taste
---
# CasparCG channels start as "Channel 1", "Channel 2", not "Graphics" and "Inserts"

Settings -> Playout used to name a new studio's first channel **Graphics**, and "+ Add channel"
named the second **Inserts**. That assumed how a studio uses its channels. New rows are now
named by their number (`Channel 1`, `Channel 2`, …), and the operator renames them. A row that
still has its starting name follows its number if you renumber it. A name you typed is kept.
Names an existing studio already saved are left alone. Adding the first extra channel still
makes it where new clips go; the **Clips** pick below changes that.

## The route, under a minute

A production -> **Playout** in its header -> the Channels table -> **+ Add channel**.

## What to look at

The picks read `Channel 2`, not `2 · Channel 2`. After renaming, they read `2 · Inserts`.

From branch `claude/noacg-bridge-feedback-cimjwc`. Pinned in `e2e/bridge-connect.spec.ts`.
