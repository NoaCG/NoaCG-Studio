# src/components/video - the video editor shell

## Video editor shell (video/)

The PARALLEL editor world for the AI video project kind (VideoProject, src/model/videoTypes.ts).
App.tsx renders **VideoAppShell** instead of AppShell when docKindStore says 'video'; only the
wizard flips that switch. Every panel follows the project's ENGINE ('remotion' | 'hyperframes',
picked at creation): the code pane, the preview bridge, the validator, the render manifest and
the source download all branch on it, while the rest stay one surface.
**The player stage carries a READINESS SIGNAL and every waiter uses it.** VideoPlayerFrame
stamps `data-player-pending` on the iframe the moment a (re)load becomes owed - synchronously,
before the debounce - and `data-player-rev` once the composition has MOUNTED, exactly the
two-halves contract PreviewFrame uses for SPX (`data-doc-pending`/`data-doc-rev`, and
src/components/AGENTS.md says why one half alone cannot work). It matters more here: a load ends
in `autoplay`, so anything read off the stage or the transport while one is owed is about to be
undone rather than merely early. Keep both halves stamped on every exit from that effect - a
refused load settles too, or a waiter hangs on a deliberately broken document.

Layout: code pane (lazy Monaco, **VideoCodeEditor** - Composition.tsx with syntax-only TSX
diagnostics from monacoSetup.ts, or composition.html for HyperFrames; typing goes through
store.setSource) | splitter (model/videoLayout.ts `codeRatio` pref) | right column =
**VideoPlayerFrame** (the player stage; sandbox="allow-scripts" iframe either way - the
prebuilt Remotion Player host driven by PlayerBridge, or the HyperFrames composed-srcdoc
driver driven by HyperframesBridge (src/video/hyperframes/); bridgeRegistry holds whichever
is mounted and the chat's validator narrows to its engine's kind) over a
tabbed panel: **VideoAiChatPanel** (the primary authoring surface - auto-runs the FIRST
generation when chat holds exactly one unanswered user turn, guarded PER PROJECT ID with a
retry button on failure; every AI result applies as ONE undoable applyProject; failed
validation keeps the previous working code and offers "Apply anyway"), **VideoContentPanel**
(the editable inputs the AI declared - the video Template Definition; each becomes a shared
FieldDescriptor and renders the SHARED field row (fields/), editing `project.inputs` live
through store.setInputValue, so a non-technical user changes the headline/score/logo without
touching TSX; the image control is an asset PICKER over the project's uploads by logical name.
The panel also shows inputs INFERRED FROM THE CODE (model/videoInputInfer.ts): any
`fields.<key> ?? default` the module reads but nobody declared, badged `code` - the code is the
source of truth, so a pro who hand-writes a field gets the control the AI would have declared.
A declared input wins; an inferred one is adopted into project.inputs on its first edit, which
is why store.setInputValue takes the whole input, not just a key),
**VideoSettingsPanel**
(undoable patchSettings; duration edits in seconds, fps changes preserve seconds. Settings drive
the player and the renderer at once but NOT the composition's code, which was written against
whatever they were at generation time - so the project records that (`authoredFor`) and the panel
reports any DRIFT (videoTypes.ts settingsDrift) with a one-click "update the code" that goes
through store.requestAi -> the CHAT panel's one AI path, so it lands as a normal turn and undoes
like any other edit. `authoredFor: null` = provenance unknown: warn about nothing. Its AI-model
override uses the global provider and live catalog suggestions filtered for the video
structured-output contract, accepts an opaque id when discovery is unavailable, and never
receives a provider key),
**VideoAssetsPanel** (data-URL assets, 3 MB/asset hard cap - the render manifest budget; uploads
go through video/types.ts uniqueVideoAssetPath so an asset's LOGICAL NAME is settled once, into
the immutable path - adding or deleting another asset must never rename one, because the code and
image-input values point at that name. A few big assets can still exhaust localStorage: the save
fails LOUDLY (the shell's `video-autosave-failed` flag), never silently. It also sets each
upload's PURPOSE (model/imagePurpose.ts) via store `setAssetUse`, and is the ONE video surface
that must NOT filter by it, since it is where a reference is re-tagged or deleted. Everything
else reads `video/types.ts` `compositionAssets`, which keeps reference material out of all four
routes an asset can otherwise reach - `assets.<name>` in the code, the Content picker, the
player's data-URL map, and the render manifest. Two traps: a zustand selector that BUILDS the
filtered array returns a new reference every store write (memo the two stable parts instead), and
`createDefaultVideoProject` constructs the project field by field, so a new field must be added
to its `Pick` or the wizard's choice is silently dropped - pinned by e2e/image-purpose.spec.ts),
**VideoExportPanel** (mounts **VideoRenderPanel** when isRenderConfigured() - the engine's
manifest kind through the shared render service, with an upload-budget meter; plus the engine's
source download, standalone and plug-and-play). **SavedVideoProjects** = the 📁 My videos modal
(explicit saves; the current slot autosaves separately). The shell binds the same global
undo/redo keys as AppShell with the same guard. AI chat gates on `needsSignIn` (hosted mode)
exactly like AIPromptPanel; everything else stays open.
