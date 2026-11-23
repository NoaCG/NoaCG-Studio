# Phase TL7 evidence: close

Base: `main` at `586c1099` (previous verified `main` `0f2a2eeb69c7ce1b6bbeb10e786aaf1543f285bf`).
Acceptance for this phase, verbatim:

- "AC-2: Every row of the coverage model (D9 scope) is `covered`, with its observable proof passing; the check fails otherwise."
- "AC-8: One name per concept across app, docs, templates and inventories; ids unchanged."

Row class: Risky (a build gate turned to complete enforcement). Rules C1 to C7, N1 and N2 are in
the spec's TL7 phase notes, written and pushed before any code (`af771e7b`), challenged by a
Rules-first `/so` (AGREE WITH CORRECTIONS; every correction applied in the Rules before code).

## AC-2: complete coverage, enforced

- Matrix at the start and at the head: 105 rows (72 types, 8 untyped kinds, 21 recipes, 4
  contracts), 105 covered, 0 planned, no open `extensions`. The three proof specs
  (`e2e/svg-templates.spec.ts`, `e2e/svg-examples.spec.ts`, `e2e/production-audience.spec.ts`)
  are not quarantined.
- Change: the build gate's committed-matrix case (`scripts/template-coverage.test.mjs`) and the
  command (`scripts/template-coverage.mjs`) both validate with `complete: true`. The build runs
  every `scripts/**/*.test.mjs` on every PR and merge group (`scripts/gates.mjs`, ci.yml build
  job), so no change can skip it. No test, case or limit was removed.
- Probes, each reverted:
  1. an open extension on `countdown`: the command exits 1 ("open extension (probe), and complete
     coverage is required") and the gate case fails.
  2. `e2e/svg-examples.spec.ts` added to quarantine: 21 rows fail ("proof ... is quarantined, so
     it is not passing").
  3. A `planned` row in complete mode is refused by the existing unit case ("a planned row names
     its mechanism, proof and phase; complete mode refuses it"); a demoted covered row is also
     refused by the floor.
- Proofs passing: CI's E2E jobs on the head run the proof specs (they are selected for this
  change: `e2e/svg-templates.spec.ts` is edited).

## AC-8: one name per concept

`scripts/concept-names.test.mjs` passes (5 of 5). Its scanned surfaces now also include
`docs/GRAPHIC_TYPES.md`, `docs/COMPETITION_PACK.md`, `docs/OGRAF.md`, `src/export` and `src/ai`,
and its selection header now lists every surface it reads (`docs/END_CREDITS.md`, `src/blocks`
and `src/templates/endCredits` were read but not listed). A planted "credits roll" in
`src/export/targets/ograf.ts` fails it.

Carried nits:

| Source | Nit | Outcome |
| --- | --- | --- |
| #2680 c7070472364 | `docs/GRAPHIC_TYPES.md:393` "Standings / result table" | fixed: "Standings" |
| #2680 c7070472364 | `docs/COMPETITION_PACK.md:167` "Standings / result table" | fixed, and line 174's "RESULT table" is "FINAL standings" |
| #2680 c7070472364 | `docs/whats-new/2026-11-19.md:12` "Credits roll" | kept: a dated release note, a historical record |
| #2680 c7070472364 | `src/ai/stubProvider.ts:81` "game timer" | fixed: the label is "countdown" (category id `game-timer` unchanged) |
| #2682 c7075910783 | 1. saved Join card pick has no browser journey | not a naming nit; filed #2719 (P3) |
| #2682 c7075910783 | 2. picker long-name wrapping untested | not a naming nit; filed #2719 (P3) |
| #2682 c7075910783 | 3. `evidence/phase-TL1.md` linked the question, not the ruling | fixed: links comment 7075308815 |
| #2697 c7081162959 | `docs/whats-new/2026-11-05.md:13` "SVG examples" | kept: a dated release note, a historical record |

Also found and fixed by a repository-wide scan for the retired labels outside the checked
surfaces: the OGraf export refusal "An imported credits roll ..." now says "Imported end credits
..." (its e2e assertion moved with it), `docs/OGRAF.md`, `docs/CONTROL_PANEL_ANY_GRAPHIC.md`
(also its stale "14 recipes"), `docs/SVG_BEHAVIOUR_SHOWS.md` and `docs/PACK_TAXONOMY.md` ("a council vote = poll (Poll result)": the `poll` type is Poll result, not Vote results; corrected after the final `/so`).

Left as they are, with the reason: research notes, dated audits, plans, contract records and
benchmarks (historical); fixtures (frozen inputs); `taxonomy.ts` `'name tag'` (a search synonym
that finds lower thirds); sb28's "a mono name tag" and lowercase "credits roll" in code comments
and motion descriptions (a description of motion, not the product name); emitted CSS comments
(bytes pinned).

Counts (N2): the library page, its README and the maintainer README state no count; the spec's
"17 recipes" in What exists and D9 is the planning-time inventory, kept as written.

Ids unchanged: the diff changes no recipe id, type id, role word, field title, slug, file name or
persisted key.
