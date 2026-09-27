# NoaCG SVG examples

Seven broadcast graphics drawn in Illustrator: a title, a lower third, a quiz, a scoreboard, a countdown, a ticker and end credits. Open one, see how its layers are named, make it yours, and run it live in NoaCG.

## What is in the folder

- **Illustrator**: the seven files you open and change.
- **SVG**: the same seven, saved for NoaCG. Import these first to see how it works.
- **Previews**: a picture of every graphic, and of every moment the quiz, the scoreboard and the countdown can show.

## Open, edit, export, import

- Open a file from the Illustrator folder, and open the Layers panel (Window > Layers).
- Look at the layers: `Text`, `Moments` and `Board`. The next page says what each one holds.
- Change the colours, fonts, shapes and words as much as you like. Keep the layer names.
- Pink text in Illustrator means the font is missing. Install Oswald from fonts.google.com, or pick another font.
- Save for NoaCG: File > Save a Copy > SVG. Tick "Use Artboards". In SVG Options, keep Font on SVG and press OK.
- Go to noacg.studio/app, press New graphic, then Import graphic, and drop in your SVG. NoaCG finds the fields and the moments from the layer names.
- Put the graphics you need in one production, and run the show from the production's page.

## On air

- **Title**: type the Title and Subtitle. Take, then Out.
- **Lower third**: one graphic for everybody. Type the Name and Role and press Take. Type the next person and press Update.
- **Quiz**: type the question and four answers, pick the correct one, Take. When a player answers, pick their letter, then press Select answer, Lock it in and Reveal correct.
- **Scoreboard**: type both team names. +1 and -1 change the score, and a point flashes that team's tab.
- **Countdown**: the Clock field is the length in minutes, 5 from the 05:00 drawn in the file. Take, and it counts down. Pause holds it, Start goes on, and Reset puts it back to the top.
- **Ticker**: type the Kicker and the Story. Update changes the line on air.
- **End credits**: the whole list is one field. A line ending in ":" is a title, and the names go under it. An empty line starts a new part. Take, and it rolls.

The names in the examples are made up.

---

## Layer names

NoaCG reads the names in the Layers panel, so every graphic uses the same three layers. From the top:

- **Text** is what you type on air. Name each text for what it is.
- **Moments** are what NoaCG shows or moves. A moment is a hidden group; a bar is drawn at full length and left visible. A graphic with no moments has no Moments layer.
- **Board** stays as drawn. `Panel` is the background. A plate under a text is that text's name plus "box". Fixed words start with `static:`. Any other shape can have any name.

A letter or a number after a space says which row a name belongs to: `Answer A`, `Score 1`. Every name is in English.

| Graphic | Text | Moments | Board |
|---|---|---|---|
| **Title** | `Title`, `Subtitle` | none | `Panel`, `Title box`, `Subtitle box` |
| **Lower third** | `Name`, `Role` | none | `Panel`, and `Accent`, a decoration |
| **Quiz** | `Question`, `Answer A` to `Answer D` | `Selected A`, `Correct A`, `Wrong A` for each letter, and one `Locked in` | `Question box`, and `Answer box A`, `Letter box A` and `static:Letter A` for each letter |
| **Scoreboard** | `Team 1`, `Score 1`, `Team 2`, `Score 2` | `Flash 1`, `Flash 2` | `Team box 1`, `Score box 1`, `Team box 2`, `Score box 2`, and `Middle`, a decoration |
| **Countdown** | `Title`, `Clock` | `Timer bar`, `Warning`, `Paused`, `Time up` | `Panel`, `static:Status`, and `Accent` and `Track`, decorations |
| **Ticker** | `Kicker`, `Story` | none | `Panel`, `Kicker box` |
| **End credits** | `Heading`, `Credits` | none | `Panel`, `Credits box` |

- **Quiz.** `Selected A` shows while A is the pick and `Locked in` once you lock it. If B is right, the reveal shows `Correct B`, `Wrong A`, `Wrong C` and `Wrong D`. Two to six answers, A to F.
- **Scoreboard.** `Flash 1` shows when team 1 gets a point. Add a hidden `Full time` group and the Full time button shows it. Two to eight teams.
- **Countdown.** The clock is the text drawn as a time, such as 05:00, whatever it is called. `Timer bar` empties as the clock runs, `Warning` shows near the end, and `Time up` at zero.
