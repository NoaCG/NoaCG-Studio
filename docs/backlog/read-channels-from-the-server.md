---
v: 2
source: derived
kind: finding
raised: 2026-10-01
state: unstarted
found: "Settings asks the studio to type its channel list, while CasparCG answers a bare INFO with every channel and its video mode."
size: small
touches: cli/src/playout/adapters/casparcg.ts, cli/src/playout/server.ts, src/components/PlayoutSettingsPanel.tsx
needs-owner: none
---
# Read the channel list from the server

**Filed:** 2026-10-01, by the studio-day follow-up.

## Why

Channels should be as easy as layers and never configured twice. A server knows how many channels
it has; typing them is a step that can be wrong (a channel the server does not have).

## What it would take

A Bridge feature that sends a bare `INFO` on connect and returns the channel numbers and modes; the
page offers them as the channel list of that server (kept in the Bridge per server). Needs a Bridge
release.

## Evidence

`e2e/configured/bridge-real-server.spec.ts` already sends a bare `INFO` through `/amcp`.
