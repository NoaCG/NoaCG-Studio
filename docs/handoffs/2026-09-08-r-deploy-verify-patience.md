# deploy-verify was watching the wrong event

Branch `claude/r-deploy-verify-patience`, 2026-09-08. Issue #159: a landing production DID take
opened a red alarm on `main`.

## What was actually wrong

Not patience. The verifier was started by an event that has nothing to do with Vercel.

Two bots post a `success` `deployment_status` on the same production deployment record:

| who | what it means | when |
|---|---|---|
| `github-merge-queue[bot]` | GitHub's bookkeeping for `post-land.yml`'s migrate job, which declares `environment: production` | ~25 s after the merge |
| `vercel[bot]` | "Deployment has completed" - the deployment itself | 80-192 s later |

`deploy-verify` fired on both. Started by the first, it polled its 120-second window against a
production that had nothing new to serve yet, and went red on a healthy site. For #159 that is
`b119dbdd`: the run polled 20:55:57 to 20:57:48 and failed, Vercel said the deployment was complete
at 20:58:54, and the next run verified it on its first poll at 20:59:48. Production was serving
exactly `b119dbdd` when I looked, so the owner's reading was right and I confirmed it rather than
inheriting it.

`miwco` shows up as a third source of the same shape: dispatching any workflow that declares
`environment: production` posts one of these statuses too.

## The measurement

21 landings over 2026-09-07/08 (`gh api` over `deployment_status` runs, their deployment records'
statuses, and each run's step timings - reproduce with the correlation script described below).
17 were deploy-affecting; the other 4 had their build skipped, so Vercel raised no deployment.

- Gap between the two statuses: **min 80 s, median 182 s, max 192 s** (n=17).
- **14 of those 17 verifications went red on a healthy production**, each one filing or
  re-commenting the rolling issue.
- The 3 that passed did not verify more than the others did: two caught the alias after 56 s and
  72 s of polling on the fastest builds in the sample (one of them 10 seconds before Vercel even
  said the deployment was complete), and `7242c3f0` passed only because its runner took 150 s to
  start the job.
- Every run started by the `vercel[bot]` status matched within **0-4 seconds**. The alias is
  already promoted when that status lands.

**That 80-192 s spread is why the fix is not a bigger number.** The distribution straddles the
120 s window, so the same healthy deployment reds or greens on how fast that particular build ran.
The 80 s case only exists because a landing arrived while I was writing the fix; it corrected a
range I had already quoted on the issue, and both the issue and the docs carry the correction.

## Which lever moved

The trigger, not the window. The verify job now runs only for a status that is about a real
deployment: `creator.login == 'vercel[bot]'` **or** a non-empty `environment_url`.

Two conditions because the two failures point opposite ways. Matching the login alone fails
silently - rename the provider and every event is filtered out, every run reads as skipped, and
per-landing verification is gone with nothing saying so. Over the last 100 production deployments,
all 85 `vercel[bot]` statuses carry an `environment_url` and none of the 126 bookkeeping statuses
do, so the URL condition keeps an unfamiliar provider verified. The login stays because that same
history contains no FAILED production deployment, so what Vercel puts in `environment_url` when a
build fails is unmeasured, and a failure is the one event this workflow must never drop.

The **120 s poll window is unchanged** and now documented as headroom rather than the lever: with
the right trigger the measured need is zero, and the window only elapses when something is
genuinely wrong.

One consequence, stated in the file and in `docs/DEPLOYMENT.md`: a failing migrate job no longer
reports as a failed Vercel deployment. It reports through `post-land`'s own red run, which is the
workflow that ran it.

## What the failure message says now

It records what production served on the first poll that answered, what it served on the last, and
how many requests went unanswered, then names one of three cases:

- `version.json answered none of the 12 requests over 110s ... production is unreachable, which is
  not a slow promotion.`
- `production served <sha> for the whole 110s and never moved - the alias is stuck on an older
  build and this deployment did not take.`
- `production moved from <sha> to <sha> inside 110s but had not reached <expected> when the window
  closed - a promotion is still in flight, so re-read version.json before treating this as broken.`

with `(N of 12 requests went unanswered, so production is also flaky to reach.)` appended when
polls dropped. Before, all of these were one sentence, which is why #159 needed a person with
`curl` to tell them apart.

## How it was verified

`npm run build` exit 0 (read from the build's own exit code). No product code changed, so
`test:e2e:affected` does not apply; taste: not applicable.

Beyond the gate, the verify step's **real text is extracted from the YAML and executed** against a
stubbed production in six scenarios - healthy, unreachable, stuck, moving, stale-then-dropped and
dropped-then-stale - and each prints the intended verdict. The last two exist because the review
found the first version of this logic inverted its own diagnosis when a single request dropped.
`node scripts/check-workflows.mjs` passes, and a `workflow_dispatch` on this branch
(run 34280376254) had GitHub parse and evaluate the edited file: drift green, verify correctly
skipped.

CI on the branch: run 34279753163 green - E2E plan, Factory gates, Build and CI gate ran; the
shards were skipped because nothing under `src/` changed. `deploy-verify` cannot run on a branch
push at all: it listens for `deployment_status`, `schedule` and `workflow_dispatch`.

## What is NOT proven yet, and what proves it

This branch changes only `.github/` and `docs/`, which `scripts/deploy-affecting-paths.mjs` treats
as non-deploy-affecting, so **its own landing raises no Vercel deployment to verify against**. The
next deploy-affecting landing is the proof, and it should look like this:

- one **skipped** deploy-verify run right after the merge (the merge-queue status), and
- one **green** verify run about two to three minutes later (the Vercel status),
- and **no red one in between**.

`gh run list --workflow deploy-verify.yml --limit 6` shows that in one line. If a red appears
before that, doubt this diagnosis first.

Issue #159 was already closed by the healthy run that followed the false red, so I did not reopen
it to close it again. It carries two comments: the cause, and the correction to the numbers.

## Notes for whoever picks this up

- **Reported, not fixed, and not mine tonight:** the `version.json` fetch and the ancestry check
  are duplicated between the verify job and the drift job. The prompt fenced off the drift job
  (the two mechanisms must keep agreeing about which commit production should serve), so factoring
  them together belongs to whoever owns that job next.
- **Also reported, not mine:** the review found a real defect in `scripts/alignment-answers.mjs`,
  already landed on `main` in `b119dbdd`. Its `**Answer:**` parser reads only the remainder of that
  one line, so an answer written on the next line parses as empty and the question never becomes
  `pending`, and a wrapped answer is truncated into `docs/OWNER_RULINGS.md`. That belongs to the
  session that owns that file.
- The deeper root cause is arguably that `post-land.yml` announces itself as a production
  deployment at all. It needs `environment: production` for the Supabase token, so the fix would be
  a separate environment rather than removing it - a change to another session's file, and not
  worth doing on the strength of this alone now that the consumer filters correctly.
- Measurement scripts live in this session's scratchpad, not in the repo: they walk
  `gh api repos/NoaCG/NoaCG-Studio/actions/runs?event=deployment_status`, then each commit's
  deployment statuses (creator, state, `environment_url`, timestamps) and each run's step timings.
  Rebuilding one is ten minutes; the numbers above are the part worth keeping.

Check: review `delegated` (its range covered a superset of this branch - see below), simplify
`inline`, verify `inline`. The delegated review ran `main...HEAD` against a stale local `main`, so
it also read files already landed on `origin/main`; both findings that were in scope here were
re-derived against the real GitHub payloads before being acted on, and both are fixed.
