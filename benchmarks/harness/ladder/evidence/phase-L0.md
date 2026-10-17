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

The seal was committed in `6c8a1954a` (2026-10-17T11:16:00Z) and pushed at once, the first commit
of this phase's pull request, before any ladder session (the first is L1's) and before L0's own
subscription-arm proof below.

## The forced look (AC-1)

- **The CLI.** `noacg coverage` also writes `review.json` beside `coverage.json`: format
  `noacg-review-v1`, the sources' digest, and every frame it shot by file name, each with an empty
  verdict (crops are not listed: D1 names frames). `noacg record --review <review.json>` refuses
  with exit 1, a `reason: review` and nothing written, while a frame of the coverage beside it has
  no verdict, a verdict is open (anything but `ok` or `fixed: <what>`), the review names frames the
  coverage did not make, the coverage holds no frame or could not shoot a render, or the review's
  digest is not the coverage's or not the graphic's now (stale). What the review says by itself is checked before any browser
  starts; the digest once the bridge has read the package. A record handed in that way carries
  `review` (digest, counts, every verdict). Without `--review`, record is unchanged.
  `cli/src/review.ts`, `cli/test/coverage.test.mjs` (three new tests; the CLI suite 297 pass, 18
  skipped).
- **The skill.** `cli/skill/noacg-graphic/references/hand-in.md`: for a host that saves the
  graphic itself, cover, open every frame `review.json` lists before setting its verdict, fix and
  cover again for a frame you would not air, then `record --review`. `SKILL.md` points to it from
  step 5 and the reference list; the plugin copy is regenerated by `build-skill`.
- **The system prompt** (`agents/noacg-harness/agent.md`) hands in only that way: coverage to
  `/mnt/session/outputs/coverage`, then `record ... --review .../coverage/review.json`. 15 lines,
  under AC-16's 25. Not synced: L3 syncs the winner as a new agent version.
- **`--control`** (below) passes at $0 with the fake arm handing in through the real CLI's
  coverage, a verdict on every frame and `record --review`.

## The bench (AC-3)

- **The money (D9).** The ledger gains `holds`: L4's exam reserve $30.00 and L3's confirmation
  ceiling $8.00, set by `--hold` and recorded by L0 before any ladder session. A hold is kept from
  every other phase until its own closes, and its phase may spend no more than it: `admit` refuses a
  session past either. With the spend at $54.68, $7.32 stays unallocated, and the ledger can never
  pass $100. The H plan's closed reserve is untouched.
- **The phases** (`benchmarks/harness/lib/ladder.mjs`): L0 to L4 run in order, each only once the
  one before it is closed; no session after L0 without the two holds; L0 to L2 run the
  subscription arm only, L3 the managed-agents arm, L4 managed-agents and the claude-code
  reference. Briefs: tuning briefs by id, the eight of D4 opened in memory from H8's sealed file
  (only with H8 closed), and in L4 only the ladder exam. A rung is its model and effort, a round its
  `--stage`, so neither is skipped as already run.
- **The subscription arm (D2)**, `subscriptionArm` in `lib/arms.mjs`: one `claude -p` per brief,
  `--model` and `--effort` the rung's, `--disallowedTools WebFetch,WebSearch`, this checkout's
  `cli/plugin` (the skill) and `cli/dist` behind the call-keeping shim, the 5.4 environment built
  from scratch, outside the repository, stopped at 20 minutes. Its prompt is the harness's user
  message (`Brief: ...`, the type) and the system prompt's plumbing on local paths. Its cost is
  Claude Code's `total_cost_usd`, recorded as notional and never as credit; a session stopped at
  its limit is costed from its transcript at list prices.
- **The look line (D1, D6).** Every cell carries `look`: the frames its record's review gave a
  verdict for, how many of those its trace opened (Managed Agents `read` steps, or Claude Code
  `Read` calls in the session's transcript, matched by file name; only reads that did not fail and
  that come after the session's last `noacg coverage`, since every coverage writes the same names
  over new pixels), and which it did not. In a ladder phase a hand-in without a review is
  `not-ready`.
- **Judging (D8).** `--judge <runDir> --phase L1|L2` uses the ladder judge, singles only.
- Tests: `scripts/harness-ladder.test.mjs` (14, new) and `scripts/harness-bench.test.mjs` (49 of
  49; its stand-in CLI now writes `review.json` and checks `--review` as the real verb does, and
  the first arm test also asserts the fake arm's look; the committed-ledger test checks that H8's
  closed reserve holds nothing on the ledger without the ladder's holds, and that the holds are
  all the committed ledger holds, and its wall scenario runs on that copy as the ledger stood then;
  no assertion was dropped or loosened).

## The ladder judge (AC-3)

