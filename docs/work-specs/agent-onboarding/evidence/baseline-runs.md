# Baseline: four clean-agent runs before the onboarding change, 2026-10-16

Four clean runs against hosted noacg.studio with the published `@noacg/cli@0.12.1`, the owner's
standing test account, and a harness that approves the CLI consent in that account. Raw logs,
frames and scripts: the session scratchpad (`runs/A..D`, `tools/turn.mjs`). Screenshots stay on the machine that made them;
this receipt says in words what they showed.

## Harness

- `tools/turn.mjs <run> <claude|codex> <plugin 0|1> <msg>`: empty work folder; HOME, USERPROFILE,
  APPDATA, LOCALAPPDATA and the npm cache pointed at empty folders; every NOACG_* unset; one
  `--resume` per user turn; stream-json logged.
- Claude: `--setting-sources local --strict-mcp-config`, plus `--disable-slash-commands` only
  without the plugin (that flag also turns skills off; a first run B with it was void),
  `--plugin-dir cli/plugin` with it. The operator's Claude config dir is kept for sign-in.
- Codex: a fresh CODEX_HOME holding a copy of auth.json (and the skill for the plugin run).
- A stand-in `rundll32.exe` first on PATH records the consent URL the CLI opens; the harness
  approves it 8 s later as the test account (Playwright). This is what makes headless login work.
- Default models: Claude Code `claude-opus-5-5`; Codex its built-in default.

## Runs

| Run | Agent | Route | Brief | Result |
| --- | --- | --- | --- | --- |
| A | Claude | Downloads prompt | Aalto student TV panel; "use our brand from https://www.aalto.fi" | 3 graphics saved, 0 warnings, 10.5 min, $2.93 |
| B | Claude | plugin, "I just installed the NoaCG plugin. What can I do?" | Roller derby team; logo file in the folder, "teal and hot pink", Bebas Neue | 2 graphics saved after it showed the buttons, 12 min, ~$3.2 |
| C | Codex | Downloads prompt | Podcast; #1B1F3B, #FFB400, Space Grotesk | 3 graphics saved, 4 min |
| D | Codex | skill installed, "can you make graphics for our football club's fan stream? site https://www.hjk.fi" | Watch-along, Finnish, club crest | 2 graphics saved, 5 min |

## Works

- Connect first: A, C and D ran doctor, the skill, whoami and login before building; consent,
  `whoami` and one `save` with read-back worked in all four. B connected inside its build turn.
- Brand from a URL (A): fetched aalto.fi, read the palette from the site CSS, pulled the logo SVG
  sprite and rebuilt the A! lockup in white, used Inter (Aalto's web font). It reported where each
  value came from, which colours it left out, and that the logo is a trademark needing permission.
  Frames would air: A! tile + white name panel + yellow rule; a strong full-screen opener.
- Local logo (B): put the badge in both graphics on a teal block, bundled Bebas Neue, authored a
  real roller-derby machine (+1/+4/-1 per team, jam, period clock, halftime, final) and showed the
  buttons before saving. Best-looking set of the four.
- Colours and font (C): downloaded Space Grotesk from the Google Fonts repository with its OFL
  text into `fonts/`. Clean, generic composition (flat navy box, amber rule).
- Crest from a site (D): fetched the HJK crest into `images/`, used it on a white tile on the
  score bug, Finnish operator buttons.
- Survives save: opened in the account's control panel, the HJK crest PNG, the Kallio badge PNG,
  Space Grotesk and the full button sets all render (screenshots `saved/*.png`).

## Check (seen, needs a decision or more evidence)

1. **First contact teaches nothing about what is possible.** A and C asked "what should I make?"
   with no example briefs and no mention that a website, a logo file or brand colours can be
   given. B (plugin, "what can I do?") answered from the skill description alone in 10 s: four
   generic examples, no connection and no brand mention. Only D tailored
   a starter set to the person's situation and asked two good questions.
2. **Brand intake depends on the model.** Opus (A, B) reported provenance, gaps and trademark
   caution; Codex (C, D) used the brand silently: no word on the club crest's rights, nothing on
   what it could not use. SKILL.md says nothing about a user's website, logo, colours, fonts or
   licences; `validator.md` claims `missing-asset` covers `images/`, which the code does not do.
3. **`bench-mark-unreadable` fired on both real logos (2 of 2)** while both read clearly on their
   tiles; B measured 2.08:1 "ink has no background of its own" for a badge that is a solid dark
   disc. Both agents overrode the warning, which teaches agents to ignore warnings.
4. **The brand never reaches the account.** Home → Brands stayed 0 after four branded sets. The
   CLI cannot create a brand (palette, font, logo), so the studio's wizard and the next agent
   session start from nothing.
5. **Not a defect: the command name.** The plugin's skill lists as `noacg:noacg-graphic` (its
   folder) and also answers to `/noacg:graphic` (its `name`); a probe plugin with a different
   folder and `name` ran under both. B's `/noacg:graphic` was right.
6. **"Is this the right account?"** Both Claude runs compared the login's account with Claude
   Code's own sign-in email and asked; B held the save for a turn. In the harness that address is
   the operator's, but in real use the two often differ too.
7. **Empty defaults look unfinished on air** (D: blank opponent, presenter banner with only a
   role). A bare `scaffold --fields` with no `=value` fails validate (`bench-entrance`).
8. Unconfirmed: one `noacg screenshot --data` frame in C showed a fallback sans; the validate
   frames show Space Grotesk. Cause not established; no font-load check exists in the bench.

## What a scripted run cannot show

Whether people find and paste the Downloads prompt; how they phrase a first request; dragging a
file into the Claude or Codex app (here the logo was a file in the folder); a person reading the
login link live in an interactive session; real playout of saved assets on OBS, vMix or CasparCG;
whether people care about the trademark line. Needs 3 to 5 people who have never used NoaCG, each
with their own brand, observed once.

## Add, ranked by user impact (smallest change each)

1. First contact and brand intake in the skill (gaps 1, 2): after connecting, offer three short
   example briefs and one line inviting a website, a logo file, colours or fonts; a short "Your
   brand" section (where to take palette, type and logo from; copy into `images/` and `fonts/`;
   logo as a swappable field; free-licence fonts only, else ask for the files; say what was used,
   where from, and what could not be used, including logo permission); fix the `missing-asset`
   row. Skill text only; verified by re-running this harness.
2. Fix `bench-mark-unreadable` for marks that carry their own background (gap 3), with the Kallio
   badge as a fixture in the validator's Node test.
3. A brand that persists (gap 4): `noacg save --brand "<name>"` writing a SavedLook with palette,
   font and logo. API and CLI change; needs an owner decision.
4. A hosted check (now possible with the repository secrets): one scheduled save of a fixture
   package with an image and a font, read back and opened in a browser, in the existing hosted
   suite.
5. Skill line on the account (gap 6) and sample defaults for team names (gap 7).
