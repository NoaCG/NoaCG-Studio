# Browser readiness and stalled-holder visibility

## Problem and authority

A live browser-driving run can monopolize machine-wide verification while doing no useful work. The standing owner ask is [docs/backlog/e2e-webserver-hang-blocks-the-machine.md](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/e2e-webserver-hang-blocks-the-machine.md) (2026-09-03). The 2026-09-14 owner request authorizes a naturally occurring bounded feature pilot through the real Orchestrator, preserving existing scheduling and landing. Reliable verification serves docs/GOALS.md NOW. This spec serves that existing intent without claiming the original 126-minute incident has been reproduced.

## Owner requirements

Make blocked verification recoverable and visible without the owner closing processes. A worker finishing a slice cannot imply the parent feature is complete. Continue bounded work until all agreed acceptance evidence is reviewed. work.json is acceptance/evidence only.

## Derived decisions and preserved behavior

Use explicit IPv4 only for the e2e server/probe contract, preserving developer-server defaults and dual-stack occupied-port detection. Preserve existing 60-second Playwright readiness caps, strict ports, worktree port allocation, offline/configured separation, queue serialization, ownership and orphan cleanup. Sustained-idle detection is advisory: low CPU never declares a process dead and never authorizes termination. Two implementation slices are sequential because readiness findings may affect shared diagnostic code. Unknown evidence remains unknown.

## Non-goals

No new scheduler, lock, daemon, automation, job-state system, auto-kill policy, account setup, production migration or deployment architecture change. Do not solve the broader stale instruction corpus in this pilot; [issue #805](https://github.com/NoaCG/NoaCG-Studio/issues/805) remains an explicit follow-up. Do not claim real authenticated live sign-in or reproduction of the historical incident from offline fixtures.

### AC-1: E2e readiness uses one consistent loopback endpoint

Offline, catalog and configured/live Playwright server commands, readiness/base URLs and the offline guard agree on explicit 127.0.0.1 and the allocated port. Audit affected hardcoded e2e origins and keep them consistent. Existing strictPort, normal 60-second webServer caps and environment separation remain intact. Ordinary developer-server defaults and port-probe's dual-stack occupied-port checks are preserved. Verify the endpoint contract and an offline smoke; record configured/authenticated coverage limitations explicitly.

### AC-2: A stalled readiness fixture fails boundedly and releases its owned resources

Attempt a controlled reproduction with a fixture whose process stays alive and either binds only the wrong loopback family or accepts TCP without answering HTTP. Run through the existing machine-wide job queue, with a shorter fixture-only cap allowed through the production configuration path. Record the actual blocking phase, configured cap, runner polling/teardown tolerance, job IDs, elapsed timings and any external queue delay. The expected failed fixture job must release its slot and owned processes; a following smoke job in the SAME worktree must pass and no fixture-owned orphan or listening port may remain. Never terminate unrelated processes. If reproduction reveals an unbounded offline-guard fetch or another readiness path, bound that path and verify the real failure rather than adding a redundant timeout.

### AC-3: Sustained-idle suspicion requires evidence and preserves healthy/unknown cases

Diagnostics distinguish a live holder suspected of sustained idle from an orphan, showing PID, age and CPU/descendant observations. Use CPU deltas across two samples for the same process identity over a stated window; cumulative CPU alone is insufficient. Young, CPU-active, browser-active and confirmed blockingRuns waits are not suspects. Missing CPU/identity/descendant samples, inaccessible processes and recycled PIDs remain unknown. A self-wait cannot be excused as a legitimate different-holder wait. Prove classifications with controlled tables and a bounded real process-sampling probe, clearly distinguished from reproduction of the historical incident. Classification is informational, never an instruction to kill or a dead-process verdict.

### AC-4: Existing jobs diagnostics expose suspicion without acquiring execution authority

The existing e2e diagnostic command and jobs/runner status output surface AC-3 suspicion with supporting evidence. Healthy and orphan output retain their existing meaning and relevant regression coverage. No suspect enters reclaimCandidates, planReclaim or orphan cleanup merely because of CPU evidence; verify this preservation directly. Job states, scheduling choices, launch ownership, lock release and landing remain governed by existing mechanisms. No new task-state or process-kill policy is introduced.

### AC-5: The real Orchestrator preserves open parent acceptance across completed workers

After readiness worker EP completes/lands, capture actual work-spec and wave-tick output proving the parent remains open with AC-3, AC-4 and AC-5 unresolved; this is required even when EP's branch is green. The existing wave plan then dispatches the bounded diagnostic continuation EQ, without an owner checkpoint. A separate reviewer identity reviews the integrated landed implementation, tests preservation scenarios and records each criterion's evidence against the reviewed revision and spec hash. Only that complete reviewed evidence permits evidence-complete; worker exit and landing alone never do. Exercise native Codex implementation and a real Claude Code review or implementation through existing adapters; record denied tools and exact limitations, never treating a partially denied review as a fully verified route. If Claude implementation is unavailable, retain the measured limitation and use the documented available fallback for product work. Parent convergence still requires all product criteria and the real continuation evidence.
