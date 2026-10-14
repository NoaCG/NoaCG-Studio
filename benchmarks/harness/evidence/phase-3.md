# H3 evidence: feasibility in the container

Phase 4 of `docs/work-specs/noacg-harness/spec.md` (AC-4, section 6), built 2026-10-14 on
`origin/main` `f430c0b97`, on the bench workspace's key (`scripts/bench-env.mjs
--profile=harness` refused nothing: the bench key is not the production key).

## Before the first session

Written and committed before any session was created (5.1, 5.5), in `93531e92d`.

- **Hypothesis.** A Claude Managed Agents cloud container installs the `noacg` CLI from the
  mounted tarball, finds or installs a Chromium, reaches `https://noacg.studio/bridge`, renders,
  and writes its record and frames to `/mnt/session/outputs/`; an Opus 5.5 agent reads a rendered
  frame as an image, names a planted defect from it, fixes it, re-inspects, and hands in a record
  whose digest equals the last `validate` or `coverage` digest in its trace; one real graphic on a
  v1 brief has a measurable cost, wall time, turn count, image count and largest single request.
- **Ceiling.** $10 of credit for the whole phase, by the ledger's `usage.list_cost` sum. The
  runner refuses a session whose budget plus the overshoot margin would take the phase past it.
  Planned: plumbing on Haiku 5.5 about $1 (both install paths), the defect repair on Opus 5.5 at a
  $3 session budget, the real graphic on Opus 5.5 at a $3 to $4 session budget.
- **Signal.** All four proofs of section 6 hold: (1) the CLI and a Chromium work in the container,
  doctor passes against the production bridge, the scaffold validates with screenshots, coverage
  and record land in the outputs, and the bench lists and downloads them; (2) the trace shows an
  image read, the defect named from it, a change, a new render looked at, and the delivered
  digest equal to the last reviewed one; (3) the cost, wall time, turns, image count and largest
  request of one real graphic are measured; (4) after the bench deletes the outputs and the
  session, the file list by that session id and the session fetch answer not found. If the signal
  is missing at the ceiling, the phase stops and reports; it never tops up. If a proof cannot
  work, the phase says so and recommends the fallback plan (section 9).

## Outcome

**The signal is there: all four proofs hold, for $2.66 of the $10 ceiling, in six sessions.** No
fallback recommendation: Managed Agents runs the recipe. The numbers H4 needs:

| | measured |
|---|---|
| one real graphic on Opus 5.5 (`m`, one sample) | **$1.49**, 471 s of session wall time (7.9 min), 36 model requests, 40 tool calls, 11 images read |
| the defect repair on Opus 5.5 | $1.09, 189 s, 16 model requests, 46 tool calls, 34 images read |
| the largest single request (the overshoot `o`) | **$0.22** (the defect session: about 40k tokens of new frames written to the cache in one request); $0.14 in the real graphic |
| a full cache miss at the largest context seen | $0.76 (149k tokens at the $5 cache-write rate plus the largest output), the bound if a 5-minute cache lapsed mid-session |
| cold start, tarball install (H1's path) | bridge reachable 27 to 32 s after the create call: first model request 1 s, first tool call 2.5 to 3.5 s, then one tool call installs the CLI, sets up the browser's trust store and passes `noacg doctor` |
| cold start, CLI from `packages` | 26.8 s on the environment's first session, 18.2 s once its packages were cached |
| hosts allowed | none beyond H1's `noacg.studio` and the package managers |

Every figure is read from the session's own events (`benchmarks/harness/lib/trace.mjs`), and the
list-price table reproduces each session's `usage.list_cost` to the cent (Opus 5.5 $4 / $20, cache
reads $0.20, 5-minute cache writes $5 per million; running time $0.08 an hour).

## The sessions

All six through `scripts/harness-bench.mjs --build H3` on agent `agent_0183yBA1miijGFNvm5bkMv6B`
(v1 for the first, v2 after the trust fix below), environment `env_01PFiXgBUuDv5aFgEwHXayiY`, each
created with its budget in cents and written to the ledger as it finished.

