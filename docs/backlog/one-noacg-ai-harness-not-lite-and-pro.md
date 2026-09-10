---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: advanced
note: >-
  452bda6e closed the DOOR - one hosted Create with AI option, no tier chooser, no user-visible
  Lite or Pro, stored tiers migrated on read - and 206665a4 fixed what the review found in it.
  The ask still stands for parts 4 and 6: the hosted route still adapts a proven catalog design
  rather than authoring like a coding agent, the measured comparison that decides which harness
  survives has not run, and OpenRouter is not a BYO provider yet. See "What is still open" below.
asked: "we need to change the harness names and just have one AI option ... It's a bit confusing to have to choose what model I should use"
---
# One NoaCG AI harness, no tiers, no model chooser

**Decided by the owner on 2026-09-10**, walking the landing page's Create with AI card
(`docs/acceptance/owner-queue/2026-09-07-free-and-open-source-positioning.md`). He was asked
whether "Pro" still sounded like money and answered by removing the distinction entirely.

## His words

> For the second part of the "Create with AI" card, we will remove all information about included
> free, etc., because everything is free. In the short term we will fix that we have one AI harness
> model that can create graphics automatically. We just need to balance the functionality with the
> cost so I can afford to keep it free. That's the short-term plan for the next few years at least
> and then we'll see if we have something else.
>
> Now we need to add to our to-do lists that we need to change the harness names and just have one
> AI option. At the same time, it will make things a lot more clear. It's a bit confusing to have to
> choose what model I should use, etc. This means continuous work on the model, but first we have to
> combine and just choose the harness or harness version that works best.
>
> The goal here is that it can create graphics like Claude Code and Codex. It should not just be a
> template copy with their own text.
>
> Let's give the possibility to use their own API key because why not? ... The NoaCG harness will
> always use the [Vercel] AI gateway for all its work, and it's still under construction. It should
> be clear from the text that they shouldn't rely on it, and they should use the CLI as the main AI
> creator right now.

## The decision, in parts

1. **One harness, not two.** NoaCG Lite and NoaCG Pro stop being two things a user picks between.
   One hosted AI path exists. Which of today's two pipelines it is built from is an engineering
   choice - *"first we have to combine and just choose the harness or harness version that works
   best"* - not a user-facing one.
2. **No model chooser on the hosted path.** Choosing a model is named as the confusion to remove.
   This EXTENDS the existing invariant `wizard/offer-pro-tier-only-where-can`, which already forbids
   a provider, model or key chooser inside the Pro tier's settings; the same now applies to the one
   remaining harness.
3. **Everything is free, and the copy stops discussing it.** No "included free", no allowance
   language, no tier names on the card. Free is the whole story, so there is nothing to explain.
4. **The bar is real authoring.** *"it can create graphics like Claude Code and Codex. It should not
   just be a template copy with their own text."* This is the acceptance test for the combined
   harness and the reason the work is open-ended: he expects continuous model work behind it.
5. **Cost is the constraint that keeps it free.** Functionality is balanced against what he can
   afford, deliberately, for the next few years. A change that improves output while multiplying
   spend fails this decision even though it improves the product.
6. **Bring-your-own-key stays and widens.** A user who wants to pay a provider directly may, and
   should be able to reach the Anthropic models, the OpenAI models, Google Gemini, Hugging Face and
   **OpenRouter**, confirmed by him on 2026-09-10. Four BYO providers exist today in `AI_PROVIDERS`
   (`src/ai/settings.ts`): anthropic, openai, google, huggingface. OpenRouter is therefore a fifth
   provider to add, and it is the one that makes the list open-ended rather than a fixed four, since
   an aggregator carries whatever its catalogue carries.
7. **The hosted harness always runs on the Vercel AI Gateway** - confirmed by him on 2026-09-10,
   naming the gateway we already use - and that stays invisible. This
   agrees with the 2026-08-14 ruling recorded at the top of `src/ai/modelTypes.ts`: the gateway is
   the NoaCG-funded transport and *"is never offered to a user as a choice"*, because a door naming
   it describes our plumbing rather than the product.
8. **The card must say it is under construction.** Plainly: do not rely on this yet, and the CLI
   with your own coding agent is the main AI route today. That is a demotion of the hosted path in
   the copy, said out loud, and it sits beside the existing invariant
   `wizard/say-user-own-coding-agent-route`, which already puts the own-agent route first on the AI
   door.

## The name: none. It is "Create with AI"

**Settled 2026-09-10.** He asked for a good name, was given the argument below, and answered
*"create with AI is good"*. So the single hosted path carries no product name: the card's own title
is what it is called, and no tier or edition word appears anywhere near it.

