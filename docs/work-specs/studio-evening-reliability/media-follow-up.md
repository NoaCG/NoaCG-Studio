# Original broadcast media follow-up

## Scope and result

Use the 2026-10-05 originals to distinguish file defects from cue-state defects. The supplied
folder contains 45 files across G1, G2 and g3_productions. All 15 MOV/MP4 files decode fully,
including audio, with the installed CasparCG FFmpeg and no reported errors. No originals were
renamed, converted or edited. The existing Bridge, CasparCG configuration and hosted application
were not updated or restarted.

The account's `6.10 post stream test` production was found in the browser and cloud document
store with five cues. Its saved edit time was 2026-10-06T09:01:05.377Z. A separate production,
`6.10 post stream test copy`, was made through the ordinary UI for playback comparisons.

## Confirmed Insert 2 defect

`G1/insert 2 .mp4` has a significant space before its extension. CasparCG's CLS and INFO report
`STREAMS-5-10/G1/INSERT 2 `, retaining that space. The Bridge's INFO parser trimmed it.
Consequently its own accepted Take no longer matched the playing file. The browser showed
`replaced on the server`, no program cue/countdown and disabled Out, while CasparCG played the
video normally. This was reproduced using the installed Bridge 0.8.1 and hosted UI.

Inserts 1 and 3 remained recognized, with updating countdowns and successful clearing in the
same copied production. Insert 1 and Insert 2 otherwise both have 500 frames at 25 fps, H.264
video and AAC audio, duration 20 seconds, and regular timestamps. Insert 3 has 601 frames at
24 fps with H.264 video and PCM audio in MOV, duration 25.041667 seconds. That difference did
not reproduce a timer failure.

The correction preserves the literal `file/name` and `file/path` XML text for foreground and
queued producers. Other numeric, boolean and structural fields keep their existing parsing.
File identities remain distinct, including names that differ only in significant whitespace.
The captured real INFO reply is a regression fixture. Both new tests fail before the fix.

A separate temporary branch-built Bridge then played all 15 originals to their ends on the
unused local test slot 2-90. Across 1,214 state readings, every file retained its instance and
cue ID, reported a valid position and duration, reached its end and cleared successfully with
Out. This includes Insert 2 and the variable-rate HoHoHoney file. The installed Bridge remained
running, and the temporary test process closed after testing. This verifies Bridge state and
CasparCG timing, not every graphic/audio combination through the studio's production mixer.

## Immediate Clear correction

The existing new `clear` verb was accepted by the Bridge's request parser, but the CasparCG
adapter had no corresponding command. A real request reproduced `Unknown verb "clear"`.
The adapter now sends `CLEAR channel-layer`, advertises the verb and clears its follower memory.
The slot memory already forgets cue instances on an accepted Clear. Regression tests cover
owned and externally started media with queued backgrounds while another slot keeps playing.

A temporary branch-built Bridge also passed this against the real CasparCG: Insert 2 retained
ownership on 2-90, Insert 3 was queued behind it, and Clear removed foreground and background
while Insert 1 continued on 2-89. Both temporary layers were cleared afterwards. CasparCG may
omit a cleared layer entirely from INFO; that is an empty slot. Its 202 reply acknowledges a
queued command, so verification waited for fresh INFO to confirm the frame had applied it.

The filename defect is a proven present-day cause of the reported timer/Out symptoms. It does
not establish which file caused every historical incident: the photographed G2/BROADCASTTIMER
has a normal filename, and the historical logs are not available.

## Space Out warning and rundown jump

The hosted application and installed Bridge reproduced this independently of the Insert 2
filename defect. Taking the working Insert 1 and pressing Space to take it off briefly showed
`Unidentified item on 2-10 STREAMS-5-10/G1/INSERT 1`. The first cue moved from 95.333 to
131.333 pixels and back, a 36-pixel jump. Out succeeded and the program returned to empty.
The captured DOM observations are retained in ignored
`bench-health/studio-night/space-stop-rundown-jump.json`.

This message means a nonempty channel/layer was reported without a matching owned cue
instance. Channel 2, layer 10 is the video slot. The Bridge releases its instance after an
accepted Out; CasparCG command acceptance can precede the empty frame, allowing INFO to
briefly report the outgoing file without ownership. The following empty reading removes the
diagnostic. This is not, by itself, a failed stop or a corrupt media file. A persistent
unidentified producer still deserves checking against the actual program output.