Opus 5.5 at effort `high` on the exam judge's frozen `prompt.md` and `rubric.json` (hashes
`3060b854`, `82311f0d`, unchanged), frozen in `benchmarks/harness/ladder/judge.lock.json`
(fingerprint `9fa9d7e3ac9b`) and committed in `d0d29f5dd` at 11:18:07Z, before its first held-back
answer at 11:18:32Z. `calibration.mjs run --part heldout --lock ... --phase L0 --concurrency 2`
judged the same held-back part H2's judge was frozen against (the lock's split hashes equal
`judge.lock.json`'s), into its own results file; the runner refuses a second lock whose prompt or
rubric differ from the exam judge's, so the held-back part still never shaped a prompt.

| H2's bar (parent 4.3) | Needed | Opus 5.5 | Fable 5.1 (H2) |
|---|---|---|---|
| airability agreement | at least 85% | 38 of 41, 92.7% (Wilson 80.6% to 97.5%) | 38 of 41 |
| basic-defect FAIL called airable | none | none | none |
| pairwise good over bad, flips as errors | at least 90% | 16 of 16, 100% (80.6% to 100%), 0 flips | 16 of 16 |
| approves everything | no | no (25 of 26 bad rejected) | no |

**PASS: Opus 5.5 is the ladder judge**, so Fable's weekly cap is kept for the exam, which the
frozen Fable lock judges (`60bfb08e18a4`, unchanged). 57 answered calls, every one served by
`claude-opus-5-5` only, no pause and no error, 11:18:32Z to 11:27:04Z, $7.91 notional on the
subscription. Its three disagreements: two August cells the owner aired called not airable
(`aug:live-vote.C`, `aug:school-scoreboard.A`) and one free-form cell the owner rejected for a
stroke almost over the logo called airable (`ff:X-55`). The answers and score are committed in
`benchmarks/harness/ladder/judge/`, and the result in the lock's `calibration` block, which
`calibration.mjs score --lock` writes; `ladderJudge` uses the lock only when that block and the
committed score it names both read `pass: true`. The runner now also refuses a further second
judge on the held-back part once one has read it, so models cannot be tried on it until one passes.

## The subscription arm, one brief end to end (AC-3)

`node scripts/harness-bench.mjs --build L0 --arms subscription --model claude-haiku-5-5 --effort
high --briefs news-lower-third --stage arm-proof`, against `https://noacg.studio`, after the seal,
the holds and the judge. The cheapest rung of D5 on a tuning brief that is not one of the ladder
eight, so L1's briefs stay unrun.

| | |
|---|---|
| Session | `7ddfc10f-4621-452a-a60f-7320b03406b6`, `claude-haiku-5-5` only in its `modelUsage`, 76 turns |
| Outcome | delivered: its last line `DELIVERED`, a record handed in with `--review` |
| Wall | 315 s (11:29:50Z to 11:35:05Z) |
| Cost | $0.60 notional (`total_cost_usd`), $0 credit; the ledger entry is `funding: subscription`, 0 cents |
| The look | 23 frames reviewed (all `ok`), 23 of them opened with Read after its last coverage: the look line `all` (recounted with the final rule, which the review below made stricter) |
| The bench's own half | the save door's shape check passed, the validator clean, 23 coverage frames captured with no finding, no missing action, the record's, the bench's and the last reviewed digest one version (`bf295fbf`) |

Its CLI calls, from the shim: `doctor`, `whoami` (exit 1, no key, as there should be), `types`,
`scaffold --type lower-third --design neutral`, `docs validator`, `validate --screenshots`, a
`screenshot`, `inspect`, `coverage`, `validate --screenshots` again, `coverage` again, `record
--review` (exit 0, first try), `validate`. No `save` and no `login`. It opened the skill's
hand-in reference and did as it says; whether its verdicts were honest is the judge's and the
look line's to say in L1, not this proof's.

## --control at $0

`NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs --control`: CONTROL PASSED. Both
control briefs through the fake arm (now covering, setting every verdict and recording with
`--review` on the real CLI) and the stubbed Managed Agents arm: shape ok, validator clean,
school-scoreboard 57 frames and debate-clock 27, digests one version; the fake arm opened 57 of 57
and 27 of 27 reviewed frames ("the forced look (fake arm): every record reviewed, every reviewed
frame opened"); the budget-capped stub hands in not-ready; the wall refuses a $3 session on a
ledger with $1 left before any session exists; $0 recorded. The debate-clock "MISSING
switch/penalty/reset" is the alias gap H1 recorded for that typeless v1 brief, unchanged.

## Spend

Credit: $0. The ledger stays at 5,468 cents spent, with $30.00 held for L4 and $8.00 for L3 and
$7.32 unallocated. Subscription, notional: the brief writer $1.30, the judge's calibration $7.91,
the arm proof $0.60; $9.81 in all, each in the ledger as an L0 entry with no cost.
