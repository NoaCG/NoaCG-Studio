# Broadcaster readiness: what a national broadcaster's graphics need, and where NoaCG stands

Written 2026-10-10 against `main` at `1442117ac`. It benchmarks NoaCG against two kinds of
broadcaster requirement: **election-night results coverage** and **24/7 linear channel graphics**.
Evidence rungs are the five in `docs/GOALS.md`. The point is to separate three things that are easy
to blur: what NoaCG has proven, what it could build, and what it can honestly claim to have
delivered.

## Bottom line

- **Proven:** OGraf export (machine-verified across the catalog, plays in SuperFly's ograf-server and
  SPX 1.4.1), and the CasparCG + NoaCG Bridge path, production-proven in school and student studio
  productions since August 2026.
- **Strong design, never used in a show:** the Production Data API, which is the right foundation for
  live results.
- **Differentiator nobody else has in one product:** agent-made graphics through the CLI, MCP and
  plugin, into the same library, production and playout an operator uses.
- **Missing for a broadcaster:** maps and most chart types; a playout path that survives losing the
  cloud; redundancy; SDI verified on real hardware; newsroom and automation integration; OGraf Server
  API; hosting, security and support commitments a broadcaster can sign.

NoaCG is about four months old, has one human maintainer, and is free software with no paid surface.
None of the gaps below is a reason to change direction. Several are already on the roadmap for
ordinary users, and those are the ones worth doing.

## 1. Election-night coverage

