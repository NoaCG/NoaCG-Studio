# Gateway client-timeout billing measurement (#2114)

Owner approved one measurement, at most three generation requests, no retries, and a
**$0.01 total cap** checked against worst-case pricing before sending. Exactly **two**
generation requests were sent on 2026-11-04. Observed credits debited **$0.0001917**.
The durable pre-dispatch counter, pricing snapshot, credit readings and control lookup
are in [receipt.json](receipt.json). Do not repeat this experiment under that approval.

## Method and spend bound

Free live `/v1/models` and model endpoint metadata identified `openai/gpt-4.1-nano`,
served only by `azure`: input $0.10/M tokens, output $0.40/M, provider request fee $0.
Both raw HTTP Chat Completions calls restricted routing to that single provider,
forbade prompt training, used synthetic prompts, and had no fallback model, SDK,
redirect follow or HTTP retry (`curl --retry 0`). No paid reporting query was used.
No ZDR requirement was attached to this synthetic probe. One production-style
`surface:billing-probe` tag incurred a $0.000075 reporting-tag write per request;
this is a tag surcharge, not a generic model request fee (#2015, #2058).

The serialized payloads were 254 and 341 bytes. Before dispatch, each reserved a
conservative 1,024 input tokens (payload bytes plus 512 framing tokens fits), with
32 output tokens for the control and 4,096 for the deadline. Reserved worst cases
including the tag were $0.0001902 and $0.0018158. Even reserving a third 4,096-token
request totaled **$0.0038218**, below $0.01, whether or not client abort stopped the
provider. A durable atomic receipt recorded each attempt before dispatch; failures
counted too. Only the two planned calls were made.

The control requested a tiny response. The timeout requested numbers written in
words, one per line, until its output limit; a 1.2-second curl deadline disconnected
the client before any headers/body arrived. This measures a client deadline, not a
server HTTP 408 or user-initiated cancellation.

## Observations

| Request | HTTP / client result | Generation ID | Token cost | Tag write | Settled credits debit |
| --- | --- | --- | ---: | ---: | ---: |
| Control, 32-token maximum | 200, 2.112 s | `gen_01M6M021SXSP4QSHRY7VMAWRYG` | $0.000002 | $0.000075 | $0.000077 |
| Deadline, 4,096-token maximum | no HTTP response; curl 28, 1.215 s | unavailable | unknown | not separately attributable | $0.0001147 |
| Genuine server 5xx | not attempted | — | unknown | unknown | unknown |

Control usage reported 12 input and 2 output tokens. Its generation lookup agreed:
Azure, non-streaming, finish `stop`, gateway cost $0.000077. The timeout returned no
generation ID or usage; its provider-side token counts and attempt count cannot be
inspected. There were exactly two client generation HTTP requests. Raw HTTP and a
single provider remove client retries/fallbacks; they do not prove how many internal
provider attempts an unobserved gateway request made.

Credits stayed unchanged across a 21-second pre-call quiet window. The control debit
matched both returned gateway cost and the generation lookup, then stayed unchanged
for 41 seconds. The additional $0.0001147 debit appeared immediately after the timeout
and remained unchanged 29 and 111 seconds later. Both balance and lifetime usage
changed by the same amounts. Other builders were asked to avoid paid calls. These
are team-level counters: unrelated team traffic cannot be categorically excluded,
and the timeout has no per-generation lookup. The quiet windows support attribution;
this is not a universal billing guarantee or proof about every model/provider.

## Accounting decision and remaining limits

A disconnected Chat Completions client **can still incur spend**. For funded callers
that already calculate a per-request route ceiling (Lite generation/repair, skin
judge, import analysis), the chat executor now carries that ceiling, fee included
once, for its own elapsed deadline. A retry or fallback retains it alongside earlier
served usage, on success or failure. Tokens remain unknown, represented as zero
reported tokens with an explicitly configured cost estimate. A response body aborted
by the same deadline follows that rule too. Attempt limits and retry counts do not
change. Missing/invalid bounds and other providers receive no invented charge.

This is conservative booking, not the measured exact cost. It reuses each caller's
existing input estimate/output budget and route price; it does not establish that
those existing input estimates are hard token bounds.

`/evaluate` is a different API and was not measured. Its existing conservative
booking for unknown HTTP 408/5xx, network errors and cancellation remains unchanged;
that policy is a reservation, not evidence those outcomes are billed. The chat
executor does not copy it to unmeasured server errors. Parent/user cancellation is
also distinct from the executor's own timer. No supported, safe, controlled real
5xx injection was found; no simulated proxy failure or outage-chasing call was made.

**#2114 remains partially open.** Follow-up acceptance criteria:

1. For managed Pro, add a defensible per-call input admission/reservation bound,
   combined with the request's normalized output limit (`maxTokens`, default 16,000)
   and funded per-route prices. The generation ceiling and maxCalls alone are not
   per-attempt bounds. Do not substitute the whole model context window: it could
   exhaust a generation allowance after a small timed-out request.
2. Define a distinct bound for image output using actual image pricing; token prices
   are insufficient. Wire both kinds of bound into timeout settlement while retaining
   served attempt sums, fee-once behavior, generation ceilings and maxCalls.
3. Measure genuine HTTP 408/5xx and `/evaluate` independently if a reproducible safe
   path and a new owner-approved paid budget become available. Until then, describe
   their different conservative booking policies and unknown actual billing plainly.

All regression tests use stubbed fetches; they do not spend gateway credit.
