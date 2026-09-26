# Three behaviour ideas from the first real-production walk

**Filed:** 2026-09-26. **Source:** the owner's walk after running seven graphics in a real
production (2026-08-23), carried over from retired working notes.

## Why

Outcome 4 in `docs/GOALS.md` (behaviour and control): a graphic exposes the states and controls
its production needs. Each idea removes an operator step the walk exposed.

## What it would take

- **A goal event also bumps the score.** "No reason for the goal animation if the number doesn't
  change": the goal transition on a score graphic increments the scoring side's number.
- **A countdown with an optional manual start**, besides starting on take.
- **A live vote driven by real data**, later, through the production data API (`docs/DATA_API.md`).

Each is small inside the structural control model; the third waits on outcome 7 (data).

## Evidence

Searching `src/templates` on 2026-09-26 found no goal-to-score increment and no manual-start
countdown.
