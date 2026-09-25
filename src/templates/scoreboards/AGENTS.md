# src/templates/scoreboards - the scoreboards and match boards

## scoreboards/ - the two-team boards

sb01…sb25 plus **dc01** (prefix 'scoreboard', data blocks via convertToDataRegion;
the fixed 4-field contract f0-f3 as scoreboard-masks so the standard presets drive them;
update() pops a score's mask when it changes on air - speed via motionSpeed()).
**A design may OWN its fields instead** (`SbDesign.fields`), plus `.popFields` (which fields
pop), `.lineCount` (how many masks the presets choreograph) and `.runtimeExtraJs`
(design-owned JS outside the marked region) - all optional, and a design declaring none emits
byte-identically to before they existed. That is what lets the SPORTS PACK's bigger boards
(docs/SPORTS_PACK.md) share this assembler: a match board adds a clock, a period, crests and
club colours, and a match-event card is not a two-team graphic at all, but all of them are
still scoreboards. Field contracts + the fragments that carry machinery live in
**scorebugShared.ts**; the team-colour lift and the period-breakdown rebuild in
**boardRuntimes.ts**. `clipOneLineCss()` documents a real trap: the assembler's own
`.scoreboard-mask > span { text-wrap: balance }` resolves to `text-wrap-mode: wrap` and
OUTRANKS a plain `white-space: nowrap`, so a long club name wraps and grows a fixed strip
mid-match while looking as though the nowrap was never written.
sb23-sb25 are the reference-set boards: **sb23 "Wire Bug" fills the scorebug type's EDITORIAL
cell** (a row of flat cells whose ground is the club colour, with the three kinds of number
told apart by grounds MIXED from the palette rather than written as hex - which is what keeps
it legible in a palette it was not drawn in), sb24 "Arena Board" draws the venue's own
hardware, and **sb25 "Court Board" is the one to read before inventing a field**: its
fouls-and-timeouts strip is the match board's existing `periods` breakdown, because
"FOULS | 4 | 2" already IS "label | home | away". A tally that fits the repeating field is
never a reason to grow the contract.
**dc01 "Debate Floor" is here because a debate is a two-sided contest**, and it is where this
assembler's stretch is furthest: the speaking-timer type (types/speakingTimer.ts) browses as a
TIMER, not a scoreboard (`TYPE_META` in templates/meta.ts settles that - the assembler and the
browse category answer different questions), and it declines two of the assembler's defaults.
`matchClock: false` opts out of the shared single-clock runtime, because a board that runs a
DIFFERENT number of clocks would otherwise ship ~250 lines that can never find an element to
paint; and `boardOffAir()`, called from `stop()`, is how a design that STARTED something gets
told the graphic is down, so a clock it began does not keep ticking after the board is off.
Both are guarded and both are absent from every other board, which emit exactly what they did.
**ITS TWO CLOCKS ARE ON THE WIRE, and the design's markup is the whole contract.** The running
one's value carries the instant it was true (`"03:12@<epoch ms>"`), exactly as the single match
clock's does, so a renderer rebuilding from a report snapshot mid-speech comes back at the right
second instead of at the allowance. `data-speaking="a" | "b" | "allowance" | "penalty"` on the
four elements is how `control/matchClockWire.ts` finds them — **which of the two is running is
never asked of the machine: the STAMP is the pointer**, at most one clock carries one, and
`switch` moves it. `speakingClockUpdate(key, value)` (the guarded per-field hook in `shared.ts`,
beside `matchClockUpdate`) is the engine's half, and it tells the three kinds of arriving value
apart the way the match clock does — stamped, plain, and a resend of the cue's own text.
**Its two halves are `flex: 1 1 0`, never a px basis** - the owner's 2026-08-23 ruling that a
two-sided board gives both sides equal space and wraps a long name inside its own half rather
than sizing the graphic by it (benchmarks/agent/rounds/2026-08-22/VERDICT.md).
**sb26-sb28 are the DUEL SCORE** (types/duelScore.ts; sticker, showtime and arcade): two
players, a quiz show's running score. Their contract and runtime live in **duelShared.ts** - the
four fields labelled Player and Score, and a `rebuildScoreboard()` that marks the LEADER as a
class on the root (`scoreboard-lead-a` / `-b`, neither on a tie) by comparing the two numbers on
every write. Who leads is never a field or a state. They set `matchClock: false` and so declare
their own `markFinal()`. A point rides a parallel group of one state with self-transitions, so
scoring never replays the entrance. All three are drawn symmetric top to bottom, because where
the strip sits is its ZONE: top-centre by default, bottom-centre from the wizard's Position grid.

### shared/matchClock.ts - the SPORTS CLOCK

It lives in `shared/` and is documented here because the match boards are what drive it.
Design-owned JS outside the marked region (the
shared/clock.ts rule: playout, not motion). Counts UP or DOWN per the design's
`data-count`, stops itself at zero when counting down, resets to the element's own
`data-start` (never zero-by-assumption), and re-seeds from the clock FIELD when an operator
types a correction - a live clock drifts from the stadium's, and one that cannot be corrected
stops being trusted. **It re-seeds only on a CHANGED value**: the wire resends the cue's whole
value set on every Take/Update/Snap, so an unguarded re-seed pulled a running clock back to
its typed time on every score bump. The element's text is the PAINTED time and so differs from
a resend every second - the discriminator is the last value RECEIVED, which the runtime
remembers.
**TICKING IS DISPLAY, NOT STATE** (2026-08-19, docs/SPORTS_PACK.md): the clock's truth is a
value plus the instant it was true, and a tick is a repaint of `value ± elapsed` rather than
an increment. The origin rides the clock FIELD as an `@<epoch ms>` suffix
(`"45:00@1755600000000"`), stamped from the `clockStart` row's own server time by
`src/control/matchClockWire.ts`, so every renderer agrees and a browser source reopened at 67
minutes comes back at 67 minutes instead of at the seed. A plain value with no `@` is a HELD
time - which is what every existing template, export and typed correction already sends.
`markInPlay`/`markBreak`/`markFinal`/`markLive` are the state markers the machine's non-clock
groups call, and each is only a CLASS on the root - "at full time" and "during the interval" are
things the board LOOKS like, so a design decides what they mean in CSS. **Each marker answers for
its OWN group**: `markInPlay` clears the interval treatment and nothing else, because an operator
who ended the match and then resumed the clock out of habit must not take a finished board back
to looking live. `markLive` is the one that clears both, for a graphic whose status is a single
group.
