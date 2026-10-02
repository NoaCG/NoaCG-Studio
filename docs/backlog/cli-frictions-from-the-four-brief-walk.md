# Small CLI frictions every fresh agent hit on 2026-10-02, and an inspect that shows the operator's view

**Filed:** 2026-10-02. **Source:** measurement, the four session logs of the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 7) and the three D1 re-runs
the same day. **Re-sorted:** 2026-10-02 against D1: kept and narrowed to the CLI; the skill halves
landed with the D1 skill change, and the `inspect` half of the old operator-page item is merged
here. **Owner:** a CLI row (`cli/src`). Spec: `docs/work-specs/plugin-design-quality/spec.md`
AC-9 and AC-11.

## Why

Each costs a minute and some trust; together they make a first session feel rougher than the
graphics deserve, and most agents reported the same ones. The `inspect` change is the CLI half of
operability: the agent reads the operator page the way the operator meets it.

- `noacg --help` exits 2, which reads as a usage error (briefs 1, 2, 4; again in the D1 quiz run).
- `noacg scaffold --help` prints the global help, not scaffold's (briefs 3, 4).
- `scaffold --fields` refuses a `hidden` kind, although the skill now tells the agent that
  set-once words are `hidden` word sources; both D1 gala runs edited the ftype by hand.
- "the generated half was stale" after every ordinary edit reads as a fault (briefs 3, 4).
- `doctor` reports the installed plugin's skill version beside the CLI's even when the session's
  skill is current, which confused two agents in the walk and one in the D1 runs.
- With `--name "Pub Quiz"`, the chassis comments still say the catalog design's name.
- `noacg inspect` prints every input before every button and has no notion of live versus setup.

## What it would take

Exit 0 on `--help`; per-verb help; `hidden` as a `--fields` kind (a holder with the
`noacg-data-source` class and its CSS rule); reword the stale note as information; make `doctor`
say which skill copy the session is using; rename chassis comments with `--name`. `inspect` groups
its output into LIVE (buttons, and fields changed during the show) and SETUP. Each is small and
separately landable.

Landed already, with the D1 skill change: one copy-paste zip line per OS in `SKILL.md` step 5,
and the default rule (a safe sample or empty, never "Host Name") in "Fields and behaviour".

## Evidence

The SESSION LOG sections summarised in the research README, briefs 1 to 4; the D1 re-runs in
`docs/work-specs/plugin-design-quality/evidence/2026-10-02-d1-fresh-brief-runs.md`.
