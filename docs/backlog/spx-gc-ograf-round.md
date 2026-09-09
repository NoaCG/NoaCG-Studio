# SPX-GC 1.4 interop round - play a NoaCG OGraf package in an SPX rundown

**Filed:** 2026-08-29. **Source:** the OGraf ecosystem research round (`docs/OGRAF_ECOSYSTEM.md`
§1g).

## Why

SPX-GC v1.4 (MIT, active, <https://github.com/TuomoKu/SPX-GC>) added full OGraf support: OGraf
packages sit in SPX rundowns beside SPX templates and play out. That converges our two strictest
existing contracts - a conformant NoaCG OGraf package now earns SPX playout on its own, in
addition to the native SPX export. One hand round (later scripted) proves it and joins the
Direction-A interop ladder as a cheap, high-credibility fixture: SPX is the ecosystem's most
widely deployed open controller, and "plays in SPX 1.4" is a sentence operators understand.

## What it would take

Install SPX-GC 1.4+ locally, drop an exported NoaCG OGraf package (a starter and the scoreboard
dual package) into a rundown, drive play/continue/update/stop and at least one custom action,
record what SPX's `v_spx` conventions expect that we do not emit (if anything). Half a day
including notes; findings extend `docs/OGRAF.md`'s external-round record.

**Two things this round should check on the way, because no real renderer has ever seen them.**
Both were left UNVERIFIED by the row that scoped exported CSS to the graphic element (landed
2026-09-02, `579da11a` and `5f2545bb`), which could only test against a minimal host page it wrote
itself:

1. **That the graphic does not restyle the renderer's own page.** The exported stylesheet is
   rewritten to address `:where([data-noacg-graphic="<id>"])` and a fail-closed export gate refuses
   a sheet that would still reach the document. On a real renderer, look at the host chrome around
   the graphic, not only at the graphic.
2. **A renderer whose viewport differs from the authored canvas.** The graphic box is authored-size
   and `load()` ignores `renderCharacteristics`, so the manifest's `ideal` promise holds only if
   the renderer places and scales the box. That decision is stated in `docs/OGRAF.md` "Known
   limits" and tracked in `docs/backlog/ograf-render-characteristics-box.md`; this round is the
   first chance to see whether a real one does.

SuperFly.tv's `ograf-server` is the other renderer worth a round for the same two questions.

## Evidence

`docs/OGRAF_ECOSYSTEM.md` §1g and §4 (Direction A ladder item 4); SPX OGraf docs via the SPX-GC
repo (v1.4.1, May 2026).
