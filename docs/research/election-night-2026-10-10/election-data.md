# Finnish election data: sources, rights and a replay design

Research date 2026-10-10. Public sources only; nobody was contacted and nothing needed a login.
Tags: **[verified]** seen in the source or reproduced today, **[inferred]** strong evidence but not
stated by the source, **[unknown]** not found.

## Verdict

A credible election-night replay can be built from real, open, official Finnish data, without
scraping anyone's website. The Ministry of Justice publishes complete result files down to polling
district x candidate. For four recent elections, archived copies of the ministry's *preliminary*
area files survive, and in them every polling district carries the time its result was stored on
election night. So a replay can follow the real order and pace of the night instead of an invented
one. What is not public is the live feed itself: the ministry publishes files only after the
preliminary count ends, and how media receive in-progress data is not documented anywhere public.

## Sources

| Source | Where | Format | When | Rights | Confidence |
|---|---|---|---|---|---|
| Ministry of Justice (oikeusministeriö, OM) results service | `https://tulospalvelu.vaalit.fi/<EVENT>/fi/lasktila.html` (`/sv/`, `/en/`) | HTML | Updated every 5 minutes on election night until the preliminary count is done | Public | verified |
| OM result files | `https://tulospalvelu.vaalit.fi/<EVENT>/<event>_{alu,puo,ehd}_maa.{csv,xml}.zip`, listed on `.../<EVENT>/fi/ladattavat_tiedostot.html` | Fixed-width CSV or XML, ISO-8859-1 | After the preliminary count ends, then replaced by the check-count version; sometimes re-issued months later | "Public and free to use"; the user is responsible for lawful handling of personal data. No Creative Commons licence named | verified |
| OM record descriptions | `.../EKV-2023/ohje/EKV2023_CSV-tiedostojen_kuvaus_fi.pdf`, `.../TPV-2024_1/ohje/...`, `.../EPV-2024/ohje/...`, `.../KV-2025/ohje/AKV2025_CSV-tiedostojen_kuvaus_fi.pdf`; XSDs at `.../KV-2025/ohje/election-schemas.zip`; header rows at `https://tulospalvelu.vaalit.fi/csv_otsikot/Tulokset_otsikkorivit_FI.xlsx` | PDF, XSD, XLSX | Per election | As above | verified |
| Archived preliminary files | Internet Archive copies of the same URLs taken on election night (EKV-2023, TPV-2024_2, EPV-2024, KV-2025) | Same CSV, stage A | One end-of-night snapshot each | OM data | verified |
| OM live media feed | Not published | Probably the same "transfer file" format in an in-progress state | During the night | Unknown | unknown / inferred |
| Statistics Finland StatFin, PxWeb API v1 | `https://pxdata.stat.fi/PXWeb/api/v1/fi/StatFin/{pvaa,evaa,euvaa,kvaa,alvaa}/<id>.px` | JSON-stat 2, CSV, PX | Days to weeks after the election | CC BY 4.0, "Lähde: Tilastokeskus" | verified |
| Statistics Finland boundaries | WFS `https://geo.stat.fi/geoserver/tilastointialueet/wfs` | GeoJSON (`outputFormat=application/json&srsName=EPSG:4326`) | Yearly layers 2013-2026 | CC BY 4.0 | verified |
| National Land Survey open data | maanmittauslaitos.fi | Various | - | CC BY 4.0, credit with dataset name and date | verified (licence) |

Event codes: `EKV-2023` (parliamentary), `TPV-2024_1` and `TPV-2024_2` (presidential rounds),
`EPV-2024` (European Parliament), `KV-2025` (municipal), `AV-2025` (wellbeing services county), and
older events back to 2003. Upcoming: parliamentary 18.4.2027, municipal and county 15.4.2029, EP
10.6.2029 (vaalit.fi). The ministry decided on 24.3.2026 that the 2027 parliamentary election runs on
the current election information system, so the 2027 files will most likely keep today's format
[inferred]. The system is owned by OM and developed by Oikeusrekisterikeskus; Solita Oy maintains the
renewed system [verified].

## The OM file format, in short

Three files per election: `alu` areas and turnout, `puo` parties and other nominators (not in
presidential elections), `ehd` candidates. Each zip has a `.chk` file holding the SHA-256 of the
*inner* CSV, not of the zip. All of this is [verified] from the record descriptions and the files.

