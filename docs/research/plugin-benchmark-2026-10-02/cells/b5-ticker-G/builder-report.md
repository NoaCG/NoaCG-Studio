# b5-ticker-G builder report (condensed)

Opus subagent, 262k tokens, 101 tool calls, 15.3 min. Opened `design-notes.md`, not
`critique.md`. Package `radio-kaiku-ticker` from `scaffold --type ticker --design tk07`, switched
by hand to a crawl.

- What it says the guidelines set: one accent colour (teal label block), label 28px bold
  (the guideline's "word read like ON AIR" floor rather than the 20-22px kicker rule), headlines
  34px, constant linear travel for the crawl only, eased entrance 0.7 s and exit 0.4 s, the 120px
  safe inset; the bulletin red as a second colour token because the brief asks for a different
  colour (white on it about 5.6:1).
- Look, by its account: a 76px strip at the bottom, teal label block, headlines crawling at
  110 px/s with a grey dot between, soft edge fades; a desk tag ("Liikenne:") in bold. Bulletin
  wipes in on a red panel over the crawl; long bulletins drop to two smaller lines (longer is cut).
- Operator surface: Headlines, Label, Urgent bulletin; Show bulletin (sends the text) and Clear
  bulletin; a hidden "Bulletin shown" on/off holder for data-only hosts.
- Validate: 0 errors, 0 warnings.
- Friction it reported: the ticker type offers only rotators and no neutral spine, `--design
  tk01` refused; a crawl started from a step call raised 17 `bench-overflow`/`bench-stress`
  errors that cleared only when the travel was declared as a `dynamics` builder (found by
  experiment, undocumented, and the validator's advice is wrong for a crawl); snap recovery kills
  the crawl; the reported-field pattern misfires on a stale resend (as b5-D); `bench-stress`
  clipping on a capped label with no geometry in `--json`; `--at` units; validate silently puts
  back `flex-gap-shim.js` and adds `thumbnail.png`.
