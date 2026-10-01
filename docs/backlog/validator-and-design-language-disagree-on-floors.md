# The CLI validator, the skill and the design language state different floors

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 6). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-8.

## Why

Agents size and time to the instrument they are shown, so when the instruments disagree the taste
drifts with them.

- Secondary text: `noacg validate` asked for about 24px and passed 24px location and tagline lines
  (`brief-1-news/cli/onair.png`, `brief-3-gala/cli/onair.png`); `docs/DESIGN_LANGUAGE.md` ratifies a
  28px secondary floor, run by `src/ai/spike/tasteCheck.ts` (`TASTE_SECONDARY_SIZE_PX`). The gala
  agent also enlarged 20px tracked caps it would have kept, to answer the warning.
- Motion: the skill's 0.5-1.4 s entrance range made the gala agent cut a slower ceremonial build it
  wanted; a gala title is not a news strap.
- Stress: in the hockey run a `bench-stress` error on `#f5` did not appear in `shots/stress.png`,
  so the frame the agent looked at could not show the failure it was told about.
- `bench-field-unpainted` fires on a type's own clock field, catalog designs included; the agent
  had to validate a catalog design to learn to ignore it.

## What it would take

Make the CLI's secondary guidance and the design language say the same number or say why they
differ; let the motion range in `references/design-notes.md` and the skill name the brief kinds it
fits; make the stress screenshot render the bench's stress values; exempt a field bound to the
type's `.<prefix>-clock` from the unpainted check.

## Evidence

The frames above; the brief-2 and brief-3 session logs in the research README.
