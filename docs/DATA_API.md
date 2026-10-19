# The Production Data API

Push live data - scores, clocks, results, headlines - into a published production's graphics
over plain HTTPS. This page is written for the integrator: the person wiring a timing system,
a spreadsheet poller or a results service into a NoaCG production. The architecture it
implements is `docs/CLOUD_PLAYOUT.md` §7; the operator workflow around it is that document's
§4.

**The model in one paragraph.** A published production is driven by one durable command log:
every operator action is a row, the on-air renderer applies rows in order, and this API makes
your system one more writer of `update` rows in that same log. You never talk to the renderer,
you never hold provider credentials in a browser, and the operator always wins a race with
your feed simply because later rows apply later - "freeze the feed" is you not writing, and
"manual override" is the operator writing after you.

## Authentication

Every request carries the production's **data key** as a bearer token:

```
Authorization: Bearer <data key>
```

- The key is **per production**, minted automatically when the production is published
  (`control_shows.data_key`, migration 0047). The production owner hands it to you; treat it
  like any API credential (server-side config, never a web page).
- **Where the owner finds it:** the production's **Data** tab, `▾ Data key` in the Production
  data panel, then Reveal or Copy (`ProductionDataPanel.tsx`; the key is read over RLS by
  `productionDataKey()`). It is hidden until asked for, because that screen is regularly in
  front of a room. Until 2026-08-27 there was no such screen and this page told a hosted owner
  to read the database row, which they cannot do.
- It carries **one invariant**, and this is the useful phrasing of it:

  > External integrations manipulate production data, never individual graphic instances.
  > Writes describe state, never graphic commands.

  The only thing that accepts this key is this API, and this API writes nothing but data. It
  cannot play, stop, take or clear a graphic, and it is deliberately not the operator page's URL
  capability. (An earlier wording said "update-only by construction". That was a claim about
  VERBS, and it prejudged the read-back an integrator legitimately needs after a restart -
  `docs/PRODUCTION_DATA_PLAN.md` §7. The invariant above is the one that actually matters, and a
  read endpoint is compatible with it.)
- **Rotation / revocation** (owner-side): unpublishing and re-publishing the production mints
  a fresh key (the four viewer/operator URLs deliberately survive that; the data key
  deliberately does not). The owner can also overwrite or clear the key directly on the row -
  a cleared key (`NULL`) switches ingest off for that production while everything else keeps
  running.

## The endpoint

```
POST https://<host>/api/data/update
Content-Type: application/json
```

```jsonc
{
  // WHICH GRAPHIC - optional when the production has exactly one:
  "graphic": "House Scorebug",   // pool graphic name, OR
  "cue": "Match",                // a cue label; it addresses the graphic that cue drives

  // WHAT TO WRITE - field values by the graphic's own field labels:
  "values": {
    "Score A": 2,                // numbers and booleans are fine; they land as strings
    "Score B": 1,
    "Clock": "43:12"
  }
}
```

A `200` answers with what actually happened:

```jsonc
{
  "ok": true,
  "event": 18234,                 // the command-log row id - the ordering fact
  "graphic": "House Scorebug",
  "applied": { "f1": "2", "f3": "1", "f5": "43:12" },
  "ignored": ["Referee"],         // labels that matched no field (extra columns are fine)
  "ambiguous": []                 // labels matching MORE than one field - skipped, never guessed
}
```

## Field-label mapping

Fields are addressed by the **labels the graphic itself shows its operator** - the same
binding the production's dataset workspace uses, so a feed and a spreadsheet speak the same
language:

- A label matches a field's **title**, compared trimmed and case-insensitively
  (`"score a"` = `" Score A "`).
- A field that has no title matches its raw id (`f0`, `f1`, …), and the id always works as an
  explicit address too.
- Unmatched labels are **reported back in `ignored`**, never silently dropped; if *nothing*
  matches, the request is a `400` - that is a broken mapping, not a partial one.
- A label that matches two fields lands in `ambiguous` and writes nothing - rename one of the
  fields rather than relying on a guess.
- Only data-carrying fields are writable (text, number, dropdown, checkbox, colour, image
  path, hidden input values). Buttons, captions and dividers are not fields.

An update writes **data only**. It never plays, stops or advances a graphic, and it never
causes a state transition - templates re-render their fields, timers and tickers read their
new values, and the operator's machine state is untouched (`update()` in the SPX contract).

## Ordering guarantees

- Your update is **one row in the production's command log**, ordered by the database at
  insert. Two of your updates apply in the order they were accepted; an operator command sent
  after yours applies after yours. There is no second channel that could reorder around this.
- The on-air renderer applies the log **in order, whoever wrote the row** - it cannot tell
  your update from an operator's, which is the point.
