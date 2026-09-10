---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "The medium-effort trial expires on 2026-09-16 and names the delegation ledger as what settles it, and every medium-effort row on that ledger is attributed to our own spec, which the ledger's own tool excludes from pool quality."
serves: NOW
size: small
touches: scripts/codex-rescue.mjs, scripts/delegation-outcome.mjs
needs-owner: none
---

# The effort trial expires on 2026-09-16 and the ledger it names cannot answer the question

**Filed:** 2026-09-10. **Source:** row AC's harness verdict, 2026-09-09 -
`git show 4f95444b:docs/handoffs/2026-09-09-ac-harness-verdict.md`, "What is done, and what is not".
Re-derived by reading `~/.noacg/delegation-outcomes.jsonl` on 2026-09-10.

## Why

`scripts/codex-rescue.mjs:1044-1045` sets `DEFAULT_EFFORT = 'medium'` and
`DEFAULT_EFFORT_REVIEW_ON = '2026-09-16'` under the owner's 2026-09-09 ruling. The comment block
above them, `:1031-1040`, carries this sentence:

> the delegation ledger already records what settles it: model, effort, outcome and cause per task
> class ... On or after the date above, read the ledger and either extend this with the evidence or
> put it back to `high`.

**It does not.** Read on 2026-09-10, the ledger holds 29 lines. **Three** of them ran at medium
effort, and all three carry `cause: prompt`. `scripts/delegation-outcome.mjs`'s own help text says
what that means: *"our spec or invocation - measures US, excluded from pool quality"*. Of the nine
lines before this one was written, exactly one is attributed to the worker at all.

**Timestamp any count you take off this ledger.** It moves while you read it - the twenty-ninth line
is this row's own delegation, appended between the first draft of this file and its review, and the
draft said 28 lines and four medium rows on the strength of the earlier read. Row AC recorded the
same hazard on 2026-09-09, when another session appended a row mid-verification.

So on 2026-09-16 somebody will do the thing the comment tells them to do, read a ledger with zero
worker-attributed medium-effort evidence in it, and reach a verdict from nothing. The likely outcome
is that medium quietly becomes the new default because no evidence contradicted it - which is exactly
what the comment's own line "a trial without an expiry is just a new default" was written to stop.

## What it would take

The fix is not more ledger lines, it is spec discipline in front of them. A delegation whose result
had to be repaired because our prompt was wrong tells us nothing about the model, and eight of the
last nine are that. Two things would change the number:

- **Write the spec and the acceptance conditions before launching**, which is already the rule, and
  record `spec-bytes` so a `prompt` cause can be seen coming.
- **Say what the ledger currently proves, in the code that points at it.** Whoever touches
  `DEFAULT_EFFORT` next should either lower the claim in that comment to what the ledger can support,
  or name a smaller question the ledger CAN settle - for example whether `gpt-6-astra` at medium
  produces more `prompt`-caused repairs than `gpt-5.6-sol` at high did, which is a question about our
  side and is answerable from what is there.

Deciding to extend the trial without evidence is a legitimate answer too. It just has to be made as a
decision rather than as a reading.

## Evidence

The nine lines up to and including the last of 2026-09-09, by outcome and cause:

| ran | harness / model | effort | outcome | cause |
|---|---|---|---|---|
| 2026-09-09 06:29 | codex / gpt-6-astra | high | unusable | prompt |
| 2026-09-09 06:29 | codex / gpt-6-astra | high | unusable | prompt |
| 2026-09-09 06:45 | codex / gpt-6-astra | high | repaired | **worker** |
| 2026-09-09 11:37 | codex / gpt-6-astra | medium | repaired | prompt |
| 2026-09-09 13:42 | codex / gpt-6-astra | medium | repaired | prompt |
| 2026-09-09 20:27 | antigravity / gemini-3.7-flash-high | - | unusable | prompt |
| 2026-09-09 20:30 | codex / gpt-6-astra | medium | repaired | prompt |
| 2026-09-09 20:30 | antigravity / gemini-3.7-flash-high | - | repaired | prompt |
| 2026-09-09 20:32 | codex / gpt-5.6-sol | - | clean | - |

The one `clean` line records no effort at all, so it cannot be read against either arm of the trial.

Two related items are already filed and this one does not duplicate them:
`orchestrator-runs-the-same-in-codex.md` is the owner's standing ask about running the orchestrator
inside Codex, which is a different question, and
`two-measuring-instruments-that-lie-are-recorded-nowhere.md` is about instruments that report wrongly
rather than about a ledger that is honest and thin.
