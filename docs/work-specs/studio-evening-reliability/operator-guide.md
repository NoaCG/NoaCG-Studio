# Operator rehearsal guide

This describes the approved studio reliability release. Deployment receipts are in
[verification](verification.md). Installing a Bridge update remains an explicit operator action.

## Cloud work and account state

An account library opens with **Checking cloud revision** until a fresh reconciliation finishes.
Cached data is visible for recovery, but is not claimed as the current global revision.
**Not saved to cloud** stays visible during pending edits and failed saves. A valid session can
continue temporarily offline. Authentication expiry preserves pending work and pauses account
authoring; transport remains available. Sign in with the same account to resume reconciliation.

The editor's Save action still updates its named graphic. Autosave preserves the working document;
editing a working copy does not automatically replace the named library graphic used by a show.
Use Save for that graphic, wait for cloud saving to finish, then verify its content in a separate
browser/device using the same account and team. Publishing output and cloud-saving account work
are separate facts. A green output-readiness control does not confirm cloud persistence.

Anonymous work is explicitly a local workspace. Signing in opens the separate account library;
it does not silently adopt anonymous graphics. Transfer intended work by explicit export/import.
Keep the original browser data while any save remains pending. Pending team work can be exported
for recovery, including drafts whose team membership was revoked.

For an edit from another computer, open **+ Add → Refresh rundown**. This flushes pending drafts
and confirms a fresh cloud read without publishing, taking a cue or reloading output. Success says
**Rundown refreshed from cloud**. A failed save/read keeps the draft and explains the failure.
The team name and member access are under **Setup**; pending and failed saving remain visible.

Use one authoring tab per production while offline. The existing personal-library whole-record
storage and sync model has not been replaced with a collaborative offline editor. Simultaneous
offline writers still need conflict review; the team save path retains its server compare-and-swap.

## Readiness during playout

Native CasparCG server cues send directly through the Bridge to their assigned output, including
before publishing. Browser graphics preview locally until the production is started. The browser
output's Offline state does not mean a server video or sound stays on the laptop.

Read the words with the color. A healthy prepared output with changed graphics means continue
using its prepared content, and prepare before relying on the changed assets. Failed or missing
output/Bridge feedback means readiness is unconfirmed; check the actual program monitor before
the next affected Take. A yellow status alone does not stop playback or issue Out.

**Publish & check readiness** publishes pending changes, prepares assets, checks output feedback
and Bridge state, and reports the result. With no unpublished changes it is **Check readiness**.
**Put on air** remains a separate command loading the managed output into CasparCG.
Cue ordering, notes and shortcut edits do not invalidate already prepared graphics. Asset changes
are deferred until the affected browser output is clear. A check does not reload beneath live
graphics. Recheck after clearing to confirm a deferred preparation has completed.

## Cues, direct effects and clearing

Use a cue's More menu to assign or remove its shortcut. Letters, digits and Shift+letter
are supported; Space, R, U, N, 0, P, H, arrows and Escape retain their existing operator functions.
Ctrl/Cmd/Alt combinations are excluded from cue bindings. Duplicate shortcuts are refused.
After editing bindings on a running production page, press **Apply shortcuts** deliberately.
The bindings are saved with the production, so another computer opens the same assignments.

Triggering a hotkey plays/restarts that cue and keeps the current selection and preview. It does
not start its folder or follow-on cue. Repeated keydown, text editing, composition, menus and
dialogs do not trigger effects. Companion's **Trigger cue** sends the same stable cue-ID command.
Its existing Take cue action retains its toggle behavior. The additive relay migration must be
applied during rollout before Companion can use the new verb against that backend.

Add an **Audio/effect cue** for a CasparCG media-folder sound. The existing native audio route
defaults to its effects layer, separate from the video layer. Check the displayed channel/layer
before rehearsal; two effects on the same slot intentionally replace/restart each other.

The CasparCG files picker stays open until **Done**. Click files to select them, use Shift for a
range, then **Add selected**. **Add folder** includes its subfolders and respects the current media
filter. Both append ordinary cues and keep the next question selected.

