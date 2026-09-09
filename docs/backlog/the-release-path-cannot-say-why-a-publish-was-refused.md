# The release path cannot say why a publish was refused

**Filed:** 2026-09-09, out of session AH, which set out to publish `@noacg/cli` 0.3.1 and spent an
hour on forensics instead. The publish was refused for a reason no log in the repository names.

## Why

`npm publish` swallows a failed OIDC token exchange. Every failure path in npm's `oidc.js` returns
nothing and logs at `verbose` or `silly`, and the default level is `notice`, so a trusted publish
that cannot authenticate prints **nothing at all** and then fails with:

```
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/@noacg%2fcli - Not found
```

That message is a lie twice over. The package exists, and the real answer is 403, which the
registry masks as 404 so an unauthenticated caller cannot probe for private packages. npm knows the
message is misleading (`npm/cli#9088`, open since 2026-03-10; `npm/cli#9923`, open since
2026-08-27, which quotes the hidden line: `npm verbose oidc Failed token exchange request with body
message: OIDC token exchange error - package not found`).

Under it sits a second problem. `actions/setup-node` with `registry-url` writes
`_authToken=${NODE_AUTH_TOKEN}` into the `.npmrc`, and with no token supplied that expands to
setup-node's literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. So when the exchange yields nothing,
npm does not stop. It sends the placeholder and lets the registry refuse it.

And the workflow's own rehearsal cannot catch any of this. `npm publish --dry-run` never
authenticates, so on 2026-09-09 a dry run went green on every step - guards, pack, registry
rehearsal, release-notes rehearsal - three minutes before the real publish failed at the first byte
that needed a credential. The dry run is still worth having. It just must not be described as
proof that a publish will work, which is roughly how `docs/AGENT_CLI.md` reads today.

## What it would take

Three things, smallest first, and the first one is the one that pays for itself:

1. **Make the publish step verbose.** `NPM_CONFIG_LOGLEVEL: verbose` on the `Publish` step in
   `.github/workflows/release-cli.yml`, or `npm publish --loglevel=verbose`. That single line turns
   an hour of comparing runs into one sentence in the log naming the exchange result. Land it with
   a real publish so it is exercised, not on its own.
2. **Check the trusted publisher in the preflight.** `scripts/release-cli.mjs` already refuses six
   kinds of drift before it tags. It cannot read npm's stored configuration without a token, but it
   can read `gh api repos/:owner/:repo --jq .full_name` and compare it to what the last successful
   publish ran under, or simply state the owner and workflow filename that npm must be holding, so
   a person can eyeball it in two seconds. A release path that refuses locally costs nothing.
3. **Write the trap down where a transfer happens.** See the section below. Nothing in this
   repository connects "we moved the repository" to "the package can no longer be published", and
   the connection is not guessable from the error.

## The trap, for `npm run learn`

**Moving a repository silently breaks npm trusted publishing, and the error names the wrong thing.**
npm matches a publish against a stored organisation or user, repository and workflow filename, all
exact and case-sensitive. A transfer changes the first of those, npm's stored copy does not follow,
and the next publish fails with a 404 on the PUT that reads as if the package does not exist. The
configuration cannot be edited in place: it must be deleted and recreated, which needs an
interactive 2FA challenge, so it is always the account owner's job. Since 2026-09-03 a recreated
configuration also defaults to `npm stage publish` only, and direct `npm publish` must be ticked
explicitly - a staging-only configuration refuses in exactly the same way, so fixing the owner and
missing that box looks like the fix not working.

Whoever picks this up should run `npm run learn` with that paragraph rather than pasting it into a
contract by hand.

## Evidence

Session AH, 2026-09-09, publishing 0.3.1 from `main` at `ed87060e`:

- Dry run `34407862741`, dispatch on `main`: every step green, 0.3.1 free, tarball 63.9 kB / 32
  files, `npm publish --dry-run` and the release-notes rehearsal both passed.
- Real publish `34408194386`, tag push `cli-v0.3.1`: failed at `Publish`, E404 on the PUT.
- Real publish `34408479669`, dispatch on `main` with `dry_run=false`, three minutes later: failed
  identically, which ruled the trigger out.
- Identical between the run that published 0.3.0 on 2026-09-05 and both failures: npm 12.0.2, node
  v24.20.0, `actions/setup-node@v5` at SHA `a0853c24544627f65ddf259abe73b1d18a591444`,
  `actions/checkout@v5` at the same SHA, the same `always-auth` warning from the generated
  `.npmrc`, and the same placeholder `NODE_AUTH_TOKEN`. npm's status page was clean with no open
  incidents.
- The one thing that did change: the job guard read `github.repository == 'miwco/NoaCG-Studio'`
  when 0.3.0 published on 2026-09-05, and reads `'NoaCG/NoaCG-Studio'` now. Both runs reached the
  job, so the identity in the token GitHub mints changed owners between them. `ea7f569c`,
  2026-09-06, is the transfer.

The registry never received anything: `npm view @noacg/cli versions` is still `0.2.0, 0.3.0`, so
0.3.1 is free and this costs a version number nothing.

The account-side half is `docs/acceptance/owner-queue/2026-09-09-ah-npm-still-thinks-the-repository-is-yours.md`.
