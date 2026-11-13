# Walk: an imported quiz on the hosted road

> **STEP 1 WAS RUN AND PASSED, 2026-08-22**, against the real project on the owner's go-ahead.
> Both unknowns are answered: the drawn states cross the wire, and **boot recovery repaints
> them** — frame 4 came back pixel-identical to frame 3 apart from the debug overlay's row
> counter, so the badge and the pick both survived a renderer reboot mid-lock. The predicted
> failure did not happen. Frames are in `test-results/signed-in/imported-quiz-*`.
>
> **Step 2 is still owed** — it is the eyes-on half, and no run answers it.

**For the owner, ~15 minutes.** Everything else about the imported-quiz pilot
(`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10) is already proven and pinned. This is the one road left,
and it is the one the class actually runs on: **publish the production and drive the graphic from
the real `/output` renderer over the hosted command log.**

It cannot be run from a worktree session, which is why it is written down rather than done: the
backend credentials live in your main checkout's `.env`, and the run writes real rows to the
configured Supabase project.

---

## What is genuinely unknown here

Two things, and only the hosted run can answer either.

1. **Do the drawn states cross the wire?** Everything proven so far happens either in a document
   the app built or in an exported folder. The `/output` page is a separate renderer that has
   never seen the wizard and follows a log.
2. **Does BOOT RECOVERY repaint them?** This is the real risk and it is specific to this pilot.
   A snap replays states with callbacks **suppressed**, so the paint a state's timeline would
   have fired never runs. The drawn layers come back only because `paintQuizState()` reads the
   machine's state on the trailing `update()`. A renderer reboot mid-lock is exactly the sequence
   that finds out whether that hook is right — and the catalog quiz's own version of this defect
   (a first take that aired a graphic and put it straight back off) is why the spec beside it
   exists.

Everything else in the walk is there to get you to those two moments honestly.

## Before you start

- Run it **from the main checkout**, not a worktree — `.env` is gitignored and does not travel.
- A **local Supabase stack**, and the environment taken from it: `supabase start`, then
  `supabase status` for `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, plus `E2E_EMAIL` /
  `E2E_PASSWORD` for an account minted on it. The spec publishes, unpublishes and deletes, so
  since issue #2495 the suite refuses to start against anything but a stack of its own - a hosted
  URL in `.env` is refused rather than used, and `scripts/configured-trial.mjs` shows the same
  settings being read off `supabase status`.
- Nothing else is on the machine's browser-driving queue (the suite takes the `:queued` form).
- The branch is `claude/noacg-unfinished-jobs-18ea6e`.

## Step 1 — the automated half

```bash
npm run test:e2e:live:queued -- imported-quiz-output
```

It signs in, drops `docs/svg-samples/quiz-board.svg` on the Import door, binds the behaviour,
makes a production, **publishes it**, opens the real `/output` renderer in a second page, and
drives select → lock → **reboot the renderer** → reveal. Then it unpublishes and cleans up after
itself.

Green is a real answer to both unknowns. It writes five pairs of frames to
`test-results/signed-in/`, dashboard and output side by side.

**Copy them somewhere before you run anything else with Playwright.** `test-results/` is wiped at
the start of the next run, whichever config it uses — the frames from this walk were lost once
that way already, by an offline suite run minutes later.

| Frame | What it should show on the OUTPUT side |
|---|---|
| `imported-quiz-1-question` | the board up, nothing highlighted — the entrance is not a verdict |
| `imported-quiz-2-selected` | the amber rail on **Doha** (your "B selected" layer) |
| `imported-quiz-3-locked` | the **LOCKED IN** badge, pick still showing |
| `imported-quiz-4-rebooted-still-locked` | **the same picture as 3** — this is the one that matters |
| `imported-quiz-5-revealed` | **Santiago** green, the other three veiled |

**Look at frame 4 next to frame 3.** A green run with a frame 4 that has lost the badge or the
rail would mean the assertions are watching the wrong thing, and that is worth knowing more than
the tick is.

## Step 2 — the half no test can do

Do this by hand, because it is the claim I cannot verify for you.

1. `npm run dev` in the main checkout, sign in, open `/app`.
2. Drop `docs/svg-samples/quiz-board.svg` on **Import graphic**, and go to the **Fields** step.
3. **Read the "What it does" section without me explaining it.** Is it obvious what it is asking?
   Would a second-year student know what "Picked / Right / Wrong" mean against their own layers?
   Everything there is prefilled because the sample names its layers the obvious way — change one
   picker to a wrong layer and see whether the mistake is visible.
4. Finish into a production, publish, and open the output URL **in a real browser source** (OBS,
   or just a second window) rather than in the app's monitor. Drive it from the control page on
   your phone.

The question is not whether it works — step 1 answers that. It is whether the mapping step reads
as **usable without training**, which is the standard the whole road is held to.

## If it fails

- **The renderer never lights up** (frame 1 blank, opacity poll times out) — the wire, not the
  behaviour. Check the production actually published (`SHOW`, not `NOT PUBLISHED`) and see
  `docs/CLOUD_PLAYOUT.md` §3.
- **Frames 1-3 good, frame 4 loses the states** — this is the predicted failure. The drawn layers
  are not being repainted after the snap; `paintQuizState()` in
  `src/templates/importedDesign/quizBehaviour.ts` is where it lives, and the catalog quiz's
  `paintQuizState` in `src/templates/quiz/shared.ts` is the working reference for the same
  problem, including its paint-signature guard.
- **Frame 5 marks the wrong row** — the answer key is `f5`, the pick is `f6`; check the segmented
  pickers landed on C and B respectively.
- **Anything about sign-in, publishing or slugs** — not this pilot. `docs/CLOUD_PLAYOUT.md` and
  the neighbouring `quiz-output.spec.ts`, which walks the catalog quiz down the same road.

## What this does NOT cover

Deliberately, so nobody reads more into a green run than it earns:

- **Real playout hardware.** The renderer here is Chromium, not CasparCG. The hardware half of
  the student release was closed separately, on your own machine.
- **The phone control page.** Step 2 covers it by hand; no spec drives it.
- **Any behaviour but the quiz.** There is one, on purpose — see
  `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §6 for why the registry is deferred.
