# J - the classroom package, walked on noacg.studio

Branch `claude/j-classroom-live-walk`, worktree `.claude/worktrees/agent-aba5440380798089f`, based on
`60b3e8d1` (E's merge). Night wave 2026-09-24, row J. Owner walk:
`docs/acceptance/owner-queue/2026-09-25-j-classroom-live-walk.md`.

## Outcome

Every dashboard step the README describes worked on https://noacg.studio, as a logged-out student
in a fresh Playwright profile at 1366x768, with the SVGs taken out of the zip. The console had no
errors in any run. Three things a student would trip on were fixed in the package, and the zip
was rewritten. Three smaller product defects are filed in `docs/backlog/`.

## What the live site was running

`https://noacg.studio/version.json` read `60b3e8d1` (E's merge, `builtAt` 2026-09-24T23:54:21Z,
`deployedCommitIsCurrent: true`) at 23:57Z, about four minutes after the merge was pushed.
C had landed before E (`c8754c1e`, PR #408), and so had A (`8ba061ad`) and B (`5acfa2d0`). All
three are ancestors of `60b3e8d1`, so the deploy carried E's and C's work. No wait was needed.

Four browser runs, all through the job queue:

| Run | UTC | Site commit | What it imported |
| --- | --- | --- | --- |
| walk 1 | 00:00-00:02 | `60b3e8d1` | the zip /downloads served (E's, 22 files, `4dfb214b`) |
| probe | 00:16-00:17 | `60b3e8d1` | the repo SVGs, for the four extra checks below |
| walk 2 | 00:21-00:23 | `60b3e8d1` | the first repack (README fixed, 22 files) |
| walk 3 | 00:37-00:38 | `b9c97787` (H's #414, built 00:25Z) | the final repack (23 files, `d5a06193`) |

Walk 2 and walk 3 still downloaded from /downloads, which served E's zip, and then unzipped the
local repack. The repack is not on the site until this branch lands.

## Each step, walked or not

Every step below was WALKED in walks 1, 2 and 3. The screenshots are in
`docs/handoffs/2026-09-24-j-classroom-live-walk/`: 01 to 26 from walk 2, 28 to 30 from walk 3.

| Step | Walked | Screenshot |
| --- | --- | --- |
| /downloads#classroom shows the card, the zip downloads | walked | `01-downloads-page.jpg` |
| Five SVGs imported into one production, "Quiz Night", five cues on L20-L24 | walked | `13-rundown-five-cues.jpg` |
| Show intro Take | walked | `14-intro-take.jpg` |
| Show intro Out | walked | `15-intro-out.jpg` |
| Name tag Take for the host | walked | `16-name-tag-1-host.jpg` |
| Name tag retyped and Updated, guest 1 | walked | `17-name-tag-2-guest.jpg` |
| Name tag retyped and Updated, guest 2 | walked | `18-name-tag-3-guest.jpg` |
| Quiz Take with B keyed as correct | walked | `19-quiz-take.jpg` |
| Quiz: pick B under Selected answer, Select answer | walked | `20-quiz-select.jpg` |
| Quiz Lock it in | walked | `21-quiz-lock.jpg` |
| Quiz Reveal correct: B green, A, C and D red | walked | `22-quiz-reveal.jpg` |
| Score tracker Take at 0-0 | walked | `23-score-take.jpg` |
| Score +1 twice for team 1 | walked | `24-score-plus-one.jpg` |
| Score -1 for team 1, +1 for team 2 (1-1) | walked | `25-score-minus-one.jpg` |
| Score name edit to AINO and Update | walked | `26-score-name-edit.jpg` |
| Credits: the English list pasted through the clipboard, Heading CREDITS, Take | walked | `28-credits-pasted-and-taken.jpg` |
| Credits rolling | walked | `29-credits-rolling-mid.jpg` |
| Credits rolled to the end: 32 rows, 30.0 s, the tween at 1 | walked | `30-credits-rolled-to-end.jpg` |

Walk 3 pasted `credits-english.txt` from the zip, with its CRLF line ends. The Finnish default in
the Credits box, "TEKIJÄT" and the Juontaja list, was checked before each paste.

## What the extra checks found (the probe)

- **Select answer with no letter picked.** The old README said "Take. Then Select, Lock and
  Reveal". Pressed that way, the chip says "Answer selected" and nothing changes on air
  (`p05-quiz-select-no-pick.jpg`). Picking the letter afterwards and pressing Select again works.
  **Fixed in the README.**
- **Credits copied out of README.pdf.** The PDF loses the empty line before "Quiz Night 2026",
  so that line rolls straight under "Producer: Mika Mäkelä" as a second producer
  (`p11-credits-pdf-copy-tail.jpg`). **Fixed** with `credits-english.txt` in the zip.
- **The intro Title retyped.** It stays centred at every length: the text's centre over the frame
  width was 0.5000 for QUIZ NIGHT, FINAALI, QUIZ NIGHT FINAL and KOULUN TIETOVISA 2026. The
  Fields step still calls it "Aligned right, middle" (`p01-intro-fields-settled.jpg`). **Filed.**
- **Full time on the score tracker.** The board draws no Full time, but the button is there.
  Pressing it sets "Final" and changes nothing visible (`p09-score-full-time.jpg`). **Filed.**

Also seen and filed: at 1366 wide the production top bar shows "Quiz Night" as "Quiz ...".

## What changed in the package

- `README.md`: the Quiz line says to click the player's letter under Selected answer, then press
  Select answer, Lock it in and Reveal correct. The credits paragraph says to copy from
  `credits-english.txt` rather than the PDF, and to change the Heading to CREDITS. The folder list
  names the new file. README.pdf is still one page.
- `scripts/illustrator/pack-classroom-package.mjs` (a small edit to E's tool, outside this row's
  listed files, decided here): it cuts the README's one code block into `credits-english.txt`,
  so the list is written in one place only. It also zips `.md` and `.svg` with LF. It used to
  zip the working tree as it stood, so a Windows autocrlf checkout put CRLF in. E's zip had
  `end-credits.svg` with CRLF and the other four with LF.

## The zip's final state

`NoaCG-classroom-package.zip`, 1,201,604 bytes, SHA-256
`d5a0619346fc963381751fef8a5bfca2d4b8a58a55cb8e21c6f7d5beb5b134e7`, the same bytes in all three
places: `C:\Users\ahonemi\Downloads\`, `C:\downloads\` and `public/downloads/`. It holds 23
files: README.pdf, README.md, credits-english.txt, five .ai files, five SVGs and ten previews.
I unzipped it again afterwards. The 22 files other than the text file are byte-identical to the
repo, the text files are LF, and `credits-english.txt` matches the README block exactly, with 21
CRLF lines and no trailing newline. The owner's copy is ready to upload now. The site serves it
once this branch lands.

## Filed

- `docs/backlog/score-tracker-offers-full-time-it-does-not-draw.md`
- `docs/backlog/fields-step-reads-a-centred-title-as-right-aligned.md`
- `docs/backlog/production-topbar-cuts-a-ten-letter-name.md`

## Not done, and why

- Nothing checks that README.pdf was printed from the current README.md. `downloads.spec.ts`
  compares README.md and the SVGs in the zip but not the PDF (a review finding). A spec change
  belongs to its own row.
- The walk left the "Help improve NoaCG" consent card unanswered, and it covers the bottom right
  of every screenshot. Nothing the steps prove sits under it.
- `downloads.html` still lists the zip as "Illustrator (.ai), SVG, PNG and PDF". The new text
  file is not named there. That file is outside this row.
- Not walked by hand in a desktop browser. All four runs were Playwright's.
- The walk instrument, `e2e/j-live.local/` (`classroom-live.spec.ts` and `probe.spec.ts`), is
  gitignored and stays in this worktree.

## Check

`review: delegated` (code-review skill, handed `review-request.mjs`'s scope: merge base
`60b3e8d1` and 29 files. The scope was checked and matched. It found 10 things: 8 are fixed in
`cdda18c7`, 2 are deferred above). `simplify: inline` (the skill returned fan-out instructions.
One change: the zip entry date is now declared before the function that uses it). `verify:
inline` (`npm run build` exit 0 on `a2a6ceb8`, `e2e/downloads.spec.ts` and
`e2e/classroom-package.spec.ts` 6 passed as j-1906, and walk 3 on the live site). `taste: not
applicable`: no graphic changed, only the README, the zip and the pack script.

Build stamp: `dist/version.json -> claude/j-classroom-live-walk@a2a6ceb8`.