The argument, kept because it is the reason and a later session will be tempted to name the thing:
A product name exists to distinguish a thing from its alternatives, and after this decision there
are no alternatives: there is the hosted path, and there is your own key. "Create with AI" already
names the feature. Adding "NoaCG <something>" re-creates in branding the exact confusion the
decision removes, and it is marketing vocabulary on a surface he has just asked to strip of
marketing (`docs/backlog/public-copy-should-read-finnish-plain.md`).

If a name is wanted anyway, it should be flat and descriptive rather than a tier word: "NoaCG AI"
is the least bad. Avoid anything implying a level - no Studio, Plus, Core, Prime.

## What this touches, in rough order of pain

- `src/ai/lite/` and `src/ai/pro/` are two whole pipelines with their own contracts and AGENTS.md
  files. Combining them is the bulk of the work and the part that needs a measured comparison
  first: which one, on today's catalog, actually produces the better graphic.
- The compiled invariant `wizard/offer-pro-tier-only-where-can` names the Pro tier by name. It must
  be re-recorded with `npm run learn` rather than edited, and the compiled `.claude/rules/` files
  are never touched by hand.
- The admin surface (`src/admin/sections/ModelsSection.tsx`, `UsageSection.tsx`) meters and reports
  per tier.
- The landing page's Create with AI card and the wizard's AI door both carry tier vocabulary.
- `docs/GOALS.md` "NEXT - AI that anyone can afford" is the section this belongs under.

**Do not start by deleting the Pro pipeline.** The first job is the comparison that decides which
harness survives; the copy change on the card can land long before that and should, because the
card is wrong today either way.

## What landed on 2026-09-10 - the DOOR, not the pipeline

The user-facing half is done. The tier radio group is gone from the AI step's settings sheet;
there is one hosted path with no name of its own, and the only other route is the user's own key,
reached from a single checkbox rather than a third option in a list. No surface a user can read
says "Lite" or "Pro" any more, and no copy names an allowance as a selling point.

**The surviving hosted behaviour is today's Lite pipeline** - literally what every visitor already
got by default, since Pro was never the default and had to be clicked. Hosted Pro's DOOR closed;
its pipeline, its server routes and its `proMode` branches inside `AiStep.tsx` are untouched and
simply never run, so reopening it is one line at the tier resolution.

**Why not auto-route to whichever pipeline the server offers**, which was the first proposal: Lite
and Pro are not two quality levels of one workflow. They differ in allowed categories, in the
field cap (8 against 3), in whether a logo may be uploaded, in whether a result can be refined or
only regenerated, and in the unit of output (one graphic against a package). A machine picking
between them silently would change the step's SHAPE from one visit to the next with nothing on
screen explaining why - the confusion he asked to remove, minus the label that at least explained
it. And routing the cohort onto Pro by default is the cost decision part 5 reserves for the
comparison, made blind: Pro is roughly twelve times Lite per graphic.

Stored preferences migrate on read: `'lite'` and `'pro'` both resolve to the hosted path, `'custom'`
is untouched. The ids stay in `AI_TIERS` as read-only history, because deleting one resets the
storage of everyone who chose it (`ai/preserve-stored-ids-change-their-display`).

## What is still open

- **The comparison, and the harness that comes out of it.** Which pipeline survives, measured on
  today's catalog, is untouched by the above. Until it runs, `src/ai/pro/` is code with no door.
- **His longer-term half is NOT this row and was not attempted.** *"The goal here is that it can
  create graphics like Claude Code and Codex. It should not just be a template copy with their own
  text."* The hosted path still adapts a proven catalog design - that is exactly what Lite is - so
  the bar in part 4 is not met and closing the Pro door did not move it. That work is the
  continuous model work he named, and it belongs with the comparison above.
- **OpenRouter as a fifth BYO provider** (part 6) is not done.
- **The compiled invariant `wizard/offer-pro-tier-only-where-can`** still names the Pro tier and
  now describes a door that is closed. It must be re-recorded with `npm run learn`, never edited
  by hand.
- **The entry card carries no under-construction sentence.** The card has a measured height budget
  (`e2e/wizard-entry-fit.spec.ts`) and a fourth line pushes the video strip below the fold, so the
  "do not rely on this yet" steer went on the AI step instead, where the reader has opened the
  door. If he wants it on the card, the card's layout has to give up a line somewhere else first.
- **`docs/GOALS.md` "NEXT - AI that anyone can afford"** still describes three tiers behind one
  door. Its table is now a description of the pipelines, not of what a user is offered.
