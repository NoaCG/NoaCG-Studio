# Data sources: how outside data and audience input reach graphics

Research date 2026-10-17. Asked by the owner before anything is built: what the data API does
today, which source kinds NoaCG should accept and where each enters, and whether the audience is
just another data source. The draft spec built from this is
`docs/work-specs/data-sources/spec.md`; its open decisions DS1-DS20 are the owner's.

**How the outside facts were read.** The cloud environment's network policy denied the hosts
(support.google.com, developers.google.com, rssboard.org, dev.twitch.tv, owasp.org), so no page
was opened directly. Each outside claim comes from a search engine's extract of the cited page
and is tagged: **[doc]** the cited page's own text matched the claim; **[3rd]** a third party
says so; **[unverified]** no source confirmed it. Re-open a [doc] page before quoting it to a
customer. Other products are described by pattern, not by name, unless NoaCG works with them;
the named survey notes behind §2.1 are not in the repository for that reason.

## The answer in short

1. **One model.** A production holds values and lists. Each comes from one source: typed in
   NoaCG, a Google Sheet, an RSS feed, or another system through the data API. A graphic's field
   connects to a value or list by name, every cue of that graphic shows it, and changes follow on
   air without a Take. Data never operates the show.
2. **The data API is the door for other systems**, not a developer feature beside the product. It
   already writes named values, the kind a Sheet would write; what is missing is that nobody can
   see it.
3. **Lists are the gap.** Tickers, schedules, standings, fixtures and credits all read one field of
   lines. A list from a Sheet or a feed fills that field through production data as it works
   today; only turning rows into lines is new.
4. **The audience is a source of candidates, not of values.** Viewers' messages and votes share the
   source line, status and Pause with data sources, but they reach air only as a cue an operator
   takes.

## 1. What NoaCG has today

### 1.1 Four ways data reaches a graphic, none of them named as such

- **Production data** (Data tab, `model/productionData.ts`): a tree of paths and values. Live: a
  field bound to a path shows its value in every cue of that graphic, and changes follow on air.
- **Tables** (Data tab, `ShowDataset` in `model/shows.ts`): rows and columns. Not live: the
  operator loads one row into a cue, matching column labels to field titles.
- **Audience** (Audience tab, `src/audience/`): messages and votes. Not live: "Send to rundown"
  adds a new cue with the text copied in.
- **The old Sheet block** (graphic editor, `control/liveData.ts`): a published CSV, live, through
  polling code pasted into one graphic's own script. Frozen, outside the log.

The data API adds a fifth door, `POST /api/data/update`, which writes one graphic's fields by
label and skips production data entirely.

### 1.2 The data API, as it is

**What it does.** Three verbs on `api/data/[...path].ts`, all on a published production, all
authorised by the production's data key (`docs/DATA_API.md`):

- `PATCH /api/data/patch` merges JSON into the production's values (RFC 7386: objects merge, `null`
  deletes, arrays replace). Every field bound to a changed path follows; only changed fields become
  log rows, so re-sending the same value writes nothing, though each request still counts toward
  the per-production limit below. An array of strings becomes lines in the field; an empty one
  writes nothing, so it cannot clear a field. A name with spaces is a valid path, so
  `{"Home score": 3}` works.
- `GET /api/data/state` reads back the values and bindings, for a sender recovering after a
  restart.
- `POST /api/data/update` writes one graphic's fields by their labels, named by graphic or cue.

Limits: 16 KB per request; 300 requests a minute per IP; 25 writes per 5 s per production, so the
operator always keeps the other half of the log's 50. It cannot play, take or clear anything.

**How someone uses it today**, step by step:

1. Sign in, then publish the production. The key is minted at publish; a local production has
   no key and no API.
2. Open the Data tab, press "Data key", Reveal, Copy.
3. Give the key and the address to whoever runs the other system. They write a program, or set
   up an automation tool's HTTP step, that sends `PATCH /api/data/patch` with JSON.
