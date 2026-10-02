# Landing 2: one playout status, one Playout panel, the monitor's words, every publish prepares (AC-7, AC-8, AC-9, AC-10)

2026-10-02, the owner's Windows laptop, branch `claude/studio-day-status`. Nothing on production:
a local Supabase stack (its own project id, all migrations applied, the configured suite's
throwaway accounts), a scratch CasparCG 2.5.0 (two 720p50 channels, AMCP on 5350, its own config
and media folder), and this branch's NoaCG Bridge on 8898 with a scratch APPDATA. The owner's
CasparCG setup, deck and Companion were not touched.

## Real server walk

This checkout's dev server against the local stack, signed in as the throwaway account, paired
with the scratch Bridge (NoaCG output 1-20). Two productions, A and B, each with one library
graphic. Readings are the status control's `data-tone` and text, sampled every 200 ms by a
recorder in the page, with READY's own line beside them.

| Step | Status | Notes |
|---|---|---|
| A, not started | grey "Offline", ▶ Start production beside it | Monitor heading "PREVIEW · NOT LIVE", dashed grey frame |
| A, Start production | red "Another production on 1-20" within 6.5 s | 1-20 still held an earlier walk's output. Panel: "Channel 1 shows another production on 1-20", Bridge line "NoaCG Bridge and CasparCG answer (CasparCG 2.5.0)". Put on air is the highlighted press. Monitor "PROGRAM · ON AIR" |
| A, Put on air | red → amber "Preparing 0 of 1" at 0.4 s → green "Ready · on air 1-20" at 10.4 s | READY "● Ready for playout · 1 of 1 output" |
| A, Take off | red "Output not on air" | |
| A, add a graphic | amber "Unpublished changes" | Panel's first check "Unpublished changes since v1"; ⟳ Publish changes is the highlighted press, Put on air is not |
| A, ⟳ Publish changes | amber "Behind: showing v1" at 0.9 s → amber "Loading on 1-20" / "Preparing 0 of 2" from 1.3 s → green "Ready · on air 1-20" at 11.5 s | AC-10: nobody reloaded CasparCG. Its card then read "CasparCG 1-20 · Ready for playout · Holds v2" |
| B, Start production (A on air) | red "Another production on 1-20" | Put on air highlighted |
| NoaCG output set to channel 3 (the server has two) | red "Cannot read 3-20" | The Bridge's sentence: "127.0.0.1:5350 answered INFO in a shape this Bridge cannot read: INFO answered without a <channel> document." |
| A at 390 × 844, on air | green "Ready · on…" (ellipsis) | Header does not overflow; the name keeps 113 px |

The walk found three things, fixed in this landing and pinned in `scripts/playout-status.test.mjs`
and `e2e/configured/playout-status.spec.ts`:

1. **Green before the output loaded.** Right after Put on air the status read green for about 8 s,
   then amber "Preparing 0 of 1", then green at 28 s. The slot holding this production is now
   green only once an output has reported; until then it reads amber "Loading on 1-20" (spec D15).
   Re-walked: no early green (the Put on air row above).
2. **Grey after Take off.** The CasparCG output it had just taken off was still remembered, "not
   answering (0 s)", and counted as another output airing the graphics, so the empty slot read
   grey "Checking…" for 15 s before turning red. Only an output that reports (ready, loading or
   amber) counts now; Take off reads red "Output not on air" at once.
3. **A refused slot read.** The code review predicted that a channel the server does not have would
   leave the status on "Checking…" for ever. The real server answered as above, and the status
   now reads red with the Bridge's sentence after "Check under Setup that the server has channel 3."

## Automated

- **Node.** `node --test scripts/playout-status.test.mjs scripts/readiness.test.mjs
  scripts/prepare-live.test.mjs`: 29 pass. Every status state and its colour; READY's summary now
  carries its deciding words (`lead`), `preparing` and the first broken output, and the status
  reads those instead of re-parsing the label (a failed change used to read just "Ready", in
  amber); `slotHolds` is exact (`ab12` is not `ab12x9`).
- **Configured, `e2e/configured/playout-status.spec.ts`** on the local stack, NoaCG Bridge faked
  at the network layer (`e2e/_fakeBridge.ts`): offline grey and the monitor's words; started with
  nothing connected amber; a paired Bridge with an empty slot red, another production red, a
  refused read red; Put on air amber "Loading on 1-20" within 5 s (the immediate re-read) and Take
  off red as fast; a real output reporting turns it green, and with it on the slot "Ready · on air
  1-20"; a production change amber; ⟳ Publish changes moves the open output to v2 by itself;
  unpublished grey. Passed (53 s).
  **Mutations:** with the publish's prepare request removed, the spec fails at "the output moved
  onto v2 by itself"; with Put on air no longer re-reading the slot, it fails waiting 5 s for the
  status to change.

## Not checked here

- The ATEM DSK and a real studio: the owner's queue item from Landing 1 still stands.
- CasparCG 2.3 for the status walk: the slot reading is the same AMCP INFO the server-media walk
  read on 2.3 in Landing 1, and the status logic is the same Node-tested function.
