# Agent delivery final check (Phase 5 check)

Date: 2026-10-16. Reviewed code: `origin/main` `36380004a87a9f3e684050e8fa3b8d8e1832a619` (the
landing of #1278), served by noacg.studio at the time (`noacg doctor`: bridge `main@36380004a8`).
The review revision in `work.json` is the notes commit on top of it, which changes only this
spec's phase notes and ledger. No credential, key value or customer material is recorded here;
the accounts in the runs below were made by the runs and deleted by them.

## Runs and commands

- Configured suite dispatched on `main`, run 38833457342 (`workflow_dispatch`, `36380004a`, local
  Supabase stack on the runner): 102 passed, 0 failed, 0 flaky, 8 allowed skips (report
  `configured-report.json`, read with a script that lists every test's status, retries and
  annotations). `agent-access.spec.ts`: all three tests passed with no retry; the third ("the
  published entry path") carries the annotation `noacg-cli: npm @noacg/cli@0.12.0` and took 84 s.
  `anonymous.spec.ts` "a new account that works at once is signed in ... and keeps Home" passed.
- Landing runs on `36380004a`: Post-landing 38833029343, Release CLI to npm 38833029356 and the
  configured suite 38833029133 all completed with success.
- `npm view @noacg/cli@0.12.0`: `latest` is 0.12.0, provenance predicate
  `https://slsa.dev/provenance/v1`. MCP Registry search for `noacg`: `io.github.NoaCG/noacg`
  0.12.0 has `isLatest: true`.
- Local, as a user without the plugin: `npx -y @noacg/cli@0.12.0` with an empty HOME, USERPROFILE,
  APPDATA, LOCALAPPDATA, npm cache, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, and every `NOACG_*`
  variable unset: `--version`, `doctor`, `whoami`, `docs`, `docs skill`, `docs setup`,
  `docs critique`, `docs share`, `--help`, `save --help`. The package npx installed was compared
  with `main`: `skill/` and `CHANGELOG.md` identical apart from line endings.
- `curl https://noacg.studio/downloads` and `/docs`: the rendered prompt block on both.
- Stand-in for an older deployment (a small Node server in the session scratch directory, not
  committed): GETs outside `/api` proxied to noacg.studio, `/api/me/agent-keys` answering a key with
  both scopes, `/api/me/graphic-sets` saving the graphics and ignoring `production`,
  `/api/me/deliveries` reading back. The published CLI scaffolded a lower third (neutral), a
  countdown (`gt01`) and a ticker (`tk07`) and ran `save ./strap ./clock ./ticker --production
  "Harbour regatta" --rundown cues.json --layer 10 --no-bench` twice.

## Observed

- Published path (run 38833457342, assertions read in `e2e/configured/agent-access.spec.ts`
  lines 757-922): clean HOME, config dir and npm cache, CLI only through `npx -y
  @noacg/cli@0.12.0`; `--version` equals the pin; `doctor` exit 0; `docs skill` contains "Run the
  SAME"; `whoami` logged out; "Don't allow" exits 1 with "not allowed" and nothing stored; Allow on
  a card titled "Allow “Published CLI on E2E” to save graphics and productions to your NoaCG
  account?" naming the new account; `whoami` names that account with scopes exactly
  `graphics:create`, `productions:create`; three graphics (name strap, start countdown, results
  ticker, named for a harbour regatta) scaffolded and validated `ok` with on-air and stress
  frames; one `save` with `--production --rundown --layer 10` killed by SIGKILL once it printed
  its operation, rerun "Resuming 3 graphics and the production ... under operation <same>", exit
  0, receipt `destination: production`, `state: saved`, `verified: true`, the new account; a third
  run `replayed: true` with the same graphic ids and production; `status <operation>` lists three
  graphics and the production, all `saved`, verified; a fresh browser signed in as the new account
  opens each graphic link on its control page and the production with its three cues in the order
  sent; another account opening a graphic link sees "Graphic not found" and its own address, and
  not the graphic's name; `pack --save` of the same graphics reads back `pending_install`, and
  Install on Home says "Already delivered as “<production>”", Cancel leaves it; `logout` then
  `whoami` logged out; the account and everything it owns deleted in `finally`.
- Kept frames of that run, looked at (composited over a dark ground where the PNG is
  transparent): name strap on-air and stress clean, stress lines inside the plate; ticker stress
  widens the NEWS tab, headline and clock stay on one line; countdown reads "ROUND 1 / 3:00", stress
  "14:48:00" with the doubled label, its accent rule not widening. In a plain image viewer the
  countdown shows only its accent rule, because its type is light on transparency. All frames show
  the types' sample content (a news anchor, a budget headline, ROUND 1), not regatta content.
- Local published CLI: `--version` 0.12.0; `doctor` deployment https://noacg.studio, Microsoft
  Edge, the fresh config dir, not logged in; `whoami` exit 1 "Not logged in ... run `noacg login`";
  `docs skill` 237 lines under "Each `references/<name>.md` this text names prints with `noacg
  docs <name>`"; `docs setup` 43, `critique` 67, `share` 54 lines; `--help` shows `save ...
  [--production N [--rundown <cues.json>] [--layer n[,n...]]]`; bare `--help` exits 2 (usage, as
  before), `save --help` exits 0.
- Agreement: Downloads and docs show the same 77-word prompt with `@noacg/cli@0.12.0`, the plugin
  section after it marked optional. The skill (step 5, "Several graphics for one show", "What the
  save answered"), the setup reference, CHANGELOG 0.12.0, the MCP tool description ("docs "skill"
  is the procedure"), the docs page's "Ask for a whole package" and the manifests (both plugins,
  marketplace, `server.json`: 0.12.0) say the same: one save, a production only when asked, the
  same command again resumes, a 403 means log in again or save library-only, a package is the
  older route reported as pending Install, warnings apart from delivery state, "saved" not
  "opened".
- Stand-in partial outcome: exit 1, the validations printed first, then "Saved the graphics to the
  library, but the NoaCG at http://127.0.0.1:8931 made no production: it is too old for one. Add
  them to a production in the studio, or send them with `noacg pack --save` to install on Home."
  and the three links, `- "Harbour strap" -> .../app#/graphic/g1-...` and so on. The stand-in log
  shows one POST and one readback per run, the production present in the request; the second run
  used a new operation id (the first was forgotten).

## Per criterion

- AC-1: pass. Phase 1 check (configured run 38756002331: Home before sign-up, right after it and
  after a later login at 1440, 768 and 390px); the same test passed again in run 38833457342.
- AC-2: pass. Phase 1 check (live Downloads at three widths, Copy puts the exact text on the
  clipboard, Node/browser line above, plugin below). Now 77 words pinned to 0.12.0, live on
  Downloads and docs (this check), and its commands walk clean in run 38833457342.
- AC-3: pass. Phase 1 check (a fresh agent session with only the prompt, consent left unapproved,
  reported local-only with no invented links); run 38833457342 (Don't allow ends login, nothing
  stored, then Allow). The interim per-graphic route is superseded by the set save (AC-6).
- AC-4: pass. Phase 2 check (consent, login, whoami and receipts name one account and deployment;
  other keys and accounts get the same 404; account B on A's links told who it is, sees nothing);
  run 38833457342 (receipts and `status` name the new account; wrong-account opening).
- AC-5: pass. Phase 2 check (package link selects its row, pending then installed with the
  production link, injected list failure shows Retry and recovers, empty list shows no error);
  step 4b of the first agent-access test passed in run 38833457342.
- AC-6: pass. Phase 3 check 2 (configured run 38800728080, invalid set refused before writes,
  fresh browser opens every link) and run 38833457342 (published CLI, three graphics, every link
  opened in a fresh browser); the human partial outcome prints every saved link (stand-in above).
- AC-7: pass. Phase 3 check 2 (lost answers, kills, concurrent saves, changed set refused, 0093
  self-check on hosted Postgres) and run 38833457342 (published CLI killed, resumed, replayed with
  the same ids and production).
- AC-8: pass. Phase 4 check (run 38821495103: production, pool, layers, ordered rundown in the
  cloud row, library-only stays library-only, nothing published or played) and run 38833457342
  (published CLI production opened with its cues in order).
- AC-9: pass. Phase 4 check (graphics-only key 403 with nothing written, `productions:create` only
  through the consent card, Install reuses identity and code or asks) and run 38833457342
  ("Already delivered as" on the historical package).
- AC-10: unverified. Holds: the published CLI, skill, docs, MCP description and pins agree on
  0.12.0 and its semantics; from a clean environment with no plugin the published package, driven
  by the journey, connects a new account, delivers a three-graphic production and opens every
  result; warnings print apart from the delivery. Missing: a real coding-agent session that is
  given only the Downloads prompt and makes a set from a novel brief itself (the journey scripts
  the agent's commands and delivers the types' sample graphics), against hosted noacg.studio with
  a newly made account and a person opening the results. No test account on noacg.studio or
  staging was available in this window.
- AC-11: unverified. Holds: receipts tell `saved`, `pending_install` and `installed` apart, and the
  journey alone records browser-opened; cancelled consent, wrong-account opening, failed loading
  (step 4b), uncertain-response retry and legacy pending-package recovery all ran in run
  38833457342; every criterion here has reviewed evidence or is open with its gap named. Missing:
  the final scenario as the plan states it, run from a clean agent environment against hosted
  noacg.studio with a new account (the same gap as AC-10), and its independent check.

## Limits

Docker was not started on this machine and no hosted key was read, so the backend evidence is the
configured runs on a local Supabase stack, which answers in about 1 ms where a hosted backend
answers in about 200 ms. No production-proven claim follows from this check.
