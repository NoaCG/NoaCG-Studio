# model/bind-browser-local-library-account-every

Rule: `model/bind-browser-local-library-account-every`. Recorded 2026-09-24 on `claude/jolly-maxwell-6jcsme` at 4c7ea61.

The owner created a second account on the same browser and saw the first account's graphics and productions. The local library was one set of keys per browser whoever was signed in, and on the new account's first sync the engine re-minted each foreign record under a fresh id after RLS refused it, so the copies landed in the new account's cloud. e2e/account-library.spec.ts pins the isolation and goes red when the per-account key naming is disabled; sync.spec.ts pins that a refused record stays local and is never re-minted.