| proof | session | model | budget | list cost | wall | outcome |
|---|---|---|---|---|---|---|
| 1 plumbing | `sesn_01QUXWwn4LhP1TSh9fFstM7Y` | Haiku 5.5 | 50 | $0.03 | 71 s | failed: the browser refused the egress gateway's certificate; the bench then failed downloading a mounted file |
| 1 plumbing, again | `sesn_01WtxNYgXEyQTkJHmaQS9BnM` | Haiku 5.5 | 50 | $0.03 | 116 s | delivered |
| 1 packages, cold | `sesn_01E6upyUPb45DS7vvfiYXedU` | Haiku 5.5 | 30 | $0.01 | 61 s | not ready by design (0.11.0 has no `record`); the ledger says failed |
| 1 packages, cached | `sesn_01PjZ7Nonk5qfmo3SyG8cXkB` | Haiku 5.5 | 30 | $0.01 | 56 s | the same |
| 2 defect repair | `sesn_019f5PZLggQKVufQfNjrxZNs` | Opus 5.5, `high` | 300 | $1.09 | 189 s | delivered, one version |
| 3 real graphic | `sesn_01YNuBgof1beHZkofTWJLb1G` | Opus 5.5, `high` | 400 | $1.49 | 471 s | delivered, one version |

Total $2.66. The Haiku sessions run the synced agent with its model overridden for the session
(`agent_with_overrides`), so the agent itself stays on Opus 5.5 (D6) and no version was made for
Haiku. No session reached its budget.

### Proof 1: plumbing, on Haiku 5.5

The first session measured the container rather than delivering. `npm install -g` of the mounted
tarball worked (Node 22.22.0, npm 10.9.4; the registry is a package-manager host). `noacg doctor`
picked the container's **Google Chrome** and failed: `net::ERR_CERT_AUTHORITY_INVALID at
https://noacg.studio/bridge`. `curl` to the same URL answered 200: the sandbox reaches the
internet through a TLS-inspecting egress gateway (`issuer: O=Anthropic; CN=Egress Gateway SDS
Issuing CA (production)`) whose certificates are in the system bundle
(`/usr/local/share/ca-certificates/egress-gateway-ca-production.crt` and three siblings;
`NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE` point at the bundle) but not in Chromium's own store.
Playwright's Chromium under `/opt/pw-browsers` (`chromium-1194`, a different build from the CLI's
pinned Playwright 1.61.1, which expects `chromium-1228`) failed the same way. The agent stopped
there rather than bypass the certificate check, which was right. Its download probe showed that
`cdn.playwright.dev` and `playwright.download.prss.microsoft.com` do not even resolve inside the
sandbox, and nothing needs them: the browsers are already there.

The fix is one line of plumbing in the system prompt: add the gateway's certificates to the NSS
store Chromium reads (`~/.pki/nssdb`) with `certutil`, which the sandbox already has. The second
session ran the whole chain: the tarball install, the trust store, `doctor` (Google Chrome,
`bridge v1 (main@b0b87634f4)`), the neutral scoreboard scaffold, `validate --screenshots` clean
with one screenshot read as an image, `record` and `coverage` (57 frames, 2 crops), one coverage
frame read. The bench listed 68 output files and downloaded every one, the record and zip
included; the shape check, the bench's own coverage and validate passed. The frames are under
`evidence/phase-3/h3-plumbing-2/outputs/` on this machine.

Two bench faults this session found, both fixed in this phase:

- The file list by session also holds the session's copy of each mounted file, and the Files API
  refuses to download those (`file_not_downloadable`). The arm skipped nothing and failed the first
  cell on it; it now downloads only what the agent wrote.
- **A CLI digest split.** `validate --screenshots` writes `thumbnail.png` into the package; a
  folder is read without it, a zip carries it as an asset, so the handed-in `record.zip` read as
  another version than the folder it was recorded from (`f448faee...` against `6e170609...`).
  Reproduced on this machine with the same scaffold. The digest now leaves the thumbnail out
  (`cli/src/digest.ts`, with a test in `cli/test/coverage.test.mjs`); the same zip now reads
  `f448faee...`.

**The `packages` field.** A throwaway environment with the same networking and `packages: { npm:
["@noacg/cli@0.11.0"] }` was created for the two packages sessions and deleted after them. Both
found `noacg` 0.11.0 on PATH (`/home/claude/.npm-global/bin/noacg`) with nothing installed, Google
Chrome after the trust store, and the bridge. The first session in the new environment reached
the bridge 26.8 s after its create call, the second 18.2 s, against 26.8 s for the tarball path:
the field works and saves the install, about 10 s. It carries only what npm can install by name,
and the published 0.11.0 lacks `coverage` and `record` (D3), so `environment.yaml` does not carry
it yet; add `"packages": { "npm": ["@noacg/cli@<release>"] }` when the release with the two verbs
is out. Nothing needs to be installed for the browser.

