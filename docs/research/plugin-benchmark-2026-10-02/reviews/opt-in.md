# Opt-in review, per arm (verbatim)

Reviewer: a second fresh Opus subagent that built no cell, given the real cell names, both
opt-in files (`critique.md`, `design-notes.md`), every cell's evidence, `builder-report.md`,
`opened.json` and the package sources, and the opt-in half of `../harness/rubric.md`. 123 tool
calls, 274k tokens, 7.2 min. Not blind: its question is about the arm. Its premium comparisons
are therefore secondary to the blind review (`quality-blind.md`), and where the two disagree the
receipt says so.

## C cells (critique on a copy of D)

| cell | a | b: per-claim results | c: paid-channel vs D | d: broke anything? |
|---|---|---|---|---|
| b1-news-C | yes (critique.md only) | (1) two tiers, steel title tier, location tab, rising pointed rule: **shown** (`cli-onair-video`, `studio/04-update-location-on`). (2) each tier fits its text after a wrap: **shown** (`cli-stress-video`: D's empty right half is gone). (3) more opaque plates, edge on black, per-tier motion: **partly** (the tier edge shows on black in 04; motion can't be seen in stills) | **better**: hierarchy and fit improve, and it has a mark of its own (`cli-stress-video`, 04) | no. Same 4/4 controls. The location tab text is small (22px) but readable |
| b2-hockey-C | yes | (1) team-colour chips, power-play tab led by the team chip: **shown** (`cli-onair-video`, `studio/08-action-ppA`). The navy/black club case is only **partly** fixed (builder sheet: OUL/TPS chips still dark). (2) score 42px is the largest element, labels 24px: **shown** (CSS 42 vs 34; visibly larger). (3) POWER PLAY white at weight 800: **shown** (08) | **better**: the team identity and the power play now read (08, `cli-stress-video`) | no. 12/12 actions pressed, final state fine (`13-action-final`). Validate warnings 4 to 1 |
| b3-gala-C | yes. Flag: one accidental `mcp__Claude_Browser__computer` call, no action taken | (1) four-point star with a halo as the show's mark: **shown** (`cli-onair-video`). (2) shorter, deeper scrim with no hard edge: **partly** (barely different over the video ground; clear on the bright ground in `builder-before-after`). (3) motion retuned to 2.2 s in / 0.8 s out: **not shown** in frames (confirmed only in JS) | **slightly better**: it now says "Valon" (light), and the bright-ground shelf is gone | no (`studio/04-update-long-line-finnish` and stress are fine) |
| b4-quiz-C | yes | (1) bigger answers, question and timer: **shown** for answers and question (`cli-onair-video`), **partly** for the timer (`03-timer-running`). (2) new Next question button: **shown** in `inspect.txt` (5 buttons) and the walk. (3) bulb rows fade at their ends: **partly** (faint in `cli-onair-video`) | **worse on air**: the new path clips a long question top and bottom (`studio/05-next-question-button`, `06-after-actions`, `07-next`). D's retake fits the same question on 2 lines (`b4-quiz-D/studio/05-next-question-retake`). Otherwise slightly more readable | **yes**: long text through the new Next question button is clipped (05/06/07). The builder listed it as untested, and validate passed it (0/0) |
| b5-ticker-C | yes | (1) echo-ring cap on the chip, echo separator, cap kept in a bulletin: **shown** (`cli-onair-video`, `studio/05-bulletin`). (2) lighter panel with a top edge line: **partly** (subtle; visible on the dark row of `builder-before-after`). (3) one chip width for all labels: **not shown** (no TIEDOTE frame; `min-width:196px` in CSS) | **slightly better**: a modest show-specific motif, otherwise the same strip | no. 2/2 actions pressed, the crawl survives clear (`06-bulletin-cleared`) |
| b6-results-C | yes | (1) background covers ~95%: **shown** (darker, even ground in `cli-onair-video`). (2) race name on a snow-white band with a cyan tab: **shown**. (3) DNF/DSQ grey instead of cyan: **shown** (`studio/03`, `04`). (4) rows wipe from the board's edge, 0.10 s stagger: **not shown** (needs motion). **No before/after sheet** | **better**: the head reads as TV sports and the winner is no longer outshone (`cli-onair-video`) | no new break. But D's long club, shrunk to near-unreadable size ("Pohjois-Pohjanmaan Hiihtoseura", `studio/04`), was missed by the critique ("long text passes") and kept |

## G cells (fresh build with the guidelines)

Exit timing below is how much faster the exit is than the entrance; the guideline band is
30-60% faster.

