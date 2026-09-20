# Swamp Club as an automation layer behind the NoaCG CLI/MCP

Asked 2026-09-19: could Swamp sit behind the NoaCG CLI/MCP so that a coding agent asked to do
something routine stops re-reading the skill, re-inspecting the code and relearning the procedure
every time? Test case: take an existing NoaCG graphic, expose its useful data fields, bind them,
validate, and make it playable in a Production.

**Answer: no. Implement the pattern natively.** Not because Swamp is bad, it is a well-built tool,
but because the thing missing here is not orchestration. Four of the six steps in that test case
have no NoaCG verb at all, and a workflow engine cannot sequence verbs that do not exist. The work
that closes the gap is already written down in `docs/backlog/cli-roadmap.md` and it is CLI work.

---

## 1. What Swamp actually is

Swamp is an open-source CLI from Elder Swamp Club, Inc. (the company trades as systeminit). It
calls itself "deterministic automation for AI agents": a runtime that sits under a coding agent and
turns a successful one-off piece of agent work into a typed, versioned, repeatable system. Six
primitives, from the manual:

- **Models** are the unit of work. Each is a reusable TypeScript *type* declaring methods and input
  and output schemas, plus a YAML *definition* configuring that type for one purpose. "The type is
  code; the definitions are data." One `@tutorial/http-check` type spawns `check-swamp-club` and
  `check-example`.
- **Workflows** are YAML DAGs of jobs and steps that run model methods in dependency order, chain
  data between steps through CEL expressions, nest, call remote workers, and suspend for manual
  approval.
- **Vaults** hold secrets, referenced by name rather than by value and resolved at run time.
- **Extensions** package model types, vault providers, datastores and reports as versioned bundles
  published to a registry, with a narrow default trust boundary.
- **Skills** are markdown that teaches an agent to drive Swamp. One `swamp` skill routes into the
  rest.
- **The data layer** stores every method run as an immutable versioned artifact under `.swamp`,
  queryable with CEL, with lifecycle policies and garbage collection.

Written in TypeScript on Deno, installed with `curl -fsSL https://swamp-club.com/install.sh | sh`.
AGPL-3.0 plus a "Swamp Extension and Definition Exception". 623 stars, 1,968 commits on main, free
for solo use with team pricing promised. An independent write-up (Dieter Plaetinck, May 2026) built
three real workflows on it, called it "very solid", had no technical complaints, and flagged only
the branding, an undocumented leaderboard, and docs that are "quite dense".

So the model is sound and the execution looks honest. The question is fit.

## 2. Does the model fit this use case

Partly, and the part that fits is the part we get for free elsewhere.

Swamp's strengths are parallel jobs with dependency ordering, data chaining across steps, secret
handling, versioned artifacts across runs, remote execution, and suspend-for-approval. Score the
test case against those:

| Swamp strength | What the graphic-to-air chain needs |
|---|---|
| Parallel DAG, dependency order | Nothing. The chain is strictly linear: read, inspect, bind, validate, attach, play. |
| CEL data chaining between steps | Nothing. Each step's output is the next step's input, by position. |
| Vaults | Nothing beyond one scoped agent key, which `noacg login` already stores per machine. |
| Versioned immutable artifacts | Mild. The package is already a folder in git, and the library record already carries `updatedAt` and last-write-wins sync. |
| Remote workers, `swamp serve`, webhooks, scheduling | Nothing yet. |
| Suspend for manual approval | Genuinely useful, and we already have a better one. The staged-versus-take control model (`docs/CONTROL_LAYER.md`) is a human gate built into the surface the operator is already using, not a review step bolted onto a pipeline. |

One row out of six, and that row we win on. This chain is a pipeline, not a graph.

## 3. Could it sit behind the NoaCG MCP/CLI

Mechanically yes. A Swamp extension would declare model types like `@noacg/graphic` with methods
`inspect`, `fill` and `validate`, and the type's TypeScript would shell out to `noacg --json`. A
workflow YAML would chain them. The agent would then run one command instead of reading a skill.

