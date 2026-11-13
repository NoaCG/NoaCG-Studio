# GSAP inventory and clarification request

This is E1 evidence on product `361cb6f628df0a44d410954aae527cde976d1750`.
The September 5 [decision](../../STACK_FRESHNESS.md#L271) deferred outreach for
six months. The [November 8 launch receipt](https://github.com/NoaCG/NoaCG-Studio/blob/4cf522a32bf34cd743b38744aba51f6ccb0ae1e9/kit/state.json)
(`authorization.line` and `authorization.gsap`) authorizes active execution and
brings that request forward. The project owner sends the request. A written
disposition and G07's clean-candidate review are OW1 gates.

## Bytes and routes

- `src/assets/gsap.min.js` is GreenSock's standard UMD build of GSAP **3.15.0**,
  introduced by `56082240130304e7d0da414a3ecaaa33abe0c449`. The Git blob and
  [upstream 3.15.0 distribution](https://github.com/greensock/GSAP/blob/13e2b79/dist/gsap.min.js)
  are 72,927 bytes, SHA-256
  `92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb`.
  The Windows checkout CRLF digest is
  `dd7dc87e023b3480f9707296342565ca2e361c8393cabb30f9557e06eb1bed4d`.
  Upstream's source map names `gsap-core.js`, `CSSPlugin.js` and `index.js`.
  CSSPlugin, attr, endArray, modifiers, roundProps and snap are built in.
  No standalone GSAP plugins were found in the candidate's source entry points
  or app/CLI package dependency declarations.
- The file includes its original GreenSock copyright and separate licence
  reference. The [vendor's Standard No Charge licence](https://gsap.com/community/standard-license/)
  was read on 2026-11-08. It states effective 2025-04-30 and modified 2025-05-30,
  addresses visual animation builders and requires retention of proprietary notices.
  Archive the applicable text/date with the written disposition and confirm its
  applicability to each artifact. Review the [licensing intake form](https://gsap.com/community/contact/)
  for submission.

| Surface | Artifact / source path | Evidence |
| --- | --- | --- |
| Studio app, preview and render | `gsap.min-CIpO8SLO.js`; `src/landing/gsap.ts`, `src/preview/composeDocument.ts`, `src/render/composeRenderDocument.ts`, `src/video/hyperframes/compose.ts`, `src/components/video/VideoExportPanel.tsx` | Coordinator read actual deployed app version marker `361cb6f6` and JS chunk SHA-256 `ba935b09e3d88f5088b3768486fb3c83d96a1f0e6b2373487bc083f18d1e9f44`. The decoded literal equals the upstream bytes and retains the notice. App/landing/preview/OGraf code reference it, and Bridge/output preload it. |
| SPX and NoaCG packages | `<slug>/js/gsap.min.js` written by `src/export/common.ts` and `targets/spxStarter.ts`; `noacgPackage.ts` shares it across SPX/OGraf in the combined ZIP | Source traces use the same raw import. Include the whole-production SPX package path in clean-bundle inspection. |
| Standalone OGraf and LiveOS | `lib/gsap.min.js`, emitted by `src/export/targets/ograf.ts` including the LiveOS delegate | Source trace uses the same raw import. OGraf can use a host's existing GSAP instance. |
| Standalone HTML, including CasparCG, HTML Overlay and H2R | GSAP inlined by `src/export/selfContained.ts`; HyperFrames standalone composition in `src/video/hyperframes/compose.ts` | Source traces pass the raw build into emitted HTML. Check notice and byte identity in representative actual exports. |
| Installed `@noacg/cli`, Bridge and toolkit | CLI version `0.12.4`, published gitHead `9f575a235899c3f3e12e5fc8b515aa88994cccc8`, Apache-2.0; runtime excluded by `cli/NOTICE` | Coordinator verified npm integrity and scanned 63 package files; no GSAP runtime or AGPL licence text match. Verify Bridge/toolkit outputs and shared closure in candidate review. |
| CLI and MCP commands that produce/read graphics | `/bridge` exportPackage calls `buildGraphicPackage`; scaffold/validate/record and MCP can receive app-generated package files; CLI can read, screenshot, save or repack inputs | GSAP can therefore travel through CLI/MCP in graphic output despite being absent from the installed CLI. Verify emitted files and notices as a separate path. |

Artifact traces describe current producer paths. Sampled deployment/CLI byte
inspection does not establish release-wide clean-bundle coverage. OW1 requires
representative clean emitted outputs, notice and source/dependency provenance,
redistribution scope, and absence of third-party AGPL helpers/runtime from the
CLI/shared dependency closure and emitted graphics. Retain each checked archive
and source pin. No licence, funding, animation engine or release change belongs
to E1.

## Owner's draft

Hello GSAP licensing team,

I maintain NoaCG Studio (https://noacg.studio, source at
https://github.com/NoaCG/NoaCG-Studio). NoaCG is open source, entirely free, earns
no revenue and serves broadcast graphics. Its browser editor lets operators
create and edit text, artwork and keyframed motion for live and recorded
production. It includes a visual timeline that can be used without writing code.
Graphics can be rehearsed in a browser and played offline on broadcast systems.

We vendor the standard GSAP 3.15.0 browser build with its bundled CSSPlugin and
built-in utilities. The deployed app includes it for the landing page and
graphic preview/render. SPX and combined NoaCG packages contain the runtime
under `js/gsap.min.js`. OGraf and LiveOS packages include it under
`lib/gsap.min.js`. CasparCG, HTML Overlay, H2R and downloadable standalone
composition HTML embed it. Users may share and transfer these files for offline
playback. The separately Apache-2.0 CLI and toolkit install without GSAP. The
CLI and MCP can retrieve Studio-generated packages containing GSAP and can read
or repack supplied graphic packages. NoaCG Studio is AGPL-3.0-only. The GSAP
source carries GreenSock's copyright and separate licence reference.

Would you confirm in writing whether the Standard No Charge GSAP License
covers our browser editor and these distribution paths, or whether we need
written consent or separate terms? Please include the public source repository,
deployed browser assets, the users' offline and onward distribution of exported
graphics, and the CLI/MCP package path. Please also specify any attribution,
notice and packaging requirements, including for inlined HTML and minified
browser bundles.

Thank you,

NoaCG Studio owner

## E6C technical renewal — 2026-11-13

The [technical audit](e6c/g07.json) and [exact receiving inventory](e6c/receiving-manifest.json)
renew this inventory on product source `c456f647eb8a30839473fd93467f447a181f2dc1`.
All eight actual graphics ZIPs carry the unchanged standard GSAP 3.15.0 bytes
and notice, SHA256 `92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb`.
Folder targets, combined graphics and production SPX contain the separate
runtime; CasparCG/HTML/H2R inline the identical bytes. Four Oswald/Saira fonts
and their full SIL notice are present as files or embedded equivalents.
No standalone GSAP plugin or third-party AGPL helper/runtime was identified in
these inspected artifacts and their declared source/dependency closure.

The actual published `@noacg/cli@0.12.4` archive is 203,358 bytes / 63 files,
with registry SHA512 independently verified. Its actual compiled module graph
has 222 import edges, no missing relative imports and no GSAP runtime. It carries
Apache LICENSE; it has no separate NOTICE file. Source/toolkit NOTICE describes
its separate Apache distribution. The published package carries Bridge version
**0.10.1**; the current repository's Bridge version is **0.11.0**, so those are
not relabelled as identical binaries. The [current conservative source closure](e6c/cli-closure.json)
walks 52 CLI, 18 MCP and 22 standalone-Bridge files, all within `cli/src`, and
109 production-locked dependencies with declared licences and no AGPL entries.
That is source evidence, not an inspected unpublished executable. Five actual
source-generated toolkit distributions retain Apache LICENSE/NOTICE and source
provenance. NoaCG's browser `/bridge` remains an app surface: its actual
`exportPackage` emitted the same combined graphic bytes, which include GSAP.
CLI/MCP transporting those files does not make the runtime part of their install.

The [current native app producer](e6c/native-producer.json) built the unchanged
normal full build and verified the exact source/version/manifest, normal
production ZIP import and twelve helper assertions with cleanup. Raw native
consumer archive readback remains unverified. This producer evidence and the
actual graphics-byte audit are distinct; no unperformed full archive scan is
claimed. The owner-facing [local kit](e6c-local-kit.md) identifies exact downloads.

**Terms and written disposition remain OW1.** The pinned upstream distribution
`13e2b790546426a1a2e0e9b409f3f8dc6d6611f2` has no licence/notice file. Its
[actual README](e6c/gsap-upstream-readme.md) links the standard licence and retains
GreenSock's 2008–2026 copyright. One ordinary current vendor-page request was
refused by the Cloud proxy (CONNECT 403/status000); no full terms body was obtained,
reconstructed or fetched through a bypass. E1's reported read/effective/modified
dates above remain historical observations. Archiving the applicable full terms
and date with the vendor's written disposition, or a separately approved
resolution, is still an explicit OW1/G07 prerequisite. The technical inventory
is not legal clearance. The finished owner request above remains ready and
unchanged; the owner sends it. No vendor reply or real host/operator availability
was used as a Cloud preparation exit condition.
