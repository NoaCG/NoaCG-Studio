# Handing in a record instead of saving

Only when the host you work for saves the graphic itself and asks you to hand in a record (a
container, a bench). The host names the folders; this file says how. Never run `noacg save` or
`noacg login` there.

1. Make the graphic with the loop (steps 1 to 4 of SKILL.md) until `noacg validate` reports no
   errors and you would air it.
2. `noacg coverage <graphic> --out <coverage folder>` writes every frame worth looking at, `coverage.json` (what each frame shows) and `review.json` (every frame, each with an empty
   verdict). A `-strip` frame is one timeline (the Take, an action, Next, the update, Out): its
   moments left to right and down, the time under each; the state an action, a step or the
   update ends in is also a full frame of its own. When it ends with a `Finding:` (an
   action the machine ignores, or one that shows no change on screen), fix the sources and run it
   again before you review: a viewer sees nothing when the operator presses that button.
3. Open every frame `review.json` lists, one at a time, and only then set its verdict: `ok` when
   you would air that frame as it is, every moment of a strip included. When one shows something you would not air, fix the
   sources, validate, and run coverage again into the same folder: that writes a new
   `review.json` for the new version. A frame that looks exactly as when you closed it keeps its
   verdict, marked `carried`; every other frame is empty again, and you open each of those before
   you set it. On it, `fixed: <what>` is the verdict for a frame that now shows the fix. Any other
   verdict leaves the frame open.
4. `noacg record <graphic> --out <record.json> --review <coverage folder>/review.json`. It refuses
   while a frame has no verdict or an open one, or when the graphic changed after its coverage,
   and says which. Nothing is handed in until it passes; the last record is what the host takes.
5. End with one line: `DELIVERED`, or `NOT READY: <why>`.
