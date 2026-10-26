# Election replay rehearsal: how to run it

Phase E7.2b of [the election package](spec.md) (AC-4). This page says how to rehearse the four
election graphics on a published production with results read from the election replay server,
what to record, how to recover by hand, and the limits measured.

**What this grades.** The software and replay rehearsal on browser outputs, and nothing else.
The recorded run used a local database stack and NoaCG's development server (the same route and
database functions a deployment runs). The results are synthetic and come from a replay server
on the same machine as the agent (loopback). This is not a test in the real studio (CasparCG/Bridge, OBS: parent phase S), and it
does not qualify an official live results feed: no official feed access or contract exists yet,
so election-day feed qualification stays unverified. Nothing here is a readiness claim for any
broadcaster.

## What runs where

| Piece | Where | What it does |
| --- | --- | --- |
| The package | `public/packs/election-rehearsal.noacgpack.json` | Party totals, candidate card, count bug, ticker, six cues, starter count |
| The replay server | `scripts/election-replay-server.mjs --timeline package` | Answers the package's results over HTTPS with a bearer token, one step at a time |
| The trusted agent | `scripts/external-data-connector.mjs`, config [`replay-agent.json`](replay-agent.json) | Reads the replay server, sends each new revision to the production |
| The source record | [`replay-source.json`](replay-source.json) | What the production knows about the source: its id `election` and its mapping |
| NoaCG | the published production and its browser output | Applies each revision; the page keeps an aired candidate card in step |

The mapping (E5) formats the votes (`225000` becomes `225,000`) and the time of the count
(`observed_at` becomes `20:14`, Helsinki time). The candidates travel whole, one revision at a
time, to the leaf the candidate cues read (`external.election.candidates`). The ticker's headlines
are typed by the operator; no result fills them.

## Before the rehearsal

1. Import `election-rehearsal.noacgpack.json` (Productions, **Import a package file…**) and
   publish the production. Use a production of its own, never the one you go on air with.
2. Register the source on the production: the record in `replay-source.json`, with `endpoint`
   set to the replay server's address. The pack's bindings already follow `external.election.*`,
   so no field is connected by hand. The published app has no way yet to register a source that
   only an agent can reach (#1734), so for now this step needs a development build of NoaCG
   (`npm run dev`): with the production open, run in the browser console

   ```js
   const S = await import('/src/model/shows.ts');
   const show = S.loadShows().find((s) => s.name === 'Election night rehearsal');
   S.connectConnectorSource(show.id, <the replay-source.json record>, [], null);
   ```

   which is the write Connect data makes, and the one the configured walk makes.
3. On the machine that runs the agent (Node 22 and a clone of this repository, nothing else),
   in a folder of its own outside the clone, so the token and key it writes can never be
   committed (`<clone>` is where the repository is):

   ```bash
   mkdir election-rehearsal && cd election-rehearsal
   node <clone>/scripts/election-replay-server.mjs --dir replay --port 8443 --timeline package --step-ms 60000
   ```

   It writes `replay/ca.pem` and `replay/token` and prints each step's sha256. Copy those lines
   into the rehearsal record. The timeline starts at the agent's first read and moves one step a
   minute (eight steps, then it stays on the last); without `--step-ms` a step lasts 5 s, too short
   to watch. Each time a step is first served the server prints `served <step> at <time>`.
4. Copy the agent's configuration beside the `replay` folder (its `caFile` is read relative to
   the configuration file), then start the agent with the two credentials in its environment,
   never in its configuration (the replay token comes from the file the replay server wrote):

   ```bash
   cp <clone>/docs/work-specs/playout-election-package/replay-agent.json agent.json
   NOACG_SOURCE_REPLAY="$(cat replay/token)" NOACG_DATA_KEY=<the production's data key> \
     node <clone>/scripts/external-data-connector.mjs --config agent.json \
     --send <the NoaCG address the production is published on>/api/data/source
   ```

   (While step 2 needs a development build, that is the development server's own address.)

   Its log says `claimed: epoch 1` and the first revision arrives within a few seconds.
5. Within the first minute, open the production's output URL in a browser and Take **Party
   totals**, **Count status**, **Headlines** and a candidate. Then watch each step arrive: the time
   from a `served` line to the picture changing is the step's time for the record (steps that
   only hold, such as the duplicate, the older count and the malformed answer, change nothing).

## The rehearsal record

Write these down for every rehearsal:

- the NoaCG commit the rehearsal ran on, and the date and time (UTC);
- the package file's sha256, and the sha256 of `replay-source.json` and `replay-agent.json`;
- each replay step's sha256, as the replay server printed it;
- the agent's poll interval (2 s in `replay-agent.json`) and each step's time from the replay
  moving to the picture changing;
