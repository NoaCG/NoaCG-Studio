# Phase 6 Step 3: READY and Prepare for Live

Child of [`playout-runtime-reliability`](../playout-runtime-reliability/spec.md) (Phase 6). It
inherits that spec's owner decisions 1 to 8 and its derived decisions D3 (Presence on
`live-<show id>`), D6 (the old path stays), D7 (the live-path migration class) and D12 (the
command road never shares fate with Presence). It must keep that spec's AC-8, AC-9 (the one health
line) and AC-17 (old pages and old outputs keep working) true. The design is
[`docs/PLAYOUT_ISOLATION_RESEARCH.md`](../../PLAYOUT_ISOLATION_RESEARCH.md) §9 (the rule, the seven
guarantees, the states and their wording, Prepare for Live) on today's payload, as §14 step 3 puts
it: no manifest, no per-graphic versions (Step 4), no outage survival (Step 5).

## Problem

An operator cannot tell whether a show is ready to go on air. The health line (Step 1) says which
outputs are connected and how commands reach them, but not whether each output has every graphic
of the current production loaded, its fonts and images, and nothing that threw while loading. A
dead output is an absence, not a red light. After a publish an open output keeps the version it
booted with, and nothing says so. There is no moment at which the operator is told: checked, the
show is ready.

## Owner requirements (binding)

From the owner's decisions of 2026-09-29 (decision 5) and the session prompt of 2026-09-30:

- READY is automatic, and a status, never permission: Take is never blocked by a check.
- Prepare for Live is optional, takes seconds, may publish pending changes itself and says clearly
  that unpublished changes will be included, then prepares and checks everything and gives the
  Ready for Live result. It never freezes editing.
- READY means the same on every player: the output page runs in CasparCG, OBS and vMix alike.
- Both operator surfaces show it: the production page and the hosted phone page.
- The plan's wording: "Preparing 18 of 24", "Ready for playout", "Ready · 1 change preparing",
  "Ready · 1 change not prepared: <graphic> (<reason>)", the Degraded lines ("Commands may arrive
  up to 30 s late", "Using a fallback font for <typeface>", "Behind: showing v12"),
  "<output> not answering (<time>)", the summary "Ready for Live · 2 of 2 outputs · checked 14:02",
  and the stamp "Ready for Live, checked 14:02 (v12)".
- Live-path contract changes are the scheduled migration class. No Supabase spending.

## Derived decisions (revertible; each says how to revert)

- **R1. Each output decides its own readiness, in one piece of code on every host.** The output
  page works out guarantees 1, 3, 4, 5 and 6 from what it can see inside itself and reports them
  in its Presence entry (`ready`). The operator pages add only what an output cannot know: the
  published version (guarantee 2), the expected outputs, and from landing c the ping (guarantee
  7). One pure function (`control/readiness.ts`) turns entries into the per-output lines and the
  summary for both surfaces. Revert: drop `ready` from the entry; Step 1's line is underneath.
- **R2. Guarantee 2 stands on a version stamp in today's payload.** Publishing writes
  `ver: {n, at, h, g}` inside `control_shows.output`, an additive optional field of the v1 payload
  (no migration, no format bump): `g` is a SHA-256 per graphic over what the output renders (its
  html, css, js, assets, resolution, fps and layer), `h` one over the stage resolution and `g`,
  and `n` the previous stamp's `n` plus one (read as one field before the write; 1 when there is
  none). `h` decides "the same version"; `n` is only the label ("v12"), and a cue-only change
  moves `n` without making any output behind. An output reports the stamp it booted with. A
  payload without a stamp (published before this step) is never called behind. Step 4's manifest
  replaces it. Revert: stop writing `ver`; nothing is ever behind.
- **R3. "Prepare" on today's payload means: check the changes beside the running version, then
  reload onto it when nothing is on air.** An open output keeps the version it booted with, as
  today. When Prepare for Live asks, an output that holds an older version loads the published
  payload, builds only the new and changed graphics in hidden frames beside the ones on air, and
  runs the same checks on them ("Ready · 1 change preparing"). If every change prepared and
  nothing is on air on that output, it reloads onto the new version through the boot recovery a
  manual reload already uses, once its own URL answers (the guard it already has). If a change
  fails, it keeps running the version it has and says "Ready · 1 change not prepared: Frost Quiz
  (script error)". If something is on air it keeps its version and reads "Behind: showing v12",
  with what to do. Nothing reloads outside Prepare for Live. This is the whole-output form of
  last-known-good; per-graphic switching is Step 4. Revert: outputs ignore the request and read
  Behind; the operator reloads them by hand.
