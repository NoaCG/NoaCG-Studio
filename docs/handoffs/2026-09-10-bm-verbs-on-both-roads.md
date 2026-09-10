# 2026-09-10 - row BM, a published verb on both roads

Branch `claude/bm-verbs-on-both-roads`, worktree `agent-a7bdb97a3fa6397a8`. Five commits plus two
merges (BJ's branch, then `main` at `272bcecb`) off `9f2c7a27`. Build green. `/check` passed -
`review: delegated`, `simplify: inline`, `verify: inline`, `taste: not applicable`. The verdict
stamp is written at `.git/noacg-jobs/checks/claude-bm-verbs-on-both-roads.json`. The review ran on
`63cac693`; the only commits after it add this file.

## What the row was asked and what came back

BJ measured the published path and designed the fix. This row built the cover, shipped the
transport and re-measured. **A published Take now reaches a second surface in 51 ms and an Out in
52 ms, against 131 and 138 ms median on the durable road with a quarter of presses in that road's
slow mode at 404-637 ms.** About 30 ms of paint goes on top, so both verbs air in about 80 ms
everywhere - and on the operator's OWN monitor there is no wire at all any more, because the
sending page applies its items before the insert is even awaited.

## The cover came first, and it went red on purpose

`e2e/configured/playout-both-roads.spec.ts` walks one production through three seats - the sending
dashboard, a second operator on the signed-out capability URL, and the `/output` renderer - and
reads entrances as arithmetic off `data-plays`. It also presses **Re-take**, because two presses
must still be two entrances: a reconciler keyed on what a command SAYS rather than on the id the
press minted would pass every other assertion in the file and fail that one.

It was run three times against a real backend:

| | result |
| --- | --- |
| before any transport change (one road) | green, j-0958 |
| with the transport, before the review fixes | green, j-0962 |
| **with `claim()` deliberately returning `true` for a seen id** | **red - `Expected: "1" Received: "2"`, j-0963** |
| with the transport, after the review fixes | green, j-0972 |
| **the same mutation on the FINAL code** | **red, same reading, j-0976** |

The last row is the one that also proves the fast road is genuinely live end to end. The spec cannot
tell a broadcast from a durable row on its own - it passes either way - so **the mutation is the
only evidence that a command really does arrive twice** and that the reconciliation is what stops
it. Re-run it after any change to the registration or the join, because a fast road that silently
stopped being used would leave every assertion green.

`src/output/main.ts` had no `data-plays` before this. It does now, on `document.body`, for the same
reason `PayloadStage` has one.

## What is left, and what I decided rather than asked

**The authorisation trade is the one thing I would not ship again without saying out loud.** The
command channel is public, joined with the publishable key, isolated only by its topic being
`control-<show id>` - the capability model `realtimeControl.ts` already ships for exported
graphics. The show id is reachable from the OUTPUT capability as well as the control one, so a
holder of an output URL, who could previously only READ, can now push a command onto the fast road.
The durable log is untouched (writing it still needs the control slug and passes RLS) and a forged
command is never recorded, but a read-only URL did become able to move a picture. I shipped it
because the alternative was keeping half a second, and because the exposure is bounded to somebody
you already handed your renderer's address to. **The real fix is a row of its own**: broadcast FROM
the database inside `control_send_many` (`realtime.send`) on a private topic with RLS on
`realtime.messages` that lets anon read and not write. It costs the RPC's own 110 ms on top of the
50, so air would be ~180 ms rather than ~80 - still four times better than today's worst case. It
is written up in the backlog under the fix section.

**Machine `event` commands deliberately keep the slow road.** A clock's shared origin is derived
from the row's own `created_at` so two renderers of one production agree to the millisecond, and a
broadcast has no server time; substituting the sending laptop's clock would put its skew on air. So
an event goes durable-only, and the graphic it named stays on the slow road for 1200 ms afterwards
so a Take pressed straight after cannot overtake it. **Across DEVICES that is not fixable from one
sender** - an event from one operator and a Take from another, inside one fan-out window, can still
land in different orders on different renderers. Stated in the backlog as a known limit.

**Cross-device ordering and the authorisation trade are the two open items.** Everything else BJ's
design listed as undecided is decided and written down in the backlog.

## Evidence and traps that exist in no repo file

**`channel.send` on a channel that has not joined does NOT queue - it silently becomes an HTTP
POST.** supabase-js 2.110.2 checks `canPush()` and falls back to the broadcast REST endpoint with
`console.warn('Realtime send() is automatically falling back to REST API…')`. Two things wrong with
letting that happen: the warning lands in the console of a renderer whose log an operator is asked
to read, and a REST-delivered frame has no ordering guarantee against a socket frame behind it. The
channel is therefore registered for sending only on `SUBSCRIBED`, and deregistered on any other
status. **My first version got this wrong and the comment asserted the opposite as fact** - the code
review caught it by reading the vendored SDK, which is the only way it could have been caught.

**`channel.send` also never rejects.** It resolves `'ok' | 'error' | 'timed out'`, so a `.catch()`
on it is dead code and a failed fast road is undetectable from the sender. Do not add error handling
there expecting it to fire.

**The fast road has no ordering against the follower's catch-up walk, and that is a real on-air
bug, not a theoretical one.** `refill()` fetches rows OLDER than anything a broadcast can carry, and
a broadcast has no id to be ordered against them: an Out pressed during a socket outage, then a Take
pressed now, and the renderer plays the graphic in and the arriving `stop` takes it straight back
off. No id reconciliation can see it, because the two commands are genuinely different. The fast
road now stands down for the whole walk - for followers and for the sending page's own optimistic
apply, through a module-level `recovering` set. **Anything that adds a new fast-road consumer has to
respect that set or it reopens this.**

**A doubled entrance is invisible and so is a fast road that has quietly stopped working.** Both
failure modes leave a green spec. The count catches the first; only the mutation catches the second.

**The e2e spec waits for the SLOW road before reading any number.** That is the whole timing of the
defect: the fast road gets there first, and the double-apply happens when the durable row lands on
top of it, so a count taken before that row exists is a count taken before the bug could have
happened. It waits on the output renderer's `last row` debug line, which is written from the row's
own id and which a broadcast can never touch.

**The full offline suite failed three wizard specs in the local integration run and they are
flakes.** `wizard-brand.spec.ts:85`, `:93` and `wizard-finish.spec.ts:114`, all under nine workers
on this RAM-bound laptop; re-run alone (j-0974) all 22 tests in those two files passed, main's own
CI at `272bcecb` is green, and this branch touches no wizard code. Worth knowing before somebody
bisects them.

**Row BE landed `scripts/check-stamp.mjs` while this ran and did NOT touch either file this row
minted** (`scripts/e2e-lists.mjs`, `scripts/e2e-affected.mjs`), so there was nothing to resolve. I
added three rows to `CONFIGURED_TRIGGERS`: `commandRoads.ts`, `HostedControlPage.tsx` and
`PayloadStage.tsx`. The hosted control page had never been named there and should have been - it is
a signed-out capability URL with no offline existence at all, and it is now a sender as well as a
follower.

**The wire probe is a different instrument now and its old numbers are not comparable to its new
ones.** It sends the way the app does (broadcast, then insert) and reads BOTH roads from a SECOND
client, because a broadcast is never echoed back to whoever sent it - a one-client probe sees the
fast road not at all. If its SENDING channel never joins it now says so, loudly, because otherwise
every `fastMs` it prints would be a REST fallback the app would never have used.

## Anything that needs the owner

Nothing is blocked on him. `docs/acceptance/owner-queue/2026-09-10-bm-published-verbs-are-fast-now.md`
is a `walk`: it hands him the probe to run on the venue's wifi and tells him what the two columns
mean. It also tells him what happens if the fast channel cannot get through (it goes back to
yesterday's speed and nothing breaks), and that a verb which airs and then fails to log now says so
in those words.

**On Saturday's rehearsal**: BJ's advice to run unpublished no longer costs him anything either way,
and he was told he could build from a commit before this one. He can now publish and still have
verbs that feel like his finger.

## Pointers

- `src/control/commandRoads.ts` - the minted id, the bounded applied-set, the broadcast frame
  reader, and the whole argument in its header.
- `src/control/hostedControl.ts` - `sendControlVerb` (the one door a verb leaves by), the
  `commandChannels` registry, the `recovering` gate, and `followControlLog`'s `onCommand` tap.
- `src/components/home/ProductionPage.tsx` and `src/components/HostedControlPage.tsx` - each page's
  `applyCommand`, which is the one place a command reaches what an operator sees, fed by three
  arrivals and deduped by one set.
- `src/output/main.ts` - `applyCommand` versus `apply`: the picture and the row bookkeeping, split
  so the fast road can reach the first without touching the second.
- `e2e/configured/playout-both-roads.spec.ts` - the cover, and the mutation instructions are in this
  file above.
- `scripts/playout-wire-probe.mjs` - thirty seconds, no browser, both roads, the venue instrument.
- `docs/backlog/playout-lag-when-working-the-queue.md` - the measurement, what shipped, every
  decision's answer, and the two open items.
