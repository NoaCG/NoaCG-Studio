# The competition pack

Esports, competition, result and reveal graphics: **44 designs across 4 categories and 13
graphic types**, all built on the existing contracts — the state machine
(`STATE_MACHINE_SCHEMA.md`), the graphic-type registry (`GRAPHIC_TYPES.md`), the Timeline v2
data block (`TIMELINE_V2_PLAN.md`) and measured motion (`DYNAMIC_MOTION_SCOPE.md`).

Code: `src/templates/competition/` (assembler, presets, motion, the four categories),
`src/templates/types/{esports,matchups,competitionBoards,reveals}.ts` (the type declarations).
Behaviour is pinned by `e2e/competition-pack.spec.ts`; conformance by `e2e/graphic-types.spec.ts`.

---

## 1. What the pack is for

Two programme-specific designs reuse existing types rather than duplicating their machines:
`mr04` Map Veto uses the map-round cursor for an esports pick-and-ban sequence, and `rs04`
Initiative Order uses the roster spotlight for a tabletop turn order. Their picks, bans,
characters, statuses, and current row remain operator data.

| Ask | Type | Designs |
|---|---|---|
| Esports scoreboards | `esports-score` | es01 Series Scorebug · es02 House Series · es03 Frost Series · es04 Clean Series |
| Map / round / game indicators | `map-round` | mr01 Map Ladder · mr02 House Maps · mr03 Round Strip · mr04 Map Veto |
| Versus / match-ups (with a winner pick) | `matchup` | mu01 Match-up Slam · mu02 House Match-up · mu03 Frost Match-up · mu04 Clean Match-up |
| Head-to-head comparisons | `head-to-head` | h201 Head to Head · h202 House Compare · h203 Clean Compare |
| Player / team cards | `player-card` | pc01 Player Card · pc02 House Player · pc03 Frost Player |
| Rosters and line-ups | `roster` | rs01 Starting Line-up · rs02 House Roster · rs03 Clean Line-up · rs04 Initiative Order |
| Standings, leaderboards, result tables | `standings` | st01 League Table · st02 House Standings · st03 Frost Leaderboard · st04 Clean Results |
| Live timing towers | `timing-tower` | tt01 Timing Tower · tt02 House Timing · tt03 Frost Splits · tt04 Clean Timing |
| Brackets | `bracket` | br01 Playoff Bracket · br02 House Bracket |
| Nominee / finalist reveals | `nominee-reveal` | nm01 House Nominees · nm02 Frost Nominees · nm03 Clean Nominees |
| Correct / incorrect reveals | `verdict-card` | vd01 Call Verdict · vd02 House Verdict · vd03 Clean Verdict |
| Final result and winner | `winner-card` | wn01 Champion Card · wn02 House Champion · wn03 Frost Champion |
| Award and launch reveals | `award-reveal` | aw01 House Award · aw02 Frost Award · aw03 Launch Reveal |

Four wizard categories group them: **Esports scoreboards** (`esports-score`, 8),
**Match-ups & competitors** (`matchup`, 10), **Results & standings** (`results-board`, 14),
**Reveals** (`reveal`, 12). Every type ships across the style families — sport, noacg house,
glass, minimal — so the pack is premium and analytical, not only neon.

---

## 2. The one rule the whole pack is built on

> **The moment is a state. What the moment is about is data.**

Every branch in the pack is ONE state plus a field:

- one `selected` state + a `winner` field (A/B) — not a state per side;
- one `judged` state + a `verdict` field (correct/incorrect) — not a state per ruling;
- one `spotlight` / `highlighted` state + a row number — not a state per row;
- one reveal step + a `winner` index — not a state per nominee.

Adding an eleventh team, a fifth nominee or a third ruling adds **no states**. The value rides
in as the event's **payload**, so the change is atomic: the graphic never animates to a value
that has not landed yet (`STATE_MACHINE_SCHEMA.md` §3).

Two corollaries the runtimes are written around:

1. **`update()` never transitions.** Typing "B" into a match-up's winner field changes what the
   card *would* show if the operator selected; it does not select. Only a machine state calls
   `applyWinner`. The match-up runtime deliberately has no `compRepaint` for this reason.
2. **Reset is two operations.** `play()` calls the design's `compClearMarks()` (the VISUAL half
   — a replay never inherits the last match's FINAL flag, and the inline styles a reveal tween
   left are cleared with it); the DATA half stays `update()`'s. `noacgSnap(null)` resets every
   group's pointer and leaves the fields alone.

---

## 3. The state flows

Notation: `state --event-->` state. Parallel groups are listed separately; `⟳` is a
self-transition (re-entering repaints from the payload).

### Esports scorebug (`esports-score`) — pre-match → active → final

```
phase group:   pre --goLive--> live --final--> final --nextMap--> live
pause group:   running --pause--> paused --resume--> running
main group:    (no authored transitions — a scorebug comes on and stays)
```

