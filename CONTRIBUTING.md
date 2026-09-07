# Contributing to NoaCG Studio

Thanks for looking. NoaCG Studio is AGPL-3.0 and free forever for the core, and it is built to be
run by TV channels, streamers, organisations and schools who should not have to pay hundreds a
month for broadcast graphics. Contributions that serve that are very welcome.

This file is for people outside the core team. If you are working deeper in the codebase, the
binding contracts live in `AGENTS.md` at the repository root and in nested `AGENTS.md` files per
area; read the one covering the area you are touching before you change it.

## Getting it running

You need **Node 24** (see `.nvmrc`).

```bash
npm install
npm run dev
```

The dev server prints its port, which is per-checkout rather than fixed. The landing page is at
`/` and **the studio itself is at `/app`**, which is where most work happens.

There is no account or API key needed to create, preview or export a graphic. Cloud sync,
community features and hosted AI are the only parts that want a sign-in, and a checkout without
Supabase environment variables simply grows no auth UI at all.

## The one gate

```bash
npm run build
```

That runs the typecheck, the linter, the dependency rules, the unit suites and the production
build. It is the same gate CI uses, so if it is green locally your pull request will almost
certainly be green too. Keep the tree lint-clean rather than adding `eslint-disable` comments.

For anything that changes a user-visible flow, add or update a Playwright spec under `e2e/` in the
same change:

```bash
npm run test:e2e:affected
```

That maps your changed files to the specs that cover them, so you do not have to run all 149.

## What good looks like here

A few house rules that are worth knowing before you write much:

**The code is the source of truth.** Every visual, AI or block action emits real, readable,
commented HTML/CSS/JS. Nothing may hide behind a scene model the user cannot see or edit. If a
feature would only work through a hidden internal representation, it is the wrong design for this
project.

**Generated code is read by users.** Prefer obvious code over clever code, and comment it. A
template a user opens in the editor should be something they can understand and change.

**No runtime dependencies in what we emit.** GSAP and the Lottie player are vendored, exports use
relative paths, and generated templates never reference a CDN or phone home. Adding a runtime
dependency to an export will be refused.

**Never make a playout client mandatory.** SPX, CasparCG, OGraf, OBS and the rest are export
targets, all equal. Nothing in the core may assume one of them.

**Every persisted format carries a version**, and a breaking change ships its migration in the
same commit. Saved templates are user data.

## Sending a change

1. Fork, and branch off `main`.
2. Make the change, with a test where the behaviour is testable.
3. `npm run build` green.
4. Open a pull request describing what changed and why. Write the description for a person
   reading the history cold, not for the reviewer who already has context.

Commit messages should explain the actual change in plain sentences. Please do not add
`Co-Authored-By` trailers for AI tools.

Landing on `main` goes through a merge queue, so a maintainer will queue your pull request once it
is reviewed; you do not need to do anything for that step.

## Reporting things

- **Bugs and feature ideas**: open a GitHub issue. For a bug, the graphic you were making and the
  export target you were aiming at are usually the two facts that matter most.
- **Security problems**: do not open a public issue. See `SECURITY.md`.
- **Conduct**: see `CODE_OF_CONDUCT.md`, which applies to every space in this project.

## Licence

By contributing you agree that your contributions are licensed under the
[GNU AGPL-3.0](LICENSE), the same licence as the project.
