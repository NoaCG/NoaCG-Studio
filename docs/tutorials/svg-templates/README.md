# NoaCG SVG templates

Eleven ready-made broadcast graphics in one clean style. They are starting points: make one yours in Illustrator, save it as SVG and import it into NoaCG.

## In this folder

- **SVG**: the templates. Each SVG is its own editable source; open it directly in Illustrator or Inkscape.
- **Previews**: a picture of every template. The quiz, scoreboards and game timer include more states.
- **templates.json**: the list of templates and what each one does in NoaCG.

## Open, edit, export, import

- First install the **Manrope** font, free from fonts.google.com. Pink text in Illustrator means the font is missing.
- Open an SVG in Illustrator (File > Open) and open the Layers panel (Window > Layers).
- Every file has up to three layers. **Text** holds live text. **Moments** holds hidden groups that NoaCG shows at the right time. **Board** holds the shapes that never change.
- Change words, fonts, colours and shapes freely. Keep the names in the Layers panel, such as `Team 1` and `Flash 1`: NoaCG uses them to know what each part does.
- Keep text as live text. Do not outline it or turn it into a picture.
- Save with File > Save a Copy > SVG. Tick **Use Artboards** and keep **Font: SVG**.
- In NoaCG, choose New graphic > Import graphic and drop the SVG. Check **What it does**, then put the graphic in a production.

## The templates

| Template | What it does in NoaCG |
|---|---|
| **Lower third** | Type Name and Role. Take, then Update for the next person. |
| **Game timer** | A corner countdown. Clock is minutes: the drawn `1:00` is one minute. Take starts it; Pause, Start and Reset control it. The timer bar shortens with the time left, Warning shows near the end and Time up at zero. |
| **Show countdown** | A full-screen countdown before the show. At import, choose how Clock counts: from its time, or to a set time such as 18:00. |
| **Quiz** | Type the question and answers, choose the correct answer, then Take. Select answer, Lock it in and Reveal correct run the round. |
| **Game rules** | A full-screen card with a Title and Rule 1 to Rule 5. |
| **Be back soon** | A full-screen break card. Retype Title for a technical problem. |
| **Scoreboard, 2 players** | Change team names. +1 and -1 change each score; +1 shows that team's flash. New game resets the scores. |
| **Scoreboard, 4 players** | The same controls for four players along the top of the screen. |
| **Winner** | A centred card with Title, Name and Subtitle. Choose an entrance such as Pop when you import. |
| **End credits** | Paste the list in playout: the show title first, then one role per line, such as `Camera: Kim Park, Jo Berg`. The two-column design puts roles on the left. |


---

## Layer names

From the top of the Layers panel. A number or letter after a space says which row a part belongs to.

| Template | Text | Moments | Board |
|---|---|---|---|
| **Lower third** | `Name`, `Role` | none | `Panel`, `Role box` |
| **Game timer** | `Title`, `Clock` | `Timer bar` (visible), `Warning`, `Paused`, `Time up` | `Panel`, `Track` |
| **Show countdown** | `Title`, `Clock`, `Subtitle` | none | `Panel`, `Clock box` |
| **Quiz** | `Question`, `Answer A` to `Answer D` | `Selected A`, `Correct A`, `Wrong A` per answer; `Locked in` | `Question box`, `Answer box A`, `Letter box A`, `static:Letter A` |
| **Game rules** | `Title`, `Rule 1` to `Rule 5` | none | `Panel`, `Accent`, `Rule box 1`, `Number box 1`, `static:Rule number 1` |
| **Be back soon** | `Title`, `Subtitle` | none | `Panel`, `Accent` |
| **Scoreboards** | `Team 1`, `Score 1`, and so on | `Flash 1`, and so on | `Team box 1`, `Score box 1` |
| **Winner** | `Title`, `Name`, `Subtitle` | none | `Panel`, `Title box`, `Confetti` |
| **End credits** | `Show title`, `Credits`, `Credits 2`… | none | `Panel`, `Accent` |

Moments items except the timer bar are hidden groups: show one with its eye icon, edit it, hide it again before saving. Fixed words on the Board start with `static:`.

## Make it your own

- **Colours**: select every shape of one colour with Select > Same > Fill Color, then pick a new colour.
- **More or fewer players**: in the 4-player scoreboard, select one player's `Team box`, `Score box`, `Team`, `Score` and `Flash` and copy them. Rename the copies to the next number, such as `Team 5` and `Score 5`. Delete a player's five parts to remove them. For more than five players, make each player narrower so the row still fits the screen.
- **More or fewer rules**: copy a rule's `Rule box`, `Number box`, `static:Rule number` and `Rule` text, and rename them with the next number.

## Numbers and clocks

Scores and clocks are one live text each: `Score 1` shows `0`, `Clock` shows `1:00`. Do not split digits into separate texts. Keep the plate behind a score wide enough for three digits, and the clock plate wide enough for the longest time you need.

## Animation

Imported SVGs carry no animation of their own: NoaCG adds the entrance and exit you pick at import, such as Fade or Pop. The winner's confetti is drawn. Names here are made up.
