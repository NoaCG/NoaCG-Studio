# Branch runs: the new skill text before release, 2026-10-16

Four clean runs, 09:11 to 09:24 UTC, against hosted noacg.studio and the owner's standing test
account, with the harness described in `baseline-runs.md`. The skill came from this branch:

- Prompt route (F, G): the Downloads prompt with one change, its first sentence pointing at the
  CLI packed from this branch (`npx -y --package=<noacg-cli-0.12.1.tgz> noacg`), whose
  `docs skill` printed the new text. Everything else in the prompt was as published.
- Plugin route (E, H): Claude with `--plugin-dir cli/plugin` from this branch; Codex with the
  plugin's skill folder copied into a fresh CODEX_HOME.

At the time of these runs the branch also renamed the plugin's skill folder to `graphic`; that
change was dropped (a plugin skill already answers to its `name`), and the skill text the runs
read is the text this branch lands.

## AC-1: the first reply after connecting offers a start

- F (Claude, `claude-opus-5-5`): doctor, skill, whoami, login, then "What should I make? Some
  examples:" with the three briefs word for word and "You can paste your website, put a logo or
  pictures in this folder, or name your colours and fonts, and I'll use them." Pass.
- G (Codex, default model): the same three briefs and the same line, after "You're connected".
  Pass.

## AC-2: "What can I do?" loads the skill and offers the same start

- E (Claude, plugin): "Hi! I just installed the NoaCG plugin. What can I do with it?" The first
  tool call was the Skill tool loading the NoaCG skill. It read `setup.md`, ran doctor and login
  (no whoami first), then said what NoaCG makes, gave the three briefs and the brand line, and
  asked what to make. 62 s, USD 0.21. In the baseline (B) the same question was answered from the
  description alone, with no connection. Pass.
- H (Codex, skill installed), whose first message was already a brief ("graphics for our football
  club's fan livestream ... https://www.hjk.fi"), got no examples: it proposed a starter set for a
  fan stream and asked two questions, as the spec says for a user who gave a brief.

## AC-3: brand intake reports provenance, gaps and rights

- F (Claude, website): "Use our brand from https://www.flowfestival.com", an artist strap and a
  full-screen "next on this stage" card. Report: colours from the site's stylesheet (yellow
  `#fff203`, black, white); the logo is the header's `iso-logo.svg`, and the dated variant was not
  used; Flow's own typefaces are commercial and not licensed for redistribution, so it used Archivo
  as the closest free match, bundled with its OFL text, and offered to swap in Flow's fonts given
  the files and a licence; "the Flow logo belongs to Flow Festival, so make sure you have the
  right to show it on air". Frames: a black full-screen card with the Flow wordmark, "NEXT ON THIS
  STAGE" in spaced capitals, the artist in heavy black capitals on a yellow plate, the time on a
  white plate, and a stepped yellow block in the corner; the strap is the same yellow plate and a
  black time plate under the wordmark, over video. Both validate with 0 warnings. Pass.
- H (Codex, website and crest): the HJK brief from the baseline (D), which then used the crest
  without a word. Report now: "The blue, white, League Spartan font, and crest come from HJK's
  website. The crest belongs to HJK; you need permission to show it on air." League Spartan is
  bundled with its OFL text. Pass.
- G (Codex, local logo): the roller-derby brief with `kallio-rollers-logo.png` in the folder. It
  used the logo and its teal and hot pink, bundled Bebas Neue from Google Fonts with its OFL text,
  showed the scoreboard's buttons and waited for confirmation before saving, then saved both. Its
  final report did not repeat the sources and gave no rights line; for the user's own logo that
  line matters less, but the report is thinner than the skill asks. Partial.

Every bundled font in F, G and H carries its licence text; in the baseline, one run of four did.

## Seen outside the criteria

- H saved, kept editing, and saved again, so the account holds two copies of each graphic ("earlier
  copies also remain in your library"). A save cannot update a graphic it made; the skill says to
  save once when everything is validated, and H did not. Not caused by this change.
- `bench-mark-unreadable` again fired on the Kallio badge (G) and the HJK crest (H), both readable
  in their frames; both agents overrode it.

## Limits

One run per case, one Windows machine, scripted user turns, the operator's Claude sign-in. The
prompt route used a packed CLI rather than the npm release; AC-4 covers the release.
