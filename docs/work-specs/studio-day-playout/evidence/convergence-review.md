# Convergence review: studio day playout, after landings 1 to 3

2026-10-02, reviewed tree `d8d8b231132fd611fda5514fb38948a782eb4fd9` (main at `56f3b3f14`, which
holds landing 3's merge `6c6fdb2c4`, plus this branch's changelog date and the three gap findings).
Read against `spec.md` (sha256 `7e3bbf95…`) and the code on that tree, with the four receipts beside
this one. Nothing on production was changed by the review; the owner's CasparCG, deck and Companion
were not touched.

**Verdict: 9 of 12 pass; AC-1, AC-5 and AC-6 fail and are filed.** The parent stays open.

## What this review ran itself

- **The configured suite on main**, run `37060115606` (configured-suite, push of `6c6fdb2c4`, the
  landing 3 merge): 75 passed, 10 skipped, among them `live-prepare.spec.ts` (1.0 m),
  `live-ready.spec.ts` (58 s), `playout-status.spec.ts` (26.5 s) and the five `teams.spec.ts` walks.
  So the configured evidence in landings 1 and 2 still holds on the integrated tree, not only on
  their branches.
- **Release 0.8.0** from `56f3b3f14`: `npm run release:cli -- --check --ref origin/main` passed
  (8 stamps agree, 0.8.0 free, trusted publisher matches), then `cli-v0.8.0` (run `37061944091`,
  green; npm `latest` 0.8.0 with provenance; `npx @noacg/cli@0.8.0 --version` answers 0.8.0) and
  `bridge-v0.8.0` (run `37061977930`, green; GitHub Release "NoaCG Bridge 0.8.0", Latest, assets
  `NoaCG-Bridge-0.8.0.exe` and its `.sha256`). noacg.studio/downloads reads "Windows · version
  0.8.0" and "npm package @noacg/cli · version 0.8.0" and links the 0.8.0 exe.
- **This checkout's dev server offline** (`npm run dev:worktree`, port 5244) in the built-in browser,
  a local production named "Saturday Night Regional Championship Final Broadcast": header positions
  at 1280, 1366 and 1920 (below), and the Playout panel.
- **Greps on the tree** for AC-2's words and AC-4's guide sentence; **code reading** for AC-1's
  layout rule and AC-5's comparison.

## Criteria

**AC-1 fail.** At 1366 the server item's Operator note, Channel and Layer sit in one row
(`.pd-cue-meta--slot`, landing 1's real-server walk), and every kind gets that row from the one
`ServerCueEditor`, with nothing to open. At 390 px they do not sit side by side: the
`@container (max-width: 620px)` rule makes `.pd-cue-meta` one column, and landing 1 recorded "the
editor stacks note, Channel and Layer full width". Filed:
`docs/backlog/server-item-channel-and-layer-stack-on-a-narrow-editor.md`.

**AC-2 pass.** Landing 1's Settings walk (Channels, NoaCG output, New media, no Graphics or Clips
label). `git grep -n -i "graphics channel\|clips channel"` over `src` and the public pages finds only
code comments, none in `docs.html`; no user-facing channel label names a purpose.

