# The late Take is refused by the server and never airs (AC-13)

2026-09-30, preview branch B (migrated). Never production.

## What ran

Job j-2481: the Phase 6 harness's app scenario S3 (`harness/app-run.mjs --scenarios S3 --trials
5`, session scratchpad) with `--app` pointing at this branch's worktree, through the preview-branch
wrapper with `branch-b.env`. Per trial, on `p6-harness main` with a new output and a new hosted page:
air cleared; the Take's request held 6 s in the browser (`page.route`), then continued to the
server; Out pressed 1.5 s after the Take; everything read 13 s after the Take. This is the research
§5.6 case, where before Step 2 the Take committed at 6.1 s after the Out and air ended with the
graphic up while the operator's page said "nothing on air".

The same case also runs as the second test of `e2e/configured/command-sequence.spec.ts`, which
delivers the held request with `route.fetch()` so it reaches the server whatever the page did with
it (see `configured-specs.md`).

## What was observed

| Trial | Take's answer (at about 6 s) | Output after the Out | Output at the end | Entrances | Operator's chip |
|---|---|---|---|---|---|
| 1-5 | HTTP 200, `{ok: false, refused: "superseded"}` | 0 px | 0 px | 0 | nothing on air |

- The Out (the same page's later press) committed while the Take was held; when the Take reached
  the server it was the page's own earlier press on a graphic its later press had moved, so it was
  refused as superseded and wrote nothing. No renderer can apply a row that does not exist.
- The operator's page was never told anything (0 of 5 showed a notice): its last press is what
  stands on air, and its chip already said so.
- "Told in plain words" is the other refusal: a press another screen overtook. That is the first
  test of `e2e/configured/command-sequence.spec.ts` ("<graphic> was changed from another screen,
  so air did not change.") and `two-senders-race.md`.

## Limitations

- On this branch the page's request was held by Playwright and then continued; Step 0's attempt
  deadline (landing separately) abandons an attempt at 1.5 s on the page. After that lands, this
  harness run exercises the page's abandon, and the server's refusal is exercised by the
  configured spec's `route.fetch()` delivery.
- The graphic's picture was judged by opaque pixels (0 means the stage painted nothing).
