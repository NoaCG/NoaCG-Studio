# Phase 2: independent corpus and labels

Run `plan-jev-svg-import-2026-10-31` (issue #1850), PR #1853. Acceptance subset: AC-2. Builder: Claude Code
cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`, environment
`env_017nuiDZBW9smUNLdWVQK8cf`. Recorded 2026-10-31 UTC. No product source changed, no model
call was made and no spend occurred.

## Pinned main

Previous verified main: `0b4e403da1f4762dee874e3fed18c29eb0497116` (PR #1851). On that SHA, push
CI, configured-suite, Post-landing and Quarantine succeeded. The worktree was created from it
after a fresh fetch.

## What was checked

An independent script (not committed; the phase allows no script file) parsed every file in
`e2e/fixtures/jev-svg` and `e2e/fixtures/svg-corpus` and compared it with
`preparation/corpus-receipt.json`. Every check below passed. Three of the receipt's digests cannot
be checked from this worker and are listed under "Not reproducible from git".

| Check | Result |
|---|---|
| `manifest.json` SHA-256 equals receipt `manifest_sha256` (`15bc1509…db0ab`) | pass |
| `dev.expect.json` SHA-256 equals receipt and manifest `development_labels_sha256` (`49813b69…7b815f`) | pass |
| 18 development SVGs: each file hash equals its manifest entry and its label's `svg_sha256` | pass |
| Six strata, three designs each, in both partitions; ids `<stratum>-1..3` | pass |
| Holdout commitment in the manifest: 18 files, labels hash and tree hash equal the receipt | pass |
| No holdout SVG hash and no holdout label hash matches any `.svg` or `.json` tracked in git; no `holdout.expect` file is tracked | pass |
| Holdout and development file hashes are disjoint | pass |
| Provenance on every design: `synthetic-original`, named author, no exporter claim, no third-party artwork | pass |
| 99 label anchors (fields, credits sub-anchors, non-editable decoys, qualification anchors) resolve by `element_path` to an element of the stated tag; every `source_id` equals that element's `id`; every text default equals the element's text after trimming each line's indentation (needed only for the multiline `body`, whose `tspan` lines are indented) | pass |
| Regression slice: 51 entries, one per SVG in `svg-corpus`, each SVG and sidecar hash matches, all `recognition_score_eligible: false` | pass |
| Regression pin `b3708b65` is an ancestor of the pinned main `0b4e403d`; the 51 SVGs and sidecars are unchanged since it | pass |
| Inherited sidecars, structural check: each `name` equals its file slug, each has a non-empty `story` and `whyThisMatters`, and each `expect.accepted` is a boolean (50 accepted, 1 refusal: `geometry-unescaped-ampersand`). Families: Illustrator 16, Figma 8, Inkscape 7, geometry 7, effects 6, logo 6, Affinity 1 | pass |
| Qualification fixtures: three, hashes match, `excluded_from_recognition_count: true` | pass |

Coverage across the development set: unnamed and generic ids, misleading ids, decorative numbers,
hidden states, nested transforms, Ukrainian, French and Polish labels, an outline-only negative,
a four-target scoreboard, two-answer and deceptive-id quizzes, an irregular credits layout and an
ambiguous score-clock link. The holdout's composition is not visible to this worker by design.

### Not reproducible from git

- `development_tree_sha256` and `development_archive_sha256` commit the preparation packet's
  layout, which held local copies of the 51 legacy files (receipt `legacy_copy_policy`). Git holds
  only the manifest references, so neither digest can be recomputed here; the plausible layouts of
  the committed files were tried and none matched. The 18 development SVGs are still bound to the
  receipt through `manifest_sha256`, whose per-file hashes all match.
- The holdout archive and labels are not readable by this worker, by protocol. Their binding is the
  sealed ZIP digest below. The receipt's `holdout_archive_sha256` (`76b50fa4…`) is the tar.gz
  copy of the same packet, which is not the runtime artifact and is not reachable here; it stays
  unverified in this phase. Row 34 checks the ZIP and its 18 members.

## Holdout storage

- Runtime secret: `jev-svg-qualification.yml` run
  [41196682798](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41196682798) on main
  `0b4e403d` in environment `jev-svg-evaluation`, dispatched by this worker: the decoded
  `JEV_SVG_HOLDOUT_ZIP_BASE64` hashes to receipt `holdout_zip_sha256` (`93d8531d…53eaf3`) without
  being opened, and the log shows only the two PASS lines with both secrets masked. The job runs
  only on `refs/heads/main`; the environment's main-only branch rule rests on the owner's report
  (readiness), since the settings API is refused to this integration.
- Private owner backup: not re-verified in this phase. This is a departure from the wording
  "verify backup availability": the same acceptance says tuning workers receive neither the secret
  nor the backup, so a builder that opened the owner-only backup would break the separation it is
  meant to prove. The receipt records the backup uploaded with owner-only permissions and a fresh
  download hash-verified by the coordinator during preparation. A fresh check belongs to the
  owner/custodian or the coordinator, recorded without content; until then this half rests on the
  preparation record. **Owner of the fresh check: the coordinator**, which verified the backup in
  preparation. It records the download's SHA-256 (must equal `93d8531d…53eaf3`), owner-only
  permissions and the date in the run ledger before it accepts this row. Until that entry exists,
  this half of the row's verification is open, and no tuning row (31 onward) may start.
- Retention: 90 days after run completion (receipt `planned_storage.retention`); readers are the
  owner/custodian, the main-only holdout job and the independent checker after configuration
  freeze. Tuning workers, including this one, received neither the secret nor the backup.

## Frozen before tuning

The only change in this phase adds a `tier` to each qualification fixture and defines the tiers:
`ticker` and `multiline` are **supported** binding qualifications (AC-14, AC-24; moving-SVG motion
stays unsupported), and `notice-zones` is an **optional diagnostic** (AC-26) whose shortfall is
reported, never counted as support. The 18 development labels already carry their per-design
`unsupported` and `unresolved_intent` lists and are frozen by `development_labels_sha256`, so they
are left byte-identical. The 18 holdout labels are not visible here and are frozen by
`holdout_labels_sha256`.

Frozen hashes at this landing, for files the receipt does not cover:

| File | SHA-256 |
|---|---|
| `e2e/fixtures/jev-svg/qualification/expect.json` | `15a85fca625858274c7fb7e00441595c3747baae75aa99199839936f5786f52b` |
| `e2e/fixtures/jev-svg/regression.manifest.json` | `a1271ce68e395094c6cfad36a8ad4a09e6d04ba3e3a9518bc57c186e947bc610` |

## Decisions and traps

- The packet was already committed during preparation (`b739b730`), so this row admits it rather
  than authoring it. `manifest.json` and `dev.expect.json` stay untouched because their hashes are
  the receipt's commitment; the receipt's own status line ("independent admission pending") is
  outside this row's files, so this record is the admission.
- `tier` sits beside `stratum` rather than in a new file, so later rows read one expectation
  source. No consumer reads these fixtures yet, so the field breaks nothing.
- The regression slice keeps its pin and bytes; it already lists every corpus SVG with label hashes
  and is excluded from the recognition score. `e2e/import-svg-corpus.spec.ts` is in quarantine
  review (#1834); that affects the spec, not these fixture bytes.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='Merge pull request #1853 ')"

It removes this file and the three `tier` fields with their definitions.