The branch already places these diagnostics in the production status panel, outside the
rundown and its scroll area. A new browser regression forces the exact owned-video to
accepted-Space-Out to unowned-outgoing-file to empty transition. It requires every cue's
position, height, order and selection to stay fixed while the diagnostic appears and clears.
The diagnostic remains explicit; no blanket delay hides genuinely external output. This
change is not yet deployed, which explains why the current hosted rundown still jumps.

## Other metadata findings

- `Credits.mp4` has one video frame lasting 0.04 seconds. CasparCG's scanner classifies it as
  STILL. A picture cue without a countdown is therefore expected; it is not a normal long clip.
- `HoHoHoney_Insert.mp4` is 848 by 464 with variable frame timing. Full packet inspection finds
  durations of 0.008333, 0.016667 and 0.018333 seconds. It decodes without errors.
- CLS undercounts `harju8.mp4` and `AlbumTeaser.mp4` by one 25 fps frame compared with ffprobe.
  Actual INFO reports their full lengths. This small scanner discrepancy does not explain a
  frozen timer. Runtime timing should continue to prefer fresh INFO over scanner estimates.
- Non-widescreen pictures are present, including square and portrait files. CasparCG 2.5's
  image producer defaults to STRETCH if SCALE_MODE is absent, matching the reported distortion.

## Audio route and remaining evidence

Independent audio cues use the native media command and their configured slot. TRANALJUD in
the supplied production is on 2-5. Attached graphic-step audio uses Web Audio inside the program
graphic renderer. Its sound belongs to that renderer's output channel; it is not separately
copied to channel 2. If the graphic output is on channel 1, its embedded audio is on channel 1.
The installed CasparCG 2.5 source includes the HTML producer's CEF audio handler.

The supplied production presently has four video cues and one independent audio cue, with no
quiz graphic. The exact graphic and step binding are still needed to verify the original quiz
sound. The source route is established; recording of that actual step through the production
audio path has not been checked. The operator is handling downstream audio routing.

## Additional work to implement

### Preserve picture proportions

Goal: a newly added picture keeps its aspect ratio, centered inside the output with black bars.
The left cue editor offers **Fit** (default) and **Stretch**. The setting belongs to the cue,
follows the production between computers, and applies on its next Take. Changing it during
playback does not silently reload a live picture. Crop/fill modes are outside this request.

Use CasparCG 2.5's native `SCALE_MODE FIT` where applicable. Add an explicit Bridge feature and
server capability before sending the additive image setting; an older Bridge must explain
that Fit needs an update rather than silently stretching. Preserve an explicit Stretch route.
Confirm opaque black bars with lower layers active: native geometry fitting alone may expose
underlying content instead of creating opaque bars. Do not reserve or clear another operator's
layer to manufacture a background. Resolve composition on the picture's own slot before
claiming this complete. No installed Bridge update is part of development testing.

Acceptance: actual supplied portrait, square and wide pictures retain proportions; unused
areas are black even above other content; Stretch fills the output when chosen; replacing or
clearing a picture leaves no background artifact; old Bridge/server behavior is explicit;
cloud reload retains the choice; graphic and video routes remain unchanged.

### Add several media files or a whole folder

Goal: collect videos, pictures and sounds without reopening the picker after every Add.
Keep the picker open after an individual Add, with a short added confirmation and a Done action.
Support file selection and **Add selected (N)**, plus **Add folder (N)** for the current folder
including its descendants. Show the count before adding; respect Video/Audio filters. A folder
addition appends cues in stable relative-path order, without starting automatic playback or
creating a play-through folder. This avoids turning a file-import operation into a playback mode.

Reuse the existing file-identity/pool logic in a batch model operation so one addition is one
production edit. Keep original names, media kind, duration metadata and existing routes. Audio
still gets its audio layer. No file transfer, conversion or CasparCG configuration change.
Preserve the selected operational cue while adding; selecting a newly added cue is explicit.

Acceptance: add multiple original videos and sounds in one operation; add all descendants of
G1/G2/g3 without missing or duplicating selected entries within that operation; significant
filename spaces survive; repeated intentional additions create new cues on stable pool entries;
one cloud write carries the batch; filters, folder navigation, Escape/Done and keyboard focus
work; adding never sends Take or changes an on-air slot.

These are separate UI/protocol upgrades. The confirmed timer fix is kept small and independently
verifiable; neither new feature is claimed implemented in this investigation.

## Local evidence

Detailed metadata, full video decode results, full packet inspection, captured live INFO,
the reproduced UI screenshot and full-duration Bridge test readings are kept in ignored
`bench-health/studio-night/`. They refer to local originals and are not uploaded media.
The permanent regression fixture is `cli/test/fixtures/info/studio-insert2-whitespace.json`.
