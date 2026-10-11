# How other products shape score controls

**Run:** 2026-09-04, before the score behaviour's verbs were chosen
(`src/templates/importedDesign/scoreBehaviour.ts`). **Why it exists:** the owner's method, twice
stated. *"We just need to follow how other programs do them"* (2026-09-03,
[`docs/backlog/more-behaviours-than-poll-and-quiz.md`](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/more-behaviours-than-poll-and-quiz.md)), and the standing rule behind it - a design
default is NOT a taste question ([`docs/acceptance/OWNER_QUEUE.md`](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/OWNER_QUEUE.md)). So the verbs on a score board
were derived rather than invented, and this page is the derivation, kept so the next behaviour is
not argued from scratch.

## How to read this, and one thing that went wrong

**Every quotation below came out of a document that was actually fetched and read.** That sentence
is here because the first draft of this survey was not like that. The research ran as delegated
agents; two of them never returned, and the write-up nonetheless covered their areas as though they
had - with quotations, URLs and version numbers that were constructed rather than retrieved. The
agent caught it, retracted, and re-stated the survey from the sources it had actually read. This
page is the re-stated version.

The retracted material is not quietly gone: **Ross XPression, Chyron, Vizrt, Sportzcast,
ScoreVision, Nevco, All American Scoreboards, ClassDojo, Kahoot, Flippity, Baamboozle, Classroom
Group Generator, Leaderboarded, ScoreCounter, Hi Counter, OverlayOn, BallBoy and ScoreSync were
NOT surveyed**, and anything you may have read about them from this work is void. Two of those -
the professional control rooms, and the classroom scorekeepers, which are what a class quiz board
most resembles - are the gaps worth filling if these defaults are ever argued again.

The five conclusions did not move when the fabricated half was removed. Each one rests on the
verified set below, which is the point of writing them down separately from the evidence.

---

## The five answers, and what the module did with each

### 1. The increment: a ROW of fixed amounts, and the amounts are the sport's own

Nobody in the verified set ships a stepper, and nobody ships a single "+" you press repeatedly.
The pattern is a small row of amount buttons in the team's own column, and the amounts are the
scoring rules:

| Product | The row |
|---|---|
| SPX Graphics, Scoreboard extension | `-1 +1 +2 +5` by default, author-edited in `settings.js` (`scoreButtons`, each object carrying a `buttonText` and a `scoreValueChange`), green for positive and red for negative |
| Daktronics All Sport 5500 | *"The home and guest `<SCORE +1>`, `<SCORE +2>`, and `<SCORE +3>` keys are used to increment the team score and the `<SCORE -1>` key is used to decrement the team score."* The 5000 series carries the same four keys |
| Sportable Scoreboards LCD keyboard | soccer and hockey `+1 / -1`; basketball `+1 / -1 / +2 / +3`; football `+1 / -1 / +3 / +6`; wrestling `+1 / -1 / +2 / +3 / +½ POINT` |
| NewBlue Titler Live | *"by increments of +1, +2 or +3"*, beside a typed field |
| KeepTheScore | the Stream Deck actions are sport-shaped; the documented example is "Home +2" |
| 8-Bit Academy | `+1` and `+5` only |
| CasparCG rugby client (crazyscot) | buttons named "Try, Converted try, Penalty, Drop goal", the point values held in `ScoresByCode` in `rugby.py` |
| vMix | no buttons at all - the operator builds shortcuts by hand, `SetText` with a Value of `+=1`, and *"+=2 or +=3 and so on"* |

**What the module ships: `+1` alone.** Every set above is *author-configurable per sport*, because
the right amounts are the sport's own rules and a generic tool cannot know them - SPX puts them in
a config array, the CasparCG client in a Python dict, Sportable prints a different keypad per game.
A student board is not modelling a sport, and a customization surface is what the owner ruled out
on 2026-08-22. One amount is the honest default; this table is where a second one gets argued from,
the day a real class needs `+2`.

### 2. The correction: a symmetric minus, AND typing the true score

