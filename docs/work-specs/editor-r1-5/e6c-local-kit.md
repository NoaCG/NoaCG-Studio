# Final local qualification kit

Use this with [the E5 participant/device procedures and forms](e5c-local-kit.md).
This adds current receiving packages and Linux fit evidence; it does not pass
E5's people/devices/performance, E6's named receivers or OW1's written rights and
candidate-specific approval.

## Obtain and identify the candidate

The [eight actual packages](e6c/receiving-manifest.json) are committed as raw ZIP
files beside that manifest: [SPX](e6c/spx.zip), [CasparCG](e6c/casparcg.zip),
[browser overlay](e6c/html-overlay.zip), [H2R](e6c/h2r.zip), [OGraf](e6c/ograf.zip),
[LiveOS](e6c/liveos.zip), [combined SPX/OGraf](e6c/combined.zip) and
[whole-production SPX](e6c/production-spx.zip). Download the raw files or obtain
them from this repository checkout. Verify their SHA256 values before extraction.
Keep their README, FIELDS and font notices. Obtain these files from the E6C
evidence PR or its eventual merged repository checkout. Keep this downloaded kit
beside the separate native application worktree: the application pin c456 predates
this kit directory and does not contain it.

The current **Studio production build** is a separate artifact:
[Actions 43455609799 / artifact 14054076623](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43455609799/artifacts/14054076623).
Its source/version is `c456f647eb8a30839473fd93467f447a181f2dc1`.
The outer upload is 19,441,206 bytes, SHA256
`dbbe058aa62a0bd26bda41477b709cca9c19ee6e30c70c8746d7800f4f2132fd`.
Inside it, `editor-native-kit/candidate.zip` is 17,895,722 bytes, SHA256
`fce4859bbae202c51a171d2923124d2a5ee93ca33b8211f4c347b052c9324cb9`;
its manifest has 849 files and SHA256
`f95fa287efd5597c49f4904669968f7c6465f5a07ec57ddf35da1bdcc4913703`.
Use the existing native launch/import/observer instructions with this source pin.
The [actual producer receipt](e6c/native-producer.json) proves the normal full
build, twelve helper assertions, correct-source normal ZIP import and cleanup.
Cloud raw consumer archive readback remains unverified; verify the downloaded
bytes locally before use. The older E5C b081 artifact retains its own version and
must not be called this candidate. Its 22 retained captures remain historical.

## Compatibility and clean setup

| Package | Executed Cloud scope | Required receiving qualification |
| --- | --- | --- |
| SPX | Browser globals, fields, bundled assets, lifecycle | Named SPX server/client/version and operator |
| CasparCG | Self-contained browser document and JSON data | Named CasparCG server/client/CEF, including applicable Linux target |
| Browser overlay | Autoplay then explicit browser data/lifecycle | Named OBS/vMix/browser-source version and real control transport |
| H2R | GDD package, play-toggle, script-level Next | Named H2R version; record whether host UI exposes a Next equivalent |
| OGraf | NoaCG contained OGraf host, real Web Component actions | Named external OGraf renderer/version/operator |
| LiveOS | Same contained OGraf lifecycle, LiveOS package instructions | Named NetOn.Live/LiveOS installation and operator |
| Combined / production SPX | Real builders, source/hash/asset/notices audit; Bridge package byte-equality | Actual import/rundown/layers and host integration |

Executed versions: Cloud Linux; Chromium **149.0.7827.55**, Playwright **1.61.1**,
Vite **8.3.5**, GSAP **3.15.0**, OGraf **v1**. The contained host is NoaCG's
`ografHostDocument`; it is neither an official renderer nor named-host acceptance.
No built external ograf-server or receiving operator was supplied on this worker.
The executing worker observed 4 CPUs / 16GiB and derived two browser workers;
hidden cgroup ancestors were unobserved. No receiver resource/performance pass
is inferred from those Cloud settings.

Use a fresh off-air receiving folder/profile. Record host/client/OS/build, actual
renderer version, CPU/RAM/GPU, resolution/frame rate, operator, UTC, package hash
and source pin in [the receiving form](e6c/receiving-form.csv). Do not depend on
installed fonts or an internet connection: the packages carry four Oswald/Saira
WOFF2 files or embedded equivalents, the authored Harbour logo and OFL notices.
Check all assets load and retain original source, fields and authored 1920×1080/25fps.
Read each package's own install instructions; the HTML-overlay relay/controller,
SPX folders, CasparCG template and OGraf import are different installation paths.