Two problems with that, and the first is the serious one.

**It is a second implementation of the door.** `cli/src/index.ts` opens with the rule the CLI was
built around: one artifact, three entrances (terminal, `noacg mcp`, the plugin), and "there is no
second implementation anywhere". That is not stylistic. `cli/src/mcp.ts` goes to real trouble to
keep the MCP entrance from drifting from the terminal one: `READS` is a single table saying which
verb reads which argument, it writes the schema descriptions, and it refuses an argument the verb
does not read, precisely because "an argument that is silently dropped is the drift a per-tool
schema used to prevent by construction". A Swamp extension re-declares that grammar a fourth time,
in Deno TypeScript, under a different repository's trust model. Every new verb and every new
argument then lands twice, and the copy that drifts is the one nobody runs in CI.

**It puts the runtime in the wrong place.** The NoaCG CLI already drives the deployment's own code
through `/bridge`, so the type registry, `publishGate`, the runtime bench, `composeDocument` and the
exporters are the studio's, and an agent is validated by the very deployment it saves into. Swamp
would be a layer above that, sequencing calls. It adds no determinism the CLI does not already have.
The determinism in this system comes from the bridge, not from the caller.

## 4. What primitives are actually missing

This is the finding. Today's authoring verbs are `types`, `scaffold`, `validate`, `inspect`,
`screenshot`, `docs` and `save` (`MCP_COMMANDS` in `cli/src/mcp.ts`; the terminal adds `doctor`,
`pack`, `login`, `logout`, `whoami` and `caspar`). Walk the test case against them:

| Step | Verb today | State |
|---|---|---|
| Take an existing NoaCG graphic | none | **Missing.** `POST /api/me/graphics` is create-only by design: resolve principal, check `graphics:create`, rate limit, shape guard, insert, "never upsert". There is no read, list or update. An agent can put a graphic in the library and can never get one back out. |
| Identify its useful data fields | `inspect` | **Exists**, and is good. It prints the operator surface the deployment derives from the graphic's own contract. |
| Expose new fields | none | **Missing.** Turning static text into a field is an edit to the sources. The validator checks the result; nothing performs it. |
| Bind them correctly | none | **Missing.** Production bindings are `Show.bindings`, graphic name to field id to production-data path (`src/model/shows.ts`, `docs/PRODUCTION_DATA_PLAN.md` section 2.7). Reachable from the UI and from `/api/data/update` at run time, from no CLI verb ever. |
| Validate | `validate` | **Exists**, and is the strongest thing we have: gate plus live runtime bench plus stress frame. |
| Make it playable in a Production | none | **Missing, and deliberately so.** The skill states it plainly: "save never publishes, adds to a production or airs anything." The scoped key carries `graphics:create` and nothing else. Productions are `Show` records syncing as `kind = 'show'` documents (migration 0008), published through `publishControlShow` into `control_shows`, gated by `productionGateFailures` over `publishGate`. All of it client-side or server-side, none of it CLI-reachable. |

Three of six steps have a verb. Swamp would be orchestrating a two-step pipeline with four holes in
it.

The plan for those holes already exists. `docs/backlog/cli-roadmap.md`, written 2026-08-28 against
the HighField comparison, names them almost exactly:

1. `noacg find` for selection by need over the type registry and catalog metadata.
2. `noacg fill <dir|id> --data <json>`, binding a data row to an existing graphic and running the
   same runtime bench authoring runs, so a fill that would break on air is refused with a screenshot
   saying why. The roadmap calls this the leapfrog, and it is right: no selection pipeline over
   XPression or Viz can do it, because none of them can measure the rendered result.
3. `noacg assemble`, emitting the multi-graphic pack the Import door already reads.
4. `noacg save --production <slug>`, staged and never aired, listed as "an entitlements and
   scoped-key question more than a CLI one".

The future-directions list at the foot of the same file already names `noacg add --production`
(`productions:attach`) and "live playout as its own consented permission".

## 5. Does Swamp reduce repeated context loading

