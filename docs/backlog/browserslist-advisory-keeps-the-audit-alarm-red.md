# Bump browserslist so the weekly dependency audit stops being red

**Filed:** 2026-09-07. **Source:** measurement, reading rolling alarm
https://github.com/NoaCG/NoaCG-Studio/issues/112 open since 06:00 UTC.

## Why

The alarm is landed breakage on `main`, and the landing queue gates on `ci.yml` alone - so a red
audit survives every landing until somebody reads it. Six hours in, nobody had. An alarm nobody
answers trains everyone to ignore the next one, which is the whole value of having it.

It is filed rather than fixed in place because a lockfile bump wants its own landing: it must be
revertible on its own, and folding it into a feature branch makes that impossible.

## What it would take

One lockfile bump and a green build. `npm audit fix` should be enough - the fix is inside a patch
range - and the diff should touch `package-lock.json` only. `npm run build` is the real check,
because browserslist feeds autoprefixer; `npm audit` must then report zero high or critical.
Read `docs/STACK_FRESHNESS.md` first and make sure you are answering the AUDIT job rather than
`check:freshness`, which reports weekly and gates nothing.

## Evidence

Measured on a fresh checkout at `main` 39835021:

```
browserslist  4.28.5  high  range <=4.28.6  fixAvailable: true
  GHSA-c83g-rgw3-j3cx  unbounded memory growth (no cache eviction)
  GHSA-73wf-gq98-2v4g  uncaught crash / prototype write via untrusted browserslist-stats.json
```

It is a DEV dependency, and transitive: `node_modules/@babel/helper-compilation-targets` requires
it and nothing declares it at the root. Neither advisory is a production risk here - we ship no
`browserslist-stats.json` and run no long-lived browserslist process - but the audit gate does not
grade risk, and the alarm stays red until the tree is clean.
