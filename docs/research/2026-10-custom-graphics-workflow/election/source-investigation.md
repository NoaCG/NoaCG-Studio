# Where would the election results come from?

Investigated 18 October 2026 after the owner's clarification: “I do not actually know how YLE gets the results … find the source or something similar so we can simulate it.”

**The verifiable upstream source is Finland's Ministry of Justice election information/results service.** Yle's own 2023 report says its results service follows the count as the Ministry publishes new information. That supports the data provenance; it does not reveal Yle's private delivery protocol, credentials, service agreement or prediction model.

| Source | What we verified | What it does not prove |
|---|---|---|
| [Yle, results service starts at 20:00, 2023](https://yle.fi/a/74-20025410/64-3-145832) | Yle says it updates as the Ministry publishes figures; national, district and municipal views, current elected/at-risk candidates and vote leaders | No public API contract, polling interval, media feed URL or redistribution permission |
| [Ministry election information and results service](https://vaalit.fi/en/information-and-result-service) | Official source for candidates, eligible voters, turnout and results; links to tulospalvelu.vaalit.fi | Access to a live 2027 machine feed, delivery cadence or SLA |
| [Ministry 2023 results announcement](https://valtioneuvosto.fi/en/-/1410853/results-of-parliamentary-elections-available-online-on-2-april-starting-at-20.00) | Historical 2023 publication starting 20:00; preliminary/confirmed stages; candidate and area results; downloadable data | An unchanged 2027 schema or timetable |
| [Official archived downloads page](https://tulospalvelu.vaalit.fi/EKV-2023/fi/ladattavat_tiedostot.html) | Relevant archive location identified, but contents **not retrieved** by this environment | No claim that we parsed an official file |
| [Markus Kainu's published 2023 analysis](https://markuskainu.fi/posts/2023-04-02-eduskuntavaalit-kunta/) — secondary technical evidence | Reproducible code names Ministry party/candidate ZIPs; reads semicolon CSV without headers and converts Windows-1252 text; helpful pointer for an archive adapter | Not official schema documentation and not an election-night live-feed guarantee |
| [Statistics Finland 13sw](https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__evaa/statfin_evaa_pxt_13sw.px/?action=selectdefault) | Public party vote table through 2023 and a displayed JSON query; suitable historical baseline/independent comparison | Not the live count feed used by Yle |
| [Espoo official election calendar](https://www.espoo.fi/en/city-and-decision-making/elections) | Next parliamentary election: **18 April 2027** | February is a rehearsal date, not polling day |

Archive URLs identified for a later independent download:

- `https://tulospalvelu.vaalit.fi/EKV-2023/ekv-2023_puo_maa.csv.zip` — party results archive.
- `https://tulospalvelu.vaalit.fi/EKV-2023/ekv-2023_ehd_maa.csv.zip` — candidate results archive.

The environment's network proxy returned `Tunnel connection failed: 403 Forbidden` for the official download page, both ZIPs and a Statistics Finland API metadata request. Web search could read the indexed documentation and the displayed StatFin query. No access control was bypassed and no downloaded data is represented as verified. The supplied fixtures are deliberately **our normalized rehearsal schema**, not a copy of Yle's or the Ministry's wire format.

## Practical collection route

Before the February rehearsal, the newsroom's data lead obtains the 2027 media/results delivery documentation from the Ministry/Legal Register Centre or its nominated distributor. Use the official [vaalit.fi](https://vaalit.fi/en/frontpage) contact route. Ask for: access/terms, fixture or test-feed address, file/API schema and encoding, stable party/candidate/area identifiers, snapshot versus delta semantics, correction/revision ordering, embargo/opening times, update cadence and rate limits, and how reporting progress/elected status are defined. This is a prepared checklist, not a message sent to anyone.

Choose a feed adapter only once that contract is available. An authenticated API, HTTPS file delivery or another approved delivery mechanism can all feed the same normalizer. Keep raw messages with retrieval time, provider revision/checksum and parse result for replay. Do not make the on-air graphic scrape Yle's public website.

For an archive-based rehearsal, download the 2023 ZIPs and official schema, verify encoding and scope fields, and transform the final results into staged **synthetic** snapshots. Do not describe scaled final totals as historical count progression. Until the archives are available, the included fixtures exercise the same logical entities and change cases without pretending to be official data.

Photos, logos, localized display labels and editorial headlines are a separate newsroom-owned asset/roster collection. Election result feeds must not be assumed to include them. Our sample bundles simple original letter tiles and a silhouette, not official party logos or real candidate portraits.

## Why current forecasts need special treatment

Vote counts, current seat distribution, supplier projections and final confirmed elected status are different facts. Yle can add its own forecasts; the fact that raw counts originate with the Ministry does not make every Yle visual an official result. For NoaCG, accept a clearly identified projection from a qualified supplier, or omit that graphic. Do not derive Finland's seats from national vote percentages; any independent calculation would require district allocation, electoral alliances and Åland handling, with separate expert validation.
