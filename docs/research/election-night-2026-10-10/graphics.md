# Election-night graphics: what goes on air, and what NoaCG has for each

Research date 2026-10-10. Method: publicly playable recordings of Finnish national broadcasters'
election nights (the 2024 presidential rounds, the 2024 European Parliament election and the 2025
municipal and county elections), sampled frame by frame, plus the broadcasters' own articles about
those nights. About fifty frames were studied; they are copyrighted and are not kept in this
repository. Tags: **[seen]** on screen in a recording, **[stated]** in a public source,
**[inferred]** reasoning from those.

## How an election night is built

- **Two key moments.** 20:00, when the advance votes are released (with a countdown on screen and on
  the studio wall), and the forecast reveal around 21:30-22:30, which is the most-watched moment of
  the night [stated].
- **Data refreshes in versions about every five minutes.** Every on-air figure checked matched the
  results backend's version current at that moment, so the on-air graphics are data-bound templates
  fed from the same results backend as the website [seen, inferred].
- **Two languages at once.** A Finnish and a Swedish programme ran simultaneously with the same
  templates, only the words and party abbreviations translated [seen].
- **Restrained motion.** Flat 2D cards, values updating in place, rows re-sorting, builds and wipes.
  No 3D in the sampled frames; AR was used in at least one 2024 show [seen, stated].
- **The studio LED wall mirrors full-screens.** The same chart runs full-frame and on the wall, so
  the director cuts between them [seen].
- **Multi-box splits** (2, 3, 4 and 9 boxes) for reactions from party events, built over a branded
  background [seen; mixer-built inferred].

## The graphics, in order of importance

| # | Graphic | What it shows | Data | Who drives it |
|---|---|---|---|---|
| 1 | **Persistent party results bar** | Label box (election, area, "counted 38,3 %" with a thin progress line, or turnout), then the top nine parties and "others": share, change against the previous election (up, down or dash), party chip. On air most of the night, over studio, outside broadcasts and splits; alternates between two elections on a combined night | Party results, comparison election, counting status | Data, live; operator picks election and area [seen] |
| 2 | **Forecast state and reveal** | The same bar (and full-screens) showing the broadcaster's forecast, with a "forecast" tab; revealed with an animated build over a split; back to counted results at about 90 % counted | Forecast series and a published flag | Editorial gate, then data [seen, inferred] |
| 3 | **Full-screen party comparison** | All parties, this election against the previous as paired bars (current bright, previous dim), change chips, an optional highlighted group such as the governing parties | Party results and comparison | Data; operator takes it [seen] |
| 4 | **Seat distribution** | Seats per party with change, as bars or stacked seat ticks; a toggle between seats and share on smaller elections | Seats and previous seats (and forecast seats) | Data [seen] |
| 5 | **Area panel beside a video box** | One municipality, constituency or county: counted share, seats in total, party rows of seat ticks with change | Per-area results | Data; operator picks the area [seen] |
| 6 | **Candidate bars** (presidential) | Round one: up to nine candidate tiles with photo, surname and share, re-sorted live. Round two: head-to-head split bar with a 50 % marker, on air empty before 20:00 | Candidate results, photos, colours | Data [seen] |
| 7 | **Countdown to 20:00** | A clock to the release, on screen and on the wall | Clock | Automatic [seen] |
| 8 | **Tags and strips** | Party-colour pills marking which party event we are at; town pills for reporters; a headline strip with an optional tag, also used for data facts | Operator text, party picker | Operator [seen] |
| 9 | **Statistics full-screens** | Gender and age of the elected, turnout against history | Statistics of the elected | Data, late in the night [seen] |
| 10 | **Maps** | Municipalities or constituencies coloured by leading party | Area results and boundaries | On the web results services [seen]; not seen on air in the sampled frames |
| 11 | **Top vote-getters** | Candidates with party and votes | Candidate results | On the web [seen]; not seen on air |

## What NoaCG has for each

| # | Graphic | NoaCG today | What it takes |
|---|---|---|---|
| 1 | Persistent results bar | Tickers and the results crawl `tk13` carry lines, but nothing with the bar's structure | A new graphic: line field `party \| share \| change`, label box, counting line, two states |
| 2 | Forecast state | Graphics have states and operator-driven transitions (`docs/STATE_MACHINE_SCHEMA.md`) | Model the forecast as a state that reads a second path; no new mechanism |
| 3 | Full-screen comparison | Poll boards draw one bar per row (`ig02`, `ig11`-`ig13`) | A paired-bar variant with change chips and a highlight |
| 4 | Seat distribution | `ig34` Seat Board (one bar per party, count-up, leader accent), `ig35` Majority Meter | Add change; optional seat ticks |
| 5 | Area panel | Standings (`st01`-`st04`: N rows, any columns) | A panel layout leaving a box for the video; area chosen by a dropdown, rows filtered in the template |
| 6 | Candidate bars | `ig07` Election Bars (three fixed candidates) | Up to nine tiles; head-to-head with 50 % marker and an empty state; image fields for the broadcaster's own photos |
| 7 | Countdown | Countdown templates exist | Nothing new |
| 8 | Tags and strips | Lower thirds, party straps `ls20`-`ls23`, tags | Party colour from a list |
| 9 | Statistics full-screens | `ig39` Key Figures, `ig36` Turnout Dial | Paired bars per band |
| 10 | Maps | None (`docs/PACK_TAXONOMY.md`: no map surface) | A map board with boundaries baked in at authoring time (`demo-spec.md`, decision 7) |
| 11 | Top vote-getters | Standings | Nothing new |

Across all of them: the data runtimes misread decimal commas and print English number formats and
words, and bars snap instead of gliding on Update. Those fixes come first because every board above
depends on them (`demo-spec.md`, "Product fixes").

## Design notes for an independent package

- One persistent element carries the night; everything else is taken and cleared around it. Design
  the bar first, at the size it lives at, over busy video.
- Change against the previous election is as important as the figure itself: give it its own column
  and a colour-independent sign (triangle or dash), since party colours already use most of the hue
  range.
- Party colours are a newsroom convention. Keep them in one `party | colour` list per production so
  a broadcaster sets them once.
- A forecast must never be mistaken for counted results: a persistent, high-contrast tab, and a
  different state rather than a different graphic.
- Bilingual means two productions with the same graphics, not a language switch inside one graphic.