- **Encoding and layout:** ISO-8859-1, LF line ends, fixed-width fields each *terminated* by `;`
  (so a split gives one trailing empty element). Numbers are zero-padded. Percentages have one
  implied decimal (`0272` = 27.2 %); the d'Hondt comparison number has three.
- **Field counts:** area file 114 (74 before the check count adds statistics), party file 53,
  candidate file 45.
- **Area levels:** `A` polling district, `K` municipality, `V` constituency, `R` wellbeing services
  county, `M` whole country. Aggregate rows come after their children.
- **State:** counting status (`K` in progress, `V` done), stage (`A` preliminary, `T` check count)
  and a per-record last-update timestamp `yyyyMMddHHmmss`.
- **Parties:** a permanent party id that stays the same across elections (SDP `1`, KESK `2`, KOK
  `4`, RKP `5`, KD `9`, VIHR `13`, VAS `15`, PS `23`), with abbreviations and names in Finnish,
  Swedish and English (KOK / SAML / NCP). Id `99` "Muut ryhmät" aggregates joint lists and voter
  associations; Åland's MP sits there in parliamentary elections.
- **Candidates:** votes split into advance and election-day, total, shares, elected flag
  (1 elected, 2 deputy, 3 not elected), d'Hondt comparison number and rank. A candidate number is
  unique only within its constituency, municipality or county.
- **Sizes:** the EKV-2023 candidate file is 22 MB zipped and 318 MB / 483,691 rows unzipped, so a
  parser has to stream it.

## How an election night actually runs

- Advance votes are counted from 10:00 on election day and published at 20:00 [verified].
- Election-day votes are counted at each polling station after 20:00 and entered as they finish.
  The ministry's pages update every 5 minutes until the preliminary count is complete [verified].
- Real pace from the archived preliminary files (local time; share of polling districts reported):

| Election | Districts | First | 50 % | 90 % | Last |
|---|---|---|---|---|---|
| EKV-2023 parliamentary | 1,808 | 20:12 | 21:44 | 22:52 | 00:17 |
| TPV-2024_2 presidential runoff | 1,756 | 20:03 | 20:29 | 20:56 | 22:01 |
| EPV-2024 European Parliament | 1,756 | 20:05 | 21:07 | 21:53 | 22:54 |
| KV-2025 municipal | 1,658 | 20:10 | 22:36 | 00:12 | 03:23 |

- The presidential first round of 2024 stood at 61.1 % counted at 20:10 (advance votes in), 94.4 %
  at 21:25, 99.2 % at 22:20 and complete at 23:30 (archived results pages) [verified].
- The check count runs on Monday; results are confirmed on Tuesday or Wednesday [verified].
- Seats are allocated by d'Hondt within each constituency (parliamentary), municipality
  (municipal), county (county) or nationwide (EP). An electoral alliance counts as one group, and
  candidates rank by personal votes inside it [verified].
