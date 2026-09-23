# Multi-channel playout: each cue chooses its CasparCG channel

Written 2026-09-23 at the end of the NoaCG Bridge session, for a fresh session that builds this.
The Bridge itself is done and released (`bridge-v0.4.0`, the normal release, Settings ->
Playout's download link resolves to it). The generated-contract deletion
(`docs/backlog/generated-contracts-vanish-from-every-worktree.md`) is another session's; do not
touch it here.

## What's next

1. **Build the per-cue channel choice**, first-class, in the order below. Why: a real broadcast
   runs graphics on channel 1 and video inserts on channel 2, and one rundown holds both. Today
   every cue goes to the studio's single channel (owner, 2026-09-23, after the first real
   production on the Bridge). The ask with the plan:
   `docs/backlog/two-output-channels-in-one-rundown.md`. Its steps stand, with one adjustment
   the owner made in words: the channel per CUE is the point, and Settings channels exist to
   make that choice a pick from a short list with a convenient default, never the only place a
   channel is set.
2. **Prove it on the real 2.5.0** with two channels in `casparcg.config` (a screen consumer
   each): a graphic on 1-20, a clip on 2-10, All out, `PRINT 1` and `PRINT 2`. The install on
   this laptop is `C:\casparcg\casparcg-server-v2.5.0-stable-windows\`; the walk spec
   `e2e/configured/bridge-real-server.spec.ts` (`BRIDGE_REAL=1`) is the shape to extend.
3. *Optional.* The production's own output URL on more than one channel (a second output page
   for a fullscreen channel). Same mechanism, second URL; the owner has not asked for it.

## Where the channel lives today, file by file

- **Protocol, already per-command.** `src/control/playoutProtocol.ts` (mirrored byte for byte
  in `cli/src/playout/protocol.ts`, drift refused by a CLI test): a `Slot` is
  `{ adapter: 'casparcg', channel, layer }`, and every `PlayoutAction` (`take`, `update`,
  `next`, `out`, `pause`, `resume`) carries its slot. The Bridge (`cli/src/playout/adapters/
  casparcg.ts`, `casparLine`) turns the slot into `channel-layer` on the AMCP line. **Nothing
  in the Bridge changes.**
- **The one studio slot.** `src/control/playoutLink.ts`: settings key `spx-gfx-caspar` v1 holds
  `channel` and `layer` (defaults 1 and 20); `slotOf(settings, layer)` builds every slot from
  the studio channel; `putOutputOnAir` / `takeOutputOff` use it for the output URL. Additive
  fields never bump the version (`root/version-every-persisted-format-ship-breaking`).
- **The show record.** `src/model/shows.ts`: `PlayoutItem { id, adapter, kind, name, layer,
  frames?, fps?, fields? }` stores a layer and no channel; `addPlayoutItem` gives a template
  `nextFreeLayer` and a clip `PLAYOUT_CLIP_LAYER` (10); `setPlayoutItemLayer` is the cue
  editor's layer box. A `channel?` beside `layer`, absent meaning the graphics channel, keeps
  every saved show reading as before.
- **The rundown.** `src/components/home/ProductionPage.tsx`: `playoutVerb` (about line 1818)
  builds the action and calls `act`; `livePlayout` tracks which cue is live per item;
  `allOutEnabled` and the All out handler (about lines 1960 and 2545) clear graphics layers and
  live playout cues - this is where every channel the rundown touched must be cleared. The
  server-cue editor is `playout-cue-editor` (the layer box goes there, the channel pick beside
  it). The picker is `src/components/home/PlayoutItemPicker.tsx`.
- **Settings.** `src/components/SettingsDialog.tsx`, `PlayoutSection`: host, port, channel,
  layer, Test connection. The named-channel table goes here; one row is today's setting.
- **Hosted control, read-only.** `src/control/hostedControl.ts` `OutputPlayoutCue` /
  `playoutCues` and the block in `src/components/HostedControlPage.tsx` show the layer; show
  the channel the same way (dashboard-parity: both pages in the same commit).
- **Specs to extend.** `e2e/playout-cues.spec.ts` (fake Bridge via `page.route`, asserts the
  exact action envelopes) and `e2e/bridge-connect.spec.ts` (Settings). Mappings in
  `scripts/e2e-affected.mjs` and `scripts/e2e-lists.mjs`; browser work is queued
  (`node scripts/jobs.mjs add "npx playwright test ..."`).
- **Docs to keep true.** `docs/BRIDGE.md` §5 (cueing the library) and design decision 2 (NoaCG
  owns configuration), `docs/PLAYOUT_DASHBOARD.md` §5 (layers), `docs.html#casparcg-library`,
  and the owner-queue file the work needs (`docs/acceptance/owner-queue/`, one file, a route
  under a minute).

## UX the owner asked for

Like a normal CasparCG client: a channel is a small pick beside the layer, from the channels
named in Settings, with the default already right (graphics channel for templates and the
output URL, insert channel for clips when one is named), and a manual override per cue. No
typing a channel number into a cue. All out clears every channel the rundown used.

## Pasteable prompt

```
Build multi-channel playout in NoaCG. Read docs/handoffs/2026-09-23-multichannel-playout.md
first - it names every file - and docs/backlog/two-output-channels-in-one-rundown.md, the
owner's ask with the plan.

Goal: one rundown cues graphics on CasparCG channel 1 and video inserts on channel 2. Channels
are named once in Settings -> Playout (sensible defaults: today's single channel is row one);
EVERY cue in the rundown can choose its own channel, picked from that list beside its layer
like a CasparCG client, with a convenient default (graphics channel for templates and the
output URL, the insert channel for clips when one is named) and a manual override per cue.
All out clears every channel the rundown used. Hosted control shows the channel too.

The protocol already carries the channel per command (Slot = {adapter, channel, layer}); the
Bridge needs nothing. The work is the show record (PlayoutItem gains an optional channel,
additive, no version bump), Settings, the cue editor, All out, hosted control, the specs
(e2e/playout-cues.spec.ts, e2e/bridge-connect.spec.ts) and the docs. Keep the picker simple.
Prove it on the real CasparCG 2.5.0 on this laptop with two channels configured before calling
it done, and file the owner-queue walk with the frames.

Repo rules: feature branch in its own worktree, npm run build green, browser specs through
the job queue, /check then /queue-merge. Landed state: main at d93f8124c or later; nothing
uncommitted anywhere for this work.
```

## Landed or not

Everything from the Bridge sessions is on `origin/main` (last landing `d93f8124c`, PR #381) and
`bridge-v0.4.0` is released from it. This handoff and the backlog adjustment land through the
queue from the branch `claude/multichannel-handoff`. Blocks nothing; blocked by nothing.
