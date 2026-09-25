# src/templates/poll - the LIVE VOTE board

## poll/ - the LIVE VOTE board

the LIVE VOTE board (prefix 'poll'): the poll while it is happening, as against the
`poll` graphic TYPE in the infographic category (ig02/ig11/ig12/ig13), which is the finished
result chart. pl01…pl05 + pollPresets ('poll-open') + **pollMotion.ts**. Data-driven like
tickers: a hidden #f1 textarea holds "Label | count" lines and the runtime renders the rows, so
the bar widths AND the row count are the operator's content - measured motion, in
`pollBarsGrow`. The result is a real middle step carrying that builder; the VOTE NOW badge
leaving and the figures arriving are ordinary keyframes, so a snap straight to the result shows
the result. Only the winner CALL is a lifecycle call (which row wins depends on the counts, so
it has no fixed target - the quiz reveal's posture). A tie calls nobody and says so.
**pl05 "Floor Vote" is the one that is NOT a card**, and its two overrides are worth knowing
before drawing another band here: the assembler caps every poll panel's `max-width` at 46% of
frame, which is right for a mid-left card and silently beat pl05's declared 1560px stage -
leaving the chart column no width and no visible bars at all - and `.poll` sets
`text-align: center`, which a band reading from its left edge does not want. Its rows are a
three-column grid (label, track, figure) rather than the category's label-over-bar stack, so
the label column is FIXED: a chart whose bars begin at different x cannot be compared at a
glance, which is the only thing a vote board is for.