4. Bind each graphic field to a path on the Data tab, or press "Bind all by title".
5. Publish again if step 4 came after the first publish: the server resolves the bindings pinned
   at publish (`DATA_API.md`, "Bindings must be published"), so new bindings move nothing until
   then. The page shows the production as changed since publishing, without saying why.
6. Take the graphic. Pushed values follow on air.

**How a pushed value reaches a graphic in the rundown.** The value lands in the production's tree
on the server; the database resolves the bindings and appends ordinary `update` rows to the
command log; the output applies them like any operator command. Every cue of a bound graphic
shows the value in its preview, Take airs it, and the cue never stores its own copy
(`PRODUCTION_DATA_PLAN.md` §2.7). A path nothing is bound to changes the tree and nothing else.

**What makes it unclear.** No screen says what the API is for, which names it may send, or when
it last wrote. The public guide (`/docs#data-api`) leads with the graphic-addressed `/update`,
the opposite of the plan's own advice (`PRODUCTION_DATA_PLAN.md` §1). `DATA_API.md` still says
"Not a read API, yet" though `/state` exists, and still tells the owner to read the key from SQL
though the Data tab shows it. Binding needs paths, and pushing needs an account and a developer
(the 2026-10-16 walk, `sheet-data-flow` problem 4).

### 1.3 How a list reaches a ticker today

Production data joins an array of strings with new lines (`formatValue`). The catalog's 22
tickers (`src/templates/tickers/`) all take their items in one textarea, `f0`, split on new lines
by `parseTickerItems` (`tickers/shared.ts`). A blank line is skipped; ": ", "; " or a tab marks a
kicker. `f0` is titled "Ticker items" on nine designs and "Headlines", "Items", "Lines",
"Results", "Notices", "Instruments", "Crawl items" and others on the rest. An update while the
ticker runs does not restart it: a marquee keeps its position and continues into the new items, a
flip finishes the item on screen, a rotator swaps the current slot (`tickerMotion.ts`).

A ticker reads " | " as plain text; only the bilingual ticker (tk17) splits on it, between its
two languages. Other list graphics read one line per row with parts separated by " | ":

| Graphic | Field | Line |
| --- | --- | --- |
| Schedules (ig06, ig08-ig10) | one textarea | `time \| show` |
| Standings and leaderboards (st01-st04) | "Rows" | `Team \| value \| ...` |
| Fixtures (ig26-ig29) | one textarea | parts split on `\|` |
| End credits | "Credits" | `Role \| Name`, `# HEAD` for a heading |
| Bar charts (ig02) | one textarea | `Label \| value` |

A few use one field per row instead ("Day 1 name" on the forecast board, "Line 1" on an agenda
card). No field has a length or item limit; only the data API's 16 KB body caps a list. A table
cannot fill a list field today: it loads one row at a time into a cue (`control/cueData.ts`).

### 1.4 The audience, as it is

