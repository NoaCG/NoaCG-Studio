# Reviewed editor proposals

R1.3b adds an Assistant panel to the foundation editor. Describe an edit, review
its exact values and source targets, then Apply or Cancel. Source commits use the
six qualified commands and existing session handlers. Review does not write.

See [spec](spec.md), [verification](check.md), [model requests and outcomes](model-evaluation.json)
with [full grounding](model-requests.json) and [reference interactions](reference-ui.json).

## Run the deterministic task

```
npm run queue -- "npx playwright test e2e/editor-model-proposals.spec.ts e2e/editor-proposal-task.spec.ts --workers=1"
```

Fresh UI and proposal copies import the public nested/masked SVG through the
wizard, retain a public field and excluded static wording, create supported
artwork and edit defaults, base position, keys, Next and Out. Review and Cancel
preserve source, samples and history. Apply uses the shared command pipeline.
Save/reopen and In/Next/Out rehearsal execute existing SPX, CasparCG and OGraf
browser packages. Three viewport receipts compare exact source/history and poses.

The default merge-gate tests use deterministic gateway responses. Actual paid
requests are recorded separately: six configured Anthropic/claude-sonnet-5 calls,
with existing gateway credentials and normalized adapter, at an estimated
USD 0.180402 against a USD 0.50 ceiling. Their offline UI replay makes no further
model calls. The benchmark does not verify endpoint account/ledger behavior,
which this change reuses without modifying.

## Boundaries and continuation

This closes the bounded proposal task. It does not close full B17/B18 or E23,
CLI round-trip, grounded general help, funding/BYOK acceptance, paired live MCP,
WebMCP, subjective usability, physical receiving hosts or whole-editor parity.
The configured provider result is a small task sample, not broad model quality.
Next: qualify the full CLI-generated source round-trip while retaining these
schemas, source/session ownership and exact preview receipts. Paired MCP stays R3.2.
