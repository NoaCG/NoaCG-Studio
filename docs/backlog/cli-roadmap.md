# The NoaCG CLI roadmap - the spearhead gets a plan

Owner, 2026-08-28: *"it feels like this is something unique... our spearhead, something that
other playout systems don't have... create a timeline, some kind of a plan on how we will
develop it. We would iterate, test it, and add more stuff... this wouldn't become just one
build that we never improve... I should have people using it and giving me feedback, but we
can do some work by looking at it and thinking theoretically, coming up with different use
cases. Just have a big plan for our CLI tool."*

Next-wave candidate: a planning session that produces a CLI roadmap - use cases enumerated
(the agent door today, custom control panels per the 2026-08-27 ruling, the proving rounds,
CI/pipeline uses, the MCP surface for other tools), a versioned iteration timeline, what
feedback instruments exist before real users arrive (dogfooding rounds, the machine rehearsal
pattern), and how the spearhead gets marketed on the docs/README. Grounds: docs/AGENT_CLI.md,
docs/AGENT_SAVE.md, docs/GOALS.md NEXT (the agent door section), cli/ itself, and the
control-panel road v2 once landed. Plan first - no feature building from this file.

---

## What theirs does that ours cannot

**Added 2026-08-28**, from the competitor re-read. Owner's question: *what does their tool do that
ours can't, and how do we incorporate it.* Evidence and sources: `docs/COMPETITOR_MXMZ.md` section 8.
This section is the honest answer, and it is not flattering.

### The one-line difference

**Our door authors ONE graphic well from a chat, and stops at a library record. Theirs assembles
graphics from newsroom CONTEXT, at rundown scale, and stops at an operator's sign-off.**

"Theirs" is **HighField AI**, not MXMZ. MXMZ did not build an assembly layer; MXMZ is one of four
graphics engines HighField drives (with Ross XPression, Vizrt Pilot Edge and Unreal). That is the
uncomfortable part: the competitive move was becoming a **supported engine on somebody else's
list**, and we are on nobody's.

### Stage by stage, against our verbs

| Their stage (their words) | What it consumes | Our nearest verb | The honest gap |
|---|---|---|---|
| *"story and context analysis"* | the story a journalist wrote in the NRCS | none | **Input plumbing, not intelligence.** The agent calling our CLI already reads text well. Nothing in our door accepts a story, a rundown or a production as an argument. |
| *"asset search and retrieval"* | the broadcaster's media library | uploads, `template.assets`, Google fonts | **Real gap, wrong layer for us.** A MAM connector is an integration, not a capability, and there are a dozen MAMs. |
| *"data verification"* | the claim against its source | none | **Not our layer, and we should say so.** |
| *"visual composition and layout"* | copy fitted into a template's fixed slots | the whole authoring door | **We are ahead**, and the interesting half is below: they fit copy into a template they cannot measure. |
| *"template selection and playout mapping"* | a library of templates, a channel/layer | `types` lists types; `inspect` derives the operator surface | **Gap.** Nothing selects from the catalog BY NEED, and nothing maps a result onto a production. |
| human sign-off before air | a reviewer | the staged-vs-take model (`docs/CONTROL_LAYER.md`) | **We are ahead and do not use it** - our sign-off is an operator surface, not a review queue, and no CLI verb reaches it. |

The two shape differences underneath the table: theirs runs at **production time over a fixed
template library**, ours at **design time over one graphic**; and theirs ends at **air**, ours ends
at **a library record**.

### Five capabilities that close it, and one that leapfrogs

Each maps onto verbs we already have. Costs are stated because three of these are cheap and one is
a trap.

1. **`noacg find` - selection.** A machine-readable query over the type registry and catalog
   metadata (*"two teams, a score, a running clock"* returns candidates with their field and event
   contract). *Cost: low - it is a filter over what `noacg types` already returns; the real work is
   `docs/backlog/graphic-use-case-metadata.md` landing first.* This is the "template selection"
   agent's foot in our door.
