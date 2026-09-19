# The practice library

Layered SVGs a student can drop into the Import door, and then keep working on in Illustrator.
One file per KIND of graphic the catalog has, so practising the import road is practising the
whole road and not one lower third twenty times.

Drop one at `/app` → **New graphic** → **Import graphic** → the drop zone. The rules every file
here obeys are in [`../SVG_AUTHORING.md`](../SVG_AUTHORING.md); this folder is that page with the
files attached.

**Not the corpus.** `e2e/fixtures/svg-corpus/` is a measured set of files carrying real exporters'
mistakes, with an expectation sidecar each and a gate over it. These are teaching files: they are
correct on purpose, they are pretty on purpose, and a student is meant to open one and change it.

## What each file teaches

| File | Graphic kind | The one lesson |
|---|---|---|
| `lower-third.svg` | Lower third | the plain happy path - three live text layers, named |
| `sticker-lower-third.svg` | Lower third | a catalog look rebuilt by hand: a stroked panel that grows, and a hard shadow drawn as two strips so one widens and the other travels. The worked example in `SVG_AUTHORING.md` section 6b |
| `illustrator-export.svg` | Lower third | the exporter's own habits: PostScript font names, a kerned headline, two labels on one baseline, a repeated layer name, a switched-off draft |
| `outlined-title.svg` | Full-frame title | text converted to outlines (the fallback road) beside one live text layer |
| `scorebug.svg` | Scoreboard | every field type the import can propose - number, countdown, picture, `f:` prefix, two labels placed apart on one baseline |
| `quiz-board.svg` | Quiz | drawn behaviour states: hidden layers are the moments, and the words are painted last |
| `info-card.svg` | Info card | a card whose LAYOUT is the design - centred lines, so the too-long answer is shrink; the standfirst is ONE layer, not one per line |
| `ticker.svg` | Ticker | a strip that runs edge to edge has no room to grow, and the kicker block is furniture |
| `end-credits.svg` | Credits | one text layer per LINE, named for what the line is, so the rundown reads back |
| `corner-bug.svg` | Corner bug | a SMALL artboard imports as a free-floating object the zone picker places |
| `starting-soon.svg` | Holding screen | a clock-shaped sample offers a countdown whose field is its length in minutes |
| `game-timer.svg` | Game-show timer | a centred readout is composed against its middle, so it must not grow |
| `alert.svg` | Alert | the shape that gets growth by default: stacked, start-anchored lines in one wide panel |
| `public-info.svg` | Public information | two languages are two objects and two fields; each language's notice is one layer, whatever it takes in lines |
| `infographic.svg` | Infographic | a plain figure proposes a number field; the bar behind it is artwork |
| `versus.svg` | Versus card | two names composed against a centre - the layout must hold, so no growth |
| `matchup.svg` | Match-up | a drawn state is a layer you switch OFF; the import offers it because it is off |
| `frame.svg` | Camera frame | the hole stays transparent - it is drawn with the fill rule, not a white rectangle |
| `esports-score.svg` | Esports scorebug | repeated drawn states that name their row arrive already bound |
| `results-board.svg` | Results board | many rows mean systematic names, plus one drawn state for the leader |
| `reveal.svg` | Reveal | the reveal is a state the designer draws, not a colour the software invents |
| `poll.svg` | Live vote | percentages are number fields and the bars are artwork |
| `audience.svg` | Audience question | the question is ONE layer with a break in it, and there is vertical room for NoaCG to re-wrap it into |
| `stream-notification.svg` | Stream notification | an event toast is a floating object, and its event kind is a field too |

**One catalog kind has no file here: transitions.** A stinger is motion over a cut; there is
nothing in the artwork to bind, so a sample would teach nothing about importing. Draw the frame
you want it to wipe from and add the motion in the Animation step.

## Checking them

```bash
node scripts/svg-samples-check.mjs
```

It runs the real importer (`src/assets/svgImport.ts`) over the folder and prints what each file
offers. It also reads each file the way a DESIGN APP would open it - the artboard it states, the
rows its Layers panel will show and whether they are named, whether its pictures are embedded, and
whether it carries markup Illustrator or Inkscape warns about - because "they open in Illustrator
so you can keep working on them" is a promise these files make and nothing was measuring it.
An instrument, not a gate - `--fail-on fail` makes it one. Measured 2026-09-01:

```
file                 verdict  size        fields  num  clock  pics  outl  states  panels
-----------------------------------------------------------------------------------
alert                pass     1920x1080        3    0      0     0     0       2       4
audience             pass     1920x1080        2    0      0     1     0       2       3
corner-bug           pass     320x120          2    0      0     0     0       2       2
end-credits          pass     1920x1080        5    0      0     0     0       2       3
esports-score        pass     1920x1080        4    2      0     0     0       5       4
frame                pass     1920x1080        1    0      0     0     0       1       3
game-timer           pass     1920x1080        2    0      1     0     0       2       1
illustrator-export   pass     1920x1080        4    0      1     0     0       4       2
info-card            pass     1920x1080        3    0      0     1     0       2       4
infographic          pass     1920x1080       10    4      0     0     0       3      10
lower-third          pass     1920x1080        3    0      0     0     0       2       2
matchup              pass     1920x1080        4    0      0     0     0       4       4
outlined-title       pass     1920x1080        1    0      0     0     1       1       2
poll                 pass     1920x1080        9    4      0     0     0       5      12
public-info          pass     1920x1080        4    0      0     0     0       2       3
quiz-board           pass     1920x1080        5    0      0     0     0      19       6
results-board        pass     1920x1080       21   12      0     0     0       4      10
reveal               pass     1920x1080        4    0      0     0     0       6       6
scorebug             pass     1920x1080        7    2      1     1     0       3       3
starting-soon        pass     1920x1080        3    0      1     0     0       2       2
stream-notification  pass     520x140          2    0      0     1     0       2       2
ticker               pass     1920x1080        2    0      0     0     0       3       7
versus               pass     1920x1080        4    0      0     2     0       2       5

23 samples: 23 pass, 0 partial, 0 fail.
```

Three files lost a field that day and gained nothing: `audience`, `info-card` and `public-info`
each drew a paragraph as one text layer PER LINE, which is the structure the authoring page now
tells designers not to draw - a semantic item is one field, and NoaCG re-wraps it. The check also
found two text objects nobody had named (`scorebug`, `illustrator-export`), which open as rows
labelled `<text>`; both are named now.

Parsing is not the whole road. Every file here was also walked through the real app on 2026-08-30
- the drop zone, the mapping step, Finish and the export gate - and all 23 imported, offered
exactly the fields their artwork draws, previewed with their drawn elements intact and passed the
export gate with no console error. Two of them, `alert.svg` and `audience.svg`, were the shape that
proposes panel growth without asking; the other twenty-one correctly kept their layout and shrank.
The 2026-09-01 edits above have not been re-walked through the app, only re-measured by the check.
