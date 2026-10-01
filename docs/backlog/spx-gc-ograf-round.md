---
v: 2
source: derived
kind: finding
raised: 2026-08-29
state: advanced
note: "The first real round ran on 2026-09-30 (docs/SPX_ON_A_REAL_SERVER.md): all three SPX routes on SPX 1.4.1 from source and 1.2.1, the two carried questions answered, eight defects filed. What remains is the re-run once the fixes land, and the paths this machine could not exercise."
found: "SPX-GC 1.4 reads OGraf packages; no real SPX server had played a NoaCG graphic by any route"
serves: NOW
size: small
needs-owner: none
---

# SPX real-server round: re-run after the fixes

**Filed:** 2026-08-29. **Source:** the OGraf ecosystem research round (`docs/OGRAF_ECOSYSTEM.md`
§1g). **Advanced:** 2026-09-30, by the first round on real servers,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md).

## Why

SPX is the ecosystem's most widely deployed open controller, and "plays in SPX" is a sentence
operators understand. GOALS outcome 5 asks for a graphic installed and operated on a real SPX
server. The first round proved the native export there and found the other two routes broken in
ways that are ours to fix; the claim is only whole once they pass.

## What the first round settled

- **Native SPX export:** works on 1.4.1 and 1.2.1 (fields, Play, Continue, Stop, three layers at
  once once layers are set by hand). Update works on 1.2.1 only, an SPX 1.4 defect.
- **OGraf package on 1.4.1:** does not play as imported (layer `NaN`); with layers set it plays,
  continues and stops, three at once, but renders distorted, loses field types and its custom
  actions are dead.
- **Output embed:** loads and frames the production on both servers; covers the picture with an
  opaque dark frame. A small, tested fix exists.
- **The two questions this item carried:** the graphic does not restyle the renderer's page (the
  host restyles the graphic instead); SPX sizes the graphic to its render root, which stays at the
  configured resolution and crops rather than scales in a smaller window.
- **Solo API list and OGraf through CasparCG:** read from 1.4.1's source and written in the
  record. SPX would send an OGraf item to a configured CasparCG server as if it were HTML; not
  exercised over HTTP or through CasparCG.

## What remains

1. Done: the fixes were re-walked on the servers (`SPX_ON_A_REAL_SERVER.md` §9 and §10); every
   route plays as imported, and the OGraf graphics lay out to 0 px of their bare-page positions.
2. The output embed with a real published production (the owner check
   `docs/acceptance/owner-queue/2026-09-30-r-spx-output-embed.md`).
3. SPX playing through a connected CasparCG server: the native export's CasparCG path, and the
   OGraf package's expected absence there.
4. A graphic whose canvas is not 1920x1080, in both routes.
5. Done: a NoaCG-written rundown loaded and played on both servers (`SPX_ON_A_REAL_SERVER.md` §11).
6. Script the walk. The first round was driven by throwaway Playwright scripts against SPX's own
   pages (the record's §1 says how); keeping one as `scripts/spx-walk.mjs`, like
   `scripts/ograf-external-walk.mjs`, would make item 1 a command.

## Evidence

[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md); SPX-GC v1.4.1 source
(<https://github.com/TuomoKu/SPX-GC>, tag `v.1.4.1`).
