# The 25 September deck contradicts the 2026-09-10 calls

Filed 2026-09-10, out of the owner's walk of `docs/acceptance/owner-queue/2026-09-09-g-the-25th-as-beats-with-a-gap-list.md`.

`docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` was generated on 2026-09-09 from
`docs/DEMO_2026-09-25.md`, and every slide's speaker notes cite beat ids from it. On 2026-09-10 the
owner changed three of the calls that file rests on. The script was updated in the same commit; the
deck was not, because it is a binary the generator deliberately refuses to overwrite
(`make-deck.mjs`: a hand edit must always win over a regeneration).

So the deck now says things the script says are wrong. It is gap-list row 13.

## What is wrong, slide by slide

**Slide 5, "on air" - the worst of the three.** It shows four playout-target panels: `OBS, on your
laptop`, `CasparCG 2.3, the URL`, `CasparCG or SPX, a file`, `An OGraf renderer`, each with its
`/docs` pointer. Call 4 now ends the day at the NoaCG player in the cloud, with no OBS and no box.
Presented as it stands, the slide instructs the room to do the thing that was just cut. The panel
data is `make-deck.mjs` lines 442-447 and the notes block below it lists all four statuses.

**Slide 3, road 1.** No mention of the small-group take-home (call 6, beat R1.7): a lower-third
quiz template and a scoreboard, drawn in Illustrator in groups, finished at home and sent in. That
is now the main piece of work the session sets, and the deck does not say it exists.

**Slide 7, the close.** It names `/docs` as the guide and says the printed index is a gap. Call 5
now asks for TWO one-page indexes, a student one that is also shared as a file and an owner running
order. The slide should name both.

## What closing it looks like

Edit `make-deck.mjs`, then regenerate. The script refuses to write over an existing file, so move
the current `.pptx` aside first and keep it until the new one has been read - that refusal exists
to protect a hand edit, and defeating it silently is what it is there to stop. The owner has not
hand-edited this deck (he has not opened it), so nothing is lost this time.

Afterwards the deck's own owner-queue item is walked as usual: he opens it cold and says whether
it is any good. Do not tick that item on the strength of a regeneration.