### Proof 2: the defect repair, on Opus 5.5

The bench scaffolded a neutral lower third and turned its name upside down inside its own rule
(`transform: scaleY(-1);` in `.lower-third-name`). The validator passes that package clean (0
errors, 0 warnings, digest `sha256:331a3458...`): only the picture shows it. It went into the
session as `/mnt/session/uploads/graphic.tgz` with the brief "Someone started it ... finish it, so
that it is a clean, readable lower third you would put on air", which never names the defect.

The trace (`evidence/phase-3/h3-defect/trace.json`), in order:

1. 23:05:24 the agent unpacks the package and prints its HTML and CSS (the planted line is in that
   output), then installs the CLI and passes `doctor`.
2. 23:05:51 `validate --screenshots`: clean, digest `sha256:331a3458...`, the planted version.
3. 23:05:59 it reads `onair.png` and `stress.png`: two images came back to the model.
4. 23:06:09 it edits the name rule, removing `transform: scaleY(-1)`.
5. 23:06:12 `validate --screenshots`, `record`, `coverage` (digest `sha256:dab6dad9...`), and at
   23:06:40 it reads seven coverage frames as images. It then closes up the gap an empty role left,
   validates, records and runs coverage again (`sha256:2bf73065...`), and reads all 23 frames and
   both crops.
6. It hands in, saying: "The name was upside down. The CSS had `transform: scaleY(-1)` on the name
   line, so the anchor's name aired flipped. The validator still passed it, but it showed clearly
   in the screenshot."

The delivered record's digest, the bench's validate of the delivered zip and the last `validate`
and `coverage` digest in the trace are one version, `sha256:2bf730654e51...`. The bench's own
capture of the delivered package: 23 frames, validator clean.

**What this does and does not prove.** It proves an image read, a defect no text finding pointed
to, a change, the new render looked at, and the version handed in being the one last reviewed. It
does not prove the agent first noticed the defect in the image rather than in the CSS it had just
printed: the model's thinking is not returned (Opus 5.5 omits it by default), and the planted line
sat in plain sight in that output. Its own account names the screenshot, and it looked before it
changed anything.

### Proof 3: one real graphic, on Opus 5.5

The v1 brief `school-scoreboard` (two-sided, operator actions), its type passed as the student
would name it. The agent read the skill and the contract, scaffolded the scoreboard, redesigned the
markup, styles and the goal and full-time moments, fixed a long-name overlap the validator caught
from a stress screenshot, checked each operator event with `noacg screenshot --event`, validated
clean, recorded, ran `coverage` (69 frames, 2 crops) and handed in. The bench: shape ok, validator
clean, the bench's coverage 69 frames, one version (`sha256:da67f873...`), buttons `goalA`,
`goalB`, `clearFlag`, `final`, `reopen`. The operability gate reports `flag` missing: the known
alias gap of H1's notes (the brief's "flag" moment is `goalA`/`goalB` on this type), not a missing
action.

Measured: $1.49 list cost (2.19M cached reads, 111k cache writes, 24.6k output tokens, 408 active
seconds), 471 s wall, 36 model requests, 40 tool calls, 11 images, the largest request $0.14 (6.4k
output tokens at a 54k context). One finding for H5: the agent read the 69 coverage frames as six
contact sheets of twelve frames each that it built with Pillow, not one by one, although the
system prompt says "Read every frame". That is the reading 3.2 warns is illegible; H5 should
measure whether it misses what single frames show.

### Proof 4: cleanup

After every session the bench deleted the output files, then the session, and checked. Re-checked
from outside the runs afterwards (`evidence/phase-3/cleanup-check.txt`): for all six session ids a
session fetch answers **404 `not_found_error`**, and a file list by that session id answers **an
empty list** (200, 0 files), not a 404: the Files API lists nothing for a deleted session rather
than refusing. The workspace lists no session, the packages environment answers 404, and no
uploaded file is left (the CLI tarballs and the planted package were deleted with their runs).

