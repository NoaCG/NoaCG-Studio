# The owner acceptance pack

**Open `index.html` in a browser.** Everything else in this directory is a frame it shows.

Three separate handoffs are blocked on one person's eyes, and this repo's acceptance rule says
why nothing else will do: a phase is never "working" because the build is green, the tests pass
or internal state exists (`docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Verification contract"). Geometry
in a spec is not acceptance. So this is pictures of the real running app, in one place, each one
captioned with the exact question it is asking.

Built from `claude/e-owner-acceptance-pack`, rebuilt 2026-08-21 after `main` moved
`ProductionPage.tsx` and `productionControllerHtml.ts` under it. The checkout is OFFLINE (no
`.env`, no Supabase) — the door a self-hosted student build runs on, and the reason one frame in
the pack is an honest gap rather than an answer. See "What this pack cannot show" below.

## What it asks

| § | Subject | The question(s) | Recorded as owed in |
|---|---|---|---|
| 1 | `ig39` "Key Figures" | Does the catalog's first two-column stat list belong in the catalog as it stands? | `docs/CATALOG_VARIETY.md` §7 |
| 2 | The playout dashboard's scroll model | Are the capped monitors too small to judge a graphic by? Does the space beside PROGRAM read as SIZED or as UNFINISHED? | `docs/PLAYOUT_DASHBOARD.md` §2 |
| 3 | The interactive playout plane | One question per screen — contextual ⚡ controls, the Data workspace, vote-to-air, the presenter pointers, the audience join page | `docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Acceptance pass 2026-08-08"; `docs/GOALS.md` |

Section 2's two questions are quoted verbatim from the contract, not paraphrased, and are asked
over **all three surfaces** that render the dashboard — the in-app production page, the hosted
control page, and the exported controller. Nothing in the pack answers them; nothing in it hints
at an answer.

Two frames raise the same **observation, deliberately not judged**: with the cue being edited on
a layer that is not on air, the hosted page and the exported controller both offer the ⚡ graphic
actions, where the in-app page with nothing on air greys all five and says "not on air".
`docs/PLAYOUT_DASHBOARD.md` §7b and §7c are the two places that rule would live; nobody has
decided which frame the contract wants.

## The measurements under §2

Every dashboard frame carries the numbers read off the live document at capture time — the
monitor block's height and share of the window, the empty width to the right of the PROGRAM
frame, the editor's height and how much of it is hidden, how far the page scrolls, and which
panes have grown a scrollbar of their own. They are measured, never assumed, and they reproduce
the before/after table `docs/PLAYOUT_DASHBOARD.md` §2 records:

**Re-laid 2026-08-21 after the read.** §2 asks a NEW question now: whether the change the read
asked for lands. What it measures, before → after:

| | PREVIEW picture | sticky head | page scrolls |
|---|---|---|---|
| 1920×1080 | 281px → **368px** | 323px (30%) → **410px (38%)** | 0 → 0 |
| 1536×814 | 212px → **225px** | 254px (31%) → **267px (33%)** | 0 → 0 |
| 1536×560 | 188px → **170px** | 188px (34%) → **224px (40%)** | 165px → **148px** |

The **sticky head** is the number that matters now: it holds the verb bar as well as the
monitors, so it is what the surface permanently spends. The **picture** is what an operator
actually judges a graphic by, and it is a third bigger at 1080p — the size the owner rejected.
1536×814, the size that was accepted, moves 13px either way. 1536×560 is below the supported
minimum (1366×768) and takes a bigger share by design, because the bar is inside the head now.

No pane on any of the three surfaces has a scrollbar of its own. The page is the only scroller.

**The hosted page measures identically to the in-app one** — 225px / 267px / 33% at 1536×814,
170px / 224px / 40% at 1536×560. The contract says the three surfaces must not diverge; on the
scroll model that is measured rather than argued from shared CSS, and it stayed true across a
change that touched all three.

## How the hosted frames exist at all

The hosted control page was retired in 2026-11 (docs/work-specs/retire-hosted-control/spec.md),
and the pack's `hosted` section went with it; its two frames stay as the record of that read.
This is how they were made:

The hosted control page needs Supabase env plus a published production, and this checkout has
neither. So the pack's `hosted` section builds the **ordinary production bundle** with
`VITE_SUPABASE_URL` pointed at a stub origin, serves it to the browser out of memory, and answers
migration 0008's RPCs from memory — with the production's own `buildPanelSpec` and
`buildOutputPayload`, computed by the app itself on the dev server. Nothing about the page is a
mockup; what is fake is the transport.

It is captured **opening onto a production already on air**, which is the hosted page's own real
case: an operator joining from a phone mid-show. The resolve reports which layer is up and what it
last applied, and the page's boot recovery plays that onto PROGRAM from those two fields alone.
Nothing AFTER the open moves in this rig — the log follower tail-fills only when Supabase Realtime
reports `SUBSCRIBED`, and there is no socket here. The frame says that rather than implying
otherwise. What it proves is the LAYOUT; the server side (RLS, the slug capability, the log's
ordering) stays the live checklist's job.

## What this pack still cannot show

One frame is labelled as answering nothing, and it is in the pack so the gap stays visible rather
than remembered: **the public `/join` page, the presenter's own tablet page, and the Links panel's
four capability URLs.** All three need a real publish against a real backend. Offline `/join` says
so in words; the presenter view is server work (`presenterBySlug`) an offline build never reaches;
and the production header carries "▶ Start production" where the Links button lives, because each
URL appears only once a publish has minted its slug — so there is no panel to photograph.

What the pack DOES show of the audience plane is the real thing, not a drawing of it:
`src/audience/joinSurface.ts` is the ONE renderer that both the public page and the operator's
own preview mount, and the join frames here are that renderer.

The hosted walk — a real publish, a real phone in the room, the presenter's tablet — is a
separate owed item and needs `.env` plus a signed-in account.

## Rebuilding it

One browser job per machine: use the queued form, as with any sweep.

```bash
node scripts/e2e-runs.mjs --wait && node scripts/acceptance-pack.mjs
```

The dev server must be up on this checkout's port (`node scripts/dev-port.mjs`), and section 1's
full-frame pictures come from the catalog's own instrument, which has to have run first:

```bash
node scripts/l3-sweep.mjs ./l3-shots/infographic infographic
```

`node scripts/acceptance-pack.mjs docs/acceptance/owner-pack <section>` re-runs one section
(`catalog`, `scroll`, `controller`, `interactive`) and re-renders the page around every
frame the manifest already holds; `index` alone re-renders the page and opens no production at
all. Deleting `manifest.json` first forces a full rebuild in page order.

## Keeping it true

Every frame pictures the tree it was built from. A branch that changes one of these surfaces makes
the affected section stale — re-run that section rather than reading a picture of a tree that no
longer exists. This is not hypothetical: `claude/b-clock-export-recovery` landed on 2026-08-21
carrying 95 lines of `ProductionPage.tsx` and 58 of `productionControllerHtml.ts`, and the whole
pack was rebuilt on the merged tree before anyone read it. Which files map to which section:

| Section | Goes stale when these move |
|---|---|
| `scroll` | `src/components/home/ProductionPage.tsx`, `src/styles/playout-dashboard.css` |
| `controller` | `src/control/productionControllerHtml.ts` |
| `interactive` | `ProductionPage.tsx`, `ProductionDataWorkspace.tsx`, `ProductionAudienceWorkspace.tsx`, `src/audience/joinSurface.ts` |
| `catalog` | `src/templates/infographics/`, and re-run the l3 sweep first |

## It has been read — 2026-08-21

All three reads are answered. The verdicts live where each read was recorded as owed, not here;
this is only the map to them.

| § | Verdict | Written down in |
|---|---|---|
| 1 | **Accepted.** ig39 ships; ig37, ig36, ig38 good; ig01 usable but not a substitute for ig39. | `docs/CATALOG_VARIETY.md` §7 |
| 2 | **Split, and ACTED ON the same day.** 1536×814 accepted. 1920×1080 rejected: too much empty at the bottom, monitors unnecessarily small. 1536×560: the verb bar scrolling under the sticky monitors is a hazard. All three answered by the re-lay below; §2's frames now ask whether it landed. | `docs/PLAYOUT_DASHBOARD.md` §2 |
| 3 | **Accepted.** *"I think these screens look good."* | `docs/INTERACTIVE_PLAYOUT_PLAN.md`, acceptance pass |

**What the read produced that the frames did not ask for** — the part worth the sitting:

- The stats shelf reads as a real catalog and the LOWER-THIRDS shelf does not; what a category
  shows FIRST is now its own release item (`docs/GOALS_ARCHIVE.md` "Student release" step 11).
- ig01 "Big Stat" is filed as a `stat-panel` and is a `kpi`.
- **Teams** — several students holding one production — is a class requirement, not a nicety
  (`docs/GOALS.md`, THEN §0).
- Playout / Data / Audience should open in their own tabs rather than swap.
- The monitor cap depends on the PREVIEWED cue's aspect ratio, so the monitors already twitch —
  found by reading the CSS behind a question the owner asked, not by looking at a frame.

**Two decisions taken the same day, so nobody re-litigates them:** the minimum supported window is
**1366×768** (`docs/GOALS.md`, `docs/PLAYOUT_DASHBOARD.md` §2), and the ⚡ off-air divergence
between the three surfaces is **deliberately left open** — an accepted difference, not a defect to
quietly harmonise (`docs/INTERACTIVE_PLAYOUT_PLAN.md`).

**When a later read happens, do the same:** record what was decided, not that a pack was looked
at. A pack that has been read and leaves no verdict behind costs the next session the same sitting
all over again.
