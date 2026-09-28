# Handoff: clip playback phase 3 (paused mid-work, 2026-09-28)

Branch `claude/clip-playback-phase-3-f625c8`, worktree `.claude/worktrees/new-session-762cdc`.
The task is the owner's phase 3 brief (clip settings and sequences, `docs/CLIP_PLAYBACK_PLAN.md`),
landed through /check and /queue-merge in ONE step. **Delete this file before /queue-merge.**

## Done and committed

- Bridge: playback descriptor, sequence verb, runner (`cli/src/playout/runner.ts`), serial queue,
  follower and generation guards, part-way-in rule, 2.3 transition reading, rate cache. 180 CLI
  tests pass; every runner guard was broken on purpose and its test failed.
- Page: clip settings, Play next, TO STUDIO, capability-gated Take, P key, audio on layer 5, loop
  rule. Node tests (33) and the playout e2e specs pass; page guards mutation-tested.
- Hosted page pin, Windows baselines re-recorded (mixed production).
- Version 0.5.0 (CLI "0.4.2 - unreleased" renamed), BRIDGE_CHANGELOG 0.5.0, docs (BRIDGE.md §3,
  §3a, §3b, §5, §5a; PLAYOUT_DASHBOARD.md §2g, §2h, §4; plan §4, §12, §16, §18), fixtures README.
- Real-server measurements (§12 items 3-7, 9) and a real 2.5.0 smoke of the built Bridge: all six
  scenarios passed (sequence with fades and clear, part-way-in first clip x7, Out mid-run -> CLEAR,
  clear+fade+gain single take, refused take -> disarm, pause while the follower is due).

## Left to do, in order

1. **TO STUDIO label and trimmed lengths were changed after the last baseline re-record** (smaller
   TO STUDIO label, row/PREVIEW show the trimmed length, skipped cue named in Play next). Re-run
   `npx playwright test e2e/playout-baseline.spec.ts` and re-record Windows if it differs.
2. Owner-check pictures: `docs/research/clip-playback-2026-09-27/phase-3/` (untracked). Re-shoot with
   `shots.spec.ts.txt` in that folder (copy to `e2e/zz-phase3-shots.spec.ts`, run, delete it); its
   1920 "last-seconds" step failed once after the trim fix - adjust its skew. Look at all 8.
3. `docs/BRIDGE.md` §8: add the real-server smoke results (above) and the measurements.
4. Owner queue: `docs/acceptance/owner-queue/2026-09-28-clip-settings-and-play-next.md`,
   `kind: desktop`, the §11 phase 3 acceptance line as the route, pictures linked.
5. Push, then Linux baselines: `gh workflow run rerecord-screenshots.yml --ref <branch>`, delete the
   old `*-linux.png`, `gh run download`, look at them, commit.
6. /check, then /queue-merge. After it lands: tag `bridge-v0.5.0` on the merge commit.

Notes: the full local suite needs 4 GB free RAM (the machine had 0.4 GB with the suite running; it
was stopped). CI's merge queue runs the full suite.
