# 2026-09-10 - row BN, the fast road becomes a private topic

Branch `claude/bn-private-command-topic`, worktree `agent-a4641dddaaf6d9b70`. Four commits plus one
merge of `main`, off row BM's tip - which landed as `588f42ad` while this ran, so the branch's
merge base is main and the diff is this row's own twelve files.

## What the row was asked and what came back

BM shipped the two-road transport and said out loud what it cost: the fast road's channel was
PUBLIC, its topic derivable from the read-only output capability, so a holder of an output URL
could push a command onto air. This row closed that without giving back the speed.

**A holder of the output URL can still render the show and can no longer move it.** The client
broadcasts nothing at all now; `control_send_many` emits the command frame itself, on the private
topic `cmd-<show id>`, in the same transaction as the durable insert. RLS on `realtime.messages`
lets anon and authenticated READ that topic shape and gives no client an INSERT policy, which under
RLS is a refusal - so the only writer is the RPC and the only key to it is the control slug, which
is exactly the authority the durable log always required.

**It cost about 35 ms, not the 110 BM estimated.** Read from a signed-OUT second client - the seat
every renderer actually occupies - a command arrives in a median of 87 ms, worst 215, against the
durable row's 131-136 ms median with the odd press out at 645 ms. Air is that plus about 30 ms of
paint, so a published Take lands in about 120 ms against the 515 ms the owner reported. The
estimate was pessimistic because it counted the RPC round trip twice: the broadcast reaches the
other client within a millisecond or two of the RPC answering its own sender, since both are
released by the same commit.

## The test came first, and it went red on purpose

`e2e/configured/output-url-cannot-push.spec.ts` opens a browser context holding nothing but the
output slug, resolves the show id and the published graphic names from it (`control_output_by_slug`
answers both, because a renderer needs them), and pushes a forged `play` and `stop` on every topic
reachable from there - `control-<id>` and `cmd-<id>`, public and private, over the socket AND over
Realtime's REST broadcast endpoint. Then it asks the only question that matters: did the graphic
play?

| run | result |
| --- | --- |
| the first draft against the road as BM shipped it | **red - `Expected: "0" Received: "2"`, j-0981** |
| the FINAL text against the same code (src from `main`) | **red - `Expected: "1" Received: "3"`, j-0988** |
| with the private topic and migration 0056 | green, j-0983 and j-0989 |

The counts are worth reading twice: on top of the operator's own real Take, the stranger's socket
frame AND their REST call both landed, so a read-only link put the graphic on air twice over. Both
red runs were taken with `git checkout origin/main -- src/` in place - the scratchpad script that
does it and puts the branch's own src back is quoted in the traps below, because the dev server
serves the working tree and a "red proof" run against the fix is worth nothing.

**The green run does not prove the fast road is alive** - that spec passes with the broadcast
completely dead, because every command still arrives on the durable road. What proves it is BM's
mutation: with `claim()` returning `true` for an id it has already seen, `playout-both-roads`
fails with the desk reading `data-plays="3"` (j-0984). Three arrivals is the sending page's own
optimistic apply, the broadcast, and the durable row - so the private topic really is delivering
into the app. **Re-run that mutation after any change to the join or the emission**; nothing else
can see a fast road that has quietly stopped working.

## The mistake this row made, and what it cost

**Migration 0056 rebuilt `control_send_many` from 0029's body. 0034 had redefined the same function
since**, to mirror every `cue` marker in a batch into `control_shows.live_cue` - the snapshot a
reloading operator page and a rebooting browser source rebuild "what is on air" from. `create or
replace` took the older text whole and the mirroring went with it. Nothing went red: the log is
untouched, every running surface still follows it, and the damage only appears when somebody
RESUMES - chips reading "nothing on air" over a live graphic, and a recovery walk re-airing
whatever was live when 0056 applied.

The code review caught it. It was already on the live project by then, because measuring the road
needed it there: **0056 and 0057 are both applied to production ahead of this branch landing**
(`npm run db:push`, ledger rows 0056 and 0057), so the post-land push will find nothing pending.
0056 stays exactly as applied and 0057 is the fix, per `supabase/AGENTS.md`.

**The lesson is the self-check, and it is the one AGENTS.md already wrote down after 0035.** 0056's
block proved `realtime.send` exists, that RLS is on and that no client can write - all true, all of
it about the change, none of it about the function it replaced. A shape check cannot see a
behaviour that was REMOVED. 0057's block calls the function against a throwaway production and
asserts the effect: the rows land, the batched cue marker reaches `live_cue`, and clearing that
layer empties it again. **Any migration that replaces an existing function should carry that shape
of check**, and the cheap way to avoid the whole class is to build the new body from the CURRENT
definition (`pg_get_functiondef`) rather than from the migration that first created it.

## What this changes about the security boundary, for `docs/PROGRAMMES.md`

A migration and a security-boundary change are both scope edges, so here it is in one paragraph.
Before this row, one Realtime topic per production was public: anyone who could learn the show id -
which the read-only output capability hands out by design - could both read the command stream and
WRITE to it, and a written command reached every renderer without passing any check. After this
row, commands travel a private topic whose write side has no policy at all, so the database is the
only writer and reaching it still requires the control slug. The read side is unchanged in reach:
the policy admits anon and authenticated for topics matching `cmd-<uuid>`, which is the same
audience `control_events`' own read policy has admitted since migration 0008 and carries the same
commands. No new grant, no new role, no new public URL; one capability that had silently widened
from read to write is read again.

## Evidence and traps that exist in no repo file

