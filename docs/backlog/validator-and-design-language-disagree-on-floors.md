# The CLI validator and the design language state different floors

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 6). **Re-sorted:**
2026-10-02 against D1: rewritten to the validator half. The skill half landed with the D1 skill
change: the default contract no longer states a motion range, and the opt-in guidelines
(`references/design-notes.md`) state `docs/DESIGN_LANGUAGE.md`'s floors and say which brief kinds
their motion range fits. **Owner:** the CLI validator's row (row BR owns the CLI's validate code
and `references/validator.md` in the 2026-10-02 wave). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-8.

## Why

Agents size and time to the instrument they are shown, so when the instruments disagree the look
drifts with them, and under D1 a default instrument must report, never steer.

- Secondary text: `noacg validate` asked for about 24px and passed 24px location and tagline lines
  (`brief-1-news/cli/onair.png`, `brief-3-gala/cli/onair.png`); `docs/DESIGN_LANGUAGE.md` ratifies a
  28px secondary floor, run by `src/ai/spike/tasteCheck.ts` (`TASTE_SECONDARY_SIZE_PX`). The gala
  agent also enlarged 20px tracked caps it would have kept, to answer the warning.
- Stress: in the hockey run a `bench-stress` error on `#f5` did not appear in `shots/stress.png`,
  so the frame the agent looked at could not show the failure it was told about.
- `bench-field-unpainted` fires on a type's own clock field, catalog designs included; the agent
  had to validate a catalog design to learn to ignore it.

## What it would take

Make the CLI's secondary guidance and the design language say the same number or say why they
differ, worded as a measurement; make the stress screenshot render the bench's stress values;
exempt a field bound to the type's `.<prefix>-clock` from the unpainted check.

## Evidence

The frames above; the brief-2 and brief-3 session logs in the research README.
