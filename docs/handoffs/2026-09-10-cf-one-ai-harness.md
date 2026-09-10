# CF - one NoaCG AI option

Branch `claude/cf-one-ai-harness`, three commits, queued. Receipt:
`docs/backlog/one-noacg-ai-harness-not-lite-and-pro.md`. Owner walk:
`docs/acceptance/owner-queue/2026-09-10-cf-one-create-with-ai-option.md`.

## What landed

The AI settings sheet no longer asks anyone to pick a tier. Where three radio cards sat - NoaCG
Lite, NoaCG Pro, Bring your own key - there is one paragraph about the hosted route and one
checkbox, "Use your own AI account instead". No user-visible string says Lite or Pro any more, and
nothing says "included" or "free with". Stored `tier` values `lite` and `pro` migrate on read to
the hosted path; `custom` is untouched.

The surviving hosted behaviour is the Lite pipeline - what every visitor already got by default,
since Pro was never the default and had to be clicked. Hosted Pro's DOOR is closed. Its pipeline
and every `proMode` branch in `AiStep.tsx` are intact and simply never run.

## The decision, and the one I rejected

My first shape was to let the machine pick the better pipeline per visitor - Pro where the server
offers it, Lite otherwise - so nothing was thrown away. A blocking Fable consult killed it with
evidence I had not gathered: `AiStep` branches on `liteMode`/`proMode` about forty times, and the
two differ in allowed categories, field cap (8 against 3), whether a logo may be uploaded, whether
a result can be refined or only regenerated, and the unit of output. Neither is a superset. Silent
routing would have changed the step's SHAPE between visits - and on the day an allowance reset -
with nothing on screen explaining why, which is the owner's own complaint minus the label that at
least explained it. It is also the cost decision the receipt reserves: Pro is roughly twelve times
Lite per graphic, and auto-routing moves the owner and his cohort onto it unmeasured.

**The consult is worth re-reading before the comparison row runs.** Its argument for why "closer to
the owner's bar" was my guess, not a fact - Pro invents a language then composes deterministically
from three fixed assemblers, which is arguably still a template with new text - is the thing the
measured comparison has to settle.

## What is NOT done, and needs somebody

- **The owner's real bar is untouched.** *"It can create graphics like Claude Code and Codex. It
  should not just be a template copy with their own text."* The hosted route still adapts a proven
  catalog design. Closing a door did not move that. This is the comparison plus continuous model
  work, and it is the whole of the receipt's part 4.
- **`e2e/configured/pro-wizard.spec.ts` lost real coverage and it cannot be restored with a
  fixture.** The two deleted walks were the ONLY end-to-end checks that one reservation pays for a
  whole generation (exactly one reserve, one design call charged to it, one outcome) and that one
  call makes the whole package. Seeding `spx-gfx-ai` with `tier: 'pro'` will NOT reach them any
  more - the read migration turns that into the hosted path. Restoring the coverage needs a door.
  The spec's own header now records this; I did not want it living only in a handoff.
- **The configured suite was not run.** It needs a live backend and credentials I do not have, and
  it is not on the branch's CI. `pro-wizard.spec.ts` and `configured/anonymous.spec.ts` are both
  edited and both unverified by me. They are the first thing to look at if that suite goes red.
- **The compiled invariant `wizard/offer-pro-tier-only-where-can`** still names the Pro tier and
  now describes a door that is closed. Re-record it with `npm run learn`; never hand-edit
  `.claude/rules/`. I did not do it: it changes contract text several rows read, and doing it at
  the end of a night without the owner's eye on the wording is how a rule ends up saying something
  nobody meant.
- **OpenRouter as a fifth BYO provider** (receipt part 6) is not started.
- **`docs/GOALS.md` "NEXT - AI that anyone can afford"** still presents three tiers behind one
  door. Its table now describes the pipelines, not what a user is offered. I left it: GOALS is not
  a file to edit sideways at 01:00.