| cell | a | b: rules checked (against design-notes.md) | c: differs from D? and paid-channel verdict |
|---|---|---|---|
| b1-news-G | yes (design-notes.md only) | name 54/700 and title 30/500, ratio 1.8: pass. Location 28px at 70% white: pass. One accent (left rule): pass. 120/119 inset: pass. Out-eases (power3.out in, power2.in out): pass. Exit 0.45 s for a 1.14 s entrance, 61% faster: borderline miss. Strap hugs its text: **miss** (empty right band at the 1200px cap in `cli-stress-video`). Same layout as the scaffold: the builder admits it | **hard to tell apart** from D (`cli-onair-video` of both). **Same** |
| b2-hockey-G | yes (also opened control.md) | 120px inset: pass. One accent (amber, POWER PLAY only): pass. Tabular digits: pass. Corner-bug floor (24px labels, 74% white): pass. Entrance 0.85 s power3.out: pass. Exit 0.3 s, 65% faster: minor miss. Long names end in an ellipsis: workable | small differences from D (inset, period inline, amber power play), otherwise the same dark bar with team stripes. **Same**. The critique (b2-C) did more for the brief |
| b3-gala-G | yes | 84/40 ratio 2.1: pass. Weights 500-600: pass. Kicker 20px at 0.22em: minor miss (tracking over 0.2). One accent (gold ornament): pass. Dim text 78%: pass. Ceremonial 1.9 s build: allowed. Exit 0.55 s, 71% faster: **miss**. 120 inset: pass | **clearly different**: a centred, framed card instead of D's open type over a scrim. **Same overall**: cleaner hierarchy, but the boxed "invitation card" is a stock answer and covers the picture centre (stress grows it to about 1360x540) |
| b4-quiz-G | yes | One accent (yellow, correct answer only): pass. No accent text on an accent fill: pass. Tabular digits: pass. Board at the 120 inset: pass. back.out pops, no bounce: pass. Question 72 vs answers 52, ratio 1.4: **miss** if answers count as secondary text. Exit 0.4 s, 69% faster: miss | **clearly different** from D, but the result is the generic dark indigo card with a sans. **Worse**: it loses D's distinctive, fun red-and-gold marquee look, and a 3-line question crowds the answers (`studio/05-next-question-retake`). Equal readability |
| b5-ticker-G | yes | One accent (teal label), bulletin red as a separate token: pass. Label 28px on the "ON AIR" floor, headlines 34px: pass. Linear only for the crawl: pass. 0.7 s in / 0.4 s out, 43% faster: pass. 120 inset: pass | **different look** (teal block, Space Grotesk), equally generic. **Same**. The bulletin keeps the "UUTISET" chip where D switches to HUOMIO (`studio/05-bulletin`) |
| b6-results-G | yes | Race 76 vs names 40, ratio 1.9: pass. 28px floor (fit ladder stops at 28px, then wraps): pass. One accent (gold winner tile): pass. Tabular digits: pass. Stage at top 120 / left 180: pass. Stagger 70 ms: pass. Exit 0.5 s, 63% faster: minor miss | **different**: Inter, plain grey rows, no medal colours. **Slightly worse** on "national TV sports" character. **Better** on long text (the club wraps where D/C shrink it to near-unreadable, `studio/04`) and handles ties |

## D cells

All six `opened.json` show neither opt-in file (`optInOpened: []` in b1, b2, b3, b4, b5 and b6):
yes.

## Summaries, as the reviewer wrote them

**Critique.**

- It does what it claims in all six cells: renders, judges against the brief and the paid bar
  (the right defects each time: generic plate, weak power play, empty band, flat ground,
  outshone winner), makes three or fewer changes, and keeps the operator surface.
- It produced a before/after sheet in 5 of 6 cells. b6-C made none.
- The result beats the default in 5 of 6 (b1, b2, b6 clearly; b3, b5 a little). The changes are
  visible in frames except motion-only ones.
- It failed on b4-quiz-C: the critique added a Next question button whose path clips a long
  question (`b4-quiz-C/studio/05-07`). The builder flagged it as untested, and validate passed it.
- It also missed D's near-unreadable shrunken club in b6 and only partly fixed dark club colours
  in b2.
- The tool asks for three grounds but the CLI ships one, so builders scripted their own
  composites.

**Guidelines.**

- The switch works mechanically: all six builders opened design-notes.md (and not critique.md)
  and applied its numbers.
- The numbers hold in CSS: type ratios ~1.8-2.1, floors, one accent, the 120px inset,
  out-eases, tabular digits.
- Common misses: exits 61-71% faster than entrances (outside the 30-60% band in 5 of 6), b1's
  plate not hugging its text, and 0.22em kicker tracking in b3.
- Following them barely changes the result. b1 and b2 are hard to tell from D. b3, b4, b5 and b6
  differ, but towards a plainer, safer "dark card, one accent, sans" look.
- On the paid-channel question G is the same as D in four cells and slightly worse in two (b4
  loses the quiz's fun marquee identity, b6 loses the sports character). Its one gain is
  long-text handling in b6.
- The guidelines enforce restraint and legibility floors but do not produce distinctiveness. The
  critique tool did more for quality.