- A disconnected renderer catches up **in order** when it returns; your accepted update is
  never lost to a renderer reboot (the log is durable, and recovery replays it).
- `event` in the response is the log row id. Ids are global to the instance, so treat them as
  ordered, not consecutive.

## Rate limits

Three layers, all answering `429` with a `Retry-After` header - honour it:

| Layer | Default | What it protects |
| --- | --- | --- |
| Per client IP | 300 requests / 60 s | The function, from a hammering client (a fast pre-filter in front of the database) |
| Per production (ingest budget) | 25 updates / 5 s | **Operator headroom**: the log itself allows 50 commands / 5 s per production, shared with the operator - ingest may spend at most half. Enforced **in the database** (feed rows are marked and counted there), so a runaway feed cannot lock the person driving the show out of their own production no matter how many server instances it hits |
| The log's own cap | 50 commands / 5 s | The production, from everything combined |

A scorebug clock at one update per second uses a fifth of the ingest budget. If you need more
than ~4 updates per second sustained, batch values into fewer requests - one request carrying
`Score A`, `Score B` and `Clock` is one command, not three.

## Errors

Every error is JSON in one shape:

```jsonc
{ "error": { "code": "invalid", "message": "what went wrong", "issues": ["per-label detail"] } }
```

`code` is one of `invalid`, `unauthorized`, `too_large`, `rate_limited`, `internal`,
`unavailable`, `not_found`; `issues` appears only when there is per-label detail to give
(the nothing-matched `400`).

| Status | Meaning |
| --- | --- |
| `400` | Malformed body, unknown graphic/cue, or no label matched a field. The message says which. |
| `401` | Missing or unknown data key. |
| `403` | Hosted control is switched off for this production's owner. |
| `413` | Body over 16 KB - this is a field-value channel, not an upload path. |
| `429` | A rate limit above; retry after `Retry-After` seconds. |
| `500` | The write failed server-side; safe to retry. |
| `503` | This deployment has no backend configured (self-hosted offline build). |

## curl examples

Goal for the home side (single-graphic production - no target needed):

```bash
curl -s https://noacg.studio/api/data/update \
  -H "Authorization: Bearer $NOACG_DATA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"values": {"Score A": 1}}'
```

Clock tick, addressed to a named graphic in a multi-graphic production:

```bash
curl -s https://noacg.studio/api/data/update \
  -H "Authorization: Bearer $NOACG_DATA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"graphic": "House Scorebug", "values": {"Clock": "43:12", "Period": "2H"}}'
```

Addressing by cue label (the cue names which graphic it drives; its prepared values are not
touched - this writes live data to that graphic):

```bash
curl -s https://noacg.studio/api/data/update \
  -H "Authorization: Bearer $NOACG_DATA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cue": "Match", "values": {"Score B": 2}}'
```

A ready-made demo loop - a full match clock driving score and time against a published
production - is `scripts/data-api-demo.mjs`:

```bash
node scripts/data-api-demo.mjs --url https://noacg.studio --key <data key>
```

## Worked example: a live weather production (Open-Meteo)

The first real external-data integration: the WEATHER mini-pack (`lt62` "House Weather",
`ig37` "House Forecast", `bug37` "House Temp") driven by `scripts/weather-feed.mjs`, a
Node connector polling [Open-Meteo](https://open-meteo.com) (keyless, free for
non-commercial use; weather data by Open-Meteo.com, licensed CC BY 4.0 - keep the
attribution when you use it).

**The field titles are the contract.** The three graphics title their fields deliberately -
`Place`, `Temperature`, `Condition`, `Wind` on the strap and the bug, plus `Day 1 name`,
`Day 1 high`, `Day 1 low`, `Day 1 condition` (and the same four for days 2 and 3) on the
forecast board - and the connector posts exactly those labels. Retitling a field in a saved
graphic breaks the feed's mapping for that production; the `ignored` list in each response
is where a broken label shows up first.

**The templates stay dumb** (docs/CLOUD_PLAYOUT.md §7): the WMO weather-code wording, the
weekday names and the compass points live in the connector (`--lang en|fi`), and every value
lands as a plain string - so an operator can type `Sunny` over the feed at any time, and the
next tick takes it back (later log rows win).

The walk:

1. Create the three weather graphics from the wizard (search "weather"), add them to one
   production, publish it, and open its `/output` URL somewhere visible.
2. Read the production's data key (see "For the production owner" below).
3. Start the feed - one POST per graphic per tick, default every 10 minutes (min 60 s;
   even three graphics per tick sits far inside the 25-per-5s ingest budget):

   ```bash
   node scripts/weather-feed.mjs --key <data key> \
     --graphic "House Weather" --graphic "House Forecast" --graphic "House Temp" \
     --lat 60.17 --lon 24.94 --place HELSINKI --lang fi
   ```

