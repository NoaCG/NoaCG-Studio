# CI and landing reliability investigation

## Why

The owner repeatedly needs several landing attempts and sees red main runs. Earlier
investigations and recent fixes exist, so another audit must identify distinct causes
and verify contained fixes rather than repeat general recommendations.

## Goal

Explain the last 30 merged pull requests using their main and merge-group CI evidence,
identify the causes with the greatest operational cost, and fix reproducible causes
that remain present. Preserve the evidence and a baseline for subsequent landings.

## Non-goals

- Change retries, time limits, quarantine thresholds, CI gates or merge policy.
- Remove the retired editor without evidence that it causes a current failure.
- Claim that passing repeated tests alone reproduces an intermittent failure.
- Make changes in graphic audio, which another session owns.

## Decisions

- Separate failed assertions, job timeouts, cancellations, workflow badges and gate
  verdicts. Count incidents separately from runs that repeat the same incident.
- Review prior investigations before selecting fixes. Do not redo landed remedies.
- Use actual CI traces and fault injection where natural reproduction is unavailable.
- Use the existing fixture helpers and release flow for repaired quarantined tests.

## Acceptance

- Record the sample boundary, distinct incidents, gate verdicts and evidence links.
- Explain whether the retired editor appears in the observed failures.
- For each fix, show the original signature, a failing reproduction or explicit
  reproduction limit, a discriminating verification and repeated focused passes.
- Run /check and land verified changes through /queue-merge.
- Record remaining causes and what the next landing sample must measure.
