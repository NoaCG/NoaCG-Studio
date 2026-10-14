# H0 evidence: the sealed briefs

Phase 1 of `docs/work-specs/noacg-harness/spec.md` (AC-2, decision D7, sections 4.1 and 5.4), run
2026-10-14 on `origin/main` `e4d7b0841`. Credit spent: $0. Subscription only.

This file holds no exam brief, no exam brief id and no list of the exam's types. The plaintext,
the passphrase and the child's raw records are in `docs/private/harness-exam/` in the main
checkout (gitignored). A tuning session never opens that folder.

## The brief writer

| | |
|---|---|
| Session id | `cd7d9f1d-94ad-47ad-8b3d-ea3835646bfa` |
| Runtime | `claude -p`, Claude Code 2.1.296, `--model claude-opus-5-5` (reported back as `claude-opus-5-5`, `provider: firstParty`) |
| Calls | 1 prompt, then 1 resumed message in the same session (below) |
| Wall time | 264 s, then 100 s |
| Notional usage | $1.47 at list price over both calls (the CLI's cumulative `total_cost_usd`), on the subscription, not the credit |

Arguments: `-p --output-format json --model claude-opus-5-5 --tools "" --strict-mcp-config
--disable-slash-commands`, prompt on stdin. `--tools ""` gave the child no tool at all, so it
read nothing except its prompt: no file, no web, no shell.

### Its environment, built from scratch (5.4)

The runner (`docs/private/harness-exam/child/child.mjs`) passed an explicit environment, not a
copy of its own: `PATH` (the Claude Code install directory and `System32` only); `HOME`,
`USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` and `CLAUDE_CONFIG_DIR` inside a fresh
empty directory; `SystemRoot`, `SYSTEMDRIVE`, `COMSPEC`, `PATHEXT`; `CLAUDE_CODE_OAUTH_TOKEN`
read from the main checkout's `.env`; `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. It refuses to start if any variable name matches `API_KEY`
or `BENCH`, so `ANTHROPIC_API_KEY` and `ANTHROPIC_BENCH_API_KEY` were absent. The working
directory was a fresh empty directory outside the repository, so no `AGENTS.md` or `CLAUDE.md`
of this repository could load.

Before each call, `claude auth status` in that environment reported `loggedIn: true`,
`authMethod: oauth_token`; the runner refuses otherwise.

Isolation was tested before the real run with a one-line question ("name every tool you can
call, and say whether any CLAUDE.md, AGENTS.md, memory or project instructions were given to
you"):

- `b9bfa410-a639-4346-a6e1-2ac408839f81`: no tools, but the user-level
  `C:\Users\ahonemi\.claude\CLAUDE.md` still loaded: Claude Code finds it through the Windows
  profile, not `HOME` or `USERPROFILE`. Its only content is an import line, which did not resolve.
- `ff3de1d4-b213-4bf5-b001-33e0b6aaba15`: with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, no CLAUDE.md;
  an auto-memory directory was still described.
- `6bfb47eb-f4af-4595-a1b4-61145560412d`: with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` as well: "no
  callable tools defined in this session ... and no CLAUDE.md, AGENTS.md, memory, or project
  instructions were given to me". The real run used this environment.

## The exact prompt

The prompt is the instructions below followed by three inputs, assembled by
`docs/private/harness-exam/child/build-prompt.mjs`: 127,597 bytes, sha256
`ba7595200903949119f13faad6b4d56cff646064d39ce195c83dfd25d9c23599`, kept as
`docs/private/harness-exam/child/prompt.md`. It holds the permitted inputs of 4.1 and nothing of
the plan's harness design, the skill or any tuning evidence; the words "harness", "critic",
"coverage matrix" and "Managed Agents" do not occur in it.

| Part | Source | sha256 |
|---|---|---|
| Instructions | verbatim below | `83c6537456d37ba4b8f2144cbf399e1509313ca88a6b4d62924249f6d160b986` (trimmed) |
| INPUT 1, the product docs | `docs.html` at `e4d7b0841` (the noacg.studio/docs page), tags stripped to text | file `5359a63d14abaaeb3e39f74f7c97b62649be2e0ac2036d83d95eacffcbab9dea`, text `da1df2a4cf728426eb4f9e17011391d9eda2fa9699ce67de983d4594718a38d3` |
| INPUT 2, the type registry | `noacg types --json` against `https://noacg.studio` on 2026-10-14 (69 types), condensed to id, name, description, neutral, fields (key, label, kind, role, a short example, options) and actions (event, label); designs dropped | raw `a348b15ce5a1cf8fc7f3f412506ba29e953a30404792e0fdc59d4197ec45131f`, condensed `13e0147bd4ae311f7aec6147ac180eaf4d7ff33d8f07b8352245a6e98a92d4d9` |
| INPUT 3, the existing briefs | `benchmarks/agent/v1/briefs.json` verbatim | `05d7a99d82ba8f647119805e5fba27c075b7745fa834dde6fef74c9ad17f0f29` |

The instructions, verbatim:

```text
You are writing test briefs for an evaluation of AI-made live broadcast graphics in NoaCG Studio. Each brief is one request a NoaCG user types to an AI to get one graphic. You have no tools, and everything you need is below: what NoaCG is (INPUT 1, the product docs), the graphic types NoaCG knows with their fields and operator actions (INPUT 2, the type registry), and six existing briefs that show the shape and the level of detail (INPUT 3). Answer with one JSON object and nothing else.

Write 30 new briefs: 20 in "exam" and 10 in "tuning". The two sets are used separately, and the exam set must stay unknown to anyone who has seen the tuning set. So no exam brief may be a near-copy of a tuning brief or of a brief in INPUT 3: each exam brief differs from all of them in type, or in the same type in a clearly different show, use and hard case.

The 20 exam briefs:
- At least eight different registered types (the `id` values of INPUT 2), and at least two typeless briefs for a graphic no registered type covers (`type` null, `novel` true, and a `fields` string in the syntax of `debate-clock` in INPUT 3).
- These stress cases, each in at least the number of briefs given (one brief may carry several):
  - long names and titles that strain the layout: 4;
  - two-sided boards, two teams, sides or speakers shown against each other: 3;
  - a logo the operator supplies, bright in some briefs and dark in others: 2 bright and 2 dark;
  - the graphic over a busy background picture: 3;
  - operator actions the brief needs live, beyond putting the graphic on and taking it off: 8.

The 10 tuning briefs: at least six different types, each stress case above at least once, the same shape and the same care.

Who asks: mostly students and non-technical users at schools, universities, clubs, churches, community and small productions, plus some professional news, sport and esports. Vary the shows, the looks, the screen positions and the languages of the names (some with diacritics). Each brief is an ordinary, reasonable request a real user would make; a graphic made for it could air.

Every brief has these keys, as in INPUT 3:
- `id`: short kebab-case, unique across all 36 briefs.
- `kind`: "noacg".
- `type`: a type `id` from INPUT 2, or null for a typeless brief.
- `chassis`: null.
- `neutral`: the type's `neutral` value from INPUT 2; false when typeless.
- `novel` and `fields`: only on typeless briefs.
- `prompt`: what the user types, in plain words: the show or event, the look, where it sits on screen, what the operator changes or triggers live, and the hard case it must survive.
- `stress`: the values the graphic is tested with, keyed `f0`, `f1`, ... in field order (a registered type's field order in INPUT 2; a typeless brief's order in its `fields` string). The value of an image field is a short description of the test picture; for a logo, start it with "bright:" or "dark:" (for example "dark: a navy crest on a transparent background"). When the graphic should carry a logo but its type has no image field, put that description under `logo`. For a busy background, add `background`: a short description of the picture behind the graphic, starting with "busy:".
- `expect`: `fields`, the number of fields the operator edits; `actions`, the operator actions the brief requires, named as the type's action in INPUT 2 where one means the same, else a short camelCase name; [] when there are none.
- `judge`: one line: what a reviewer checks to call the result airable for this brief.

Answer with exactly this JSON object and nothing before or after it:
{"exam": [ ...20 briefs... ], "tuning": [ ...10 briefs... ]}
```

The three inputs follow under the headings `=== INPUT 1: the product docs (noacg.studio/docs,
as text) ===`, `=== INPUT 2: the type registry (one type per line) ===` and `=== INPUT 3: the
existing briefs (benchmarks/agent/v1/briefs.json) ===`.

The stress-key conventions for pictures (`bright:`, `dark:`, `busy:`, `logo`, `background`) are
this phase's decision: 4.1 names logo and background stress cases, and v1 has no key for them.
The minimum counts per stress case are this phase's reading of 4.1, which names the cases but
not how many.

### The one follow-up

The first answer met every count of the coverage review, but its 10 tuning prompts averaged
about 220 characters against about 400 for the exam and v1. Tuning on thinner briefs than the
exam would under-represent it, so the session was resumed once (`--resume`, same session id)
with this message, verbatim (sha256
`f0e85cfadda0ce122d7b865b1a423740772d928788b39b33ed7df4f1054c651b`):

```text
Coverage review: the exam set meets every requirement. The tuning set is thinner than the exam set and INPUT 3: its prompts average about 220 characters against about 400. Rewrite only the 10 tuning briefs to the same level of detail as the exam briefs and INPUT 3 (the show or event, the look, where it sits, what the operator changes or triggers live, and the hard case), keeping their ids, types and stress cases. Return the whole object again with the 20 exam briefs exactly as they were, in the same format: {"exam": [...], "tuning": [...]} and nothing else.
```

The 20 exam briefs of the second answer are deep-equal to the first answer's; the 10 tuning
briefs kept their ids, types, `stress` and `expect`, and their prompts now run 437 to 570
characters. The builder wrote and edited no brief.

## Coverage review

Mechanical (`docs/private/harness-exam/child/coverage.mjs`), then a read of the briefs for shape
and sense. All 30 have every v1 key, `kind: noacg`, `chassis: null`, `neutral` equal to the
registry's, `expect.fields` equal to the field count, every `stress` key inside the field range,
and a one-line `judge`. Every action named for a registered type is one of that type's registry
events. Ids are unique across the 36 briefs.

| Requirement (4.1, as the prompt stated it) | Exam (20) | Tuning (10 new) |
|---|---|---|
| Distinct registered types | 18 (want at least 8) | 9, plus 1 typeless (want at least 6) |
| Typeless briefs | 2 (want at least 2) | 1 |
| Long names and titles | 16 (want 4) | 7 |
| Two-sided boards | 6 (want 3) | 2 |
| Bright logo / dark logo | 7 / 7 (want 2 / 2) | 2 / 3 |
| Busy background | 7 (want 3) | 2 |
| Operator actions beyond on and off | 16 (want 8) | 7 |
| Exam briefs sharing a registered type with a tuning or v1 brief | 0 | |

The 10 new tuning briefs are, by type: `lower-third`, `scorebug`, `duel-score`, `sponsor-strip`,
`event-bug`, `live-poll`, `ticker`, `holding-screen`, `winner-card` and one typeless.
`benchmarks/harness/tuning/briefs.json` holds the 6 v1 briefs verbatim, then these 10.

## Sealing (D7)

- Plaintext: `docs/private/harness-exam/briefs.json`, `{ version, notes, briefs: [20] }` in the
  v1 shape, LF line endings, sha256
  `27b4e20899a522d846e72297aeef5103c3c89dc3b8078c56bc75cb2f4e8275ad`.
- Passphrase: `docs/private/harness-exam/passphrase.txt`, 32 random bytes in base64url, no
  newline. The passphrase is the file's content, trimmed.
- `benchmarks/harness/exam/briefs.sha256`: `<sha256 hex of the plaintext bytes>  briefs.json`,
  then a newline.
- `benchmarks/harness/exam/briefs.sealed`: a JSON object
  `{ format: "noacg-sealed-v1", cipher: "aes-256-gcm", kdf: "scrypt", N: 16384, r: 8, p: 1,
  salt, iv, tag, ciphertext }`, the last four in base64 (16-byte salt, 12-byte iv, 16-byte GCM
  tag). Key: `crypto.scryptSync(passphrase, salt, 32, { N, r, p })`. A wrong passphrase fails
  GCM authentication and yields nothing.

Seal (done once, from the repository root; the script is `docs/private/harness-exam/seal.mjs`):

```sh
node <main>/docs/private/harness-exam/seal.mjs seal <main>/docs/private/harness-exam/briefs.json \
  <main>/docs/private/harness-exam/passphrase.txt benchmarks/harness/exam/briefs.sealed benchmarks/harness/exam/briefs.sha256
```

Verify, with nothing but Node (what H1's test reproduces):

```sh
node -e "const c=require('crypto'),f=require('fs'),[s,p,h]=process.argv.slice(1),j=JSON.parse(f.readFileSync(s,'utf8')),k=c.scryptSync(f.readFileSync(p,'utf8').trim(),Buffer.from(j.salt,'base64'),32,{N:j.N,r:j.r,p:j.p}),d=c.createDecipheriv('aes-256-gcm',k,Buffer.from(j.iv,'base64'));d.setAuthTag(Buffer.from(j.tag,'base64'));const t=Buffer.concat([d.update(Buffer.from(j.ciphertext,'base64')),d.final()]);if(c.createHash('sha256').update(t).digest('hex')!==f.readFileSync(h,'utf8').split(/\s+/)[0])throw Error('hash mismatch');console.log('ok')" \
  benchmarks/harness/exam/briefs.sealed <main>/docs/private/harness-exam/passphrase.txt benchmarks/harness/exam/briefs.sha256
```

Run on 2026-10-14: the right passphrase printed `ok`, and the decrypted bytes equal the
plaintext file; a wrong passphrase threw `Unsupported state or unable to authenticate data`.

`<main>` is the main checkout (`C:\claude\NoaCG-Studio`), the only place the private folder
exists; from a worktree it is the parent of `git rev-parse --path-format=absolute --git-common-dir`.