- **R4. The request travels on Presence, not the command road.** The production page's own
  Presence entry carries `prep: {id, n, h}`. It is not an airing command (D12 keeps those off
  Presence), and a spoofed one can do no more than a real one: an output re-reads the published
  payload at most once a minute, and reloads only when the server really holds a newer version.
  Revert: outputs stop reading operator entries.
- **R5. Expected outputs are remembered by the production page and carried on Presence.** An
  output the production page has seen on the live topic is expected (kept per production in that
  browser's storage, `noacg-ready-v1-<show id>`), and each Prepare for Live re-bases the list on
  the outputs present at its end. An expected output with no entry for 15 s reads
  "<output> not answering (40 s)" in red; a line can be forgotten. The production page announces
  the list and the stamp in its entry, so the hosted page and the phone show the same summary
  while it is open; without it they count the outputs present and those seen since they opened.
  An output is named by `&name=` on its URL, else by its engine; the Bridge's Put on air adds
  `&name=CasparCG <channel>-<layer>`. A reloaded output keeps its instance id and so its place; a
  CasparCG layer played again has a new id and takes the place of the missing output with the
  same name. Revert: drop `exp`; a gone output is absent, as today.
- **R6. The warm pass is one off-air update with the first cue's values, only for untouched
  graphics.** After a graphic's frame loads, a graphic that no command or recovery has touched
  since boot gets one `update` with the values of its first cue in the rundown, in the frame's own
  command queue (so a Take behind it wins), and never in the output's reports. A graphic that is
  on air or was recovered with data is not updated: recovery already did it. No cue, nothing to
  warm. Revert: skip the warm command; guarantee 5 reads done.
- **R7. What the frame can see is what it reports.** Font faces in `error`, or still loading
  after the 3 s hold cap, read "Using a fallback font for <typeface>"; `<img>` elements that are
  broken name the graphic and the file; a script error before the warm pass finished, or an
  `update` that threw during it, makes the graphic not prepared ("script error"). A typeface named
  in CSS but never declared cannot be seen from inside a page and is not claimed (§9.2, what READY
  cannot promise).
- **R8. In sync is judged by the output itself.** On the numbered log it is out of sync when its
  follower has held a gap for more than 5 s ("Catching up on missed commands"); on the id road it
  is not provable and is not claimed. "Nothing on air" (R3) is the log's own head summary on the
  numbered log, and the graphics played and not stopped on the id road.
- **R9. The ping is a log row through a new send function (landing c).** `control_ping_seq`
  (migration 0072, live-path class) takes the production's row at KEY SHARE and the head FOR
  UPDATE exactly as `control_send_seq` does, and writes one row `{t: 'ping', id, at}` with an
  empty graphic under the next seq: the same locks, the same numbered frame, the same poll floor as
  a Take, and no revision moves (0071's head effect ignores the type). Old outputs and pages
  already ignore an unknown type. Each output answers in its Presence entry with the ping's id
  and its own press-to-receive time; the operator page shows "command path 110 ms". It is sent by
  Prepare for Live and by "Check again", never on a timer. Revert: stop calling it; guarantee 7 is
  judged from the join, as in landing a.
- **R10. Placement.** The READY summary takes the health line's place in both headers and is a
  button: it opens a panel with one line per output, the checks, the stamp and (production page
  only) Prepare for Live. On a phone it keeps its short form ("● Ready 2/2") and the panel spans
  the screen, as the links panel does. Colours are the header's own: green, amber, red, dim. The
  owner adjusts from screenshots.

## Behaviour

### AC-1: Every output reports whether it is ready, the same way on every player

An output page, loaded in a browser, an OBS browser source, a vMix browser input or a CasparCG
2.3.2 or 2.5.0 layer, reports in its Presence entry: who it is, the version it holds, how many of
its graphics are prepared, and what fails. It reads "Preparing 3 of 4" while it loads and "Ready
for playout" once every graphic has loaded without an error, its fonts and images are in, and the
warm pass has run. Its debug line (`&debug=1`) says the same.

### AC-2: A graphic that cannot load is named, and the output reads not ready

An output on which one graphic throws while loading reads "Not ready: <graphic> (script error)"
on both operator surfaces, while its other graphics still take. A font that fails reads "Using a
fallback font for <typeface>" and an image that fails names the graphic and the file, both amber
and never green.

### AC-3: The warm pass never changes what airs

An output opened while a graphic is on air does not update that graphic; graphics nobody has
touched get their first cue's values off air; the output's reports, `data-plays` and the operator
pages' PROGRAM monitors are unchanged by it; a Take pressed during the warm pass airs its own
values.

### AC-4: An output holding an older version says so

Publishing writes the version stamp. After a publish, an output that still holds the version before
reads "Behind: showing v12" on both surfaces. A cue-only change moves the number but makes no
output behind. A payload published before this step is never called behind.

### AC-5: Both operator surfaces show one READY line, and it never blocks anything

The production page's header and the hosted page's header (so the phone) show the same summary,
from one function, in the plan's wording, and its panel lists every output with its state. Take,
Out and Next are never disabled or delayed by it. Judged rendered at 1920, 1366 and 390 px wide.

### AC-6: A dead output is a red line, not an absence

An output that was connected and is gone reads "<output> not answering (40 s)" in red on both
surfaces after 15 s, counts against "N of M outputs", and can be forgotten. A reloaded output keeps
its line; a CasparCG layer played again takes the place of the one it replaced.

### AC-7: Old outputs, old servers and old pages keep today's behaviour

An output built before this step shows on the new line as connected with no READY claim and the
advice to reload it; a server without the live topic keeps Step 1's heartbeat line; an output of
this step on a payload without a stamp, or an old page on a payload with one, works as today.
Nothing about air changes when Presence is refused.

### AC-8: Prepare for Live publishes what changed and says so before it does

One optional button on the production page. Before it is pressed, the panel says whether
unpublished changes exist and that they will be included. Pressing it publishes them as the next
version, or says "Nothing changed since v12", and editing is never frozen, during or after.

### AC-9: Every output prepares the version, keeping what works

Each connected output that holds an older version prepares the changes beside what it runs
("Ready · 1 change preparing"). If every change prepared and nothing is on air there, it moves onto
the new version by itself and reads "Ready for playout" on it. A change that fails leaves the
output on its running version: "Ready · 1 change not prepared: <graphic> (<reason>)". An output
with a graphic on air keeps its version and its line says what to do.

### AC-10: The Bridge and CasparCG are checked, read-only

With NoaCG Bridge configured, the checklist says whether the Bridge answers, whether the server
answers, whether the output layer holds this production's output URL (and names another
production's if it holds one), and whether every server clip and template the rundown cues exists
on the server, naming the missing ones. Nothing is played or changed.

### AC-11: The checklist ends in a stamp both surfaces show

Every line is green, amber or red, and each amber or red line says what to do. All green gives
"Ready for Live, checked 14:02 (v12)" and the summary "Ready for Live · 2 of 2 outputs · checked
14:02"; otherwise the stamp counts the warnings or problems. After a later change the stamp keeps
its honesty ("checked 14:02 on v12, 1 change since"), and pressing again runs everything again.
The hosted page and the phone show the stamp while the production page is open.

### AC-12: The command path is pinged end to end without airing anything

Prepare for Live (and "Check again") sends one ping through the numbered send path; each output
answers, and its line reads "command path 110 ms". An output that has not answered in 15 s reads
"Commands did not reach it in 15 s" in amber. No graphic, revision, cue or report changes; old
outputs and old pages ignore the row.

### AC-13: The ping's migration is the live-path class and harms nothing on air

Migration 0072 carries the live-path header, sets `lock_timeout` and `statement_timeout`, is
additive (one new function), is held by `db-push` on an automatic run, and applies on a local
stack while an old page sends every 700 ms without a failed send. A server without it answers the
ping as unavailable and the line says so.

## Preserved behaviour

Take, Out, Next and All out behave exactly as before; nothing waits for READY. Step 1's health line
and Presence budget (one call per 10 s per page), Step 2's command road and recovery, the output's
boot recovery and its transparency on air are unchanged. The rollback of every landing is to hide
the UI: the checks are read-only, and the only new action on an output (R3) happens when an
operator presses Prepare for Live.

## Non-goals

Versions, per-graphic switching, Apply Update and last-known-good beyond R3 (Step 4). Outage
survival and signed commands (Step 5). A local runtime. A new table, column or Presence topic. Any
check on a timer that writes to the database. Blocking or delaying a verb.

## Verification

- Never production. A local Supabase stack (every migration in the tree) on this machine.
- Node tests for `control/readiness.ts` (every state and the summary), the stamp and the frame
  report. Offline e2e for the output's readiness with a stood-in backend. Configured e2e on the
  local stack for both surfaces, a dead output, a broken graphic, Prepare for Live and the ping.
- Real hosts, from the built bundle: CasparCG 2.3.2 and 2.5.0 from scratch configurations on the
  command line (AMCP outside 5180-5298), an OBS browser source in a test scene collection, a vMix
  browser input in a test preset, and a real browser. The fault case on at least one host: a
  graphic that cannot load reads not ready and is named.
- Screenshots of both surfaces at desktop and phone width, judged.
- Evidence in `evidence/`.

## Decisions for the owner's morning

Recorded above as R1 to R10 and revertible; the ones that change what an operator sees are R3
(what prepare does on today's payload), R5 (how outputs are expected and named) and R10
(placement). Screenshots go with the handoff.
