Shared canonical workflow for the `noacg-graphic-local` skill - invoked as
`/noacg-graphic-local` in Claude Code, `$noacg-graphic-local` in Codex.

# Make a NoaCG graphic (in-repo dogfooding of the product skill)

**The name carries the difference, because both skills are loaded in this repository.** The
published `noacg` plugin ships `noacg-graphic`, which makes a graphic against noacg.studio and
is what a user gets; this one runs the same loop against THIS checkout's dev server and locally
built CLI, to exercise the code being changed. While the two shared one name and one
description, nothing chose between them on purpose - the plugin's was invoked 25 times and this
one never.

The PRODUCT skill - what a user's Claude Code or Codex loads - is `cli/skill/noacg-graphic/`
(SKILL.md + references/). This workflow exists so a session working IN this repository can run
the same loop against the local dev server, and so the repository's own adapters have one
canonical procedure to point at (docs/AGENT_WORKFLOWS.md).

1. Read `cli/skill/noacg-graphic/SKILL.md` and follow it. It is the whole procedure: the
   contract (`references/contract.md`), the package (`references/package.md`), what the validator
   measures (`references/validator.md`), how NoaCG operates a graphic (`references/control.md`),
   and the optional house design notes (`references/design-notes.md`, off by default).
2. Drive the LOCAL deployment: start this checkout's dev server (`npm run dev` - the port is
   `node scripts/dev-port.mjs`) and run the CLI with `NOACG_URL=http://localhost:<port>` from
   `cli/` (`npm run build` once, then `node cli/dist/index.js <command>`), or `npx @noacg/cli` for
   the published build against `https://noacg.studio`.
3. The CLI launches a headless Chromium - a browser-driving job. Respect the one-job-per-machine
   rule (`root/enqueue-browser-driving-work-rather-than`): `npm run bench:cli` is the queued,
   guard-known entry for the CLI smoke; do not run it beside a live e2e suite.
4. Never put design doctrine into the default skill; `references/design-notes.md` is the one
   place for house taste and it stays optional (docs/AGENT_CLI.md, the WHY).
