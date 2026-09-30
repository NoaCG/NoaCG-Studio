# Playout targets: what vMix, SPX and OBS offer, and how NoaCG can meet them

Desk research, 2026-09-29 and 2026-09-30. No playout application was launched for it; the walk on
the real applications is separate work, and anything here marked UNVERIFIED is a thing that walk
can settle. Every claim about a platform links its source. Where the only source is a user forum
post or source code rather than the vendor's documentation, the text says so.

`docs/GOALS.md` outcome 5 wants one production workflow that plays out to every environment a
production uses. CasparCG through NoaCG Bridge is proven; vMix and SPX are not. This document is
the map of what those two and OBS can do, compared with what NoaCG does today, ending with ranked
routes. The routes worth building are filed in `docs/backlog/`.

## Answers first

- **Is a vMix plugin possible? No.** vMix has no plugin, extension or SDK mechanism for video or
  graphics. Its only plugin format is audio (VST3). Everything sold as a "vMix plugin" is an
  outside program that calls its HTTP or TCP API. The nearest real equivalent is an adapter in
  NoaCG Bridge that drives vMix through that API. Details in §1.1.
- **vMix cannot render HTML in its own titles.** GT titles are a closed object model (text,
  shapes, images, tickers). HTML reaches vMix only as a Web Browser input or as an NDI or OMT
  source from another renderer.
- **vMix tells a browser page nothing.** There is no JavaScript hook, no event on overlay in or
  out, and no API function that runs script in a browser input. A NoaCG page in vMix cannot know
  when the operator shows it, unless something outside the page watches vMix and says so.