Less than it looks, and we can buy the same reduction cheaper.

Swamp saves context on the **run** side. Once a workflow exists, `swamp workflow run <name>` costs
one command instead of a procedure. That is real, and it is the legitimate core of the idea.

It costs context on the **authoring** side. The installed `swamp` skill is a 7.5 KB router into a
reference tree of 104 files and about 821 KB, of which the workflow reference alone is 37 KB,
data-chaining 20 KB and scenarios 22 KB. An agent writing its first NoaCG workflow reads a
substantial slice of that before it writes a line of YAML. Measure that against what the same agent
pays today: `SKILL.md` is 8.0 KB, `references/contract.md` 22.4 KB and `references/validator.md`
7.2 KB, roughly 9,400 tokens at four bytes to the token if it reads all three. Swamp does not
replace that reading, because the agent still has to know the contract to make the graphic. It adds
to it.

Then the always-on cost, which this project has measured rather than guessed. 2026-09-02: the plugin
went from seven MCP tools to one, from about 1,356 always-on tokens to about 151, and from one
resident process to zero, against the owner's ask that "installing NoaCG should not noticeably
consume or pollute a user's context window during normal Claude Code work. If it does, that will
eventually become a reason for people to uninstall it." Shipping Swamp behind the CLI reopens that
on both currencies: another skill in the system prompt of every session where it is enabled, and a
second runtime on the machine.

A composite verb gets the run-side saving with none of that. `noacg fill ./g --data row.json` is one
dispatch line in an enum. A new verb costs one enum entry, which is exactly what the one-tool MCP
shape was built to make cheap.

## 6. Where AI should stay, and where the path should be deterministic

Keep the model in the loop for the judgements that are about meaning and taste:

- Which graphic this job wants, until `find` exists and probably after.
- Which text in a design is genuinely content, and what to call it. "BEGINS IN" is a field because
  another broadcaster needs it in another language; a decorative numeral is not. That is semantics,
  and the skill's one content rule is the right place for it.
- Mapping an arbitrary data row onto fields when the labels do not match.
- Judging the frame. The stress screenshot exists so that a model or a person looks at it.
- Authoring the state machine when no type fits.

Make deterministic everything with a right answer:

- Reading a graphic out of the library and writing it back.
- Deriving the operator surface. Already deterministic, already `inspect`.
- Applying a binding once the mapping is decided.
- Validating, benching, gating. Already deterministic, and the platform owns SPX compatibility,
  never the AI.
- Attaching to a production, publishing, minting the output URL.
- Deciding pass or fail. A fill that overflows is refused by measurement, not by opinion.

The dividing line is the one the repo already states: the agent door is a bridge and a broadcast
interface, not a creative harness. AI decides what the user wants; the deployment decides whether it
is airworthy.

## 7. Reasons not to take the dependency

Beyond the fit argument, four practical ones.

**Licensing.** NoaCG-Studio is AGPL-3.0, so AGPL itself is no obstacle to the app. The CLI is not:
`cli/LICENSE` is Apache-2.0 and `@noacg/cli` ships to npm under Apache-2.0 on purpose, because it is
the piece strangers install. Putting an AGPL runtime behind it changes what a user takes on in order
to make a lower third. The trademark terms bite too: redistributing a Swamp-containing distribution
requires removing visible trademarks and renaming the customer-facing `swamp` command.

**Runtime and install.** The CLI today is Node 20 or newer off npm, `npx -y @noacg/cli` with nothing
installed, no resident process. Swamp is a Deno binary installed by piping a shell script from a
website. For a broadcast user that is a second supply chain to trust and a second thing to update.

**Account surface.** Swamp carries public profiles, a registry and a leaderboard. Harmless for a
hobby automation, odd for the tool behind a graphic going to air, and one more login between a user
and their lower third.

**Business risk.** Free for solo use, "when your team wants in, that's when pricing starts". The
layer we would be putting under the spearhead is the layer whose pricing is not yet written.

## 8. Recommendation