## What the stub assumed, against the real service

H1's stub (`api/_lib/harness/managedAgentsStub.ts`) replayed the documented shapes. Against the
real service:

- **Held:** the create body (agent pinned by version, `budget` in cents as a string, `metadata`,
  file `resources`, one `user.message` in `initial_events`); a seeded session starts `running`
  and ends `idle` with `end_turn`; `session.usage` carries `list_cost` in whole cents and the
  session's `usage.list_cost` equals it; outputs are listed with `scope_id` and the managed-agents
  beta a few seconds after the idle; a deleted session answers 404.
- **Different:**
  - The file list by session also returns the session's copies of mounted files, which cannot be
    downloaded (`file_not_downloadable`). The stub listed only outputs.
  - An output file's `filename` is its base name only (`sample-video.jpg`, not
    `coverage/sample-video.jpg`): the directory under `/mnt/session/outputs/` is not kept. Two
    outputs with one name in different folders would collide.
  - A file list by a deleted session's id answers an empty list, not 404.
  - The mounted file appears at `/mnt/session/uploads/<mount_path>`, owned by the sandbox user,
    read-only, as documented; the sandbox user's npm prefix is `/home/claude/.npm-global` while
    `HOME` is `/root` (`noacg` config lands in `/root/.config/noacg`).
  - Thinking blocks arrive empty (`agent.thinking` with no text): the trace shows what the agent
    did and said, never why.
  - The real service adds `span.model_request_start` and `span.model_request_end` (per-request
    token usage, which is what prices `o`), and events the client ignores.

Docs read 2026-10-14: [environments](https://platform.claude.com/docs/en/managed-agents/environments)
(`packages`, `limited` networking, the package-manager hosts),
[cloud sandbox reference](https://platform.claude.com/docs/en/managed-agents/cloud-sandboxes-reference)
(Ubuntu 24.04, Node 22, Playwright's Chromium at `/opt/pw-browsers`, not on PATH),
[files](https://platform.claude.com/docs/en/managed-agents/files) (mounts, outputs, the list by
`scope_id`), [sessions](https://platform.claude.com/docs/en/managed-agents/sessions)
(`agent_with_overrides`, budgets), [budgets](https://platform.claude.com/docs/en/managed-agents/budgets)
(what list cost counts, the overshoot of one request per thread),
[session operations](https://platform.claude.com/docs/en/managed-agents/session-operations)
(delete removes the record, events, sandbox and the session's own files).

## What changed in the repository

- `agents/noacg-harness/agent.md`: the browser line points at the sandbox's own browsers and the
  trust-store line (15 of 25 lines, plumbing only). `environment.yaml`: networking unchanged, the
  comment says what was measured. `claude-lock.bench.json`: the bench workspace's ids (agent v2).
- `api/_lib/harness/client.ts`: an optional per-session `model` override; a test pins its shape.
- `benchmarks/harness/lib/`: `trace.mjs` (new, the measures above), `feasibility.mjs` (new, the
  proofs), the arm's mounts, downloads and traces, the ledger's phase ceiling, `packCli` reading
  npm's JSON after the CLI's prepack output (it threw on every real run).
- `scripts/harness-bench.mjs`: `--proof`, `--model` as a per-session override, `--effort`,
  `--ceiling-cents`. `cli/src/digest.ts`: the thumbnail fix.
- `evidence/phase-3/`: each session's `trace.json` and `cell.json` committed; frames, packages and
  raw events on this machine only (`.gitignore`).

## Checks run

`node --test scripts/harness-bench.test.mjs` 27 of 27; `node scripts/run-ai-gateway-tests.mjs`
394 of 394 (the client's override test included); `node --test cli/test/coverage.test.mjs` 9 of 9;
`npx tsc --noEmit -p tsconfig.api.json` and the CLI's `tsc` clean; eslint on every changed file
clean; `harness-agent-sync --workspace bench` reports keep for all three after the last sync;
`NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs --control` on the final code: CONTROL
PASSED at $0 (both arms deliver the scoreboard's 57 frames and the clock's 27, the budget cell
hands in not ready, cleanup gone, the wall refuses a $3 session on $1).

Not checked: the Console's workspace usage page (the owner's glance, see the pull request); a
second real graphic, so `m` is one sample.
