# NoaCG Template Library

Ready-made broadcast graphics to make your own. Change words, colours and shapes in Illustrator or Inkscape, save as SVG and import into NoaCG. Each template is made for a feature, and its controls work once imported.

## In this folder

- **SVG**: the templates. Each SVG is its own editable source; open it directly in Illustrator or Inkscape.
- **Previews**: a picture of every template, plus one for each state it shows on air, such as Warning or Time up.
- **Illustrator**: older `.ai` sources for the navy templates. The SVG is the maintained source; use these only if you prefer them.
- **library.json**: the list of templates, what each one does in NoaCG and the packages it belongs to.
- **CLOCKS.md** and **EDITABLE-CREDITS.md**: how to draw a clock and editable end credits.

A package zip holds only its own templates and the guides they use; this README covers the whole library.

## Fonts

Two free fonts, both under the SIL Open Font License: **Manrope** for most templates and **Oswald** for the navy ones. Install them from fonts.google.com before you open a file. Pink text in Illustrator means a font is missing; install it or pick a font you have.

## Open, edit, export, import

- Open an SVG in Illustrator (File > Open) and open the Layers panel (Window > Layers).
- Every file has up to three layers. **Text** holds live text. **Moments** holds hidden groups that NoaCG shows at the right time. **Board** holds the shapes that never change.
- Change words, fonts, colours and shapes freely. Keep the names in the Layers panel, such as `Team 1` and `Flash 1`: NoaCG uses them to know what each part does.
- Keep text as live text. Do not outline it or turn it into a picture.
- Save with File > Save a Copy > SVG. Tick **Use Artboards** and keep **Font: SVG**. In Inkscape, save as SVG and keep object labels and live text.
- In NoaCG, choose New graphic > Import graphic and drop the SVG. Check **What it does**: most templates select their behaviour from layer names. For **Pop-up alert**, **Transition**, **Match event** and **Chat highlight**, choose Pop-up alert yourself.
- Put the graphic in a production. Edit its fields, then Take. Out clears it.

Names in these templates are made up.

---

## The templates

| Template | What it does in NoaCG |
|---|---|
| **Lower third** | Type Name and Role. Take, then Update for the next person. |
| **Countdown** | A corner countdown. Clock is minutes: the drawn `1:00` is one minute. Take starts it; Pause, Start and Reset control it. The timer bar shortens with the time left. Warning pulses in the last ten seconds while the clock runs, and Time up flashes once at zero. With reduced motion they show without moving. |
| **Show clock** | A full-screen clock before the show. At import, choose how Clock counts: down from its time, or to a set time such as 18:00. |
| **Quiz** | Type the question and answers, choose the correct answer, then Take. Select answer, Lock it in and Reveal correct run the round. |
| **Game rules** | A full-screen card with a heading and Rule 1 to Rule 5. |
| **Be back soon** | A full-screen break card. Retype Title for a technical problem. |
| **Scoreboard, 2 players** | Change team names. +1 and -1 change each score; +1 shows that team's flash. New game resets the scores. |
| **Scoreboard, 4 players** | The same controls for four players along the top of the screen. |
| **Winner** | A centred card: Title is the winner, Subtitle the badge above it. Choose an entrance such as Pop when you import. |
| **End credits** | Paste the list in playout: the show title first, then one role per line, such as `Camera: Kim Park, Jo Berg`. The two-column design puts roles on the left. |
| **Join card** | The `QR` group is where NoaCG draws the code for your production's join link. In Interaction, Add Join card puts the current link in its cue. |
| **Live vote** | The room votes on their phones. The bars follow the votes; Close voting, Show result and Call the winner run the round. |
| **Vote results** | The same controls on a side panel. In Interaction, Add results stages a round's counts and whether voting is open or closed. |
| **Vote results with counts** | Vote results with each option's own vote count under its bar, shown with the percentages. |
| **Poll result** | Typed results, not a live vote. At import, tick Poll result. Type the question, and in Options one line per option: its name, a bar sign, its figure (`Streaming \| 62`). The bars and percentages show at once. |
| **Message** | In Interaction, Prepare puts a viewer's message and name on it (in `From`): pasted, live chat or Twitch. |

---

## More templates

