# Hardware panel control - the wire protocol

The technical design under `spec.md`. Version 1. Field names are the wire names. Every decision
here is an implementation choice; the owner's requirements are in the spec.

## 1. Parties and roads

```
Companion + NoaCG module                 NoaCG cloud (Supabase)                  operator page
  holds: panel key                         panel_* RPCs, panel_* tables             holds: control slug
                                           Realtime topics                          (production page or
                                                                                     hosted control page)
  pairing ---- panel_pair_finish(code) --> key, feedback topic
  connect ---- panel_hello(key) ---------> feedback topic; `want` --- pnp-<p> ---> republish state
  press ------ panel_press(key, press) --> checks key, claim, rate --- pnp-<p> --> checks, onVerb
  feedback <------------------------------------------------- pfb-<f> --------- state, rows, result, beat
```

- **The module never broadcasts.** Every message it sends is an RPC that checks its key.
- **`pnp-<p>` (presses) is written only by the database** (`realtime.send` inside the RPCs). No
  client may broadcast on it. Its token `p` is handed only to holders of the control slug.
- **`pfb-<f>` (feedback) is written by the answering page** as a client broadcast (research §6.3:
  p50 44 ms, no database write) and read by paired panels. Its token `f` is handed only to a valid
  panel key or the control slug, and is replaced whenever a key is revoked.

## 2. How a panel key is authorised on a private Realtime topic

A Realtime join is authorised by RLS on `realtime.messages` with the caller's JWT. The module has
no NoaCG JWT, only the project's publishable key (role `anon`) and its panel key, which Realtime
cannot see. Three ways were weighed:

| Option | Why not, or why |
|---|---|
| Mint a JWT for the panel (an endpoint signs a token with a `panel` claim) | Needs the project's signing secret in a function, a token refresh loop in the module, and policies that read custom claims. Heavy for what it buys. |
| One per-production topic readable by the show id | The show id also opens `cmd-`, `log-`, `live-` and `seq-`, which carry graphic data. A panel key must read only what the page publishes for panels. |
| **Random topic tokens, handed out against the key, rotated on revoke** | Chosen. The policies only check the topic's shape, as the existing topics do; the token is the capability, and the key is checked every time a token is handed out. |

So: the RLS policies admit `anon` and `authenticated` to `pfb-<32 hex>` for SELECT and for INSERT
of broadcasts (never Presence), and to `pnp-<32 hex>` for SELECT only. A revoked key keeps the old
feedback token but the page stops publishing there (§6.4), so it hears nothing more.

**Accepted residual risk.** Any holder of the current feedback token, which includes every paired
panel, could broadcast a fake state to the other panels of that production. It cannot make anything
air: presses only travel through `panel_press`, and only the database writes `pnp-`. Revoking the
key rotates the token.

## 3. Identifiers

