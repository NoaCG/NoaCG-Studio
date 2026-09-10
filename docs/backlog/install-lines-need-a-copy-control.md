---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "the Create with AI card's two install lines can be selected whole in one click but have no Copy control, and select-then-copy is two motions, one of which fails silently on a phone"
---
# The install lines on the AI card have no Copy control

**Filed:** 2026-09-10, during the owner-queue drain against the four reasons. **Source:**
`docs/acceptance/owner-queue/2026-09-06-i-your-own-agent-comes-first.md`, which asked whether
one-click select was enough or whether the block wants a Copy button.

## Why

It wants one, and it is not a taste call. Every documentation surface that prints a command to
paste ships a copy control, because select-then-copy is two motions and the second one has no
feedback - on a phone the selection is fiddly and a partial copy looks identical to a whole one
until the paste fails in a terminal. The card exists to steer a visitor onto the CLI road, which
is the road the owner ruled is preferred; a paste that silently truncates is the one failure that
sends them back.

## What it would take

A copy control on the two Claude Code lines and the two Codex lines behind *Show me* on the AI
step, on the same block in **⚙ AI settings**, and on the docs page's paste-one-prompt if it has
the same shape. Standard behaviour: copy on press, a confirmation that fades, and the block still
selectable for anyone who prefers it. The clipboard write needs a fallback path, because it is
refused outside a secure context.

## Evidence

`docs/acceptance/owner-queue/2026-09-06-i-your-own-agent-comes-first.md`, "What to look at", third
bullet. The card's own remaining owner question - whether it reads as the better road you already
own - stays on that item.