Two small graphs instead of one big one: a technical pause can happen in any phase, so 3 + 2
states, never 6. Scores, team names and the stage line are data — the score pop is a repaint,
not a transition. Runtime calls: `markLive` · `markFinal` · `markPaused` · `markRunning`
(`markPreMatch` is the pre-match pose, restored by `compClearMarks`).

Controls: **Go live · Map final · Next map** (Match) · **Technical pause · Resume** (Break).

### Map / round indicator (`map-round`)

```
main:  [entrance] --advance--> advanced ⟳ advance
       [entrance] / advanced --seriesFinal--> decided --next--> [exit]
```

`advance` carries the map number (`current`); `applyMapCursor` moves the cursor and pops the
row. `markSeriesFinal` dims the maps that were never needed.
Controls: **Advance** (payload `current`) · **Complete**.

### Match-up (`matchup`) — neutral matchup → selected winner

```
[entrance] --select--> selected ⟳ select --lock--> locked --next--> [exit]
selected  --clear---> neutral --select--> selected
```

`select` carries `winner` (A/B). **After `lock` there is no `select` arrow at all**, so a late
pick is dropped along with its payload — the guard is structural, not a condition. `clear`
enters its own state rather than re-entering the entrance (which would replay the whole card).
Runtime: `applyWinner` · `applyLock` · `clearWinner`.
Controls: **Select winner** (payload `winner`) · **Lock it in** · **Clear pick**.

### Head-to-head (`head-to-head`)

```
[entrance] --highlight--> highlighted ⟳ highlight --clear--> level --highlight--> highlighted
highlighted --next--> [exit]
```

