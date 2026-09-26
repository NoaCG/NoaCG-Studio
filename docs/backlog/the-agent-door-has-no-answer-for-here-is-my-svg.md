---
v: 2
source: owner
kind: ask
raised: 2026-09-16
state: unstarted
asked: "Can a user drag/drop or provide an existing graphic/image/SVG to Claude Code or Codex and
  have it turned into a usable NoaCG HTML template? ... For me, there's no difference in how it's
  done. It should just work and be as smooth and easy as possible for everyone, the agent and the
  user. For me, the end result is the important thing, not how it's done."
serves: NOW
size: large
touches: cli/src, src/assets/svgImport.ts, src/components/wizard/import/fieldAutoMap.ts, src/templates/importedDesign/svg.ts
covered-by: e2e/import-svg-behaviour.spec.ts
needs-owner: none
---
# The agent door has no answer for "here is my SVG"

**Filed:** 2026-09-16 by the agent-door audit. **Plan added:** 2026-09-17, after the owner read the
audit and ruled on what "fixed" means.

## Why

"Hand over a design you already have and get a template back" is one of the three things we say the
product does. The studio does it well. The agent door cannot do it at all, and - this is the part
that matters - it fails *silently*.

An agent handed a customer's SVG finds no import verb and no instruction. A capable model then does
the obvious, helpful-looking thing: it re-draws the artwork as HTML from scratch. The result
validates clean, looks close, and is **not the user's graphic**. The studio's import module exists
precisely to prevent that, and says so in its own header - a layered SVG imported verbatim "is the
user's exact graphic", which is why it "never redraws, reflows or prettifies anything".

So the failure mode is not an error anybody sees. It is an approximation of somebody's brand,
produced confidently, with a green gate at the end of it. For a broadcaster that is worse than a refusal.

**The owner's ruling, 2026-09-17, and it is the one that binds the design:**

> For me, there's no difference in how it's done. It should just work and be as smooth and easy as
> possible for everyone, the agent and the user. For me, the end result is the important thing, not
> how it's done.

Read that as: do not hand him a choice between "teach the skill to send people to the studio" and
"build the verb". The outcome is that handing over an SVG produces that person's actual graphic,
playable, with the fewest steps. Any route that reaches it is acceptable. A route that stops at
"go and do it by hand in the browser instead" is a stopgap, not the answer.

## What it would take

**The technical picture is better than the first filing assumed, and one claim in it is wrong.**
That first version said field mapping is "the genuinely hard part" because the wizard asks a human
which layers are editable. Checked against the code on 2026-09-17, that is overstated twice over:

- **Text candidates already default ON.** `SvgTextCandidate.marked` documents the `f:` / `field:`
  prefix as "a guarantee, not a filter: every detected text defaults ON either way". A package
  emitted with every detected text bound is already a working template, before anyone chooses
  anything. Pictures default OFF, `static:` marks furniture, and both defaults are in the code.
- **An auto-mapper already exists.** `src/components/wizard/import/fieldAutoMap.ts` has
  `proposeFill` - "one press that fills the empty pickers, from the names first and then from WHERE
  each layer sits on the artwork", with a stated reason per pick. It reads the same matcher that
  fills the pickers at drop, so it cannot drift from them.

**And the three pieces are already free of React.** `src/assets/svgImport.ts` imports exactly one
thing, its own `svgGeometry`. `fieldAutoMap.ts` imports only `templates/behaviours/*` and a local
type - it is filed under `components/` but is plain logic. `src/templates/importedDesign/svg.ts`
emits the template from model code. Nothing here needs the wizard; it needs a caller.

**The one real constraint:** `importSvgMarkup` parses with `DOMParser`, so it needs a DOM. Do not
add jsdom and do not port the parser - the CLI already drives a browser for `screenshot` and
`validate` (`cli/src/browser.ts`). Run the existing module inside that page. One implementation,
one sanitizer, no second opinion about what an SVG means.

### The shape, in three landable pieces

**1. The skill stops lying by omission.** Today `grep -ci "svg" cli/plugin/skills/noacg-graphic/SKILL.md`
returns **0**. Until the verb exists, an agent must be told: the CLI cannot import a design, redrawing
someone's artwork by hand is not the same graphic and is not wanted, and the honest move is the
studio's Import door. Name the raster limit in the same paragraph. This is text, it is small, and it
should land first because it stops the silent-wrong-product failure immediately. It is **not** the
fix - see the ruling above.

**2. `noacg import <file.svg> --out <dir>`.** The verb, using the studio's own modules in the CLI's
own browser page: sanitize and inventory, apply the existing defaults, run `proposeFill` for the
bindings, emit a package whose text nodes carry `id="fN"`. The agent then goes straight to the verbs
it already knows - `validate`, `screenshot`, `save`. The output should also PRINT what it bound and
why, because `proposeFill` already carries a reason per pick and an agent that can read the reasons
can correct a wrong one instead of shrugging.

**3. The agent gets to disagree.** A model reading an SVG is better at "which layer is the headline"
than any heuristic, so the verb should accept the agent's own mapping - a flag or a small JSON - and
fall back to the automatic one. This is where the agent door can be *better* than the wizard rather
than a poorer copy of it, and it is why the outcome the owner asked for is reachable rather than
merely approximated.

**Raster stays out.** A PNG has no verbatim import road anywhere except the wizard's raster tier and
should not grow one here. Say the limit; do not paper over it.

### What has to be true before it is called done

The acceptance is the owner's sentence, not a green build: hand a real layered SVG to Claude Code or
Codex, and get back that person's graphic - playable, with editable fields, in the library - without
anybody opening the studio to finish the job. A run that produces *a* lower third is not a pass; the
test is whether it is *their* lower third. Prove it on artwork nobody on this project drew.

## Evidence

Measured 2026-09-16 with `noacg` 0.3.3: `noacg import` -> `Unknown command "import"`;
`noacg validate <file>.svg` and `<file>.png` -> both `expected a package directory or a .zip file`,
exit 2, read from the command's own exit code. `grep -ci "svg" cli/plugin/skills/noacg-graphic/SKILL.md`
-> `0`. Full audit: `docs/AGENT_DOOR_AUDIT.md`.

Re-checked 2026-09-17 against `main` at `06d80028`, which is what corrected the mapping claim above:
`src/assets/svgImport.ts` (the module header, `SvgTextCandidate.marked` and `.drawing`, and
`importSvgMarkup` as the single entry point), `src/components/wizard/import/fieldAutoMap.ts`
(`proposeFill`, `fillGap`, `namesThatFill`), `src/templates/importedDesign/svg.ts` (the emitter),
`cli/src/browser.ts` (the CLI already has a browser).
