# Election night: research round 2026-10-10

**Question.** Could NoaCG's existing platform carry a national broadcaster's election-night results
coverage, what would it have to prove, and what is worth building for every user along the way?

**Status.** Research and planning only. Nothing was built, and no priority in `docs/GOALS.md`
changed. Public sources only; nobody was contacted.

## Answer in brief

- **The data exists and is open.** The Ministry of Justice publishes complete result files, and
  archived preliminary files give the real election-night timing of every polling district. A
  faithful replay of a real election night needs no scraping (`election-data.md`).
- **The architecture already fits.** An external connector writing to the Production Data API, line
  lists for rows, operator choices as prepared values and the forecast as a graphic state cover an
  election night without a separate election system (`demo-spec.md`).
- **The graphics are the visible gap.** NoaCG has a seat board, majority meter, turnout dial,
  results rail and candidate bars, but not the persistent results bar that carries the night, paired
  comparisons, area panels or maps (`graphics.md`).
- **Several fixes help every user now:** decimal commas, translatable runtime words, animated
  updates. Finnish and Swedish productions get wrong numbers today ("52,3" reads as 523).
- **Broadcast-grade claims are not available yet.** The live path depends on one cloud database,
  SDI has not been tested on real hardware, and there is no redundancy, newsroom integration or
  support organisation (`broadcaster-readiness.md`). The demo must say so instead of implying it.

## Files

| File | What it holds |
|---|---|
| `election-data.md` | Official Finnish election data: sources, formats, timing, rights, replay design, open questions |
| `graphics.md` | What election nights put on air, ranked, and what NoaCG has for each |
| `demo-spec.md` | Proposed spec for an election night on NoaCG: decisions, package, acceptance criteria, effort, risks |
| `broadcaster-readiness.md` | NoaCG against election-night and 24/7 channel-graphics requirements; what competing with established vendors would take |

## Backlog

Filed as issues with observable completion criteria, in priority order. None goes ahead of the
current editor, SVG, agent toolkit and playout work; each helps ordinary productions too.

1. [#971](https://github.com/NoaCG/NoaCG-Studio/issues/971) Data boards misread decimal commas
   and print only English number formats (bug, P2).
2. [#972](https://github.com/NoaCG/NoaCG-Studio/issues/972) Election boards: translatable runtime
   words, and findable from the Election kit (P3).
3. [#973](https://github.com/NoaCG/NoaCG-Studio/issues/973) Data boards glide to new values on
   Update instead of snapping (P3).
4. [#974](https://github.com/NoaCG/NoaCG-Studio/issues/974) Show how fresh production data is (P3).
5. [#975](https://github.com/NoaCG/NoaCG-Studio/issues/975) As-run export (P3).
6. [#976](https://github.com/NoaCG/NoaCG-Studio/issues/976) Verify SDI key and fill through a
   CasparCG DeckLink output (P3).
7. [#977](https://github.com/NoaCG/NoaCG-Studio/issues/977) Reference connector: replay official
   Finnish election results (parked).
8. [#978](https://github.com/NoaCG/NoaCG-Studio/issues/978) Map board: regions coloured from data
   lines (parked).

Already open and relevant: OGraf Server API ([#790](https://github.com/NoaCG/NoaCG-Studio/issues/790)),
foreign OGraf packages in the rundown ([#791](https://github.com/NoaCG/NoaCG-Studio/issues/791)),
updates never interrupt a live show ([#756](https://github.com/NoaCG/NoaCG-Studio/issues/756)),
data-driven graphics ([#787](https://github.com/NoaCG/NoaCG-Studio/issues/787)), and the staged local
runtime in `docs/work-specs/playout-runtime-reliability/spec.md`.
