# Final local qualification kit (E5)

**Prepared; production bundle/helper qualification is pending.** No participant/device acceptance is recorded here. Product
candidate: `e1c6fc4f5faf933be930cdf30f7acfa4e2b9ab22`; this evidence-only phase
changes no product bytes. Before E5, reconcile the final E6C candidate and renew
any affected receipt. [Evidence and hashes](e5c/artifact-manifest.json),
[Cloud results and limits](e5c-notes.md), [receiving source/packages](e5c/receiving/)
and [receiving procedure](e4-receiving.md) travel with the candidate.

## Exact production launch and F4 load

The native timing path is a **production build**, never Vite DEV/React StrictMode.
The registered `qualify:editor-native-kit` command runs in the existing endurance
Actions carrier (minutes=10, local-supabase=false): unchanged full build, exact
source/real version-marker checks, functional helper smoke, package and cleanup.
Its actual receipt/artifact must pass before this kit is called ready. It performs
no F4 timing campaign. Reconcile the final E6C candidate before E5; renew the bundle
when its applicable source changes rather than using stale output.

1. Obtain the retained `endurance-<run-id>` artifact and read
   `editor-native-kit/qualification.json`. Require `status=passed`, cleanup=true,
   zero skips/retries, its full source SHA and candidate.zip SHA256. Verify the
   archive before extraction, for example with this portable command:

   ```sh
   node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" <candidate.zip>
   ```

2. Use an owned feature worktree at **the artifact's exact source**, with its
   committed-lockfile dependencies installed through normal setup. The tested
   product inputs here began at e1c6fc4; the bundle records its later exact build
   head. Receipt-only publication commits are not silently substituted for that
   build head. Record `git rev-parse HEAD` and clean status. Extract candidate.zip
   into this fresh owned checkout, producing dist/. Preserve any existing unique
   output elsewhere first; never overwrite another worker or a main checkout.
   PowerShell's `Expand-Archive -LiteralPath <candidate.zip> -DestinationPath .`
   or an existing ZIP tool suffices; no local rebuild is needed.
3. From that worktree run:

   ```sh
   node docs/work-specs/editor-r1-5/e5c/native-local-launch.mjs <artifact-source-sha> --preview
   ```

   The helper verifies HEAD, real dist/version.json.commit and the complete
   bundle file-hash inventory before calling existing dev-worktree --preview.
   Missing/stale/altered/extra files refuse before starting. Build configuration
   is offline; runtime env changes cannot rewrite compiled settings. The helper
   makes no hosted/model call. Use its reserved URL plus
   `/app?editor=foundation#/new` in a fresh disposable normal Chrome profile.
   Native browser zoom must come from its real menu. Detach DevTools into another
   window so it does not shrink the measured viewport. Ctrl+C stops the owned
   server; identify any surviving owned process before another launch.
4. Download `/e5-qualification/f4-editable.zip` from that same preview URL. In
   normal New graphic > Import graphics choose the ZIP, inspect the F4 import
   card, then Finish > Edit. This uses the existing exporter/importer; it does
   not require /src modules in the built app. Wait for Preparing preview to
   disappear and inspect the six-by-five rendered rectangles, Fit artboard and
   timeline. This Console expression must report 300 unique key identities:

   ```js
   new Set([...document.querySelectorAll('.ef-timeline-key')].flatMap(n => n.getAttribute('data-keys').split('|'))).size
   ```

   Retain the package hash, initial PNG and actual 30-layer result. Source/key
   counters alone do not prove pixels. Keep separate fresh profiles for the
   participant journeys, so their working graphics are not replaced by F4.
5. Load the packaged pure DOM observer from the documented production URL:

   ```js
   const e5 = await import('/e5-qualification/native-observer.mjs');
   ```

   Only `e5.install(...)` below is used for native timing. Its `loadF4()` export
   is a DEV-only engineering fixture-preparation guard, exercised by helper
   smoke with bad hash/count cases before mutation. Do not call that /src-based
   preparation path in production. Likewise the launcher with --prepare is
   DEV functional setup only and is unqualified for production latency.

## Concrete native timing/capture procedure

The supplied observer and instructions are **qualification preparation**,
not native timing evidence. Require the production bundle/helper receipt above
before execution; native timing calibration remains a separate measured result. The executing moderator qualifies capture on each
named device before using it to pass a target; no new software implementation or
hardware purchase is implied. The saved Cloud probes remain diagnostic records
with their disclosed limits, especially INVALID high-rate pointer-up.

1. With F4 visibly loaded and DevTools detached, run:

   ```js
   e5.install({ device: 'record actual name', candidate: 'record exact SHA', zoom: 'record actual menu value' });
   ```

   This logs trusted input, `event.timeStamp`, `performance.now()` and
   `performance.timeOrigin + performance.now()`, plus uniquely named User Timing
   marks/trace timestamps. It adds a temporary calibration button outside the
   artwork. It neither changes graphic source nor drives input.
