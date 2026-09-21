# src/docs - the public documentation page

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this
directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.

**The page itself is `docs.html` at the repository root**, not in this directory; `docs.css` and
`docs.ts` are its stylesheet and its one progressive-enhancement module. This file is the contract
for all three, and for anything else that becomes public documentation.

## The voice

Plain information, the way a Finn would write it: short sentences, factual, no hype. State what the
thing does and what it needs. Do not tell the reader how they will feel about it, do not name a
benefit the sentence has not already earned, and do not sell a feature the page is documenting.

**Zero em-dashes on this page.** `npm run check:copy` scans `docs.html` and `src/docs/` and the
baseline for both files is empty, so one em-dash fails the build. A plain dash, a comma or two
sentences. The gate's other tells (`seamlessly`, `empower`, `elevate`, `delve`, "whether you are X
or Y") are listed with their reasons in `scripts/check-copy.mjs`.

The standing rules the owner has already ratified are the memory entry `docs-public-copy-voice`:
the personal handle is not user-facing copy (it stays in `href`s and in the documented
`owner/repo` install commands, which is a different thing), and every command a reader might run is
its own copy-paste block. Read that entry rather than a paraphrase of it here.

## What may be written down

**Everything on this page has been run.** The docs-polish round (its handoff is in git history, not in the tree)
found four confident false claims in one review pass, each of which read perfectly. So: run the
command in a throwaway directory before documenting it, and check a behavioural claim against the
code that implements it. Where something is expected rather than measured, the page says which
(the CasparCG and Safari notes are the pattern to copy).

## Structure

- **The left nav carries main topics, and Graphics' own pages indented under it** (owner,
  2026-09-21, replacing the main-topics-only rule of 2026-08-26). Graphics is one topic: how to
  import an SVG, then one page per graphic type. Each type page is a nested
  `<section class="doc-type">` inside `#graphics`, headed by an `h3.doc-kind`, and it carries the
  same parts in the same order: the rendered example with its download link, the drawn layer
  panel beside the layer names, the buttons, and the Fields-step screenshot. A new type goes
  there, with its example file in `public/docs/examples/` and its entry in `TYPE_EXAMPLES` in
  `scripts/docs-shots.mjs`, which fails if the wizard does not pick the type the file promises.
- **A type page documents what the importer really reads.** The layer names come from
  `src/templates/behaviours/words.json` and `naming.ts`, and the drawn layer panel has to match
  the example file. Change the three together.
- **Anchors are addresses.** `#end-credits`, `#tickers`, `#data-api` and the rest are linked from
  owner-queue notes, handoffs and the app itself, so an id survives a restructure even when its
  heading level changes.
- `e2e/docs.spec.ts` pins the load-bearing line of each guide. **The page and the spec move in the
  same commit**, and a nav link is checked against a `section[id]` that must exist.
- `docs.ts` is progressive: the page is complete, readable and copy-pasteable with the module
  disabled. Keep it that way - the markup carries a bare `<pre>` and the module builds the wrapper
  and the copy button.