**Copy the idea. Do not take the tool.**

The idea worth keeping is one sentence: once we know how a task should work, it should become a
named, versioned, reviewable thing that runs the same way every time, not a paragraph in a skill
that a model re-reads and re-derives. Swamp is right about that. In NoaCG that thing is a CLI verb,
because we already have the one artifact with three entrances, the `--json` contract, the bridge
that makes every answer the deployment's own, and a measured context budget that a second runtime
would spend.

Concretely, in the roadmap's own order and names:

1. `noacg fill` first. It is provable on a graphic you already have, it needs no new ruling, and it
   is where the differentiated value is.
2. The library read side, so an existing graphic can be fetched and not only pushed. This is the
   hole that makes "take an existing graphic" impossible today.
3. `noacg find`, once `docs/backlog/graphic-use-case-metadata.md` lands.
4. `noacg add --production` behind `productions:attach` as its own consented scope at `noacg login`,
   staged only, never taking to air. That is the mechanism the ruling was waiting for: not a wider
   key, a second key the user grants separately, landing work where a human still has to take it.

Revisit Swamp only if two things become true: the verbs exist, and somebody wants to chain them with
other systems (a MAM, an NRCS, a scheduler) that Swamp already has models for. At that point Swamp
is a caller of our CLI, which is what the roadmap already says we want, and it needs no privileged
place behind our door to do it.

## 9. Proof of concept

One branch, one verb, the thinnest end-to-end slice of the test case that needs no new ruling.

**`noacg fill <dir|zip> --data <file.json> [--out <dir>] [--screenshots <dir>]`**

- Reads the graphic's declared fields through the same path `inspect` uses.
- Matches the data by field key, then by field *label*, which is the matching rule the product
  already uses twice: `DatasetColumn.label` ("a column named like a field's title loads into that
  field, visible, deterministic, no mapping UI") and `mapLabelsToFields` in `/api/data/update`.
- Composes the filled instance and runs the existing runtime bench on it rather than on the empty
  template: overflow, doubled-text stress, readability, field paint.
- Exits 1 with the findings and an `onair.png` when the fill would break on air, 0 when it would
  not.
- Writes the filled package to `--out`, which `noacg pack` already turns into the multi-graphic pack
  the studio's Import door reads.

Almost all of it exists. `screenshot --path --data k=v` already binds explicit values and composes,
`validate` already benches and gates, `shoot()` already renders. The new part is making a filled
instance a first-class output rather than a screenshot argument.

**What it proves.** An agent asked to put Anna Andersson on the lower third for tonight runs one
command, gets a yes or a no with a picture, and reads no skill to do it. That is the whole Swamp
proposition, delivered by one enum entry.

**How we would know it worked.** Time and context for the same job before and after, on the
agent-round bench (`scripts/agent-round-bench.mjs`), which has driven its cells through the terminal
path since 2026-08-27. The number to beat is the roughly 9,400 tokens of skill and contract a
session reads today to do by hand what one verb would do.

**What it does not reach.** The last hop. Playable in a Production still needs `productions:attach`,
and the honest sequence is `fill` first, then the library read side, then the scope.

---

Sources for the Swamp half: the project manual at swamp-club.com/manual, in particular "How Swamp
Works"; the repository at github.com/systeminit/swamp (AGPL-3.0 plus the Swamp Extension and
Definition Exception, Deno, file sizes measured 2026-09-19); `OSS-FAQ.md` in that repository for the
trademark terms; and Dieter Plaetinck's independent write-up of building three workflows on it.

## 10. The same question asked about the site, where no agent is present

Asked 2026-09-19, after the above: leave the CLI aside, and leave the SVG import alone because it
has to work on Friday. Is there anywhere on the noacg.studio site itself that a Swamp workflow
could do real work? The owner named quiz question import and the AI graphic creation tool as
guesses.

**No, and the reason is shape rather than quality.**

### The runtime does not meet

