# orchestrator/keep-resume-validation-durable-claiming-dispatch

Rule: `orchestrator/keep-resume-validation-durable-claiming-dispatch`. Recorded 2026-09-12 on `codex/resume-dispatch` at 3c9f6353.

The bounded pilot on 2026-09-12 falsely expired after PowerShell converted a UTC JSON timestamp to DateTime and reparsed it with +03:00. A separate tool call dispatched despite the failed claim. scripts/resume-dispatch.mjs now combines the steps; eleven local-only tests cover time zones, disk failures, duplicate processes and refused launches. Disabling both deadline guards made the refusal tests fail.
