# The Playout page buries a graphic's live actions under its setup fields

**Filed:** 2026-10-02. **Source:** measurement, the studio walk of the hockey scorebug
(`docs/research/plugin-graphics-quality-2026-10-02/brief-2-hockey/01-ready-page.jpg`,
`03-goal-a-then-pp-b-page.jpg`; README failure 3). **Re-sorted:** 2026-10-02 against D1:
rewritten as a playout-session item. The skill half (live versus set once, hidden word sources,
counters as numbers, safe or empty defaults) landed with the D1 skill change; the `inspect` half
moved to `cli-frictions-from-the-four-brief-walk.md`. **Owner:** a playout-session row in
`src/control` (the control panel model and the Playout page). Filed, not built. Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-6.

## Why

How a graphic works in the control panel is NoaCG's job under D1, and the brief asked for a
scorebug one person can drive quickly. On the Playout page at 1600x900 the buttons pressed all
game (Start clock, Stop clock, Goal) sit below twelve inputs, below the fold, next to a snap
picker listing fourteen internal states. The score has three controls (Goal, the field's - / +,
Live numbers). Machine events have no shortcuts; Take has SPACE. A graphic that works perfectly is
still slow to operate, and a skill that now teaches agents to keep set-once words off the page
cannot fix the order the page draws in.

## What it would take

When a graphic declares operator events, the Playout page draws them above its setup fields, and
the setup fields can fold once set. An event can carry a keyboard shortcut the panel shows. The
snap picker stays a recovery tool, out of the live block. Done when the brief-2 zip, walked with
`docs/research/plugin-graphics-quality-2026-10-02/harness/`, shows the clock and goal buttons
without scrolling at 1600x900, and a graphic with no events gets the panel it gets today.

## Evidence

The two page shots above; `brief-2-hockey/walk-log.txt` (the panel text in order);
`brief-4-quiz/06-next-reveals-program.png` (a free-text "Question 7" that stays on the next
question, the counter case the skill now teaches as a number).