- The ministry publishes counts only. Seat forecasts on election night are each broadcaster's own
  model [verified absence on the ministry's side].

## Rights and attribution

- **OM data:** public and free to use. Candidate names, ages, occupations and home municipalities
  are personal data, so use them only in their public-role context and do not build profiles.
  Suggested credit: "Lähde: oikeusministeriö, vaalien tieto- ja tulospalvelu".
- **Statistics Finland** (StatFin and boundaries): CC BY 4.0, "Lähde: Tilastokeskus", ideally with
  the dataset name and download date.
- **Not usable without permission:** candidate photos (not in OM data; rights sit with the
  candidate or photographer), party logos (party marks). Party colours are a newsroom convention,
  not official data [inferred].
- **Do not use broadcasters' own results backends.** They are undocumented, carry no reuse terms,
  and at least one disallows crawlers in `robots.txt`.

## Replay design

**Scenarios.**
1. **EKV-2023 parliamentary** as the main one: 13 constituencies, 200 seats, d'Hondt with
   alliances, a real timeline from 20:00 to 00:17, and the same file format as the next
   parliamentary election.
2. **TPV-2024_2 presidential runoff** as a short head-to-head (two hours, two candidates).
3. Optional stress test: **KV-2025** (308 municipalities, finishing after 03:00).

**Inputs.** The final check-count `alu`, `puo` and `ehd` files; the archived preliminary `alu`
file of the same election for timing; the Statistics Finland boundary layer of the same year
(`vaalipiiri4500k_2023` for EKV-2023: 13 features, 88 KB; `kunta4500k_2025`: 308 features).

**Algorithm.**
1. At 20:00, every district's advance votes appear.
2. Each district's election-day votes appear at that district's preliminary timestamp. Districts
   that report advance and election-day votes combined appear whole at that time.
3. Sum upwards: district, municipality, constituency, country. Recompute shares, turnout and
   share counted.
4. Recompute d'Hondt per constituency on every tick, so "would be elected now" and seats move as
   they did on the night.
5. Run at real time or compressed (four hours into twenty minutes), with pause, step and jump.

**Correctness test.** The final tick must reproduce the ministry's seats, elected flags and
comparison numbers exactly. That is one unit test against public data, and it proves the d'Hondt
and aggregation code.

**Honest label, shown wherever the replay is shown:** "Replay of the official results of
<election>. Counts are the final check-count figures (Ministry of Justice); timing follows the
preliminary count of election night; intermediate states are reconstructed." Preliminary and final
counts differ by 0.01-0.26 %, so a replay will not match what viewers saw live to the vote. Where no
timeline survives (TPV-2024_1, AV-2025), the label says "timing simulated".

**Pin the inputs.** Files get re-issued (the KV-2025 files were re-dated 25.6.2025), so a replay
records the SHA-256 of every input, and the archived preliminary files are better obtained from the
ministry directly than relied on from the Internet Archive.

## How the data reaches a NoaCG production

No new architecture is needed. The replay is an external connector on the pattern of
`scripts/weather-feed.mjs` (`docs/DATA_API.md`), writing absolute values into the production's data
tree with `PATCH /api/data/patch`. Graphics bind to paths on the production's Data tab; the operator
still takes graphics to air and always out-writes the feed.

- **Shape the tree for the graphics, not for the files.** The connector computes; templates stay
  dumb. Rows go in as arrays of `"label | value"` strings, which the production data model already
  joins into the line lists the seat board, results rail and standings read. Arrays of objects are
  not bindable (`docs/PRODUCTION_DATA_PLAN.md` §10.7), and this design does not need them.
- **Budgets fit.** One patch per tick carries only what changed (unchanged values cost nothing), far
  inside 25 ingest updates per 5 seconds and 16 KB per request. 308 municipality colour rows
  (`"005 | #c8102e"`) are about 5 KB.
- **Restart safety.** `GET /api/data/state` lets a restarted connector reconcile instead of
  re-pushing a snapshot.

## Gotchas

- Decode ISO-8859-1 explicitly; letters outside Latin-1 cannot appear in the files.
- Key parties on the permanent id, never the abbreviation: abbreviations differ by language and
  from newsroom style ("Kok.").
- Candidate numbers restart per constituency, municipality or county.
- Municipal mergers change codes between elections (Pertunmaa 588 into Mäntyharju 507 from 2025);
  use the boundary layer of the election's own year.
- Polling district ids are municipality-local, change between elections, and some are joined into
  others. No national open source of polling district boundaries was found, so maps stop at the
  municipality.
- StatFin codes differ from OM's (`SSS` and `010000` against `**` and `01`).
- KV and AV are separate events with separate files although held together; Helsinki has no county
  election; Åland is in neither.
- Finnish and Swedish write decimals with a comma. NoaCG's data boards currently read "52,3" as 523
  (`src/templates/infographics/dataRuntimes.ts`, `parseIgNumber`).

## Open questions only the ministry can answer

1. Do media receive in-progress files on election night? Through what channel, how often, and on
   what terms?
2. Can the ministry supply the preliminary-stage area, party and candidate files of past elections,
   and any interim snapshots, for testing?
3. Is there a test feed or rehearsal before the 2027 parliamentary election?
4. Is the 2027 format guaranteed unchanged, and what changes when the renewed system arrives?
5. Is "public and free to use" equivalent to CC BY 4.0, and what credit wording does the ministry
   want?
6. Are seats, elected flags and comparison numbers filled in during the preliminary stage?
7. How is the published "Laskettu %" (share counted) computed?
