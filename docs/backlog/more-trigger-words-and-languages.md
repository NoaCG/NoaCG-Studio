---
v: 2
source: owner
kind: ask
raised: 2026-09-21
state: unstarted
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