4. Take the graphics on air from the operator page; the values keep updating on air,
   because a data update never plays or stops anything.

Failure semantics are the §7 doctrine: a failed Open-Meteo fetch or a failed POST writes
nothing (the graphics keep the last posted values - freeze IS not-writing) and retries next
tick; a `429` delays the next tick by its `Retry-After`; a `401` stops the feed. Point
`--url` at the canonical host (`https://noacg.studio`, the default) - the `*.vercel.app`
host answers with a `308`, and clients commonly drop POST bodies on redirect.

## Production data - the verb to reach for first

`POST /api/data/update` above addresses a GRAPHIC, so your system has to know the production's
rundown. **`PATCH /api/data/patch` addresses the DATA instead**: you write `match.home.score`,
and every field any graphic has BOUND to that path follows - on whichever graphics exist, live
or not. A scoreboard never learns that "sb03" is on air. Design: `docs/PRODUCTION_DATA_PLAN.md`.

```bash
curl -X PATCH https://noacg.studio/api/data/patch \
  -H "Authorization: Bearer $NOACG_DATA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"match":{"home":{"score":4}}}'
```

```jsonc
{
  "ok": true,
  "data": { "match": { "home": { "score": 4 } } },   // the whole tree AFTER the merge
  "writes": [                                        // only what actually moved
    { "graphic": "House Scorebug", "event": 18251, "applied": { "f1": "4" } }
  ]
}
```

**The operator writes this tree too, and not through this door.** A ± press or an ⚡ `+1` on a field
the production has bound moves the same value, from the dashboard, on the control slug the operator
already holds (`control_data_patch_by_slug`, migration 0060). Two things about that matter to you:
those rows are marked `src:'operator'` and spend NONE of the ingest budget in the table above, which
is yours alone; and the operator out-writes you by simply pressing later, which is the same
"manual override" rule every other verb has. Nothing about your door changed.

- **The body is any JSON object.** There is no schema: nest as deep as you like. `POST` is
  accepted as well as `PATCH`, for proxies that drop the latter.
- **Merge semantics are RFC 7386 JSON Merge Patch**: objects merge, a `null` VALUE deletes its
  key, arrays replace wholesale. So a patch names only what changed.
- **Writes are absolute state, never intent.** There is no "+1" - send the value. That makes a
  retry safe: sending `4` three times leaves 4.
- **Only what changed is sent on.** The bindings are resolved against the tree before your patch
  and after it, and only fields whose value actually differs become log rows. Re-sending the
  same score writes nothing and **spends none of your rate budget** - which is what makes a
  polling connector cheap.
- **A path nothing is bound to still updates the tree**, it just moves no graphic. Bindings are
  the operator's business, on the production's Data tab; your feed does not need to know them.
- **A missing or unwritable value writes nothing** rather than blanking a field, so a feed that
  drops a key leaves the last good value on air. Deleting a key with `null` behaves the same
  way: the tree loses it, the graphic keeps what it had.
- Values become field strings: numbers and booleans stringify, and an array of scalars joins
  with newlines (which is what a ticker's line-list field wants).

### Reading the current state

```bash
curl https://noacg.studio/api/data/state -H "Authorization: Bearer $NOACG_DATA_KEY"
```

Answers `{ "ok": true, "data": {...}, "bindings": {...} }` - what NoaCG currently believes,
so a connector reconciles after a restart or a partition instead of blindly pushing a whole
snapshot. It is idempotent and spends no ingest budget. It returns no capability: the data key
never widens into an operator one.

**Bindings must be published.** The RPC resolves against the bindings pinned on the production
at publish time, so a production whose bindings were authored after its last publish accepts
data and moves nothing until it is published again.

## What this API deliberately is not

- **Not an operator.** No play, stop, next, take, or state jumps - airing is a human decision
  on an operator surface. A feed that could clear the frame would be a second operator with
  no face.
- **A read of the data only.** `GET /api/data/state` answers the production's current tree and
  bindings, so an integrator reconciling after a restart can ask what NoaCG believes rather than
  push a whole snapshot blindly. Nothing else is readable here: what is on air and the rundown
  belong to the operator surfaces.
- **Not a renderer channel.** There is no path from here to the output page except the same
  log every operator writes; the renderer stays dumb on purpose.

## For the production owner

The key is on the production's `control_shows` row (`data_key`), minted at publish. Read it on
the production's **Data** tab (`▾ Data key`, then Reveal or Copy); an owner session can also read
the column directly, since the row is RLS-guarded and only you and the server can see it.

Hand it to the integrator out of band. Rotate by unpublishing and re-publishing (viewer and
operator URLs survive that by design), or by updating the column; clear it to `NULL` to turn
ingest off entirely.
