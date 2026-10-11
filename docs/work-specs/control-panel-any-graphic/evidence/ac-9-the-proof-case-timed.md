# AC-9 - the proof case runs from prompt to dashboard, timed, with the profile in use

**Verdict: pass, across two walks.** The authoring, the composition and the in-app minute were
walked by hand on 2026-09-16 and timed; the publish and the operator's minute on the HOSTED control
page - the half that failed this criterion - ran in CI on the same day, timed on the server's own
clock. Re-reviewed at `0079711f8557a3d9db8cd956c7b54533a395ffd1`.

## Why this took two walks, and what the second one is

The first walk could not publish. A linked worktree carries no backend configuration, the only
`.env.local` on that machine held a Vercel token, and the alternative was the session signing in as
the owner - which it would not do. So the profile was composed, driven and timed on the in-app
production page, and the hosted page, which is the surface the show is run from, was left
unwitnessed.

The second walk is `e2e/configured/hosted-control-profile.spec.ts`, in the configured suite: a
runner that brings up its own Supabase stack and creates its own throwaway account, so it can
publish and drive the capability URL without touching anything of the owner's. That is a different
instrument from a person at a keyboard, and the limitations section below says exactly what it
therefore cannot see.

## The clauses, and where each is met

| What AC-9 asks | Where |
|---|---|
| Both graphics made through the CLI against the shipped skill | walk 1 - 32.6 s of tool time for the seven authoring verbs, 0 errors each |
| Saved or imported | both - `noacg pack`, then the Import door |
| One production, combined control composed in the room's minute | walk 1 - about 4 s per step once the form is familiar; six steps in 100 s, most of it finding the way around the form |
| **Published** | walk 2 |
| **The operator's minute (§3c) driven from the hosted control page** | walk 2 |
| Each step timed | walk 1's stopwatch; walk 2's four wall clocks below |
| The numbers in an owner-queue item with the route | [`docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md`](https://github.com/NoaCG/NoaCG-Studio/blob/1a017c93652405537d8d2d327c6d6ccaed4fe935/docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md) and `2026-09-16-a-profile-driven-where-the-show-is-run.md` |
| What the walk finds is fixed if small or filed if not | walk 1 fixed migration 0060 and filed the scrolling defect; walk 2 filed [`docs/backlog/a-renamed-control-still-wears-its-section-in-a-combined-step.md`](https://github.com/NoaCG/NoaCG-Studio/blob/811c09c95746abc7c17506f40ab4a29e776e3d9b/docs/backlog/a-renamed-control-still-wears-its-section-in-a-combined-step.md) |

## Walk 2's numbers

`configured-suite` run `35062005497` on `claude/hk-hosted-half-configured`: **43 tests, 43 passed, 0
failed, 0 flaky, 0 skipped.** The walk itself took 19.2 s end to end, of which:

- **publish 0.3 s** - the press to the production reading SHOW;
- **both cues on air 0.4 s** - two selects and two Takes on the hosted page;
- **combined press to its last row 6.0 s**, of which **5.0 s is the wait the production
  asked for**;
- **bound +1 to its row 0.1 s** - the press to the tree's own update row coming back.

Read these as a floor rather than as a prediction. The local stack answers in about a millisecond
where a hosted project answers in about two hundred from a runner, which is why the publish reads
at a fifth of a second here and took about five in the owner's own cloud during walk 1. What the
figures do establish is that nothing in the profile road adds a wait of its own: the only delay in
the minute is the one the production asked for, and it is measured on the server's clock across two
log rows rather than on a browser's.

## The minute, as it was driven

Import the pack; write the bindings and the profile; publish; open `?control=<slug>` signed out;
take the votes board; take the totals board; read the arranged ⚡ block; press the combined control
and stand its tail down while it counts; untick the panelist who guessed wrong and press again;
press `+` under the bound points. Every one of those is a gesture in today's dashboard, and the
profile is in use throughout - ARRANGE on the block, COMBINE on the button, a binding under the
stepper.

## Limitations worth carrying

- **No person has looked at the rendered hosted page with a profile on it.** The spec asserts
  structure and text - the pinned block precedes the sections, the disclosure reads "More (1)",
  the countdown carries its figure - and that is a great deal more than nothing, but "above the
  fold" is a visual claim about a phone screen and this instrument cannot make it. The owner-queue
  item is the three-minute route for the eye that can.
- **Two operators and the batch cap** are still unwalked anywhere (`docs/CONTROL_LAYER.md`
  live-verify step 10). One spec holds one page.
- **The composer was not used in walk 2.** The profile was written through `setShowProfile`, which
  is byte-identical to a composed one because it is the same canonical serializer, and the
  composer's own minute is walk 1's number. What walk 2 proves is what the hosted page does with a
  PUBLISHED profile, which is the half that had no witness.
- Walk 1's own limitation stands where it is not superseded: it drove the in-app page against a
  dev server, and its authoring numbers came from `@noacg/cli@0.3.2` against the deployed studio
  rather than from the branch.
