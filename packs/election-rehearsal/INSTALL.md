# Election night rehearsal: install and run

Four graphics for an election night: party totals, a candidate card, a count bug and a ticker.
They come connected to results, so you can preview and take every one of them straight after
installing. The candidates are fictional and every figure is synthetic rehearsal data. Nothing
here is a real count, and nothing here reads a real results service.

## Install

1. Download `election-rehearsal.noacgpack.json`.
2. In NoaCG Studio, open **Productions**, press **Import a package file…** and choose the file.
3. A new production opens, named "Election night rehearsal". It holds the four graphics, a
   six-cue rundown and the first synthetic count. There is nothing to connect by hand.

Install it into a production of its own and rehearse there, not into the production you will go
on air with.

## What you edit, and what the results fill

**Editorial inputs** are yours. You type them in the cue editor, and they stay as you wrote them:

| Graphic | Editorial inputs |
| --- | --- |
| Party totals | the kicker and title, each party's code, name and colour, the source line |
| Candidate card | the votes label; which candidate a cue shows (the **Live candidate** menu) |
| Count bug | the title, the source line |
| Ticker | the label and the headlines, one per line |

**Result data** comes from the results, never from typing. Those fields are read-only in the cue
editor and show where they come from:

| Graphic | Result data |
| --- | --- |
| Party totals | each party's share and votes, the status, how many areas are counted |
| Candidate card | the candidate's name, party and district, votes, status, colour and portrait, all from one record |
| Count bug | the status, how many areas are counted, the counted share, the time of the update |

A candidate is named by district and candidate number together. Leo Example (Helsinki 101) and
Aino Example (Uusimaa 101) share a number and are still two people.

## Choosing a candidate

Select a candidate cue and pick a person in **Live candidate**. The card's name, party, district
and votes all change together, from the same count.

- A cue on air keeps the person it was taken with. Changing the pick does not change the
  picture until you press **✎ Update**, and Update changes every field at once.
- **Fixed values** in the same menu detaches the cue: it keeps what the candidate showed as
  ordinary values that no count will change. Pick a candidate again to reconnect it.

## Rehearsing a new count (offline: replay or manual)

The production starts at revision 1 (`starter/revision-1.json`). To rehearse the next count by
hand, open **Setup → Data…**, then **Advanced → Raw JSON**, paste the whole of
`starter/revision-2.json` and press **Apply JSON**. The figures move on air without retaking anything. This is a manual replay of synthetic
data, and the graphics say so in their source lines.

A live results source is connected later as its own step: it writes the same paths
(`external.election.…`), and an exported or imported copy of this production never carries a
source or a key, so you connect it again in each production that uses it.

## Exporting and importing again

**Setup → Export… → Graphics pack** writes the whole production into one file: the graphics with their
fonts and the portrait silhouette, the rundown, each candidate cue's pick, the bindings and the
current starting data. Importing that file builds the same production again. No source address,
key or password is ever in the file.
