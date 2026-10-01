# The operator page buries a graphic's live actions under its setup fields

**Filed:** 2026-10-02. **Source:** measurement, the studio walk of the hockey scorebug
(`docs/research/plugin-graphics-quality-2026-10-02/brief-2-hockey/01-ready-page.jpg`,
`03-goal-a-then-pp-b-page.jpg`; README failure 3). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-5 and AC-6.

## Why

The brief asked for a scorebug one person can drive quickly. On the Playout page at 1600x900 the
buttons pressed all game (Start clock, Stop clock, Goal) sit below twelve inputs, three of them
words set once per show (POWER PLAY, END, FINAL), below the fold, next to a snap picker listing
fourteen internal states. The score has three controls (Goal, the field's - / +, Live numbers).
Machine events have no shortcuts; Take has SPACE. A graphic that works perfectly is still slow to
operate.

## What it would take

Two halves with different owners.

- **Skill (cli/skill):** teach live versus setup. Set-once words go in `hidden` word sources (the
  contract already has them, `references/contract.md`, and `references/control.md` says they stay
  off the operator page); a counter is a number; defaults are safe samples or empty. `noacg inspect`
  prints LIVE and SETUP groups so the agent sees the operator's view.
- **Control panel (src/control, its own row):** when a graphic declares operator events, put them
  above the setup fields, fold setup fields once set, and let an event carry a shortcut the panel
  shows. Done when the brief-2 zip, walked with
  `docs/research/plugin-graphics-quality-2026-10-02/harness/`, shows clock and goal buttons without
  scrolling at 1600x900.

## Evidence

The two page shots above; `brief-2-hockey/walk-log.txt` (the panel text in order);
`brief-4-quiz/06-next-reveals-program.png` (a free-text "Question 7" that stays on the next
question).