2. **`noacg fill <dir|id> --data <json>` - filling, and this is the leapfrog.** Bind a data row to
   an existing graphic and run **the same runtime bench authoring runs** - overflow, doubled-text
   stress, readability, field paint - so a fill that would break on air is REFUSED, with a
   screenshot saying why. *Cost: low to medium - `screenshot --data k=v` already binds and
   `validate` already benches; the new part is making a filled instance a first-class output.*
   **No template-selection pipeline over XPression or Viz can do this**, because it cannot measure
   the rendered result. Automated filling without measured fitting is exactly where an assembly
   layer puts a broken graphic on air, and it is the one place our architecture is strictly better.
3. **`noacg assemble --context <file> --out <pack>` - assembly.** N graphics for one story or
   rundown, emitted as the multi-graphic pack the studio's Import door already reads
   (`docs/GRAPHICS_PACKS.md`). *Cost: near-zero if the CALLER's agent does the reasoning and we
   supply `find` + `fill` + `pack`; high and open-ended if we build the reasoning ourselves.* Take
   the first: *"the agent door is a BRIDGE and broadcast interface, not a creative harness"*
   (`docs/AGENT_CLI.md`) already decided this, and the output format exists today.
4. **Production-aware landing - `noacg save --production <slug>`, staged, never aired.** *(Partly landed 2026-09-24: `noacg pack --save` sends a whole package that waits on Home → Productions until the user presses Install - `docs/AGENT_SAVE.md` §7. Landing into an EXISTING production is still open.)* An
   assembled pack lands where an operator will actually run it and waits in the staged half of the
   control log for a human to take it. *Cost: an entitlements and scoped-key question
   (`docs/AGENT_SAVE.md`) more than a CLI one.* Their human gate is a review step bolted on; ours
   would be the operator surface a person is already using - so this closes the gap and improves on
   it in the same move. Today `save` is library-only, deliberately, and that ruling is what would
   have to change.
5. **Be a target of somebody else's layer: speak the OGraf Server API.** It went stable
   2026-08-13 (`docs/backlog/ograf-ecosystem-watch.md`), it is a published OpenAPI definition
   between Controllers and Renderers, and our packages are already conformant OGraf Graphics
   (`docs/AGENT_CLI.md`, "Simultaneously valid" is measured). *Cost: real but bounded - the spec is
   finished and the hard half is done.* **This is the only item that puts NoaCG on the list MXMZ is
   on**, and it does it through an open standard rather than a partnership we would have to sell.

### What NOT to chase

**First-party NRCS, MOS and MAM adapters.** That is eight newsroom systems and a dozen asset
platforms deep, it is a services business, and it is how a team this size stops shipping. The
answer is item 5 plus the MCP entrance we already ship: make the CLI the thing an assembly layer
can drive, and let the layer write the adapter. `noacg mcp` means any MCP client can drive the
authoring verbs today - what is missing is not a protocol, it is `find`, `fill` and a destination.

### Order

1, 2 and 3 are one arc and 2 is where the differentiated value is - do 2 first even though 1 reads
like the prerequisite, because `fill` is provable on a graphic you already have. 4 is a ruling to
get, not code to write. 5 is independent of all of them and is the only one with a deadline shaped
by somebody else's roadmap.

---

## Future directions - moved from `GOALS.md` 2026-09-01

The agent-door "future, so the directions are not forgotten" list, verbatim from the roadmap
(condensed there under the 2026-09-01 North Star ratification; P5 in the retired programme register points
at this file as the direction pool):

- **Future, so the directions are not forgotten:** arbitrary graphic backends (graphic-authored
  actions + machines, validated; the control layer already renders any explicit machine);
  `noacg add --production` (`productions:attach`); live playout as its own consented permission;
  remote MCP on the site over Supabase OAuth 2.1; a design-agent ecosystem (the look pluggable,
  the contract NoaCG''s); `--replace <id>`, Realtime on `documents`, `noacg export <target>`, a
  browserless `types`, keychain storage, a sandboxed bench iframe. The OGraf items moved into the
  OGraf-first ladder in `docs/GOALS.md`.
