# Timed graphic cues (row CV, 2026-10-02 night): what is left

Build 1 of `docs/RUNDOWN_AUTOMATION_PLAN.md`. Delete this file once phase 2 lands.

## Done

- **The spec delta**, plan §2.0: graphics only (§3 had already dropped At clip end), Next cue takes
  the next GRAPHIC cue, the words (Out, Next cue, Out and next cue, because » Next is a graphic's
  step), the on-air anchor on both pages and after a reload, and what 0071 and the live-safe
  migration rules change for phase 2.
- **Phase 1**, branch `claude/cv-timed-cues-1`: the record (`ShowCue.auto`, `setCueAuto`), the pure
  rules (`src/control/cueAuto.ts`, `scripts/cue-auto.test.mjs`), the editor's Ends pick, the row
  and PROGRAM countdowns, ARMED, H, Manual, Missed, all on an UNPUBLISHED production
  (`e2e/rundown-timing.spec.ts`). Published, the Ends pick is disabled with the reason and only the
  way back to Manual is offered.

## Left: phase 2, the wire (one branch, `claude/cv-timed-cues-2`, from `main` after phase 1 lands)

Not started tonight: it is a live-path migration plus both pages plus a configured spec, on a
machine with about 2 GB free and the local Supabase stack held by row CY. What done means is the
plan's §2.10 configured spec and the migration self-check, adjusted by §2.0:

1. **Migration 0075, an *add*** (`docs/work-specs/live-safe-migrations/spec.md` L2, header
   `-- live-path add: ...`). New names only:
   - a table beside the head, `control_cue_arms (show_id, lane, cue, then, ms, next, take_seq,
     take_at, from_at, held_ms, missed_at)`, RLS on, no client grants (security definer RPCs only);
   - `control_cue_arm(p_slug, p_lane, p_cue, p_op, p_arg jsonb)` under the head lock
     (`control_heads ... for update`, the 0071 lock order: show row KEY SHARE first), ops `arm`
     (checks the head's `graphics.<lane>.cue` is `p_cue`), `aired` (stamps `from_at` from the
     covering report's `at` in `control_heads.live.<lane>` when its `seq` is at or past `take_seq`,
     or from `take_at` once 3 s have passed), `hold`, `resume`, `cancel`, `fire` (the
     compare-and-set: `ok` once in [deadline, deadline + 5 s], `late` after, marking it missed);
   - each op inserts its `{t:'cue', cue, arm: op, auto?}` row into `control_events` with no seq:
     0071's BEFORE trigger numbers it and its statement trigger broadcasts the `seq-` frame, so
     every follower sees it in order with no new topic;
   - `control_cue_arms_for(p_slug)`: the recovery read (the resolve RPCs' shapes stay as they are);
   - a self-check block calling the functions, as §2.10 lists.
2. **Both pages**: the take marker carries `auto` (`{t:'cue', cue, auto: {then, ms, next}}`); the
   log follower feeds `markerEffect` and the arm rows into the same `CueArms` (a new `armRowEffect`
   in `cueAuto.ts`); a `{t:'live'}` row on a waiting lane asks `aired`; the timer asks `fire` and
   only the `ok` surface sends the end action through `control_send_seq` like a press; H, Hold,
   Resume and Manual call the RPC; a reload reads `control_cue_arms_for`. Server clock offset per
   §2.4 (smallest `receivedAt - created_at`). The hosted page needs `OutputCue.auto` and `next` in
   the payload (§2.2), resolved at publish from the interleaved rundown.
3. **Then** lift the published refusal in `ProductionPage.tsx` (`timedCues`) and its sentence, and
   add `e2e/configured/rundown-timing-recovery.spec.ts`.

## Left: phase 3, server cue markers

Not needed by timed graphic cues any more (§2.0). It stays a separate item for what it fixes on its
own: a reload knowing which server cues are up, and the hosted page showing them on air.

## Also noted

- The hardware panel (`src/control/panelFeedback.ts`) has no `hold` verb yet; a Companion key for
  H is a small follow-up once phase 2 makes it meaningful on a published production.
