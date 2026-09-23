---
kind: walk-p
date: 2026-09-23
because: taste
---
# Copy buttons on the agent install lines

**Date:** 2026-09-23 · **Branch:** `claude/noacg-work-suggestions-ibb9ak`

## What changed

The *Preferred* card on the AI step (the one that points people at their own Claude Code or
Codex) now shows both install recipes as blocks with a **Copy** button each. A press puts both
lines on the clipboard and the button reads **Copied** for a moment. The Codex commands used to
be two inline snippets in a sentence; they are a block like the Claude Code one now. The docs
page already had copy buttons on every command.

## The route, under a minute

1. `/app` -> **Create with AI**.
2. On the *Preferred* line press **Show me ›** (it is already open when the key field is on
   screen).
3. Press **Copy** on either block and paste into a terminal or a note.

## What to look at

- Whether the button reads well in the block's corner on your phone.
- Decided: the block itself stays one-click selectable, for anyone who copies by hand.
