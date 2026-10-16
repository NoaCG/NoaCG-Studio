# Agent onboarding: the first reply teaches, and the user's brand is taken in well

## Problem and authority

Four clean coding-agent runs on 2026-10-16 (`evidence/baseline-runs.md`) took a person from the
Downloads prompt or the plugin to saved graphics on hosted noacg.studio. Delivery worked in all
four, and logos and fonts survived the save. Two things depended on luck:

- **The first reply teaches nothing.** After connecting, the agents asked "what should I make?"
  with no example and no word that a website, a logo file, colours or fonts can be given. Asked
  "what can I do?" with the plugin installed, Claude answered from the skill's description alone,
  with generic examples, and did not connect.
- **Brand handling depends on the model.** Given a website or a logo, Claude reported where each
  value came from, what it left out and that a logo is a trademark; Codex used a football club's
  crest without a word about any of it. The skill says nothing about a user's brand.

Authority: the owner, 2026-10-16, chose "Skill: first contact + brand" as the first improvement
after the run report, within the task "the first-run experience needs no remembered commands, and
people's own brand look is used well". The plugin design rule D1 (`plugin-design-quality/spec.md`)
stands: no house look and no taste rules by default. Taking in the USER'S brand is not a house look.

## Behaviour

1. **After connecting, the agent offers a start.** When it asks what to make, it gives three short
   example briefs that show what NoaCG does (a set from a website's brand, operator buttons with a
   logo file, a production from colours and a font), and one line saying the person can paste
   their website, put a logo or pictures in the folder, or name colours and fonts. A person who
   already gave a brief gets no examples. The three, chosen by the owner on 2026-10-16:
   - "A name strap and an opening title for our panel debate, in our brand from https://our-site.org"
   - "A basketball scoreboard with +1/+2/+3 buttons and a game clock; our logo is logo.png in this
     folder"
   - "A podcast set: guest strap, topic bar and a LIVE bug in navy and amber with Space Grotesk,
     as a production in show order"
2. **"What can I do?" is answered by the skill**, not from its description: the description names
   first-time and capability questions about NoaCG, so the agent loads the skill, connects, and
   answers with the same start.
3. **The user's brand is taken in the same way by every agent**, from a short "The user's brand"
   section in SKILL.md:
   - Sources in order: files the user gave, then their website (its stylesheet's colours and
     fonts, its logo file). Never invent a brand the user did not give.
   - The logo is copied into `images/` (SVG preferred), placed where the design has room for it,
     and is a field when the operator may need to swap it.
   - A font is bundled into `fonts/` only when its licence allows it (an OFL font such as a
     Google Font, with its licence text); otherwise ask for the files or name a close free font.
   - The final report says what was used, where it came from, what could not be used, and that a
     logo or crest is someone's trademark the user needs the right to use.
4. **`validator.md` says what `missing-asset` checks today**: `assets/` and `lottie/` only, as an
   error in `validate` and `save`. A missing `images/` or `fonts/` file is not caught; the skill
   tells the agent to see the logo in the frames. Making the validator check them is a separate
   change.

Preserved: connect before the brief, one `save`, the delivery report, D1 (the look stays the
agent's), the Downloads prompt (77 words, unchanged), the three opt-in tools.

## Non-goals

- The `bench-mark-unreadable` false positive on logos with their own background (next spec).
- A brand saved to Home → Brands from the CLI (`noacg save --brand`), and any API change.
- A committed clean-agent harness or a hosted CI check of agent runs.
- Codex `defaultPrompt` or plugin manifest changes beyond the skill description.

## Acceptance criteria

### AC-1: The first reply after connecting offers a start

In a clean run with the Downloads prompt and no brief, the agent's first question after login
offers three example briefs and the brand line (behaviour 1). Layer: clean-agent run, one Claude
and one Codex, receipt in `evidence/`.

### AC-2: "What can I do?" loads the skill and offers the same start

In a clean Claude run with the plugin from this branch, "I just installed the NoaCG plugin. What
can I do?" loads `noacg:noacg-graphic`, connects, and answers with behaviour 1. Layer: clean-agent
run, receipt.

### AC-3: Brand intake reports provenance, gaps and rights

In clean runs with a public website brief and a local-logo brief (one Claude, one Codex), each
final report names the brand values used and their source, what could not be used, and the logo's
rights; any bundled font carries its licence text. Layer: clean-agent runs, receipt with the
frames described in words.

### AC-4: The published skill matches the source

`node cli/scripts/build-skill.mjs --check` passes; `noacg docs skill` from the released CLI prints
the new text; the Downloads prompt pins that release. Layer: the release workflow's checks.

## Evidence plan

`evidence/baseline-runs.md` records the runs before the change and the harness that made them.
The same harness re-runs the briefs against the skill from this branch (the plugin from the
branch for Claude, the CLI built from it for `docs skill`), then against the released CLI, and a
reviewer who did not make the runs records the review in `work.json`.
