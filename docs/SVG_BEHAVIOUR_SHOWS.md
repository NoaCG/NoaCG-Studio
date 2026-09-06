# Game-show and late-night graphics on the SVG behaviour system

**Status: the reuse test of `docs/SVG_BEHAVIOUR_PLAN.md`, run for real, 2026-09-06.** The owner's
brief that morning (`docs/OWNER_RULINGS.md`, owner-decisions-2026-09-06): the quiz is done; the
students will produce game shows and late-night talk shows this term; find what American TV puts on
air in those formats that needs operator commands during the show, draw it, import it, and say
whether the shipped recipes and extras bind it, whether it needs a new field kind or recipe, or
whether it breaks the model. This page is the investigation, the pick, and then, per graphic, the
outcome. Findings that touch the design go to `docs/SVG_BEHAVIOUR_PLAN.md` §13; this page is the
record of the walk.

## 1. What the two formats put on air

The list is what a graphics operator actually presses during these shows, not what a designer draws
once. Every row names the on-screen thing, the operator's verbs, and the shape the model would give
it. The shape vocabulary is the plan's: a **switch** (a hidden layer that is up or not), a
**choice** (one of several looks), a **row-pick** (one row named by a field), a **counter** (a
number with a floor and a ceiling), a **row-set** (a list of row keys), a **step** on the default
path.

### Game shows

| Graphic | The show it comes from | The operator's verbs during the show | Shape |
|---|---|---|---|
| Survey board | Family Feud | reveal answer 3, strike, clear strikes, reset the board | per-answer switches, a counter for strikes, a total summed from what is revealed |
| Category and value board | Jeopardy | pick a clue, mark it used, daily double | a row-pick over 30 cells plus a row-set of used cells: a grid is two row sets |
| Puzzle board | Wheel of Fortune | reveal a letter, solve, new puzzle | a text field parsed into tiles, a set of revealed letters |
| Bids and the actual price | The Price Is Right | reveal the price, call the winner | number fields, a reveal on the default path, a choice for the winner |
| Case board | Deal or No Deal | open case 14, cross out the amount, offer | two row-sets (cases opened, amounts gone) and a number |
| Bracket | tournament episodes, celebrity brackets | advance the winner of match 3, crown | teams and matches: two row sets, a row-pick per match, one crown |
| Over/under call | sports desk games | over, under, push | a choice; binds today |
| Lifelines | Millionaire | 50:50, ask the audience | a choice per pair, and the vote recipe; the quiz's own road |
| Money ladder | Millionaire, 1 vs 100 | step up, drop to a safe level | a counter over rungs, a row-pick for the safe level |

### Late-night talk shows

| Graphic | The show it comes from | The operator's verbs during the show | Shape |
|---|---|---|---|
| Top ten list | Letterman's Top Ten | reveal number 10, then 9, down to 1 | ten steps on the default path, one look per row accumulating |
| Guest lineup | every desk show's "tonight" card | next guest, back, jump to a guest | a row-pick that advances, past guests dimmed |
| Coming up next strip | segment bumpers | up, down | a switch; binds today |
| Segment bug | the corner bug naming the segment | monologue, desk, guest, music | a choice; binds today |
| Applause and laugh signs | the studio's own signs on camera | on, off | a switch; binds today |
| Desk poll | audience games, "who's funnier" | open, close, show result | the vote recipe, shipped |
| Scorecard for a desk game | Fallon's games | a point per player, a winner | the score tracker, shipped |
| Bracket | "March Madness" style celebrity brackets | advance, crown | as above |

## 2. Crossed with the challenge set and the plan's examples

`docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §4 (C1 to C8) and `docs/SVG_BEHAVIOUR_PLAN.md` §9:

- The survey board is C5 (the bingo caller: paint from data, a nearly empty machine, undo as a
  data correction) with a strike count added, which is the plan's `counter` kind in its smallest
  real form.
- The top ten list is C7's default-path contract (SPX `next()` must step it) with something to
  paint per step, which C7 deliberately did not have.
- The guest lineup is §9f (the lineup with a captain: a row-pick with per-row looks, nearly
  machineless) with the one verb §9f lacked: advance.
- The puzzle board is outside the set. It is the first graphic whose per-row truth is derived from
  ONE text field character by character, the `share` kind's shape at the level of letters.
- The bid and price reveal is the survey's "reveal sequence" (§9e) and the ruling on reveal cards
  ("taken on air hidden, one Reveal press fires the moment") on a graphic where the revealed thing
  is TEXT the operator typed, which no switch can show because hidden text is not a field.
- The bracket is C6 verbatim, and §9i's one-line answer for it ("rows plus a row-set Advanced and
  a row-pick Champion") is the claim under test.

## 3. The pick

Six graphics, chosen so that between them they touch every mechanism the plan named and left
unbuilt (`row-set`, `counter`, a per-row rule bound to the default path, a text-parsing kind, a
rowed recipe in the wizard's generic draft) and one that §9i claims is already covered.

1. **Survey board** (Family Feud). Reveal in any order, three strikes, a live total. Tests the
   `counter` kind, per-row owned fields, a sum derived across rows, and eight reveal buttons on one
   page.
2. **Top ten list** (Letterman). Ten steps from ten to one. Tests a recipe whose whole behaviour is
   the default path, so SPX's Continue and OGraf's steps drive it with no event at all, and a look
   per row that stays up as later steps arrive.
3. **Guest lineup with a segment bug and a coming-up strip** (a desk show). Tests a row-pick that
   advances by a press, order facts (before and after the pick), and a full recipe composed with a
   switch and a choice on one graphic.
4. **Puzzle board** (Wheel of Fortune). Tests a field kind that derives one row's truth from a
   position in a typed text, and a reveal driven by data rather than by a state.
5. **Bid and price reveal** (The Price Is Right). Tests the rowless generic draft with a recipe
   whose revealed thing is typed text, beside four number fields and a choice for the winner.
6. **Tournament bracket** (C6). Tests §9i's claim, and the model's one-row-set rule against a
   graphic that has two.

Not picked, and why. The Jeopardy board and the Deal or No Deal case board fail the same way the
bracket does (a grid is two row sets) and add a 30-way pick that wants a clickable board rather than
thirty buttons, so the bracket carries that finding for all three. The over/under call, the
segment bug, the applause sign and the coming-up strip bind today as a choice or a switch; the
lineup carries two of them so the composition is still exercised. The desk poll and the desk-game
scorecard are the vote and the score tracker, shipped and pinned.

## 4. The outcomes

One section per graphic, written after the import, honest to one of four verdicts: **binds** with
the shipped recipes and extras; needs a new **field kind** in `behaviourRuntime.ts`; needs a new
**recipe** of the shipped shape under `src/templates/behaviours/`; or **breaks the model** (a
comparison, a data condition, a second full recipe), which goes to the plan's §13 with the graphic
that produced it.

The artwork is under `e2e/fixtures/svg-shows/`, drawn the way a student would: layer names from
`docs/SVG_AUTHORING.md` §5b, `show:` and `choice:` where they fit, nothing else prefixed.
`e2e/import-svg-behaviour.spec.ts` drives every file that binds.

### What the shipped system did with each file, before anything was built

The honest first import, through the wizard as it stood on `main` that morning:

| File | Proposed | What the hidden layers were offered as | Verdict |
|---|---|---|---|
| survey board | the QUIZ, wrongly (eight `Answer N` rows are the quiz's evidence) | eleven layers, each "a switch" or "one option of a choice" | needs a recipe, a counter kind and a summed list |
| top ten list | nothing | ten marks as switches or choices | needs a recipe, and a rule about one row |
| guest lineup | nothing; the `show:` strip and the `choice:` bug arrived bound | eight Now/Done layers as switches or choices | needs a recipe; the extras bind today |
| puzzle board | nothing | fifteen layers as switches or choices | needs a recipe and a text-parsing kind |
| bid and price reveal | nothing; the `choice:Winner` rings arrived bound | the cover as a switch, and no way to hide the typed price | needs a recipe; the winner binds today |
| bracket | nothing; the `choice:Match` frames and `show:Crown` arrived bound | (none left) | binds as data plus the extras |

### 4a. Survey board - needs a recipe, a field kind and a per-row field; built

`survey` (`src/templates/behaviours/survey.ts`). Reveal 1..8 are self-transitions on one `board`
state whose press `set`s the row's own "Answer N revealed" field, so the look binds to data and a
controller can reveal by writing `on`. Strike rides `adjust` on a `strikes` counter, and a group
of four states greys the fourth press: the ceiling is the machine's. The `list` kind writes each
slot's answer and points from one lines box and sums the revealed points into the total. What
was needed beyond the shipped shape: the `counter` and `list` kinds, and a recipe owning a field
per row (`RecipeField.row`). The reveal cannot be taken back by a button, on purpose.

### 4b. Top ten list - needs a recipe and a rule about one row; built

`list`. One step on the default path per entry, in reveal order (an option flips it), so Next,
Continue and OGraf steps drive it with no event. Each entry's look is a rule for THAT row naming
every step from its own on, which is the additive `row` key beside `rows`. The rank numerals a
student types arrive as fields to untick, a finding about the import.

### 4c. Guest lineup with extras - needs a recipe; composes with the shipped extras; built

`lineup`. "On now" is a number field the `row-pick` kind reads; the guests already on are dimmed
by the kind's new `before` fact rather than by a state per guest; a group of states exists only to
grey Next on the last guest and Back on the first. The `show:` strip and the `choice:` bug bound
beside it from the first import, which is the composition rule doing its job.

### 4d. Puzzle board - needs a recipe and a field kind; built, with a finding

`puzzle`. The `puzzle` kind derives every tile's letter and its used / shown / hidden facts from
one typed phrase and a revealed-letters field; Solve is the walk's own arrow. FINDING: revealing a
letter is typing it and pressing Update, because no control can append to a field - the list twin
of `adjust` that plan §9e named. Recorded in the plan's §13, shipped on the data road.

### 4e. Bid and price reveal - needs a recipe (rowless); the winner binds today; built

`reveal`. A switch cannot show typed text (hidden text is never a field), so the price is a written
layer the recipe's field fills, lit from the Revealed step on, with the drawn cover lit before it.
The four bids are number fields with + and -, and the winner is a `choice:` the file already
carried. The generic rowless draft held it with no wizard change.

### 4f. Bracket - binds with the extras; the model's limit found

No recipe. Fifteen typed slots, a `choice:Match` frame, a `show:Crown`. FINDING: a bracket
repeats along two keys (teams, matches) and a recipe carries one; and the winner's name moving
up by itself is a cross-row lookup the doctrine allows as a kind derivation but the one-row-set
shape cannot host. Recorded in §13 of the plan; the bracket ships as data, which is brief C6's
own answer. A second import trap surfaced here: a layer named after its own sample text loses its
name to its parent group.