- every manual action taken, and why.

The software rehearsal of phase E7.2b is in
[the phase notes](../production-page-refactor/evidence/phase-notes.md) (row 32).

## Clock and cadence

| Step | Interval |
| --- | --- |
| The agent reads the provider | every 2 s (`pollMs`) |
| The production accepts a new revision | at most one per source every 5 s |
| An unchanged read is confirmed | at most every 15 s; it moves "checked", never "changed" |
| Party totals and count bug | on air as soon as the revision is applied |
| An aired candidate card | the page hears the revision from the count bug's or party board's row at once; a revision that changes only candidates waits for the page's own read, every 5 s |

Measured in the software rehearsal: about 2 to 3 s from the replay moving to the picture
changing when the party board or count bug moves too, and about 5 s when only the candidates
change (an aired card corrected on the output); the walk fails above 10 s and 13 s. By arithmetic, a candidates-only change can take
about 12 s at worst (2 s poll, 5 s revision gap, 5 s page read); the walk spaces its steps by
hand, so that case is not measured. The full record is in the phase notes.

## Operating limits

- **The page that took the card keeps it in step.** A candidate card on air follows a newer count
  only while the production page that took it is open. Close that page and the card keeps its
  last values; reopening the page holds what airs and says so, and **✎ Update** sends the
  current count again.
- **Two tabs of one production** both follow the same aired card. Each sends the same whole
  record, so the picture does not change; keep one tab open as the habit. (Read from the code;
  the rehearsal did not run two tabs.)
- **A new count sends the aired card's record again** even when that person's figures did not
  change (one update row per aired card per revision; the picture is the same).
- **A card on air keeps its person.** A correction to another candidate never moves an aired
  card. Picking someone else changes the card only at **✎ Update**, all fields at once.
- **A person the count no longer holds** (deleted, or an empty list) is not ready to Take; a card
  already on air keeps its last values with the reason and their age shown off air.
- **Sizes**: one revision's payload is at most 256 KiB as the production measures it. With
  records of the package's shape (about 150 characters each) that is 1,475 candidates on top of
  the party and count figures; a larger revision is refused whole and the last good values stay.
  One graphic's update is at most 64 KiB. The page's own caps on a collection (5,000 items,
  512 Ki characters) are larger than anything this road can deliver.
- **The candidate list is the source's.** A value typed into it by hand is replaced by the next
  revision, whole. To show something the results do not, use **Fixed values** on the cue.
- **Not in this rehearsal**: a real results feed, real candidates or photos, CasparCG, OBS, and
  any second production page on another machine.

## Recovery by hand

None of these was needed in the software rehearsal. Each is walked elsewhere, as noted; none
was walked with this package and the replay together.

| What happens | What to do | Where it is walked |
| --- | --- | --- |
| Wrong figures arrive | On the Data page, press **Pause** on the **Another system** card. The agent keeps reading but nothing new reaches air; **Resume** sends the latest values once. (A connector has no Pause button of its own in the sources line yet.) | `e2e/configured/external-data-connector.spec.ts` (the agent's revisions held, then Resume), `production-data-key.spec.ts` |
| A card must show something the results do not | Pick **Fixed values** in the cue's Live candidate menu: the cue keeps what it showed, no count changes it. Pick a candidate again to reconnect. | `e2e/production-pack.spec.ts` (this package, offline) |
| The agent stops | Restart it with the same command. It claims again and continues after the last revision the production took. If the old process died without letting go, it waits about 30 s and says so. | `e2e/configured/external-data-connector.spec.ts` (kill and restart) |
| The replay server stops | The fields keep their values. Restart it; a restarted server makes a new certificate and token, so restart the agent with the new token too. Its timeline starts again at the first count, which the production refuses as older; pass `--from-step <n>` (0 to 7: the step after the last `served` line) to resume there. | `e2e/configured/external-data-connector.spec.ts` (the provider gone, its credential rotated) |
| The page that took a card was closed | Reopen it; it says what airs. Press **✎ Update** on the card to send the current count. | `e2e/configured/election-selection.spec.ts` AC-3 (reload, another production, a restart) |
| The rehearsal must end now | **■ All out**, then stop the agent (Ctrl+C lets its claim go) and the replay server. | `e2e/configured/all-out-from-heads.spec.ts` (All out in general) |

## Rollback

Pause **Another system** on the Data page, or stop the agent, and leave the output on its last state. To return to the starter
data, use **Reset to seed** on the Data page, or reinstall the package into a new production.
Reverting phase E7.2b's change leaves the published collections read by nothing, and the route
writes no new candidate list. The last list it wrote stays in the production's data, so the
candidate cues keep showing that revision until a new one arrives some other way (Data → Raw
JSON, or `/api/data/patch`).
