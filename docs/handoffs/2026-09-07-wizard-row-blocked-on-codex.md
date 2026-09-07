# The wizard contract row: started, blocked on Codex capacity

**Written:** 2026-09-07. Follows `docs/handoffs/2026-09-07-phase-2b-first-areas.md`.

## Where it stopped

`src/components/wizard/AGENTS.md` is the next area and the one with the most to gain: 53,101
bytes, and its chain is the tightest in the repository at 102,879 of 110,000 with 7,121 free. It
is mostly bold-lead paragraphs rather than `##` sections, roughly sixty of them, and most are
rules - the same shape that made the templates extraction work.

**Codex was launched on the extraction and hit its usage limit mid-run**, having written zero
rules. Its own message: "You've hit your usage limit ... try again at 2:16 PM" (Codex's clock, not
converted). Nothing was left half-written - the run is read-only until `learn` is called, and it
had not got there.

**Relaunch it with the same spec.** The one thing the templates row's spec was missing, and which
this one carried, is the instruction to check each paragraph against the CODE before turning it
into a rule. That instruction earned its place within minutes (below), so keep it.

## What the aborted run already found, and how far I verified it

Codex flagged three claims in the wizard contract as no longer matching the code. I checked them
rather than adopting them, which is the point:

- **"A production can preselect a brand" - TRUE, and now fixed.** The contract said the chooser
  "starts at None even when one brand is the default: matching is explicit". `CreationWizard.tsx`
  preselects a named brand when the graphic is created inside a production, and offers a captured
  look under a synthetic entry, so the chooser "names what the graphic is being created in rather
  than reading None over a preselection". Corrected on `main`.
- **"The import draft moved to `import/draft.ts`" - NOT stale.** The contract already says the
  slice lives in `wizard/import/` and that `draft.ts` re-exports it through `import/index.ts`.
  Both files exist and the passage is accurate. Codex was wrong here.
- **"Browse's page-reset key omits brand-context changes" - UNVERIFIED.** Nobody has checked this
  one. Do not act on it without reading `BrowseStep.tsx`.

**That is one in three wrong.** The staleness check is worth running and its output is worth
having; it is not worth trusting. Verify each flagged claim against the code before changing
anything, and do not let a delegate's confidence stand in for a reading.

## The other thing the run confirmed

The built-in logo branch still exists in `FieldsStep`, and Codex correctly declined to write a
rule prescribing it, because a rule requiring a locked logo would contradict the root contract's
`logo: 'optional'` + `defaultLogo` rule. That is a genuine contradiction between code and contract
sitting in the tree, not a documentation problem, and it wants somebody's judgement rather than a
migration.
