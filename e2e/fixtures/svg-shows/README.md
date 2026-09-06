# The game-show and late-night corpus

Six graphics American game shows and late-night talk shows put on air with operator commands
during the show, drawn the way a student would draw them for `docs/SVG_AUTHORING.md` §5b: the
base look visible, every moment a hidden layer named the plain way, `show:` and `choice:` where a
switch or a choice fits, nothing else prefixed. The pick and the reason for each are in
`docs/SVG_BEHAVIOUR_SHOWS.md`, with the outcome of importing each one.

They sit beside `svg-corpus/` rather than in it because that corpus answers a different question
(does the import road read what each exporter writes) and sweeps every sidecar it finds. These
files are driven by `e2e/import-svg-behaviour.spec.ts`, which walks each one through the wizard
and the operator's controls.

| File | The show | What the operator does live |
|---|---|---|
| `survey-board.svg` | Family Feud | reveal answer 3, strike, clear strikes, reset |
| `top-ten-list.svg` | Letterman's Top Ten | Next, ten times, from ten to one |
| `guest-lineup.svg` | a desk show's "tonight" card | next guest, back, the segment bug, the coming-up strip |
| `puzzle-board.svg` | Wheel of Fortune | reveal letters, solve |
| `price-reveal.svg` | The Price Is Right | reveal the price, call the winner |
| `bracket.svg` | a tournament episode | advance a winner, highlight a match, crown |

Each file carries a leading comment saying what was drawn and which layers are the moments.
