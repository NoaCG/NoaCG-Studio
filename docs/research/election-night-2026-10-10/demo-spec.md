# Election night on NoaCG: a proving scenario (proposed spec)

Status: **proposed, not started.** Written 2026-10-10 from the research in this folder. Nothing here
is built. If it starts, it moves to `docs/work-specs/election-night/` and gets a `work.json`.

## Why

An election night is the hardest realistic data-driven live production most broadcasters run: four
to five hours of numbers moving at once, many graphics reading the same truth, two languages, an
operator who must stay in control, and no second take. If NoaCG's existing systems carry one
convincingly (graphics, production data, rundown, control, OGraf export and the Bridge to
CasparCG), they carry sports results, quizzes and every lighter data show. It is also a demanding
brief for the agent door: structured data, many related graphics, two languages.

It is the "real leaderboard in a real show" that `docs/PRODUCTION_DATA_PLAN.md` §10.7 waits for
before adding anything to the data model, and the "revisit with external data feeds" that
`docs/PACK_TAXONOMY.md` names for maps and charts. This spec tests whether the existing model is
enough before anything new is built.

## Goal

One repeatable, recorded run against **real historical election data** that shows the whole
workflow on the product as it is:

create graphics -> connect election data -> prepare a production -> operate live -> results update
-> recover from errors -> output through NoaCG to CasparCG, and the same graphics exported to OGraf
hosts.

It proves capabilities; it is not a scripted video of something that does not run.

## Non-goals

- A separate election product, data model, runtime or app. Everything goes through the existing
  graphics, production data, rundown, control, export and Bridge paths.
- A live connection to the Ministry of Justice. There is no public live feed; the demo replays.
- A forecast model. Forecasts are each broadcaster's own. The graphics support a forecast *state*;
  the demo does not invent forecast numbers (see "Forecast state").
- 3D, AR, virtual sets and presenter touchscreens.
- Candidate photos and party logos (rights; see `election-data.md`). Image fields stay ready for a
  broadcaster's own assets.
- Polling-district maps (no national open boundaries).
- Redundancy and failover engineering. The demo states the cloud dependency honestly instead.
- Imitating any broadcaster's look. The package is independently designed and branded.
- A Claude Code mod as a dependency (see "Agent workflow").

## What election nights put on air

`graphics.md` ranks what the sampled broadcasts showed. In short: one persistent party results bar
carries the night, the same graphics switch to a forecast behind an editorial gate, full-screen
comparisons also run on the studio's LED wall, and seat distributions, area panels beside video,
candidate bars, a 20:00 countdown and operator-filled tags fill the rest. Data refreshes in versions
about every five minutes, and a Finnish and a Swedish programme run at once from the same templates.
Maps appeared on the web results services but not on air in the sampled frames.

## Key decisions

1. **Data enters through the Production Data API, from an external connector.**
   `scripts/election-replay.mjs` on the `scripts/weather-feed.mjs` pattern reads the official files,
   computes, and writes absolute values with `PATCH /api/data/patch`. No in-app connector
   (`PRODUCTION_DATA_PLAN.md` §10.5).
2. **The connector computes, the templates stay dumb.** Aggregation, shares, changes against the
   previous election, d'Hondt, sorting and the replay clock live in the connector. Templates format
   and animate.
3. **Lists travel as line arrays** (`"label | value | ..."`), which the data model already joins into
   the line fields the seat board, results rail and standings read. No row binding of objects.
4. **One production per language programme.** A Finnish and a Swedish programme run at the same
   time with the same templates, so the connector writes the same tree into two productions, each
   with its own data key, and language lives in fields and data. No language switch inside a
   running graphic.
5. **Operator choices stay prepared values.** Which area a panel shows is a dropdown the operator
   sets on the cue; the data field carries every area and the template filters. Data never selects,
   takes or clears anything.
6. **The forecast is a graphic state behind an operator gate,** not a data event. The bar and the
   full-screens carry two bound line fields, results (`national.*`) and forecast (`forecast.*`), and
   a *Forecast* state the operator enters and leaves; the state decides which field shows and draws
   the tab. A data update never changes the state.
