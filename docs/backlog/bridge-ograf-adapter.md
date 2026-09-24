---
v: 2
source: owner
kind: ask
raised: 2026-09-24
state: unstarted
asked: "We want to be the client. Create the backlog item for the OGraf adapter in the Bridge; start building after tomorrow's lecture (paraphrase, 2026-09-24)"
serves: P6
size: large
touches: cli/src/playout/, src/control/playoutProtocol.ts, src/control/playoutLink.ts, src/components/home/ProductionPage.tsx, src/components/PlayoutSettingsPanel.tsx
covered-by: e2e/playout-cues.spec.ts, e2e/bridge-connect.spec.ts
needs-owner: none
---

# NoaCG Bridge drives an OGraf server the way it drives CasparCG

**Filed:** 2026-09-24. **Source:** owner, in a session about playout channels. He wants NoaCG to be
the CLIENT of an OGraf system, and to start after the 2026-09-25 lecture.

## Why

Today the Bridge speaks to one kind of playout system, CasparCG over AMCP. The OGraf Server API
has been a stable EBU standard since 2026-08-13, and every renderer that implements it takes the
same REST calls. One adapter therefore reaches every OGraf renderer at once: SuperFly.tv's
reference server, Erenprise's server, SPX, and the commercial renderers listed on ograf.dev. That
is the step that makes NoaCG an OGraf playout client. The rundown, cue editor and verbs the owner
already uses would not change, because the Bridge protocol was written for a second adapter
(`docs/BRIDGE.md` §3a: "OBS, vMix and an OGraf renderer can add an adapter without the page's
model moving").

**This reorders the full-stack plan, on purpose.** `docs/OGRAF_FULL_STACK_PLAN.md` §8 lists the
outward controller adapter (package H) AFTER the Server API facade (package G), which makes NoaCG's
own `/output` answer the API. The owner chose the client direction first on 2026-09-24. A client
does not need our own facade to exist, so H can go ahead of G.

## What it would take

1. **Protocol.** Add `'ograf'` to `AdapterId`, an `OgrafTarget` (the server's base URL), and an
   `OgrafSlot` of `{ adapter: 'ograf', rendererId, renderTarget }`. `renderTarget` is an opaque
   shallow object whose shape each renderer publishes in its `renderTargetSchema`. It is never a
   channel number. Additive, so `PLAYOUT_V` stays 2. Keep `cli/src/playout/protocol.ts` and
   `src/control/playoutProtocol.ts` byte-identical (the mirror test refuses drift).
2. **Adapter `cli/src/playout/adapters/ograf.ts`.** Map the verbs to the standard routes under
   `/ograf/v1`:
   - `take` to `POST /renderers/{id}/target/graphicInstance/load` followed by `playAction`
   - `update` to `updateAction`, `next` to `playAction` with `delta: 1`
   - `out` to `stopAction`, and All out to `graphicInstance/clear` with a `renderTarget` filter
   - `/list` to `GET /graphics` plus `GET /renderers`, so the picker can show what the server
     holds and where it can play
3. **Settings.** A playout target of kind OGraf beside CasparCG: base URL, the renderer list read
   back from the server, and a render target picked from what the renderer's schema allows (a
   form over the schema, never a typed JSON blob).
4. **Cue editor.** For an OGraf item, the channel and layer controls become one "Plays on" pick
   of renderer plus target. The rundown row shows the target's own label.
5. **Getting a package onto the server.** The standard has NO upload route. Round one plays what
   is already on the server, the same model as CasparCG clips (`video-through-playout-wrapper.md`).
   Uploading through a vendor's private route is a later, separate item. Do not adopt
   SuperFly.tv's private endpoints as if they were the standard.
6. **Honest results.** A `200` from the server is not the graphic finishing its animation. Surface
   an uncertain result as uncertain, never retry a timed-out take blindly, and never assume the
   foreign server has NoaCG's recovery. These rules are already written for package H in
   `ograf-server-api-contract.md`.

## Acceptance

- A Playwright spec against a fake OGraf server: list, take, update, next, out and All out, with
  the exact request bodies asserted the way `e2e/playout-cues.spec.ts` asserts the CasparCG
  envelopes.
- A real round against a pinned SuperFly.tv `ograf-server`, driving a NoaCG-exported OGraf package
  through the whole lifecycle, with the renderer page shown in a browser and in CasparCG's HTML
  producer.
- An owner-queue file with the route to try it.

## Evidence

- Server API routes: the pinned OpenAPI, <https://raw.githubusercontent.com/ebu/ograf/main/v1/specification/open-api/server-api.yaml>.
  Every instance route takes `renderTarget` as a `RenderTargetIdentifier` whose type "is defined
  by the renderTarget schema of a Renderer".
- The Bridge's adapter plan: `docs/BRIDGE.md` §9, milestone 3.
- What ograf-server does and does not do: `docs/OGRAF_ECOSYSTEM.md` §1a.
