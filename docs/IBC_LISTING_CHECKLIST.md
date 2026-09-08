# Getting NoaCG listed in the OGraf ecosystem

Written 2026-08-29, for one sitting. Everything a machine could check has been checked; what is
left is the part only you can do. Read this top to bottom, then work the last section.

**Time to complete: about 45 minutes, and one of the four steps is time-critical** - the EBU's
open-source meetup at IBC is on 12 September and the sign-up form has no published deadline, so
it closes when it closes.

---

## 1. Where the list actually is

There is **no official EBU vendor list**. This is the first thing to know, because it is not what
you would expect.

`ograf.ebu.io` is GitHub Pages served straight from the README of
[github.com/ebu/ograf](https://github.com/ebu/ograf). Its whole navigation is: Project status,
Version History, Introduction, Getting Started, Tools. There is no vendors page, no ecosystem
page, no adopters page. The repository has no CONTRIBUTING file, no issue template and no pull
request template - so there is no documented way to ask to be added to anything.

The list that broadcasters actually browse is **[ograf.dev](https://ograf.dev/ecosystem)**, an
independent community hub run by a participant in the spec work (he has two open specification
pull requests in the EBU repository, so this is a real participant, not a squatter). It carries a
categorised ecosystem directory of 30 products across 10 categories, and unlike the EBU repository
it has **a written submission process**.

**NoaCG is not on it.** Checked directly against the live data file on 2026-08-29: the string
"noacg" does not appear. Meanwhile the Editors category already lists Loopic, DJ HTML Creator,
Eyevinn's ograf-editor, Ferryman, everviz, StreamShapers and After Effects - and the Renderers
category lists CasparCG, BBright, Pixotope and Grass Valley AMPP. That is the room we are not in.

There are three further surfaces, all covered in section 4:

| Surface | Process | Our read |
|---|---|---|
| [ograf.dev ecosystem](https://ograf.dev/ecosystem) | documented pull request | **the main route** |
| [ebu/ograf](https://github.com/ebu/ograf) README "Tools" | none - no precedent | worth trying, low cost |
| [EBU HTML Graphics Working Group](https://tech.ebu.ch/groups/html-graphics) | email the contact | worth doing, no membership needed |
| [EBU Open Source Meetup at IBC](https://tech.ebu.ch/events/2026/open-source-meetup-ebu-ibc-2026) | form | time-critical |

---

## 2. What we submit

The ograf.dev entry is one object added to a JSON file. Their CONTRIBUTING file asks for `name`,
`desc` ("one or two sentences, no hype"), `url`, `type` (`oss`, `commercial` or `official`) and an
optional `stars`. Two further fields are undocumented but used by live entries: `logo` and
`status`.

**Paste this, exactly, into the `editors` category's `items` array:**

```json
{
  "name": "NoaCG Studio",
  "desc": "Browser-based builder for HTML broadcast graphics, free and with no account needed. Every graphic exports as an OGraf v1 package - and as SPX, CasparCG or an OBS/vMix overlay - with the generated HTML, CSS and JavaScript left readable and editable.",
  "url": "https://noacg.studio",
  "type": "oss"
}
```

Notes on each field, so you can defend them if asked:

- **`editors`, not `devtools`.** Their CONTRIBUTING says one category. Editors is described as
  "Build graphics - no-code authoring tools or developer-facing editors", which is what NoaCG is.
  The `noacg` CLI would also fit Developer Tools, but splitting into two entries is not what they
  ask for.
- **`type: "oss"`.** The repository is public and AGPL-3.0-only; the CLI is published to npm as
  `@noacg/cli` under Apache-2.0. The core is free forever. This is accurate.
- **`stars` omitted.** It is optional, and 4 is not a number worth leading with. Nothing is
  concealed by leaving out an optional field.
- **`logo` omitted.** Their logo files are SVG and we do not ship an SVG mark (only PNG, in
  `NoaCG-Brand-Kit/assets/icons`). DJ HTML Creator has no logo either, so an entry without one is
  normal. If you want one later it is a second, trivial pull request.

**The one-line version**, for the EBU repository's Tools section and for any email:

> **[NoaCG Studio](https://noacg.studio)** is a free browser tool for building HTML broadcast
> graphics and exporting them as OGraf v1 packages, with six ready-made starter graphics at
> <https://noacg.studio/ograf>.

**The links, in the order they are worth giving:**

| Link | What it shows |
|---|---|
| <https://noacg.studio/ograf> | six free OGraf starter packages, built by the real exporter on click |
| <https://noacg.studio> | the product |
| <https://noacg.studio/docs> | the public guides, including OGraf, OBS/vMix and CasparCG |
| <https://www.npmjs.com/package/@noacg/cli> | the CLI and MCP server, for agents and scripting |

---

## 3. What is verified true today

Every claim in section 2 has something behind it. This is the column to read if someone pushes
back.

| Claim | The proof | Checked |
|---|---|---|
| Our packages satisfy the published EBU manifest schema | `npm run check:ograf-schema` fetches all seven schema files from ograf.ebu.io and validates with a real JSON-Schema engine (ajv, draft 2020-12) | 2026-08-29, clean |
| Our own validator matches the published schema and is not just rubber-stamping | the same command runs an eight-mutation battery through both validators and reports any disagreement | 2026-08-29, no disagreements |
| Every graphic in the catalog exports a conformant manifest, in all three export intents | `e2e/ograf-conformance.spec.ts`, on every CI run | 2026-08-29, 8 tests pass |
| The `/ograf` starters still build and validate | `e2e/ograf-starters.spec.ts` downloads a real starter and reads its manifest | 2026-08-29, 3 tests pass |
| A stranger's OGraf package loads and runs in our host, and ours in theirs | `e2e/ograf-contract.spec.ts` | 2026-08-29, 4 tests pass |
| Our packages run in a renderer nobody here wrote | SuperFly.tv's OGraf Simple Rendering System, driven through its HTTP control API | 2026-08-18 and 2026-08-22, by hand (`docs/OGRAF.md`) |

**One thing worth saying out loud, because it reads as a strength.** The published EBU schema
cannot catch two custom actions sharing an id - JSON Schema has no way to express uniqueness
across a keyed array. Our validator catches it anyway, because a renderer that registers actions
by id would silently lose one. The weekly report asserts that we keep catching it. If the
conversation ever turns to how seriously we take conformance, that is the example: we are stricter
than the standard's own files where being lax would break somebody's on-air graphic.

**And one thing to be honest about.** Everything above is our packages proving themselves against
the specification and against two hosts. No third party has yet reported running a NoaCG package
in production. Do not imply otherwise.

### What was built this session

`scripts/check-ograf-schema.mjs`, wired into `npm run check:freshness` and the weekly audit
workflow. It was a hand-run harness that got thrown away twice; now it runs every Monday and turns
the weekly audit red if the EBU republishes a schema or our transcription drifts from it. It
never runs in the build gate, because it fetches the network and a build must not depend on
somebody else's web server being up.

---

## 4. Your steps, in order

### Step 1 - the ecosystem listing (15 minutes)

This is the one that matters. It is a pull request against
[github.com/ficosta/ograf](https://github.com/ficosta/ograf), editing one file.

1. Open <https://github.com/ficosta/ograf/blob/main/apps/dev/src/content/ecosystem.json> and press
   the pencil icon. GitHub will fork the repository for you.
2. Find the block that starts `"id": "editors"`. Inside its `"items": [` array, paste the JSON
   from section 2 above, adding a comma after the entry before it.
3. Commit to a new branch and open the pull request. Their CONTRIBUTING asks for "a short
   justification" - paste this:

   > NoaCG Studio is a free, open-source browser tool for building HTML broadcast graphics. Every
   > graphic exports as an OGraf v1 package validated against the published EBU schemas, and six
   > free starter packages are available at https://noacg.studio/ograf. Adding it to Editors.

**One trap.** The "Missing from the list?" button on the ograf.dev ecosystem page is mis-linked -
it points at the EBU specification repository's issue tracker instead of their own. Do not use it;
your submission would land in the wrong place. Follow the steps above.

### Step 2 - the IBC open-source meetup (10 minutes, time-critical)

The EBU runs a series of five-minute open-source pitches on its IBC stand.

- **When:** 12 September 2026, EBU stand 10.D21, RAI Amsterdam.
- **Sign-up form:** <https://forms.office.com/e/ZRGvwnpgG5>
- **After submitting**, email **poor@ebu.ch** and **dejong@ebu.ch** to confirm it is not too late.
  No deadline is published on either the 2026 or the 2025 page, so asking is the only way to know.

Pitch the free, open-source core - it is an open-source meetup, and that is genuinely what NoaCG's
core is.

### Step 3 - the working group (10 minutes)

EBU membership is **not** required. The OGraf README says so directly: "EBU members as well as the
general industry is invited to join the HTML Graphics Working Group."

Email **sunna@ebu.ch** (Paola Sunna, the group's published contact). Say that NoaCG Studio exports
conformant OGraf v1 packages, give the `/ograf` link, and ask about joining the group. Mention that
you will be reachable around IBC if that is useful.

Worth knowing: the group's chair is Niels Borg of TV 2 Denmark, who ran a national election on
OGraf in March and is speaking about OGraf at IBC on 12 September, 16:10-16:50 in room E102, with
Paola Sunna. Both of the people who decide what OGraf visibility looks like are in one room at a
known time.

### Step 4 - the EBU repository's Tools list (10 minutes, optional)

The EBU README has a "Tools" section with exactly two entries, both from SuperFly.tv. A pull
request adding NoaCG would be the first of its kind - there is no documented process and no
precedent, and a maintainer could reasonably say the section means specification tooling rather
than products.

It costs ten minutes to try. Edit
[README.md](https://github.com/ebu/ograf/edit/main/README.md), add one bullet in the same shape as
the two that are there, using the one-line version from section 2. Treat a refusal as information,
not as a setback - step 1 is the route that has a process.

### Optional - an independent check on our own claim (10 minutes)

ograf.dev runs an in-browser package checker with 82 rules and a runtime sandbox, at
<https://ograf.dev/tools>. Download any starter from <https://noacg.studio/ograf> and drop the zip
into it. Nothing here has been through that checker. If it passes, it is a third party's verdict
on our conformance rather than our own, which is worth having before anyone at IBC asks. If it
finds something, that is worth more.

---

## 5. If someone asks a harder question

- **"Are you an OGraf-native engine?"** No, and say so. NoaCG's source of truth is plain
  HTML/CSS/JS; OGraf is one of six export targets. What we guarantee is that the package we emit
  is a conformant OGraf v1 Graphic, checked weekly against the published schemas.
- **"Who is using it?"** Nobody has reported a NoaCG package in production. It is used in teaching,
  and Yle asked for editable OGraf base packages, which is why `/ograf` exists.
- **"Is it really free?"** Yes, and there is no paid surface at all (owner ruling, 2026-09-07).
  Creating, previewing and exporting need no account. Hosted AI for people who will not bring
  their own key is subsidised by the project rather than sold, and bring-your-own-key is free as
  it always was. The narrow, honest boundary if pressed: publishing a hosted show, cloud sync and
  the audience plane need a free signup, nothing more.
- **"What is the licence?"** The application is AGPL-3.0-only; the CLI is Apache-2.0. Both public.

## Related

`docs/OGRAF.md` (what we emit and where the limits are), `docs/backlog/ograf-ecosystem-watch.md`
(the standing ledger of who else is adopting OGraf), `docs/AGENT_CLI.md` (the CLI and MCP server).