- **SPX Solo, the free and open-source edition, switches off most of its HTTP API** (HTTP 501
  "not available in SPX Solo") and allows five layers. NoaCG's current SPX routes do not depend
  on that API, which is an advantage. OGraf packages in SPX play only in its web renderer, not
  through its CasparCG path (read from SPX's source; §2.3).
- **OBS already gives a local route into NoaCG pages that NoaCG does not use:** obs-websocket
  plus the `obs-browser` vendor request `emit_event` dispatches a named DOM event into every
  browser source, and browser source pages receive visibility events through
  `window.obsstudio`.
- **Three engine facts in our own tables are out of date** (§5): vMix 27 and later ship
  Chromium 115, not 103; SPX renders in whichever browser loads its renderer, not only the
  operator's; OBS 33 moves to Chromium 150.

## What NoaCG does today

From `src/export/registry.ts`, `docs/PLAYOUT_INTEGRATION.md` and
`docs/EXPORT_TARGETS_RESEARCH.md`.

| Target | Route today | Who operates | Proven |
|---|---|---|---|
| vMix | Web Browser input on the cloud output URL, or on the HTML overlay export (plays on page load; a localhost relay and control panel for live control) | NoaCG's operator page, or the bundled control panel | No. "Exports exist but are unproven in vMix" |
| SPX | Native SPX template export (one graphic); a production-wide SPX template `.html` that wraps the cloud output URL; the OGraf export, which SPX 1.4 reads | SPX's rundown for the native export; NoaCG's page for the wrapper | No real SPX server yet (`docs/backlog/spx-gc-ograf-round.md`) |
| OBS | Browser Source on the cloud output URL or the HTML overlay export; the control panel as a Custom Browser Dock | NoaCG's operator page, or the bundled control panel | Yes: cloud output on real OBS, 2026-08-03 |

NoaCG Bridge speaks a playout protocol whose vocabulary was chosen so that OBS and vMix adapters
can be added (`docs/BRIDGE.md` §3a); only CasparCG and OGraf adapters exist.

## 1. vMix

Current release: vMix 29, 29.0.0.49, released 27 October 2025
([download and release notes](https://www.vmix.com/software/download.aspx)).

### 1.1 Plugins and the real extension routes

- **No SDK and no plugin marketplace.** A December 2025 forum question asking for the vMix SDK
  was answered "That's not a thing", pointing at the function reference and the API instead
  ([forum](https://forums.vmix.com/posts/t33883-How-to-obtain-or-download-the-SDK-for-vmix)). The
  reply is from an advanced community member, not vMix staff, so the plain statement is
  UNVERIFIED by the vendor; nothing in the vMix help describes a plugin interface for video or
  graphics.
- **The one plugin format is audio:** 64-bit VST3 on inputs and outputs
  ([Audio Plugins](https://www.vmix.com/help23/AudioPlugins.html)).
- **What vMix does offer for extension:**
  - the HTTP API on port 8088 ([Developer API](https://www.vmix.com/help29/DeveloperAPI.html)) and
    the TCP API on port 8099 ([TCP API](https://www.vmix.com/help29/TCPAPI.html));
  - the Web Controller ([Web Controller](https://www.vmix.com/help29/WebController.html)) and
    Web Scripting, a list of `Function=` calls with sleeps
    ([Web Scripting](https://www.vmix.com/help29/WebScripting.html));
  - VB.NET scripts ([VB.NET Scripting](https://www.vmix.com/help29/VBNETScripting.html));
  - shortcuts and triggers such as OnOverlayIn, OnTransitionIn and OnCountdownCompleted
    ([Triggers](https://www.vmix.com/help29/Triggers.html)), and activators for MIDI and X-Keys
    feedback ([Activators](https://www.vmix.com/help29/Activators.html));
  - data sources feeding titles ([Data Sources](https://www.vmix.com/help29/DataSources.html));
  - NDI and OMT sources in and out ([NDI and OMT](https://www.vmix.com/help29/NDIandOMT1.html)).
- **"vMix plugins" in the wild are API clients:** the Bitfocus Companion vMix module
  ([repo](https://github.com/bitfocus/companion-module-studiocoast-vmix)) and Stream Deck plugins
  ([example](https://github.com/MikanseiLaboratory/streamdeck-studiocoast-vmix)).
- **Other HTML graphics tools meet vMix exactly as NoaCG does:** a Web Browser input on their
  output URL ([H2R Graphics](https://h2r.graphics/docs/how-to-use-with/vmix/),
  [Singular](https://support.singular.live/hc/en-us/articles/360012717332-Singular-and-vMix)).

### 1.2 GT Title Designer and titles

- **Editions.** GT Designer Standard (static titles, tickers, images, data sources) is in every
  edition per the product page; GT Designer Advanced (animation, PSD import) is in 4K, Pro and Max
  ([GT Title Designer](https://www.vmix.com/products/vmix-gt-title-designer.aspx)). The help says
  custom animations play only in 4K and Pro, while the built-in GT templates animate in every
  edition ([GT Title Designer help](https://www.vmix.com/help29/GTTitleDesigner.html)). The
  purchase page appears to disagree for Basic HD; UNVERIFIED.
- **Objects:** text, rectangles, ellipses, images, 3D text, tickers, image sequences, QR codes.
  There is no HTML or web object ([GT guide](https://help.vmix.com/graphics/6/Introduction.html)).
  A 2024 user request for HTML in GT titles has no staff answer
  ([forum](https://forums.vmix.com/posts/t31987-Request-for-Enhanced-HTML-Integration-in-vMix-GT-Title-with-Excel-Data)).
- **Animation states (storyboards):** TransitionIn and TransitionOut run as the title enters or
  leaves an overlay channel; Page1 to Page10 run between them on next and previous; Continuous
  always runs; DataChangeIn and DataChangeOut run when data changes
  ([Storyboards](https://help.vmix.com/graphics/6/Storyboards.html)). This is close to NoaCG's
  own step model: in, steps, out, update.
- **Field names** end in `.Text` for text and `.Source` for images, for example
  `SelectedName=Headline.Text` ([Developer API](https://www.vmix.com/help29/DeveloperAPI.html)).
  Title presets import and export as CSV ([Title](https://www.vmix.com/help29/Title.html)).
- **File format.** `.gtzip` is a zip of XML (`document.xml`) and images; `.gtxml` is the XML with
  referenced images. Neither is documented by vMix; what is known comes from users
  ([forum](https://forums.vmix.com/posts/t20108-Edit-gtzip-file)) and a third-party generator
  ([pyGTGraphics](https://github.com/cyrillsemenov/pyGTGraphics)).
- The older XAML title designer is kept only for editing old files
  ([vMix Title Designer](https://www.vmix.com/help24/vMixTitleDesigner.html)).

### 1.3 The HTTP and TCP API

Functions are from the [Shortcut Function Reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)
unless another link is given.

- **Shape:** `http://127.0.0.1:8088/api/?Function=X&Input=<number|name|key>&SelectedName=...&Value=...`.
  With no function it returns the whole state as XML: inputs with their key, number, type and
  state, `<text>` children for title fields, overlays, preview, active, recording and streaming
  ([Developer API](https://www.vmix.com/help29/DeveloperAPI.html)). vMix 28 added outputs to the
  XML and made it cheaper to poll ([release notes](https://www.vmix.com/software/download.aspx)).
- **Title functions:** SetText, SetImage, SetColor, SetTextColour, SetTextVisible and
  SetImageVisible (with On and Off forms), TitleBeginAnimation (value: the animation name),
  SelectTitlePreset, NextTitlePreset, PreviousTitlePreset, PauseRender and ResumeRender to batch
  changes, the countdown functions, SetTickerSpeed.
- **Overlay functions:** OverlayInput1 to OverlayInput8 with In, Out, Off, Last and Zoom forms,
  PreviewOverlayInputN, OverlayInputAllOff. vMix 29 raised overlay channels from four to eight in
  HD and above; Basic HD has one ([download](https://www.vmix.com/software/download.aspx),
  [purchase](https://www.vmix.com/purchase/)).
- **Layers:** SetLayer, LayerOn and LayerOff, SetLayerAnimated, and position, size, zoom and crop
  per layer 1 to 10.
- **Browser input functions:** BrowserNavigate (value: URL), BrowserReload, BrowserBack,
  BrowserForward, and keyboard and mouse enable and disable. **There is no function that runs
  JavaScript in a browser input.**
- **Adding a browser input by API:** the documented AddInput kinds do not include Browser.
  `Value=Browser|<url>` is reported by users, and width and height cannot be set that way
  ([forum](https://forums.vmix.com/posts/t18808-Add-Input-Web-Browser-via-API-with-width-and-height));
  UNVERIFIED. An adapter can instead ask the operator to add the input once and then find it by
  name in the XML.
- **Data sources and scripts:** DataSourceSelectRow, DataSourceNextRow, DataSourcePreviousRow,
  DataSourceAutoNextOn and Off; ScriptStart, ScriptStartDynamic, ScriptStop.
- **TCP API (8099):** FUNCTION, XML, XMLTEXT (XPath), TALLY, ACTS, and SUBSCRIBE to TALLY and ACTS,
  which pushes activator changes, overlay channels included, as they happen
  ([TCP API](https://www.vmix.com/help29/TCPAPI.html)). No authentication is described.
- **Access and security:** the Web Controller password is optional; "restrict access to LAN only"
  is on by default; an "enhanced security" option disables dynamic scripting and stops scripts in
  web browser inputs from reaching the Web and TCP APIs
  ([Web Controller](https://www.vmix.com/help29/WebController.html)). A NoaCG page that tried to
  call the vMix API from inside a browser input would therefore break on a hardened machine; the
  Bridge, a separate process, does not have that problem.

### 1.4 Data sources

Excel and CSV (and tables from ODS, HTML, PDF, XPS), Google Sheets (a public sheet and a Google
API key), RSS, text, XML with XPath, JSON arrays, and Zoom chat
([Data Source types](https://www.vmix.com/help29/DataSourcesTypes.html)). They bind to title
fields in the Data Source Manager, and selecting a row updates every title using it; Auto Next
steps rows on a timer ([control](https://www.vmix.com/help29/DataSourcesControl.html)). Data
sources bind to titles only, not to browser inputs. The poll interval for web sources and the
edition limits are UNVERIFIED.

### 1.5 Scripting

VB.NET, "most VB.NET 2.0 code" inside one sub, no custom classes, with .NET classes such as
`System.Net.WebClient` allowed. A script calls `API.Function(...)`, reads `API.XML()` and sets
title text directly ([VB.NET Scripting](https://www.vmix.com/help29/VBNETScripting.html)). The
help says scripting is a 4K and Pro feature
([Scripting](https://www.vmix.com/help29/Scripting.html)); the purchase page read inconsistently,
so the edition gate is UNVERIFIED. A script can call a local HTTP address, which is how a vMix
shortcut could reach NoaCG Bridge without any NoaCG code in vMix.

### 1.6 The Web Browser input

- Chromium Embedded Framework, transparent when the page sets no background, audio mixable,
  HTML5 video and WebRTC, URL, width, height and custom CSS; mouse works by default, keyboard must
  be switched on and then takes vMix's shortcuts away
  ([Web Browser](https://www.vmix.com/help29/WebBrowser.html)).
- **Chromium version, from the release notes** ([download](https://www.vmix.com/software/download.aspx)):
  vMix 22 moved to Chrome 77 and kept older versions selectable; 24 to 86; 26 to 103;
  **27 to 115**. vMix 28 added custom CSS and 29 names no browser change, so 28 and 29 are
  presumably still 115; UNVERIFIED until measured with `&debug=1`.
- **Nothing flows from vMix into the page.** No `vMix` global, no events on overlay in or out, no
  tally in the page. A long forum thread asks for exactly this, citing CasparCG's template calls,
  with no staff reply ([forum](https://forums.vmix.com/posts/t32332-Browser-Input-Integrations)).
- Remote debugging of a browser input is possible through an unsupported registry value
  ([forum](https://forums.vmix.com/posts/t32354-Control-Web-Browser-input-from-another-window)).
  That is useful to an agent walking vMix, not to a product route.

### 1.7 NDI and OMT

vMix takes NDI and OMT sources as inputs and uses an NDI alpha channel when present
([NDI and OMT](https://www.vmix.com/help29/NDIandOMT1.html),
[NDI alpha](https://www.vmix.com/help23/NDIAlphaChannel.html)). OMT, an open alternative, arrived
in vMix 29 ([download](https://www.vmix.com/software/download.aspx)). So a CasparCG server with an
NDI consumer, playing NoaCG through the Bridge as it does today, can feed vMix key and fill over
the network. No vMix document tests that combination.

### 1.8 What this means for NoaCG

vMix gives an HTML graphic a surface and nothing else. The two things a vMix operator expects,
and does not get from a NoaCG page today:

1. **The graphic animates in when it goes on air.** The HTML overlay export plays on page load.
   vMix renders browser inputs whether or not they are on air, so by the time the operator presses
   Overlay 1 the animation has already run. The cloud output does not have this problem, because
   NoaCG's own take drives it, but then the operator runs two control surfaces.
2. **The operator's own controls drive the graphic.** A vMix operator presses Overlay, uses
   shortcuts, a Stream Deck through Companion, or a title preset. None of that reaches the page.

Both are met from outside the page. The Bridge, subscribed to the TCP API, sees Overlay 1 go on
with the NoaCG input and sends NoaCG's take; NoaCG's out finishes its animation and then sends
OverlayInput1Out. A vMix trigger that calls BrowserReload on overlay in would approximate the
first point with no NoaCG code at all, at the cost of a reload per take; UNVERIFIED.

## 2. SPX Graphics

Current release: SPX 1.4.1, May 2026. Source is MIT; precompiled binaries became commercial in
1.3 ([repo](https://github.com/TuomoKu/SPX-GC),
[release notes](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/RELEASE_NOTES.md),
[releases](https://github.com/TuomoKu/SPX-GC/releases)). The documentation moved to
[docs.spxgraphics.com](https://docs.spxgraphics.com); the old `spx.graphics` host redirects to
`spxgraphics.com`.

### 2.1 Versions and editions

- **1.2 (September 2023):** API key authentication, `controlRundownItemByID`, `panic`,
  `executeScript`, `gettemplates`, JSON responses, an `onNext` template handler.
- **1.3 (mid 2024):** `rundown/json` read and write, `invokeExtensionFunction`, `feedproxy` with
  headers, renderer size presets, in-app template browsers for the SPX Store, Loopic and Ferryman.
  1.3.1 fixed security issues; 1.3.4 (January 2026) fixed renderer embedding.
- **1.4.0 (March 2026):** "support for OGraf files", reduced to five layers with simplified APIs,
  aligned with the commercial product line. **1.4.1** re-enabled some controller API endpoints.
  (All from the [release notes](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/RELEASE_NOTES.md).)
- **Editions:** Solo is free from GitHub or a one-time purchase for the precompiled build
  ([Solo](https://spxgraphics.com/software/solo/)); Production and Broadcast are subscriptions
  ([licence](https://docs.spxgraphics.com/Documentation/Server/License)). Solo excludes the
  controller and server APIs, TCP and UDP control, more than five layers, SDI, NDI and 2110
  ([SPX Solo](https://docs.spxgraphics.com/Documentation/Products/SPX+Solo)).

### 2.2 How SPX renders

- **The renderer is a page, `http://<spx-host>:5656/renderer`, and it runs in whatever browser
  loads it.** One page draws every layer; `?layers=[1,2]` splits layers across sources
  ([Renderer](https://docs.spxgraphics.com/Documentation/Renderer/Overview)). In OBS or vMix it
  runs in their Chromium ([live streaming software](https://docs.spxgraphics.com/Documentation/Renderer/Workflows/Live+Streaming+Software));
  in CasparCG it runs in CasparCG's. The controller also has a preview renderer in the operator's
  own browser ([Local Renderer](https://docs.spxgraphics.com/Documentation/Graphics+Controller/Local+Renderer)).
  One docs page gives port 5660 rather than 5656; UNVERIFIED which is current.
- **Web playout:** the server pushes commands to every connected renderer over socket.io
  ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/utils/playout_webplayer.js));
  a template's `webplayout` picks its layer.
- **CasparCG playout:** SPX sends AMCP `CG ADD`, `UPDATE`, `NEXT`, `STOP` and `INVOKE`, loading
  the template from the SPX server by URL or from CasparCG's template folder
  ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/utils/playout_casparCG.js),
  [AMCP workflow](https://docs.spxgraphics.com/Documentation/Renderer/Workflows/CasparCG+-+AMCP)).

### 2.3 OGraf in SPX

- Added in 1.4.0. SPX finds `*.ograf.json` anywhere under `ASSETS/templates/` and imports it like
  an HTML template ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/utils/spx_server_functions.js),
  [OGraf format](https://docs.spxgraphics.com/Documentation/Graphic+Templates/Formats/OGraf)).
- **Import mapping** ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/routes/routes-application.js)):
  `schema.properties` become the operator's fields. Without a hint, a boolean becomes a checkbox,
  a number a number, and everything else a text field. A per-property `v_spx` object chooses the
  SPX field type (dropdown with items, filelist, textarea, color, button, instruction). `stepCount`
  becomes `steps`; each custom action becomes a button. A manifest-level `v_spx` sets the playout
  server, channel, layer, web playout layer, out mode and colour.
- **Renderer behaviour** ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/static/js/ograf_functions.js)):
  `load` with real-time render type, then `updateAction` and `playAction`; Continue calls
  `playAction`, Stop calls `stopAction`, custom actions call `customAction`. Non-real-time is not
  used; nested objects fall back to a text field.
- **OGraf plays only in the web renderer.** The CasparCG module has no OGraf path, so an SPX
  operator who plays out through CasparCG AMCP needs NoaCG's native SPX export, not the OGraf
  package (read from the source; UNVERIFIED on a running server).
- NoaCG's OGraf export writes no `v_spx` keys today, so every NoaCG field arrives in SPX as a plain
  text field or checkbox.

### 2.4 Extension points

- **Plugins:** a folder in `ASSETS/plugins/<name>/` with an `init.js`, loaded into the controller
  page after a restart ([Plugins and Extensions](https://docs.spxgraphics.com/Documentation/Graphics+Controller/Plugins+%26+Extensions),
  [example](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/ASSETS/plugins/panicButton/init.js)).
  They are browser JavaScript in the controller: they can add buttons and call any URL that CORS
  allows, or go through SPX's own `feedproxy`.
- **HTTP API** under `/api/v1`, with an optional `apikey`
  ([API overview](https://docs.spxgraphics.com/Documentation/Control+Interfaces/REST/Overview+of+SPX+API)).
  In Solo, only these work: `version`, `panic`, `feedproxy`, `rundown/load`, the focus moves,
  play, continue and stop on the focused item, `rundown/stopAllLayers`, `changeItemID` and
  `changeItemData`. Play by id, `invokeTemplateFunction`, `directplayout`, `rundown/json`,
  `getlayerstate`, the listings and `executeScript` answer 501 "not available in SPX Solo"
  ([source](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/routes/routes-api-v1.js),
  checked on master; the exact 1.4.1 list is UNVERIFIED). Production adds the control API and
  Broadcast the server API ([Control API](https://docs.spxgraphics.com/Documentation/Control+Interfaces/REST/Control+API),
  [Server API](https://docs.spxgraphics.com/Documentation/Control+Interfaces/REST/Server+API)).
- **Other control:** a TCP command parser in paid editions
  ([TCP](https://docs.spxgraphics.com/Documentation/Control+Interfaces/TCP/Overview)); no OSC yet
  ([external control](https://docs.spxgraphics.com/Documentation/Control+Interfaces/External+Control)).

### 2.5 Data, rundowns and the store

- **Data:** CSV files in `ASSETS/csv`, one rundown item per row
  ([CSV](https://docs.spxgraphics.com/Guides/Tutorials/how+to+use+csv+files)); no native Google
  Sheets. Field types: textfield, textarea, dropdown, filelist, number, checkbox, color, button,
  hidden, caption, instruction, divider, spacer
  ([HTML format](https://docs.spxgraphics.com/Documentation/Graphic+Templates/Formats/HTML)).
- **Projects are files:** `DATAROOT/<Project>/profile.json` and
  `DATAROOT/<Project>/data/<Rundown>.json`, documented as file-system based and open to rundowns
  generated by a backend process ([content management](https://docs.spxgraphics.com/Documentation/Server/Content+Management),
  [example rundown](https://raw.githubusercontent.com/TuomoKu/SPX-GC/master/DATAROOT/MyFirstProject/data/MyFirstRundown.json)).
  Each item carries its template path, playout settings and `DataFields` with values. **An outside
  tool can therefore hand an SPX operator a ready rundown on every edition, including Solo,** by
  writing files rather than calling the API.
- **Companion:** an SPX module exists; its by-id and invoke actions fail on Solo 1.4
  ([module](https://github.com/bitfocus/companion-module-spx-graphics-controller)).
- **SPX Store:** templates, plugins and projects, free and paid, shipped as `.spxpack` files;
  third parties are invited to "get in touch" to sell there
  ([store](https://docs.spxgraphics.com/Documentation/SPX+Store/Overview)). The `.spxpack` format
  is not public; UNVERIFIED.

### 2.6 What this means for NoaCG

SPX's operator lives in the rundown: they want NoaCG graphics as rundown items with the right
field types, on the right layers, ready to play. NoaCG's native export already gives one graphic
that shape. What is missing is the rest of the show (a rundown file) and correct field types for
the OGraf route. Because Solo's API is mostly closed, a Bridge adapter for SPX would get little
more than play, continue and stop on the focused item, which the SPX operator already has in
front of them.

## 3. OBS Studio

Current release: OBS 32.2.2 (August 2026); OBS 33 is in beta
([releases](https://github.com/obsproject/obs-studio/releases)).

### 3.1 Browser source

- **Chromium:** OBS 31.0 moved browser sources and docks to CEF 127
  ([31.0.0](https://github.com/obsproject/obs-studio/releases/tag/31.0.0)), and 31.x and 32.x stay
  there. **OBS 33.0 beta 4 moves to CEF 150**
  ([33.0.0-beta4](https://github.com/obsproject/obs-studio/releases/tag/33.0.0-beta4)). OBS 32.1
  "improved security of browser sources using local files"; what that changes for a local `.html`
  is UNVERIFIED.
- **Page API** ([obs-browser README](https://github.com/obsproject/obs-browser/blob/master/README.md)):
  `window.obsstudio` gives the page OBS's status, scenes and transitions, and at higher permission
  levels control of scenes, recording and streaming. The operator sets the level per source as
  "Page permissions"; the default is read access to OBS status
  ([source](https://raw.githubusercontent.com/obsproject/obs-browser/master/obs-browser-source.hpp)).
- **Events into the page** (same README): `obsSourceVisibleChanged`, `obsSourceActiveChanged`,
  scene, transition, streaming, recording and replay events, and any custom event sent through
  obs-websocket (§3.3). **A NoaCG page can know when the operator shows it**, which vMix cannot
  offer. Whether the visibility events reach a page at the default permission level is
  UNVERIFIED.
- **Settings** ([source](https://raw.githubusercontent.com/obsproject/obs-browser/master/obs-browser-plugin.cpp),
  [KB](https://obsproject.com/kb/browser-source)): local file or URL, width and height, frame rate,
  custom CSS (default makes the page transparent), "Shutdown source when not visible", "Refresh
  browser when scene becomes active", "Control audio via OBS", and a refresh button. Hardware
  acceleration is global.

### 3.2 Custom Browser Docks

Docks are web pages in the OBS interface, not available on Linux Wayland (README above). They do
not get `window.obsstudio`: an OBS moderator said so in 2021
([forum](https://obsproject.com/forum/threads/cant-access-js-api-callbacks-in-custom-browser.141712/)),
and the current dock code still has no such handling
([source](https://raw.githubusercontent.com/obsproject/obs-browser/master/panel/browser-panel-client.cpp)).
Docks use their own CEF request context and cache path
([source](https://raw.githubusercontent.com/obsproject/obs-browser/master/panel/browser-panel.cpp)),
so storage and BroadcastChannel are probably not shared between a dock and a browser source
(inferred from the code, UNVERIFIED by test). The bundled relay does not depend on that, because
it carries commands through a local HTTP server.

### 3.3 obs-websocket

- Bundled since OBS 28, port 4455, password with a challenge
  ([obs-websocket](https://github.com/obsproject/obs-websocket),
  [protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)).
- Requests that matter for graphics: `CreateInput` with kind `browser_source` and its settings,
  `SetInputSettings` to change the URL, `PressInputPropertiesButton` with `refreshnocache`,
  `GetSceneItemId` and `SetSceneItemEnabled` to show and hide, `SetCurrentProgramScene`, and
  `CallVendorRequest`.
- **The route into the page:** obs-browser registers the vendor `obs-browser` with the request
  `emit_event`, which "emits a custom event to all browser sources"
  ([README](https://github.com/obsproject/obs-browser/blob/master/README.md)); the page receives a
  DOM `CustomEvent` with the payload in `detail`
  ([source](https://raw.githubusercontent.com/obsproject/obs-browser/master/browser-app.cpp)).
  It reaches every browser source, so a page must filter on its own id; it does not reach docks.
  `BroadcastCustomEvent` goes only to websocket clients.

### 3.4 Plugins, scripts and scene collections

- Native plugins are C and C++ on libobs ([plugins](https://docs.obsproject.com/plugins)); scripts
  are Lua or Python with the frontend API ([scripting](https://docs.obsproject.com/scripting)).
  OBS 32 added a basic plugin manager and OBS 33 changes where plugins load from
  ([32.0.0](https://github.com/obsproject/obs-studio/releases/tag/32.0.0),
  [33.0.0-beta4](https://github.com/obsproject/obs-studio/releases/tag/33.0.0-beta4)). No official
  plugin store was found. For delivering graphics, a plugin adds little over a browser source and
  obs-websocket and costs a native build per platform; StreamElements keeps its overlays as
  browser sources and uses its plugin only for docks and menus
  ([SE.Live](https://docs.streamelements.com/selive/getting-started)).
- Scene collections are JSON and can be imported, but their schema is not documented
  ([forum](https://obsproject.com/forum/threads/import-json-scenes.169639/)); creating the source
  over obs-websocket is the documented path.
- Graphics operators commonly add Downstream Keyer, which keeps overlays above every scene
  ([resource](https://obsproject.com/forum/resources/downstream-keyer.1254/)).
- The Companion OBS module can send any obs-websocket request, vendor requests included
  ([help](https://github.com/bitfocus/companion-module-obs-studio/blob/main/companion/HELP.md)), so
  a Stream Deck could fire `emit_event` at a NoaCG page with no NoaCG module.

### 3.5 What this means for NoaCG

OBS is the best-served of the three already. Two cheap gains remain: a page that plays its
entrance when the operator shows the source, and a local control route through obs-websocket
that needs no relay page and no internet, and that Companion already speaks.

## 4. Routes, ranked

Ranked by how much of a real operator's show they unlock for the work. "Filed" names the backlog
item; unfiled routes are recorded here so nobody re-derives them.

### vMix

| # | Route | What it would take | Who it serves | Filed |
|---|---|---|---|---|
| 1 | **Bridge vMix adapter** (the plugin equivalent): the Bridge drives vMix over HTTP and listens over TCP, so vMix's overlay channel and NoaCG's take are one action | An `adapters/vmix.ts` beside CasparCG's: find the NoaCG browser input by name, OverlayInputN In and Out tied to take and out, SUBSCRIBE ACTS so a vMix-side overlay press becomes a NoaCG take, a vMix target in Playout settings | A vMix operator who wants to run the show from vMix, a Stream Deck or NoaCG, with animations that play on air | `bridge-vmix-adapter.md` |
| 2 | **Documentation: running NoaCG in vMix** | Say that the HTML overlay plays on load; recommend the cloud output or the relay for live shows; the enhanced security option; keyboard capture; Chromium 115 | Every vMix user today | `playout-engine-facts-and-guide-corrections.md` |
| 3 | vMix trigger calls BrowserReload on overlay in | Test it in the walk; if it works, one paragraph in the guide | A vMix user with a single exported overlay and no Bridge | Folded into route 2 |
| 4 | NDI or OMT from CasparCG into vMix | Nothing new in NoaCG; a guide section once someone runs it | A venue with a CasparCG box and a vMix switcher | Not filed: no demand seen |
| 5 | A read endpoint that vMix polls as a JSON data source, feeding its GT titles | A public read of a production's field values; the Data API is write-only today (`docs/DATA_API.md`) | A vMix user who keeps GT titles but wants NoaCG's data | Not filed: it serves vMix's graphics, not ours |
| 6 | Export to GT (`.gtzip`) | An undocumented format with no HTML, so each design would be re-authored in GT's object model and lose most of what NoaCG draws | A vMix user who refuses browser inputs | Not filed: poor return |

### SPX

| # | Route | What it would take | Who it serves | Filed |
|---|---|---|---|---|
| 1 | **`v_spx` hints in the OGraf manifest** | Map each NoaCG field kind to an SPX field type (dropdown with items, textarea, color, filelist, number) and set a default layer; a test that reads the manifest the way SPX's importer does | An SPX 1.4 operator using the OGraf package: the right controls instead of text boxes | `ograf-manifest-v-spx-hints.md` |
| 2 | **An SPX rundown in the production export** | Write `profile.json` and a rundown JSON with one item per cue, entry values filled, beside the template folders the SPX flavour already writes | An SPX operator who wants the whole show ready to play, on any edition | `spx-show-export-rundown.md` |
| 3 | The real SPX round | Already filed; add the Solo API limits and "OGraf only in the web renderer" to what it checks | Proving outcome 5 | `spx-gc-ograf-round.md` (existing) |
| 4 | Documentation: which SPX route for which setup | CasparCG through SPX needs the native export; OGraf needs the web renderer; Solo is five layers | Every SPX user | `playout-engine-facts-and-guide-corrections.md` |
| 5 | Bridge SPX adapter over the HTTP API | On Solo it can only play, continue and stop the focused item | Few: the SPX operator already has the rundown | Not filed |
| 6 | An SPX controller plugin (a NoaCG panel inside SPX) | `init.js` that links to the production page or lists library graphics; it cannot write templates on Solo | Marginal | Not filed |
| 7 | NoaCG packs in the SPX Store | A commercial listing through SPX; `.spxpack` is not public | A business question with money and an outside account in it | Not filed: an owner decision, not a build |

### OBS

| # | Route | What it would take | Who it serves | Filed |
|---|---|---|---|---|
| 1 | **Play the entrance when the source is shown** | The exported overlay listens to `obsSourceVisibleChanged` (and active), plays in on show and resets on hide, behind a setting; plain autoplay stays the default outside OBS | An OBS user with an exported overlay switching scenes | `obs-play-when-source-shown.md` |
| 2 | **obs-websocket control: Bridge OBS adapter and `emit_event`** | The page listens for a NoaCG `CustomEvent`; the Bridge or the control panel sends it through `CallVendorRequest`; the adapter creates the browser source, shows, hides and refreshes it | An OBS operator on a closed network, and anyone with Companion's OBS module | `bridge-obs-adapter.md` |
| 3 | Documentation: OBS 33 and Chromium 150; the dock pairing claim; "Refresh browser when scene becomes active" as today's workaround for route 1 | Guide and table edits | Every OBS user | `playout-engine-facts-and-guide-corrections.md` |
| 4 | An OBS plugin or script | Native builds per platform for little gain over routes 1 and 2 | Not justified now | Not filed |
| 5 | Generated scene collection | Undocumented schema; obs-websocket does the same job documented | Not justified | Not filed |

### Across all three

The operator's hardware already talks to all three hosts through Companion. Routes vMix 1 and
OBS 2 make a NoaCG graphic answer to the host's own controls, which complements
`docs/backlog/companion-and-stream-deck.md` (hardware driving NoaCG's page through the Bridge)
rather than replacing it: both end in the same named verbs.

## 5. Facts in existing docs that this research contradicts

Not edited here; filed as `docs/backlog/playout-engine-facts-and-guide-corrections.md`.

- `src/validation/engineSupport.ts` `PLAYOUT_ENGINES` and `docs/PLAYOUT_COMPATIBILITY.md` §1 list
  "vMix 27+" at Chromium 103. vMix's release notes put 103 in vMix 26 and 115 in vMix 27. 115 is
  still below the supported floor of 117, so the conclusion (vMix sits below the floor) holds; the
  number is wrong.
- The same table says SPX renders in the operator's own auto-updating browser. That is true only of
  the controller's preview. On air, SPX's renderer runs in the Chromium of whatever loads it
  (CasparCG, OBS, vMix), and its CasparCG path loads templates into CasparCG's browser.
- The same table has no row for OBS 33 (Chromium 150, in beta).
- `docs/PLAYOUT_INTEGRATION.md` §4 says a Custom Browser Dock pairs with a browser source over the
  same-origin channel. OBS gives docks their own request context, so that pairing probably fails
  without the relay; UNVERIFIED until tried in OBS.

## 6. Not verified

- An official vMix statement that there is no SDK, and that GT cannot render HTML (both rest on
  forum posts and on the absence of any such feature in the docs).
- The official AddInput syntax for a browser input, and what the XML state shows for one.
- The Chromium version in vMix 28 and 29, and whether older engines are still selectable.
- Whether a vMix trigger calling BrowserReload on overlay in replays a NoaCG entrance cleanly.
- The edition gates for vMix scripting and data sources, and the poll interval for web sources.
- The exact SPX Solo 1.4.1 API list, the renderer port (5656 or 5660), and the `.spxpack` format.
- That SPX never plays OGraf through CasparCG (read from the source).
- Whether OBS visibility events reach a page at the default permission level, and whether a dock
  and a source share storage.
- What OBS 32.1's local-file security change does to an exported `.html`.
