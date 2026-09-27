---
v: 2
source: owner
kind: ask
raised: 2026-09-21
state: advanced
note: 2026-09-27 claude/u-layer-name-tolerance landed the joined-name retry (AnswerA, Score1, FullTime), German and Spanish beside English, Finnish and Swedish for the common roles of every type, and a pin that no name read before changes meaning; the accepted table is docs/SVG_IMPORT_PLAN.md §2a. What waits - the public table's printed synonyms, the less common roles and further languages, and localized design-app default names (Ebene 1, Capa 1)
asked: more synonyms and more languages over time, anything that makes it easier for users (paraphrase, given with the one-naming-system ask)
---
# More trigger words and more languages, over time

**Filed:** 2026-09-21. **Source:** owner ask, the same day as the one naming system
(`one-layer-naming-system-for-every-graphic.md`): the READING stays as flexible as possible so
people do not make mistakes, and anything that makes it easier for a user is wanted.

## What it is

The importer finds a graphic's type from layer names through one word list,
`src/templates/behaviours/words.json`. Every role carries a regex (`words`), the one taught
spelling (`teach`) and the synonyms the docs print (`also`). English and Finnish are in it today;
a few roles carry Swedish-looking words by accident of English (`Final`, `Total`) and nothing
else. A student who names a layer `Svar A` or `Lag 1` gets no type and has to pick every layer by
hand.

## What would make it easier

- **Swedish**, because the Friday students are Finnish and Finland has two languages: `svar`
  (answer), `fråga` (question), `lag` (team), `poäng` (score), `mål` (goal), `rätt` (correct),
  `fel` (wrong), `vald` (selected), `låst` (locked), `slut`/`full tid` (full time),
  `alternativ` (option), `vinnare` (winner), `röster` (votes), `paus` (paused), `varning`
  (warning), `tiden ute` (time up).
- **More English synonyms** where a designer would plausibly reach for them: `highlight` and
  `chosen` for selected, `tick` and `check` for correct, `cross` for wrong, `home`/`away` as a
  two-team score (a separate backlog note already covers why that one is not proposed),
  `countdown bar` for the timer bar, `result` for percent.
- **Any language a user brings.** The list is a JSON file; a language is a set of words per
  role. The owner said "over time", so this is a standing door rather than one job.

## The rule every addition obeys

A new word must not collide across types. `scripts/behaviour-docs.mjs` checks each `teach` and
`also` against its own role's regex, and `naming.ts` scores every recipe over the same
inventory, so a word that appears in two recipes' `words` makes both eligible and the tie is
broken by distinctive evidence. The one collision on record is the reason the tokenizer exists:
`Options` once read as option S. So each addition is: add the word to `words`, add one taught
example to `also`, run `npm run write:behaviour-docs`, run `npm run build`, and drop a file
carrying the new word through the wizard to see the type picked. A word shared by two types
(Swedish `mål` is both a goal and a target) goes to the type where a designer would draw it, or
to neither.

## Where it shows

The public docs' Layer names page prints the table from the same JSON, so a word added there is
taught the same moment it is read. Nothing else changes.

## 2026-09-27: what shipped, and what waits

**Shipped.** `docs/SVG_IMPORT_PLAN.md` §2a holds the whole table of accepted names, and
`scripts/layer-name-readings.test.mjs` reads that table and fails when a row and the matcher
disagree.

- **Joined names.** A name that reads as nothing in a type is read once more with its words split
  where the case or a figure changes, and dots, hashes, brackets and long dashes read as spaces:
  `AnswerA`, `Score1`, `Team1Score`, `FullTime`, `time_up`, `Answer (A)`, `Score #1`. Only a name
  that read as NOTHING is retried, so nothing that read before can change. The docs page's own
  example of a name that is not found, `Bar1`, is now found, and that sentence is gone.
- **German and Spanish**, plus a few more English words (`Tick`, `Check`, `Cross`, `Pts`), for the
  question, answer, selected, correct, wrong, locked, team, score, goal, full time, competitor,
  points, position, row, timer bar, warning, paused, time up, option, bar, percent, winner, votes,
  badge, progress, guest, now, category, letter, solved, price, envelope and last. Swedish was
  already in for most roles (the list above was stale); it gained `Spelare`, `Deltagare`, `Rad`,
  `Bokstav`, `Ledtråd`, `Senaste`, and `Fraga` without the ring.
- **The containers.** `Text`, `Moments` and `Board` are read by nothing in the importer, so they
  work in any language, in any case, or left out. A test holds a quiz with its containers named
  in seven ways to the same proposal.
- **The pin.** `scripts/fixtures/layer-name-readings.json` holds every one of the 896 names the
  matcher read before (every taught name and synonym with its rows swapped, and every layer name
  in the repository's SVGs); each keeps every reading it had.

**Left out, because each would be a guess** (each is a row in the table): `Last` (låst without the
ring is English), `Mal` (mål without the ring is Spanish for bad), `Lost` (löst without the dots),
`Vaara` (väärä without the dots is Finnish for danger), `Highlight` as a quiz pick (it is the
running order's mark), `Result` as a vote share, `Numero` as a list entry (it is the bingo's
number), `Home` and `Away` (`docs/SVG_AUTHORING.md`), and a glued name with no case change such as
`ANSWERA`.

**Waits:**

- The `also` synonyms the public table prints are unchanged: English and Finnish, as before. Adding
  the new words there is a copy decision about how long that table gets, not a reading one.
- The less common roles (the survey's strikes, the list's mark, the bingo's tally) and further
  languages, as users bring them. The rule above still holds for each word.
- Localized design-app default names (Illustrator's `Ebene 1`, `Capa 1`, `Taso 1`) are still read
  as names rather than skipped like `Layer 1`. That is `isDefaultObjectName` in
  `src/assets/svgImport.ts`, and a separate change.
- Found while pinning, and pinned as it is: `Background` reads as the survey's total, because the
  total's word `round` sits inside it. Harmless while the survey is not proposed, and changing it
  would change a reading, so it was left for its own fix.