| Template | What it does in NoaCG |
|---|---|
| **Sponsor bug, Logo mark, Station ident, Event ident, Award mark** | Corner marks. Replace the drawn logo in Illustrator; their words are fields. |
| **Sponsor strip** | A row of partner logos under a Kicker such as Supported by. |
| **Topic card, Headline card, Statement** | Cards for a story, a headline or a quote. Every text is a field; Update changes it on air. |
| **Now and next, Sign-off, Call to action, Social handle, Location chip** | Programme and channel cards. Every text is a field. |
| **Product card, Offer card, Listing card** | Shopping and property cards. Replace the drawn picture in Illustrator. |
| **Key facts, Recap card** | Type one entry per line in Entries. Next shows them one at a time, from the last number down, and each stays up. |
| **Live bug** | A corner tag with Live, Replay and Delayed looks. The status buttons show one of them; Clear hides it. |
| **Alert level** | A severity band that starts at Advisory. Each level is a button and shows its word and a four-step meter, so it reads without colour. |
| **Winner card, Award reveal, Q&A card, Nominee reveal** | The reveal text airs covered until Reveal. Show and Hide work a drawn moment. |
| **Public notice** | A notice card that starts at Standard. Urgent adds a red band with the word Urgent; Standard takes it away. |
| **Answer board, three answers; two answers** | The Quiz controls with three or two answers. |
| **End credits, pages** | At import, set Plays as to Cards. A blank line in the list starts a new page; Next card shows it. |
| **End credits, still board** | At import, set Plays as to Hold still. The list stands still, roles on the left. |
| **QR card** | Put your own QR code picture in `QR image` (a printed code, not the join link). |
| **Versus** | Two team logos in `Home logo` and `Away logo`, and two names. |
| **Two-up frames** | Two open camera windows with a name under each. The windows stay empty, so your cameras show through. |
| **Framed picture** | A picture in `Picture` with a Caption under it. |

---

## Layer names

From the top of the Layers panel. A number or letter after a space says which row a part belongs to.

| Template | Text | Moments | Board |
|---|---|---|---|
| **Lower third** | `Name`, `Role` | none | `Name box`, `Role box` |
| **Countdown** | `Title`, `Clock` | `Timer bar` (visible), `Warning`, `Paused`, `Time up` | `Panel`, `Track` |
| **Show clock** | `Title`, `Clock`, `Subtitle` | none | `Panel`, `Clock box` |
| **Quiz** | `Question`, `Answer A` to `Answer D` | `Selected A`, `Correct A`, `Wrong A` per answer; `Locked in` | `Question box`, `Answer box A`, `Letter box A`, `static:Letter A` |
| **Game rules** | `Rules heading`, `Rule 1` to `Rule 5` | none | `Panel`, `Accent`, `Rule box 1`, `Badge 1`, `static:Rule number 1` |
| **Be back soon** | `Title`, `Subtitle` | none | `Panel`, `Accent` |
| **Scoreboards** | `Team 1`, `Score 1`, and so on | `Flash 1`, and so on | `Team box 1`, `Score box 1` |
| **Winner** | `Title`, `Subtitle` | none | `Panel`, `Subtitle box`, `Confetti` |
| **End credits** | `Heading`, `Credits`, `Credits 2`… | none | `Panel`, `Accent` |
| **Join card** | `Label`, `Call to action` | none | `Panel`, `QR plate`, `QR` |
| **Live vote, Vote results** | `Question`, `Option 1`, `Percent 1`, `Total votes` | `Bar 1` (visible), `Winner 1`, `Vote badge` | `Panel`, `Track 1` |
| **Vote results with counts** | as Vote results, plus `Count 1` per option | as Vote results | as Vote results |
| **Poll result** | `Question`, `Option 1`, `Percent 1` | `Bar 1` (visible) | `Panel`, `Track 1` |
| **Message** | `From`, `Message` | none | `From box`, `Message box` |

---

## Layer names, more templates

