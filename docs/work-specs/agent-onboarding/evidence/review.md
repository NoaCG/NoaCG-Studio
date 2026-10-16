# Review: agent onboarding skill text, 2026-10-16

Reviewer who did not make the runs or the change. Reviewed revision
`673592b8bf0d5b5ae1e98bcf08cad3175dd4a634` (the branch tip: the 0.12.2 release commit `817dddd69`
plus a font-licence wording fix in SKILL.md and the account line recorded in the spec).

## What I read and checked

- `spec.md` (AC-1 to AC-4), `evidence/baseline-runs.md`, `evidence/branch-runs.md`.
- The diff from the merge base `df78ff219` to the tip: `cli/skill/noacg-graphic/SKILL.md`,
  `references/validator.md`, `references/setup.md`, the generated plugin copies, the version bump
  and the 0.12.2 changelog entry.
- `node cli/scripts/build-skill.mjs --check` at the tip: "30 generated files match the source
  (noacg v0.12.2)". The plugin copy differs from the source only in its frontmatter (`name:
  graphic` and an `argument-hint`), which the build writes on purpose.
- The `validator.md` correction against the code: `validateTemplate.ts` raises `missing-asset`
  only for `assets/` and `lottie/` paths, and `publishGate.ts` (which the bridge's validate uses)
  promotes it and `external-dependency` to errors. The new rows are accurate.
- `scripts/agent-prompt.mjs` takes the Downloads prompt's pin from `cli/package.json`, now 0.12.2.
- The raw runs in the session scratchpad (`runs/E..H`): each user turn, each final answer, the
  Claude `init` record and `tools/trace.mjs` for E, and the work folders. Account addresses in
  the answers are not reproduced here.
- That the runs read the reviewed text: the packed CLI used by F and G
  (`pkg/noacg-cli-0.12.1.tgz`) carries a SKILL.md identical to `817dddd69` except the version
  pin; G's own saved copy of `docs skill` contains both new sections; H's copied skill folder
  matches the committed plugin copy except the version pin; E's Skill tool result contains
  "Offer a start" and "The user's brand". The later font-licence rewording (OFL "most Google
  Fonts carry" instead of "any Google Font") was not in the text the runs read; it narrows a
  claim and does not change what the criteria observe.
- Fonts: every `fonts/` folder in F, G and H. Frames: F `shots/next/sample.png` and
  `shots/strap/sample.png`, G `shots-scoreboard/onair.png`, H `score-final-shots/onair.png`.

## Verdict per criterion

**AC-1: pass.** F (Claude) and G (Codex), after doctor, skill, whoami and login, each asked what
to make with the three owner-chosen briefs word for word and the brand line ("You can paste your
website, put a logo or pictures in this folder, or name your colours and fonts..."). Each named
the connected account once and compared it with nothing, which also covers the account line now
in behaviour 1.

**AC-2: pass, with a limit.** In E the first tool call was the Skill tool, loading the NoaCG
skill, then `setup.md`, doctor and login; the answer named the account, said what NoaCG makes,
gave the three briefs and the brand line, and asked what to make. Limit: at the time the plugin's
skill folder was named `graphic`, so the call was `noacg:graphic`; in the landed layout the same
skill lists as `noacg:noacg-graphic`. The skill text and description were identical (checked via
H's copy), and the description is what triggers loading, so I judge the evidence valid for the
landed text. It is still a run on a layout that does not ship; one re-run of E on the released
plugin would close that.

**AC-3: fail.** The criterion asks that each final report of the website brief and the
local-logo brief names the values used with their source, what could not be used, and the logo's
rights. F (Claude, website) does all of it: colours from flowfestival.com's stylesheet, the
undated header logo with the dated variant left out, Flow's commercial typefaces not used and
Archivo bundled instead, and a rights line. G (Codex, local logo) does not: its final report gives
no rights line and nothing on what could not be used, and its only source statement ("your logo's
teal and hot pink" in the build turn) attributes to the logo colours the user named in the brief.
The receipt calls G "partial"; by the spec's wording that is a fail, because the skill asks for
the rights line on every logo and the Codex local-logo run is half of what the criterion needs.
H (Codex, HJK crest, beyond the criterion) names sources and the crest's rights, but says nothing
on what it could not use, although HJK's stylesheet also uses Libre Caslon Text and font variables
for Futura and a club font (`--font-klubi`); the receipt's "Pass" for H overstates it. Fonts pass: F carries `Archivo-OFL.txt`,
G `Bebas-OFL.txt`, H `League-Spartan-OFL.txt`, each beside the scaffold's `FONT_LICENSES.md`.
Frames: F's full-screen card and strap are as the receipt describes (Flow wordmark, yellow plate,
white or black time plate, stepped yellow corner). G's scoreboard shows the Kallio badge on a
white disc inside a dark teal board, team names in Bebas Neue, a pink base rule. H's score bug
shows the crest beside a blue bar with an empty opponent row; the crest stands on no surface of
its own and was only seen on the white test background.

**AC-4: unverified.** `build-skill --check` passes and the prompt pin follows `cli/package.json`
(0.12.2), but `noacg docs skill` from the released CLI cannot be observed until this branch lands
and 0.12.2 is on npm.

## D1 and other findings

- D1 holds. The new text acts only on a brand the user gives ("never invent one they did not
  give"); "a surface it reads on" is legibility, not a look. The three briefs are offered to the
  user, not given to the agent as defaults.
- Overclaim in `branch-runs.md`: "in the baseline, one run of four did" carry font licence text.
  A, C and D used scaffold fonts covered by `FONT_LICENSES.md`, C added Space Grotesk's OFL, and
  B's Bebas Neue is covered by the Dharma Type notice and OFL text in that same file. The
  baseline was not as bad as stated; the branch runs' explicit per-font licence files are still
  an improvement for fonts outside the bundled set (League Spartan).
- Not caused by this change, seen again: `bench-mark-unreadable` on both real logos; H saved twice;
  H's empty opponent row on air (baseline gap 7).

## Limits

One run per case on one machine with scripted user turns; I read logs and frames and did not
re-run anything. AC-3's fix needs either a skill change that makes the report lines hold for
Codex on a user's own logo, or an owner decision that the rights line is not needed for a logo
the user owns, followed by a Codex local-logo re-run.

## Status

`node scripts/work-spec.mjs status docs/work-specs/agent-onboarding/work.json` after recording
this review:

```
{
  "status": "open",
  "counts": { "problems": 0, "gaps": 2, "openCriteria": 2 },
  "problems": [],
  "gaps": [
    "AC-3: fail; continue its task or add a gap task",
    "AC-4: unverified; continue its task or add a gap task"
  ],
  "openCriteria": ["AC-3", "AC-4"]
}
```