7. **A map is a graphic, not a map engine.** Boundaries from Statistics Finland are projected and
   simplified once, at authoring time, into SVG paths inside the graphic. At runtime it reads
   `code | party` lines and a `party | colour` list. No tiles, no runtime projection.
8. **Output on the production-proven path.** NoaCG `/output` through the Bridge on CasparCG at
   1080p50 for programme, and a second output following the same production for the LED wall. The
   OGraf export on SuperFly's ograf-server and SPX 1.4.1 is the portability check.
9. **Every screen that shows data says it is a replay**, with the election and the source.

## Data

Main scenario: EKV-2023 parliamentary, replayed from the final check-count files on the real
election-night timeline (`election-data.md`, "Replay design"). Short scenario: TPV-2024_2
presidential runoff. The tree the connector writes, shaped for the graphics:

```jsonc
{
  "replay":  { "label": "Replay: parliamentary election 2023 (oikeusministeriö)", "clock": "21:44" },
  "count":   { "countedPct": "52,3", "turnout": "72,0", "turnoutPrev": "68,7" },
  "national": {
    "bar":     ["KOK | 20,8 | +3,8", "PS | 20,1 | +2,6", "SDP | 19,9 | +2,2", "...", "muut | 2,1 | -0,4"],
    "compare": ["KOK | 20,8 | 17,0", "PS | 20,1 | 17,5", "..."],
    "seats":   ["KOK | 48 | +10", "PS | 46 | +7", "SDP | 43 | +3", "..."]
  },
  "forecast": { "bar": [], "seats": [] },
  "coalition": { "seats": "109", "majority": "101" },
  "areas": {
    "panel":      ["01 | Helsinki | 52,3 | 23 | KOK 7 +1; SDP 5 0; VIHR 4 -2; ..."],
    "candidates": ["01 | Valtonen | KOK | 32 562 | elected", "..."]
  },
  "map": { "constituencies": ["01 | KOK", "02 | KOK", "..."] }
}
```

One patch per tick carries only what changed. At 12x compression (20:00 to 00:17 in about 22
minutes) that is well inside the ingest budget of 25 updates per 5 seconds and 16 KB per request,
also when written to two productions.

### Forecast state

The replay has no forecast and the demo does not make one up. To show the gate working, the
operator opens it once with `forecast.*` filled from the count at that moment, and the tab reads
"example" instead of "forecast". A broadcaster's model would write the same paths.

## Graphics package

Independently designed, one look, Finnish and Swedish. Existing catalog graphics are reused where
they fit; the gaps are made through the agent door or the catalog's own authoring.

| # | Graphic | Source | Data | Priority |
|---|---|---|---|---|
| 1 | Persistent party results bar with Results and Forecast states, alternating elections | new | `national.bar`, `count.*`, `forecast.bar` | must |
| 2 | Full-screen party comparison, paired bars, optional highlighted group | new, from the poll boards | `national.compare` | must |
| 3 | Seat distribution with change | ig34 Seat Board, extended with change | `national.seats` | must |
| 4 | Area panel beside a video box, area chosen on the cue | new, standings-based | `areas.panel` | must |
| 5 | Countdown to 20:00 | existing countdown | clock | must |
| 6 | Head-to-head bar with 50 % marker and an empty pre-20:00 state (runoff) | ig07 Election Bars, extended | runoff tree | must for the runoff scenario |
| 7 | Majority meter for a named coalition | ig35 Majority Meter | `coalition.*` | should |
| 8 | Turnout dial with change | ig36 Turnout Dial | `count.turnout*` | should |
| 9 | Top candidates and elected per constituency | new, standings-based | `areas.candidates` | should |
| 10 | Party and location tags, headline strip | existing lower thirds and tags | prepared values | should |
| 11 | Constituency map coloured by leading party | new, agent-made | `map.constituencies` | could |
| 12 | Results crawl | tk13 Results Crawl | from `national.bar` | could |

## Product fixes this needs, which every user gets

These are the reason the scenario is worth running even if nobody ever airs an election on NoaCG.
Each is a backlog issue with its own acceptance criteria.