Native pictures default to **Fit**, preserving proportions with centered opaque black padding.
Select a picture cue to choose **Fit / Stretch**; a change applies at its next Take. Fit requires
Bridge 0.9.0 and CasparCG 2.5 or later. An older Bridge shows update advice and refuses Fit rather
than silently stretching. Unsupported picture formats/settings also give explicit advice.

Space follows the displayed Take/Out action for the selected cue and the chosen Space mode.
It does not mean clear every playing item. Explicit Out applies the cue's authored exit behavior,
which can include a fade. If it does not clear as needed, use **Stop/Clear this slot** in the media
editor or diagnostic panel. It clears that exact channel/layer, including unowned playback and
queued state. **All out** affects the production's managed slots and is the broader fallback.

Unidentified items appear in the status panel, with a count on the status control. For example,
`2-10 G2/BROADCASTTIMER` is channel 2, layer 10, and CasparCG's file identifier. It means no matching
owned cue instance was reported, not that the video decoder necessarily failed. A Bridge restart
or another controller can cause this. Diagnostics never become rundown rows.

## Attached sound: evidence before support

Attached In/Out/step sounds execute in the graphic's program renderer. The laptop's rehearsal
monitors are silent by default; preview audio is not evidence that broadcast audio works. The
program frame explicitly permits autoplay, and metadata-only version adoption preserves access
to the corresponding hosted sounds. Hidden preparation stays silent.

The intended CasparCG path is HTML program renderer → HTML producer audio → channel mixer →
consumer's embedded audio → ATEM. Native audio files and videos already working prove that their
FFmpeg producer route works; they do not prove that the installed HTML producer captures browser
audio. Current upstream CasparCG source implements a CEF audio handler, but the studio build and
its consumer routing must be verified. Do not upgrade the server as an automatic fix.
[Upstream HTML producer](https://github.com/CasparCG/server/blob/master/src/modules/html/producer/html_producer.cpp).

OBS documents browser sources capable of audio; vMix documents Web Browser input audio mixed as
an input. These are host capabilities, not a NoaCG support promise. Record cold boot, In, Out,
each step, rapid retrigger, reconnect and recovery in each intended host. Require audible program
recording, no duplicate stings and silent operator monitors before signing off that host.
[OBS Browser Source](https://obsproject.com/kb/browser-source),
[vMix Web Browser](https://www.vmix.com/help23/WebBrowser.html).

Until verified, use separate CasparCG audio cues on the known working native route for essential
effects. Attached sounds remain supported by the authoring model, but broadcast delivery is a
rehearsal gate.

## Illustrator export and import

Keep the editable `.ai` master. Export a delivery SVG for the intended artboard. If using Save As
SVG, turn off **Preserve Illustrator Editing Capabilities**: Adobe describes it as embedding AI
data and increasing file size. Keep field text as real text rather than converting it to outlines.
Move every question and answer intended for output inside the artboard before exporting.
[Adobe SVG saving options](https://helpx.adobe.com/illustrator/using/saving-artwork.html),
[Adobe export options](https://helpx.adobe.com/illustrator/using/exporting-artwork.html).

NoaCG removes non-rendering SVG metadata during import, reports that cleanup, preserves artwork
definitions, and flags measured text fully outside the canvas before field mapping. Such text
is excluded from automatic field/behavior selection. Correct the source artwork and export again
to use it. The 512 KB template-code budget remains unchanged. Rundown admission and export use
the same production eligibility as publishing, so a broken draft is refused before show setup.

## The three-file timing comparison

Keep the original files unchanged. With ffprobe installed, run:

```powershell
node scripts/compare-studio-media.mjs 'problematic.mov' 'working-1.mp4' 'working-2.mp4'
```

The command only reads the files. It reports streams, container, duration, rates, time bases and
sampled PTS/DTS at the beginning/end. Timestamp samples, especially reordered B-frame PTS, do not
establish the cause alone. Compare all three with the media scanner/Bridge catalog and repeated
CasparCG INFO readings from matched rehearsal takes before assigning the failure to a component.
If reported position freezes or becomes invalid, NoaCG labels the timer estimated and continues
from the last credible reading. Ownership and Out eligibility do not depend on the countdown.