**Realtime keeps a private topic and a public topic of the same name apart** and passes nothing
between them (Supabase's own realtime docs, verbatim: "Realtime sees them as unique channels and
won't send messages between them"). That is what makes it safe for `control-<id>` to stay public
for `postgres_changes` while commands move to a private topic - and it is worth knowing before
anybody "tidies up" by putting them back on one channel.

**A REST broadcast of a private message answers 202 and delivers nothing.** All four REST pushes in
the security walk come back `202` whether the topic is private or not; the refusal happens after
the acknowledgement. So the endpoint's status code says nothing about the boundary, and the only
honest assertion is the one the spec makes - did the picture move.

**`realtime.send` swallows its own errors into a WARNING** (read its body: the INSERT is wrapped in
an exception block). A broadcast that cannot be written is invisible from SQL and the verb still
commits, which is the right way round for the durable road but means a dead fast road has no
symptom except lateness. Two things now speak: the output renderer prints the command channel's
join status on its `&debug=1` overlay, and `scripts/playout-wire-probe.mjs` says loudly when its
private join is refused.

**`postgres` has `rolbypassrls` and owns the SECURITY DEFINER function**, which is why
`realtime.send` inside it can write `realtime.messages` while anon cannot. Note that **anon HOLDS
the INSERT privilege** on that table - Supabase grants it to every project - so the absence of a
policy is the entire boundary. A permissive INSERT policy added there for some future feature would
reopen this row's hole silently; 0056's self-check names that and refuses to apply over one.

**The dev server serves the working tree, so "prove it red" needs the fix genuinely absent.**
Running the new spec while the fix was in the tree passed for the wrong reason: no fast road at
all, because the migration had not been applied yet. Both red proofs were taken with
`git checkout origin/main -- src/` in place. The second ran as ONE queued job that reverted, ran
the spec and restored the tree itself - worth repeating, because the first left this worktree's
src reverted while the job sat behind a landing in the queue, which is a state nobody should be one
interruption away from committing.

**The e2e catalog tripwire failed once locally and is not this branch's.** `e2e/catalog-baseline`
reported fourteen ticker variants with two moved elements each, in a run whose vite server restarted
mid-flight because `main` was merged into the worktree while it was running (j-0985). CI ran the
same spec on the same merged commit and passed it. Re-run rather than bisect.

**A `fast` mark on a wire item never reaches the log.** `control_send_many` reads `graphic` and
`msg` for the insert, so the flag is transport only - worth knowing before anybody looks for it in
`control_events.msg`.

**The output capability still has one WRITE by design, and it is worth knowing about.**
`control_output_report` is addressed by the output slug and updates `control_shows.live` plus a
`{t:'live'}` log row, because a renderer has to report what it applied - that is what a rebooting
renderer rebuilds from (migration 0033). So a holder of an output URL can still write a false
report, and the picture it would move is a FUTURE reboot's, not the one on air now. That is 0029's
design rather than anything this row changed, and it is a narrower hole than the one just closed,
but if somebody hardens this area next, that is where to look.

## What is left, and what I decided rather than asked

**The event exception is now removable and I deliberately did not remove it.** A machine `event`
still takes the durable road alone, and a graphic that was just sent one stays behind it for
1200 ms, because a broadcast had no server time. That reason is gone: the DATABASE is the
broadcaster now and knows both the row's `created_at` and its id, so it could carry them in the
frame - which would let events ride the fast road with true server time, and would let the hold-back
rule move into SQL where it would finally see EVERY sender and close BM's cross-device ordering
limit. It is a clock-semantics change with its own failure modes, and mixing it into a security
boundary would have doubled the ways this row could go wrong. It is the obvious next row.

**Exported graphics are untouched.** `src/control/hostedReceiver.ts` and the exported controller
still follow the durable road only, so a CasparCG or SPX receiver sees yesterday's speed. And
`src/control/realtimeControl.ts` - the remote-control block for exported graphics - still uses a
public topic isolated by an unguessable secret; that is a different capability model, the topic is
not derivable from any read-only link, and it is out of scope here, but it is the same shape of
question if anybody goes looking.

**Two older copies of `clearPublishedShows` remain** in `playout-both-roads.spec.ts` and
`hosted-control-recovery.spec.ts`. The shared one is in `e2e/configured/_helpers.ts` now and the
new spec uses it; collapsing the other two would have meant editing files this branch had no other
reason to touch.

## Anything that needs the owner

Nothing is blocked on him. `docs/acceptance/owner-queue/2026-09-10-bn-output-url-cannot-operate-the-show.md`
is a `walk`: publish, put the output link in a second window, press Take, and see it land about as
fast as on the desk. It tells him the one thing that changes how he behaves at Friday's rehearsal -
the output link is now safe to hand to anybody who needs to see the show, and the control link is
still the one that operates it.

## Pointers

- `supabase/migrations/0056_private_command_topic.sql` - the emission, the read policy, and the
  argument for both. Read it with 0057 beside it, which is the correct body.
- `supabase/migrations/0057_command_topic_keeps_live_cue.sql` - the current definition, and a
  self-check that CALLS it.
- `src/control/commandRoads.ts` - `commandTopic`, the minted id, the frame reader, and the
  measurement in its header.
- `src/control/hostedControl.ts` - `sendControlVerb` (which now marks rather than broadcasts),
  the `recovering` gate, the event hold-back, and the two channels `subscribeControlEvents` joins.
- `e2e/configured/output-url-cannot-push.spec.ts` - the cover, with what it attacks and why the
  play is the detector for every verb.
- `scripts/playout-wire-probe.mjs` - thirty seconds, no browser, both roads, read signed out.
- `docs/backlog/playout-lag-when-working-the-queue.md` - the whole measurement history, the closed
  authorisation item, and the before/after table.