| Template | Text | Moments | Board |
|---|---|---|---|
| **Corner marks** | `Caption`, `Wordmark`, `Channel`, `Show`, `Event`, `Detail`, `Award`, `Category` | none | `Logo`, `Panel` or a box per text |
| **Sponsor strip** | `Kicker` | none | `Panel`, `Logo 1` to `Logo 3` |
| **Cards** | one text per field, such as `Topic`, `Headline`, `Statement`, `Now`, `Next`, `Action`, `Product`, `Cost` | none | a `... box` under each text |
| **Key facts, Recap card** | `Title`, `Item 1` to `Item 4` | `Mark 1` to `Mark 4` | `Item box 1`, `static:Fact 1` |
| **Live bug** | `Title` | `choice:Status/Live`, `choice:Status/Replay`, `choice:Status/Delayed` | `Panel` |
| **Alert level** | `Headline`, `Detail`, `Source` | `choice:Level/Advisory` (visible: the level it starts on), `choice:Level/Watch`, `choice:Level/Warning`, `choice:Level/Emergency` | `Panel` |
| **Public notice** | `Notice label`, `Headline`, `Details` | `choice:Level/Standard` (visible), `choice:Level/Urgent` | `Panel` |
| **Reveals** | `Price` (the revealed text) | `Cover`, `show:` moments | `Panel` |
| **Answer boards** | `Question`, `Answer A` to `Answer C` | as the Quiz | as the Quiz |
| **End credits, pages and still board** | `Heading`, `Credits`, `Credits 2`… | none | `Panel`, `Page frame` or `Heading box` |
| **QR card, Versus, Framed picture** | `f:QR image`, `f:Home logo`, `f:Away logo`, `f:Picture`, and their texts | none | a plate under each picture |
| **Two-up frames** | `Person 1`, `Person 2` | none | `Window 1`, `Window 2` (outlines with no fill), `Person box 1` |

Moments items except the timer bar and a choice's starting option are hidden groups: show one with its eye icon, edit it, hide it again before saving. Fixed words on the Board start with `static:`.

---

## Sports and moments

| Template | What it does in NoaCG |
|---|---|
| **Scorebug** | A corner score with a clock. At import, set Clock to Counts up. +1 and -1 change each score, and +1 shows that team's Goal tab. Full time calls the game. First, Interval and Second move the tab under the clock. |
| **Match status** | A score card that starts at Live. Break and Ended change its tab. |
| **Match board** | Totals with +1 and -1, and a figure per quarter to type. Full time calls the game. |
| **Esports score** | Maps won with +1 and -1; Format and Map are fields. Full time shows Series over. |
| **Transition, Match event** | At import, choose Pop-up alert. It clears itself after eight seconds; Next clears it sooner. |

| Template | Text | Moments | Board |
|---|---|---|---|
| **Scorebug** | `Team 1`, `Score 1`, `Clock` | `Flash 1`, `Full time`, `choice:Period/First` (visible), `choice:Period/Interval`, `choice:Period/Second` | `Team box 1`, `Score box 1`, `Clock box` |
| **Match status** | `Team 1`, `Score 1`, `Detail` | `choice:Status/Live` (visible), `choice:Status/Break`, `choice:Status/Ended` | `Panel`, `Score box 1` |
| **Match board** | `Title`, `Team 1`, `Q1 home` to `Q4 away`, `Score 1` | `Flash 1`, `Full time` | `Panel`, `Team box 1`, `Score box 1`, `static:Q1` |
| **Esports score** | `Team 1`, `Score 1`, `Format`, `Map` | `Flash 1`, `Full time` | `Team box 1`, `Score box 1`, `Format box`, `Map box` |
| **Transition, Match event** | `Label`; `Event`, `Player`, `Detail` | none | `Panel`, `Label box`, `Event box` |

---

## Picks, focus and boards

| Template | What it does in NoaCG |
|---|---|
| **Verdict card, Matchup** | Starts with no verdict or winner. Each option is a button; Clear takes it away again. |
| **Podium score** | +1 and -1 for each contestant. Left, Middle and Right put the amber spotlight on one podium; Clear takes it off. |
| **Timing tower** | Places stay where they are drawn: type the cars and gaps. P1 to P5 frame one place; Clear takes the frame off. |
| **Map round** | Starts at Veto; Picked and Live change its tab. The map, bans and pick are fields. |
| **Chat highlight** | At import, choose Pop-up alert and tick Hold on air. It clears itself after eight seconds; Hold on air keeps it up and Take it off clears it. |
| **Head to head, Player card, Bracket, Fixtures, Agenda** | Every text is a field. Put a photo in `Photo`. In the bracket, type a team into the next round to move it on. |