## Evidence and traps that exist in no repo file

- **The Codex job hit its 5-hour usage limit mid-final-build**, after it had already reported the
  full build green. `codex-rescue poll` reported `failed/failed` with a broker-shutdown message,
  which reads like a crash and is not one - the tree was complete and correct. **Check the tree
  before believing that status.** Recorded with `delegation-outcome.mjs` as `repaired/worker`.
- **Codex reached outside the site list twice.** It renamed an internal module-init throw in
  `lite/contract.ts` to nonsense ("Missing Create with AI reference metadata"), which I reverted;
  and it rewrote `scripts/contracts-merge-driver.test.mjs`, which turned out to be a genuine
  test-pollution fix (the test registered the merge driver in the running checkout's real git
  config, which in a linked worktree is the main repository's). I kept that as its own commit
  rather than reverting or burying it.
- **`preview_start {name}` is refused in a linked worktree** - use `npm run dev:worktree` and open
  the printed URL. The guard says so; I am repeating it because I hit it anyway.
- **Screenshots in the Browser pane timed out repeatedly** while the pane was hidden, then worked
  later. `javascript_tool` reading the DOM never failed, and is what I used for the assertions.
- **I stubbed `/api/ai/lite/status` by patching `window.fetch` in the page**, then re-entered the
  step so `AiStep` remounted and re-fetched. That is how the hosted-route state was driven without
  a backend, and it is worth reusing.

## What I verified, and how

`npm run build` exit 0 (read from its own exit code, not a pipe). CI run 34537165116 on the first
commit: green, and I read the job list - Build, Factory gates, all nine E2E shards. `ai-tiers`,
`ai-lite` and `ai-consent` were in the plan and ran, so the rewritten specs are browser-verified,
not merely typechecked.

Then I drove the two surfaces myself on `http://localhost:5240/app`, which is the part a green
build cannot tell you:

- the entry card's hint no longer ends with "Free with NoaCG Lite";
- with the hosted route on, the sheet has zero radios, zero radiogroups and zero selects, shows
  the hosted paragraph with the under-construction sentence, and the read-back beside ⚙ reads
  "NoaCG · no key needed";
- ticking the box reveals the provider select and key field and stores `tier: "custom"`, moving
  the route off the managed transport onto `openai`; unticking returns to the hosted route;
- a stored `tier: "pro"` lands on the hosted path with no Pro panel and no package fieldset, and
  the page contains neither "NoaCG Lite" nor "NoaCG Pro".

**`check`: review `delegated` 9 findings / 8 fixed, simplify `inline`, verify `inline`.** Stamped
PASS at `206665a4` over 24 files against `eeb1aef0`. Simplify returned fan-out instructions, so
that leg ran here; the review's scope was checked against this worktree's own diff and matched
(23 files, base `eeb1aef0`). **taste: not applicable** - nothing here can move what a graphic
looks like.

The one unfixed finding is the `pro-wizard` coverage above, which is not fixable without a door.

The review earned its place: it found that the new checkbox label used a bare span, so the title
and description rendered as one unbroken run - "Use your own AI account insteadRun it on your own
account with..." - which I had READ in the browser output and not registered. It also found that
the card above the sheet promised "nothing to install" on a deployment where the sheet said the
hosted service was unavailable, and that the sheet asserted "not available on this build" while
the status request was still in flight. All three are fixed and re-checked in the browser.

## Pointers

- The consult that settled the shape: agent `a0ebd4eea66aff865` (Fable), reachable with
  SendMessage while this session lives.
- Codex job `task-mtw1bety-31w06y`, resumable as `codex resume 01a08d34-b094-7761-9db2-fed23284f6d4`.
- The reopen recipe for hosted Pro is a comment at the tier resolution in
  `src/components/wizard/steps/AiStep.tsx` - restore `proOffered` and give `tier` a `'pro'` branch.