- **Decimal comma and local digit grouping** ([#971](https://github.com/NoaCG/NoaCG-Studio/issues/971)).
  The data boards read "52,3" as 523 and always print "42.3%" and "124,213" (`parseIgNumber`,
  `formatThousands` in `src/templates/infographics/dataRuntimes.ts`).
- **Runtime words as fields, and the boards findable from the Election kit**
  ([#972](https://github.com/NoaCG/NoaCG-Studio/issues/972)). "MAJORITY", "OVER", "SHORT",
  "of N seats" and " pts" are hard-coded in English; the kit does not offer ig34-ig38 or ig07.
- **Animate between values on Update** ([#973](https://github.com/NoaCG/NoaCG-Studio/issues/973)).
  Bars and counts snap today; a results board must glide from the last figure to the new one, and
  re-sort, without replaying its entrance.
- **Data freshness on the dashboard** ([#974](https://github.com/NoaCG/NoaCG-Studio/issues/974))
  and an **as-run export** ([#975](https://github.com/NoaCG/NoaCG-Studio/issues/975)).
- **A map board** made from published boundaries, reading region lines
  ([#978](https://github.com/NoaCG/NoaCG-Studio/issues/978)): useful for weather, regional news,
  sport and travel as much as for elections.
- The replay connector itself is [#977](https://github.com/NoaCG/NoaCG-Studio/issues/977); SDI key
  and fill is [#976](https://github.com/NoaCG/NoaCG-Studio/issues/976).

## Operating the night

1. **Prepare.** Install the package into two productions, Finnish and Swedish; bind fields with
   *Bind all by title* on the Data tab; rundown folders *Opening*, *National*, *Areas*,
   *Candidates*, *Close*; *Prepare for Live* until READY; the Bridge pairs each production with its
   CasparCG channel, plus a wall channel.
2. **Before 20:00.** Countdown on screen and wall; the results bar on air in its empty state.
3. **20:00.** Start the replay. Advance votes arrive; the bar fills and keeps moving while on air in
   both languages.
4. **Through the night.** The operator takes the comparison full-screen (also on the wall), the
   seat distribution, area panels (dropdown choice), candidate boards, tags and strips. Every value
   on air moves with the data; every take, out, choice and the forecast gate are the operator's.
5. **Errors, on purpose,** while graphics are on air:
   - Kill the connector for two minutes: graphics hold their last values; the "updated" time shows
     the data is stale; on restart the connector reconciles from `GET /api/data/state` with no
     backwards jump.
   - A wrong figure arrives: the operator types the correct value over it, or unbinds that field on
     the Data tab so the feed stops moving that graphic while the others continue.
   - Restart the CasparCG channel mid-show: on-air graphics come back with current values.
   - Reload the operator page: ON AIR state is restored.
6. **Close.** All out. There is no as-run export yet (the log is pruned after 7-14 days), so the
   run's log is captured from the database for the record; an as-run export is a backlog item.

## Agent workflow

Claude Code or Codex with the published `noacg` plugin makes one of the new graphics from a brief,
for example the map: "a Finnish constituency map that colours each constituency by its leading party
from `code | party` lines and a `party | colour` list, labels in Finnish and Swedish, this package's
look". The agent scaffolds, validates, renders every state and saves to the library; the graphic is
opened in the editor for what the editor supports (text, colour, position), installed into the
production, bound and taken to air. Deeper changes go back through the agent.

A Claude Code mod is not part of this. If the core works, a small status line showing the target
production and the replay clock is half a day's work and optional; nothing else is worth building
for a demonstration.

## Acceptance criteria

1. **Correct replay.** The connector's final tick for EKV-2023 reproduces the ministry's seats per
   party and constituency, elected flags and comparison numbers exactly, in a unit test over
   SHA-256-pinned inputs.
2. **Real timing.** At 12x the replay runs 20:00-00:17 in about 22 minutes, and the share of
   districts counted follows the archived preliminary timeline within one tick.
3. **Data to air.** With at least six graphics bound in each of two productions and three on air
   through the Bridge on CasparCG, each tick's change appears on the outputs with p95 latency
   recorded (target set from the hosted latency suite before the run), and the run has no 429.
4. **Two languages.** The Finnish and Swedish productions show the same numbers at the same tick,
   with their own labels and party abbreviations.
5. **Locale.** Figures read and print with a decimal comma and space grouping ("20,8 %",
   "1 234 567"); no English runtime word appears on a Finnish or Swedish board.
6. **Motion.** Bars and figures animate and re-sort between ticks on Update and never replay their
   entrance.
7. **Forecast gate.** The operator enters and leaves the Forecast state on the bar and the
   comparison; the tab is visible in the state; the data feed cannot change the state.
8. **Operator control.** Every graphic takes, updates and goes out from the keyboard; an operator
   edit to a bound field shows on air; unbinding a field stops the feed for that graphic only; the
   command log shows the data keys wrote nothing but `update` rows.
9. **Wall output.** The comparison full-screen plays on a second output following the same
   production, in step with programme.
10. **Recovery.** The four drills above pass on real CasparCG, with times recorded.
11. **OGraf.** The package's OGraf export passes the EBU schema and the community checker, and plays
    with an update in SuperFly's ograf-server and SPX 1.4.1 (SPX's own Update defect noted, not
    hidden).
12. **Agent door.** From a fresh Claude Code session with the published plugin, one brief produces
    a valid graphic in the library, which is opened in the editor, added to the production and taken
    to air, with timestamps recorded.
13. **Honesty.** Every data screen carries the replay label and source; no candidate photo or party
    logo appears; the forecast stand-in is labelled "example".
14. **Record.** A full 12x run is recorded from the CasparCG outputs (key and fill if a DeckLink is
    available) and the dashboard, with the run's command log captured.

## Phases and effort

Focused work-days, agent-assisted, verification included. Ranges, not promises; they assume the
existing data and playout paths behave as their docs say.

| Phase | Work | Days | Criteria |
|---|---|---|---|
| 1 Data | Parser, aggregation, d'Hondt, timeline, PATCH writer for two productions, tests | 3-5 | 1, 2 |
| 2 Board fixes | Locale numbers, runtime words as fields, animated updates and re-sort, kit | 4-6 | 5, 6 |
| 3 New graphics | Results bar with states, comparison, area panel, candidate board, extensions to ig34 and ig07; map if time | 7-12 | 7, 12 |
| 4 Production and drills | Two productions, wall output, operator run, recovery drills, latency | 3-5 | 3, 4, 8, 9, 10 |
| 5 Output and OGraf | CasparCG recording, DeckLink if available, OGraf hosts | 2-4 | 11, 14 |
| | **Total** | **19-32** | |

A thin slice (phase 1, the locale fix, the results bar, the seat board, one area panel, a CasparCG
recording and two recovery drills) is about 9-13 days. Neither moves ahead of the current editor,
SVG, agent toolkit and playout work without an owner decision.

## Risks

- **The live path depends on the cloud.** Every take and update goes through one database, with a
  recorded three-minute outage (`docs/PLAYOUT_ISOLATION_RESEARCH.md`). The demo must not claim
  broadcast-grade resilience; local mode and redundancy are separate, staged work
  (`docs/work-specs/playout-runtime-reliability/spec.md`).
- **The editor is Alpha** and cannot edit the timing of the data boards (measured motion, no scrub).
  The demo does not depend on the editor for them.
- **Same-named graphics replace each other** ([#779](https://github.com/NoaCG/NoaCG-Studio/issues/779)):
  name the package's graphics uniquely, which matters with two language productions.
- **OGraf hosts:** SPX's Update defect and
  [#964](https://github.com/NoaCG/NoaCG-Studio/issues/964) (two scorebugs fail `load()`).
- **Design quality.** The results bar and full-screens decide whether this looks paid-for; they need
  the catalog's quality gates and the owner's eye.
- **Personal data.** Candidate data is used only in its public role; no profiles, no photos.
- **Scope creep.** Hemicycles, polling-district maps, statistics full-screens and touch walls stay
  out unless the must-haves are done.