| Name | Shape | Minted by | Held by |
|---|---|---|---|
| control slug | existing | publish | operator pages |
| pairing code | 8 of `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown `ABCD-EFGH`; input ignores case, spaces and dashes | `panel_pair_start` | the page, for 5 minutes, then the operator types it once |
| panel key | `ncpk_` + 43 base64url characters (32 random bytes) | `panel_pair_finish` | the module's secret-text field; the server keeps only its SHA-256 |
| key id | uuid | the server | both; the page lists and revokes by it |
| press token `p`, feedback token `f` | 32 lowercase hex | the server, per production | `p`: pages. `f`: pages and paired panels |
| page id | 16 lowercase letters and digits, random per page load | the page | the page; shown to panels as who answers |
| claim | bigint, per production, only ever increases | `panel_claim` | the answering page |
| press id | `<instance>:<n>`, instance 6 to 24 lowercase letters and digits minted per module start, n a counter | the module | reused on the module's own retry of one press |

## 4. RPCs

All are `security definer`, `search_path = ''`, granted to `anon` and `authenticated`, and answer a
JSON object. An expected refusal is `{ok: false, refused: <code>, note: <sentence>}`, never an
exception, so the module and the page handle one shape. An unknown control slug raises, as the
existing `control_*` RPCs do. The panel tables have RLS on and no policies; only these functions
read or write them.

| RPC | Caller | Does | Answers |
|---|---|---|---|
| `panel_pair_start(p_slug)` | page | mints a code for 5 minutes; at most 5 unused codes per production | `{ok, code, expires_at}` |
| `panel_pair_finish(p_code, p_label)` | module | spends the code once; mints a key | `{ok, key, key_id, label, title, feedback_topic}`; refusals `unknown-code`, `used-code`, `expired-code`, `slow-down` |
| `panel_hello(p_key)` | module, on every (re)connect | updates last use; sends `want` on `pnp-` when a page answers | `{ok, key_id, label, title, feedback_topic, answering}`; refusals `unknown-key`, `revoked` |
| `panel_press(p_key, p_press)` | module | validates the press, stamps the claim, sends `press` on `pnp-` | `{ok, claim}`; refusals `unknown-key`, `revoked`, `bad-press`, `not-a-panel-verb`, `no-page`, `slow-down` |
| `panel_list(p_slug)` | page | | `{ok, press_topic, feedback_topic, claim, answering: {page, where, label, at} or null, panels: [{id, label, created_at, last_used_at}]}` |
| `panel_revoke(p_slug, p_key_id)` | page | marks the key revoked; replaces `f`; sends `rotated` on `pnp-` | `{ok, feedback_topic}` |
| `panel_claim(p_slug, p_page, p_where, p_label)` | page, on switching the answer on | claim + 1; records who; sends `claim` on `pnp-` | `{ok, claim, press_topic, feedback_topic}` |
| `panel_release(p_slug, p_claim)` | page, on switching off or unloading | clears the answering page if `p_claim` is still current; sends `released` | `{ok, released}` |

**Bounds.** `panel_press` takes at most 20 presses per key in 2 s (`slow-down`). A failed
`panel_pair_finish` counts against the caller's address (the first entry of `x-forwarded-for`, or
one shared bucket when absent): 10 failures a minute, then `slow-down` until the minute passes.
Labels are trimmed to 60 characters. Codes and revoked keys are kept, so a used or expired code is
answered as such; codes older than a day are deleted by the next `panel_pair_start`.

**The press as sent** (`p_press`): `{verb, target, seen, id}`.

| Field | Rule |
|---|---|
| `verb` | one of the panel verbs (spec D5), else `not-a-panel-verb` |
| `target` | `^[A-Za-z0-9_.:-]{0,80}$`: the row id the key showed the verb acting on, or empty for verbs with no row |
| `seen` | integer from 0: the `ver` of the state the key was drawn from |
| `id` | `^[a-z0-9]{6,24}:[0-9]{1,12}$` |

Anything else is `bad-press`. The RPC rebuilds the object from these four fields, so no other field
reaches the page.

## 5. Press topic `pnp-<p>` (database to pages)

| Event | Payload | Sent by |
|---|---|---|
| `press` | `{v: 1, verb, target, seen, press_id, claim, panel: {id, label}}` | `panel_press` |
| `want` | `{v: 1, panel: {id, label}}` | `panel_hello`: the answering page republishes `state` and `rows` |
| `claim` | `{v: 1, claim, page, where, label}` | `panel_claim`: every other page with the answer on switches it off |
| `released` | `{v: 1, claim}` | `panel_release` |
| `rotated` | `{v: 1, feedback_topic}` | `panel_revoke`: the answering page moves to the new feedback topic |

Realtime adds its own message id at `id` to every payload the database broadcasts, which is why
the press id travels as `press_id` here; readers ignore `id`.

Only pages read this topic, and only while the answer is on or the panel section is open.

## 6. The page

### 6.1 Answering

The switch "Answer the panel on this page" sits in the panel section of the production page and of
the hosted control page. On: `panel_claim`, join `pnp-` and `pfb-`, publish `state` and `rows`.
Hearing a `claim` with a higher number: switch off, say which page answers now. Off, or
`pagehide`: publish `gone`, `panel_release` (best effort; a closed laptop is covered by the
module's 12 s silence, §7.2). The switch is not remembered across reloads: a reloaded page answers
only when someone switches it on again, so two forgotten tabs can never fight.

### 6.2 Running a press

In this order, on each `press`:

1. `claim` is not this page's: ignore. If it is higher, this page has been replaced: switch off.
2. `press_id` handled in the last 10 minutes (memory of the last 256 ids): publish the remembered
   `result` again with `outcome: duplicate`. Runs nothing.
3. A verb this surface does not run (the hosted control page has no server clips, folders or All
   out): `not-here`.
4. Target and direction, against the page's last 64 published states (a ring keyed by `ver`):

   | Verb | Refused `stale` when |
   |---|---|
   | `take`, `retake`, `update`, `next`, `out`, `pause`, `resume` | `target` is not the row selected now |
   | `take` | also: what `take` does now (`space`) differs from what it did at `seen`, or `seen` is no longer in the ring |
   | `take-cue` | `target` is not a row now, or whether it is on air differs from at `seen` |
   | `select-cue` | `target` is not a row now |
   | `pause-toggle` | the clip the clock follows, or whether it is paused, differs from at `seen` |
   | `select-prev`, `select-next`, `all-out` | never: walking airs nothing, and All out is always meant |

5. Not allowed now, by the page's own enabled state (`allowed` in the state, `blocked` for
   `take-cue`): `not-allowed`, with the page's own sentence when it has one.
6. Run `onVerb(verb, {repeat: false, cue: target})`: `ran`. "Ran" means dispatched; what aired
   shows in the next `state`. A Take the dispatcher sends carries the page's own Step 2 sender
   protocol, so the server's duplicate and stale refusals still apply after this.

Every refusal is written to the page's activity line naming the panel ("Desk deck: Take refused,
the selection moved"). The panel section shows the last press and its outcome.

### 6.3 Publishing feedback (`pfb-<f>`, page to panels)

| Event | When | Payload |
|---|---|---|
| `state` | on each change, on `want`, after joining | §8 |
| `rows` | when the rundown's rows change, on `want`, after joining | `{v: 1, rowsVer, rows: [{id, label, kind: 'cue' or 'folder', source: 'graphic' or 'server' or null, folder?}], more}`, at most 100 rows |
| `result` | after each press | `{v: 1, id, panel, outcome: 'ran' or 'duplicate' or 'stale' or 'not-allowed' or 'not-here', note?}` |
| `beat` | every 4 s | `{v: 1, page, claim, ver, rowsVer}` |
| `gone` | switching off, `pagehide` | `{v: 1, page, claim}` |
| `moved` | after `rotated`, on the old topic, before leaving it | `{v: 1}` |

A change is detected by comparing the state without its clock times; a clip's `end` moving by less
than 250 ms is not a change. `ver` increases by one per published change.

### 6.4 Revoke

`panel_revoke` answers the new feedback token and announces `rotated`; the answering page
publishes `moved` on the old topic, leaves it, joins the new one and publishes `state` and `rows`.
The remaining modules hear `moved`, call `panel_hello` and follow; the revoked one is answered
`revoked` and says so on its keys.

## 7. The module

### 7.1 Connection

Config fields: **Pairing code** (text), **Panel name** (text, default "Companion"), **Panel key**
(secret-text, filled by pairing; an operator never types it), and **NoaCG address** (default
`https://noacg.studio`, changed only for a self-hosted NoaCG). The module finds the backend by
fetching `<address>/panel.json`, `{v: 1, supabaseUrl, supabaseKey}`, which the app serves from its
own build configuration (both values are already public in the app's bundle), so a rotated
publishable key needs no module update. With a code and no key, the module
calls `panel_pair_finish`, saves the key into the secret field and clears the code. Then
`panel_hello`, join `pfb-<f>` as a private channel with the publishable key, and wait for `state`.
On a dropped connection it rejoins with backoff (1, 2, 4, then every 8 s) and calls `panel_hello`
again. `moved` or a `beat` whose `ver` or `rowsVer` it has not seen also calls `panel_hello`.

### 7.2 Status

| Status | When | Keys |
|---|---|---|
| `ok` | a `state` or `beat` heard in the last 12 s | follow the state |
| `no-page` | hello answered `answering: false`, a press refused `no-page`, `gone` heard, or 12 s of silence | every NoaCG key shows "No operator page"; presses refused locally |
| `revoked` | hello or a press refused `revoked` or `unknown-key` | "Panel key revoked. Pair again." |
| `offline` | the backend cannot be reached | "NoaCG offline" |
| `pairing` | a code is being exchanged, or no key yet | "Pair in Companion's connection settings" |

### 7.3 A press

Build `{verb, target, seen: the current ver, id}`; `target` is the selected row for the selected-row
verbs, the action's own row for `select-cue` and `take-cue`, the clock's cue for `pause-toggle`.
Refuse locally when not `ok`. Call `panel_press`; on a network error (not a refusal) retry once
within 1 s with the same `id`. Wait up to 1.5 s for the `result` with that `id`; with none, flash
the key and set the status line to "No answer from the operator page". Never queue a press.

### 7.4 Clocks

The module counts the clip down itself. On each `state` it records its own receive time `r`; the
page's clock maps to the module's as `local = page + (r - at)`. Time left is `end` mapped to local
minus now, unless `phase` is `paused` (show `remaining`) or `holding` (show the time since `end`).
The warning and final styles turn on at the `warn` thresholds (10 and 5 s) from that count, so no
per-second message is needed. The variables tick every 250 ms while a clip runs.

## 8. The feedback state (version 1)

```json
{
  "v": 1,
  "ver": 42,
  "rowsVer": 7,
  "page": "k3j9x0q2m4n8b1c5",
  "claim": 12,
  "where": "production",
  "label": "Production page",
  "title": "Friday match",
  "at": 1759400000000,
  "selected": "cue_8f2a",
  "space": "take",
  "live": ["cue_1b7c"],
  "allowed": {
    "take": true, "retake": false, "update": false, "next": false, "out": false,
    "select-prev": true, "select-next": true, "pause": false, "resume": false,
    "pause-toggle": false, "all-out": true
  },
  "blocked": [],
  "clip": {
    "cue": "cue_33d0", "label": "Opening VT", "phase": "counting",
    "start": 1759399990000, "end": 1759400020000, "remaining": 20,
    "estimated": false, "next": null
  },
  "warn": [10, 5],
  "bridge": "ok"
}
```

| Field | Meaning |
|---|---|
| `where` | `production` or `control` |
| `selected` | the row id PREVIEW and the verbs act on, or null |
| `space` | what `take` does now: `take`, `take-off` or `preview`; null with nothing selected |
| `live` | the cue ids on air now, graphics and server cues |
| `allowed` | each panel verb's enabled state as the page draws it; `select-cue` and `take-cue` are per row |
| `blocked` | row ids whose `take-cue` would be refused now |
| `clip` | null, or the clip the clock follows: `phase` is `counting`, `holding`, `paused` or `looping`; `start` and `end` in the page's clock (ms) or null when unknown; `remaining` in seconds at `at` |
| `bridge` | `ok`, `down`, or `off` when this page has no Bridge configured |

Readers ignore fields they do not know. `v` changes only for an incompatible change; a module that
meets an unknown `v` shows "Update the NoaCG module".

## 9. Latency budget

Research §6.4 measured 192 ms p50 through Companion's Generic HTTP and a local forwarder, and the
page dispatching a synthetic key event. This build removes the forwarder, calls `onVerb` directly
on receipt, and keeps the RPC to one indexed key lookup, one update and one `realtime.send`. The
module keeps its HTTPS connection alive between presses. Nothing on the path waits on feedback.