| Template | Text | Moments | Board |
|---|---|---|---|
| **Verdict card** | `Claim`, `Source` | `choice:Verdict/True`, `/False`, `/Misleading` | `Panel`, `static:Fact check` |
| **Matchup** | `Event`, `Home team`, `Away team` | `choice:Winner/Home`, `choice:Winner/Away` | `Panel`, `Home team box` |
| **Podium score** | `Team 1`, `Score 1`, and so on | `Flash 1`, `choice:Spotlight/Left`, `/Middle`, `/Right` | `Team box 1`, `Score box 1` |
| **Timing tower** | `Session`, `Car 1`, `Gap 1` to 5 | `choice:Focus/P1` to `P5` | `Session box`, `Car box 1`, `static:P1` |
| **Map round** | `Series`, `Map`, `Ban 1`, `Ban 2`, `Pick` | `choice:Phase/Veto` (visible), `/Picked`, `/Live` | `Panel`, `Ban box 1`, `Pick box` |
| **Chat highlight** | `Viewer`, `Comment` | none | `Panel`, `Accent` |
| **Head to head** | `Left name`, `Stat 1`, `Left 1`, `Right 1` to 3 | none | `Panel`, `Stat box 1` |
| **Player card** | `f:Photo`, `Player`, `Team`, `Number`, `Stat 1`, `Stat 2` | none | `Panel`, `Photo frame`, `Number box` |
| **Bracket, Fixtures, Agenda** | `Stage`, `Semi 1`, `Final 1`, `Champion`; `Title`, `Time 1`, `Home 1`, `Away 1`; `Title`, `Time 1`, `Session 1` | none | `Panel` and a box per row |

---

## The navy templates

- **Title**: change Title and Subtitle. Take, then Out.
- **Lower third**: type Name and Role. Take, then Update for the next person.
- **Quiz**: enter the question and answers, choose the correct answer, then Take. Select answer, Lock it in and Reveal correct run the round.
- **Scoreboard**: change team names. Each team's +1 and -1 change its score; +1 flashes its tab. New game resets both scores.
- **Countdown**: Clock is minutes, initially 5 from the drawn 05:00. Take starts it. Pause holds it, Start resumes, Reset restores its length.
- **Clock / Score and clock**: choose Clock's duration, elapsed or target-time mode at import. `12:00` is one live text object named `Clock`. See **CLOCKS.md** for drawing, layer names and controls.
- **Ticker**: change Kicker and Story. Update changes the line on air.
- **End credits**: the fixed-artwork option. The complete imported layout scrolls from below the frame until it leaves the top. Scroll speed changes its pace. For editable names in playout, use Editable end credits.
- **Editable end credits**: the design supplies role and name styles; paste the full list in playout or connect a Google Sheet. See **EDITABLE-CREDITS.md** for drawing, layer names and controls.

---

## More navy templates

These use the same import workflow. The art shows the layout; fields on the production page supply live content.

- **Standings**: change names and points, then Update, or use +1 and -1. Rows move to their new positions. Reset points starts a new round.
- **Live vote**: connect a vote, or type its question, options and counts into the fields. Take starts voting. Close voting stops it, Show result reveals percentages, and Call the winner marks the leading option. Bars are drawn at full length.
- **Goal meter**: set Current and Target. Update fills the bar to Current divided by Target and updates Percent. Values 25 and 100 show 25%.
- **Pop-up alert**: select Pop-up alert at import. Type Title and Subtitle, then Take. It clears itself after eight seconds; Next clears it sooner.
- **Survey board**: paste answers and points into Answers, one per line, such as `Clothes | 40`. Take, then reveal an answer. Strike adds an X. Undo strike removes one. Reset board starts the round again. The total follows revealed answers.
- **Stepped list**: paste Entries, one per line. Take shows the heading. Next reveals one entry at a time, from the last number down to 1. Turn off the countdown option at import to reveal from 1 upwards.
- **Lineup**: type the guest names. Take, then Next guest advances the current guest. Its border marks who is on now; DONE marks guests already seen.
- **Puzzle board**: type a Puzzle of up to ten characters, including spaces, and a Category. Take. Type a letter into Guess and press Reveal letter. Undo letter reverses it. Solve reveals the rest; New puzzle clears guesses.
- **Reveal**: type The reveal before Take. The cover conceals it until Reveal is pressed. Out clears the card.
- **Bingo caller**: the sample board has numbers 1 to 15. Type Number to call and press Call it. Called numbers stay marked; the newest has an extra mark. Take back corrects a call; New game clears the board.
- **Switch**: Take the show card. Show Sponsor and Hide Sponsor display or clear its sponsor tag.
- **Choice**: Take the card. Choose Live, Replay or Standby under Status. Only one status appears at a time.

---

## Layer names: navy templates

From the top of the Layers panel:

- **Text** holds text fields and the text a behaviour writes, named for their purpose.
- **Moments** holds what NoaCG shows or moves. A moment is a hidden group. A gauge bar stays visible at full length. No moments means no Moments layer.
- **Board** stays as drawn. `Panel` is the background. A plate under a text uses its name plus `box`. Fixed words start with `static:`.

