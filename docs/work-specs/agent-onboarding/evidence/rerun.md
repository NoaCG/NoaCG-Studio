# Rerun after the first review, 2026-10-16

The first review (`review.md`) failed AC-3: the Codex local-logo run (G) ended without saying what
could not be used and credited the user's named colours to the logo, and H's "pass" overclaimed.
The skill then changed in three ways: the report rule applies to the final message with the
links and says a named colour is the user's; it asks for what could not be used or that all was
used; and the "final report" paragraph points at the brand lines, so an agent writing the report
meets them there. The third example's colours became purple and coral (owner's choice), and the
description went back under its 260-character ceiling.

Same harness as `baseline-runs.md`. Prompt route: the Downloads prompt pointed at the CLI packed
from this branch (version 0.12.2, `npx -y --package=<noacg-cli-0.12.2.tgz> noacg`).

## L: Codex, Downloads prompt, local logo and a commercial font (09:55 to 10:01 UTC)

- First reply after login: the three briefs, the third then "in purple and coral with Space
  Grotesk" (since changed to DM Serif Display), and the brand line. AC-1 holds.
- Brief: the roller-derby logo file in the folder, "teal and hot pink", Bebas Neue, and the
  sponsor's font "Helsinki Grotesk Pro"; a halftime card with the score and a sponsor line, and a
  penalty-box lower third.
- Final report, in full on the brand: "Used your supplied logo, teal and hot pink, and bundled
  open-source Bebas Neue. Helsinki Grotesk Pro wasn't available with a bundling licence, so Inter
  substitutes for the sponsor line. That substitution remains unconfirmed." Both packages carry
  `BebasNeue-OFL.txt`. Sources are the user's own (logo, named colours), the commercial font is
  named as not used with the reason and the stand-in, and the logo is plainly the user's, so no
  rights line is owed. Pass. Mid-run, an earlier message called the colours the logo's; the final
  report names them without crediting the logo. The log shows `validate --screenshots` runs but
  no event of the agent opening the frames, although its report says they were visually checked.
- Frame: a dark teal full-screen card, the badge on a white ring top left, "HALFTIME" in hot-pink
  Bebas Neue, the two team names and big white scores split by a pink rule, the sponsor line in
  Inter under a teal rule. Its default away name "VISITING TEAM" reads as a placeholder.

## I: Codex, Downloads prompt, local logo (09:44 to 09:56 UTC, before the final-report pointer)

The report said "Both use your supplied logo, teal and hot pink, and bundled Inter", naming the
logo and colours as the user's, but nothing on what could not be used. That gap is what the
"final report" pointer was added for; L above is the run after it. I also saved one graphic under
the scaffold's default name "Graphic" and said so.

## K and J: the plugin route before release

- K (Claude, plugin from this branch, the real folder layout): "What can I do with it?" loaded
  the skill, listed as `noacg:noacg-graphic`, described NoaCG and gave the three briefs and the
  brand line. It did not connect, because the skill pins `@noacg/cli@0.12.2`, which npm does not
  have until this branch lands; it said so and offered 0.12.1. It also reported a global
  `noacg` 0.3.3, which is the operator machine's own install showing through the harness PATH.
- J (Codex, skill installed, the HJK brief) stopped for the same unpublished pin.

Both are to be repeated on the released 0.12.2 for AC-2 and AC-4.

## Limits

One run per case. The prompt route used a packed CLI. The plugin route cannot connect until the
release exists.
