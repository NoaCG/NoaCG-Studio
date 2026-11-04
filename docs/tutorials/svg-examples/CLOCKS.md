# Draw a clock or timer

Open `SVG/digital-clock.svg` for a standalone clock, or `SVG/scorebug-clock.svg` for a score tracker with a clock beside it. These are editable SVG sources, created directly as vectors and live text. Open them in Illustrator, Inkscape or another SVG editor; no Illustrator source file is needed. Save a copy to make a reusable design of your own.

## Draw the time

Use a 1920 by 1080 artboard. From the top of the Layers panel:

- **Text**: one live text object named **Clock**, showing `12:00` (minutes and seconds).
- **Moments**: omit this layer for a simple clock. The score example keeps hidden `Flash 1` and `Flash 2` groups for score changes.
- **Board**: the background, named **Panel**, plus any decoration. A separate plate beneath the time is named **Clock box**.

Use point text: click once with the Type tool and type `12:00`. Keep the minutes, colon and seconds in that single text object. Do not split digits into separate objects, convert them to outlines, or export the numbers as a picture. NoaCG replaces this text as time passes. Choose a typeface with tabular figures and leave room for the longest time you expect.

In Illustrator, open Window > Layers, expand **Text**, and rename the actual text object to **Clock**. Inkscape users can open the Layers and Objects panel and set that object's label to **Clock**. The source SVG also carries matching ids, so plain SVG editors can preserve the same names.

The score example adds `Team 1`, `Score 1`, `Team 2` and `Score 2` text objects. Its hidden score flashes belong to **Moments**; team, score and clock plates belong to **Board**. The clock is an independent part, so the scores do not determine how it counts.

## Export and import

In Illustrator, use File > Save a Copy > SVG, enable **Use Artboards**, and retain SVG text rather than outlining it. In Inkscape, save as SVG and preserve the object labels. Keep the named groups and hidden moments. The source has no embedded script or running clock: NoaCG adds that behavior during import.

Choose New graphic > Import graphic and drop the SVG. The `12:00` sample offers **Clock**. Choose what it does explicitly:

| Clock choice | Result |
|---|---|
| **Counts down from its time. Starts on Take, holds at zero.** | A duration timer. `12:00` starts a twelve-minute countdown when you Take it. Start resumes, Pause holds and Reset restores its length. |
| **Counts up. You start it.** | Elapsed time. Set the starting value you want, Take, then press Start. Pause holds and Reset returns to its starting value. |
| **Counts down to a set time.** | A countdown to a date, local time and time zone. Set those at import; there is no Pause or Reset for a fixed target. |

For a duration, start with `12:00` or any other minutes-and-seconds sample you need. For an elapsed clock, draw `0:00` if it should start at zero. The word **Clock** and a time-shaped sample identify the readout; neither silently chooses its direction. Check the preview, finish the import and add the graphic to a production.

The existing `countdown.svg` demonstrates the older full countdown behavior with a progress bar and warning moments. It remains available; a simple timer uses the Clock duration choice above.

## Other clock faces

You can change the digital clock's frame, typeface and colors, or draw a circular face around the same live **Clock** text. The current imported clock updates digital text only. Hands drawn on an analog face stay fixed: naming a hand does not make it rotate. A working analog countdown needs runtime support beyond these examples.

## Previews

The PNGs in **Previews** show the source artwork at 960 by 540. They are reference pictures; import the SVG, not the PNG, to get live time.