A letter or number after a space says which row a name belongs to: `Answer A`, `Score 1`. Use the names below; the content itself can be in any language.

| Graphic | Text | Moments | Board |
|---|---|---|---|
| **Title** | `Title`, `Subtitle` | none | `Panel`, `Title box`, `Subtitle box` |
| **Lower third** | `Name`, `Role` | none | `Panel`, `Accent` |
| **Quiz** | `Question`, `Answer A` to `Answer D` | `Selected A`, `Correct A`, `Wrong A` per answer; `Locked in` | `Question box`, `Answer box A`, `Letter box A`, `static:Letter A` |
| **Scoreboard** | `Team 1`, `Score 1`, `Team 2`, `Score 2` | `Flash 1`, `Flash 2` | Team and score boxes; `Middle` |
| **Countdown** | `Title`, `Clock` | `Timer bar`, `Warning`, `Paused`, `Time up` | `Panel`, `static:Status`, `Accent`, `Track` |
| **Clock** | `Clock`, one live `12:00` text | none | `Panel`; optional `Clock box` |
| **Ticker** | `Kicker`, `Story` | none | `Panel`, `Kicker box` |
| **End credits** | `Credits`, one long text object | none | none |
| **Editable end credits** | `Credits`, `Credits 2`, etc.: one role or name per live text object; optional `Heading` | none | optional `Panel` |

The fixed-artwork credits keep their original layout. Their Illustrator source has a Text group inside Frame so SVG export preserves it. Text below the artboard scrolls into view. Keep the 1920 by 1080 artboard as the output frame.

---

## Behaviour layer names

Extra decorative shapes can have any name. Fixed text on the Board starts with `static:`.

| Graphic | Text | Moments |
|---|---|---|
| **Standings** | `Name 1`, `Points 1`, `Position 1`, repeated to 3 | `Row 1` to `Row 3`, visible plates |
| **Live vote** | `Question`, `Option 1`, `Percent 1`, repeated to 3; `Total votes` | `Bar 1` to `Bar 3`, visible; `Winner 1` to `Winner 3`, hidden |
| **Goal meter** | `Percent` | `Progress bar`, visible at full length |
| **Pop-up alert** | `Title`, `Subtitle` | none; choose Pop-up alert at import |
| **Survey board** | `Question`, `Answer 1`, `Points 1`, repeated to 3; `Total` | `Strike 1`, `Strike 2`, `Strike 3` |
| **Stepped list** | `Item 1` to `Item 3` | `Mark 1` to `Mark 3` |
| **Lineup** | `Guest 1` to `Guest 3` | `Now 1` to `Now 3`, `Done 1` to `Done 3` |
| **Puzzle board** | `Category`, `Letter 1` to `Letter 10` | none |
| **Reveal** | `Price` | `Cover` |
| **Bingo caller** | `Number 1` to `Number 15`; `Last call`, `Count` | `Called 1` to `Called 15`; `Last 1` to `Last 15` |
| **Switch** | `Title`, `Subtitle` | `show:Sponsor` |
| **Choice** | `Title`, `Subtitle` | `choice:Status/Live`, `choice:Status/Replay`, `choice:Status/Standby` |

Except bars and the standings' row plates, every Moments item is a hidden group. Draw its shapes and labels inside that group, then hide the group before exporting. NoaCG supplies the controls.

---

## Make it your own

- **Colours**: select every shape of one colour with Select > Same > Fill Color, then pick a new colour.
- **More or fewer players**: in the 4-player scoreboard, select one player's `Team box`, `Score box`, `Team`, `Score` and `Flash` and copy them. Rename the copies to the next number, such as `Team 5` and `Score 5`. Delete a player's five parts to remove them. For more than five players, make each player narrower so the row still fits the screen.
- **More or fewer vote options**: copy an option's `Track`, `Bar`, `Winner`, `Option` and `Percent` and rename them with the next number. A vote has two to eight options.
- **More or fewer rules**: copy a rule's `Rule box`, `Badge`, `static:Rule number` and `Rule` text, and rename them with the next number.

## Numbers and clocks

Scores and clocks are one live text each: `Score 1` shows `0`, `Clock` shows `1:00`. Do not split digits into separate texts. Keep the plate behind a score wide enough for three digits, and the clock plate wide enough for the longest time you need.

## Animation

Imported SVGs carry no animation of their own: NoaCG adds the entrance and exit you pick at import, such as Fade or Pop. The winner's confetti is drawn. Names here are made up.
