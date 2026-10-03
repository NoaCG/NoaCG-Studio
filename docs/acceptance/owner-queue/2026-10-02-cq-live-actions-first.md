---
kind: desktop
date: 2026-10-02
serves: now
---
# Live actions first, on the Playout page

## What changed after your look on 2026-10-03

You said the duel score's buttons were long and the block left space unused on the right. The
⚡ block is now compact on every graphic:

- **No sentence under the heading, and one on-air status.** The state chip says where the graphic
  is ("not on air", "Enter · Counting · Live"); the red "act on air" beside it is gone. What the
  block does is in the heading's hover. **Recovery** moved into the head, beside **Arrange**.
- **Sections side by side.** Each section is its caption and its buttons on one line, and the
  sections wrap. Buttons size to their words and never break onto two lines. On a phone the
  caption goes above its buttons. Measured at 1600x900, on air: duel score 267 to 79 px tall,
  hockey scorebug 325 to 115 px (twelve buttons in two rows), answer board quiz 209 to 79 px. The
  ± Live numbers block is one row too (91 to 44 px).
- **Short labels.** The duel score reads **+1 ALEX**, **+1 SAM**, **−1 ALEX**, **−1 SAM**,
  **Final**, **Reset 0-0**. The hover still says what each press does, with the full name.
- **The name is the one on air.** It comes from what was last sent, never from an edit you have
  not sent yet, so a button cannot name a player the audience does not see. It changes the moment
  you press ✎ Update. A name change never moves a button: a named button has a fixed width, and a
  long name is cut short with "…" and is whole in the hover. An empty name reads **P1** or **P2**,
  two players with the same name read **P1 SAM** and **P2 SAM**, and player 1 is always left of
  player 2. A button you renamed in Arrange keeps your name. The activity log names the press the
  same way ("+1 SAM").
- **The other shipped graphics** got shorter labels where they were long: the football scoreboard
  reads **Goal HOME** / **Goal AWAY** from its team names, and for example "Reset to period
  start" is **Reset clock**, "Escalate to urgent" is **Urgent**, "Skip notification" is **Skip**, and an imported survey or
  puzzle board's "Take back a strike" / "Take back a letter" are **Undo strike** / **Undo letter**.
  The quiz labels stay (Select answer, Lock it in, Reveal choice, Reveal correct), they are already
  short; "Show audience result" is now **Audience result**.
- **For graphics an agent makes,** the skill now asks for a word or two per button and shows how
  to name a player (`+1 {f0|P1}`), and the validator warns on a label over 16 characters.

The hockey scorebug in the screens is an agent-made package, so its labels are its own; it got
the layout but not new words.

**Graphics you saved earlier keep their labels**, because a graphic carries its buttons inside
it. To get the new ones, add the graphic again from the catalog, or rename the buttons in Arrange.

Screens before and after, 1600x900 and phone width: `slice-4/compact-before-*.png` and
`slice-4/compact-after-*.png` in `docs/research/control-surfaces-review-2026-10-02/`.

**What to look at:** the duel score on air, then type a long name and press ✎ Update. Two choices
you may want differently: the named buttons' fixed width (about nine characters of name before
"…", so short names leave a little space), and the duel score's second section being called
**Undo** (it was "Corrections").

## The first version, 2026-10-02

You asked to keep playout simple, with live actions before setup. On the Playout page, a graphic
that declares ⚡ actions now shows them straight under the monitors, and its fields come after
them under a "Setup fields" bar that folds away. A graphic with no actions (a lower third) looks
the way it did. Pin, hide and rename moved onto the ⚡ block itself: press **Arrange**, mark the
buttons, press **Done**. The separate Controls panel is gone, and stored arrangements are
unchanged. "Snap to state" now sits folded under **Recovery** at the foot of the block.

At 1600x900 the hockey scorebug's clock and goal buttons and the answer board's Select, Lock and
Reveal buttons all show without scrolling (before: the goals and Reveal were cut by the fold).
Before and after screens, at 1600x900 and at phone width:
`docs/research/control-surfaces-review-2026-10-02/slice-4/`.

## The route, about five minutes

1. Open a production with a scorebug or a quiz. The ⚡ block is first under the monitors.
2. Take the cue and press a few actions. Then press **▾ Setup fields** to fold the fields: the bar
   reads back what the cue is set to. Press it again to open them.
3. Press **Arrange**. Pin two buttons with ☆, hide one, rename one, press **Done**. The pinned ones
   sit on the top row and the hidden one is under **More**.
4. Open a production with only a lower third: the editor is first, as before.

**What to look at.** Whether live actions on top reads right for a show, and the two decisions I
made that you may want differently:

- **The fields start open and fold only when you fold them** (the fold is remembered per graphic
  while the page is open). Folding them by themselves at Take was the other option, but on today's
  answer board the pick letter is still a field you press during the show, and correcting a typo
  on air is the other common reason to reach them.
- **Arrange has pin, hide and rename, but no drag to reorder.** Pinning is how a button moves
  nearer the hand; an order stored earlier still applies.
