# D1 skill change: fresh-brief runs, Codex switch probes, pattern fixture (2026-10-02)

Row 2026-10-02d-BL-1, branch `claude/bl-plugin-design-d1`. The skill under test is the branch's
`cli/plugin/skills/noacg-graphic/` copied to `C:\claude\bl-walk-2026-10-02\skill\` before the runs
(one later wording change, live-versus-set-once and a kicker line, came from these runs). CLI
0.7.0 built from the branch, `NOACG_URL=http://localhost:5246` (this worktree's dev server, no
account backend). Frames and packages are in
`docs/research/plugin-graphics-quality-2026-10-02/evidence/d1-runs/` and
`.../evidence/pub-quiz-package/`.

## Method and limits

- Claude runs: the subagent method of the 2026-10-02 research README. One fresh Opus subagent
  per arm, told the skill copy was its installed skill and to ignore the repository; an empty
  folder outside the repo; the user unavailable. Its system context still carried this
  repository's instructions, so it is a near-stranger. The three ran in parallel. One run per arm
  is a first check, not a benchmark (`docs/backlog/plugin-quality-benchmark-judged-from-frames.md`).
- Codex probes: `codex exec --skip-git-repo-check --ephemeral -s read-only` (codex-cli
  0.161.0-alpha.3, logged in) in four empty folders, each holding the plugin's skill copy as a
  project skill under `.agents/skills/noacg-graphic/`. The plugin itself was not installed into
  `~/.codex`, to leave the owner's setup alone; the skill bytes are the ones the Codex plugin
  ships. They asked for a plan, not a build.
- Idle cost: `claude --plugin-dir <dir> plugin details noacg`, branch against `origin/main`.

## Results

| Arm | Brief | Opt-in files opened | Observed |
|---|---|---|---|
| Default (Claude) | 4, pub quiz | none (SKILL, contract, control, package, validator) | Its own look (`d1-runs/default-quiz-onair.png`). Round and question number are `number` fields (the walk's run had free text "Question 7"); ROUND, QUESTION, TIME'S UP and the timer length are hidden word sources, so the timer length no longer shows as a live stepper; the timer group follows §5e and ends itself at zero. 0 errors, 0 warnings. |
| Guidelines on (Claude), asked in the request | 3, gala | `design-notes.md` | Cites the guidelines for every size and timing: name 84px/600, venue 40px (ratio 2.1), host 32px/600, 28px secondary floor, kicker 22px, one gold accent, 1.65 s ceremonial entrance (the walk's run cut its build to fit 0.5-1.4 s and set its venue line at 24px). `d1-runs/guidelines-gala-onair.png`. 0 errors, 0 warnings. |
| Critique asked (Claude) | the walk's gala package | `critique.md` | Nine critique lines, three changes each tied to a line: the boxed stock card became an unboxed light motif (star, bloom, feathered dark pool), "Host Name" placeholder became an empty default that collapses, "Hosted by" became a hidden word source. Before/after over dark, bright and busy grounds: `d1-runs/critique-gala-before-grounds.png`, `d1-runs/critique-gala-after-grounds.png`. 0 errors, 0 warnings. |
| Codex A, no switch | lower third | none | "2. none / 3. none" |
| Codex B, "Please use NoaCG's design guidelines" | lower third | `design-notes.md` | Guidelines on "by your explicit request"; lists the floors, 3.25:1, 28px. |
| Codex C, `NoaCG design guidelines: on` in `AGENTS.md` | lower third | `design-notes.md` | Guidelines on "by ... AGENTS.md". |
| Codex D, "Critique and improve the NoaCG graphic in ./pattern-bench" | existing package | `critique.md` | Critique on, guidelines off; plans the before/after loop. |

Idle cost (`claude plugin details`): `origin/main` ~155 always-on tokens (skill ~130, command
~30); branch ~155, the same. A separate `/noacg:critique` command with
`disable-model-invocation: true` measured ~179 (the tool counts its description as always-on), so
it was dropped for `--critique` on the existing command. The skill description is 478 characters
against 483 on `origin/main`; the command description is unchanged.

## Pattern fixture (contract.md §5e)

`d1-runs/pattern-bench-package/` carries all five §5e patterns in one typeless package
(scaffolded with `noacg scaffold --fields`, machine and runtime added by hand).
`noacg validate ./pattern-bench --screenshots ./shots`: 0 errors, 0 warnings, every readiness row
PASS. `noacg inspect`: three inputs (the two hidden holders are not on the operator page), five
buttons, four state groups. `d1-runs/pattern-bench-drive.mjs` drove it in headless Chrome: the
empty Place line collapses and reopens (also for spaces only); Goal works from every state; the
timer counts down from the hidden length, sends `timerEnd` itself at zero and the 2 s timer arrow
returns it to idle; Final paints FINAL from the hidden source and a renamed word (LOPPU) repaints
on `update()`; a re-take mid-timer clears the timer and the word, and no stray `timerEnd` fires.

## Not checked

The true stranger run (`claude -p` with the plugin; this machine's terminal Claude is not logged
in). The Codex plugin install path (`codex plugin add`), deliberately. A studio Import and
Playout walk of the three new packages. A second run per arm.