| Need | NoaCG today | Rung | Gap | Class |
|---|---|---|---|---|
| OGraf graphics packages | v1 manifest, Web Component lifecycle, schema, steps, custom actions, measured durations (`src/export/targets/ograf.ts`); whole catalog validated against the EBU schema (`e2e/ograf-conformance.spec.ts`) | machine-verified; scenario-proven on SuperFly ograf-server and SPX 1.4.1 | Data schema is scalar only; the community checker has run on six starters only; [#964](https://github.com/NoaCG/NoaCG-Studio/issues/964) | small |
| Being an OGraf renderer or server (Server API v1, stable since 2026-08-13) | Planned ([#790](https://github.com/NoaCG/NoaCG-Studio/issues/790)) | - | Not built | major |
| Playing other vendors' OGraf packages from the library and rundown | Sandboxed on `/output` only ([#791](https://github.com/NoaCG/NoaCG-Studio/issues/791)) | machine-verified | Library and rundown | medium |
| Results graphics | Seat board, majority meter, turnout dial, results rail, three-candidate bars, standings, party straps, results crawl (ig34-ig38 and ig07 in `src/templates/infographics/`, ls20-ls23, tk13) | machine-verified via catalog gates | Not in the Election kit; English runtime words; decimal comma misread; bars snap on Update | small |
| Maps (constituencies, municipalities) | None: "no map surface, no tiles and no projection anywhere in the product" (`docs/PACK_TAXONOMY.md`) | - | A map board from published boundaries | medium |
| Hemicycle, column, line and swing charts; full-frame results pages | None | - | New graphic types | medium |
| Live results data | `PATCH /api/data/patch` into a per-production tree, bound fields follow, operator always wins (`docs/DATA_API.md`) | machine-verified; one live walk | No connector; never driven a real show | small to build, needs proving |
| Lists of parties, candidates, regions | Line lists (`label \| value` per line) joined into line fields | machine-verified | No row binding of objects (deferred on purpose, `PRODUCTION_DATA_PLAN.md` §10.7) | fine for now |
| Operator control | One dashboard on three surfaces, PVW/PGM, keyboard Take/Update/Next/Out, live actions from each graphic's states, multi-operator hosted page | production-proven for Take/Out via Bridge | No operator identity or cue locking; a shared 50 commands / 5 s cap per production | small |
| Newsroom and automation (MOS, Sofie, Mosart, iNews, OpenMedia, Octopus) | None | - | Not built | major |
| Output to the studio chain | `/output` in CasparCG through the Bridge, 720p to 4K at 25/30/50/60 | production-proven at school scale | SDI fill and key through a DeckLink never tested; no 59.94/29.97; no video-wall canvases; no ATEM | small (test) to medium |
| Surviving faults on air | Output and operator-page reload recovery, real CasparCG restart recovery, 30 s catch-up floor, stale-press refusal, offline All out through the Bridge | machine-verified; restart scenario-proven | Every take runs through one cloud database, with a recorded three-minute outage (`docs/PLAYOUT_ISOLATION_RESEARCH.md`); no local runtime, no main/backup, no as-run export, no alerting, no load or show-length test | major |
| Hosting, security, data protection | Vercel and Supabase; AGPL self-hosting of the database documented | - | Hosting region undocumented; no production recipe for the API outside Vercel; no SSO or MFA; no named sub-processor list or DPA; no penetration test | medium |
| Support | GitHub issues, one maintainer | - | No support organisation, SLA, or continuity beyond one person | not a product gap |
| Agent-made graphics | CLI 0.10.1, MCP server, Claude Code and Codex plugin; create, render every state, validate, save, pack with a rundown | scenario-proven (create to save); pack into a production machine-verified | The recurring novel-brief benchmark does not exist yet | differentiator |

## 2. 24/7 linear channel graphics

Channel branding is a different product: unattended, driven by the schedule and the playout
automation, frame-accurate, redundant, and expected to keep running if every network link fails.
The checklist below is what established channel-graphics systems offer; NoaCG's distance is stated
plainly.

| Capability | Why it matters | NoaCG |
|---|---|---|
| Schedule import (BXF, XML) and a rule engine generating the graphics playlist | Branding follows the traffic log, not an operator | None |
| Secondary events that re-time when the schedule moves | Schedules change up to air | Timed cues exist; nothing schedule-driven |
| Control by the playout automation (native driver, VDCP, Oxtel, CII, GPI, REST) | The branding engine is a slave device | None |
| Frame accuracy: preload, arm, fixed documented latency | Bugs and promos must hit the frame against cuts | Not designed for it; the hardest point for any browser renderer |
| As-run log, exportable to traffic | Sponsor proof and legally required age marks | None (log pruned after 7-14 days) |
| Logos, now/next/later from EPG data, clocks, tickers, squeezebacks, L-shapes, 8-20 layers | The content of channel branding | Graphics and layers exist; no EPG data, no video squeeze |
| Age-rating and content symbols from schedule metadata (in Finland required by Kuvaohjelmalaki 710/2011 s.5, look set by Kuvi) | Legal obligation | None |
| Emergency crawl with top priority | Public-service emergency role | Tickers exist; no priority or API-triggered alert path |
| Multi-channel from one system; key/fill outputs; planned-versus-actual monitoring; SNMP | A master control room sees failures before viewers | Several outputs per production; no SNMP, no planned-versus-actual |
| Main/backup in sync, N+1, one-button failover | One failure must not reach air | None |
| Autonomy if the controller, network or cloud is lost | Critical infrastructure | The opposite of today's design: the cloud is in the live path |
| SDI, SMPTE ST 2110, NDI; UHD/HDR | Facility I/O | Through CasparCG only; untested on SDI |
| Hardened, offline-installable, authenticated APIs | OGraf Server API v1 has no security of its own | None |
| 24/7 support with an SLA, references from similar channels | Faults at any hour | None |

**Verdict:** not a direction for NoaCG now, and not one the North Star asks for. Three items carry
over to every current user and are already on the roadmap: a playout path that keeps running when
the cloud does not (local runtime, staged in `docs/work-specs/playout-runtime-reliability/spec.md`),
an as-run export, and the OGraf Server API in both directions.

## 3. What it would take to compete with established vendors

In order of how much it would change what NoaCG can honestly claim:

1. **Production evidence at broadcast scale.** A real broadcast show, not a school studio, run on
   NoaCG and recorded. No amount of code substitutes for this.
2. **A playout path that does not need the cloud on air.** Cloud for preparation, sync and control;
   a local runtime that keeps the show going. Then main/backup.
3. **SDI and frame rates verified on real hardware** (DeckLink fill and key, 50 and 59.94).
4. **OGraf in both directions:** play foreign packages from the rundown, and expose and drive the
   Server API.
5. **Data:** a reference connector (this folder's replay), then row binding only if a real show
   needs it.
6. **Graphics:** maps and the chart types newsrooms use, at catalog quality.
7. **Integration:** MOS or Sofie, so a newsroom rundown can drive NoaCG.
8. **A deployable package:** a documented EU region, a self-hosting recipe for the whole stack, SSO,
   a data-processing agreement, a security review.
9. **An organisation:** support hours, an SLA, continuity beyond one person. This is not product
   code and the product's posture (free, no paid surface) does not provide it by itself.

## 4. Landscape facts that matter here

- The EBU OGraf site lists 16 vendors, among them SPX Graphics, SuperFly.tv, Loopic, Chyron,
  Erizos, Pixotope, Zero Density, Teikna (formerly everviz) and Mapcreator. Vizrt, Ross, Singular
  and Brainstorm are not listed. Source: `ograf.ebu.io` vendor manifest, read 2026-10-10.
- OGraf has already been used for a national election: TV 2 Denmark's anchor touchscreen in the
  March 2026 Folketing election ("Open Graphics for Live Media: OGraf Proven in a National
  Election", EBU NTS 2026,
  https://tech.ebu.ch/publications/presentations/2026/nts2026/open-graphics-for-live-media-ograf-proven-in-a-national-election).
- Teikna and Mapcreator ship OGraf maps and charts; Teikna sells election data connectors.
- Zero Density's OGraf Studio (AGPL, browser editor with AI chat and MCP agents) is the closest
  analogue to NoaCG Studio's creation side (`docs/COMPETITORS.md`).
- OGraf has no certification or conformance levels. "OGraf compatible" in a buyer's requirements
  therefore means whatever the buyer's own proof of concept tests: packages that load and play in its
  renderers, a renderer that plays its packages, or a Server API its controller can drive.
