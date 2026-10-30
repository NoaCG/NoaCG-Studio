# NoaCG SVG examples

Nineteen editable Illustrator graphics cover every supported SVG import behaviour, plus a title, lower third and ticker. Start from a working example, change its design, export SVG and run it in NoaCG.

## In this folder

- **Illustrator**: editable `.ai` sources.
- **SVG**: original Illustrator exports, ready to import.
- **Previews**: a picture of every graphic. Quiz, scoreboard and countdown include more states.
- **examples.json**: the inventory connecting examples to import behaviours.

## Open, edit, export, import

- Open an Illustrator file and its Layers panel (Window > Layers).
- Change words, fonts, colours and shapes. Keep names such as `Team 1` and `Flash 1` so NoaCG can recognise their purpose.
- Pink text means a missing font. Install Oswald from fonts.google.com, or choose a font you have.
- Save with File > Save a Copy > SVG. Tick **Use Artboards** and keep **Font: SVG**. Do not outline text. This export preserves hidden moment groups.
- At noacg.studio/app, choose New graphic > Import graphic and drop the SVG. Check **What it does**. Most examples select their behaviour from layer names. For **alert.svg**, choose **Alert** explicitly.
- Put the graphic in a production. Edit its fields, then Take. Out clears it.

## The first seven

- **Title**: change Title and Subtitle. Take, then Out.
- **Lower third**: type Name and Role. Take, then Update for the next person.
- **Quiz**: enter the question and answers, choose the correct answer, then Take. Select answer, Lock it in and Reveal correct run the round.
- **Scoreboard**: change team names. Each team's +1 and -1 change its score; +1 flashes its tab. New game resets both scores.
- **Countdown**: Clock is minutes, initially 5 from the drawn 05:00. Take starts it. Pause holds it, Start resumes, Reset restores its length.
- **Ticker**: change Kicker and Story. Update changes the line on air.
- **End credits**: choose Credits roll and Take. The complete Illustrator text scrolls from below the frame until it leaves the top. Scroll speed changes its pace. Edit names in Illustrator and import the SVG again. There is no credits box or editable playout list.

Names in these examples are made up.

---

## More behaviours

These examples use the same import workflow. The art shows the layout; fields on the production page supply live content.

- **Standings**: change names and points, then Update, or use +1 and -1. Rows move to their new positions. Reset points starts a new round.
- **Live vote**: connect a vote, or type its question, options and counts into the fields. Take starts voting. Close voting stops it, Show result reveals percentages, and Call the winner marks the leading option. Bars are drawn at full length.
- **Meter**: set Current and Target. Update fills the bar to Current divided by Target and updates Percent. Values 25 and 100 show 25%.
- **Alert**: select Alert at import. Type Title and Subtitle, then Take. It clears itself after eight seconds; Next clears it sooner.
- **Survey**: paste answers and points into Answers, one per line, such as `Clothes | 40`. Take, then reveal an answer. Strike adds an X. Undo strike removes one. Reset board starts the round again. The total follows revealed answers.
- **Stepped list**: paste Entries, one per line. Take shows the heading. Next reveals one entry at a time, from the last number down to 1. Turn off the countdown option at import to reveal from 1 upwards.
- **Lineup**: type the guest names. Take, then Next guest advances the current guest. Its border marks who is on now; DONE marks guests already seen.
- **Puzzle**: type a Puzzle of up to ten characters, including spaces, and a Category. Take. Type a letter into Guess and press Reveal letter. Undo letter reverses it. Solve reveals the rest; New puzzle clears guesses.
- **Reveal**: type The reveal before Take. The cover conceals it until Reveal is pressed. Out clears the card.
- **Bingo**: the sample board has numbers 1 to 15. Type Number to call and press Call it. Called numbers stay marked; the newest has an extra mark. Take back corrects a call; New game clears the board.
- **Switch**: Take the show card. Show Sponsor and Hide Sponsor display or clear its sponsor tag.
- **Choice**: Take the card. Choose Live, Replay or Standby under Status. Only one status appears at a time.

---

## Layer names

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
| **Ticker** | `Kicker`, `Story` | none | `Panel`, `Kicker box` |
| **End credits** | `Credits`, one long text object | none | none |

Credits keep their original layout. The Illustrator source has a Text group inside its Frame layer so SVG export preserves the named group. Text below the artboard is intentional and scrolls into view. Keep the 1920 by 1080 artboard as the output frame.

---

## Behaviour layer names

Extra decorative shapes can have any name. Fixed text on the Board starts with `static:`.

| Graphic | Text | Moments |
|---|---|---|
| **Standings** | `Name 1`, `Points 1`, `Position 1`, repeated to 3 | `Row 1` to `Row 3`, visible plates |
| **Live vote** | `Question`, `Option 1`, `Percent 1`, repeated to 3; `Total votes` | `Bar 1` to `Bar 3`, visible; `Winner 1` to `Winner 3`, hidden |
| **Meter** | `Percent` | `Progress bar`, visible at full length |
| **Alert** | `Title`, `Subtitle` | none; choose Alert at import |
| **Survey** | `Question`, `Answer 1`, `Points 1`, repeated to 3; `Total` | `Strike 1`, `Strike 2`, `Strike 3` |
| **Stepped list** | `Item 1` to `Item 3` | `Mark 1` to `Mark 3` |
| **Lineup** | `Guest 1` to `Guest 3` | `Now 1` to `Now 3`, `Done 1` to `Done 3` |
| **Puzzle** | `Category`, `Letter 1` to `Letter 10` | none |
| **Reveal** | `Price` | `Cover` |
| **Bingo** | `Number 1` to `Number 15`; `Last call`, `Count` | `Called 1` to `Called 15`; `Last 1` to `Last 15` |
| **Switch** | `Title`, `Subtitle` | `show:Sponsor` |
| **Choice** | `Title`, `Subtitle` | `choice:Status/Live`, `choice:Status/Replay`, `choice:Status/Standby` |

Except bars and the standings' row plates, every Moments item is a hidden group. Draw its shapes and labels inside that group, then hide the group before exporting. NoaCG supplies the controls.
