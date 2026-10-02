# The written rubric

Two reviewers, neither of which built a cell, each a fresh Opus subagent. The quality reviewer is
blind to the arm; the opt-in reviewer is not, because its question is about the arm.

## Quality reviewer (blind), per cell

It gets, per cell, under a brief name and a random letter: `cli-onair-video.jpg` (the CLI's
on-air frame over its video-like ground), `cli-stress-video.jpg` (every text doubled),
`studio-sheet.jpg` (every studio PROGRAM frame of the walk, labelled, plus the stress frame),
`panel-at-load.jpg` (the Playout page at 1600x900 as it opens), `reach.json` (which live controls
are on screen at load) and `inspect.txt` (the operator surface), plus the six briefs.

1. **Premium: would it air on a paid channel as it stands?**
   - **yes**: a paid channel's graphics desk would air it unchanged; it fits the brief's tone and
     looks made for this show, not taken from a template.
   - **borderline**: airable and competent, but generic or with one visible flaw a designer would
     fix before air.
   - **no**: a visible defect on air (clipping, a broken or wrong state, illegible text, lost on
     its ground) or an amateur look.
   One or two sentences, each pointing at a named frame.
2. **Operable: does the live operator reach every live action without scrolling or typing a
   label?** Live actions are Take / Update / Next / Out, every declared action button and every
   live-number stepper the show uses on air. **pass** if all of them are on screen at load
   (`reach.json`, `panel-at-load.jpg`) and no routine live change needs typing a label (retyping
   "Question 7", typing a period word). Typing content (a name, a question) is not a label.
   **fail** names what is below the fold or typed.
3. **Behaviour seen in the frames**: does each state the walk pressed show what the brief asks?
   **ok** or the issue, with the frame.
4. **Rank within the brief**: the three variants, best first, on premium.

## Opt-in reviewer (not blind), per cell of the two opt-in arms

It gets the cell evidence above under the real names, the D cell of the same brief, each
builder's condensed report (what it claims), `opened.json` (what the builder's transcript shows
it opened) and the two opt-in files themselves.

- **Critique arm (C)**: (a) did the transcript open `critique.md` and not `design-notes.md`;
  (b) per change the critique claims, is it visible in the after frames (shown / partly / not
  shown); (c) is the after better, the same or worse than the D package on the premium question;
  (d) did it break anything the D package did.
- **Guidelines arm (G)**: (a) did the transcript open `design-notes.md` and not `critique.md`;
  (b) do the frames follow the guideline rules the builder cites, checked against
  `design-notes.md` (and the package CSS where a frame cannot show a number); (c) does the G
  cell differ from the D cell in the ways the guidelines claim to steer (sizes, one accent,
  safe area, motion), or would the two be indistinguishable.
- **Default arm (D)**, mechanical: `opened.json` shows neither opt-in file.