The clearest result in the survey, and it has two halves that do different jobs.

**A `-1` of the smallest increment sits in the same row as the plus**, in SPX, Daktronics,
Sportable, vMix (`-=1`), Singular, CasparCG's scorebug widget, imageonline, JudgeMate, PiliApp,
Games4ESL and MyClassScreen. Two of them frame it by what it is FOR rather than as scoring:
Recast's Singular guide, *"as a team scores you click the corresponding (+) when there is a goal
and there is also a (-) button if you need to remove a goal"*; and MyClassScreen, *"Tap plus when a
team earns a point. Tap minus when they blurt an answer out of turn."*

**Typing the true score is the second correction, and it is in every professional product read.**
Daktronics: *"The operator presses `<EDIT>` followed by a `<SCORE>` key to change the score."* OES:
*"To set a teams Score: Press HOME SCORE or GUEST SCORE. Enter value on numeric keypad. Press
ENTER"*, stated immediately before its increment instruction, so the panel carries both.
NewBlue: *"manually entering the number in the score field."* Singular's Counter node has Set
buttons beside its Modify buttons. vMix's `SetText` writes an absolute value when you leave the
operator off. The CasparCG client's README names the case exactly - you type a new score and press
Update *"if you have typed in an updated score"*. It answers a different question from the minus:
not "I fumbled" but "I have lost track of the truth".