A viewer sends a message from the production's join page (`/join/<name>`, a published production
only) or in a Twitch or YouTube chat the operator connected in the Audience tab. Chat is read in
the operator's browser and forgotten on reload (`audience/chatIntake.ts`). Everything lands in the
inbox; the operator approves, edits the broadcast text, and "Send to rundown" creates a cue
(`ProductionAudienceWorkspace.tsx`). Votes are tallied in the tab and staged onto a vote board cue
by the operator. The audience interface has no method that reaches the command log, so nothing a
viewer sends airs without an operator; chat goes in through the same submit door as a phone, with
the same caps. The open problems are in `audience-flow` (issue #1313 and five walk findings).

## 2. Outside research

### 2.1 How other graphics and streaming tools connect data

Fifteen broadcast graphics, streaming and audience tools were surveyed from their public
documentation (extracts, as above; SPX and CasparCG read from their source code). Products NoaCG
works with are named; the rest are described by kind.

**Playout environments NoaCG works with.**

- **vMix:** a data source manager reads a sheet, CSV, XML, JSON or RSS on an interval the user
  sets. Title fields map to columns, matched by name automatically. A "selected row" feeds every
  linked title, and Auto Next steps rows on a timer. Its social module puts Twitch, YouTube and
  other comments in a queue; a setting shows only queued (approved) entries, another shows the
  newest automatically. Its JSON source takes an array of objects only. [doc]
- **SPX:** each CSV row can become a rundown item; templates fetch feeds themselves through a
  built-in proxy; other systems push field values by field id over HTTP. [doc, source code]
- **CasparCG:** named datasets are stored on the server and pushed with a template; no polling.
  [source code]
- **OBS:** no data model; a web page or text file is a source, so data and chat come in as
  hosted overlay pages. [doc]

**Patterns across all fifteen**, most common first:

1. **Match by name.** A column or key with the field's name fills that field. NoaCG does this.
2. **A token inside the text,** such as a column reference typed into the text box.
3. **Pick per field,** in the editor: source, column and row for each field, or drag a variable
   onto the element.
4. **A shared current row.** Clicking a row updates every linked graphic, with Next, Previous and
   automatic stepping. NoaCG's tables have the same idea (load a row, then Next).
5. **Push by field name over HTTP.** A desktop tool gives each graphic a copyable update address
   and body; a cloud service takes JSON shaped like the graphic's fields and keeps the last one.

Less common: binding a crawl to a whole cell range, which only one cloud service offers. That is
the list shape of section 1.3.

**Fewest steps found per source.** A sheet: five steps in one desktop tool (paste the sheet id
and tab, connect, put a column token in the text, click a row, take); two other tools first make
the user create a Google API key, the largest friction in the survey. An RSS feed: four steps
(add a reader, paste, add, drag fields). A JSON address: four or five, and only for an array of
objects. A push: two (copy a graphic's update address and body, give them to the other system).
None is shorter than pasting an ordinary share link into the field that needs it.

**Keeping viewers off air without an operator**, from strongest to weakest: an approval gate
before anything can air (the default in Q&A tools and alert moderation); nothing shown until the
operator clicks one item (browser streaming studios); rules first, then a person; split roles,
where a moderator lists messages and only the operator airs one. The counter-pattern, automatic
chat overlays, is the opt-in mode where a tool offers both. NoaCG's inbox is the first and second
together.

### 2.2 How data reaches a Google Sheet automatically

Google pages are under `support.google.com/docs/answer/` unless named.

- **IMPORTFEED, IMPORTXML, IMPORTHTML, IMPORTDATA:** every hour, "while the document is open".
  Re-entering the formula forces a refresh; reopening the sheet does not. [doc] 58515, 12188454.
- **IMPORTRANGE:** 30 minutes on the settings page, "first opened or opened within the past
  5 minutes" on its own page. The pages disagree. [doc] 58515, 3093340.
- **GOOGLEFINANCE:** quotes "may be delayed up to 20 minutes". [doc] 3093281.
- **The "every minute" recalculation setting:** recalculates volatile functions, and an import
  may not reference NOW() or RAND() at all. [doc] 58515, 12188454; [3rd] that it does not speed
  imports up.
- **Apps Script time trigger:** at most every 1, 5, 10, 15 or 30 minutes; 90 minutes of trigger
  run time a day on a personal account, 6 hours on Workspace; 20,000 fetches a day personal,
  100,000 Workspace; 6 minutes a run. [doc] developers.google.com/apps-script/guides/triggers
  /installable and /guides/services/quotas.
- **Zapier:** checks every 15 minutes on the free plan, 2 on Professional, 1 on Team; its Sheets
  triggers take about 3 minutes. [doc] zapier.com/help/plans-pricing.
- **Make:** 15 minutes at least on the free plan, down to 1 on paid plans. [doc]
  help.make.com/schedule-a-scenario.
- **n8n, self-hosted:** a schedule down to seconds. [doc] docs.n8n.io, Schedule Trigger.
- **Any writer through the Sheets API:** 60 writes a minute per user, 300 per project. [doc]
  developers.google.com/workspace/sheets/api/limits.

The owner's belief that import formulas refresh about hourly is right for IMPORTFEED, IMPORTXML,
IMPORTHTML and IMPORTDATA, and the refresh is documented only while someone has the sheet open.
Whether NoaCG reading the CSV export counts as "open" is unknown [unverified]; phase 15 can test
it. So a sheet that pulls a feed or a web table by formula is right for slow lists (a schedule, a
standings table updated after each match) and wrong for anything live. Scripts and automation
tools add a minute or more and run on quotas. A score typed into a sheet is possible but slower
and less safe than NoaCG's own ± controls.

Limits: 10 million cells per spreadsheet [doc] support.google.com/drive/answer/37603; 50,000
characters per cell is widely reported [3rd]. Neither limits a ticker or a credits list.

### 2.3 Reading a Sheet

Measured from the owner's machine on 2026-10-16 (`sheet-data-flow`, "Measured"):
`docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<tab>` answers a browser on another
site with `Access-Control-Allow-Origin: *` and `no-store`, in about 1.2 s, for a sheet shared
"Anyone with the link can view". The gviz CSV endpoint is faster but blanks cells of a column's
minority type. The export address is the one behind the Download menu, not a documented API; the
documented Drive export exports the first tab only [doc]. "Publish to the web" updates "might
take a few minutes" [doc] support.google.com/docs/answer/183965. How soon an edit shows in the
export is not documented anywhere found and must be measured (sheet phase 1).

### 2.4 RSS and Atom: what a ticker needs

- **Formats.** RSS 2.0 items carry `title`, `description` (HTML, escaped or in CDATA), `link`,
  `pubDate` and an optional `guid` [doc] rssboard.org/rss-specification. Atom entries require
  `title`, `id` and `updated` [doc] RFC 4287. JSON Feed 1.1 items require `id` [doc]
  jsonfeed.org/version/1.1. A ticker needs the title only; source and time are optional extras.
- **Cleaning.** Titles and descriptions may carry markup and entities, sometimes encoded twice
  [3rd]; the reader turns them into plain text. Deduplicate on `guid` or `id`, then `link`, and
  sort by date rather than trusting document order (Atom gives order no meaning) [doc].
- **Polling.** Send `If-None-Match` and `If-Modified-Since` and accept 304 [doc] RFC 9110. RSS
  `ttl` says how many minutes a feed may be cached [doc]. Feed readers poll every 10 to 60 minutes
  by default, some adapting down to 5 [3rd]; one publisher blocks readers that poll more than
  hourly or without conditional requests [doc]. WebSub can push, but needs a public callback
  [doc] w3.org/TR/websub. A ticker is well served by a 5 minute read with conditional requests,
  slower when the feed asks.
- **Browsers cannot read most feeds.** A response without `Access-Control-Allow-Origin` is
  unreadable to a page on another site [doc] MDN. The most common blog platform sends none on its
  feeds, and its ticket to add it is open since 2020 [doc]. No measurement of all feeds was found
  [unverified], but a browser-only reader would fail on many. The server must fetch.
- **A server that fetches a pasted address** must allow only http and https, resolve the host and
  refuse private, loopback, link-local and cloud-metadata addresses (IPv6 forms too), check every
  redirect again, cap size and time, and return parsed data only [doc] OWASP SSRF prevention cheat
  sheet. One cached read per feed address serves every reader.
- **Rights matter more than rate limits.** One national broadcaster's terms allow headlines only,
  each linking to the article, and forbid paid or advertising use; one large news agency stopped
  its RSS in 2020; one news aggregator's feeds are for personal use [doc, 3rd]. NoaCG cannot judge
  this; the person pasting the feed can.

### 2.5 JSON addresses

Picking a value out of arbitrary JSON needs a selector: JSON Pointer (RFC 6901) for one value,
JSONPath (RFC 9535) for queries [doc]. Tools that accept JSON either take only an array of
objects as rows (vMix's JSON data source, which users report rejects a single top-level object
[doc] vmix.com help) or show a root selector plus a column list, which is a developer's screen.
Many public APIs need a key, which must stay on a server, and many do allow browsers [doc]. A
non-technical user can use JSON only when NoaCG reads its shape without asking: an object of names
to values or lists. Anything else is easier through the data API with a small connector, which is
what `scripts/weather-feed.mjs` already is.

### 2.6 Chat and audience tools

- **Twitch.** The documented way to read chat is EventSub `channel.chat.message` over a WebSocket
  with a user token (`user:read:chat`) [doc] dev.twitch.tv/docs/chat. NoaCG reads anonymously over
  the IRC WebSocket with a `justinfan` name, which works and is not documented [3rd]. Reading is
  free.
- **YouTube.** `liveChatMessages.list` costs 5 units a call against 10,000 a day per Google
  project; a 5 s poll uses the day in about 2.8 hours [doc, arithmetic]. `streamList` holds one
  connection for 5 units and is Google's recommendation [doc]. NoaCG uses the user's own key.
- **A long-lived chat listener does not fit a serverless function** (a function ends at its time
  limit) [doc] vercel.com docs. Server-side chat for a published production (audience A4) needs a
  worker that can stay connected, or the database's own scheduler.
- **Audience tools** join by a short code, link or QR with no account, and put questions in a
  moderation queue that someone approves before anything is shown [doc]. That is NoaCG's model.

## 3. The source kinds compared

| Kind | Shape | How fresh | Who reads | Local? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Typed | value, list, table | at once | nobody | yes | keep |
| Google Sheet | list, value, table | 5 s; formulas 1 h | browser, server | yes | lists first |
| RSS feed | list | 5 min | the server | via a route | build |
| Another system | value, list | as fast as the sender | the sender pushes | no | make visible |
| JSON address | value, list | the poll | the server | via a route | later, if asked |
| Audience | inbox candidates | seconds | backend, chat | Simulate | keep apart from values |

- **Typed** is for scores, names and fixes. It needs nothing and costs nothing.
- **A Google Sheet** is for long texts, lists, schedules, credits and data pulled in by formula.
  It needs link sharing. Published, it costs a server tick. Risk: the export address is not a
  documented API.
- **An RSS feed** is for news tickers. It needs a feed address and costs one server fetch per
  feed. Risks: feed rights, and browsers cannot read most feeds.
- **Another system** is for fast data such as scores, timing and results. It needs publishing,
  an account and the key, and spends the log's ingest budget. Risk: nobody can see it today.
- **A JSON address** is for systems that only publish JSON. It costs what a feed costs. Risk: it
  needs a selector unless its shape is simple.
- **The audience** is for messages and votes. Phones need publishing; the join page polls. Risk:
  airing a viewer's words without an operator.

## 4. User journeys, fewest steps

Each starts with "I have this data" and ends on air, for someone who has never opened the Data
tab. Proposed steps, then what it takes today.

**A Sheet list onto a ticker.** In Google Sheets: Share, Anyone with the link, Copy link. In
NoaCG: select the ticker's cue, press Connect on its "Ticker items" field, paste, check the lines
it shows, Take. A row edited in the sheet is on air within 10 s. *Today:* not possible without
code; the old block needs "Publish to the web" and pastes a script into the graphic.

**An RSS feed onto a ticker.** Copy the feed address from the site. In NoaCG: Connect on the
ticker's items field, paste, check the headlines it shows, Take. New headlines arrive within
5 minutes. *Today:* not possible; it needs a developer's connector and a published production.

**Long texts or names from a Sheet.** The same as the list, picking "names and values" when
connecting, or from the Data tab: Connect a Google Sheet, paste, and every field titled like a
name in column A connects itself. *Today:* not possible without code.

**Scores from another system.** Sign in and publish once. On the Data tab, "Another system": copy
the address and key, with an example that uses this production's own names. Paste them into the
other system or an automation tool's HTTP step, or hand them over. The first push shows "updated 2
s ago" and connects fields with matching titles, at once (DS17). Take. *Today:* steps one and two
exist behind "Data key"; then paths to bind, a second publish if bound after the first, no sign
that a push arrived, and a guide that leads with a different endpoint.

**Typed in NoaCG.** Select the cue and type in its field, or press ± on a connected score.
*Today:* the same; this is already the shortest path for a score or a name.

**A viewer's question onto a card.** Publish; in the Audience tab turn messages on and show the
link or QR. A viewer sends a question from a phone. In the inbox, edit if needed and put it in
the rundown (NoaCG offers a question card if the production has none, audience A2). Take. Chat
from Twitch or YouTube arrives in the same inbox once a channel is connected. *Today:* the same
steps, but "Send to rundown" can pick an unrelated graphic (#1313) and the tab has six buttons
per message.

**A JSON address**, if built later: paste it, see the values and lists NoaCG found, connect.

## 5. Is the audience just another data source?

Where a viewer sends a message: the production's join page (a link or QR, published only), or
the chat of a connected Twitch channel or YouTube stream. How it reaches a graphic: the inbox,
then an operator's approval and edit, then a cue on a graphic made for messages, then Take.

Three ways to answer it:

- **A. Keep apart.** Data and Audience stay separate systems; chat sources move onto the shared
  source core and nothing else changes (audience A4).
- **B. Merge into values.** A message or a tally becomes a production value, and fields connected
  to it show it.
- **C. One intake, two destinations.** Every source sits on one sources line with status and
  Pause. Data sources write values and lists; audience sources write only the inbox; an operator
  action turns a message into a cue.

| | A | B | C |
| --- | --- | --- | --- |
| Nothing airs without an operator | yes | no: an on-air field shows it | yes, by structure |
| One place to see what feeds the show | no: two tabs | yes | yes |
| Shared code | the reader core | everything | the core and the status line |
| What the operator learns | two systems | one, unsafe | one list, two kinds of result |
| Change from today | small | large | small to medium |

**Recommendation: C.** It answers the owner's question with "yes, a source, but of candidates":
the same connection, status and Pause as any source, and a different destination that keeps the
operator in the path. B is what streaming overlays do when they show chat automatically, and it
is exactly what NoaCG's rule forbids. One case to watch is votes: a running tally looks like a
value. It stays a staged cue with the existing "update the percentages on air while voting"
switch, which is an operator's choice made per production (`INTERACTIVE_PLAYOUT_PLAN.md` D5).

## 6. Recommended model and alternatives

**Recommended.** Values, lists and tables; each from one source; fields connect by name, by
themselves or from the field; the data API is the "Another system" source; feeds are read by the
server; audience sources share the line but write only the inbox. Spelled out in the spec, with
its twenty open decisions. A Sheet driving a ticker is also the first experiment
`CLOUD_PLAYOUT.md` §7 named in 2026-08, before scores took over the plan.

**Alternatives considered.**

- **Everything through a Sheet** (feeds by IMPORTFEED, APIs by Apps Script or automation tools).
  One source kind to build. Rejected: imports refresh hourly and maybe only while the sheet is
  open; scripts and tools add minutes and quotas; the owner asked for feeds without a sheet.
- **Push only** (the plan's 2026-08 rule: no in-app readers, every source an outside connector,
  `PRODUCTION_DATA_PLAN.md` §2.8). The simplest server. Rejected for Sheets already by sheet D1,
  and it leaves every source needing a developer.
- **Sources on the graphic** (the `liveData.ts` way). Rejected: invisible to the operator,
  outside the log, one copy per graphic; already frozen.
- **A full JSON mapping screen** (root, columns, JSONPath). Flexible, but a developer's tool; the
  data API with a small connector does the same job without a new screen.
- **Lists as tables** (a list Sheet becomes a production table, `sheet-data-flow` phase 5). Right
  for picking one row into a cue, wrong for a ticker or credits, which need every row in one
  field. The model keeps both.

## 7. What was not verified

- How soon a Sheet edit shows in the export, and how long Google lets one reader read every 5 s:
  data sources phase 15 (sheet phase 1) measures both.
- Whether reading the export makes import formulas refresh as if the sheet were open.
- How many real feeds send conditional-request headers, and how many allow browsers.
- Other tools' behaviour on a failed read (whether they keep the last good data), and a few of
  their features the survey could not confirm.
- The pages cited above, opened directly rather than through extracts.
