# L0 evidence: the forced look, the sealed exam, the reservation and the ladder judge

Phase 1 of `docs/work-specs/harness-ladder/spec.md` (AC-1, AC-2, AC-3), built 2026-10-17 on
`origin/main` `6d66070e1`. Credit spent: $0. Subscription only.

This file holds no exam brief, no exam brief id and no list of the exam's types. The plaintext,
the passphrase and the child's raw records are in `docs/private/harness-ladder-exam/` in the main
checkout (gitignored). A ladder or teaching session never opens that folder.

## The sealed exam (AC-2)

### The brief writer

| | |
|---|---|
| Session id | `3fcd81b3-013c-4766-a8b2-33e5265e69dc` |
| Runtime | `claude -p`, Claude Code 2.1.296, `--model claude-opus-5-5` (reported back as `claude-opus-5-5` only) |
| Calls | 1 prompt, then 2 resumed messages in the same session (below) |
| Wall time | 167 s, then 55 s and 58 s |
| Notional usage | $1.30 at list price (the CLI's cumulative `total_cost_usd` after the third call), on the subscription, not the credit |

The runner is H0's (`child.mjs`, copied unchanged into `docs/private/harness-ladder-exam/child/`):
`-p --output-format json --model claude-opus-5-5 --tools "" --strict-mcp-config
--disable-slash-commands`, prompt on stdin, so the child read nothing but its prompt: no file, no
web, no shell. Its environment is built from scratch as the parent's 5.4 says (`PATH` with the
Claude Code install and `System32` only; `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`,
`TMP` and `CLAUDE_CONFIG_DIR` in a fresh directory; `CLAUDE_CODE_OAUTH_TOKEN`;
`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; nothing named like a
key), its working directory fresh and outside the repository. `claude auth status` there reported
`loggedIn: true`, `authMethod: oauth_token` before each call.

### The exact prompt

H0's `build-prompt.mjs`, unchanged, assembled the instructions and the three permitted inputs of
the parent's 4.1: 127,041 bytes, sha256
`68b45cc9fb5f127de7479643f3fd1efe3137387548c2e47f0c5934042fe48861`, kept as
`docs/private/harness-ladder-exam/child/prompt.md`.

| Input | sha256 |
|---|---|
| The instructions (`child/instructions.md`) | `cc89006275f09d640e8c3578a41d02b6adc63056133725686a95083a202235df` |
| `docs.html`, the product docs, as the Windows checkout holds it (CRLF) | `484b4d3faa2bea58336c3c8b6f51765194b0965707de134e8968cc974e4d4ba9` |
| the docs as text | `8400d3d4b89ed796405d6c9cf1cdf8a12ffc492d28e13b6daf6841f1f29a8cb5` |
| `noacg types --json` from `https://noacg.studio`, raw | `a348b15ce5a1cf8fc7f3f412506ba29e953a30404792e0fdc59d4197ec45131f` (byte-identical to H0's) |
| the registry, condensed | `13e0147bd4ae311f7aec6147ac180eaf4d7ff33d8f07b8352245a6e98a92d4d9` |
| `benchmarks/agent/v1/briefs.json`, verbatim | `05d7a99d82ba8f647119805e5fba27c075b7745fa834dde6fef74c9ad17f0f29` |

The instructions are H0's with the tuning set taken out and section 2's mix put in: 20 briefs, at
least eight registered types and two typeless, at least six boards an operator drives with three
or more actions, and the parent's 4.1 stress cases at H0's minimum counts (long 4, two-sided 3,
bright and dark logo 2 each, busy 3, actions 8); every id different from INPUT 3's. Nothing of
either plan's harness design, the skill, the forced look, the ladder or any tuning evidence is in
it: "harness", "ladder", "coverage", "rung", "forced look" and "Managed Agents" do not occur, and
"review" and "verdict" only in the type registry's own fields and H0's "what a reviewer checks".

### The two follow-ups

The builder read no brief. A script (`child/coverage.mjs`) printed only counts and problems, and a
second (`child/revise.mjs`) wrote the follow-up from them without printing a brief:

1. One id was already used by an earlier brief file, and one brief keyed a stress value by a name
   that is not `f<n>`, `logo` or `background`. The child renamed that id and moved that value; the
   other 18 briefs came back byte-identical.
2. The leak scan (below) found one 212-character stress value word for word in a committed H8 cell
   (a public text two briefs quoted). The child replaced that one value with its own text; every
   other brief, and every other key of that one, came back identical.

### What was sealed

`benchmarks/harness/ladder/exam/briefs.sealed` (noacg-sealed-v1: AES-256-GCM, the key
`scrypt(passphrase, salt, 32, N 16384, r 8, p 1)`, the parent's H0 format) and
`benchmarks/harness/ladder/exam/briefs.sha256`, the plaintext's sha256
`0a81eda9a14b62c65272bef757ed737acfd78d88b55c2ee64d03eba08332df11`. A new passphrase, not H8's, in
`docs/private/harness-ladder-exam/passphrase.txt`; `seal.mjs open` there printed `ok` with that
hash, and a wrong passphrase fails GCM (the bench test).

The mix, counted by the script (one brief may carry several cases):

| Requirement | Wanted | Sealed |
|---|---|---|
| briefs | 20 | 20, every one `kind: noacg` with `stress`, `expect` and a one-line `judge` |
| registered types | at least 8 | 18 |
| typeless | at least 2 | 2 |
| boards with three or more actions | at least 6 | 12 |
| long names and titles | 4 | 16 |
| two-sided | 3 | 6 |
| bright logo / dark logo | 2 / 2 | 5 / 5 |
| busy background | 3 | 10 |
| operator actions | 8 | 16 |

No id is shared with an earlier brief file: the 113 ids of every tracked brief file
(`benchmarks/agent/v1`, `benchmarks/creative/v1`, `benchmarks/harness/tuning`, `benchmarks/pro/v1`
and its `custom` bank, `benchmarks/video/v1`, the two `scripts/video-bench-briefs.*` files) and
the closed H8 exam, opened in memory. The prompts' highest word overlap with any H8 brief is a
Jaccard of 0.44.

### The leak scan

`child/leak-scan.mjs`: every stress value of eight characters or more that is not a number or a
clock, each logo and background description without its `bright:`, `dark:` or `busy:` tag, and the
first 60 characters of every prompt and judge line (155 needles), searched case-insensitively in
all 6,747 readable tracked files. After the second follow-up: no prompt, no judge line and no
value of four words or more is found anywhere. Six short values (10 to 13 characters, one to three
words) occur in product source, each in `src/` among 1 to 47 files: sport and show vocabulary the
catalog uses, not text from this exam, which did not exist before today. Recorded here rather than
asked away, as H0's check recorded its one generic value.

The seal was committed before any ladder session (the first is L1's); its commit is the first of
this phase's pull request.
