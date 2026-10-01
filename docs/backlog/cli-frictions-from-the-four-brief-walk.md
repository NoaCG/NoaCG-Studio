# Small CLI and skill frictions every fresh agent hit on 2026-10-02

**Filed:** 2026-10-02. **Source:** measurement, the four session logs of the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 7). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-9.

## Why

Each costs a minute and some trust; together they make a first session feel rougher than the
graphics deserve, and three of four agents reported the same ones.

- `noacg --help` exits 2, which reads as a usage error (briefs 1, 2, 4).
- `noacg scaffold --help` prints the global help, not scaffold's (briefs 3, 4).
- "zip the folder" does not say folder or contents at the root, and gives no Windows command; all
  four zipped the contents and checked with `validate <zip>` (briefs 1-4).
- "the generated half was stale" after every ordinary edit reads as a fault (briefs 3, 4).
- `doctor` reports the installed plugin's skill version (0.3.4) beside the CLI's (0.7.0) even when
  the session's skill is current, which confused two agents.
- Defaults double as on-air samples with no guidance: "Host Name" and "Oulu" air unless typed over.
- With `--name "Pub Quiz"`, the chassis comments still say the catalog design's name.

## What it would take

Exit 0 on `--help`; per-verb help; one copy-paste zip line per OS in the skill, or a verb that
writes the importable zip; reword the stale note as information; teach the default rule in the
skill (safe sample or empty). Each is small and separately landable.

## Evidence

The SESSION LOG sections summarised in the research README, briefs 1 to 4.