The site is a browser application plus Vercel serverless functions plus Supabase. The function
budget is twelve and has been hit once already, which silently stopped production deploying for
four days, so every new area costs a slot (`api/me/[...path].ts` explains why every area is a
catch-all). Swamp is a Deno binary that wants a long-lived host: `swamp serve` with webhook
endpoints, cron triggers and its own `.swamp` data directory. Anything Swamp did for the site would
be a new always-on machine, a new auth boundary, a second runtime to operate and patch, and, since
we would be running it as a service, the sharp end of AGPL section 13. None of the three candidates
below is worth that, and all three sit in a user request path where a hop to another host is a
latency cost with nothing bought.

### The three candidates, each checked

**Quiz question import.** This is a file parse in the browser. `src/model/csv.ts` is a real
RFC 4180 parser with separator detection, written precisely because a quiz bank whose questions
contain commas "imports as a table with the right number of rows and the wrong number of columns,
which reads as working until it is on air". `ProductionDataWorkspace.tsx` already calls
`parseTableFile` on a dropped file, and the resulting dataset rows already load into cues with Next
(`e2e/quiz-pilot.spec.ts` runs a question bank that way). One deterministic step, no secrets, no
fan-out, and it has to work offline. There is nothing here for a workflow engine to sequence, and
the owner's own ask filed the same day routes the remaining piece at the CLI rather than at a server
pipeline.

**The AI graphic creation tool.** This is the strongest candidate on paper and the clearest no in
practice, because the product already has this workflow engine and it is better than a YAML DAG
would be. The Pro harness (`src/ai/pro/harness/`) is a phased agent loop with budgets, per-phase
tools, findings, critique rounds, verdicts and patching, sitting on a typed task registry
(`api/_lib/aiTaskRegistry.ts`) that already carries schema refs and versions, allowed tiers, token
and image limits, timeouts, retries, a route policy with fallbacks and a cost ledger. That is
Swamp's model-and-workflow shape, already built, already domain-specific. Its steps are not shell
calls to external systems; they are judgements like "assemble at the catalog chassis's drawn zone"
and "bound polish to appended CSS and the root's inner HTML", governed by about thirty compiled
rules in `src/ai/AGENTS.md`. Re-expressing that as workflow YAML would trade type safety for
generality we have no use for.

**Render jobs.** Already a durable job ledger with states, deadlines and quota principals
(`api/_lib/jobStore.ts`), a worker, sandboxed execution, and a nightly cleanup cron in
`vercel.json`. Solved, in the place it belongs.

### What Swamp is actually shaped for, and where that shape does exist here

Swamp's own product page leads with incident response: an alert fires, several third-party systems
are queried, a dossier comes out, with secrets and audit history included. The site barely touches
third-party systems at run time. The one that matters, the AI gateway, already has a typed registry,
a route policy with fallbacks and a ledger.

The place that shape *does* exist is operations, and it is outside the product: `night-report.mjs`,
`alarm-issues.mjs`, `weekly-candidates.mjs`, `catalog-cost.mjs`, `check:freshness`, and the admin
overview's counts. Scheduled, multi-source, artifact-producing, credential-using. There is even a
named gap: `alarm-issues.mjs` records that five workflows file rolling issues when something landed
is red and "NOTHING EVER READ THEM BACK", and the fix was a paragraph printed where somebody is
already reading, which still requires opening a laptop session.

Even there the answer is no, for one reason: GitHub Actions already runs those workflows on cron
with secrets, and the scripts are already written and tested. Swamp would replace something that
works with something that needs a host.

### If we do want to try the technology

Try it where it was designed to be used, which is a repository with a coding agent in it, and
nowhere near Friday. The contained experiment is to take one existing multi-step chain in this repo
that an agent already re-derives each time, express it as a Swamp model plus workflow, and compare:
does it come out more reliable and more reviewable than the `.mjs` script and the skill paragraph it
replaces? That evaluates Swamp honestly, costs nothing user-facing, and touches no shipped surface.
If it wins there, the case for it anywhere else gets easier to make. If it does not, we have the
answer for the price of an afternoon.