`highlight` carries `leader` (A/B). The comparison bars are measured from the operator's own
figures (each side's share of the pair), so a row with "14 | 11" draws 56% / 44%.
Controls: **Highlight side** (payload `leader`) · **Level**.

### Player card (`player-card`)

```
walk:      [card] --stats--> [stats revealed] --stop--> [exit]
branches:  [stats] --mvp--> mvp --clearMvp--> plain --mvp--> mvp
           mvp / plain --next--> [exit]
```

The Continue press IS the stat reveal (a real middle step calling `revealStats`), so `next`
alone runs the card under any playout server. The MVP flourish is a branch, so a control page
gets a button for it.
Controls: **Reveal stats** · **Call MVP** · **Clear MVP**.

### Roster (`roster`)

```
[entrance] --spotlight--> spotlight ⟳ spotlight --clear--> level --spotlight--> spotlight
spotlight --next--> [exit]
```

`spotlight` carries the 1-based player number; `0` or an out-of-range number leaves the line-up
level rather than dimming it with nothing lit.
Controls: **Spotlight player** (payload `spotlight`) · **Whole line-up**.

### Standings / result table (`standings`)

```
[entrance] --highlight--> highlighted ⟳ highlight --clear--> plain
[entrance] / plain / highlighted --final--> final --highlight--> highlighted
final --next--> [exit]
```

`final` is what turns a standings board into a RESULT table: same rows, same columns, a
different claim about them (`markFinal` / `clearFinal`). Columns come from the operator's own
header line, so one board serves a league table, a medal table and a race result.
Controls: **Highlight row** (payload `highlight`) · **Whole table** · **Declare final**.

### Bracket (`bracket`)

```
[entrance] --advance--> advanced ⟳ advance
[entrance] / advanced --crown--> crowned --next--> [exit]
```

Ties are grouped into round columns in the order the rounds first appear, so the operator types
ties and the board finds the structure. `crown` carries the champion's name.
Controls: **Advance round** (payload `round`) · **Crown champion** (payload `champion`).

### Timing tower (`timing-tower`)

```
main:     [entrance] --focus--> focused ⟳ focus --clear--> level --focus--> focused
          focused --next--> [exit]
session:  running --final--> final --provisional--> running
```

Two small graphs, like the esports scorebug: the running order is the walk (main), and whether
the session is still live is independent of it (a parallel `session` group), so a chequered flag
never disturbs where the caster's focus had got to. The order itself is one hidden textarea —
one competitor per line, position taken from the line's place in the field, never sorted by the
graphic — so a twenty-car grid is not twenty fields and nothing here ever disagrees with the
timing feed over who is third. `focus` carries the competitor's 1-based row number.
Controls: **Focus competitor** (payload `focus`) · **Whole field** · **Session final** ·
**Back to running**.

### Nominee reveal (`nominee-reveal`) — nominees → winner

```
walk:     [nominees] --reveal--> [winner] --stop--> [exit]
branch:   [nominees] --suspense--> suspense --reveal--> [winner]
```

`reveal` is the walk's own arrow AND the way out of the suspense hold, so the control page has
one "Reveal winner" button whichever route the operator took. The winner is the `winner` field
(1-based), applied by `revealWinner`; SPX's `steps` is `'2'` — DERIVED from In + Reveal + Out.
Controls: **Suspense** · **Reveal winner** (payload `winner`).

### Verdict (`verdict-card`) — correct / incorrect

```
[entrance] --judge--> judged ⟳ judge --clear--> unjudged --judge--> judged
judged --next--> [exit]
```

ONE judged state; `judge` carries `verdict`. A correction mid-show is a self-transition.
Incorrect always rules in signal red, whatever the project's accent is — a wrong call has to
read as wrong even in a green palette.
Controls: **Rule** (payload `verdict`) · **Clear ruling**.

### Winner card (`winner-card`) and award / launch reveal (`award-reveal`)

```
winner:   [champion] --result--> [score] --celebrate--> celebrating --settle--> plain
award:    [category] --open----> [subject] --celebrate--> celebrating --settle--> settled
                                 celebrating / plain / settled --next--> [exit]
```

Both hold their payload back until the press: the score line and the beaten side (`revealResult`),
or the sealed subject (`openEnvelope`). The celebration is its own state, so the operator decides
when the room gets there.
Controls: **Reveal result** / **Open envelope** · **Celebrate / Applause** · **Settle**.

---

## 4. How the pack is built

**One assembler** (`competition/shared.ts`). Like infographics, the DESIGN owns its SPX fields
and ships the runtime that paints them; that runtime is emitted OUTSIDE the marked ANIMATION
region, so the Motion panel never rewrites it and it survives every export. `CompCategorySpec`
is the only per-category difference: the class prefix, the `SpxTemplate` type, and whether the
graphic covers the frame (match-ups, reveals) or hugs its content (strips, boards).

**Structure contract** — small on purpose, because the preset bank tweens exactly this:

```
.<prefix>            root — zone positioned, opacity 0 until play()
  .<prefix>-box      panel / stage
    .<prefix>-head   kicker, title, team names
    .<prefix>-accent the one accent flourish (an edge bar, a seam, or a rule in the flow)
    .<prefix>-body   rows, sides, the subject of a reveal
  …hidden #fN data sources (a rows textarea, a winner pick)…
```

**One preset bank** (`compPresets.ts`), prefix-parameterized like the standard one, so a
scorebug and an award reveal move by the same vocabulary: `comp-rise` (the analytical arrival),
`comp-impact` (the match-night slam), `comp-bloom` (the ceremonial reveal), `comp-cascade` (the
measured row arrival — STRUCTURAL, because it names a builder that must ship in the template).

**Measured motion** (`compMotion.ts`): `compCascade` staggers one row per line the operator
typed and composes `compBarsGrow`, which grows each `[data-value]` fill to its own percentage.
Neither number exists until the data does, which is exactly why they are builders and not
keyframes.

**Middle steps.** A design declares `revealSteps: [{ name, call }]` and the assembler authors
them as real steps before Out (the quiz precedent). That is what keeps SPX's `steps` count
DERIVED: without it the data would say one step and the first timeline edit would rewrite it,
after which SPX stops sending Continue and the reveal never fires.

**Fields.** Each type declares its fields logically (`TypeField`), and `compFieldsFor` compiles
them to `f0…fN` while folding in the wizard's line edits — so the Fields step still retitles
the visible lines of a fixed-shape graphic. Team crests and portraits are `data`-role image
fields (like a versus card's), never the wizard's single logo slot, and they start hidden so a
design's placeholder styling is right from first paint. On a scorebug or a roster an empty slot
is a deliberate placeholder (the design is drawn around its crests); on a REVEAL card it
collapses entirely (`.reveal-logo:not(.has-image)`), because a card composed around its type
should not carry a 120px hole where a logo might one day go.

**One rough edge, recorded rather than hidden.** The glass family's `accentInk` token resolves
to `var(--panel-bg)`, which in a glass palette is a translucent white — so light type on an
accent-filled chip. The four glass designs here (es03, mu03, pc03, st03) therefore hard-code a
dark ink with a comment, instead of using the token. The token itself is a pre-existing defect
(the shipped qz03 Frost Quiz has the same unreadable chip) and is filed separately; when it is
fixed these four move back onto `var(--accent-ink)`.

---

## 5. What is verified

`e2e/competition-pack.spec.ts`:

- all four categories present and available; 44 designs create, validate and carry a machine;
- the match-up walk including the **structural lock** (a late `select` moves neither the
  pointer nor the field it carried);
- the scorebug's phase walk, the independence of the pause group, a score write moving nothing,
  `noacgSnap(null)` resetting the visual half only, and a replay clearing the FINAL flag;
- the verdict's one-state/two-values behaviour and its clear;
- the nominee suspense → reveal, the derived `steps: '2'`, and a clean replay;
- `next()` alone walking a reveal card end to end, then `stop()` taking it off air;
- the standings highlight moving by payload, `final`, and a clean replay;
- an EMPTY rows source (0 rows, no spotlight, no page error) and an image field with no file
  (hidden `<img>`, no `.has-image`) — then the same field with a file;
- **all six export targets** for all 44 designs (264 packages);
- save to the library → reload → the machine and its runtime still drive the reloaded template;
- creation through the wizard path, with the control page's events coming off the machine.

`e2e/graphic-types.spec.ts` covers conformance for the 12 new types alongside the existing ones,
and `e2e/catalog-baseline.json` / `catalog-render-baseline.json` gained the original 42 designs as pure
additions — no existing variant's emitted code or rendered fingerprint moved.