Record host/renderer CPU and RAM before load, at held In, after Out and after
removal/disposal, plus dropped-frame counters where the host exposes them.
At each point record surviving graphics, audio/actions and console/asset errors;
keep actual values with UTC and capture references. Mark unavailable counters
unsupported. These observations introduce no resource budget or performance PASS.

## Operator sequence and expected output

Send [operator-data.json](e6c/operator-data.json). It updates f0–f2 and preserves
the bundled f5 logo. Single-file targets have no images folder: omit f5 to retain
it, or send an actual image data URL. The executed probe separately asserted an
embedded SVG data-URL update retained natural width 32 and the same heading.
Folder targets retain their file-path contract. See the manifest's image-update
receipt, which names the exact executed probe and payload hash.

1. **In:** take/play the graphic and wait for its authored entrance to settle.
   Expect the full long name, Harbour H logo and green accent; the authored CSS
   renders the heading in uppercase. **Next:** reveal the first step and inspect
   “Cloud receiving step one”. A data update must not operate the show.
2. **Out:** expect finite hidden output. **Replay:** expect the long heading and
   logo again, with the initial step restored. Use host controls: SPX/CasparCG
   play/next/stop, H2R play-to-toggle, or OGraf load/updateAction/playAction/
   stopAction. Record unsupported host equivalents instead of inventing a pass.
3. Interrupt entry with Out, then replay. Interrupt Out with In/replay. Retain
   every result, response/error and actual rendered capture. The Cloud probe
   dispatches both actions before awaiting the prior action's promise; it does
   not establish a particular named renderer's scheduling policy.
4. Composite over known light and dark underlays and inspect alpha. Standalone
   Cloud captures used a white canvas; the contained OGraf host used a dark
   color-scheme. Their visible backgrounds are different host compositing,
   not a pixel-parity claim. Record actual host background/alpha separately.

The [exact authored source](e6c/receiving-source.json) adapts the owned receiving
fixture to a fixed raster text slot with one fit system. It retains an exact
legacy fitter so output preparation is exercised without rewriting that source.
At the executed 1920×1080 setting, f0 measures **1041.09375px inside 1043px**,
computed font-size **27.4455px**, Oswald bold; the logo natural width is **32px**.
[Captured frame hashes](e6c/rendered-captures.json) identify the retained Cloud
In/Next/Out/replay PNGs; expected visible content is described above.
These are source/settings-specific observations, not a new tolerance or a
cross-OS guarantee. Retain captures and width/font/slot measurements on Linux.

## Linux #775 and rollback

[The original baseline](e6c/linux-fit-baseline.json) reproduced a reachable
1–2px overshoot in 3/18 feasible cases. [The corrected measurements](e6c/linux-fit.json)
fit all same 18 cases strictly, retain the floor for two impossible cases and
prove deterministic refitting within 18 geometry reads. The authored long name
is “Dr. Maximiliane Alexandra Featherstonehaugh-Worthington III”. Real CasparCG/
OBS on Linux must still execute this fixture with its actual bundled font,
shaping, dimensions and renderer. A Cloud browser does not close #775 or prove
the originally reported 5% host case or Windows/Linux parity.

Before a trial save the production/rundown and prior known-good package hashes.
Use an off-air output. To roll back, stop/clear the test graphic, restore the
known-good package in a separate folder and explicitly reload/re-Take it.
Confirm the output is off before switching. Preserve new operator values and
newer production edits; do not overwrite a newer rundown with an old backup.
Installing makes independent production copies; no master edit propagates.
Keep failures and their artifacts for the existing bounded reassessment route.

E5 still requires 2–3 real first-time users/moderator, desktop and laptop,
actual native 125% zoom and measured F4 distributions at both viewports.
Selection ≤100ms, visible feedback ≥30Hz, no freeze >100ms and final pointer-up
≤150ms remain unresolved. No new F4 campaign was run here. Full vendor terms /
written GSAP disposition and explicit candidate approval remain OW1; see
[the technical inventory and owner draft](gsap.md).
