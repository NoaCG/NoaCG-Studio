# src/templates/competition - the competition pack

## competition/ - the COMPETITION PACK

the COMPETITION PACK (docs/COMPETITION_PACK.md): 38 designs, 12 graphic
types, FOUR categories over ONE self-assembler (`competition/shared.ts`) - esports/ (prefix
'esports-score': es01-es04 series scorebugs + mr01-mr03 map/round indicators), matchup/
(prefix 'matchup', full-frame: mu01-mu04 match-ups with a winner pick, h201-h203 head-to-head
comparisons, pc01-pc03 player cards), results/ (prefix 'results-board': rs01-rs03 rosters,
st01-st04 standings/leaderboards/result tables, br01-br02 brackets), reveal/ (prefix
'reveal', full-frame: nm01-nm03 nominee reveals, vd01-vd03 verdicts, wn01-wn03 winner cards,
aw01-aw03 award/launch reveals). Like infographics the DESIGN owns its fields + runtime; the
TYPE owns the machine. Contract: `.{prefix}-box` > `-head` + `-accent` + `-body`, which is
exactly what compPresets.ts tweens (comp-rise / comp-impact / comp-bloom / comp-cascade - one
prefix-parameterized bank for all four categories, cascade STRUCTURAL because it names a
measured builder). compMotion.ts holds those builders (compCascade composes compBarsGrow).
**THE PACK'S RULE:** the moment is a state, what it is about is DATA - one `selected` state
plus a `winner` field, one `judged` state plus a `verdict`, one `spotlight` plus a row number.
A design whose Continue press fires a runtime call declares `revealSteps`, which is what keeps
SPX's `steps` DERIVED (the quiz precedent).
**What counts as a LINE is `visibleTextFields`, not the ftype**: a `number` field is a line
when it is drawn in a mask (the series score) and is not one when its element is a
`.noacg-data-source` holder (the map index, the highlighted row, the phase words). Filtering
on `ftype === 'textfield'` conflated the two and dropped a field from the layer list the
moment it stopped being typed as text.
