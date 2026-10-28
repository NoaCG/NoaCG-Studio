# Operator guide: a live production with data, CasparCG, OBS and Companion

E8 AC-4 (row 45 of the production-page run, E8.2). This guide is for the person who runs the
show. It says what to set up, what each screen tells you, and what to do when something stops.
Where another guide already covers a step in full, this one says the short version and links it.

**Before you rely on anything here,** read the [capability and limitation
matrix](capability-matrix.md). It says how far each part has been tested. In short: everything
was tested in software; the real studio (CasparCG through NoaCG Bridge, OBS, the Stream Deck) is
tested by the owner in H0.2 and S, after this guide; no official election feed has been tried.

Words used here: **production page** is the page you run the show from (also called the
controller). **Output** is the page that draws the graphics on air: CasparCG or OBS loads it.
**Agent** is the small program that reads a results source and sends it to your production.

## 1. Install and connect

Do this once per computer, at least a day before the show.

### NoaCG

Nothing to install. Open noacg.studio in Chrome or Edge and sign in. Safari cannot reach NoaCG
Bridge; use Chrome, Edge or Firefox for a CasparCG show.

### NoaCG Bridge (for CasparCG)

1. On the production page press **Playout** in the header and switch on **CasparCG via
   Bridge**. On the **NoaCG Bridge** row press **Download**; on the page that opens, download
   NoaCG Bridge, then double-click the file.
   Windows may warn that the file is unsigned: choose **More info**, then **Run**.
2. A page opens in your browser (or press **Pair** on the same row). One click pairs this
   browser with the Bridge. If the browser asks whether the site may reach your local network,
   allow it.
3. The same page connects to CasparCG. It remembers the servers you used.
4. Publish the production. The slot row in the Playout panel should read **Loaded**; if it does
   not, press **Load**.

On another computer, or a browser that forgot its data: download and pair again (step 1 and 2).
The Bridge keeps the server list, so you do not retype the server. Updates are never automatic:
download the new Bridge from the same page. Full detail: [`docs/BRIDGE.md`](../../BRIDGE.md) §2.

### OBS

Add a **Browser** source of 1920 x 1080 with the production's output address (press **Output
URL** on the production's card in Productions to copy it). Detail and known OBS settings:
[`docs/OBS_ON_A_REAL_HOST.md`](../../OBS_ON_A_REAL_HOST.md).

### Companion and the Stream Deck

Follow the module's own guide, which Companion shows as the **?** beside the connection
([`companion-module/companion/HELP.md`](../../../companion-module/companion/HELP.md)). In short:

1. In Companion open **Modules**, press **Import module package** and choose the file
   `noacg-studio-0.2.0.tgz` (or newer).
2. On the production page open **Setup**, then **Stream Deck panel…**, and press **Pair a panel**.
   A code like `ABCD-EFGH` appears; it works once, for five minutes.
3. In Companion open **Connections**, search `NoaCG`, press **Add** beside **NoaCG: NoaCG
   Studio**, then **Add** again. Type the code into **Pairing code**, name the panel, press
   **Save**.
4. Keep the production page open. Its header shows **Panel ✓**.
5. In **Buttons**, **Presets**, **NoaCG**, drag keys onto your buttons: **Show control**, **Cues**
   and **Pinned graphics**.

**To pair again** (a new Companion, a lost panel): clear **Panel key** in the connection and type
a new code. **To lock a panel out:** press **Revoke** beside it in the page's panel list.

### The agent (for a JSON results source)

This step needs someone comfortable with a command line. The agent runs on a computer you keep
on during the show; it is not a cloud service.

1. That computer needs Node 22 or later and a copy of the NoaCG Studio repository.
2. The agent's settings file names the source and where the credential is. The credential itself
   never goes in the file. The full steps are in [`docs/DATA_API.md`](../../DATA_API.md),
   "Install and run"; for the election replay they are in
   [`playout-election-package/rehearsal.md`](../playout-election-package/rehearsal.md).