**AC-3 pass.** `outputSlotRefusal` Node test (refuses only the output's slot), the
`playout-cues.spec.ts` "nothing replaces the NoaCG output" walk (marked in the editor, Take disabled,
nothing sent; a new template defaults to the next layer), and the real CasparCG 2.5 walk (landing 1).
The hosted page never takes server cues (spec, AC-3 text).

**AC-4 pass.** `server-media-routing.md`: on 2.5.0 and 2.3.2 through the Bridge, video, still and
audio each played on channel 1 and channel 2 at their layers; media under 1-20 sat under the output
stand-in and above it over it (pixel readings); premultiplied ProRes 4444 and QuickTime Animation
read about 0,128,127 over green, the exact value; Out on every media layer left 1-20 holding the
output. The guide says it: `docs.html` lines 1499 to 1501 ("premultiplied alpha"). The ATEM DSK over
SDI is outside this criterion and remains the owner's studio check.

**AC-5 fail.** The library half passes: `live-prepare.spec.ts` edits a used library graphic with the
record's `updatedAt` unchanged, sees "unpublished changes", and Prepare for Live publishes v3; with
the content check removed it fails with "Nothing changed since v2" (landing 1's mutation), and it
passed again on main in run `37060115606`. Adding a graphic reads amber "Unpublished changes" on a
real server (landing 2). "Undoing the change clears it" holds only for a library edit:
`usePublishDrift.ts` answers `recordChanged(show) || drift`, where `recordChanged` is
`updatedAt > publishedAt`, and every write to the record sets `updatedAt` to now, so a cue change or
an added picture that is changed back still reads unpublished. Read from the code, not walked.
Filed: `docs/backlog/a-reverted-cue-change-stays-unpublished.md`.

**AC-6 fail.** Export and All out never moved in anything measured. Playout and the status do once
the header is full. Offline at 1280 with the long name the spacer was 0; a 90 px element inserted
before the panel door (standing in for a wider right-cluster control such as the team door's
"Saving…") moved the Playout tab from x 865 to 769 and the status from 526 to 430. At 1366: 939 to
841 and 596 to 498. At 1920 the spacer was 205 and nothing moved. With a 26-character name at 1280
the spacer was 42 px before Share, which a signed-in page adds. `teams.spec.ts` measures Share
against the team door at rest at 1280 only, and never while saving. Filed:
`docs/backlog/playout-tab-moves-when-the-header-is-full.md`. Two more movers sit left of the tabs at
any width, 1920 included, found by the code review of this receipt: ▶ Start production beside the
status (gone once the production starts) and the "○ server not answering, retrying" / "○ not
joined, polling" spans before the tabs (`resolveWaiting`, `follow` in `ProductionPage.tsx`). AC-6
does not name those states; the backlog item does.

**AC-7 pass.** `playout-status.test.mjs` covers every listed state and its colour, worst first;
landing 2's real-server walk saw grey Offline, red "Another production on 1-20", amber "Preparing",
amber "Loading on 1-20", green "Ready · on air 1-20", red "Output not on air" and red "Cannot read
3-20"; `playout-status.spec.ts` passed on main. Take stays enabled whatever the status says
(`live-ready.spec.ts`). The hosted page keeps its READY line (D9).

**AC-8 pass.** The panel opened offline in this review reads, top to bottom: the check ("Not
started"), Actions, Setup (with "Set up CasparCG…"). In the source the sections run checks, Outputs,
Actions, Setup, Links (`ProductionPage.tsx` around line 3497 to 3570); landing 2 walked it started on a
real server. The header holds no Output links or Playout settings button (as rendered offline: brand,
Back, Home, New graphic, name, status, Start production, clock, tabs, spacer, panel door, Export,
All out; signed in it adds Share or the team door, and the follow spans appear when the server
does not answer).

**AC-9 pass.** Landing 2: "PREVIEW · NOT LIVE" offline and "PROGRAM · ON AIR" once started; D16's
server-media case is pinned in `playout-cues.spec.ts`. Limitation: AC-9 defines live as started, so
a started production whose slot holds another production also reads PROGRAM · ON AIR beside a red
status. That matches the criterion as written; the remaining offline ON AIR words are already filed
(`docs/backlog/on-air-words-in-an-offline-production.md`).

**AC-10 pass.** Landing 2's real walk: after ⟳ Publish changes CasparCG's output moved onto v2
without a reload; `playout-status.spec.ts` fails with the prepare request removed (mutation) and
passed on main; `live-ready.spec.ts` "AC-4" shows an output with a graphic on air staying on v1 with
"Behind: showing v1" after a publish, and moving only after Out; it passed on main. Per D14 and landing
2 the prepare is sent from a re-publish press only; this review did not re-read that path for timers.

**AC-11 pass.** Landing 3 on real CasparCG 2.5 and 2.3 with landing 3's own pre-merge Bridge build
(not the released 0.8.0 exe, which is the owner's studio check): a second fresh
browser profile paired from a copied link opened with the same channels and output and nothing
typed; two servers kept their own setups through switching. Limitation: "another account on the
same browser" was walked as a fresh profile with no storage, which is the harder case for the page;
no signed-in second account was walked.

**AC-12 pass.** Landing 3: the server step is one line with an info button, This computer and the
servers used before stay offered after connecting, and the link for another browser is shown; the
Bridge window prints the same steps and "To pair another browser, copy the link into it" (Enter for
a new link, tested by `bridge-window.test.mjs`). The released 0.8.0 exe in a real console is the
owner's studio check, already filed.

## Not checked by this review

- No real CasparCG or Bridge was started by this review; AC-4, AC-7, AC-10, AC-11 and AC-12 rest on
  the landings' real-server walks, read here, plus the configured suite on main.
- AC-1 at 390 px and AC-5's revert were judged from the code and landing 1's reading, not walked.
- The header measurements used a probe element, not a real signed-in team production while saving.