2. In Chrome DevTools **Performance**, enable **Screenshots**, use **No throttling**
   for CPU/network, then **Record**. Capture three deliberate calibration-button
   clicks; the magenta/green painted change is visible in the screenshot filmstrip.
   Save the trace with its screenshots. Record the E5_CALIBRATION mark (the
   click handler after pointer-up), its input markers, and last unchanged /
   first changed screenshot times. These bracket capture/input alignment and the
   observed temporal resolution; they do not prove that a synchronous style write
   was painted immediately. Record trace/browser versions and any omitted frames.
3. If the trace filmstrip is too sparse for 30Hz or the latency boundary, use the
   machine's existing native screen recorder alongside the trace. On Windows,
   Settings > Gaming > Captures > Video frame rate > **60fps**, then capture the
   Chrome window with **Win+Alt+R** (Game Bar). Keep the input/trace markers and
   repeat the three visible calibration clicks at both ends. Retain the original
   video and its actual frame timestamps/rate, using existing media properties or
   `ffprobe -show_frames -select_streams v:0 -show_entries frame=best_effort_timestamp_time,pkt_duration_time <video>`
   when ffprobe is available. Never infer a constant 60fps from the requested setting.
   An unavailable or insufficient recorder leaves the affected timing UNKNOWN;
   it does not authorize new purchases or replace pixels with generic rAF counts.
4. Run `e5Native.hideCalibration()` and use the separately recorded cold setup.
   Do not reload within this recording; reinstall the observer after any reload.
   Then perform the declared 30 selections, 10 continuous drags, 10 forward/back scrubs and
   10 undo/redo cycles. Keep each trial ID in the form and make a trace mark with
   `performance.mark('E5_TRIAL_<id>')` before it. Human pointer input uses one
   ordinary trusted device throughout, including pointer-up at the actual final
   pointer location. Record actual received cadence and coalescing; input below
   30 moves/sec cannot settle the 30Hz feedback target. Retain all intervals and
   rebuild gaps, including misses. Do not replay the Cloud mixed driver.
5. At the end run `e5Native.showCalibration()`, capture three more calibration
   clicks, stop and save the trace/video, then run `e5Native.download()` and
   `e5Native.dispose()`. Save a settled final PNG, exact final source/backup and
   all form rows. The event JSON, native trace and screenshot/video timestamps
   must be reconciled through their recorded marks/calibration; wall-clock time
   alone is not a cross-clock alignment claim.
6. For each selection, bracket input-to-first-painted-selection by last unchanged
   and first changed frame. For active motion, count distinct **artwork poses**
   in rendered frames (exclude cursor/selection-only changes), divide by actual
   active time and retain every change/gap. For pointer-up, verify the intended
   endpoint, then bracket the first final painted pose that stays settled; include
   preview rebuilds. Report per-sample intervals plus median/p95/max and individual
   stalls, alongside raw inputs and sample/capture uncertainty. If the whole
   uncertainty interval satisfies the stated target inequality, report PASS; if
   the whole interval violates it, report MISS;
   if it crosses the threshold, loses frames/clock alignment or cannot distinguish
   artwork changes, report UNKNOWN. Do not raise a target or quietly exclude a stall.

The exact targets remain <=100ms selection, >=30Hz visible feedback, no freeze
>100ms and <=150ms final pointer-up. Captured frames must resolve the claimed
boundary: sparse filmstrip/video cannot prove no intermediate stall or 30Hz.
The supplied procedure is executable preparation; only actual native calibration,
rendered samples and named-device receipts can qualify those numbers.

## Moderator setup

Recruit 2–3 real first-time users and a moderator. Record each participant with
an anonymous ID; record prior design/broadcast experience. Do not invent users
from scripted browser runs. Use disposable local/isolated accounts and productions,
owned artwork and an off-air output. Never use production data or new paid services.
Keep one active authoring tab/device per account. Save, export a backup and close
the first editor before opening the saved Home record in another device/profile;
inspect it before editing. A Saved label alone does not prove recovery.

Record named desktop AND laptop, OS/build, CPU/RAM/GPU, browser/version, resolution,
CSS viewport, DPR/display scaling, actual browser zoom, input device, power mode,
backend identity/latency and exact candidate commit. Take a screenshot showing the
browser zoom menu at actual 125%; shrinking a viewport, device emulation or CSS
zoom does not qualify. Check Home, Save, canvas, Properties, timeline and adjacent
Set Out choices remain reachable. Preserve initial/held/Out and reopened captures. Cloud reference images are in
the retained artifact under editor-native-kit/retained-e5c-captures/, mapped by
[e5c/capture-export.json](e5c/capture-export.json); repository policy keeps PNGs
out of the tracked docs tree.

Give this short introduction once (about one minute), then stop coaching:

> You are preparing graphics for a broadcast. Home creates and reopens work.
> Select artwork on the canvas or in Layers; Properties changes the selection.
> Project switches graphics. The timeline controls motion; Play rehearses it.
> Undo can reverse an edit. Save your work and check it after reopening. Use
> Help or ask for assistance whenever you need it; we will record that help.