3. The source must be registered on the production first. For an address the browser can reach,
   **Connect data…** on a graphic does that. For a source only the agent can reach (a local
   replay server, a private feed) the published site cannot do it yet
   ([#1734](https://github.com/NoaCG/NoaCG-Studio/issues/1734)); the rehearsal guide's step 2
   shows the current way, which needs a development build.
4. Start the agent with the command in those guides. Its window shows a line like
   `claimed: epoch 1`, then one line per read: `changed`, `unchanged`, `stale` and so on.

**Moving the agent to another computer (rebind).** A settings file copied with `--export` keeps
only the name of the credential, not the credential. On the new computer the agent refuses to
start and says: "this configuration is not bound on this machine (an export, say): bind
NOACG_SOURCE_… here before it reads (rebind)". Set the credential there as the guide says, then
mark the file bound (`"credentialBound": true`). If the credential is missing, the agent says
"the credential … is not set on this machine".

## 2. Credentials

| Credential | Where it lives | Where it never goes |
| --- | --- | --- |
| The production's data key (lets the agent or another system write to this production) | on the production; on the Data page's **Another system** card behind **Reveal** and **Copy** | in a show file, a package, an export, a chat, an issue or this guide |
| The results provider's key | only in an environment variable on the agent's computer (`NOACG_SOURCE_…`) | in the agent's settings file; the agent refuses to start if one is written there ("unknown configuration keys: …") |
| The Companion panel key | in Companion's connection, masked | anywhere else; **Revoke** ends it |
| The Bridge pairing | in the Bridge's own folder on that computer | it never travels in a web address |

Nothing NoaCG exports carries a credential: a package names the connector's address without its
query string and says the connection does not come with it. The agent's log shows a key as
`[redacted]`. If a key may have leaked: for the provider's key, put the new one in its variable
and restart the agent (until then reads report `denied` and the fields keep their values); for the
data key, ask the maintainer to change the production's data key (there is no button for it on
the page; [`docs/DATA_API.md`](../../DATA_API.md), "For the production owner"), then restart the
agent with the new key. Do this between shows only. Details:
[`docs/DATA_API.md`](../../DATA_API.md), "Rotating a credential".

## 3. Is the data fresh?

| Source | Where you see it | What the words mean |
| --- | --- | --- |
| Google Sheet or news feed | the sources line under the Playout panel, and the Data page | "checked N s ago · changed N s ago" is healthy. "reading…" is a read under way. "paused" means you paused it. "<problem> since HH:MM" in amber, then " · stale", means reads are failing and the last good values stay on air. A Sheet is read every 5 seconds while a production page is open. |
| A field connected to a source | the field in the cue editor | "🔗 Sheet: …" or "🔗 Connector: …"; "⚠ stale · …" when its source is failing. A field still waiting reads "waits for the next read". |
| The agent's JSON source (Connector) | the agent's own window; the Data page's **Another system** card | The agent reads every few seconds (every 5 by default; its settings file can set another pace, the election replay's says 2) and prints each status. The card shows "Received N s ago" for the last new values. That time also grows while results simply do not change, so an old time alone is not a failure: look at the agent's window. There is no Connector line in the sources line yet. |

A source never Takes a graphic, never moves to the next step and never clears anything. New
values reach a graphic that is already on air; nothing new goes on air without your Take.

**Limits.** One revision per source at most every 5 seconds, and at most 256 KiB. A larger
revision is refused whole and the last good values stay on air; the agent's window says "not
taken (413 …)".

## 4. When the data is wrong or stops: manual fallback

| Situation | What to do |
| --- | --- |
| Wrong figures are arriving | On the Data page, press **Pause** on the **Another system** card. It reads "Paused. What it sends is held; your presses still air." **Resume** sends the latest values once. For a Sheet or feed, press **Pause** on its line. |
| One cue must show something the source does not | For a live candidate cue, choose **Fixed values** in its **Live candidate** menu: the cue keeps what it shows and no count changes it. **If that cue is on air, then press ✎ Update**: until you do, the card on air keeps following its person's new counts. For any other field, press **Disconnect** (or **Disconnect to edit here** for a list), type, and press **✎ Update** if the cue is on air. To stop everything changing at once, use **Pause** (above). |
| You want a one-time copy of the source's values (Fill) | In **Connect data…**, after **Read**, press **Fill this cue** instead of **Connect**. The values are copied into the cue and follow nothing. They go on air at your next Take or **✎ Update**. |
| The source is down | Do nothing in a hurry: the last good values stay on air. Pause if you do not want them to jump when it comes back. Then restart the agent or the provider (section 5). |
| Everything must go now | **■ All out** in the page's header. |

