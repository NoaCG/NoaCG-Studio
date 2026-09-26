# OGraf ecosystem watch - the standing evidence ledger for the bet we already made

**2026-09-13 evidence:** Zero Density's OGraf Studio v0.17 is the primary editor/agent case
study in [OGRAF_STUDIO_RESEARCH.md](../OGRAF_STUDIO_RESEARCH.md), pinned to source and licence.
The refresh also covers Eyevinn, Ferryman, ograf-form 1.1.0, ograf-devtool, ograf-server and EBU.
Studio's release and current font-export/Resolve reports strengthen the case for independent
interop testing; they do not establish universal renderer compatibility or native-output maturity.

**Filed:** 2026-08-28. **Source:** the monthly competitor routine's 2026-08-28 run
(`docs/ROUTINES.md`, "Monthly - competitor review").

## Why

We bet the export story on OGraf leading (root `AGENTS.md`, "Client-agnostic, and nothing
MANDATORY"; broadcasters asked for it first). That bet is either getting stronger or it is not, and the
only way to tell is whether **other people's products** adopt the spec. Nothing in this repository
can know that, and nothing in this repository was recording it - each month's competitor review
found OGraf news, said it in chat, and the evidence evaporated when the session closed.

This file is the ledger that stops the evaporating. It is **not an idea to schedule**; it is the
accumulating answer to "is OGraf actually winning", which is the input to several decisions that
are scheduled - how loudly `/ograf` markets itself, whether the OGraf Server API is worth speaking,
and whether being an OGraf-native engine is a route onto somebody's supported-engine list
(`docs/COMPETITOR_MXMZ.md` section 8).

## What it would take

Nothing to build. **One paste per month**, of a block the routine that is already looking has
already written. The work this file avoids is re-researching the same three facts every quarter
because nobody wrote them down.

## How this file is maintained

**The monthly competitor review produces the block; a session on a branch appends it.** That routine
(1st of the month, 10:00, task id `monthly-competitor-review`) already reads the SPX / CasparCG /
OGraf ecosystem as one of its five subjects. It ends its run by PRINTING a dated block for this
file - newest last, one bullet per item, each with a date, a one-line "what it means for us", and a
source URL - and somebody pastes it in on their next branch.

**The routine does not write it itself, and that is deliberate.** Routines run unattended in the
main checkout, and a dirty main checkout stops every landing on the machine
(`scripts/auto-merge.mjs` refuses on an unclean tree). A ledger is not worth blocking the merge
queue for. `docs/ROUTINES.md` carries the same split.

**A quiet month is recorded as a quiet month.** An empty run is a finding, and a gap in the dates is
indistinguishable from nobody having looked.

Routines are per-machine (`~/.claude/scheduled-tasks/<id>/SKILL.md`) and cannot be edited from this
repo, so the paragraph in `docs/ROUTINES.md` is the in-repo half of the wiring; the machine-local
SKILL.md needs the same instruction before the next run prints anything.

**Exit:** this file dies when it graduates - once the ledger carries enough to say something, it
becomes an "OGraf ecosystem" block in `docs/COMPETITORS.md` and is deleted in the same commit.
A ledger that only accumulates is the landfill `docs/backlog/README.md` warns about.

## The ledger

### 2026-08 (first entry, back-filled by the 2026-08-28 competitor review)

- **2026-08-13 - the OGraf Server API went STABLE**, completing v1 of the specification. The
  Graphics Definition had been stable since 2025-09-17; the Server API was published as a draft on
  2026-02-09 and spent about six and a half months there. Both halves are now marked production
  ready, with future changes committed to being backwards-compatible or optional.
  *What it means for us:* the moving half of the spec stopped moving. A REST contract between
  Controllers and Renderers now exists as a published OpenAPI definition, which is the surface an
  external control or assembly layer would speak to reach a renderer - so "be a target of somebody
  else's system" is now a bounded, specified piece of work rather than an open question.
  <https://github.com/ebu/ograf/blob/main/CHANGELOG.md>,
  <https://github.com/ebu/ograf/blob/main/v1/specification/docs/Specification_Server_API.md>

- **2026-08-12 - BBright added EBU OGraf support to its UHD and ST 2110 playout platform**,
  announced for IBC 2026. Their new graphics engine renders animated OGraf templates directly
  inside the software-based playout workflow.
  *What it means for us:* OGraf reached **native ST 2110 playout**, which is the tier of
  infrastructure that decides whether a format is real to a broadcast engineer. Our packages are
  already conformant OGraf Graphics (`docs/AGENT_CLI.md`, "Simultaneously valid" is measured), so
  this is reach we get without building anything - and reach nobody here has tested.
  <https://www.sportsvideo.org/2026/08/12/ibc-2026-bbright-adds-ebu-ograf-graphics-support-to-uhd-and-st-2110-playout-platform/>

- **June 2026 - TV 2 Denmark ran a NATIONAL ELECTION on OGraf**, presented by Niels Borg at the EBU
  Network Technology Seminar 2026 as *"Open Graphics for Live Media: OGraf Proven in a National
  Election"*. Denmark's parliamentary election was 2026-03-24.
  *What it means for us:* the strongest single data point on this page. Election night is the
  hardest live graphics night a public broadcaster has, and OGraf survived one at national scale.
  That is the reference a public-broadcaster customer asks for, and it is an argument we can make in public
  copy without qualification.
  <https://tech.ebu.ch/publications/presentations/2026/nts2026/open-graphics-for-live-media-ograf-proven-in-a-national-election>

**Read of the first entry, stated so a later one can disagree with it:** three independent signals
in three months - the spec finished, a playout vendor adopted it natively, and a public broadcaster
proved it on the hardest night of the year. The OGraf-leads bet is getting stronger, not weaker.
The exposure is that all three are other people's adoption; **none of it is ours**, and no OGraf
consumer has yet been observed running a package this project produced outside the two external
walks recorded in `docs/OGRAF.md`.