**Undo is the minority answer and never a replacement.** Three in the verified set have one, and
each sits *beside* a minus rather than instead of it: Sportable (*"the UNDO key is used to undo the
last controller entry"*), CueSport (in Snooker it steps back through pots and fouls *"up to 40
steps"* and survives a panel refresh), and Tally Counter (*"the single-tap undo fixes the inevitable
wrong entry without erasing the whole column"*). imageonline's goes fifty deep. OBScoreboard's
Stream Deck action is the most precisely named anywhere: "Undo Point".

**What the module ships: both of the two that matter, no undo.** `−1` per team, and the typed
score, which needs no button because the score IS an operator field - every NoaCG surface already
draws it as a box with a ± stepper. That is the whole reason the scores stayed the artwork's own
fields rather than becoming behaviour-owned holders.

### 3. The reset: it means NEW GAME, and it names its own scope

Two findings, pulling in opposite directions.

**Reset conventionally clears the game, not the scores alone.** Daktronics: *"`MENU- MAIN / NEW
GAME?` Press `<ENTER>` to clear all data for the current game in progress and begin a new game."*
Sportable: *"the RESET key is used to begin a new game. Using this key will clear out the status of
an existing game and reset the scoreboard to the default startup values … clears all scoring
information while saving all option settings."* Live Score App calls its button "Reset Game".
Scoreboard On The Go: *"Reset the score to start a new game."* Where a product wants the narrower
thing it says so in the label - JudgeMate's `×` resets one score while its "Reset All button clears
every score and the timer but keeps team names in place", and Classroomscreen has a per-team "Reset
Score" beside a global "Reset all scores", both buried in settings rather than on the widget face.

Two products in the set have **no reset at all**. SPX's scoreboard has none - team names, scores and
clock persist until the plugin window closes, and only the "extras" are *"always reset when play is
executed"*. OES offers a new game only at power-up, and makes the destructive choice the
five-second *timeout default*: *"Press 'CLEAR' to start a new game. Press 'ENTER' to use game data
saved from last time unit was on. If 'CLEAR' or 'ENTER' are not pressed within 5 seconds, a new
game is automatically selected."* That is worth naming as an anti-pattern, as is imageonline's
reset on an unmodified `R` keystroke.

**Guarding, where it exists, is chosen to match the blast radius rather than applied uniformly.**
CueSport confirms ("clears primary scores after confirmation") and styles both Reset Score and End
Match as danger controls. PiliApp confirms ("after confirming your intention"), and separately
offers a long-press-to-zero on its `-1`. 8-Bit Academy raises a `RETURN TO TEAM SELECT? YES NO`
dialog. Sportable guards with a three-second hold. Live Score App guards a hand-picked list of
risky actions with a timed re-press: *"you have to confirm the action when pressing it, by simply
pressing it again within 5 seconds. This gives you an additional layer of security for risky
actions."* Daktronics leaves `NEW GAME?` behind a menu walk plus `<ENTER>`, and double-confirms
leaving the sport entirely (`EXIT GAME / ARE YOU SURE?`). Watchfire markets the whole idea as
*"panic-free edits"* with *"long-press the button to update"*.

**What the module ships: one "New game", marked destructive.** It really does clear everything the
graphic holds - every score to zero, the flash down, full time undone - so it carries the console's
own word for that rather than a narrower one it would be lying about. Destructive styling is how
the surveyed tools guard a reset with no confirmation dialog, and NoaCG has that styling on every
surface (`MachineControl.destructive`). A hold or a re-press would be a new mechanism on four
control surfaces, and the survey says a danger control is enough.

### 4. Are amounts other than 1 standard? Yes, wherever the graphic is a real sport

Unambiguously - see the table in §1. The consistent framing is that the buttons name the scoring
*event*, not the arithmetic, and the CasparCG rugby client goes furthest by labelling its buttons
Try, Converted try, Penalty and Drop goal with the values hidden in configuration.

The corollary is the one that decided §1: since the right set depends entirely on the sport, the
amounts have to be data the author sets, and only the minus is genuinely universal.

### 5. The labels: the signed amount, and the team comes from the column

Every product in the set writes `+1`, `+2`, `+3`, `-1` on the key and nothing else - SPX's
`buttonText` defaults, Daktronics' key legends, imageonline's `− +` pair, JudgeMate's terse triad
(*"Press + button to increment the score"*, *"Press - button to decrement the score"*, *"Press ×
button to reset the score"*). **Nobody writes "Add point" or "Increment".** The team comes from the
column the buttons sit in. The one exception is OES, whose keys read `HOME SCORE +1` - and OES has
no column to put the team in.

The rest of the vocabulary is short and consistent. "Reset" for clearing, qualified when the scope
is narrow ("Reset Score", "Reset Game", "Reset All"). "New Game" when the action starts a fresh
contest, which is the console word. "Undo" where undo exists. "Set" is Singular's word for the
absolute write; "Edit" is the console word for the same thing. Teams are "Home"/"Guest" on the
consoles and "Home"/"Away" or "Home"/"Visitor" elsewhere.

**What the module ships: `+1` and `−1` as the labels, with the team as the button SECTION.**
Sections are that column on every NoaCG surface, and the cue editor already makes the same claim
about the same board (`src/control/cueFieldGroups.ts`, owner 2026-08-21: *"everything that fits one
team should be on one row"*).

---

## More than two teams

The requirement that started this row is *"two or more teams"* (owner, 2026-09-03), so where the
ceiling sits mattered.

- **Everything built for a match stops at two.** SPX's home/away dropdowns, NewBlue's "Home Score"
  and "Visitor Score" variables, CueSport's two players, the Daktronics, OES and Sportable console
  keypads, vMix by convention since it is only title fields.
- **The tools built for a room full of groups go further**, and that is what a class quiz board is:
  Games4ESL two to six, 8-Bit Academy one to six, MyClassScreen up to four, Scoreboard On The Go up
  to eight, a sibling iOS scorekeeper twelve, Classroomscreen's "Points" layout stated as
  accommodating multiple teams without a published number.
- **The outliers are leaderboards read off a page, not boards driven live**: OBScoreboard sells 5 /
  20 / unlimited as pricing tiers, Tally Counter states *"no limit on the number of counters"*.

**Eight**, which is also where the poll caps its option rows.

## Not surveyed

Ross XPression, Chyron PRIME, Vizrt, Sportzcast and ScoreVision - the professional control rooms -
and Nevco, All American Scoreboards, ClassDojo, Kahoot, Flippity, Baamboozle, Classroom Group
Generator, Leaderboarded, ScoreCounter, Hi Counter, OverlayOn, BallBoy and ScoreSync. Also
unresolved: the button labels for Live Score App, Classroomscreen, Fly Scoreboard and the OBS
Scoreboard Overlay plugin, none of which publish them.

## One thing worth stealing later, and not now

**A named event instead of an amount.** The rugby client's "Try / Penalty / Drop goal" is the best
answer in the survey: the operator presses what happened and the points are configuration. It needs
an authoring surface to pick the names, which is exactly the thing that is out of scope until the
owner asks for one.

**And one open question the survey did not answer.** Whether `−1` at zero should clamp. Nothing in
the verified set documents a clamp either way. The module deliberately does not clamp: the score is
the operator's own field, and a graphic that silently refused to show what the box says would be
the drift every other decision in the module exists to avoid. `−1` at zero shows `-1`, in the box
the operator is looking at, and they press `+1`.

## Sources read

SPX Graphics <https://spxgc.tawk.help/article/spx-scoreboard> ·
CasparCG client <https://github.com/crazyscot/casparcg-client>,
<https://github.com/xtv-online/football-graphics> ·
vMix <https://www.vmix.com/knowledgebase/article.aspx/66/how-to-control-scoreboards-in-vmix-with-the-keyboard>,
<https://www.vmix.com/help28/DataSources.html> ·
Singular via Recast <https://recastpay.com/resources/support-guides/adding-scoreboard-overlays>
(the Counter node detail is from the search index of
<https://support.singular.live/hc/en-us/articles/31545704499481-Singular-Updates-May-2024>, which
refuses automated fetching) ·
CueSport <https://github.com/iainsmacleod/CueSport-Scoreboard> ·
OBS Scoreboard Overlay plugin <https://obsproject.com/forum/resources/scoreboard-overlay-and-controller-plugin.1777/> ·
OBScoreboard <https://obscoreboard.com/blog/how-to-add-obscoreboard-to-your-elgato-stream-deck/>,
<https://obscoreboard.com/> ·
Fly Scoreboard <https://github.com/mmlTools/fly-scoreboard> ·
NewBlue Titler Live, search index of
<https://newbluefx.zendesk.com/hc/en-us/articles/208637346-Using-the-Scoreboard-Tool> (403) ·
Daktronics All Sport 5500 <https://dc-digital.com/wordpress/wp-content/uploads/2019/02/Daktronics-All-Sport-5500-Manual.pdf>,
5000 series <https://www.manualslib.com/manual/1446987/Daktronics-All-Sport-5000-Series.html> ·
OES ISC9000 <https://cdn1.sportngin.com/attachments/document/7d49-1846898/OES_ISC9000.pdf> ·
Sportable <https://dc-digital.com/wordpress/wp-content/uploads/2019/12/Sportable-Scoreboards-Wireless-Controller-Manual.pdf> ·
imageonline <https://imageonline.io/scoreboard/> ·
JudgeMate <https://www.judgemate.com/en/scoreboard> ·
PiliApp <https://www.piliapp.com/scoreboard/> ·
8-Bit Academy <https://8bitacademy.com/resources/scorekeeper-for-games/> ·
Games4ESL <https://games4esl.com/teacher-tools/game-scoreboard/> ·
MyClassScreen <https://myclassscreen.org/tools/scoreboard/> ·
Classroomscreen <https://classroomscreen.com/widgets/scoreboard> ·
Tally Counter <https://tallycounterapp.org/score-counter> ·
Scoreboard On The Go <https://apps.apple.com/us/app/scoreboard-on-the-go/id1388012712>,
<https://apps.apple.com/us/app/scoreboard-score-keeper/id6744919824> ·
SCOREA <https://www.scorea.eu/a/remote-control> ·
Watchfire <https://www.watchfire.com/products/sports-displays-scoreboards/scoreboard-controllers> ·
KeepTheScore <https://keepthescore.com/docs/streamdeck-integration/> ·
Live Score App <https://www.live-score-app.com/userguide/builtin-controls>