Use a fresh copy of [the individual form](e5c/participant-form.csv) for each user
and journey. Start timing when each task is read and stop when its expected result
is visible. Record raw seconds, success/refusal, mistakes, retries, every prompt/
hint/help request and its wording. Ordinary edits target <=60 seconds each;
keyframe and collection tasks target <=300 seconds each after the introduction.
Keep misses as misses. Moderator recovery/restarts and setup time are separate
records, never removed from task time without explanation.

## Journey A: imported artwork to rehearsal and exports

Fixture: [authored nested SVG](../../../e2e/fixtures/fidelity-nested.svg), or the
[exact imported task input with decorative text](e5c/nested-static.svg).
Use the normal Import SVG wizard and inspect its field choices before Finish >
Edit. Preserve nested transforms, mask/clip and excluded decorative text.

1. Change the selected public title to “Morning report”, move its base X by +40,
   change a supported colour/type control, undo and redo. Time the ordinary edits
   individually. Keep unrelated layers and field IDs intact.
2. Add a rectangle, ellipse and public text “LIVE REPORT”; test a long title and
   verify its fitting. Cancel an unfinished Pen/drag, then undo and redo one
   completed edit. Preserve existing assets, masks and decorative content.
3. Within five minutes, key X from -80 to 0 over one second and opacity 0 to 1
   over 0.3 seconds; set the first X key to Easy Ease Out, retime the last X key
   to 0.8 seconds, scrub both directions, and author/rehearse Out. If the same
   fixture already owns these channels, record the starting source and edit those
   keys rather than silently replacing its motion. A Step/Next extension may be
   observed separately; preserve the ordinary task result.
4. Open Assistant > Help and the Editing guide. Record whether help is useful;
   no paid model call or new model allowance is authorized by this kit. Existing
   E3 real-model receipts and deterministic proposals are distinct evidence.
5. Save, retain a backup, close/reopen from Home and inspect wording, motion,
   field keys and assets. Export SPX, CasparCG and OGraf and execute the applicable
   browser lifecycle with operator data, held In/Next, Out and replay. Record any
   unsupported equivalent. Real receiving hosts remain E6.

## Journey B: Starter to selected rundown

Use Home > New project > Newsroom; select News Headline, Clean Title and Underline
(the executed Cloud set), create a brand with Oswald, accent #16bb99 and
[the authored Harbour logo](../../../e2e/fixtures/editor-projects/harbour.svg).
Time the complete collection task against five minutes, plus individual ordinary
edits against one minute each.

1. Customize the first graphic; edit the second differently. Switch back, undo
   and redo; confirm each document retains its own history.
2. Apply a brand, undo including the visible logo and redo. Override the first
   title colour to #fedd00. Change the saved brand accent to #3344ee and explicitly
   reapply to that item; keep the local title override and untouched graphics.
3. Save the selected graphics; reload and reopen each from Home. Check source,
   font/logo and independent history, not just the Saved indicator.
4. Install first+second into a disposable rundown A and second alone into B.
   Verify exact subsets and independent copies. Change the master and confirm
   installed/on-air copies stay unchanged until explicit replacement.
5. Enter “Live harbour update” as operator data, Take, use Next where authored,
   Out and replay. Inspect the selected graphic's output layer and record actual
   rendered frames. The staged receiving fixture separately exercises two reveals.

## Reference and device performance instructions

On EACH measured machine execute the comparable task in Studio requested pin
`3142fc7d02934494931eb14e7dc255393e4110d0`. Record the actual executable/source,
manifest and binary hash. The Cloud official 0.17.0 binary names `a1e9776`; only
its release workflow differs from the requested pin. Do not claim those SHAs
are identical. Use authored fixtures; copy no reference product code/artwork.
Create/edit text, X+40, explicit Undo/Redo, native-file save/reopen, play/stop and
style-pack tasks. Importing the SVG as a portable image resource is not editable
nested-layer/field parity. Native file pickers must be observed locally; the
Cloud download/input fallback does not qualify them. Record setup/conversion,
meaningful differences and missing equivalents. Do not invent comparable timings
for NoaCG's multi-document/rundown, source/fields or Help contracts.

**OPEN E5 performance item:** use the exact original
[F4 30-layer/300-key X+opacity scene](../../research/editor-design-review-2026-09-17/f4-noacg.json)
at both 1366×768 and 1920×1080, and actual native 125% zoom with reachable controls.
Record cold load separately; at each viewport collect at least 30 selections,
10 continuous drags, 10 forward/back scrubs and 10 undo/redo cycles. Record actual
input cadence, input-to-visible feedback, changed rendered poses, final pointer-up
settling, raw distributions, stalls, rebuilds and rendered captures. Targets stay
selection <=100ms, feedback >=30Hz, no freeze >100ms, final pointer-up <=150ms.
Use production debounce (350ms), actual resource settings and a qualified timing/
capture method. Protocol acknowledgements and rAF cadence are proxies; neither
alone proves pixels. Keep coalescing, missing frames and all rebuild gaps.

The Cloud instrumented runs miss or cannot settle these targets; no performance
PASS or causal attribution to recording/software is claimed. Do not replace the
named-device campaign with their counters. A material final-candidate finding
returns through the existing bounded repair/recheck process; E4-attributable
failures need owner reassessment, with all spent attempts preserved.
