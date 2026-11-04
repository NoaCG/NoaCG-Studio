# Editable credits

Open `SVG/editable-credits.svg` in Illustrator, Inkscape or another SVG editor. The SVG is the editable source, authored by NoaCG; it is not an Illustrator export. The PNG in `Previews/` is only a preview. Import the SVG to keep the text editable.

The drawing supplies the styling. The production supplies one list of roles and names, which the operator can replace without reopening the drawing.

## Draw your own

1. Use a 1920 by 1080 artboard. Draw only a short sample; the full credits need not fit on the artboard.
2. In a layer named `Text`, make each role and each name its own one-line text object. Click once with the Type tool for each line. Keep live text; do not outline it or put the whole list in one text box.
3. Name the first role `Credits`. Name each later line `Credits 2`, `Credits 3`, and so on, from top to bottom. An optional show title is `Heading`.
4. Give every role the same look, and every name another. This example uses Oswald Bold 30 in yellow for roles and Oswald Regular 40 in white for names. Fonts, colours and sizes are yours to change; keep the two looks consistent.
5. Put each role above its names. Centre all lines on the same axis, as here, or align all lines on one edge. A role can have several names. You can also draw roles beside names, using one aligned column for each.
6. Put a background in a separate `Board` layer, named `Panel`. No background is required. Do not add a `Moments` layer or a box around every credit line.

In Illustrator, rename text objects in the Layers panel and use **File > Save a Copy > SVG**, with **Use Artboards** enabled and text kept as text. In Inkscape, use **Layers and Objects** to name objects and save as SVG. The object labels in this source are the names NoaCG reads; keep them when editing. Import the saved file and check its layer names before finishing.

## Import and play

1. Import `editable-credits.svg`. On the Fields step, choose **Credits roll** and pick the first role (`Director`) as the Credits text if it was not picked automatically.
2. Check **Credits preview**: Director has Alex Rivera, Producer has Sam Lee, and Camera has Kim Park and Jo Berg.
3. Keep **Show as: Editable, in this design's styling**. Choose **Plays as: Roll**, **Hold still** or **Cards**. Save the graphic into a production.
4. On **Playout**, select its cue and paste the list into the **Credits** field. You can paste lines from a text file directly, or use **Fill from…**, **Paste rows** for spreadsheet rows.

```text
Director: Alex Rivera
Producer: Sam Lee
Camera:
Kim Park
Jo Berg
```

A colon ends a role; the following lines are names. A tab can replace the colon when pasting from a spreadsheet. A blank line starts a new section, or a new card when playing cards. A plain list of names also works.

Take starts the roll; **Out** clears it. **Scroll speed (%)** changes its pace. A roll or cards already on air keep the list their Take took: re-take to play a replacement list from the start.

For a linked list, use the graphic's **Connect data…** on Playout and connect a Google Sheet, mapping the role and name columns to Credits. This is an existing supported source. A local `.txt` file can be opened and pasted; this example does not automatically watch that file for changes.

## Fixed artwork is a separate choice

Choose **Show as: Fixed artwork** only when you want the exact drawn text layout to scroll as one block, with names changed in the drawing. The existing `end-credits.svg` demonstrates that workflow. It is separate from these editable credits. A PNG preview or a tall bitmap is not an editable credits list.
