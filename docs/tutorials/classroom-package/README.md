# Make your own show graphics

Five graphics for one quiz show. Open them, copy them, make them yours, and run them live in NoaCG.

## What is in the folder

- **Illustrator**: the five files you open and change.
- **SVG**: the same five, saved for NoaCG. Import these first to see how it works.
- **Previews**: a picture of every graphic, and of every look the quiz and the score can have.
- **credits-english.txt**: the English credits under Credits to paste, ready to copy.

## Make your own

- Open a file from the Illustrator folder.
- Change the colours, fonts and shapes as much as you like. Keep the layer names. The next page lists them for every graphic.
- Pink text in Illustrator means the font is missing. Install Oswald from fonts.google.com.
- Save: File > Save a Copy > SVG. Tick "Use Artboards". In SVG Options, keep Font on SVG and press OK.
- Go to noacg.studio/app, press New graphic, then Import graphic, and drop in your SVG.
- Put all five in the same production. Then run the show from the production's page.

## On air

- **Show intro**: type the Title and Subtitle. Take, then Out.
- **Name tag**: one graphic for everybody. Type the Name and Role and press Take. Type the next person and press Update.
- **Quiz**: type the question and four answers, pick the correct one, Take. When a player answers, click their letter under Selected answer, then press Select answer, Lock it in and Reveal correct.
- **Score tracker**: type both names. +1 and -1 change the score.
- **End credits**: paste the whole list into one field. A line ending in ":" is a title, and the names go under it. Take, and it rolls.

## Credits to paste

The credits file already holds the Finnish list. Here is the same crew in English. Copy it from credits-english.txt, not from the PDF. A PDF loses the empty line before "Quiz Night 2026", and that line then rolls as a second producer. Paste it and change the Heading to CREDITS. "Title: Name" on one line works too, and an empty line starts a new part.

```
Host: Maija Meikäläinen
Guests:
Ville Virtanen
Aino Aalto
Camera:
Eero Eskola
Liisa Lahti
Pekka Peltola
Floor manager: Olli Ojala
Vision mixer: Sanna Salo
Production assistant: Riikka Rinne
Sound: Timo Toivonen
Lighting: Kaisa Koski
Vision engineer: Heikki Honkanen
Graphics: Jussi Järvi
Set design: Noora Nurmi
Make-up: Mira Mäki
Director: Anna Anttila
Producer: Mika Mäkelä

Quiz Night 2026
```

The names are made up. The people in the studio come first, then the crew, and the director and the producer last.

---

## Layer names

NoaCG reads the names in the Layers panel, so every graphic uses the same three layers. From the top:

- **Text** is what you type on air. Name each text for what it is.
- **Moments** are hidden groups. NoaCG shows each one at its moment. A graphic with no moments has no Moments layer.
- **Board** stays as drawn. `Panel` is the background. A plate under a text is that text's name plus "box". Fixed words start with `static:`. Any other shape can have any name.

A letter or a number after a space says which row a name belongs to: `Answer A`, `Score 1`. Every name is in English.

| Graphic | Text | Moments | Board |
|---|---|---|---|
| **Show intro** (title) | `Title`, `Subtitle` | none | `Panel`, `Title box`, `Subtitle box` |
| **Name tag** (lower third) | `Name`, `Role` | none | `Panel`, and `Accent`, a decoration with any name |
| **Quiz** | `Question`, `Answer A`, `Answer B`, `Answer C`, `Answer D` | `Selected A`, `Correct A`, `Wrong A` for each letter, and one `Locked in` | `Question box`, `Answer box A`, `Letter box A` and `static:Letter A` for each letter |
| **Score tracker** (scoreboard) | `Team 1`, `Score 1`, `Team 2`, `Score 2` | `Flash 1`, `Flash 2` | `Team box 1`, `Score box 1`, `Team box 2`, `Score box 2`, and `Middle`, a decoration |
| **End credits** | `Heading`, `Credits` | none | `Panel`, `Credits box` |

- **Quiz.** `Selected A` shows while A is the pick and `Locked in` once you lock it. If B is right, the reveal shows `Correct B`, `Wrong A`, `Wrong C` and `Wrong D`. Two to six answers, A to F.
- **Score tracker.** `Flash 1` shows when team 1 gets a point. Add a hidden `Full time` group and the Full time button shows it. Two to eight teams.
