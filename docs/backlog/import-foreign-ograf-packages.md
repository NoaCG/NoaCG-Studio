---
v: 2
source: owner
kind: ask
raised: 2026-09-24
state: unstarted
asked: "Create the backlog item for the possibility to import foreign packages; start building after tomorrow's lecture (paraphrase, 2026-09-24)"
serves: P6
size: large
touches: src/bridge/ografHost.ts, src/output/stage.ts, src/model/, src/components/home/
needs-owner: none
---

# Import someone else's OGraf package and play it in a production

**Filed:** 2026-09-24. **Source:** owner, in a session about NoaCG as an OGraf client. Start after
the 2026-09-25 lecture.

## Why

An OGraf client that can only play its own graphics is half a client. SPX 1.4, ograf-server,
LiveOS, Erizos and BBright all put a stranger's package in their rundown; NoaCG does that only from
the command line (`noacg inspect`, `noacg validate`, `src/bridge/ografHost.ts`). Graphics made in
Loopic, DJ HTML Creator, everviz or by hand are arriving as OGraf packages. Playing them in the
same rundown as NoaCG's own graphics is what an operator expects of an OGraf client, and it is the
`OGraf import v1` rung on the `docs/GOALS.md` OGraf ladder.

## What it would take

The boundary is already written in `docs/OGRAF_ECOSYSTEM.md` §2 and §3. In short:

1. **Isolation first.** A foreign package is executable JavaScript from a stranger. It runs in the
   sandboxed-frame pattern `/output` already uses for its own graphics (`src/output/stage.ts`, no
   `allow-same-origin`), with no controller credentials, a bounded message bridge, asset paths
   kept inside the package and an explicit network policy. Shadow DOM is styling, not a sandbox.
   This is a prerequisite, not a feature (`docs/OGRAF_FULL_STACK_PLAN.md` §5, "Security and
   deployment").
2. **A library item of kind "OGraf package".** Drop a zip or folder. The manifest is validated
   on read, and the fields, steps and custom actions come from the manifest alone through
   `ografContract.ts`. It is playable and its data is editable. It is never structurally editable
   and never enters the editor, the wizard, the AI harness or the single-file exports.
3. **In the rundown.** A foreign package is added to a production and cued like a pool graphic,
   with the same cue editor fields and verbs, on a layer of the output page.
4. **Recovery.** Replay through the standard's own calls (`load`, `updateAction`,
   `playAction({ goto, skipAnimation })`), wired into the per-graphic baseline the command log
   already keeps.
5. **Versioning.** The package is stored with a content hash, and the library entry's persisted
   shape is versioned as the root contract requires.

**How it meets the Bridge OGraf adapter** (`bridge-ograf-adapter.md`): an imported package plays
on NoaCG's own output page. A package that already sits on a foreign OGraf server plays there
through the adapter. The two routes share the manifest-derived cue editor.

## Acceptance

- A foreign fixture corpus (a SuperFly.tv example, a Loopic export, a hand-written package with
  custom actions and a multi-step `stepCount`) imports, plays, updates, steps and stops in a
  production.
- A hostile fixture (it reads `parent`, fetches the internet, walks out of its asset folder) is
  contained, and the spec asserts each refusal.
- Output reload mid-show recovers the imported graphic to its step and data.
- A Playwright spec and an owner-queue file with the route.

## Evidence

- What exists and what is missing, operation by operation: `docs/OGRAF_ECOSYSTEM.md` §2.
- The isolation model: `docs/OGRAF_ECOSYSTEM.md` §3.
- Package F in `docs/OGRAF_FULL_STACK_PLAN.md` §8.
- Competitor row "Run a stranger's OGraf package in the app": `docs/LANDSCAPE.md`.
