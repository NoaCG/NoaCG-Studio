# One press of several batches is numbered at the press; a superseded send says so (D-t, D-e)

2026-09-30, preview branch B. Never production.

## What ran

Job j-2558, test "an All out in two batches never undoes a Take pressed while it was on its way"
in `e2e/configured/command-sequence.spec.ts`, with this branch's app (abb6c01). It drives the
operator page's own send module (`sendControlVerb`, `sendControlVerbs`), so the press numbers and
bases are the page's; the graphics L1 to L7 are names only (the send checks the verb, not the
rundown).

1. Five graphics, L1 to L5, put on air in one press.
2. All out over the five: two batches (four layers, then L5). Every attempt of the first batch was
   held in the browser. While it was held, the page re-took L5; that send landed; then the hold
   was released.
3. A Take of L7 was held; an All out of L7 (which never queues) landed first; the hold was then
   released, and the held Take reached the server after the All out.
4. The head read back through `control_show_resolve`.

Job j-2563: the same test with `sendControlVerbs` numbering each batch as it leaves (mutation).

## What was observed

- Passed. The All out answered `skipped: ["L5"]`: its second batch, numbered at the press, was
  older than the re-Take, so the server left L5 on air. The re-Take answered `superseded: []`.
- The held Take of L7 answered `superseded: ["L7"]`, which is what the production page reads to
  keep from marking L7 on air after the All out marked it off.
- The head: L5 on air; L1 to L4 and L7 off.
- Mutation (j-2563): with each batch numbered as it leaves, the test failed where the fix says it
  must: the All out answered `skipped: []`, so its second batch took the re-Taken L5 off air.

## Limitations

- Driven through the send module, not through the production page's buttons: that the page skips
  its chip write on `superseded` is read in the code (`takeGraphicCue`, the Out verbs, the folder
  Out, the combined press), not watched on screen.
- One interleaving of each kind, on one operator page.