## 5. Restarts

| What restarted | What you see | What to do |
| --- | --- | --- |
| **The agent** (stopped, crashed, or moved to another computer) | Its window says `claimed: epoch N, continuing after revision M`. If the old one died without stopping cleanly, the new one waits about 30 seconds and says so. A second agent started beside a running one says "not claimed (409 held by another agent)" and writes nothing. | Start it again with the same command. Stop it with Ctrl+C, which lets its claim go. |
| **The production page** (reloaded, or reopened after closing) | The page reads what is on air from the server. A live candidate card it took before is held, with the reason shown, until you press. | Look at the output first. Press **✎ Update** on a live candidate cue to make it follow again, and on bound boards if the source may have gone quiet during the reload ([#1797](https://github.com/NoaCG/NoaCG-Studio/issues/1797)). |
| **NoaCG Bridge** | The Playout panel says which part is not answering, for example "Start NoaCG Bridge on this machine". With a server cue up, PROGRAM can dim with "BRIDGE NOT ANSWERING · NOT LIVE". | Start the Bridge again (double-click it). The slot comes back by itself within about 10 seconds. |
| **The CasparCG server** | The slot row reads **Reloading…** in amber: the page loads its own output again by itself, onto the same channel and layer. What then airs follows the command log. | Nothing, if it comes back. If three tries fail (at once, then about 10 and 60 seconds later), the row reads **Empty** in red with the reason under it ("Loading it again did not bring it back."), the status reads "Not on 1-20" (your slot), and you press **Load**. **Also press Load** after a CasparCG restart if you reloaded the production page since you last pressed Load: the page only remembers its own Load while it stays open. A restart so quick that the page never saw the server gone also needs **Load**. |
| **The output page** (CasparCG or OBS reloaded it) | It reads what is on air from the server and draws it again. | Nothing. If an imported OGraf graphic's line under PROGRAM says it was not confirmed, press **Re-cue**. |
| **Companion** | Keys show the page's state again once Companion is back. A key that turned amber with "?" after a press means "not known whether it ran"; it is never sent again by itself. | Look at the output before pressing again. A dark key with "?" before its name means the control is gone: drag the new preset onto the key. |

A lost connection is always shown: PROGRAM dims and reads "CONNECTION LOST · NOT LIVE" (or names
the Bridge or CasparCG). The page never claims a picture it cannot see: "logged HH:MM:SS" means the
server took the command; no output reports its picture back.

### PREVIEW and PROGRAM: what is on air

| You see | It means |
| --- | --- |
| **PREVIEW** | Only a preview on this page. Nothing on air. |
| **PROGRAM · ON AIR** | What the outputs were told to show. |
| **PROGRAM · NOT PUBLISHED**, "To: this page only" | The production is not published: Take reaches this page only. |
| "sending…" | A command on its way. |
| "not confirmed" | Sent, no answer yet. |
| "logged HH:MM:SS" | The server logged the command at that time. |
| "Not on air yet. Press ✎ Update" (in the cue editor) | You changed something on a cue that is on air. Air changes only when you press **✎ Update**. |

## 6. An imported OGraf graphic will not play

Imported (foreign) OGraf packages play on the outputs only; PREVIEW and PROGRAM show a plate
saying "An imported OGraf package plays on the outputs; this monitor does not load it."

| You see | Why | What to do |
| --- | --- | --- |
| "This OGraf package cannot be imported. …" when importing | The file is not a valid OGraf v1 package; the sentence says what is wrong. | Ask the package's maker for a corrected file, or use a NoaCG graphic. |
| "… was imported by a later version of NoaCG, so it is kept as it is and does not load here." | An older NoaCG build (for example after restoring a prior release) meets a package a newer one imported. Take and Publish are refused for it. | Use the newer build, or take the cue out of the rundown for this show. Nothing is deleted. |
| "… has changed since it was imported" or "… is missing or unreadable" | A file of the package was damaged. | Import the package again from its original file. |
| "This cue’s typed data … so it is read-only here." | The cue's values were saved by another version of NoaCG or for another revision of the graphic. | Leave the cue as it is; edit it in the version that saved it, or make a new cue. |
| "This output cannot read this command's data (…): reload this output." | An output page from an older build. | Reload that output (CasparCG: Unload, then Load; OBS: refresh the source). |
| A line under PROGRAM: "<name>: the output could not load it", "not known on the output", "the graphic refused …", "no answer to …" | The output answered, or did not, about this graphic. | If a **Re-cue** button shows, press it to take the live cue again. Otherwise take the graphic Out and use a NoaCG graphic. |

Only » Next and the ⚡ buttons work on an imported package; Back, Goto and skip do not yet
([#1775](https://github.com/NoaCG/NoaCG-Studio/issues/1775)). A value from a source reaches an
imported graphic on air at your next **✎ Update**, not by itself
([#1760](https://github.com/NoaCG/NoaCG-Studio/issues/1760)).

## 7. Restoring the prior release

If a new release of noacg.studio misbehaves during preparation, do not try to repair a live show.

1. **Take the graphics off with ■ All out** if anything wrong is on air, and keep the outputs
   loaded.
2. **Ask the maintainer to restore the last release that passed its check.** This is not
   something the operator does on the site: the maintainer reverts the change through the merge
   queue, or uses the hosting service's instant rollback to an earlier deployment. The database
   is never rolled back. Migrations only add, unless one was explicitly allowed to remove
   something (`db:push` refuses a removal by default); before going back past a release that
   allowed one, the maintainer reads that migration's notes. No report names the oldest safe
   release yet ([#756](https://github.com/NoaCG/NoaCG-Studio/issues/756) plans one).
3. **After the restore, reload every output** (CasparCG: Unload, then Load; OBS: refresh the
   source), then Take the cues again. If the release you went back to is older than PR #1765
   (merged 27 October 2026), an output that restarts puts imported OGraf graphics back to their defaults
   ([#1770](https://github.com/NoaCG/NoaCG-Studio/issues/1770)); taking them again sends their
   values.
4. **Your own pieces have their own earlier versions:**
   - NoaCG Bridge: every earlier version is on the project's GitHub releases page (`bridge-v0.9.0`
     and older). Close the Bridge and start the older file.
   - Companion module: import the earlier `noacg-studio-<version>.tgz` the same way as a new one.
     Take, Out, cue and pinned keys keep working with an older production page; keys for an
     imported OGraf graphic's own actions need a release from 28 October 2026 or later.
   - The agent: run it from the earlier copy of the repository.
5. **Never replay a press whose result is unknown.** An amber "?" key, a "not confirmed" tag or
   an unknown OGraf line means it may have run. Look at the output, then decide.

## 8. Before you go on air: what is not fixed

The full list, with what to do meanwhile, is in the matrix's "Known on-air defects not fixed".
The ones to keep in front of you:

- [#1795](https://github.com/NoaCG/NoaCG-Studio/issues/1795): an exported results board played
  again outside the `/output` page may show no rows. Play results boards through `/output`.
- [#1797](https://github.com/NoaCG/NoaCG-Studio/issues/1797): a value that arrives while the
  production page reloads can miss the output until the next update. Press **✎ Update** after a
  reload.
- [#1798](https://github.com/NoaCG/NoaCG-Studio/issues/1798): the output page's memory grows
  slowly. Reload outputs between shows.
- [#1802](https://github.com/NoaCG/NoaCG-Studio/issues/1802): a value that does not reach the
  output can stay missing for up to 30 seconds, with nothing marking it stale, if no newer value
  follows. If a bound board looks behind the source, press **✎ Update**.
- [#779](https://github.com/NoaCG/NoaCG-Studio/issues/779): two graphics with the same name in
  one production replace each other on the output. Give every graphic in a production its own
  name, and check the rundown for duplicates before the show.

Fixed in software and still to be seen on the real studio in S: a results board taken twice
(#1618), the output coming back after a CasparCG restart (#1657, section 5) and saved graphics'
letters Š and Ž (#1746).
