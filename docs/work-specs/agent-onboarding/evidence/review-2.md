# Second review: agent onboarding skill text, 2026-10-16

Reviewer who did not make the change or the runs. Reviewed revision
`b9d267bc8f5bba6ac2f3e792ad8f1e6d93f01a20` (branch `claude/agent-onboarding-skill`), after the
first review (`review.md`, revision `673592b8b`) failed AC-3 and the skill text changed.

## What I read and checked

- `spec.md` at the tip, and its diff since the first review: the third example brief now says
  "purple and coral", and behaviour 3's report line now asks for the rights line only for a logo
  or crest that is not plainly the user's own.
- The diff of `cli/skill/noacg-graphic/SKILL.md` since `673592b8b`: a shorter description, the
  purple and coral brief, the "final report" paragraph pointing at the brand lines, and the
  "Report it" bullet rewritten (final message with the links, a colour the user named is theirs,
  what could not be used or that all was, the rights line for a logo not plainly the user's).
  The plugin copy carries the same change.
- `evidence/baseline-runs.md`, `branch-runs.md`, `review.md`, `rerun.md`.
- Raw runs in the session scratchpad: E, F, G, H (v2), I, J, K (v3) and L (v4). For each I read
  the user turns and the final answers; for E, K and L I read the tool trace (`tools/trace.mjs`);
  for L also the validate and save outputs from the stream. Account addresses in the answers are
  not reproduced here.
- Fonts: F's two `fonts/` folders (Archivo woff2 files, `Archivo-OFL.txt` with the full OFL, the
  scaffold's `FONT_LICENSES.md`) and L's two (`BebasNeue-Regular.ttf`, `BebasNeue-OFL.txt` with
  the Dharma Type notice and the full OFL, `inter.woff2` covered by `FONT_LICENSES.md`). L's
  `images/logo.png` is byte-identical to the user's `kallio-rollers-logo.png`.
- Frames, looked at by me: L `shots/halftime/example.png` and `shots/penalty-box/example.png`.
- Commands at the tip, all passing: `node cli/scripts/build-skill.mjs --check` ("30 generated
  files match the source (noacg v0.12.2)"), `node cli/scripts/release-notes.mjs --check`
  ("@noacg/cli 0.12.2 has notes a person can read (218 words)"), and
  `node --test test/unit.test.mjs` in `cli/` (66 pass, 0 fail, including "the default skill
  names no house look" and "the plugin costs an unrelated session one short skill entry").
- Whether Space Grotesk, named in the third brief, is a NoaCG house face: it is
  (`NoaCG-Brand-Kit/BRAND-MANUAL.md` and `src/brandCore.css` give it the wordmark and display).

## Verdict per criterion

**AC-1: pass.** Codex L, on the tip's text through the Downloads prompt, answered after doctor,
skill, whoami and login with the account named once, the three briefs word for word as the spec
lists them now, and the brand line. Claude F did the same on the text before the third brief
changed, so its third brief said "navy and amber". I count F because the only difference is the
three example words; the behaviour the criterion observes (offer three briefs and the line, name
the account once, compare it with nothing) is unchanged, and Claude K reproduced the current
three briefs and the line word for word from the same skill section.

**AC-2: unverified; stays open until a run on the released 0.12.2.** The criterion needs one
Claude run with the plugin that loads `noacg:noacg-graphic`, connects, and answers with
behaviour 1. No run does all three on what ships. E connected and offered the start, but it ran
with the skill folder named `graphic` (it called `noacg:graphic`) and with the older, longer
description, which is the part that decides loading and which changed afterwards. K ran on the
real layout and current description, loaded `noacg:noacg-graphic`, described NoaCG and gave the
three briefs and the line, but did not connect, because npm has no 0.12.2 yet, so it named no
account. Each step has been seen, but not in one run on the shipped text, and the missing
observation is cheap: the same post-release run AC-4 needs anyway.

**AC-3: pass, judged on the spec's current wording.** F (Claude, website): its final report,
the one with the links, gives the colours from flowfestival.com's stylesheet (yellow `#fff203`,
black, white), the undated header logo `iso-logo.svg` with the dated variant left out, Flow's
commercial typefaces as not used and Archivo bundled instead with its OFL text, and that the Flow
logo belongs to Flow Festival so the user needs the right to show it on air. L (Codex, local logo
and a commercial font): its final report says "Used your supplied logo, teal and hot pink, and
bundled open-source Bebas Neue", that Helsinki Grotesk Pro was not available to bundle so Inter
stands in for the sponsor line, and that this substitution is unconfirmed. The logo and colours
are the user's own, so under the current wording no rights line is owed; Bebas Neue carries its
OFL text. The halftime frame is as `rerun.md` describes: a dark teal card, the badge on a white
ring top left, "HALFTIME" in hot pink, team names and large white scores split by a pink rule,
the sponsor line under a teal rule. The penalty-box frame is a dark teal bar with a pink top
rule and teal left edge, the badge in a white ring, "PENALTY BOX" in spaced pink capitals, the
number in teal beside the name in white, and the penalty below.

Does F still count after the report rule changed? Yes. The later text adds instructions (where
the lines go, that a named colour is the user's, "or that you used all of it") and narrows one
(the rights line only for a logo that is not plainly the user's); it removes nothing F relied
on, and F's report meets every clause of the current wording. The narrowed rights line is the
one risk: in F the user runs a stream for Flow and says "our brand", and an agent on the new
text could read Flow's logo as the user's own and drop the line. That is untested for Claude.

**AC-4: unverified.** The parts checkable before release pass at the tip: `build-skill --check`,
`release-notes --check`, the CLI unit tests, and the Downloads prompt's pin follows
`cli/package.json` (0.12.2). `noacg docs skill` from the released CLI cannot be observed until
this branch lands and 0.12.2 is on npm.

## D1

D1 holds in substance: the brand section acts only on a brand the user gives, the D1 unit test
passes, and the three briefs are offered to the user, not given to the agent as defaults. One
inconsistency: navy and amber were removed from the third brief because they are NoaCG's own
palette, but the same brief still names Space Grotesk, NoaCG's own wordmark and display face.
The D1 test's typeface list does not include it. By the reasoning used for navy and amber it
should go too; it was owner-chosen text, so this is the owner's call.

## Problems

1. The spec's behaviour 3 was relaxed after the failing review (the rights line now only for a
   logo not plainly the user's own). The commit gives the reason but records no owner decision,
   and `work.json`'s authority is unchanged. The change reads as the spec's intent (a trademark
   warning about the user's own logo is noise), and I judged AC-3 on it as asked, but the owner
   should confirm it.
2. Space Grotesk in the third brief, as above.
3. `branch-runs.md` still marks E "Pass" for AC-2 without saying that the description it loaded
   on has since changed, and still says G "used the logo and its teal and hot pink", repeating the
   misattribution the first review found (those were the user's named colours).
4. `rerun.md` leaves out that L's mid-run message said "I'll use its teal and hot pink", crediting
   the user's colours to the logo again; the final report no longer does. It also does not
   describe the penalty-box frame. Neither changes a verdict.
5. L's report says the screenshots "were visually checked"; the Codex stream holds only messages
   and shell commands, with no image-viewing event, so I cannot confirm that from the log. The
   layout fix it made came from the validator's `bench-overlap` error. L's reason for Helsinki
   Grotesk Pro ("wasn't available with a bundling licence") is loose: it had no files at all.

## Limits

One run per case, on one machine, with scripted user turns, as in the earlier receipts. Codex
local-logo intake passed once on the final text (L) after two earlier runs on older text (G, I)
fell short, so its reliability is not established. I read logs, folders and two frames, and
re-ran no agent. F's frames I did not reopen; the first review described them.

## Status

`node scripts/work-spec.mjs status docs/work-specs/agent-onboarding/work.json` after recording
this review reports `open` with no problems and two open criteria, AC-2 and AC-4, both
unverified.
